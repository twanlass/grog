// Main game scene - renders the hex map
import { hexToPixel, hexCorners, HEX_SIZE, pixelToHex, hexKey, hexNeighbors, hexDistance } from "../hex.js";
import { generateMap, getTileColor, getStippleColors, TILE_TYPES, findPortSiteOnStarterIsland, isWater } from "../mapGenerator.js";
import { createGameState, createShip, createPort, createSettlement, createTower, findStartingPosition, findOppositeStartingPositions, findTriangularStartingPositions, createAIPlayerState, findFreeAdjacentWater, getBuildableShips, startBuilding, addToBuildQueue, selectUnit, addToSelection, toggleSelection, isSelected, clearSelection, getSelectedUnits, getSelectedShips, enterPortBuildMode, exitPortBuildMode, isValidPortSite, getNextPortType, startPortUpgrade, isShipBuildingPort, enterSettlementBuildMode, exitSettlementBuildMode, isValidSettlementSite, enterTowerBuildMode, exitTowerBuildMode, isValidTowerSite, isShipBuildingTower, canAfford, deductCost, isPortBuildingSettlement, isShipAdjacentToPort, getCargoSpace, cancelTradeRoute, findNearbyWaitingHex, getHomePortIndex, canAffordCrew, showNotification, updateNotification, enterPatrolMode, exitPatrolMode, enterActionMode, exitActionMode, countEntitiesForOwner, isAIOwner, saveSelectionToGroup, recallSelectionFromGroup, getGroupCenterPosition, resetEntityIdCounter, getResourcesForOwner, isPirateShip } from "../gameState.js";
import { drawDesignerPanel, hitTestRegion } from "../rendering/designerPanel.js";
import { clampScale, SCALE_MIN, SCALE_MAX } from "../designer/scaleTuner.js";
import { uploadSprite, resetSprite } from "../designer/assetSwap.js";
import { QUICK_SPAWN_OPTIONS, findSlot } from "../designer/assetSlots.js";
import { drawSprite, drawSpriteFlash, getSpriteSize, PORTS, SHIPS, SETTLEMENTS, TOWERS } from "../sprites/index.js";
import { createFogState, initializeFog, isVisibilityDirty, recalculateVisibility, updateFogAnimations, isHexVisible } from "../fogOfWar.js";

// Rendering modules (new - extracted from this file for better organization)
// These can be used to gradually replace inline rendering code below
import { createRenderContext } from "../rendering/renderContext.js";
import { drawTiles, drawFogOfWar, drawDecorations } from "../rendering/tileRenderer.js";
import { computeIslands, drawIslandWaves } from "../rendering/waveRenderer.js";
import { CRT_CONFIG, applyCRTPreset } from "../rendering/crtPostEffect.js";

// Seeded random for deterministic decoration placement
function seededRandom(seed) {
    const x = Math.sin(seed * 12.9898) * 43758.5453;
    return x - Math.floor(x);
}
import { drawPorts, drawSettlements, drawTowers, drawShips, drawFloatingNumbers, drawBirds, drawDockingProgress } from "../rendering/unitRenderer.js";
import { drawFloatingDebris, drawProjectiles, drawWaterSplashes, drawExplosions, drawHealthBars, drawLootDrops, drawLootSparkles } from "../rendering/effectsRenderer.js";
import { drawShipSelectionIndicators, drawPortSelectionIndicators, drawSettlementSelectionIndicators, drawTowerSelectionIndicators, drawSelectionBox, drawAllSelectionUI, drawUnitHoverHighlight, drawWaypointsAndRallyPoints } from "../rendering/selectionUI.js";
import { drawPortPlacementMode, drawSettlementPlacementMode, drawTowerPlacementMode, drawAllPlacementUI } from "../rendering/placementUI.js";
import { drawSimpleUIPanels, drawGameMenu, drawShipInfoPanel, drawTowerInfoPanel, drawSettlementInfoPanel, drawConstructionStatusPanel, drawShipBuildPanel, drawPortBuildPanel, drawNotification, drawTooltip, drawMenuPanel, drawDebugPanel, drawBuildQueuePanel, drawSelectedShipsPanel, drawActionButtons } from "../rendering/uiPanels.js";
import { createMinimapState, drawMinimap, minimapClickToWorld } from "../rendering/minimap.js";

// Game systems
import { updateShipMovement, getShipVisualPos, updatePirateAI } from "../systems/shipMovement.js";
import { updateTradeRoutes } from "../systems/tradeRoutes.js";
import { updateConstruction } from "../systems/construction.js";
import { updateResourceGeneration } from "../systems/resourceGeneration.js";
import { updateCombat, updatePirateRespawns, handlePatrolAutoAttack, findCenterSpawnPositions, armTNT } from "../systems/combat.js";
import { updateWaveSpawner, getWaveStatus } from "../systems/waveSpawner.js";
import { updateRepair } from "../systems/repair.js";
import { startRepair } from "../systems/repair.js";
import { updateAIPlayer, STRATEGY_KEYS } from "../systems/aiPlayer.js";
import {
    handlePortPlacementClick, handleSettlementPlacementClick, handleTowerPlacementClick,
    handleShipBuildPanelClick, handleBuildPanelClick, handleBuildQueueClick, handleTowerInfoPanelClick, handleSettlementInfoPanelClick, handleShipInfoPanelClick,
    handleTradeRouteClick, handleHomePortUnloadClick,
    handleUnitSelection, handleWaypointClick, handleAttackClick, handleBroadsideClick, handlePortRallyPointClick,
    handlePatrolWaypointClick
} from "../systems/inputHandler.js";

// Mobile touch support
import { isTouchDevice, initTouchHandlers, resetTouchState } from "../systems/touchHandler.js";

// Default scenario config (used if none provided)
import { getScenario, DEFAULT_SCENARIO_ID } from "../scenarios/index.js";

// Networking (multiplayer)
import { extractNetworkState, applyNetworkState } from "../networking/stateSync.js";
import { processGuestCommand } from "../networking/commandProcessor.js";
import { sendStateSnapshot, sendPlayerCommand, isConnected, getLatency, getConnectionState, CONNECTION_STATE, disconnect } from "../networking/peerConnection.js";
import { COMMAND_TYPES, createCommand } from "../networking/commands.js";
import { isVoiceEnabled as isVoiceChatActive, hasActiveCall as hasVoiceCall, isMuted as isVoiceMuted, toggleMute as toggleVoiceMute, isRemoteSpeaking as isVoicePartnerSpeaking } from "../networking/voiceChat.js";
import { setLocalPlayerId, drainPendingNetworkCommands } from "../systems/inputHandler.js";
import { markVisibilityDirty } from "../fogOfWar.js";

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

