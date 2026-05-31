// Unit rendering: ships, ports, settlements, towers
import { hexToPixel, HEX_SIZE, HEX_HEIGHT } from "../hex.js";
import { drawSprite, drawSpriteFlash, getSpriteSize, PORTS, SHIPS, SETTLEMENTS, TOWERS } from "../sprites/index.js";
import { isHexVisible, shouldRenderEntity } from "../fogOfWar.js";
import { getShipVisualPos } from "../systems/shipMovement.js";
import { drawConstructionProgressBar, drawProgressBar, drawConstructionVFX } from "./renderHelpers.js";
import { isAIOwner } from "../gameState.js";
import { getRenderScale } from "../designer/scaleTuner.js";
import { WORKER_CONFIG } from "../sprites/workers.js";

// Check if an entity is "non-local" (should show enemy faction indicator)
// Uses fogState.localPlayerId to determine the local player
function isEnemyOwner(owner, fogState) {
    const localId = fogState?.localPlayerId || 'player';
    if (!owner || owner === localId) return false;
    return true;
}

// TNT telegraph: red square-wave blink whose frequency accelerates as the fuse
// burns down. Returns 0 (no flash) or 1 (full red) — square wave reads as a
// sharper warning than a sinusoidal pulse. Frequency ramps from ~2 Hz at arm
// to ~14 Hz at detonation.
function tntBlinkIntensity(ship) {
    if (!ship.tntFuse || ship.tntFuse <= 0) return 0;
    const tntCfg = SHIPS[ship.type] && SHIPS[ship.type].tntAttack;
    if (!tntCfg) return 0;
    const duration = tntCfg.fuseDuration || 1;
    const elapsed = Math.max(0, duration - ship.tntFuse);
    const startFreq = 2;   // blinks/sec at arm
    const endFreq = 14;    // blinks/sec just before detonation
    // Integral of a linearly-ramping frequency: phase in cycles.
    const phase = startFreq * elapsed + (endFreq - startFreq) * elapsed * elapsed / (2 * duration);
    return (phase - Math.floor(phase)) < 0.5 ? 1 : 0;
}

/**
 * Convert ship heading (radians) to sprite direction for 5-row sprites with mirroring
 * Sprite rows: 0=S, 1=NE, 2=SE, 3=N, 4=E
 * Mirrored: W=mirror E, SW=mirror SE, NW=mirror NE
 * Screen coords: 0°=E, 90°=S(down), 180°=W, 270°=N(up)
 * @returns {{ row: number, flipX: boolean }}
 */
function headingToSpriteDirection(heading) {
    // Normalize to 0-360 degrees
    let deg = ((heading * 180 / Math.PI) % 360 + 360) % 360;

    // Map to 8 directions (each covers 45 degrees), return row + flip
    if (deg >= 247.5 && deg < 292.5) return { row: 3, flipX: false };  // N (up)
    if (deg >= 292.5 && deg < 337.5) return { row: 1, flipX: false };  // NE
    if (deg >= 337.5 || deg < 22.5) return { row: 4, flipX: false };   // E (right)
    if (deg >= 22.5 && deg < 67.5) return { row: 2, flipX: false };    // SE
    if (deg >= 67.5 && deg < 112.5) return { row: 0, flipX: false };   // S (down)
    if (deg >= 112.5 && deg < 157.5) return { row: 2, flipX: true };   // SW (mirror SE)
    if (deg >= 157.5 && deg < 202.5) return { row: 4, flipX: true };   // W (mirror E)
    return { row: 1, flipX: true };                                     // NW (mirror NE)
}

/**
 * Get the colored directional sprite name based on ship type and owner
 * @param {object} shipData - Ship metadata
 * @param {string} owner - Ship owner ('player', 'ai1', 'ai2', 'ai3')
 * @returns {string|null} Sprite name or null if no directional sprite
 */
