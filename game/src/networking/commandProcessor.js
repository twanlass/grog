// Host-side command validation and execution for guest commands
// Translates entity IDs to array indices, validates ownership, and applies changes

import { COMMAND_TYPES } from './commands.js';
import { PORTS, SHIPS, TOWERS, SETTLEMENTS } from '../sprites/index.js';
import {
    canAfford, deductCost, createPort, createSettlement, createTower,
    addToBuildQueue, cancelBuildItem, startPortUpgrade, startTowerUpgrade,
    findFreeAdjacentWater, findNearestWaterInRange,
    canAffordCrew, cancelTradeRoute, getHomePortIndexForOwner, getResourcesForOwner,
} from '../gameState.js';
import { findPath, findNearestWater, distributeDestinations } from '../pathfinding.js';
import { startRepair } from '../systems/repair.js';
import { hexKey } from '../hex.js';

/**
 * Process a guest command on the host side.
 * Validates ownership and applies the command to game state.
 * @param {Object} command - The command from the guest
 * @param {Object} gameState - The host's game state
 * @param {Object} map - The game map
 * @param {Object} fogState - Fog of war state (for visibility dirty marking)
 * @param {string} guestOwner - The owner ID for this guest (e.g. 'player2', 'player3', 'player4')
 * @returns {boolean} - True if command was valid and applied
 */
export function processGuestCommand(command, gameState, map, fogState, guestOwner = 'player2') {
    switch (command.type) {
        case COMMAND_TYPES.MOVE_SHIPS:
            return handleMoveShips(command, gameState, map, guestOwner);
        case COMMAND_TYPES.ATTACK:
            return handleAttack(command, gameState, map, guestOwner);
        case COMMAND_TYPES.BUILD_PORT:
            return handleBuildPort(command, gameState, map, guestOwner);
        case COMMAND_TYPES.BUILD_SETTLEMENT:
            return handleBuildSettlement(command, gameState, map, guestOwner);
        case COMMAND_TYPES.BUILD_TOWER:
            return handleBuildTower(command, gameState, map, guestOwner);
        case COMMAND_TYPES.BUILD_SHIP:
            return handleBuildShip(command, gameState, guestOwner);
        case COMMAND_TYPES.CANCEL_BUILD:
            return handleCancelBuild(command, gameState, guestOwner);
        case COMMAND_TYPES.SET_TRADE_ROUTE:
            return handleSetTradeRoute(command, gameState, guestOwner);
        case COMMAND_TYPES.SET_PATROL:
            return handleSetPatrol(command, gameState, map, guestOwner);
        case COMMAND_TYPES.SET_RALLY:
            return handleSetRally(command, gameState, map, guestOwner);
        case COMMAND_TYPES.UNLOAD_CARGO:
            return handleUnloadCargo(command, gameState, map, guestOwner);
        case COMMAND_TYPES.PLUNDER:
            return handlePlunder(command, gameState, map, guestOwner);
        case COMMAND_TYPES.UPGRADE_PORT:
            return handleUpgradePort(command, gameState, guestOwner);
        case COMMAND_TYPES.UPGRADE_TOWER:
            return handleUpgradeTower(command, gameState, guestOwner);
        case COMMAND_TYPES.REPAIR:
            return handleRepair(command, gameState, guestOwner);
        case COMMAND_TYPES.CANCEL_TRADE_ROUTE:
            return handleCancelTradeRoute(command, gameState, guestOwner);
        default:
            console.warn(`Unknown command type: ${command.type}`);
            return false;
    }
}

// ============================================================
// Helper: resolve entity ID to index with ownership validation
// ============================================================

function findShipByIdForOwner(gameState, shipId, owner) {
    const index = gameState.ships.findIndex(s => s.id === shipId && s.owner === owner);
    return index >= 0 ? index : -1;
}

function findPortByIdForOwner(gameState, portId, owner) {
    const index = gameState.ports.findIndex(p => p.id === portId && p.owner === owner);
    return index >= 0 ? index : -1;
}

function findTowerByIdForOwner(gameState, towerId, owner) {
    const index = gameState.towers.findIndex(t => t.id === towerId && t.owner === owner);
    return index >= 0 ? index : -1;
}

function findEntityById(collection, id) {
    const index = collection.findIndex(e => e.id === id);
    return index >= 0 ? index : -1;
}

// ============================================================
// Command Handlers
// ============================================================

