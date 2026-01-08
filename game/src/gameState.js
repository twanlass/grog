// Game state for Trade Winds
import { PORTS } from "./sprites/ports.js";
import { SHIPS } from "./sprites/ships.js";
import { SETTLEMENTS } from "./sprites/settlements.js";
import { TOWERS, TOWER_TECH_TREE } from "./sprites/towers.js";
import { hexKey, hexNeighbors, hexDistance } from "./hex.js";
import { AI_DIFFICULTY } from "./systems/aiPlayer.js";

export function createGameState(config = {}) {
    const startingResources = config.startingResources || { wood: 25 };

    return {
        // Player's ports: [{ type: 'dock'|'shipyard'|'stronghold', q, r }]
        ports: [],

        // Player's ships: [{ type, q, r, waypoint, path, moveProgress }]
        ships: [],

        // Projectiles in flight: [{ sourceShipIndex, targetType, targetIndex, fromQ, fromR, toQ, toR, progress, damage, speed }]
        projectiles: [],

        // Currently selected units (multi-select)
        selectedUnits: [], // [{ type: 'ship'|'port', index: number }, ...]

        // Currently targeted enemy ship for attack visualization (red hex border)
        attackTargetShipIndex: null,

        // Resources
        resources: {
            wood: startingResources.wood,
        },

        // Time scale multiplier (1 = normal, 2 = 2x speed, 0 = paused)
        timeScale: 1,

        // Port building placement mode
        portBuildMode: {
            active: false,
            builderShipIndex: null,
            portType: null,
            hoveredHex: null,
        },

        // Settlement building placement mode
        settlementBuildMode: {
            active: false,
            builderPortIndex: null,
            hoveredHex: null,
        },

        // Player's settlements: [{ q, r, construction }]
        settlements: [],

        // Player's towers: [{ type, q, r, health, construction, attackCooldown }]
        towers: [],

        // Tower building placement mode (always builds watchtower)
        towerBuildMode: {
            active: false,
            builderShipIndex: null,
            builderPortIndex: null,
            hoveredHex: null,
        },

        // Patrol waypoint setting mode
        patrolMode: {
            active: false,
        },

        // Pirate respawn queue: [{ timer }]
        pirateRespawnQueue: [],

        // Pirate kill counter
        pirateKills: 0,

        // Wave state (for defend mode)
        waveState: {
            currentWave: 0,          // Which wave we're on (0 = not started)
            waveActive: false,       // Is a wave currently in progress?
            rebuildTimer: 0,         // Countdown after wave cleared
            initialTimer: 0,         // Countdown before first wave
            waveStarted: false,      // Has the first wave been triggered?
        },

        // Ship explosion effects: [{ q, r, age, duration }]
        shipExplosions: [],

        // Floating debris from destroyed ships: [{ q, r, pieces: [...], age, duration }]
        floatingDebris: [],

        // Water splash effects from missed projectiles: [{ q, r, age, duration }]
        waterSplashes: [],

        // Home island - the landmass where the first port was placed
        // Used to determine which port is the "home port" (most recent port on this island)
        homeIslandHex: null,  // { q, r } - a reference hex on the home island

        // AI home islands (for versus mode - one per AI player)
        aiHomeIslandHexes: [],  // [{ q, r }, ...] - AI home island references

        // AI player states (for versus mode - one per AI player)
        aiPlayers: [],  // Array of AI player states, initialized in versus mode only

        // Game over state (for defend mode)
        gameOver: null,  // null = playing, 'win' = victory, 'lose' = defeated

        // AI surrender state (for versus mode)
        surrenderPending: null,  // 'ai1' or 'ai2' when surrender offered
        surrenderDeclined: { ai1: false, ai2: false },  // Track if player declined surrender

        // Notification message to display (bottom center)
        notification: null,  // { message: string, timer: number }

        // Loot drops from destroyed pirates
        lootDrops: [],

        // Loot collection sparkle effects
        lootSparkles: [],

        // Wood splinter effects from cannonball hits
        woodSplinters: [],

        // Cannon smoke puffs when firing
        cannonSmoke: [],

        // Attack alerts for minimap - tracks when player structures are attacked off-screen
        // Map of hexKey → { timestamp, q, r, type }
        attackedStructures: new Map(),
    };
}

// Create a new ship with navigation support
export function createShip(type, q, r, owner = 'player') {
    return {
        owner,  // 'player' | 'ai1' | 'ai2'
        type,
        q,
        r,
        waypoints: [],      // Array of { q, r } destinations (queue)
        path: null,         // Array of { q, r } to follow
        moveProgress: 0,    // Progress toward next hex (0-1)
        heading: 0,         // Direction ship is facing (radians, 0 = right/east)
        // Trade route state
        tradeRoute: null,   // { foreignPortIndex, homePortIndex: 0 } | null
        cargo: { wood: 0 },  // Current loaded cargo
        dockingState: null, // { action: 'loading'|'unloading', progress, totalUnits, unitsTransferred } | null
        pendingUnload: false, // Flag for one-time unload at home port
        isPlundering: false,  // True if on a plunder route (loading from enemy port)
        waitingForDock: null, // { portIndex, retryTimer } | null - waiting for dock to be free
        // AI state (for enemy ships like pirates)
        aiState: type === 'pirate' ? 'patrol' : null,  // 'patrol' | 'chase' | 'attack' | 'retreat'
        aiTarget: null,        // { type: 'ship'|'port', index } | null
        aiRetreatTimer: 0,     // Countdown for retreat cooldown
        aiChaseDistance: 0,    // Hexes traveled while chasing
        // Combat state
        health: SHIPS[type].health,  // Current health (from ship metadata)
        attackCooldown: 0,           // Timer for shot cooldown
        attackTarget: null,          // { type: 'ship', index } for player ships attacking pirates
        // Repair state
        repair: null,  // { progress, totalTime, healthToRestore } | null
        // Patrol state
        patrolRoute: [],      // Array of { q, r } - saved patrol waypoints for looping
        isPatrolling: false,  // Whether ship is in patrol loop mode
        // Animation state (for directional animated sprites)
        animFrame: 0,         // Current animation frame (0-5)
        animTimer: 0,         // Timer for frame cycling
    };
}

