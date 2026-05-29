// Tutorial director — runs scripted vignettes (ghost cursor + captions)
// against the live game systems. Steps are declarative; this module
// interprets them, renders the ghost cursor overlay, and exposes a
// back-button hit region the gameScene can click-test.
import { hexToPixel, HEX_SIZE } from "../hex.js";
import {
    selectUnit, clearSelection, isAIOwner,
    enterSettlementBuildMode, addToBuildQueue,
    canAfford, deductCost,
} from "../gameState.js";
import { handleAttackClick, handleWaypointClick, handleSettlementPlacementClick } from "./inputHandler.js";
import { SHIPS } from "../sprites/ships.js";
import { getVignette } from "../tutorials/index.js";

const CURSOR_SPEED = 380; // screen px/sec
const SELECTION_RADIUS = HEX_SIZE * 1.2;

export function createTutorialState(vignette) {
    return {
        vignette,
        refs: {},                  // entity-id handles returned by setup()
        hexes: {},                 // named hex coords returned by setup()
        cameraTarget: null,        // { q, r } - where to center on start
        stepIndex: 0,
        caption: '',
        // Ghost cursor. Two modes: 'world' tracks a world-space point (rendering
        // converts to screen); 'screen' positions the cursor directly in screen
        // space so it can land on bottom-left build-menu buttons. drawTutorial
        // keeps cursorScreenX/Y in sync while in world mode so transitions read.
        cursorMode: 'world',       // 'world' | 'screen'
        cursorWorldX: 0,
        cursorWorldY: 0,
        cursorScreenX: 0,
        cursorScreenY: 0,
        cursorSprite: 'cursor-default',
        // Tutorial-driven camera (world px). gameScene applies these each frame
        // in tutorial mode, letting the dragPan step simulate a pan gesture.
        cameraX: null,
        cameraY: null,
        // Click feedback ring (screen coords) shown when a scripted click fires.
        clickPulse: null,          // { x, y, t }
        // Per-step transient state
        stepTimer: 0,
        stepInit: false,
        backButtonBounds: null,    // populated by drawTutorial each frame
        _panFrom: null,            // captured start state for dragPan
    };
}

// Resolve a step's target into world coordinates and (where relevant) the
// entity object + selection params. Returns null if the entity is gone.
function resolveTarget(tutorial, gameState, target) {
    if (!target) return null;

    // Named ref → look up entity by ID first, then named hex coord.
    if (typeof target === 'string') {
        const id = tutorial.refs[target];
        if (id != null) {
            for (const [collection, type] of [
                [gameState.ships, 'ship'],
                [gameState.ports, 'port'],
                [gameState.settlements, 'settlement'],
                [gameState.towers, 'tower'],
            ]) {
                const index = collection.findIndex(e => e && e.id === id);
                if (index !== -1) {
                    const entity = collection[index];
                    const pos = hexToPixel(entity.q, entity.r);
                    return { entity, type, index, worldX: pos.x, worldY: pos.y };
                }
            }
        }
        const hex = tutorial.hexes && tutorial.hexes[target];
        if (hex) {
            const pos = hexToPixel(hex.q, hex.r);
            return { worldX: pos.x, worldY: pos.y, hex: { q: hex.q, r: hex.r } };
        }
        return null;
    }

    // Inline hex coord.
    if (target.q != null && target.r != null) {
        const pos = hexToPixel(target.q, target.r);
        return { worldX: pos.x, worldY: pos.y, hex: { q: target.q, r: target.r } };
    }

    return null;
}

// Resolve a build-panel button to its screen-space center. `button` is either
// 'settlement' or a ship type ('cutter'). Returns null if the panel (or that
// row) isn't currently on screen — the live bounds come from gameScene's last
// draw via the `view` object.
function resolveButton(view, button) {
    const b = view && view.buildPanelBounds;
    if (!b) return null;
    const centerX = b.x + b.width / 2;
    if (button === 'settlement') {
        if (!b.settlementButton) return null;
        return { screenX: centerX, screenY: b.settlementButton.y + b.settlementButton.height / 2 };
    }
    const shipBtn = (b.buttons || []).find(btn => btn.shipType === button);
    if (shipBtn) return { screenX: centerX, screenY: shipBtn.y + shipBtn.height / 2 };
    return null;
}

