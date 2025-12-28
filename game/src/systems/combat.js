// Combat system - handles projectile attacks and damage
import { hexDistance } from "../hex.js";
import { SHIPS } from "../sprites/ships.js";
import { TOWERS } from "../sprites/towers.js";
import { PORTS } from "../sprites/ports.js";
import { SETTLEMENTS } from "../sprites/settlements.js";
import { isShipBuildingPort, isShipBuildingTower, getHomePortIndex } from "../gameState.js";

// Combat constants
export const CANNON_DAMAGE = 5;
export const PIRATE_RESPAWN_COOLDOWN = 30;  // seconds before a destroyed pirate respawns
const PROJECTILE_SPEED = 1.0;      // progress per second (~1s travel time)
const SHOT_STAGGER_DELAY = 0.3;   // seconds between multi-shot tower shots

// Loot drop constants
const LOOT_DROP_CHANCE = 0.33;    // 33% chance to drop loot
const LOOT_AMOUNT = 20;           // wood per barrel
const LOOT_DURATION = 30;         // seconds before loot expires

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
    handleTowerAttacks(gameState, dt);  // Towers auto-attack pirates
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
            let target;
            if (ship.aiTarget.type === 'ship') {
                target = gameState.ships[ship.aiTarget.index];
            } else if (ship.aiTarget.type === 'port') {
                target = gameState.ports[ship.aiTarget.index];
            } else if (ship.aiTarget.type === 'tower') {
                target = gameState.towers[ship.aiTarget.index];
            }

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
 * Check if a ship is currently building something (port or tower)
 */
function isShipBuilding(shipIndex, gameState) {
    return isShipBuildingPort(shipIndex, gameState.ports) || isShipBuildingTower(shipIndex, gameState.towers);
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

        const targetShipIndex = pirate.aiTarget.index;
        const targetShip = gameState.ships[targetShipIndex];
        if (!targetShip || targetShip.type === 'pirate') continue;

        // Skip ships that are building - they can't return fire
        if (isShipBuilding(targetShipIndex, gameState)) continue;

        // If target ship has no attack target and is idle, auto-target the attacker
        if (!targetShip.attackTarget && !targetShip.waypoint && !targetShip.tradeRoute) {
            const dist = hexDistance(targetShip.q, targetShip.r, pirate.q, pirate.r);
            if (dist <= attackDistance) {
                // Close enough to return fire immediately
                targetShip.attackTarget = { type: 'ship', index: pirateIndex };
                // Only allow immediate fire if not on active cooldown
                if (!targetShip.attackCooldown || targetShip.attackCooldown <= 0) {
                    targetShip.attackCooldown = 0;
                }
            }
        }
    }
}

/**
 * Player ships with attack targets fire at pirates when in range
 * Also decrements cooldowns for ALL player ships (even when not attacking)
 */
