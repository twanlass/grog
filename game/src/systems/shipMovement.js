// Ship movement system - handles pathfinding, hex-to-hex navigation, and fog revelation
import { hexKey, hexDistance, hexToPixel, hexNeighbors } from "../hex.js";
import { SHIPS } from "../sprites/index.js";
import { findPath, findNearestAvailable, findNearestWater, findPathWithAvoidance } from "../pathfinding.js";
import { markVisibilityDirty } from "../fogOfWar.js";

// Trail configuration
const TRAIL_MAX_SEGMENTS = 8;
const TRAIL_FADE_DURATION = 0.5;

// 8 directions at 45° intervals
const HEX_DIRECTIONS = [
    0,                      // East (0°)
    Math.PI / 4,            // Northeast (45°)
    Math.PI / 2,            // North (90°)
    3 * Math.PI / 4,        // Northwest (135°)
    Math.PI,                // West (180°)
    -3 * Math.PI / 4,       // Southwest (-135° / 225°)
    -Math.PI / 2,           // South (-90° / 270°)
    -Math.PI / 4,           // Southeast (-45° / 315°)
];

/**
 * Snap an angle to the nearest hex direction
 */
function snapToHexDirection(angle) {
    let minDiff = Infinity;
    let snapped = angle;
    for (const dir of HEX_DIRECTIONS) {
        // Calculate angular difference (handling wrap-around)
        let diff = Math.abs(angle - dir);
        if (diff > Math.PI) diff = 2 * Math.PI - diff;
        if (diff < minDiff) {
            minDiff = diff;
            snapped = dir;
        }
    }
    return snapped;
}

/**
 * Build a reservation map for predictive collision avoidance.
 * Maps hexKey -> { shipIndex, permanent } where permanent means the ship is stationary.
 * @param {Array} ships - Array of ship objects
 * @returns {Map} Reservation map
 */
function buildReservationMap(ships) {
    const reservations = new Map();

    for (let i = 0; i < ships.length; i++) {
        const ship = ships[i];
        const isStationary = !ship.path || ship.path.length === 0 || ship.repair;

        // Reserve current position
        reservations.set(hexKey(ship.q, ship.r), {
            shipIndex: i,
            permanent: isStationary
        });

        // Reserve upcoming path positions (look ahead 2-3 hexes)
        if (ship.path && ship.path.length > 0) {
            const lookAhead = Math.min(ship.path.length, 3);
            for (let j = 0; j < lookAhead; j++) {
                const hex = ship.path[j];
                const key = hexKey(hex.q, hex.r);
                // Only reserve if not already reserved by another ship
                if (!reservations.has(key)) {
                    reservations.set(key, { shipIndex: i, permanent: false });
                }
            }
        }
    }

    return reservations;
}

/**
 * Detect conflicts where multiple ships want to move to the same hex.
 * @param {Array} ships - Array of ship objects
 * @returns {Array} Array of { hexKey, shipIndices } conflicts
 */
function detectConflicts(ships) {
    const nextHexClaims = new Map(); // hexKey -> [shipIndices]

    for (let i = 0; i < ships.length; i++) {
        const ship = ships[i];
        if (!ship.path || ship.path.length === 0) continue;
        if (ship.repair) continue;

        const nextHex = ship.path[0];
        const key = hexKey(nextHex.q, nextHex.r);

        if (!nextHexClaims.has(key)) {
            nextHexClaims.set(key, []);
        }
        nextHexClaims.get(key).push(i);
    }

    const conflicts = [];
    for (const [key, indices] of nextHexClaims) {
        if (indices.length > 1) {
            conflicts.push({ hexKey: key, shipIndices: indices });
        }
    }

    return conflicts;
}

/**
 * Resolve a conflict by determining which ship should yield.
 * Ships farther from their destination yield to closer ships.
 * @param {Object} conflict - { hexKey, shipIndices }
 * @param {Array} ships - Array of ship objects
 * @returns {number} Index of ship that should yield (repath)
 */
function resolveConflict(conflict, ships) {
    let farthestIdx = conflict.shipIndices[0];
    let farthestDist = -1;

    for (const idx of conflict.shipIndices) {
        const ship = ships[idx];
        const waypoint = ship.waypoints[0];
        if (!waypoint) continue;

        const dist = hexDistance(ship.q, ship.r, waypoint.q, waypoint.r);
        if (dist > farthestDist) {
            farthestDist = dist;
            farthestIdx = idx;
        }
    }

    return farthestIdx;
}