export function getDirectionalSprite(shipData, owner) {
    if (!shipData.directionalSprite) return null;
    if (shipData.directionalSprite === 'schooner') {
        if (owner === 'ai1') return 'schooner-green';
        if (owner === 'ai2') return 'schooner-blue';
        if (owner === 'ai3') return 'schooner-orange';
        if (owner === 'pirate') return 'schooner-orange';  // Pirate-owned schooner (defend mode waves)
        if (owner === 'player2') return 'schooner-blue';
        return 'schooner-red';
    }
    // Cutter (cutter-v2) color variants
    if (owner === 'ai1') return 'cutter-green';
    if (owner === 'ai2') return 'cutter-blue';
    if (owner === 'ai3') return 'cutter-orange';
    if (owner === 'pirate') return 'cutter-orange';  // Pirate-owned cutter (defend mode waves)
    if (owner === 'player2') return 'cutter-blue';
    return 'cutter-red';  // Player default
}

/**
 * Resolve the colored tower sprite name for an owner. Mirrors the
 * cutter/schooner color mapping so all of a faction's units flag the same way.
 * @param {string} owner - The faction owner key
 * @param {string} baseSprite - Virtual sprite name (e.g. 'tower', 'mortar-tower', 'cannon-battery')
 */
export function getTowerSprite(owner, baseSprite = 'tower') {
    let color;
    if (owner === 'ai1') color = 'green';
    else if (owner === 'ai2') color = 'blue';
    else if (owner === 'ai3') color = 'orange';
    else if (owner === 'player2') color = 'blue';
    else color = 'red';
    return `${baseSprite}-${color}`;
}

// Virtual tower sprite slots that resolve to per-owner colored variants
export const VIRTUAL_TOWER_SPRITES = new Set(['tower', 'mortar-tower', 'cannon-battery']);

// Faction colors for visual differentiation (matches cutter sprite colors)
const FACTION_COLORS = {
    player: { r: 180, g: 60, b: 60 },    // Red (matches cutter-red sprite)
    player2: { r: 60, g: 120, b: 200 },  // Blue (matches cutter-blue sprite, multiplayer guest)
    ai1: { r: 60, g: 160, b: 80 },       // Green (matches cutter-green sprite)
    ai2: { r: 60, g: 120, b: 200 },      // Blue (matches cutter-blue sprite)
    ai3: { r: 220, g: 140, b: 40 },       // Orange (matches cutter-orange sprite)
    pirate: { r: 220, g: 140, b: 40 },    // Orange (matches pirate cutter/schooner sprite tint)
};

/**
 * Get faction indicator color for an owner
 */
function getFactionColor(owner, k) {
    const color = FACTION_COLORS[owner] || FACTION_COLORS.ai1;
    return k.rgb(color.r, color.g, color.b);
}

/**
 * Draw a flat-topped hex shape as faction indicator
 */
function drawFactionHex(k, x, y, radius, color, opacity) {
    const pts = [];
    for (let i = 0; i < 6; i++) {
        const angle = (Math.PI / 3) * i;  // Flat-topped hex
        pts.push(k.vec2(x + radius * Math.cos(angle), y + radius * Math.sin(angle)));
    }
    k.drawPolygon({
        pts,
        color,
        opacity,
    });
}

/**
 * Draw a flat-topped hex outline ring as a faction indicator
 */
function drawFactionHexOutline(k, x, y, radius, color, opacity, width) {
    const pts = [];
    for (let i = 0; i < 6; i++) {
        const angle = (Math.PI / 3) * i;
        pts.push(k.vec2(x + radius * Math.cos(angle), y + radius * Math.sin(angle)));
    }
    for (let i = 0; i < 6; i++) {
        k.drawLine({
            p1: pts[i],
            p2: pts[(i + 1) % 6],
            width,
            color,
            opacity,
        });
    }
}

/**
 * Draw all ports
 */
