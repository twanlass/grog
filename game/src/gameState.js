// Game state for Trade Winds
import { PORTS } from "./sprites/ports.js";
import { SHIPS } from "./sprites/ships.js";
import { SETTLEMENTS } from "./sprites/settlements.js";
import { TOWERS, TOWER_TECH_TREE } from "./sprites/towers.js";
import { hexKey, hexNeighbors, hexDistance } from "./hex.js";

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

        // Game over state (for defend mode)
        gameOver: null,  // null = playing, 'win' = victory, 'lose' = defeated

        // Notification message to display (bottom center)
        notification: null,  // { message: string, timer: number }

        // Loot drops from destroyed pirates
        lootDrops: [],

        // Loot collection sparkle effects
        lootSparkles: [],
    };
}

// Create a new ship with navigation support
export function createShip(type, q, r) {
    return {
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
    };
}

// Create a new port (optionally under construction)
export function createPort(type, q, r, isConstructing = false, builderShipIndex = null) {
    return {
        type,
        q,
        r,
        buildQueue: null,  // { shipType, progress, buildTime } | null
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

// Start building a ship at a port
export function startBuilding(port, shipType) {
    const shipData = SHIPS[shipType];
    port.buildQueue = {
        shipType,
        progress: 0,
        buildTime: shipData.build_time,
    };
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
export function createSettlement(q, r, isConstructing = false, builderPortIndex = null) {
    return {
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
export function createTower(type, q, r, isConstructing = false, builderShipIndex = null) {
    return {
        type,
        q,
        r,
        health: TOWERS[type].health,
        attackCooldown: 0,
        construction: isConstructing ? {
            progress: 0,
            buildTime: TOWERS[type].buildTime,
            builderShipIndex: builderShipIndex,
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

// Compute current crew status (used/cap/available)
export function computeCrewStatus(gameState) {
    let cap = 0;
    let used = 0;

    // Ports contribute to cap (only completed ports)
    for (const port of gameState.ports) {
        if (!port.construction) {
            const portData = PORTS[port.type];
            cap += portData.crewCapContribution || 0;
        }
        // Ships in build queue count toward crew used (reserved when building starts)
        if (port.buildQueue) {
            const shipData = SHIPS[port.buildQueue.shipType];
            used += shipData.crewCost || 0;
        }
    }

    // Settlements contribute to cap (only completed settlements)
    for (const settlement of gameState.settlements) {
        if (!settlement.construction) {
            const settlementData = SETTLEMENTS.settlement;
            cap += settlementData.crewCapContribution || 0;
        }
    }

    // Player ships use crew (not pirates)
    for (const ship of gameState.ships) {
        if (ship.type !== 'pirate') {
            const shipData = SHIPS[ship.type];
            used += shipData.crewCost || 0;
        }
    }

    // Towers use crew (include under-construction since crew reserved at placement)
    for (const tower of gameState.towers) {
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