// Run setup() and seed the cursor at the player ship position.
export function startVignette(tutorial, gameState, map) {
    const result = tutorial.vignette.setup(gameState, map);
    if (!result) {
        console.warn(`Tutorial vignette ${tutorial.vignette.id} setup returned null`);
        return false;
    }
    tutorial.refs = result.refs || {};
    tutorial.hexes = result.hexes || {};
    tutorial.cameraTarget = result.cameraTarget || null;
    tutorial.stepIndex = 0;
    tutorial.caption = '';
    tutorial.cursorMode = 'world';
    tutorial.cursorSprite = 'cursor-default';
    tutorial.clickPulse = null;
    tutorial._panFrom = null;
    tutorial.stepTimer = 0;
    tutorial.stepInit = false;

    // Seed the tutorial-owned camera on the vignette's anchor so dragPan has a
    // known origin to pan from and return to.
    if (tutorial.cameraTarget) {
        const cpos = hexToPixel(tutorial.cameraTarget.q, tutorial.cameraTarget.r);
        tutorial.cameraX = cpos.x;
        tutorial.cameraY = cpos.y;
    } else {
        tutorial.cameraX = null;
        tutorial.cameraY = null;
    }

    // Seed cursor near the first targetable entity (player ship if available).
    const seed = resolveTarget(tutorial, gameState, 'playerShip');
    if (seed) {
        // Start cursor off-screen-ish above the action so the first tween reads.
        tutorial.cursorWorldX = seed.worldX - 80;
        tutorial.cursorWorldY = seed.worldY - 80;
    }
    return true;
}