// Create a new port (optionally under construction)
export function createPort(type, q, r, isConstructing = false, builderShipIndex = null, owner = 'player') {
    return {
        owner,  // 'player' | 'ai1' | 'ai2'
        type,
        q,
        r,
        buildQueue: [],  // [{ shipType, progress, buildTime }, ...] - first item is active
        storage: { wood: 0 },  // Local resource storage for built ports
        rallyPoint: null,  // { q, r } - waypoint for newly built ships
        // Port construction state (while being built by a ship)
        construction: isConstructing ? {
            progress: 0,
            buildTime: PORTS[type].buildTime,
            builderShipIndex: builderShipIndex,  // Ship that's building this port
        } : null,
        // Combat state
        health: PORTS[type].health,  // Current health (from port metadata)
        // Repair state
        repair: null,  // { progress, totalTime, healthToRestore } | null
    };
}

// Check if a ship is currently building a port
export function isShipBuildingPort(shipIndex, ports) {
    return ports.some(port =>
        port.construction &&
        port.construction.builderShipIndex === shipIndex
    );
}

// Select a single unit (clears other selections)
export function selectUnit(gameState, type, index) {
    gameState.selectedUnits = [{ type, index }];
    gameState.attackTargetShipIndex = null; // Clear attack target when selecting a unit
}

// Add unit to selection (for multi-select)
export function addToSelection(gameState, type, index) {
    // Don't add duplicates
    if (!isSelected(gameState, type, index)) {
        gameState.selectedUnits.push({ type, index });
    }
}

// Toggle unit in selection (for shift+click)
export function toggleSelection(gameState, type, index) {
    const idx = gameState.selectedUnits.findIndex(u => u.type === type && u.index === index);
    if (idx >= 0) {
        gameState.selectedUnits.splice(idx, 1);
    } else {
        gameState.selectedUnits.push({ type, index });
    }
}

// Check if a unit is selected
export function isSelected(gameState, type, index) {
    return gameState.selectedUnits.some(u => u.type === type && u.index === index);
}

// Clear selection
export function clearSelection(gameState) {
    gameState.selectedUnits = [];
}

// Get all selected units (returns array of unit objects)
export function getSelectedUnits(gameState) {
    return gameState.selectedUnits.map(({ type, index }) => {
        if (type === 'ship') return gameState.ships[index];
        if (type === 'port') return gameState.ports[index];
        if (type === 'settlement') return gameState.settlements[index];
        if (type === 'tower') return gameState.towers[index];
        return null;
    }).filter(u => u !== null);
}

// Get selected ships only (for waypoint setting)
export function getSelectedShips(gameState) {
    return gameState.selectedUnits
        .filter(u => u.type === 'ship')
        .map(u => gameState.ships[u.index]);
}

// Get all land tiles connected to a starting hex (island analysis)
function getIslandTiles(map, startQ, startR) {
    const visited = new Set();
    const queue = [{ q: startQ, r: startR }];
    const tiles = [];

    while (queue.length > 0) {
        const current = queue.shift();
        const key = hexKey(current.q, current.r);
        if (visited.has(key)) continue;
        visited.add(key);

        const tile = map.tiles.get(key);
        if (!tile || tile.type !== 'land') continue;

        tiles.push(tile);
        const neighbors = hexNeighbors(current.q, current.r);
        for (const n of neighbors) {
            if (!visited.has(hexKey(n.q, n.r))) {
                queue.push(n);
            }
        }
    }
    return tiles;
}

// Find a good starting position on the map
// Prefers islands with both coastal (sand) and inland (grass) tiles
export function findStartingPosition(map) {
    const { tiles, width, height } = map;
    const centerQ = Math.floor(width / 2);
    const centerR = Math.floor(height / 2);

    // Collect all port sites with their island info
    const candidates = [];
    const analyzedIslands = new Set();

    for (const tile of tiles.values()) {
        if (!tile.isPortSite) continue;

        // Skip if we already analyzed this island from another port site
        const tileKey = hexKey(tile.q, tile.r);
        if (analyzedIslands.has(tileKey)) continue;

        const islandTiles = getIslandTiles(map, tile.q, tile.r);

        // Mark all tiles on this island as analyzed
        for (const t of islandTiles) {
            analyzedIslands.add(hexKey(t.q, t.r));
        }

        const portSites = islandTiles.filter(t => t.isPortSite);
        const inlandTiles = islandTiles.filter(t => !t.isPortSite);
        const hasBothTerrains = portSites.length > 0 && inlandTiles.length > 0;

        // Find the port site on this island closest to center
        let bestPortSite = null;
        let bestDist = Infinity;
        for (const ps of portSites) {
            const dq = ps.q - centerQ;
            const dr = ps.r - centerR;
            const dist = Math.abs(dq) + Math.abs(dr);
            if (dist < bestDist) {
                bestDist = dist;
                bestPortSite = ps;
            }
        }

        if (bestPortSite) {
            candidates.push({
                tile: bestPortSite,
                distance: bestDist,
                hasBothTerrains,
                totalSize: islandTiles.length
            });
        }
    }

    // Sort: prefer islands with both terrains, then by distance to center
    candidates.sort((a, b) => {
        if (a.hasBothTerrains !== b.hasBothTerrains) {
            return b.hasBothTerrains - a.hasBothTerrains; // true (1) before false (0)
        }
        return a.distance - b.distance; // closer to center
    });

    return candidates[0]?.tile || null;
}