function handleMoveShips(command, gameState, map, owner) {
    const { shipIds, waypoints, append } = command;
    if (!shipIds || !waypoints || waypoints.length === 0) return false;

    const validShipIndices = [];
    for (const id of shipIds) {
        const idx = findShipByIdForOwner(gameState, id, owner);
        if (idx >= 0) validShipIndices.push(idx);
    }
    if (validShipIndices.length === 0) return false;

    // Distribute destinations if multiple ships going to same hex
    const lastWaypoint = waypoints[waypoints.length - 1];
    const ships = validShipIndices.map(i => gameState.ships[i]);
    const occupiedHexes = new Set();
    for (const s of gameState.ships) {
        occupiedHexes.add(hexKey(s.q, s.r));
    }
    const destinations = distributeDestinations(
        map, lastWaypoint.q, lastWaypoint.r, ships, occupiedHexes
    );

    for (let i = 0; i < validShipIndices.length; i++) {
        const ship = gameState.ships[validShipIndices[i]];
        const dest = (destinations[i] ? { q: destinations[i].q, r: destinations[i].r } : lastWaypoint);

        // Cancel trade route if active
        if (ship.tradeRoute) {
            cancelTradeRoute(ship);
        }
        ship.isPatrolling = false;

        if (append && ship.waypoints.length > 0) {
            ship.waypoints.push(dest);
        } else {
            ship.waypoints = [dest];
            ship.path = null;
            ship.moveProgress = 0;
        }
        ship.attackTarget = null;
    }
    return true;
}

function handleAttack(command, gameState, map, owner) {
    const { shipIds, targetType, targetId } = command;
    if (!shipIds || !targetType || !targetId) return false;

    // Resolve target
    let targetIndex = -1;
    if (targetType === 'ship') {
        targetIndex = findEntityById(gameState.ships, targetId);
    } else if (targetType === 'port') {
        targetIndex = findEntityById(gameState.ports, targetId);
    } else if (targetType === 'settlement') {
        targetIndex = findEntityById(gameState.settlements, targetId);
    } else if (targetType === 'tower') {
        targetIndex = findEntityById(gameState.towers, targetId);
    }
    if (targetIndex < 0) return false;

    // Validate target is an enemy (not owned by this guest)
    const target = (targetType === 'ship' ? gameState.ships :
                    targetType === 'port' ? gameState.ports :
                    targetType === 'settlement' ? gameState.settlements :
                    gameState.towers)[targetIndex];
    if (target.owner === owner) return false;

    for (const id of shipIds) {
        const idx = findShipByIdForOwner(gameState, id, owner);
        if (idx < 0) continue;

        const ship = gameState.ships[idx];
        ship.attackTarget = { type: targetType, index: targetIndex };

        if (targetType === 'ship') {
            // Move toward target ship's position
            ship.waypoints = [{ q: target.q, r: target.r }];
        } else {
            // Move toward structure — find nearest water
            const waterHex = findNearestWaterInRange(map, target.q, target.r, 2);
            if (waterHex) {
                ship.waypoints = [{ q: waterHex.q, r: waterHex.r }];
            }
        }
        ship.path = null;
        ship.moveProgress = 0;
        if (ship.tradeRoute) cancelTradeRoute(ship);
        ship.isPatrolling = false;
    }
    return true;
}

function handleBuildPort(command, gameState, map, owner) {
    const { builderShipId, portType, q, r } = command;
    const shipIdx = findShipByIdForOwner(gameState, builderShipId, owner);
    if (shipIdx < 0) return false;

    const portData = PORTS[portType];
    if (!portData) return false;

    const resources = getResourcesForOwner(gameState, owner);
    if (!resources || !canAfford(resources, portData.cost)) return false;

    deductCost(resources, portData.cost);
    const newPort = createPort(portType, q, r, true, shipIdx, owner);
    gameState.ports.push(newPort);
    return true;
}

function handleBuildSettlement(command, gameState, map, owner) {
    const { builderPortId, q, r } = command;
    const portIdx = findPortByIdForOwner(gameState, builderPortId, owner);
    if (portIdx < 0) return false;

    const settlementData = SETTLEMENTS.settlement;
    const resources = getResourcesForOwner(gameState, owner);
    if (!resources || !canAfford(resources, settlementData.cost)) return false;

    deductCost(resources, settlementData.cost);
    const newSettlement = createSettlement(q, r, true, portIdx, owner);
    gameState.settlements.push(newSettlement);
    return true;
}

