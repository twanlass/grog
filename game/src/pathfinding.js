// A* pathfinding for hex grids
import { hexNeighbors, hexDistance, hexKey, getHexRing } from "./hex.js";

// Water tile types that ships can traverse
const WATER_TILES = new Set(['shallow', 'deep_ocean']);

/**
 * Binary Min-Heap for efficient priority queue operations
 * Used by A* pathfinding to get the node with lowest f-score in O(log n)
 */
class MinHeap {
    constructor() {
        this.heap = [];
    }

    isEmpty() {
        return this.heap.length === 0;
    }

    insert(item) {
        this.heap.push(item);
        this.bubbleUp(this.heap.length - 1);
    }

    extractMin() {
        if (this.heap.length === 0) return null;
        if (this.heap.length === 1) return this.heap.pop();

        const min = this.heap[0];
        this.heap[0] = this.heap.pop();
        this.bubbleDown(0);
        return min;
    }

    bubbleUp(index) {
        while (index > 0) {
            const parentIndex = Math.floor((index - 1) / 2);
            if (this.heap[parentIndex].f <= this.heap[index].f) break;
            [this.heap[parentIndex], this.heap[index]] = [this.heap[index], this.heap[parentIndex]];
            index = parentIndex;
        }
    }

    bubbleDown(index) {
        const length = this.heap.length;
        while (true) {
            const leftChild = 2 * index + 1;
            const rightChild = 2 * index + 2;
            let smallest = index;

            if (leftChild < length && this.heap[leftChild].f < this.heap[smallest].f) {
                smallest = leftChild;
            }
            if (rightChild < length && this.heap[rightChild].f < this.heap[smallest].f) {
                smallest = rightChild;
            }

            if (smallest === index) break;
            [this.heap[smallest], this.heap[index]] = [this.heap[index], this.heap[smallest]];
            index = smallest;
        }
    }
}

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

    // Priority queue using binary min-heap for O(log n) operations
    const openSet = new MinHeap();
    openSet.insert({ q: startQ, r: startR, f: 0 });
    const openKeys = new Set([startKey]);

    // Track visited nodes and their costs
    const gScore = new Map(); // Cost from start to node
    gScore.set(startKey, 0);

    // Track path (for reconstruction)
    const cameFrom = new Map();

    while (!openSet.isEmpty()) {
        // Get node with lowest f score - O(log n) with heap
        const current = openSet.extractMin();
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
                    openSet.insert({ q: neighbor.q, r: neighbor.r, f });
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
 * Distribute destinations for multiple ships around a target hex.
 * Assigns each ship a unique destination, spreading them in rings around the target.
 * @param {Object} map - The game map
 * @param {number} targetQ - Target hex Q coordinate
 * @param {number} targetR - Target hex R coordinate
 * @param {Array} ships - Array of ship objects with {q, r} positions
 * @param {Set} occupiedHexes - Set of hex keys already occupied
 * @returns {Array} Array of {shipIndex, q, r} assignments
 */
export function distributeDestinations(map, targetQ, targetR, ships, occupiedHexes) {
    if (ships.length === 0) return [];
    if (ships.length === 1) {
        // Single ship goes to target or nearest available
        const targetKey = hexKey(targetQ, targetR);
        if (isPassable(map, targetQ, targetR) && !occupiedHexes.has(targetKey)) {
            return [{ shipIndex: 0, q: targetQ, r: targetR }];
        }
        const alt = findNearestAvailable(map, targetQ, targetR, occupiedHexes);
        if (alt) return [{ shipIndex: 0, q: alt.q, r: alt.r }];
        return [];
    }

    // Collect candidate hexes in expanding rings around target
    const candidates = [];
    const targetKey = hexKey(targetQ, targetR);

    // Add target hex first if available
    if (isPassable(map, targetQ, targetR)) {
        candidates.push({ q: targetQ, r: targetR });
    }

    // Add rings outward until we have enough candidates
    const maxRings = Math.ceil(Math.sqrt(ships.length)) + 2;
    for (let ring = 1; ring <= maxRings && candidates.length < ships.length * 2; ring++) {
        const ringHexes = getHexRing(targetQ, targetR, ring);
        for (const hex of ringHexes) {
            if (isPassable(map, hex.q, hex.r)) {
                candidates.push(hex);
            }
        }
    }

    // Assign destinations based on approach angle (ships travel in parallel, stay grouped)
    const assignments = [];
    const claimed = new Set(occupiedHexes);

    // Calculate each ship's approach angle from target
    const shipData = ships.map((ship, i) => ({
        index: i,
        ship,
        angle: Math.atan2(ship.r - targetR, ship.q - targetQ)
    }));

    // Sort ships by angle
    shipData.sort((a, b) => a.angle - b.angle);

    // Calculate each candidate's angle from target and distance
    const candData = candidates
        .filter(cand => !claimed.has(hexKey(cand.q, cand.r)))
        .map(cand => ({
            q: cand.q,
            r: cand.r,
            angle: Math.atan2(cand.r - targetR, cand.q - targetQ),
            dist: hexDistance(cand.q, cand.r, targetQ, targetR)
        }));

    // Sort candidates by angle
    candData.sort((a, b) => a.angle - b.angle);

    // Match ships to candidates with similar angles
    // This keeps ships traveling in parallel paths
    for (const { index: shipIdx, ship, angle: shipAngle } of shipData) {
        let bestCand = null;
        let bestAngleDiff = Infinity;

        for (const cand of candData) {
            const key = hexKey(cand.q, cand.r);
            if (claimed.has(key)) continue;

            // Calculate angle difference (handle wrap-around)
            let angleDiff = Math.abs(shipAngle - cand.angle);
            if (angleDiff > Math.PI) angleDiff = 2 * Math.PI - angleDiff;

            // Prefer candidates with matching angle, tie-break by distance (closer = better)
            if (angleDiff < bestAngleDiff ||
                (angleDiff === bestAngleDiff && bestCand && cand.dist < bestCand.dist)) {
                bestAngleDiff = angleDiff;
                bestCand = cand;
            }
        }

        if (bestCand) {
            claimed.add(hexKey(bestCand.q, bestCand.r));
            assignments.push({ shipIndex: shipIdx, q: bestCand.q, r: bestCand.r });
        }
    }

    return assignments;
}

/**
 * Calculate soft avoidance cost for a hex based on nearby reservations.
 * Used by findPathWithAvoidance to prefer less crowded paths.
 * @param {number} q - Hex Q coordinate
 * @param {number} r - Hex R coordinate
 * @param {Map} reservations - Map of hexKey -> {shipIndex, permanent}
 * @param {number} myShipIndex - Index of the ship we're pathfinding for
 * @returns {number} Additional cost (0 to ~5)
 */
function calculateAvoidanceCost(q, r, reservations, myShipIndex) {
    let cost = 0;

    // Check the hex itself
    const selfKey = hexKey(q, r);
    const selfRes = reservations.get(selfKey);
    if (selfRes && selfRes.shipIndex !== myShipIndex) {
        if (selfRes.permanent) {
            cost += 5;  // Strong penalty for occupied hex
        } else {
            cost += 1.5;  // Medium penalty for reserved hex
        }
    }

    // Check all 6 neighbors - add small cost for crowded areas
    for (const neighbor of hexNeighbors(q, r)) {
        const key = hexKey(neighbor.q, neighbor.r);
        const res = reservations.get(key);
        if (res && res.shipIndex !== myShipIndex) {
            cost += 0.25;  // Small penalty for being near other ships
        }
    }

    return cost;
}

/**
 * A* pathfinding with soft avoidance costs for nearby ships.
 * Ships will prefer paths that avoid crowded areas.
 * @param {Object} map - The game map
 * @param {number} startQ - Start Q coordinate
 * @param {number} startR - Start R coordinate
 * @param {number} goalQ - Goal Q coordinate
 * @param {number} goalR - Goal R coordinate
 * @param {Map} reservations - Map of hexKey -> {shipIndex, permanent}
 * @param {number} shipIndex - Index of the ship we're pathfinding for
 * @returns {Array|null} Array of {q, r} from start to goal, or null if no path
 */
export function findPathWithAvoidance(map, startQ, startR, goalQ, goalR, reservations, shipIndex) {
    const startKey = hexKey(startQ, startR);
    const goalKey = hexKey(goalQ, goalR);

    if (!isPassable(map, goalQ, goalR)) {
        return null;
    }

    const openSet = new MinHeap();
    openSet.insert({ q: startQ, r: startR, f: 0 });
    const openKeys = new Set([startKey]);

    const gScore = new Map();
    gScore.set(startKey, 0);

    const cameFrom = new Map();

    while (!openSet.isEmpty()) {
        const current = openSet.extractMin();
        const currentKey = hexKey(current.q, current.r);
        openKeys.delete(currentKey);

        if (currentKey === goalKey) {
            return reconstructPath(cameFrom, currentKey);
        }

        const neighbors = hexNeighbors(current.q, current.r);
        for (const neighbor of neighbors) {
            const neighborKey = hexKey(neighbor.q, neighbor.r);

            if (!isPassable(map, neighbor.q, neighbor.r)) {
                continue;
            }

            // Check if permanently blocked (but allow goal hex)
            const res = reservations?.get(neighborKey);
            if (res && res.permanent && res.shipIndex !== shipIndex && neighborKey !== goalKey) {
                continue;
            }

            // Calculate cost: base terrain cost + soft avoidance cost
            const avoidanceCost = reservations
                ? calculateAvoidanceCost(neighbor.q, neighbor.r, reservations, shipIndex)
                : 0;
            const moveCost = 1 + avoidanceCost;

            const tentativeG = gScore.get(currentKey) + moveCost;

            if (!gScore.has(neighborKey) || tentativeG < gScore.get(neighborKey)) {
                cameFrom.set(neighborKey, currentKey);
                gScore.set(neighborKey, tentativeG);

                const h = hexDistance(neighbor.q, neighbor.r, goalQ, goalR);
                const f = tentativeG + h;

                if (!openKeys.has(neighborKey)) {
                    openSet.insert({ q: neighbor.q, r: neighbor.r, f });
                    openKeys.add(neighborKey);
                }
            }
        }
    }

    return null;
}
