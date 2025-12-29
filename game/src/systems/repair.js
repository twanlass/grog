// Repair system - handles unit repair progress
import { SHIPS } from "../sprites/ships.js";
import { PORTS } from "../sprites/ports.js";
import { TOWERS } from "../sprites/towers.js";
import { SETTLEMENTS } from "../sprites/settlements.js";

/**
 * Update repair progress for all units
 */
export function updateRepair(gameState, dt) {
    // Update ship repairs
    for (const ship of gameState.ships) {
        if (!ship.repair) continue;

        ship.repair.progress += dt;
        if (ship.repair.progress >= ship.repair.totalTime) {
            // Repair complete
            ship.health += ship.repair.healthToRestore;
            ship.repair = null;
        }
    }

    // Update port repairs
    for (const port of gameState.ports) {
        if (!port.repair) continue;

        port.repair.progress += dt;
        if (port.repair.progress >= port.repair.totalTime) {
            // Repair complete
            port.health += port.repair.healthToRestore;
            port.repair = null;
        }
    }

    // Update tower repairs
    for (const tower of gameState.towers) {
        if (!tower.repair) continue;

        tower.repair.progress += dt;
        if (tower.repair.progress >= tower.repair.totalTime) {
            // Repair complete
            tower.health += tower.repair.healthToRestore;
            tower.repair = null;
        }
    }

    // Update settlement repairs
    for (const settlement of gameState.settlements) {
        if (!settlement.repair) continue;

        settlement.repair.progress += dt;
        if (settlement.repair.progress >= settlement.repair.totalTime) {
            // Repair complete
            settlement.health += settlement.repair.healthToRestore;
            settlement.repair = null;
        }
    }
}

/**
 * Calculate repair cost for a unit
 * @param {string} unitType - 'ship', 'port', 'tower', or 'settlement'
 * @param {object} unit - The unit object
 * @returns {{ wood: number }} Repair cost
 */
export function getRepairCost(unitType, unit) {
    let metadata, maxHealth;

    if (unitType === 'ship') {
        metadata = SHIPS[unit.type];
        maxHealth = metadata.health;
    } else if (unitType === 'port') {
        metadata = PORTS[unit.type];
        maxHealth = metadata.health;
    } else if (unitType === 'tower') {
        metadata = TOWERS[unit.type];
        maxHealth = metadata.health;
    } else if (unitType === 'settlement') {
        metadata = SETTLEMENTS.settlement;
        maxHealth = metadata.health;
    }

    const missingHealth = maxHealth - unit.health;
    const damagePercent = missingHealth / maxHealth;

    return {
        wood: Math.ceil((metadata.cost.wood || 0) * damagePercent),
    };
}

/**
 * Calculate repair time for a unit
 * @param {string} unitType - 'ship', 'port', 'tower', or 'settlement'
 * @param {object} unit - The unit object
 * @returns {number} Repair time in seconds
 */
export function getRepairTime(unitType, unit) {
    let metadata, maxHealth;

    // Repair takes 2x build time - makes it valuable but a last resort
    const REPAIR_TIME_MULTIPLIER = 2;

    if (unitType === 'ship') {
        metadata = SHIPS[unit.type];
        maxHealth = metadata.health;
        // Ships use build_time (lowercase)
        const buildTime = metadata.build_time;
        const damagePercent = (maxHealth - unit.health) / maxHealth;
        return buildTime * damagePercent * REPAIR_TIME_MULTIPLIER;
    } else if (unitType === 'port') {
        metadata = PORTS[unit.type];
        maxHealth = metadata.health;
    } else if (unitType === 'tower') {
        metadata = TOWERS[unit.type];
        maxHealth = metadata.health;
    } else if (unitType === 'settlement') {
        metadata = SETTLEMENTS.settlement;
        maxHealth = metadata.health;
    }

    // Ports, towers, and settlements use buildTime (camelCase)
    const buildTime = metadata.buildTime;
    const damagePercent = (maxHealth - unit.health) / maxHealth;
    return buildTime * damagePercent * REPAIR_TIME_MULTIPLIER;
}

/**
 * Start repairing a unit
 * @param {string} unitType - 'ship', 'port', 'tower', or 'settlement'
 * @param {object} unit - The unit object
 * @param {object} resources - Game resources to deduct from
 * @returns {boolean} True if repair started successfully
 */
export function startRepair(unitType, unit, resources) {
    let maxHealth;

    if (unitType === 'ship') {
        maxHealth = SHIPS[unit.type].health;
    } else if (unitType === 'port') {
        maxHealth = PORTS[unit.type].health;
    } else if (unitType === 'tower') {
        maxHealth = TOWERS[unit.type].health;
    } else if (unitType === 'settlement') {
        maxHealth = SETTLEMENTS.settlement.health;
    }

    // Already at full health
    if (unit.health >= maxHealth) return false;

    // Already repairing
    if (unit.repair) return false;

    const cost = getRepairCost(unitType, unit);

    // Check if can afford
    if (resources.wood < cost.wood) {
        return false;
    }

    // Deduct cost
    resources.wood -= cost.wood;

    // Start repair
    const repairTime = getRepairTime(unitType, unit);
    const healthToRestore = maxHealth - unit.health;

    unit.repair = {
        progress: 0,
        totalTime: repairTime,
        healthToRestore: healthToRestore,
    };

    // Clear movement/attack targets for ships
    if (unitType === 'ship') {
        unit.waypoint = null;
        unit.path = null;
        unit.attackTarget = null;
    }

    return true;
}
