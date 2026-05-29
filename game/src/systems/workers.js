// Worker system — autonomous land units that chop trees and deposit wood
// at the nearest player hub (port or settlement). Workers are NOT player-
// controlled: no selection, no commands. They spawn from settlements (and
// the home port at game start), find the nearest tree, walk → chop → walk
// back to the nearest hub → deposit → repeat. When no tree is reachable
// on their island, they idle.
//
// State machine per worker (`worker.state`):
//   - idle:       No active assignment. Each frame we look for a tree to
//                 chop; if one exists we walk toward it.
//   - moving:     Walking along `worker.path` to a tree. On arrival we
//                 transition to chopping (or pick another tree if this
//                 one depleted en route).
//   - chopping:   Draining the tile's woodRemaining into worker.cargo.
//                 When cargo fills, transition to returning.
//   - returning:  Walking to the nearest hub on the island. On arrival
//                 we deposit (adds to player wood) and go back to idle.
//
// Movement code mirrors shipMovement.js: A* path + per-segment moveProgress
// at WORKER_CONFIG.speed. When moveProgress >= 1 we pop the next hex.

import { hexKey } from "../hex.js";
import {
    findLandPath,
    findNearestTreeOnIsland,
} from "../pathfinding.js";
import { WORKER_CONFIG } from "../sprites/workers.js";

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

// Pick a target tree near the worker and start walking to it. If no tree
// is reachable on this island, the worker stays idle. Returns true if a
// trip was started.
function startTreeTrip(worker, map) {
    const target = findNearestTreeOnIsland(map, worker.q, worker.r);
    if (!target) {
        worker.state = 'idle';
        worker.path = null;
        worker.harvestTarget = null;
        return false;
    }
    worker.harvestTarget = { q: target.q, r: target.r };
    if (worker.q === target.q && worker.r === target.r) {
        worker.path = null;
        worker.state = 'chopping';
        worker.chopProgress = 0;
        return true;
    }
    const path = findLandPath(map, worker.q, worker.r, target.q, target.r);
    if (!path) {
        // BFS found a tree but A* can't reach it — shouldn't happen on the
        // same island, but bail out to idle so we retry next frame.
        worker.state = 'idle';
        worker.path = null;
        return false;
    }
    worker.path = path;
    worker.moveProgress = 0;
    worker.movingToward = path[0];
    worker.state = 'moving';
    return true;
}

// Start a return trip to the worker's home settlement. Workers deposit
// only at the settlement that spawned them — if it's been destroyed or
// is still under construction, they idle holding cargo until... well,
// forever (they're orphaned). Returns true if a trip was started.
function startReturnTrip(worker, gameState, map) {
    const home = gameState.settlements?.find(s => s.id === worker.homeSettlementId);
    if (!home || home.construction) {
        worker.state = 'idle';
        worker.path = null;
        return false;
    }
    if (worker.q === home.q && worker.r === home.r) {
        worker.path = null;
        worker.state = 'returning';
        return true;
    }
    const path = findLandPath(map, worker.q, worker.r, home.q, home.r);
    if (!path) {
        worker.state = 'idle';
        worker.path = null;
        return false;
    }
    worker.path = path;
    worker.moveProgress = 0;
    worker.movingToward = path[0];
    worker.state = 'returning';
    return true;
}

function depositCargo(worker, gameState, floatingNumbers) {
    const dropped = worker.cargo;
    worker.cargo = 0;
    if (dropped <= 0) return;
    const owner = worker.owner || 'player';
    if (owner === 'player') {
        gameState.resources.wood += dropped;
    } else if (owner === 'player2' && gameState.player2Resources) {
        gameState.player2Resources.wood += dropped;
    } else if (gameState.aiPlayers) {
        const aiIdx = ['ai1', 'ai2', 'ai3'].indexOf(owner);
        if (aiIdx >= 0 && gameState.aiPlayers[aiIdx]) {
            gameState.aiPlayers[aiIdx].resources.wood += dropped;
        }
    }
    if (owner === 'player') {
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
        if (worker.hitFlash > 0) worker.hitFlash = Math.max(0, worker.hitFlash - dt);

        switch (worker.state) {
            case 'idle':
                // Workers are autonomous: an idle worker proactively looks
                // for work. If they have cargo, drop it off first;
                // otherwise find a tree.
                if (worker.cargo > 0) {
                    startReturnTrip(worker, gameState, map);
                } else {
                    startTreeTrip(worker, map);
                }
                break;

            case 'moving': {
                const arrived = advanceMovement(worker, dt);
                if (arrived) {
                    if (worker.harvestTarget
                        && worker.q === worker.harvestTarget.q
                        && worker.r === worker.harvestTarget.r) {
                        const tile = map.tiles.get(hexKey(worker.q, worker.r));
                        if (tile && !tile.depleted && (tile.woodRemaining || 0) > 0) {
                            worker.state = 'chopping';
                            worker.chopProgress = 0;
                        } else {
                            // Tree depleted before we arrived — pick another
                            startTreeTrip(worker, map);
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
                    if (worker.cargo > 0) {
                        startReturnTrip(worker, gameState, map);
                    } else {
                        startTreeTrip(worker, map);
                    }
                    break;
                }
                worker.chopProgress += dt;
                if (worker.chopProgress >= WORKER_CONFIG.chopTime) {
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
                        startReturnTrip(worker, gameState, map);
                    } else if (tile.depleted) {
                        // Cargo not full but tree gone — find next tree
                        startTreeTrip(worker, map);
                    }
                    // else: keep chopping
                }
                break;
            }

            case 'returning': {
                const arrived = advanceMovement(worker, dt);
                if (arrived) {
                    depositCargo(worker, gameState, floatingNumbers);
                    startTreeTrip(worker, map);
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
    const ox = worker.offsetX || 0;
    const oy = worker.offsetY || 0;
    if (!worker.path || worker.path.length === 0
        || (worker.state !== 'moving' && worker.state !== 'returning')) {
        return { x: fromPos.x + ox, y: fromPos.y + oy };
    }
    const next = worker.path[0];
    const toPos = hexToPixel(next.q, next.r);
    const t = Math.max(0, Math.min(1, worker.moveProgress));
    return {
        x: fromPos.x + (toPos.x - fromPos.x) * t + ox,
        y: fromPos.y + (toPos.y - fromPos.y) * t + oy,
    };
}