export function updateTutorial(tutorial, gameState, map, view, dt) {
    if (!tutorial || !tutorial.vignette) return;
    view = view || {};

    const steps = tutorial.vignette.steps;
    const step = steps[tutorial.stepIndex];
    if (!step) return;

    // First-time init for this step
    if (!tutorial.stepInit) {
        tutorial.stepInit = true;
        tutorial.stepTimer = 0;
        applyStepEntry(tutorial, gameState, map, step, view);
    }

    let done = false;
    switch (step.type) {
        case 'caption':
            // Caption is set instantly on entry; advance immediately.
            done = true;
            break;

        case 'wait':
            tutorial.stepTimer += dt;
            if (tutorial.stepTimer >= (step.duration || 0)) done = true;
            break;

        case 'moveCursorTo': {
            const t = resolveTarget(tutorial, gameState, step.target);
            if (!t) { done = true; break; }
            const dx = t.worldX - tutorial.cursorWorldX;
            const dy = t.worldY - tutorial.cursorWorldY;
            const dist = Math.sqrt(dx * dx + dy * dy);
            const moveAmt = (step.speed || CURSOR_SPEED) * dt;
            if (dist <= moveAmt || dist < 1) {
                tutorial.cursorWorldX = t.worldX;
                tutorial.cursorWorldY = t.worldY;
                done = true;
            } else {
                tutorial.cursorWorldX += (dx / dist) * moveAmt;
                tutorial.cursorWorldY += (dy / dist) * moveAmt;
            }
            break;
        }

        case 'moveCursorToButton': {
            // Tween the screen-space cursor onto a build-menu button so the
            // player sees exactly where to click. Bounds come from the live
            // panel (last draw); hold briefly if it isn't on screen yet.
            tutorial.stepTimer += dt;
            const tgt = resolveButton(view, step.button);
            if (!tgt) {
                if (tutorial.stepTimer >= (step.timeout || 3)) done = true;
                break;
            }
            const dx = tgt.screenX - tutorial.cursorScreenX;
            const dy = tgt.screenY - tutorial.cursorScreenY;
            const dist = Math.sqrt(dx * dx + dy * dy);
            const moveAmt = (step.speed || CURSOR_SPEED) * dt;
            if (dist <= moveAmt || dist < 1) {
                tutorial.cursorScreenX = tgt.screenX;
                tutorial.cursorScreenY = tgt.screenY;
                done = true;
            } else {
                tutorial.cursorScreenX += (dx / dist) * moveAmt;
                tutorial.cursorScreenY += (dy / dist) * moveAmt;
            }
            break;
        }

        case 'dragPan': {
            // Simulate right-click-drag panning: glide the screen cursor by
            // (dx, dy) while panning the camera the opposite way (mirroring the
            // real `cameraX = startX - drag/zoom` math) with an ease-in-out.
            tutorial.stepTimer += dt;
            const dur = step.duration || 1.5;
            const p = Math.min(1, dur > 0 ? tutorial.stepTimer / dur : 1);
            const ease = p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
            const f = tutorial._panFrom || { camX: tutorial.cameraX, camY: tutorial.cameraY, curX: tutorial.cursorScreenX, curY: tutorial.cursorScreenY, zoom: 1 };
            const cdx = step.dx || 0;
            const cdy = step.dy || 0;
            tutorial.cursorScreenX = f.curX + cdx * ease;
            tutorial.cursorScreenY = f.curY + cdy * ease;
            const zoom = f.zoom || 1;
            tutorial.cameraX = f.camX - (cdx / zoom) * ease;
            tutorial.cameraY = f.camY - (cdy / zoom) * ease;
            if (p >= 1) done = true;
            break;
        }

        case 'click': {
            const t = resolveTarget(tutorial, gameState, step.target);
            if (t && t.type && t.index != null) {
                selectUnit(gameState, t.type, t.index);
            }
            done = true;
            break;
        }

        case 'enterSettlementBuildMode': {
            const t = resolveTarget(tutorial, gameState, step.target);
            if (t && t.type === 'port' && t.index != null) {
                enterSettlementBuildMode(gameState, t.index);
            }
            done = true;
            break;
        }

        case 'placeSettlement': {
            const t = resolveTarget(tutorial, gameState, step.target);
            const hex = t && (t.hex || (t.entity ? { q: t.entity.q, r: t.entity.r } : null));
            if (hex && gameState.settlementBuildMode && gameState.settlementBuildMode.active) {
                gameState.settlementBuildMode.hoveredHex = hex;
                handleSettlementPlacementClick(gameState);
                const last = gameState.settlements[gameState.settlements.length - 1];
                if (last) tutorial.refs.playerSettlement = last.id;
            }
            done = true;
            break;
        }

        case 'buildShip': {
            const t = resolveTarget(tutorial, gameState, step.target);
            const shipType = step.shipType;
            if (t && t.type === 'port' && t.index != null && SHIPS[shipType]) {
                const port = gameState.ports[t.index];
                const shipData = SHIPS[shipType];
                if (canAfford(gameState.resources, shipData.cost)) {
                    deductCost(gameState.resources, shipData.cost);
                    addToBuildQueue(port, shipType, gameState.resources, true);
                    if (port.buildQueue.length > 0) port.buildQueue[0].progress = 0;
                }
                tutorial.shipCountBefore = gameState.ships.length;
            }
            done = true;
            break;
        }

        case 'rightClick': {
            const t = resolveTarget(tutorial, gameState, step.target);
            if (t) {
                if (step.mode === 'move') {
                    const hex = t.hex || (t.entity ? { q: t.entity.q, r: t.entity.r } : null);
                    if (hex) handleWaypointClick(gameState, map, hex, false);
                } else if (t.worldX != null) {
                    handleAttackClick(
                        gameState, map,
                        t.worldX, t.worldY,
                        hexToPixel, SELECTION_RADIUS,
                        null, false, false,
                    );
                }
            }
            done = true;
            break;
        }

        case 'waitUntil': {
            tutorial.stepTimer += dt;
            const cond = step.condition;
            let satisfied = false;
            if (cond === 'enemyDestroyed') {
                const t = resolveTarget(tutorial, gameState, 'enemyShip');
                satisfied = !t; // entity gone from gameState
            } else if (cond === 'shipArrived') {
                const t = resolveTarget(tutorial, gameState, step.target || 'playerShip');
                if (t && t.entity) {
                    const ship = t.entity;
                    satisfied = (!ship.waypoints || ship.waypoints.length === 0) && !ship.path;
                }
            } else if (cond === 'settlementBuilt') {
                const t = resolveTarget(tutorial, gameState, step.target || 'playerSettlement');
                if (t && t.entity) {
                    satisfied = !t.entity.construction;
                }
            } else if (cond === 'shipBuilt') {
                const before = tutorial.shipCountBefore || 0;
                satisfied = gameState.ships.length > before;
            }
            if (satisfied || tutorial.stepTimer >= (step.timeout || 10)) done = true;
            break;
        }

        case 'respawn': {
            startVignette(tutorial, gameState, map);
            // startVignette resets stepIndex/stepInit — return so we don't double-advance.
            return;
        }

        case 'nextVignette': {
            const next = getVignette(step.id);
            if (next) tutorial.vignette = next;
            startVignette(tutorial, gameState, map);
            // startVignette resets stepIndex/stepInit — return so we don't double-advance.
            return;
        }

        default:
            done = true;
    }

    if (done) {
        tutorial.stepIndex = (tutorial.stepIndex + 1) % steps.length;
        tutorial.stepInit = false;
    }
}

