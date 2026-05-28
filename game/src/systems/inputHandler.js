// Input handling helpers for click interactions
import { PORTS, SHIPS, TOWERS, SETTLEMENTS } from "../sprites/index.js";
import {
    canAfford, deductCost, createPort, exitPortBuildMode,
    createSettlement, exitSettlementBuildMode, enterPortBuildMode, enterSettlementBuildMode,
    createTower, exitTowerBuildMode, enterTowerBuildMode,
    enterWorkerBuildMode, exitWorkerBuildMode,
    isValidSettlementSite, isValidTowerSite, isValidPortSite,
    startBuilding, addToBuildQueue, cancelBuildItem, startPortUpgrade, startTowerUpgrade, isPortBuildingSettlement, isPortBuildingTower,
    selectUnit, toggleSelection, getSelectedShips, isShipBuildingPort, isShipBuildingTower,
    clearSelection, cancelTradeRoute, exitPatrolMode,
    findFreeAdjacentWater, findNearestWaterInRange, findNearbyWaitingHex, getHomePortIndex,
    canAffordCrew, showNotification, isAIOwner, getResourcesForOwner, isPirateShip,
} from "../gameState.js";
import { hexKey, hexDistance } from "../hex.js";
import { findNearestWater, distributeDestinations } from "../pathfinding.js";
import { startRepair } from "./repair.js";
import { triggerBroadside, cancelPortConstruction, cancelTowerConstruction, cancelSettlementConstruction } from "./combat.js";
import { commandWorkerMove, commandWorkerHarvest, commandWorkerBuild } from "./workers.js";
import { WORKER_CONFIG } from "../sprites/workers.js";
import { COMMAND_TYPES } from "../networking/commands.js";

// Local player identity — set via setLocalPlayerId() for multiplayer
let localPlayerId = 'player';
export function setLocalPlayerId(id) { localPlayerId = id; }
export function getLocalPlayerId() { return localPlayerId; }

// Check if an entity is non-local (enemy from local player's perspective)
function isNonLocal(owner) {
    return owner !== localPlayerId;
}

// Get the local player's resource object (player or player2)
function getLocalResources(gameState) {
    return getResourcesForOwner(gameState, localPlayerId) || gameState.resources;
}

// Network command queue — guest actions are queued here and drained by gameScene
let pendingNetworkCommands = [];
export function drainPendingNetworkCommands() {
    const cmds = pendingNetworkCommands;
    pendingNetworkCommands = [];
    return cmds;
}
function queueNetCmd(type, data) {
    if (localPlayerId !== 'player') {
        pendingNetworkCommands.push({ type, ...data });
    }
}

/**
 * Handle click in port placement mode
 * @returns {boolean} true if handled, false to continue processing
 */
export function handlePortPlacementClick(gameState, map) {
    if (!gameState.portBuildMode.active) return false;

    if (gameState.portBuildMode.hoveredHex) {
        const hex = gameState.portBuildMode.hoveredHex;
        const portType = gameState.portBuildMode.portType;
        const builderShipIndex = gameState.portBuildMode.builderShipIndex;
        const builderShip = gameState.ships[builderShipIndex];
        const portData = PORTS[portType];
        const res = getLocalResources(gameState);

        if (!canAfford(res, portData.cost)) {
            console.log(`Can't afford ${portType}`);
            exitPortBuildMode(gameState);
            return true;
        }

        if (hex.deferred && builderShip && map) {
            // Out of range: queue a deferred build and sail toward the target shore.
            // Cost is deducted on arrival (in updatePendingBuilds), not now.
            const dockSpot = findNearestWaterInRange(map, hex.q, hex.r, 6);
            if (!dockSpot) {
                showNotification(gameState, "No path to that shore");
                exitPortBuildMode(gameState);
                return true;
            }

            builderShip.pendingBuild = { portType, q: hex.q, r: hex.r };
            builderShip.waypoints = [{ q: dockSpot.q, r: dockSpot.r }];
            builderShip.path = null;
            builderShip.moveProgress = 0;
            if (builderShip.tradeRoute) cancelTradeRoute(builderShip);
            builderShip.isPatrolling = false;

            queueNetCmd(COMMAND_TYPES.QUEUE_DEFERRED_BUILD, {
                builderShipId: builderShip.id, portType, q: hex.q, r: hex.r,
                waypointQ: dockSpot.q, waypointR: dockSpot.r,
            });

            console.log(`Queued deferred ${portType} build at (${hex.q}, ${hex.r}) — sailing to (${dockSpot.q}, ${dockSpot.r})`);
            exitPortBuildMode(gameState);
            return true;
        }

        deductCost(res, portData.cost);

        if (builderShip) {
            builderShip.pendingBuild = null;  // Clear any prior deferred intent
        }
        const newPort = createPort(portType, hex.q, hex.r, true, builderShipIndex, localPlayerId);
        gameState.ports.push(newPort);

        queueNetCmd(COMMAND_TYPES.BUILD_PORT, {
            builderShipId: builderShip?.id, portType, q: hex.q, r: hex.r,
        });

        console.log(`Started building ${portType} at (${hex.q}, ${hex.r}) by ship ${builderShipIndex}`);
        exitPortBuildMode(gameState);
    }
    return true;
}

/**
 * Handle click in settlement placement mode
 * @returns {boolean} true if handled, false to continue processing
 */
export function handleSettlementPlacementClick(gameState) {
    if (!gameState.settlementBuildMode.active) return false;

    if (gameState.settlementBuildMode.hoveredHex) {
        const hex = gameState.settlementBuildMode.hoveredHex;
        const builderPortIndex = gameState.settlementBuildMode.builderPortIndex;
        const settlementData = SETTLEMENTS.settlement;
        const res = getLocalResources(gameState);

        if (!canAfford(res, settlementData.cost)) {
            console.log(`Can't afford settlement`);
            exitSettlementBuildMode(gameState);
            return true;
        }
        deductCost(res, settlementData.cost);

        const builderPort = gameState.ports[builderPortIndex];
        const newSettlement = createSettlement(hex.q, hex.r, true, builderPortIndex, localPlayerId);
        gameState.settlements.push(newSettlement);

        queueNetCmd(COMMAND_TYPES.BUILD_SETTLEMENT, {
            builderPortId: builderPort?.id, q: hex.q, r: hex.r,
        });

        console.log(`Started building settlement at (${hex.q}, ${hex.r}) by port ${builderPortIndex}`);
        exitSettlementBuildMode(gameState);
    }
    return true;
}

/**
 * Handle click while in worker-driven build placement mode. Validates the
 * site, picks the nearest selected idle/interruptible worker, deducts cost,
 * spawns the in-progress structure with `construction.builderWorkerId` set,
 * and dispatches the worker to walk there and build.
 *
 * Returns true if the click was consumed (mode was active) — true even on
 * invalid placement, so the caller doesn't fall through to "select unit".
 */
