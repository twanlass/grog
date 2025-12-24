// Combat system - handles projectile attacks and damage
import { hexDistance } from "../hex.js";
import { SHIPS } from "../sprites/ships.js";

// Combat constants
export const CANNON_DAMAGE = 5;
export const PIRATE_RESPAWN_COOLDOWN = 30;  // seconds before a destroyed pirate respawns
const PROJECTILE_SPEED = 1.0;      // progress per second (~1s travel time)

/**
 * Updates combat: pirate attacks and projectile movement
 * @param {Function} hexToPixel - Coordinate conversion function
 * @param {Object} gameState - The game state
 * @param {number} dt - Delta time (already scaled by timeScale)
 */
export function updateCombat(hexToPixel, gameState, dt) {
    if (dt === 0) return; // Paused

    handlePirateAttacks(gameState, dt);
    handleAutoReturnFire(gameState);  // Player ships automatically defend themselves
    handlePlayerAttacks(gameState, dt);
    updateProjectiles(gameState, dt);
}

/**
 * Pirates in ATTACK state fire projectiles at their targets
 */
function handlePirateAttacks(gameState, dt) {
    for (let i = 0; i < gameState.ships.length; i++) {
        const ship = gameState.ships[i];
        if (ship.type !== 'pirate' || ship.aiState !== 'attack') continue;

        // Decrement cooldown
        ship.attackCooldown = Math.max(0, (ship.attackCooldown || 0) - dt);

        // Ready to fire?
        if (ship.attackCooldown <= 0 && ship.aiTarget) {
            const target = ship.aiTarget.type === 'ship'
                ? gameState.ships[ship.aiTarget.index]
                : gameState.ports[ship.aiTarget.index];

            if (target) {
                // Create projectile
                gameState.projectiles.push({
                    sourceShipIndex: i,
                    targetType: ship.aiTarget.type,
                    targetIndex: ship.aiTarget.index,
                    fromQ: ship.q,
                    fromR: ship.r,
                    toQ: target.q,
                    toR: target.r,
                    progress: 0,
                    damage: CANNON_DAMAGE,
                    speed: PROJECTILE_SPEED,
                });

                // Reset cooldown using ship's fire rate
                ship.attackCooldown = SHIPS[ship.type].fireCooldown;
            }
        }
    }
}

/**
 * Player ships automatically return fire when attacked by pirates
 */
function handleAutoReturnFire(gameState) {
    const attackDistance = 2;

    // Find all pirates that are attacking player ships
    for (let pirateIndex = 0; pirateIndex < gameState.ships.length; pirateIndex++) {
        const pirate = gameState.ships[pirateIndex];
        if (pirate.type !== 'pirate' || pirate.aiState !== 'attack') continue;
        if (!pirate.aiTarget || pirate.aiTarget.type !== 'ship') continue;

        const targetShip = gameState.ships[pirate.aiTarget.index];
        if (!targetShip || targetShip.type === 'pirate') continue;

        // If target ship has no attack target and is idle, auto-target the attacker
        if (!targetShip.attackTarget && !targetShip.waypoint && !targetShip.tradeRoute) {
            const dist = hexDistance(targetShip.q, targetShip.r, pirate.q, pirate.r);
            if (dist <= attackDistance) {
                // Close enough to return fire immediately
                targetShip.attackTarget = { type: 'ship', index: pirateIndex };
            }
        }
    }
}

/**
 * Player ships with attack targets fire at pirates when in range
 */
function handlePlayerAttacks(gameState, dt) {
    const attackDistance = 2;

    for (let i = 0; i < gameState.ships.length; i++) {
        const ship = gameState.ships[i];
        if (ship.type === 'pirate') continue;  // Skip pirates (handled by handlePirateAttacks)
        if (!ship.attackTarget) continue;       // Not attacking

        const target = gameState.ships[ship.attackTarget.index];
        if (!target) {
            ship.attackTarget = null;  // Target destroyed
            continue;
        }

        const dist = hexDistance(ship.q, ship.r, target.q, target.r);
        if (dist > attackDistance) continue;  // Not in range yet

        // Decrement cooldown
        ship.attackCooldown = Math.max(0, (ship.attackCooldown || 0) - dt);

        if (ship.attackCooldown <= 0) {
            // Fire!
            gameState.projectiles.push({
                sourceShipIndex: i,
                targetType: 'ship',
                targetIndex: ship.attackTarget.index,
                fromQ: ship.q,
                fromR: ship.r,
                toQ: target.q,
                toR: target.r,
                progress: 0,
                damage: CANNON_DAMAGE,
                speed: PROJECTILE_SPEED,
            });
            ship.attackCooldown = SHIPS[ship.type].fireCooldown;
        }
    }
}

