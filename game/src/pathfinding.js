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
// If fromQ/fromR provided, only returns water that's reachable from that position
// Returns {q, r} of nearest water, or null if none found
export function findNearestWater(map, q, r, fromQ = null, fromR = null) {
    const startKey = hexKey(q, r);
    const visited = new Set([startKey]);
    const queue = [{ q, r, dist: 0 }];

    // Collect candidates sorted by distance if we need to verify reachability
    const candidates = [];
    const maxCandidates = fromQ !== null ? 5 : 1;  // Only need 1 if not verifying

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

            // Found water - add as candidate
            if (WATER_TILES.has(tile.type)) {
                candidates.push({ q: neighbor.q, r: neighbor.r });
                if (candidates.length >= maxCandidates) break;
            } else {
                // Still land - add to queue to keep searching
                queue.push({ q: neighbor.q, r: neighbor.r, dist: current.dist + 1 });
            }
        }

        if (candidates.length >= maxCandidates) break;
    }

    // If no reachability check needed, return first candidate
    if (fromQ === null || candidates.length === 0) {
        return candidates[0] || null;
    }

    // Verify candidates are reachable from ship position
    for (const candidate of candidates) {
        const path = findPath(map, fromQ, fromR, candidate.q, candidate.r);
        if (path) {
            return candidate;
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

/**
 * A* pathfinding with penalty for certain hexes (used for patrol route optimization)
 * Similar to findPath but adds extra cost for hexes in penaltyHexes set
 * This encourages finding alternative paths that don't overlap with existing routes
 * @param {Object} map - The game map
 * @param {number} startQ - Start hex Q coordinate
 * @param {number} startR - Start hex R coordinate
 * @param {number} goalQ - Goal hex Q coordinate
 * @param {number} goalR - Goal hex R coordinate
 * @param {Set} penaltyHexes - Set of hex keys to penalize (adds extra cost)
 * @param {Set} blockedHexes - Set of hex keys to completely avoid (optional)
 * @param {number} penaltyCost - Extra cost for penalized hexes (default 5)
 * @returns {Array|null} Array of {q, r} from start to goal, or null if no path
 */
export function findPathWithPenalty(map, startQ, startR, goalQ, goalR, penaltyHexes, blockedHexes = null, penaltyCost = 5) {
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
    const gScore = new Map();
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

            // Calculate tentative g score with penalty for certain hexes
            let moveCost = 1;
            if (penaltyHexes && penaltyHexes.has(neighborKey)) {
                moveCost += penaltyCost;
            }
            const tentativeG = gScore.get(currentKey) + moveCost;

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

/**
 * Compute an optimized patrol circuit that minimizes doubling back
 * @param {Object} map - The game map
 * @param {Array} waypoints - Array of {q, r} waypoints (must have 2+ waypoints)
 * @returns {Array|null} Full circular path as array of {q, r}, or null if no valid path
 */
export function computePatrolCircuit(map, waypoints) {
    if (!waypoints || waypoints.length < 2) {
        return null;
    }

    const fullPath = [];
    const usedHexes = new Set();

    // Compute paths for all segments except the return leg
    for (let i = 0; i < waypoints.length - 1; i++) {
        const start = waypoints[i];
        const end = waypoints[i + 1];

        // Use regular pathfinding for forward segments
        const segmentPath = findPath(map, start.q, start.r, end.q, end.r);
        if (!segmentPath) {
            return null; // Can't complete circuit
        }

        // Add segment to full path (excluding destination which will be start of next segment)
        for (const hex of segmentPath) {
            fullPath.push({ q: hex.q, r: hex.r });
            usedHexes.add(hexKey(hex.q, hex.r));
        }
    }

    // Compute return leg (last waypoint to first) avoiding used hexes
    const lastWp = waypoints[waypoints.length - 1];
    const firstWp = waypoints[0];

    // Try to find a path that avoids the hexes used in forward direction
    let returnPath = findPathWithPenalty(map, lastWp.q, lastWp.r, firstWp.q, firstWp.r, usedHexes);

    // Fall back to regular path if penalized path fails
    if (!returnPath) {
        returnPath = findPath(map, lastWp.q, lastWp.r, firstWp.q, firstWp.r);
    }

    if (!returnPath) {
        return null; // Can't complete circuit
    }

    // Add return path (excluding the final destination which is the start of the loop)
    for (let i = 0; i < returnPath.length - 1; i++) {
        fullPath.push({ q: returnPath[i].q, r: returnPath[i].r });
    }

    return fullPath;
}