export function handleWorkerBuildPlacementClick(gameState, map) {
    if (!gameState.workerBuildMode.active) return false;

    const hex = gameState.workerBuildMode.hoveredHex;
    if (!hex) return true;

    const { structureType, portType } = gameState.workerBuildMode;
    const res = getLocalResources(gameState);

    // Resolve structure cost and validate the site
    let cost, valid;
    if (structureType === 'settlement') {
        cost = SETTLEMENTS.settlement.cost;
        valid = isValidSettlementSite(map, hex.q, hex.r, gameState.settlements, gameState.ports, gameState.towers);
    } else if (structureType === 'tower') {
        cost = TOWERS.watchtower.cost;
        valid = isValidTowerSite(map, hex.q, hex.r, gameState.towers, gameState.ports, gameState.settlements);
    } else if (structureType === 'port') {
        const pt = portType || 'dock';
        cost = PORTS[pt].cost;
        valid = isValidPortSite(map, hex.q, hex.r, gameState.ports, gameState.towers, gameState.settlements);
    } else {
        exitWorkerBuildMode(gameState);
        return true;
    }

    if (!valid) {
        // Invalid site — keep the mode active so the player can try again
        return true;
    }
    if (!canAfford(res, cost)) {
        showNotification(gameState, `Not enough wood`);
        exitWorkerBuildMode(gameState);
        return true;
    }

    // Pick the nearest selected worker that can accept the order.
    const candidateIndices = [];
    for (const sel of gameState.selectedUnits) {
        if (sel.type !== 'worker') continue;
        const w = gameState.workers[sel.index];
        if (!w) continue;
        if ((w.owner || 'player') !== localPlayerId) continue;
        // Workers locked in another build can't be reassigned
        if (w.state === 'building' || w.buildTask) continue;
        candidateIndices.push(sel.index);
    }
    if (candidateIndices.length === 0) {
        showNotification(gameState, `No available worker selected`);
        exitWorkerBuildMode(gameState);
        return true;
    }
    let bestIdx = candidateIndices[0];
    let bestDist = Infinity;
    for (const idx of candidateIndices) {
        const w = gameState.workers[idx];
        const d = hexDistance(w.q, w.r, hex.q, hex.r);
        if (d < bestDist) { bestDist = d; bestIdx = idx; }
    }
    const builder = gameState.workers[bestIdx];

    // Spawn the in-progress structure with the worker tether
    deductCost(res, cost);
    let structure = null;
    if (structureType === 'settlement') {
        structure = createSettlement(hex.q, hex.r, true, null, localPlayerId, builder.id);
        gameState.settlements.push(structure);
    } else if (structureType === 'tower') {
        structure = createTower('watchtower', hex.q, hex.r, true, null, null, localPlayerId, builder.id);
        gameState.towers.push(structure);
    } else if (structureType === 'port') {
        const pt = portType || 'dock';
        structure = createPort(pt, hex.q, hex.r, true, null, localPlayerId);
        structure.construction.builderWorkerId = builder.id;
        gameState.ports.push(structure);
    }

    // Walk the worker to the site and lock them in 'building'
    const ok = commandWorkerBuild(builder, map, {
        structureType,
        structureId: structure.id,
        q: hex.q, r: hex.r,
    });
    if (!ok) {
        // Cross-island or otherwise unreachable — roll back the build
        if (structureType === 'settlement') {
            gameState.settlements.pop();
        } else if (structureType === 'tower') {
            gameState.towers.pop();
        } else if (structureType === 'port') {
            gameState.ports.pop();
        }
        res.wood = (res.wood || 0) + (cost.wood || 0);
        showNotification(gameState, `No land path to that hex`);
    }

    exitWorkerBuildMode(gameState);
    return true;
}

/**
 * Handle click in tower placement mode (always builds watchtower)
 * @returns {boolean} true if handled, false to continue processing
 */
export function handleTowerPlacementClick(gameState) {
    if (!gameState.towerBuildMode.active) return false;

    if (gameState.towerBuildMode.hoveredHex) {
        const hex = gameState.towerBuildMode.hoveredHex;
        const builderShipIndex = gameState.towerBuildMode.builderShipIndex;
        const builderPortIndex = gameState.towerBuildMode.builderPortIndex;
        const watchtowerData = TOWERS.watchtower;
        const res = getLocalResources(gameState);

        if (!canAfford(res, watchtowerData.cost)) {
            console.log(`Can't afford ${watchtowerData.name}`);
            exitTowerBuildMode(gameState);
            return true;
        }
        if (!canAffordCrew(gameState, watchtowerData.crewCost || 0, localPlayerId)) {
            console.log(`Not enough crew for ${watchtowerData.name}`);
            exitTowerBuildMode(gameState);
            return true;
        }
        deductCost(res, watchtowerData.cost);

        const builderShip = builderShipIndex !== null ? gameState.ships[builderShipIndex] : null;
        const builderPort = builderPortIndex !== null ? gameState.ports[builderPortIndex] : null;
        const newTower = createTower('watchtower', hex.q, hex.r, true, builderShipIndex, builderPortIndex, localPlayerId);
        gameState.towers.push(newTower);

        queueNetCmd(COMMAND_TYPES.BUILD_TOWER, {
            builderShipId: builderShip?.id || null,
            builderPortId: builderPort?.id || null,
            q: hex.q, r: hex.r,
        });

        const builderType = builderShipIndex !== null ? `ship ${builderShipIndex}` : `port ${builderPortIndex}`;
        console.log(`Started building ${watchtowerData.name} at (${hex.q}, ${hex.r}) by ${builderType}`);
        exitTowerBuildMode(gameState);
    }
    return true;
}

/**
 * Handle click on ship build panel (for port building from ships)
 * @returns {boolean} true if handled
 */
export function handleShipBuildPanelClick(mouseX, mouseY, shipBuildPanelBounds, gameState) {
    if (!shipBuildPanelBounds) return false;

    const sbp = shipBuildPanelBounds;
    if (mouseX < sbp.x || mouseX > sbp.x + sbp.width ||
        mouseY < sbp.y || mouseY > sbp.y + sbp.height) {
        return false;
    }

    for (const btn of sbp.buttons) {
        if (mouseY >= btn.y && mouseY <= btn.y + btn.height) {
            const portData = PORTS[btn.portType];
            if (canAfford(getLocalResources(gameState), portData.cost)) {
                enterPortBuildMode(gameState, sbp.shipIndex, btn.portType);
                console.log(`Entering port placement mode: ${btn.portType}`);
            }
            return true;
        }
    }

    // Check watchtower button
    if (sbp.towerButton) {
        const tbtn = sbp.towerButton;
        if (mouseY >= tbtn.y && mouseY <= tbtn.y + tbtn.height) {
            const watchtowerData = TOWERS.watchtower;
            if (canAfford(getLocalResources(gameState), watchtowerData.cost)) {
                if (!canAffordCrew(gameState, watchtowerData.crewCost || 0, localPlayerId)) {
                    showNotification(gameState, "Max crew reached. Build more settlements.");
                } else {
                    enterTowerBuildMode(gameState, sbp.shipIndex, 'ship');
                    console.log(`Entering watchtower placement mode from ship ${sbp.shipIndex}`);
                }
            }
            return true;
        }
    }

    return true; // Clicked panel but not button
}

