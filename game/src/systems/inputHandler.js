// Input handling helpers for click interactions
import { PORTS, SHIPS, TOWERS } from "../sprites/index.js";
import {
    canAfford, deductCost, createPort, exitPortBuildMode,
    createSettlement, exitSettlementBuildMode, enterPortBuildMode, enterSettlementBuildMode,
    createTower, exitTowerBuildMode, enterTowerBuildMode,
    startBuilding, startPortUpgrade, isPortBuildingSettlement,
    selectUnit, toggleSelection, getSelectedShips, isShipBuildingPort, isShipBuildingTower,
    clearSelection, cancelTradeRoute,
    findFreeAdjacentWater, findNearbyWaitingHex
} from "../gameState.js";
import { hexKey } from "../hex.js";
import { findNearestWater } from "../pathfinding.js";

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

        const newSettlement = createSettlement(hex.q, hex.r, true, builderPortIndex);
        gameState.settlements.push(newSettlement);

        console.log(`Started building settlement at (${hex.q}, ${hex.r}) by port ${builderPortIndex}`);
        exitSettlementBuildMode(gameState);
    }
    return true;
}

/**
 * Handle click in tower placement mode
 * @returns {boolean} true if handled, false to continue processing
 */
export function handleTowerPlacementClick(gameState) {
    if (!gameState.towerBuildMode.active) return false;

    if (gameState.towerBuildMode.hoveredHex) {
        const hex = gameState.towerBuildMode.hoveredHex;
        const builderShipIndex = gameState.towerBuildMode.builderShipIndex;
        const towerData = TOWERS.tower;

        if (!canAfford(gameState.resources, towerData.cost)) {
            console.log(`Can't afford tower`);
            exitTowerBuildMode(gameState);
            return true;
        }
        deductCost(gameState.resources, towerData.cost);

        const newTower = createTower('tower', hex.q, hex.r, true, builderShipIndex);
        gameState.towers.push(newTower);

        console.log(`Started building tower at (${hex.q}, ${hex.r}) by ship ${builderShipIndex}`);
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

    // Check tower button
    if (sbp.towerButton) {
        const tbtn = sbp.towerButton;
        if (mouseY >= tbtn.y && mouseY <= tbtn.y + tbtn.height) {
            const towerData = TOWERS.tower;
            if (canAfford(gameState.resources, towerData.cost)) {
                enterTowerBuildMode(gameState, sbp.shipIndex);
                console.log(`Entering tower placement mode`);
            }
            return true;
        }
    }

    return true; // Clicked panel but not button
}

/**
 * Handle click on port build panel (ship building, upgrades, settlement building)
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
    for (const btn of bp.buttons) {
        if (mouseY >= btn.y && mouseY <= btn.y + btn.height) {
            const selectedPortIndices = gameState.selectedUnits.filter(u => u.type === 'port');
            if (selectedPortIndices.length === 1) {
                const portIdx = selectedPortIndices[0].index;
                const port = gameState.ports[portIdx];
                const shipData = SHIPS[btn.shipType];
                const portBusy = port.buildQueue || isPortBuildingSettlement(portIdx, gameState.settlements);
                if (!portBusy && canAfford(gameState.resources, shipData.cost)) {
                    deductCost(gameState.resources, shipData.cost);
                    startBuilding(port, btn.shipType);
                    console.log(`Started building: ${btn.shipType}`);
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
                const portBusy = port.buildQueue || isPortBuildingSettlement(portIdx, gameState.settlements);
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
            if (!isPortBuildingSettlement(bp.portIndex, gameState.settlements)) {
                enterSettlementBuildMode(gameState, bp.portIndex);
                console.log(`Entering settlement placement mode from port ${bp.portIndex}`);
            }
            return true;
        }
    }

    return true; // Clicked panel but not on a button
}

/**
 * Handle Command+click on foreign port to set up trade route
 * @returns {boolean} true if handled
 */
export function handleTradeRouteClick(gameState, map, worldX, worldY, hexToPixel, SELECTION_RADIUS) {
    const selectedShips = getSelectedShips(gameState);
    if (selectedShips.length === 0) return false;

    // Check foreign ports only (index > 0)
    for (let i = 1; i < gameState.ports.length; i++) {
        const port = gameState.ports[i];
        if (port.construction) continue;

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
                ship.tradeRoute = { foreignPortIndex: i, homePortIndex: 0 };
                ship.dockingState = null;
                ship.waitingForDock = null;

                if (adjacentWater) {
                    ship.waypoint = { q: adjacentWater.q, r: adjacentWater.r };
                    ship.path = null;
                    ship.moveProgress = 0;
                } else {
                    const waitingSpot = findNearbyWaitingHex(map, port.q, port.r, gameState.ships);
                    if (waitingSpot) {
                        ship.waypoint = { q: waitingSpot.q, r: waitingSpot.r };
                        ship.path = null;
                        ship.moveProgress = 0;
                        ship.waitingForDock = { portIndex: i, retryTimer: 0 };
                    }
                }
            }
            console.log(`Set trade route to foreign port ${i}`);
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
    if (gameState.ports.length === 0) return false;

    const selectedShips = getSelectedShips(gameState);
    const shipsWithCargo = selectedShips.filter(ship =>
        (ship.cargo?.wood || 0) + (ship.cargo?.food || 0) > 0
    );
    if (shipsWithCargo.length === 0) return false;

    const homePort = gameState.ports[0];
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
        const hasCargo = (ship.cargo?.wood || 0) + (ship.cargo?.food || 0) > 0;
        if (!hasCargo) continue;

        ship.tradeRoute = null;
        ship.dockingState = null;
        ship.pendingUnload = true;
        ship.waitingForDock = null;

        if (adjacentWater) {
            ship.waypoint = { q: adjacentWater.q, r: adjacentWater.r };
            ship.path = null;
            ship.moveProgress = 0;
        } else {
            const waitingSpot = findNearbyWaitingHex(map, homePort.q, homePort.r, gameState.ships);
            if (waitingSpot) {
                ship.waypoint = { q: waitingSpot.q, r: waitingSpot.r };
                ship.path = null;
                ship.moveProgress = 0;
                ship.waitingForDock = { portIndex: 0, retryTimer: 0 };
            }
        }
    }
    console.log(`Sending ${shipsWithCargo.length} ship(s) to unload at home port`);
    return true;
}