export function drawPorts(ctx, gameState, map, fogState) {
    const { k, zoom, cameraX, cameraY, halfWidth, halfHeight } = ctx;
    const unitScale = zoom * 1.5;

    for (let i = 0; i < gameState.ports.length; i++) {
        const port = gameState.ports[i];

        // Hide non-player units in fog
        if (!shouldRenderEntity(fogState, port)) continue;

        const pos = hexToPixel(port.q, port.r);
        const screenX = (pos.x - cameraX) * zoom + halfWidth;
        const screenY = (pos.y - cameraY) * zoom + halfHeight;

        // Skip if off screen
        if (screenX < -100 || screenX > ctx.screenWidth + 100 ||
            screenY < -100 || screenY > ctx.screenHeight + 100) continue;

        const portData = PORTS[port.type];
        const isConstructing = port.construction !== null;

        // Draw hex indicator for AI ports (enemy faction marker)
        if (isEnemyOwner(port.owner, fogState)) {
            drawFactionHex(k, screenX, screenY, 22 * zoom, getFactionColor(port.owner, k), 0.4);
        }

        // While constructing, hide the building under the dust VFX entirely
        // (drawConstructionVFX runs below in the construction block).
        if (isConstructing) {
            // skip drawing the building sprite
        } else if (portData.imageSprite) {
            const spriteScale = zoom * getRenderScale(gameState, portData.imageSprite, portData.spriteScale || 1);
            // Use shader for damage flash effect - pass via opacity
            const flashIntensity = port.hitFlash > 0 ? Math.min(port.hitFlash / 0.15, 1) : 0;
            // Combine construction opacity with flash (flash takes priority when active)
            const baseOpacity = isConstructing ? 0.5 : 1.0;
            const flashOpacity = flashIntensity > 0 ? (1.0 - flashIntensity) : baseOpacity;
            k.drawSprite({
                sprite: portData.imageSprite,
                frame: 0,
                pos: k.vec2(screenX, screenY),
                anchor: "center",
                scale: spriteScale,
                opacity: flashOpacity,
                shader: "whiteFlash",
            });
        } else {
            // Pixel art rendering
            const spriteSize = getSpriteSize(portData.sprite, unitScale);
            drawSprite(k, portData.sprite,
                screenX - spriteSize.width / 2,
                screenY - spriteSize.height / 2,
                unitScale,
                isConstructing ? 0.5 : 1.0);

            // Draw hit flash overlay (only for pixel art)
            if (port.hitFlash > 0) {
                drawSpriteFlash(k, portData.sprite,
                    screenX - spriteSize.width / 2,
                    screenY - spriteSize.height / 2,
                    unitScale, port.hitFlash / 0.15);
            }
        }

        // Draw port CONSTRUCTION progress bar (centered on unit)
        if (port.construction) {
            drawConstructionVFX(ctx, screenX, screenY, port.q * 0.37 + port.r * 0.13);
            const barY = screenY;
            const progress = Math.min(port.construction.progress / port.construction.buildTime, 1);
            drawConstructionProgressBar(ctx, screenX, barY, progress);
        }

        // Draw ship build progress bar if building a ship (centered on unit)
        // Find first active build item (may not be at index 0 with parallel builds)
        const activeItem = port.buildQueue.find(item => item.progress !== null);
        if (activeItem) {
            const barY = screenY;
            const progress = Math.min(activeItem.progress / activeItem.buildTime, 1);
            drawConstructionProgressBar(ctx, screenX, barY, progress);
        }
    }
}

/**
 * Draw all settlements
 */