/**
 * Handle click on port build panel (ship building, upgrades, settlement building, tower building)
 * @returns {boolean} true if handled
 */
export function handleBuildPanelClick(mouseX, mouseY, buildPanelBounds, gameState, fogState = null) {
    if (!buildPanelBounds) return false;

    const bp = buildPanelBounds;
    if (mouseX < bp.x || mouseX > bp.x + bp.width ||
        mouseY < bp.y || mouseY > bp.y + bp.height) {
        return false;
    }

    // Cancel button (shown when port is under construction or upgrading)
    if (bp.cancelButton) {
        const cb = bp.cancelButton;
        if (mouseY >= cb.y && mouseY <= cb.y + cb.height) {
            const port = gameState.ports[cb.entityIndex];
            if (port && port.construction) {
                const refundResources = getResourcesForOwner(gameState, port.owner) || getLocalResources(gameState);
                const portId = port.id;
                if (cancelPortConstruction(gameState, cb.entityIndex, refundResources, fogState)) {
                    queueNetCmd(COMMAND_TYPES.CANCEL_CONSTRUCTION, { entityType: 'port', entityId: portId });
                }
            }
            return true;
        }
    }

    // Check ship build buttons
    const res = getLocalResources(gameState);
    for (const btn of bp.buttons) {
        if (mouseY >= btn.y && mouseY <= btn.y + btn.height) {
            const selectedPortIndices = gameState.selectedUnits.filter(u => u.type === 'port');
            if (selectedPortIndices.length === 1) {
                const portIdx = selectedPortIndices[0].index;
                const port = gameState.ports[portIdx];
                const shipData = SHIPS[btn.shipType];
                const maxQueueSize = PORTS[port.type]?.maxQueueSize || 3;

                // Check if queue is full
                if (port.buildQueue.length >= maxQueueSize) {
                    showNotification(gameState, `Build queue full (max ${maxQueueSize})`);
                    return true;
                }

                // Check if port is repairing
                if (port.repair) {
                    return true;
                }

                // If queue is empty, check affordability and start immediately
                if (port.buildQueue.length === 0) {
                    if (!canAfford(res, shipData.cost)) {
                        return true; // Can't afford
                    }
                    if (!canAffordCrew(gameState, shipData.crewCost || 0, localPlayerId)) {
                        showNotification(gameState, "Max crew reached. Build more settlements.");
                        return true;
                    }
                    // Deduct resources and start building
                    deductCost(res, shipData.cost);
                    addToBuildQueue(port, btn.shipType, res, true);
                    port.buildQueue[0].progress = 0; // Mark as active
                    console.log(`Started building: ${btn.shipType}`);
                } else {
                    // Queue has items - just add to queue without resource check
                    addToBuildQueue(port, btn.shipType, res, false);
                    console.log(`Queued: ${btn.shipType} (position ${port.buildQueue.length})`);
                }

                queueNetCmd(COMMAND_TYPES.BUILD_SHIP, { portId: port.id, shipType: btn.shipType });
            }
            return true;
        }
    }

    // Check upgrade button
    if (bp.upgradeButton) {
        const ubtn = bp.upgradeButton;
        if (mouseY >= ubtn.y && mouseY <= ubtn.y + ubtn.height) {
            const selectedPortIndices = gameState.selectedUnits.filter(u => u.type === 'port');
            if (selectedPortIndices.length === 1) {
                const portIdx = selectedPortIndices[0].index;
                const port = gameState.ports[portIdx];
                const nextPortData = PORTS[ubtn.portType];
                const portBusy = port.buildQueue.length > 0 || port.repair || isPortBuildingSettlement(portIdx, gameState.settlements);
                if (!portBusy && !port.construction && canAfford(res, nextPortData.cost)) {
                    deductCost(res, nextPortData.cost);
                    startPortUpgrade(port);
                    queueNetCmd(COMMAND_TYPES.UPGRADE_PORT, { portId: port.id });
                    console.log(`Started upgrading to: ${ubtn.portType}`);
                }
            }
            return true;
        }
    }

    // Check worker production button (single-slot per port)
    if (bp.workerButton) {
        const wbtn = bp.workerButton;
        if (mouseY >= wbtn.y && mouseY <= wbtn.y + wbtn.height) {
            const port = gameState.ports[bp.portIndex];
            if (!port) return true;
            if (port.workerBuild) return true;       // Already producing
            if (port.repair) return true;
            if (!canAfford(res, WORKER_CONFIG.cost)) return true;
            deductCost(res, WORKER_CONFIG.cost);
            port.workerBuild = { progress: 0, buildTime: WORKER_CONFIG.buildTime };
            console.log(`Started building worker at port ${bp.portIndex}`);
            return true;
        }
    }


    // (Watchtower button was removed from the port panel — workers now
    //  handle tower construction. See worker build panel.)

    // Check repair button
    if (bp.repairButton) {
        const rbtn = bp.repairButton;
        if (mouseY >= rbtn.y && mouseY <= rbtn.y + rbtn.height) {
            const port = gameState.ports[bp.portIndex];
            if (startRepair('port', port, res)) {
                queueNetCmd(COMMAND_TYPES.REPAIR, { entityType: 'port', entityId: port.id });
                console.log(`Started repairing port`);
            }
            return true;
        }
    }

    return true; // Clicked panel but not on a button
}

/**
 * Handle click on tower info panel (for tower upgrades and repair)
 * @returns {boolean} true if handled
 */
