// Trade route system - handles loading, unloading, and docking at ports
import { findFreeAdjacentWater, isShipAdjacentToPort, getCargoSpace, cancelTradeRoute, findNearbyWaitingHex, getHomePortIndex } from "../gameState.js";
import { SHIPS } from "../sprites/index.js";
import { hexDistance } from "../hex.js";

// Loading/unloading speed
const LOAD_TIME_PER_UNIT = 1.0;  // seconds per wood unit

// Dock retry interval for waiting ships
const DOCK_RETRY_INTERVAL = 2.0;

// Max time AI ships will wait at a blocked dock before giving up
const MAX_DOCK_WAIT_TIME = 5.0;

/**
 * Get the global resources object for a given owner
 */
function getResourcesForOwner(gameState, owner) {
    if (owner === 'ai1' && gameState.aiPlayers?.[0]) {
        return gameState.aiPlayers[0].resources;
    } else if (owner === 'ai2' && gameState.aiPlayers?.[1]) {
        return gameState.aiPlayers[1].resources;
    } else {
        return gameState.resources;
    }
}

/**
 * Updates all trade route logic including loading, unloading, and dock waiting
 * @param {Object} gameState - The game state
 * @param {Object} map - The game map
 * @param {number} dt - Delta time (already scaled by timeScale)
 */
