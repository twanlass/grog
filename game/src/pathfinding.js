// A* pathfinding for hex grids
import { hexNeighbors, hexDistance, hexKey } from "./hex.js";

// Water tile types that ships can traverse
const WATER_TILES = new Set(['shallow', 'deep_ocean']);

// Check if a tile is passable for ships
function isPassable(map, q, r) {
    const key = hexKey(q, r);
    const tile = map.tiles.get(key);
    return tile && WATER_TILES.has(tile.type);
}

// Find nearest water tile to a land position (BFS)
// Returns {q, r} of nearest water, or null if none found
export function findNearestWater(map, q, r) {
    const startKey = hexKey(q, r);
    const visited = new Set([startKey]);
    const queue = [{ q, r }];

    while (queue.length > 0) {
        const current = queue.shift();

        // Check all neighbors
        const neighbors = hexNeighbors(current.q, current.r);
        for (const neighbor of neighbors) {
            const key = hexKey(neighbor.q, neighbor.r);
            if (visited.has(key)) continue;
            visited.add(key);

            const tile = map.tiles.get(key);
            if (!tile) continue;

            // Found water - return it
            if (WATER_TILES.has(tile.type)) {
                return { q: neighbor.q, r: neighbor.r };
            }

            // Still land - add to queue to keep searching
            queue.push(neighbor);
        }
    }

    return null;
}

// Find nearest unoccupied water tile to a position (BFS)
// Returns {q, r} of nearest available hex, or null if none found
export function findNearestAvailable(map, q, r, blockedHexes) {
    const startKey = hexKey(q, r);

    // If start is available, return it
    if (isPassable(map, q, r) && !blockedHexes.has(startKey)) {
        return { q, r };
    }

    const visited = new Set([startKey]);
    const queue = [{ q, r }];

    while (queue.length > 0) {
        const current = queue.shift();

        const neighbors = hexNeighbors(current.q, current.r);
        for (const neighbor of neighbors) {
            const key = hexKey(neighbor.q, neighbor.r);
            if (visited.has(key)) continue;
            visited.add(key);

            // Check if this hex is available (water and not blocked)
            if (isPassable(map, neighbor.q, neighbor.r) && !blockedHexes.has(key)) {
                return { q: neighbor.q, r: neighbor.r };
            }

            // Only continue searching through water tiles
            if (isPassable(map, neighbor.q, neighbor.r)) {
                queue.push(neighbor);
            }
        }
    }

    return null;
}

// A* pathfinding algorithm
// Returns array of {q, r} from start to goal (excluding start), or null if no path
// blockedHexes: optional Set of hex keys to avoid (e.g., other ships)
export function findPath(map, startQ, startR, goalQ, goalR, blockedHexes = null) {
    const startKey = hexKey(startQ, startR);
    const goalKey = hexKey(goalQ, goalR);

    // Check if goal is reachable (is water)
    if (!isPassable(map, goalQ, goalR)) {
        return null;
    }

    // Priority queue (simple array, sorted by f score)
    const openSet = [{ q: startQ, r: startR, f: 0 }];
    const openKeys = new Set([startKey]);

    // Track visited nodes and their costs
    const gScore = new Map(); // Cost from start to node
    gScore.set(startKey, 0);

    // Track path (for reconstruction)
    const cameFrom = new Map();

    while (openSet.length > 0) {
        // Get node with lowest f score
        openSet.sort((a, b) => a.f - b.f);
        const current = openSet.shift();
        const currentKey = hexKey(current.q, current.r);
        openKeys.delete(currentKey);

        // Reached goal
        if (currentKey === goalKey) {
            return reconstructPath(cameFrom, currentKey);
        }

        // Check all neighbors
        const neighbors = hexNeighbors(current.q, current.r);
        for (const neighbor of neighbors) {
            const neighborKey = hexKey(neighbor.q, neighbor.r);

            // Skip if not passable (terrain)
            if (!isPassable(map, neighbor.q, neighbor.r)) {
                continue;
            }

            // Skip if blocked by another ship (but allow goal hex)
            if (blockedHexes && blockedHexes.has(neighborKey) && neighborKey !== goalKey) {
                continue;
            }

            // Calculate tentative g score (each hex move costs 1)
            const tentativeG = gScore.get(currentKey) + 1;

            // If this path is better than any previous one
            if (!gScore.has(neighborKey) || tentativeG < gScore.get(neighborKey)) {
                cameFrom.set(neighborKey, currentKey);
                gScore.set(neighborKey, tentativeG);

                const h = hexDistance(neighbor.q, neighbor.r, goalQ, goalR);
                const f = tentativeG + h;

                if (!openKeys.has(neighborKey)) {
                    openSet.push({ q: neighbor.q, r: neighbor.r, f });
                    openKeys.add(neighborKey);
                }
            }
        }
    }

    // No path found
    return null;
}

// Reconstruct path from cameFrom map
function reconstructPath(cameFrom, goalKey) {
    const path = [];
    let current = goalKey;

    while (cameFrom.has(current)) {
        const [q, r] = current.split(',').map(Number);
        path.unshift({ q, r });
        current = cameFrom.get(current);
    }

    return path;
}