export function handleTowerInfoPanelClick(mouseX, mouseY, towerInfoPanelBounds, gameState, fogState = null) {
    if (!towerInfoPanelBounds) return false;

    const tip = towerInfoPanelBounds;
    if (mouseX < tip.x || mouseX > tip.x + tip.width ||
        mouseY < tip.y || mouseY > tip.y + tip.height) {
        return false;
    }

    // Cancel button (shown when tower is under construction or upgrading)
    if (tip.cancelButton) {
        const cb = tip.cancelButton;
        if (mouseY >= cb.y && mouseY <= cb.y + cb.height) {
            const selectedTowerIndices = gameState.selectedUnits.filter(u => u.type === 'tower');
            if (selectedTowerIndices.length === 1) {
                const towerIdx = selectedTowerIndices[0].index;
                const tower = gameState.towers[towerIdx];
                if (tower && tower.construction) {
                    const refundResources = getResourcesForOwner(gameState, tower.owner) || getLocalResources(gameState);
                    const towerId = tower.id;
                    if (cancelTowerConstruction(gameState, towerIdx, refundResources, fogState)) {
                        queueNetCmd(COMMAND_TYPES.CANCEL_CONSTRUCTION, { entityType: 'tower', entityId: towerId });
                    }
                }
            }
            return true;
        }
    }

    // Check upgrade button
    const res = getLocalResources(gameState);
    if (tip.upgradeButton) {
        const ubtn = tip.upgradeButton;
        if (mouseY >= ubtn.y && mouseY <= ubtn.y + ubtn.height) {
            const selectedTowerIndices = gameState.selectedUnits.filter(u => u.type === 'tower');
            if (selectedTowerIndices.length === 1) {
                const towerIdx = selectedTowerIndices[0].index;
                const tower = gameState.towers[towerIdx];
                const nextTowerData = TOWERS[ubtn.towerType];
                const currentTowerData = TOWERS[tower.type];
                const crewDiff = (nextTowerData.crewCost || 0) - (currentTowerData.crewCost || 0);
                if (!tower.construction && canAfford(res, nextTowerData.cost)) {
                    if (!canAffordCrew(gameState, crewDiff, localPlayerId)) {
                        showNotification(gameState, "Max crew reached. Build more settlements.");
                    } else {
                        deductCost(res, nextTowerData.cost);
                        startTowerUpgrade(tower);
                        queueNetCmd(COMMAND_TYPES.UPGRADE_TOWER, { towerId: tower.id });
                        console.log(`Started upgrading tower to: ${ubtn.towerType}`);
                    }
                }
            }
            return true;
        }
    }

    // Check repair button
    if (tip.repairButton) {
        const rbtn = tip.repairButton;
        if (mouseY >= rbtn.y && mouseY <= rbtn.y + rbtn.height) {
            const selectedTowerIndices = gameState.selectedUnits.filter(u => u.type === 'tower');
            if (selectedTowerIndices.length === 1) {
                const towerIdx = selectedTowerIndices[0].index;
                const tower = gameState.towers[towerIdx];
                if (startRepair('tower', tower, res)) {
                    queueNetCmd(COMMAND_TYPES.REPAIR, { entityType: 'tower', entityId: tower.id });
                    console.log(`Started repairing tower`);
                }
            }
            return true;
        }
    }

    return true; // Clicked panel but not on a button
}

/**
 * Handle click on settlement info panel
 * @returns {boolean} true if handled
 */
export function handleSettlementInfoPanelClick(mouseX, mouseY, settlementInfoPanelBounds, gameState) {
    if (!settlementInfoPanelBounds) return false;

    const sip = settlementInfoPanelBounds;
    if (mouseX < sip.x || mouseX > sip.x + sip.width ||
        mouseY < sip.y || mouseY > sip.y + sip.height) {
        return false;
    }

    // Check repair button
    if (sip.repairButton) {
        const rbtn = sip.repairButton;
        if (mouseY >= rbtn.y && mouseY <= rbtn.y + rbtn.height) {
            const selectedSettlementIndices = gameState.selectedUnits.filter(u => u.type === 'settlement');
            if (selectedSettlementIndices.length === 1) {
                const settlementIdx = selectedSettlementIndices[0].index;
                const settlement = gameState.settlements[settlementIdx];
                if (startRepair('settlement', settlement, getLocalResources(gameState))) {
                    queueNetCmd(COMMAND_TYPES.REPAIR, { entityType: 'settlement', entityId: settlement.id });
                    console.log(`Started repairing settlement`);
                }
            }
            return true;
        }
    }

    return true; // Clicked panel but not on a button
}

/**
 * Handle click on ship info panel
 * Ships cannot repair themselves - this just checks if click was on panel
 * @returns {boolean} true if handled
 */
export function handleShipInfoPanelClick(mouseX, mouseY, shipInfoPanelBounds, gameState) {
    if (!shipInfoPanelBounds) return false;

    const sip = shipInfoPanelBounds;
    if (mouseX < sip.x || mouseX > sip.x + sip.width ||
        mouseY < sip.y || mouseY > sip.y + sip.height) {
        return false;
    }

    return true; // Clicked panel
}

/**
 * Handle Shift+right-click on enemy port to set up plunder route
 * Ships will load resources from enemy port storage and bring them to home port
 * Requires shift key to distinguish from attack command
 * @returns {boolean} true if handled
 */
export function handleTradeRouteClick(gameState, map, worldX, worldY, hexToPixel, SELECTION_RADIUS, isShiftHeld = false) {
    // Plunder requires shift key
    if (!isShiftHeld) return false;
    const selectedShips = getSelectedShips(gameState);
    if (selectedShips.length === 0) return false;

    const homePortIndex = getHomePortIndex(gameState, map);
    if (homePortIndex === null) return false; // No home port, can't set up plunder routes

    // Get the owner of the first selected ship
    const firstShip = selectedShips[0];
    const shipOwner = firstShip.owner || 'player';

    // Check enemy ports only (different owner than ship)
    for (let i = 0; i < gameState.ports.length; i++) {
        const port = gameState.ports[i];
        if (port.construction) continue;

        // Only allow plundering enemy ports
        const portOwner = port.owner || 'player';
        if (portOwner === shipOwner) continue; // Skip friendly ports

        const portPos = hexToPixel(port.q, port.r);
        const dx = worldX - portPos.x;
        const dy = worldY - portPos.y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist < SELECTION_RADIUS) {
            const adjacentWater = findFreeAdjacentWater(map, port.q, port.r, gameState.ships);

            for (const sel of gameState.selectedUnits) {
                if (sel.type !== 'ship') continue;
                if (isShipBuildingPort(sel.index, gameState.ports)) continue;
                if (isShipBuildingTower(sel.index, gameState.towers)) continue;

                const ship = gameState.ships[sel.index];
                if (isPirateShip(ship)) continue; // Can't control enemy ships
                ship.tradeRoute = { foreignPortIndex: i, homePortIndex: homePortIndex };
                ship.isPlundering = true;
                ship.dockingState = null;
                ship.waitingForDock = null;

                if (adjacentWater) {
                    ship.waypoints = [{ q: adjacentWater.q, r: adjacentWater.r }];
                    ship.path = null;
                } else {
                    const waitingSpot = findNearbyWaitingHex(map, port.q, port.r, gameState.ships);
                    if (waitingSpot) {
                        ship.waypoints = [{ q: waitingSpot.q, r: waitingSpot.r }];
                        ship.path = null;
                        ship.waitingForDock = { portIndex: i, retryTimer: 0 };
                    }
                }
            }
            console.log(`Set plunder route to enemy port ${i}`);
            return true;
        }
    }
    return false;
}

/**
 * Handle Command+click on home port to unload cargo
 * @returns {boolean} true if handled
 */
