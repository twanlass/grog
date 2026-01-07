// Main game scene - renders the hex map
import { hexToPixel, hexCorners, HEX_SIZE, pixelToHex, hexKey, hexNeighbors, hexDistance } from "../hex.js";
import { generateMap, getTileColor, getStippleColors, TILE_TYPES, findPortSiteOnStarterIsland } from "../mapGenerator.js";
import { createGameState, createShip, createPort, createSettlement, findStartingPosition, findOppositeStartingPositions, findTriangularStartingPositions, createAIPlayerState, findFreeAdjacentWater, getBuildableShips, startBuilding, addToBuildQueue, selectUnit, addToSelection, toggleSelection, isSelected, clearSelection, getSelectedUnits, getSelectedShips, enterPortBuildMode, exitPortBuildMode, isValidPortSite, getNextPortType, startPortUpgrade, isShipBuildingPort, enterSettlementBuildMode, exitSettlementBuildMode, isValidSettlementSite, enterTowerBuildMode, exitTowerBuildMode, isValidTowerSite, isShipBuildingTower, canAfford, deductCost, isPortBuildingSettlement, isShipAdjacentToPort, getCargoSpace, cancelTradeRoute, findNearbyWaitingHex, getHomePortIndex, canAffordCrew, showNotification, updateNotification, enterPatrolMode, exitPatrolMode, countEntitiesForOwner, isAIOwner } from "../gameState.js";
import { drawSprite, drawSpriteFlash, getSpriteSize, PORTS, SHIPS, SETTLEMENTS, TOWERS } from "../sprites/index.js";
import { createFogState, initializeFog, isVisibilityDirty, recalculateVisibility, updateFogAnimations, isHexVisible } from "../fogOfWar.js";

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
import { drawSimpleUIPanels, drawGameMenu, drawShipInfoPanel, drawTowerInfoPanel, drawSettlementInfoPanel, drawConstructionStatusPanel, drawShipBuildPanel, drawPortBuildPanel, drawNotification, drawTooltip, drawMenuPanel, drawDebugPanel, drawBuildQueuePanel } from "../rendering/uiPanels.js";
import { createMinimapState, drawMinimap, minimapClickToWorld } from "../rendering/minimap.js";