export function updateTradeRoutes(gameState, map, dt) {
    if (dt === 0) return; // Paused

    // Process trade route state machine for each ship
    for (const ship of gameState.ships) {
        if (!ship.tradeRoute) continue;

        const foreignPort = gameState.ports[ship.tradeRoute.foreignPortIndex];
        const homePort = gameState.ports[ship.tradeRoute.homePortIndex];

        // Check if foreign port still exists and is complete
        if (!foreignPort || foreignPort.construction) {
            cancelTradeRoute(ship);
            continue;
        }

        // For plunder routes, validate port is still enemy-owned
        if (ship.isPlundering) {
            const shipOwner = ship.owner || 'player';
            const portOwner = foreignPort.owner || 'player';
            if (portOwner === shipOwner) {
                // Port was captured - cancel plunder route
                cancelTradeRoute(ship);
                continue;
            }
        }

        // Initialize cargo if not present (for ships created before this feature)
        if (!ship.cargo) ship.cargo = { wood: 0 };

        const isAtForeignPort = isShipAdjacentToPort(ship, foreignPort) && ship.waypoints.length === 0;
        const isAtHomePort = isShipAdjacentToPort(ship, homePort) && ship.waypoints.length === 0;

        // Handle LOADING state (plundering from enemy's global resources)
        if (ship.dockingState?.action === 'loading') {
            ship.dockingState.progress += dt;

            const unitsToLoad = Math.floor(ship.dockingState.progress / LOAD_TIME_PER_UNIT);

            if (unitsToLoad > ship.dockingState.unitsTransferred) {
                // Transfer resources from enemy's global pool to ship
                const toLoad = unitsToLoad - ship.dockingState.unitsTransferred;
                const enemyOwner = foreignPort.owner || 'player';
                const enemyResources = getResourcesForOwner(gameState, enemyOwner);

                for (let i = 0; i < toLoad; i++) {
                    const space = getCargoSpace(ship, SHIPS);
                    if (space <= 0) break;

                    if (enemyResources.wood > 0) {
                        enemyResources.wood--;
                        ship.cargo.wood++;
                        ship.dockingState.unitsTransferred++;
                    }
                }
            }

            // Check if loading complete
            const enemyOwner = foreignPort.owner || 'player';
            const enemyResources = getResourcesForOwner(gameState, enemyOwner);
            const enemyEmpty = enemyResources.wood === 0;
            const cargoFull = getCargoSpace(ship, SHIPS) === 0;
            const expectedDuration = ship.dockingState.totalUnits * LOAD_TIME_PER_UNIT;

            if (enemyEmpty || cargoFull || ship.dockingState.progress >= expectedDuration) {
                ship.dockingState = null;
                // Navigate to home port
                const homeWater = findFreeAdjacentWater(map, homePort.q, homePort.r, gameState.ships);
                if (homeWater) {
                    ship.waypoints = [{ q: homeWater.q, r: homeWater.r }];
                    ship.path = null;
                    ship.waitingForDock = null;
                } else {
                    // Dock busy - wait nearby or in place
                    const waitingSpot = findNearbyWaitingHex(map, homePort.q, homePort.r, gameState.ships);
                    if (waitingSpot) {
                        ship.waypoints = [{ q: waitingSpot.q, r: waitingSpot.r }];
                        ship.path = null;
                    }
                    // Always set waiting state
                    ship.waitingForDock = { portIndex: ship.tradeRoute.homePortIndex, retryTimer: 0 };
                }
            }
            continue;
        }

        // Handle UNLOADING state
        if (ship.dockingState?.action === 'unloading') {
            ship.dockingState.progress += dt;

            const unitsToUnload = Math.floor(ship.dockingState.progress / LOAD_TIME_PER_UNIT);

            if (unitsToUnload > ship.dockingState.unitsTransferred) {
                const toUnload = unitsToUnload - ship.dockingState.unitsTransferred;
                const shipOwner = ship.owner || 'player';
                for (let i = 0; i < toUnload; i++) {
                    if (ship.cargo.wood > 0) {
                        ship.cargo.wood--;
                        // Route to correct owner's resources
                        if (shipOwner === 'ai1' && gameState.aiPlayers?.[0]) {
                            gameState.aiPlayers[0].resources.wood++;
                        } else if (shipOwner === 'ai2' && gameState.aiPlayers?.[1]) {
                            gameState.aiPlayers[1].resources.wood++;
                        } else {
                            gameState.resources.wood++;
                        }
                        ship.dockingState.unitsTransferred++;
                    }
                }
            }

            // Check if unloading complete
            const cargoEmpty = ship.cargo.wood === 0;
            const expectedDuration = ship.dockingState.totalUnits * LOAD_TIME_PER_UNIT;

            if (cargoEmpty || ship.dockingState.progress >= expectedDuration) {
                ship.dockingState = null;
                // Return to foreign port (auto-loop)
                const foreignWater = findFreeAdjacentWater(map, foreignPort.q, foreignPort.r, gameState.ships);
                if (foreignWater) {
                    ship.waypoints = [{ q: foreignWater.q, r: foreignWater.r }];
                    ship.path = null;
                    ship.waitingForDock = null;
                } else {
                    // Dock busy - wait nearby or in place
                    const waitingSpot = findNearbyWaitingHex(map, foreignPort.q, foreignPort.r, gameState.ships);
                    if (waitingSpot) {
                        ship.waypoints = [{ q: waitingSpot.q, r: waitingSpot.r }];
                        ship.path = null;
                    }
                    // Always set waiting state (wait in place if no spot found)
                    ship.waitingForDock = { portIndex: ship.tradeRoute.foreignPortIndex, retryTimer: 0 };
                }
            }
            continue;
        }

        // Handle arrival at foreign port (start loading/plundering)
        if (isAtForeignPort && !ship.dockingState) {
            const enemyOwner = foreignPort.owner || 'player';
            const enemyResources = getResourcesForOwner(gameState, enemyOwner);
            const availableResources = enemyResources.wood;
            const space = getCargoSpace(ship, SHIPS);
            const toLoad = Math.min(availableResources, space);

            if (toLoad > 0) {
                // Start loading
                ship.dockingState = {
                    action: 'loading',
                    progress: 0,
                    totalUnits: toLoad,
                    unitsTransferred: 0,
                    targetPortIndex: ship.tradeRoute.foreignPortIndex,
                };
            }
            // If no resources, ship just waits (checked each frame)
            continue;
        }

        // Handle arrival at home port (start unloading)
        if (isAtHomePort && !ship.dockingState) {
            const cargoTotal = ship.cargo.wood;

            if (cargoTotal > 0) {
                // Start unloading
                ship.dockingState = {
                    action: 'unloading',
                    progress: 0,
                    totalUnits: cargoTotal,
                    unitsTransferred: 0,
                    targetPortIndex: ship.tradeRoute.homePortIndex,
                };
            } else {
                // No cargo - go back to foreign port
                const foreignWater = findFreeAdjacentWater(map, foreignPort.q, foreignPort.r, gameState.ships);
                if (foreignWater) {
                    ship.waypoints = [{ q: foreignWater.q, r: foreignWater.r }];
                    ship.path = null;
                    ship.waitingForDock = null;
                } else {
                    // Dock busy - wait nearby or in place
                    const waitingSpot = findNearbyWaitingHex(map, foreignPort.q, foreignPort.r, gameState.ships);
                    if (waitingSpot) {
                        ship.waypoints = [{ q: waitingSpot.q, r: waitingSpot.r }];
                        ship.path = null;
                    }
                    // Always set waiting state
                    ship.waitingForDock = { portIndex: ship.tradeRoute.foreignPortIndex, retryTimer: 0 };
                }
            }
            continue;
        }

        // Catch-all: ship has trade route but is stuck (no waypoint, not at either port, not waiting)
        // This can happen if pathfinding failed - try to navigate again
        if (ship.waypoints.length === 0 && !ship.dockingState && !ship.waitingForDock) {
            const cargoTotal = ship.cargo.wood;
            // Decide where to go based on cargo
            const targetPort = cargoTotal > 0 ? homePort : foreignPort;
            const targetPortIndex = cargoTotal > 0 ? ship.tradeRoute.homePortIndex : ship.tradeRoute.foreignPortIndex;

            const adjacentWater = findFreeAdjacentWater(map, targetPort.q, targetPort.r, gameState.ships);
            if (adjacentWater) {
                ship.waypoints = [{ q: adjacentWater.q, r: adjacentWater.r }];
                ship.path = null;
                ship.waitingForDock = null;
            } else {
                // Dock busy - wait nearby or in place
                const waitingSpot = findNearbyWaitingHex(map, targetPort.q, targetPort.r, gameState.ships);
                if (waitingSpot) {
                    ship.waypoints = [{ q: waitingSpot.q, r: waitingSpot.r }];
                    ship.path = null;
                }
                ship.waitingForDock = { portIndex: targetPortIndex, retryTimer: 0 };
            }
        }
    }

    // Handle ships with pendingUnload flag (one-time unload at home port)
    updatePendingUnloads(gameState, map, dt);

    // Handle ships waiting for dock (retry every 2 seconds)
    updateDockWaiting(gameState, map, dt);
}

