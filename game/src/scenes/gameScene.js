// Main game scene - renders the hex map
import { hexToPixel, hexCorners, HEX_SIZE, pixelToHex, hexKey, hexNeighbors, hexDistance } from "../hex.js";
import { generateMap, getTileColor, getStippleColors, TILE_TYPES } from "../mapGenerator.js";
import { createGameState, createShip, createPort, createSettlement, findStartingPosition, findFreeAdjacentWater, getBuildableShips, startBuilding, selectUnit, addToSelection, toggleSelection, isSelected, clearSelection, getSelectedUnits, getSelectedShips, enterPortBuildMode, exitPortBuildMode, isValidPortSite, getNextPortType, startPortUpgrade, isShipBuildingPort, enterSettlementBuildMode, exitSettlementBuildMode, isValidSettlementSite, enterTowerBuildMode, exitTowerBuildMode, isValidTowerSite, isShipBuildingTower, canAfford, deductCost, isPortBuildingSettlement, isShipAdjacentToPort, getCargoSpace, cancelTradeRoute, findNearbyWaitingHex, getHomePortIndex, canAffordCrew, showNotification, updateNotification } from "../gameState.js";
import { drawSprite, drawSpriteFlash, getSpriteSize, PORTS, SHIPS, SETTLEMENTS, TOWERS } from "../sprites/index.js";
import { createFogState, initializeFog, isVisibilityDirty, recalculateVisibility, updateFogAnimations } from "../fogOfWar.js";

// Rendering modules (new - extracted from this file for better organization)
// These can be used to gradually replace inline rendering code below
import { createRenderContext } from "../rendering/renderContext.js";
import { drawTiles, drawFogOfWar, drawDecorations } from "../rendering/tileRenderer.js";
import { computeIslands, drawIslandWaves } from "../rendering/waveRenderer.js";

// Seeded random for deterministic decoration placement
function seededRandom(seed) {
    const x = Math.sin(seed * 12.9898) * 43758.5453;
    return x - Math.floor(x);
}
import { drawPorts, drawSettlements, drawTowers, drawShips, drawFloatingNumbers, drawBirds, drawDockingProgress } from "../rendering/unitRenderer.js";
import { drawShipTrails, drawFloatingDebris, drawProjectiles, drawWaterSplashes, drawExplosions, drawHealthBars, drawLootDrops, drawLootSparkles } from "../rendering/effectsRenderer.js";
import { drawShipSelectionIndicators, drawPortSelectionIndicators, drawSettlementSelectionIndicators, drawTowerSelectionIndicators, drawSelectionBox, drawAllSelectionUI, drawUnitHoverHighlight, drawWaypointsAndRallyPoints } from "../rendering/selectionUI.js";
import { drawPortPlacementMode, drawSettlementPlacementMode, drawTowerPlacementMode, drawAllPlacementUI } from "../rendering/placementUI.js";
import { drawSimpleUIPanels, drawShipInfoPanel, drawTowerInfoPanel, drawSettlementInfoPanel, drawConstructionStatusPanel, drawShipBuildPanel, drawPortBuildPanel, drawNotification, drawTooltip } from "../rendering/uiPanels.js";

// Game systems
import { updateShipMovement, getShipVisualPos, updatePirateAI } from "../systems/shipMovement.js";
import { updateTradeRoutes } from "../systems/tradeRoutes.js";
import { updateConstruction } from "../systems/construction.js";
import { updateResourceGeneration } from "../systems/resourceGeneration.js";
import { updateCombat, updatePirateRespawns } from "../systems/combat.js";
import { updateWaveSpawner, getWaveStatus } from "../systems/waveSpawner.js";
import { updateRepair } from "../systems/repair.js";
import { startRepair } from "../systems/repair.js";
import {
    handlePortPlacementClick, handleSettlementPlacementClick, handleTowerPlacementClick,
    handleShipBuildPanelClick, handleBuildPanelClick, handleTowerInfoPanelClick, handleSettlementInfoPanelClick, handleShipInfoPanelClick,
    handleTradeRouteClick, handleHomePortUnloadClick,
    handleUnitSelection, handleWaypointClick, handleAttackClick, handlePortRallyPointClick
} from "../systems/inputHandler.js";

// Default scenario config (used if none provided)
import { getScenario, DEFAULT_SCENARIO_ID } from "../scenarios/index.js";

// Decoration generation config
const GRASS_MIN = 3;           // Minimum grass patches per hex
const GRASS_MAX = 10;          // Maximum grass patches per hex
const TREE_MIN = 2;            // Minimum trees per hex
const TREE_MAX = 5;            // Maximum trees per hex
const PALM_MIN = 1;            // Minimum palm trees per tropical hex
const PALM_MAX = 3;            // Maximum palm trees per tropical hex

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

