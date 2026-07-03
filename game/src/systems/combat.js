// Combat system - handles projectile attacks and damage
import { hexDistance, hexKey, HEX_SIZE } from "../hex.js";
import { SHIPS } from "../sprites/ships.js";
import { TOWERS } from "../sprites/towers.js";
import { PORTS } from "../sprites/ports.js";
import { SETTLEMENTS } from "../sprites/settlements.js";
import { isShipBuildingPort, isShipBuildingTower, getHomePortIndex, findNearestWaterInRange, isAIOwner, isPirateShip } from "../gameState.js";
import { notifyAIAttacked } from "./aiPlayer.js";
import { markVisibilityDirty } from "../fogOfWar.js";
import { isWater } from "../mapGenerator.js";

// Combat constants
export const CANNON_DAMAGE = 5;
export const PIRATE_RESPAWN_COOLDOWN = 30;  // seconds before a destroyed pirate respawns

// ============================================================================
// PERFORMANCE OPTIMIZATION: Position lookup maps and spatial indexing
// ============================================================================

// Cached position lookup maps (rebuilt each frame in updateCombat)
let entityPositionMap = null;  // hexKey -> { ships: [...], ports: [...], towers: [...], settlements: [...] }
let shipSpatialIndex = null;   // regionKey -> [shipIndices]

// Spatial index cell size (in hex units) - ships within this range are grouped
const SPATIAL_CELL_SIZE = 8;

/**
 * Build position lookup map for O(1) entity queries by hex position
 * Used by projectile hit detection
 */
function buildEntityPositionMap(gameState) {
    const map = new Map();

    for (let i = 0; i < gameState.ships.length; i++) {
        const ship = gameState.ships[i];
        const key = hexKey(ship.q, ship.r);
        if (!map.has(key)) map.set(key, { ships: [], ports: [], towers: [], settlements: [] });
        map.get(key).ships.push({ index: i, entity: ship });
    }

    for (let i = 0; i < gameState.ports.length; i++) {
        const port = gameState.ports[i];
        const key = hexKey(port.q, port.r);
        if (!map.has(key)) map.set(key, { ships: [], ports: [], towers: [], settlements: [] });
        map.get(key).ports.push({ index: i, entity: port });
    }

    for (let i = 0; i < gameState.towers.length; i++) {
        const tower = gameState.towers[i];
        const key = hexKey(tower.q, tower.r);
        if (!map.has(key)) map.set(key, { ships: [], ports: [], towers: [], settlements: [] });
        map.get(key).towers.push({ index: i, entity: tower });
    }

    for (let i = 0; i < gameState.settlements.length; i++) {
        const settlement = gameState.settlements[i];
        const key = hexKey(settlement.q, settlement.r);
        if (!map.has(key)) map.set(key, { ships: [], ports: [], towers: [], settlements: [] });
        map.get(key).settlements.push({ index: i, entity: settlement });
    }

    return map;
}

/**
 * Get spatial cell key for a position
 */
function getSpatialCellKey(q, r) {
    const cellQ = Math.floor(q / SPATIAL_CELL_SIZE);
    const cellR = Math.floor(r / SPATIAL_CELL_SIZE);
    return `${cellQ},${cellR}`;
}

/**
 * Build spatial index for ships - groups ships by cell for efficient range queries
 */
function buildShipSpatialIndex(gameState) {
    const index = new Map();

    for (let i = 0; i < gameState.ships.length; i++) {
        const ship = gameState.ships[i];
        const cellKey = getSpatialCellKey(ship.q, ship.r);
        if (!index.has(cellKey)) index.set(cellKey, []);
        index.get(cellKey).push(i);
    }

    return index;
}

/**
 * Get ship indices in cells that could be within range of a position
 * Returns array of ship indices to check (much smaller than all ships)
 */
function getShipsInRange(spatialIndex, gameState, q, r, range) {
    const candidates = [];
    const cellRange = Math.ceil(range / SPATIAL_CELL_SIZE) + 1;
    const centerCellQ = Math.floor(q / SPATIAL_CELL_SIZE);
    const centerCellR = Math.floor(r / SPATIAL_CELL_SIZE);

    for (let dq = -cellRange; dq <= cellRange; dq++) {
        for (let dr = -cellRange; dr <= cellRange; dr++) {
            const cellKey = `${centerCellQ + dq},${centerCellR + dr}`;
            const shipsInCell = spatialIndex.get(cellKey);
            if (shipsInCell) {
                for (const shipIndex of shipsInCell) {
                    candidates.push(shipIndex);
                }
            }
        }
    }

    return candidates;
}

/**
 * Find water tiles near map center for pirate spawning (versus mode)
 * @param {Object} map - The map object with tiles, width, height
 * @param {Function} hexKeyFn - Function to create hex key from (q, r)
 * @param {number} count - Number of spawn positions needed
 * @param {Set} occupiedHexes - Set of hex keys already occupied by ships
 * @returns {Array} Array of {q, r} spawn positions
 */
export function findCenterSpawnPositions(map, hexKeyFn, count, occupiedHexes) {
    const centerRow = Math.floor(map.height / 2);
    const centerCol = Math.floor(map.width / 2);
    const centerQ = centerCol - Math.floor(centerRow / 2);
    const centerR = centerRow;

    const positions = [];
    const maxRadius = 15;

    // Spiral outward from center to find water tiles
    for (let radius = 0; radius <= maxRadius && positions.length < count; radius++) {
        for (let angle = 0; angle < 6 && positions.length < count; angle++) {
            const angleRad = (angle / 6) * Math.PI * 2 + (radius * 0.5);  // Offset angle by radius for variety
            const q = centerQ + Math.round(Math.cos(angleRad) * radius);
            const r = centerR + Math.round(Math.sin(angleRad) * radius);
            const key = hexKeyFn(q, r);

            const tile = map.tiles.get(key);
            if (isWater(tile)) {
                if (!occupiedHexes.has(key)) {
                    positions.push({ q, r });
                    occupiedHexes.add(key);  // Mark as taken
                }
            }
        }
    }

    return positions;
}
const PROJECTILE_SPEED = 1.25;     // progress per second (~0.8s travel time)
const SHOT_STAGGER_DELAY = 0.3;   // seconds between multi-shot tower shots

// Aim & hit resolution constants
const LEAD_TIME = 1 / PROJECTILE_SPEED;  // Seconds of target movement to lead by
const SPLASH_DAMAGE_FACTOR = 0.25;       // Near-miss damage = direct * this factor
const SPLASH_RADIUS = 1;                 // Hex distance from impact to count as splash

// Loot drop constants
const LOOT_DROP_CHANCE = 0.33;    // 33% chance to drop loot
const LOOT_MIN_AMOUNT = 10;       // minimum wood per barrel
const LOOT_MAX_AMOUNT = 50;       // maximum wood per barrel
const LOOT_DURATION = 30;         // seconds before loot expires

/**
 * Predict where a moving target will be after `leadTime` seconds, by walking
 * forward along its planned path. Stationary targets (no path) return current
 * position so gunners aim where they are. Used so cutters and other fast hulls
 * can't trivially out-pace projectile flight time by sailing straight away.
 */
function predictTargetHex(target, leadTime) {
    if (!target.path || target.path.length === 0) {
        return { q: target.q, r: target.r };
    }
    const speed = SHIPS[target.type]?.speed || 0;
    if (speed <= 0) return { q: target.q, r: target.r };

    const hexesAhead = leadTime * speed;
    const remainingOnCurrentStep = 1 - (target.moveProgress || 0);
    let stepsToAdvance = hexesAhead - remainingOnCurrentStep;

    // Projectile lands before the target finishes its current step — aim at the
    // next hex anyway since it's the closest position they're committed to.
    if (stepsToAdvance < 0) {
        return { q: target.path[0].q, r: target.path[0].r };
    }

    let idx = 0;
    while (stepsToAdvance >= 1 && idx + 1 < target.path.length) {
        stepsToAdvance -= 1;
        idx++;
    }
    return { q: target.path[idx].q, r: target.path[idx].r };
}

/**
 * Queue a cannon fire sound event with position for visibility check
 */