/**
 * Updates all ship movement, pathfinding, and water trails
 * @param {Function} hexToPixel - Coordinate conversion function
 * @param {Object} gameState - The game state
 * @param {Object} map - The game map
 * @param {Object} fogState - Fog of war state
 * @param {number} dt - Delta time (already scaled by timeScale)
 * @param {Array} floatingNumbers - Array to push floating number animations to
 */
export function updateShipMovement(hexToPixel, gameState, map, fogState, dt, floatingNumbers = []) {
    if (dt === 0) return; // Paused

    // Phase 1: Build predictive reservation map
    const reservations = buildReservationMap(gameState.ships);

    // Also build simple occupied set for backwards compatibility
    const occupiedHexes = new Set();
    for (const s of gameState.ships) {
        occupiedHexes.add(hexKey(s.q, s.r));
    }

    // Phase 2: Handle attack targets (must update waypoints before conflict detection)
    for (const ship of gameState.ships) {
        if (ship.repair) continue;

        if (ship.attackTarget && ship.attackTarget.type === 'ship') {
            const target = gameState.ships[ship.attackTarget.index];
            if (target) {
                const dist = hexDistance(ship.q, ship.r, target.q, target.r);
                const attackDistance = 2;
                if (dist <= attackDistance) {
                    ship.waypoints = [];
                    ship.path = null;
                } else {
                    const currentWaypoint = ship.waypoints[0];
                    const waypointDiff = currentWaypoint
                        ? hexDistance(currentWaypoint.q, currentWaypoint.r, target.q, target.r)
                        : Infinity;
                    if (!currentWaypoint || waypointDiff > 2) {
                        ship.waypoints = [{ q: target.q, r: target.r }];
                        ship.path = null;
                    }
                }
            } else {
                ship.attackTarget = null;
            }
        }
    }

    // Phase 3: Detect and resolve conflicts (ships wanting same hex)
    const conflicts = detectConflicts(gameState.ships);
    for (const conflict of conflicts) {
        const yieldingShipIdx = resolveConflict(conflict, gameState.ships);
        const yieldingShip = gameState.ships[yieldingShipIdx];
        // Force the yielding ship to repath with avoidance
        yieldingShip.path = null;
    }

    // Phase 4: Calculate paths and execute movement for each ship
    for (let shipIdx = 0; shipIdx < gameState.ships.length; shipIdx++) {
        const ship = gameState.ships[shipIdx];

        if (ship.repair) continue;
        if (ship.waypoints.length === 0) continue;

        const shipKey = hexKey(ship.q, ship.r);
        occupiedHexes.delete(shipKey);

        // Calculate path if needed
        if (!ship.path) {
            if (ship.moveProgress > 0 && ship.movingToward) {
                ship.path = [{ q: ship.movingToward.q, r: ship.movingToward.r }];
                ship.movingToward = null;
            } else {
                const currentWaypoint = ship.waypoints[0];
                const destKey = hexKey(currentWaypoint.q, currentWaypoint.r);
                let targetQ = currentWaypoint.q;
                let targetR = currentWaypoint.r;

                if (ship.q === targetQ && ship.r === targetR) {
                    ship.waypoints.shift();
                    if (ship.waypoints.length === 0 && ship.isPatrolling && ship.patrolRoute.length > 0) {
                        ship.waypoints = ship.patrolRoute.map(wp => ({ q: wp.q, r: wp.r }));
                    }
                    occupiedHexes.add(shipKey);
                    continue;
                }

                // Check if destination is permanently occupied
                const destRes = reservations.get(destKey);
                if (destRes && destRes.permanent && destRes.shipIndex !== shipIdx) {
                    const alt = findNearestAvailable(map, currentWaypoint.q, currentWaypoint.r, occupiedHexes);
                    if (alt) {
                        if (ship.q === alt.q && ship.r === alt.r) {
                            ship.waypoints.shift();
                            if (ship.waypoints.length === 0 && ship.isPatrolling && ship.patrolRoute.length > 0) {
                                ship.waypoints = ship.patrolRoute.map(wp => ({ q: wp.q, r: wp.r }));
                            }
                            occupiedHexes.add(shipKey);
                            continue;
                        }
                        targetQ = alt.q;
                        targetR = alt.r;
                    } else {
                        ship.waypoints.shift();
                        if (ship.waypoints.length === 0 && ship.isPatrolling && ship.patrolRoute.length > 0) {
                            ship.waypoints = ship.patrolRoute.map(wp => ({ q: wp.q, r: wp.r }));
                        }
                        occupiedHexes.add(shipKey);
                        continue;
                    }
                }

                // Use avoidance-aware pathfinding for smoother group movement
                ship.path = findPathWithAvoidance(map, ship.q, ship.r, targetQ, targetR, reservations, shipIdx);

                // Fallback to standard pathfinding if avoidance path fails
                if (!ship.path) {
                    ship.path = findPath(map, ship.q, ship.r, targetQ, targetR, occupiedHexes);
                }

                if (!ship.path) {
                    ship.waypoints.shift();
                    if (ship.waypoints.length === 0 && ship.isPatrolling && ship.patrolRoute.length > 0) {
                        ship.waypoints = ship.patrolRoute.map(wp => ({ q: wp.q, r: wp.r }));
                    }
                    occupiedHexes.add(shipKey);
                    continue;
                }
            }
        }

        // Move along path
        if (ship.path && ship.path.length > 0) {
            const speed = SHIPS[ship.type].speed;
            const currentKey = hexKey(ship.q, ship.r);

            const next = ship.path[0];
            const nextKey = hexKey(next.q, next.r);

            ship.movingToward = { q: next.q, r: next.r };

            const fromPos = hexToPixel(ship.q, ship.r);
            const toPos = hexToPixel(next.q, next.r);
            const rawAngle = Math.atan2(toPos.y - fromPos.y, toPos.x - fromPos.x);
            ship.heading = snapToHexDirection(rawAngle);

            // Check if next hex is blocked by a stationary ship
            const nextRes = reservations.get(nextKey);
            const isBlocked = nextRes && nextRes.permanent && nextRes.shipIndex !== shipIdx && nextKey !== currentKey;

            if (isBlocked || (occupiedHexes.has(nextKey) && nextKey !== currentKey)) {
                const currentWaypoint = ship.waypoints[0];
                const alt = findNearestAvailable(map, currentWaypoint.q, currentWaypoint.r, occupiedHexes);
                if (alt && (alt.q !== ship.q || alt.r !== ship.r)) {
                    const newPath = findPathWithAvoidance(map, ship.q, ship.r, alt.q, alt.r, reservations, shipIdx);
                    if (newPath && newPath.length > 0) {
                        ship.path = newPath;
                    } else {
                        ship.path = null;
                        ship.moveProgress = 0;
                        ship.movingToward = null;
                    }
                } else {
                    ship.waypoints.shift();
                    ship.path = null;
                    ship.moveProgress = 0;
                    ship.movingToward = null;
                }
                occupiedHexes.add(shipKey);
                continue;
            }

            // Safe to move - update progress
            ship.moveProgress += speed * dt;

            // Move to next hex(es) when progress >= 1
            while (ship.moveProgress >= 1 && ship.path.length > 0) {
                const nextHex = ship.path[0];
                const nextHexKey = hexKey(nextHex.q, nextHex.r);
                const currKey = hexKey(ship.q, ship.r);

                // Double-check occupancy (another ship may have moved here)
                if (occupiedHexes.has(nextHexKey) && nextHexKey !== currKey) {
                    ship.path = null;
                    break;
                }

                // Move ship
                ship.moveProgress -= 1;
                ship.path.shift();
                occupiedHexes.delete(currKey);
                ship.q = nextHex.q;
                ship.r = nextHex.r;
                occupiedHexes.add(nextHexKey);

                // Track chase distance for pirates (legacy)
                if (ship.aiState === 'chase') {
                    ship.aiChaseDistance++;
                }

                // Track chase distance for patrol/guard ships and AI ships chasing targets
                if (ship.attackTarget && ship.chaseStartHex) {
                    ship.chaseDistanceTraveled++;
                }

                // Mark fog dirty when player ship moves (triggers visibility recalculation)
                if (ship.type !== 'pirate') {
                    markVisibilityDirty(fogState);

                    // Collect any loot drops at this position
                    collectLootAtHex(gameState, nextHex.q, nextHex.r, floatingNumbers);
                }
            }

            // Path exhausted - check if we actually reached the current waypoint
            if (ship.path && ship.path.length === 0) {
                const currentWaypoint = ship.waypoints[0];
                if (currentWaypoint && (ship.q !== currentWaypoint.q || ship.r !== currentWaypoint.r)) {
                    // Haven't reached waypoint yet - need to recalculate path
                    // This happens when waypoint was changed mid-movement
                    ship.path = null;
                    // Keep moveProgress at 0 for fresh start to new destination
                    ship.moveProgress = 0;
                    ship.movingToward = null;
                } else {
                    // Arrived at current waypoint - remove from queue and proceed to next
                    ship.waypoints.shift();
                    ship.moveProgress = 0;
                    ship.movingToward = null;

                    // Calculate path to next waypoint immediately to avoid visual flash
                    if (ship.waypoints.length > 0) {
                        const nextWp = ship.waypoints[0];
                        ship.path = findPath(map, ship.q, ship.r, nextWp.q, nextWp.r, occupiedHexes);
                    } else if (ship.isPatrolling && ship.patrolRoute.length > 0) {
                        // Patrol loop - restore waypoints from patrol route
                        ship.waypoints = ship.patrolRoute.map(wp => ({ q: wp.q, r: wp.r }));

                        // Skip waypoints the ship is already at
                        while (ship.waypoints.length > 0 &&
                               ship.q === ship.waypoints[0].q &&
                               ship.r === ship.waypoints[0].r) {
                            ship.waypoints.shift();
                            // If we've skipped all waypoints, restore again to continue loop
                            if (ship.waypoints.length === 0) {
                                ship.waypoints = ship.patrolRoute.map(wp => ({ q: wp.q, r: wp.r }));
                                break; // Avoid infinite loop - just start from beginning
                            }
                        }

                        if (ship.waypoints.length > 0) {
                            const nextWp = ship.waypoints[0];
                            ship.path = findPath(map, ship.q, ship.r, nextWp.q, nextWp.r, occupiedHexes);
                        } else {
                            ship.path = null;
                        }
                    } else {
                        ship.path = null;
                    }
                }
            }
        }

        // Restore this ship's current position to occupied set
        occupiedHexes.add(hexKey(ship.q, ship.r));
    }

    // Update ship water trails
    for (const ship of gameState.ships) {
        if (!ship.trail) ship.trail = [];

        const pos = getShipVisualPos(hexToPixel, ship);
        const isMoving = ship.path && ship.path.length > 0;

        if (isMoving) {
            // Add current position to front of trail
            ship.trail.unshift({ x: pos.x, y: pos.y, age: 0 });
            // Limit trail length
            if (ship.trail.length > TRAIL_MAX_SEGMENTS) ship.trail.pop();
        }

        // Age all trail segments
        for (const segment of ship.trail) {
            segment.age += dt;
        }

        // Remove old segments
        ship.trail = ship.trail.filter(s => s.age < TRAIL_FADE_DURATION);
    }
}