export function createGameScene(k, getScenarioId = () => DEFAULT_SCENARIO_ID, getAIStrategy = () => null, getDifficulty = () => 'normal', getAICount = () => 3, getMultiplayerConfig = () => null) {
    return function gameScene() {
        // Prevent browser context menu on right-click
        k.canvas.addEventListener("contextmenu", (e) => e.preventDefault());

        // Get scenario configuration
        const scenarioId = getScenarioId();
        const scenario = getScenario(scenarioId);

        // Multiplayer config: { isHost, isGuest, mapSeed, connection }
        const mpConfig = getMultiplayerConfig();
        const isMultiplayer = !!mpConfig;
        const isHost = mpConfig?.isHost || false;
        const isGuest = mpConfig?.isGuest || false;
        const localPlayerId = isGuest ? 'player2' : 'player';

        // Set local player identity for input handler
        setLocalPlayerId(localPlayerId);

        // Reset entity ID counter for deterministic IDs
        resetEntityIdCounter();

        // Pending guest commands (host only) - populated by network callbacks
        const pendingGuestCommands = [];

        // Latest state snapshot (guest only) - populated by network callbacks
        let latestSnapshot = null;

        // State sync timer (host sends snapshots at 10Hz)
        let stateSyncTimer = 0;
        const STATE_SYNC_INTERVAL = 0.1; // 100ms

        // Disconnect overlay state
        let disconnectOverlay = false;
        let disconnectVictory = false;

        // Get AI strategy override (null = random) and difficulty
        const aiStrategyOverride = getAIStrategy();
        const difficultyOverride = getDifficulty();

        // Generate the map — use shared seed in multiplayer for identical maps
        const mapSeed = mpConfig?.mapSeed || undefined;
        const map = generateMap({
            width: scenario.mapSize.width,
            height: scenario.mapSize.height,
            versusMode: scenario.gameMode === 'versus' || scenario.gameMode === 'multiplayer' || scenario.gameMode === 'debug',
            seed: mapSeed,
        });

        // Initialize game state with scenario config
        const gameState = createGameState({
            startingResources: scenario.startingResources,
        });

        // Store scenario reference for wave system
        gameState.scenario = scenario;

        // Debug-mode flags (read by systems below)
        if (typeof scenario.crewCapOverride === 'number') {
            gameState.crewCapOverride = scenario.crewCapOverride;
        }
        gameState.instantBuild = !!scenario.instantBuild;

        // Multiplayer: track the game mode and roles
        gameState.isMultiplayer = isMultiplayer;
        gameState.localPlayerId = localPlayerId;

        // Handle initialization based on game mode
        if (scenario.gameMode === 'multiplayer') {
            // Multiplayer 1v1: two human players, no AI, no pirates
            if (map.starterPositions) {
                // Position 0 = host ('player'), Position 1 = guest ('player2')
                const hostPort = findPortSiteOnStarterIsland(map, map.starterPositions[0]);
                const guestPort = findPortSiteOnStarterIsland(map, map.starterPositions[1]);

                gameState.ports.push(createPort('dock', hostPort.q, hostPort.r, false, null, 'player'));
                gameState.homeIslandHex = { q: hostPort.q, r: hostPort.r };

                gameState.ports.push(createPort('dock', guestPort.q, guestPort.r, false, null, 'player2'));
                gameState.player2HomeIslandHex = { q: guestPort.q, r: guestPort.r };

                // Initialize player2 resources
                gameState.player2Resources = { wood: scenario.startingResources.wood };

                // No AI players in multiplayer
                gameState.aiPlayers = [];
                gameState.aiHomeIslandHexes = [];

                console.log('Multiplayer: initialized 1v1 with host at', hostPort, 'guest at', guestPort);
            }

            // Fixed time scale in multiplayer — no pause or speed changes
            gameState.timeScale = 1;

            // Set up network callbacks (unconditional — lobby sets these to null initially)
            if (mpConfig) {
                // Host receives guest commands
                mpConfig.onGuestCommand = (cmd) => { pendingGuestCommands.push(cmd); };
                // Guest receives state snapshots
                mpConfig.onStateSnapshot = (snapshot) => { latestSnapshot = snapshot; };
                // Either side disconnects — treat as victory
                mpConfig.onDisconnect = () => {
                    disconnectOverlay = true;
                    if (!gameState.gameOver) {
                        gameState.gameOver = 'win';
                        disconnectVictory = true;
                    }
                };
            }
        } else if (scenario.gameMode === 'versus' || scenario.gameMode === 'debug') {
            // Get the selected number of AI opponents (1-3) — debug mode uses the scenario value, not the title dropdown
            const aiCount = scenario.gameMode === 'debug'
                ? (scenario.aiConfig?.aiCount ?? 1)
                : getAICount();

            // Versus mode: use fair starting islands from map generation
            if (map.starterPositions) {
                // Randomize which position each faction gets
                // We need 1 + aiCount positions (player + AIs)
                const neededPositions = 1 + aiCount;
                const positionIndices = [0, 1, 2, 3].slice(0, neededPositions);
                // Fisher-Yates shuffle
                for (let i = positionIndices.length - 1; i > 0; i--) {
                    const j = Math.floor(Math.random() * (i + 1));
                    [positionIndices[i], positionIndices[j]] = [positionIndices[j], positionIndices[i]];
                }

                // Find port sites on starter islands
                const playerPort = findPortSiteOnStarterIsland(map, map.starterPositions[positionIndices[0]]);

                // Player start
                gameState.ports.push(createPort('dock', playerPort.q, playerPort.r, false, null, 'player'));
                gameState.homeIslandHex = { q: playerPort.q, r: playerPort.r };

                // Initialize AI ports and home islands based on selected count
                const aiOwnerIds = ['ai1', 'ai2', 'ai3'];
                gameState.aiHomeIslandHexes = [];

                for (let i = 0; i < aiCount; i++) {
                    const aiPort = findPortSiteOnStarterIsland(map, map.starterPositions[positionIndices[1 + i]]);
                    gameState.ports.push(createPort('dock', aiPort.q, aiPort.r, false, null, aiOwnerIds[i]));
                    gameState.aiHomeIslandHexes.push({ q: aiPort.q, r: aiPort.r });
                }

                // Initialize AI player states dynamically
                // Ensure AIs pick different strategies for variety
                const aiConfig = { ...scenario.aiConfig, difficulty: difficultyOverride };
                gameState.aiPlayers = [];
                let usedStrategies = [];

                for (let i = 0; i < aiCount; i++) {
                    let strategy;
                    if (i === 0 && aiStrategyOverride) {
                        // First AI can use override strategy
                        strategy = aiStrategyOverride;
                    } else {
                        // Pick a strategy not yet used (or random if all used)
                        const availableStrategies = STRATEGY_KEYS.filter(s => !usedStrategies.includes(s));
                        strategy = availableStrategies.length > 0
                            ? availableStrategies[Math.floor(Math.random() * availableStrategies.length)]
                            : STRATEGY_KEYS[Math.floor(Math.random() * STRATEGY_KEYS.length)];
                    }
                    usedStrategies.push(strategy);
                    gameState.aiPlayers.push(createAIPlayerState({ ...aiConfig, strategy }));
                }

                console.log(`Versus mode: initialized ${gameState.aiPlayers.length} AIs (${aiConfig.difficulty} difficulty)`,
                    `Strategies: ${gameState.aiPlayers.map(a => a.strategy).join(', ')}`);

                // Queue initial pirates to spawn after delay
                if (scenario.pirateConfig && scenario.pirateConfig.startingCount > 0) {
                    const initialDelay = scenario.pirateConfig.initialDelay || 0;
                    for (let p = 0; p < scenario.pirateConfig.startingCount; p++) {
                        gameState.pirateRespawnQueue.push({ timer: initialDelay, spawnAtCenter: true });
                    }
                    console.log(`Versus mode: ${scenario.pirateConfig.startingCount} pirates queued to spawn in ${initialDelay}s`);
                }
            } else {
                // Fallback: use old triangular position finder (only supports up to 2 AIs)
                const positions = findTriangularStartingPositions(map);
                if (positions) {
                    const fallbackAICount = Math.min(aiCount, 2); // Triangular finder only has 2 AI positions

                    gameState.ports.push(createPort('dock', positions.player.q, positions.player.r, false, null, 'player'));
                    gameState.homeIslandHex = { q: positions.player.q, r: positions.player.r };

                    gameState.aiHomeIslandHexes = [];
                    const aiPositions = [positions.ai1, positions.ai2];

                    for (let i = 0; i < fallbackAICount; i++) {
                        const aiPos = aiPositions[i];
                        gameState.ports.push(createPort('dock', aiPos.q, aiPos.r, false, null, `ai${i + 1}`));
                        gameState.aiHomeIslandHexes.push({ q: aiPos.q, r: aiPos.r });
                    }

                    // Initialize AI player states
                    const aiConfig = { ...scenario.aiConfig, difficulty: difficultyOverride };
                    gameState.aiPlayers = [];
                    let usedStrategies = [];

                    for (let i = 0; i < fallbackAICount; i++) {
                        let strategy;
                        if (i === 0 && aiStrategyOverride) {
                            strategy = aiStrategyOverride;
                        } else {
                            const availableStrategies = STRATEGY_KEYS.filter(s => !usedStrategies.includes(s));
                            strategy = availableStrategies.length > 0
                                ? availableStrategies[Math.floor(Math.random() * availableStrategies.length)]
                                : STRATEGY_KEYS[Math.floor(Math.random() * STRATEGY_KEYS.length)];
                        }
                        usedStrategies.push(strategy);
                        gameState.aiPlayers.push(createAIPlayerState({ ...aiConfig, strategy }));
                    }
                } else {
                    const startTile = findStartingPosition(map);
                    if (startTile) {
                        gameState.ports.push(createPort('dock', startTile.q, startTile.r, false, null, 'player'));
                        gameState.homeIslandHex = { q: startTile.q, r: startTile.r };
                    }
                    console.warn('Could not find starting positions for versus mode');
                }
            }

            // Debug mode: enemy test ships are spawnable on-demand from the Designer
            // panel (Shift+D) so the player isn't immediately attacked on game start.
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
        fogState.localPlayerId = localPlayerId;
        initializeFog(fogState, gameState);

        // Initialize minimap
        const minimapState = createMinimapState(map);

        // Start ambient audio (both loop at 25% volume)
        const ambientOcean = k.play("ambient-ocean", { loop: true, volume: 0.25 });
        const ambientMusic = k.play("ambient-music", { loop: true, volume: 0.25 });

        // Mobile/tab switching: resume audio when page becomes visible again.
        // iOS/Safari suspends the AudioContext when the app is backgrounded, and Kaplay's
        // audio handles need a kick to resume looped playback.
        let audioListenerActive = true;
        function handleVisibilityChange() {
            if (!audioListenerActive) return;
            if (document.visibilityState !== 'visible') return;
            try {
                // Resume the underlying AudioContext if suspended
                const ctx = k.audioCtx || (k.audio && k.audio.ctx);
                if (ctx && typeof ctx.resume === 'function' && ctx.state === 'suspended') {
                    ctx.resume();
                }
                // Re-apply paused state to nudge handles back into playback
                const shouldPauseAudio = gameState.timeScale === 0;
                ambientOcean.paused = true;
                ambientMusic.paused = true;
                ambientOcean.paused = shouldPauseAudio;
                ambientMusic.paused = shouldPauseAudio;
            } catch (e) {
                audioListenerActive = false;
            }
        }
        document.addEventListener('visibilitychange', handleVisibilityChange);
        window.addEventListener('pageshow', handleVisibilityChange);

        function cleanupAudio() {
            audioListenerActive = false;
            document.removeEventListener('visibilitychange', handleVisibilityChange);
            window.removeEventListener('pageshow', handleVisibilityChange);
            ambientOcean.stop();
            ambientMusic.stop();
        }

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
        let actionButtonBounds = null;  // For action buttons (Move, Attack, Patrol)
        let placementCancelBounds = null;  // Mobile-only Cancel button shown during placement modes
        let gameMenuOpen = false;  // Game menu dropdown state
        let speedSubmenuOpen = false;  // Speed submenu state
        let gameMenuBounds = null;  // For game menu click detection
        let menuPanelOpen = false;  // Controls menu panel state
        let debugPanelOpen = false;  // Debug panel state
        let debugState = { hideFog: false };  // Debug toggle values
        let crtSliderDrag = null;  // Active CRT slider drag: { key, trackX, trackW, min, max }
        let designerPanelHits = null;  // Hit regions returned by drawDesignerPanel each frame
        let pendingUploadSlot = null;  // Slot the next file-input change should upload to

        // Hidden <input type="file"> reused for every designer upload (debug mode only)
        const designerFileInput = typeof document !== 'undefined' ? (() => {
            const input = document.createElement('input');
            input.type = 'file';
            input.accept = 'image/png';
            input.style.display = 'none';
            input.addEventListener('change', async () => {
                const file = input.files && input.files[0];
                input.value = '';  // allow re-selecting the same file
                if (!file || !pendingUploadSlot) return;
                const slot = pendingUploadSlot;
                pendingUploadSlot = null;
                try {
                    await uploadSprite(k, slot, file);
                    showNotification(gameState, `Swapped ${slot.label}`);
                } catch (err) {
                    console.error('Designer upload failed:', err);
                    showNotification(gameState, `Upload failed: ${slot.label}`);
                }
            });
            document.body.appendChild(input);
            return input;
        })() : null;

        // Hidden <input type="number"> reused for the Sprite-scale tuner (debug mode).
        // Positioned over the clicked value box when the user wants to type an exact value.
        let editingScaleKey = null;
        const designerScaleInput = typeof document !== 'undefined' ? (() => {
            const input = document.createElement('input');
            input.type = 'number';
            input.step = '0.01';
            input.min = String(SCALE_MIN);
            input.max = String(SCALE_MAX);
            input.style.position = 'fixed';
            input.style.display = 'none';
            input.style.font = '11px monospace';
            input.style.textAlign = 'center';
            input.style.padding = '0 2px';
            input.style.background = '#23283a';
            input.style.color = '#dcdcdc';
            input.style.border = '1px solid #6a7a90';
            input.style.borderRadius = '2px';
            input.style.outline = 'none';
            input.style.zIndex = '9999';
            // Prevent the click on the input from reaching kaplay (which would
            // otherwise start a selection box / steal focus).
            const stopProp = (e) => e.stopPropagation();
            input.addEventListener('mousedown', stopProp);
            input.addEventListener('mouseup', stopProp);
            input.addEventListener('click', stopProp);
            // Blur cancels rather than auto-commits — any accidental focus loss
            // shouldn't silently write a value the user didn't confirm.
            input.addEventListener('blur', () => closeScaleInput());
            document.body.appendChild(input);
            return input;
        })() : null;
        function commitScaleInput() {
            if (!designerScaleInput || !editingScaleKey) return;
            const parsed = clampScale(parseFloat(designerScaleInput.value));
            if (parsed !== null) gameState.designerPanel.scaleOverrides[editingScaleKey] = parsed;
            closeScaleInput();
        }
        function closeScaleInput() {
            if (!designerScaleInput) return;
            editingScaleKey = null;
            designerScaleInput.style.display = 'none';
        }
        function openScaleInput(key, region, currentValue) {
            if (!designerScaleInput) return;
            editingScaleKey = key;
            // Kaplay's draw/mouse coords are already in CSS pixels (despite the
            // `pixelDensity: devicePixelRatio` backing-store boost), so no scaling
            // is needed — just offset by the canvas's CSS-pixel position.
            const canvas = k.canvas;
            const rect = canvas ? canvas.getBoundingClientRect() : { left: 0, top: 0 };
            designerScaleInput.style.left = `${rect.left + region.x}px`;
            designerScaleInput.style.top = `${rect.top + region.y}px`;
            designerScaleInput.style.width = `${region.w}px`;
            designerScaleInput.style.height = `${region.h}px`;
            designerScaleInput.value = currentValue.toFixed(2);
            designerScaleInput.style.display = 'block';
            // Defer focus so the click that opened it doesn't immediately blur it
            setTimeout(() => { designerScaleInput.focus(); designerScaleInput.select(); }, 0);
        }

        // Window-capture key guard. Runs before kaplay's document listeners can
        // preventDefault on keystrokes (which would block typing into the input).
        // We also handle Enter/Esc here since stopPropagation prevents the
        // input's own keydown listener from ever firing.
        const scaleInputKeyGuard = (e) => {
            if (!designerScaleInput || document.activeElement !== designerScaleInput) return;
            e.stopPropagation();
            if (e.type === 'keydown') {
                if (e.key === 'Enter') { e.preventDefault(); commitScaleInput(); }
                else if (e.key === 'Escape') { e.preventDefault(); closeScaleInput(); }
            }
        };
        window.addEventListener('keydown', scaleInputKeyGuard, true);
        window.addEventListener('keyup', scaleInputKeyGuard, true);
        window.addEventListener('keypress', scaleInputKeyGuard, true);

        k.onSceneLeave(() => {
            if (designerFileInput && designerFileInput.parentNode) {
                designerFileInput.parentNode.removeChild(designerFileInput);
            }
            if (designerScaleInput && designerScaleInput.parentNode) {
                designerScaleInput.parentNode.removeChild(designerScaleInput);
            }
            window.removeEventListener('keydown', scaleInputKeyGuard, true);
            window.removeEventListener('keyup', scaleInputKeyGuard, true);
            window.removeEventListener('keypress', scaleInputKeyGuard, true);
        });
        let timeScaleBeforeMenu = 1;  // Store time scale before opening menu
        let lastNonZeroSpeed = 1;  // Track speed before pausing

        // Track shift via DOM events. Kaplay's internal keyState can desync
        // (e.g. after focus loss, or any input event whose keyup is missed),
        // leaving `k.isKeyDown("shift")` stuck true and causing every click
        // to add to the selection. We use this DOM-tracked flag instead.
        let shiftKeyHeld = false;
        const onShiftKeyDown = (e) => { if (e.key === "Shift") shiftKeyHeld = true; };
        const onShiftKeyUp = (e) => { if (e.key === "Shift") shiftKeyHeld = false; };
        const onWindowBlur = () => { shiftKeyHeld = false; };
        window.addEventListener("keydown", onShiftKeyDown);
        window.addEventListener("keyup", onShiftKeyUp);
        window.addEventListener("blur", onWindowBlur);
        k.onSceneLeave(() => {
            window.removeEventListener("keydown", onShiftKeyDown);
            window.removeEventListener("keyup", onShiftKeyUp);
            window.removeEventListener("blur", onWindowBlur);
        });

        // Floating numbers for resource generation animation
        const floatingNumbers = [];
        const GENERATION_INTERVAL = 30;  // seconds between resource generation

        // Mobile touch state
        const isMobile = isTouchDevice();
        let touchZoomBase = zoom;  // Store initial zoom for pinch gesture
        let touchPanCameraX = cameraX;  // Store initial camera for two-finger pan
        let touchPanCameraY = cameraY;
        let virtualMousePos = null;  // Override for k.mousePos() on touch devices

        // Helper to get mouse position (respects touch override)
        function getMousePos() {
            if (virtualMousePos) {
                return virtualMousePos;
            }
            return k.mousePos();
        }
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

        // ============================================================
        // Multiplayer Guest: Command sending helpers
        // The guest runs input locally (optimistic) AND sends commands to host.
        // Host state snapshots at 10Hz will correct any drift.
        // ============================================================
        function sendGuestMoveCommand(shipIds, waypoints, append = false) {
            if (!isMultiplayer || !isGuest) return;
            sendPlayerCommand(createCommand(COMMAND_TYPES.MOVE_SHIPS, { shipIds, waypoints, append }));
        }

        function sendGuestAttackCommand(shipIds, targetType, targetId) {
            if (!isMultiplayer || !isGuest) return;
            sendPlayerCommand(createCommand(COMMAND_TYPES.ATTACK, { shipIds, targetType, targetId }));
        }

        function sendGuestBuildShipCommand(portId, shipType) {
            if (!isMultiplayer || !isGuest) return;
            sendPlayerCommand(createCommand(COMMAND_TYPES.BUILD_SHIP, { portId, shipType }));
        }

        function sendGuestBuildPortCommand(builderShipId, portType, q, r) {
            if (!isMultiplayer || !isGuest) return;
            sendPlayerCommand(createCommand(COMMAND_TYPES.BUILD_PORT, { builderShipId, portType, q, r }));
        }

        // Generic command sender for any command type
        function sendGuestGenericCommand(type, data) {
            if (!isMultiplayer || !isGuest) return;
            sendPlayerCommand(createCommand(type, data));
        }

        // Drain any commands queued by input handler functions and send them
        function flushGuestCommands() {
            if (!isMultiplayer || !isGuest) return;
            for (const cmd of drainPendingNetworkCommands()) {
                sendPlayerCommand(createCommand(cmd.type, cmd));
            }
        }

        // After input handlers mutate state, send the corresponding command to host
        // This captures what selected ships are doing and sends their IDs + actions
        function sendGuestCommandForSelectedShips(commandType, extraData = {}) {
            if (!isMultiplayer || !isGuest) return;
            const selectedShipIds = [];
            for (const sel of gameState.selectedUnits) {
                if (sel.type !== 'ship') continue;
                const ship = gameState.ships[sel.index];
                if (ship && ship.owner === localPlayerId) {
                    selectedShipIds.push(ship.id);
                }
            }
            if (selectedShipIds.length === 0) return;
            sendPlayerCommand(createCommand(commandType, { shipIds: selectedShipIds, ...extraData }));
        }

        // Main game update loop - delegates to system modules
        k.onUpdate(() => {
            const rawDt = k.dt();
            const dt = rawDt * gameState.timeScale;

            // Pause/resume ambient audio when game is paused
            const shouldPauseAudio = gameState.timeScale === 0;
            if (ambientOcean.paused !== shouldPauseAudio) {
                ambientOcean.paused = shouldPauseAudio;
            }
            if (ambientMusic.paused !== shouldPauseAudio) {
                ambientMusic.paused = shouldPauseAudio;
            }

            // Update stipple animation (always runs, even when paused or game over)
            stippleAnimTime += rawDt;

            // Update game time for fog animations (always runs for smooth transitions)
            gameTime += rawDt;
            updateFogAnimations(fogState, gameTime);

            // Update notification timer (always runs)
            updateNotification(gameState, rawDt);

            // ===== MULTIPLAYER GUEST PATH: Apply state from host, skip simulation =====
            // Must run before gameOver early-return so guest receives the final snapshot
            if (isMultiplayer && isGuest) {
                if (latestSnapshot) {
                    applyNetworkState(gameState, latestSnapshot);
                    latestSnapshot = null;
                    // Invert game over perspective (host sends from its own POV)
                    if (gameState.gameOver === 'win') gameState.gameOver = 'lose';
                    else if (gameState.gameOver === 'lose') gameState.gameOver = 'win';
                    // Recalculate fog for guest's perspective
                    markVisibilityDirty(fogState);
                }

                // Guest still needs fog recalculation and visual updates
                fogRecalcCooldown = Math.max(0, fogRecalcCooldown - rawDt);
                if (isVisibilityDirty(fogState) && fogRecalcCooldown <= 0) {
                    recalculateVisibility(fogState, gameState, gameTime, localPlayerId);
                    fogRecalcCooldown = FOG_RECALC_INTERVAL;
                }

                // Guest-side interpolation: advance ship movement and projectiles
                // between snapshots so visuals are smooth (snapshots correct drift at 10Hz)
                for (const ship of gameState.ships) {
                    if (ship.path && ship.path.length > 0 && ship.waypoints.length > 0) {
                        const shipData = SHIPS[ship.type];
                        const speed = shipData ? shipData.speed : 1;
                        ship.moveProgress += speed * rawDt;
                    }
                }
                for (let i = gameState.projectiles.length - 1; i >= 0; i--) {
                    const proj = gameState.projectiles[i];
                    proj.progress += proj.speed * rawDt;
                    if (proj.progress >= 1) {
                        gameState.projectiles.splice(i, 1);
                    }
                }

                // Guest visual updates (hit flash decay, explosions, camera shake)
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

                // Camera shake from explosions (skip when game over — host sends stale explosions)
                if (gameState.gameOver) {
                    gameState.shipExplosions = [];
                } else {
                    const gHalfW = k.width() / 2;
                    const gHalfH = k.height() / 2;
                    for (let i = gameState.shipExplosions.length - 1; i >= 0; i--) {
                        const explosion = gameState.shipExplosions[i];
                        const delay = explosion.delay || 0;
                        // Shake on the first frames of the *visible* start (after delay),
                        // and skip entirely for `silent` secondary blasts so we don't
                        // stack shake from the TNT pyrotechnic chain.
                        if (!explosion.silent && explosion.age >= delay && explosion.age < delay + rawDt * 2) {
                            const pos = hexToPixel(explosion.q, explosion.r);
                            const screenX = (pos.x - cameraX) * zoom + gHalfW;
                            const screenY = (pos.y - cameraY) * zoom + gHalfH;
                            const margin = 100;
                            if (screenX >= -margin && screenX <= k.width() + margin &&
                                screenY >= -margin && screenY <= k.height() + margin) {
                                const shakeIntensity = explosion.massive ? 24 : 8;
                                cameraShake = Math.max(cameraShake, shakeIntensity);
                            }
                        }
                        explosion.age += dt;
                        if (explosion.age >= delay + explosion.duration) {
                            gameState.shipExplosions.splice(i, 1);
                        }
                    }
                }
                if (cameraShake > 0) {
                    cameraShakeX = (Math.random() - 0.5) * cameraShake * 2;
                    cameraShakeY = (Math.random() - 0.5) * cameraShake * 2;
                    cameraShake *= 0.92;
                    if (cameraShake < 0.1) cameraShake = 0;
                } else {
                    cameraShakeX = 0;
                    cameraShakeY = 0;
                }

                return; // Guest skips full simulation
            }

            // ===== HOST / SINGLE-PLAYER PATH: Full simulation =====

            // Host keeps sending snapshots even after game over (so guest sees the result)
            if (isMultiplayer && isHost && isConnected()) {
                stateSyncTimer += rawDt;
                if (stateSyncTimer >= STATE_SYNC_INTERVAL) {
                    stateSyncTimer = 0;
                    sendStateSnapshot(extractNetworkState(gameState));
                }
            }

            // Skip simulation when game is over or surrender pending
            if (gameState.gameOver || gameState.surrenderPending) return;

            // Process pending guest commands (multiplayer host only)
            if (isMultiplayer && isHost) {
                while (pendingGuestCommands.length > 0) {
                    const cmd = pendingGuestCommands.shift();
                    processGuestCommand(cmd, gameState, map, fogState);
                }
            }

            // Delegate to game systems
            updateShipMovement(hexToPixel, gameState, map, fogState, dt, floatingNumbers);
            // Determine patrol center for pirates
            let piratePatrolCenter;
            if (scenario.gameMode === 'versus' || scenario.gameMode === 'debug') {
                // Versus / debug: pirates (if any) patrol around map center
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
            handlePatrolAutoAttack(gameState, map);  // Patrolling ships detect and target pirates
            updateTradeRoutes(gameState, map, dt);
            // Debug mode: bypass build timers by inflating construction dt so all in-progress builds finish next frame
            const constructionDt = gameState.instantBuild ? dt * 10000 : dt;
            updateConstruction(gameState, map, fogState, constructionDt, floatingNumbers);
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
                    } else if (event.type === 'arrow-fire') {
                        playArrowFire();
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
                recalculateVisibility(fogState, gameState, gameTime, localPlayerId);
                fogRecalcCooldown = FOG_RECALC_INTERVAL;
            }

            // (Snapshot sending moved above gameOver check so guest always receives state)

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
                const delay = explosion.delay || 0;
                // Trigger camera shake on the first frames of the *visible* start
                // (after delay), and skip entirely for `silent` secondary blasts so the
                // TNT pyrotechnic chain doesn't keep retriggering shake.
                if (!explosion.silent && explosion.age >= delay && explosion.age < delay + rawDt * 2) {
                    const pos = hexToPixel(explosion.q, explosion.r);
                    const screenX = (pos.x - cameraX) * zoom + halfW;
                    const screenY = (pos.y - cameraY) * zoom + halfH;
                    const margin = 100;
                    if (screenX >= -margin && screenX <= k.width() + margin &&
                        screenY >= -margin && screenY <= k.height() + margin) {
                        // TNT detonations shake the screen 3x harder than a normal sinking
                        const shakeIntensity = explosion.massive ? 24 : 8;
                        cameraShake = Math.max(cameraShake, shakeIntensity);
                    }
                }
                explosion.age += dt;
                if (explosion.age >= delay + explosion.duration) {
                    gameState.shipExplosions.splice(i, 1);
                }
            }

            // Update camera shake
            if (cameraShake > 0) {
                cameraShakeX = (Math.random() - 0.5) * cameraShake * 2;
                cameraShakeY = (Math.random() - 0.5) * cameraShake * 2;
                cameraShake *= 0.92;  // Slower decay for dramatic effect
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
            const playerShips = gameState.ships.filter(s => !isPirateShip(s));

            // Defend mode: lose if home port is destroyed
            if (scenario && scenario.gameMode === 'defend' && !gameState.gameOver) {
                const homePortIndex = getHomePortIndex(gameState, map);
                if (homePortIndex === null) {
                    gameState.gameOver = 'lose';
                }
            }

            // Multiplayer mode: total elimination 1v1
            if (scenario && scenario.gameMode === 'multiplayer' && !gameState.gameOver) {
                const p1Counts = countEntitiesForOwner(gameState, 'player');
                const p2Counts = countEntitiesForOwner(gameState, 'player2');

                if (p2Counts.total === 0 && p1Counts.total > 0) {
                    // Host (player) wins — from host's perspective
                    gameState.gameOver = isHost ? 'win' : 'lose';
                }
                if (p1Counts.total === 0 && p2Counts.total > 0) {
                    // Guest (player2) wins — from host's perspective
                    gameState.gameOver = isHost ? 'lose' : 'win';
                }
            }

            // Versus mode: total elimination win condition (4-way free-for-all)
            if (scenario && (scenario.gameMode === 'versus' || scenario.gameMode === 'debug') && !gameState.gameOver) {
                const playerCounts = countEntitiesForOwner(gameState, 'player');
                const ai1Counts = countEntitiesForOwner(gameState, 'ai1');
                const ai2Counts = countEntitiesForOwner(gameState, 'ai2');
                const ai3Counts = countEntitiesForOwner(gameState, 'ai3');

                // Player wins only when ALL AIs are eliminated
                if (ai1Counts.total === 0 && ai2Counts.total === 0 && ai3Counts.total === 0) {
                    gameState.gameOver = 'win';
                }
                // Player loses if they have no entities left
                if (playerCounts.total === 0) {
                    gameState.gameOver = 'lose';
                }

                // Check for AI surrender: zero ships and no way to deploy a new one
                // (no port in queue, no wood for cutter, or no crew for cutter)
                if (!gameState.surrenderPending) {
                    const cutterCost = SHIPS.cutter.cost.wood;
                    const cutterCrew = SHIPS.cutter.crewCost;
                    for (const aiOwner of ['ai1', 'ai2', 'ai3']) {
                        const counts = aiOwner === 'ai1' ? ai1Counts : aiOwner === 'ai2' ? ai2Counts : ai3Counts;
                        if (counts.total === 0 || counts.ships > 0) continue;
                        if (gameState.surrenderDeclined[aiOwner]) continue;

                        const buildingShip = gameState.ports.some(p =>
                            p.owner === aiOwner && p.buildQueue && p.buildQueue.length > 0
                        );
                        if (buildingShip) continue;

                        const aiResources = getResourcesForOwner(gameState, aiOwner);
                        const canBuildCutter = counts.ports > 0 &&
                                               aiResources && aiResources.wood >= cutterCost &&
                                               canAffordCrew(gameState, cutterCrew, aiOwner);
                        if (canBuildCutter) continue;

                        gameState.surrenderPending = aiOwner;
                        break;  // Only one surrender at a time
                    }
                }
            }

            // Generic game over: all player ships and ports destroyed (for non-versus modes)
            if (scenario && scenario.gameMode !== 'versus' && scenario.gameMode !== 'debug' && playerShips.length === 0 && gameState.ports.length === 0) {
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
            drawTiles(ctx, map, tilePositions, tileColors, tileStipples, stippleAnimTime, fogState);
            drawIslandWaves(ctx, islands, stippleAnimTime, fogState);
            drawDecorations(ctx, map, tilePositions, tileDecorations, gameState, fogState);
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

            // Draw health bars (hover-only)
            drawHealthBars(ctx, gameState, getShipVisualPosLocal, fogState, SELECTION_RADIUS);

            // Draw loading/unloading progress bars (migrated to rendering module)
            drawDockingProgress(ctx, gameState, getShipVisualPosLocal, fogState);

            // Draw all selection indicators (migrated to rendering module)
            drawAllSelectionUI(ctx, gameState, getShipVisualPosLocal, null);

            // Draw placement mode UI (migrated to rendering module)
            const placementValidators = { isValidPortSite, isValidSettlementSite, isValidTowerSite };
            placementCancelBounds = drawAllPlacementUI(ctx, gameState, map, tilePositions, fogState, pixelToHex, placementValidators);

            // Draw selection box (migrated to rendering module)
            drawSelectionBox(ctx, isSelecting, selectStartX, selectStartY, selectEndX, selectEndY);

            // Draw floating resource numbers (above selection UI)
            drawFloatingNumbers(ctx, floatingNumbers);

            // Refresh voice chat status snapshot for the HUD renderer.
            // (Cheap reads of voiceChat module state — kept here so the panel
            // module doesn't import networking directly.)
            if (isMultiplayer) {
                gameState.voiceChat = {
                    active: isVoiceChatActive() && hasVoiceCall(),
                    muted: isVoiceMuted(),
                    partnerSpeaking: isVoicePartnerSpeaking(),
                };
            }

            // Draw simple UI panels (migrated to rendering module)
            const waveStatus = getWaveStatus(gameState);
            topButtonBounds = drawSimpleUIPanels(ctx, gameState, waveStatus);

            // Draw game menu dropdown
            gameMenuBounds = drawGameMenu(ctx, gameState, { open: gameMenuOpen, speedSubmenuOpen, isMultiplayer });

            // Draw minimap (pass camera position for viewport indicator, gameState and islands for attack alerts)
            minimapBounds = drawMinimap(ctx, minimapState, map, fogState, cameraX, cameraY, zoom, gameState, islands);

            // Draw action buttons (when ships are selected)
            actionButtonBounds = drawActionButtons(ctx, gameState);

            // Build panel UI (when exactly one port is selected)
            const selectedPortIndices = gameState.selectedUnits.filter(u => u.type === 'port');
            buildPanelBounds = null;
            buildQueuePanelBounds = null;

            if (selectedPortIndices.length === 1) {
                const portIndex = selectedPortIndices[0].index;
                const port = gameState.ports[portIndex];
                buildPanelBounds = drawPortBuildPanel(ctx, port, portIndex, gameState, { isPortBuildingSettlement });

                // Draw build queue panel at bottom center (if port has items in queue)
                buildQueuePanelBounds = drawBuildQueuePanel(ctx, [{ port, portIndex }], k.mousePos());
            } else if (selectedPortIndices.length > 1 && !isTouchDevice()) {
                // Desktop multi-select: show side-by-side queues when 2+ selected ports are actively building
                const buildingEntries = selectedPortIndices
                    .map(u => ({ port: gameState.ports[u.index], portIndex: u.index }))
                    .filter(({ port }) => port && port.buildQueue.length > 0);

                if (buildingEntries.length >= 2) {
                    buildQueuePanelBounds = drawBuildQueuePanel(ctx, buildingEntries, k.mousePos());
                }
            }

            // Draw selected ships panel at bottom center (when ships selected and no port build queue showing)
            if (!buildQueuePanelBounds) {
                drawSelectedShipsPanel(ctx, gameState);
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
                // Build panel shows whenever the ship is stationary, even when not adjacent to land.
                // Placement still validates shore hexes within build range.
                const isStationary = ship.waypoints.length === 0;
                const canShowBuildPanel = isStationary && !isShipBuildingPort(shipIndex, gameState.ports) && !isShipBuildingTower(shipIndex, gameState.towers);
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
                    text: isMobile ? "Tap play button to resume" : "Press . to resume",
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
                const aiName = gameState.surrenderPending === 'ai1' ? 'Green forces'
                             : gameState.surrenderPending === 'ai2' ? 'Blue forces'
                             : 'Orange forces';
                k.drawText({
                    text: `${aiName} request surrender.`,
                    pos: k.vec2(screenWidth / 2, screenHeight / 2 - 15),
                    size: 18,
                    anchor: "center",
                    color: k.rgb(180, 180, 180),
                });
                k.drawText({
                    text: "Their fleet is gone.",
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
                if (disconnectVictory) {
                    subtitle = isHost ? "Opponent fled the battle!" : "Opponent disconnected";
                } else if (scenario && scenario.gameMode === 'versus') {
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
                    text: isMobile ? "Tap to continue" : "Press SPACE to continue",
                    pos: k.vec2(screenWidth / 2, screenHeight / 2 + 60),
                    size: 14,
                    anchor: "center",
                    color: k.rgb(120, 120, 120),
                });
            }


            // Multiplayer connection status indicator
            if (isMultiplayer && !gameState.gameOver && !disconnectOverlay) {
                const connState = getConnectionState();
                const lat = getLatency();
                let statusColor = k.rgb(100, 255, 100); // green
                let statusText = `P2P ${lat}ms`;
                if (lat > 200) { statusColor = k.rgb(255, 200, 0); } // yellow
                if (connState !== CONNECTION_STATE.CONNECTED) {
                    statusColor = k.rgb(255, 80, 80); // red
                    statusText = 'Disconnected';
                }
                k.drawText({
                    text: statusText,
                    pos: k.vec2(k.width() - 10, 10),
                    size: 11, anchor: "topright",
                    color: statusColor,
                });
            }

            // Draw birds at the very top (above all UI) - only if their hex is visible
            const visibleBirds = birdStates.filter(b => isHexVisible(fogState, b.q, b.r));
            drawBirds(ctx, visibleBirds);

            // Draw menu panel last (above birds) when open
            if (menuPanelOpen) {
                topButtonBounds.menuPanel = drawMenuPanel(ctx);
            }

            // Draw debug panel when open
            if (debugPanelOpen) {
                topButtonBounds.debugPanel = drawDebugPanel(ctx, debugState, CRT_CONFIG);
            }

            // Draw designer panel (debug mode only)
            if (scenario && scenario.gameMode === 'debug' && gameState.designerPanel.open) {
                designerPanelHits = drawDesignerPanel(ctx, gameState);
            } else {
                designerPanelHits = null;
            }
        });

        // Left-click/drag for selection or panning (spacebar + left-click)
        // On mobile, touch handlers manage all input, so skip mouse handlers
        k.onMousePress("left", () => {
            if (isMobile) return; // Touch handlers manage input on mobile
            if (gameState.gameOver || gameState.surrenderPending) return; // Block clicks during overlays

            // CRT debug-panel sliders — start drag on press so motion past
            // DRAG_THRESHOLD doesn't trigger a selection-box drag instead.
            if (debugPanelOpen && topButtonBounds && topButtonBounds.debugPanel) {
                const mp = k.mousePos();
                const sliderHit = (topButtonBounds.debugPanel.sliders || []).find(s =>
                    mp.x >= s.x && mp.x <= s.x + s.width && mp.y >= s.y && mp.y <= s.y + s.height);
                if (sliderHit) {
                    crtSliderDrag = { key: sliderHit.key, trackX: sliderHit.trackX, trackW: sliderHit.trackW, min: sliderHit.min, max: sliderHit.max };
                    const norm = Math.max(0, Math.min(1, (mp.x - sliderHit.trackX) / sliderHit.trackW));
                    CRT_CONFIG[sliderHit.key] = sliderHit.min + norm * (sliderHit.max - sliderHit.min);
                    playUIClick();
                    return;
                }
            }

            // Designer-panel scale tuner — handle on press so slider drag and input
            // editing start cleanly (the regular click flow runs on release and would
            // miss any drag past DRAG_THRESHOLD).
            if (designerPanelHits) {
                const mp = k.mousePos();
                const point = { x: mp.x, y: mp.y };
                const trackHit = designerPanelHits.scaleTracks.find(r =>
                    point.x >= r.x && point.x <= r.x + r.w && point.y >= r.y && point.y <= r.y + r.h);
                if (trackHit) {
                    closeScaleInput();
                    gameState.designerPanel.draggingScale = { key: trackHit.key, trackX: trackHit.trackX, trackW: trackHit.trackW };
                    const norm = Math.max(0, Math.min(1, (point.x - trackHit.trackX) / trackHit.trackW));
                    gameState.designerPanel.scaleOverrides[trackHit.key] = clampScale(SCALE_MIN + norm * (SCALE_MAX - SCALE_MIN));
                    playUIClick();
                    return;  // skip isLeftMouseDown / selection start
                }
                const valueHit = designerPanelHits.scaleValues.find(r =>
                    point.x >= r.x && point.x <= r.x + r.w && point.y >= r.y && point.y <= r.y + r.h);
                if (valueHit) {
                    const current = gameState.designerPanel.scaleOverrides[valueHit.key] ?? valueHit.defaultScale;
                    openScaleInput(valueHit.key, valueHit, current);
                    playUIClick();
                    return;  // skip isLeftMouseDown / selection start
                }
            }

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
            if (isMobile) return; // Touch handlers manage input on mobile

            // End any active scale-slider drag (independent of game-over state)
            if (gameState.designerPanel.draggingScale) {
                gameState.designerPanel.draggingScale = null;
            }
            if (crtSliderDrag) {
                crtSliderDrag = null;
                return;  // swallow this release so handleClick doesn't fire
            }

            if (gameState.gameOver) return; // Block clicks when game over

            // Handle surrender button clicks
            if (gameState.surrenderPending && surrenderButtonBounds) {
                const mousePos = k.mousePos();
                const accept = surrenderButtonBounds.accept;
                const decline = surrenderButtonBounds.decline;

                // Check Accept button
                if (mousePos.x >= accept.x && mousePos.x <= accept.x + accept.width &&
                    mousePos.y >= accept.y && mousePos.y <= accept.y + accept.height) {
                    // Eliminate the surrendering AI entirely — otherwise the
                    // surrender condition (zero ships, can't build) re-triggers
                    // next frame and the screen reappears.
                    const aiOwner = gameState.surrenderPending;
                    gameState.ships = gameState.ships.filter(s => s.owner !== aiOwner);
                    gameState.ports = gameState.ports.filter(p => p.owner !== aiOwner);
                    gameState.settlements = gameState.settlements.filter(s => s.owner !== aiOwner);
                    gameState.towers = gameState.towers.filter(t => t.owner !== aiOwner);
                    gameState.surrenderPending = null;
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
            if (isMobile) return; // Touch handlers manage input on mobile
            if (gameState.gameOver || gameState.surrenderPending) return;
            isRightMouseDown = true;

            // Start tracking for potential pan
            panStartX = k.mousePos().x;
            panStartY = k.mousePos().y;
            cameraStartX = cameraX;
            cameraStartY = cameraY;
        });

        k.onMouseRelease("right", () => {
            if (isMobile) return; // Touch handlers manage input on mobile
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
            if (isMobile) return; // Touch handlers manage input on mobile

            // CRT debug-panel slider drag — runs before selection/pan so values
            // update fluidly even when the cursor leaves the panel.
            if (crtSliderDrag) {
                const mp = k.mousePos();
                const norm = Math.max(0, Math.min(1, (mp.x - crtSliderDrag.trackX) / crtSliderDrag.trackW));
                CRT_CONFIG[crtSliderDrag.key] = crtSliderDrag.min + norm * (crtSliderDrag.max - crtSliderDrag.min);
                return;
            }

            // Designer-panel scale slider drag — takes priority over selection/pan
            if (gameState.designerPanel.draggingScale) {
                const drag = gameState.designerPanel.draggingScale;
                const mp = k.mousePos();
                const norm = Math.max(0, Math.min(1, (mp.x - drag.trackX) / drag.trackW));
                gameState.designerPanel.scaleOverrides[drag.key] = clampScale(SCALE_MIN + norm * (SCALE_MAX - SCALE_MIN));
                return;
            }

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
            // Disabled on mobile - touch drag is used for panning instead
            else if (isLeftMouseDown && !isMobile) {
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
        k.setCursor(currentCursor);

        // Calculate camera bounds from actual tile positions.
        // The map is generated as a rectangle in offset coords (q = col - floor(row/2)),
        // so its pixel extent doesn't match hexToPixel(0,0)..hexToPixel(width-1,height-1).
        let mapMinXPx = Infinity, mapMaxXPx = -Infinity;
        let mapMinYPx = Infinity, mapMaxYPx = -Infinity;
        for (const tile of map.tiles.values()) {
            const pos = hexToPixel(tile.q, tile.r);
            if (pos.x < mapMinXPx) mapMinXPx = pos.x;
            if (pos.x > mapMaxXPx) mapMaxXPx = pos.x;
            if (pos.y < mapMinYPx) mapMinYPx = pos.y;
            if (pos.y > mapMaxYPx) mapMaxYPx = pos.y;
        }
        const cameraPadding = HEX_SIZE * 4; // Allow some padding beyond map edges
        const cameraMinX = mapMinXPx - cameraPadding;
        const cameraMaxX = mapMaxXPx + cameraPadding;
        const cameraMinY = mapMinYPx - cameraPadding;
        const cameraMaxY = mapMaxYPx + cameraPadding;

        // Helper to clamp camera position within bounds
        function clampCamera() {
            cameraX = Math.max(cameraMinX, Math.min(cameraMaxX, cameraX));
            cameraY = Math.max(cameraMinY, Math.min(cameraMaxY, cameraY));
        }

        k.onUpdate(() => {
            const panSpeed = 300 / zoom;
            const mouse = k.mousePos();

            // Arrow key panning - disabled when mouse/trackpad panning is active
            // This prevents conflicts between keyboard and trackpad input
            if (!isPanning && !isRightMouseDown) {
                if (k.isKeyDown("up")) cameraY -= panSpeed * k.dt();
                if (k.isKeyDown("down")) cameraY += panSpeed * k.dt();
                if (k.isKeyDown("left")) cameraX -= panSpeed * k.dt();
                if (k.isKeyDown("right")) cameraX += panSpeed * k.dt();
            }

            // Clamp camera to map bounds
            clampCamera();

            // Cursor state: show attack cursor when in attack mode or hovering over enemy units
            let newCursor = CURSOR_DEFAULT;
            const selectedShips = getSelectedShips(gameState);

            // Always show attack cursor when in attack mode
            if (gameState.actionMode.active === 'attack') {
                newCursor = CURSOR_ATTACK;
            } else if (selectedShips.length > 0) {
                const halfW = k.width() / 2;
                const halfH = k.height() / 2;
                const worldX = (mouse.x - halfW) / zoom + cameraX;
                const worldY = (mouse.y - halfH) / zoom + cameraY;

                // Check if hovering over an enemy ship (pirate or non-local)
                for (const ship of gameState.ships) {
                    const isEnemy = isPirateShip(ship) || ship.owner !== localPlayerId;
                    if (!isEnemy) continue;
                    if (!isHexVisible(fogState, ship.q, ship.r)) continue;
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
                        if (structure.owner === localPlayerId) continue;
                        if (!isHexVisible(fogState, structure.q, structure.r)) continue;
                        const pos = hexToPixel(structure.q, structure.r);
                        const dx = worldX - pos.x;
                        const dy = worldY - pos.y;
                        if (Math.sqrt(dx * dx + dy * dy) < SELECTION_RADIUS) {
                            newCursor = CURSOR_ATTACK;
                            break;
                        }
                    }
                }
            }

            if (newCursor !== currentCursor) {
                currentCursor = newCursor;
                k.setCursor(currentCursor);
            }
        });

        // Scroll to zoom — but when the Designer panel is open and the mouse is
        // over it, the wheel scrolls the panel's asset list instead.
        k.onScroll((delta) => {
            if (gameState.designerPanel.open && gameState.designerPanel.bounds) {
                const mp = k.mousePos();
                const b = gameState.designerPanel.bounds;
                if (mp.x >= b.x && mp.x <= b.x + b.w && mp.y >= b.y && mp.y <= b.y + b.h) {
                    const dp = gameState.designerPanel;
                    const overflow = Math.max(0, dp.contentHeight - dp.viewportHeight);
                    dp.scrollY = Math.max(0, Math.min(overflow, dp.scrollY + delta.y));
                    return;
                }
            }
            const zoomFactor = 1.1;
            if (delta.y < 0) {
                zoom = Math.min(zoom * zoomFactor, 1);  // Max zoom in at 1 (default)
            } else {
                zoom = Math.max(zoom / zoomFactor, 0.3);  // Can zoom out to 0.3
            }
        });

        // Time scale controls (+ to increase, - to decrease) — disabled in multiplayer
        k.onKeyPress("=", () => {
            if (isMultiplayer) return; // Fixed speed in multiplayer
            const oldSpeed = gameState.timeScale;
            gameState.timeScale = Math.min(gameState.timeScale + 1, 5);
            if (gameState.timeScale !== oldSpeed) {
                showNotification(gameState, `Speed increased to ${gameState.timeScale}x`);
            }
            gameMenuOpen = false;
            speedSubmenuOpen = false;
        });
        k.onKeyPress("-", () => {
            if (isMultiplayer) return; // Fixed speed in multiplayer
            const oldSpeed = gameState.timeScale;
            gameState.timeScale = Math.max(gameState.timeScale - 1, 1);
            if (gameState.timeScale !== oldSpeed) {
                showNotification(gameState, `Speed decreased to ${gameState.timeScale}x`);
            }
            gameMenuOpen = false;
            speedSubmenuOpen = false;
        });
        k.onKeyPress(".", () => {
            if (isMultiplayer) return; // Fixed speed in multiplayer
            if (gameState.timeScale === 0) {
                gameState.timeScale = lastNonZeroSpeed;
            } else {
                lastNonZeroSpeed = gameState.timeScale;
                gameState.timeScale = 0;
            }
            gameMenuOpen = false;
            speedSubmenuOpen = false;
        });

        // Control group key handlers (0-9)
        // Shift+Number: Save current selection to slot
        // Number: Recall saved selection AND snap camera to its center
        // Kaplay reports keys as event.key.toLowerCase(), so Shift+1 arrives as
        // "!" (not "1"). Bind both the digit and its US-layout shifted variant.
        const numberKeys = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'];
        const shiftedKeys = [')', '!', '@', '#', '$', '%', '^', '&', '*', '('];
        for (let slot = 0; slot < 10; slot++) {
            const handler = () => {
                const isSaveHeld = shiftKeyHeld;

                if (isSaveHeld) {
                    // Shift+Number: Save current selection to slot
                    if (gameState.selectedUnits.length > 0) {
                        saveSelectionToGroup(gameState, slot);
                        const count = gameState.savedSelections[slot].length;
                        showNotification(gameState, `Saved ${count} unit${count > 1 ? 's' : ''} to group ${slot}`);
                    }
                } else {
                    // Number key: Recall selection and snap camera to its center,
                    // but only if none of the units are currently visible on screen
                    // (avoids jarring camera snaps when the group is already in view).
                    const units = recallSelectionFromGroup(gameState, slot);

                    if (units.length > 0) {
                        gameState.selectedUnits = units;

                        const halfW = k.width() / 2;
                        const halfH = k.height() / 2;
                        let anyVisible = false;
                        for (const unit of units) {
                            let entity = null;
                            if (unit.type === 'ship') entity = gameState.ships[unit.index];
                            else if (unit.type === 'port') entity = gameState.ports[unit.index];
                            else if (unit.type === 'settlement') entity = gameState.settlements[unit.index];
                            else if (unit.type === 'tower') entity = gameState.towers[unit.index];
                            if (!entity) continue;
                            const pos = hexToPixel(entity.q, entity.r);
                            const screenX = (pos.x - cameraX) * zoom + halfW;
                            const screenY = (pos.y - cameraY) * zoom + halfH;
                            if (screenX >= 0 && screenX <= k.width() &&
                                screenY >= 0 && screenY <= k.height()) {
                                anyVisible = true;
                                break;
                            }
                        }

                        if (!anyVisible) {
                            const center = getGroupCenterPosition(gameState, slot, hexToPixel);
                            if (center) {
                                cameraX = center.x;
                                cameraY = center.y;
                            }
                        }

                        showNotification(gameState, `Recalled group ${slot} (${units.length} unit${units.length > 1 ? 's' : ''})`);
                    }
                }
            };
            k.onKeyPress(numberKeys[slot], handler);
            k.onKeyPress(shiftedKeys[slot], handler);
        }

        // M to enter move mode (when ships selected)
        k.onKeyPress("m", () => {
            const selectedShips = getSelectedShips(gameState);
            const playerShips = selectedShips.filter(ship =>
                ship && ship.type !== 'pirate' && ship.owner === localPlayerId
            );
            if (playerShips.length > 0) {
                if (gameState.actionMode.active === 'move') {
                    exitActionMode(gameState);
                } else {
                    enterActionMode(gameState, 'move');
                    showNotification(gameState, "Choose destination");
                }
            }
        });

        // A to enter attack mode (when ships selected)
        k.onKeyPress("a", () => {
            const selectedShips = getSelectedShips(gameState);
            const playerShips = selectedShips.filter(ship =>
                ship && ship.type !== 'pirate' && ship.owner === localPlayerId
            );
            if (playerShips.length > 0) {
                if (gameState.actionMode.active === 'attack') {
                    exitActionMode(gameState);
                } else {
                    enterActionMode(gameState, 'attack');
                    showNotification(gameState, "Choose target");
                }
            }
        });

        // B to enter Broadside burst-attack mode (when ALL selected ships have a burstAttack and at least one is off-cooldown)
        k.onKeyPress("b", () => {
            const selectedShips = getSelectedShips(gameState);
            const playerShips = selectedShips.filter(ship =>
                ship && ship.type !== 'pirate' && ship.owner === localPlayerId
            );
            if (playerShips.length === 0) return;
            const allHaveBurst = playerShips.every(s => SHIPS[s.type] && SHIPS[s.type].burstAttack);
            if (!allHaveBurst) return;
            const anyReady = playerShips.some(s => (s.burstCooldown || 0) <= 0);
            if (!anyReady) return;
            if (gameState.actionMode.active === 'broadside') {
                exitActionMode(gameState);
            } else {
                enterActionMode(gameState, 'broadside');
                showNotification(gameState, "Choose Broadside target");
            }
        });

        // K to light TNT fuses on selected schooners (instant — no target click)
        k.onKeyPress("k", () => {
            const selectedShips = getSelectedShips(gameState);
            const playerShips = selectedShips.filter(ship =>
                ship && ship.type !== 'pirate' && ship.owner === localPlayerId
            );
            if (playerShips.length === 0) return;
            const allHaveTNT = playerShips.every(s => SHIPS[s.type] && SHIPS[s.type].tntAttack);
            if (!allHaveTNT) return;
            triggerTNTOnSelected();
        });

        // P to enter patrol mode (when ships selected)
        k.onKeyPress("p", () => {
            const selectedShips = getSelectedShips(gameState);
            // Filter to only player-controlled ships
            const playerShips = selectedShips.filter(ship =>
                ship && ship.type !== 'pirate' && ship.owner === localPlayerId
            );
            if (playerShips.length > 0) {
                if (gameState.actionMode.active === 'patrol') {
                    exitActionMode(gameState);
                    exitPatrolMode(gameState);
                } else {
                    enterActionMode(gameState, 'patrol');
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
                    showNotification(gameState, "Choose patrol route");
                }
            }
        });

        // R to enter rally mode (when ports selected, no ships)
        k.onKeyPress("r", () => {
            const selectedShips = getSelectedShips(gameState);
            const hasPlayerShips = selectedShips.some(ship =>
                ship && ship.type !== 'pirate' && ship.owner === localPlayerId
            );
            // Only allow rally mode if no ships are selected
            if (hasPlayerShips) return;

            const selectedPorts = gameState.selectedUnits
                .filter(u => u.type === 'port')
                .map(u => gameState.ports[u.index])
                .filter(port => port && port.owner === localPlayerId);

            if (selectedPorts.length > 0) {
                if (gameState.actionMode.active === 'rally') {
                    exitActionMode(gameState);
                } else {
                    enterActionMode(gameState, 'rally');
                    showNotification(gameState, "Select rally point");
                }
            }
        });

        // Light TNT fuses on every selected TNT-capable ship the local player owns.
        // No target click required — the ship continues moving until the fuse burns out.
        // For multiplayer guests, sends a DETONATE_TNT command listing the ship ids.
        function triggerTNTOnSelected() {
            const armedIds = [];
            for (const sel of gameState.selectedUnits) {
                if (sel.type !== 'ship') continue;
                if (isShipBuildingPort(sel.index, gameState.ports)) continue;
                if (isShipBuildingTower(sel.index, gameState.towers)) continue;
                const ship = gameState.ships[sel.index];
                if (!ship || isPirateShip(ship)) continue;
                if (ship.owner !== localPlayerId) continue;
                if (!SHIPS[ship.type] || !SHIPS[ship.type].tntAttack) continue;
                if (armTNT(gameState, sel.index)) {
                    armedIds.push(ship.id);
                }
            }
            if (armedIds.length === 0) return;
            if (isMultiplayer && isGuest) {
                sendPlayerCommand(createCommand(COMMAND_TYPES.DETONATE_TNT, { shipIds: armedIds }));
            }
            showNotification(gameState, armedIds.length > 1 ? "TNT lit on " + armedIds.length + " ships!" : "TNT lit!");
        }

        // Snap camera to home port and reset zoom (used by H key and mobile minimap double-tap)
        function snapCameraHome() {
            const homePortIndex = getHomePortIndex(gameState, map);
            if (homePortIndex !== null) {
                const homePort = gameState.ports[homePortIndex];
                const pos = hexToPixel(homePort.q, homePort.r);
                cameraX = pos.x;
                cameraY = pos.y;
                zoom = 1;
            }
        }

        // V to toggle mic mute (multiplayer + voice chat enabled)
        k.onKeyPress("v", () => {
            if (!isMultiplayer || !isVoiceChatActive()) return;
            const nowMuted = toggleVoiceMute();
            showNotification(gameState, nowMuted ? "Mic muted" : "Mic on");
        });

        // H to center camera on home port
        k.onKeyPress("h", snapCameraHome);

        // Space to return to title when game over or disconnected
        k.onKeyPress("space", () => {
            if (gameState.gameOver || disconnectOverlay) {
                cleanupAudio();
                if (isMultiplayer) {
                    disconnect();
                }
                k.go("title");
            }
        });

        // Shift+D toggles the designer panel (debug mode only)
        k.onKeyPress("d", () => {
            if (!shiftKeyHeld) return;
            if (!scenario || scenario.gameMode !== 'debug') return;
            gameState.designerPanel.open = !gameState.designerPanel.open;
            if (!gameState.designerPanel.open) {
                gameState.designerPanel.spawnType = null;
                gameState.designerPanel.scrollY = 0;
            }
            playUIClick();
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
            } else if (gameState.actionMode.active) {
                const wasPatrolMode = gameState.actionMode.active === 'patrol';
                exitActionMode(gameState);
                if (gameState.patrolMode.active) {
                    exitPatrolMode(gameState);
                }
                if (wasPatrolMode) {
                    clearSelection(gameState);
                }
            } else if (gameState.patrolMode.active) {
                exitPatrolMode(gameState);
                clearSelection(gameState);
            } else if (gameState.designerPanel.spawnType) {
                gameState.designerPanel.spawnType = null;
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
                canAfford(getResourcesForOwner(gameState, localPlayerId), SETTLEMENTS.settlement.cost)) {
                enterSettlementBuildMode(gameState, buildPanelBounds.portIndex);
                console.log("Settlement placement mode (hotkey S)");
            }
        });

        // Hotkey 'T' to enter watchtower build mode when ship or port panel is open
        k.onKeyPress("t", () => {
            const watchtowerData = TOWERS.watchtower;
            // Ship panel takes priority if both are somehow open
            const tRes = getResourcesForOwner(gameState, localPlayerId);
            if (shipBuildPanelBounds?.towerButton && canAfford(tRes, watchtowerData.cost)) {
                if (!canAffordCrew(gameState, watchtowerData.crewCost || 0, localPlayerId)) {
                    showNotification(gameState, "Max crew reached. Build more settlements.");
                } else {
                    enterTowerBuildMode(gameState, shipBuildPanelBounds.shipIndex, 'ship');
                    console.log("Watchtower placement mode from ship (hotkey T)");
                }
            } else if (buildPanelBounds?.towerButton && canAfford(tRes, watchtowerData.cost)) {
                const port = gameState.ports[buildPanelBounds.portIndex];
                if (!port.repair) {
                    if (!canAffordCrew(gameState, watchtowerData.crewCost || 0, localPlayerId)) {
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
                const cRes = getResourcesForOwner(gameState, localPlayerId);
                if (port.buildQueue.length === 0) {
                    if (!canAfford(cRes, shipData.cost)) continue;
                    if (!canAffordCrew(gameState, shipData.crewCost || 0, localPlayerId)) {
                        showNotification(gameState, "Max crew reached.");
                        continue;
                    }
                    deductCost(cRes, shipData.cost);
                    addToBuildQueue(port, 'cutter', cRes, true);
                    port.buildQueue[0].progress = 0;
                } else {
                    // Queue has items - just add without resource check
                    addToBuildQueue(port, 'cutter', cRes, false);
                }
                if (isMultiplayer && isGuest) {
                    sendGuestGenericCommand(COMMAND_TYPES.BUILD_SHIP, { portId: port.id, shipType: 'cutter' });
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
                    const uRes = getResourcesForOwner(gameState, localPlayerId);
                    if (!tower.construction && canAfford(uRes, nextTowerData.cost)) {
                        if (!canAffordCrew(gameState, crewDiff, localPlayerId)) {
                            showNotification(gameState, "Max crew reached. Build more settlements.");
                        } else {
                            deductCost(uRes, nextTowerData.cost);
                            tower.construction = {
                                progress: 0,
                                buildTime: nextTowerData.buildTime,
                                upgradeTo: towerInfoPanelBounds.upgradeButton.towerType,
                            };
                            if (isMultiplayer && isGuest) {
                                sendGuestGenericCommand(COMMAND_TYPES.UPGRADE_TOWER, { towerId: tower.id });
                            }
                            console.log(`Started upgrading tower to: ${towerInfoPanelBounds.upgradeButton.towerType} (hotkey U)`);
                        }
                    }
                }
            }
        });

        // Hotkey 'R' to repair selected unit (ships cannot repair themselves)
        k.onKeyPress("r", () => {
            const rRes = getResourcesForOwner(gameState, localPlayerId);
            // Tower repair
            const selectedTowerIndices = gameState.selectedUnits.filter(u => u.type === 'tower');
            if (selectedTowerIndices.length === 1 && towerInfoPanelBounds?.repairButton) {
                const tower = gameState.towers[selectedTowerIndices[0].index];
                if (startRepair('tower', tower, rRes)) {
                    if (isMultiplayer && isGuest) sendGuestGenericCommand(COMMAND_TYPES.REPAIR, { entityType: 'tower', entityId: tower.id });
                    console.log("Started repairing tower (hotkey R)");
                }
                return;
            }

            // Settlement repair
            const selectedSettlementIndices = gameState.selectedUnits.filter(u => u.type === 'settlement');
            if (selectedSettlementIndices.length === 1 && settlementInfoPanelBounds?.repairButton) {
                const settlement = gameState.settlements[selectedSettlementIndices[0].index];
                if (startRepair('settlement', settlement, rRes)) {
                    if (isMultiplayer && isGuest) sendGuestGenericCommand(COMMAND_TYPES.REPAIR, { entityType: 'settlement', entityId: settlement.id });
                    console.log("Started repairing settlement (hotkey R)");
                }
                return;
            }

            // Port repair
            const selectedPortIndices = gameState.selectedUnits.filter(u => u.type === 'port');
            if (selectedPortIndices.length === 1 && buildPanelBounds?.repairButton) {
                const port = gameState.ports[selectedPortIndices[0].index];
                if (startRepair('port', port, rRes)) {
                    if (isMultiplayer && isGuest) sendGuestGenericCommand(COMMAND_TYPES.REPAIR, { entityType: 'port', entityId: port.id });
                    console.log("Started repairing port (hotkey R)");
                }
                return;
            }
        });

        // UI click sound helper
        function playUIClick() {
            k.play("ui-click", { volume: 0.4 });
        }

        // Designer-mode quick spawn: drop a player-owned unit at the clicked hex with
        // no cost, no build time, and no construction state. Validates placement via
        // the same helpers the build UI uses so we don't drop a port mid-island.
        function designerSpawn(q, r) {
            const opt = QUICK_SPAWN_OPTIONS.find(o => o.id === gameState.designerPanel.spawnType);
            if (!opt) return false;
            const tileKey = `${q},${r}`;
            const tile = map.tiles.get(tileKey);
            if (!tile) {
                showNotification(gameState, 'Off-map');
                return false;
            }
            const tileIsWater = isWater(tile);

            if (opt.kind === 'ship') {
                if (!tileIsWater) {
                    showNotification(gameState, 'Ships must spawn on water');
                    return false;
                }
                if (gameState.ships.some(s => s.q === q && s.r === r)) {
                    showNotification(gameState, 'Hex occupied');
                    return false;
                }
                gameState.ships.push(createShip(opt.shipType, q, r, 'player'));
            } else if (opt.kind === 'port') {
                if (!isValidPortSite(map, q, r, gameState.ports, gameState.towers, gameState.settlements)) {
                    showNotification(gameState, 'Invalid port site');
                    return false;
                }
                gameState.ports.push(createPort(opt.portType, q, r, false, null, 'player'));
            } else if (opt.kind === 'settlement') {
                if (!isValidSettlementSite(map, q, r, gameState.settlements, gameState.ports, gameState.towers)) {
                    showNotification(gameState, 'Invalid settlement site');
                    return false;
                }
                gameState.settlements.push(createSettlement(q, r, false, null, 'player'));
            } else if (opt.kind === 'tower') {
                if (!isValidTowerSite(map, q, r, gameState.towers, gameState.ports, gameState.settlements)) {
                    showNotification(gameState, 'Invalid tower site');
                    return false;
                }
                gameState.towers.push(createTower(opt.towerType, q, r, false, null, null, 'player'));
            } else {
                return false;
            }

            gameState.designerPanel.spawnType = null;
            return true;
        }

        // BFS-based helper: drop up to 3 enemy cutters in water 3-5 hexes from the
        // player's home port. Used by the Designer panel "Spawn 3 enemies" action.
        function spawnTestEnemies() {
            if (!gameState.homeIslandHex) return 0;
            const playerHex = gameState.homeIslandHex;
            const visited = new Set([hexKey(playerHex.q, playerHex.r)]);
            const frontier = [{ q: playerHex.q, r: playerHex.r }];
            const waterHexes = [];
            while (frontier.length && waterHexes.length < 12) {
                const cur = frontier.shift();
                for (const n of hexNeighbors(cur.q, cur.r)) {
                    const key = hexKey(n.q, n.r);
                    if (visited.has(key)) continue;
                    visited.add(key);
                    if (hexDistance(playerHex.q, playerHex.r, n.q, n.r) > 6) continue;
                    const tile = map.tiles.get(key);
                    if (!tile) continue;
                    frontier.push({ q: n.q, r: n.r });
                    if (isWater(tile)) {
                        waterHexes.push({ q: n.q, r: n.r, dist: hexDistance(playerHex.q, playerHex.r, n.q, n.r) });
                    }
                }
            }
            const candidates = waterHexes.filter(h => h.dist >= 3 && h.dist <= 5).sort((a, b) => a.dist - b.dist);
            const enemyOwner = gameState.aiPlayers.length > 0 ? 'ai1' : 'pirate';
            const occupied = new Set(gameState.ships.map(s => hexKey(s.q, s.r)));
            let spawned = 0;
            for (const hex of candidates) {
                if (spawned >= 3) break;
                const key = hexKey(hex.q, hex.r);
                if (occupied.has(key)) continue;
                gameState.ships.push(createShip('cutter', hex.q, hex.r, enemyOwner));
                occupied.add(key);
                spawned++;
            }
            return spawned;
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

        // Crossbow tower arrow fire sound helper (plays random 1-4)
        function playArrowFire() {
            const soundNum = Math.floor(Math.random() * 4) + 1;
            k.play(`arrow-fire-${soundNum}`, { volume: 0.3 });
        }

        // Port waypoint/rally-point set sound helper (plays random 1-2)
        function playPortWaypoint() {
            const soundNum = Math.floor(Math.random() * 2) + 1;
            k.play(`port-waypoint-${soundNum}`, { volume: 0.4 });
        }

        // Click handler for selection and waypoints - delegates to input handler helpers
        function handleClick() {
            const mousePos = getMousePos();
            const mouseX = mousePos.x;
            const mouseY = mousePos.y;

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
                const presets = topButtonBounds.debugPanel.presets || [];

                // Check if clicking on an option checkbox
                for (const opt of options) {
                    if (mouseX >= opt.x && mouseX <= opt.x + opt.width &&
                        mouseY >= opt.y && mouseY <= opt.y + opt.height) {
                        playUIClick();
                        if (opt.id === 'hideFog') {
                            debugState.hideFog = !debugState.hideFog;
                        } else if (opt.id === 'crtEnabled') {
                            CRT_CONFIG.enabled = !CRT_CONFIG.enabled;
                        }
                        return;
                    }
                }

                // Check preset buttons
                for (const p of presets) {
                    if (mouseX >= p.x && mouseX <= p.x + p.width &&
                        mouseY >= p.y && mouseY <= p.y + p.height) {
                        playUIClick();
                        applyCRTPreset(p.id);
                        return;
                    }
                }

                // Click inside panel but not on a control - do nothing
                if (mouseX >= panel.x && mouseX <= panel.x + panel.width &&
                    mouseY >= panel.y && mouseY <= panel.y + panel.height) {
                    return;
                }

                // Click outside panel - close it
                debugPanelOpen = false;
                return;
            }

            // Designer panel (debug mode): hit-test buttons before anything else
            if (designerPanelHits) {
                const point = { x: mouseX, y: mouseY };

                // Sprite-scale reset (slider drag + value-box open are handled in onMousePress)
                const scaleResetKey = hitTestRegion(point, designerPanelHits.scaleResets);
                if (scaleResetKey) {
                    delete gameState.designerPanel.scaleOverrides[scaleResetKey];
                    closeScaleInput();
                    playUIClick();
                    return;
                }

                const uploadKey = hitTestRegion(point, designerPanelHits.uploads);
                if (uploadKey) {
                    pendingUploadSlot = findSlot(uploadKey);
                    if (designerFileInput && pendingUploadSlot) designerFileInput.click();
                    playUIClick();
                    return;
                }

                const resetKey = hitTestRegion(point, designerPanelHits.resets);
                if (resetKey) {
                    const slot = findSlot(resetKey);
                    if (slot) {
                        resetSprite(k, slot);
                        showNotification(gameState, `Reset ${slot.label}`);
                    }
                    playUIClick();
                    return;
                }

                const spawnId = hitTestRegion(point, designerPanelHits.spawns, 'id');
                if (spawnId) {
                    const opt = QUICK_SPAWN_OPTIONS.find(o => o.id === spawnId);
                    if (opt && opt.kind === 'action') {
                        // Immediate-action buttons (no map-click) live in the same grid
                        // for layout but fire here instead of entering placement mode.
                        if (opt.id === 'spawn-enemies') {
                            const count = spawnTestEnemies();
                            showNotification(gameState, `Spawned ${count} enemy cutter${count === 1 ? '' : 's'}`);
                        }
                    } else {
                        gameState.designerPanel.spawnType =
                            gameState.designerPanel.spawnType === spawnId ? null : spawnId;
                    }
                    playUIClick();
                    return;
                }

                const toggleId = hitTestRegion(point, designerPanelHits.groupToggles, 'id');
                if (toggleId) {
                    const groups = gameState.designerPanel.collapsedGroups;
                    if (groups.has(toggleId)) groups.delete(toggleId);
                    else groups.add(toggleId);
                    playUIClick();
                    return;
                }

                // Click inside the panel but not on a button — consume to avoid clicks falling through
                const b = gameState.designerPanel.bounds;
                if (b && mouseX >= b.x && mouseX <= b.x + b.w && mouseY >= b.y && mouseY <= b.y + b.h) {
                    return;
                }
            }

            // Mobile cancel button (shown during placement modes) - check before placement clicks
            if (placementCancelBounds &&
                mouseX >= placementCancelBounds.x && mouseX <= placementCancelBounds.x + placementCancelBounds.width &&
                mouseY >= placementCancelBounds.y && mouseY <= placementCancelBounds.y + placementCancelBounds.height) {
                if (gameState.portBuildMode.active) exitPortBuildMode(gameState);
                else if (gameState.settlementBuildMode.active) exitSettlementBuildMode(gameState);
                else if (gameState.towerBuildMode.active) exitTowerBuildMode(gameState);
                playUIClick();
                return;
            }

            // Designer quick-spawn: next world-click drops the chosen unit for free
            if (gameState.designerPanel.spawnType) {
                const worldX = (mouseX - k.width() / 2) / zoom + cameraX;
                const worldY = (mouseY - k.height() / 2) / zoom + cameraY;
                const hex = pixelToHex(worldX, worldY);
                if (designerSpawn(hex.q, hex.r)) playUIClick();
                return;
            }

            // Handle placement mode clicks first
            if (handlePortPlacementClick(gameState, map)) { playUIClick(); flushGuestCommands(); return; }
            if (handleSettlementPlacementClick(gameState)) { playUIClick(); flushGuestCommands(); return; }
            if (handleTowerPlacementClick(gameState)) { playUIClick(); flushGuestCommands(); return; }

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
                            cleanupAudio();
                            if (isMultiplayer) {
                                disconnect();
                            }
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

            // Check top button clicks (menu button + voice mic button)
            if (topButtonBounds) {
                const { menuButton, micButton } = topButtonBounds;
                if (micButton &&
                    mouseX >= micButton.x && mouseX <= micButton.x + micButton.width &&
                    mouseY >= micButton.y && mouseY <= micButton.y + micButton.height) {
                    playUIClick();
                    const nowMuted = toggleVoiceMute();
                    showNotification(gameState, nowMuted ? "Mic muted" : "Mic on");
                    return;
                }
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
            if (handleShipBuildPanelClick(mouseX, mouseY, shipBuildPanelBounds, gameState)) {
                playUIClick();
                flushGuestCommands();
                // On mobile, close panel only when entering a placement mode (so the map is visible)
                if (isMobile && (gameState.portBuildMode.active || gameState.towerBuildMode.active)) {
                    clearSelection(gameState);
                }
                return;
            }
            if (handleBuildPanelClick(mouseX, mouseY, buildPanelBounds, gameState, fogState)) {
                playUIClick();
                flushGuestCommands();
                // On mobile, close panel only when entering a placement mode. Keep the dock
                // selected after queueing a ship so the player can queue more without re-tapping.
                if (isMobile && (gameState.settlementBuildMode.active || gameState.towerBuildMode.active || gameState.portBuildMode.active)) {
                    clearSelection(gameState);
                }
                return;
            }
            if (handleBuildQueueClick(mouseX, mouseY, buildQueuePanelBounds, gameState)) { playUIClick(); flushGuestCommands(); return; }
            if (handleTowerInfoPanelClick(mouseX, mouseY, towerInfoPanelBounds, gameState, fogState)) { playUIClick(); flushGuestCommands(); return; }
            if (handleSettlementInfoPanelClick(mouseX, mouseY, settlementInfoPanelBounds, gameState)) { playUIClick(); flushGuestCommands(); return; }
            if (handleShipInfoPanelClick(mouseX, mouseY, shipInfoPanelBounds, gameState)) { playUIClick(); return; }

            // Check action button clicks (Move, Attack, Patrol, Broadside, TNT)
            if (actionButtonBounds) {
                for (const btn of actionButtonBounds.buttons) {
                    if (mouseX >= btn.x && mouseX <= btn.x + btn.width &&
                        mouseY >= btn.y && mouseY <= btn.y + btn.height) {
                        playUIClick();
                        if (btn.disabled) return;  // On cooldown — consume click, do nothing

                        // TNT is an instant action (no target click) — light the fuse and return
                        if (btn.id === 'tnt') {
                            triggerTNTOnSelected();
                            return;
                        }

                        if (gameState.actionMode.active === btn.id) {
                            // Toggle off if clicking same button
                            exitActionMode(gameState);
                            if (btn.id === 'patrol') {
                                exitPatrolMode(gameState);
                            }
                        } else {
                            // Enter the action mode
                            enterActionMode(gameState, btn.id);

                            // Show appropriate toast message
                            if (btn.id === 'move') {
                                showNotification(gameState, "Choose destination");
                            } else if (btn.id === 'attack') {
                                showNotification(gameState, "Choose target");
                            } else if (btn.id === 'broadside') {
                                showNotification(gameState, "Choose Broadside target");
                            } else if (btn.id === 'patrol') {
                                // Enter patrol mode and set up initial state
                                enterPatrolMode(gameState);
                                const selectedShips = getSelectedShips(gameState);
                                for (const ship of selectedShips) {
                                    const firstWaypoint = ship.waypoints && ship.waypoints.length > 0
                                        ? { q: ship.waypoints[0].q, r: ship.waypoints[0].r }
                                        : { q: ship.q, r: ship.r };
                                    ship.patrolRoute = [firstWaypoint];
                                    ship.isPatrolling = true;
                                    ship.showRouteLine = true;
                                }
                                showNotification(gameState, "Choose patrol route");
                            } else if (btn.id === 'rally') {
                                showNotification(gameState, "Select rally point");
                            }
                        }
                        return;  // Consume click
                    }
                }
            }

            // Convert to world coordinates
            const worldX = (mouseX - k.width() / 2) / zoom + cameraX;
            const worldY = (mouseY - k.height() / 2) / zoom + cameraY;
            const clickedHex = pixelToHex(worldX, worldY);

            // Check modifier keys
            const isShiftHeld = shiftKeyHeld;
            const isCommandHeld = k.isKeyDown("meta");

            // Handle action mode clicks (from action buttons)
            if (gameState.actionMode.active === 'move') {
                // Move mode: set waypoint and exit
                handleWaypointClick(gameState, map, clickedHex, isShiftHeld);
                if (isMultiplayer && isGuest) {
                    sendGuestCommandForSelectedShips(COMMAND_TYPES.MOVE_SHIPS, {
                        waypoints: [{ q: clickedHex.q, r: clickedHex.r }], append: isShiftHeld,
                    });
                }
                exitActionMode(gameState);
                return;
            }

            if (gameState.actionMode.active === 'attack') {
                // Attack mode (A-click): attack-move semantics - keep guardMode so ship
                // auto-acquires next target after destroying the clicked one
                if (handleAttackClick(gameState, map, worldX, worldY, hexToPixel, SELECTION_RADIUS, getShipVisualPosLocal, isShiftHeld, true)) {
                    if (isMultiplayer && isGuest) {
                        const selShips = getSelectedShips(gameState);
                        if (selShips.length > 0 && selShips[0].attackTarget) {
                            const at = selShips[0].attackTarget;
                            const targetEntity = (at.type === 'ship' ? gameState.ships : at.type === 'port' ? gameState.ports : at.type === 'settlement' ? gameState.settlements : gameState.towers)[at.index];
                            if (targetEntity) {
                                sendGuestCommandForSelectedShips(COMMAND_TYPES.ATTACK, { targetType: at.type, targetId: targetEntity.id, isAttackMove: true });
                            }
                        }
                    }
                    exitActionMode(gameState);
                    return;
                }
                // No enemy clicked - navigate to location with guard mode (auto-attack enabled)
                handleWaypointClick(gameState, map, clickedHex, isShiftHeld);
                const selectedShips = getSelectedShips(gameState);
                for (const ship of selectedShips) {
                    ship.guardMode = true;
                }
                if (isMultiplayer && isGuest) {
                    sendGuestCommandForSelectedShips(COMMAND_TYPES.MOVE_SHIPS, {
                        waypoints: [{ q: clickedHex.q, r: clickedHex.r }], append: false,
                    });
                }
                exitActionMode(gameState);
                return;
            }

            if (gameState.actionMode.active === 'broadside') {
                const result = handleBroadsideClick(gameState, map, worldX, worldY, hexToPixel, SELECTION_RADIUS, getShipVisualPosLocal);
                if (result && result.fired) {
                    if (isMultiplayer && isGuest) {
                        sendGuestCommandForSelectedShips(COMMAND_TYPES.BROADSIDE, {
                            targetType: result.targetType, targetId: result.targetId,
                        });
                    }
                    exitActionMode(gameState);
                } else if (result && !result.fired) {
                    showNotification(gameState, "No water approach to target");
                }
                // If result is null (no enemy clicked), stay in mode for another try
                return;
            }

            if (gameState.actionMode.active === 'patrol') {
                // Patrol mode: check if clicking on a unit first
                // If so, exit patrol mode and select the unit instead
                const clickedUnit = handleUnitSelection(gameState, worldX, worldY, hexToPixel, SELECTION_RADIUS, false, getShipVisualPosLocal);
                if (clickedUnit) {
                    // Clicked on a unit - exit patrol mode, unit is already selected
                    exitActionMode(gameState);
                    exitPatrolMode(gameState);
                    return;
                }
                // No unit clicked - add patrol waypoint (stay in mode for multiple points)
                handlePatrolWaypointClick(gameState, map, clickedHex);
                if (isMultiplayer && isGuest) {
                    const selShips = getSelectedShips(gameState);
                    if (selShips.length > 0 && selShips[0].patrolRoute) {
                        sendGuestCommandForSelectedShips(COMMAND_TYPES.SET_PATROL, { waypoints: selShips[0].patrolRoute });
                    }
                }
                return;
            }

            if (gameState.actionMode.active === 'rally') {
                // Rally mode: set rally point for selected port(s)
                if (handlePortRallyPointClick(gameState, map, clickedHex)) {
                    playPortWaypoint();
                }
                if (isMultiplayer && isGuest) {
                    for (const sel of gameState.selectedUnits) {
                        if (sel.type === 'port') {
                            const port = gameState.ports[sel.index];
                            if (port && port.owner === localPlayerId) {
                                sendGuestGenericCommand(COMMAND_TYPES.SET_RALLY, {
                                    portId: port.id, q: clickedHex.q, r: clickedHex.r,
                                });
                            }
                        }
                    }
                }
                exitActionMode(gameState);
                return;
            }

            let clickedOnUnit = false;

            // When Command is held, check special interactions BEFORE unit selection
            if (isCommandHeld) {
                // Attack pirate ship
                if (handleAttackClick(gameState, map, worldX, worldY, hexToPixel, SELECTION_RADIUS, getShipVisualPosLocal)) {
                    if (isMultiplayer && isGuest) {
                        const selShips = getSelectedShips(gameState);
                        if (selShips.length > 0 && selShips[0].attackTarget) {
                            const at = selShips[0].attackTarget;
                            const targetEntity = (at.type === 'ship' ? gameState.ships : at.type === 'port' ? gameState.ports : at.type === 'settlement' ? gameState.settlements : gameState.towers)[at.index];
                            if (targetEntity) {
                                sendGuestCommandForSelectedShips(COMMAND_TYPES.ATTACK, { targetType: at.type, targetId: targetEntity.id });
                            }
                        }
                    }
                    return;  // Attack command handled
                }
                // Trade route to foreign port (plunder)
                if (handleTradeRouteClick(gameState, map, worldX, worldY, hexToPixel, SELECTION_RADIUS)) {
                    if (isMultiplayer && isGuest) {
                        sendGuestCommandForSelectedShips(COMMAND_TYPES.PLUNDER, {
                            targetQ: clickedHex.q, targetR: clickedHex.r,
                        });
                    }
                    clickedOnUnit = true;
                }
                // Unload at home port
                else if (handleHomePortUnloadClick(gameState, map, worldX, worldY, hexToPixel, SELECTION_RADIUS)) {
                    if (isMultiplayer && isGuest) {
                        sendGuestCommandForSelectedShips(COMMAND_TYPES.UNLOAD_CARGO, {});
                    }
                    clickedOnUnit = true;
                }
            }

            // Check unit selection (ships, ports, settlements)
            if (!clickedOnUnit) {
                const clickedUnit = handleUnitSelection(gameState, worldX, worldY, hexToPixel, SELECTION_RADIUS, isShiftHeld, getShipVisualPosLocal);
                clickedOnUnit = clickedUnit !== null;

                // Exit action mode when selecting a unit
                if (clickedUnit && gameState.actionMode.active) {
                    exitActionMode(gameState);
                    if (gameState.patrolMode.active) {
                        exitPatrolMode(gameState);
                    }
                }

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
                    if (handlePortRallyPointClick(gameState, map, clickedHex)) {
                        playPortWaypoint();
                    } else {
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
            // Cancel any active placement mode (matches desktop right-click behavior;
            // on mobile this is reached via long-press)
            if (gameState.portBuildMode.active) {
                exitPortBuildMode(gameState);
                return;
            }
            if (gameState.settlementBuildMode.active) {
                exitSettlementBuildMode(gameState);
                return;
            }
            if (gameState.towerBuildMode.active) {
                exitTowerBuildMode(gameState);
                return;
            }

            const mousePos = getMousePos();
            const mouseX = mousePos.x;
            const mouseY = mousePos.y;

            // Convert to world coordinates
            const worldX = (mouseX - k.width() / 2) / zoom + cameraX;
            const worldY = (mouseY - k.height() / 2) / zoom + cameraY;
            const clickedHex = pixelToHex(worldX, worldY);

            const isShiftHeld = shiftKeyHeld;

            // Attack enemy (skips ports if shift held for plundering)
            if (handleAttackClick(gameState, map, worldX, worldY, hexToPixel, SELECTION_RADIUS, getShipVisualPosLocal, isShiftHeld)) {
                // MP guest: send attack command with the target info
                if (isMultiplayer && isGuest) {
                    // Find what got targeted by checking selected ships' attackTarget
                    const selShips = getSelectedShips(gameState);
                    if (selShips.length > 0 && selShips[0].attackTarget) {
                        const at = selShips[0].attackTarget;
                        const targetEntity = (at.type === 'ship' ? gameState.ships : at.type === 'port' ? gameState.ports : at.type === 'settlement' ? gameState.settlements : gameState.towers)[at.index];
                        if (targetEntity) {
                            sendGuestCommandForSelectedShips(COMMAND_TYPES.ATTACK, { targetType: at.type, targetId: targetEntity.id });
                        }
                    }
                }
                return;
            }

            // Plunder route to enemy port (requires shift)
            if (handleTradeRouteClick(gameState, map, worldX, worldY, hexToPixel, SELECTION_RADIUS, isShiftHeld)) {
                if (isMultiplayer && isGuest) {
                    sendGuestCommandForSelectedShips(COMMAND_TYPES.PLUNDER, {
                        targetQ: clickedHex.q, targetR: clickedHex.r,
                    });
                }
                return;
            }

            // Unload at home port
            if (handleHomePortUnloadClick(gameState, map, worldX, worldY, hexToPixel, SELECTION_RADIUS)) {
                if (isMultiplayer && isGuest) {
                    sendGuestCommandForSelectedShips(COMMAND_TYPES.UNLOAD_CARGO, {});
                }
                return;
            }

            // Patrol mode - add waypoints to patrol route
            if (gameState.patrolMode.active) {
                handlePatrolWaypointClick(gameState, map, clickedHex);
                // MP guest: send patrol command
                if (isMultiplayer && isGuest) {
                    const selShips = getSelectedShips(gameState);
                    if (selShips.length > 0 && selShips[0].patrolRoute) {
                        sendGuestCommandForSelectedShips(COMMAND_TYPES.SET_PATROL, { waypoints: selShips[0].patrolRoute });
                    }
                }
                return;
            }

            // Set waypoint (try port rally point first, then ship waypoint)
            if (!handlePortRallyPointClick(gameState, map, clickedHex)) {
                handleWaypointClick(gameState, map, clickedHex, isShiftHeld);
                // MP guest: send move command
                if (isMultiplayer && isGuest) {
                    sendGuestCommandForSelectedShips(COMMAND_TYPES.MOVE_SHIPS, {
                        waypoints: [{ q: clickedHex.q, r: clickedHex.r }],
                        append: isShiftHeld,
                    });
                }
            } else {
                playPortWaypoint();
                if (isMultiplayer && isGuest) {
                    // Rally point set for a port
                    for (const sel of gameState.selectedUnits) {
                        if (sel.type === 'port') {
                            const port = gameState.ports[sel.index];
                            if (port && port.owner === localPlayerId) {
                                sendGuestGenericCommand(COMMAND_TYPES.SET_RALLY, {
                                    portId: port.id, q: clickedHex.q, r: clickedHex.r,
                                });
                            }
                        }
                    }
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

            // Shift held: add to existing selection. Otherwise replace.
            const isShiftHeld = shiftKeyHeld;
            if (!isShiftHeld) {
                clearSelection(gameState);
            }

            // Track if any ships are selected for sound
            let shipsSelected = false;

            // Check each ship (skip pirate and non-local ships)
            for (let i = 0; i < gameState.ships.length; i++) {
                const ship = gameState.ships[i];
                if (isPirateShip(ship)) continue;
                if (ship.owner !== localPlayerId) continue;
                const pos = getShipVisualPosLocal(ship);
                const screenX = (pos.x - effectiveCameraX) * zoom + halfWidth;
                const screenY = (pos.y - effectiveCameraY) * zoom + halfHeight;

                if (screenX >= boxLeft && screenX <= boxRight &&
                    screenY >= boxTop && screenY <= boxBottom) {
                    addToSelection(gameState, 'ship', i);
                    shipsSelected = true;
                }
            }

            // Check each port (skip non-local ports)
            for (let i = 0; i < gameState.ports.length; i++) {
                const port = gameState.ports[i];
                if (port.owner !== localPlayerId) continue;
                const pos = hexToPixel(port.q, port.r);
                const screenX = (pos.x - effectiveCameraX) * zoom + halfWidth;
                const screenY = (pos.y - effectiveCameraY) * zoom + halfHeight;

                if (screenX >= boxLeft && screenX <= boxRight &&
                    screenY >= boxTop && screenY <= boxBottom) {
                    addToSelection(gameState, 'port', i);
                }
            }

            // Check each settlement (skip non-local settlements)
            for (let i = 0; i < gameState.settlements.length; i++) {
                const settlement = gameState.settlements[i];
                if (settlement.owner !== localPlayerId) continue;
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
                    if (isPirateShip(ship)) continue;  // Don't select pirate ships
                    if (ship.owner !== localPlayerId) continue;   // Don't select non-local ships
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
                    if (port.owner !== localPlayerId) continue;   // Don't select non-local ports

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
                    if (tower.owner !== localPlayerId) continue;   // Don't select non-local towers

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
                    if (settlement.owner !== localPlayerId) continue;  // Don't select non-local settlements

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

        // === MOBILE TOUCH SUPPORT ===
        // Initialize touch handlers for mobile devices
        let lastMinimapTapTime = 0;
        let pendingMinimapTap = null;
        const MINIMAP_DOUBLE_TAP_THRESHOLD = 400;  // ms
        if (isMobile) {
            initTouchHandlers(k.canvas, {
                // Single tap = left click (select units, tap UI buttons)
                onTap: (x, y) => {
                    // Tap to dismiss game-over / disconnect overlay (mobile has no SPACE key)
                    if (gameState.gameOver || disconnectOverlay) {
                        cleanupAudio();
                        if (isMultiplayer) {
                            disconnect();
                        }
                        k.go("title");
                        return;
                    }

                    // Handle surrender button taps before blocking other input
                    if (gameState.surrenderPending) {
                        if (surrenderButtonBounds) {
                            const accept = surrenderButtonBounds.accept;
                            const decline = surrenderButtonBounds.decline;
                            if (x >= accept.x && x <= accept.x + accept.width &&
                                y >= accept.y && y <= accept.y + accept.height) {
                                const aiOwner = gameState.surrenderPending;
                                gameState.ships = gameState.ships.filter(s => s.owner !== aiOwner);
                                gameState.ports = gameState.ports.filter(p => p.owner !== aiOwner);
                                gameState.settlements = gameState.settlements.filter(s => s.owner !== aiOwner);
                                gameState.towers = gameState.towers.filter(t => t.owner !== aiOwner);
                                gameState.surrenderPending = null;
                                return;
                            }
                            if (x >= decline.x && x <= decline.x + decline.width &&
                                y >= decline.y && y <= decline.y + decline.height) {
                                gameState.surrenderDeclined[gameState.surrenderPending] = true;
                                gameState.surrenderPending = null;
                                return;
                            }
                        }
                        return;
                    }

                    // Tap on minimap: single tap navigates camera, double tap snaps home
                    const minimapClick = minimapClickToWorld(x, y, minimapBounds, minimapState);
                    if (minimapClick.hit) {
                        const now = Date.now();
                        if (pendingMinimapTap !== null && now - lastMinimapTapTime < MINIMAP_DOUBLE_TAP_THRESHOLD) {
                            clearTimeout(pendingMinimapTap);
                            pendingMinimapTap = null;
                            lastMinimapTapTime = 0;
                            snapCameraHome();
                        } else {
                            const targetX = minimapClick.worldX;
                            const targetY = minimapClick.worldY;
                            lastMinimapTapTime = now;
                            pendingMinimapTap = setTimeout(() => {
                                cameraX = targetX;
                                cameraY = targetY;
                                pendingMinimapTap = null;
                            }, MINIMAP_DOUBLE_TAP_THRESHOLD);
                        }
                        return;
                    }

                    // Set virtual mouse position for the click handler
                    virtualMousePos = { x, y };
                    selectStartX = x;
                    selectStartY = y;
                    selectEndX = x;
                    selectEndY = y;
                    handleClick();
                    virtualMousePos = null;
                },

                // Long press released without moving = right click (issue commands)
                onLongPress: (x, y) => {
                    if (gameState.gameOver || gameState.surrenderPending) return;
                    // Clear the armed selection box so it doesn't render
                    isSelecting = false;
                    // Set virtual mouse position for the right click handler
                    virtualMousePos = { x, y };
                    selectStartX = x;
                    selectStartY = y;
                    handleRightClick();
                    virtualMousePos = null;
                },

                // Long press hit 300ms hold without moving - arm drag-select mode
                onLongPressArm: (x, y) => {
                    if (gameState.gameOver || gameState.surrenderPending) return;
                    // Prime selection box at the touch point so a subsequent drag grows from here
                    selectStartX = x;
                    selectStartY = y;
                    selectEndX = x;
                    selectEndY = y;
                    isSelecting = true;
                    // Haptic cue so the user knows they're in select mode
                    if (navigator.vibrate) navigator.vibrate(15);
                },

                // Single finger drag (without holding first) = pan camera
                onDragStart: (x, y) => {
                    if (gameState.gameOver || gameState.surrenderPending) return;
                    touchPanCameraX = cameraX;
                    touchPanCameraY = cameraY;
                },

                onDragMove: (x, y, dx, dy) => {
                    if (gameState.gameOver || gameState.surrenderPending) return;
                    // Pan camera (invert direction for natural scrolling feel)
                    cameraX = touchPanCameraX - dx / zoom;
                    cameraY = touchPanCameraY - dy / zoom;
                    clampCamera();
                },

                onDragEnd: (x, y, wasDrag) => {
                    // Drag ended, camera position is already set
                },

                // Long-press → drag = selection box (drag-select units)
                onSelectionDragStart: (x, y) => {
                    if (gameState.gameOver || gameState.surrenderPending) return;
                    selectStartX = x;
                    selectStartY = y;
                    selectEndX = x;
                    selectEndY = y;
                    isSelecting = true;
                },

                onSelectionDragMove: (x, y) => {
                    if (gameState.gameOver || gameState.surrenderPending) return;
                    selectEndX = x;
                    selectEndY = y;
                },

                onSelectionDragEnd: (x, y) => {
                    if (gameState.gameOver || gameState.surrenderPending) {
                        isSelecting = false;
                        return;
                    }
                    selectEndX = x;
                    selectEndY = y;
                    handleSelectionBox();
                    isSelecting = false;
                },

                // Pinch = zoom
                onPinchStart: () => {
                    touchZoomBase = zoom;
                },

                onPinchMove: (scale, centerX, centerY) => {
                    // Calculate new zoom, clamped to valid range
                    const newZoom = Math.max(0.3, Math.min(1, touchZoomBase * scale));
                    zoom = newZoom;
                },

                onPinchEnd: () => {
                    // Pinch ended, zoom is already set
                },

                // Two-finger pan = camera movement
                onTwoFingerPanStart: (x, y) => {
                    touchPanCameraX = cameraX;
                    touchPanCameraY = cameraY;
                },

                onTwoFingerPanMove: (dx, dy) => {
                    cameraX = touchPanCameraX - dx / zoom;
                    cameraY = touchPanCameraY - dy / zoom;
                    clampCamera();
                },

                onTwoFingerPanEnd: () => {
                    // Pan ended
                },
            });

            console.log("Mobile touch controls enabled");
        }

        // Center camera on starting position (or map center if no start)
        // Guest uses their own home island, not the host's
        const cameraHome = (isMultiplayer && isGuest && gameState.player2HomeIslandHex)
            ? gameState.player2HomeIslandHex
            : gameState.homeIslandHex;
        if (cameraHome) {
            const startPos = hexToPixel(cameraHome.q, cameraHome.r);
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
