// Game state for Trade Winds
import { PORTS } from "./sprites/ports.js";
import { SHIPS } from "./sprites/ships.js";
import { SETTLEMENTS } from "./sprites/settlements.js";
import { hexKey } from "./hex.js";

export function createGameState() {
    return {
        // Player's ports: [{ type: 'dock'|'shipyard'|'stronghold', q, r }]
        ports: [],

        // Player's ships: [{ type, q, r, waypoint, path, moveProgress }]
        ships: [],

        // Projectiles in flight: [{ sourceShipIndex, targetType, targetIndex, fromQ, fromR, toQ, toR, progress, damage, speed }]
        projectiles: [],

        // Currently selected units (multi-select)
        selectedUnits: [], // [{ type: 'ship'|'port', index: number }, ...]

        // Resources
        resources: {
            wood: 25,
            food: 25,
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

        // Pirate respawn queue: [{ timer }]
        pirateRespawnQueue: [],
    };
}

// Create a new ship with navigation support
export function createShip(type, q, r) {
    return {
        type,
        q,
        r,
        waypoint: null,     // { q, r } destination
        path: null,         // Array of { q, r } to follow
        moveProgress: 0,    // Progress toward next hex (0-1)
        heading: 0,         // Direction ship is facing (radians, 0 = right/east)
        // Trade route state
        tradeRoute: null,   // { foreignPortIndex, homePortIndex: 0 } | null
        cargo: { wood: 0, food: 0 },  // Current loaded cargo
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
    };
}

// Create a new port (optionally under construction)
export function createPort(type, q, r, isConstructing = false, builderShipIndex = null) {
    return {
        type,
        q,
        r,
        buildQueue: null,  // { shipType, progress, buildTime } | null
        storage: { wood: 0, food: 0 },  // Local resource storage for built ports
        // Port construction state (while being built by a ship)
        construction: isConstructing ? {
            progress: 0,
            buildTime: PORTS[type].buildTime,
            builderShipIndex: builderShipIndex,  // Ship that's building this port
        } : null,
        // Combat state
        health: PORTS[type].health,  // Current health (from port metadata)
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
        return null;
    }).filter(u => u !== null);
}

// Get selected ships only (for waypoint setting)
export function getSelectedShips(gameState) {
    return gameState.selectedUnits
        .filter(u => u.type === 'ship')
        .map(u => gameState.ships[u.index]);
}

// Find a good starting position on the map
export function findStartingPosition(map) {
    const { tiles, width, height } = map;

    // Find port sites near the center
    const centerQ = Math.floor(width / 2);
    const centerR = Math.floor(height / 2);

    let bestTile = null;
    let bestDistance = Infinity;

    for (const tile of tiles.values()) {
        if (tile.isPortSite) {
            // Calculate distance from center
            const dq = tile.q - centerQ;
            const dr = tile.r - centerR;
            const distance = Math.abs(dq) + Math.abs(dr);

            if (distance < bestDistance) {
                bestDistance = distance;
                bestTile = tile;
            }
        }
    }

    return bestTile;
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

// Check if a hex is a valid settlement site (land hex, not occupied)
export function isValidSettlementSite(map, q, r, existingSettlements, existingPorts) {
    const tile = map.tiles.get(hexKey(q, r));
    if (!tile || tile.type !== 'land') return false;

    // Check if already occupied by a settlement
    for (const settlement of existingSettlements) {
        if (settlement.q === q && settlement.r === r) return false;
    }

    // Check if already occupied by a port
    for (const port of existingPorts) {
        if (port.q === q && port.r === r) return false;
    }

    return true;
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
    const currentCargo = (ship.cargo?.wood || 0) + (ship.cargo?.food || 0);
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