/**
 * Move projectiles and apply damage when they hit
 */
function updateProjectiles(gameState, dt) {
    for (let i = gameState.projectiles.length - 1; i >= 0; i--) {
        const proj = gameState.projectiles[i];
        proj.progress += proj.speed * dt;

        if (proj.progress >= 1) {
            // Hit! Apply damage
            applyDamage(gameState, proj.targetType, proj.targetIndex, proj.damage);
            gameState.projectiles.splice(i, 1);
        }
    }
}

// Duration of hit flash effect in seconds
const HIT_FLASH_DURATION = 0.15;

/**
 * Apply damage to a target, destroying it if health reaches 0
 */
function applyDamage(gameState, targetType, targetIndex, damage) {
    const target = targetType === 'ship'
        ? gameState.ships[targetIndex]
        : gameState.ports[targetIndex];

    if (!target) return; // Target already destroyed

    target.health -= damage;
    target.hitFlash = HIT_FLASH_DURATION; // Trigger flash effect

    if (target.health <= 0) {
        if (targetType === 'ship') {
            destroyShip(gameState, targetIndex);
        } else {
            destroyPort(gameState, targetIndex);
        }
    }
}

/**
 * Remove a ship and clean up all references to it
 */
function destroyShip(gameState, shipIndex) {
    const ship = gameState.ships[shipIndex];

    // Queue pirate respawn
    if (ship && ship.type === 'pirate') {
        gameState.pirateRespawnQueue.push({ timer: PIRATE_RESPAWN_COOLDOWN });
    }

    // Remove from array
    gameState.ships.splice(shipIndex, 1);

    // Clean up references
    cleanupStaleReferences(gameState, 'ship', shipIndex);
}

/**
 * Remove a port and clean up all references to it
 */
function destroyPort(gameState, portIndex) {
    // Remove from array
    gameState.ports.splice(portIndex, 1);

    // Clean up references
    cleanupStaleReferences(gameState, 'port', portIndex);
}

/**
 * Fix all index-based references after removing an entity
 * This is critical to avoid stale pointer bugs
 */
