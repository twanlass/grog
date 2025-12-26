// Main game scene - renders the hex map
import { hexToPixel, hexCorners, HEX_SIZE, pixelToHex, hexKey, hexNeighbors, hexDistance } from "../hex.js";
import { generateMap, getTileColor, getStippleColors, TILE_TYPES } from "../mapGenerator.js";
import { createGameState, createShip, createPort, createSettlement, findStartingPosition, findFreeAdjacentWater, getBuildableShips, startBuilding, selectUnit, addToSelection, toggleSelection, isSelected, clearSelection, getSelectedUnits, getSelectedShips, enterPortBuildMode, exitPortBuildMode, isValidPortSite, getNextPortType, startPortUpgrade, isShipBuildingPort, enterSettlementBuildMode, exitSettlementBuildMode, isValidSettlementSite, enterTowerBuildMode, exitTowerBuildMode, isValidTowerSite, isShipBuildingTower, canAfford, deductCost, isPortBuildingSettlement, isShipAdjacentToPort, getCargoSpace, cancelTradeRoute, findNearbyWaitingHex, getHomePortIndex } from "../gameState.js";
import { drawSprite, drawSpriteFlash, getSpriteSize, PORTS, SHIPS, SETTLEMENTS, TOWERS } from "../sprites/index.js";
import { createFogState, initializeFog, revealRadius, isHexRevealed } from "../fogOfWar.js";

// Rendering modules (new - extracted from this file for better organization)
// These can be used to gradually replace inline rendering code below
import { createRenderContext } from "../rendering/renderContext.js";
import { drawTiles, drawFogOfWar } from "../rendering/tileRenderer.js";
import { drawPorts, drawSettlements, drawTowers, drawShips, drawFloatingNumbers, drawBirds, drawDockingProgress } from "../rendering/unitRenderer.js";
import { drawShipTrails, drawFloatingDebris, drawProjectiles, drawWaterSplashes, drawExplosions, drawHealthBars } from "../rendering/effectsRenderer.js";
import { drawShipSelectionIndicators, drawPortSelectionIndicators, drawSettlementSelectionIndicators, drawTowerSelectionIndicators, drawSelectionBox, drawAllSelectionUI, drawUnitHoverHighlight } from "../rendering/selectionUI.js";
import { drawPortPlacementMode, drawSettlementPlacementMode, drawTowerPlacementMode, drawAllPlacementUI } from "../rendering/placementUI.js";
import { drawSimpleUIPanels, drawShipInfoPanel, drawTowerInfoPanel, drawConstructionStatusPanel, drawShipBuildPanel, drawPortBuildPanel } from "../rendering/uiPanels.js";