function handleBuildTower(command, gameState, map, owner) {
    const { builderShipId, builderPortId, q, r } = command;

    // Validate builder ownership
    if (builderShipId) {
        const idx = findShipByIdForOwner(gameState, builderShipId, owner);
        if (idx < 0) return false;
    }
    if (builderPortId) {
        const idx = findPortByIdForOwner(gameState, builderPortId, owner);
        if (idx < 0) return false;
    }

    const towerData = TOWERS.watchtower;
    const resources = getResourcesForOwner(gameState, owner);
    if (!resources || !canAfford(resources, towerData.cost)) return false;
    if (!canAffordCrew(gameState, towerData.crewCost || 0)) return false;

    deductCost(resources, towerData.cost);
    const shipIdx = builderShipId ? findShipByIdForOwner(gameState, builderShipId, owner) : null;
    const portIdx = builderPortId ? findPortByIdForOwner(gameState, builderPortId, owner) : null;
    const newTower = createTower('watchtower', q, r, true, shipIdx, portIdx, owner);
    gameState.towers.push(newTower);
    return true;
}

function handleBuildShip(command, gameState, owner) {
    const { portId, shipType } = command;
    const portIdx = findPortByIdForOwner(gameState, portId, owner);
    if (portIdx < 0) return false;

    const port = gameState.ports[portIdx];
    const shipData = SHIPS[shipType];
    if (!shipData) return false;

    // Validate port can build this ship type
    const portData = PORTS[port.type];
    const canBuild = portData.canBuild.map(n => n.toLowerCase());
    if (!canBuild.includes(shipType)) return false;

    // Queue limit
    if (port.buildQueue.length >= 5) return false;

    const resources = getResourcesForOwner(gameState, owner);
    addToBuildQueue(port, shipType, resources);
    return true;
}

function handleCancelBuild(command, gameState, owner) {
    const { portId, queueIndex } = command;
    const portIdx = findPortByIdForOwner(gameState, portId, owner);
    if (portIdx < 0) return false;

    const resources = getResourcesForOwner(gameState, owner);
    return cancelBuildItem(gameState.ports[portIdx], queueIndex, resources);
}

function handleSetTradeRoute(command, gameState, owner) {
    const { shipIds, foreignPortId, homePortId, isPlunder } = command;
    if (!shipIds) return false;

    const foreignPortIdx = findEntityById(gameState.ports, foreignPortId);
    const homePortIdx = findPortByIdForOwner(gameState, homePortId, owner);
    if (foreignPortIdx < 0 || homePortIdx < 0) return false;

    for (const id of shipIds) {
        const idx = findShipByIdForOwner(gameState, id, owner);
        if (idx < 0) continue;
        const ship = gameState.ships[idx];
        ship.tradeRoute = { foreignPortIndex: foreignPortIdx, homePortIndex: homePortIdx };
        ship.isPlundering = !!isPlunder;
        ship.waypoints = [{ q: gameState.ports[foreignPortIdx].q, r: gameState.ports[foreignPortIdx].r }];
        ship.path = null;
        ship.moveProgress = 0;
    }
    return true;
}

function handleSetPatrol(command, gameState, map, owner) {
    const { shipIds, waypoints } = command;
    if (!shipIds || !waypoints || waypoints.length === 0) return false;

    for (const id of shipIds) {
        const idx = findShipByIdForOwner(gameState, id, owner);
        if (idx < 0) continue;
        const ship = gameState.ships[idx];
        ship.patrolRoute = [...waypoints];
        ship.isPatrolling = true;
        ship.waypoints = [waypoints[0]];
        ship.path = null;
        ship.moveProgress = 0;
        if (ship.tradeRoute) cancelTradeRoute(ship);
    }
    return true;
}

function handleSetRally(command, gameState, map, owner) {
    const { portId, q, r } = command;
    const portIdx = findPortByIdForOwner(gameState, portId, owner);
    if (portIdx < 0) return false;

    const tile = map.tiles.get(hexKey(q, r));
    if (!tile || (tile.type !== 'shallow' && tile.type !== 'deep_ocean')) return false;

    gameState.ports[portIdx].rallyPoint = { q, r };
    return true;
}

function handleUnloadCargo(command, gameState, map, owner) {
    const { shipIds } = command;
    if (!shipIds) return false;

    // Find guest's home port
    const homePortIdx = getHomePortIndexForOwner(gameState, map, owner);
    if (homePortIdx === null || homePortIdx < 0) return false;
    const homePort = gameState.ports[homePortIdx];

    const adjacentWater = findFreeAdjacentWater(map, homePort.q, homePort.r, gameState.ships);

    for (const id of shipIds) {
        const idx = findShipByIdForOwner(gameState, id, owner);
        if (idx < 0) continue;
        const ship = gameState.ships[idx];
        if ((ship.cargo?.wood || 0) <= 0) continue;
        ship.pendingUnload = true;
        ship.dockingState = null;
        ship.waitingForDock = null;
        if (ship.tradeRoute) cancelTradeRoute(ship);
        ship.isPatrolling = false;

        if (adjacentWater) {
            ship.waypoints = [{ q: adjacentWater.q, r: adjacentWater.r }];
            ship.path = null;
        }
    }
    return true;
}