// Find starting positions on opposite sides of the map (for versus mode)
// Returns { player: {q, r}, ai: {q, r} } or null if not possible
export function findOppositeStartingPositions(map) {
    const { tiles, width, height } = map;
    const centerQ = Math.floor(width / 2);
    const centerR = Math.floor(height / 2);

    // Collect all valid port sites with their island info
    const candidates = [];
    const analyzedIslands = new Set();

    for (const tile of tiles.values()) {
        if (!tile.isPortSite) continue;

        const tileKey = hexKey(tile.q, tile.r);
        if (analyzedIslands.has(tileKey)) continue;

        const islandTiles = getIslandTiles(map, tile.q, tile.r);

        for (const t of islandTiles) {
            analyzedIslands.add(hexKey(t.q, t.r));
        }

        const portSites = islandTiles.filter(t => t.isPortSite);
        const inlandTiles = islandTiles.filter(t => !t.isPortSite);
        const hasBothTerrains = portSites.length > 0 && inlandTiles.length > 0;

        // Only consider islands with both terrains (can build settlements)
        if (!hasBothTerrains) continue;

        // Find the port site on this island closest to center
        let bestPortSite = null;
        let bestDist = Infinity;
        for (const ps of portSites) {
            const dq = ps.q - centerQ;
            const dr = ps.r - centerR;
            const dist = Math.abs(dq) + Math.abs(dr);
            if (dist < bestDist) {
                bestDist = dist;
                bestPortSite = ps;
            }
        }

        if (bestPortSite) {
            candidates.push({
                tile: bestPortSite,
                distanceToCenter: bestDist,
                totalSize: islandTiles.length,
            });
        }
    }

    // Sort by island size (prefer larger islands)
    candidates.sort((a, b) => b.totalSize - a.totalSize);

    // Find two candidates that are far enough apart (at least 25 hexes)
    const MIN_DISTANCE = 25;
    for (let i = 0; i < candidates.length; i++) {
        const pos1 = candidates[i];
        for (let j = i + 1; j < candidates.length; j++) {
            const pos2 = candidates[j];

            const dist = hexDistance(pos1.tile.q, pos1.tile.r, pos2.tile.q, pos2.tile.r);
            if (dist >= MIN_DISTANCE) {
                // Assign player to the one closer to center, AI to the farther one
                if (pos1.distanceToCenter <= pos2.distanceToCenter) {
                    return {
                        player: { q: pos1.tile.q, r: pos1.tile.r },
                        ai: { q: pos2.tile.q, r: pos2.tile.r },
                    };
                } else {
                    return {
                        player: { q: pos2.tile.q, r: pos2.tile.r },
                        ai: { q: pos1.tile.q, r: pos1.tile.r },
                    };
                }
            }
        }
    }

    // Fallback: use first and last candidates if available
    if (candidates.length >= 2) {
        return {
            player: { q: candidates[0].tile.q, r: candidates[0].tile.r },
            ai: { q: candidates[candidates.length - 1].tile.q, r: candidates[candidates.length - 1].tile.r },
        };
    }

    return null;
}