export function drawSettlements(ctx, gameState, fogState) {
    const { k, zoom, cameraX, cameraY, halfWidth, halfHeight } = ctx;
    const unitScale = zoom * 1.5;

    for (const settlement of gameState.settlements) {
        // Hide non-player units in fog
        if (!shouldRenderEntity(fogState, settlement)) continue;

        const pos = hexToPixel(settlement.q, settlement.r);
        const screenX = (pos.x - cameraX) * zoom + halfWidth;
        const screenY = (pos.y - cameraY) * zoom + halfHeight;

        // Skip if off screen
        if (screenX < -100 || screenX > ctx.screenWidth + 100 ||
            screenY < -100 || screenY > ctx.screenHeight + 100) continue;

        const settlementData = SETTLEMENTS.settlement;
        const isConstructing = settlement.construction !== null;

        // Draw hex indicator for AI settlements (enemy faction marker)
        if (isEnemyOwner(settlement.owner, fogState)) {
            drawFactionHex(k, screenX, screenY, 16 * zoom, getFactionColor(settlement.owner, k), 0.4);
        }

        // While constructing, hide the building under the dust VFX entirely.
        if (isConstructing) {
            // skip drawing the settlement sprite
        } else if (settlementData.imageSprite) {
            const spriteScale = zoom * getRenderScale(gameState, settlementData.imageSprite, settlementData.spriteScale ?? 1.0);
            // Use shader for damage flash effect - pass via opacity
            const flashIntensity = settlement.hitFlash > 0 ? Math.min(settlement.hitFlash / 0.15, 1) : 0;
            const baseOpacity = isConstructing ? 0.5 : 1.0;
            const flashOpacity = flashIntensity > 0 ? (1.0 - flashIntensity) : baseOpacity;
            k.drawSprite({
                sprite: settlementData.imageSprite,
                frame: 0,
                pos: k.vec2(screenX, screenY),
                anchor: "center",
                scale: spriteScale,
                opacity: flashOpacity,
                shader: "whiteFlash",
            });
        } else {
            const spriteSize = getSpriteSize(settlementData.sprite, unitScale);
            drawSprite(k, settlementData.sprite,
                screenX - spriteSize.width / 2,
                screenY - spriteSize.height / 2,
                unitScale,
                isConstructing ? 0.5 : 1.0);
        }

        // Draw settlement CONSTRUCTION progress bar (centered on unit)
        if (settlement.construction) {
            drawConstructionVFX(ctx, screenX, screenY, settlement.q * 0.37 + settlement.r * 0.13);
            const barY = screenY;
            const progress = Math.min(settlement.construction.progress / settlement.construction.buildTime, 1);
            drawConstructionProgressBar(ctx, screenX, barY, progress);
        }
    }
}

/**
 * Draw all towers
 */
export function drawTowers(ctx, gameState, fogState) {
    const { k, zoom, cameraX, cameraY, halfWidth, halfHeight } = ctx;
    const unitScale = zoom * 1.5;

    for (const tower of gameState.towers) {
        // Hide non-player units in fog
        if (!shouldRenderEntity(fogState, tower)) continue;

        const pos = hexToPixel(tower.q, tower.r);
        const screenX = (pos.x - cameraX) * zoom + halfWidth;
        const screenY = (pos.y - cameraY) * zoom + halfHeight;

        // Skip if off screen
        if (screenX < -100 || screenX > ctx.screenWidth + 100 ||
            screenY < -100 || screenY > ctx.screenHeight + 100) continue;

        const towerData = TOWERS[tower.type];
        const isConstructing = tower.construction !== null;

        // Draw hex indicator for AI towers (enemy faction marker)
        if (isEnemyOwner(tower.owner, fogState)) {
            drawFactionHex(k, screenX, screenY, 18 * zoom, getFactionColor(tower.owner, k), 0.4);
        }

        // While constructing, hide the building under the dust VFX entirely.
        if (isConstructing) {
            // skip drawing the tower sprite
        } else if (towerData.imageSprite) {
            const spriteScale = zoom * getRenderScale(gameState, towerData.imageSprite, towerData.imageScale || 1.0);
            // Use shader for damage flash effect - pass via opacity
            const flashIntensity = tower.hitFlash > 0 ? Math.min(tower.hitFlash / 0.15, 1) : 0;
            const baseOpacity = isConstructing ? 0.5 : 1.0;
            const flashOpacity = flashIntensity > 0 ? (1.0 - flashIntensity) : baseOpacity;
            // 'tower'/'mortar-tower'/'cannon-battery' are virtual slots — pick
            // the colored variant for this owner.
            const spriteName = VIRTUAL_TOWER_SPRITES.has(towerData.imageSprite)
                ? getTowerSprite(tower.owner, towerData.imageSprite)
                : towerData.imageSprite;
            // Flag flutter at ~5 fps. Offset by tower position so
            // adjacent towers don't flap in lockstep.
            const phase = (tower.q * 7 + tower.r * 13) * 0.13;
            const frameCount = towerData.imageFrames || 3;
            const animFrame = Math.floor((k.time() + phase) * 5) % frameCount;
            // Anchor the sprite's base 1/4 up from the bottom of the hex (so the
            // tower base sits forward on the tile rather than at the hex center).
            const baseY = screenY + (HEX_HEIGHT / 4) * zoom;
            k.drawSprite({
                sprite: spriteName,
                frame: animFrame,
                pos: k.vec2(screenX, baseY),
                anchor: "bot",
                scale: spriteScale,
                opacity: flashOpacity,
                shader: "whiteFlash",
            });
        } else {
            const spriteSize = getSpriteSize(towerData.sprite, unitScale);
            if (tower.hitFlash > 0) {
                drawSpriteFlash(k, towerData.sprite,
                    screenX - spriteSize.width / 2,
                    screenY - spriteSize.height / 2,
                    unitScale,
                    isConstructing ? 0.5 : 1.0);
            } else {
                drawSprite(k, towerData.sprite,
                    screenX - spriteSize.width / 2,
                    screenY - spriteSize.height / 2,
                    unitScale,
                    isConstructing ? 0.5 : 1.0);
            }
        }

        // Draw tower CONSTRUCTION progress bar (centered on unit)
        if (tower.construction) {
            drawConstructionVFX(ctx, screenX, screenY, tower.q * 0.37 + tower.r * 0.13);
            const barY = screenY;
            const progress = Math.min(tower.construction.progress / tower.construction.buildTime, 1);
            drawConstructionProgressBar(ctx, screenX, barY, progress);
        }
    }
}

