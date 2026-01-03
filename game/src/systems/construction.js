// Construction system - handles port, settlement, and tower building progress
import { createShip, findFreeAdjacentWater, canAfford, deductCost, canAffordCrew } from "../gameState.js";
import { SHIPS, SETTLEMENTS, TOWERS, PORTS } from "../sprites/index.js";
import { markVisibilityDirty } from "../fogOfWar.js";

/**
 * Updates all construction progress for ports, settlements, and towers
 * @param {Object} gameState - The game state
 * @param {Object} map - The game map
 * @param {Object} fogState - Fog of war state
 * @param {number} dt - Delta time (already scaled by timeScale)
 * @param {Array} floatingNumbers - Array to push floating number animations to
 */
export function updateConstruction(gameState, map, fogState, dt, floatingNumbers = []) {
    if (dt === 0) return; // Paused

    // Update port ship build queue progress
    updatePortBuildQueues(gameState, map, fogState, dt);

    // Update port construction/upgrade progress
    updatePortConstruction(gameState, fogState, dt, floatingNumbers);

    // Update settlement construction progress
    updateSettlementConstruction(gameState, fogState, dt, floatingNumbers);

    // Update tower construction progress
    updateTowerConstruction(gameState, fogState, dt);
}

/**
 * Update port ship building queues
 * Queue is an array: first item is active (has progress), rest are queued
 * Resources are only deducted when an item becomes active
 */
function updatePortBuildQueues(gameState, map, fogState, dt) {
    for (const port of gameState.ports) {
        // Skip if no items in queue
        if (!port.buildQueue || port.buildQueue.length === 0) continue;

        const activeItem = port.buildQueue[0];

        // If first item hasn't started yet (progress is null), try to start it
        if (activeItem.progress === null) {
            const shipData = SHIPS[activeItem.shipType];
            const resources = port.owner === 'player' ? gameState.resources : gameState.aiResources?.[port.owner];
            const isPlayer = !port.owner || port.owner === 'player';

            // Check if we can afford to start this build
            if (isPlayer && resources) {
                if (canAfford(resources, shipData.cost) && canAffordCrew(gameState, shipData.crewCost || 0)) {
                    deductCost(resources, shipData.cost);
                    activeItem.progress = 0;
                }
                // If can't afford, item stays queued (progress remains null)
            } else if (!isPlayer) {
                // AI always starts building (resources handled elsewhere)
                activeItem.progress = 0;
            }

            // If we couldn't start, skip to next port
            if (activeItem.progress === null) continue;
        }

        // Update progress on active item
        activeItem.progress += dt;

        // Check if build is complete
        if (activeItem.progress >= activeItem.buildTime) {
            // Find free water hex to spawn ship
            const waterTile = findFreeAdjacentWater(map, port.q, port.r, gameState.ships);
            if (waterTile) {
                // Ships inherit owner from the port that built them
                const portOwner = port.owner || 'player';
                const ship = createShip(activeItem.shipType, waterTile.q, waterTile.r, portOwner);
                gameState.ships.push(ship);

                // If port has rally point, set ship's waypoint
                if (port.rallyPoint) {
                    ship.waypoints = [{ q: port.rallyPoint.q, r: port.rallyPoint.r }];
                }

                // Mark fog dirty - new ship will be included in visibility recalculation
                markVisibilityDirty(fogState);

                // Remove completed item from queue
                port.buildQueue.shift();

                console.log(`Ship built: ${ship.type} at (${waterTile.q}, ${waterTile.r})`);

                // Next item in queue (if any) will be started on next frame
                // when resources are checked
            }
            // If no free water, keep waiting with progress capped
            else {
                activeItem.progress = activeItem.buildTime;
            }
        }
    }
}

/**
 * Update port construction/upgrade progress
 */
function updatePortConstruction(gameState, fogState, dt, floatingNumbers) {
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

                // Spawn floating crew number for new port (player only)
                if (!port.owner || port.owner === 'player') {
                    const portData = PORTS[port.type];
                    const crewContribution = portData.crewCapContribution || 0;
                    if (crewContribution > 0) {
                        floatingNumbers.push({
                            q: port.q, r: port.r,
                            text: `+${crewContribution}`,
                            type: 'crew',
                            age: 0,
                            duration: 3.0,
                            offsetX: 0,
                        });
                    }
                }
            }

            port.construction = null;  // Clear construction state

            // Mark fog dirty - completed port will be included in visibility recalculation
            markVisibilityDirty(fogState);

            // Port is now fully operational and can build ships
        }
    }
}

/**
 * Update settlement construction progress
 */
function updateSettlementConstruction(gameState, fogState, dt, floatingNumbers) {
    for (const settlement of gameState.settlements) {
        if (!settlement.construction) continue;

        settlement.construction.progress += dt;

        // Check if construction is complete
        if (settlement.construction.progress >= settlement.construction.buildTime) {
            console.log(`Settlement construction complete at (${settlement.q}, ${settlement.r})`);
            settlement.construction = null;  // Clear construction state

            // Spawn floating crew number for new settlement (player only)
            if (!settlement.owner || settlement.owner === 'player') {
                const settlementData = SETTLEMENTS.settlement;
                const crewContribution = settlementData.crewCapContribution || 0;
                if (crewContribution > 0) {
                    floatingNumbers.push({
                        q: settlement.q, r: settlement.r,
                        text: `+${crewContribution}`,
                        type: 'crew',
                        age: 0,
                        duration: 3.0,
                        offsetX: 0,
                    });
                }
            }

            // Mark fog dirty - completed settlement will be included in visibility recalculation
            markVisibilityDirty(fogState);
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

            // Mark fog dirty - completed tower will be included in visibility recalculation
            markVisibilityDirty(fogState);
        }
    }
}
