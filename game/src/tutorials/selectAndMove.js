// Vignette: scripted demo of selecting a ship and moving it to a destination.
// This is the entry tutorial — it teaches click-to-select and right-click-to-move,
// then hands off to the select-and-attack vignette.
import { createShip, clearSelection } from "../gameState.js";
import { hexKey, hexNeighbors, hexDistance } from "../hex.js";
import { isWater } from "../mapGenerator.js";

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

export const selectAndMoveVignette = {
    id: 'select-and-move',
    title: 'Select & Move',

    setup(gameState, map) {
        gameState.ships = [];
        clearSelection(gameState);

        const allCoastal = findStarterIslandCoastalWater(map);
        if (allCoastal.length === 0) return null;

        const anchor = allCoastal[0];
        const islandCoastal = allCoastal.filter(c =>
            hexDistance(anchor.islandQ, anchor.islandR, c.islandQ, c.islandR) <= 6
        );

        const playerSpawn = islandCoastal[0];

        // Pick a water destination ~4 hexes from the player, biased toward open
        // water (away from the island) so the move actually reads as sailing.
        let destination = null;
        let bestScore = -Infinity;
        for (const tile of map.tiles.values()) {
            if (!isWater(tile)) continue;
            const dShip = hexDistance(playerSpawn.q, playerSpawn.r, tile.q, tile.r);
            if (dShip < 3 || dShip > 5) continue;
            const dIsland = hexDistance(anchor.islandQ, anchor.islandR, tile.q, tile.r);
            // Prefer hexes far from the island center and ~4 from the ship.
            const score = dIsland - Math.abs(dShip - 4) * 2;
            if (score > bestScore) { bestScore = score; destination = tile; }
        }
        if (!destination) return null;

        const playerShip = createShip('cutter', playerSpawn.q, playerSpawn.r, 'player');
        gameState.ships.push(playerShip);

        return {
            refs: { playerShip: playerShip.id },
            hexes: { destination: { q: destination.q, r: destination.r } },
            cameraTarget: { q: anchor.islandQ, r: anchor.islandR },
        };
    },

    steps: [
        { type: 'wait', duration: 0.6 },
        { type: 'caption', text: 'Click your ship to select it' },
        { type: 'moveCursorTo', target: 'playerShip' },
        { type: 'click', target: 'playerShip' },
        { type: 'wait', duration: 0.7 },
        { type: 'caption', text: 'Right-click on water to sail there' },
        { type: 'moveCursorTo', target: 'destination' },
        { type: 'rightClick', target: 'destination', mode: 'move' },
        { type: 'waitUntil', condition: 'shipArrived', target: 'playerShip', timeout: 15 },
        { type: 'wait', duration: 0.6 },
        { type: 'caption', text: 'Right-click and drag to pan the map' },
        { type: 'wait', duration: 2.5 },
        { type: 'caption', text: 'Scroll the mouse wheel to zoom' },
        { type: 'wait', duration: 2.5 },
        { type: 'nextVignette', id: 'select-and-attack' },
    ],
};