/**
 * Get interpolated visual position for smooth ship movement
 * @param {Function} hexToPixel - Coordinate conversion function
 * @param {Object} ship - The ship object
 * @returns {{x: number, y: number}} Visual position
 */
export function getShipVisualPos(hexToPixel, ship) {
    const currentPos = hexToPixel(ship.q, ship.r);

    // If moving and has next target, interpolate
    if (ship.path && ship.path.length > 0 && ship.moveProgress > 0) {
        const nextHex = ship.path[0];
        const nextPos = hexToPixel(nextHex.q, nextHex.r);

        // Lerp between current and next position
        return {
            x: currentPos.x + (nextPos.x - currentPos.x) * ship.moveProgress,
            y: currentPos.y + (nextPos.y - currentPos.y) * ship.moveProgress,
        };
    }

    return currentPos;
}

/**
 * Update AI behavior for pirate ships - state machine with patrol, chase, attack, retreat
 * @param {Object} gameState - The game state
 * @param {Object} map - The game map
 * @param {Object} patrolCenter - { q, r } hex to patrol around (e.g., home port)
 * @param {number} dt - Delta time for timers
 */
export function updatePirateAI(gameState, map, patrolCenter, dt) {
    for (const ship of gameState.ships) {
        if (ship.type !== 'pirate') continue;

        const pirateData = SHIPS.pirate;
        const { enemySightDistance, attackDistance, maxChaseDistance, retreatCooldown } = pirateData;

        // Find nearest player target (ship or port) within sight
        let nearestTarget = null;
        let nearestDist = Infinity;

        // Check player ships (non-pirates)
        for (let i = 0; i < gameState.ships.length; i++) {
            const target = gameState.ships[i];
            if (target.type === 'pirate') continue;
            const dist = hexDistance(ship.q, ship.r, target.q, target.r);
            if (dist < nearestDist) {
                nearestDist = dist;
                nearestTarget = { type: 'ship', index: i, q: target.q, r: target.r };
            }
        }

        // Check ports
        for (let i = 0; i < gameState.ports.length; i++) {
            const port = gameState.ports[i];
            const dist = hexDistance(ship.q, ship.r, port.q, port.r);
            if (dist < nearestDist) {
                nearestDist = dist;
                nearestTarget = { type: 'port', index: i, q: port.q, r: port.r };
            }
        }

        // Check towers (prioritize over ports if closer)
        for (let i = 0; i < gameState.towers.length; i++) {
            const tower = gameState.towers[i];
            // Skip towers under construction
            if (tower.construction) continue;
            const dist = hexDistance(ship.q, ship.r, tower.q, tower.r);
            if (dist < nearestDist) {
                nearestDist = dist;
                nearestTarget = { type: 'tower', index: i, q: tower.q, r: tower.r };
            }
        }

        // Check settlements
        for (let i = 0; i < gameState.settlements.length; i++) {
            const settlement = gameState.settlements[i];
            // Skip settlements under construction
            if (settlement.construction) continue;
            const dist = hexDistance(ship.q, ship.r, settlement.q, settlement.r);
            if (dist < nearestDist) {
                nearestDist = dist;
                nearestTarget = { type: 'settlement', index: i, q: settlement.q, r: settlement.r };
            }
        }

        // State machine
        switch (ship.aiState) {
            case 'patrol':
                // Check for targets in range
                if (nearestTarget && nearestDist <= enemySightDistance) {
                    ship.aiState = 'chase';
                    ship.aiTarget = nearestTarget;
                    ship.aiChaseDistance = 0; // Reset chase distance counter
                    // For land-based targets (ports, towers, settlements), find nearest water tile since ships can't path to land
                    if (nearestTarget.type === 'port' || nearestTarget.type === 'tower' || nearestTarget.type === 'settlement') {
                        const nearWater = findNearestWater(map, nearestTarget.q, nearestTarget.r, ship.q, ship.r);
                        if (nearWater) {
                            ship.waypoints = [{ q: nearWater.q, r: nearWater.r }];
                        } else {
                            // Can't reach target (e.g., target near unreachable lake) - ignore it
                            ship.aiState = 'patrol';
                            ship.aiTarget = null;
                            break;
                        }
                    } else {
                        ship.waypoints = [{ q: nearestTarget.q, r: nearestTarget.r }];
                    }
                    ship.path = null;
                } else if (ship.waypoints.length === 0) {
                    // Generate random patrol point - try multiple angles to find water
                    // Use home port as patrol center, or roam around current position if none
                    const center = patrolCenter || { q: ship.q, r: ship.r };
                    const patrolRadius = 9 + Math.floor(Math.random() * 9);
                    const startAngle = Math.random() * Math.PI * 2;

                    for (let attempt = 0; attempt < 8; attempt++) {
                        const angle = startAngle + (attempt * Math.PI / 4);
                        const dq = Math.round(Math.cos(angle) * patrolRadius);
                        const dr = Math.round(Math.sin(angle) * patrolRadius);
                        const targetQ = center.q + dq;
                        const targetR = center.r + dr;
                        const tile = map.tiles.get(hexKey(targetQ, targetR));
                        if (tile && (tile.type === 'shallow' || tile.type === 'deep_ocean')) {
                            ship.waypoints = [{ q: targetQ, r: targetR }];
                            ship.path = null;
                            break;
                        }
                    }
                }
                break;

            case 'chase':
                // Check if chased too far
                if (ship.aiChaseDistance >= maxChaseDistance) {
                    // Chased for too long, give up and cooldown before re-engaging
                    ship.aiState = 'retreat';
                    ship.aiRetreatTimer = retreatCooldown;
                    ship.waypoints = [];
                    ship.path = null;
                    break;
                }

                // Update target position (it may have moved)
                if (ship.aiTarget) {
                    let target;
                    if (ship.aiTarget.type === 'ship') {
                        target = gameState.ships[ship.aiTarget.index];
                    } else if (ship.aiTarget.type === 'port') {
                        target = gameState.ports[ship.aiTarget.index];
                    } else if (ship.aiTarget.type === 'tower') {
                        target = gameState.towers[ship.aiTarget.index];
                    } else if (ship.aiTarget.type === 'settlement') {
                        target = gameState.settlements[ship.aiTarget.index];
                    }
                    if (target) {
                        ship.aiTarget.q = target.q;
                        ship.aiTarget.r = target.r;
                        const dist = hexDistance(ship.q, ship.r, target.q, target.r);

                        if (dist <= attackDistance) {
                            // Close enough to attack
                            ship.aiState = 'attack';
                            ship.attackCooldown = 0;  // Fire immediately
                            ship.waypoints = [];
                            ship.path = null;
                        } else {
                            // Keep chasing - for land-based targets (ports, towers, settlements), find nearest water tile
                            if (ship.aiTarget.type === 'port' || ship.aiTarget.type === 'tower' || ship.aiTarget.type === 'settlement') {
                                const nearWater = findNearestWater(map, target.q, target.r, ship.q, ship.r);
                                if (nearWater) {
                                    ship.waypoints = [{ q: nearWater.q, r: nearWater.r }];
                                } else {
                                    // Can't reach target - give up
                                    ship.aiState = 'patrol';
                                    ship.aiTarget = null;
                                }
                            } else {
                                ship.waypoints = [{ q: target.q, r: target.r }];
                            }
                        }
                    } else {
                        // Target lost, return to patrol
                        ship.aiState = 'patrol';
                        ship.aiTarget = null;
                    }
                }
                break;

            case 'attack':
                // Stay in place - attack logic will be added later
                // For now, just keep targeting
                ship.waypoints = [];
                ship.path = null;

                // Re-check distance in case target moved away
                if (ship.aiTarget) {
                    let target;
                    if (ship.aiTarget.type === 'ship') {
                        target = gameState.ships[ship.aiTarget.index];
                    } else if (ship.aiTarget.type === 'port') {
                        target = gameState.ports[ship.aiTarget.index];
                    } else if (ship.aiTarget.type === 'tower') {
                        target = gameState.towers[ship.aiTarget.index];
                    } else if (ship.aiTarget.type === 'settlement') {
                        target = gameState.settlements[ship.aiTarget.index];
                    }
                    if (target) {
                        const dist = hexDistance(ship.q, ship.r, target.q, target.r);
                        if (dist > attackDistance) {
                            // Target moved away, chase again
                            ship.aiState = 'chase';
                        }
                    } else {
                        ship.aiState = 'patrol';
                        ship.aiTarget = null;
                    }
                }
                break;

            case 'retreat':
                // Count down retreat timer
                ship.aiRetreatTimer -= dt;
                if (ship.aiRetreatTimer <= 0) {
                    ship.aiState = 'patrol';
                    ship.aiTarget = null;
                    ship.aiRetreatTimer = 0;
                } else if (ship.waypoints.length === 0) {
                    // Navigate away from target
                    if (ship.aiTarget) {
                        const awayAngle = Math.atan2(
                            ship.r - ship.aiTarget.r,
                            ship.q - ship.aiTarget.q
                        );
                        const retreatDist = 8;
                        const targetQ = ship.q + Math.round(Math.cos(awayAngle) * retreatDist);
                        const targetR = ship.r + Math.round(Math.sin(awayAngle) * retreatDist);
                        const tile = map.tiles.get(hexKey(targetQ, targetR));
                        if (tile && (tile.type === 'shallow' || tile.type === 'deep_ocean')) {
                            ship.waypoints = [{ q: targetQ, r: targetR }];
                            ship.path = null;
                        }
                    }
                }
                break;

            default:
                ship.aiState = 'patrol';
        }
    }
}

