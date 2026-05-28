// Vignette: scripted demo of selecting a ship and attacking an enemy.
import { createShip, selectUnit, clearSelection } from "../gameState.js";
import { hexKey, hexNeighbors, hexDistance } from "../hex.js";
import { isWater } from "../mapGenerator.js";

// Find a water hex adjacent to a land port site, used as the player cutter's spawn.
function findCoastalWater(map) {
    for (const tile of map.tiles.values()) {
        if (!tile.isPortSite) continue;
        for (const n of hexNeighbors(tile.q, tile.r)) {
            const nt = map.tiles.get(hexKey(n.q, n.r));
            if (isWater(nt)) return { q: n.q, r: n.r };
        }
    }
    // Fallback: any water tile near map center
    for (const tile of map.tiles.values()) {
        if (isWater(tile)) return { q: tile.q, r: tile.r };
    }
    return null;
}

// Find a second water hex roughly `dist` hexes away from the first.
function findWaterAtDistance(map, fromQ, fromR, dist) {
    let best = null;
    let bestDelta = Infinity;
    for (const tile of map.tiles.values()) {
        if (!isWater(tile)) continue;
        const d = hexDistance(fromQ, fromR, tile.q, tile.r);
        const delta = Math.abs(d - dist);
        if (delta < bestDelta) {
            bestDelta = delta;
            best = { q: tile.q, r: tile.r };
        }
    }
    return best;
}

export const selectAndAttackVignette = {
    id: 'select-and-attack',
    title: 'Select & Attack',

    setup(gameState, map) {
        // Clear any prior ships from a previous loop iteration.
        gameState.ships = [];
        clearSelection(gameState);

        const playerSpawn = findCoastalWater(map);
        if (!playerSpawn) return null;

        const enemySpawn = findWaterAtDistance(map, playerSpawn.q, playerSpawn.r, 4);
        if (!enemySpawn) return null;

        const playerShip = createShip('cutter', playerSpawn.q, playerSpawn.r, 'player');
        const enemyShip = createShip('cutter', enemySpawn.q, enemySpawn.r, 'ai1');
        gameState.ships.push(playerShip, enemyShip);

        return {
            refs: { playerShip: playerShip.id, enemyShip: enemyShip.id },
            cameraTarget: {
                q: (playerSpawn.q + enemySpawn.q) / 2,
                r: (playerSpawn.r + enemySpawn.r) / 2,
            },
        };
    },

    steps: [
        { type: 'wait', duration: 0.6 },
        { type: 'caption', text: 'Click your ship to select it' },
        { type: 'moveCursorTo', target: 'playerShip' },
        { type: 'click', target: 'playerShip' },
        { type: 'wait', duration: 0.7 },
        { type: 'caption', text: 'Right-click an enemy to attack' },
        { type: 'moveCursorTo', target: 'enemyShip', sprite: 'cursor-attack' },
        { type: 'rightClick', target: 'enemyShip' },
        { type: 'waitUntil', condition: 'enemyDestroyed', timeout: 12 },
        { type: 'caption', text: 'Direct hit!' },
        { type: 'wait', duration: 2.0 },
        { type: 'respawn' },
    ],
};
