// Tutorial director — runs scripted vignettes (ghost cursor + captions)
// against the live game systems. Steps are declarative; this module
// interprets them, renders the ghost cursor overlay, and exposes a
// back-button hit region the gameScene can click-test.
import { hexToPixel, HEX_SIZE } from "../hex.js";
import { selectUnit, clearSelection, isAIOwner } from "../gameState.js";
import { handleAttackClick } from "./inputHandler.js";

const CURSOR_SPEED = 380; // screen px/sec
const SELECTION_RADIUS = HEX_SIZE * 1.2;

export function createTutorialState(vignette) {
    return {
        vignette,
        refs: {},                  // entity-id handles returned by setup()
        cameraTarget: null,        // { q, r } - where to center on start
        stepIndex: 0,
        caption: '',
        // Ghost cursor (world coords; rendering converts to screen)
        cursorWorldX: 0,
        cursorWorldY: 0,
        cursorSprite: 'cursor-default',
        // Per-step transient state
        stepTimer: 0,
        stepInit: false,
        backButtonBounds: null,    // populated by drawTutorial each frame
    };
}

// Resolve a step's target into world coordinates and (where relevant) the
// entity object + selection params. Returns null if the entity is gone.
function resolveTarget(tutorial, gameState, target) {
    if (!target) return null;

    // Named ref → look up by entity ID across collections.
    if (typeof target === 'string') {
        const id = tutorial.refs[target];
        if (id == null) return null;
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
        return null;
    }

    // Inline hex coord.
    if (target.q != null && target.r != null) {
        const pos = hexToPixel(target.q, target.r);
        return { worldX: pos.x, worldY: pos.y };
    }

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
    tutorial.cameraTarget = result.cameraTarget || null;
    tutorial.stepIndex = 0;
    tutorial.caption = '';
    tutorial.cursorSprite = 'cursor-default';
    tutorial.stepTimer = 0;
    tutorial.stepInit = false;

    // Seed cursor near the first targetable entity (player ship if available).
    const seed = resolveTarget(tutorial, gameState, 'playerShip');
    if (seed) {
        // Start cursor off-screen-ish above the action so the first tween reads.
        tutorial.cursorWorldX = seed.worldX - 80;
        tutorial.cursorWorldY = seed.worldY - 80;
    }
    return true;
}

export function updateTutorial(tutorial, gameState, map, dt) {
    if (!tutorial || !tutorial.vignette) return;

    const steps = tutorial.vignette.steps;
    const step = steps[tutorial.stepIndex];
    if (!step) return;

    // First-time init for this step
    if (!tutorial.stepInit) {
        tutorial.stepInit = true;
        tutorial.stepTimer = 0;
        applyStepEntry(tutorial, gameState, map, step);
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

        case 'click': {
            const t = resolveTarget(tutorial, gameState, step.target);
            if (t && t.type === 'ship' && t.index != null) {
                selectUnit(gameState, 'ship', t.index);
            }
            done = true;
            break;
        }

        case 'rightClick': {
            const t = resolveTarget(tutorial, gameState, step.target);
            if (t && t.worldX != null) {
                handleAttackClick(
                    gameState, map,
                    t.worldX, t.worldY,
                    hexToPixel, SELECTION_RADIUS,
                    null, false, false,
                );
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
            }
            if (satisfied || tutorial.stepTimer >= (step.timeout || 10)) done = true;
            break;
        }

        case 'respawn': {
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
function applyStepEntry(tutorial, gameState, map, step) {
    if (step.type === 'caption') {
        tutorial.caption = step.text || '';
    }
    if (step.type === 'moveCursorTo' && step.sprite) {
        tutorial.cursorSprite = step.sprite;
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

    // Ghost cursor — convert world coords to screen.
    const cursorScreenX = (tutorial.cursorWorldX - cameraX) * zoom + halfWidth;
    const cursorScreenY = (tutorial.cursorWorldY - cameraY) * zoom + halfHeight;
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