/**
 * Draw all ships (with smooth interpolated movement)
 * @param {function} getShipVisualPosLocal - Function to get ship visual position
 */
export function drawShips(ctx, gameState, fogState, getShipVisualPosLocal) {
    const { k, zoom, cameraX, cameraY, halfWidth, halfHeight } = ctx;
    const unitScale = zoom * 1.5;

    for (const ship of gameState.ships) {
        // Hide non-player units in fog
        if (!shouldRenderEntity(fogState, ship)) continue;

        const pos = getShipVisualPosLocal(ship);
        const screenX = (pos.x - cameraX) * zoom + halfWidth;
        const screenY = (pos.y - cameraY) * zoom + halfHeight;

        // Skip if off screen
        if (screenX < -100 || screenX > ctx.screenWidth + 100 ||
            screenY < -100 || screenY > ctx.screenHeight + 100) continue;

        const shipData = SHIPS[ship.type];

        // Faction outline ring under enemy ships so friend/foe is parseable
        // at a glance in dense battles. Friendly ships already get a selection
        // ring when selected, so they don't need an always-on marker.
        if (isEnemyOwner(ship.owner, fogState)) {
            const ringWidth = Math.max(1.5, 2 * zoom);
            drawFactionHexOutline(k, screenX, screenY, 18 * zoom, getFactionColor(ship.owner, k), 0.9, ringWidth);
        }

        // A burning TNT fuse overrides the white hit-flash with a red telegraph
        // blink that accelerates as detonation approaches.
        const tntBlink = tntBlinkIntensity(ship);
        const flashShader = tntBlink > 0 ? "redFlash" : "whiteFlash";
        const flashIntensity = tntBlink > 0
            ? tntBlink
            : (ship.hitFlash > 0 ? Math.min(ship.hitFlash / 0.15, 1) : 0);
        const flashOpacity = 1.0 - flashIntensity;

        // Use directional animated sprite if available (colored by owner)
        const dirSprite = getDirectionalSprite(shipData, ship.owner);
        if (dirSprite) {
            // Calculate frame from direction row + animation column
            const dir = headingToSpriteDirection(ship.heading || 0);
            const animCol = ship.animFrame || 0;
            const frame = dir.row * 3 + animCol;  // row * 3 cols + column

            const spriteScale = zoom * getRenderScale(gameState, shipData.directionalSprite, shipData.spriteScale || 1);

            k.drawSprite({
                sprite: dirSprite,
                frame: frame,
                pos: k.vec2(screenX, screenY),
                anchor: "center",
                scale: spriteScale,
                flipX: dir.flipX,  // Mirror for left-facing directions
                shader: flashShader,
                opacity: flashOpacity,
            });
        } else if (shipData.imageSprite) {
            // Use rotation-based image sprite (for ships without directional sprites)
            // Sprite faces north (up), heading 0 = east, so rotate by heading + 90°
            const rotationDeg = (ship.heading || 0) * (180 / Math.PI) + 90;
            const spriteScale = zoom * getRenderScale(gameState, shipData.imageSprite, shipData.spriteScale || 1);
            k.drawSprite({
                sprite: shipData.imageSprite,
                frame: 0,
                pos: k.vec2(screenX, screenY),
                anchor: "center",
                scale: spriteScale,
                angle: rotationDeg,
                shader: flashShader,
                opacity: flashOpacity,
            });
        } else {
            // Fall back to pixel art rendering
            const spriteSize = getSpriteSize(shipData.sprite, unitScale);
            drawSprite(k, shipData.sprite,
                screenX - spriteSize.width / 2,
                screenY - spriteSize.height / 2,
                unitScale);

            if (tntBlink > 0) {
                drawSpriteFlash(k, shipData.sprite,
                    screenX - spriteSize.width / 2,
                    screenY - spriteSize.height / 2,
                    unitScale, tntBlink, [255, 38, 25]);
            } else if (ship.hitFlash > 0) {
                drawSpriteFlash(k, shipData.sprite,
                    screenX - spriteSize.width / 2,
                    screenY - spriteSize.height / 2,
                    unitScale, ship.hitFlash / 0.15);
            }
        }
    }
}