/**
 * Handle ships with pendingUnload flag (one-time unload at home port)
 */
function updatePendingUnloads(gameState, map, dt) {
    const homePortIndex = getHomePortIndex(gameState, map);
    if (homePortIndex === null) return;

    const homePort = gameState.ports[homePortIndex];

    for (const ship of gameState.ships) {
        if (!ship.pendingUnload) continue;

        // Initialize cargo if not present
        if (!ship.cargo) ship.cargo = { wood: 0 };

        const isAtHomePort = isShipAdjacentToPort(ship, homePort) && ship.waypoints.length === 0;

        // Handle UNLOADING state for pendingUnload ships
        if (ship.dockingState?.action === 'unloading') {
            ship.dockingState.progress += dt;

            const unitsToUnload = Math.floor(ship.dockingState.progress / LOAD_TIME_PER_UNIT);

            if (unitsToUnload > ship.dockingState.unitsTransferred) {
                const toUnload = unitsToUnload - ship.dockingState.unitsTransferred;
                const shipOwner = ship.owner || 'player';
                for (let i = 0; i < toUnload; i++) {
                    if (ship.cargo.wood > 0) {
                        ship.cargo.wood--;
                        // Route to correct owner's resources
                        if (shipOwner === 'ai1' && gameState.aiPlayers?.[0]) {
                            gameState.aiPlayers[0].resources.wood++;
                        } else if (shipOwner === 'ai2' && gameState.aiPlayers?.[1]) {
                            gameState.aiPlayers[1].resources.wood++;
                        } else {
                            gameState.resources.wood++;
                        }
                        ship.dockingState.unitsTransferred++;
                    }
                }
            }

            // Check if unloading complete
            const cargoEmpty = ship.cargo.wood === 0;
            const expectedDuration = ship.dockingState.totalUnits * LOAD_TIME_PER_UNIT;

            if (cargoEmpty || ship.dockingState.progress >= expectedDuration) {
                ship.dockingState = null;
                ship.pendingUnload = false;  // Clear the flag, ship is done
            }
            continue;
        }

        // Start unloading when ship arrives at home port
        if (isAtHomePort && !ship.dockingState) {
            const cargoTotal = ship.cargo.wood;

            if (cargoTotal > 0) {
                ship.dockingState = {
                    action: 'unloading',
                    progress: 0,
                    totalUnits: cargoTotal,
                    unitsTransferred: 0,
                    targetPortIndex: homePortIndex,
                };
            } else {
                // No cargo - clear the flag
                ship.pendingUnload = false;
            }
        }
    }
}

