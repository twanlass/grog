// Vignette: scripted demo of selecting a ship and attacking an enemy.
import { createShip, clearSelection } from "../gameState.js";
import { hexKey, hexNeighbors, hexDistance } from "../hex.js";
import { isWater } from "../mapGenerator.js";

// Collect water hexes adjacent to a starter island's coast. Tutorial maps run
// with versusMode=true, so 4 starter islands sit in known quadrants with
// `isStarterIsland: true` set on their land tiles.
function findStarterIslandCoastalWater(map) {
    const coastal = [];
    for (const tile of map.tiles.values()) {
        if (!isWater(tile)) continue;
        for (const n of hexNeighbors(tile.q, tile.r)) {
            const nt = map.tiles.get(hexKey(n.q, n.r));
            if (nt && nt.isStarterIsland && nt.type === 'land') {
                coastal.push({ q: tile.q, r: tile.r, islandQ: n.q, islandR: n.r });
                break;
            }
        }
    }
    return coastal;
}

export const selectAndAttackVignette = {
    id: 'select-and-attack',
    title: 'Select & Attack',

    setup(gameState, map) {
        gameState.ships = [];
        clearSelection(gameState);

        const allCoastal = findStarterIslandCoastalWater(map);
        if (allCoastal.length === 0) return null;

        // Anchor to the first starter island (top-left quadrant by default).
        // Group coastal water by the island they're touching (rough heuristic:
        // tiles within 6 hexes of each other belong to the same island).
        const anchor = allCoastal[0];
        const islandCoastal = allCoastal.filter(c =>
            hexDistance(anchor.islandQ, anchor.islandR, c.islandQ, c.islandR) <= 6
        );

        // Player spawns on the first coastal water hex; enemy spawns ~3 hexes
        // away along the same island so both fit in one camera view AND the
        // cutter is already inside attackDistance=3 when the script fires.
        const playerSpawn = islandCoastal[0];
        let enemySpawn = null;
        let bestDelta = Infinity;
        for (const c of islandCoastal) {
            if (c.q === playerSpawn.q && c.r === playerSpawn.r) continue;
            const d = hexDistance(playerSpawn.q, playerSpawn.r, c.q, c.r);
            const delta = Math.abs(d - 3);
            if (delta < bestDelta) { bestDelta = delta; enemySpawn = c; }
        }
        if (!enemySpawn) return null;

        const playerShip = createShip('cutter', playerSpawn.q, playerSpawn.r, 'player');
        const enemyShip = createShip('cutter', enemySpawn.q, enemySpawn.r, 'ai1');
        gameState.ships.push(playerShip, enemyShip);

        // Camera sits on the island center so the surrounding land frames the action.
        return {
            refs: { playerShip: playerShip.id, enemyShip: enemyShip.id },
            cameraTarget: { q: anchor.islandQ, r: anchor.islandR },
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
        { type: 'waitUntil', condition: 'enemyDestroyed', timeout: 22 },
        { type: 'caption', text: 'Direct hit!' },
        { type: 'wait', duration: 2.0 },
        { type: 'respawn' },
    ],
};