// Find starting positions for 3 factions (player + 2 AIs) in versus mode
// Returns { player: {q, r}, ai1: {q, r}, ai2: {q, r} } or null if not possible
export function findTriangularStartingPositions(map) {
    const { tiles, width, height } = map;
    const centerQ = Math.floor(width / 2);
    const centerR = Math.floor(height / 2);

    // Collect all valid port sites with their island info
    const candidates = [];
    const analyzedIslands = new Set();

    for (const tile of tiles.values()) {
        if (!tile.isPortSite) continue;

        const tileKey = hexKey(tile.q, tile.r);
        if (analyzedIslands.has(tileKey)) continue;

        const islandTiles = getIslandTiles(map, tile.q, tile.r);

        for (const t of islandTiles) {
            analyzedIslands.add(hexKey(t.q, t.r));
        }

        const portSites = islandTiles.filter(t => t.isPortSite);
        const inlandTiles = islandTiles.filter(t => !t.isPortSite);
        const hasBothTerrains = portSites.length > 0 && inlandTiles.length > 0;

        // Only consider islands with both terrains (can build settlements)
        if (!hasBothTerrains) continue;

        // Find the port site on this island closest to center
        let bestPortSite = null;
        let bestDist = Infinity;
        for (const ps of portSites) {
            const dq = ps.q - centerQ;
            const dr = ps.r - centerR;
            const dist = Math.abs(dq) + Math.abs(dr);
            if (dist < bestDist) {
                bestDist = dist;
                bestPortSite = ps;
            }
        }

        if (bestPortSite) {
            candidates.push({
                tile: bestPortSite,
                distanceToCenter: bestDist,
                totalSize: islandTiles.length,
            });
        }
    }

    // Sort by island size (prefer larger islands)
    candidates.sort((a, b) => b.totalSize - a.totalSize);

    // Find three candidates that maximize minimum pairwise distance
    const MIN_DISTANCE = 20;  // Minimum distance between any two factions
    let bestTriple = null;
    let bestMinDist = 0;

    for (let i = 0; i < candidates.length; i++) {
        for (let j = i + 1; j < candidates.length; j++) {
            for (let k = j + 1; k < candidates.length; k++) {
                const pos1 = candidates[i];
                const pos2 = candidates[j];
                const pos3 = candidates[k];

                const dist12 = hexDistance(pos1.tile.q, pos1.tile.r, pos2.tile.q, pos2.tile.r);
                const dist13 = hexDistance(pos1.tile.q, pos1.tile.r, pos3.tile.q, pos3.tile.r);
                const dist23 = hexDistance(pos2.tile.q, pos2.tile.r, pos3.tile.q, pos3.tile.r);

                const minDist = Math.min(dist12, dist13, dist23);

                if (minDist >= MIN_DISTANCE && minDist > bestMinDist) {
                    bestMinDist = minDist;
                    bestTriple = [pos1, pos2, pos3];
                }
            }
        }
    }

    if (bestTriple) {
        // Sort by distance to center - player gets closest, AIs get farther positions
        bestTriple.sort((a, b) => a.distanceToCenter - b.distanceToCenter);
        return {
            player: { q: bestTriple[0].tile.q, r: bestTriple[0].tile.r },
            ai1: { q: bestTriple[1].tile.q, r: bestTriple[1].tile.r },
            ai2: { q: bestTriple[2].tile.q, r: bestTriple[2].tile.r },
        };
    }

    // Fallback: use first three candidates if available
    if (candidates.length >= 3) {
        return {
            player: { q: candidates[0].tile.q, r: candidates[0].tile.r },
            ai1: { q: candidates[1].tile.q, r: candidates[1].tile.r },
            ai2: { q: candidates[2].tile.q, r: candidates[2].tile.r },
        };
    }

    return null;
}

// Create AI player state (for versus mode)
export function createAIPlayerState(config = {}) {
    const startingResources = config.startingResources || { wood: 25 };
    const difficulty = config.difficulty || 'normal';
    const difficultySettings = AI_DIFFICULTY[difficulty] || AI_DIFFICULTY.normal;

    // Random strategy selection at game start
    const strategyKeys = ['aggressive', 'defensive', 'economic'];
    const selectedStrategy = config.strategy || strategyKeys[Math.floor(Math.random() * strategyKeys.length)];

    return {
        // AI resources (separate from player)
        resources: {
            wood: startingResources.wood,
        },

        // Difficulty settings
        difficulty,
        difficultySettings,

        // Strategy (selected once at game start, never changes)
        strategy: selectedStrategy,

        // Game phase tracking (for phase modifiers)
        gamePhase: 'early',  // 'early' | 'mid' | 'late'
        gameTime: 0,         // Total elapsed game time in seconds

        // Decision timers
        decisionCooldown: 0,      // Time until next strategic decision
        buildDecisionCooldown: 0, // Time until next build evaluation
        shipCommandCooldown: 0,   // Time until next ship command update

        // Strategic priorities (weights 0-1, adjusted dynamically based on strategy)
        priorities: {
            expansion: 0.5,   // Build more ports/settlements
            economy: 0.5,     // Focus on trade ships
            military: 0.5,    // Build combat ships/towers
            defense: 0.5,     // Repair and protect existing assets
        },

        // Threat tracking
        threatLevel: 0,  // 0-1, increases when attacked

        // Tactical state
        tactics: {
            scoutShipIndex: null,       // Index of designated scout ship
            enemyBaseLocation: null,    // { q, r } once discovered
            attackGroup: [],            // Ship indices in coordinated attack group
            attackTarget: null,         // { q, r } current group attack target
            isDefending: false,         // Recall/defend mode active
            // Port expansion
            discoveredIslands: [],      // Array of { portSiteHex, distanceFromHome, hasEnemyPresence }
            expansionShipIndex: null,   // Ship assigned to expansion mission
        },
        tacticsCooldown: 0,             // Time until next tactics evaluation
    };
}

// Find an adjacent water tile for ship placement
export function findAdjacentWater(map, q, r) {
    const { tiles } = map;
    const directions = [
        { q: 1, r: 0 },
        { q: 1, r: -1 },
        { q: 0, r: -1 },
        { q: -1, r: 0 },
        { q: -1, r: 1 },
        { q: 0, r: 1 },
    ];

    for (const dir of directions) {
        const key = `${q + dir.q},${r + dir.r}`;
        const tile = tiles.get(key);
        if (tile && (tile.type === 'shallow' || tile.type === 'deep_ocean')) {
            return tile;
        }
    }

    return null;
}