function handlePlunder(command, gameState, map, owner) {
    const { shipIds, targetQ, targetR } = command;
    if (!shipIds || targetQ == null || targetR == null) return false;

    // Find the enemy port at or near the target location
    let targetPortIdx = -1;
    for (let i = 0; i < gameState.ports.length; i++) {
        const port = gameState.ports[i];
        if (port.owner === owner) continue; // Skip own ports
        if (port.construction) continue;
        if (port.q === targetQ && port.r === targetR) {
            targetPortIdx = i;
            break;
        }
    }
    // If not exact match, find closest enemy port within range
    if (targetPortIdx < 0) {
        let minDist = Infinity;
        for (let i = 0; i < gameState.ports.length; i++) {
            const port = gameState.ports[i];
            if (port.owner === owner) continue;
            if (port.construction) continue;
            const dq = port.q - targetQ;
            const dr = port.r - targetR;
            const dist = Math.abs(dq) + Math.abs(dr) + Math.abs(dq + dr);
            if (dist < minDist && dist <= 3) {
                minDist = dist;
                targetPortIdx = i;
            }
        }
    }
    if (targetPortIdx < 0) return false;

    const targetPort = gameState.ports[targetPortIdx];
    const homePortIdx = getHomePortIndexForOwner(gameState, map, owner);
    if (homePortIdx === null || homePortIdx < 0) return false;

    const adjacentWater = findFreeAdjacentWater(map, targetPort.q, targetPort.r, gameState.ships);

    for (const id of shipIds) {
        const idx = findShipByIdForOwner(gameState, id, owner);
        if (idx < 0) continue;
        const ship = gameState.ships[idx];
        ship.tradeRoute = { foreignPortIndex: targetPortIdx, homePortIndex: homePortIdx };
        ship.isPlundering = true;
        ship.dockingState = null;
        ship.waitingForDock = null;

        if (adjacentWater) {
            ship.waypoints = [{ q: adjacentWater.q, r: adjacentWater.r }];
            ship.path = null;
        }
    }
    return true;
}

function handleUpgradePort(command, gameState, owner) {
    const { portId } = command;
    const portIdx = findPortByIdForOwner(gameState, portId, owner);
    if (portIdx < 0) return false;

    const port = gameState.ports[portIdx];
    const nextType = port.type === 'dock' ? 'shipyard' : port.type === 'shipyard' ? 'stronghold' : null;
    if (!nextType) return false;

    const portData = PORTS[nextType];
    const resources = getResourcesForOwner(gameState, owner);
    if (!resources || !canAfford(resources, portData.cost)) return false;

    deductCost(resources, portData.cost);
    return startPortUpgrade(port);
}

function handleUpgradeTower(command, gameState, owner) {
    const { towerId } = command;
    const towerIdx = findTowerByIdForOwner(gameState, towerId, owner);
    if (towerIdx < 0) return false;

    const tower = gameState.towers[towerIdx];
    const nextType = tower.type === 'watchtower' ? 'garrison' : tower.type === 'garrison' ? 'fortress' : null;
    if (!nextType) return false;

    const towerData = TOWERS[nextType];
    const resources = getResourcesForOwner(gameState, owner);
    if (!resources || !canAfford(resources, towerData.cost)) return false;

    deductCost(resources, towerData.cost);
    return startTowerUpgrade(tower);
}

function handleRepair(command, gameState, owner) {
    const { entityType, entityId } = command;
    const resources = getResourcesForOwner(gameState, owner);
    if (!resources) return false;

    if (entityType === 'port') {
        const idx = findPortByIdForOwner(gameState, entityId, owner);
        if (idx < 0) return false;
        return startRepair('port', gameState.ports[idx], resources);
    } else if (entityType === 'tower') {
        const idx = findTowerByIdForOwner(gameState, entityId, owner);
        if (idx < 0) return false;
        return startRepair('tower', gameState.towers[idx], resources);
    } else if (entityType === 'settlement') {
        const idx = gameState.settlements.findIndex(s => s.id === entityId && s.owner === owner);
        if (idx < 0) return false;
        return startRepair('settlement', gameState.settlements[idx], resources);
    }
    return false;
}

function handleCancelTradeRoute(command, gameState, owner) {
    const { shipIds } = command;
    if (!shipIds) return false;

    for (const id of shipIds) {
        const idx = findShipByIdForOwner(gameState, id, owner);
        if (idx < 0) continue;
        cancelTradeRoute(gameState.ships[idx]);
    }
    return true;
}
