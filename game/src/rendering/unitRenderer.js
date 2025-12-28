// Unit rendering: ships, ports, settlements, towers
import { hexToPixel, HEX_SIZE } from "../hex.js";
import { drawSprite, drawSpriteFlash, getSpriteSize, PORTS, SHIPS, SETTLEMENTS, TOWERS } from "../sprites/index.js";
import { isHexRevealed } from "../fogOfWar.js";
import { getShipVisualPos } from "../systems/shipMovement.js";
import { getHomePortIndex } from "../gameState.js";
import { drawConstructionProgressBar, drawProgressBar } from "./renderHelpers.js";

/**
 * Draw all ports
 */
export function drawPorts(ctx, gameState, map) {
    const { k, zoom, cameraX, cameraY, halfWidth, halfHeight } = ctx;
    const unitScale = zoom * 1.5;
    const homePortIndex = getHomePortIndex(gameState, map);

    for (let i = 0; i < gameState.ports.length; i++) {
        const port = gameState.ports[i];
        const pos = hexToPixel(port.q, port.r);
        const screenX = (pos.x - cameraX) * zoom + halfWidth;
        const screenY = (pos.y - cameraY) * zoom + halfHeight;

        // Skip if off screen
        if (screenX < -100 || screenX > ctx.screenWidth + 100 ||
            screenY < -100 || screenY > ctx.screenHeight + 100) continue;

        const portData = PORTS[port.type];
        const isConstructing = port.construction !== null;
        const isHomePort = (i === homePortIndex);

        // Use PNG sprite for home port dock, otherwise pixel art
        if (isHomePort && portData.imageSprite) {
            const spriteScale = zoom * (portData.spriteScale || 1);
            // Frame 0 = normal, Frame 1 = flash (white silhouette)
            const frame = port.hitFlash > 0 ? 1 : 0;
            k.drawSprite({
                sprite: portData.imageSprite,
                frame: frame,
                pos: k.vec2(screenX, screenY),
                anchor: "center",
                scale: spriteScale,
                opacity: isConstructing ? 0.5 : 1.0,
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

        // Draw port CONSTRUCTION progress bar (below unit, same distance as health bar is above)
        if (port.construction) {
            const barY = screenY + 43 * zoom;
            const progress = Math.min(port.construction.progress / port.construction.buildTime, 1);
            drawConstructionProgressBar(ctx, screenX, barY, progress);
        }

        // Draw ship build progress bar if building a ship (below unit)
        if (port.buildQueue) {
            const barY = screenY + 43 * zoom;
            const progress = Math.min(port.buildQueue.progress / port.buildQueue.buildTime, 1);
            drawConstructionProgressBar(ctx, screenX, barY, progress);
        }
    }
}

/**
 * Draw all settlements
 */
export function drawSettlements(ctx, gameState) {
    const { k, zoom, cameraX, cameraY, halfWidth, halfHeight } = ctx;
    const unitScale = zoom * 1.5;

    for (const settlement of gameState.settlements) {
        const pos = hexToPixel(settlement.q, settlement.r);
        const screenX = (pos.x - cameraX) * zoom + halfWidth;
        const screenY = (pos.y - cameraY) * zoom + halfHeight;

        // Skip if off screen
        if (screenX < -100 || screenX > ctx.screenWidth + 100 ||
            screenY < -100 || screenY > ctx.screenHeight + 100) continue;

        const settlementData = SETTLEMENTS.settlement;
        const spriteSize = getSpriteSize(settlementData.sprite, unitScale);

        // Draw settlement sprite (semi-transparent if under construction)
        const isConstructing = settlement.construction !== null;
        drawSprite(k, settlementData.sprite,
            screenX - spriteSize.width / 2,
            screenY - spriteSize.height / 2,
            unitScale,
            isConstructing ? 0.5 : 1.0);

        // Draw settlement CONSTRUCTION progress bar (below unit)
        if (settlement.construction) {
            const barY = screenY + 43 * zoom;
            const progress = Math.min(settlement.construction.progress / settlement.construction.buildTime, 1);
            drawConstructionProgressBar(ctx, screenX, barY, progress);
        }
    }
}

/**
 * Draw all towers
 */
export function drawTowers(ctx, gameState) {
    const { k, zoom, cameraX, cameraY, halfWidth, halfHeight } = ctx;
    const unitScale = zoom * 1.5;

    for (const tower of gameState.towers) {
        const pos = hexToPixel(tower.q, tower.r);
        const screenX = (pos.x - cameraX) * zoom + halfWidth;
        const screenY = (pos.y - cameraY) * zoom + halfHeight;

        // Skip if off screen
        if (screenX < -100 || screenX > ctx.screenWidth + 100 ||
            screenY < -100 || screenY > ctx.screenHeight + 100) continue;

        const towerData = TOWERS[tower.type];
        const spriteSize = getSpriteSize(towerData.sprite, unitScale);

        // Draw tower sprite (semi-transparent if under construction)
        const isConstructing = tower.construction !== null;
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

        // Draw tower CONSTRUCTION progress bar (below unit)
        if (tower.construction) {
            const barY = screenY + 43 * zoom;
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
        // Hide pirates in fog of war (player ships always visible)
        if (ship.type === 'pirate' && !isHexRevealed(fogState, ship.q, ship.r)) continue;

        const pos = getShipVisualPosLocal(ship);
        const screenX = (pos.x - cameraX) * zoom + halfWidth;
        const screenY = (pos.y - cameraY) * zoom + halfHeight;

        // Skip if off screen
        if (screenX < -100 || screenX > ctx.screenWidth + 100 ||
            screenY < -100 || screenY > ctx.screenHeight + 100) continue;

        const shipData = SHIPS[ship.type];

        // Use image sprite if available, otherwise fall back to pixel art
        if (shipData.imageSprite) {
            // Sprite faces north (up), heading 0 = east, so rotate by heading + 90°
            const rotationDeg = (ship.heading || 0) * (180 / Math.PI) + 90;
            const spriteScale = zoom * (shipData.spriteScale || 1);
            // Frame 0 = normal, Frame 1 = flash (white silhouette)
            const frame = ship.hitFlash > 0 ? 1 : 0;
            k.drawSprite({
                sprite: shipData.imageSprite,
                frame: frame,
                pos: k.vec2(screenX, screenY),
                anchor: "center",
                scale: spriteScale,
                angle: rotationDeg,
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
 */
export function drawFloatingNumbers(ctx, floatingNumbers) {
    const { k, zoom, cameraX, cameraY, halfWidth, halfHeight } = ctx;

    for (const fn of floatingNumbers) {
        const pos = hexToPixel(fn.q, fn.r);
        const progress = fn.age / fn.duration;
        const offsetY = -30 - (progress * 40);  // Float upward
        const opacity = 1 - progress;  // Fade out

        const screenX = (pos.x - cameraX) * zoom + halfWidth + (fn.offsetX || 0) * zoom;
        const screenY = (pos.y - cameraY) * zoom + halfHeight + offsetY * zoom;

        const color = fn.type === 'wood'
            ? k.rgb(180, 120, 60)   // Brown for wood
            : k.rgb(80, 180, 80);   // Green for food

        k.drawText({
            text: fn.text,
            pos: k.vec2(screenX, screenY),
            size: 28 * zoom,
            anchor: "center",
            color: color,
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
export function drawDockingProgress(ctx, gameState, getShipVisualPosLocal) {
    const { k, zoom, cameraX, cameraY, halfWidth, halfHeight } = ctx;
    const unitScale = zoom * 1.5;

    for (const ship of gameState.ships) {
        if (!ship.dockingState) continue;

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
        const barY = screenY - spriteSize.height / 2 - 20 * zoom;

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
        const label = isLoading ? "LOADING" : "UNLOADING";
        k.drawText({
            text: label,
            pos: k.vec2(screenX, barY - 10 * zoom),
            size: 9 * zoom,
            anchor: "center",
            color: k.rgb(200, 200, 200),
        });
    }
}