// Find the nearest water tile within a given range (for attacking inland structures)
// Uses BFS to find the closest water tile
export function findNearestWaterInRange(map, q, r, maxRange = 2) {
    const { tiles } = map;
    const visited = new Set();
    const queue = [{ q, r, dist: 0 }];
    visited.add(`${q},${r}`);

    const directions = [
        { q: 1, r: 0 },
        { q: 1, r: -1 },
        { q: 0, r: -1 },
        { q: -1, r: 0 },
        { q: -1, r: 1 },
        { q: 0, r: 1 },
    ];

    while (queue.length > 0) {
        const current = queue.shift();

        // Check if this tile is water
        const key = `${current.q},${current.r}`;
        const tile = tiles.get(key);
        if (tile && (tile.type === 'shallow' || tile.type === 'deep_ocean')) {
            return tile;
        }

        // Don't expand beyond max range
        if (current.dist >= maxRange) continue;

        // Add neighbors to queue
        for (const dir of directions) {
            const nq = current.q + dir.q;
            const nr = current.r + dir.r;
            const nkey = `${nq},${nr}`;

            if (!visited.has(nkey)) {
                visited.add(nkey);
                queue.push({ q: nq, r: nr, dist: current.dist + 1 });
            }
        }
    }

    return null;
}

// Find an adjacent water tile that's not occupied by a ship
export function findFreeAdjacentWater(map, q, r, ships) {
    const { tiles } = map;
    const directions = [
        { q: 1, r: 0 },
        { q: 1, r: -1 },
        { q: 0, r: -1 },
        { q: -1, r: 0 },
        { q: -1, r: 1 },
        { q: 0, r: 1 },
    ];

    const occupied = new Set(ships.map(s => `${s.q},${s.r}`));

    for (const dir of directions) {
        const key = `${q + dir.q},${r + dir.r}`;
        const tile = tiles.get(key);
        if (tile && (tile.type === 'shallow' || tile.type === 'deep_ocean') && !occupied.has(key)) {
            return tile;
        }
    }

    return null;
}

// Get list of ship types a port can build
export function getBuildableShips(port) {
    const portData = PORTS[port.type];
    return portData.canBuild.map(name => name.toLowerCase());
}

// Add a ship to the build queue (max 3 items)
// If queue is empty and resources are available, starts building immediately
// If queue has items, adds to queue without deducting resources
export function addToBuildQueue(port, shipType, resources, isActive = false) {
    const shipData = SHIPS[shipType];
    const item = {
        shipType,
        progress: isActive ? 0 : null, // Only active item has progress
        buildTime: shipData.build_time,
    };
    port.buildQueue.push(item);
}

// Start building the first item in queue (sets progress to 0)
export function startBuildingFirstItem(port) {
    if (port.buildQueue.length > 0 && port.buildQueue[0].progress === null) {
        port.buildQueue[0].progress = 0;
    }
}

// Cancel a build queue item and optionally refund resources
// Returns true if item was cancelled, false if not found
export function cancelBuildItem(port, index, resources) {
    if (index < 0 || index >= port.buildQueue.length) return false;

    const item = port.buildQueue[index];
    const shipData = SHIPS[item.shipType];

    // Refund resources only for active build (index 0 with progress started)
    if (index === 0 && item.progress !== null) {
        for (const [resource, amount] of Object.entries(shipData.cost)) {
            resources[resource] = (resources[resource] || 0) + amount;
        }
    }

    // Remove from queue
    port.buildQueue.splice(index, 1);

    // If we removed the active item and there are more in queue,
    // the new first item will be started by construction.js when resources are available

    return true;
}

// Legacy function for backwards compatibility
export function startBuilding(port, shipType) {
    const shipData = SHIPS[shipType];
    port.buildQueue = [{
        shipType,
        progress: 0,
        buildTime: shipData.build_time,
    }];
}

// Enter port building placement mode
export function enterPortBuildMode(gameState, shipIndex, portType) {
    gameState.portBuildMode = {
        active: true,
        builderShipIndex: shipIndex,
        portType: portType,
        hoveredHex: null,
    };
}

// Exit port building placement mode
export function exitPortBuildMode(gameState) {
    gameState.portBuildMode = {
        active: false,
        builderShipIndex: null,
        portType: null,
        hoveredHex: null,
    };
}

// Check if a hex is a valid port site (shore hex, not occupied by existing port)
export function isValidPortSite(map, q, r, existingPorts) {
    const tile = map.tiles.get(hexKey(q, r));
    if (!tile || !tile.isPortSite) return false;

    // Check if already occupied by a port
    for (const port of existingPorts) {
        if (port.q === q && port.r === r) return false;
    }

    return true;
}

// Get the next port type in tech tree (null if already max)
export function getNextPortType(currentType) {
    const techTree = ['dock', 'shipyard', 'stronghold'];
    const currentIndex = techTree.indexOf(currentType);
    if (currentIndex === -1 || currentIndex >= techTree.length - 1) {
        return null;  // Already at max or invalid
    }
    return techTree[currentIndex + 1];
}

// Start upgrading a port to the next tier
export function startPortUpgrade(port) {
    const nextType = getNextPortType(port.type);
    if (!nextType) return false;

    port.construction = {
        progress: 0,
        buildTime: PORTS[nextType].buildTime,
        upgradeTo: nextType,  // Track what we're upgrading to
    };
    return true;
}

// Create a new settlement (optionally under construction)
export function createSettlement(q, r, isConstructing = false, builderPortIndex = null, owner = 'player') {
    return {
        owner,  // 'player' | 'ai1' | 'ai2'
        q,
        r,
        parentPortIndex: builderPortIndex,  // Track which port owns this settlement
        generationTimer: 0,  // Timer for resource generation
        health: SETTLEMENTS.settlement.health,  // Combat health
        construction: isConstructing ? {
            progress: 0,
            buildTime: SETTLEMENTS.settlement.buildTime,
        } : null,
    };
}

