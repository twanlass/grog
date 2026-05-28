// Construction system - handles port, settlement, and tower building progress
import {
    createShip, createPort, findFreeAdjacentWater, canAfford, deductCost,
    canAffordCrew, isValidPortSite, getResourcesForOwner, showNotification,
    PORT_DOCK_DISTANCE,
} from "../gameState.js";
import { SHIPS, SETTLEMENTS, TOWERS, PORTS } from "../sprites/index.js";
import { markVisibilityDirty } from "../fogOfWar.js";
import { hexDistance } from "../hex.js";

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

    // Trigger deferred port builds for ships that have arrived in range
    updatePendingBuilds(gameState, map, fogState);

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
 * Check ships with a deferred port build. When a ship is stationary AND docked
 * adjacent to its target shore, validate site/affordability and start construction.
 * If the target became invalid (someone built there), clear the intent silently.
 */
function updatePendingBuilds(gameState, map, fogState) {
    for (let shipIndex = 0; shipIndex < gameState.ships.length; shipIndex++) {
        const ship = gameState.ships[shipIndex];
        if (!ship.pendingBuild) continue;

        const { portType, q, r } = ship.pendingBuild;
        const isStationary = ship.waypoints.length === 0;
        const dist = hexDistance(ship.q, ship.r, q, r);

        // Cancel silently if the site is no longer valid (e.g. another player built there)
        if (!isValidPortSite(map, q, r, gameState.ports, gameState.towers, gameState.settlements)) {
            ship.pendingBuild = null;
            if (ship.owner === 'player' || ship.owner === 'player2') {
                showNotification(gameState, "Build site no longer available");
            }
            continue;
        }

        if (!isStationary || dist > PORT_DOCK_DISTANCE) continue;

        // Docked against the shore — try to start the build
        const portData = PORTS[portType];
        if (!portData) {
            ship.pendingBuild = null;
            continue;
        }
        const resources = getResourcesForOwner(gameState, ship.owner) || gameState.resources;
        if (!canAfford(resources, portData.cost)) {
            // Wait until affordable — keep intent but don't notify spammily
            continue;
        }

        deductCost(resources, portData.cost);
        const newPort = createPort(portType, q, r, true, shipIndex, ship.owner || 'player');
        gameState.ports.push(newPort);
        ship.pendingBuild = null;
        markVisibilityDirty(fogState);
        console.log(`Deferred build triggered: ${portType} at (${q}, ${r}) by ship ${shipIndex}`);
    }
}

/**
 * Update port ship building queues
 * Queue is an array: items with progress !== null are actively building
 * Resources are only deducted when an item becomes active
 * Ports can have multiple parallel build slots (e.g., shipyard can build 2 at once)
 */
function updatePortBuildQueues(gameState, map, fogState, dt) {
    for (const port of gameState.ports) {
        // Skip if no items in queue
        if (!port.buildQueue || port.buildQueue.length === 0) continue;

        const portData = PORTS[port.type];
        const parallelSlots = portData?.parallelBuildSlots || 1;
        const resources = port.owner === 'player' ? gameState.resources
            : port.owner === 'player2' ? gameState.player2Resources
            : gameState.aiResources?.[port.owner];
        const isHuman = !port.owner || port.owner === 'player' || port.owner === 'player2';

        // Count currently active builds (overall and by ship type)
        let activeCount = 0;
        const activeByType = {};
        for (const item of port.buildQueue) {
            if (item.progress !== null) {
                activeCount++;
                activeByType[item.shipType] = (activeByType[item.shipType] || 0) + 1;
            }
        }

        // Try to start queued items up to parallel slot limit
        for (const item of port.buildQueue) {
            if (activeCount >= parallelSlots) break;
            if (item.progress !== null) continue; // Already active

            const shipData = SHIPS[item.shipType];

            // Per-ship-type concurrent build cap (e.g. schooner: 1 at a time)
            const maxConcurrent = shipData.maxConcurrent;
            if (maxConcurrent && (activeByType[item.shipType] || 0) >= maxConcurrent) continue;

            // Check if we can afford to start this build
            if (isHuman && resources) {
                if (canAfford(resources, shipData.cost) && canAffordCrew(gameState, shipData.crewCost || 0)) {
                    deductCost(resources, shipData.cost);
                    item.progress = 0;
                    activeCount++;
                    activeByType[item.shipType] = (activeByType[item.shipType] || 0) + 1;
                }
                // If can't afford, item stays queued (progress remains null)
            } else if (!isHuman) {
                // AI always starts building (resources handled elsewhere)
                item.progress = 0;
                activeCount++;
                activeByType[item.shipType] = (activeByType[item.shipType] || 0) + 1;
            }
        }

        // Update progress on all active items and track completed indices
        const completedIndices = [];
        for (let i = 0; i < port.buildQueue.length; i++) {
            const item = port.buildQueue[i];
            if (item.progress === null) continue;

            item.progress += dt;

            // Check if build is complete
            if (item.progress >= item.buildTime) {
                // Find free water hex to spawn ship
                const waterTile = findFreeAdjacentWater(map, port.q, port.r, gameState.ships);
                if (waterTile) {
                    // Ships inherit owner from the port that built them
                    const portOwner = port.owner || 'player';
                    const ship = createShip(item.shipType, waterTile.q, waterTile.r, portOwner);
                    gameState.ships.push(ship);

                    // If port has rally point, set ship's waypoint
                    if (port.rallyPoint) {
                        ship.waypoints = [{ q: port.rallyPoint.q, r: port.rallyPoint.r }];
                    }

                    // Mark fog dirty - new ship will be included in visibility recalculation
                    markVisibilityDirty(fogState);

                    completedIndices.push(i);
                    console.log(`Ship built: ${ship.type} at (${waterTile.q}, ${waterTile.r})`);
                } else {
                    // If no free water, keep waiting with progress capped
                    item.progress = item.buildTime;
                }
            }
        }

        // Remove completed items (in reverse order to preserve indices)
        for (let i = completedIndices.length - 1; i >= 0; i--) {
            port.buildQueue.splice(completedIndices[i], 1);
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