function queueCannonSound(gameState, q, r) {
    if (!gameState.soundEvents) gameState.soundEvents = [];
    gameState.soundEvents.push({ type: 'cannon-fire', q, r });
}

/**
 * Queue a cannon impact sound event with position for visibility check
 */
function queueImpactSound(gameState, q, r) {
    if (!gameState.soundEvents) gameState.soundEvents = [];
    gameState.soundEvents.push({ type: 'cannon-impact', q, r });
}

/**
 * Queue an arrow fire sound event with position for visibility check
 */
function queueArrowSound(gameState, q, r) {
    if (!gameState.soundEvents) gameState.soundEvents = [];
    gameState.soundEvents.push({ type: 'arrow-fire', q, r });
}

/**
 * Queue a fire sound matching the tower's projectile type
 */
function queueTowerFireSound(gameState, q, r, projectileType) {
    if (projectileType === 'arrow') {
        queueArrowSound(gameState, q, r);
    } else {
        queueCannonSound(gameState, q, r);
    }
}

/**
 * Spawn cannon smoke puff at a location
 */
function spawnCannonSmoke(gameState, q, r) {
    const particles = [];
    for (let i = 0; i < 5; i++) {
        particles.push({
            dx: (Math.random() - 0.5) * 2,
            dy: -Math.random(),  // Drift upward
            size: 0.5 + Math.random() * 0.5,
        });
    }
    gameState.cannonSmoke.push({
        q,
        r,
        particles,
        age: 0,
        duration: 0.6,
    });
}

/**
 * Spawn wood splinter particles at hit location
 */
function spawnWoodSplinters(gameState, q, r) {
    const particles = [];
    for (let i = 0; i < 6; i++) {
        const angle = Math.random() * Math.PI * 2;
        const speed = 0.5 + Math.random() * 1.5;
        particles.push({
            dx: Math.cos(angle) * speed,
            dy: Math.sin(angle) * speed - 0.5,  // Slight upward bias
            size: 0.3 + Math.random() * 0.4,
            rotation: Math.random() * Math.PI * 2,
        });
    }
    gameState.woodSplinters.push({
        q,
        r,
        particles,
        age: 0,
        duration: 0.5,
    });
}

/**
 * Updates combat: pirate attacks and projectile movement
 * @param {Function} hexToPixel - Coordinate conversion function
 * @param {Object} gameState - The game state
 * @param {Object} map - The game map (for finding water tiles)
 * @param {number} dt - Delta time (already scaled by timeScale)
 * @param {Object} fogState - Fog of war state (for marking dirty on destruction)
 */
export function updateCombat(hexToPixel, gameState, map, dt, fogState) {
    if (dt === 0) return; // Paused

    // Build spatial indexes once per frame for efficient lookups
    entityPositionMap = buildEntityPositionMap(gameState);
    shipSpatialIndex = buildShipSpatialIndex(gameState);

    processShipPendingShots(gameState, dt, fogState);  // Fire queued ship shots
    handlePirateAttacks(gameState, dt, fogState);
    handleAutoReturnFire(gameState);  // Player ships automatically defend themselves
    handlePatrolChase(gameState, map);     // Patrolling ships chase their attack targets
    handlePlayerAttacks(gameState, dt, fogState);
    handleTowerAttacks(gameState, dt);  // Towers auto-attack pirates
    updateTNTFuses(gameState, dt, fogState);  // Burn down armed kamikaze fuses
    updateProjectiles(gameState, map, dt, fogState);
}

/**
 * Tick down kamikaze fuses and detonate any that hit zero. The renderer reads
 * `ship.tntFuse` directly to draw the red accelerating blink telegraph, so
 * nothing else needs to be set here. Iterates by id (collected up front) so
 * detonations can splice the ships array without skewing indices.
 */
function updateTNTFuses(gameState, dt, fogState) {
    const detonating = [];
    for (let i = 0; i < gameState.ships.length; i++) {
        const ship = gameState.ships[i];
        if (!ship.tntFuse || ship.tntFuse <= 0) continue;
        ship.tntFuse -= dt;
        if (ship.tntFuse <= 0) {
            ship.tntFuse = 0;
            detonating.push(ship.id);
        }
    }
    for (const id of detonating) {
        const idx = gameState.ships.findIndex(s => s.id === id);
        if (idx >= 0) detonateTNT(gameState, idx, fogState);
    }
}

/**
 * Process pending shots for ships with multi-shot capability
 * Similar to tower pending shots - fires staggered projectiles
 */
function processShipPendingShots(gameState, dt, fogState) {
    for (let i = 0; i < gameState.ships.length; i++) {
        const ship = gameState.ships[i];
        if (!ship.pendingShots || ship.pendingShots.length === 0) continue;

        for (let s = ship.pendingShots.length - 1; s >= 0; s--) {
            ship.pendingShots[s].delay -= dt;
            if (ship.pendingShots[s].delay <= 0) {
                const shot = ship.pendingShots[s];
                // Look up target based on type
                let target;
                if (shot.targetType === 'ship') {
                    target = gameState.ships[shot.targetIndex];
                } else if (shot.targetType === 'port') {
                    target = gameState.ports[shot.targetIndex];
                } else if (shot.targetType === 'tower') {
                    target = gameState.towers[shot.targetIndex];
                } else if (shot.targetType === 'settlement') {
                    target = gameState.settlements[shot.targetIndex];
                }

                if (target && (target.health === undefined || target.health > 0)) {
                    const aim = shot.targetType === 'ship'
                        ? predictTargetHex(target, LEAD_TIME)
                        : { q: target.q, r: target.r };
                    gameState.projectiles.push({
                        sourceShipIndex: i,
                        targetType: shot.targetType,
                        targetIndex: shot.targetIndex,
                        fromQ: ship.q,
                        fromR: ship.r,
                        toQ: aim.q,
                        toR: aim.r,
                        progress: 0,
                        damage: shot.damage,
                        speed: PROJECTILE_SPEED,
                    });
                    queueCannonSound(gameState, ship.q, ship.r);
                }
                ship.pendingShots.splice(s, 1);
            }
        }
    }
}

/**
 * Pirates in ATTACK state fire projectiles at their targets
 */
