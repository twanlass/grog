// Worker system — handles land-unit movement, tree harvesting, and wood
// drop-off at the nearest player port. Workers replace the wood-from-
// settlements economy: chopping is now the only way to acquire wood.
//
// State machine per worker (`worker.state`):
//   - idle:       Standing still, no orders. Renders as a stationary dot.
//   - moving:     Walking along `worker.path` to a destination. If
//                 `harvestTarget` is set and we arrive at it, transition
//                 to chopping. Otherwise transition to idle on arrival.
//   - chopping:   Standing on `harvestTarget`, draining the tile's
//                 woodRemaining into `worker.cargo`. When cargo fills,
//                 transition to returning.
//   - returning:  Walking to the nearest player-owned port. On arrival,
//                 deposit cargo into resources, then either resume
//                 harvesting (target still has wood, or auto-find next
//                 tree) or go idle.
//
// Movement code mirrors shipMovement.js: a worker has an A* `path` and a
// per-segment `moveProgress` that ticks toward 1 at WORKER_CONFIG.speed.
// When it reaches 1, we pop the next hex off the path.

import { hexKey, hexDistance, hexNeighbors } from "../hex.js";
import {
    findLandPath,
    findNearestTreeOnIsland,
    findNearestPortIndexOnIsland,
} from "../pathfinding.js";
import { WORKER_CONFIG } from "../sprites/workers.js";

/**
 * Assign a move order to a worker. Pathfinds from current hex to (q, r) on
 * land and starts walking. Returns true if a path was found.
 * `harvestTarget` is set to null (a plain move), so the worker idles on arrival.
 */
export function commandWorkerMove(worker, map, goalQ, goalR) {
    const path = findLandPath(map, worker.q, worker.r, goalQ, goalR);
    if (!path || path.length === 0) {
        // Already there, or no path
        if (worker.q === goalQ && worker.r === goalR) {
            worker.path = null;
            worker.state = 'idle';
            worker.harvestTarget = null;
            return true;
        }
        return false;
    }
    worker.path = path;
    worker.moveProgress = 0;
    worker.movingToward = path[0];
    worker.state = 'moving';
    worker.harvestTarget = null;
    worker.chopProgress = 0;
    return true;
}

/**
 * Assign a harvest order to a worker for the tree hex at (q, r). Worker
 * pathfinds to the tree and starts chopping on arrival; once cargo fills,
 * runs the return-to-port loop. Returns true if a path was found.
 *
 * If (q, r) is not a tree hex (e.g. player right-clicked a coastal land
 * tile), we BFS the island for the nearest tree from that hex and use that
 * as the target instead.
 */
export function commandWorkerHarvest(worker, map, q, r) {
    let targetQ = q;
    let targetR = r;

    const tile = map.tiles.get(hexKey(q, r));
    const isTreeHex = tile && tile.type === 'land' && !tile.isPortSite
        && tile.woodRemaining > 0 && !tile.depleted;

    if (!isTreeHex) {
        // Find nearest tree on the same island as the clicked hex
        const nearest = findNearestTreeOnIsland(map, q, r);
        if (!nearest) return false;
        targetQ = nearest.q;
        targetR = nearest.r;
    }

    // If we're already on the target tree, chop immediately.
    if (worker.q === targetQ && worker.r === targetR) {
        worker.harvestTarget = { q: targetQ, r: targetR };
        worker.path = null;
        worker.state = 'chopping';
        worker.chopProgress = 0;
        return true;
    }

    const path = findLandPath(map, worker.q, worker.r, targetQ, targetR);
    if (!path) return false;
    worker.path = path;
    worker.moveProgress = 0;
    worker.movingToward = path[0];
    worker.harvestTarget = { q: targetQ, r: targetR };
    worker.state = 'moving';
    worker.chopProgress = 0;
    return true;
}

// Walk along `worker.path` for `dt` seconds at WORKER_CONFIG.speed. Returns
// true if the worker arrived at the end of its path this frame.
function advanceMovement(worker, dt) {
    if (!worker.path || worker.path.length === 0) return false;

    worker.moveProgress += WORKER_CONFIG.speed * dt;
    while (worker.moveProgress >= 1 && worker.path.length > 0) {
        const next = worker.path[0];
        worker.q = next.q;
        worker.r = next.r;
        worker.path.shift();
        worker.moveProgress -= 1;
        if (worker.path.length > 0) {
            worker.movingToward = worker.path[0];
        } else {
            worker.movingToward = null;
            worker.moveProgress = 0;
            return true;  // Arrived
        }
    }
    return false;
}

// Try to start (or resume) a return trip to the nearest player port.
// Returns true if a path was found; sets worker.state = 'returning' on
// success or leaves it alone on failure (worker will just stand there
// holding cargo until a port becomes reachable again).
function startReturnTrip(worker, gameState, map) {
    const portIdx = findNearestPortIndexOnIsland(map, worker.q, worker.r, gameState.ports, worker.owner);
    if (portIdx === null) return false;
    const port = gameState.ports[portIdx];
    const path = findLandPath(map, worker.q, worker.r, port.q, port.r);
    if (!path) return false;
    worker.path = path;
    worker.moveProgress = 0;
    worker.movingToward = path[0];
    worker.state = 'returning';
    return true;
}

