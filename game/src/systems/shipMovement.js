// Ship movement system - handles pathfinding, hex-to-hex navigation, and fog revelation
import { hexKey } from "../hex.js";
import { SHIPS } from "../sprites/index.js";
import { findPath, findNearestAvailable } from "../pathfinding.js";
import { revealRadius } from "../fogOfWar.js";

// Trail configuration
const TRAIL_MAX_SEGMENTS = 8;
const TRAIL_FADE_DURATION = 0.5;

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
        if (!ship.waypoint) continue;

        // Build blocked hexes (other ships, not this one)
        const blockedHexes = new Set(occupiedHexes);
        blockedHexes.delete(hexKey(ship.q, ship.r));

        // Calculate path if needed
        if (!ship.path) {
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

        // Move along path
        if (ship.path && ship.path.length > 0) {
            const speed = SHIPS[ship.type].speed;
            const currentKey = hexKey(ship.q, ship.r);

            // Check ahead: is next hex going to be blocked?
            const next = ship.path[0];
            const nextKey = hexKey(next.q, next.r);

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
                    }
                } else {
                    // Already at or near destination - stop
                    ship.waypoint = null;
                    ship.path = null;
                    ship.moveProgress = 0;
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

                // Reveal fog around new position based on ship's sight distance
                const sightDistance = SHIPS[ship.type].sight_distance;
                revealRadius(fogState, nextHex.q, nextHex.r, sightDistance);
            }

            // Arrived at destination
            if (ship.path && ship.path.length === 0) {
                ship.waypoint = null;
                ship.path = null;
                ship.moveProgress = 0;
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