/**
 * Draw all workers using the villager sprite sheet. Frame is composed
 * from the worker's facing row (set in gameScene's anim ticker) plus
 * the walk-cycle column. West-side facings reuse east-side rows with
 * flipX=true. A small brown cargo pip floats above the head when the
 * worker is carrying wood.
 */
export function drawWorkers(ctx, gameState, fogState, getWorkerVisualPosLocal) {
    const { k, zoom, cameraX, cameraY, halfWidth, halfHeight } = ctx;
    if (!gameState.workers || gameState.workers.length === 0) return;

    const cargoColor = k.rgb(...WORKER_CONFIG.cargoIndicatorColor);
    const spriteScale = zoom * (WORKER_CONFIG.spriteScale || 1);

    for (const worker of gameState.workers) {
        if (!shouldRenderEntity(fogState, worker)) continue;

        const pos = getWorkerVisualPosLocal(worker);
        const screenX = (pos.x - cameraX) * zoom + halfWidth;
        const screenY = (pos.y - cameraY) * zoom + halfHeight;
        if (screenX < -50 || screenX > ctx.screenWidth + 50 ||
            screenY < -50 || screenY > ctx.screenHeight + 50) continue;

        const row = worker.animRow ?? 4;        // default: facing south
        const col = worker.animFrame ?? 0;
        // Chopping uses the 6-frame chop sheet; everything else uses the
        // 3-frame walk sheet (frozen-on-current-frame when idle).
        const isChop = worker.animType === 'chop';
        const sprite = isChop ? 'villager-chop' : 'villager';
        const cols = isChop ? 6 : 3;
        const frame = row * cols + col;
        const flashShader = worker.hitFlash > 0 ? "redFlash" : undefined;
        const flashIntensity = worker.hitFlash > 0
            ? Math.min(worker.hitFlash / 0.15, 1)
            : 0;

        const renderAlpha = worker.renderAlpha ?? 1;
        if (renderAlpha < 0.02) continue;   // fully faded — skip draw + cargo pip

        k.drawSprite({
            sprite,
            frame,
            pos: k.vec2(screenX, screenY),
            anchor: "center",
            scale: spriteScale,
            flipX: !!worker.flipX,
            shader: flashShader,
            opacity: (1.0 - flashIntensity * 0.4) * renderAlpha,
        });

        // Cargo pip — small brown dot above the head (sprite is 32px tall,
        // so ~12 world px above center clears the body comfortably).
        if (worker.cargo > 0) {
            k.drawCircle({
                pos: k.vec2(screenX, screenY - 14 * zoom),
                radius: Math.max(1.5, 3 * zoom),
                color: cargoColor,
                opacity: renderAlpha,
            });
        }
    }
}

