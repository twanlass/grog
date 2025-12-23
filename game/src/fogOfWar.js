// Fog of war state and logic
import { hexKey, hexNeighbors } from "./hex.js";
import { SHIPS } from "./sprites/ships.js";

// Create fog state (Set of revealed hex keys)
export function createFogState() {
    return {
        revealedHexes: new Set(),
    };
}

// Reveal a single hex
export function revealHex(fogState, q, r) {
    fogState.revealedHexes.add(hexKey(q, r));
}

// Reveal hex and all hexes within given radius
export function revealRadius(fogState, q, r, radius = 1) {
    revealHex(fogState, q, r);

    if (radius <= 0) return;

    // Use BFS to reveal all hexes within radius
    const visited = new Set([hexKey(q, r)]);
    let current = [{ q, r }];

    for (let ring = 1; ring <= radius; ring++) {
        const next = [];
        for (const hex of current) {
            for (const neighbor of hexNeighbors(hex.q, hex.r)) {
                const key = hexKey(neighbor.q, neighbor.r);
                if (!visited.has(key)) {
                    visited.add(key);
                    revealHex(fogState, neighbor.q, neighbor.r);
                    next.push(neighbor);
                }
            }
        }
        current = next;
    }
}

// Check if a hex is revealed
export function isHexRevealed(fogState, q, r) {
    return fogState.revealedHexes.has(hexKey(q, r));
}

// Initialize fog with starting visibility around ships and ports
export function initializeFog(fogState, gameState) {
    // Ports reveal 2-hex radius
    for (const port of gameState.ports) {
        revealRadius(fogState, port.q, port.r, 2);
    }
    // Ships reveal based on their sight_distance
    for (const ship of gameState.ships) {
        const sightDistance = SHIPS[ship.type].sight_distance;
        revealRadius(fogState, ship.q, ship.r, sightDistance);
    }
}