/**
 * Handle unit selection (ship, port, or settlement)
 * @returns {boolean} true if a unit was clicked
 */
export function handleUnitSelection(gameState, worldX, worldY, hexToPixel, SELECTION_RADIUS, isShiftHeld) {
    // Check ships first
    for (let i = 0; i < gameState.ships.length; i++) {
        const ship = gameState.ships[i];
        const shipPos = hexToPixel(ship.q, ship.r);
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
            return true;
        }
    }

    // Check ports
    for (let i = 0; i < gameState.ports.length; i++) {
        const port = gameState.ports[i];
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
            return true;
        }
    }

    // Check settlements
    for (let i = 0; i < gameState.settlements.length; i++) {
        const settlement = gameState.settlements[i];
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
            return true;
        }
    }

    // Check towers
    for (let i = 0; i < gameState.towers.length; i++) {
        const tower = gameState.towers[i];
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
            return true;
        }
    }

    return false;
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
        if (ship.type === 'pirate') continue; // Can't control enemy ships
        if (ship.tradeRoute) {
            cancelTradeRoute(ship);
        }
        ship.attackTarget = null;  // Clear attack target when manually moving
        ship.waypoint = { q: targetQ, r: targetR };
        ship.path = null;
        ship.moveProgress = 0;
        movedCount++;
    }

    if (movedCount > 0) {
        console.log(`Set waypoint at (${targetQ}, ${targetR}) for ${movedCount} ship(s)`);
        return true;
    }
    return false;
}

/**
 * Handle Ctrl+click to attack a pirate ship
 * @returns {boolean} true if attack target was set
 */
export function handleAttackClick(gameState, worldX, worldY, hexToPixel, SELECTION_RADIUS) {
    const selectedShips = getSelectedShips(gameState);
    if (selectedShips.length === 0) return false;

    // Find clicked pirate ship
    for (let i = 0; i < gameState.ships.length; i++) {
        const target = gameState.ships[i];
        if (target.type !== 'pirate') continue;

        const pos = hexToPixel(target.q, target.r);
        const dx = worldX - pos.x;
        const dy = worldY - pos.y;
        if (Math.sqrt(dx * dx + dy * dy) < SELECTION_RADIUS) {
            // Set attack target for all selected player ships
            let attackCount = 0;
            for (const sel of gameState.selectedUnits) {
                if (sel.type !== 'ship') continue;
                if (isShipBuildingPort(sel.index, gameState.ports)) continue;
                if (isShipBuildingTower(sel.index, gameState.towers)) continue;
                const ship = gameState.ships[sel.index];
                if (ship.type === 'pirate') continue;  // Can't control enemy ships

                ship.attackTarget = { type: 'ship', index: i };
                if (ship.tradeRoute) {
                    cancelTradeRoute(ship);
                }
                ship.waypoint = { q: target.q, r: target.r };
                ship.path = null;
                attackCount++;
            }
            if (attackCount > 0) {
                console.log(`${attackCount} ship(s) attacking pirate at (${target.q}, ${target.r})`);
                return true;
            }
        }
    }
    return false;
}