/**
 * Collect any loot drops at the given hex position
 */
function collectLootAtHex(gameState, q, r, floatingNumbers = []) {
    for (let i = gameState.lootDrops.length - 1; i >= 0; i--) {
        const loot = gameState.lootDrops[i];
        if (loot.q === q && loot.r === r) {
            // Add wood to global resources
            gameState.resources.wood += loot.amount;

            // Spawn sparkle effect
            spawnLootSparkle(gameState, q, r);

            // Spawn floating number
            floatingNumbers.push({
                q, r,
                text: `+${loot.amount}`,
                type: 'wood',
                age: 0,
                duration: 3.0,
                offsetX: 0,
            });

            // Remove the loot drop
            gameState.lootDrops.splice(i, 1);
        }
    }
}

/**
 * Spawn a yellow sparkle effect at the given position
 */
function spawnLootSparkle(gameState, q, r) {
    const particles = [];
    const numParticles = 8;
    for (let i = 0; i < numParticles; i++) {
        const angle = (i / numParticles) * Math.PI * 2;
        particles.push({
            dx: Math.cos(angle),
            dy: Math.sin(angle),
            size: 0.5 + Math.random() * 0.5,
        });
    }

    gameState.lootSparkles.push({
        q,
        r,
        age: 0,
        duration: 0.5,
        particles,
    });
}