function cleanupStaleReferences(gameState, removedType, removedIndex) {
    // Fix selectedUnits
    gameState.selectedUnits = gameState.selectedUnits.filter(u => {
        if (u.type === removedType && u.index === removedIndex) return false;
        if (u.type === removedType && u.index > removedIndex) u.index--;
        return true;
    });

    // Fix pirate aiTarget references
    for (const ship of gameState.ships) {
        if (ship.aiTarget && ship.aiTarget.type === removedType) {
            if (ship.aiTarget.index === removedIndex) {
                ship.aiTarget = null;
                ship.aiState = 'patrol';
                ship.waypoint = null;  // Clear waypoint so patrol generates a new one
                ship.path = null;      // Clear path to force recalculation
            } else if (ship.aiTarget.index > removedIndex) {
                ship.aiTarget.index--;
            }
        }
    }

    // Fix player ship attackTarget references
    if (removedType === 'ship') {
        for (const ship of gameState.ships) {
            if (ship.attackTarget && ship.attackTarget.type === 'ship') {
                if (ship.attackTarget.index === removedIndex) {
                    ship.attackTarget = null;
                } else if (ship.attackTarget.index > removedIndex) {
                    ship.attackTarget.index--;
                }
            }
        }
    }

    // Fix projectile target references
    // Note: We don't splice here to avoid corrupting the outer updateProjectiles loop
    // Instead, we mark projectiles as invalid by setting targetIndex to -1
    for (const proj of gameState.projectiles) {
        if (proj.targetType === removedType) {
            if (proj.targetIndex === removedIndex) {
                // Target destroyed, mark as invalid (will fizzle when it "hits")
                proj.targetIndex = -1;
            } else if (proj.targetIndex > removedIndex) {
                proj.targetIndex--;
            }
        }
        // Also fix sourceShipIndex if ship was removed
        if (removedType === 'ship' && proj.sourceShipIndex > removedIndex) {
            proj.sourceShipIndex--;
        }
    }

    // Fix trade routes (for port removal)
    if (removedType === 'port') {
        for (const ship of gameState.ships) {
            if (ship.tradeRoute) {
                if (ship.tradeRoute.foreignPortIndex === removedIndex ||
                    ship.tradeRoute.homePortIndex === removedIndex) {
                    // Clear the trade route if it references the destroyed port
                    ship.tradeRoute = null;
                    ship.waypoint = null;
                    ship.path = null;
                    ship.dockingState = null;
                    ship.waitingForDock = null;
                } else {
                    if (ship.tradeRoute.foreignPortIndex > removedIndex) {
                        ship.tradeRoute.foreignPortIndex--;
                    }
                    if (ship.tradeRoute.homePortIndex > removedIndex) {
                        ship.tradeRoute.homePortIndex--;
                    }
                }
            }
            // Also fix waitingForDock port references
            if (ship.waitingForDock) {
                if (ship.waitingForDock.portIndex === removedIndex) {
                    ship.waitingForDock = null;
                } else if (ship.waitingForDock.portIndex > removedIndex) {
                    ship.waitingForDock.portIndex--;
                }
            }
        }

        // Fix settlement parentPortIndex
        for (const settlement of gameState.settlements) {
            if (settlement.parentPortIndex === removedIndex) {
                // Orphan the settlement - assign to home port (index 0)
                // Note: if home port was destroyed, this could be problematic
                // but we're skipping settlement destruction for now
                settlement.parentPortIndex = 0;
            } else if (settlement.parentPortIndex > removedIndex) {
                settlement.parentPortIndex--;
            }
        }
    }

    // Fix port construction builderShipIndex (for ship removal)
    if (removedType === 'ship') {
        for (const port of gameState.ports) {
            if (port.construction && port.construction.builderShipIndex !== undefined) {
                if (port.construction.builderShipIndex === removedIndex) {
                    // Builder destroyed! Cancel construction
                    port.construction = null;
                } else if (port.construction.builderShipIndex > removedIndex) {
                    port.construction.builderShipIndex--;
                }
            }
        }
    }
}

/**
 * Update pirate respawn timers and spawn new pirates when ready
 * @param {Object} gameState - The game state
 * @param {Object} map - The map object with tiles
 * @param {Function} createShip - Function to create a new ship
 * @param {Function} hexKey - Function to create hex key
 * @param {number} dt - Delta time (already scaled by timeScale)
 */
export function updatePirateRespawns(gameState, map, createShip, hexKey, dt) {
    if (dt === 0) return; // Paused

    for (let i = gameState.pirateRespawnQueue.length - 1; i >= 0; i--) {
        const respawn = gameState.pirateRespawnQueue[i];
        respawn.timer -= dt;

        if (respawn.timer <= 0) {
            // Spawn a new pirate near the home port
            const homePort = gameState.ports[0];
            if (homePort) {
                const spawnDistance = 12 + Math.floor(Math.random() * 4);
                const startAngle = Math.random() * Math.PI * 2;

                for (let attempt = 0; attempt < 12; attempt++) {
                    const angle = startAngle + (attempt * Math.PI / 6);
                    const pirateQ = homePort.q + Math.round(Math.cos(angle) * spawnDistance);
                    const pirateR = homePort.r + Math.round(Math.sin(angle) * spawnDistance);
                    const pirateTile = map.tiles.get(hexKey(pirateQ, pirateR));

                    if (pirateTile && (pirateTile.type === 'shallow' || pirateTile.type === 'deep_ocean')) {
                        gameState.ships.push(createShip('pirate', pirateQ, pirateR));
                        break;
                    }
                }
            }

            // Remove from queue
            gameState.pirateRespawnQueue.splice(i, 1);
        }
    }
}