// Enter settlement building placement mode
export function enterSettlementBuildMode(gameState, portIndex) {
    gameState.settlementBuildMode = {
        active: true,
        builderPortIndex: portIndex,
        hoveredHex: null,
    };
}

// Exit settlement building placement mode
export function exitSettlementBuildMode(gameState) {
    gameState.settlementBuildMode = {
        active: false,
        builderPortIndex: null,
        hoveredHex: null,
    };
}

// Check if two hexes are connected by land (BFS through land tiles)
export function isLandConnected(map, startQ, startR, targetQ, targetR) {
    const startKey = hexKey(startQ, startR);
    const targetKey = hexKey(targetQ, targetR);

    if (startKey === targetKey) return true;

    const visited = new Set([startKey]);
    const queue = [{ q: startQ, r: startR }];

    while (queue.length > 0) {
        const current = queue.shift();
        const neighbors = hexNeighbors(current.q, current.r);

        for (const n of neighbors) {
            const key = hexKey(n.q, n.r);
            if (visited.has(key)) continue;
            visited.add(key);

            const tile = map.tiles.get(key);
            if (!tile || tile.type !== 'land') continue;

            if (key === targetKey) return true;
            queue.push(n);
        }
    }
    return false;
}

// Find the nearest port that is land-connected to a settlement
// Returns port index or null if no connected port exists
export function findNearestLandConnectedPort(map, settlementQ, settlementR, ports) {
    let nearestPort = null;
    let nearestDistance = Infinity;

    for (let i = 0; i < ports.length; i++) {
        const port = ports[i];
        if (port.construction) continue; // Skip ports under construction

        if (isLandConnected(map, port.q, port.r, settlementQ, settlementR)) {
            const dist = hexDistance(port.q, port.r, settlementQ, settlementR);
            if (dist < nearestDistance) {
                nearestDistance = dist;
                nearestPort = i;
            }
        }
    }
    return nearestPort;
}

// Find the nearest port that is land-connected to a settlement AND owned by the specified owner
// Returns port index or null if no connected port exists
export function findNearestLandConnectedPortForOwner(map, settlementQ, settlementR, ports, owner) {
    let nearestPort = null;
    let nearestDistance = Infinity;

    for (let i = 0; i < ports.length; i++) {
        const port = ports[i];
        if (port.construction) continue; // Skip ports under construction
        if ((port.owner || 'player') !== owner) continue; // Skip ports of different owner

        if (isLandConnected(map, port.q, port.r, settlementQ, settlementR)) {
            const dist = hexDistance(port.q, port.r, settlementQ, settlementR);
            if (dist < nearestDistance) {
                nearestDistance = dist;
                nearestPort = i;
            }
        }
    }
    return nearestPort;
}

// Get the home port index (first completed port on the home island)
// Returns null if no home port exists
export function getHomePortIndex(gameState, map) {
    if (!gameState.homeIslandHex) return null;

    // Find the first (lowest index) port on the home island
    // (skip new construction, but allow upgrading ports)
    for (let i = 0; i < gameState.ports.length; i++) {
        const port = gameState.ports[i];
        // Skip ports under new construction, but allow upgrading ports
        if (port.construction && !port.construction.upgradeTo) continue;

        // Check if this port is on the home island (land-connected to home island hex)
        if (isLandConnected(map, gameState.homeIslandHex.q, gameState.homeIslandHex.r, port.q, port.r)) {
            return i;
        }
    }
    return null;
}

// Check if a hex is a valid settlement site (land hex, not occupied, connected to builder port)
export function isValidSettlementSite(map, q, r, existingSettlements, existingPorts, builderPort = null) {
    const tile = map.tiles.get(hexKey(q, r));
    if (!tile || tile.type !== 'land') return false;

    // Only allow settlements on inland (grass) tiles, not coastal (sand) tiles
    if (tile.isPortSite) return false;

    // Check if already occupied by a settlement
    for (const settlement of existingSettlements) {
        if (settlement.q === q && settlement.r === r) return false;
    }

    // Check if already occupied by a port
    for (const port of existingPorts) {
        if (port.q === q && port.r === r) return false;
    }

    // Check if connected by land to the builder port
    if (builderPort && !isLandConnected(map, builderPort.q, builderPort.r, q, r)) {
        return false;
    }

    return true;
}

// Create a new tower (optionally under construction)
export function createTower(type, q, r, isConstructing = false, builderShipIndex = null, builderPortIndex = null, owner = 'player') {
    return {
        owner,  // 'player' | 'ai1' | 'ai2'
        type,
        q,
        r,
        health: TOWERS[type].health,
        attackCooldown: 0,
        construction: isConstructing ? {
            progress: 0,
            buildTime: TOWERS[type].buildTime,
            builderShipIndex: builderShipIndex,
            builderPortIndex: builderPortIndex,
        } : null,
        // Repair state
        repair: null,  // { progress, totalTime, healthToRestore } | null
    };
}

// Enter tower building placement mode (always builds watchtower)
// builderType: 'ship' or 'port'
export function enterTowerBuildMode(gameState, builderIndex, builderType = 'ship') {
    gameState.towerBuildMode = {
        active: true,
        builderShipIndex: builderType === 'ship' ? builderIndex : null,
        builderPortIndex: builderType === 'port' ? builderIndex : null,
        hoveredHex: null,
    };
}