export function handleHomePortUnloadClick(gameState, map, worldX, worldY, hexToPixel, SELECTION_RADIUS) {
    const homePortIndex = getHomePortIndex(gameState, map);
    if (homePortIndex === null) return false;

    const selectedShips = getSelectedShips(gameState);
    const shipsWithCargo = selectedShips.filter(ship =>
        (ship.cargo?.wood || 0) > 0
    );
    if (shipsWithCargo.length === 0) return false;

    const homePort = gameState.ports[homePortIndex];
    const portPos = hexToPixel(homePort.q, homePort.r);
    const dx = worldX - portPos.x;
    const dy = worldY - portPos.y;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (dist >= SELECTION_RADIUS) return false;

    const adjacentWater = findFreeAdjacentWater(map, homePort.q, homePort.r, gameState.ships);

    for (const sel of gameState.selectedUnits) {
        if (sel.type !== 'ship') continue;
        if (isShipBuildingPort(sel.index, gameState.ports)) continue;
        if (isShipBuildingTower(sel.index, gameState.towers)) continue;

        const ship = gameState.ships[sel.index];
        if (isPirateShip(ship)) continue; // Can't control enemy ships
        const hasCargo = (ship.cargo?.wood || 0) > 0;
        if (!hasCargo) continue;

        ship.tradeRoute = null;
        ship.dockingState = null;
        ship.pendingUnload = true;
        ship.waitingForDock = null;

        if (adjacentWater) {
            ship.waypoints = [{ q: adjacentWater.q, r: adjacentWater.r }];
            ship.path = null;
        } else {
            const waitingSpot = findNearbyWaitingHex(map, homePort.q, homePort.r, gameState.ships);
            if (waitingSpot) {
                ship.waypoints = [{ q: waitingSpot.q, r: waitingSpot.r }];
                ship.path = null;
                ship.waitingForDock = { portIndex: homePortIndex, retryTimer: 0 };
            }
        }
    }
    console.log(`Sending ${shipsWithCargo.length} ship(s) to unload at home port`);
    return true;
}

/**
 * Click handler for the worker build panel (drawn when 1+ workers are
 * selected). Returns true if the click hit a button; the caller stops
 * processing in that case.
 */
export function handleWorkerBuildPanelClick(mouseX, mouseY, panelBounds, gameState) {
    if (!panelBounds) return false;
    if (mouseX < panelBounds.x || mouseX > panelBounds.x + panelBounds.width ||
        mouseY < panelBounds.y || mouseY > panelBounds.y + panelBounds.height) {
        return false;
    }
    for (const btn of panelBounds.buttons || []) {
        if (mouseY >= btn.y && mouseY <= btn.y + btn.height) {
            // Don't pre-check resources here — `enterWorkerBuildMode` lets
            // the player see the placement preview either way; we deduct
            // and re-check on the actual placement click.
            const portType = btn.id === 'port' ? 'dock' : null;
            enterWorkerBuildMode(gameState, btn.id, portType);
            return true;
        }
    }
    return true;  // Clicked panel but missed a button — still consume
}

/**
 * Worker right-click command. If the clicked hex is a tree (inland land
 * with wood remaining), every selected worker starts a harvest loop on it.
 * If the clicked hex is plain land, every selected worker walks to it.
 * Water clicks are ignored — workers can't sail.
 *
 * Returns true if at least one worker accepted the command.
 */
export function handleWorkerCommandClick(gameState, map, clickedHex) {
    const selectedWorkers = gameState.selectedUnits
        .filter(u => u.type === 'worker')
        .map(u => gameState.workers[u.index])
        .filter(w => w && (w.owner || 'player') === localPlayerId);
    if (selectedWorkers.length === 0) return false;

    const tile = map.tiles.get(hexKey(clickedHex.q, clickedHex.r));
    if (!tile || tile.type !== 'land') return false;

    const isTreeHex = !tile.isPortSite && (tile.woodRemaining || 0) > 0 && !tile.depleted;
    let commanded = 0;
    for (const worker of selectedWorkers) {
        const ok = isTreeHex
            ? commandWorkerHarvest(worker, map, clickedHex.q, clickedHex.r)
            : commandWorkerMove(worker, map, clickedHex.q, clickedHex.r);
        if (ok) commanded++;
    }
    return commanded > 0;
}

/**
 * Click-to-select for workers (single click). Mirrors the ship branch of
 * handleUnitSelection — uses visual position so hit-testing works while
 * walking. Returns { type: 'worker', index } if a worker was selected.
 */
export function handleWorkerSelection(gameState, worldX, worldY, isShiftHeld, getWorkerVisualPos) {
    if (!gameState.workers) return null;
    const SELECT_RADIUS = 14;  // bigger than the dot so it's easy to click
    for (let i = 0; i < gameState.workers.length; i++) {
        const worker = gameState.workers[i];
        if (isNonLocal(worker.owner)) continue;
        const pos = getWorkerVisualPos(worker);
        const dx = worldX - pos.x;
        const dy = worldY - pos.y;
        if (Math.sqrt(dx * dx + dy * dy) < SELECT_RADIUS) {
            if (isShiftHeld) toggleSelection(gameState, 'worker', i);
            else selectUnit(gameState, 'worker', i);
            return { type: 'worker', index: i };
        }
    }
    return null;
}

/**
 * Handle unit selection (ship, port, or settlement)
 * @param {function} getShipVisualPos - Function to get ship visual position for smooth hit detection
 * @returns {{ type: string, index: number } | null} clicked unit info, or null if nothing clicked
 */
export function handleUnitSelection(gameState, worldX, worldY, hexToPixel, SELECTION_RADIUS, isShiftHeld, getShipVisualPos) {
    // Exit patrol mode when clicking to select units (not shift-selecting)
    if (!isShiftHeld && gameState.patrolMode.active) {
        exitPatrolMode(gameState);
    }

    // Check ships first - use visual position for hit detection during movement
    for (let i = 0; i < gameState.ships.length; i++) {
        const ship = gameState.ships[i];
        // Don't allow selecting pirate ships like player units
        if (isPirateShip(ship)) continue;
        // Don't allow selecting non-local ships (AI or remote player)
        if (isNonLocal(ship.owner)) continue;
        // Use visual position if available (smooth movement), fallback to hex position
        const shipPos = getShipVisualPos ? getShipVisualPos(ship) : hexToPixel(ship.q, ship.r);
        const dx = worldX - shipPos.x;
        const dy = worldY - shipPos.y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist < SELECTION_RADIUS) {
            if (isShiftHeld) {
                toggleSelection(gameState, 'ship', i);
            } else {
                selectUnit(gameState, 'ship', i);
            }
            console.log(`Selected ship: ${ship.type}`);
            return { type: 'ship', index: i };
        }
    }

    // Check ports
    for (let i = 0; i < gameState.ports.length; i++) {
        const port = gameState.ports[i];
        // Don't allow selecting non-local ports
        if (isNonLocal(port.owner)) continue;
        const portPos = hexToPixel(port.q, port.r);
        const dx = worldX - portPos.x;
        const dy = worldY - portPos.y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist < SELECTION_RADIUS) {
            if (isShiftHeld) {
                toggleSelection(gameState, 'port', i);
            } else {
                selectUnit(gameState, 'port', i);
            }
            console.log(`Selected port: ${port.type}`);
            return { type: 'port', index: i };
        }
    }

    // Check settlements
    for (let i = 0; i < gameState.settlements.length; i++) {
        const settlement = gameState.settlements[i];
        // Don't allow selecting non-local settlements
        if (isNonLocal(settlement.owner)) continue;
        const settlementPos = hexToPixel(settlement.q, settlement.r);
        const dx = worldX - settlementPos.x;
        const dy = worldY - settlementPos.y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist < SELECTION_RADIUS) {
            if (isShiftHeld) {
                toggleSelection(gameState, 'settlement', i);
            } else {
                selectUnit(gameState, 'settlement', i);
            }
            console.log(`Selected settlement at (${settlement.q}, ${settlement.r})`);
            return { type: 'settlement', index: i };
        }
    }

    // Check towers
    for (let i = 0; i < gameState.towers.length; i++) {
        const tower = gameState.towers[i];
        // Don't allow selecting non-local towers
        if (isNonLocal(tower.owner)) continue;
        const towerPos = hexToPixel(tower.q, tower.r);
        const dx = worldX - towerPos.x;
        const dy = worldY - towerPos.y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist < SELECTION_RADIUS) {
            if (isShiftHeld) {
                toggleSelection(gameState, 'tower', i);
            } else {
                selectUnit(gameState, 'tower', i);
            }
            console.log(`Selected tower at (${tower.q}, ${tower.r})`);
            return { type: 'tower', index: i };
        }
    }

    return null;
}

