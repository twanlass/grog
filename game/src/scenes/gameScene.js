// Main game scene - renders the hex map
import { hexToPixel, hexCorners, HEX_SIZE, pixelToHex, hexKey, hexNeighbors, hexDistance } from "../hex.js";
import { generateMap, getTileColor, getStippleColors, TILE_TYPES } from "../mapGenerator.js";
import { createGameState, createShip, createPort, createSettlement, findStartingPosition, findFreeAdjacentWater, getBuildableShips, startBuilding, selectUnit, addToSelection, toggleSelection, isSelected, clearSelection, getSelectedUnits, getSelectedShips, enterPortBuildMode, exitPortBuildMode, isValidPortSite, getNextPortType, startPortUpgrade, isShipBuildingPort, enterSettlementBuildMode, exitSettlementBuildMode, isValidSettlementSite, enterTowerBuildMode, exitTowerBuildMode, isValidTowerSite, isShipBuildingTower, canAfford, deductCost, isPortBuildingSettlement, isShipAdjacentToPort, getCargoSpace, cancelTradeRoute, findNearbyWaitingHex } from "../gameState.js";
import { drawSprite, drawSpriteFlash, getSpriteSize, PORTS, SHIPS, SETTLEMENTS, TOWERS } from "../sprites/index.js";
import { findPath, findNearestWater, findNearestAvailable } from "../pathfinding.js";
import { createFogState, initializeFog, revealRadius, isHexRevealed } from "../fogOfWar.js";

// Game systems
import { updateShipMovement, getShipVisualPos, updatePirateAI } from "../systems/shipMovement.js";
import { updateTradeRoutes } from "../systems/tradeRoutes.js";
import { updateConstruction } from "../systems/construction.js";
import { updateResourceGeneration } from "../systems/resourceGeneration.js";
import { updateCombat, updatePirateRespawns } from "../systems/combat.js";
import {
    handlePortPlacementClick, handleSettlementPlacementClick, handleTowerPlacementClick,
    handleShipBuildPanelClick, handleBuildPanelClick,
    handleTradeRouteClick, handleHomePortUnloadClick,
    handleUnitSelection, handleWaypointClick, handleAttackClick
} from "../systems/inputHandler.js";

// Game start configuration
export const STARTING_PIRATES = 2;
export const PIRATE_INITIAL_DELAY = 60;  // seconds before first pirates spawn

/**
 * Draw filled hexes within a range (transparent overlay)
 */
function drawHexRangeFilled(k, centerQ, centerR, range, cameraX, cameraY, zoom, halfWidth, halfHeight, color, opacity) {
    for (let dq = -range; dq <= range; dq++) {
        for (let dr = Math.max(-range, -dq - range); dr <= Math.min(range, -dq + range); dr++) {
            const q = centerQ + dq;
            const r = centerR + dr;
            const dist = hexDistance(centerQ, centerR, q, r);
            if (dist > range) continue;

            const pos = hexToPixel(q, r);
            const screenX = (pos.x - cameraX) * zoom + halfWidth;
            const screenY = (pos.y - cameraY) * zoom + halfHeight;
            const corners = hexCorners(screenX, screenY, HEX_SIZE * zoom);
            const pts = corners.map(c => k.vec2(c.x, c.y));

            k.drawPolygon({
                pts,
                color: color,
                opacity: opacity,
            });
        }
    }
}

/**
 * Draw outline around outer boundary of a hex range
 */
function drawHexRangeOutline(k, centerQ, centerR, range, cameraX, cameraY, zoom, halfWidth, halfHeight, color, lineWidth) {
    for (let dq = -range; dq <= range; dq++) {
        for (let dr = Math.max(-range, -dq - range); dr <= Math.min(range, -dq + range); dr++) {
            const q = centerQ + dq;
            const r = centerR + dr;
            const dist = hexDistance(centerQ, centerR, q, r);
            if (dist > range) continue;

            const neighbors = hexNeighbors(q, r);
            const pos = hexToPixel(q, r);
            const screenX = (pos.x - cameraX) * zoom + halfWidth;
            const screenY = (pos.y - cameraY) * zoom + halfHeight;
            const corners = hexCorners(screenX, screenY, HEX_SIZE * zoom);

            for (let i = 0; i < 6; i++) {
                const neighbor = neighbors[i];
                const neighborDist = hexDistance(centerQ, centerR, neighbor.q, neighbor.r);
                if (neighborDist > range) {
                    // Corrected mapping: neighbor i shares edge between corners (6-i)%6 and ((6-i)+1)%6
                    const c1 = (6 - i) % 6;
                    const c2 = (c1 + 1) % 6;
                    k.drawLine({
                        p1: k.vec2(corners[c1].x, corners[c1].y),
                        p2: k.vec2(corners[c2].x, corners[c2].y),
                        width: lineWidth,
                        color: color,
                    });
                }
            }
        }
    }
}