function handlePirateAttacks(gameState, dt, fogState) {
    const abilities = gameState.waveState?.enabledAbilities || {};
    for (let i = 0; i < gameState.ships.length; i++) {
        const ship = gameState.ships[i];
        if (!isPirateShip(ship) || ship.aiState !== 'attack') continue;

        // Decrement cooldowns
        ship.attackCooldown = Math.max(0, (ship.attackCooldown || 0) - dt);
        if (ship.burstCooldown > 0) {
            ship.burstCooldown = Math.max(0, ship.burstCooldown - dt);
        }

        const shipData = SHIPS[ship.type];

        // Pirate Broadside: cutters with the ability unlocked open with a volley
        // whenever it's ready and the target is in range. triggerBroadside
        // handles cooldown / range / hp-penalty gates internally.
        if (abilities.broadside && shipData?.burstAttack && ship.burstCooldown <= 0 && ship.aiTarget) {
            if (triggerBroadside(gameState, i, ship.aiTarget.type, ship.aiTarget.index)) {
                // Skip the standard volley this tick so the broadside reads cleanly.
                ship.attackCooldown = shipData.fireCooldown + (Math.random() - 0.5) * 0.04;
                continue;
            }
        }

        // Pirate TNT: a schooner that closes to attack range lights its fuse and
        // sails the rest of the way in as a kamikaze. The 3s telegraph gives the
        // player a window to kill it before the blast.
        if (abilities.tnt && shipData?.tntAttack && (!ship.tntFuse || ship.tntFuse <= 0)) {
            armTNT(gameState, i);
        }

        // Ready to fire?
        if (ship.attackCooldown <= 0 && ship.aiTarget) {
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
                const projectileCount = shipData.projectileCount || 1;
                const aim = ship.aiTarget.type === 'ship'
                    ? predictTargetHex(target, LEAD_TIME)
                    : { q: target.q, r: target.r };

                // Fire first shot immediately
                gameState.projectiles.push({
                    sourceShipIndex: i,
                    targetType: ship.aiTarget.type,
                    targetIndex: ship.aiTarget.index,
                    fromQ: ship.q,
                    fromR: ship.r,
                    toQ: aim.q,
                    toR: aim.r,
                    progress: 0,
                    damage: CANNON_DAMAGE,
                    speed: PROJECTILE_SPEED,
                });
                queueCannonSound(gameState, ship.q, ship.r);

                // Queue subsequent shots with stagger delay
                for (let p = 1; p < projectileCount; p++) {
                    if (!ship.pendingShots) ship.pendingShots = [];
                    ship.pendingShots.push({
                        targetType: ship.aiTarget.type,
                        targetIndex: ship.aiTarget.index,
                        damage: CANNON_DAMAGE,
                        delay: p * SHOT_STAGGER_DELAY,
                    });
                }

                // Reset cooldown using ship's fire rate (with micro variation to stagger volleys)
                ship.attackCooldown = shipData.fireCooldown + (Math.random() - 0.5) * 0.04;
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
 * Player ships automatically return fire when attacked by enemies (pirates or AI players)
 */
function handleAutoReturnFire(gameState) {
    // Find all enemy ships that are attacking player ships
    for (let attackerIndex = 0; attackerIndex < gameState.ships.length; attackerIndex++) {
        const attacker = gameState.ships[attackerIndex];

        // Check if this is an enemy ship with a target
        let targetShipIndex = null;

        if (isPirateShip(attacker) && attacker.aiState === 'attack' && attacker.aiTarget?.type === 'ship') {
            // Pirate attacking a ship
            targetShipIndex = attacker.aiTarget.index;
        } else if (attacker.owner?.startsWith('ai') && attacker.attackTarget?.type === 'ship') {
            // AI player ship attacking a ship
            targetShipIndex = attacker.attackTarget.index;
        }

        if (targetShipIndex === null) continue;

        const targetShip = gameState.ships[targetShipIndex];
        if (!targetShip) continue;

        // Only auto-return-fire for player ships being attacked
        if (isPirateShip(targetShip) || targetShip.owner?.startsWith('ai')) continue;

        // Skip ships that are building - they can't return fire
        if (isShipBuilding(targetShipIndex, gameState)) continue;

        // If target ship has no attack target and is idle, auto-target the attacker
        if (!targetShip.attackTarget && targetShip.waypoints.length === 0 && !targetShip.tradeRoute) {
            const shipData = SHIPS[targetShip.type];
            const attackDistance = shipData.attackDistance || 2;
            const dist = hexDistance(targetShip.q, targetShip.r, attacker.q, attacker.r);
            if (dist <= attackDistance) {
                // Close enough to return fire immediately
                targetShip.attackTarget = { type: 'ship', index: attackerIndex };
                // Only allow immediate fire if not on active cooldown
                if (!targetShip.attackCooldown || targetShip.attackCooldown <= 0) {
                    targetShip.attackCooldown = 0;
                }
            }
        }
    }
}

/**
 * Patrolling ships automatically detect and attack nearby enemies
 * Uses each ship's sightDistance for detection range
 * Now owner-aware: player ships attack pirates and AI ships, AI ships attack player ships
 * Performance: Uses spatial index for efficient enemy detection
 */
export function handlePatrolAutoAttack(gameState, map) {
    // Build spatial index if not already built (in case called outside updateCombat)
    const spatialIndex = shipSpatialIndex || buildShipSpatialIndex(gameState);

    for (let i = 0; i < gameState.ships.length; i++) {
        const ship = gameState.ships[i];
        if (isPirateShip(ship)) continue;  // Pirates use their own AI
        if (!ship.isPatrolling && !ship.guardMode) continue;  // Only patrol or guard mode ships auto-attack
        if (ship.attackTarget) continue;  // Already has a target

        // Skip if in chase cooldown - ship is ignoring enemies temporarily
        if (ship.chaseCooldownTimer > 0) continue;

        // Use ship's sightDistance for detection range
        const detectRange = SHIPS[ship.type].sightDistance;
        const shipOwner = ship.owner || 'player';

        // Find nearest enemy within detection range using spatial index
        let nearestEnemy = null;
        let nearestDist = Infinity;

        const candidateIndices = getShipsInRange(spatialIndex, gameState, ship.q, ship.r, detectRange);
        for (const j of candidateIndices) {
            if (j === i) continue;  // Skip self
            const target = gameState.ships[j];
            if (!target) continue;  // Skip destroyed ships (stale index)
            // Skip friendly ships
            if (target.owner === shipOwner) continue;
            // Pirates are always enemies to player ships
            if (isPirateShip(target) && shipOwner === 'player') {
                // Target pirate
            } else if (target.owner && target.owner !== shipOwner) {
                // Target enemy-owned ship
            } else {
                continue;  // Not an enemy
            }

            const dist = hexDistance(ship.q, ship.r, target.q, target.r);
            if (dist <= detectRange && dist < nearestDist) {
                nearestDist = dist;
                nearestEnemy = { index: j };
            }
        }

        if (nearestEnemy) {
            // Start chase - track where it began
            ship.chaseStartHex = { q: ship.q, r: ship.r };
            ship.chaseDistanceTraveled = 0;

            ship.attackTarget = { type: 'ship', index: nearestEnemy.index };
            // Clear waypoints to stop patrol movement - we'll chase the target
            ship.waypoints = [];
            // Don't null path directly - let movement system handle transition smoothly
            // to prevent visual snapping mid-movement
            continue;
        }

        // Attack-move ships (guardMode) also seek enemy structures so they cascade
        // through a base after destroying their initial target
        if (ship.guardMode) {
            const shipData = SHIPS[ship.type];
            const attackDistance = shipData.attackDistance || 2;
            let nearestStructure = null;
            let nearestStructureDist = Infinity;

            const scanStructures = (list, type) => {
                for (let idx = 0; idx < list.length; idx++) {
                    const s = list[idx];
                    if (!s.owner || s.owner === shipOwner) continue;
                    const d = hexDistance(ship.q, ship.r, s.q, s.r);
                    if (d > detectRange) continue;
                    if (d >= nearestStructureDist) continue;
                    // Must have a water tile within attack range so ship can engage
                    if (!findNearestWaterInRange(map, s.q, s.r, attackDistance)) continue;
                    nearestStructureDist = d;
                    nearestStructure = { type, index: idx };
                }
            };
            scanStructures(gameState.ports, 'port');
            scanStructures(gameState.settlements, 'settlement');
            scanStructures(gameState.towers, 'tower');

            if (nearestStructure) {
                ship.chaseStartHex = { q: ship.q, r: ship.r };
                ship.chaseDistanceTraveled = 0;
                ship.attackTarget = nearestStructure;
                ship.waypoints = [];
                continue;
            }
        }

        // Check if nearby friendly structures are under attack and defend them
        const ATTACKER_TIMEOUT = 3000; // 3 seconds - attack must be recent
        let attackerToDefend = null;
        let closestStructureDist = Infinity;

        // Check settlements
        for (const settlement of gameState.settlements) {
            if (settlement.owner !== shipOwner) continue;
            if (!settlement.lastAttacker) continue;
            if (Date.now() - settlement.lastAttacker.timestamp > ATTACKER_TIMEOUT) {
                settlement.lastAttacker = null;
                continue;
            }
            const distToSettlement = hexDistance(ship.q, ship.r, settlement.q, settlement.r);
            if (distToSettlement <= detectRange && distToSettlement < closestStructureDist) {
                const attackerShip = gameState.ships[settlement.lastAttacker.index];
                // Check if attacker still exists and is an enemy (different owner or pirate)
                if (attackerShip && (isPirateShip(attackerShip) || attackerShip.owner !== shipOwner)) {
                    attackerToDefend = settlement.lastAttacker;
                    closestStructureDist = distToSettlement;
                }
            }
        }

        // Check ports
        for (const port of gameState.ports) {
            if (port.owner !== shipOwner) continue;
            if (!port.lastAttacker) continue;
            if (Date.now() - port.lastAttacker.timestamp > ATTACKER_TIMEOUT) {
                port.lastAttacker = null;
                continue;
            }
            const distToPort = hexDistance(ship.q, ship.r, port.q, port.r);
            if (distToPort <= detectRange && distToPort < closestStructureDist) {
                const attackerShip = gameState.ships[port.lastAttacker.index];
                // Check if attacker still exists and is an enemy (different owner or pirate)
                if (attackerShip && (isPirateShip(attackerShip) || attackerShip.owner !== shipOwner)) {
                    attackerToDefend = port.lastAttacker;
                    closestStructureDist = distToPort;
                }
            }
        }

        // Check towers
        for (const tower of gameState.towers) {
            if (tower.owner !== shipOwner) continue;
            if (!tower.lastAttacker) continue;
            if (Date.now() - tower.lastAttacker.timestamp > ATTACKER_TIMEOUT) {
                tower.lastAttacker = null;
                continue;
            }
            const distToTower = hexDistance(ship.q, ship.r, tower.q, tower.r);
            if (distToTower <= detectRange && distToTower < closestStructureDist) {
                const attackerShip = gameState.ships[tower.lastAttacker.index];
                // Check if attacker still exists and is an enemy (different owner or pirate)
                if (attackerShip && (isPirateShip(attackerShip) || attackerShip.owner !== shipOwner)) {
                    attackerToDefend = tower.lastAttacker;
                    closestStructureDist = distToTower;
                }
            }
        }

        // Target the attacker if we found one
        if (attackerToDefend) {
            // Start chase - track where it began
            ship.chaseStartHex = { q: ship.q, r: ship.r };
            ship.chaseDistanceTraveled = 0;

            ship.attackTarget = { type: 'ship', index: attackerToDefend.index };
            ship.waypoints = [];
            // Don't null path - let movement system handle transition smoothly
        }
    }
}

/**
 * Patrolling ships with attack targets navigate toward the target
 * Updates waypoint to target's current position each frame
 * Supports chasing ships, ports, settlements, and towers
 * Enforces maxChaseDistance limit - gives up and returns to patrol if exceeded
 */
function handlePatrolChase(gameState, map) {
    const CHASE_COOLDOWN = 5;  // Seconds before can chase again after giving up

    for (const ship of gameState.ships) {
        if (isPirateShip(ship)) continue;
        if (!ship.isPatrolling && !ship.guardMode) continue;
        if (!ship.attackTarget) continue;

        const shipData = SHIPS[ship.type];
        const attackDistance = shipData.attackDistance || 2;
        const maxChaseDistance = shipData.maxChaseDistance || 10;

        // Check if chase limit reached
        if (ship.chaseDistanceTraveled >= maxChaseDistance) {
            // Give up chase
            ship.attackTarget = null;
            ship.chaseStartHex = null;
            ship.chaseDistanceTraveled = 0;
            ship.chaseCooldownTimer = CHASE_COOLDOWN;

            // Restore patrol route if patrolling
            if (ship.isPatrolling && ship.patrolRoute && ship.patrolRoute.length > 0) {
                ship.waypoints = [...ship.patrolRoute];
                ship.path = null;
            }
            continue;
        }

        // Look up target based on type
        let target;
        const targetType = ship.attackTarget.type || 'ship';
        if (targetType === 'ship') {
            target = gameState.ships[ship.attackTarget.index];
        } else if (targetType === 'port') {
            target = gameState.ports[ship.attackTarget.index];
        } else if (targetType === 'tower') {
            target = gameState.towers[ship.attackTarget.index];
        } else if (targetType === 'settlement') {
            target = gameState.settlements[ship.attackTarget.index];
        }

        if (!target) continue;  // Target gone, will be handled in handlePlayerAttacks

        const dist = hexDistance(ship.q, ship.r, target.q, target.r);

        // If not in attack range, set waypoint to chase
        if (dist > attackDistance) {
            // Determine waypoint - for structures on land, find water within attack range
            let waypointQ = target.q;
            let waypointR = target.r;
            if (targetType !== 'ship') {
                const waterTile = findNearestWaterInRange(map, target.q, target.r, attackDistance);
                if (waterTile) {
                    waypointQ = waterTile.q;
                    waypointR = waterTile.r;
                }
            }

            // Only update waypoint if target moved significantly (>2 hexes)
            // This prevents path thrashing when chasing moving targets
            const waypointDiff = ship.waypoints.length > 0
                ? hexDistance(ship.waypoints[0].q, ship.waypoints[0].r, waypointQ, waypointR)
                : Infinity;

            if (ship.waypoints.length === 0 || waypointDiff > 2) {
                ship.waypoints = [{ q: waypointQ, r: waypointR }];
                // Only force path recalculation if not mid-movement
                // This prevents visual snapping during smooth movement
                if (ship.moveProgress === 0) {
                    ship.path = null;
                }
            }
        } else {
            // In range, stop moving to fire
            ship.waypoints = [];
            // Only null path if not mid-movement to prevent snapping
            if (ship.moveProgress === 0) {
                ship.path = null;
            }
        }
    }
}

/**
 * Player ships with attack targets fire at enemies when in range
 * Also decrements cooldowns for ALL player ships (even when not attacking)
 * Supports targeting ships, ports, settlements, and towers
 */
function handlePlayerAttacks(gameState, dt, fogState) {
    for (let i = 0; i < gameState.ships.length; i++) {
        const ship = gameState.ships[i];
        if (isPirateShip(ship)) continue;  // Skip pirates (handled by handlePirateAttacks)
        if (isShipBuilding(i, gameState)) continue;  // Can't attack while building
        if (ship.repair) continue;  // Can't attack while repairing

        const shipData = SHIPS[ship.type];
        const attackDistance = shipData.attackDistance || 2;

        // Always decrement cooldown for player ships (even when not in combat)
        if (ship.attackCooldown > 0) {
            ship.attackCooldown = Math.max(0, ship.attackCooldown - dt);
        }

        // Decrement special burst-attack cooldown (e.g. Cutter Broadside)
        if (ship.burstCooldown > 0) {
            ship.burstCooldown = Math.max(0, ship.burstCooldown - dt);
        }

        // Decrement speed-boost timers (active duration and recharge cooldown)
        if (ship.boostCooldown > 0) {
            ship.boostCooldown = Math.max(0, ship.boostCooldown - dt);
        }
        if (ship.boostTimer > 0) {
            ship.boostTimer = Math.max(0, ship.boostTimer - dt);
        }

        // Decrement chase cooldown timer
        if (ship.chaseCooldownTimer > 0) {
            ship.chaseCooldownTimer = Math.max(0, ship.chaseCooldownTimer - dt);
        }

        // Drain queued broadside: when the cutter reaches range and is ready,
        // fire the volley the player ordered from afar. triggerBroadside
        // handles the range / cooldown / health gates; we only clear on success.
        if (ship.pendingBroadside) {
            const pb = ship.pendingBroadside;
            if (triggerBroadside(gameState, i, pb.type, pb.index)) {
                ship.pendingBroadside = null;
            }
        }

        // Skip firing logic if not attacking
        if (!ship.attackTarget) continue;

        // Look up target based on type
        let target;
        const targetType = ship.attackTarget.type || 'ship';
        if (targetType === 'ship') {
            target = gameState.ships[ship.attackTarget.index];
        } else if (targetType === 'port') {
            target = gameState.ports[ship.attackTarget.index];
        } else if (targetType === 'tower') {
            target = gameState.towers[ship.attackTarget.index];
        } else if (targetType === 'settlement') {
            target = gameState.settlements[ship.attackTarget.index];
        }

        if (!target) {
            ship.attackTarget = null;  // Target destroyed
            // Clear chase state
            ship.chaseStartHex = null;
            ship.chaseDistanceTraveled = 0;
            // Resume patrol if ship was patrolling
            if (ship.isPatrolling && ship.patrolRoute.length > 0) {
                ship.waypoints = ship.patrolRoute.map(wp => ({ q: wp.q, r: wp.r }));
            }
            continue;
        }

        const dist = hexDistance(ship.q, ship.r, target.q, target.r);
        if (dist > attackDistance) continue;  // Not in range yet

        if (ship.attackCooldown <= 0) {
            const projectileCount = shipData.projectileCount || 1;
            const aim = targetType === 'ship'
                ? predictTargetHex(target, LEAD_TIME)
                : { q: target.q, r: target.r };

            // Fire first shot immediately
            gameState.projectiles.push({
                sourceShipIndex: i,
                targetType: targetType,
                targetIndex: ship.attackTarget.index,
                fromQ: ship.q,
                fromR: ship.r,
                toQ: aim.q,
                toR: aim.r,
                progress: 0,
                damage: CANNON_DAMAGE,
                speed: PROJECTILE_SPEED,
            });
            queueCannonSound(gameState, ship.q, ship.r);

            // Queue subsequent shots with stagger delay
            for (let p = 1; p < projectileCount; p++) {
                if (!ship.pendingShots) ship.pendingShots = [];
                ship.pendingShots.push({
                    targetType: targetType,
                    targetIndex: ship.attackTarget.index,
                    damage: CANNON_DAMAGE,
                    delay: p * SHOT_STAGGER_DELAY,
                });
            }

            // Reset cooldown (with micro variation to stagger volleys). A speed
            // boost shortens the cooldown by its fire-rate multiplier.
            let fireCooldown = shipData.fireCooldown;
            if (ship.boostTimer > 0 && shipData.speedBoost?.fireRateMult) {
                fireCooldown /= shipData.speedBoost.fireRateMult;
            }
            ship.attackCooldown = fireCooldown + (Math.random() - 0.5) * 0.04;
        }
    }
}

/**
 * Trigger a Broadside-style burst attack from one ship at a single target.
 * Fires the first shot immediately and queues the rest in ship.pendingShots
 * with staggered delays. Sets ship.burstCooldown.
 *
 * Returns true if the burst was fired, false if the ship is ineligible (no
 * burstAttack config, on cooldown, target missing, or out of range).
 */
export function triggerBroadside(gameState, shipIndex, targetType, targetIndex) {
    const ship = gameState.ships[shipIndex];
    if (!ship) return false;
    const shipData = SHIPS[ship.type];
    const burstCfg = shipData && shipData.burstAttack;
    if (!burstCfg) return false;
    if (ship.burstCooldown > 0) return false;

    // HP penalty gate: the recoil/strain damage can't kill the firing ship.
    // A cutter at <=hpPenalty HP can't volley — repair first.
    const hpPenalty = burstCfg.hpPenalty || 0;
    if (hpPenalty > 0 && ship.health <= hpPenalty) return false;

    let target;
    if (targetType === 'ship') {
        target = gameState.ships[targetIndex];
    } else if (targetType === 'port') {
        target = gameState.ports[targetIndex];
    } else if (targetType === 'tower') {
        target = gameState.towers[targetIndex];
    } else if (targetType === 'settlement') {
        target = gameState.settlements[targetIndex];
    }
    if (!target) return false;
    if (target.health !== undefined && target.health <= 0) return false;

    const attackDistance = shipData.attackDistance || 2;
    if (hexDistance(ship.q, ship.r, target.q, target.r) > attackDistance) return false;

    const aim = targetType === 'ship'
        ? predictTargetHex(target, LEAD_TIME)
        : { q: target.q, r: target.r };

    // Fire first shot immediately
    gameState.projectiles.push({
        sourceShipIndex: shipIndex,
        targetType,
        targetIndex,
        fromQ: ship.q,
        fromR: ship.r,
        toQ: aim.q,
        toR: aim.r,
        progress: 0,
        damage: CANNON_DAMAGE,
        speed: PROJECTILE_SPEED,
    });
    queueCannonSound(gameState, ship.q, ship.r);

    // Queue remaining shots with stagger delay
    if (!ship.pendingShots) ship.pendingShots = [];
    for (let i = 1; i < burstCfg.shots; i++) {
        ship.pendingShots.push({
            targetType,
            targetIndex,
            damage: CANNON_DAMAGE,
            delay: i * burstCfg.staggerDelay,
        });
    }

    ship.burstCooldown = burstCfg.cooldown;

    // Apply self-damage penalty for firing the volley
    if (hpPenalty > 0) {
        ship.health = Math.max(1, ship.health - hpPenalty);
        ship.hitFlash = HIT_FLASH_DURATION;
    }
    return true;
}

/**
 * Activate a ship's timed speed boost (Cutter "Full Sail"): a stim-pack-style
 * buff that multiplies movement speed and fire rate for a fixed duration at a
 * one-time HP cost, then goes on cooldown. Instant self-cast — no target.
 *
 * The multipliers are applied where speed/fire-rate are read (shipMovement.js
 * and handlePlayerAttacks) by checking ship.boostTimer > 0; this only sets the
 * timers and pays the HP cost.
 *
 * Returns true if activated, false if the ship is ineligible (no speedBoost
 * config, on cooldown, already boosting, or too damaged to pay the HP cost).
 */
export function triggerSpeedBoost(gameState, shipIndex) {
    const ship = gameState.ships[shipIndex];
    if (!ship) return false;
    const cfg = SHIPS[ship.type] && SHIPS[ship.type].speedBoost;
    if (!cfg) return false;
    if (ship.boostCooldown > 0) return false;  // Still recharging
    if (ship.boostTimer > 0) return false;      // Already boosting (no stacking/refresh)

    // HP penalty gate: the strain damage can't kill the ship — repair first.
    const hpPenalty = cfg.hpPenalty || 0;
    if (hpPenalty > 0 && ship.health <= hpPenalty) return false;

    ship.boostTimer = cfg.duration;
    ship.boostCooldown = cfg.cooldown;

    if (hpPenalty > 0) {
        ship.health = Math.max(1, ship.health - hpPenalty);
        ship.hitFlash = HIT_FLASH_DURATION;
    }
    return true;
}

/**
 * Arm a schooner's TNT fuse. The ship keeps obeying movement/attack orders
 * while the fuse burns down — pilot it into a target and let it cook.
 * Returns true if armed, false if the ship can't carry TNT or is already armed.
 */
export function armTNT(gameState, shipIndex) {
    const ship = gameState.ships[shipIndex];
    if (!ship) return false;
    const shipData = SHIPS[ship.type];
    const tntCfg = shipData && shipData.tntAttack;
    if (!tntCfg) return false;
    if (ship.tntFuse > 0) return false;  // Already lit
    ship.tntFuse = tntCfg.fuseDuration;
    return true;
}

/**
 * Detonate a kamikaze schooner: massive explosion, AoE damage to every entity
 * in radius (linear falloff to minDamageFactor at the edge) — friendly units
 * INCLUDED for risk/reward. The bomber is destroyed last. Destruction effects
 * bypass fog so the player always sees what they just blew up, even if the
 * schooner that was providing vision is gone after the blast.
 */
function detonateTNT(gameState, shipIndex, fogState) {
    const ship = gameState.ships[shipIndex];
    if (!ship) return;
    const shipData = SHIPS[ship.type];
    const tntCfg = shipData && shipData.tntAttack;
    if (!tntCfg) return;

    const epicenterQ = ship.q;
    const epicenterR = ship.r;
    // Blast radius scales with the ship's cannon range: a schooner reaches 5,
    // so its kegs throw shrapnel ~half as far (rounded). New TNT-capable hulls
    // pick up a proportional radius for free.
    const radius = Math.max(1, Math.round((shipData.attackDistance || 2) / 2));
    const maxDamage = tntCfg.damage;
    const minFactor = tntCfg.minDamageFactor || 0.3;
    const shipId = ship.id;

    // Big boom: oversized explosion + impact sound. The `massive` flag is
    // read by the explosion renderer (bigger radius, longer life) and by
    // gameScene's camera-shake clamp (stronger shake). `ignoreFog` keeps the
    // epicenter visible even if it slips out of vision after the bomber dies.
    gameState.shipExplosions.push({
        q: epicenterQ,
        r: epicenterR,
        age: 0,
        duration: 1.6,
        massive: true,
        ignoreFog: true,
    });

    // Secondary blasts: a cluster of smaller explosions scattered around the
    // epicenter with staggered delays. `silent: true` keeps the camera shake
    // on the main blast (no chain-stacked shake from each pop).
    const SECONDARY_COUNT = 5;
    for (let i = 0; i < SECONDARY_COUNT; i++) {
        const angle = Math.random() * Math.PI * 2;
        const dist = HEX_SIZE * (0.5 + Math.random() * 1.1);
        gameState.shipExplosions.push({
            q: epicenterQ,
            r: epicenterR,
            offsetX: Math.cos(angle) * dist,
            offsetY: Math.sin(angle) * dist,
            age: 0,
            duration: 0.7 + Math.random() * 0.5,
            scale: 0.9 + Math.random() * 0.9,
            delay: 0.05 + Math.random() * 0.4,
            silent: true,
            ignoreFog: true,
        });
    }
    queueImpactSound(gameState, epicenterQ, epicenterR);

    // Damage falloff: 1.0 at center, linear down to minFactor at edge
    const damageAt = (dist) => {
        if (dist <= 0) return maxDamage;
        const t = Math.min(dist / Math.max(radius, 1), 1);
        const factor = 1 - (1 - minFactor) * t;
        return Math.max(1, Math.round(maxDamage * factor));
    };

    // Collect victims by id so we can re-resolve indices after each splice.
    // Friendly fire is intentional — the bomber is the only entity spared.
    const victims = [];
    for (const other of gameState.ships) {
        if (other.id === shipId) continue;  // Don't damage self twice
        const dist = hexDistance(epicenterQ, epicenterR, other.q, other.r);
        if (dist > radius) continue;
        victims.push({ type: 'ship', id: other.id, damage: damageAt(dist) });
    }
    for (const port of gameState.ports) {
        const dist = hexDistance(epicenterQ, epicenterR, port.q, port.r);
        if (dist > radius) continue;
        victims.push({ type: 'port', id: port.id, damage: damageAt(dist) });
    }
    for (const tower of gameState.towers) {
        const dist = hexDistance(epicenterQ, epicenterR, tower.q, tower.r);
        if (dist > radius) continue;
        victims.push({ type: 'tower', id: tower.id, damage: damageAt(dist) });
    }
    for (const settlement of gameState.settlements) {
        const dist = hexDistance(epicenterQ, epicenterR, settlement.q, settlement.r);
        if (dist > radius) continue;
        victims.push({ type: 'settlement', id: settlement.id, damage: damageAt(dist) });
    }

    for (const v of victims) {
        const list = v.type === 'ship' ? gameState.ships
            : v.type === 'port' ? gameState.ports
            : v.type === 'tower' ? gameState.towers
            : gameState.settlements;
        const idx = list.findIndex(e => e.id === v.id);
        if (idx < 0) continue;
        applyDamage(gameState, v.type, idx, v.damage, fogState, null, true /* ignoreFog */);
    }

    // The bomber goes last — its array index may have shifted if a lower-index
    // ship died in the blast, so re-resolve by id.
    const selfIdx = gameState.ships.findIndex(s => s.id === shipId);
    if (selfIdx >= 0) {
        destroyShip(gameState, selfIdx, fogState, true /* ignoreFog */);
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
                        const aim = predictTargetHex(target, LEAD_TIME);
                        gameState.projectiles.push({
                            sourceTowerIndex: i,
                            targetType: 'ship',
                            targetIndex: shot.targetIndex,
                            fromQ: tower.q,
                            fromR: tower.r,
                            toQ: aim.q,
                            toR: aim.r,
                            progress: 0,
                            damage: shot.damage,
                            speed: PROJECTILE_SPEED,
                            projectileType: shot.projectileType,
                        });
                        queueTowerFireSound(gameState, tower.q, tower.r, shot.projectileType);
                    }
                    tower.pendingShots.splice(s, 1);
                }
            }
        }

        // Find all enemies in range using spatial index, sorted by distance
        // Tower owner determines who is an enemy
        const towerOwner = tower.owner || 'player';
        const enemiesInRange = [];

        // Use spatial index to only check nearby ships
        const candidateIndices = getShipsInRange(shipSpatialIndex, gameState, tower.q, tower.r, attackRange);
        for (const j of candidateIndices) {
            const ship = gameState.ships[j];
            // Skip friendly ships
            if (ship.owner === towerOwner) continue;
            // Pirates are enemies to all towers
            if (isPirateShip(ship)) {
                // Target pirate
            } else if (ship.owner && ship.owner !== towerOwner) {
                // Target enemy-owned ship
            } else {
                continue;  // Not an enemy
            }

            const dist = hexDistance(tower.q, tower.r, ship.q, ship.r);
            if (dist <= attackRange) {
                enemiesInRange.push({ index: j, ship, dist });
            }
        }
        enemiesInRange.sort((a, b) => a.dist - b.dist);

        // Fire projectiles if ready (smart targeting for multi-shot towers)
        if (enemiesInRange.length > 0 && tower.attackCooldown <= 0) {
            for (let p = 0; p < projectileCount; p++) {
                // Target different enemies if available, otherwise double up on nearest
                const targetIdx = Math.min(p, enemiesInRange.length - 1);
                const target = enemiesInRange[targetIdx];

                if (p === 0) {
                    // First shot fires immediately
                    const aim = predictTargetHex(target.ship, LEAD_TIME);
                    gameState.projectiles.push({
                        sourceTowerIndex: i,
                        targetType: 'ship',
                        targetIndex: target.index,
                        fromQ: tower.q,
                        fromR: tower.r,
                        toQ: aim.q,
                        toR: aim.r,
                        progress: 0,
                        damage: towerData.damage,
                        speed: PROJECTILE_SPEED,
                        projectileType: towerData.projectileType,
                    });
                    queueTowerFireSound(gameState, tower.q, tower.r, towerData.projectileType);
                } else {
                    // Queue subsequent shots with stagger delay (per-tower override or default)
                    if (!tower.pendingShots) tower.pendingShots = [];
                    const staggerDelay = towerData.staggerDelay ?? SHOT_STAGGER_DELAY;
                    tower.pendingShots.push({
                        targetIndex: target.index,
                        damage: towerData.damage,
                        delay: p * staggerDelay,
                        projectileType: towerData.projectileType,
                    });
                }
            }
            // Reset cooldown (with micro variation to stagger volleys)
            tower.attackCooldown = towerData.fireCooldown + (Math.random() - 0.5) * 0.04;
        }
    }
}