/**
 * Handle waypoint click for selected ships
 * @returns {boolean} true if waypoint was set
 */
export function handleWaypointClick(gameState, map, clickedHex, isShiftHeld) {
    const selectedShips = getSelectedShips(gameState);
    if (selectedShips.length === 0) return false;

    const tile = map.tiles.get(hexKey(clickedHex.q, clickedHex.r));

    let targetQ = clickedHex.q;
    let targetR = clickedHex.r;

    // If land, find nearest coast
    if (tile && tile.type === 'land') {
        const coast = findNearestWater(map, clickedHex.q, clickedHex.r);
        if (coast) {
            targetQ = coast.q;
            targetR = coast.r;
        } else {
            return false; // No water found
        }
    }

    // Collect valid ships that can be moved
    const validShips = [];
    const shipIndexMap = []; // Maps validShips index to gameState.ships index
    for (const sel of gameState.selectedUnits) {
        if (sel.type !== 'ship') continue;
        if (isShipBuildingPort(sel.index, gameState.ports)) continue;
        if (isShipBuildingTower(sel.index, gameState.towers)) continue;

        const ship = gameState.ships[sel.index];
        if (!ship) continue;
        if (isPirateShip(ship)) continue;
        if (isNonLocal(ship.owner)) continue;

        validShips.push(ship);
        shipIndexMap.push(sel.index);
    }

    if (validShips.length === 0) return false;

    // Build occupied hexes set for distribution
    const occupiedHexes = new Set();
    for (const s of gameState.ships) {
        occupiedHexes.add(hexKey(s.q, s.r));
    }

    // Distribute destinations when multiple ships are selected (non-shift click)
    let assignments = null;
    if (validShips.length > 1 && !isShiftHeld) {
        assignments = distributeDestinations(map, targetQ, targetR, validShips, occupiedHexes);
    }

    let movedCount = 0;
    for (let i = 0; i < validShips.length; i++) {
        const ship = validShips[i];

        if (ship.tradeRoute) {
            cancelTradeRoute(ship);
        }
        // Clear attack, patrol, and guard state when manually moving
        ship.attackTarget = null;
        ship.pendingBroadside = null;
        ship.pendingBuild = null;  // Manual move overrides any deferred build intent
        ship.patrolRoute = [];
        ship.isPatrolling = false;
        ship.guardMode = false;

        // Determine this ship's destination
        let destQ = targetQ;
        let destR = targetR;
        if (assignments) {
            // Find this ship's assigned destination
            const assignment = assignments.find(a => a.shipIndex === i);
            if (assignment) {
                destQ = assignment.q;
                destR = assignment.r;
            }
        }

        // Store original click target for waypoint marker rendering
        ship.waypointTarget = { q: targetQ, r: targetR };

        if (isShiftHeld && ship.waypoints.length > 0) {
            // Shift+click: append to queue (don't clear path - continue current movement)
            ship.waypoints.push({ q: destQ, r: destR });
            ship.showRouteLine = true;
        } else {
            // Regular click: clear and set single destination
            ship.waypoints = [{ q: destQ, r: destR }];
            ship.path = null;
            ship.showRouteLine = false;
        }
        movedCount++;
    }

    if (movedCount > 0) {
        console.log(`Set waypoint at (${targetQ}, ${targetR}) for ${movedCount} ship(s)`);
        return true;
    }
    return false;
}

/**
 * Handle patrol waypoint click - adds waypoints to patrol route
 * @returns {boolean} true if waypoint was added
 */
export function handlePatrolWaypointClick(gameState, map, clickedHex) {
    const selectedShips = getSelectedShips(gameState);
    if (selectedShips.length === 0) return false;

    const tile = map.tiles.get(hexKey(clickedHex.q, clickedHex.r));

    let targetQ = clickedHex.q;
    let targetR = clickedHex.r;

    // If land, find nearest coast
    if (tile && tile.type === 'land') {
        const coast = findNearestWater(map, clickedHex.q, clickedHex.r);
        if (coast) {
            targetQ = coast.q;
            targetR = coast.r;
        } else {
            return false; // No water found
        }
    }

    let addedCount = 0;
    for (const sel of gameState.selectedUnits) {
        if (sel.type !== 'ship') continue;
        if (isShipBuildingPort(sel.index, gameState.ports)) continue;
        if (isShipBuildingTower(sel.index, gameState.towers)) continue;

        const ship = gameState.ships[sel.index];
        if (!ship) continue; // Ship may have been destroyed
        if (isPirateShip(ship)) continue; // Can't control enemy ships
        if (isNonLocal(ship.owner)) continue; // Can't control non-local ships

        // Cancel any existing trade route
        if (ship.tradeRoute) {
            cancelTradeRoute(ship);
        }
        ship.attackTarget = null;

        // Add to patrol route
        const isFirstPatrolWaypoint = ship.patrolRoute.length === 1; // Only has initial position
        ship.patrolRoute.push({ q: targetQ, r: targetR });
        ship.isPatrolling = true;
        ship.showRouteLine = true;

        if (isFirstPatrolWaypoint) {
            // First patrol waypoint: replace existing waypoints to start patrol immediately
            ship.waypoints = [{ q: targetQ, r: targetR }];
            ship.path = null;
        } else {
            // Subsequent waypoints: append to queue (ship continues current path)
            ship.waypoints.push({ q: targetQ, r: targetR });
        }

        addedCount++;
    }

    if (addedCount > 0) {
        return true;
    }
    return false;
}

/**
 * Handle Ctrl+click to attack an enemy unit (pirate or AI-owned)
 * @param {Object} map - The game map (for finding water tiles near structures)
 * @param {function} getShipVisualPos - Function to get ship visual position for smooth hit detection
 * @returns {boolean} true if attack target was set
 */