function handlePlayerAttacks(gameState, dt) {
    const attackDistance = 2;

    for (let i = 0; i < gameState.ships.length; i++) {
        const ship = gameState.ships[i];
        if (ship.type === 'pirate') continue;  // Skip pirates (handled by handlePirateAttacks)
        if (isShipBuilding(i, gameState)) continue;  // Can't attack while building
        if (ship.repair) continue;  // Can't attack while repairing

        // Always decrement cooldown for player ships (even when not in combat)
        if (ship.attackCooldown > 0) {
            ship.attackCooldown = Math.max(0, ship.attackCooldown - dt);
        }

        // Skip firing logic if not attacking
        if (!ship.attackTarget) continue;

        const target = gameState.ships[ship.attackTarget.index];
        if (!target) {
            ship.attackTarget = null;  // Target destroyed
            continue;
        }

        const dist = hexDistance(ship.q, ship.r, target.q, target.r);
        if (dist > attackDistance) continue;  // Not in range yet

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
 * Towers automatically fire at nearby pirates
 */
function handleTowerAttacks(gameState, dt) {
    for (let i = 0; i < gameState.towers.length; i++) {
        const tower = gameState.towers[i];

        // Skip towers under construction or being repaired
        if (tower.construction) continue;
        if (tower.repair) continue;

        const towerData = TOWERS[tower.type];

        // Skip non-combat towers (watchtowers)
        if (!towerData.attackRange) continue;

        const attackRange = towerData.attackRange;
        const projectileCount = towerData.projectileCount || 1;

        // Decrement cooldown
        tower.attackCooldown = Math.max(0, (tower.attackCooldown || 0) - dt);

        // Process pending shots (staggered fire for multi-shot towers)
        if (tower.pendingShots && tower.pendingShots.length > 0) {
            for (let s = tower.pendingShots.length - 1; s >= 0; s--) {
                tower.pendingShots[s].delay -= dt;
                if (tower.pendingShots[s].delay <= 0) {
                    const shot = tower.pendingShots[s];
                    // Re-find target position (it may have moved)
                    const target = gameState.ships[shot.targetIndex];
                    if (target && target.health > 0) {
                        gameState.projectiles.push({
                            sourceTowerIndex: i,
                            targetType: 'ship',
                            targetIndex: shot.targetIndex,
                            fromQ: tower.q,
                            fromR: tower.r,
                            toQ: target.q,
                            toR: target.r,
                            progress: 0,
                            damage: shot.damage,
                            speed: PROJECTILE_SPEED,
                        });
                    }
                    tower.pendingShots.splice(s, 1);
                }
            }
        }

        // Find all pirates in range, sorted by distance
        const piratesInRange = [];
        for (let j = 0; j < gameState.ships.length; j++) {
            const ship = gameState.ships[j];
            if (ship.type !== 'pirate') continue;

            const dist = hexDistance(tower.q, tower.r, ship.q, ship.r);
            if (dist <= attackRange) {
                piratesInRange.push({ index: j, ship, dist });
            }
        }
        piratesInRange.sort((a, b) => a.dist - b.dist);

        // Fire projectiles if ready (smart targeting for multi-shot towers)
        if (piratesInRange.length > 0 && tower.attackCooldown <= 0) {
            for (let p = 0; p < projectileCount; p++) {
                // Target different pirates if available, otherwise double up on nearest
                const targetIdx = Math.min(p, piratesInRange.length - 1);
                const target = piratesInRange[targetIdx];

                if (p === 0) {
                    // First shot fires immediately
                    gameState.projectiles.push({
                        sourceTowerIndex: i,
                        targetType: 'ship',
                        targetIndex: target.index,
                        fromQ: tower.q,
                        fromR: tower.r,
                        toQ: target.ship.q,
                        toR: target.ship.r,
                        progress: 0,
                        damage: towerData.damage,
                        speed: PROJECTILE_SPEED,
                    });
                } else {
                    // Queue subsequent shots with stagger delay
                    if (!tower.pendingShots) tower.pendingShots = [];
                    tower.pendingShots.push({
                        targetIndex: target.index,
                        damage: towerData.damage,
                        delay: p * SHOT_STAGGER_DELAY,
                    });
                }
            }
            tower.attackCooldown = towerData.fireCooldown;
        }
    }
}

/**
 * Move projectiles and apply damage when they hit
 * Uses position-based hit detection: only hits if a valid target is at destination hex
 */
function updateProjectiles(gameState, dt) {
    for (let i = gameState.projectiles.length - 1; i >= 0; i--) {
        const proj = gameState.projectiles[i];
        proj.progress += proj.speed * dt;

        if (proj.progress >= 1) {
            // Determine what faction fired this projectile
            const sourceShip = proj.sourceShipIndex !== undefined ? gameState.ships[proj.sourceShipIndex] : null;
            const isPirateShot = sourceShip?.type === 'pirate';

            // Find any valid target at the destination hex
            let hitType = null;
            let hitIndex = -1;

            // Check ships at destination
            for (let j = 0; j < gameState.ships.length; j++) {
                const ship = gameState.ships[j];
                if (ship.q === proj.toQ && ship.r === proj.toR) {
                    // Pirates hit player ships, players/towers hit pirates
                    if (isPirateShot && ship.type !== 'pirate') {
                        hitType = 'ship';
                        hitIndex = j;
                        break;
                    } else if (!isPirateShot && ship.type === 'pirate') {
                        hitType = 'ship';
                        hitIndex = j;
                        break;
                    }
                }
            }

            // Pirates can also hit ports/towers at destination
            if (hitIndex === -1 && isPirateShot) {
                for (let j = 0; j < gameState.ports.length; j++) {
                    const port = gameState.ports[j];
                    if (port.q === proj.toQ && port.r === proj.toR) {
                        hitType = 'port';
                        hitIndex = j;
                        break;
                    }
                }
                if (hitIndex === -1) {
                    for (let j = 0; j < gameState.towers.length; j++) {
                        const tower = gameState.towers[j];
                        if (tower.q === proj.toQ && tower.r === proj.toR) {
                            hitType = 'tower';
                            hitIndex = j;
                            break;
                        }
                    }
                }
            }

            if (hitIndex !== -1) {
                // Hit! Apply damage to whatever is at the destination
                applyDamage(gameState, hitType, hitIndex, proj.damage);
            } else {
                // Miss - create water splash effect
                gameState.waterSplashes.push({
                    q: proj.toQ,
                    r: proj.toR,
                    age: 0,
                    duration: 0.5,
                });
            }

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
    let target;
    if (targetType === 'ship') {
        target = gameState.ships[targetIndex];
    } else if (targetType === 'port') {
        target = gameState.ports[targetIndex];
    } else if (targetType === 'tower') {
        target = gameState.towers[targetIndex];
    }

    if (!target) return; // Target already destroyed

    target.health -= damage;
    target.hitFlash = HIT_FLASH_DURATION; // Trigger flash effect

    if (target.health <= 0) {
        if (targetType === 'ship') {
            destroyShip(gameState, targetIndex);
        } else if (targetType === 'port') {
            destroyPort(gameState, targetIndex);
        } else if (targetType === 'tower') {
            destroyTower(gameState, targetIndex);
        }
    }
}

/**
 * Spawn destruction effects (explosion, debris, dust/water rings)
 * @param {Object} gameState
 * @param {number} q - Hex q coordinate
 * @param {number} r - Hex r coordinate
 * @param {string} unitType - 'ship', 'port', or 'tower'
 * @param {string} [buildingType] - For ports: 'dock', 'shipyard', 'stronghold'
 */
function spawnDestructionEffects(gameState, q, r, unitType, buildingType = null) {
    // Spawn explosion (same for all unit types)
    gameState.shipExplosions.push({
        q,
        r,
        age: 0,
        duration: 0.6,
    });

    // Determine debris type and location type
    const isWoodDebris = unitType === 'ship' || buildingType === 'dock';
    const isOnWater = unitType === 'ship';

    // Spawn debris pieces (constrained to hex bounds)
    const debrisPieces = [];
    for (let i = 0; i < 8; i++) {
        const angle = Math.random() * Math.PI * 2;
        const dist = Math.random() * 18;
        debrisPieces.push({
            offsetX: Math.cos(angle) * dist,
            offsetY: Math.sin(angle) * dist,
            rotation: Math.random() * Math.PI * 2,
            size: 5 + Math.random() * 6,
            driftX: (Math.random() - 0.5) * 8,
            driftY: (Math.random() - 0.5) * 8,
        });
    }

    // Generate randomized ring/cloud data (constrained to hex)
    const rings = [];
    for (let i = 0; i < 3; i++) {
        rings.push({
            delay: i * 0.2 + Math.random() * 0.15,
            baseRadius: 8 + Math.random() * 6,
            growthRadius: 12 + Math.random() * 6,
        });
    }

    gameState.floatingDebris.push({
        q,
        r,
        pieces: debrisPieces,
        age: 0,
        duration: 4.0,
        debrisType: isWoodDebris ? 'wood' : 'stone',
        hasWaterRings: isOnWater,
        hasDustClouds: !isOnWater,
        rings,
    });
}

/**
 * Potentially spawn loot drop when a pirate is destroyed
 */
function spawnLootDrop(gameState, q, r) {
    if (Math.random() > LOOT_DROP_CHANCE) return;

    gameState.lootDrops.push({
        q,
        r,
        amount: LOOT_AMOUNT,
        age: 0,
        duration: LOOT_DURATION,
    });
}

/**
 * Remove a ship and clean up all references to it
 */
function destroyShip(gameState, shipIndex) {
    const ship = gameState.ships[shipIndex];
    if (!ship) return;

    spawnDestructionEffects(gameState, ship.q, ship.r, 'ship');

    // Queue pirate respawn and increment kill counter
    if (ship.type === 'pirate') {
        gameState.pirateKills++;

        // Chance to drop loot
        spawnLootDrop(gameState, ship.q, ship.r);

        // In sandbox mode, pirates respawn after a cooldown
        // In defend mode, pirates don't respawn (waves handle spawning)
        if (!gameState.scenario || gameState.scenario.gameMode !== 'defend') {
            gameState.pirateRespawnQueue.push({ timer: PIRATE_RESPAWN_COOLDOWN });
        }
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
    const port = gameState.ports[portIndex];
    if (!port) return;

    spawnDestructionEffects(gameState, port.q, port.r, 'port', port.type);

    // Remove from array
    gameState.ports.splice(portIndex, 1);

    // Clean up references
    cleanupStaleReferences(gameState, 'port', portIndex);
}

/**
 * Remove a tower and clean up all references to it
 */
function destroyTower(gameState, towerIndex) {
    const tower = gameState.towers[towerIndex];
    if (!tower) return;

    spawnDestructionEffects(gameState, tower.q, tower.r, 'tower');

    // Remove from array
    gameState.towers.splice(towerIndex, 1);

    // Clean up references
    cleanupStaleReferences(gameState, 'tower', towerIndex);
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
        for (let i = gameState.settlements.length - 1; i >= 0; i--) {
            const settlement = gameState.settlements[i];
            if (settlement.parentPortIndex === removedIndex) {
                if (settlement.construction) {
                    // Port destroyed while building settlement - cancel and refund
                    const settlementData = SETTLEMENTS.settlement;
                    if (settlementData && settlementData.cost) {
                        for (const [resource, amount] of Object.entries(settlementData.cost)) {
                            gameState.resources[resource] = (gameState.resources[resource] || 0) + amount;
                        }
                        console.log(`Refunded ${JSON.stringify(settlementData.cost)} for cancelled settlement construction`);
                    }
                    gameState.settlements.splice(i, 1);
                } else {
                    // Completed settlement - mark as disconnected (will auto-reconnect if another port is nearby)
                    settlement.parentPortIndex = null;
                }
            } else if (settlement.parentPortIndex > removedIndex) {
                settlement.parentPortIndex--;
            }
        }
    }

    // Fix port construction builderShipIndex (for ship removal)
    if (removedType === 'ship') {
        for (let i = gameState.ports.length - 1; i >= 0; i--) {
            const port = gameState.ports[i];
            if (port.construction && port.construction.builderShipIndex !== undefined) {
                if (port.construction.builderShipIndex === removedIndex) {
                    // Builder destroyed! Cancel construction and refund resources
                    const portData = PORTS[port.type];
                    if (portData && portData.cost) {
                        for (const [resource, amount] of Object.entries(portData.cost)) {
                            gameState.resources[resource] = (gameState.resources[resource] || 0) + amount;
                        }
                        console.log(`Refunded ${JSON.stringify(portData.cost)} for cancelled ${port.type} construction`);
                    }
                    // Remove the incomplete port
                    gameState.ports.splice(i, 1);
                } else if (port.construction.builderShipIndex > removedIndex) {
                    port.construction.builderShipIndex--;
                }
            }
        }

        // Fix tower construction builderShipIndex (for ship removal)
        for (let i = gameState.towers.length - 1; i >= 0; i--) {
            const tower = gameState.towers[i];
            if (tower.construction && tower.construction.builderShipIndex !== undefined) {
                if (tower.construction.builderShipIndex === removedIndex) {
                    // Builder destroyed! Cancel construction and refund resources
                    const towerData = TOWERS[tower.type];
                    if (towerData && towerData.cost) {
                        for (const [resource, amount] of Object.entries(towerData.cost)) {
                            gameState.resources[resource] = (gameState.resources[resource] || 0) + amount;
                        }
                        console.log(`Refunded ${JSON.stringify(towerData.cost)} for cancelled tower construction`);
                    }
                    // Remove the incomplete tower
                    gameState.towers.splice(i, 1);
                } else if (tower.construction.builderShipIndex > removedIndex) {
                    tower.construction.builderShipIndex--;
                }
            }
        }
    }

    // Fix projectile sourceTowerIndex (for tower removal)
    if (removedType === 'tower') {
        for (const proj of gameState.projectiles) {
            if (proj.sourceTowerIndex !== undefined) {
                if (proj.sourceTowerIndex === removedIndex) {
                    // Source tower destroyed - projectile continues
                    proj.sourceTowerIndex = -1;
                } else if (proj.sourceTowerIndex > removedIndex) {
                    proj.sourceTowerIndex--;
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
            const homePortIndex = getHomePortIndex(gameState, map);
            const homePort = homePortIndex !== null ? gameState.ports[homePortIndex] : null;
            let spawned = false;

            if (homePort) {
                const startAngle = Math.random() * Math.PI * 2;

                // Try multiple distances if needed (8-20 hexes from home port)
                for (let dist = 12; dist >= 6 && !spawned; dist -= 2) {
                    for (let attempt = 0; attempt < 12; attempt++) {
                        const angle = startAngle + (attempt * Math.PI / 6);
                        const pirateQ = homePort.q + Math.round(Math.cos(angle) * dist);
                        const pirateR = homePort.r + Math.round(Math.sin(angle) * dist);
                        const pirateTile = map.tiles.get(hexKey(pirateQ, pirateR));

                        if (pirateTile && (pirateTile.type === 'shallow' || pirateTile.type === 'deep_ocean')) {
                            gameState.ships.push(createShip('pirate', pirateQ, pirateR));
                            spawned = true;
                            break;
                        }
                    }
                }
            }

            // Only remove from queue if successfully spawned (or no home port)
            if (spawned || !homePort) {
                gameState.pirateRespawnQueue.splice(i, 1);
            } else {
                // Retry next frame if spawn failed
                respawn.timer = 1;
            }
        }
    }
}
