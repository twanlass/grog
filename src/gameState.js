// Game state for Trade Winds

export function createGameState() {
    return {
        // Player's ports: [{ type: 'outpost'|'port'|'stronghold', q, r }]
        ports: [],

        // Player's ships: [{ type, q, r, waypoint, path, moveProgress }]
        ships: [],

        // Currently selected units (multi-select)
        selectedUnits: [], // [{ type: 'ship'|'port', index: number }, ...]

        // Resources
        resources: {
            wood: 100,
            steel: 50,
            food: 50,
            grog: 50,
        },

        // Time scale multiplier (1 = normal, 2 = 2x speed, 0 = paused)
        timeScale: 1,
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
    };
}

// Create a new port
export function createPort(type, q, r) {
    return {
        type,
        q,
        r,
    };
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