export function handleAttackClick(gameState, map, worldX, worldY, hexToPixel, SELECTION_RADIUS, getShipVisualPos, isShiftHeld = false, isAttackMove = false) {
    const selectedShips = getSelectedShips(gameState);
    if (selectedShips.length === 0) return false;

    // Get max attack distance from selected ships (for targeting inland structures)
    let maxAttackDistance = 2;  // default
    for (const ship of selectedShips) {
        const shipData = SHIPS[ship.type];
        if (shipData && shipData.attackDistance) {
            maxAttackDistance = Math.max(maxAttackDistance, shipData.attackDistance);
        }
    }

    // Helper to set attack target for all selected player ships
    // waypointQ/waypointR can differ from targetQ/targetR for land structures
    function setAttackTargetForSelected(targetType, targetIndex, targetQ, targetR, waypointQ, waypointR) {
        let attackCount = 0;
        for (const sel of gameState.selectedUnits) {
            if (sel.type !== 'ship') continue;
            if (isShipBuildingPort(sel.index, gameState.ports)) continue;
            if (isShipBuildingTower(sel.index, gameState.towers)) continue;
            const ship = gameState.ships[sel.index];
            if (isPirateShip(ship)) continue;  // Can't control pirate ships
            if (isNonLocal(ship.owner)) continue;  // Can't control non-local ships

            ship.attackTarget = { type: targetType, index: targetIndex };
            // Standard attack overrides any queued broadside or deferred build
            ship.pendingBroadside = null;
            ship.pendingBuild = null;
            // Only allow immediate fire if not on active cooldown (prevents rapid fire exploit)
            if (!ship.attackCooldown || ship.attackCooldown <= 0) {
                ship.attackCooldown = 0;
            }
            if (ship.tradeRoute) {
                cancelTradeRoute(ship);
            }
            // Navigate to waypoint (water tile near target for structures)
            ship.waypoints = [{ q: waypointQ, r: waypointR }];
            ship.path = null;
            // Clear patrol state - manual attack takes priority
            ship.patrolRoute = [];
            ship.isPatrolling = false;
            // Attack-move (A-click) keeps guardMode so ship auto-acquires next target after kill
            ship.guardMode = isAttackMove;
            attackCount++;
        }
        return attackCount;
    }

    // Find clicked enemy ship (pirate or AI-owned)
    for (let i = 0; i < gameState.ships.length; i++) {
        const target = gameState.ships[i];
        // Target must be an enemy: pirate or non-local
        const isEnemy = isPirateShip(target) || isNonLocal(target.owner);
        if (!isEnemy) continue;

        const pos = getShipVisualPos ? getShipVisualPos(target) : hexToPixel(target.q, target.r);
        const dx = worldX - pos.x;
        const dy = worldY - pos.y;
        if (Math.sqrt(dx * dx + dy * dy) < SELECTION_RADIUS) {
            // Ships are on water, so waypoint = target position
            const attackCount = setAttackTargetForSelected('ship', i, target.q, target.r, target.q, target.r);
            if (attackCount > 0) {
                gameState.attackTargetShipIndex = i; // Track for red border visualization
                console.log(`${attackCount} ship(s) attacking enemy ship at (${target.q}, ${target.r})`);
                return true;
            }
        }
    }

    // Find clicked enemy port (non-local)
    // Skip if shift is held - that's for plundering instead of attacking
    if (!isShiftHeld) {
    for (let i = 0; i < gameState.ports.length; i++) {
        const target = gameState.ports[i];
        if (!isNonLocal(target.owner)) continue;

        const pos = hexToPixel(target.q, target.r);
        const dx = worldX - pos.x;
        const dy = worldY - pos.y;
        if (Math.sqrt(dx * dx + dy * dy) < SELECTION_RADIUS) {
            // Ports are on land - find water tile within attack range
            const waterTile = findNearestWaterInRange(map, target.q, target.r, maxAttackDistance);
            if (!waterTile) continue;  // No accessible water within range
            const attackCount = setAttackTargetForSelected('port', i, target.q, target.r, waterTile.q, waterTile.r);
            if (attackCount > 0) {
                console.log(`${attackCount} ship(s) attacking enemy port at (${target.q}, ${target.r})`);
                return true;
            }
        }
    }
    }

    // Find clicked enemy settlement (non-local)
    for (let i = 0; i < gameState.settlements.length; i++) {
        const target = gameState.settlements[i];
        if (!isNonLocal(target.owner)) continue;

        const pos = hexToPixel(target.q, target.r);
        const dx = worldX - pos.x;
        const dy = worldY - pos.y;
        if (Math.sqrt(dx * dx + dy * dy) < SELECTION_RADIUS) {
            // Settlements are on land - find water tile within attack range
            const waterTile = findNearestWaterInRange(map, target.q, target.r, maxAttackDistance);
            if (!waterTile) continue;  // No accessible water within range
            const attackCount = setAttackTargetForSelected('settlement', i, target.q, target.r, waterTile.q, waterTile.r);
            if (attackCount > 0) {
                console.log(`${attackCount} ship(s) attacking enemy settlement at (${target.q}, ${target.r})`);
                return true;
            }
        }
    }

    // Find clicked enemy tower (non-local)
    for (let i = 0; i < gameState.towers.length; i++) {
        const target = gameState.towers[i];
        if (!isNonLocal(target.owner)) continue;

        const pos = hexToPixel(target.q, target.r);
        const dx = worldX - pos.x;
        const dy = worldY - pos.y;
        if (Math.sqrt(dx * dx + dy * dy) < SELECTION_RADIUS) {
            // Towers are on land - find water tile within attack range
            const waterTile = findNearestWaterInRange(map, target.q, target.r, maxAttackDistance);
            if (!waterTile) continue;  // No accessible water within range
            const attackCount = setAttackTargetForSelected('tower', i, target.q, target.r, waterTile.q, waterTile.r);
            if (attackCount > 0) {
                console.log(`${attackCount} ship(s) attacking enemy tower at (${target.q}, ${target.r})`);
                return true;
            }
        }
    }

    return false;
}

/**
 * Handle a click while in Broadside targeting mode.
 * Searches the click location for an enemy ship/port/settlement/tower and,
 * if found, engages every selected player Cutter against it: in-range cutters
 * fire their broadside immediately, out-of-range cutters set a pendingBroadside
 * and navigate toward the target, firing the volley when they enter range.
 *
 * Returns one of:
 *   - null if no enemy was clicked (stay in mode, no notification)
 *   - { fired: true, targetType, targetId } if at least one cutter engaged
 *   - { fired: false, reason } if the target can't be reached (e.g. structure
 *     with no accessible water within attack range)
 */
