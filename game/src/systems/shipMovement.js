// Ship movement system - handles pathfinding, hex-to-hex navigation, and fog revelation
import { hexKey, hexDistance, hexToPixel } from "../hex.js";
import { SHIPS } from "../sprites/index.js";
import { findPath, findNearestAvailable, findNearestWater } from "../pathfinding.js";
import { revealRadius } from "../fogOfWar.js";

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
 * Updates all ship movement, pathfinding, and water trails
 * @param {Function} hexToPixel - Coordinate conversion function
 * @param {Object} gameState - The game state
 * @param {Object} map - The game map
 * @param {Object} fogState - Fog of war state
 * @param {number} dt - Delta time (already scaled by timeScale)
 */
export function updateShipMovement(hexToPixel, gameState, map, fogState, dt) {
    if (dt === 0) return; // Paused

    // Build set of occupied hexes (all ships)
    const occupiedHexes = new Set();
    for (const s of gameState.ships) {
        occupiedHexes.add(hexKey(s.q, s.r));
    }

    for (const ship of gameState.ships) {
        // Skip ships being repaired (can't move while repairing)
        if (ship.repair) continue;

        // Check if player ship is in attack range of its target
        if (ship.attackTarget && ship.attackTarget.type === 'ship') {
            const target = gameState.ships[ship.attackTarget.index];
            if (target) {
                const dist = hexDistance(ship.q, ship.r, target.q, target.r);
                const attackDistance = 2;  // Same as pirate attack range
                if (dist <= attackDistance) {
                    // In range - stop moving, combat system will handle firing
                    ship.waypoint = null;
                    ship.path = null;
                } else if (!ship.waypoint || (ship.waypoint.q !== target.q || ship.waypoint.r !== target.r)) {
                    // Update waypoint to track moving target
                    ship.waypoint = { q: target.q, r: target.r };
                    ship.path = null;
                }
            } else {
                // Target destroyed
                ship.attackTarget = null;
            }
        }

        if (!ship.waypoint) continue;

        // Build blocked hexes (other ships, not this one)
        const blockedHexes = new Set(occupiedHexes);
        blockedHexes.delete(hexKey(ship.q, ship.r));

        // Calculate path if needed
        if (!ship.path) {
            // If ship is mid-movement toward a saved target, restore path to that target first
            // This prevents visual snapping when waypoint changes mid-movement
            if (ship.moveProgress > 0 && ship.movingToward) {
                // Restore minimal path to current movement target
                ship.path = [{ q: ship.movingToward.q, r: ship.movingToward.r }];
                ship.movingToward = null;  // Clear it, will be set again below
            } else {
                // Check if destination is blocked by another ship
                const destKey = hexKey(ship.waypoint.q, ship.waypoint.r);
                let targetQ = ship.waypoint.q;
                let targetR = ship.waypoint.r;

                if (blockedHexes.has(destKey)) {
                    // Find nearest available hex to the destination
                    const alt = findNearestAvailable(map, ship.waypoint.q, ship.waypoint.r, blockedHexes);
                    if (alt) {
                        targetQ = alt.q;
                        targetR = alt.r;
                    } else {
                        // No available hex nearby - clear waypoint
                        ship.waypoint = null;
                        continue;
                    }
                }

                ship.path = findPath(map, ship.q, ship.r, targetQ, targetR, blockedHexes);

                // No valid path - clear waypoint
                if (!ship.path) {
                    ship.waypoint = null;
                    continue;
                }
            }
        }

        // Move along path
        if (ship.path && ship.path.length > 0) {
            const speed = SHIPS[ship.type].speed;
            const currentKey = hexKey(ship.q, ship.r);

            // Check ahead: is next hex going to be blocked?
            const next = ship.path[0];
            const nextKey = hexKey(next.q, next.r);

            // Save current movement target for smooth waypoint changes
            ship.movingToward = { q: next.q, r: next.r };

            // Update ship heading to face the next hex (snapped to 6 directions)
            const fromPos = hexToPixel(ship.q, ship.r);
            const toPos = hexToPixel(next.q, next.r);
            const rawAngle = Math.atan2(toPos.y - fromPos.y, toPos.x - fromPos.x);
            ship.heading = snapToHexDirection(rawAngle);

            if (occupiedHexes.has(nextKey) && nextKey !== currentKey) {
                // Next hex is blocked - find alternative destination near waypoint
                const alt = findNearestAvailable(map, ship.waypoint.q, ship.waypoint.r, blockedHexes);
                if (alt && (alt.q !== ship.q || alt.r !== ship.r)) {
                    // Recalculate path to alternative destination
                    const newPath = findPath(map, ship.q, ship.r, alt.q, alt.r, blockedHexes);
                    if (newPath && newPath.length > 0) {
                        ship.path = newPath;
                        // Don't reset moveProgress - continue smooth movement
                    } else {
                        // No valid path - stop and wait
                        ship.path = null;
                        ship.moveProgress = 0;
                        ship.movingToward = null;
                    }
                } else {
                    // Already at or near destination - stop
                    ship.waypoint = null;
                    ship.path = null;
                    ship.moveProgress = 0;
                    ship.movingToward = null;
                }
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

                // Track chase distance for pirates
                if (ship.aiState === 'chase') {
                    ship.aiChaseDistance++;
                }

                // Reveal fog around new position (player ships only - pirates stay hidden)
                if (ship.type !== 'pirate') {
                    const sightDistance = SHIPS[ship.type].sightDistance;
                    revealRadius(fogState, nextHex.q, nextHex.r, sightDistance);

                    // Collect any loot drops at this position
                    collectLootAtHex(gameState, nextHex.q, nextHex.r);
                }
            }

            // Path exhausted - check if we actually reached the waypoint
            if (ship.path && ship.path.length === 0) {
                if (ship.waypoint && (ship.q !== ship.waypoint.q || ship.r !== ship.waypoint.r)) {
                    // Haven't reached waypoint yet - need to recalculate path
                    // This happens when waypoint was changed mid-movement
                    ship.path = null;
                    // Keep moveProgress at 0 for fresh start to new destination
                    ship.moveProgress = 0;
                    ship.movingToward = null;
                } else {
                    // Actually arrived at destination
                    ship.waypoint = null;
                    ship.path = null;
                    ship.moveProgress = 0;
                    ship.movingToward = null;
                }
            }
        }
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

        // State machine
        switch (ship.aiState) {
            case 'patrol':
                // Check for targets in range
                if (nearestTarget && nearestDist <= enemySightDistance) {
                    ship.aiState = 'chase';
                    ship.aiTarget = nearestTarget;
                    ship.aiChaseDistance = 0; // Reset chase distance counter
                    // For land-based targets (ports, towers), find nearest water tile since ships can't path to land
                    if (nearestTarget.type === 'port' || nearestTarget.type === 'tower') {
                        const nearWater = findNearestWater(map, nearestTarget.q, nearestTarget.r, ship.q, ship.r);
                        if (nearWater) {
                            ship.waypoint = { q: nearWater.q, r: nearWater.r };
                        } else {
                            // Can't reach target (e.g., target near unreachable lake) - ignore it
                            ship.aiState = 'patrol';
                            ship.aiTarget = null;
                            break;
                        }
                    } else {
                        ship.waypoint = { q: nearestTarget.q, r: nearestTarget.r };
                    }
                    ship.path = null;
                } else if (!ship.waypoint) {
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
                            ship.waypoint = { q: targetQ, r: targetR };
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
                    ship.waypoint = null;
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
                    }
                    if (target) {
                        ship.aiTarget.q = target.q;
                        ship.aiTarget.r = target.r;
                        const dist = hexDistance(ship.q, ship.r, target.q, target.r);

                        if (dist <= attackDistance) {
                            // Close enough to attack
                            ship.aiState = 'attack';
                            ship.attackCooldown = 0;  // Fire immediately
                            ship.waypoint = null;
                            ship.path = null;
                        } else {
                            // Keep chasing - for land-based targets (ports, towers), find nearest water tile
                            if (ship.aiTarget.type === 'port' || ship.aiTarget.type === 'tower') {
                                const nearWater = findNearestWater(map, target.q, target.r, ship.q, ship.r);
                                if (nearWater) {
                                    ship.waypoint = { q: nearWater.q, r: nearWater.r };
                                } else {
                                    // Can't reach target - give up
                                    ship.aiState = 'patrol';
                                    ship.aiTarget = null;
                                }
                            } else {
                                ship.waypoint = { q: target.q, r: target.r };
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
                ship.waypoint = null;
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
                } else if (!ship.waypoint) {
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
                            ship.waypoint = { q: targetQ, r: targetR };
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
function collectLootAtHex(gameState, q, r) {
    for (let i = gameState.lootDrops.length - 1; i >= 0; i--) {
        const loot = gameState.lootDrops[i];
        if (loot.q === q && loot.r === r) {
            // Add wood to global resources
            gameState.resources.wood += loot.amount;

            // Spawn sparkle effect
            spawnLootSparkle(gameState, q, r);

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