export function createGameScene(k, getScenarioId = () => DEFAULT_SCENARIO_ID) {
    return function gameScene() {
        // Prevent browser context menu on right-click
        k.canvas.addEventListener("contextmenu", (e) => e.preventDefault());

        // Get scenario configuration
        const scenarioId = getScenarioId();
        const scenario = getScenario(scenarioId);

        // Generate the map (random each time)
        const map = generateMap({
            width: scenario.mapSize.width,
            height: scenario.mapSize.height,
        });

        // Initialize game state with scenario config
        const gameState = createGameState({
            startingResources: scenario.startingResources,
        });

        // Store scenario reference for wave system
        gameState.scenario = scenario;

        // Find starting position and place initial units
        const startTile = findStartingPosition(map);
        if (startTile) {
            // Place starting dock port (player must build ships)
            gameState.ports.push(createPort('dock', startTile.q, startTile.r));

            // Set home island - the landmass where the first port was placed
            gameState.homeIslandHex = { q: startTile.q, r: startTile.r };

            // Handle initial pirate spawning based on game mode
            if (scenario.gameMode === 'sandbox') {
                // Sandbox mode: queue initial pirates after delay
                for (let p = 0; p < scenario.pirateConfig.startingCount; p++) {
                    gameState.pirateRespawnQueue.push({ timer: scenario.pirateConfig.initialDelay });
                }
            } else if (scenario.gameMode === 'defend') {
                // Defend mode: initialize wave timer
                gameState.waveState.initialTimer = scenario.pirateConfig.initialDelay;
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

        // Double-click state (for selecting all units of same type)
        let lastClickTime = 0;
        let lastClickedUnit = null;  // { unitType: 'ship'|'port'|'tower'|'settlement', subType: string }
        const DOUBLE_CLICK_THRESHOLD = 350;  // milliseconds

        // Pan state (spacebar+left-drag or right-drag)
        let isPanning = false;
        let isRightMouseDown = false;
        let panStartX = 0;
        let panStartY = 0;
        let cameraStartX = 0;
        let cameraStartY = 0;

        // Build panel state (for click detection)
        let buildPanelBounds = null;  // { x, y, width, height, buttons: [{y, height, shipType}] }
        let shipBuildPanelBounds = null;  // For ship's port build panel
        let settlementBuildPanelBounds = null;  // For settlement build button in port panel
        let towerInfoPanelBounds = null;  // For tower upgrade button
        let settlementInfoPanelBounds = null;  // For settlement repair button
        let shipInfoPanelBounds = null;  // For ship repair button
        let topButtonBounds = null;  // For pause/menu buttons
        let speedMenuOpen = false;  // Speed selector menu state
        let menuPanelOpen = false;  // Controls menu panel state
        let timeScaleBeforeMenu = 1;  // Store time scale before opening menu

        // Floating numbers for resource generation animation
        const floatingNumbers = [];
        const GENERATION_INTERVAL = 30;  // seconds between resource generation
        const GENERATION_AMOUNT = 5;     // amount of each resource generated

        // Stipple animation timer for water twinkling effect
        let stippleAnimTime = 0;

        // Game time tracker for fog animations (runs independently of game speed)
        let gameTime = 0;

        // Bird states (3 birds orbiting home port with varying sizes and staggered starts)
        const birdStates = startTile ? [
            { q: startTile.q, r: startTile.r, frame: 0, frameTimer: 0, angle: 0, orbitRadius: 140, orbitSpeed: 0.3, scale: 1.0 },
            { q: startTile.q, r: startTile.r, frame: 1, frameTimer: 0.12, angle: 2.5, orbitRadius: 160, orbitSpeed: 0.26, scale: 0.85 },
            { q: startTile.q, r: startTile.r, frame: 0, frameTimer: 0.06, angle: 4.8, orbitRadius: 180, orbitSpeed: 0.22, scale: 0.70 },
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

        // Generate tile decorations (grass, trees, palms) for land tiles
        const tileDecorations = new Map();
        for (const tile of map.tiles.values()) {
            if (tile.type !== 'land') continue;
            if (tile.isPortSite) continue; // No decorations on port sites

            const key = `${tile.q},${tile.r}`;
            const seed = tile.q * 1000 + tile.r;
            const decorations = [];

            if (tile.climate === 'temperate') {
                // Temperate: grass and trees
                const grassCount = Math.floor(seededRandom(seed) * (GRASS_MAX - GRASS_MIN + 1)) + GRASS_MIN;
                for (let i = 0; i < grassCount; i++) {
                    decorations.push({
                        type: 'grass',
                        rx: seededRandom(seed + i * 10) * 1.4 - 0.7,
                        ry: seededRandom(seed + i * 10 + 1) * 1.4 - 0.7,
                    });
                }

                const treeCount = Math.floor(seededRandom(seed + 100) * (TREE_MAX - TREE_MIN + 1)) + TREE_MIN;
                for (let i = 0; i < treeCount; i++) {
                    decorations.push({
                        type: 'tree',
                        rx: seededRandom(seed + 100 + i * 10) * 1.2 - 0.6,
                        ry: seededRandom(seed + 101 + i * 10) * 1.2 - 0.6,
                    });
                }
            } else if (tile.climate === 'tropical') {
                // Tropical: palm trees
                const palmCount = Math.floor(seededRandom(seed) * (PALM_MAX - PALM_MIN + 1)) + PALM_MIN;
                for (let i = 0; i < palmCount; i++) {
                    decorations.push({
                        type: 'palm',
                        rx: seededRandom(seed + i * 10) * 1.2 - 0.6,
                        ry: seededRandom(seed + i * 10 + 1) * 1.2 - 0.6,
                    });
                }
            }

            if (decorations.length > 0) {
                tileDecorations.set(key, decorations);
            }
        }

        // Pre-compute islands for wave rendering
        const islands = computeIslands(map);

        // Main game update loop - delegates to system modules
        k.onUpdate(() => {
            const rawDt = k.dt();
            const dt = rawDt * gameState.timeScale;

            // Update stipple animation (always runs, even when paused or game over)
            stippleAnimTime += rawDt;

            // Update game time for fog animations (always runs for smooth transitions)
            gameTime += rawDt;
            updateFogAnimations(fogState, gameTime);

            // Update notification timer (always runs)
            updateNotification(gameState, rawDt);

            // Skip game updates when game is over
            if (gameState.gameOver) return;

            // Delegate to game systems
            updateShipMovement(hexToPixel, gameState, map, fogState, dt, floatingNumbers);
            const homePortIdx = getHomePortIndex(gameState, map);
            const homePort = homePortIdx !== null ? gameState.ports[homePortIdx] : null;
            updatePirateAI(gameState, map, homePort, dt); // Pirates patrol near home port
            updateTradeRoutes(gameState, map, dt);
            updateConstruction(gameState, map, fogState, dt, floatingNumbers);
            updateResourceGeneration(gameState, floatingNumbers, dt, map);
            updateCombat(hexToPixel, gameState, dt, fogState);
            updateRepair(gameState, dt);
            updatePirateRespawns(gameState, map, createShip, hexKey, dt);
            updateWaveSpawner(gameState, map, createShip, hexKey, dt);

            // Recalculate fog visibility if any vision source changed
            if (isVisibilityDirty(fogState)) {
                recalculateVisibility(fogState, gameState, gameTime);
            }

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
            for (const settlement of gameState.settlements) {
                if (settlement.hitFlash > 0) settlement.hitFlash -= rawDt;
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

            // Update loot drop animation age (no expiration)
            for (const loot of gameState.lootDrops) {
                loot.age += dt;
            }

            // Update loot sparkle effects
            for (let i = gameState.lootSparkles.length - 1; i >= 0; i--) {
                gameState.lootSparkles[i].age += dt;
                if (gameState.lootSparkles[i].age >= gameState.lootSparkles[i].duration) {
                    gameState.lootSparkles.splice(i, 1);
                }
            }

            // Update water splashes (from missed projectiles)
            for (let i = gameState.waterSplashes.length - 1; i >= 0; i--) {
                gameState.waterSplashes[i].age += dt;
                if (gameState.waterSplashes[i].age >= gameState.waterSplashes[i].duration) {
                    gameState.waterSplashes.splice(i, 1);
                }
            }

            // Check for game over conditions
            const playerShips = gameState.ships.filter(s => s.type !== 'pirate');

            // Defend mode: lose if home port is destroyed
            if (scenario && scenario.gameMode === 'defend' && !gameState.gameOver) {
                const homePortIndex = getHomePortIndex(gameState, map);
                if (homePortIndex === null) {
                    gameState.gameOver = 'lose';
                }
            }

            // Generic game over: all player ships and ports destroyed
            if (playerShips.length === 0 && gameState.ports.length === 0) {
                gameState.gameOver = 'lose';
            }

            // Animate birds (pauses with game)
            for (const bird of birdStates) {
                bird.frameTimer += dt;
                if (bird.frameTimer > 0.25) {  // ~4 FPS flapping
                    bird.frameTimer = 0;
                    bird.frame = (bird.frame + 1) % 2;
                }
                // Update orbit position
                bird.angle += bird.orbitSpeed * dt;
            }
        });

        // Check if a ship is docked (on water adjacent to land, and stationary)
        function isShipDocked(ship) {
            // Must not have a waypoint (stationary)
            if (ship.waypoints.length > 0) return false;

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

            // Draw tiles, waves, decorations, and fog (migrated to rendering modules)
            drawTiles(ctx, map, tilePositions, tileColors, tileStipples, stippleAnimTime);
            drawIslandWaves(ctx, islands, stippleAnimTime);
            drawDecorations(ctx, map, tilePositions, tileDecorations, gameState);
            drawFogOfWar(ctx, map, tilePositions, fogState, gameTime);

            // Draw ports (migrated to rendering module)
            drawPorts(ctx, gameState, map);

            // Draw settlements (migrated to rendering module)
            drawSettlements(ctx, gameState);

            // Keep unitScale for remaining inline code
            const unitScale = zoom * 1.5;

            // Draw towers (migrated to rendering module)
            drawTowers(ctx, gameState);

            // Draw ship water trails (migrated to rendering module)
            drawShipTrails(ctx, gameState, fogState);

            // Draw floating debris (migrated to rendering module)
            drawFloatingDebris(ctx, gameState.floatingDebris);

            // Draw loot drops
            drawLootDrops(ctx, gameState.lootDrops);

            // Draw loot collection sparkles
            drawLootSparkles(ctx, gameState.lootSparkles);

            // Draw unit hover highlight (before units so it appears underneath)
            drawUnitHoverHighlight(ctx, gameState, getShipVisualPosLocal, SELECTION_RADIUS);

            // Draw waypoints and rally points (before units so they appear underneath)
            drawWaypointsAndRallyPoints(ctx, gameState, getShipVisualPosLocal, map);

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

            // Draw all selection indicators (migrated to rendering module)
            drawAllSelectionUI(ctx, gameState, getShipVisualPosLocal, null);

            // Draw placement mode UI (migrated to rendering module)
            const placementValidators = { isValidPortSite, isValidSettlementSite, isValidTowerSite };
            drawAllPlacementUI(ctx, gameState, map, tilePositions, fogState, pixelToHex, placementValidators);

            // Draw selection box (migrated to rendering module)
            drawSelectionBox(ctx, isSelecting, selectStartX, selectStartY, selectEndX, selectEndY);

            // Draw floating resource numbers (above selection UI)
            drawFloatingNumbers(ctx, floatingNumbers);

            // Draw simple UI panels (migrated to rendering module)
            const waveStatus = getWaveStatus(gameState);
            topButtonBounds = drawSimpleUIPanels(ctx, gameState, waveStatus, speedMenuOpen, menuPanelOpen);

            // Build panel UI (when exactly one port is selected)
            const selectedPortIndices = gameState.selectedUnits.filter(u => u.type === 'port');
            buildPanelBounds = null;

            if (selectedPortIndices.length === 1) {
                const portIndex = selectedPortIndices[0].index;
                const port = gameState.ports[portIndex];
                buildPanelBounds = drawPortBuildPanel(ctx, port, portIndex, gameState, { isPortBuildingSettlement });
            }

            // Draw tooltip if present (from build panel hover)
            if (buildPanelBounds?.tooltip) {
                drawTooltip(ctx, buildPanelBounds.tooltip);
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

            // Settlement info panel (bottom right, when settlement is selected)
            const selectedSettlementIndices = gameState.selectedUnits.filter(u => u.type === 'settlement');
            settlementInfoPanelBounds = null;
            if (selectedSettlementIndices.length === 1 && selectedTowerIndices.length === 0) {
                const settlement = gameState.settlements[selectedSettlementIndices[0].index];
                settlementInfoPanelBounds = drawSettlementInfoPanel(ctx, settlement, gameState);
            }

            // Ship info panel (bottom right, when ship is selected)
            shipInfoPanelBounds = null;
            if (selectedShipIndices.length === 1 && selectedTowerIndices.length === 0 && selectedSettlementIndices.length === 0) {
                const ship = gameState.ships[selectedShipIndices[0].index];
                shipInfoPanelBounds = drawShipInfoPanel(ctx, ship, gameState);
            }

            // Draw notification message (bottom center)
            drawNotification(ctx, gameState.notification);

            // Game over overlay
            if (gameState.gameOver) {
                const screenWidth = k.width();
                const screenHeight = k.height();

                // Semi-transparent overlay
                k.drawRect({
                    pos: k.vec2(0, 0),
                    width: screenWidth,
                    height: screenHeight,
                    color: k.rgb(0, 0, 0),
                    opacity: 0.7,
                });

                // Game over text
                const isLose = gameState.gameOver === 'lose';
                const title = isLose ? "DEFEATED" : "VICTORY";
                const subtitle = isLose ? "Your home port was destroyed" : "You survived!";
                const titleColor = isLose ? k.rgb(200, 60, 60) : k.rgb(60, 200, 60);

                k.drawText({
                    text: title,
                    pos: k.vec2(screenWidth / 2, screenHeight / 2 - 40),
                    size: 48,
                    anchor: "center",
                    color: titleColor,
                });

                k.drawText({
                    text: subtitle,
                    pos: k.vec2(screenWidth / 2, screenHeight / 2 + 10),
                    size: 18,
                    anchor: "center",
                    color: k.rgb(180, 180, 180),
                });

                k.drawText({
                    text: "Press SPACE to restart",
                    pos: k.vec2(screenWidth / 2, screenHeight / 2 + 60),
                    size: 14,
                    anchor: "center",
                    color: k.rgb(120, 120, 120),
                });
            }

            // Draw birds at the very top (above all UI)
            drawBirds(ctx, birdStates);
        });

        // Left-click/drag for selection or panning (spacebar + left-click)
        k.onMousePress("left", () => {
            if (gameState.gameOver) return; // Block clicks when game over
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
            if (gameState.gameOver) return; // Block clicks when game over
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

        // Right-click for panning (drag) or commands (click)
        k.onMousePress("right", () => {
            if (gameState.gameOver) return;
            isRightMouseDown = true;

            // Start tracking for potential pan
            panStartX = k.mousePos().x;
            panStartY = k.mousePos().y;
            cameraStartX = cameraX;
            cameraStartY = cameraY;
        });

        k.onMouseRelease("right", () => {
            if (gameState.gameOver) return;

            const dx = k.mousePos().x - panStartX;
            const dy = k.mousePos().y - panStartY;
            const dist = Math.sqrt(dx * dx + dy * dy);

            if (isPanning) {
                // Was dragging - just end panning
                isPanning = false;
            } else if (dist <= DRAG_THRESHOLD) {
                // Was a click (not a drag) - handle as command
                // If any placement mode is active, cancel it
                if (gameState.portBuildMode.active) {
                    exitPortBuildMode(gameState);
                    console.log("Port placement cancelled");
                } else if (gameState.settlementBuildMode.active) {
                    exitSettlementBuildMode(gameState);
                    console.log("Settlement placement cancelled");
                } else if (gameState.towerBuildMode.active) {
                    exitTowerBuildMode(gameState);
                    console.log("Tower placement cancelled");
                } else {
                    // No placement mode active - handle as command click
                    handleRightClick();
                }
            }

            isRightMouseDown = false;
        });

        k.onMouseMove(() => {
            // Camera panning (spacebar+left-drag or right-drag)
            if (isPanning) {
                const pdx = k.mousePos().x - panStartX;
                const pdy = k.mousePos().y - panStartY;
                cameraX = cameraStartX - pdx / zoom;
                cameraY = cameraStartY - pdy / zoom;
            }
            // Right-drag starts panning
            else if (isRightMouseDown) {
                const dx = k.mousePos().x - panStartX;
                const dy = k.mousePos().y - panStartY;
                if (Math.sqrt(dx * dx + dy * dy) > DRAG_THRESHOLD) {
                    isPanning = true;
                }
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
        const CURSOR_DEFAULT = "url('src/sprites/assets/cursor.png'), auto";
        const CURSOR_ATTACK = "url('src/sprites/assets/cursor-attack.png'), auto";
        let currentCursor = CURSOR_DEFAULT;

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

            // Cursor state: show attack cursor when Cmd held over a pirate
            let newCursor = CURSOR_DEFAULT;
            if (k.isKeyDown("meta")) {
                const halfW = k.width() / 2;
                const halfH = k.height() / 2;
                const worldX = (mouse.x - halfW) / zoom + cameraX;
                const worldY = (mouse.y - halfH) / zoom + cameraY;

                // Check if hovering over a pirate
                for (const ship of gameState.ships) {
                    if (ship.type !== 'pirate') continue;
                    const pos = hexToPixel(ship.q, ship.r);
                    const dx = worldX - pos.x;
                    const dy = worldY - pos.y;
                    if (Math.sqrt(dx * dx + dy * dy) < SELECTION_RADIUS) {
                        newCursor = CURSOR_ATTACK;
                        break;
                    }
                }
            }

            if (newCursor !== currentCursor) {
                currentCursor = newCursor;
                k.setCursor(currentCursor);
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
        k.onKeyPress("1", () => { gameState.timeScale = 1; speedMenuOpen = false; });
        k.onKeyPress("2", () => { gameState.timeScale = 2; speedMenuOpen = false; });
        k.onKeyPress("3", () => { gameState.timeScale = 3; speedMenuOpen = false; });
        k.onKeyPress("4", () => { gameState.timeScale = 4; speedMenuOpen = false; });
        k.onKeyPress("5", () => { gameState.timeScale = 5; speedMenuOpen = false; });
        k.onKeyPress("p", () => {
            gameState.timeScale = gameState.timeScale === 0 ? 1 : 0;
            speedMenuOpen = false;
        });

        // H to center camera on home port
        k.onKeyPress("h", () => {
            const homePortIndex = getHomePortIndex(gameState, map);
            if (homePortIndex !== null) {
                const homePort = gameState.ports[homePortIndex];
                const pos = hexToPixel(homePort.q, homePort.r);
                cameraX = pos.x;
                cameraY = pos.y;
            }
        });

        // Space to restart when game over
        k.onKeyPress("space", () => {
            if (gameState.gameOver) {
                k.go("game", { scenarioId });
            }
        });

        // ESC to cancel placement modes or deselect all units
        k.onKeyPress("escape", () => {
            if (speedMenuOpen) {
                speedMenuOpen = false;
            } else if (menuPanelOpen) {
                menuPanelOpen = false;
                gameState.timeScale = timeScaleBeforeMenu;
            } else if (gameState.portBuildMode.active) {
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

        // '/' to toggle controls/help menu
        k.onKeyPress("/", () => {
            if (menuPanelOpen) {
                menuPanelOpen = false;
                gameState.timeScale = timeScaleBeforeMenu;
            } else {
                timeScaleBeforeMenu = gameState.timeScale || 1;
                menuPanelOpen = true;
                gameState.timeScale = 0;
            }
        });

        // Hotkey 'S' to enter settlement build mode when port panel is open
        k.onKeyPress("s", () => {
            // Only works if settlement button is visible in the build panel and can afford
            const port = buildPanelBounds?.portIndex != null ? gameState.ports[buildPanelBounds.portIndex] : null;
            if (buildPanelBounds?.settlementButton &&
                port && !port.repair &&
                !isPortBuildingSettlement(buildPanelBounds.portIndex, gameState.settlements) &&
                canAfford(gameState.resources, SETTLEMENTS.settlement.cost)) {
                enterSettlementBuildMode(gameState, buildPanelBounds.portIndex);
                console.log("Settlement placement mode (hotkey S)");
            }
        });

        // Hotkey 'T' to enter watchtower build mode when ship or port panel is open
        k.onKeyPress("t", () => {
            const watchtowerData = TOWERS.watchtower;
            // Ship panel takes priority if both are somehow open
            if (shipBuildPanelBounds?.towerButton && canAfford(gameState.resources, watchtowerData.cost)) {
                if (!canAffordCrew(gameState, watchtowerData.crewCost || 0)) {
                    showNotification(gameState, "Max crew reached. Build more settlements.");
                } else {
                    enterTowerBuildMode(gameState, shipBuildPanelBounds.shipIndex, 'ship');
                    console.log("Watchtower placement mode from ship (hotkey T)");
                }
            } else if (buildPanelBounds?.towerButton && canAfford(gameState.resources, watchtowerData.cost)) {
                const port = gameState.ports[buildPanelBounds.portIndex];
                if (!port.repair) {
                    if (!canAffordCrew(gameState, watchtowerData.crewCost || 0)) {
                        showNotification(gameState, "Max crew reached. Build more settlements.");
                    } else {
                        enterTowerBuildMode(gameState, buildPanelBounds.portIndex, 'port');
                        console.log("Watchtower placement mode from port (hotkey T)");
                    }
                }
            }
        });

        // Hotkey 'C' to build a Cutter when port panel is open
        k.onKeyPress("c", () => {
            if (buildPanelBounds?.buttons) {
                const cutterButton = buildPanelBounds.buttons.find(b => b.shipType === 'cutter');
                if (cutterButton) {
                    const selectedPortIndices = gameState.selectedUnits.filter(u => u.type === 'port');
                    if (selectedPortIndices.length === 1) {
                        const portIdx = selectedPortIndices[0].index;
                        const port = gameState.ports[portIdx];
                        const shipData = SHIPS.cutter;
                        if (!port.buildQueue && !port.repair && canAfford(gameState.resources, shipData.cost)) {
                            if (!canAffordCrew(gameState, shipData.crewCost || 0)) {
                                showNotification(gameState, "Max crew reached. Build more settlements.");
                            } else {
                                deductCost(gameState.resources, shipData.cost);
                                startBuilding(port, 'cutter');
                                console.log("Started building: cutter (hotkey C)");
                            }
                        }
                    }
                }
            }
        });

        // Hotkey 'U' to upgrade selected tower
        k.onKeyPress("u", () => {
            if (towerInfoPanelBounds?.upgradeButton) {
                const nextTowerData = TOWERS[towerInfoPanelBounds.upgradeButton.towerType];
                const selectedTowerIndices = gameState.selectedUnits.filter(u => u.type === 'tower');
                if (selectedTowerIndices.length === 1) {
                    const tower = gameState.towers[selectedTowerIndices[0].index];
                    const currentTowerData = TOWERS[tower.type];
                    const crewDiff = (nextTowerData.crewCost || 0) - (currentTowerData.crewCost || 0);
                    if (!tower.construction && canAfford(gameState.resources, nextTowerData.cost)) {
                        if (!canAffordCrew(gameState, crewDiff)) {
                            showNotification(gameState, "Max crew reached. Build more settlements.");
                        } else {
                            deductCost(gameState.resources, nextTowerData.cost);
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

        // Hotkey 'R' to repair selected unit (ships cannot repair themselves)
        k.onKeyPress("r", () => {
            // Tower repair
            const selectedTowerIndices = gameState.selectedUnits.filter(u => u.type === 'tower');
            if (selectedTowerIndices.length === 1 && towerInfoPanelBounds?.repairButton) {
                const tower = gameState.towers[selectedTowerIndices[0].index];
                if (startRepair('tower', tower, gameState.resources)) {
                    console.log("Started repairing tower (hotkey R)");
                }
                return;
            }

            // Settlement repair
            const selectedSettlementIndices = gameState.selectedUnits.filter(u => u.type === 'settlement');
            if (selectedSettlementIndices.length === 1 && settlementInfoPanelBounds?.repairButton) {
                const settlement = gameState.settlements[selectedSettlementIndices[0].index];
                if (startRepair('settlement', settlement, gameState.resources)) {
                    console.log("Started repairing settlement (hotkey R)");
                }
                return;
            }

            // Port repair
            const selectedPortIndices = gameState.selectedUnits.filter(u => u.type === 'port');
            if (selectedPortIndices.length === 1 && buildPanelBounds?.repairButton) {
                const port = gameState.ports[selectedPortIndices[0].index];
                if (startRepair('port', port, gameState.resources)) {
                    console.log("Started repairing port (hotkey R)");
                }
                return;
            }
        });

        // Click handler for selection and waypoints - delegates to input handler helpers
        function handleClick() {
            const mouseX = k.mousePos().x;
            const mouseY = k.mousePos().y;

            // Close menu panel on any click (except menu button itself, handled below)
            if (menuPanelOpen) {
                // Check if clicking the menu button to toggle off
                if (topButtonBounds && topButtonBounds.menuButton) {
                    const mb = topButtonBounds.menuButton;
                    if (mouseX >= mb.x && mouseX <= mb.x + mb.width &&
                        mouseY >= mb.y && mouseY <= mb.y + mb.height) {
                        // Let the menu button handler deal with this
                    } else {
                        // Click anywhere else closes the panel
                        gameState.timeScale = timeScaleBeforeMenu;
                        menuPanelOpen = false;
                        return;
                    }
                } else {
                    gameState.timeScale = timeScaleBeforeMenu;
                    menuPanelOpen = false;
                    return;
                }
            }

            // Handle placement mode clicks first
            if (handlePortPlacementClick(gameState)) return;
            if (handleSettlementPlacementClick(gameState)) return;
            if (handleTowerPlacementClick(gameState)) return;

            // Check top button clicks (pause/menu)
            if (topButtonBounds) {
                const { pauseButton, menuButton, speedIndicator } = topButtonBounds;
                if (pauseButton &&
                    mouseX >= pauseButton.x && mouseX <= pauseButton.x + pauseButton.width &&
                    mouseY >= pauseButton.y && mouseY <= pauseButton.y + pauseButton.height) {
                    // Toggle pause
                    gameState.timeScale = gameState.timeScale === 0 ? 1 : 0;
                    speedMenuOpen = false;
                    return;
                }
                if (menuButton &&
                    mouseX >= menuButton.x && mouseX <= menuButton.x + menuButton.width &&
                    mouseY >= menuButton.y && mouseY <= menuButton.y + menuButton.height) {
                    // Toggle menu panel
                    if (!menuPanelOpen) {
                        timeScaleBeforeMenu = gameState.timeScale || 1;
                        gameState.timeScale = 0;
                        menuPanelOpen = true;
                    } else {
                        gameState.timeScale = timeScaleBeforeMenu;
                        menuPanelOpen = false;
                    }
                    speedMenuOpen = false;
                    return;
                }

                // Check speed menu clicks
                if (speedIndicator) {
                    // If menu is open, check menu item clicks first
                    if (speedMenuOpen && speedIndicator.menu && speedIndicator.menuItems) {
                        const menu = speedIndicator.menu;
                        if (mouseX >= menu.x && mouseX <= menu.x + menu.width &&
                            mouseY >= menu.y && mouseY <= menu.y + menu.height) {
                            // Check which item was clicked
                            for (const item of speedIndicator.menuItems) {
                                if (mouseY >= item.y && mouseY <= item.y + item.height) {
                                    gameState.timeScale = item.speed;
                                    speedMenuOpen = false;
                                    return;
                                }
                            }
                        }
                    }

                    // Check click on speed indicator to toggle menu
                    if (mouseX >= speedIndicator.x && mouseX <= speedIndicator.x + speedIndicator.width &&
                        mouseY >= speedIndicator.y && mouseY <= speedIndicator.y + speedIndicator.height) {
                        speedMenuOpen = !speedMenuOpen;
                        return;
                    }

                    // Close menu if clicking outside
                    if (speedMenuOpen) {
                        speedMenuOpen = false;
                        // Don't return - allow click to pass through
                    }
                }
            }

            // Check UI panel clicks
            if (handleShipBuildPanelClick(mouseX, mouseY, shipBuildPanelBounds, gameState)) return;
            if (handleBuildPanelClick(mouseX, mouseY, buildPanelBounds, gameState)) return;
            if (handleTowerInfoPanelClick(mouseX, mouseY, towerInfoPanelBounds, gameState)) return;
            if (handleSettlementInfoPanelClick(mouseX, mouseY, settlementInfoPanelBounds, gameState)) return;
            if (handleShipInfoPanelClick(mouseX, mouseY, shipInfoPanelBounds, gameState)) return;

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
                if (handleAttackClick(gameState, worldX, worldY, hexToPixel, SELECTION_RADIUS, getShipVisualPosLocal)) {
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
                const clickedUnit = handleUnitSelection(gameState, worldX, worldY, hexToPixel, SELECTION_RADIUS, isShiftHeld, getShipVisualPosLocal);
                clickedOnUnit = clickedUnit !== null;

                // Handle double-click to select all units of same type in view
                if (clickedUnit) {
                    const now = Date.now();
                    let subType = null;

                    // Get the subtype based on unit type
                    if (clickedUnit.type === 'ship') {
                        subType = gameState.ships[clickedUnit.index].type;
                    } else if (clickedUnit.type === 'port') {
                        subType = gameState.ports[clickedUnit.index].type;
                    } else if (clickedUnit.type === 'tower') {
                        subType = gameState.towers[clickedUnit.index].type;
                    } else if (clickedUnit.type === 'settlement') {
                        subType = 'settlement';  // All settlements are same type
                    }

                    if (lastClickedUnit &&
                        lastClickedUnit.unitType === clickedUnit.type &&
                        lastClickedUnit.subType === subType &&
                        now - lastClickTime < DOUBLE_CLICK_THRESHOLD) {
                        // Double-click detected - select all units of this type in view
                        selectAllUnitsOfTypeInView(clickedUnit.type, subType);
                        lastClickedUnit = null;
                        lastClickTime = 0;
                    } else {
                        // Single click - track for potential double-click
                        lastClickedUnit = { unitType: clickedUnit.type, subType };
                        lastClickTime = now;
                    }
                } else {
                    // Clicked on empty space - reset double-click tracking
                    lastClickedUnit = null;
                    lastClickTime = 0;
                }
            }

            // If clicked on empty space...
            if (!clickedOnUnit) {
                if (isCommandHeld) {
                    // Command+click = set waypoint (try port rally point first, then ship waypoint)
                    if (!handlePortRallyPointClick(gameState, map, clickedHex)) {
                        handleWaypointClick(gameState, map, clickedHex, isShiftHeld);
                    }
                } else if (!isShiftHeld) {
                    // Regular click on empty = deselect
                    clearSelection(gameState);
                }
            }
        }

        // Right-click handler for commands (attack, waypoint, trade route, unload)
        // Acts like Command+click but without needing the modifier key
        function handleRightClick() {
            const mouseX = k.mousePos().x;
            const mouseY = k.mousePos().y;

            // Convert to world coordinates
            const worldX = (mouseX - k.width() / 2) / zoom + cameraX;
            const worldY = (mouseY - k.height() / 2) / zoom + cameraY;
            const clickedHex = pixelToHex(worldX, worldY);

            const isShiftHeld = k.isKeyDown("shift");

            // Attack pirate ship
            if (handleAttackClick(gameState, worldX, worldY, hexToPixel, SELECTION_RADIUS, getShipVisualPosLocal)) {
                return;
            }

            // Trade route to foreign port
            if (handleTradeRouteClick(gameState, map, worldX, worldY, hexToPixel, SELECTION_RADIUS)) {
                return;
            }

            // Unload at home port
            if (handleHomePortUnloadClick(gameState, map, worldX, worldY, hexToPixel, SELECTION_RADIUS)) {
                return;
            }

            // Set waypoint (try port rally point first, then ship waypoint)
            if (!handlePortRallyPointClick(gameState, map, clickedHex)) {
                handleWaypointClick(gameState, map, clickedHex, isShiftHeld);
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

            // Check each ship (skip pirate ships)
            for (let i = 0; i < gameState.ships.length; i++) {
                const ship = gameState.ships[i];
                if (ship.type === 'pirate') continue;
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

        // Select all units of the same type currently visible on screen
        function selectAllUnitsOfTypeInView(unitType, subType) {
            const halfWidth = k.width() / 2;
            const halfHeight = k.height() / 2;
            clearSelection(gameState);

            // Helper to check if position is on screen
            const isOnScreen = (screenX, screenY) => {
                return screenX >= -50 && screenX <= k.width() + 50 &&
                       screenY >= -50 && screenY <= k.height() + 50;
            };

            if (unitType === 'ship') {
                for (let i = 0; i < gameState.ships.length; i++) {
                    const ship = gameState.ships[i];
                    if (ship.type !== subType) continue;
                    if (ship.type === 'pirate') continue;  // Don't select enemy ships
                    // Exclude ships that are currently building something
                    if (isShipBuildingPort(i, gameState.ports)) continue;
                    if (isShipBuildingTower(i, gameState.towers)) continue;

                    const pos = getShipVisualPosLocal(ship);
                    const screenX = (pos.x - cameraX) * zoom + halfWidth;
                    const screenY = (pos.y - cameraY) * zoom + halfHeight;

                    if (isOnScreen(screenX, screenY)) {
                        addToSelection(gameState, 'ship', i);
                    }
                }
            } else if (unitType === 'port') {
                for (let i = 0; i < gameState.ports.length; i++) {
                    const port = gameState.ports[i];
                    if (port.type !== subType) continue;

                    const pos = hexToPixel(port.q, port.r);
                    const screenX = (pos.x - cameraX) * zoom + halfWidth;
                    const screenY = (pos.y - cameraY) * zoom + halfHeight;

                    if (isOnScreen(screenX, screenY)) {
                        addToSelection(gameState, 'port', i);
                    }
                }
            } else if (unitType === 'tower') {
                for (let i = 0; i < gameState.towers.length; i++) {
                    const tower = gameState.towers[i];
                    if (tower.type !== subType) continue;

                    const pos = hexToPixel(tower.q, tower.r);
                    const screenX = (pos.x - cameraX) * zoom + halfWidth;
                    const screenY = (pos.y - cameraY) * zoom + halfHeight;

                    if (isOnScreen(screenX, screenY)) {
                        addToSelection(gameState, 'tower', i);
                    }
                }
            } else if (unitType === 'settlement') {
                for (let i = 0; i < gameState.settlements.length; i++) {
                    const settlement = gameState.settlements[i];

                    const pos = hexToPixel(settlement.q, settlement.r);
                    const screenX = (pos.x - cameraX) * zoom + halfWidth;
                    const screenY = (pos.y - cameraY) * zoom + halfHeight;

                    if (isOnScreen(screenX, screenY)) {
                        addToSelection(gameState, 'settlement', i);
                    }
                }
            }

            const count = gameState.selectedUnits.length;
            if (count > 0) {
                console.log(`Double-click: selected ${count} ${subType}(s) in view`);
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