// Game systems
import { updateShipMovement, getShipVisualPos, updatePirateAI } from "../systems/shipMovement.js";
import { updateTradeRoutes } from "../systems/tradeRoutes.js";
import { updateConstruction } from "../systems/construction.js";
import { updateResourceGeneration } from "../systems/resourceGeneration.js";
import { updateCombat, updatePirateRespawns } from "../systems/combat.js";
import {
    handlePortPlacementClick, handleSettlementPlacementClick, handleTowerPlacementClick,
    handleShipBuildPanelClick, handleBuildPanelClick, handleTowerInfoPanelClick,
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

            // Set home island - the landmass where the first port was placed
            gameState.homeIslandHex = { q: startTile.q, r: startTile.r };

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
        let towerInfoPanelBounds = null;  // For tower upgrade button

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
            const homePortIdx = getHomePortIndex(gameState, map);
            const homePort = homePortIdx !== null ? gameState.ports[homePortIdx] : null;
            updatePirateAI(gameState, map, homePort, dt); // Pirates patrol near home port
            updateTradeRoutes(gameState, map, dt);
            updateConstruction(gameState, map, fogState, dt);
            updateResourceGeneration(gameState, floatingNumbers, dt, map);
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

            // Create render context for modular rendering functions
            const ctx = createRenderContext(k, zoom, effectiveCameraX, effectiveCameraY);

            // Draw tiles and fog of war (migrated to rendering modules)
            drawTiles(ctx, map, tilePositions, tileColors, tileStipples, stippleAnimTime);
            drawFogOfWar(ctx, map, tilePositions, fogState);

            // Draw ports (migrated to rendering module)
            drawPorts(ctx, gameState);

            // Draw settlements (migrated to rendering module)
            drawSettlements(ctx, gameState);

            // Keep unitScale for remaining inline code
            const unitScale = zoom * 1.5;

            // Draw towers (migrated to rendering module)
            drawTowers(ctx, gameState);

            // Draw floating resource numbers (migrated to rendering module)
            drawFloatingNumbers(ctx, floatingNumbers);

            // Draw ship water trails (migrated to rendering module)
            drawShipTrails(ctx, gameState, fogState);

            // Draw floating debris (migrated to rendering module)
            drawFloatingDebris(ctx, gameState.floatingDebris);

            // Draw unit hover highlight (before units so it appears underneath)
            drawUnitHoverHighlight(ctx, gameState, getShipVisualPosLocal, SELECTION_RADIUS);

            // Draw ships (migrated to rendering module)
            drawShips(ctx, gameState, fogState, getShipVisualPosLocal);

            // Draw projectiles (migrated to rendering module)
            drawProjectiles(ctx, gameState);

            // Draw water splashes (migrated to rendering module)
            drawWaterSplashes(ctx, gameState);

            // Draw ship explosions (migrated to rendering module)
            drawExplosions(ctx, gameState);

            // Draw health bars (migrated to rendering module)
            drawHealthBars(ctx, gameState, getShipVisualPosLocal);

            // Draw loading/unloading progress bars (migrated to rendering module)
            drawDockingProgress(ctx, gameState, getShipVisualPosLocal);

            // Draw birds (migrated to rendering module)
            drawBirds(ctx, birdStates);

            // Draw all selection indicators (migrated to rendering module)
            drawAllSelectionUI(ctx, gameState, getShipVisualPosLocal, null);

            // Draw placement mode UI (migrated to rendering module)
            const placementValidators = { isValidPortSite, isValidSettlementSite, isValidTowerSite };
            drawAllPlacementUI(ctx, gameState, map, tilePositions, fogState, pixelToHex, placementValidators);

            // Draw selection box (migrated to rendering module)
            drawSelectionBox(ctx, isSelecting, selectStartX, selectStartY, selectEndX, selectEndY);

            // Draw simple UI panels (migrated to rendering module)
            drawSimpleUIPanels(ctx, gameState);

            // Build panel UI (when exactly one port is selected)
            const selectedPortIndices = gameState.selectedUnits.filter(u => u.type === 'port');
            buildPanelBounds = null;

            if (selectedPortIndices.length === 1) {
                const portIndex = selectedPortIndices[0].index;
                const port = gameState.ports[portIndex];
                buildPanelBounds = drawPortBuildPanel(ctx, port, portIndex, gameState, { isPortBuildingSettlement });
            }

            // Ship build panel UI (when exactly one docked ship is selected, not in placement mode)
            const selectedShipIndices = gameState.selectedUnits.filter(u => u.type === 'ship');
            shipBuildPanelBounds = null;

            if (selectedShipIndices.length === 1 && !gameState.portBuildMode.active && !gameState.towerBuildMode.active) {
                const shipIndex = selectedShipIndices[0].index;
                const ship = gameState.ships[shipIndex];
                const canShowBuildPanel = isShipDocked(ship) && !isShipBuildingPort(shipIndex, gameState.ports) && !isShipBuildingTower(shipIndex, gameState.towers);
                shipBuildPanelBounds = drawShipBuildPanel(ctx, ship, shipIndex, gameState, canShowBuildPanel);
            }

            // Tower info panel (bottom right, when tower is selected)
            const selectedTowerIndices = gameState.selectedUnits.filter(u => u.type === 'tower');
            towerInfoPanelBounds = null;
            if (selectedTowerIndices.length === 1) {
                const tower = gameState.towers[selectedTowerIndices[0].index];
                towerInfoPanelBounds = drawTowerInfoPanel(ctx, tower, gameState);
            }

            // Ship info panel (bottom right, when ship is selected)
            if (selectedShipIndices.length === 1 && selectedTowerIndices.length === 0) {
                const ship = gameState.ships[selectedShipIndices[0].index];
                drawShipInfoPanel(ctx, ship);
            }
        });

        // Left-click/drag for selection or panning (spacebar + left-click)
        k.onMousePress("left", () => {
            isLeftMouseDown = true;

            // Spacebar + left-click = pan mode
            if (k.isKeyDown("space")) {
                isPanning = true;
                panStartX = k.mousePos().x;
                panStartY = k.mousePos().y;
                cameraStartX = cameraX;
                cameraStartY = cameraY;
            } else {
                // Normal selection mode
                selectStartX = k.mousePos().x;
                selectStartY = k.mousePos().y;
                selectEndX = selectStartX;
                selectEndY = selectStartY;
            }
        });

        k.onMouseRelease("left", () => {
            if (isPanning) {
                // End panning
                isPanning = false;
            } else {
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
            }
            isLeftMouseDown = false;
            isSelecting = false;
        });

        // Right-click to cancel placement modes
        k.onMousePress("right", () => {
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

        k.onMouseMove(() => {
            // Camera panning with spacebar + left-drag
            if (isPanning) {
                const pdx = k.mousePos().x - panStartX;
                const pdy = k.mousePos().y - panStartY;
                cameraX = cameraStartX - pdx / zoom;
                cameraY = cameraStartY - pdy / zoom;
            }
            // Selection box dragging (only when left mouse is held and not panning)
            else if (isLeftMouseDown) {
                const dx = k.mousePos().x - selectStartX;
                const dy = k.mousePos().y - selectStartY;
                if (Math.sqrt(dx * dx + dy * dy) > DRAG_THRESHOLD) {
                    isSelecting = true;
                }
                selectEndX = k.mousePos().x;
                selectEndY = k.mousePos().y;
            }
        });

        // WASD and edge scrolling for camera panning
        const EDGE_SCROLL_MARGIN = 20; // pixels from edge to trigger scroll
        k.onUpdate(() => {
            const panSpeed = 300 / zoom;
            const mouse = k.mousePos();

            // Arrow key panning
            if (k.isKeyDown("up")) cameraY -= panSpeed * k.dt();
            if (k.isKeyDown("down")) cameraY += panSpeed * k.dt();
            if (k.isKeyDown("left")) cameraX -= panSpeed * k.dt();
            if (k.isKeyDown("right")) cameraX += panSpeed * k.dt();

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
        k.onKeyPress("p", () => {
            gameState.timeScale = gameState.timeScale === 0 ? 1 : 0;
        });

        // ESC to cancel placement modes or deselect all units
        k.onKeyPress("escape", () => {
            if (gameState.portBuildMode.active) {
                exitPortBuildMode(gameState);
                console.log("Port placement cancelled");
            } else if (gameState.settlementBuildMode.active) {
                exitSettlementBuildMode(gameState);
                console.log("Settlement placement cancelled");
            } else if (gameState.towerBuildMode.active) {
                exitTowerBuildMode(gameState);
                console.log("Tower placement cancelled");
            } else if (gameState.selectedUnits.length > 0) {
                clearSelection(gameState);
            }
        });

        // Hotkey 'S' to enter settlement build mode when port panel is open
        k.onKeyPress("s", () => {
            // Only works if settlement button is visible in the build panel and can afford
            if (buildPanelBounds?.settlementButton &&
                !isPortBuildingSettlement(buildPanelBounds.portIndex, gameState.settlements) &&
                canAfford(gameState.resources, SETTLEMENTS.settlement.cost)) {
                enterSettlementBuildMode(gameState, buildPanelBounds.portIndex);
                console.log("Settlement placement mode (hotkey S)");
            }
        });

        // Hotkey 'T' to enter watchtower build mode when ship or port panel is open
        k.onKeyPress("t", () => {
            // Ship panel takes priority if both are somehow open
            if (shipBuildPanelBounds?.towerButton && canAfford(gameState.resources, TOWERS.watchtower.cost)) {
                enterTowerBuildMode(gameState, shipBuildPanelBounds.shipIndex, 'ship');
                console.log("Watchtower placement mode from ship (hotkey T)");
            } else if (buildPanelBounds?.towerButton && canAfford(gameState.resources, TOWERS.watchtower.cost)) {
                enterTowerBuildMode(gameState, buildPanelBounds.portIndex, 'port');
                console.log("Watchtower placement mode from port (hotkey T)");
            }
        });

        // Hotkey 'U' to upgrade selected tower
        k.onKeyPress("u", () => {
            if (towerInfoPanelBounds?.upgradeButton) {
                const nextTowerData = TOWERS[towerInfoPanelBounds.upgradeButton.towerType];
                if (canAfford(gameState.resources, nextTowerData.cost)) {
                    const selectedTowerIndices = gameState.selectedUnits.filter(u => u.type === 'tower');
                    if (selectedTowerIndices.length === 1) {
                        const tower = gameState.towers[selectedTowerIndices[0].index];
                        if (!tower.construction) {
                            deductCost(gameState.resources, nextTowerData.cost);
                            // Import startTowerUpgrade if needed, or inline the upgrade
                            tower.construction = {
                                progress: 0,
                                buildTime: nextTowerData.buildTime,
                                upgradeTo: towerInfoPanelBounds.upgradeButton.towerType,
                            };
                            console.log(`Started upgrading tower to: ${towerInfoPanelBounds.upgradeButton.towerType} (hotkey U)`);
                        }
                    }
                }
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
            if (handleTowerInfoPanelClick(mouseX, mouseY, towerInfoPanelBounds, gameState)) return;

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