// Exit tower building placement mode
export function exitTowerBuildMode(gameState) {
    gameState.towerBuildMode = {
        active: false,
        builderShipIndex: null,
        builderPortIndex: null,
        hoveredHex: null,
    };
}

// Enter patrol waypoint setting mode
export function enterPatrolMode(gameState) {
    gameState.patrolMode.active = true;
}

// Exit patrol waypoint setting mode
export function exitPatrolMode(gameState) {
    gameState.patrolMode.active = false;
}

// Get the next tower type in the upgrade tree
export function getNextTowerType(currentType) {
    const currentIndex = TOWER_TECH_TREE.indexOf(currentType);
    if (currentIndex === -1 || currentIndex >= TOWER_TECH_TREE.length - 1) {
        return null;  // Already at max tier or invalid type
    }
    return TOWER_TECH_TREE[currentIndex + 1];
}

// Start tower upgrade process
export function startTowerUpgrade(tower) {
    const nextType = getNextTowerType(tower.type);
    if (!nextType) return false;

    tower.construction = {
        progress: 0,
        buildTime: TOWERS[nextType].buildTime,
        upgradeTo: nextType,
    };
    return true;
}

// Check if a hex is a valid tower site (land hex, not occupied)
export function isValidTowerSite(map, q, r, existingTowers, existingPorts, existingSettlements) {
    const tile = map.tiles.get(hexKey(q, r));
    if (!tile || tile.type !== 'land') return false;

    // Check if already occupied by a tower
    for (const tower of existingTowers) {
        if (tower.q === q && tower.r === r) return false;
    }

    // Check if already occupied by a port
    for (const port of existingPorts) {
        if (port.q === q && port.r === r) return false;
    }

    // Check if already occupied by a settlement
    for (const settlement of existingSettlements) {
        if (settlement.q === q && settlement.r === r) return false;
    }

    return true;
}

// Check if a ship is currently building a tower
export function isShipBuildingTower(shipIndex, towers) {
    return towers.some(tower =>
        tower.construction &&
        tower.construction.builderShipIndex === shipIndex
    );
}

// Check if a port is currently building a tower
export function isPortBuildingTower(portIndex, towers) {
    return towers.some(tower =>
        tower.construction &&
        tower.construction.builderPortIndex === portIndex
    );
}

// Check if player can afford a cost
export function canAfford(resources, cost) {
    for (const [resource, amount] of Object.entries(cost)) {
        if ((resources[resource] || 0) < amount) return false;
    }
    return true;
}

// Deduct cost from resources
export function deductCost(resources, cost) {
    for (const [resource, amount] of Object.entries(cost)) {
        resources[resource] = (resources[resource] || 0) - amount;
    }
}

// Compute current crew status (used/cap/available) for a specific owner
export function computeCrewStatus(gameState, owner = 'player') {
    let cap = 0;
    let used = 0;

    // Ports contribute to cap (only completed ports owned by this player)
    for (const port of gameState.ports) {
        if (port.owner !== owner) continue;
        if (!port.construction) {
            const portData = PORTS[port.type];
            cap += portData.crewCapContribution || 0;
        }
        // Ships in build queue count toward crew used (all active items - resources deducted)
        for (const item of port.buildQueue) {
            if (item.progress !== null) {
                const shipData = SHIPS[item.shipType];
                used += shipData.crewCost || 0;
            }
        }
    }

    // Settlements contribute to cap (only completed settlements owned by this player)
    for (const settlement of gameState.settlements) {
        if (settlement.owner !== owner) continue;
        if (!settlement.construction) {
            const settlementData = SETTLEMENTS.settlement;
            cap += settlementData.crewCapContribution || 0;
        }
    }

    // Ships owned by this player use crew
    for (const ship of gameState.ships) {
        if (ship.owner !== owner) continue;
        const shipData = SHIPS[ship.type];
        used += shipData.crewCost || 0;
    }

    // Towers owned by this player use crew (include under-construction since crew reserved at placement)
    for (const tower of gameState.towers) {
        if (tower.owner !== owner) continue;
        const towerData = TOWERS[tower.type];
        used += towerData.crewCost || 0;
    }

    return {
        used,
        cap,
        available: cap - used,
    };
}

// Check if player can afford crew cost
export function canAffordCrew(gameState, crewCost) {
    const status = computeCrewStatus(gameState);
    return status.available >= crewCost;
}

// Check if a port is already building a settlement
export function isPortBuildingSettlement(portIndex, settlements) {
    return settlements.some(settlement => settlement.construction && settlement.parentPortIndex === portIndex);
}

// Check if ship is adjacent to a port (in a neighboring hex)
export function isShipAdjacentToPort(ship, port) {
    const dq = Math.abs(ship.q - port.q);
    const dr = Math.abs(ship.r - port.r);
    const ds = Math.abs((ship.q + ship.r) - (port.q + port.r));
    // In axial coordinates, neighbors have distance 1
    return (dq + dr + ds) / 2 === 1;
}

// Get remaining cargo space on a ship
export function getCargoSpace(ship, shipDefs) {
    const maxCargo = shipDefs[ship.type].cargo;
    const currentCargo = ship.cargo?.wood || 0;
    return maxCargo - currentCargo;
}