export function handleBroadsideClick(gameState, map, worldX, worldY, hexToPixel, SELECTION_RADIUS, getShipVisualPos) {
    // Eligible ships: player-owned, has burstAttack config, off-cooldown, not building
    const eligibleShips = [];
    for (const sel of gameState.selectedUnits) {
        if (sel.type !== 'ship') continue;
        const ship = gameState.ships[sel.index];
        if (!ship || isPirateShip(ship)) continue;
        if (isNonLocal(ship.owner)) continue;
        if (isShipBuildingPort(sel.index, gameState.ports)) continue;
        if (isShipBuildingTower(sel.index, gameState.towers)) continue;
        const shipData = SHIPS[ship.type];
        if (!shipData || !shipData.burstAttack) continue;
        if (ship.burstCooldown > 0) continue;
        eligibleShips.push({ ship, index: sel.index });
    }
    if (eligibleShips.length === 0) return null;

    // Engage all eligible cutters against the target. In-range cutters fire
    // immediately; out-of-range cutters queue pendingBroadside and pursue.
    function engageAt(targetType, targetIndex, target, waypointQ, waypointR) {
        let engaged = 0;
        for (const { ship, index } of eligibleShips) {
            const shipData = SHIPS[ship.type];
            const attackDistance = shipData.attackDistance || 2;
            const inRange = hexDistance(ship.q, ship.r, target.q, target.r) <= attackDistance;

            ship.attackTarget = { type: targetType, index: targetIndex };
            if (ship.tradeRoute) cancelTradeRoute(ship);
            ship.patrolRoute = [];
            ship.isPatrolling = false;
            ship.guardMode = false;
            ship.waypoints = [{ q: waypointQ, r: waypointR }];
            ship.path = null;

            if (inRange && triggerBroadside(gameState, index, targetType, targetIndex)) {
                ship.pendingBroadside = null;
                engaged++;
            } else {
                ship.pendingBroadside = { type: targetType, index: targetIndex };
                engaged++;
            }
        }
        return engaged;
    }

    // Walk ships → ports → settlements → towers, same order as handleAttackClick
    for (let i = 0; i < gameState.ships.length; i++) {
        const target = gameState.ships[i];
        const isEnemy = isPirateShip(target) || isNonLocal(target.owner);
        if (!isEnemy) continue;
        const pos = getShipVisualPos ? getShipVisualPos(target) : hexToPixel(target.q, target.r);
        const dx = worldX - pos.x;
        const dy = worldY - pos.y;
        if (Math.sqrt(dx * dx + dy * dy) < SELECTION_RADIUS) {
            engageAt('ship', i, target, target.q, target.r);
            gameState.attackTargetShipIndex = i;
            return { fired: true, targetType: 'ship', targetId: target.id };
        }
    }

    // Land structures need a water tile to navigate to. Use the max attackDistance
    // across selected cutters so far-out ships can find an approach hex.
    let maxAttackDistance = 2;
    for (const { ship } of eligibleShips) {
        const ad = SHIPS[ship.type]?.attackDistance || 2;
        if (ad > maxAttackDistance) maxAttackDistance = ad;
    }

    for (let i = 0; i < gameState.ports.length; i++) {
        const target = gameState.ports[i];
        if (!isNonLocal(target.owner)) continue;
        const pos = hexToPixel(target.q, target.r);
        const dx = worldX - pos.x;
        const dy = worldY - pos.y;
        if (Math.sqrt(dx * dx + dy * dy) < SELECTION_RADIUS) {
            const waterTile = findNearestWaterInRange(map, target.q, target.r, maxAttackDistance);
            if (!waterTile) return { fired: false, reason: 'unreachable' };
            engageAt('port', i, target, waterTile.q, waterTile.r);
            return { fired: true, targetType: 'port', targetId: target.id };
        }
    }

    for (let i = 0; i < gameState.settlements.length; i++) {
        const target = gameState.settlements[i];
        if (!isNonLocal(target.owner)) continue;
        const pos = hexToPixel(target.q, target.r);
        const dx = worldX - pos.x;
        const dy = worldY - pos.y;
        if (Math.sqrt(dx * dx + dy * dy) < SELECTION_RADIUS) {
            const waterTile = findNearestWaterInRange(map, target.q, target.r, maxAttackDistance);
            if (!waterTile) return { fired: false, reason: 'unreachable' };
            engageAt('settlement', i, target, waterTile.q, waterTile.r);
            return { fired: true, targetType: 'settlement', targetId: target.id };
        }
    }

    for (let i = 0; i < gameState.towers.length; i++) {
        const target = gameState.towers[i];
        if (!isNonLocal(target.owner)) continue;
        const pos = hexToPixel(target.q, target.r);
        const dx = worldX - pos.x;
        const dy = worldY - pos.y;
        if (Math.sqrt(dx * dx + dy * dy) < SELECTION_RADIUS) {
            const waterTile = findNearestWaterInRange(map, target.q, target.r, maxAttackDistance);
            if (!waterTile) return { fired: false, reason: 'unreachable' };
            engageAt('tower', i, target, waterTile.q, waterTile.r);
            return { fired: true, targetType: 'tower', targetId: target.id };
        }
    }

    return null;
}

/**
 * Handle Command+click to set rally point for selected ports
 * Only sets rally point if ONLY ports are selected (no ships)
 * @returns {boolean} true if rally point was set
 */
export function handlePortRallyPointClick(gameState, map, clickedHex) {
    // If any ships are selected, let ship waypoint handler take over
    const hasSelectedShips = gameState.selectedUnits.some(u => u.type === 'ship');
    if (hasSelectedShips) return false;

    // Get selected ports
    const selectedPorts = gameState.selectedUnits
        .filter(u => u.type === 'port')
        .map(u => gameState.ports[u.index]);

    if (selectedPorts.length === 0) return false;

    // Find valid water target (same logic as ship waypoints)
    let targetQ = clickedHex.q;
    let targetR = clickedHex.r;
    const tile = map.tiles.get(hexKey(clickedHex.q, clickedHex.r));

    // If land, find nearest coast
    if (tile && tile.type === 'land') {
        const coast = findNearestWater(map, clickedHex.q, clickedHex.r);
        if (coast) {
            targetQ = coast.q;
            targetR = coast.r;
        } else {
            return false; // No water found
        }
    }

    // Set rally point for all selected ports
    let setCount = 0;
    for (const port of selectedPorts) {
        port.rallyPoint = { q: targetQ, r: targetR };
        setCount++;
    }

    if (setCount > 0) {
        console.log(`Set rally point at (${targetQ}, ${targetR}) for ${setCount} port(s)`);
        return true;
    }
    return false;
}

/**
 * Handle click on build queue panel to cancel items
 * @returns {boolean} true if handled
 */
export function handleBuildQueueClick(mouseX, mouseY, buildQueuePanelBounds, gameState) {
    if (!buildQueuePanelBounds) return false;

    const bp = buildQueuePanelBounds;

    // Check if click is within panel bounds
    if (mouseX < bp.x || mouseX > bp.x + bp.width ||
        mouseY < bp.y || mouseY > bp.y + bp.height) {
        return false;
    }

    // Check each queue item
    for (const item of bp.items) {
        if (mouseX >= item.x && mouseX <= item.x + item.width &&
            mouseY >= item.y && mouseY <= item.y + item.height) {

            const port = gameState.ports[item.portIndex];
            if (!port) return true;

            // Cancel the build item
            if (cancelBuildItem(port, item.index, getLocalResources(gameState))) {
                const shipData = SHIPS[item.shipType];
                queueNetCmd(COMMAND_TYPES.CANCEL_BUILD, { portId: port.id, queueIndex: item.index });
                if (item.isActive) {
                    console.log(`Cancelled active build: ${item.shipType} (refunded ${shipData.cost.wood} wood)`);
                } else {
                    console.log(`Removed from queue: ${item.shipType}`);
                }
            }
            return true;
        }
    }

    return true; // Clicked panel but not on an item
}
