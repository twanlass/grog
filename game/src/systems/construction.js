// Construction system - handles port, settlement, and tower building progress
import { createShip, findFreeAdjacentWater } from "../gameState.js";
import { SHIPS, SETTLEMENTS, TOWERS, PORTS } from "../sprites/index.js";
import { revealRadius } from "../fogOfWar.js";

/**
 * Updates all construction progress for ports, settlements, and towers
 * @param {Object} gameState - The game state
 * @param {Object} map - The game map
 * @param {Object} fogState - Fog of war state
 * @param {number} dt - Delta time (already scaled by timeScale)
 */
export function updateConstruction(gameState, map, fogState, dt) {
    if (dt === 0) return; // Paused

    // Update port ship build queue progress
    updatePortBuildQueues(gameState, map, fogState, dt);

    // Update port construction/upgrade progress
    updatePortConstruction(gameState, fogState, dt);

    // Update settlement construction progress
    updateSettlementConstruction(gameState, fogState, dt);

    // Update tower construction progress
    updateTowerConstruction(gameState, fogState, dt);
}

/**
 * Update port ship building queues
 */
function updatePortBuildQueues(gameState, map, fogState, dt) {
    for (const port of gameState.ports) {
        if (!port.buildQueue) continue;

        port.buildQueue.progress += dt;

        // Check if build is complete
        if (port.buildQueue.progress >= port.buildQueue.buildTime) {
            // Find free water hex to spawn ship
            const waterTile = findFreeAdjacentWater(map, port.q, port.r, gameState.ships);
            if (waterTile) {
                const ship = createShip(port.buildQueue.shipType, waterTile.q, waterTile.r);
                gameState.ships.push(ship);
                const newShipSight = SHIPS[ship.type].sightDistance;
                revealRadius(fogState, waterTile.q, waterTile.r, newShipSight);
                port.buildQueue = null;
                console.log(`Ship built: ${ship.type} at (${waterTile.q}, ${waterTile.r})`);
            }
            // If no free water, keep waiting with progress capped
            else {
                port.buildQueue.progress = port.buildQueue.buildTime;
            }
        }
    }
}

/**
 * Update port construction/upgrade progress
 */
function updatePortConstruction(gameState, fogState, dt) {
    for (const port of gameState.ports) {
        if (!port.construction) continue;

        port.construction.progress += dt;

        // Check if construction/upgrade is complete
        if (port.construction.progress >= port.construction.buildTime) {
            // Check if this is an upgrade
            if (port.construction.upgradeTo) {
                const oldType = port.type;
                port.type = port.construction.upgradeTo;
                port.health = PORTS[port.type].health;  // Restore health on upgrade
                console.log(`Port upgraded: ${oldType} → ${port.type} at (${port.q}, ${port.r})`);
            } else {
                console.log(`Port construction complete: ${port.type} at (${port.q}, ${port.r})`);
            }

            port.construction = null;  // Clear construction state

            // Reveal fog around completed port
            revealRadius(fogState, port.q, port.r, 2);

            // Port is now fully operational and can build ships
        }
    }
}

/**
 * Update settlement construction progress
 */
function updateSettlementConstruction(gameState, fogState, dt) {
    for (const settlement of gameState.settlements) {
        if (!settlement.construction) continue;

        settlement.construction.progress += dt;

        // Check if construction is complete
        if (settlement.construction.progress >= settlement.construction.buildTime) {
            console.log(`Settlement construction complete at (${settlement.q}, ${settlement.r})`);
            settlement.construction = null;  // Clear construction state

            // Reveal fog around completed settlement
            const sightDistance = SETTLEMENTS.settlement.sightDistance;
            revealRadius(fogState, settlement.q, settlement.r, sightDistance);
        }
    }
}

/**
 * Update tower construction/upgrade progress
 */
function updateTowerConstruction(gameState, fogState, dt) {
    for (const tower of gameState.towers) {
        if (!tower.construction) continue;

        tower.construction.progress += dt;

        // Check if construction/upgrade is complete
        if (tower.construction.progress >= tower.construction.buildTime) {
            // Check if this is an upgrade
            if (tower.construction.upgradeTo) {
                const oldType = tower.type;
                tower.type = tower.construction.upgradeTo;
                tower.health = TOWERS[tower.type].health;
                console.log(`Tower upgraded: ${oldType} → ${tower.type} at (${tower.q}, ${tower.r})`);
            } else {
                console.log(`Tower construction complete at (${tower.q}, ${tower.r})`);
            }

            tower.construction = null;  // Clear construction state

            // Reveal fog around completed tower (upgrades may have better sight)
            const sightDistance = TOWERS[tower.type].sightDistance;
            revealRadius(fogState, tower.q, tower.r, sightDistance);
        }
    }
}
