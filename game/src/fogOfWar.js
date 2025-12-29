// Fog of war state and logic
import { hexKey, hexNeighbors } from "./hex.js";
import { SHIPS } from "./sprites/ships.js";
import { PORTS } from "./sprites/ports.js";
import { SETTLEMENTS } from "./sprites/settlements.js";
import { TOWERS } from "./sprites/towers.js";

// Create fog state with explored (permanent) and visible (dynamic) hex sets
export function createFogState() {
    return {
        exploredHexes: new Set(),  // Hexes ever seen (permanent)
        visibleHexes: new Set(),   // Hexes currently visible (recalculated)
        isDirty: true,             // Flag to trigger recalculation
    };
}

// Reveal a single hex (adds to explored set)
export function revealHex(fogState, q, r) {
    fogState.exploredHexes.add(hexKey(q, r));
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

// Check if a hex has been explored (permanent)
export function isHexExplored(fogState, q, r) {
    return fogState.exploredHexes.has(hexKey(q, r));
}

// Check if a hex is currently visible (dynamic)
export function isHexVisible(fogState, q, r) {
    return fogState.visibleHexes.has(hexKey(q, r));
}

// Legacy alias for compatibility - checks if explored
export function isHexRevealed(fogState, q, r) {
    return fogState.exploredHexes.has(hexKey(q, r));
}

// Mark fog as needing recalculation
export function markVisibilityDirty(fogState) {
    fogState.isDirty = true;
}

// Check if visibility needs recalculation
export function isVisibilityDirty(fogState) {
    return fogState.isDirty;
}

// Helper: Add hexes within radius to a target set using BFS
function addRadiusToSet(targetSet, q, r, radius) {
    targetSet.add(hexKey(q, r));
    if (radius <= 0) return;

    const visited = new Set([hexKey(q, r)]);
    let current = [{ q, r }];

    for (let ring = 1; ring <= radius; ring++) {
        const next = [];
        for (const hex of current) {
            for (const neighbor of hexNeighbors(hex.q, hex.r)) {
                const key = hexKey(neighbor.q, neighbor.r);
                if (!visited.has(key)) {
                    visited.add(key);
                    targetSet.add(key);
                    next.push(neighbor);
                }
            }
        }
        current = next;
    }
}

// Recalculate all currently visible hexes from all vision sources
export function recalculateVisibility(fogState, gameState) {
    fogState.visibleHexes.clear();

    // Player ships (pirates don't grant vision)
    for (const ship of gameState.ships) {
        if (ship.type === 'pirate') continue;
        const sightDistance = SHIPS[ship.type].sightDistance;
        addRadiusToSet(fogState.visibleHexes, ship.q, ship.r, sightDistance);
    }

    // Completed ports
    for (const port of gameState.ports) {
        if (port.construction) continue;  // Under construction
        const sightDistance = PORTS[port.type].sightDistance;
        addRadiusToSet(fogState.visibleHexes, port.q, port.r, sightDistance);
    }

    // Completed settlements
    for (const settlement of gameState.settlements) {
        if (settlement.construction) continue;
        const sightDistance = SETTLEMENTS.settlement.sightDistance;
        addRadiusToSet(fogState.visibleHexes, settlement.q, settlement.r, sightDistance);
    }

    // Completed towers
    for (const tower of gameState.towers) {
        if (tower.construction) continue;
        const sightDistance = TOWERS[tower.type].sightDistance;
        addRadiusToSet(fogState.visibleHexes, tower.q, tower.r, sightDistance);
    }

    // Mark all visible hexes as explored (permanent)
    for (const key of fogState.visibleHexes) {
        fogState.exploredHexes.add(key);
    }

    fogState.isDirty = false;
}

// Initialize fog with starting visibility around ships and ports
export function initializeFog(fogState, gameState) {
    // Use recalculateVisibility to set up initial state
    recalculateVisibility(fogState, gameState);
}
