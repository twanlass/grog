// Vignette: scripted demo of selecting a port, building a settlement, and
// queueing the player's first cutter. Sits between select-and-move
// (movement basics) and select-and-attack (combat basics).
import {
    createPort, clearSelection,
} from "../gameState.js";
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

// BFS-enumerate every land tile reachable from a starting land hex.
function enumerateIslandLand(map, startQ, startR) {
    const visited = new Set();
    const queue = [{ q: startQ, r: startR }];
    const tiles = [];
    while (queue.length > 0) {
        const cur = queue.shift();
        const key = hexKey(cur.q, cur.r);
        if (visited.has(key)) continue;
        visited.add(key);
        const tile = map.tiles.get(key);
        if (!tile || tile.type !== 'land') continue;
        tiles.push(tile);
        for (const n of hexNeighbors(cur.q, cur.r)) {
            if (!visited.has(hexKey(n.q, n.r))) queue.push(n);
        }
    }
    return tiles;
}

export const selectAndBuildVignette = {
    id: 'select-and-build',
    title: 'Build & Grow',

    setup(gameState, map) {
        gameState.ships = [];
        gameState.ports = [];
        gameState.settlements = [];
        gameState.towers = [];
        clearSelection(gameState);
        // Wood enough for one settlement (5) + one cutter (10) with a buffer.
        gameState.resources = { ...gameState.resources, wood: 30 };

        const allCoastal = findStarterIslandCoastalWater(map);
        if (allCoastal.length === 0) return null;
        const anchor = allCoastal[0];

        const islandTiles = enumerateIslandLand(map, anchor.islandQ, anchor.islandR);
        const portSites = islandTiles.filter(t => t.isPortSite);
        const inlandTiles = islandTiles.filter(t => !t.isPortSite);
        if (portSites.length === 0 || inlandTiles.length === 0) return null;

        // Pair: prefer a port site with a nearby inland tile (2-5 hexes apart)
        // so the placement reads cleanly on a single screen.
        let portTile = null;
        let settlementTile = null;
        let bestScore = -Infinity;
        for (const p of portSites) {
            for (const land of inlandTiles) {
                const d = hexDistance(p.q, p.r, land.q, land.r);
                if (d < 2 || d > 5) continue;
                const score = -Math.abs(d - 3); // prefer ~3 hexes apart
                if (score > bestScore) {
                    bestScore = score;
                    portTile = p;
                    settlementTile = land;
                }
            }
        }
        if (!portTile || !settlementTile) {
            // Fallback: take the first port site and the closest inland tile.
            portTile = portSites[0];
            settlementTile = inlandTiles
                .map(t => ({ tile: t, d: hexDistance(portTile.q, portTile.r, t.q, t.r) }))
                .sort((a, b) => a.d - b.d)[0].tile;
        }

        const playerPort = createPort('dock', portTile.q, portTile.r, false, null, 'player');
        gameState.ports.push(playerPort);
        gameState.homeIslandHex = { q: portTile.q, r: portTile.r };

        return {
            refs: { playerPort: playerPort.id },
            hexes: { settlementSite: { q: settlementTile.q, r: settlementTile.r } },
            // Anchor on the island center the other vignettes use so the camera
            // (set once at scene init) frames all three correctly.
            cameraTarget: { q: anchor.islandQ, r: anchor.islandR },
        };
    },

    steps: [
        { type: 'wait', duration: 0.6 },

        // Select the port.
        { type: 'caption', text: 'Click your port to see what it can build' },
        { type: 'moveCursorTo', target: 'playerPort' },
        { type: 'click', target: 'playerPort' },
        { type: 'wait', duration: 0.9 },

        // Build a settlement.
        { type: 'caption', text: 'Build a settlement to gather wood' },
        { type: 'wait', duration: 0.6 },
        { type: 'enterSettlementBuildMode', target: 'playerPort' },
        { type: 'moveCursorTo', target: 'settlementSite' },
        { type: 'placeSettlement', target: 'settlementSite' },
        { type: 'waitUntil', condition: 'settlementBuilt', timeout: 9 },
        { type: 'caption', text: 'Settlements produce wood over time' },
        { type: 'wait', duration: 2.2 },

        // Build a cutter.
        { type: 'caption', text: 'Click the port to build a ship' },
        { type: 'moveCursorTo', target: 'playerPort' },
        { type: 'click', target: 'playerPort' },
        { type: 'wait', duration: 0.8 },
        { type: 'caption', text: 'Build a Cutter — your first warship' },
        { type: 'wait', duration: 0.6 },
        { type: 'buildShip', target: 'playerPort', shipType: 'cutter' },
        { type: 'waitUntil', condition: 'shipBuilt', timeout: 10 },
        { type: 'wait', duration: 1.5 },

        { type: 'nextVignette', id: 'select-and-attack' },
    ],
};