/**
 * Move projectiles and apply damage when they hit
 * Uses position-based hit detection with O(1) lookup via entityPositionMap
 * Now owner-aware: projectiles only hit entities owned by enemies
 */
function updateProjectiles(gameState, map, dt, fogState) {
    for (let i = gameState.projectiles.length - 1; i >= 0; i--) {
        const proj = gameState.projectiles[i];
        proj.progress += proj.speed * dt;

        if (proj.progress >= 1) {
            // Determine what faction fired this projectile
            const sourceShip = proj.sourceShipIndex !== undefined ? gameState.ships[proj.sourceShipIndex] : null;
            const sourceTower = proj.sourceTowerIndex !== undefined ? gameState.towers[proj.sourceTowerIndex] : null;

            // Determine source owner
            let sourceOwner = 'player';  // Default
            if (sourceShip) {
                sourceOwner = sourceShip.owner || (sourceShip.type === 'pirate' ? 'pirate' : 'player');
            } else if (sourceTower) {
                sourceOwner = sourceTower.owner || 'player';
            }

            // Find any valid target at the destination hex using O(1) lookup
            let hitType = null;
            let hitIndex = -1;

            const destKey = hexKey(proj.toQ, proj.toR);
            const entitiesAtDest = entityPositionMap.get(destKey);

            if (entitiesAtDest) {
                // Check ships at destination
                for (const { index, entity: ship } of entitiesAtDest.ships) {
                    const targetOwner = ship.owner || (ship.type === 'pirate' ? 'pirate' : 'player');
                    if (targetOwner !== sourceOwner) {
                        hitType = 'ship';
                        hitIndex = index;
                        break;
                    }
                }

                // Check ports at destination
                if (hitIndex === -1) {
                    for (const { index, entity: port } of entitiesAtDest.ports) {
                        const targetOwner = port.owner || 'player';
                        if (targetOwner !== sourceOwner) {
                            hitType = 'port';
                            hitIndex = index;
                            break;
                        }
                    }
                }

                // Check towers at destination
                if (hitIndex === -1) {
                    for (const { index, entity: tower } of entitiesAtDest.towers) {
                        const targetOwner = tower.owner || 'player';
                        if (targetOwner !== sourceOwner) {
                            hitType = 'tower';
                            hitIndex = index;
                            break;
                        }
                    }
                }

                // Check settlements at destination
                if (hitIndex === -1) {
                    for (const { index, entity: settlement } of entitiesAtDest.settlements) {
                        const targetOwner = settlement.owner || 'player';
                        if (targetOwner !== sourceOwner) {
                            hitType = 'settlement';
                            hitIndex = index;
                            break;
                        }
                    }
                }
            }

            const attackerInfo = proj.sourceShipIndex !== undefined && proj.sourceShipIndex >= 0
                ? { type: 'ship', index: proj.sourceShipIndex }
                : null;

            if (hitIndex !== -1) {
                // Hit! Apply damage to whatever is at the destination
                applyDamage(gameState, hitType, hitIndex, proj.damage, fogState, attackerInfo);
                queueImpactSound(gameState, proj.toQ, proj.toR);
            } else {
                // Miss — check splash against the intended ship target. Gives
                // partial credit when prediction was off by a hex so chasing
                // a zigzagging cutter still chips away at it.
                if (proj.targetType === 'ship' && proj.targetIndex >= 0) {
                    const intended = gameState.ships[proj.targetIndex];
                    if (intended && intended.health > 0) {
                        const targetOwner = intended.owner || (intended.type === 'pirate' ? 'pirate' : 'player');
                        if (targetOwner !== sourceOwner) {
                            const dist = hexDistance(proj.toQ, proj.toR, intended.q, intended.r);
                            if (dist <= SPLASH_RADIUS) {
                                const splashDmg = Math.max(1, Math.round(proj.damage * SPLASH_DAMAGE_FACTOR));
                                applyDamage(gameState, 'ship', proj.targetIndex, splashDmg, fogState, attackerInfo);
                                queueImpactSound(gameState, proj.toQ, proj.toR);
                            }
                        }
                    }
                }
                // Water splash at the impact hex regardless of splash damage —
                // conveys near-miss and keeps the visual consistent. Skip on
                // land tiles (e.g. follow-up shots at a tower that's already
                // been destroyed) — a water ring on dirt looks silly.
                const impactTile = map.tiles.get(hexKey(proj.toQ, proj.toR));
                if (isWater(impactTile)) {
                    gameState.waterSplashes.push({
                        q: proj.toQ,
                        r: proj.toR,
                        age: 0,
                        duration: 0.5,
                    });
                }
            }

            gameState.projectiles.splice(i, 1);
        }
    }
}