// Try to resume harvesting after a drop-off. Prefer the original
// `harvestTarget` if it still has wood; otherwise BFS for the next tree.
function resumeHarvest(worker, map) {
    let target = worker.harvestTarget;
    if (target) {
        const tile = map.tiles.get(hexKey(target.q, target.r));
        if (!tile || tile.depleted || (tile.woodRemaining || 0) <= 0) {
            target = null;
        }
    }
    if (!target) {
        target = findNearestTreeOnIsland(map, worker.q, worker.r);
    }
    if (!target) {
        worker.state = 'idle';
        worker.path = null;
        worker.harvestTarget = null;
        return;
    }
    worker.harvestTarget = { q: target.q, r: target.r };

    if (worker.q === target.q && worker.r === target.r) {
        worker.path = null;
        worker.state = 'chopping';
        worker.chopProgress = 0;
        return;
    }
    const path = findLandPath(map, worker.q, worker.r, target.q, target.r);
    if (!path) {
        worker.state = 'idle';
        worker.path = null;
        return;
    }
    worker.path = path;
    worker.moveProgress = 0;
    worker.movingToward = path[0];
    worker.state = 'moving';
}

/**
 * Update all workers for this frame.
 * @param {Object} gameState
 * @param {Object} map
 * @param {number} dt - Delta time in seconds (already scaled by timeScale)
 * @param {Array} floatingNumbers - Push-target for "+N wood" floating text
 */
export function updateWorkers(gameState, map, dt, floatingNumbers = []) {
    if (dt === 0) return;
    if (!gameState.workers) return;

    for (const worker of gameState.workers) {
        // Decay hit flash regardless of state
        if (worker.hitFlash > 0) worker.hitFlash = Math.max(0, worker.hitFlash - dt);

        switch (worker.state) {
            case 'idle':
                // Nothing to do
                break;

            case 'moving': {
                const arrived = advanceMovement(worker, dt);
                if (arrived) {
                    // If we arrived at a harvest target, start chopping
                    if (worker.harvestTarget
                        && worker.q === worker.harvestTarget.q
                        && worker.r === worker.harvestTarget.r) {
                        const tile = map.tiles.get(hexKey(worker.q, worker.r));
                        if (tile && !tile.depleted && (tile.woodRemaining || 0) > 0) {
                            worker.state = 'chopping';
                            worker.chopProgress = 0;
                        } else {
                            // Tree depleted before we arrived — find another
                            resumeHarvest(worker, map);
                        }
                    } else {
                        worker.state = 'idle';
                    }
                }
                break;
            }

            case 'chopping': {
                const tile = map.tiles.get(hexKey(worker.q, worker.r));
                if (!tile || tile.depleted || (tile.woodRemaining || 0) <= 0) {
                    // Current hex isn't choppable — find another or idle
                    resumeHarvest(worker, map);
                    break;
                }
                worker.chopProgress += dt;
                if (worker.chopProgress >= WORKER_CONFIG.chopTime) {
                    // Complete a chop: take cargoCapacity wood from the tile
                    // (or whatever's left if less). Cargo fills to capacity.
                    const space = WORKER_CONFIG.cargoCapacity - worker.cargo;
                    const taken = Math.min(space, tile.woodRemaining);
                    worker.cargo += taken;
                    tile.woodRemaining -= taken;
                    if (tile.woodRemaining <= 0) {
                        tile.woodRemaining = 0;
                        tile.depleted = true;
                    }
                    worker.chopProgress = 0;

                    if (worker.cargo >= WORKER_CONFIG.cargoCapacity) {
                        // Head back to port
                        if (!startReturnTrip(worker, gameState, map)) {
                            // No port reachable — go idle holding cargo
                            worker.state = 'idle';
                            worker.path = null;
                        }
                    } else if (tile.depleted) {
                        // Cargo not full but tree gone — find next tree
                        resumeHarvest(worker, map);
                    }
                    // else: still has wood and tile still has wood, keep chopping
                }
                break;
            }

            case 'returning': {
                const arrived = advanceMovement(worker, dt);
                if (arrived) {
                    // Deposit cargo into the owner's wood resources
                    const dropped = worker.cargo;
                    worker.cargo = 0;
                    if (dropped > 0) {
                        if (worker.owner === 'player') {
                            gameState.resources.wood += dropped;
                        } else if (worker.owner === 'player2' && gameState.player2Resources) {
                            gameState.player2Resources.wood += dropped;
                        } else if (gameState.aiPlayers) {
                            const aiIdx = ['ai1', 'ai2', 'ai3'].indexOf(worker.owner);
                            if (aiIdx >= 0 && gameState.aiPlayers[aiIdx]) {
                                gameState.aiPlayers[aiIdx].resources.wood += dropped;
                            }
                        }
                        if (worker.owner === 'player') {
                            floatingNumbers.push({
                                q: worker.q, r: worker.r,
                                text: `+${dropped}`,
                                type: 'wood',
                                age: 0,
                                duration: 1.5,
                                offsetX: 0,
                            });
                        }
                    }
                    // Resume harvesting on the same target (or find a new tree)
                    resumeHarvest(worker, map);
                }
                break;
            }
        }
    }
}

/**
 * Compute a worker's visual pixel position. Mirrors getShipVisualPos —
 * smoothly interpolates between the current hex and the next path hex
 * based on moveProgress.
 */
export function getWorkerVisualPos(worker, hexToPixel) {
    const fromPos = hexToPixel(worker.q, worker.r);
    if (!worker.path || worker.path.length === 0 || worker.state !== 'moving' && worker.state !== 'returning') {
        return fromPos;
    }
    const next = worker.path[0];
    const toPos = hexToPixel(next.q, next.r);
    const t = Math.max(0, Math.min(1, worker.moveProgress));
    return {
        x: fromPos.x + (toPos.x - fromPos.x) * t,
        y: fromPos.y + (toPos.y - fromPos.y) * t,
    };
}