/**
 * Handle ships waiting for dock (retry every DOCK_RETRY_INTERVAL seconds)
 */
function updateDockWaiting(gameState, map, dt) {
    for (const ship of gameState.ships) {
        if (!ship.waitingForDock) continue;
        // Only check when ship has arrived at waiting spot (or is waiting in place with no waypoint)
        if (ship.waypoints.length > 0 && ship.path && ship.path.length > 0) continue;

        ship.waitingForDock.retryTimer += dt;

        // Track total wait time for AI plundering ships
        ship.waitingForDock.totalWaitTime = (ship.waitingForDock.totalWaitTime || 0) + dt;

        // AI plundering ships give up after MAX_DOCK_WAIT_TIME
        if (ship.isPlundering && ship.waitingForDock.totalWaitTime >= MAX_DOCK_WAIT_TIME) {
            ship.tradeRoute = null;
            ship.isPlundering = false;
            ship.waitingForDock = null;
            continue;
        }

        // AI plundering ships abort if there are nearby threats (enemy ships or towers)
        if (ship.isPlundering) {
            const threatRange = 5;
            let hasThreat = false;

            // Check for enemy ships
            for (const other of gameState.ships) {
                if (other === ship) continue;
                if (other.owner === ship.owner) continue;  // Same owner
                const dist = hexDistance(ship.q, ship.r, other.q, other.r);
                if (dist <= threatRange) {
                    hasThreat = true;
                    break;
                }
            }

            // Check for enemy towers
            if (!hasThreat) {
                for (const tower of gameState.towers) {
                    if (tower.owner === ship.owner) continue;  // Same owner
                    if (tower.construction) continue;  // Under construction
                    const dist = hexDistance(ship.q, ship.r, tower.q, tower.r);
                    if (dist <= threatRange) {
                        hasThreat = true;
                        break;
                    }
                }
            }

            if (hasThreat) {
                // Abort plunder and let ship defend itself
                ship.tradeRoute = null;
                ship.isPlundering = false;
                ship.waitingForDock = null;
                continue;
            }
        }

        if (ship.waitingForDock.retryTimer >= DOCK_RETRY_INTERVAL) {
            ship.waitingForDock.retryTimer = 0;

            const portIndex = ship.waitingForDock.portIndex;
            const port = gameState.ports[portIndex];
            if (!port) {
                // Port no longer exists
                ship.waitingForDock = null;
                continue;
            }

            // Check if dock is now free
            const adjacentWater = findFreeAdjacentWater(map, port.q, port.r, gameState.ships);
            if (adjacentWater) {
                // Dock is free! Navigate to it
                ship.waypoints = [{ q: adjacentWater.q, r: adjacentWater.r }];
                ship.path = null;
                ship.moveProgress = 0;
                ship.waitingForDock = null;
                console.log(`Ship found free dock at port ${portIndex}`);
            }
        }
    }
}