// Step entry hooks: set state that should apply for the duration of the step.
function applyStepEntry(tutorial, gameState, map, step, view) {
    if (step.type === 'caption') {
        tutorial.caption = step.text || '';
    }
    // Moving to a world target: if we were in screen mode (e.g. just clicked a
    // build-menu button), project the screen cursor back into world space so
    // the tween starts from where the cursor actually is.
    if (step.type === 'moveCursorTo') {
        if (tutorial.cursorMode === 'screen' && view) {
            const zoom = view.zoom || 1;
            tutorial.cursorWorldX = (tutorial.cursorScreenX - view.halfWidth) / zoom + view.cameraX;
            tutorial.cursorWorldY = (tutorial.cursorScreenY - view.halfHeight) / zoom + view.cameraY;
        }
        tutorial.cursorMode = 'world';
        if (step.sprite) tutorial.cursorSprite = step.sprite;
    }
    if (step.type === 'moveCursorToButton') {
        tutorial.cursorMode = 'screen';
        tutorial.cursorSprite = 'cursor-default';
    }
    if (step.type === 'dragPan') {
        tutorial.cursorMode = 'screen';
        tutorial.cursorSprite = 'cursor-default';
        const zoom = (view && view.zoom) || 1;
        const camX = tutorial.cameraX != null ? tutorial.cameraX : (view ? view.cameraX : 0);
        const camY = tutorial.cameraY != null ? tutorial.cameraY : (view ? view.cameraY : 0);
        tutorial._panFrom = {
            camX, camY,
            curX: tutorial.cursorScreenX,
            curY: tutorial.cursorScreenY,
            zoom,
        };
    }
    // Pulse a ring wherever a scripted click/action fires so the tap reads.
    if (step.type === 'click' || step.type === 'rightClick' ||
        step.type === 'enterSettlementBuildMode' || step.type === 'buildShip' ||
        step.type === 'placeSettlement') {
        tutorial.clickPulse = { x: tutorial.cursorScreenX, y: tutorial.cursorScreenY, t: 0 };
    }
    // Reset cursor sprite back to default after a click sequence completes.
    if (step.type === 'click') {
        tutorial.cursorSprite = 'cursor-default';
    }
}

