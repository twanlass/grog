// Unit rendering: ships, ports, settlements, towers
import { hexToPixel, HEX_SIZE } from "../hex.js";
import { drawSprite, drawSpriteFlash, getSpriteSize, PORTS, SHIPS, SETTLEMENTS, TOWERS } from "../sprites/index.js";
import { isHexVisible, shouldRenderEntity } from "../fogOfWar.js";
import { getShipVisualPos } from "../systems/shipMovement.js";
import { drawConstructionProgressBar, drawProgressBar } from "./renderHelpers.js";
import { isAIOwner } from "../gameState.js";

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
 * Get the colored directional sprite name based on ship owner
 * @param {object} shipData - Ship metadata
 * @param {string} owner - Ship owner ('player', 'ai1', 'ai2')
 * @returns {string|null} Sprite name or null if no directional sprite
 */
function getDirectionalSprite(shipData, owner) {
    if (!shipData.directionalSprite) return null;
    // Map owner to colored sprite
    if (owner === 'ai1') return 'cutter-green';
    if (owner === 'ai2') return 'cutter-blue';
    return 'cutter-red';  // Player default
}

// Faction colors for visual differentiation
const FACTION_COLORS = {
    player: { r: 60, g: 120, b: 200 },   // Blue (not used - player doesn't need indicator)
    ai1: { r: 200, g: 60, b: 60 },       // Red
    ai2: { r: 230, g: 160, b: 50 },      // Orange
};

/**
 * Get faction indicator color for an owner
 */
function getFactionColor(owner, k) {
    const color = FACTION_COLORS[owner] || FACTION_COLORS.ai1;
    return k.rgb(color.r, color.g, color.b);
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

        // Draw indicator circle for AI ports (enemy faction marker)
        if (isAIOwner(port.owner)) {
            k.drawCircle({
                pos: k.vec2(screenX, screenY),
                radius: 22 * zoom,
                color: getFactionColor(port.owner, k),
                opacity: 0.4,
            });
        }

        // Use PNG sprite for docks (if available), otherwise pixel art
        if (portData.imageSprite) {
            const spriteScale = zoom * (portData.spriteScale || 1);
            // Use shader for damage flash effect (0-1 intensity)
            const flashIntensity = port.hitFlash > 0 ? Math.min(port.hitFlash / 0.15, 1) : 0;
            k.drawSprite({
                sprite: portData.imageSprite,
                frame: 0,  // Always use normal frame, shader handles flash
                pos: k.vec2(screenX, screenY),
                anchor: "center",
                scale: spriteScale,
                opacity: isConstructing ? 0.5 : 1.0,
                shader: "whiteFlash",
                uniforms: { u_flash: flashIntensity },
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

        // Draw indicator circle for AI settlements (enemy faction marker)
        if (isAIOwner(settlement.owner)) {
            k.drawCircle({
                pos: k.vec2(screenX, screenY),
                radius: 16 * zoom,
                color: getFactionColor(settlement.owner, k),
                opacity: 0.4,
            });
        }

        // Use image sprite if available, otherwise fall back to pixel art
        if (settlementData.imageSprite) {
            const spriteScale = zoom * 1.0;
            // Use shader for damage flash effect (0-1 intensity)
            const flashIntensity = settlement.hitFlash > 0 ? Math.min(settlement.hitFlash / 0.15, 1) : 0;
            k.drawSprite({
                sprite: settlementData.imageSprite,
                frame: 0,  // Always use normal frame, shader handles flash
                pos: k.vec2(screenX, screenY),
                anchor: "center",
                scale: spriteScale,
                opacity: isConstructing ? 0.5 : 1.0,
                shader: "whiteFlash",
                uniforms: { u_flash: flashIntensity },
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

        // Draw indicator circle for AI towers (enemy faction marker)
        if (isAIOwner(tower.owner)) {
            k.drawCircle({
                pos: k.vec2(screenX, screenY),
                radius: 18 * zoom,
                color: getFactionColor(tower.owner, k),
                opacity: 0.4,
            });
        }

        // Use image sprite if available, otherwise fall back to pixel art
        if (towerData.imageSprite) {
            const spriteScale = zoom * 1.0;
            // Use shader for damage flash effect (0-1 intensity)
            const flashIntensity = tower.hitFlash > 0 ? Math.min(tower.hitFlash / 0.15, 1) : 0;
            k.drawSprite({
                sprite: towerData.imageSprite,
                frame: 0,  // Always use normal frame, shader handles flash
                pos: k.vec2(screenX, screenY),
                anchor: "center",
                scale: spriteScale,
                opacity: isConstructing ? 0.5 : 1.0,
                shader: "whiteFlash",
                uniforms: { u_flash: flashIntensity },
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

        // Draw indicator circle for AI ships (enemy faction marker)
        if (isAIOwner(ship.owner)) {
            k.drawCircle({
                pos: k.vec2(screenX, screenY),
                radius: 18 * zoom,
                color: getFactionColor(ship.owner, k),
                opacity: 0.4,
            });
        }

        // Use directional animated sprite if available (colored by owner)
        const dirSprite = getDirectionalSprite(shipData, ship.owner);
        if (dirSprite) {
            // Calculate frame from direction row + animation column
            const dir = headingToSpriteDirection(ship.heading || 0);
            const animCol = ship.animFrame || 0;
            const frame = dir.row * 3 + animCol;  // row * 3 cols + column

            const spriteScale = zoom * (shipData.spriteScale || 1);
            // Use shader for damage flash effect (0-1 intensity)
            const flashIntensity = ship.hitFlash > 0 ? Math.min(ship.hitFlash / 0.15, 1) : 0;

            k.drawSprite({
                sprite: dirSprite,
                frame: frame,
                pos: k.vec2(screenX, screenY),
                anchor: "center",
                scale: spriteScale,
                flipX: dir.flipX,  // Mirror for left-facing directions
                shader: "whiteFlash",
                uniforms: { u_flash: flashIntensity },
            });
        } else if (shipData.imageSprite) {
            // Use rotation-based image sprite (for ships without directional sprites)
            // Sprite faces north (up), heading 0 = east, so rotate by heading + 90°
            const rotationDeg = (ship.heading || 0) * (180 / Math.PI) + 90;
            const spriteScale = zoom * (shipData.spriteScale || 1);
            // Use shader for damage flash effect (0-1 intensity)
            const flashIntensity = ship.hitFlash > 0 ? Math.min(ship.hitFlash / 0.15, 1) : 0;
            k.drawSprite({
                sprite: shipData.imageSprite,
                frame: 0,  // Always use normal frame, shader handles flash
                pos: k.vec2(screenX, screenY),
                anchor: "center",
                scale: spriteScale,
                angle: rotationDeg,
                shader: "whiteFlash",
                uniforms: { u_flash: flashIntensity },
            });
        } else {
            // Fall back to pixel art rendering
            const spriteSize = getSpriteSize(shipData.sprite, unitScale);
            drawSprite(k, shipData.sprite,
                screenX - spriteSize.width / 2,
                screenY - spriteSize.height / 2,
                unitScale);

            // Draw hit flash overlay
            if (ship.hitFlash > 0) {
                drawSpriteFlash(k, shipData.sprite,
                    screenX - spriteSize.width / 2,
                    screenY - spriteSize.height / 2,
                    unitScale, ship.hitFlash / 0.15);
            }
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