/**
 * Draw floating resource numbers (for resource generation animation)
 * Animation phases: rise (0.5s) → pause (2s) → fade (0.5s)
 */
export function drawFloatingNumbers(ctx, floatingNumbers) {
    const { k, zoom, cameraX, cameraY, halfWidth, halfHeight } = ctx;

    // Animation timing constants
    const RISE_DURATION = 0.5;   // Time to rise up
    const PAUSE_DURATION = 2.0;  // Time to pause at top
    const FADE_DURATION = 0.5;   // Time to fade out
    const RISE_DISTANCE = 43;    // Same offset as health bars above units

    for (const fn of floatingNumbers) {
        const pos = hexToPixel(fn.q, fn.r);
        const age = fn.age;

        // Calculate offset and opacity based on animation phase
        let offsetY;
        let opacity;

        if (age < RISE_DURATION) {
            // Phase 1: Rise up (full opacity) with ease-out
            const riseProgress = age / RISE_DURATION;
            const easedProgress = 1 - Math.pow(1 - riseProgress, 3);  // Cubic ease-out
            offsetY = -(easedProgress * RISE_DISTANCE);
            opacity = 1;
        } else if (age < RISE_DURATION + PAUSE_DURATION) {
            // Phase 2: Pause at top (full opacity)
            offsetY = -RISE_DISTANCE;
            opacity = 1;
        } else {
            // Phase 3: Fade out (stay in place)
            const fadeProgress = (age - RISE_DURATION - PAUSE_DURATION) / FADE_DURATION;
            offsetY = -RISE_DISTANCE;
            opacity = 1 - fadeProgress;
        }

        const screenX = (pos.x - cameraX) * zoom + halfWidth + (fn.offsetX || 0) * zoom;
        const screenY = (pos.y - cameraY) * zoom + halfHeight + offsetY * zoom;

        const fontSize = 16 * zoom;
        const spriteSize = 16;  // Native sprite size (approximate)
        const spacing = 4;      // Spacing between sprite and text

        // Draw sprite on the left (wood or crew based on type) at 1x native size
        const spriteName = fn.type === 'crew' ? "resource-crew" : "resource-wood";
        const spriteX = screenX - spacing - spriteSize / 2;
        k.drawSprite({
            sprite: spriteName,
            pos: k.vec2(spriteX, screenY),
            anchor: "center",
            opacity: opacity,
        });

        // Draw text with black outline (white fill)
        // Outline: draw text in black offset in 4 directions
        const outlineOffset = 1 * zoom;
        const outlineColor = k.rgb(0, 0, 0);
        const textX = screenX + spacing + spriteSize / 2;
        // Offset text Y slightly to align with sprite center (text baseline adjustment)
        const textY = screenY + 1;

        for (const [ox, oy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
            k.drawText({
                text: fn.text,
                pos: k.vec2(textX + ox * outlineOffset, textY + oy * outlineOffset),
                size: fontSize,
                anchor: "center",
                color: outlineColor,
                opacity: opacity,
            });
        }

        // White text on top
        k.drawText({
            text: fn.text,
            pos: k.vec2(textX, textY),
            size: fontSize,
            anchor: "center",
            color: k.rgb(255, 255, 255),
            opacity: opacity,
        });
    }
}

/**
 * Draw birds circling home port
 */
export function drawBirds(ctx, birdStates) {
    const { k, zoom, cameraX, cameraY, halfWidth, halfHeight, screenWidth, screenHeight } = ctx;

    for (const bird of birdStates) {
        const centerPos = hexToPixel(bird.q, bird.r);
        const orbitX = Math.cos(bird.angle) * bird.orbitRadius;
        const orbitY = Math.sin(bird.angle) * bird.orbitRadius;
        const birdScreenX = (centerPos.x + orbitX - cameraX) * zoom + halfWidth;
        const birdScreenY = (centerPos.y + orbitY - 40 - cameraY) * zoom + halfHeight;

        // Skip if off-screen
        if (birdScreenX > -50 && birdScreenX < screenWidth + 50 &&
            birdScreenY > -50 && birdScreenY < screenHeight + 50) {
            // Rotation: 150 degree offset to align sprite with orbit tangent
            const rotationRad = bird.angle + 5 * Math.PI / 6;
            const rotationDeg = rotationRad * (180 / Math.PI);

            k.drawSprite({
                sprite: "bird",
                pos: k.vec2(birdScreenX, birdScreenY),
                frame: bird.frame,
                anchor: "center",
                scale: k.vec2(bird.scale * zoom, bird.scale * zoom),
                angle: rotationDeg,
            });
        }
    }
}

/**
 * Draw loading/unloading progress bars for ships
 */
export function drawDockingProgress(ctx, gameState, getShipVisualPosLocal, fogState) {
    const { k, zoom, cameraX, cameraY, halfWidth, halfHeight } = ctx;
    const unitScale = zoom * 1.5;

    for (const ship of gameState.ships) {
        if (!ship.dockingState) continue;

        // Hide non-player units in fog
        if (!shouldRenderEntity(fogState, ship)) continue;

        const pos = getShipVisualPosLocal(ship);
        const screenX = (pos.x - cameraX) * zoom + halfWidth;
        const screenY = (pos.y - cameraY) * zoom + halfHeight;

        // Skip if off screen
        if (screenX < -100 || screenX > ctx.screenWidth + 100 ||
            screenY < -100 || screenY > ctx.screenHeight + 100) continue;

        const shipData = SHIPS[ship.type];
        const spriteSize = getSpriteSize(shipData.sprite, unitScale);

        const barWidth = 50 * zoom;
        const barHeight = 8 * zoom;
        const barY = screenY;  // Centered on unit

        const LOAD_TIME_PER_UNIT = 1.0;
        const expectedDuration = ship.dockingState.totalUnits * LOAD_TIME_PER_UNIT;
        const progress = Math.min(ship.dockingState.progress / expectedDuration, 1);

        // Background bar
        k.drawRect({
            pos: k.vec2(screenX - barWidth / 2, barY),
            width: barWidth,
            height: barHeight,
            color: k.rgb(40, 40, 40),
            radius: 2,
        });

        // Fill bar (green for loading, gold for unloading)
        const isLoading = ship.dockingState.action === 'loading';
        const fillColor = isLoading
            ? k.rgb(80, 180, 80)   // Green for loading
            : k.rgb(220, 180, 80); // Gold for unloading

        // For loading: bar fills up (0 -> 1)
        // For unloading: bar empties (1 -> 0) to show cargo depleting
        const fillProgress = isLoading ? progress : (1 - progress);

        if (fillProgress > 0) {
            k.drawRect({
                pos: k.vec2(screenX - barWidth / 2, barY),
                width: barWidth * fillProgress,
                height: barHeight,
                color: fillColor,
                radius: 2,
            });
        }

        // Label text
        const label = isLoading
            ? (ship.isPlundering ? "PLUNDERING" : "LOADING")
            : "UNLOADING";
        k.drawText({
            text: label,
            pos: k.vec2(screenX, barY - 10 * zoom),
            size: 9 * zoom,
            anchor: "center",
            color: k.rgb(200, 200, 200),
        });
    }
}