// Duration of hit flash effect in seconds
const HIT_FLASH_DURATION = 0.15;

/**
 * Apply damage to a target, destroying it if health reaches 0
 * @param {Object} attackerInfo - Optional info about the attacker { type: 'ship', index: number }
 */
function applyDamage(gameState, targetType, targetIndex, damage, fogState, attackerInfo = null, ignoreFog = false) {
    let target;
    if (targetType === 'ship') {
        target = gameState.ships[targetIndex];
    } else if (targetType === 'port') {
        target = gameState.ports[targetIndex];
    } else if (targetType === 'tower') {
        target = gameState.towers[targetIndex];
    } else if (targetType === 'settlement') {
        target = gameState.settlements[targetIndex];
    }

    if (!target) return; // Target already destroyed

    target.health -= damage;
    target.hitFlash = HIT_FLASH_DURATION; // Trigger flash effect

    // Track attacker on structures for defensive AI responses
    if (targetType !== 'ship' && attackerInfo) {
        target.lastAttacker = {
            type: attackerInfo.type,
            index: attackerInfo.index,
            timestamp: Date.now()
        };
    }

    // Notify AI when their units are attacked (increases threat level)
    const targetOwner = target.owner || 'player';
    if (isAIOwner(targetOwner)) {
        notifyAIAttacked(gameState, targetOwner);
    }

    // Track attacks on player structures for minimap alerts
    // Only track ports, towers, and settlements (not ships)
    if (targetType !== 'ship' && targetOwner === 'player') {
        const key = hexKey(target.q, target.r);
        gameState.attackedStructures.set(key, {
            timestamp: Date.now(),
            q: target.q,
            r: target.r,
            type: targetType,
        });
    }

    if (target.health <= 0) {
        if (targetType === 'ship') {
            destroyShip(gameState, targetIndex, fogState, ignoreFog);
        } else if (targetType === 'port') {
            destroyPort(gameState, targetIndex, fogState, ignoreFog);
        } else if (targetType === 'tower') {
            destroyTower(gameState, targetIndex, fogState, ignoreFog);
        } else if (targetType === 'settlement') {
            destroySettlement(gameState, targetIndex, fogState, ignoreFog);
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
function spawnDestructionEffects(gameState, q, r, unitType, buildingType = null, ignoreFog = false) {
    // Spawn explosion (same for all unit types)
    gameState.shipExplosions.push({
        q,
        r,
        age: 0,
        duration: 1.0,
        ignoreFog,
    });

    // Determine debris type and location type
    const isWoodDebris = unitType === 'ship' || buildingType === 'dock' || unitType === 'settlement';
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
        ignoreFog,
    });
}

/**
 * Potentially spawn loot drop when a pirate is destroyed
 */
function spawnLootDrop(gameState, q, r) {
    if (Math.random() > LOOT_DROP_CHANCE) return;

    // Random amount between min and max (inclusive)
    const amount = Math.floor(Math.random() * (LOOT_MAX_AMOUNT - LOOT_MIN_AMOUNT + 1)) + LOOT_MIN_AMOUNT;

    gameState.lootDrops.push({
        q,
        r,
        amount,
        age: 0,
        duration: LOOT_DURATION,
    });
}

/**
 * Remove a ship and clean up all references to it
 */
function destroyShip(gameState, shipIndex, fogState, ignoreFog = false) {
    const ship = gameState.ships[shipIndex];
    if (!ship) return;

    spawnDestructionEffects(gameState, ship.q, ship.r, 'ship', null, ignoreFog);

    // Mark fog dirty if player ship destroyed (affects vision)
    if (!isPirateShip(ship) && fogState) {
        markVisibilityDirty(fogState);
    }

    // Queue pirate respawn and increment kill counter
    if (isPirateShip(ship)) {
        gameState.pirateKills++;

        // Chance to drop loot
        spawnLootDrop(gameState, ship.q, ship.r);

        // In sandbox/versus mode, pirates respawn after a cooldown
        // In defend mode, pirates don't respawn (waves handle spawning)
        if (!gameState.scenario || gameState.scenario.gameMode !== 'defend') {
            const respawnDelay = gameState.scenario?.pirateConfig?.respawnDelay || PIRATE_RESPAWN_COOLDOWN;
            const spawnAtCenter = gameState.scenario?.pirateConfig?.spawnAtCenter || false;
            gameState.pirateRespawnQueue.push({ timer: respawnDelay, spawnAtCenter });
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
function destroyPort(gameState, portIndex, fogState, ignoreFog = false) {
    const port = gameState.ports[portIndex];
    if (!port) return;

    spawnDestructionEffects(gameState, port.q, port.r, 'port', port.type, ignoreFog);

    // Mark fog dirty (port was providing vision)
    if (fogState) {
        markVisibilityDirty(fogState);
    }

    // Remove from array
    gameState.ports.splice(portIndex, 1);

    // Clean up references
    cleanupStaleReferences(gameState, 'port', portIndex);
}

/**
 * Remove a tower and clean up all references to it
 */
function destroyTower(gameState, towerIndex, fogState, ignoreFog = false) {
    const tower = gameState.towers[towerIndex];
    if (!tower) return;

    spawnDestructionEffects(gameState, tower.q, tower.r, 'tower', null, ignoreFog);

    // Mark fog dirty (tower was providing vision)
    if (fogState) {
        markVisibilityDirty(fogState);
    }

    // Remove from array
    gameState.towers.splice(towerIndex, 1);

    // Clean up references
    cleanupStaleReferences(gameState, 'tower', towerIndex);
}

/**
 * Remove a settlement and clean up all references to it
 */
function destroySettlement(gameState, settlementIndex, fogState, ignoreFog = false) {
    const settlement = gameState.settlements[settlementIndex];
    if (!settlement) return;

    spawnDestructionEffects(gameState, settlement.q, settlement.r, 'settlement', null, ignoreFog);

    // Mark fog dirty (settlement was providing vision)
    if (fogState) {
        markVisibilityDirty(fogState);
    }

    // Remove from array
    gameState.settlements.splice(settlementIndex, 1);

    // Clean up references
    cleanupStaleReferences(gameState, 'settlement', settlementIndex);
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
                ship.waypoints = [];  // Clear waypoints so patrol generates a new one
                ship.path = null;     // Clear path to force recalculation
            } else if (ship.aiTarget.index > removedIndex) {
                ship.aiTarget.index--;
            }
        }
    }

    // Fix player ship attackTarget references (for any removed entity type)
    for (const ship of gameState.ships) {
        if (ship.attackTarget && ship.attackTarget.type === removedType) {
            if (ship.attackTarget.index === removedIndex) {
                ship.attackTarget = null;
                // Clear chase state
                ship.chaseStartHex = null;
                ship.chaseDistanceTraveled = 0;
                // Resume patrol if ship was patrolling
                if (ship.isPatrolling && ship.patrolRoute.length > 0) {
                    ship.waypoints = ship.patrolRoute.map(wp => ({ q: wp.q, r: wp.r }));
                }
            } else if (ship.attackTarget.index > removedIndex) {
                ship.attackTarget.index--;
            }
        }
        if (ship.pendingBroadside && ship.pendingBroadside.type === removedType) {
            if (ship.pendingBroadside.index === removedIndex) {
                ship.pendingBroadside = null;
            } else if (ship.pendingBroadside.index > removedIndex) {
                ship.pendingBroadside.index--;
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

    // Fix lastAttacker references on structures (for ship removal)
    if (removedType === 'ship') {
        for (const settlement of gameState.settlements) {
            if (settlement.lastAttacker && settlement.lastAttacker.type === 'ship') {
                if (settlement.lastAttacker.index === removedIndex) {
                    settlement.lastAttacker = null;
                } else if (settlement.lastAttacker.index > removedIndex) {
                    settlement.lastAttacker.index--;
                }
            }
        }
        for (const port of gameState.ports) {
            if (port.lastAttacker && port.lastAttacker.type === 'ship') {
                if (port.lastAttacker.index === removedIndex) {
                    port.lastAttacker = null;
                } else if (port.lastAttacker.index > removedIndex) {
                    port.lastAttacker.index--;
                }
            }
        }
        for (const tower of gameState.towers) {
            if (tower.lastAttacker && tower.lastAttacker.type === 'ship') {
                if (tower.lastAttacker.index === removedIndex) {
                    tower.lastAttacker = null;
                } else if (tower.lastAttacker.index > removedIndex) {
                    tower.lastAttacker.index--;
                }
            }
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
                    ship.waypoints = [];
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
 * Cancel a port that is under construction (new build or upgrade) and refund cost.
 * For new construction: removes the port from the array and cleans up references.
 * For upgrade: clears the construction state so the port remains at its current type.
 * @returns {boolean} true if cancelled
 */
export function cancelPortConstruction(gameState, portIndex, resources, fogState) {
    const port = gameState.ports[portIndex];
    if (!port || !port.construction) return false;

    const isUpgrade = !!port.construction.upgradeTo;
    const refundType = isUpgrade ? port.construction.upgradeTo : port.type;
    const refundData = PORTS[refundType];

    if (refundData?.cost && resources) {
        for (const [resource, amount] of Object.entries(refundData.cost)) {
            resources[resource] = (resources[resource] || 0) + amount;
        }
    }

    if (isUpgrade) {
        port.construction = null;
        console.log(`Cancelled port upgrade to ${refundType} at (${port.q}, ${port.r})`);
    } else {
        gameState.ports.splice(portIndex, 1);
        cleanupStaleReferences(gameState, 'port', portIndex);
        if (fogState) markVisibilityDirty(fogState);
        console.log(`Cancelled port construction (${refundType}) at (${port.q}, ${port.r})`);
    }
    return true;
}

/**
 * Cancel a tower that is under construction (new build or upgrade) and refund cost.
 * For new construction: removes the tower from the array and cleans up references.
 * For upgrade: clears the construction state so the tower remains at its current type.
 * @returns {boolean} true if cancelled
 */
export function cancelTowerConstruction(gameState, towerIndex, resources, fogState) {
    const tower = gameState.towers[towerIndex];
    if (!tower || !tower.construction) return false;

    const isUpgrade = !!tower.construction.upgradeTo;
    const refundType = isUpgrade ? tower.construction.upgradeTo : tower.type;
    const refundData = TOWERS[refundType];

    if (refundData?.cost && resources) {
        for (const [resource, amount] of Object.entries(refundData.cost)) {
            resources[resource] = (resources[resource] || 0) + amount;
        }
    }

    if (isUpgrade) {
        tower.construction = null;
        console.log(`Cancelled tower upgrade to ${refundType} at (${tower.q}, ${tower.r})`);
    } else {
        gameState.towers.splice(towerIndex, 1);
        cleanupStaleReferences(gameState, 'tower', towerIndex);
        if (fogState) markVisibilityDirty(fogState);
        console.log(`Cancelled tower construction (${refundType}) at (${tower.q}, ${tower.r})`);
    }
    return true;
}

/**
 * Update pirate respawn timers and spawn new pirates when ready
 * @param {Object} gameState - The game state
 * @param {Object} map - The map object with tiles
 * @param {Function} createShip - Function to create a new ship
 * @param {Function} hexKey - Function to create hex key
 * @param {number} dt - Delta time (already scaled by timeScale)
 */
export function updatePirateRespawns(gameState, map, createShip, hexKeyFn, dt) {
    if (dt === 0) return; // Paused

    for (let i = gameState.pirateRespawnQueue.length - 1; i >= 0; i--) {
        const respawn = gameState.pirateRespawnQueue[i];
        respawn.timer -= dt;

        if (respawn.timer <= 0) {
            let spawned = false;
            const occupiedHexes = new Set(
                gameState.ships.map(s => hexKeyFn(s.q, s.r))
            );

            // Spawn at map center if flagged (versus mode)
            if (respawn.spawnAtCenter) {
                const positions = findCenterSpawnPositions(map, hexKeyFn, 1, occupiedHexes);
                if (positions.length > 0) {
                    gameState.ships.push(createShip('pirate', positions[0].q, positions[0].r, 'pirate'));
                    spawned = true;
                }
            } else {
                // Sandbox mode: spawn near the home port
                const homePortIndex = getHomePortIndex(gameState, map);
                const homePort = homePortIndex !== null ? gameState.ports[homePortIndex] : null;

                if (homePort) {
                    const startAngle = Math.random() * Math.PI * 2;

                    // Try multiple distances if needed (8-20 hexes from home port)
                    for (let dist = 12; dist >= 6 && !spawned; dist -= 2) {
                        for (let attempt = 0; attempt < 12; attempt++) {
                            const angle = startAngle + (attempt * Math.PI / 6);
                            const pirateQ = homePort.q + Math.round(Math.cos(angle) * dist);
                            const pirateR = homePort.r + Math.round(Math.sin(angle) * dist);
                            const pirateTile = map.tiles.get(hexKeyFn(pirateQ, pirateR));

                            if (isWater(pirateTile)) {
                                gameState.ships.push(createShip('pirate', pirateQ, pirateR, 'pirate'));
                                spawned = true;
                                break;
                            }
                        }
                    }
                }
            }

            // Only remove from queue if successfully spawned
            if (spawned) {
                gameState.pirateRespawnQueue.splice(i, 1);
            } else {
                // Retry next frame if spawn failed
                respawn.timer = 1;
            }
        }
    }
}