// Game systems
import { updateShipMovement, getShipVisualPos, updatePirateAI } from "../systems/shipMovement.js";
import { updateTradeRoutes } from "../systems/tradeRoutes.js";
import { updateConstruction } from "../systems/construction.js";
import { updateResourceGeneration } from "../systems/resourceGeneration.js";
import { updateCombat, updatePirateRespawns, handlePatrolAutoAttack, findCenterSpawnPositions } from "../systems/combat.js";
import { updateWaveSpawner, getWaveStatus } from "../systems/waveSpawner.js";
import { updateRepair } from "../systems/repair.js";
import { startRepair } from "../systems/repair.js";
import { updateAIPlayer } from "../systems/aiPlayer.js";
import {
    handlePortPlacementClick, handleSettlementPlacementClick, handleTowerPlacementClick,
    handleShipBuildPanelClick, handleBuildPanelClick, handleBuildQueueClick, handleTowerInfoPanelClick, handleSettlementInfoPanelClick, handleShipInfoPanelClick,
    handleTradeRouteClick, handleHomePortUnloadClick,
    handleUnitSelection, handleWaypointClick, handleAttackClick, handlePortRallyPointClick,
    handlePatrolWaypointClick
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

export function createGameScene(k, getScenarioId = () => DEFAULT_SCENARIO_ID, getAIStrategy = () => null) {
    return function gameScene() {
        // Prevent browser context menu on right-click
        k.canvas.addEventListener("contextmenu", (e) => e.preventDefault());

        // Get scenario configuration
        const scenarioId = getScenarioId();
        const scenario = getScenario(scenarioId);

        // Get AI strategy override (null = random)
        const aiStrategyOverride = getAIStrategy();

        // Generate the map (random each time)
        const map = generateMap({
            width: scenario.mapSize.width,
            height: scenario.mapSize.height,
            versusMode: scenario.gameMode === 'versus',  // Enable fair starting islands
        });

        // Initialize game state with scenario config
        const gameState = createGameState({
            startingResources: scenario.startingResources,
        });

        // Store scenario reference for wave system
        gameState.scenario = scenario;

        // Handle initialization based on game mode
        if (scenario.gameMode === 'versus') {
            // Versus mode: use fair starting islands from map generation
            if (map.starterPositions) {
                // Randomize which position each faction gets
                const positionIndices = [0, 1, 2];
                // Fisher-Yates shuffle
                for (let i = positionIndices.length - 1; i > 0; i--) {
                    const j = Math.floor(Math.random() * (i + 1));
                    [positionIndices[i], positionIndices[j]] = [positionIndices[j], positionIndices[i]];
                }

                // Find port sites on each starter island with randomized positions
                const playerPort = findPortSiteOnStarterIsland(map, map.starterPositions[positionIndices[0]]);
                const ai1Port = findPortSiteOnStarterIsland(map, map.starterPositions[positionIndices[1]]);
                const ai2Port = findPortSiteOnStarterIsland(map, map.starterPositions[positionIndices[2]]);

                // Player start
                gameState.ports.push(createPort('dock', playerPort.q, playerPort.r, false, null, 'player'));
                gameState.homeIslandHex = { q: playerPort.q, r: playerPort.r };

                // AI 1 start
                gameState.ports.push(createPort('dock', ai1Port.q, ai1Port.r, false, null, 'ai1'));

                // AI 2 start
                gameState.ports.push(createPort('dock', ai2Port.q, ai2Port.r, false, null, 'ai2'));

                // Store AI home islands
                gameState.aiHomeIslandHexes = [
                    { q: ai1Port.q, r: ai1Port.r },
                    { q: ai2Port.q, r: ai2Port.r },
                ];

                // Initialize both AI player states (with optional strategy override)
                const aiConfig = { ...scenario.aiConfig };
                gameState.aiPlayers = [
                    createAIPlayerState(aiStrategyOverride ? { ...aiConfig, strategy: aiStrategyOverride } : aiConfig),
                    createAIPlayerState(aiConfig),  // Second AI gets random strategy
                ];
                console.log(`Versus mode: initialized ${gameState.aiPlayers.length} AIs with fair starting islands`,
                    `Strategies: ${gameState.aiPlayers.map(a => a.strategy).join(', ')}`);

                // Spawn initial pirates at map center
                if (scenario.pirateConfig && scenario.pirateConfig.startingCount > 0) {
                    const occupiedHexes = new Set(
                        gameState.ships.map(s => hexKey(s.q, s.r))
                    );
                    const spawnPositions = findCenterSpawnPositions(
                        map,
                        hexKey,
                        scenario.pirateConfig.startingCount,
                        occupiedHexes
                    );
                    for (const pos of spawnPositions) {
                        gameState.ships.push(createShip('pirate', pos.q, pos.r, 'pirate'));
                    }
                    console.log(`Versus mode: spawned ${spawnPositions.length} pirates at map center`);
                }
            } else {
                // Fallback: use old triangular position finder
                const positions = findTriangularStartingPositions(map);
                if (positions) {
                    gameState.ports.push(createPort('dock', positions.player.q, positions.player.r, false, null, 'player'));
                    gameState.homeIslandHex = { q: positions.player.q, r: positions.player.r };
                    gameState.ports.push(createPort('dock', positions.ai1.q, positions.ai1.r, false, null, 'ai1'));
                    gameState.ports.push(createPort('dock', positions.ai2.q, positions.ai2.r, false, null, 'ai2'));
                    gameState.aiHomeIslandHexes = [
                        { q: positions.ai1.q, r: positions.ai1.r },
                        { q: positions.ai2.q, r: positions.ai2.r },
                    ];
                    const aiConfig = { ...scenario.aiConfig };
                    gameState.aiPlayers = [
                        createAIPlayerState(aiStrategyOverride ? { ...aiConfig, strategy: aiStrategyOverride } : aiConfig),
                        createAIPlayerState(aiConfig),
                    ];
                } else {
                    const startTile = findStartingPosition(map);
                    if (startTile) {
                        gameState.ports.push(createPort('dock', startTile.q, startTile.r, false, null, 'player'));
                        gameState.homeIslandHex = { q: startTile.q, r: startTile.r };
                    }
                    console.warn('Could not find starting positions for versus mode');
                }
            }
        } else {
            // Sandbox and Defend modes: single player start
            const startTile = findStartingPosition(map);
            if (startTile) {
                // Place starting dock port (player must build ships)
                gameState.ports.push(createPort('dock', startTile.q, startTile.r, false, null, 'player'));

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
        }

        // Initialize fog of war
        const fogState = createFogState();
        initializeFog(fogState, gameState);

        // Initialize minimap
        const minimapState = createMinimapState(map);

        // Start ambient audio (both loop at 25% volume)
        const ambientOcean = k.play("ambient-ocean", { loop: true, volume: 0.25 });
        const ambientMusic = k.play("ambient-music", { loop: true, volume: 0.25 });

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
        let buildQueuePanelBounds = null;  // For build queue cancel buttons
        let settlementBuildPanelBounds = null;  // For settlement build button in port panel
        let towerInfoPanelBounds = null;  // For tower upgrade button
        let settlementInfoPanelBounds = null;  // For settlement repair button
        let shipInfoPanelBounds = null;  // For ship repair button
        let topButtonBounds = null;  // For pause/menu buttons
        let surrenderButtonBounds = null;  // For surrender Accept/Decline buttons
        let minimapBounds = null;  // For minimap click-to-navigate
        let gameMenuOpen = false;  // Game menu dropdown state
        let speedSubmenuOpen = false;  // Speed submenu state
        let gameMenuBounds = null;  // For game menu click detection
        let menuPanelOpen = false;  // Controls menu panel state
        let debugPanelOpen = false;  // Debug panel state
        let debugState = { hideFog: false };  // Debug toggle values
        let timeScaleBeforeMenu = 1;  // Store time scale before opening menu
        let lastNonZeroSpeed = 1;  // Track speed before pausing

        // Floating numbers for resource generation animation
        const floatingNumbers = [];
        const GENERATION_INTERVAL = 30;  // seconds between resource generation
        const GENERATION_AMOUNT = 5;     // amount of each resource generated

        // Stipple animation timer for water twinkling effect
        let stippleAnimTime = 0;

        // Game time tracker for fog animations (runs independently of game speed)
        let gameTime = 0;

        // Fog recalculation throttle (performance optimization)
        const FOG_RECALC_INTERVAL = 0.1;  // Max 10 recalculations per second
        let fogRecalcCooldown = 0;

        // Bird states (3 birds orbiting home port with varying sizes and staggered starts)
        const homeHex = gameState.homeIslandHex;
        const birdStates = homeHex ? [
            { q: homeHex.q, r: homeHex.r, frame: 0, frameTimer: 0, angle: 0, orbitRadius: 140, orbitSpeed: 0.3, scale: 1.0 },
            { q: homeHex.q, r: homeHex.r, frame: 1, frameTimer: 0.12, angle: 2.5, orbitRadius: 160, orbitSpeed: 0.26, scale: 0.85 },
            { q: homeHex.q, r: homeHex.r, frame: 0, frameTimer: 0.06, angle: 4.8, orbitRadius: 180, orbitSpeed: 0.22, scale: 0.70 },
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

            // Skip game updates when game is over or surrender pending
            if (gameState.gameOver || gameState.surrenderPending) return;

            // Delegate to game systems
            updateShipMovement(hexToPixel, gameState, map, fogState, dt, floatingNumbers);
            // Determine patrol center for pirates
            let piratePatrolCenter;
            if (scenario.gameMode === 'versus') {
                // Versus mode: pirates patrol around map center
                const centerRow = Math.floor(map.height / 2);
                const centerCol = Math.floor(map.width / 2);
                piratePatrolCenter = {
                    q: centerCol - Math.floor(centerRow / 2),
                    r: centerRow
                };
            } else {
                // Other modes: pirates patrol near player home port
                const homePortIdx = getHomePortIndex(gameState, map);
                piratePatrolCenter = homePortIdx !== null ? gameState.ports[homePortIdx] : null;
            }
            updatePirateAI(gameState, map, piratePatrolCenter, dt);
            updateAIPlayer(gameState, map, fogState, dt); // AI opponent decisions (versus mode)
            handlePatrolAutoAttack(gameState);  // Patrolling ships detect and target pirates
            updateTradeRoutes(gameState, map, dt);
            updateConstruction(gameState, map, fogState, dt, floatingNumbers);
            updateResourceGeneration(gameState, floatingNumbers, dt, map);
            updateCombat(hexToPixel, gameState, map, dt, fogState);

            // Process sound events from combat (only play if visible to player)
            if (gameState.soundEvents && gameState.soundEvents.length > 0) {
                for (const event of gameState.soundEvents) {
                    // Only play sounds for events in visible hexes
                    if (!isHexVisible(fogState, event.q, event.r)) continue;

                    if (event.type === 'cannon-fire') {
                        playCannonFire();
                    } else if (event.type === 'cannon-impact') {
                        playCannonImpact();
                    }
                }
                gameState.soundEvents = [];
            }

            updateRepair(gameState, dt);
            updatePirateRespawns(gameState, map, createShip, hexKey, dt);
            updateWaveSpawner(gameState, map, createShip, hexKey, dt, fogState);

            // Recalculate fog visibility if any vision source changed (throttled for performance)
            fogRecalcCooldown = Math.max(0, fogRecalcCooldown - rawDt);
            if (isVisibilityDirty(fogState) && fogRecalcCooldown <= 0) {
                recalculateVisibility(fogState, gameState, gameTime);
                fogRecalcCooldown = FOG_RECALC_INTERVAL;
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

            // Versus mode: total elimination win condition (3-way free-for-all)
            if (scenario && scenario.gameMode === 'versus' && !gameState.gameOver) {
                const playerCounts = countEntitiesForOwner(gameState, 'player');
                const ai1Counts = countEntitiesForOwner(gameState, 'ai1');
                const ai2Counts = countEntitiesForOwner(gameState, 'ai2');

                // Player wins only when BOTH AIs are eliminated
                if (ai1Counts.total === 0 && ai2Counts.total === 0) {
                    gameState.gameOver = 'win';
                }
                // Player loses if they have no entities left
                if (playerCounts.total === 0) {
                    gameState.gameOver = 'lose';
                }

                // Check for AI surrender: only settlements remain (no ships, ports, or towers)
                if (!gameState.surrenderPending) {
                    for (const aiOwner of ['ai1', 'ai2']) {
                        const counts = aiOwner === 'ai1' ? ai1Counts : ai2Counts;
                        const onlySettlements = counts.ships === 0 && counts.ports === 0 &&
                                                counts.towers === 0 && counts.settlements > 0;
                        if (onlySettlements && !gameState.surrenderDeclined[aiOwner]) {
                            gameState.surrenderPending = aiOwner;
                            break;  // Only one surrender at a time
                        }
                    }
                }
            }

            // Generic game over: all player ships and ports destroyed (for non-versus modes)
            if (scenario && scenario.gameMode !== 'versus' && playerShips.length === 0 && gameState.ports.length === 0) {
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

            // Animate ship sprites (for directional animated sprites like cutter-v2)
            for (const ship of gameState.ships) {
                ship.animTimer = (ship.animTimer || 0) + dt;
                if (ship.animTimer >= 0.15) {  // ~6 FPS animation
                    ship.animTimer = 0;
                    ship.animFrame = ((ship.animFrame || 0) + 1) % 3;
                }
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

            // Pass debug state to fog system for entity visibility
            fogState.debugHideFog = debugState.hideFog;

            // Draw tiles, waves, decorations, and fog (migrated to rendering modules)
            drawTiles(ctx, map, tilePositions, tileColors, tileStipples, stippleAnimTime);
            drawIslandWaves(ctx, islands, stippleAnimTime);
            drawDecorations(ctx, map, tilePositions, tileDecorations, gameState);
            if (!debugState.hideFog) {
                drawFogOfWar(ctx, map, tilePositions, fogState, gameTime);
            }

            // Draw ports (migrated to rendering module)
            drawPorts(ctx, gameState, map, fogState);

            // Draw settlements (migrated to rendering module)
            drawSettlements(ctx, gameState, fogState);

            // Keep unitScale for remaining inline code
            const unitScale = zoom * 1.5;

            // Draw towers (migrated to rendering module)
            drawTowers(ctx, gameState, fogState);

            // Draw ship water trails (migrated to rendering module)
            drawShipTrails(ctx, gameState, fogState);

            // Draw floating debris (migrated to rendering module)
            drawFloatingDebris(ctx, gameState.floatingDebris, fogState);

            // Draw loot drops
            drawLootDrops(ctx, gameState.lootDrops, fogState);

            // Draw loot collection sparkles
            drawLootSparkles(ctx, gameState.lootSparkles);

            // Draw unit hover highlight (before units so it appears underneath)
            drawUnitHoverHighlight(ctx, gameState, getShipVisualPosLocal, SELECTION_RADIUS, fogState);

            // Draw waypoints and rally points (before units so they appear underneath)
            drawWaypointsAndRallyPoints(ctx, gameState, getShipVisualPosLocal, map);

            // Draw ships (migrated to rendering module)
            drawShips(ctx, gameState, fogState, getShipVisualPosLocal);

            // Draw projectiles (migrated to rendering module)
            drawProjectiles(ctx, gameState, fogState);

            // Draw water splashes (migrated to rendering module)
            drawWaterSplashes(ctx, gameState, fogState);

            // Draw ship explosions (migrated to rendering module)
            drawExplosions(ctx, gameState, fogState);

            // Draw health bars (migrated to rendering module)
            drawHealthBars(ctx, gameState, getShipVisualPosLocal, fogState);

            // Draw loading/unloading progress bars (migrated to rendering module)
            drawDockingProgress(ctx, gameState, getShipVisualPosLocal, fogState);

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
            topButtonBounds = drawSimpleUIPanels(ctx, gameState, waveStatus);

            // Draw game menu dropdown
            gameMenuBounds = drawGameMenu(ctx, gameState, { open: gameMenuOpen, speedSubmenuOpen });

            // Draw minimap (pass camera position for viewport indicator, gameState and islands for attack alerts)
            minimapBounds = drawMinimap(ctx, minimapState, map, fogState, cameraX, cameraY, zoom, gameState, islands);

            // Build panel UI (when exactly one port is selected)
            const selectedPortIndices = gameState.selectedUnits.filter(u => u.type === 'port');
            buildPanelBounds = null;
            buildQueuePanelBounds = null;

            if (selectedPortIndices.length === 1) {
                const portIndex = selectedPortIndices[0].index;
                const port = gameState.ports[portIndex];
                buildPanelBounds = drawPortBuildPanel(ctx, port, portIndex, gameState, { isPortBuildingSettlement });

                // Draw build queue panel at bottom center (if port has items in queue)
                buildQueuePanelBounds = drawBuildQueuePanel(ctx, port, k.mousePos());
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

            // Draw tooltip if present (from ship build panel hover)
            if (shipBuildPanelBounds?.tooltip) {
                drawTooltip(ctx, shipBuildPanelBounds.tooltip);
            }

            // Tower info panel (bottom right, when tower is selected)
            const selectedTowerIndices = gameState.selectedUnits.filter(u => u.type === 'tower');
            towerInfoPanelBounds = null;
            if (selectedTowerIndices.length === 1) {
                const tower = gameState.towers[selectedTowerIndices[0].index];
                towerInfoPanelBounds = drawTowerInfoPanel(ctx, tower, gameState);
            }

            // Draw tooltip if present (from tower panel hover)
            if (towerInfoPanelBounds?.tooltip) {
                drawTooltip(ctx, towerInfoPanelBounds.tooltip);
            }

            // Settlement info panel (bottom right, when settlement is selected)
            const selectedSettlementIndices = gameState.selectedUnits.filter(u => u.type === 'settlement');
            settlementInfoPanelBounds = null;
            if (selectedSettlementIndices.length === 1 && selectedTowerIndices.length === 0) {
                const settlement = gameState.settlements[selectedSettlementIndices[0].index];
                settlementInfoPanelBounds = drawSettlementInfoPanel(ctx, settlement, gameState);
            }

            // Ship info panel (bottom left, when ship is selected and NOT showing build panel)
            shipInfoPanelBounds = null;
            if (selectedShipIndices.length === 1 && selectedTowerIndices.length === 0 && selectedSettlementIndices.length === 0 && !shipBuildPanelBounds) {
                const ship = gameState.ships[selectedShipIndices[0].index];
                shipInfoPanelBounds = drawShipInfoPanel(ctx, ship, gameState);
            }

            // Draw notification message (bottom center)
            drawNotification(ctx, gameState.notification);

            // Game over overlay
            // Draw pause overlay (when paused and not in menus or game over)
            if (gameState.timeScale === 0 && !menuPanelOpen && !gameMenuOpen && !gameState.gameOver) {
                const screenWidth = k.width();
                const screenHeight = k.height();

                // Semi-transparent overlay
                k.drawRect({
                    pos: k.vec2(0, 0),
                    width: screenWidth,
                    height: screenHeight,
                    color: k.rgb(0, 0, 0),
                    opacity: 0.5,
                });

                // Pause text
                k.drawText({
                    text: "PAUSED",
                    pos: k.vec2(screenWidth / 2, screenHeight / 2 - 20),
                    size: 48,
                    anchor: "center",
                    color: k.rgb(200, 210, 220),
                });

                k.drawText({
                    text: "Press . to resume",
                    pos: k.vec2(screenWidth / 2, screenHeight / 2 + 30),
                    size: 14,
                    anchor: "center",
                    color: k.rgb(120, 130, 140),
                });
            }

            // Surrender screen (shown when AI only has settlements left)
            if (gameState.surrenderPending && !gameState.gameOver) {
                const screenWidth = k.width();
                const screenHeight = k.height();
                const mousePos = k.mousePos();

                // Semi-transparent overlay
                k.drawRect({
                    pos: k.vec2(0, 0),
                    width: screenWidth,
                    height: screenHeight,
                    color: k.rgb(0, 0, 0),
                    opacity: 0.7,
                });

                // Title
                k.drawText({
                    text: "ENEMY SURRENDERS",
                    pos: k.vec2(screenWidth / 2, screenHeight / 2 - 60),
                    size: 42,
                    anchor: "center",
                    color: k.rgb(230, 190, 60),  // Gold/yellow
                });

                // Subtitle
                const aiName = gameState.surrenderPending === 'ai1' ? 'Red forces' : 'Orange forces';
                k.drawText({
                    text: `${aiName} request surrender.`,
                    pos: k.vec2(screenWidth / 2, screenHeight / 2 - 15),
                    size: 18,
                    anchor: "center",
                    color: k.rgb(180, 180, 180),
                });
                k.drawText({
                    text: "Only settlements remain.",
                    pos: k.vec2(screenWidth / 2, screenHeight / 2 + 10),
                    size: 16,
                    anchor: "center",
                    color: k.rgb(140, 140, 140),
                });

                // Buttons
                const buttonWidth = 140;
                const buttonHeight = 36;
                const buttonGap = 20;
                const buttonY = screenHeight / 2 + 55;

                const acceptX = screenWidth / 2 - buttonWidth - buttonGap / 2;
                const declineX = screenWidth / 2 + buttonGap / 2;

                // Check hover states
                const acceptHovered = mousePos.x >= acceptX && mousePos.x <= acceptX + buttonWidth &&
                                      mousePos.y >= buttonY && mousePos.y <= buttonY + buttonHeight;
                const declineHovered = mousePos.x >= declineX && mousePos.x <= declineX + buttonWidth &&
                                       mousePos.y >= buttonY && mousePos.y <= buttonY + buttonHeight;

                // Accept button (green)
                k.drawRect({
                    pos: k.vec2(acceptX, buttonY),
                    width: buttonWidth,
                    height: buttonHeight,
                    color: acceptHovered ? k.rgb(80, 160, 80) : k.rgb(60, 130, 60),
                    radius: 6,
                });
                k.drawText({
                    text: "Accept",
                    pos: k.vec2(acceptX + buttonWidth / 2, buttonY + buttonHeight / 2),
                    size: 16,
                    anchor: "center",
                    color: k.rgb(255, 255, 255),
                });

                // Decline button (red/gray)
                k.drawRect({
                    pos: k.vec2(declineX, buttonY),
                    width: buttonWidth,
                    height: buttonHeight,
                    color: declineHovered ? k.rgb(140, 70, 70) : k.rgb(100, 60, 60),
                    radius: 6,
                });
                k.drawText({
                    text: "Decline",
                    pos: k.vec2(declineX + buttonWidth / 2, buttonY + buttonHeight / 2),
                    size: 16,
                    anchor: "center",
                    color: k.rgb(255, 255, 255),
                });

                // Store button bounds for click handling
                surrenderButtonBounds = {
                    accept: { x: acceptX, y: buttonY, width: buttonWidth, height: buttonHeight },
                    decline: { x: declineX, y: buttonY, width: buttonWidth, height: buttonHeight },
                };
            } else {
                surrenderButtonBounds = null;
            }

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
                let subtitle;
                if (scenario && scenario.gameMode === 'versus') {
                    subtitle = isLose ? "Your forces were eliminated" : "Enemy forces eliminated!";
                } else {
                    subtitle = isLose ? "Your home port was destroyed" : "You survived!";
                }
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
                    text: "Press SPACE to continue",
                    pos: k.vec2(screenWidth / 2, screenHeight / 2 + 60),
                    size: 14,
                    anchor: "center",
                    color: k.rgb(120, 120, 120),
                });
            }

            // Draw birds at the very top (above all UI)
            drawBirds(ctx, birdStates);

            // Draw menu panel last (above birds) when open
            if (menuPanelOpen) {
                topButtonBounds.menuPanel = drawMenuPanel(ctx);
            }

            // Draw debug panel when open
            if (debugPanelOpen) {
                topButtonBounds.debugPanel = drawDebugPanel(ctx, debugState);
            }
        });

        // Left-click/drag for selection or panning (spacebar + left-click)
        k.onMousePress("left", () => {
            if (gameState.gameOver || gameState.surrenderPending) return; // Block clicks during overlays
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

            // Handle surrender button clicks
            if (gameState.surrenderPending && surrenderButtonBounds) {
                const mousePos = k.mousePos();
                const accept = surrenderButtonBounds.accept;
                const decline = surrenderButtonBounds.decline;

                // Check Accept button
                if (mousePos.x >= accept.x && mousePos.x <= accept.x + accept.width &&
                    mousePos.y >= accept.y && mousePos.y <= accept.y + accept.height) {
                    // Remove surrendering AI's settlements
                    const aiOwner = gameState.surrenderPending;
                    gameState.settlements = gameState.settlements.filter(s => s.owner !== aiOwner);
                    gameState.surrenderPending = null;
                    // Win condition will be checked next frame if both AIs are now eliminated
                    isLeftMouseDown = false;
                    return;
                }

                // Check Decline button
                if (mousePos.x >= decline.x && mousePos.x <= decline.x + decline.width &&
                    mousePos.y >= decline.y && mousePos.y <= decline.y + decline.height) {
                    // Mark as declined so it won't be offered again
                    gameState.surrenderDeclined[gameState.surrenderPending] = true;
                    gameState.surrenderPending = null;
                    isLeftMouseDown = false;
                    return;
                }

                // Clicked outside buttons - ignore other clicks while surrender screen is up
                isLeftMouseDown = false;
                return;
            }

            // Check for minimap click first (navigate camera)
            const mousePos = k.mousePos();
            const minimapClick = minimapClickToWorld(mousePos.x, mousePos.y, minimapBounds, minimapState);
            if (minimapClick.hit) {
                cameraX = minimapClick.worldX;
                cameraY = minimapClick.worldY;
                isLeftMouseDown = false;
                isSelecting = false;
                return;
            }

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
            if (gameState.gameOver || gameState.surrenderPending) return;
            isRightMouseDown = true;

            // Start tracking for potential pan
            panStartX = k.mousePos().x;
            panStartY = k.mousePos().y;
            cameraStartX = cameraX;
            cameraStartY = cameraY;
        });

        k.onMouseRelease("right", () => {
            if (gameState.gameOver || gameState.surrenderPending) return;

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

        // Arrow key panning and cursor management
        const CURSOR_DEFAULT = "url('/sprites/assets/cursor.png'), auto";
        const CURSOR_ATTACK = "url('/sprites/assets/cursor-attack.png'), auto";
        let currentCursor = CURSOR_DEFAULT;

        k.onUpdate(() => {
            const panSpeed = 300 / zoom;
            const mouse = k.mousePos();

            // Arrow key panning
            if (k.isKeyDown("up")) cameraY -= panSpeed * k.dt();
            if (k.isKeyDown("down")) cameraY += panSpeed * k.dt();
            if (k.isKeyDown("left")) cameraX -= panSpeed * k.dt();
            if (k.isKeyDown("right")) cameraX += panSpeed * k.dt();

            // Cursor state: show attack cursor when hovering over enemy units
            let newCursor = CURSOR_DEFAULT;
            const halfW = k.width() / 2;
            const halfH = k.height() / 2;
            const worldX = (mouse.x - halfW) / zoom + cameraX;
            const worldY = (mouse.y - halfH) / zoom + cameraY;

            // Check if hovering over an enemy ship (pirate or AI-owned)
            for (const ship of gameState.ships) {
                const isEnemy = ship.type === 'pirate' || isAIOwner(ship.owner);
                if (!isEnemy) continue;
                const pos = hexToPixel(ship.q, ship.r);
                const dx = worldX - pos.x;
                const dy = worldY - pos.y;
                if (Math.sqrt(dx * dx + dy * dy) < SELECTION_RADIUS) {
                    newCursor = CURSOR_ATTACK;
                    break;
                }
            }

            // Check if hovering over any enemy structure (tower, port, settlement)
            if (newCursor === CURSOR_DEFAULT) {
                const allStructures = [...gameState.towers, ...gameState.ports, ...gameState.settlements];
                for (const structure of allStructures) {
                    if (!isAIOwner(structure.owner)) continue;
                    const pos = hexToPixel(structure.q, structure.r);
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
                zoom = Math.min(zoom * zoomFactor, 1);  // Max zoom in at 1 (default)
            } else {
                zoom = Math.max(zoom / zoomFactor, 0.3);  // Can zoom out to 0.3
            }
        });

        // Time scale controls
        k.onKeyPress("1", () => { gameState.timeScale = 1; gameMenuOpen = false; speedSubmenuOpen = false; });
        k.onKeyPress("2", () => { gameState.timeScale = 2; gameMenuOpen = false; speedSubmenuOpen = false; });
        k.onKeyPress("3", () => { gameState.timeScale = 3; gameMenuOpen = false; speedSubmenuOpen = false; });
        k.onKeyPress("4", () => { gameState.timeScale = 4; gameMenuOpen = false; speedSubmenuOpen = false; });
        k.onKeyPress("5", () => { gameState.timeScale = 5; gameMenuOpen = false; speedSubmenuOpen = false; });
        k.onKeyPress(".", () => {
            if (gameState.timeScale === 0) {
                gameState.timeScale = lastNonZeroSpeed;
            } else {
                lastNonZeroSpeed = gameState.timeScale;
                gameState.timeScale = 0;
            }
            gameMenuOpen = false;
            speedSubmenuOpen = false;
        });

        // P to enter patrol mode (when ships selected)
        k.onKeyPress("p", () => {
            const selectedShips = getSelectedShips(gameState);
            // Filter to only player-controlled ships
            const playerShips = selectedShips.filter(ship =>
                ship && ship.type !== 'pirate' && !isAIOwner(ship.owner)
            );
            if (playerShips.length > 0) {
                enterPatrolMode(gameState);
                // Add first patrol waypoint for each ship
                for (const ship of playerShips) {
                    // Use current waypoint destination if moving, otherwise current position
                    const firstWaypoint = ship.waypoints && ship.waypoints.length > 0
                        ? { q: ship.waypoints[0].q, r: ship.waypoints[0].r }
                        : { q: ship.q, r: ship.r };
                    ship.patrolRoute = [firstWaypoint];
                    ship.isPatrolling = true;
                    ship.showRouteLine = true;
                    // Don't clear waypoints/path - let ship continue to current destination
                }
                showNotification(gameState, "Right click to add waypoints for a patrol route");
            }
        });

        // H to center camera on home port
        k.onKeyPress("h", () => {
            const homePortIndex = getHomePortIndex(gameState, map);
            if (homePortIndex !== null) {
                const homePort = gameState.ports[homePortIndex];
                const pos = hexToPixel(homePort.q, homePort.r);
                cameraX = pos.x;
                cameraY = pos.y;
                zoom = 1;  // Reset zoom when snapping home
            }
        });

        // Space to return to title when game over
        k.onKeyPress("space", () => {
            if (gameState.gameOver) {
                ambientOcean.stop();
                ambientMusic.stop();
                k.go("title");
            }
        });

        // ESC to cancel placement modes or deselect all units
        k.onKeyPress("escape", () => {
            if (gameMenuOpen) {
                gameMenuOpen = false;
                speedSubmenuOpen = false;
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
            } else if (gameState.patrolMode.active) {
                exitPatrolMode(gameState);
                clearSelection(gameState);
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

        // Hotkey 'C' to build a Cutter at selected port(s) - round-robin
        let lastBuildPortOffset = -1; // Track which port got the last build
        let lastSelectedPortIds = []; // Track selection to reset round-robin on change

        k.onKeyPress("c", () => {
            const selectedPortIndices = gameState.selectedUnits.filter(u => u.type === 'port');
            if (selectedPortIndices.length === 0) return;

            // Reset round-robin if selection changed
            const currentPortIds = selectedPortIndices.map(s => s.index).join(',');
            if (currentPortIds !== lastSelectedPortIds) {
                lastBuildPortOffset = -1;
                lastSelectedPortIds = currentPortIds;
            }

            const shipData = SHIPS.cutter;
            const numPorts = selectedPortIndices.length;

            // Round-robin: start from next port after last successful build
            for (let i = 0; i < numPorts; i++) {
                const offset = (lastBuildPortOffset + 1 + i) % numPorts;
                const sel = selectedPortIndices[offset];
                const port = gameState.ports[sel.index];
                const maxQueueSize = PORTS[port.type]?.maxQueueSize || 3;

                // Skip ineligible ports
                if (!getBuildableShips(port).includes('cutter')) continue;
                if (port.buildQueue.length >= maxQueueSize) continue;
                if (port.repair) continue;
                if (port.construction) continue;

                // Check affordability only if queue empty
                if (port.buildQueue.length === 0) {
                    if (!canAfford(gameState.resources, shipData.cost)) continue;
                    if (!canAffordCrew(gameState, shipData.crewCost || 0)) {
                        showNotification(gameState, "Max crew reached.");
                        continue;
                    }
                    deductCost(gameState.resources, shipData.cost);
                    addToBuildQueue(port, 'cutter', gameState.resources, true);
                    port.buildQueue[0].progress = 0;
                } else {
                    // Queue has items - just add without resource check
                    addToBuildQueue(port, 'cutter', gameState.resources, false);
                }
                lastBuildPortOffset = offset; // Remember which port we used
                break; // One ship per keypress
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

        // UI click sound helper
        function playUIClick() {
            k.play("ui-click", { volume: 0.4 });
        }

        // Ship selection sound helper (plays random 1-5)
        function playShipSelect() {
            const soundNum = Math.floor(Math.random() * 5) + 1;
            k.play(`select-ship-${soundNum}`, { volume: 0.4 });
        }

        // Cannon fire sound helper (plays random 1-4)
        function playCannonFire() {
            const soundNum = Math.floor(Math.random() * 4) + 1;
            k.play(`cannon-fire-${soundNum}`, { volume: 0.3 });
        }

        // Cannon impact sound helper (plays random 1-5)
        function playCannonImpact() {
            const soundNum = Math.floor(Math.random() * 5) + 1;
            k.play(`cannon-impact-${soundNum}`, { volume: 0.3 });
        }

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

            // Handle debug panel clicks
            if (debugPanelOpen && topButtonBounds && topButtonBounds.debugPanel) {
                const panel = topButtonBounds.debugPanel.panel;
                const options = topButtonBounds.debugPanel.options;

                // Check if clicking on an option checkbox
                for (const opt of options) {
                    if (mouseX >= opt.x && mouseX <= opt.x + opt.width &&
                        mouseY >= opt.y && mouseY <= opt.y + opt.height) {
                        playUIClick();
                        // Toggle the option
                        if (opt.id === 'hideFog') {
                            debugState.hideFog = !debugState.hideFog;
                        }
                        return;
                    }
                }

                // Click inside panel but not on option - do nothing
                if (mouseX >= panel.x && mouseX <= panel.x + panel.width &&
                    mouseY >= panel.y && mouseY <= panel.y + panel.height) {
                    return;
                }

                // Click outside panel - close it
                debugPanelOpen = false;
                return;
            }

            // Handle placement mode clicks first
            if (handlePortPlacementClick(gameState)) { playUIClick(); return; }
            if (handleSettlementPlacementClick(gameState)) { playUIClick(); return; }
            if (handleTowerPlacementClick(gameState)) { playUIClick(); return; }

            // Check game menu clicks first (when open)
            if (gameMenuBounds) {
                // Check speed submenu clicks first
                if (gameMenuBounds.speedSubmenu) {
                    const submenu = gameMenuBounds.speedSubmenu;
                    for (const item of submenu.items) {
                        if (mouseX >= item.x && mouseX <= item.x + item.width &&
                            mouseY >= item.y && mouseY <= item.y + item.height) {
                            playUIClick();
                            gameState.timeScale = item.speed;
                            gameMenuOpen = false;
                            speedSubmenuOpen = false;
                            return;
                        }
                    }
                }

                // Check main menu item clicks
                for (const item of gameMenuBounds.items) {
                    if (mouseX >= item.x && mouseX <= item.x + item.width &&
                        mouseY >= item.y && mouseY <= item.y + item.height) {
                        playUIClick();
                        if (item.id === 'controls') {
                            timeScaleBeforeMenu = gameState.timeScale || 1;
                            gameState.timeScale = 0;
                            menuPanelOpen = true;
                            gameMenuOpen = false;
                            speedSubmenuOpen = false;
                        } else if (item.id === 'speed') {
                            speedSubmenuOpen = !speedSubmenuOpen;
                        } else if (item.id === 'pause') {
                            if (gameState.timeScale === 0) {
                                gameState.timeScale = lastNonZeroSpeed;
                            } else {
                                lastNonZeroSpeed = gameState.timeScale;
                                gameState.timeScale = 0;
                            }
                        } else if (item.id === 'debug') {
                            debugPanelOpen = true;
                            gameMenuOpen = false;
                            speedSubmenuOpen = false;
                        } else if (item.id === 'quit') {
                            ambientOcean.stop();
                            ambientMusic.stop();
                            k.go("title");
                        }
                        return;
                    }
                }

                // Click on menu background (but not items) - do nothing, keep menu open
                const menu = gameMenuBounds.menu;
                if (mouseX >= menu.x && mouseX <= menu.x + menu.width &&
                    mouseY >= menu.y && mouseY <= menu.y + menu.height) {
                    return;
                }

                // Click outside menu - close it
                gameMenuOpen = false;
                speedSubmenuOpen = false;
                // Don't return - allow click to pass through
            }

            // Check top button clicks (menu button)
            if (topButtonBounds) {
                const { menuButton } = topButtonBounds;
                if (menuButton &&
                    mouseX >= menuButton.x && mouseX <= menuButton.x + menuButton.width &&
                    mouseY >= menuButton.y && mouseY <= menuButton.y + menuButton.height) {
                    // Toggle game menu
                    playUIClick();
                    gameMenuOpen = !gameMenuOpen;
                    speedSubmenuOpen = false;
                    return;
                }
            }

            // Check UI panel clicks
            if (handleShipBuildPanelClick(mouseX, mouseY, shipBuildPanelBounds, gameState)) { playUIClick(); return; }
            if (handleBuildPanelClick(mouseX, mouseY, buildPanelBounds, gameState)) { playUIClick(); return; }
            if (handleBuildQueueClick(mouseX, mouseY, buildQueuePanelBounds, gameState)) { playUIClick(); return; }
            if (handleTowerInfoPanelClick(mouseX, mouseY, towerInfoPanelBounds, gameState)) { playUIClick(); return; }
            if (handleSettlementInfoPanelClick(mouseX, mouseY, settlementInfoPanelBounds, gameState)) { playUIClick(); return; }
            if (handleShipInfoPanelClick(mouseX, mouseY, shipInfoPanelBounds, gameState)) { playUIClick(); return; }

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
                if (handleAttackClick(gameState, map, worldX, worldY, hexToPixel, SELECTION_RADIUS, getShipVisualPosLocal)) {
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
                        // Don't play sound here - first click already played it
                        selectAllUnitsOfTypeInView(clickedUnit.type, subType);
                        lastClickedUnit = null;
                        lastClickTime = 0;
                    } else {
                        // Single click - play sound and track for potential double-click
                        if (clickedUnit.type === 'ship') {
                            playShipSelect();
                        } else {
                            playUIClick();
                        }
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

            // Attack enemy (skips ports if shift held for plundering)
            if (handleAttackClick(gameState, map, worldX, worldY, hexToPixel, SELECTION_RADIUS, getShipVisualPosLocal, isShiftHeld)) {
                return;
            }

            // Plunder route to enemy port (requires shift)
            if (handleTradeRouteClick(gameState, map, worldX, worldY, hexToPixel, SELECTION_RADIUS, isShiftHeld)) {
                return;
            }

            // Unload at home port
            if (handleHomePortUnloadClick(gameState, map, worldX, worldY, hexToPixel, SELECTION_RADIUS)) {
                return;
            }

            // Patrol mode - add waypoints to patrol route
            if (gameState.patrolMode.active) {
                handlePatrolWaypointClick(gameState, map, clickedHex);
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

            // Track if any ships are selected for sound
            let shipsSelected = false;

            // Check each ship (skip pirate and AI-owned ships)
            for (let i = 0; i < gameState.ships.length; i++) {
                const ship = gameState.ships[i];
                if (ship.type === 'pirate') continue;
                if (isAIOwner(ship.owner)) continue;
                const pos = getShipVisualPosLocal(ship);
                const screenX = (pos.x - effectiveCameraX) * zoom + halfWidth;
                const screenY = (pos.y - effectiveCameraY) * zoom + halfHeight;

                if (screenX >= boxLeft && screenX <= boxRight &&
                    screenY >= boxTop && screenY <= boxBottom) {
                    addToSelection(gameState, 'ship', i);
                    shipsSelected = true;
                }
            }

            // Check each port (skip AI-owned ports)
            for (let i = 0; i < gameState.ports.length; i++) {
                const port = gameState.ports[i];
                if (isAIOwner(port.owner)) continue;
                const pos = hexToPixel(port.q, port.r);
                const screenX = (pos.x - effectiveCameraX) * zoom + halfWidth;
                const screenY = (pos.y - effectiveCameraY) * zoom + halfHeight;

                if (screenX >= boxLeft && screenX <= boxRight &&
                    screenY >= boxTop && screenY <= boxBottom) {
                    addToSelection(gameState, 'port', i);
                }
            }

            // Check each settlement (skip AI-owned settlements)
            for (let i = 0; i < gameState.settlements.length; i++) {
                const settlement = gameState.settlements[i];
                if (isAIOwner(settlement.owner)) continue;
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
                // Play ship selection sound if any ships were selected
                if (shipsSelected) {
                    playShipSelect();
                }
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
                    if (ship.type === 'pirate') continue;  // Don't select pirate ships
                    if (isAIOwner(ship.owner)) continue;   // Don't select AI ships
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
                    if (isAIOwner(port.owner)) continue;   // Don't select AI ports

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
                    if (isAIOwner(tower.owner)) continue;   // Don't select AI towers

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
                    if (isAIOwner(settlement.owner)) continue;  // Don't select AI settlements

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
        if (gameState.homeIslandHex) {
            const startPos = hexToPixel(gameState.homeIslandHex.q, gameState.homeIslandHex.r);
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