export function createGameScene(k) {
    return function gameScene() {
        // Generate the map (random each time)
        const map = generateMap({
            width: 60,
            height: 60,
        });

        // Initialize game state
        const gameState = createGameState();

        // Find starting position and place initial units
        const startTile = findStartingPosition(map);
        if (startTile) {
            // Place starting dock port (player must build ships)
            gameState.ports.push(createPort('dock', startTile.q, startTile.r));

            // Queue initial pirates to spawn after delay
            for (let p = 0; p < STARTING_PIRATES; p++) {
                gameState.pirateRespawnQueue.push({ timer: PIRATE_INITIAL_DELAY });
            }
        }

        // Initialize fog of war
        const fogState = createFogState();
        initializeFog(fogState, gameState);

        // Selection hit detection radius (in world units)
        const SELECTION_RADIUS = HEX_SIZE * 1.2;

        // Camera state
        let cameraX = 0;
        let cameraY = 0;
        let zoom = 1;

        // Camera shake state
        let cameraShake = 0;  // Intensity (decays over time)
        let cameraShakeX = 0;
        let cameraShakeY = 0;

        // Selection box state (left-drag)
        let isLeftMouseDown = false;
        let isSelecting = false;
        let selectStartX = 0;
        let selectStartY = 0;
        let selectEndX = 0;
        let selectEndY = 0;
        const DRAG_THRESHOLD = 5;

        // Pan state (right-drag)
        let isPanning = false;
        let panStartX = 0;
        let panStartY = 0;
        let cameraStartX = 0;
        let cameraStartY = 0;

        // Build panel state (for click detection)
        let buildPanelBounds = null;  // { x, y, width, height, buttons: [{y, height, shipType}] }
        let shipBuildPanelBounds = null;  // For ship's port build panel
        let settlementBuildPanelBounds = null;  // For settlement build button in port panel

        // Floating numbers for resource generation animation
        const floatingNumbers = [];
        const GENERATION_INTERVAL = 30;  // seconds between resource generation
        const GENERATION_AMOUNT = 5;     // amount of each resource generated

        // Stipple animation timer for water twinkling effect
        let stippleAnimTime = 0;

        // Bird states (3 birds orbiting home port with varying sizes)
        const birdStates = startTile ? [
            { q: startTile.q, r: startTile.r, frame: 0, frameTimer: 0, angle: 0, orbitRadius: 150, orbitSpeed: 0.3, scale: 1.0 },
            { q: startTile.q, r: startTile.r, frame: 0, frameTimer: 0, angle: 2 * Math.PI / 3, orbitRadius: 150, orbitSpeed: 0.28, scale: 0.85 },
            { q: startTile.q, r: startTile.r, frame: 0, frameTimer: 0, angle: 4 * Math.PI / 3, orbitRadius: 150, orbitSpeed: 0.32, scale: 0.70 },
        ] : [];

        // Pre-calculate world positions for all tiles (once at load)
        const tilePositions = new Map();
        for (const tile of map.tiles.values()) {
            const pos = hexToPixel(tile.q, tile.r);
            tilePositions.set(tile, pos);
        }

        // Pre-create reusable color objects (for fast polygon drawing)
        const tileColors = new Map();
        for (const tile of map.tiles.values()) {
            const [r, g, b] = getTileColor(tile);
            tileColors.set(tile, k.rgb(r, g, b));
        }

        // Pre-calculate stipple data per tile (just positions and color indices)
        const tileStipples = new Map();
        for (const tile of map.tiles.values()) {
            const colors = getStippleColors(tile);
            const stippleColors = colors.map(([r, g, b]) => k.rgb(r, g, b));

            // Generate deterministic random stipple dots - fewer dots for performance
            const seed = tile.q * 1000 + tile.r;
            const dots = [];
            const numDots = 6;  // Reduced from 12

            for (let i = 0; i < numDots; i++) {
                const hash = Math.sin(seed * 9999 + i * 7777) * 10000;
                const rx = (hash - Math.floor(hash)) * 2 - 1;
                const hash2 = Math.sin(seed * 3333 + i * 5555) * 10000;
                const ry = (hash2 - Math.floor(hash2)) * 2 - 1;
                const hash3 = Math.sin(seed * 1111 + i * 2222) * 10000;
                const colorIdx = Math.floor((hash3 - Math.floor(hash3)) * 3);

                const dist = Math.sqrt(rx * rx + ry * ry);
                if (dist < 0.8) {
                    dots.push({ rx, ry, colorIdx });
                }
            }

            tileStipples.set(tile, { colors: stippleColors, dots });
        }

        // Main game update loop - delegates to system modules
        k.onUpdate(() => {
            const rawDt = k.dt();
            const dt = rawDt * gameState.timeScale;

            // Update stipple animation (always runs, even when paused)
            stippleAnimTime += rawDt;

            // Delegate to game systems
            updateShipMovement(hexToPixel, gameState, map, fogState, dt);
            updatePirateAI(gameState, map, gameState.ports[0], dt); // Pirates patrol near home port
            updateTradeRoutes(gameState, map, dt);
            updateConstruction(gameState, map, fogState, dt);
            updateResourceGeneration(gameState, floatingNumbers, dt);
            updateCombat(hexToPixel, gameState, dt);
            updatePirateRespawns(gameState, map, createShip, hexKey, dt);

            // Decay hit flash timers
            for (const ship of gameState.ships) {
                if (ship.hitFlash > 0) ship.hitFlash -= rawDt;
            }
            for (const port of gameState.ports) {
                if (port.hitFlash > 0) port.hitFlash -= rawDt;
            }
            for (const tower of gameState.towers) {
                if (tower.hitFlash > 0) tower.hitFlash -= rawDt;
            }

            // Update ship explosions and trigger camera shake for new ones (if visible)
            const halfW = k.width() / 2;
            const halfH = k.height() / 2;
            for (let i = gameState.shipExplosions.length - 1; i >= 0; i--) {
                const explosion = gameState.shipExplosions[i];
                // Trigger camera shake for new explosions only if on screen
                if (explosion.age < rawDt * 2) {
                    const pos = hexToPixel(explosion.q, explosion.r);
                    const screenX = (pos.x - cameraX) * zoom + halfW;
                    const screenY = (pos.y - cameraY) * zoom + halfH;
                    const margin = 100;
                    if (screenX >= -margin && screenX <= k.width() + margin &&
                        screenY >= -margin && screenY <= k.height() + margin) {
                        cameraShake = Math.max(cameraShake, 4);  // Shake intensity
                    }
                }
                explosion.age += dt;
                if (explosion.age >= explosion.duration) {
                    gameState.shipExplosions.splice(i, 1);
                }
            }

            // Update camera shake
            if (cameraShake > 0) {
                cameraShakeX = (Math.random() - 0.5) * cameraShake * 2;
                cameraShakeY = (Math.random() - 0.5) * cameraShake * 2;
                cameraShake *= 0.9;  // Decay
                if (cameraShake < 0.1) cameraShake = 0;
            } else {
                cameraShakeX = 0;
                cameraShakeY = 0;
            }

            // Update floating debris
            for (let i = gameState.floatingDebris.length - 1; i >= 0; i--) {
                gameState.floatingDebris[i].age += dt;
                if (gameState.floatingDebris[i].age >= gameState.floatingDebris[i].duration) {
                    gameState.floatingDebris.splice(i, 1);
                }
            }

            // Update water splashes (from missed projectiles)
            for (let i = gameState.waterSplashes.length - 1; i >= 0; i--) {
                gameState.waterSplashes[i].age += dt;
                if (gameState.waterSplashes[i].age >= gameState.waterSplashes[i].duration) {
                    gameState.waterSplashes.splice(i, 1);
                }
            }

            // Check for game over: all player ships and ports destroyed
            const playerShips = gameState.ships.filter(s => s.type !== 'pirate');
            if (playerShips.length === 0 && gameState.ports.length === 0) {
                k.go("game"); // Restart
                return;
            }

            // Animate birds
            for (const bird of birdStates) {
                bird.frameTimer += rawDt;  // Use rawDt so it animates even when paused
                if (bird.frameTimer > 0.25) {  // ~4 FPS flapping
                    bird.frameTimer = 0;
                    bird.frame = (bird.frame + 1) % 2;
                }
                // Update orbit position
                bird.angle += bird.orbitSpeed * rawDt;
            }
        });

        // Check if a ship is docked (on water adjacent to land, and stationary)
        function isShipDocked(ship) {
            // Must not have a waypoint (stationary)
            if (ship.waypoint !== null) return false;

            // Check if any neighbor is land
            const neighbors = hexNeighbors(ship.q, ship.r);
            for (const n of neighbors) {
                const tile = map.tiles.get(hexKey(n.q, n.r));
                if (tile && tile.type === 'land') {
                    return true;
                }
            }
            return false;
        }

        // Local wrapper for getShipVisualPos (passes hexToPixel)
        function getShipVisualPosLocal(ship) {
            return getShipVisualPos(hexToPixel, ship);
        }


        // Main render loop
        k.onDraw(() => {
            const halfWidth = k.width() / 2;
            const halfHeight = k.height() / 2;
            const margin = HEX_SIZE * zoom * 2;
            const scaledSize = HEX_SIZE * zoom;

            // Apply camera shake offset
            const effectiveCameraX = cameraX + cameraShakeX;
            const effectiveCameraY = cameraY + cameraShakeY;

            // Draw all visible tiles
            for (const tile of map.tiles.values()) {
                const pos = tilePositions.get(tile);
                const screenX = (pos.x - effectiveCameraX) * zoom + halfWidth;
                const screenY = (pos.y - effectiveCameraY) * zoom + halfHeight;

                // Culling - skip off-screen hexes
                if (
                    screenX < -margin ||
                    screenX > k.width() + margin ||
                    screenY < -margin ||
                    screenY > k.height() + margin
                ) {
                    continue;
                }

                // Get pre-calculated corners
                const corners = hexCorners(screenX, screenY, scaledSize);
                const pts = corners.map(c => k.vec2(c.x, c.y));

                // Draw hex base
                k.drawPolygon({
                    pts,
                    color: tileColors.get(tile),
                });

                // Draw stipple dots (only when zoomed in enough)
                if (zoom > 0.5) {
                    const stipple = tileStipples.get(tile);
                    const dotSize = Math.max(1.5, 2.5 * zoom);
                    const isWater = tile.type === 'deep_ocean' || tile.type === 'shallow';

                    for (const dot of stipple.dots) {
                        // Twinkling effect for water tiles
                        if (isWater) {
                            const dotPhase = Math.sin(dot.rx * 3 + dot.ry * 5);
                            const blinkCycle = Math.sin(stippleAnimTime * 3 + dotPhase * Math.PI);
                            if (blinkCycle < 0) continue;  // Skip this dot half the time
                        }

                        const dotX = screenX + dot.rx * scaledSize * 0.65;
                        const dotY = screenY + dot.ry * scaledSize * 0.65;
                        k.drawCircle({
                            pos: k.vec2(dotX, dotY),
                            radius: dotSize,
                            color: stipple.colors[dot.colorIdx],
                        });
                    }
                }
            }

            // Draw fog of war overlay for unrevealed hexes
            const fogBaseColor = k.rgb(15, 20, 30);
            const fogHatchColor = k.rgb(25, 35, 50);
            const hatchSpacing = Math.max(4, 6 * zoom);

            for (const tile of map.tiles.values()) {
                // Skip revealed hexes
                if (isHexRevealed(fogState, tile.q, tile.r)) continue;

                const pos = tilePositions.get(tile);
                const screenX = (pos.x - effectiveCameraX) * zoom + halfWidth;
                const screenY = (pos.y - effectiveCameraY) * zoom + halfHeight;

                // Culling - skip off-screen hexes
                if (
                    screenX < -margin ||
                    screenX > k.width() + margin ||
                    screenY < -margin ||
                    screenY > k.height() + margin
                ) {
                    continue;
                }

                const corners = hexCorners(screenX, screenY, scaledSize);
                const pts = corners.map(c => k.vec2(c.x, c.y));

                // Draw fog base polygon
                k.drawPolygon({
                    pts,
                    color: fogBaseColor,
                    opacity: 0.92,
                });

                // Draw diagonal hatching pattern
                const hexRadius = scaledSize;
                for (let i = -4; i <= 4; i++) {
                    const offset = i * hatchSpacing;
                    k.drawLine({
                        p1: k.vec2(screenX + offset - hexRadius, screenY - hexRadius),
                        p2: k.vec2(screenX + offset + hexRadius, screenY + hexRadius),
                        width: 1,
                        color: fogHatchColor,
                        opacity: 0.4,
                    });
                }
            }

            // Draw ports
            const unitScale = zoom * 1.5;
            for (const port of gameState.ports) {
                const pos = hexToPixel(port.q, port.r);
                const screenX = (pos.x - effectiveCameraX) * zoom + halfWidth;
                const screenY = (pos.y - effectiveCameraY) * zoom + halfHeight;

                // Skip if off screen
                if (screenX < -100 || screenX > k.width() + 100 ||
                    screenY < -100 || screenY > k.height() + 100) continue;

                const portData = PORTS[port.type];
                const spriteSize = getSpriteSize(portData.sprite, unitScale);

                // Draw port sprite (semi-transparent if under construction)
                const isConstructing = port.construction !== null;
                drawSprite(k, portData.sprite,
                    screenX - spriteSize.width / 2,
                    screenY - spriteSize.height / 2,
                    unitScale,
                    isConstructing ? 0.5 : 1.0);  // Reduced opacity if under construction

                // Draw hit flash overlay
                if (port.hitFlash > 0) {
                    drawSpriteFlash(k, portData.sprite,
                        screenX - spriteSize.width / 2,
                        screenY - spriteSize.height / 2,
                        unitScale, port.hitFlash / 0.15);
                }

                // Draw port CONSTRUCTION progress bar (port being built by ship)
                if (port.construction) {
                    const barWidth = 50 * zoom;
                    const barHeight = 8 * zoom;
                    const barY = screenY - spriteSize.height / 2 - 20 * zoom;
                    const progress = Math.min(port.construction.progress / port.construction.buildTime, 1);

                    // Background
                    k.drawRect({
                        pos: k.vec2(screenX - barWidth / 2, barY),
                        width: barWidth,
                        height: barHeight,
                        color: k.rgb(40, 40, 40),
                        radius: 2,
                    });

                    // Fill (teal/blue for construction)
                    if (progress > 0) {
                        k.drawRect({
                            pos: k.vec2(screenX - barWidth / 2, barY),
                            width: barWidth * progress,
                            height: barHeight,
                            color: k.rgb(80, 180, 220),
                            radius: 2,
                        });
                    }

                    // "BUILDING" label
                    k.drawText({
                        text: "BUILDING",
                        pos: k.vec2(screenX, barY - 10 * zoom),
                        size: 9 * zoom,
                        anchor: "center",
                        color: k.rgb(200, 200, 200),
                    });
                }

                // Draw ship build progress bar if building a ship (existing functionality)
                if (port.buildQueue) {
                    const barWidth = 50 * zoom;
                    const barHeight = 8 * zoom;
                    const barY = screenY - spriteSize.height / 2 - 20 * zoom;
                    const progress = Math.min(port.buildQueue.progress / port.buildQueue.buildTime, 1);

                    // Background
                    k.drawRect({
                        pos: k.vec2(screenX - barWidth / 2, barY),
                        width: barWidth,
                        height: barHeight,
                        color: k.rgb(40, 40, 40),
                        radius: 2,
                    });

                    // Fill (teal/blue for construction)
                    if (progress > 0) {
                        k.drawRect({
                            pos: k.vec2(screenX - barWidth / 2, barY),
                            width: barWidth * progress,
                            height: barHeight,
                            color: k.rgb(80, 180, 220),
                            radius: 2,
                        });
                    }

                    // "BUILDING" label
                    k.drawText({
                        text: "BUILDING",
                        pos: k.vec2(screenX, barY - 10 * zoom),
                        size: 9 * zoom,
                        anchor: "center",
                        color: k.rgb(200, 200, 200),
                    });
                }
            }

            // Draw settlements
            for (const settlement of gameState.settlements) {
                const pos = hexToPixel(settlement.q, settlement.r);
                const screenX = (pos.x - effectiveCameraX) * zoom + halfWidth;
                const screenY = (pos.y - effectiveCameraY) * zoom + halfHeight;

                // Skip if off screen
                if (screenX < -100 || screenX > k.width() + 100 ||
                    screenY < -100 || screenY > k.height() + 100) continue;

                const settlementData = SETTLEMENTS.settlement;
                const spriteSize = getSpriteSize(settlementData.sprite, unitScale);

                // Draw settlement sprite (semi-transparent if under construction)
                const isConstructing = settlement.construction !== null;
                drawSprite(k, settlementData.sprite,
                    screenX - spriteSize.width / 2,
                    screenY - spriteSize.height / 2,
                    unitScale,
                    isConstructing ? 0.5 : 1.0);

                // Draw settlement CONSTRUCTION progress bar
                if (settlement.construction) {
                    const barWidth = 50 * zoom;
                    const barHeight = 8 * zoom;
                    const barY = screenY - spriteSize.height / 2 - 20 * zoom;
                    const progress = Math.min(settlement.construction.progress / settlement.construction.buildTime, 1);

                    // Background
                    k.drawRect({
                        pos: k.vec2(screenX - barWidth / 2, barY),
                        width: barWidth,
                        height: barHeight,
                        color: k.rgb(40, 40, 40),
                        radius: 2,
                    });

                    // Fill (teal/blue for construction)
                    if (progress > 0) {
                        k.drawRect({
                            pos: k.vec2(screenX - barWidth / 2, barY),
                            width: barWidth * progress,
                            height: barHeight,
                            color: k.rgb(80, 180, 220),
                            radius: 2,
                        });
                    }

                    // "BUILDING" label
                    k.drawText({
                        text: "BUILDING",
                        pos: k.vec2(screenX, barY - 10 * zoom),
                        size: 9 * zoom,
                        anchor: "center",
                        color: k.rgb(200, 200, 200),
                    });
                }
            }

            // Draw towers
            for (const tower of gameState.towers) {
                const pos = hexToPixel(tower.q, tower.r);
                const screenX = (pos.x - effectiveCameraX) * zoom + halfWidth;
                const screenY = (pos.y - effectiveCameraY) * zoom + halfHeight;

                // Skip if off screen
                if (screenX < -100 || screenX > k.width() + 100 ||
                    screenY < -100 || screenY > k.height() + 100) continue;

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

                // Draw tower CONSTRUCTION progress bar
                if (tower.construction) {
                    const barWidth = 50 * zoom;
                    const barHeight = 8 * zoom;
                    const barY = screenY - spriteSize.height / 2 - 20 * zoom;
                    const progress = Math.min(tower.construction.progress / tower.construction.buildTime, 1);

                    // Background
                    k.drawRect({
                        pos: k.vec2(screenX - barWidth / 2, barY),
                        width: barWidth,
                        height: barHeight,
                        color: k.rgb(40, 40, 40),
                        radius: 2,
                    });

                    // Fill (teal/blue for construction)
                    if (progress > 0) {
                        k.drawRect({
                            pos: k.vec2(screenX - barWidth / 2, barY),
                            width: barWidth * progress,
                            height: barHeight,
                            color: k.rgb(80, 180, 220),
                            radius: 2,
                        });
                    }

                    // "BUILDING" label
                    k.drawText({
                        text: "BUILDING",
                        pos: k.vec2(screenX, barY - 10 * zoom),
                        size: 9 * zoom,
                        anchor: "center",
                        color: k.rgb(200, 200, 200),
                    });
                }
            }

            // Draw floating resource numbers
            for (const fn of floatingNumbers) {
                const pos = hexToPixel(fn.q, fn.r);
                const progress = fn.age / fn.duration;
                const offsetY = -30 - (progress * 40);  // Float upward
                const opacity = 1 - progress;  // Fade out

                const screenX = (pos.x - effectiveCameraX) * zoom + halfWidth + (fn.offsetX || 0) * zoom;
                const screenY = (pos.y - effectiveCameraY) * zoom + halfHeight + offsetY * zoom;

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

            // Draw ship water trails (behind ships)
            const TRAIL_FADE_DURATION = 0.5;
            const TRAIL_BASE_OPACITY = 0.4;

            for (const ship of gameState.ships) {
                if (!ship.trail || ship.trail.length < 2) continue;

                // Hide pirate trails in fog of war
                if (ship.type === 'pirate' && !isHexRevealed(fogState, ship.q, ship.r)) continue;

                // Scale wake size based on ship size (using cargo as proxy)
                const shipData = SHIPS[ship.type];
                const sizeMultiplier = Math.sqrt(shipData.cargo);
                const baseSize = 8 * sizeMultiplier;
                const sizeDecay = 0.8 * sizeMultiplier;

                for (let i = 1; i < ship.trail.length; i++) {
                    const segment = ship.trail[i];
                    const progress = segment.age / TRAIL_FADE_DURATION;
                    const opacity = TRAIL_BASE_OPACITY * Math.min(sizeMultiplier * 0.8, 1.2) * (1 - progress);
                    const size = (baseSize - i * sizeDecay) * zoom;

                    const screenX = (segment.x - effectiveCameraX) * zoom + halfWidth;
                    const screenY = (segment.y - effectiveCameraY) * zoom + halfHeight;

                    // Skip if off screen
                    if (screenX < -50 || screenX > k.width() + 50 ||
                        screenY < -50 || screenY > k.height() + 50) continue;

                    // Draw water splash circle
                    k.drawCircle({
                        pos: k.vec2(screenX, screenY),
                        radius: size,
                        color: k.rgb(200, 220, 255),
                        opacity: opacity,
                    });
                }
            }

            // Draw floating debris from destroyed units (ships, ports, towers)
            for (const debris of gameState.floatingDebris) {
                const pos = hexToPixel(debris.q, debris.r);
                const screenX = (pos.x - effectiveCameraX) * zoom + halfWidth;
                const screenY = (pos.y - effectiveCameraY) * zoom + halfHeight;

                // Skip if off screen
                if (screenX < -100 || screenX > k.width() + 100 ||
                    screenY < -100 || screenY > k.height() + 100) continue;

                const progress = debris.age / debris.duration;
                // Fade out in the last 30% of duration
                const opacity = progress < 0.7 ? 1 : 1 - ((progress - 0.7) / 0.3);

                // Draw dust clouds (for buildings on land)
                if (debris.hasDustClouds && debris.rings) {
                    for (const ring of debris.rings) {
                        const ringProgress = Math.max(0, (debris.age - ring.delay) / 2.0);
                        if (ringProgress > 0 && ringProgress < 1) {
                            const ringRadius = (ring.baseRadius + ringProgress * ring.growthRadius) * zoom;
                            const ringOpacity = (1 - ringProgress) * 0.5;

                            // Dust cloud (filled tan circle)
                            k.drawCircle({
                                pos: k.vec2(screenX, screenY),
                                radius: ringRadius,
                                color: k.rgb(180, 160, 130),  // Dusty tan
                                opacity: ringOpacity * 0.4,
                            });
                        }
                    }
                }

                // Draw water rings (sinking effect for ships)
                if (debris.hasWaterRings && debris.rings) {
                    for (const ring of debris.rings) {
                        const ringProgress = Math.max(0, (debris.age - ring.delay) / 2.0);
                        if (ringProgress > 0 && ringProgress < 1) {
                            const ringRadius = (ring.baseRadius + ringProgress * ring.growthRadius) * zoom;
                            const ringOpacity = (1 - ringProgress) * 0.4;
                            k.drawCircle({
                                pos: k.vec2(screenX, screenY),
                                radius: ringRadius,
                                outline: { color: k.rgb(180, 210, 240), width: 2 * zoom },
                                fill: false,
                                opacity: ringOpacity,
                            });
                        }
                    }
                }

                // Determine debris color based on type
                const debrisColor = debris.debrisType === 'stone'
                    ? k.rgb(120, 115, 110)  // Gray stone
                    : k.rgb(139, 90, 43);   // Brown wood

                // Draw debris pieces
                for (const piece of debris.pieces) {
                    const px = screenX + (piece.offsetX + piece.driftX * progress) * zoom;
                    const py = screenY + (piece.offsetY + piece.driftY * progress) * zoom;
                    const size = piece.size * zoom;

                    k.drawRect({
                        pos: k.vec2(px - size / 2, py - size / 4),
                        width: size,
                        height: size * 0.4,
                        color: debrisColor,
                        opacity: opacity,
                        angle: piece.rotation + progress * 0.3,  // Slow rotation
                    });
                }
            }

            // Draw ships (with smooth interpolated movement)
            for (const ship of gameState.ships) {
                // Hide pirates in fog of war (player ships always visible)
                if (ship.type === 'pirate' && !isHexRevealed(fogState, ship.q, ship.r)) continue;

                const pos = getShipVisualPosLocal(ship);
                const screenX = (pos.x - effectiveCameraX) * zoom + halfWidth;
                const screenY = (pos.y - effectiveCameraY) * zoom + halfHeight;

                // Skip if off screen
                if (screenX < -100 || screenX > k.width() + 100 ||
                    screenY < -100 || screenY > k.height() + 100) continue;

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

            // Draw projectiles (cannon balls) with fiery trails
            for (const proj of gameState.projectiles) {
                // Interpolate position based on progress
                const fromPos = hexToPixel(proj.fromQ, proj.fromR);
                const toPos = hexToPixel(proj.toQ, proj.toR);
                const x = fromPos.x + (toPos.x - fromPos.x) * proj.progress;
                const y = fromPos.y + (toPos.y - fromPos.y) * proj.progress;

                // Add arc: parabola that peaks at midpoint (progress = 0.5)
                // Formula: 4 * p * (1 - p) gives 0 at start, 1 at middle, 0 at end
                const arcHeight = 40; // pixels at peak
                const arcFactor = 4 * proj.progress * (1 - proj.progress);
                const arcOffset = arcHeight * arcFactor;

                // Scale up at peak to simulate coming closer to camera
                const sizeScale = 0.8 + 0.4 * arcFactor;  // 0.8 at edges, 1.2 at peak

                const screenX = (x - effectiveCameraX) * zoom + halfWidth;
                const screenY = (y - effectiveCameraY) * zoom + halfHeight - (arcOffset * zoom);

                // Skip if off screen
                if (screenX < -50 || screenX > k.width() + 50 ||
                    screenY < -50 || screenY > k.height() + 50) continue;

                // Draw fiery trail (multiple particles behind the ball)
                const trailSegments = 5;
                const trailLength = 0.15; // How far back the trail extends (in progress units)

                for (let t = trailSegments; t >= 1; t--) {
                    const trailProgress = proj.progress - (t / trailSegments) * trailLength;
                    if (trailProgress < 0) continue; // Trail hasn't started yet

                    // Calculate trail segment position
                    const trailX = fromPos.x + (toPos.x - fromPos.x) * trailProgress;
                    const trailY = fromPos.y + (toPos.y - fromPos.y) * trailProgress;
                    const trailArcFactor = 4 * trailProgress * (1 - trailProgress);
                    const trailArcOffset = arcHeight * trailArcFactor;

                    const trailScreenX = (trailX - effectiveCameraX) * zoom + halfWidth;
                    const trailScreenY = (trailY - effectiveCameraY) * zoom + halfHeight - (trailArcOffset * zoom);

                    // Trail fades and shrinks toward the back
                    const fadeRatio = 1 - (t / trailSegments);
                    const trailOpacity = 0.7 * fadeRatio;
                    const trailSize = (3 + 2 * fadeRatio) * zoom * sizeScale;

                    // Fiery colors: orange to red gradient
                    const r = 255;
                    const g = Math.floor(100 + 80 * fadeRatio); // Orange to yellow
                    const b = Math.floor(30 * fadeRatio);

                    k.drawCircle({
                        pos: k.vec2(trailScreenX, trailScreenY),
                        radius: trailSize,
                        color: k.rgb(r, g, b),
                        opacity: trailOpacity,
                    });
                }

                // Draw cannon ball (dark circle)
                k.drawCircle({
                    pos: k.vec2(screenX, screenY),
                    radius: 4 * zoom * sizeScale,
                    color: k.rgb(30, 30, 30),
                });
            }

            // Draw water splashes (from missed projectiles)
            for (const splash of gameState.waterSplashes) {
                const pos = hexToPixel(splash.q, splash.r);
                const screenX = (pos.x - effectiveCameraX) * zoom + halfWidth;
                const screenY = (pos.y - effectiveCameraY) * zoom + halfHeight;

                // Skip if off screen
                if (screenX < -50 || screenX > k.width() + 50 ||
                    screenY < -50 || screenY > k.height() + 50) continue;

                const progress = splash.age / splash.duration;
                const radius = (8 + progress * 15) * zoom;
                const opacity = (1 - progress) * 0.6;

                // Expanding ring
                k.drawCircle({
                    pos: k.vec2(screenX, screenY),
                    radius: radius,
                    outline: { color: k.rgb(200, 220, 255), width: 2 * zoom },
                    fill: false,
                    opacity: opacity,
                });

                // Center splash (only in first 30% of animation)
                if (progress < 0.3) {
                    k.drawCircle({
                        pos: k.vec2(screenX, screenY),
                        radius: (5 - progress * 10) * zoom,
                        color: k.rgb(220, 235, 255),
                        opacity: (0.3 - progress) * 2,
                    });
                }
            }

            // Draw ship explosions (constrained to hex bounds)
            for (const explosion of gameState.shipExplosions) {
                const pos = hexToPixel(explosion.q, explosion.r);
                const screenX = (pos.x - effectiveCameraX) * zoom + halfWidth;
                const screenY = (pos.y - effectiveCameraY) * zoom + halfHeight;

                // Skip if off screen
                if (screenX < -100 || screenX > k.width() + 100 ||
                    screenY < -100 || screenY > k.height() + 100) continue;

                const progress = explosion.age / explosion.duration;
                const maxRadius = 22 * zoom;  // Constrained to hex (~HEX_SIZE * 0.7)

                // Multiple expanding fiery particles
                for (let i = 0; i < 10; i++) {
                    const angle = (i / 10) * Math.PI * 2 + progress * 0.5;
                    const dist = progress * maxRadius * (0.6 + (i % 3) * 0.15);
                    const px = screenX + Math.cos(angle) * dist;
                    const py = screenY + Math.sin(angle) * dist;
                    const size = (7 - progress * 4) * zoom;

                    // Fiery colors: orange -> red -> dark
                    const r = 255;
                    const g = Math.floor(200 * (1 - progress));
                    const b = Math.floor(50 * (1 - progress));

                    k.drawCircle({
                        pos: k.vec2(px, py),
                        radius: Math.max(size, 1),
                        color: k.rgb(r, g, b),
                        opacity: 1 - progress,
                    });
                }

                // Center flash
                k.drawCircle({
                    pos: k.vec2(screenX, screenY),
                    radius: (15 - progress * 10) * zoom,
                    color: k.rgb(255, 255, 200),
                    opacity: (1 - progress) * 0.8,
                });
            }

            // Draw health bars for selected units and ships in combat
            const healthBarUnits = new Set(); // Track entities to avoid duplicate health bars

            // Selected units
            for (const sel of gameState.selectedUnits) {
                if (sel.type === 'ship' || sel.type === 'port' || sel.type === 'tower') {
                    healthBarUnits.add(`${sel.type}:${sel.index}`);
                }
            }

            // Pirates in attack mode
            for (const ship of gameState.ships) {
                if (ship.type !== 'pirate' || ship.aiState !== 'attack') continue;

                // Add pirate to set
                const pirateIndex = gameState.ships.indexOf(ship);
                healthBarUnits.add(`ship:${pirateIndex}`);

                // Add target to set
                if (ship.aiTarget && ship.aiTarget.index >= 0) {
                    healthBarUnits.add(`${ship.aiTarget.type}:${ship.aiTarget.index}`);
                }
            }

            // Player ships with attack targets
            for (let i = 0; i < gameState.ships.length; i++) {
                const ship = gameState.ships[i];
                if (ship.type === 'pirate') continue;
                if (!ship.attackTarget) continue;

                healthBarUnits.add(`ship:${i}`);
                if (ship.attackTarget.index >= 0) {
                    healthBarUnits.add(`ship:${ship.attackTarget.index}`);
                }
            }

            // Draw health bars for all units
            for (const key of healthBarUnits) {
                const [type, indexStr] = key.split(':');
                const index = parseInt(indexStr);

                let entity, maxHealth, pos;
                if (type === 'ship') {
                    entity = gameState.ships[index];
                    if (!entity) continue;
                    maxHealth = SHIPS[entity.type].health;
                    pos = getShipVisualPosLocal(entity);
                } else if (type === 'port') {
                    entity = gameState.ports[index];
                    if (!entity) continue;
                    maxHealth = PORTS[entity.type].health;
                    pos = hexToPixel(entity.q, entity.r);
                } else if (type === 'tower') {
                    entity = gameState.towers[index];
                    if (!entity) continue;
                    maxHealth = TOWERS[entity.type].health;
                    pos = hexToPixel(entity.q, entity.r);
                } else {
                    continue;
                }

                const screenX = (pos.x - effectiveCameraX) * zoom + halfWidth;
                const screenY = (pos.y - effectiveCameraY) * zoom + halfHeight;

                // Skip if off screen
                if (screenX < -100 || screenX > k.width() + 100 ||
                    screenY < -100 || screenY > k.height() + 100) continue;

                const barWidth = 40 * zoom;
                const barHeight = 5 * zoom;
                const barY = screenY - 35 * zoom; // Above the entity

                const healthPercent = Math.max(0, entity.health / maxHealth);

                // Background bar (dark)
                k.drawRect({
                    pos: k.vec2(screenX - barWidth / 2, barY),
                    width: barWidth,
                    height: barHeight,
                    color: k.rgb(40, 40, 40),
                    radius: 2,
                });

                // Health fill (red to green gradient based on health)
                const r = Math.floor(255 * (1 - healthPercent));
                const g = Math.floor(180 * healthPercent);
                k.drawRect({
                    pos: k.vec2(screenX - barWidth / 2, barY),
                    width: barWidth * healthPercent,
                    height: barHeight,
                    color: k.rgb(r, g, 40),
                    radius: 2,
                });
            }

            // Draw loading/unloading progress bars for ships
            for (const ship of gameState.ships) {
                if (!ship.dockingState) continue;

                const pos = getShipVisualPosLocal(ship);
                const screenX = (pos.x - effectiveCameraX) * zoom + halfWidth;
                const screenY = (pos.y - effectiveCameraY) * zoom + halfHeight;

                // Skip if off screen
                if (screenX < -100 || screenX > k.width() + 100 ||
                    screenY < -100 || screenY > k.height() + 100) continue;

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

            // Draw birds (world-space, circling home port) - rendered above all units
            for (const bird of birdStates) {
                const centerPos = hexToPixel(bird.q, bird.r);
                const orbitX = Math.cos(bird.angle) * bird.orbitRadius;
                const orbitY = Math.sin(bird.angle) * bird.orbitRadius;
                const birdScreenX = (centerPos.x + orbitX - effectiveCameraX) * zoom + halfWidth;
                const birdScreenY = (centerPos.y + orbitY - 40 - effectiveCameraY) * zoom + halfHeight;

                // Skip if off-screen
                if (birdScreenX > -50 && birdScreenX < k.width() + 50 &&
                    birdScreenY > -50 && birdScreenY < k.height() + 50) {
                    // Rotation: 150 degree offset to align sprite with orbit tangent
                    // Convert to degrees for Kaplay
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

            // Draw selection indicators for all selected units (hex outline)
            for (let i = 0; i < gameState.ships.length; i++) {
                if (!isSelected(gameState, 'ship', i)) continue;
                const ship = gameState.ships[i];
                const isMoving = ship.path && ship.path.length > 0;

                // Calculate screen position (needed for path drawing)
                const pos = hexToPixel(ship.q, ship.r);
                const screenX = (pos.x - effectiveCameraX) * zoom + halfWidth;
                const screenY = (pos.y - effectiveCameraY) * zoom + halfHeight;

                // Only show hex outline when stationary
                if (!isMoving) {
                    const corners = hexCorners(screenX, screenY, scaledSize);
                    const pts = corners.map(c => k.vec2(c.x, c.y));
                    const selectionColor = k.rgb(255, 220, 50);

                    // Draw hex outline
                    for (let j = 0; j < pts.length; j++) {
                        const p1 = pts[j];
                        const p2 = pts[(j + 1) % pts.length];
                        k.drawLine({ p1, p2, width: 3, color: selectionColor });
                    }
                }

                // Draw attack target indicator (red hex outline) or waypoint marker
                if (ship.attackTarget && ship.attackTarget.type === 'ship') {
                    const target = gameState.ships[ship.attackTarget.index];
                    if (target) {
                        const targetIsMoving = target.path && target.path.length > 0;

                        // Only show hex outline when target is stationary
                        if (!targetIsMoving) {
                            const targetPos = hexToPixel(target.q, target.r);
                            const targetScreenX = (targetPos.x - effectiveCameraX) * zoom + halfWidth;
                            const targetScreenY = (targetPos.y - effectiveCameraY) * zoom + halfHeight;

                            // Draw red hex outline around attack target
                            const corners = hexCorners(targetScreenX, targetScreenY, scaledSize);
                            const pts = corners.map(c => k.vec2(c.x, c.y));
                            const attackColor = k.rgb(220, 50, 50);

                            for (let j = 0; j < pts.length; j++) {
                                const p1 = pts[j];
                                const p2 = pts[(j + 1) % pts.length];
                                k.drawLine({ p1, p2, width: 3, color: attackColor });
                            }
                        }
                    }
                } else if (ship.waypoint) {
                    const wpPos = hexToPixel(ship.waypoint.q, ship.waypoint.r);
                    const wpScreenX = (wpPos.x - effectiveCameraX) * zoom + halfWidth;
                    const wpScreenY = (wpPos.y - effectiveCameraY) * zoom + halfHeight;

                    // Draw waypoint marker (X marks the spot!)
                    const wpSize = HEX_SIZE * zoom * 0.3;  // 75% of original 0.4
                    const xWidth = 4 * zoom;
                    const xColor = k.rgb(180, 40, 40);

                    // Rotate 6 degrees clockwise
                    const angle = 6 * Math.PI / 180;
                    const cos = Math.cos(angle);
                    const sin = Math.sin(angle);

                    // Draw chunky X with two crossing lines (rotated)
                    k.drawLine({
                        p1: k.vec2(wpScreenX + (-wpSize * cos - -wpSize * sin), wpScreenY + (-wpSize * sin + -wpSize * cos)),
                        p2: k.vec2(wpScreenX + (wpSize * cos - wpSize * sin), wpScreenY + (wpSize * sin + wpSize * cos)),
                        width: xWidth,
                        color: xColor,
                    });
                    k.drawLine({
                        p1: k.vec2(wpScreenX + (wpSize * cos - -wpSize * sin), wpScreenY + (wpSize * sin + -wpSize * cos)),
                        p2: k.vec2(wpScreenX + (-wpSize * cos - wpSize * sin), wpScreenY + (-wpSize * sin + wpSize * cos)),
                        width: xWidth,
                        color: xColor,
                    });

                    // Draw A* path from ship to waypoint (dashed orange line)
                    if (ship.path && ship.path.length > 0) {
                        let prevX = screenX;
                        let prevY = screenY;
                        const dashLength = 8 * zoom;
                        const gapLength = 6 * zoom;
                        const pathColor = k.rgb(255, 165, 0);

                        for (const node of ship.path) {
                            const nodePos = hexToPixel(node.q, node.r);
                            const nodeScreenX = (nodePos.x - effectiveCameraX) * zoom + halfWidth;
                            const nodeScreenY = (nodePos.y - effectiveCameraY) * zoom + halfHeight;

                            // Calculate segment properties
                            const dx = nodeScreenX - prevX;
                            const dy = nodeScreenY - prevY;
                            const segmentLength = Math.sqrt(dx * dx + dy * dy);
                            const nx = dx / segmentLength;
                            const ny = dy / segmentLength;

                            // Draw dashed line segment
                            let traveled = 0;
                            while (traveled < segmentLength) {
                                const dashStart = traveled;
                                const dashEnd = Math.min(traveled + dashLength, segmentLength);

                                k.drawLine({
                                    p1: k.vec2(prevX + nx * dashStart, prevY + ny * dashStart),
                                    p2: k.vec2(prevX + nx * dashEnd, prevY + ny * dashEnd),
                                    width: 2,
                                    color: pathColor,
                                    opacity: 0.8,
                                });

                                traveled += dashLength + gapLength;
                            }

                            prevX = nodeScreenX;
                            prevY = nodeScreenY;
                        }
                    }
                }
            }

            // Draw selection indicators for selected ports (hex outline)
            for (let i = 0; i < gameState.ports.length; i++) {
                if (!isSelected(gameState, 'port', i)) continue;
                const port = gameState.ports[i];
                const pos = hexToPixel(port.q, port.r);
                const screenX = (pos.x - effectiveCameraX) * zoom + halfWidth;
                const screenY = (pos.y - effectiveCameraY) * zoom + halfHeight;

                const corners = hexCorners(screenX, screenY, scaledSize);
                const pts = corners.map(c => k.vec2(c.x, c.y));
                const selectionColor = k.rgb(255, 220, 50);

                // Draw hex outline
                for (let j = 0; j < pts.length; j++) {
                    const p1 = pts[j];
                    const p2 = pts[(j + 1) % pts.length];
                    k.drawLine({ p1, p2, width: 3, color: selectionColor });
                }
            }

            // Draw selection indicators for selected settlements (hex outline)
            for (let i = 0; i < gameState.settlements.length; i++) {
                if (!isSelected(gameState, 'settlement', i)) continue;
                const settlement = gameState.settlements[i];
                const pos = hexToPixel(settlement.q, settlement.r);
                const screenX = (pos.x - effectiveCameraX) * zoom + halfWidth;
                const screenY = (pos.y - effectiveCameraY) * zoom + halfHeight;

                const corners = hexCorners(screenX, screenY, scaledSize);
                const pts = corners.map(c => k.vec2(c.x, c.y));
                const selectionColor = k.rgb(255, 220, 50);

                // Draw hex outline
                for (let j = 0; j < pts.length; j++) {
                    const p1 = pts[j];
                    const p2 = pts[(j + 1) % pts.length];
                    k.drawLine({ p1, p2, width: 3, color: selectionColor });
                }
            }

            // Draw tower selection hex outlines and attack range
            for (let i = 0; i < gameState.towers.length; i++) {
                if (!isSelected(gameState, 'tower', i)) continue;
                const tower = gameState.towers[i];
                const pos = hexToPixel(tower.q, tower.r);
                const screenX = (pos.x - effectiveCameraX) * zoom + halfWidth;
                const screenY = (pos.y - effectiveCameraY) * zoom + halfHeight;

                const corners = hexCorners(screenX, screenY, scaledSize);
                const pts = corners.map(c => k.vec2(c.x, c.y));
                const selectionColor = k.rgb(255, 220, 50);

                // Draw hex outline
                for (let j = 0; j < pts.length; j++) {
                    const p1 = pts[j];
                    const p2 = pts[(j + 1) % pts.length];
                    k.drawLine({ p1, p2, width: 3, color: selectionColor });
                }

                // Draw attack range for completed towers
                if (!tower.construction) {
                    const attackRange = TOWERS[tower.type].attackRange;
                    const rangeColor = k.rgb(100, 200, 255);  // Match selection box blue
                    drawHexRangeFilled(k, tower.q, tower.r, attackRange, cameraX, cameraY, zoom, halfWidth, halfHeight, rangeColor, 0.2);
                    drawHexRangeOutline(k, tower.q, tower.r, attackRange, cameraX, cameraY, zoom, halfWidth, halfHeight, rangeColor, 2);
                }
            }

            // Draw placement mode highlights (when placing a new port)
            if (gameState.portBuildMode.active) {
                const builderShip = gameState.ships[gameState.portBuildMode.builderShipIndex];
                const MAX_BUILD_DISTANCE = 5;  // Maximum distance from ship to place port

                // Get current mouse position in world coords
                const mouseX = k.mousePos().x;
                const mouseY = k.mousePos().y;
                const worldMX = (mouseX - halfWidth) / zoom + cameraX;
                const worldMY = (mouseY - halfHeight) / zoom + cameraY;
                const hoverHex = pixelToHex(worldMX, worldMY);

                // Check if hovered hex is a valid port site AND within range
                const hoverDistance = hexDistance(builderShip.q, builderShip.r, hoverHex.q, hoverHex.r);
                const isValidHover = isValidPortSite(map, hoverHex.q, hoverHex.r, gameState.ports) &&
                                     hoverDistance <= MAX_BUILD_DISTANCE;
                gameState.portBuildMode.hoveredHex = isValidHover ? hoverHex : null;

                // Draw highlights on all valid port sites within range
                for (const tile of map.tiles.values()) {
                    if (!tile.isPortSite) continue;
                    if (!isHexRevealed(fogState, tile.q, tile.r)) continue;

                    // Check distance from builder ship
                    const dist = hexDistance(builderShip.q, builderShip.r, tile.q, tile.r);
                    if (dist > MAX_BUILD_DISTANCE) continue;

                    // Check if already has a port
                    const hasPort = gameState.ports.some(p => p.q === tile.q && p.r === tile.r);
                    if (hasPort) continue;

                    const pos = tilePositions.get(tile);
                    const screenX = (pos.x - effectiveCameraX) * zoom + halfWidth;
                    const screenY = (pos.y - effectiveCameraY) * zoom + halfHeight;

                    // Culling
                    if (screenX < -margin || screenX > k.width() + margin ||
                        screenY < -margin || screenY > k.height() + margin) continue;

                    const isHovered = gameState.portBuildMode.hoveredHex &&
                                      tile.q === gameState.portBuildMode.hoveredHex.q &&
                                      tile.r === gameState.portBuildMode.hoveredHex.r;

                    const corners = hexCorners(screenX, screenY, scaledSize);
                    const pts = corners.map(c => k.vec2(c.x, c.y));

                    // Highlight color (brighter if hovered)
                    const highlightColor = isHovered
                        ? k.rgb(100, 255, 100)  // Bright green for hovered
                        : k.rgb(80, 180, 80);   // Dimmer green for valid

                    // Draw highlight overlay
                    k.drawPolygon({
                        pts,
                        color: highlightColor,
                        opacity: isHovered ? 0.5 : 0.25,
                    });

                    // Draw outline
                    for (let i = 0; i < pts.length; i++) {
                        const p1 = pts[i];
                        const p2 = pts[(i + 1) % pts.length];
                        k.drawLine({
                            p1, p2,
                            width: isHovered ? 3 : 2,
                            color: highlightColor,
                        });
                    }
                }

                // Draw hint text at bottom
                k.drawText({
                    text: "Click to place port | ESC to cancel",
                    pos: k.vec2(k.width() / 2, k.height() - 60),
                    size: 14,
                    anchor: "center",
                    color: k.rgb(255, 255, 200),
                });
            }

            // Draw settlement placement mode highlights (when placing a new settlement)
            if (gameState.settlementBuildMode.active) {
                const builderPort = gameState.ports[gameState.settlementBuildMode.builderPortIndex];
                const MAX_SETTLEMENT_BUILD_DISTANCE = 10;  // Maximum distance from port to place settlement

                // Get current mouse position in world coords
                const mouseX = k.mousePos().x;
                const mouseY = k.mousePos().y;
                const worldMX = (mouseX - halfWidth) / zoom + cameraX;
                const worldMY = (mouseY - halfHeight) / zoom + cameraY;
                const hoverHex = pixelToHex(worldMX, worldMY);

                // Check if hovered hex is a valid settlement site AND within range
                const hoverDistance = hexDistance(builderPort.q, builderPort.r, hoverHex.q, hoverHex.r);
                const isValidHover = isValidSettlementSite(map, hoverHex.q, hoverHex.r, gameState.settlements, gameState.ports) &&
                                     hoverDistance <= MAX_SETTLEMENT_BUILD_DISTANCE;
                gameState.settlementBuildMode.hoveredHex = isValidHover ? hoverHex : null;

                // Draw highlights on all valid settlement sites (land hexes) within range
                for (const tile of map.tiles.values()) {
                    if (tile.type !== 'land') continue;
                    if (!isHexRevealed(fogState, tile.q, tile.r)) continue;

                    // Check distance from builder port
                    const dist = hexDistance(builderPort.q, builderPort.r, tile.q, tile.r);
                    if (dist > MAX_SETTLEMENT_BUILD_DISTANCE) continue;

                    // Check if already has a settlement or port
                    const hasSettlement = gameState.settlements.some(f => f.q === tile.q && f.r === tile.r);
                    const hasPort = gameState.ports.some(p => p.q === tile.q && p.r === tile.r);
                    if (hasSettlement || hasPort) continue;

                    const pos = tilePositions.get(tile);
                    const screenX = (pos.x - effectiveCameraX) * zoom + halfWidth;
                    const screenY = (pos.y - effectiveCameraY) * zoom + halfHeight;

                    // Culling
                    if (screenX < -margin || screenX > k.width() + margin ||
                        screenY < -margin || screenY > k.height() + margin) continue;

                    const isHovered = gameState.settlementBuildMode.hoveredHex &&
                                      tile.q === gameState.settlementBuildMode.hoveredHex.q &&
                                      tile.r === gameState.settlementBuildMode.hoveredHex.r;

                    const corners = hexCorners(screenX, screenY, scaledSize);
                    const pts = corners.map(c => k.vec2(c.x, c.y));

                    // Highlight color (brighter if hovered)
                    const highlightColor = isHovered
                        ? k.rgb(100, 255, 100)  // Bright green for hovered
                        : k.rgb(80, 180, 80);   // Dimmer green for valid

                    // Draw highlight overlay
                    k.drawPolygon({
                        pts,
                        color: highlightColor,
                        opacity: isHovered ? 0.5 : 0.25,
                    });

                    // Draw outline
                    for (let i = 0; i < pts.length; i++) {
                        const p1 = pts[i];
                        const p2 = pts[(i + 1) % pts.length];
                        k.drawLine({
                            p1, p2,
                            width: isHovered ? 3 : 2,
                            color: highlightColor,
                        });
                    }
                }

                // Draw hint text at bottom
                k.drawText({
                    text: "Click to place settlement | ESC to cancel",
                    pos: k.vec2(k.width() / 2, k.height() - 60),
                    size: 14,
                    anchor: "center",
                    color: k.rgb(255, 255, 200),
                });
            }

            // Draw tower placement mode highlights (when placing a new tower from ship or port)
            if (gameState.towerBuildMode.active) {
                // Get builder position (ship or port)
                let builderQ, builderR;
                if (gameState.towerBuildMode.builderShipIndex !== null) {
                    const builderShip = gameState.ships[gameState.towerBuildMode.builderShipIndex];
                    builderQ = builderShip.q;
                    builderR = builderShip.r;
                } else if (gameState.towerBuildMode.builderPortIndex !== null) {
                    const builderPort = gameState.ports[gameState.towerBuildMode.builderPortIndex];
                    builderQ = builderPort.q;
                    builderR = builderPort.r;
                }
                const MAX_TOWER_BUILD_DISTANCE = 5;  // Maximum distance from builder to place tower

                // Get current mouse position in world coords
                const mouseX = k.mousePos().x;
                const mouseY = k.mousePos().y;
                const worldMX = (mouseX - halfWidth) / zoom + cameraX;
                const worldMY = (mouseY - halfHeight) / zoom + cameraY;
                const hoverHex = pixelToHex(worldMX, worldMY);

                // Check if hovered hex is a valid tower site AND within range
                const hoverDistance = hexDistance(builderQ, builderR, hoverHex.q, hoverHex.r);
                const isValidHover = isValidTowerSite(map, hoverHex.q, hoverHex.r, gameState.towers, gameState.ports, gameState.settlements) &&
                                     hoverDistance <= MAX_TOWER_BUILD_DISTANCE;
                gameState.towerBuildMode.hoveredHex = isValidHover ? hoverHex : null;

                // Draw highlights on all valid tower sites (land hexes) within range
                for (const tile of map.tiles.values()) {
                    if (tile.type !== 'land') continue;
                    if (!isHexRevealed(fogState, tile.q, tile.r)) continue;

                    // Check distance from builder
                    const dist = hexDistance(builderQ, builderR, tile.q, tile.r);
                    if (dist > MAX_TOWER_BUILD_DISTANCE) continue;

                    // Check if already has a tower, settlement or port
                    const hasTower = gameState.towers.some(t => t.q === tile.q && t.r === tile.r);
                    const hasSettlement = gameState.settlements.some(s => s.q === tile.q && s.r === tile.r);
                    const hasPort = gameState.ports.some(p => p.q === tile.q && p.r === tile.r);
                    if (hasTower || hasSettlement || hasPort) continue;

                    const pos = tilePositions.get(tile);
                    const screenX = (pos.x - effectiveCameraX) * zoom + halfWidth;
                    const screenY = (pos.y - effectiveCameraY) * zoom + halfHeight;

                    // Culling
                    if (screenX < -margin || screenX > k.width() + margin ||
                        screenY < -margin || screenY > k.height() + margin) continue;

                    const isHovered = gameState.towerBuildMode.hoveredHex &&
                                      tile.q === gameState.towerBuildMode.hoveredHex.q &&
                                      tile.r === gameState.towerBuildMode.hoveredHex.r;

                    const corners = hexCorners(screenX, screenY, scaledSize);
                    const pts = corners.map(c => k.vec2(c.x, c.y));

                    // Highlight color (brighter if hovered)
                    const highlightColor = isHovered
                        ? k.rgb(100, 255, 100)  // Bright green for hovered
                        : k.rgb(80, 180, 80);   // Dimmer green for valid

                    // Draw highlight overlay
                    k.drawPolygon({
                        pts,
                        color: highlightColor,
                        opacity: isHovered ? 0.5 : 0.25,
                    });

                    // Draw outline
                    for (let i = 0; i < pts.length; i++) {
                        const p1 = pts[i];
                        const p2 = pts[(i + 1) % pts.length];
                        k.drawLine({
                            p1, p2,
                            width: isHovered ? 3 : 2,
                            color: highlightColor,
                        });
                    }
                }

                // Draw attack range preview when hovering a valid placement hex
                if (gameState.towerBuildMode.hoveredHex) {
                    const hoverQ = gameState.towerBuildMode.hoveredHex.q;
                    const hoverR = gameState.towerBuildMode.hoveredHex.r;
                    const attackRange = TOWERS.tower.attackRange;
                    const rangeColor = k.rgb(100, 200, 255);  // Match selection box blue
                    drawHexRangeFilled(k, hoverQ, hoverR, attackRange, cameraX, cameraY, zoom, halfWidth, halfHeight, rangeColor, 0.2);
                    drawHexRangeOutline(k, hoverQ, hoverR, attackRange, cameraX, cameraY, zoom, halfWidth, halfHeight, rangeColor, 2);
                }

                // Draw hint text at bottom
                k.drawText({
                    text: "Click to place tower | ESC to cancel",
                    pos: k.vec2(k.width() / 2, k.height() - 60),
                    size: 14,
                    anchor: "center",
                    color: k.rgb(255, 255, 200),
                });
            }

            // Draw selection box if selecting
            if (isSelecting) {
                const boxX = Math.min(selectStartX, selectEndX);
                const boxY = Math.min(selectStartY, selectEndY);
                const boxW = Math.abs(selectEndX - selectStartX);
                const boxH = Math.abs(selectEndY - selectStartY);
                k.drawRect({
                    pos: k.vec2(boxX, boxY),
                    width: boxW,
                    height: boxH,
                    color: k.rgb(100, 200, 255),
                    opacity: 0.2,
                });
                k.drawRect({
                    pos: k.vec2(boxX, boxY),
                    width: boxW,
                    height: boxH,
                    fill: false,
                    outline: { width: 2, color: k.rgb(100, 200, 255) },
                });
            }

            // UI overlay - Resource panel (top right)
            const panelWidth = 280;
            const panelHeight = 70;
            const panelX = k.width() - panelWidth - 15;
            const panelY = 15;

            // Panel background
            k.drawRect({
                pos: k.vec2(panelX, panelY),
                width: panelWidth,
                height: panelHeight,
                color: k.rgb(20, 30, 40),
                radius: 6,
                opacity: 0.9,
            });

            // Panel title
            k.drawText({
                text: "STOCKPILE",
                pos: k.vec2(panelX + panelWidth / 2, panelY + 12),
                size: 12,
                anchor: "center",
                color: k.rgb(150, 150, 150),
            });

            // Resource values
            const res = gameState.resources;
            const resY = panelY + 38;
            const resSpacing = 68;

            // Wood (brown)
            k.drawText({
                text: `Wood`,
                pos: k.vec2(panelX + 15, resY - 10),
                size: 10,
                color: k.rgb(139, 90, 43),
            });
            k.drawText({
                text: `${res.wood}`,
                pos: k.vec2(panelX + 15, resY + 6),
                size: 18,
                color: k.rgb(200, 150, 100),
            });


            // Food (green)
            k.drawText({
                text: `Food`,
                pos: k.vec2(panelX + 15 + resSpacing * 2, resY - 10),
                size: 10,
                color: k.rgb(80, 140, 80),
            });
            k.drawText({
                text: `${res.food}`,
                pos: k.vec2(panelX + 15 + resSpacing * 2, resY + 6),
                size: 18,
                color: k.rgb(120, 200, 120),
            });

            // Game title (top left)
            k.drawText({
                text: "Grog",
                pos: k.vec2(20, 20),
                size: 28,
                color: k.rgb(255, 255, 255),
            });

            // Controls hint
            k.drawText({
                text: "Drag: Select | Shift+click: Add to selection | Click: Set waypoint (when ships selected)",
                pos: k.vec2(20, 52),
                size: 12,
                color: k.rgb(120, 120, 120),
            });

            // Time scale indicator (bottom left)
            const timeLabel = gameState.timeScale === 0 ? "PAUSED" : `${gameState.timeScale}x`;
            const timeColor = gameState.timeScale === 0
                ? k.rgb(255, 100, 100)
                : k.rgb(150, 200, 150);
            k.drawText({
                text: timeLabel,
                pos: k.vec2(20, k.height() - 25),
                size: 18,
                color: timeColor,
            });

            // Build panel UI (when exactly one port is selected and not under construction)
            const selectedPortIndices = gameState.selectedUnits.filter(u => u.type === 'port');
            buildPanelBounds = null;  // Reset each frame

            if (selectedPortIndices.length === 1) {
                const portIndex = selectedPortIndices[0].index;
                const port = gameState.ports[portIndex];

                // Skip build panel for ports still under construction or upgrading
                if (port.construction) {
                    // Show construction/upgrade status
                    const conProgress = Math.min(port.construction.progress / port.construction.buildTime, 1);
                    const conPercent = Math.floor(conProgress * 100);
                    const isUpgrading = !!port.construction.upgradeTo;

                    const cpWidth = 160;
                    const cpHeight = isUpgrading ? 85 : 70;
                    const cpX = 15;
                    const cpY = k.height() - 50 - cpHeight;

                    k.drawRect({
                        pos: k.vec2(cpX, cpY),
                        width: cpWidth,
                        height: cpHeight,
                        color: k.rgb(20, 30, 40),
                        radius: 6,
                        opacity: 0.9,
                    });

                    if (isUpgrading) {
                        // Show upgrading status
                        const targetPortData = PORTS[port.construction.upgradeTo];

                        k.drawText({
                            text: "UPGRADING",
                            pos: k.vec2(cpX + cpWidth / 2, cpY + 16),
                            size: 10,
                            anchor: "center",
                            color: k.rgb(150, 150, 150),
                        });

                        k.drawText({
                            text: `→ ${targetPortData.name}`,
                            pos: k.vec2(cpX + cpWidth / 2, cpY + 38),
                            size: 14,
                            anchor: "center",
                            color: k.rgb(100, 200, 150),
                        });

                        k.drawText({
                            text: `${conPercent}%`,
                            pos: k.vec2(cpX + cpWidth / 2, cpY + 62),
                            size: 18,
                            anchor: "center",
                            color: k.rgb(100, 200, 150),
                        });
                    } else {
                        // Show new construction status
                        k.drawText({
                            text: "UNDER CONSTRUCTION",
                            pos: k.vec2(cpX + cpWidth / 2, cpY + 20),
                            size: 10,
                            anchor: "center",
                            color: k.rgb(150, 150, 150),
                        });

                        k.drawText({
                            text: `${conPercent}%`,
                            pos: k.vec2(cpX + cpWidth / 2, cpY + 45),
                            size: 18,
                            anchor: "center",
                            color: k.rgb(80, 180, 220),
                        });
                    }
                } else {
                    // Port is complete - show ship build panel with upgrade option
                    const buildableShips = getBuildableShips(port);
                    const nextPortType = getNextPortType(port.type);
                    const isBuildingSettlement = isPortBuildingSettlement(portIndex, gameState.settlements);
                    const portBusy = port.buildQueue || isBuildingSettlement;  // Port can only build one thing at a time
                    const canUpgrade = nextPortType && !portBusy;
                    const canBuildSettlement = !portBusy && !gameState.settlementBuildMode.active;
                    const canBuildTower = !gameState.towerBuildMode.active;

                    // Check if port has stored resources (non-home ports)
                    const hasStorage = portIndex > 0 && port.storage && (port.storage.wood > 0 || port.storage.food > 0);
                    const storageHeight = hasStorage ? 45 : 0;

                    const bpWidth = 200;
                    const bpRowHeight = 44;
                    const bpPadding = 8;
                    const bpHeaderHeight = 20;
                    const upgradeHeight = canUpgrade ? (bpHeaderHeight + bpRowHeight) : 0;
                    const settlementHeight = canBuildSettlement ? (bpHeaderHeight + bpRowHeight) : 0;
                    const towerHeight = canBuildTower ? (bpHeaderHeight + bpRowHeight) : 0;
                    const bpHeight = storageHeight + bpHeaderHeight + bpPadding + buildableShips.length * bpRowHeight + bpPadding + upgradeHeight + settlementHeight + towerHeight;
                    const bpX = 15;
                    const bpY = k.height() - 50 - bpHeight;

                    // Store bounds for click detection
                    buildPanelBounds = {
                        x: bpX,
                        y: bpY,
                        width: bpWidth,
                        height: bpHeight,
                        buttons: [],
                        upgradeButton: null,
                        settlementButton: null,
                        towerButton: null,
                        portIndex: portIndex,
                    };

                    // Panel background
                    k.drawRect({
                        pos: k.vec2(bpX, bpY),
                        width: bpWidth,
                        height: bpHeight,
                        color: k.rgb(20, 30, 40),
                        radius: 6,
                        opacity: 0.9,
                    });

                    // Show stored resources for non-home ports
                    if (hasStorage) {
                        k.drawText({
                            text: "STORED",
                            pos: k.vec2(bpX + bpWidth / 2, bpY + 12),
                            size: 10,
                            anchor: "center",
                            color: k.rgb(150, 150, 150),
                        });
                        // Wood
                        k.drawText({
                            text: `${port.storage.wood}`,
                            pos: k.vec2(bpX + bpWidth / 4, bpY + 32),
                            size: 16,
                            anchor: "center",
                            color: k.rgb(180, 120, 60),
                        });
                        k.drawText({
                            text: "wood",
                            pos: k.vec2(bpX + bpWidth / 4, bpY + 46),
                            size: 9,
                            anchor: "center",
                            color: k.rgb(120, 80, 40),
                        });
                        // Food
                        k.drawText({
                            text: `${port.storage.food}`,
                            pos: k.vec2(bpX + bpWidth * 3 / 4, bpY + 32),
                            size: 16,
                            anchor: "center",
                            color: k.rgb(80, 180, 80),
                        });
                        k.drawText({
                            text: "food",
                            pos: k.vec2(bpX + bpWidth * 3 / 4, bpY + 46),
                            size: 9,
                            anchor: "center",
                            color: k.rgb(50, 120, 50),
                        });
                        // Separator line
                        k.drawLine({
                            p1: k.vec2(bpX + 8, bpY + storageHeight - 4),
                            p2: k.vec2(bpX + bpWidth - 8, bpY + storageHeight - 4),
                            width: 1,
                            color: k.rgb(60, 70, 80),
                        });
                    }

                    const mousePos = k.mousePos();

                    // Check if currently building a ship
                    if (port.buildQueue) {
                        // Show building status
                        const progress = Math.min(port.buildQueue.progress / port.buildQueue.buildTime, 1);
                        const percent = Math.floor(progress * 100);
                        const shipName = SHIPS[port.buildQueue.shipType].name;

                        k.drawText({
                            text: "BUILDING",
                            pos: k.vec2(bpX + bpWidth / 2, bpY + storageHeight + 14),
                            size: 11,
                            anchor: "center",
                            color: k.rgb(150, 150, 150),
                        });

                        k.drawText({
                            text: `${shipName}`,
                            pos: k.vec2(bpX + bpWidth / 2, bpY + storageHeight + bpHeaderHeight + bpPadding + 10),
                            size: 14,
                            anchor: "center",
                            color: k.rgb(220, 180, 80),
                        });

                        k.drawText({
                            text: `${percent}%`,
                            pos: k.vec2(bpX + bpWidth / 2, bpY + storageHeight + bpHeaderHeight + bpPadding + 32),
                            size: 18,
                            anchor: "center",
                            color: k.rgb(255, 255, 255),
                        });
                    } else {
                        // Show build options
                        k.drawText({
                            text: "BUILD SHIP",
                            pos: k.vec2(bpX + bpWidth / 2, bpY + storageHeight + 14),
                            size: 11,
                            anchor: "center",
                            color: k.rgb(150, 150, 150),
                        });

                        for (let i = 0; i < buildableShips.length; i++) {
                            const shipType = buildableShips[i];
                            const shipData = SHIPS[shipType];
                            const btnY = bpY + storageHeight + bpHeaderHeight + bpPadding + i * bpRowHeight;
                            const btnHeight = bpRowHeight - 4;
                            const affordable = canAfford(gameState.resources, shipData.cost);
                            const canBuildShip = affordable && !portBusy;

                            // Store button bounds
                            buildPanelBounds.buttons.push({
                                y: btnY,
                                height: btnHeight,
                                shipType: shipType,
                            });

                            // Check if mouse is hovering
                            const isHovered = canBuildShip && mousePos.x >= bpX && mousePos.x <= bpX + bpWidth &&
                                              mousePos.y >= btnY && mousePos.y <= btnY + btnHeight;

                            // Button background (highlight on hover, only if can build)
                            if (isHovered) {
                                k.drawRect({
                                    pos: k.vec2(bpX + 4, btnY),
                                    width: bpWidth - 8,
                                    height: btnHeight,
                                    color: k.rgb(60, 80, 100),
                                    radius: 4,
                                });
                            }

                            // Draw sprite thumbnail
                            const thumbScale = 1.2;
                            const spriteSize = getSpriteSize(shipData.sprite, thumbScale);
                            const spriteX = bpX + 10;
                            const spriteY = btnY + (btnHeight - spriteSize.height) / 2;
                            drawSprite(k, shipData.sprite, spriteX, spriteY, thumbScale, canBuildShip ? 1.0 : 0.4);

                            // Ship name (greyed out if can't build)
                            k.drawText({
                                text: shipData.name,
                                pos: k.vec2(bpX + 44, btnY + 10),
                                size: 13,
                                anchor: "left",
                                color: !canBuildShip ? k.rgb(80, 80, 80) : isHovered ? k.rgb(255, 255, 255) : k.rgb(200, 200, 200),
                            });

                            // Cost (wood and food on separate line)
                            const woodCost = shipData.cost.wood || 0;
                            const foodCost = shipData.cost.food || 0;
                            const costText = `${woodCost} wood, ${foodCost} food`;
                            k.drawText({
                                text: costText,
                                pos: k.vec2(bpX + 44, btnY + 26),
                                size: 10,
                                anchor: "left",
                                color: !canBuildShip ? k.rgb(100, 60, 60) : k.rgb(120, 120, 120),
                            });

                            // Build time (right side)
                            k.drawText({
                                text: `${shipData.build_time}s`,
                                pos: k.vec2(bpX + bpWidth - 12, btnY + btnHeight / 2),
                                size: 11,
                                anchor: "right",
                                color: !canBuildShip ? k.rgb(80, 80, 80) : k.rgb(150, 150, 150),
                            });
                        }

                        // Show upgrade option if available
                        if (canUpgrade) {
                            const upgradeY = bpY + storageHeight + bpHeaderHeight + bpPadding + buildableShips.length * bpRowHeight + bpPadding;

                            // Separator line
                            k.drawLine({
                                p1: k.vec2(bpX + 8, upgradeY - 4),
                                p2: k.vec2(bpX + bpWidth - 8, upgradeY - 4),
                                width: 1,
                                color: k.rgb(60, 70, 80),
                            });

                            // Upgrade header
                            k.drawText({
                                text: "UPGRADE",
                                pos: k.vec2(bpX + bpWidth / 2, upgradeY + 8),
                                size: 10,
                                anchor: "center",
                                color: k.rgb(150, 150, 150),
                            });

                            // Upgrade button
                            const upgradeBtnY = upgradeY + bpHeaderHeight;
                            const upgradeBtnHeight = bpRowHeight - 4;
                            const nextPortData = PORTS[nextPortType];
                            const upgradeAffordable = canAfford(gameState.resources, nextPortData.cost);

                            // Store upgrade button bounds
                            buildPanelBounds.upgradeButton = {
                                y: upgradeBtnY,
                                height: upgradeBtnHeight,
                                portType: nextPortType,
                            };

                            // Check if mouse is hovering (only if affordable)
                            const isUpgradeHovered = upgradeAffordable && mousePos.x >= bpX && mousePos.x <= bpX + bpWidth &&
                                                     mousePos.y >= upgradeBtnY && mousePos.y <= upgradeBtnY + upgradeBtnHeight;

                            // Button background
                            if (isUpgradeHovered) {
                                k.drawRect({
                                    pos: k.vec2(bpX + 4, upgradeBtnY),
                                    width: bpWidth - 8,
                                    height: upgradeBtnHeight,
                                    color: k.rgb(60, 80, 100),
                                    radius: 4,
                                });
                            }

                            // Draw sprite thumbnail
                            const upgradeThumbScale = 1.2;
                            const upgradeSpriteSize = getSpriteSize(nextPortData.sprite, upgradeThumbScale);
                            const upgradeSpriteX = bpX + 10;
                            const upgradeSpriteY = upgradeBtnY + (upgradeBtnHeight - upgradeSpriteSize.height) / 2;
                            drawSprite(k, nextPortData.sprite, upgradeSpriteX, upgradeSpriteY, upgradeThumbScale, upgradeAffordable ? 1.0 : 0.4);

                            // Port name (greyed out if can't afford)
                            k.drawText({
                                text: nextPortData.name,
                                pos: k.vec2(bpX + 44, upgradeBtnY + 10),
                                size: 13,
                                anchor: "left",
                                color: !upgradeAffordable ? k.rgb(80, 80, 80) : isUpgradeHovered ? k.rgb(255, 255, 255) : k.rgb(200, 200, 200),
                            });

                            // Cost
                            k.drawText({
                                text: `${nextPortData.cost.wood} wood`,
                                pos: k.vec2(bpX + 44, upgradeBtnY + 26),
                                size: 10,
                                anchor: "left",
                                color: !upgradeAffordable ? k.rgb(100, 60, 60) : k.rgb(120, 120, 120),
                            });

                            // Build time (right side)
                            k.drawText({
                                text: `${nextPortData.buildTime}s`,
                                pos: k.vec2(bpX + bpWidth - 12, upgradeBtnY + upgradeBtnHeight / 2),
                                size: 11,
                                anchor: "right",
                                color: !upgradeAffordable ? k.rgb(80, 80, 80) : k.rgb(150, 150, 150),
                            });
                        }

                        // Show build settlement option
                        if (canBuildSettlement) {
                            const settlementY = bpY + storageHeight + bpHeaderHeight + bpPadding + buildableShips.length * bpRowHeight + bpPadding + upgradeHeight;

                            // Separator line
                            k.drawLine({
                                p1: k.vec2(bpX + 8, settlementY - 4),
                                p2: k.vec2(bpX + bpWidth - 8, settlementY - 4),
                                width: 1,
                                color: k.rgb(60, 70, 80),
                            });

                            // Build Settlement header
                            k.drawText({
                                text: "BUILD SETTLEMENT",
                                pos: k.vec2(bpX + bpWidth / 2, settlementY + 10),
                                size: 11,
                                anchor: "center",
                                color: k.rgb(150, 150, 150),
                            });

                            // Settlement button
                            const settlementBtnY = settlementY + bpHeaderHeight;
                            const settlementBtnHeight = bpRowHeight - 4;
                            const settlementData = SETTLEMENTS.settlement;
                            const alreadyBuildingSettlement = isPortBuildingSettlement(portIndex, gameState.settlements);

                            // Store settlement button bounds
                            buildPanelBounds.settlementButton = {
                                y: settlementBtnY,
                                height: settlementBtnHeight,
                            };

                            // Check if mouse is hovering (only if not already building)
                            const isSettlementHovered = !alreadyBuildingSettlement &&
                                                  mousePos.x >= bpX && mousePos.x <= bpX + bpWidth &&
                                                  mousePos.y >= settlementBtnY && mousePos.y <= settlementBtnY + settlementBtnHeight;

                            // Button background
                            if (isSettlementHovered) {
                                k.drawRect({
                                    pos: k.vec2(bpX + 4, settlementBtnY),
                                    width: bpWidth - 8,
                                    height: settlementBtnHeight,
                                    color: k.rgb(60, 80, 100),
                                    radius: 4,
                                });
                            }

                            // Draw sprite thumbnail
                            const settlementThumbScale = 1.2;
                            const settlementSpriteSize = getSpriteSize(settlementData.sprite, settlementThumbScale);
                            const settlementSpriteX = bpX + 10;
                            const settlementSpriteY = settlementBtnY + (settlementBtnHeight - settlementSpriteSize.height) / 2;
                            drawSprite(k, settlementData.sprite, settlementSpriteX, settlementSpriteY, settlementThumbScale, alreadyBuildingSettlement ? 0.4 : 1.0);

                            // Settlement name (greyed out if already building)
                            k.drawText({
                                text: alreadyBuildingSettlement ? `${settlementData.name} (building...)` : `${settlementData.name} (S)`,
                                pos: k.vec2(bpX + 44, settlementBtnY + 10),
                                size: 13,
                                anchor: "left",
                                color: alreadyBuildingSettlement ? k.rgb(80, 80, 80) : isSettlementHovered ? k.rgb(255, 255, 255) : k.rgb(200, 200, 200),
                            });

                            // Description (no cost for settlements)
                            k.drawText({
                                text: "Free",
                                pos: k.vec2(bpX + 44, settlementBtnY + 26),
                                size: 10,
                                anchor: "left",
                                color: alreadyBuildingSettlement ? k.rgb(80, 80, 80) : k.rgb(120, 120, 120),
                            });

                            // Build time (right side)
                            k.drawText({
                                text: `${settlementData.buildTime}s`,
                                pos: k.vec2(bpX + bpWidth - 12, settlementBtnY + settlementBtnHeight / 2),
                                size: 11,
                                anchor: "right",
                                color: alreadyBuildingSettlement ? k.rgb(80, 80, 80) : k.rgb(150, 150, 150),
                            });
                        }

                        // Show build tower option
                        if (canBuildTower) {
                            const towerY = bpY + storageHeight + bpHeaderHeight + bpPadding + buildableShips.length * bpRowHeight + bpPadding + upgradeHeight + settlementHeight;

                            // Separator line
                            k.drawLine({
                                p1: k.vec2(bpX + 8, towerY - 4),
                                p2: k.vec2(bpX + bpWidth - 8, towerY - 4),
                                width: 1,
                                color: k.rgb(60, 70, 80),
                            });

                            // Build Defense header
                            k.drawText({
                                text: "BUILD DEFENSE",
                                pos: k.vec2(bpX + bpWidth / 2, towerY + 10),
                                size: 11,
                                anchor: "center",
                                color: k.rgb(150, 150, 150),
                            });

                            // Tower button
                            const towerBtnY = towerY + bpHeaderHeight;
                            const towerBtnHeight = bpRowHeight - 4;
                            const towerData = TOWERS.tower;
                            const towerAffordable = canAfford(gameState.resources, towerData.cost);

                            // Store tower button bounds
                            buildPanelBounds.towerButton = {
                                y: towerBtnY,
                                height: towerBtnHeight,
                            };

                            // Check if mouse is hovering
                            const isTowerHovered = towerAffordable &&
                                mousePos.x >= bpX && mousePos.x <= bpX + bpWidth &&
                                mousePos.y >= towerBtnY && mousePos.y <= towerBtnY + towerBtnHeight;

                            // Button background
                            if (isTowerHovered) {
                                k.drawRect({
                                    pos: k.vec2(bpX + 4, towerBtnY),
                                    width: bpWidth - 8,
                                    height: towerBtnHeight,
                                    color: k.rgb(60, 80, 100),
                                    radius: 4,
                                });
                            }

                            // Draw sprite thumbnail
                            const towerThumbScale = 1.2;
                            const towerSpriteSize = getSpriteSize(towerData.sprite, towerThumbScale);
                            const towerSpriteX = bpX + 10;
                            const towerSpriteY = towerBtnY + (towerBtnHeight - towerSpriteSize.height) / 2;
                            drawSprite(k, towerData.sprite, towerSpriteX, towerSpriteY, towerThumbScale, towerAffordable ? 1.0 : 0.4);

                            // Tower name with hotkey
                            k.drawText({
                                text: `${towerData.name} (T)`,
                                pos: k.vec2(bpX + 44, towerBtnY + 10),
                                size: 13,
                                anchor: "left",
                                color: !towerAffordable ? k.rgb(80, 80, 80) : isTowerHovered ? k.rgb(255, 255, 255) : k.rgb(200, 200, 200),
                            });

                            // Cost
                            const towerCostText = Object.entries(towerData.cost).map(([r, a]) => `${a} ${r}`).join(', ');
                            k.drawText({
                                text: towerCostText,
                                pos: k.vec2(bpX + 44, towerBtnY + 26),
                                size: 10,
                                anchor: "left",
                                color: !towerAffordable ? k.rgb(150, 80, 80) : k.rgb(120, 120, 120),
                            });

                            // Build time (right side)
                            k.drawText({
                                text: `${towerData.buildTime}s`,
                                pos: k.vec2(bpX + bpWidth - 12, towerBtnY + towerBtnHeight / 2),
                                size: 11,
                                anchor: "right",
                                color: !towerAffordable ? k.rgb(80, 80, 80) : k.rgb(150, 150, 150),
                            });
                        }
                    }
                }
            }

            // Ship build panel UI (when exactly one docked ship is selected, not in placement mode)
            const selectedShipIndices = gameState.selectedUnits.filter(u => u.type === 'ship');
            shipBuildPanelBounds = null;  // Reset each frame

            if (selectedShipIndices.length === 1 && !gameState.portBuildMode.active && !gameState.towerBuildMode.active) {
                const shipIndex = selectedShipIndices[0].index;
                const ship = gameState.ships[shipIndex];

                // Don't show build panel if ship is already building a port or tower
                if (isShipDocked(ship) && !isShipBuildingPort(shipIndex, gameState.ports) && !isShipBuildingTower(shipIndex, gameState.towers)) {
                    // Only show Dock for now (first port type in tech tree)
                    const buildablePortTypes = ['dock'];
                    const towerData = TOWERS.tower;

                    const sbpWidth = 200;
                    const sbpRowHeight = 44;
                    const sbpPadding = 8;
                    const sbpHeaderHeight = 20;
                    // Add height for tower button with section divider
                    const towerSectionHeight = sbpHeaderHeight + sbpRowHeight;
                    const sbpHeight = sbpHeaderHeight + sbpPadding + buildablePortTypes.length * sbpRowHeight + sbpPadding + towerSectionHeight;
                    const sbpX = 15;
                    const sbpY = k.height() - 50 - sbpHeight;

                    // Store bounds for click detection
                    shipBuildPanelBounds = {
                        x: sbpX,
                        y: sbpY,
                        width: sbpWidth,
                        height: sbpHeight,
                        buttons: [],
                        shipIndex: shipIndex,
                    };

                    // Panel background
                    k.drawRect({
                        pos: k.vec2(sbpX, sbpY),
                        width: sbpWidth,
                        height: sbpHeight,
                        color: k.rgb(20, 30, 40),
                        radius: 6,
                        opacity: 0.9,
                    });

                    // Panel title
                    k.drawText({
                        text: "BUILD PORT",
                        pos: k.vec2(sbpX + sbpWidth / 2, sbpY + 14),
                        size: 11,
                        anchor: "center",
                        color: k.rgb(150, 150, 150),
                    });

                    const mousePos = k.mousePos();

                    for (let i = 0; i < buildablePortTypes.length; i++) {
                        const portType = buildablePortTypes[i];
                        const portData = PORTS[portType];
                        const btnY = sbpY + sbpHeaderHeight + sbpPadding + i * sbpRowHeight;
                        const btnHeight = sbpRowHeight - 4;
                        const portAffordable = canAfford(gameState.resources, portData.cost);

                        // Store button bounds
                        shipBuildPanelBounds.buttons.push({
                            y: btnY,
                            height: btnHeight,
                            portType: portType,
                        });

                        // Check if mouse is hovering (only if affordable)
                        const isHovered = portAffordable && mousePos.x >= sbpX && mousePos.x <= sbpX + sbpWidth &&
                                          mousePos.y >= btnY && mousePos.y <= btnY + btnHeight;

                        // Button background (highlight on hover)
                        if (isHovered) {
                            k.drawRect({
                                pos: k.vec2(sbpX + 4, btnY),
                                width: sbpWidth - 8,
                                height: btnHeight,
                                color: k.rgb(60, 80, 100),
                                radius: 4,
                            });
                        }

                        // Draw sprite thumbnail
                        const portThumbScale = 1.2;
                        const portSpriteSize = getSpriteSize(portData.sprite, portThumbScale);
                        const portSpriteX = sbpX + 10;
                        const portSpriteY = btnY + (btnHeight - portSpriteSize.height) / 2;
                        drawSprite(k, portData.sprite, portSpriteX, portSpriteY, portThumbScale, portAffordable ? 1.0 : 0.4);

                        // Port name (greyed out if can't afford)
                        k.drawText({
                            text: portData.name,
                            pos: k.vec2(sbpX + 44, btnY + 10),
                            size: 13,
                            anchor: "left",
                            color: !portAffordable ? k.rgb(80, 80, 80) : isHovered ? k.rgb(255, 255, 255) : k.rgb(200, 200, 200),
                        });

                        // Cost
                        k.drawText({
                            text: `${portData.cost.wood} wood`,
                            pos: k.vec2(sbpX + 44, btnY + 26),
                            size: 10,
                            anchor: "left",
                            color: !portAffordable ? k.rgb(100, 60, 60) : k.rgb(120, 120, 120),
                        });

                        // Build time (right side)
                        k.drawText({
                            text: `${portData.buildTime}s`,
                            pos: k.vec2(sbpX + sbpWidth - 12, btnY + btnHeight / 2),
                            size: 11,
                            anchor: "right",
                            color: !portAffordable ? k.rgb(80, 80, 80) : k.rgb(150, 150, 150),
                        });
                    }

                    // Tower section divider and header
                    const towerSectionY = sbpY + sbpHeaderHeight + sbpPadding + buildablePortTypes.length * sbpRowHeight + sbpPadding;

                    // Divider line
                    k.drawLine({
                        p1: k.vec2(sbpX + 8, towerSectionY - 4),
                        p2: k.vec2(sbpX + sbpWidth - 8, towerSectionY - 4),
                        width: 1,
                        color: k.rgb(60, 70, 80),
                    });

                    // Tower header
                    k.drawText({
                        text: "BUILD DEFENSE",
                        pos: k.vec2(sbpX + sbpWidth / 2, towerSectionY + 10),
                        size: 11,
                        anchor: "center",
                        color: k.rgb(150, 150, 150),
                    });

                    // Tower button
                    const towerBtnY = towerSectionY + sbpHeaderHeight;
                    const towerBtnHeight = sbpRowHeight - 4;
                    const towerAffordable = canAfford(gameState.resources, towerData.cost);

                    // Store tower button bounds
                    shipBuildPanelBounds.towerButton = {
                        y: towerBtnY,
                        height: towerBtnHeight,
                    };

                    // Check if mouse is hovering (only if affordable)
                    const towerHovered = towerAffordable && mousePos.x >= sbpX && mousePos.x <= sbpX + sbpWidth &&
                                         mousePos.y >= towerBtnY && mousePos.y <= towerBtnY + towerBtnHeight;

                    // Button background (highlight on hover)
                    if (towerHovered) {
                        k.drawRect({
                            pos: k.vec2(sbpX + 4, towerBtnY),
                            width: sbpWidth - 8,
                            height: towerBtnHeight,
                            color: k.rgb(60, 80, 100),
                            radius: 4,
                        });
                    }

                    // Draw sprite thumbnail
                    const towerThumbScale = 1.2;
                    const towerSpriteSize = getSpriteSize(towerData.sprite, towerThumbScale);
                    const towerSpriteX = sbpX + 10;
                    const towerSpriteY = towerBtnY + (towerBtnHeight - towerSpriteSize.height) / 2;
                    drawSprite(k, towerData.sprite, towerSpriteX, towerSpriteY, towerThumbScale, towerAffordable ? 1.0 : 0.4);

                    // Tower name (greyed out if can't afford)
                    k.drawText({
                        text: `${towerData.name} (T)`,
                        pos: k.vec2(sbpX + 44, towerBtnY + 10),
                        size: 13,
                        anchor: "left",
                        color: !towerAffordable ? k.rgb(80, 80, 80) : towerHovered ? k.rgb(255, 255, 255) : k.rgb(200, 200, 200),
                    });

                    // Tower cost
                    k.drawText({
                        text: `${towerData.cost.wood} wood`,
                        pos: k.vec2(sbpX + 44, towerBtnY + 26),
                        size: 10,
                        anchor: "left",
                        color: !towerAffordable ? k.rgb(100, 60, 60) : k.rgb(120, 120, 120),
                    });

                    // Build time (right side)
                    k.drawText({
                        text: `${towerData.buildTime}s`,
                        pos: k.vec2(sbpX + sbpWidth - 12, towerBtnY + towerBtnHeight / 2),
                        size: 11,
                        anchor: "right",
                        color: !towerAffordable ? k.rgb(80, 80, 80) : k.rgb(150, 150, 150),
                    });
                }
            }

            // Ship info panel (bottom right, when ship is selected)
            if (selectedShipIndices.length === 1) {
                const shipIndex = selectedShipIndices[0].index;
                const ship = gameState.ships[shipIndex];
                const shipData = SHIPS[ship.type];

                const infoPanelWidth = 140;
                const infoPanelHeight = 100;
                const infoPanelX = k.width() - infoPanelWidth - 15;
                const infoPanelY = k.height() - infoPanelHeight - 50;

                // Panel background
                k.drawRect({
                    pos: k.vec2(infoPanelX, infoPanelY),
                    width: infoPanelWidth,
                    height: infoPanelHeight,
                    color: k.rgb(20, 30, 40),
                    radius: 6,
                    opacity: 0.9,
                });

                // Ship name
                k.drawText({
                    text: shipData.name,
                    pos: k.vec2(infoPanelX + infoPanelWidth / 2, infoPanelY + 14),
                    size: 13,
                    anchor: "center",
                    color: k.rgb(200, 200, 200),
                });

                // Status indicator (auto-loop, waiting, etc.)
                let statusText = "";
                let statusColor = k.rgb(100, 100, 100);

                // Pirate AI state
                if (ship.aiState) {
                    switch (ship.aiState) {
                        case 'patrol':
                            statusText = "PATROL";
                            statusColor = k.rgb(120, 120, 120);  // Gray
                            break;
                        case 'chase':
                            statusText = "CHASE";
                            statusColor = k.rgb(255, 160, 60);   // Orange
                            break;
                        case 'attack':
                            statusText = "ATTACK";
                            statusColor = k.rgb(220, 60, 60);    // Red
                            break;
                        case 'retreat':
                            statusText = "RETREAT";
                            statusColor = k.rgb(80, 140, 220);   // Blue
                            break;
                    }
                } else if (ship.tradeRoute) {
                    if (ship.waitingForDock) {
                        statusText = "WAITING";
                        statusColor = k.rgb(220, 180, 80);  // Yellow/gold
                    } else if (ship.dockingState?.action === 'loading') {
                        statusText = "LOADING";
                        statusColor = k.rgb(80, 180, 80);   // Green
                    } else if (ship.dockingState?.action === 'unloading') {
                        statusText = "UNLOADING";
                        statusColor = k.rgb(220, 180, 80);  // Gold
                    } else {
                        statusText = "AUTO-LOOP";
                        statusColor = k.rgb(100, 180, 220); // Cyan/blue
                    }
                } else if (ship.pendingUnload) {
                    if (ship.waitingForDock) {
                        statusText = "WAITING";
                        statusColor = k.rgb(220, 180, 80);
                    } else if (ship.dockingState?.action === 'unloading') {
                        statusText = "UNLOADING";
                        statusColor = k.rgb(220, 180, 80);
                    } else {
                        statusText = "RETURNING";
                        statusColor = k.rgb(180, 140, 100);
                    }
                }

                if (statusText) {
                    // Draw status badge
                    const badgeWidth = 70;
                    const badgeHeight = 14;
                    const badgeX = infoPanelX + infoPanelWidth / 2 - badgeWidth / 2;
                    const badgeY = infoPanelY + 26;

                    k.drawRect({
                        pos: k.vec2(badgeX, badgeY),
                        width: badgeWidth,
                        height: badgeHeight,
                        color: statusColor,
                        radius: 3,
                        opacity: 0.3,
                    });

                    k.drawText({
                        text: statusText,
                        pos: k.vec2(infoPanelX + infoPanelWidth / 2, badgeY + badgeHeight / 2),
                        size: 9,
                        anchor: "center",
                        color: statusColor,
                    });
                }

                // Cargo section
                const cargoWood = ship.cargo?.wood || 0;
                const cargoFood = ship.cargo?.food || 0;
                const maxCargo = shipData.cargo;
                const totalCargo = cargoWood + cargoFood;

                k.drawText({
                    text: "CARGO",
                    pos: k.vec2(infoPanelX + infoPanelWidth / 2, infoPanelY + 48),
                    size: 9,
                    anchor: "center",
                    color: k.rgb(120, 120, 120),
                });

                // Wood count (brown)
                k.drawText({
                    text: `Wood: ${cargoWood}`,
                    pos: k.vec2(infoPanelX + 12, infoPanelY + 66),
                    size: 11,
                    anchor: "left",
                    color: k.rgb(180, 130, 70),
                });

                // Food count (green)
                k.drawText({
                    text: `Food: ${cargoFood}`,
                    pos: k.vec2(infoPanelX + 12, infoPanelY + 80),
                    size: 11,
                    anchor: "left",
                    color: k.rgb(100, 160, 80),
                });

                // Cargo capacity
                k.drawText({
                    text: `${totalCargo}/${maxCargo}`,
                    pos: k.vec2(infoPanelX + infoPanelWidth - 12, infoPanelY + 73),
                    size: 11,
                    anchor: "right",
                    color: totalCargo > 0 ? k.rgb(180, 180, 180) : k.rgb(100, 100, 100),
                });
            }
        });

        // Left-click/drag for selection
        k.onMousePress("left", () => {
            isLeftMouseDown = true;
            selectStartX = k.mousePos().x;
            selectStartY = k.mousePos().y;
            selectEndX = selectStartX;
            selectEndY = selectStartY;
        });

        k.onMouseRelease("left", () => {
            const dx = k.mousePos().x - selectStartX;
            const dy = k.mousePos().y - selectStartY;
            const dist = Math.sqrt(dx * dx + dy * dy);

            if (dist > DRAG_THRESHOLD && isSelecting) {
                // Selection box drag - select units in box
                handleSelectionBox();
            } else {
                // Click - handle unit selection or waypoint
                handleClick();
            }
            isLeftMouseDown = false;
            isSelecting = false;
        });

        // Right-click/drag for panning
        k.onMousePress("right", () => {
            // Cancel placement mode on right-click
            if (gameState.portBuildMode.active) {
                exitPortBuildMode(gameState);
                console.log("Port placement cancelled");
                return;  // Don't start panning
            }
            if (gameState.settlementBuildMode.active) {
                exitSettlementBuildMode(gameState);
                console.log("Settlement placement cancelled");
                return;  // Don't start panning
            }
            if (gameState.towerBuildMode.active) {
                exitTowerBuildMode(gameState);
                console.log("Tower placement cancelled");
                return;  // Don't start panning
            }

            isPanning = true;
            panStartX = k.mousePos().x;
            panStartY = k.mousePos().y;
            cameraStartX = cameraX;
            cameraStartY = cameraY;
        });

        k.onMouseRelease("right", () => {
            isPanning = false;
        });

        k.onMouseMove(() => {
            // Selection box dragging (only when left mouse is held)
            if (isLeftMouseDown) {
                const dx = k.mousePos().x - selectStartX;
                const dy = k.mousePos().y - selectStartY;
                if (Math.sqrt(dx * dx + dy * dy) > DRAG_THRESHOLD) {
                    isSelecting = true;
                }
                selectEndX = k.mousePos().x;
                selectEndY = k.mousePos().y;
            }

            // Camera panning with right-drag
            if (isPanning) {
                const pdx = k.mousePos().x - panStartX;
                const pdy = k.mousePos().y - panStartY;
                cameraX = cameraStartX - pdx / zoom;
                cameraY = cameraStartY - pdy / zoom;
            }
        });

        // WASD and edge scrolling for camera panning
        const EDGE_SCROLL_MARGIN = 20; // pixels from edge to trigger scroll
        k.onUpdate(() => {
            const panSpeed = 300 / zoom;
            const mouse = k.mousePos();

            // WASD panning
            if (k.isKeyDown("w") || k.isKeyDown("up")) cameraY -= panSpeed * k.dt();
            if (k.isKeyDown("s") || k.isKeyDown("down")) cameraY += panSpeed * k.dt();
            if (k.isKeyDown("a") || k.isKeyDown("left")) cameraX -= panSpeed * k.dt();
            if (k.isKeyDown("d") || k.isKeyDown("right")) cameraX += panSpeed * k.dt();

            // Edge scrolling (only when not dragging selection box)
            if (!isSelecting) {
                if (mouse.x < EDGE_SCROLL_MARGIN) cameraX -= panSpeed * k.dt();
                if (mouse.x > k.width() - EDGE_SCROLL_MARGIN) cameraX += panSpeed * k.dt();
                if (mouse.y < EDGE_SCROLL_MARGIN) cameraY -= panSpeed * k.dt();
                if (mouse.y > k.height() - EDGE_SCROLL_MARGIN) cameraY += panSpeed * k.dt();
            }
        });

        // Scroll to zoom
        k.onScroll((delta) => {
            const zoomFactor = 1.1;
            if (delta.y < 0) {
                zoom = Math.min(zoom * zoomFactor, 3);
            } else {
                zoom = Math.max(zoom / zoomFactor, 0.3);
            }
        });

        // Time scale controls
        k.onKeyPress("1", () => { gameState.timeScale = 1; });
        k.onKeyPress("2", () => { gameState.timeScale = 2; });
        k.onKeyPress("3", () => { gameState.timeScale = 3; });
        k.onKeyPress("space", () => {
            gameState.timeScale = gameState.timeScale === 0 ? 1 : 0;
        });

        // ESC to cancel placement modes
        k.onKeyPress("escape", () => {
            if (gameState.portBuildMode.active) {
                exitPortBuildMode(gameState);
                console.log("Port placement cancelled");
            }
            if (gameState.settlementBuildMode.active) {
                exitSettlementBuildMode(gameState);
                console.log("Settlement placement cancelled");
            }
            if (gameState.towerBuildMode.active) {
                exitTowerBuildMode(gameState);
                console.log("Tower placement cancelled");
            }
        });

        // Hotkey 'S' to enter settlement build mode when port panel is open
        k.onKeyPress("s", () => {
            // Only works if settlement button is visible in the build panel
            if (buildPanelBounds?.settlementButton && !isPortBuildingSettlement(buildPanelBounds.portIndex, gameState.settlements)) {
                enterSettlementBuildMode(gameState, buildPanelBounds.portIndex);
                console.log("Settlement placement mode (hotkey S)");
            }
        });

        // Hotkey 'T' to enter tower build mode when ship or port panel is open
        k.onKeyPress("t", () => {
            // Ship panel takes priority if both are somehow open
            if (shipBuildPanelBounds?.towerButton && canAfford(gameState.resources, TOWERS.tower.cost)) {
                enterTowerBuildMode(gameState, shipBuildPanelBounds.shipIndex, 'ship');
                console.log("Tower placement mode from ship (hotkey T)");
            } else if (buildPanelBounds?.towerButton && canAfford(gameState.resources, TOWERS.tower.cost)) {
                enterTowerBuildMode(gameState, buildPanelBounds.portIndex, 'port');
                console.log("Tower placement mode from port (hotkey T)");
            }
        });

        // Click handler for selection and waypoints - delegates to input handler helpers
        function handleClick() {
            const mouseX = k.mousePos().x;
            const mouseY = k.mousePos().y;

            // Handle placement mode clicks first
            if (handlePortPlacementClick(gameState)) return;
            if (handleSettlementPlacementClick(gameState)) return;
            if (handleTowerPlacementClick(gameState)) return;

            // Check UI panel clicks
            if (handleShipBuildPanelClick(mouseX, mouseY, shipBuildPanelBounds, gameState)) return;
            if (handleBuildPanelClick(mouseX, mouseY, buildPanelBounds, gameState)) return;

            // Convert to world coordinates
            const worldX = (mouseX - k.width() / 2) / zoom + cameraX;
            const worldY = (mouseY - k.height() / 2) / zoom + cameraY;
            const clickedHex = pixelToHex(worldX, worldY);

            // Check modifier keys
            const isShiftHeld = k.isKeyDown("shift");
            const isCommandHeld = k.isKeyDown("meta");

            let clickedOnUnit = false;

            // When Command is held, check special interactions BEFORE unit selection
            if (isCommandHeld) {
                // Attack pirate ship
                if (handleAttackClick(gameState, worldX, worldY, hexToPixel, SELECTION_RADIUS)) {
                    return;  // Attack command handled
                }
                // Trade route to foreign port
                if (handleTradeRouteClick(gameState, map, worldX, worldY, hexToPixel, SELECTION_RADIUS)) {
                    clickedOnUnit = true;
                }
                // Unload at home port
                else if (handleHomePortUnloadClick(gameState, map, worldX, worldY, hexToPixel, SELECTION_RADIUS)) {
                    clickedOnUnit = true;
                }
            }

            // Check unit selection (ships, ports, settlements)
            if (!clickedOnUnit) {
                clickedOnUnit = handleUnitSelection(gameState, worldX, worldY, hexToPixel, SELECTION_RADIUS, isShiftHeld);
            }

            // If clicked on empty space...
            if (!clickedOnUnit) {
                if (isCommandHeld) {
                    // Command+click = set waypoint
                    handleWaypointClick(gameState, map, clickedHex, isShiftHeld);
                } else if (!isShiftHeld) {
                    // Regular click on empty = deselect
                    clearSelection(gameState);
                }
            }
        }

        // Selection box handler - select all units within box bounds
        function handleSelectionBox() {
            const halfWidth = k.width() / 2;
            const halfHeight = k.height() / 2;

            // Apply camera shake for consistent screen positioning
            const effectiveCameraX = cameraX + cameraShakeX;
            const effectiveCameraY = cameraY + cameraShakeY;

            // Box bounds in screen coordinates
            const boxLeft = Math.min(selectStartX, selectEndX);
            const boxRight = Math.max(selectStartX, selectEndX);
            const boxTop = Math.min(selectStartY, selectEndY);
            const boxBottom = Math.max(selectStartY, selectEndY);

            // Clear selection first
            clearSelection(gameState);

            // Check each ship
            for (let i = 0; i < gameState.ships.length; i++) {
                const ship = gameState.ships[i];
                const pos = getShipVisualPosLocal(ship);
                const screenX = (pos.x - effectiveCameraX) * zoom + halfWidth;
                const screenY = (pos.y - effectiveCameraY) * zoom + halfHeight;

                if (screenX >= boxLeft && screenX <= boxRight &&
                    screenY >= boxTop && screenY <= boxBottom) {
                    addToSelection(gameState, 'ship', i);
                }
            }

            // Check each port
            for (let i = 0; i < gameState.ports.length; i++) {
                const port = gameState.ports[i];
                const pos = hexToPixel(port.q, port.r);
                const screenX = (pos.x - effectiveCameraX) * zoom + halfWidth;
                const screenY = (pos.y - effectiveCameraY) * zoom + halfHeight;

                if (screenX >= boxLeft && screenX <= boxRight &&
                    screenY >= boxTop && screenY <= boxBottom) {
                    addToSelection(gameState, 'port', i);
                }
            }

            // Check each settlement
            for (let i = 0; i < gameState.settlements.length; i++) {
                const settlement = gameState.settlements[i];
                const pos = hexToPixel(settlement.q, settlement.r);
                const screenX = (pos.x - effectiveCameraX) * zoom + halfWidth;
                const screenY = (pos.y - effectiveCameraY) * zoom + halfHeight;

                if (screenX >= boxLeft && screenX <= boxRight &&
                    screenY >= boxTop && screenY <= boxBottom) {
                    addToSelection(gameState, 'settlement', i);
                }
            }

            const count = gameState.selectedUnits.length;
            if (count > 0) {
                console.log(`Selected ${count} unit(s)`);
            }
        }

        // Center camera on starting position (or map center if no start)
        if (startTile) {
            const startPos = hexToPixel(startTile.q, startTile.r);
            cameraX = startPos.x;
            cameraY = startPos.y;
        } else {
            const centerQ = Math.floor(map.width / 2);
            const centerR = Math.floor(map.height / 2);
            const centerPos = hexToPixel(centerQ, centerR);
            cameraX = centerPos.x;
            cameraY = centerPos.y;
        }
    };
}