// Cancel an active trade route
export function cancelTradeRoute(ship) {
    ship.tradeRoute = null;
    ship.isPlundering = false;
    ship.dockingState = null;
    ship.waitingForDock = null;
}

// Find a nearby water hex for waiting (not adjacent to port, but close)
export function findNearbyWaitingHex(map, portQ, portR, ships) {
    const { tiles } = map;
    const occupied = new Set(ships.map(s => `${s.q},${s.r}`));

    // Get adjacent hexes to avoid (we want to wait NEAR but not AT the dock)
    const adjacentToPort = new Set();
    const directions = [
        { q: 1, r: 0 }, { q: 1, r: -1 }, { q: 0, r: -1 },
        { q: -1, r: 0 }, { q: -1, r: 1 }, { q: 0, r: 1 },
    ];
    for (const dir of directions) {
        adjacentToPort.add(`${portQ + dir.q},${portR + dir.r}`);
    }

    // BFS to find nearby water hex (distance 2-3 from port)
    const visited = new Set();
    const queue = [{ q: portQ, r: portR, dist: 0 }];
    visited.add(`${portQ},${portR}`);

    while (queue.length > 0) {
        const { q, r, dist } = queue.shift();

        for (const dir of directions) {
            const nq = q + dir.q;
            const nr = r + dir.r;
            const key = `${nq},${nr}`;

            if (visited.has(key)) continue;
            visited.add(key);

            const tile = tiles.get(key);
            if (!tile) continue;

            const isWater = tile.type === 'shallow' || tile.type === 'deep_ocean';
            if (!isWater) {
                queue.push({ q: nq, r: nr, dist: dist + 1 });
                continue;
            }

            // We want distance 2+ from port, not adjacent, and not occupied
            if (dist >= 1 && !adjacentToPort.has(key) && !occupied.has(key)) {
                return { q: nq, r: nr };
            }

            // Keep searching up to distance 4
            if (dist < 4) {
                queue.push({ q: nq, r: nr, dist: dist + 1 });
            }
        }
    }

    return null;
}

// Show a notification message (bottom center of screen)
export function showNotification(gameState, message, duration = 2.5) {
    gameState.notification = { message, timer: duration };
}

// Update notification timer (call each frame with dt)
export function updateNotification(gameState, dt) {
    if (gameState.notification) {
        gameState.notification.timer -= dt;
        if (gameState.notification.timer <= 0) {
            gameState.notification = null;
        }
    }
}

// ============================================================
// Ownership Helper Functions (for AI opponent support)
// ============================================================

// Get all ships owned by a specific faction
export function getShipsByOwner(gameState, owner) {
    return gameState.ships.filter(s => s.owner === owner);
}

// Get all ports owned by a specific faction
export function getPortsByOwner(gameState, owner) {
    return gameState.ports.filter(p => p.owner === owner);
}

// Get all settlements owned by a specific faction
export function getSettlementsByOwner(gameState, owner) {
    return gameState.settlements.filter(s => s.owner === owner);
}

// Get all towers owned by a specific faction
export function getTowersByOwner(gameState, owner) {
    return gameState.towers.filter(t => t.owner === owner);
}

// Get ship indices for a specific owner
export function getShipIndicesByOwner(gameState, owner) {
    const indices = [];
    for (let i = 0; i < gameState.ships.length; i++) {
        if (gameState.ships[i].owner === owner) {
            indices.push(i);
        }
    }
    return indices;
}

// Get port indices for a specific owner
export function getPortIndicesByOwner(gameState, owner) {
    const indices = [];
    for (let i = 0; i < gameState.ports.length; i++) {
        if (gameState.ports[i].owner === owner) {
            indices.push(i);
        }
    }
    return indices;
}

// Get home port index for a specific owner
export function getHomePortIndexForOwner(gameState, map, owner) {
    let homeHex = null;
    if (owner === 'player') {
        homeHex = gameState.homeIslandHex;
    } else if (owner === 'ai1') {
        homeHex = gameState.aiHomeIslandHexes[0];
    } else if (owner === 'ai2') {
        homeHex = gameState.aiHomeIslandHexes[1];
    }
    if (!homeHex) return null;

    for (let i = 0; i < gameState.ports.length; i++) {
        const port = gameState.ports[i];
        if (port.owner !== owner) continue;
        if (port.construction && !port.construction.upgradeTo) continue;
        if (isLandConnected(map, homeHex.q, homeHex.r, port.q, port.r)) {
            return i;
        }
    }
    return null;
}

// Count total entities for an owner (for win condition checking)
export function countEntitiesForOwner(gameState, owner) {
    const ships = getShipsByOwner(gameState, owner).length;
    const ports = getPortsByOwner(gameState, owner).length;
    const settlements = getSettlementsByOwner(gameState, owner).length;
    const towers = getTowersByOwner(gameState, owner).length;
    return { ships, ports, settlements, towers, total: ships + ports + settlements + towers };
}

// Check if an owner is an AI (ai1 or ai2)
export function isAIOwner(owner) {
    return owner === 'ai1' || owner === 'ai2';
}

// Get all AI owner identifiers
export function getAIOwners() {
    return ['ai1', 'ai2'];
}

// Get home island hex for a specific owner
export function getHomeIslandHexForOwner(gameState, owner) {
    if (owner === 'player') return gameState.homeIslandHex;
    if (owner === 'ai1') return gameState.aiHomeIslandHexes[0];
    if (owner === 'ai2') return gameState.aiHomeIslandHexes[1];
    return null;
}
