// Input handling helpers for click interactions
import { PORTS, SHIPS, TOWERS, SETTLEMENTS } from "../sprites/index.js";
import {
    canAfford, deductCost, createPort, exitPortBuildMode,
    createSettlement, exitSettlementBuildMode, enterPortBuildMode, enterSettlementBuildMode,
    createTower, exitTowerBuildMode, enterTowerBuildMode,
    startBuilding, addToBuildQueue, cancelBuildItem, startPortUpgrade, startTowerUpgrade, isPortBuildingSettlement, isPortBuildingTower,
    selectUnit, toggleSelection, getSelectedShips, isShipBuildingPort, isShipBuildingTower,
    clearSelection, cancelTradeRoute, exitPatrolMode,
    findFreeAdjacentWater, findNearestWaterInRange, findNearbyWaitingHex, getHomePortIndex,
    canAffordCrew, showNotification, isAIOwner
} from "../gameState.js";
import { hexKey } from "../hex.js";
import { findNearestWater } from "../pathfinding.js";
import { startRepair } from "./repair.js";

/**
 * Handle click in port placement mode
 * @returns {boolean} true if handled, false to continue processing
 */
export function handlePortPlacementClick(gameState) {
    if (!gameState.portBuildMode.active) return false;

    if (gameState.portBuildMode.hoveredHex) {
        const hex = gameState.portBuildMode.hoveredHex;
        const portType = gameState.portBuildMode.portType;
        const builderShipIndex = gameState.portBuildMode.builderShipIndex;
        const portData = PORTS[portType];

        if (!canAfford(gameState.resources, portData.cost)) {
            console.log(`Can't afford ${portType}`);
            exitPortBuildMode(gameState);
            return true;
        }
        deductCost(gameState.resources, portData.cost);

        const newPort = createPort(portType, hex.q, hex.r, true, builderShipIndex);
        gameState.ports.push(newPort);

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

        if (!canAfford(gameState.resources, settlementData.cost)) {
            console.log(`Can't afford settlement`);
            exitSettlementBuildMode(gameState);
            return true;
        }
        deductCost(gameState.resources, settlementData.cost);

        const newSettlement = createSettlement(hex.q, hex.r, true, builderPortIndex);
        gameState.settlements.push(newSettlement);

        console.log(`Started building settlement at (${hex.q}, ${hex.r}) by port ${builderPortIndex}`);
        exitSettlementBuildMode(gameState);
    }
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

        if (!canAfford(gameState.resources, watchtowerData.cost)) {
            console.log(`Can't afford ${watchtowerData.name}`);
            exitTowerBuildMode(gameState);
            return true;
        }
        if (!canAffordCrew(gameState, watchtowerData.crewCost || 0)) {
            console.log(`Not enough crew for ${watchtowerData.name}`);
            exitTowerBuildMode(gameState);
            return true;
        }
        deductCost(gameState.resources, watchtowerData.cost);

        const newTower = createTower('watchtower', hex.q, hex.r, true, builderShipIndex, builderPortIndex);
        gameState.towers.push(newTower);

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
            if (canAfford(gameState.resources, portData.cost)) {
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
            if (canAfford(gameState.resources, watchtowerData.cost)) {
                if (!canAffordCrew(gameState, watchtowerData.crewCost || 0)) {
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
export function handleBuildPanelClick(mouseX, mouseY, buildPanelBounds, gameState) {
    if (!buildPanelBounds) return false;

    const bp = buildPanelBounds;
    if (mouseX < bp.x || mouseX > bp.x + bp.width ||
        mouseY < bp.y || mouseY > bp.y + bp.height) {
        return false;
    }

    // Check ship build buttons
    const MAX_QUEUE_SIZE = 3;
    for (const btn of bp.buttons) {
        if (mouseY >= btn.y && mouseY <= btn.y + btn.height) {
            const selectedPortIndices = gameState.selectedUnits.filter(u => u.type === 'port');
            if (selectedPortIndices.length === 1) {
                const portIdx = selectedPortIndices[0].index;
                const port = gameState.ports[portIdx];
                const shipData = SHIPS[btn.shipType];

                // Check if queue is full
                if (port.buildQueue.length >= MAX_QUEUE_SIZE) {
                    showNotification(gameState, "Build queue full (max 3)");
                    return true;
                }

                // Check if port is repairing
                if (port.repair) {
                    return true;
                }

                // If queue is empty, check affordability and start immediately
                if (port.buildQueue.length === 0) {
                    if (!canAfford(gameState.resources, shipData.cost)) {
                        return true; // Can't afford
                    }
                    if (!canAffordCrew(gameState, shipData.crewCost || 0)) {
                        showNotification(gameState, "Max crew reached. Build more settlements.");
                        return true;
                    }
                    // Deduct resources and start building
                    deductCost(gameState.resources, shipData.cost);
                    addToBuildQueue(port, btn.shipType, gameState.resources, true);
                    port.buildQueue[0].progress = 0; // Mark as active
                    console.log(`Started building: ${btn.shipType}`);
                } else {
                    // Queue has items - just add to queue without resource check
                    addToBuildQueue(port, btn.shipType, gameState.resources, false);
                    console.log(`Queued: ${btn.shipType} (position ${port.buildQueue.length})`);
                }
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
                if (!portBusy && !port.construction && canAfford(gameState.resources, nextPortData.cost)) {
                    deductCost(gameState.resources, nextPortData.cost);
                    startPortUpgrade(port);
                    console.log(`Started upgrading to: ${ubtn.portType}`);
                }
            }
            return true;
        }
    }

    // Check settlement button
    if (bp.settlementButton) {
        const sbtn = bp.settlementButton;
        if (mouseY >= sbtn.y && mouseY <= sbtn.y + sbtn.height) {
            const settlementData = SETTLEMENTS.settlement;
            const port = gameState.ports[bp.portIndex];
            if (!port.repair && !isPortBuildingSettlement(bp.portIndex, gameState.settlements) && canAfford(gameState.resources, settlementData.cost)) {
                enterSettlementBuildMode(gameState, bp.portIndex);
                console.log(`Entering settlement placement mode from port ${bp.portIndex}`);
            }
            return true;
        }
    }

    // Check watchtower button
    if (bp.towerButton) {
        const tbtn = bp.towerButton;
        if (mouseY >= tbtn.y && mouseY <= tbtn.y + tbtn.height) {
            const watchtowerData = TOWERS.watchtower;
            const port = gameState.ports[bp.portIndex];
            const portBusy = port.repair || isPortBuildingTower(bp.portIndex, gameState.towers);
            if (!portBusy && canAfford(gameState.resources, watchtowerData.cost)) {
                if (!canAffordCrew(gameState, watchtowerData.crewCost || 0)) {
                    showNotification(gameState, "Max crew reached. Build more settlements.");
                } else {
                    enterTowerBuildMode(gameState, bp.portIndex, 'port');
                    console.log(`Entering watchtower placement mode from port ${bp.portIndex}`);
                }
            }
            return true;
        }
    }

    // Check repair button
    if (bp.repairButton) {
        const rbtn = bp.repairButton;
        if (mouseY >= rbtn.y && mouseY <= rbtn.y + rbtn.height) {
            const port = gameState.ports[bp.portIndex];
            if (startRepair('port', port, gameState.resources)) {
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
export function handleTowerInfoPanelClick(mouseX, mouseY, towerInfoPanelBounds, gameState) {
    if (!towerInfoPanelBounds) return false;

    const tip = towerInfoPanelBounds;
    if (mouseX < tip.x || mouseX > tip.x + tip.width ||
        mouseY < tip.y || mouseY > tip.y + tip.height) {
        return false;
    }

    // Check upgrade button
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
                if (!tower.construction && canAfford(gameState.resources, nextTowerData.cost)) {
                    if (!canAffordCrew(gameState, crewDiff)) {
                        showNotification(gameState, "Max crew reached. Build more settlements.");
                    } else {
                        deductCost(gameState.resources, nextTowerData.cost);
                        startTowerUpgrade(tower);
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
                if (startRepair('tower', tower, gameState.resources)) {
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
                if (startRepair('settlement', settlement, gameState.resources)) {
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
                if (ship.type === 'pirate') continue; // Can't control enemy ships
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
        if (ship.type === 'pirate') continue; // Can't control enemy ships
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
        if (ship.type === 'pirate') continue;
        // Don't allow selecting AI-owned ships
        if (isAIOwner(ship.owner)) continue;
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
        // Don't allow selecting AI-owned ports
        if (isAIOwner(port.owner)) continue;
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
        // Don't allow selecting AI-owned settlements
        if (isAIOwner(settlement.owner)) continue;
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
        // Don't allow selecting AI-owned towers
        if (isAIOwner(tower.owner)) continue;
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

    let movedCount = 0;
    for (const sel of gameState.selectedUnits) {
        if (sel.type !== 'ship') continue;
        if (isShipBuildingPort(sel.index, gameState.ports)) continue;
        if (isShipBuildingTower(sel.index, gameState.towers)) continue;

        const ship = gameState.ships[sel.index];
        if (!ship) continue; // Ship may have been destroyed
        if (ship.type === 'pirate') continue; // Can't control enemy ships
        if (isAIOwner(ship.owner)) continue; // Can't control AI ships
        if (ship.tradeRoute) {
            cancelTradeRoute(ship);
        }
        // Clear attack and patrol state when manually moving
        ship.attackTarget = null;
        ship.patrolRoute = [];
        ship.isPatrolling = false;

        if (isShiftHeld && ship.waypoints.length > 0) {
            // Shift+click: append to queue (don't clear path - continue current movement)
            ship.waypoints.push({ q: targetQ, r: targetR });
            ship.showRouteLine = true;  // Show route line for multi-waypoint paths
        } else {
            // Regular click: clear and set single destination
            ship.waypoints = [{ q: targetQ, r: targetR }];
            ship.path = null;
            ship.showRouteLine = false;  // Hide route line for single destinations
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
        if (ship.type === 'pirate') continue; // Can't control enemy ships
        if (isAIOwner(ship.owner)) continue; // Can't control AI ships

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
export function handleAttackClick(gameState, map, worldX, worldY, hexToPixel, SELECTION_RADIUS, getShipVisualPos, isShiftHeld = false) {
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
            if (ship.type === 'pirate') continue;  // Can't control pirate ships
            if (isAIOwner(ship.owner)) continue;  // Can't control AI ships

            ship.attackTarget = { type: targetType, index: targetIndex };
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
            // Clear patrol state - manual attack takes priority over patrol
            ship.patrolRoute = [];
            ship.isPatrolling = false;
            attackCount++;
        }
        return attackCount;
    }

    // Find clicked enemy ship (pirate or AI-owned)
    for (let i = 0; i < gameState.ships.length; i++) {
        const target = gameState.ships[i];
        // Target must be an enemy: pirate or AI-owned
        const isEnemy = target.type === 'pirate' || isAIOwner(target.owner);
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

    // Find clicked enemy port (AI-owned)
    // Skip if shift is held - that's for plundering instead of attacking
    if (!isShiftHeld) {
    for (let i = 0; i < gameState.ports.length; i++) {
        const target = gameState.ports[i];
        if (!isAIOwner(target.owner)) continue;

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

    // Find clicked enemy settlement (AI-owned)
    for (let i = 0; i < gameState.settlements.length; i++) {
        const target = gameState.settlements[i];
        if (!isAIOwner(target.owner)) continue;

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

    // Find clicked enemy tower (AI-owned)
    for (let i = 0; i < gameState.towers.length; i++) {
        const target = gameState.towers[i];
        if (!isAIOwner(target.owner)) continue;

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

            // Get the selected port
            const selectedPortIndices = gameState.selectedUnits.filter(u => u.type === 'port');
            if (selectedPortIndices.length !== 1) return true;

            const portIndex = selectedPortIndices[0].index;
            const port = gameState.ports[portIndex];

            // Cancel the build item
            if (cancelBuildItem(port, item.index, gameState.resources)) {
                const shipData = SHIPS[item.shipType];
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