export function drawTutorial(ctx, tutorial) {
    if (!tutorial || !tutorial.vignette) return;

    const { k, cameraX, cameraY, zoom, halfWidth, halfHeight, screenWidth } = ctx;

    // Caption banner — top-center.
    if (tutorial.caption) {
        const bannerY = 40;
        const bannerH = 44;
        const bannerW = Math.min(screenWidth - 40, 520);
        const bannerX = (screenWidth - bannerW) / 2;
        k.drawRect({
            pos: k.vec2(bannerX, bannerY),
            width: bannerW,
            height: bannerH,
            color: k.rgb(0, 0, 0),
            opacity: 0.7,
            radius: 6,
        });
        k.drawRect({
            pos: k.vec2(bannerX, bannerY),
            width: bannerW,
            height: bannerH,
            color: k.rgb(0, 0, 0),
            radius: 6,
            fill: false,
            outline: { width: 1, color: k.rgb(255, 200, 0) },
        });
        k.drawText({
            text: tutorial.caption,
            pos: k.vec2(screenWidth / 2, bannerY + bannerH / 2),
            size: 18,
            anchor: 'center',
            color: k.rgb(255, 255, 255),
        });
    }

    // Ghost cursor. In world mode, project the tracked world point to screen
    // (and cache it so a later switch to screen mode starts from the right
    // spot). In screen mode, the director drives screen coords directly.
    let cursorScreenX, cursorScreenY;
    if (tutorial.cursorMode === 'screen') {
        cursorScreenX = tutorial.cursorScreenX;
        cursorScreenY = tutorial.cursorScreenY;
    } else {
        cursorScreenX = (tutorial.cursorWorldX - cameraX) * zoom + halfWidth;
        cursorScreenY = (tutorial.cursorWorldY - cameraY) * zoom + halfHeight;
        tutorial.cursorScreenX = cursorScreenX;
        tutorial.cursorScreenY = cursorScreenY;
    }

    // Click feedback ring — an expanding pulse where a scripted tap landed.
    if (tutorial.clickPulse) {
        const PULSE_DUR = 0.45;
        tutorial.clickPulse.t += k.dt();
        const t = tutorial.clickPulse.t;
        if (t >= PULSE_DUR) {
            tutorial.clickPulse = null;
        } else {
            const prog = t / PULSE_DUR;
            k.drawCircle({
                pos: k.vec2(tutorial.clickPulse.x, tutorial.clickPulse.y),
                radius: 6 + prog * 22,
                fill: false,
                outline: { width: 2, color: k.rgb(255, 220, 80) },
                opacity: 1 - prog,
            });
        }
    }

    // Sprite is anchored top-left for arrow cursors. Offset slightly so the
    // hotspot sits on the target rather than the corner.
    k.drawSprite({
        sprite: tutorial.cursorSprite,
        pos: k.vec2(cursorScreenX - 4, cursorScreenY - 4),
        scale: 2,
    });

    // Back button — top-left, returns to title.
    const btnW = 90;
    const btnH = 32;
    const btnX = 12;
    const btnY = 12;
    const mp = k.mousePos();
    const hovered = mp.x >= btnX && mp.x <= btnX + btnW && mp.y >= btnY && mp.y <= btnY + btnH;
    k.drawRect({
        pos: k.vec2(btnX, btnY),
        width: btnW,
        height: btnH,
        color: k.rgb(0, 0, 0),
        opacity: hovered ? 0.9 : 0.7,
        radius: 6,
    });
    k.drawRect({
        pos: k.vec2(btnX, btnY),
        width: btnW,
        height: btnH,
        color: k.rgb(0, 0, 0),
        radius: 6,
        fill: false,
        outline: { width: 1, color: hovered ? k.rgb(255, 200, 0) : k.rgb(120, 140, 160) },
    });
    k.drawText({
        text: '< Back',
        pos: k.vec2(btnX + btnW / 2, btnY + btnH / 2),
        size: 14,
        anchor: 'center',
        color: hovered ? k.rgb(255, 255, 255) : k.rgb(200, 210, 220),
    });
    tutorial.backButtonBounds = { x: btnX, y: btnY, width: btnW, height: btnH };
}

// Returns true if the click landed on the back button.
export function hitTestBackButton(tutorial, mouseX, mouseY) {
    const b = tutorial?.backButtonBounds;
    if (!b) return false;
    return mouseX >= b.x && mouseX <= b.x + b.width &&
           mouseY >= b.y && mouseY <= b.y + b.height;
}
