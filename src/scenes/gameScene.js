// Main game scene - renders the hex map
import { hexToPixel, hexCorners, HEX_SIZE, pixelToHex, hexKey, hexNeighbors, hexDistance } from "../hex.js";
import { generateMap, getTileColor, getStippleColors, TILE_TYPES } from "../mapGenerator.js";
import { createGameState, createShip, createPort, createFarm, findStartingPosition, findAdjacentWater, findFreeAdjacentWater, getBuildableShips, startBuilding, selectUnit, addToSelection, toggleSelection, isSelected, clearSelection, getSelectedUnits, getSelectedShips, enterPortBuildMode, exitPortBuildMode, isValidPortSite, getNextPortType, startPortUpgrade, isShipBuildingPort, enterFarmBuildMode, exitFarmBuildMode, isValidFarmSite, canAfford, deductCost, isPortBuildingSettlement, isShipAdjacentToPort, getCargoSpace, cancelTradeRoute, findNearbyWaitingHex } from "../gameState.js";
import { drawSprite, getSpriteSize, PORTS, SHIPS, FARMS } from "../sprites/index.js";
import { findPath, findNearestWater, findNearestAvailable } from "../pathfinding.js";
import { createFogState, initializeFog, revealRadius, isHexRevealed } from "../fogOfWar.js";

export function createGameScene(k) {
    return function gameScene() {
        // Generate the map (random each time)
        const map = generateMap({
            width: 60,
            height: 60,
        });

        // Initialize game state
        const gameState = createGameState();

        // Find starting position and place initial units
        const startTile = findStartingPosition(map);
        if (startTile) {
            // Place port
            gameState.ports.push(createPort('port', startTile.q, startTile.r));

            // Find adjacent water for ship
            const waterTile = findAdjacentWater(map, startTile.q, startTile.r);
            if (waterTile) {
                gameState.ships.push(createShip('cutter', waterTile.q, waterTile.r));
            }
        }

        // Initialize fog of war
        const fogState = createFogState();
        initializeFog(fogState, gameState);

        // Selection hit detection radius (in world units)
        const SELECTION_RADIUS = HEX_SIZE * 1.2;

        // Camera state
        let cameraX = 0;
        let cameraY = 0;
        let zoom = 1;

        // Selection box state (left-drag)
        let isLeftMouseDown = false;
        let isSelecting = false;
        let selectStartX = 0;
        let selectStartY = 0;
        let selectEndX = 0;
        let selectEndY = 0;
        const DRAG_THRESHOLD = 5;

        // Pan state (right-drag)
        let isPanning = false;
        let panStartX = 0;
        let panStartY = 0;
        let cameraStartX = 0;
        let cameraStartY = 0;

        // Build panel state (for click detection)
        let buildPanelBounds = null;  // { x, y, width, height, buttons: [{y, height, shipType}] }
        let shipBuildPanelBounds = null;  // For ship's port build panel
        let farmBuildPanelBounds = null;  // For farm build button in port panel

        // Floating numbers for resource generation animation
        const floatingNumbers = [];
        const GENERATION_INTERVAL = 30;  // seconds between resource generation
        const GENERATION_AMOUNT = 5;     // amount of each resource generated

        // Pre-calculate world positions for all tiles (once at load)
        const tilePositions = new Map();
        for (const tile of map.tiles.values()) {
            const pos = hexToPixel(tile.q, tile.r);
            tilePositions.set(tile, pos);
        }

        // Pre-create reusable color objects (for fast polygon drawing)
        const tileColors = new Map();
        for (const tile of map.tiles.values()) {
            const [r, g, b] = getTileColor(tile);
            tileColors.set(tile, k.rgb(r, g, b));
        }

        // Pre-calculate stipple data per tile (just positions and color indices)
        const tileStipples = new Map();
        for (const tile of map.tiles.values()) {
            const colors = getStippleColors(tile);
            const stippleColors = colors.map(([r, g, b]) => k.rgb(r, g, b));

            // Generate deterministic random stipple dots - fewer dots for performance
            const seed = tile.q * 1000 + tile.r;
            const dots = [];
            const numDots = 6;  // Reduced from 12

            for (let i = 0; i < numDots; i++) {
                const hash = Math.sin(seed * 9999 + i * 7777) * 10000;
                const rx = (hash - Math.floor(hash)) * 2 - 1;
                const hash2 = Math.sin(seed * 3333 + i * 5555) * 10000;
                const ry = (hash2 - Math.floor(hash2)) * 2 - 1;
                const hash3 = Math.sin(seed * 1111 + i * 2222) * 10000;
                const colorIdx = Math.floor((hash3 - Math.floor(hash3)) * 3);

                const dist = Math.sqrt(rx * rx + ry * ry);
                if (dist < 0.8) {
                    dots.push({ rx, ry, colorIdx });
                }
            }

            tileStipples.set(tile, { colors: stippleColors, dots });
        }

        // Ship movement update loop
        k.onUpdate(() => {
            const dt = k.dt() * gameState.timeScale;
            if (dt === 0) return; // Paused

            // Build set of occupied hexes (all ships)
            const occupiedHexes = new Set();
            for (const s of gameState.ships) {
                occupiedHexes.add(hexKey(s.q, s.r));
            }

            for (const ship of gameState.ships) {
                if (!ship.waypoint) continue;

                // Build blocked hexes (other ships, not this one)
                const blockedHexes = new Set(occupiedHexes);
                blockedHexes.delete(hexKey(ship.q, ship.r));

                // Calculate path if needed
                if (!ship.path) {
                    // Check if destination is blocked by another ship
                    const destKey = hexKey(ship.waypoint.q, ship.waypoint.r);
                    let targetQ = ship.waypoint.q;
                    let targetR = ship.waypoint.r;

                    if (blockedHexes.has(destKey)) {
                        // Find nearest available hex to the destination
                        const alt = findNearestAvailable(map, ship.waypoint.q, ship.waypoint.r, blockedHexes);
                        if (alt) {
                            targetQ = alt.q;
                            targetR = alt.r;
                        } else {
                            // No available hex nearby - clear waypoint
                            ship.waypoint = null;
                            continue;
                        }
                    }

                    ship.path = findPath(map, ship.q, ship.r, targetQ, targetR, blockedHexes);

                    // No valid path - clear waypoint
                    if (!ship.path) {
                        ship.waypoint = null;
                        continue;
                    }
                }

                // Move along path
                if (ship.path && ship.path.length > 0) {
                    const speed = SHIPS[ship.type].speed;
                    const currentKey = hexKey(ship.q, ship.r);

                    // Check ahead: is next hex going to be blocked?
                    const next = ship.path[0];
                    const nextKey = hexKey(next.q, next.r);

                    if (occupiedHexes.has(nextKey) && nextKey !== currentKey) {
                        // Next hex is blocked - find alternative destination near waypoint
                        const alt = findNearestAvailable(map, ship.waypoint.q, ship.waypoint.r, blockedHexes);
                        if (alt && (alt.q !== ship.q || alt.r !== ship.r)) {
                            // Recalculate path to alternative destination
                            const newPath = findPath(map, ship.q, ship.r, alt.q, alt.r, blockedHexes);
                            if (newPath && newPath.length > 0) {
                                ship.path = newPath;
                                // Don't reset moveProgress - continue smooth movement
                            } else {
                                // No valid path - stop and wait
                                ship.path = null;
                                ship.moveProgress = 0;
                            }
                        } else {
                            // Already at or near destination - stop
                            ship.waypoint = null;
                            ship.path = null;
                            ship.moveProgress = 0;
                        }
                        continue;
                    }

                    // Safe to move - update progress
                    ship.moveProgress += speed * dt;

                    // Move to next hex(es) when progress >= 1
                    while (ship.moveProgress >= 1 && ship.path.length > 0) {
                        const nextHex = ship.path[0];
                        const nextHexKey = hexKey(nextHex.q, nextHex.r);
                        const currKey = hexKey(ship.q, ship.r);

                        // Double-check occupancy (another ship may have moved here)
                        if (occupiedHexes.has(nextHexKey) && nextHexKey !== currKey) {
                            ship.path = null;
                            break;
                        }

                        // Move ship
                        ship.moveProgress -= 1;
                        ship.path.shift();
                        occupiedHexes.delete(currKey);
                        ship.q = nextHex.q;
                        ship.r = nextHex.r;
                        occupiedHexes.add(nextHexKey);

                        // Reveal fog around new position based on ship's sight distance
                        const sightDistance = SHIPS[ship.type].sight_distance;
                        revealRadius(fogState, nextHex.q, nextHex.r, sightDistance);
                    }

                    // Arrived at destination
                    if (ship.path && ship.path.length === 0) {
                        ship.waypoint = null;
                        ship.path = null;
                        ship.moveProgress = 0;
                    }
                }
            }

            // Trade route state machine (loading/unloading at ports)
            const LOAD_TIME_PER_UNIT = 1.0;  // seconds per wood/food unit

            for (const ship of gameState.ships) {
                if (!ship.tradeRoute) continue;

                const foreignPort = gameState.ports[ship.tradeRoute.foreignPortIndex];
                const homePort = gameState.ports[ship.tradeRoute.homePortIndex];

                // Check if foreign port still exists and is complete
                if (!foreignPort || foreignPort.construction) {
                    cancelTradeRoute(ship);
                    continue;
                }

                // Initialize cargo if not present (for ships created before this feature)
                if (!ship.cargo) ship.cargo = { wood: 0, food: 0 };

                const isAtForeignPort = isShipAdjacentToPort(ship, foreignPort) && !ship.waypoint;
                const isAtHomePort = isShipAdjacentToPort(ship, homePort) && !ship.waypoint;

                // Handle LOADING state
                if (ship.dockingState?.action === 'loading') {
                    ship.dockingState.progress += dt;

                    const unitsToLoad = Math.floor(ship.dockingState.progress / LOAD_TIME_PER_UNIT);

                    if (unitsToLoad > ship.dockingState.unitsTransferred) {
                        // Transfer resources from port to ship
                        const toLoad = unitsToLoad - ship.dockingState.unitsTransferred;
                        for (let i = 0; i < toLoad; i++) {
                            const space = getCargoSpace(ship, SHIPS);
                            if (space <= 0) break;

                            // Ratio-based loading: load whichever resource is further behind target
                            const ds = ship.dockingState;
                            const woodNeeded = ds.targetWood - ds.woodLoaded;
                            const foodNeeded = ds.targetFood - ds.foodLoaded;

                            let loaded = false;
                            // Prefer loading whichever is further behind (or either if equal)
                            if (woodNeeded >= foodNeeded && foreignPort.storage.wood > 0) {
                                foreignPort.storage.wood--;
                                ship.cargo.wood++;
                                ds.woodLoaded++;
                                ds.unitsTransferred++;
                                loaded = true;
                            } else if (foodNeeded > 0 && foreignPort.storage.food > 0) {
                                foreignPort.storage.food--;
                                ship.cargo.food++;
                                ds.foodLoaded++;
                                ds.unitsTransferred++;
                                loaded = true;
                            }

                            // Fallback if preferred resource ran out
                            if (!loaded) {
                                if (foreignPort.storage.wood > 0) {
                                    foreignPort.storage.wood--;
                                    ship.cargo.wood++;
                                    ds.woodLoaded++;
                                    ds.unitsTransferred++;
                                } else if (foreignPort.storage.food > 0) {
                                    foreignPort.storage.food--;
                                    ship.cargo.food++;
                                    ds.foodLoaded++;
                                    ds.unitsTransferred++;
                                }
                            }
                        }
                    }

                    // Check if loading complete
                    const portEmpty = foreignPort.storage.wood === 0 && foreignPort.storage.food === 0;
                    const cargoFull = getCargoSpace(ship, SHIPS) === 0;
                    const expectedDuration = ship.dockingState.totalUnits * LOAD_TIME_PER_UNIT;

                    if (portEmpty || cargoFull || ship.dockingState.progress >= expectedDuration) {
                        ship.dockingState = null;
                        // Navigate to home port
                        const homeWater = findFreeAdjacentWater(map, homePort.q, homePort.r, gameState.ships);
                        if (homeWater) {
                            ship.waypoint = { q: homeWater.q, r: homeWater.r };
                            ship.path = null;
                            ship.waitingForDock = null;
                        } else {
                            // Dock busy - wait nearby or in place
                            const waitingSpot = findNearbyWaitingHex(map, homePort.q, homePort.r, gameState.ships);
                            if (waitingSpot) {
                                ship.waypoint = { q: waitingSpot.q, r: waitingSpot.r };
                                ship.path = null;
                            }
                            // Always set waiting state
                            ship.waitingForDock = { portIndex: 0, retryTimer: 0 };
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
                        for (let i = 0; i < toUnload; i++) {
                            // Unload wood first, then food
                            if (ship.cargo.wood > 0) {
                                ship.cargo.wood--;
                                gameState.resources.wood++;
                                ship.dockingState.unitsTransferred++;
                            } else if (ship.cargo.food > 0) {
                                ship.cargo.food--;
                                gameState.resources.food++;
                                ship.dockingState.unitsTransferred++;
                            }
                        }
                    }

                    // Check if unloading complete
                    const cargoEmpty = ship.cargo.wood === 0 && ship.cargo.food === 0;
                    const expectedDuration = ship.dockingState.totalUnits * LOAD_TIME_PER_UNIT;

                    if (cargoEmpty || ship.dockingState.progress >= expectedDuration) {
                        ship.dockingState = null;
                        // Return to foreign port (auto-loop)
                        const foreignWater = findFreeAdjacentWater(map, foreignPort.q, foreignPort.r, gameState.ships);
                        if (foreignWater) {
                            ship.waypoint = { q: foreignWater.q, r: foreignWater.r };
                            ship.path = null;
                            ship.waitingForDock = null;
                        } else {
                            // Dock busy - wait nearby or in place
                            const waitingSpot = findNearbyWaitingHex(map, foreignPort.q, foreignPort.r, gameState.ships);
                            if (waitingSpot) {
                                ship.waypoint = { q: waitingSpot.q, r: waitingSpot.r };
                                ship.path = null;
                            }
                            // Always set waiting state (wait in place if no spot found)
                            ship.waitingForDock = { portIndex: ship.tradeRoute.foreignPortIndex, retryTimer: 0 };
                        }
                    }
                    continue;
                }

                // Handle arrival at foreign port (start loading)
                if (isAtForeignPort && !ship.dockingState) {
                    const availableResources = foreignPort.storage.wood + foreignPort.storage.food;
                    const space = getCargoSpace(ship, SHIPS);
                    const toLoad = Math.min(availableResources, space);

                    if (toLoad > 0) {
                        // Calculate target amounts based on port's resource ratio
                        const totalInPort = foreignPort.storage.wood + foreignPort.storage.food;
                        const woodRatio = totalInPort > 0 ? foreignPort.storage.wood / totalInPort : 0.5;
                        const targetWood = Math.round(toLoad * woodRatio);
                        const targetFood = toLoad - targetWood;

                        // Start loading
                        ship.dockingState = {
                            action: 'loading',
                            progress: 0,
                            totalUnits: toLoad,
                            unitsTransferred: 0,
                            targetPortIndex: ship.tradeRoute.foreignPortIndex,
                            // Ratio-based loading targets
                            targetWood: targetWood,
                            targetFood: targetFood,
                            woodLoaded: 0,
                            foodLoaded: 0,
                        };
                    }
                    // If no resources, ship just waits (checked each frame)
                    continue;
                }

                // Handle arrival at home port (start unloading)
                if (isAtHomePort && !ship.dockingState) {
                    const cargoTotal = ship.cargo.wood + ship.cargo.food;

                    if (cargoTotal > 0) {
                        // Start unloading
                        ship.dockingState = {
                            action: 'unloading',
                            progress: 0,
                            totalUnits: cargoTotal,
                            unitsTransferred: 0,
                            targetPortIndex: 0,
                        };
                    } else {
                        // No cargo - go back to foreign port
                        const foreignWater = findFreeAdjacentWater(map, foreignPort.q, foreignPort.r, gameState.ships);
                        if (foreignWater) {
                            ship.waypoint = { q: foreignWater.q, r: foreignWater.r };
                            ship.path = null;
                            ship.waitingForDock = null;
                        } else {
                            // Dock busy - wait nearby or in place
                            const waitingSpot = findNearbyWaitingHex(map, foreignPort.q, foreignPort.r, gameState.ships);
                            if (waitingSpot) {
                                ship.waypoint = { q: waitingSpot.q, r: waitingSpot.r };
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
                if (!ship.waypoint && !ship.dockingState && !ship.waitingForDock) {
                    const cargoTotal = ship.cargo.wood + ship.cargo.food;
                    // Decide where to go based on cargo
                    const targetPort = cargoTotal > 0 ? homePort : foreignPort;
                    const targetPortIndex = cargoTotal > 0 ? 0 : ship.tradeRoute.foreignPortIndex;

                    const adjacentWater = findFreeAdjacentWater(map, targetPort.q, targetPort.r, gameState.ships);
                    if (adjacentWater) {
                        ship.waypoint = { q: adjacentWater.q, r: adjacentWater.r };
                        ship.path = null;
                        ship.waitingForDock = null;
                    } else {
                        // Dock busy - wait nearby or in place
                        const waitingSpot = findNearbyWaitingHex(map, targetPort.q, targetPort.r, gameState.ships);
                        if (waitingSpot) {
                            ship.waypoint = { q: waitingSpot.q, r: waitingSpot.r };
                            ship.path = null;
                        }
                        ship.waitingForDock = { portIndex: targetPortIndex, retryTimer: 0 };
                    }
                }
            }

            // Handle ships with pendingUnload flag (one-time unload at home port)
            if (gameState.ports.length > 0) {
                const homePort = gameState.ports[0];
                for (const ship of gameState.ships) {
                    if (!ship.pendingUnload) continue;

                    // Initialize cargo if not present
                    if (!ship.cargo) ship.cargo = { wood: 0, food: 0 };

                    const isAtHomePort = isShipAdjacentToPort(ship, homePort) && !ship.waypoint;

                    // Handle UNLOADING state for pendingUnload ships
                    if (ship.dockingState?.action === 'unloading') {
                        ship.dockingState.progress += dt;

                        const unitsToUnload = Math.floor(ship.dockingState.progress / LOAD_TIME_PER_UNIT);

                        if (unitsToUnload > ship.dockingState.unitsTransferred) {
                            const toUnload = unitsToUnload - ship.dockingState.unitsTransferred;
                            for (let i = 0; i < toUnload; i++) {
                                if (ship.cargo.wood > 0) {
                                    ship.cargo.wood--;
                                    gameState.resources.wood++;
                                    ship.dockingState.unitsTransferred++;
                                } else if (ship.cargo.food > 0) {
                                    ship.cargo.food--;
                                    gameState.resources.food++;
                                    ship.dockingState.unitsTransferred++;
                                }
                            }
                        }

                        // Check if unloading complete
                        const cargoEmpty = ship.cargo.wood === 0 && ship.cargo.food === 0;
                        const expectedDuration = ship.dockingState.totalUnits * LOAD_TIME_PER_UNIT;

                        if (cargoEmpty || ship.dockingState.progress >= expectedDuration) {
                            ship.dockingState = null;
                            ship.pendingUnload = false;  // Clear the flag, ship is done
                        }
                        continue;
                    }

                    // Start unloading when ship arrives at home port
                    if (isAtHomePort && !ship.dockingState) {
                        const cargoTotal = ship.cargo.wood + ship.cargo.food;

                        if (cargoTotal > 0) {
                            ship.dockingState = {
                                action: 'unloading',
                                progress: 0,
                                totalUnits: cargoTotal,
                                unitsTransferred: 0,
                                targetPortIndex: 0,
                            };
                        } else {
                            // No cargo - clear the flag
                            ship.pendingUnload = false;
                        }
                    }
                }
            }

            // Handle ships waiting for dock (retry every 2 seconds)
            const DOCK_RETRY_INTERVAL = 2.0;
            for (const ship of gameState.ships) {
                if (!ship.waitingForDock) continue;
                // Only check when ship has arrived at waiting spot (or is waiting in place with no waypoint)
                if (ship.waypoint && ship.path && ship.path.length > 0) continue;

                ship.waitingForDock.retryTimer += dt;

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
                        ship.waypoint = { q: adjacentWater.q, r: adjacentWater.r };
                        ship.path = null;
                        ship.moveProgress = 0;
                        ship.waitingForDock = null;
                        console.log(`Ship found free dock at port ${portIndex}`);
                    }
                }
            }

            // Update port build progress
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
                        const newShipSight = SHIPS[ship.type].sight_distance;
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

            // Update port CONSTRUCTION progress (ports being built by ships or upgrading)
            for (const port of gameState.ports) {
                if (!port.construction) continue;

                port.construction.progress += dt;

                // Check if construction/upgrade is complete
                if (port.construction.progress >= port.construction.buildTime) {
                    // Check if this is an upgrade
                    if (port.construction.upgradeTo) {
                        const oldType = port.type;
                        port.type = port.construction.upgradeTo;
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

            // Update farm CONSTRUCTION progress
            for (const farm of gameState.farms) {
                if (!farm.construction) continue;

                farm.construction.progress += dt;

                // Check if construction is complete
                if (farm.construction.progress >= farm.construction.buildTime) {
                    console.log(`Farm construction complete at (${farm.q}, ${farm.r})`);
                    farm.construction = null;  // Clear construction state

                    // Reveal fog around completed settlement
                    const sightDistance = FARMS.farm.sight_distance;
                    revealRadius(fogState, farm.q, farm.r, sightDistance);
                }
            }

            // Update settlement RESOURCE GENERATION
            for (const farm of gameState.farms) {
                if (farm.construction) continue;  // Skip farms under construction

                farm.generationTimer = (farm.generationTimer || 0) + dt;

                if (farm.generationTimer >= GENERATION_INTERVAL) {
                    farm.generationTimer = 0;

                    const isHomePort = farm.parentPortIndex === 0;

                    if (isHomePort) {
                        // Add to global resources
                        gameState.resources.wood += GENERATION_AMOUNT;
                        gameState.resources.food += GENERATION_AMOUNT;
                    } else {
                        // Add to port's local storage
                        const port = gameState.ports[farm.parentPortIndex];
                        if (port && port.storage) {
                            port.storage.wood += GENERATION_AMOUNT;
                            port.storage.food += GENERATION_AMOUNT;
                        }
                    }

                    // Spawn floating numbers
                    floatingNumbers.push({
                        q: farm.q, r: farm.r,
                        text: `+${GENERATION_AMOUNT}`,
                        type: 'wood',
                        age: 0,
                        duration: 0.75,
                        offsetX: -30,  // Offset left for wood
                    });
                    floatingNumbers.push({
                        q: farm.q, r: farm.r,
                        text: `+${GENERATION_AMOUNT}`,
                        type: 'food',
                        age: 0,
                        duration: 0.75,
                        offsetX: 30,  // Offset right for food
                    });
                }
            }

            // Update floating numbers animation
            for (let i = floatingNumbers.length - 1; i >= 0; i--) {
                floatingNumbers[i].age += dt;
                if (floatingNumbers[i].age >= floatingNumbers[i].duration) {
                    floatingNumbers.splice(i, 1);
                }
            }
        });

        // Get interpolated visual position for smooth ship movement
        function getShipVisualPos(ship) {
            const currentPos = hexToPixel(ship.q, ship.r);

            // If moving and has next target, interpolate
            if (ship.path && ship.path.length > 0 && ship.moveProgress > 0) {
                const nextHex = ship.path[0];
                const nextPos = hexToPixel(nextHex.q, nextHex.r);

                // Lerp between current and next position
                return {
                    x: currentPos.x + (nextPos.x - currentPos.x) * ship.moveProgress,
                    y: currentPos.y + (nextPos.y - currentPos.y) * ship.moveProgress,
                };
            }

            return currentPos;
        }

        // Check if a ship is docked (on water adjacent to land, and stationary)
        function isShipDocked(ship) {
            // Must not have a waypoint (stationary)
            if (ship.waypoint !== null) return false;

            // Check if any neighbor is land
            const neighbors = hexNeighbors(ship.q, ship.r);
            for (const n of neighbors) {
                const tile = map.tiles.get(hexKey(n.q, n.r));
                if (tile && tile.type === 'land') {
                    return true;
                }
            }
            return false;
        }

        // Main render loop
        k.onDraw(() => {
            const halfWidth = k.width() / 2;
            const halfHeight = k.height() / 2;
            const margin = HEX_SIZE * zoom * 2;
            const scaledSize = HEX_SIZE * zoom;

            // Draw all visible tiles
            for (const tile of map.tiles.values()) {
                const pos = tilePositions.get(tile);
                const screenX = (pos.x - cameraX) * zoom + halfWidth;
                const screenY = (pos.y - cameraY) * zoom + halfHeight;

                // Culling - skip off-screen hexes
                if (
                    screenX < -margin ||
                    screenX > k.width() + margin ||
                    screenY < -margin ||
                    screenY > k.height() + margin
                ) {
                    continue;
                }

                // Get pre-calculated corners
                const corners = hexCorners(screenX, screenY, scaledSize);
                const pts = corners.map(c => k.vec2(c.x, c.y));

                // Draw hex base
                k.drawPolygon({
                    pts,
                    color: tileColors.get(tile),
                });

                // Draw stipple dots (only when zoomed in enough)
                if (zoom > 0.5) {
                    const stipple = tileStipples.get(tile);
                    const dotSize = Math.max(1.5, 2.5 * zoom);
                    for (const dot of stipple.dots) {
                        const dotX = screenX + dot.rx * scaledSize * 0.65;
                        const dotY = screenY + dot.ry * scaledSize * 0.65;
                        k.drawCircle({
                            pos: k.vec2(dotX, dotY),
                            radius: dotSize,
                            color: stipple.colors[dot.colorIdx],
                        });
                    }
                }
            }

            // Draw fog of war overlay for unrevealed hexes
            const fogBaseColor = k.rgb(15, 20, 30);
            const fogHatchColor = k.rgb(25, 35, 50);
            const hatchSpacing = Math.max(4, 6 * zoom);

            for (const tile of map.tiles.values()) {
                // Skip revealed hexes
                if (isHexRevealed(fogState, tile.q, tile.r)) continue;

                const pos = tilePositions.get(tile);
                const screenX = (pos.x - cameraX) * zoom + halfWidth;
                const screenY = (pos.y - cameraY) * zoom + halfHeight;

                // Culling - skip off-screen hexes
                if (
                    screenX < -margin ||
                    screenX > k.width() + margin ||
                    screenY < -margin ||
                    screenY > k.height() + margin
                ) {
                    continue;
                }

                const corners = hexCorners(screenX, screenY, scaledSize);
                const pts = corners.map(c => k.vec2(c.x, c.y));

                // Draw fog base polygon
                k.drawPolygon({
                    pts,
                    color: fogBaseColor,
                    opacity: 0.92,
                });

                // Draw diagonal hatching pattern
                const hexRadius = scaledSize;
                for (let i = -4; i <= 4; i++) {
                    const offset = i * hatchSpacing;
                    k.drawLine({
                        p1: k.vec2(screenX + offset - hexRadius, screenY - hexRadius),
                        p2: k.vec2(screenX + offset + hexRadius, screenY + hexRadius),
                        width: 1,
                        color: fogHatchColor,
                        opacity: 0.4,
                    });
                }
            }

            // Draw ports
            const unitScale = zoom * 1.5;
            for (const port of gameState.ports) {
                const pos = hexToPixel(port.q, port.r);
                const screenX = (pos.x - cameraX) * zoom + halfWidth;
                const screenY = (pos.y - cameraY) * zoom + halfHeight;

                // Skip if off screen
                if (screenX < -100 || screenX > k.width() + 100 ||
                    screenY < -100 || screenY > k.height() + 100) continue;

                const portData = PORTS[port.type];
                const spriteSize = getSpriteSize(portData.sprite, unitScale);

                // Draw port sprite (semi-transparent if under construction)
                const isConstructing = port.construction !== null;
                drawSprite(k, portData.sprite,
                    screenX - spriteSize.width / 2,
                    screenY - spriteSize.height / 2,
                    unitScale,
                    isConstructing ? 0.5 : 1.0);  // Reduced opacity if under construction

                // Draw port CONSTRUCTION progress bar (port being built by ship)
                if (port.construction) {
                    const barWidth = 50 * zoom;
                    const barHeight = 8 * zoom;
                    const barY = screenY - spriteSize.height / 2 - 20 * zoom;
                    const progress = Math.min(port.construction.progress / port.construction.buildTime, 1);

                    // Background
                    k.drawRect({
                        pos: k.vec2(screenX - barWidth / 2, barY),
                        width: barWidth,
                        height: barHeight,
                        color: k.rgb(40, 40, 40),
                        radius: 2,
                    });

                    // Fill (teal/blue for construction)
                    if (progress > 0) {
                        k.drawRect({
                            pos: k.vec2(screenX - barWidth / 2, barY),
                            width: barWidth * progress,
                            height: barHeight,
                            color: k.rgb(80, 180, 220),
                            radius: 2,
                        });
                    }

                    // "BUILDING" label
                    k.drawText({
                        text: "BUILDING",
                        pos: k.vec2(screenX, barY - 10 * zoom),
                        size: 9 * zoom,
                        anchor: "center",
                        color: k.rgb(200, 200, 200),
                    });
                }

                // Draw ship build progress bar if building a ship (existing functionality)
                if (port.buildQueue) {
                    const barWidth = 50 * zoom;
                    const barHeight = 8 * zoom;
                    const barY = screenY - spriteSize.height / 2 - 20 * zoom;
                    const progress = Math.min(port.buildQueue.progress / port.buildQueue.buildTime, 1);

                    // Background
                    k.drawRect({
                        pos: k.vec2(screenX - barWidth / 2, barY),
                        width: barWidth,
                        height: barHeight,
                        color: k.rgb(40, 40, 40),
                        radius: 2,
                    });

                    // Fill (teal/blue for construction)
                    if (progress > 0) {
                        k.drawRect({
                            pos: k.vec2(screenX - barWidth / 2, barY),
                            width: barWidth * progress,
                            height: barHeight,
                            color: k.rgb(80, 180, 220),
                            radius: 2,
                        });
                    }

                    // "BUILDING" label
                    k.drawText({
                        text: "BUILDING",
                        pos: k.vec2(screenX, barY - 10 * zoom),
                        size: 9 * zoom,
                        anchor: "center",
                        color: k.rgb(200, 200, 200),
                    });
                }
            }

            // Draw farms
            for (const farm of gameState.farms) {
                const pos = hexToPixel(farm.q, farm.r);
                const screenX = (pos.x - cameraX) * zoom + halfWidth;
                const screenY = (pos.y - cameraY) * zoom + halfHeight;

                // Skip if off screen
                if (screenX < -100 || screenX > k.width() + 100 ||
                    screenY < -100 || screenY > k.height() + 100) continue;

                const farmData = FARMS.farm;
                const spriteSize = getSpriteSize(farmData.sprite, unitScale);

                // Draw farm sprite (semi-transparent if under construction)
                const isConstructing = farm.construction !== null;
                drawSprite(k, farmData.sprite,
                    screenX - spriteSize.width / 2,
                    screenY - spriteSize.height / 2,
                    unitScale,
                    isConstructing ? 0.5 : 1.0);

                // Draw farm CONSTRUCTION progress bar
                if (farm.construction) {
                    const barWidth = 50 * zoom;
                    const barHeight = 8 * zoom;
                    const barY = screenY - spriteSize.height / 2 - 20 * zoom;
                    const progress = Math.min(farm.construction.progress / farm.construction.buildTime, 1);

                    // Background
                    k.drawRect({
                        pos: k.vec2(screenX - barWidth / 2, barY),
                        width: barWidth,
                        height: barHeight,
                        color: k.rgb(40, 40, 40),
                        radius: 2,
                    });

                    // Fill (teal/blue for construction)
                    if (progress > 0) {
                        k.drawRect({
                            pos: k.vec2(screenX - barWidth / 2, barY),
                            width: barWidth * progress,
                            height: barHeight,
                            color: k.rgb(80, 180, 220),
                            radius: 2,
                        });
                    }

                    // "BUILDING" label
                    k.drawText({
                        text: "BUILDING",
                        pos: k.vec2(screenX, barY - 10 * zoom),
                        size: 9 * zoom,
                        anchor: "center",
                        color: k.rgb(200, 200, 200),
                    });
                }
            }

            // Draw floating resource numbers
            for (const fn of floatingNumbers) {
                const pos = hexToPixel(fn.q, fn.r);
                const progress = fn.age / fn.duration;
                const offsetY = -30 - (progress * 40);  // Float upward
                const opacity = 1 - progress;  // Fade out

                const screenX = (pos.x - cameraX) * zoom + halfWidth + (fn.offsetX || 0) * zoom;
                const screenY = (pos.y - cameraY) * zoom + halfHeight + offsetY * zoom;

                const color = fn.type === 'wood'
                    ? k.rgb(180, 120, 60)   // Brown for wood
                    : k.rgb(80, 180, 80);   // Green for food

                k.drawText({
                    text: fn.text,
                    pos: k.vec2(screenX, screenY),
                    size: 28 * zoom,
                    anchor: "center",
                    color: color,
                    opacity: opacity,
                });
            }

            // Draw ships (with smooth interpolated movement)
            for (const ship of gameState.ships) {
                const pos = getShipVisualPos(ship);
                const screenX = (pos.x - cameraX) * zoom + halfWidth;
                const screenY = (pos.y - cameraY) * zoom + halfHeight;

                // Skip if off screen
                if (screenX < -100 || screenX > k.width() + 100 ||
                    screenY < -100 || screenY > k.height() + 100) continue;

                const shipData = SHIPS[ship.type];
                const spriteSize = getSpriteSize(shipData.sprite, unitScale);
                drawSprite(k, shipData.sprite,
                    screenX - spriteSize.width / 2,
                    screenY - spriteSize.height / 2,
                    unitScale);
            }

            // Draw loading/unloading progress bars for ships
            for (const ship of gameState.ships) {
                if (!ship.dockingState) continue;

                const pos = getShipVisualPos(ship);
                const screenX = (pos.x - cameraX) * zoom + halfWidth;
                const screenY = (pos.y - cameraY) * zoom + halfHeight;

                // Skip if off screen
                if (screenX < -100 || screenX > k.width() + 100 ||
                    screenY < -100 || screenY > k.height() + 100) continue;

                const shipData = SHIPS[ship.type];
                const spriteSize = getSpriteSize(shipData.sprite, unitScale);

                const barWidth = 50 * zoom;
                const barHeight = 8 * zoom;
                const barY = screenY - spriteSize.height / 2 - 20 * zoom;

                const LOAD_TIME_PER_UNIT = 1.0;
                const expectedDuration = ship.dockingState.totalUnits * LOAD_TIME_PER_UNIT;
                const progress = Math.min(ship.dockingState.progress / expectedDuration, 1);

                // Background bar
                k.drawRect({
                    pos: k.vec2(screenX - barWidth / 2, barY),
                    width: barWidth,
                    height: barHeight,
                    color: k.rgb(40, 40, 40),
                    radius: 2,
                });

                // Fill bar (green for loading, gold for unloading)
                const isLoading = ship.dockingState.action === 'loading';
                const fillColor = isLoading
                    ? k.rgb(80, 180, 80)   // Green for loading
                    : k.rgb(220, 180, 80); // Gold for unloading

                // For loading: bar fills up (0 -> 1)
                // For unloading: bar empties (1 -> 0) to show cargo depleting
                const fillProgress = isLoading ? progress : (1 - progress);

                if (fillProgress > 0) {
                    k.drawRect({
                        pos: k.vec2(screenX - barWidth / 2, barY),
                        width: barWidth * fillProgress,
                        height: barHeight,
                        color: fillColor,
                        radius: 2,
                    });
                }

                // Label text
                const label = isLoading ? "LOADING" : "UNLOADING";
                k.drawText({
                    text: label,
                    pos: k.vec2(screenX, barY - 10 * zoom),
                    size: 9 * zoom,
                    anchor: "center",
                    color: k.rgb(200, 200, 200),
                });
            }

            // Draw selection indicators for all selected units
            for (let i = 0; i < gameState.ships.length; i++) {
                if (!isSelected(gameState, 'ship', i)) continue;
                const ship = gameState.ships[i];
                const pos = getShipVisualPos(ship);
                const screenX = (pos.x - cameraX) * zoom + halfWidth;
                const screenY = (pos.y - cameraY) * zoom + halfHeight;

                // Draw selection circle
                k.drawCircle({
                    pos: k.vec2(screenX, screenY),
                    radius: HEX_SIZE * zoom * 1.3,
                    color: k.rgb(255, 220, 50),
                    fill: false,
                    outline: { width: 3, color: k.rgb(255, 220, 50) },
                });

                // Draw path and waypoint if ship has one
                if (ship.waypoint) {
                    const wpPos = hexToPixel(ship.waypoint.q, ship.waypoint.r);
                    const wpScreenX = (wpPos.x - cameraX) * zoom + halfWidth;
                    const wpScreenY = (wpPos.y - cameraY) * zoom + halfHeight;

                    // Draw waypoint marker (X marks the spot!)
                    const wpSize = HEX_SIZE * zoom * 0.4;
                    const xWidth = 4 * zoom;
                    const xColor = k.rgb(180, 40, 40);

                    // Draw chunky X with two crossing lines
                    k.drawLine({
                        p1: k.vec2(wpScreenX - wpSize, wpScreenY - wpSize),
                        p2: k.vec2(wpScreenX + wpSize, wpScreenY + wpSize),
                        width: xWidth,
                        color: xColor,
                    });
                    k.drawLine({
                        p1: k.vec2(wpScreenX + wpSize, wpScreenY - wpSize),
                        p2: k.vec2(wpScreenX - wpSize, wpScreenY + wpSize),
                        width: xWidth,
                        color: xColor,
                    });

                    // Draw A* path from ship to waypoint (dashed orange line)
                    if (ship.path && ship.path.length > 0) {
                        let prevX = screenX;
                        let prevY = screenY;
                        const dashLength = 8 * zoom;
                        const gapLength = 6 * zoom;
                        const pathColor = k.rgb(255, 165, 0);

                        for (const node of ship.path) {
                            const nodePos = hexToPixel(node.q, node.r);
                            const nodeScreenX = (nodePos.x - cameraX) * zoom + halfWidth;
                            const nodeScreenY = (nodePos.y - cameraY) * zoom + halfHeight;

                            // Calculate segment properties
                            const dx = nodeScreenX - prevX;
                            const dy = nodeScreenY - prevY;
                            const segmentLength = Math.sqrt(dx * dx + dy * dy);
                            const nx = dx / segmentLength;
                            const ny = dy / segmentLength;

                            // Draw dashed line segment
                            let traveled = 0;
                            while (traveled < segmentLength) {
                                const dashStart = traveled;
                                const dashEnd = Math.min(traveled + dashLength, segmentLength);

                                k.drawLine({
                                    p1: k.vec2(prevX + nx * dashStart, prevY + ny * dashStart),
                                    p2: k.vec2(prevX + nx * dashEnd, prevY + ny * dashEnd),
                                    width: 2,
                                    color: pathColor,
                                    opacity: 0.8,
                                });

                                traveled += dashLength + gapLength;
                            }

                            prevX = nodeScreenX;
                            prevY = nodeScreenY;
                        }
                    }
                }
            }

            // Draw selection indicators for selected ports
            for (let i = 0; i < gameState.ports.length; i++) {
                if (!isSelected(gameState, 'port', i)) continue;
                const port = gameState.ports[i];
                const pos = hexToPixel(port.q, port.r);
                const screenX = (pos.x - cameraX) * zoom + halfWidth;
                const screenY = (pos.y - cameraY) * zoom + halfHeight;

                k.drawCircle({
                    pos: k.vec2(screenX, screenY),
                    radius: HEX_SIZE * zoom * 1.3,
                    color: k.rgb(255, 220, 50),
                    fill: false,
                    outline: { width: 3, color: k.rgb(255, 220, 50) },
                });
            }

            // Draw selection indicators for selected farms
            for (let i = 0; i < gameState.farms.length; i++) {
                if (!isSelected(gameState, 'farm', i)) continue;
                const farm = gameState.farms[i];
                const pos = hexToPixel(farm.q, farm.r);
                const screenX = (pos.x - cameraX) * zoom + halfWidth;
                const screenY = (pos.y - cameraY) * zoom + halfHeight;

                k.drawCircle({
                    pos: k.vec2(screenX, screenY),
                    radius: HEX_SIZE * zoom * 1.3,
                    color: k.rgb(255, 220, 50),
                    fill: false,
                    outline: { width: 3, color: k.rgb(255, 220, 50) },
                });
            }

            // Draw placement mode highlights (when placing a new port)
            if (gameState.portBuildMode.active) {
                const builderShip = gameState.ships[gameState.portBuildMode.builderShipIndex];
                const MAX_BUILD_DISTANCE = 5;  // Maximum distance from ship to place port

                // Get current mouse position in world coords
                const mouseX = k.mousePos().x;
                const mouseY = k.mousePos().y;
                const worldMX = (mouseX - halfWidth) / zoom + cameraX;
                const worldMY = (mouseY - halfHeight) / zoom + cameraY;
                const hoverHex = pixelToHex(worldMX, worldMY);

                // Check if hovered hex is a valid port site AND within range
                const hoverDistance = hexDistance(builderShip.q, builderShip.r, hoverHex.q, hoverHex.r);
                const isValidHover = isValidPortSite(map, hoverHex.q, hoverHex.r, gameState.ports) &&
                                     hoverDistance <= MAX_BUILD_DISTANCE;
                gameState.portBuildMode.hoveredHex = isValidHover ? hoverHex : null;

                // Draw highlights on all valid port sites within range
                for (const tile of map.tiles.values()) {
                    if (!tile.isPortSite) continue;
                    if (!isHexRevealed(fogState, tile.q, tile.r)) continue;

                    // Check distance from builder ship
                    const dist = hexDistance(builderShip.q, builderShip.r, tile.q, tile.r);
                    if (dist > MAX_BUILD_DISTANCE) continue;

                    // Check if already has a port
                    const hasPort = gameState.ports.some(p => p.q === tile.q && p.r === tile.r);
                    if (hasPort) continue;

                    const pos = tilePositions.get(tile);
                    const screenX = (pos.x - cameraX) * zoom + halfWidth;
                    const screenY = (pos.y - cameraY) * zoom + halfHeight;

                    // Culling
                    if (screenX < -margin || screenX > k.width() + margin ||
                        screenY < -margin || screenY > k.height() + margin) continue;

                    const isHovered = gameState.portBuildMode.hoveredHex &&
                                      tile.q === gameState.portBuildMode.hoveredHex.q &&
                                      tile.r === gameState.portBuildMode.hoveredHex.r;

                    const corners = hexCorners(screenX, screenY, scaledSize);
                    const pts = corners.map(c => k.vec2(c.x, c.y));

                    // Highlight color (brighter if hovered)
                    const highlightColor = isHovered
                        ? k.rgb(100, 255, 100)  // Bright green for hovered
                        : k.rgb(80, 180, 80);   // Dimmer green for valid

                    // Draw highlight overlay
                    k.drawPolygon({
                        pts,
                        color: highlightColor,
                        opacity: isHovered ? 0.5 : 0.25,
                    });

                    // Draw outline
                    for (let i = 0; i < pts.length; i++) {
                        const p1 = pts[i];
                        const p2 = pts[(i + 1) % pts.length];
                        k.drawLine({
                            p1, p2,
                            width: isHovered ? 3 : 2,
                            color: highlightColor,
                        });
                    }
                }

                // Draw hint text at bottom
                k.drawText({
                    text: "Click to place port | ESC to cancel",
                    pos: k.vec2(k.width() / 2, k.height() - 60),
                    size: 14,
                    anchor: "center",
                    color: k.rgb(255, 255, 200),
                });
            }

            // Draw farm placement mode highlights (when placing a new farm)
            if (gameState.farmBuildMode.active) {
                const builderPort = gameState.ports[gameState.farmBuildMode.builderPortIndex];
                const MAX_FARM_BUILD_DISTANCE = 10;  // Maximum distance from port to place farm

                // Get current mouse position in world coords
                const mouseX = k.mousePos().x;
                const mouseY = k.mousePos().y;
                const worldMX = (mouseX - halfWidth) / zoom + cameraX;
                const worldMY = (mouseY - halfHeight) / zoom + cameraY;
                const hoverHex = pixelToHex(worldMX, worldMY);

                // Check if hovered hex is a valid farm site AND within range
                const hoverDistance = hexDistance(builderPort.q, builderPort.r, hoverHex.q, hoverHex.r);
                const isValidHover = isValidFarmSite(map, hoverHex.q, hoverHex.r, gameState.farms, gameState.ports) &&
                                     hoverDistance <= MAX_FARM_BUILD_DISTANCE;
                gameState.farmBuildMode.hoveredHex = isValidHover ? hoverHex : null;

                // Draw highlights on all valid farm sites (land hexes) within range
                for (const tile of map.tiles.values()) {
                    if (tile.type !== 'land') continue;
                    if (!isHexRevealed(fogState, tile.q, tile.r)) continue;

                    // Check distance from builder port
                    const dist = hexDistance(builderPort.q, builderPort.r, tile.q, tile.r);
                    if (dist > MAX_FARM_BUILD_DISTANCE) continue;

                    // Check if already has a farm or port
                    const hasFarm = gameState.farms.some(f => f.q === tile.q && f.r === tile.r);
                    const hasPort = gameState.ports.some(p => p.q === tile.q && p.r === tile.r);
                    if (hasFarm || hasPort) continue;

                    const pos = tilePositions.get(tile);
                    const screenX = (pos.x - cameraX) * zoom + halfWidth;
                    const screenY = (pos.y - cameraY) * zoom + halfHeight;

                    // Culling
                    if (screenX < -margin || screenX > k.width() + margin ||
                        screenY < -margin || screenY > k.height() + margin) continue;

                    const isHovered = gameState.farmBuildMode.hoveredHex &&
                                      tile.q === gameState.farmBuildMode.hoveredHex.q &&
                                      tile.r === gameState.farmBuildMode.hoveredHex.r;

                    const corners = hexCorners(screenX, screenY, scaledSize);
                    const pts = corners.map(c => k.vec2(c.x, c.y));

                    // Highlight color (brighter if hovered)
                    const highlightColor = isHovered
                        ? k.rgb(100, 255, 100)  // Bright green for hovered
                        : k.rgb(80, 180, 80);   // Dimmer green for valid

                    // Draw highlight overlay
                    k.drawPolygon({
                        pts,
                        color: highlightColor,
                        opacity: isHovered ? 0.5 : 0.25,
                    });

                    // Draw outline
                    for (let i = 0; i < pts.length; i++) {
                        const p1 = pts[i];
                        const p2 = pts[(i + 1) % pts.length];
                        k.drawLine({
                            p1, p2,
                            width: isHovered ? 3 : 2,
                            color: highlightColor,
                        });
                    }
                }

                // Draw hint text at bottom
                k.drawText({
                    text: "Click to place settlement | ESC to cancel",
                    pos: k.vec2(k.width() / 2, k.height() - 60),
                    size: 14,
                    anchor: "center",
                    color: k.rgb(255, 255, 200),
                });
            }

            // Draw selection box if selecting
            if (isSelecting) {
                const boxX = Math.min(selectStartX, selectEndX);
                const boxY = Math.min(selectStartY, selectEndY);
                const boxW = Math.abs(selectEndX - selectStartX);
                const boxH = Math.abs(selectEndY - selectStartY);
                k.drawRect({
                    pos: k.vec2(boxX, boxY),
                    width: boxW,
                    height: boxH,
                    color: k.rgb(100, 200, 255),
                    opacity: 0.2,
                });
                k.drawRect({
                    pos: k.vec2(boxX, boxY),
                    width: boxW,
                    height: boxH,
                    fill: false,
                    outline: { width: 2, color: k.rgb(100, 200, 255) },
                });
            }

            // UI overlay - Resource panel (top right)
            const panelWidth = 280;
            const panelHeight = 70;
            const panelX = k.width() - panelWidth - 15;
            const panelY = 15;

            // Panel background
            k.drawRect({
                pos: k.vec2(panelX, panelY),
                width: panelWidth,
                height: panelHeight,
                color: k.rgb(20, 30, 40),
                radius: 6,
                opacity: 0.9,
            });

            // Panel title
            k.drawText({
                text: "STOCKPILE",
                pos: k.vec2(panelX + panelWidth / 2, panelY + 12),
                size: 12,
                anchor: "center",
                color: k.rgb(150, 150, 150),
            });

            // Resource values
            const res = gameState.resources;
            const resY = panelY + 38;
            const resSpacing = 68;

            // Wood (brown)
            k.drawText({
                text: `Wood`,
                pos: k.vec2(panelX + 15, resY - 10),
                size: 10,
                color: k.rgb(139, 90, 43),
            });
            k.drawText({
                text: `${res.wood}`,
                pos: k.vec2(panelX + 15, resY + 6),
                size: 18,
                color: k.rgb(200, 150, 100),
            });


            // Food (green)
            k.drawText({
                text: `Food`,
                pos: k.vec2(panelX + 15 + resSpacing * 2, resY - 10),
                size: 10,
                color: k.rgb(80, 140, 80),
            });
            k.drawText({
                text: `${res.food}`,
                pos: k.vec2(panelX + 15 + resSpacing * 2, resY + 6),
                size: 18,
                color: k.rgb(120, 200, 120),
            });

            // Game title (top left)
            k.drawText({
                text: "Grog",
                pos: k.vec2(20, 20),
                size: 28,
                color: k.rgb(255, 255, 255),
            });

            // Controls hint
            k.drawText({
                text: "Drag: Select | Shift+click: Add to selection | Click: Set waypoint (when ships selected)",
                pos: k.vec2(20, 52),
                size: 12,
                color: k.rgb(120, 120, 120),
            });

            // Time scale indicator (bottom left)
            const timeLabel = gameState.timeScale === 0 ? "PAUSED" : `${gameState.timeScale}x`;
            const timeColor = gameState.timeScale === 0
                ? k.rgb(255, 100, 100)
                : k.rgb(150, 200, 150);
            k.drawText({
                text: timeLabel,
                pos: k.vec2(20, k.height() - 25),
                size: 18,
                color: timeColor,
            });

            // Build panel UI (when exactly one port is selected and not under construction)
            const selectedPortIndices = gameState.selectedUnits.filter(u => u.type === 'port');
            buildPanelBounds = null;  // Reset each frame

            if (selectedPortIndices.length === 1) {
                const portIndex = selectedPortIndices[0].index;
                const port = gameState.ports[portIndex];

                // Skip build panel for ports still under construction or upgrading
                if (port.construction) {
                    // Show construction/upgrade status
                    const conProgress = Math.min(port.construction.progress / port.construction.buildTime, 1);
                    const conPercent = Math.floor(conProgress * 100);
                    const isUpgrading = !!port.construction.upgradeTo;

                    const cpWidth = 160;
                    const cpHeight = isUpgrading ? 85 : 70;
                    const cpX = 15;
                    const cpY = k.height() - 50 - cpHeight;

                    k.drawRect({
                        pos: k.vec2(cpX, cpY),
                        width: cpWidth,
                        height: cpHeight,
                        color: k.rgb(20, 30, 40),
                        radius: 6,
                        opacity: 0.9,
                    });

                    if (isUpgrading) {
                        // Show upgrading status
                        const targetPortData = PORTS[port.construction.upgradeTo];

                        k.drawText({
                            text: "UPGRADING",
                            pos: k.vec2(cpX + cpWidth / 2, cpY + 16),
                            size: 10,
                            anchor: "center",
                            color: k.rgb(150, 150, 150),
                        });

                        k.drawText({
                            text: `→ ${targetPortData.name}`,
                            pos: k.vec2(cpX + cpWidth / 2, cpY + 38),
                            size: 14,
                            anchor: "center",
                            color: k.rgb(100, 200, 150),
                        });

                        k.drawText({
                            text: `${conPercent}%`,
                            pos: k.vec2(cpX + cpWidth / 2, cpY + 62),
                            size: 18,
                            anchor: "center",
                            color: k.rgb(100, 200, 150),
                        });
                    } else {
                        // Show new construction status
                        k.drawText({
                            text: "UNDER CONSTRUCTION",
                            pos: k.vec2(cpX + cpWidth / 2, cpY + 20),
                            size: 10,
                            anchor: "center",
                            color: k.rgb(150, 150, 150),
                        });

                        k.drawText({
                            text: `${conPercent}%`,
                            pos: k.vec2(cpX + cpWidth / 2, cpY + 45),
                            size: 18,
                            anchor: "center",
                            color: k.rgb(80, 180, 220),
                        });
                    }
                } else {
                    // Port is complete - show ship build panel with upgrade option
                    const buildableShips = getBuildableShips(port);
                    const nextPortType = getNextPortType(port.type);
                    const isBuildingSettlement = isPortBuildingSettlement(portIndex, gameState.farms);
                    const portBusy = port.buildQueue || isBuildingSettlement;  // Port can only build one thing at a time
                    const canUpgrade = nextPortType && !portBusy;
                    const canBuildFarm = !portBusy && !gameState.farmBuildMode.active;

                    // Check if port has stored resources (non-home ports)
                    const hasStorage = portIndex > 0 && port.storage && (port.storage.wood > 0 || port.storage.food > 0);
                    const storageHeight = hasStorage ? 45 : 0;

                    const bpWidth = 160;
                    const bpRowHeight = 28;
                    const bpPadding = 10;
                    const bpHeaderHeight = 24;
                    const upgradeHeight = canUpgrade ? (bpHeaderHeight + bpRowHeight) : 0;
                    const farmHeight = canBuildFarm ? (bpHeaderHeight + bpRowHeight) : 0;
                    const bpHeight = storageHeight + bpHeaderHeight + bpPadding + buildableShips.length * bpRowHeight + bpPadding + upgradeHeight + farmHeight;
                    const bpX = 15;
                    const bpY = k.height() - 50 - bpHeight;

                    // Store bounds for click detection
                    buildPanelBounds = {
                        x: bpX,
                        y: bpY,
                        width: bpWidth,
                        height: bpHeight,
                        buttons: [],
                        upgradeButton: null,
                        farmButton: null,
                        portIndex: portIndex,
                    };

                    // Panel background
                    k.drawRect({
                        pos: k.vec2(bpX, bpY),
                        width: bpWidth,
                        height: bpHeight,
                        color: k.rgb(20, 30, 40),
                        radius: 6,
                        opacity: 0.9,
                    });

                    // Show stored resources for non-home ports
                    if (hasStorage) {
                        k.drawText({
                            text: "STORED",
                            pos: k.vec2(bpX + bpWidth / 2, bpY + 12),
                            size: 10,
                            anchor: "center",
                            color: k.rgb(150, 150, 150),
                        });
                        // Wood
                        k.drawText({
                            text: `${port.storage.wood}`,
                            pos: k.vec2(bpX + bpWidth / 4, bpY + 32),
                            size: 16,
                            anchor: "center",
                            color: k.rgb(180, 120, 60),
                        });
                        k.drawText({
                            text: "wood",
                            pos: k.vec2(bpX + bpWidth / 4, bpY + 46),
                            size: 9,
                            anchor: "center",
                            color: k.rgb(120, 80, 40),
                        });
                        // Food
                        k.drawText({
                            text: `${port.storage.food}`,
                            pos: k.vec2(bpX + bpWidth * 3 / 4, bpY + 32),
                            size: 16,
                            anchor: "center",
                            color: k.rgb(80, 180, 80),
                        });
                        k.drawText({
                            text: "food",
                            pos: k.vec2(bpX + bpWidth * 3 / 4, bpY + 46),
                            size: 9,
                            anchor: "center",
                            color: k.rgb(50, 120, 50),
                        });
                        // Separator line
                        k.drawLine({
                            p1: k.vec2(bpX + 8, bpY + storageHeight - 4),
                            p2: k.vec2(bpX + bpWidth - 8, bpY + storageHeight - 4),
                            width: 1,
                            color: k.rgb(60, 70, 80),
                        });
                    }

                    const mousePos = k.mousePos();

                    // Check if currently building a ship
                    if (port.buildQueue) {
                        // Show building status
                        const progress = Math.min(port.buildQueue.progress / port.buildQueue.buildTime, 1);
                        const percent = Math.floor(progress * 100);
                        const shipName = SHIPS[port.buildQueue.shipType].name;

                        k.drawText({
                            text: "BUILDING",
                            pos: k.vec2(bpX + bpWidth / 2, bpY + storageHeight + 14),
                            size: 11,
                            anchor: "center",
                            color: k.rgb(150, 150, 150),
                        });

                        k.drawText({
                            text: `${shipName}`,
                            pos: k.vec2(bpX + bpWidth / 2, bpY + storageHeight + bpHeaderHeight + bpPadding + 10),
                            size: 14,
                            anchor: "center",
                            color: k.rgb(220, 180, 80),
                        });

                        k.drawText({
                            text: `${percent}%`,
                            pos: k.vec2(bpX + bpWidth / 2, bpY + storageHeight + bpHeaderHeight + bpPadding + 32),
                            size: 18,
                            anchor: "center",
                            color: k.rgb(255, 255, 255),
                        });
                    } else {
                        // Show build options
                        k.drawText({
                            text: "BUILD SHIP",
                            pos: k.vec2(bpX + bpWidth / 2, bpY + storageHeight + 14),
                            size: 11,
                            anchor: "center",
                            color: k.rgb(150, 150, 150),
                        });

                        for (let i = 0; i < buildableShips.length; i++) {
                            const shipType = buildableShips[i];
                            const shipData = SHIPS[shipType];
                            const btnY = bpY + storageHeight + bpHeaderHeight + bpPadding + i * bpRowHeight;
                            const btnHeight = bpRowHeight - 4;
                            const affordable = canAfford(gameState.resources, shipData.cost);
                            const canBuildShip = affordable && !portBusy;

                            // Store button bounds
                            buildPanelBounds.buttons.push({
                                y: btnY,
                                height: btnHeight,
                                shipType: shipType,
                            });

                            // Check if mouse is hovering
                            const isHovered = canBuildShip && mousePos.x >= bpX && mousePos.x <= bpX + bpWidth &&
                                              mousePos.y >= btnY && mousePos.y <= btnY + btnHeight;

                            // Button background (highlight on hover, only if can build)
                            if (isHovered) {
                                k.drawRect({
                                    pos: k.vec2(bpX + 4, btnY),
                                    width: bpWidth - 8,
                                    height: btnHeight,
                                    color: k.rgb(60, 80, 100),
                                    radius: 4,
                                });
                            }

                            // Ship name (greyed out if can't build)
                            k.drawText({
                                text: shipData.name,
                                pos: k.vec2(bpX + 12, btnY + btnHeight / 2),
                                size: 13,
                                anchor: "left",
                                color: !canBuildShip ? k.rgb(80, 80, 80) : isHovered ? k.rgb(255, 255, 255) : k.rgb(200, 200, 200),
                            });

                            // Cost and build time
                            const woodCost = shipData.cost.wood || 0;
                            const foodCost = shipData.cost.food || 0;
                            const costText = `${woodCost}w ${foodCost}f | ${shipData.build_time}s`;
                            k.drawText({
                                text: costText,
                                pos: k.vec2(bpX + bpWidth - 12, btnY + btnHeight / 2),
                                size: 11,
                                anchor: "right",
                                color: !canBuildShip ? k.rgb(120, 60, 60) : k.rgb(120, 120, 120),
                            });
                        }

                        // Show upgrade option if available
                        if (canUpgrade) {
                            const upgradeY = bpY + storageHeight + bpHeaderHeight + bpPadding + buildableShips.length * bpRowHeight + bpPadding;

                            // Separator line
                            k.drawLine({
                                p1: k.vec2(bpX + 8, upgradeY - 4),
                                p2: k.vec2(bpX + bpWidth - 8, upgradeY - 4),
                                width: 1,
                                color: k.rgb(60, 70, 80),
                            });

                            // Upgrade header
                            k.drawText({
                                text: "UPGRADE",
                                pos: k.vec2(bpX + bpWidth / 2, upgradeY + 10),
                                size: 11,
                                anchor: "center",
                                color: k.rgb(150, 150, 150),
                            });

                            // Upgrade button
                            const upgradeBtnY = upgradeY + bpHeaderHeight;
                            const upgradeBtnHeight = bpRowHeight - 4;
                            const nextPortData = PORTS[nextPortType];
                            const upgradeAffordable = canAfford(gameState.resources, nextPortData.cost);

                            // Store upgrade button bounds
                            buildPanelBounds.upgradeButton = {
                                y: upgradeBtnY,
                                height: upgradeBtnHeight,
                                portType: nextPortType,
                            };

                            // Check if mouse is hovering (only if affordable)
                            const isUpgradeHovered = upgradeAffordable && mousePos.x >= bpX && mousePos.x <= bpX + bpWidth &&
                                                     mousePos.y >= upgradeBtnY && mousePos.y <= upgradeBtnY + upgradeBtnHeight;

                            // Button background
                            if (isUpgradeHovered) {
                                k.drawRect({
                                    pos: k.vec2(bpX + 4, upgradeBtnY),
                                    width: bpWidth - 8,
                                    height: upgradeBtnHeight,
                                    color: k.rgb(60, 80, 100),
                                    radius: 4,
                                });
                            }

                            // Port name with arrow (greyed out if can't afford)
                            k.drawText({
                                text: `→ ${nextPortData.name}`,
                                pos: k.vec2(bpX + 12, upgradeBtnY + upgradeBtnHeight / 2),
                                size: 13,
                                anchor: "left",
                                color: !upgradeAffordable ? k.rgb(80, 80, 80) : isUpgradeHovered ? k.rgb(255, 255, 255) : k.rgb(200, 200, 200),
                            });

                            // Cost and build time
                            const upgradeCostText = `${nextPortData.cost.wood}w | ${nextPortData.buildTime}s`;
                            k.drawText({
                                text: upgradeCostText,
                                pos: k.vec2(bpX + bpWidth - 12, upgradeBtnY + upgradeBtnHeight / 2),
                                size: 11,
                                anchor: "right",
                                color: !upgradeAffordable ? k.rgb(120, 60, 60) : k.rgb(120, 120, 120),
                            });
                        }

                        // Show build farm option
                        if (canBuildFarm) {
                            const farmY = bpY + storageHeight + bpHeaderHeight + bpPadding + buildableShips.length * bpRowHeight + bpPadding + upgradeHeight;

                            // Separator line
                            k.drawLine({
                                p1: k.vec2(bpX + 8, farmY - 4),
                                p2: k.vec2(bpX + bpWidth - 8, farmY - 4),
                                width: 1,
                                color: k.rgb(60, 70, 80),
                            });

                            // Build Farm header
                            k.drawText({
                                text: "BUILD SETTLEMENT",
                                pos: k.vec2(bpX + bpWidth / 2, farmY + 10),
                                size: 11,
                                anchor: "center",
                                color: k.rgb(150, 150, 150),
                            });

                            // Farm button
                            const farmBtnY = farmY + bpHeaderHeight;
                            const farmBtnHeight = bpRowHeight - 4;
                            const farmData = FARMS.farm;
                            const alreadyBuildingSettlement = isPortBuildingSettlement(portIndex, gameState.farms);

                            // Store farm button bounds
                            buildPanelBounds.farmButton = {
                                y: farmBtnY,
                                height: farmBtnHeight,
                            };

                            // Check if mouse is hovering (only if not already building)
                            const isFarmHovered = !alreadyBuildingSettlement &&
                                                  mousePos.x >= bpX && mousePos.x <= bpX + bpWidth &&
                                                  mousePos.y >= farmBtnY && mousePos.y <= farmBtnY + farmBtnHeight;

                            // Button background
                            if (isFarmHovered) {
                                k.drawRect({
                                    pos: k.vec2(bpX + 4, farmBtnY),
                                    width: bpWidth - 8,
                                    height: farmBtnHeight,
                                    color: k.rgb(60, 80, 100),
                                    radius: 4,
                                });
                            }

                            // Farm name (greyed out if already building)
                            k.drawText({
                                text: alreadyBuildingSettlement ? `${farmData.name} (building...)` : farmData.name,
                                pos: k.vec2(bpX + 12, farmBtnY + farmBtnHeight / 2),
                                size: 13,
                                anchor: "left",
                                color: alreadyBuildingSettlement ? k.rgb(80, 80, 80) : isFarmHovered ? k.rgb(255, 255, 255) : k.rgb(200, 200, 200),
                            });

                            // Build time
                            k.drawText({
                                text: `${farmData.buildTime}s`,
                                pos: k.vec2(bpX + bpWidth - 12, farmBtnY + farmBtnHeight / 2),
                                size: 11,
                                anchor: "right",
                                color: k.rgb(120, 120, 120),
                            });
                        }
                    }
                }
            }

            // Ship build panel UI (when exactly one docked ship is selected, not in placement mode)
            const selectedShipIndices = gameState.selectedUnits.filter(u => u.type === 'ship');
            shipBuildPanelBounds = null;  // Reset each frame

            if (selectedShipIndices.length === 1 && !gameState.portBuildMode.active) {
                const shipIndex = selectedShipIndices[0].index;
                const ship = gameState.ships[shipIndex];

                // Don't show build panel if ship is already building a port
                if (isShipDocked(ship) && !isShipBuildingPort(shipIndex, gameState.ports)) {
                    // Only show Dock for now (first port type in tech tree)
                    const buildablePortTypes = ['dock'];

                    const sbpWidth = 160;
                    const sbpRowHeight = 28;
                    const sbpPadding = 10;
                    const sbpHeaderHeight = 24;
                    const sbpHeight = sbpHeaderHeight + sbpPadding + buildablePortTypes.length * sbpRowHeight + sbpPadding;
                    const sbpX = 15;
                    const sbpY = k.height() - 50 - sbpHeight;

                    // Store bounds for click detection
                    shipBuildPanelBounds = {
                        x: sbpX,
                        y: sbpY,
                        width: sbpWidth,
                        height: sbpHeight,
                        buttons: [],
                        shipIndex: shipIndex,
                    };

                    // Panel background
                    k.drawRect({
                        pos: k.vec2(sbpX, sbpY),
                        width: sbpWidth,
                        height: sbpHeight,
                        color: k.rgb(20, 30, 40),
                        radius: 6,
                        opacity: 0.9,
                    });

                    // Panel title
                    k.drawText({
                        text: "BUILD PORT",
                        pos: k.vec2(sbpX + sbpWidth / 2, sbpY + 14),
                        size: 11,
                        anchor: "center",
                        color: k.rgb(150, 150, 150),
                    });

                    const mousePos = k.mousePos();

                    for (let i = 0; i < buildablePortTypes.length; i++) {
                        const portType = buildablePortTypes[i];
                        const portData = PORTS[portType];
                        const btnY = sbpY + sbpHeaderHeight + sbpPadding + i * sbpRowHeight;
                        const btnHeight = sbpRowHeight - 4;
                        const portAffordable = canAfford(gameState.resources, portData.cost);

                        // Store button bounds
                        shipBuildPanelBounds.buttons.push({
                            y: btnY,
                            height: btnHeight,
                            portType: portType,
                        });

                        // Check if mouse is hovering (only if affordable)
                        const isHovered = portAffordable && mousePos.x >= sbpX && mousePos.x <= sbpX + sbpWidth &&
                                          mousePos.y >= btnY && mousePos.y <= btnY + btnHeight;

                        // Button background (highlight on hover)
                        if (isHovered) {
                            k.drawRect({
                                pos: k.vec2(sbpX + 4, btnY),
                                width: sbpWidth - 8,
                                height: btnHeight,
                                color: k.rgb(60, 80, 100),
                                radius: 4,
                            });
                        }

                        // Port name (greyed out if can't afford)
                        k.drawText({
                            text: portData.name,
                            pos: k.vec2(sbpX + 12, btnY + btnHeight / 2),
                            size: 13,
                            anchor: "left",
                            color: !portAffordable ? k.rgb(80, 80, 80) : isHovered ? k.rgb(255, 255, 255) : k.rgb(200, 200, 200),
                        });

                        // Cost and build time
                        const portCostText = `${portData.cost.wood}w | ${portData.buildTime}s`;
                        k.drawText({
                            text: portCostText,
                            pos: k.vec2(sbpX + sbpWidth - 12, btnY + btnHeight / 2),
                            size: 11,
                            anchor: "right",
                            color: !portAffordable ? k.rgb(120, 60, 60) : k.rgb(120, 120, 120),
                        });
                    }
                }
            }

            // Ship info panel (bottom right, when ship is selected)
            if (selectedShipIndices.length === 1) {
                const shipIndex = selectedShipIndices[0].index;
                const ship = gameState.ships[shipIndex];
                const shipData = SHIPS[ship.type];

                const infoPanelWidth = 140;
                const infoPanelHeight = 100;
                const infoPanelX = k.width() - infoPanelWidth - 15;
                const infoPanelY = k.height() - infoPanelHeight - 50;

                // Panel background
                k.drawRect({
                    pos: k.vec2(infoPanelX, infoPanelY),
                    width: infoPanelWidth,
                    height: infoPanelHeight,
                    color: k.rgb(20, 30, 40),
                    radius: 6,
                    opacity: 0.9,
                });

                // Ship name
                k.drawText({
                    text: shipData.name,
                    pos: k.vec2(infoPanelX + infoPanelWidth / 2, infoPanelY + 14),
                    size: 13,
                    anchor: "center",
                    color: k.rgb(200, 200, 200),
                });

                // Status indicator (auto-loop, waiting, etc.)
                let statusText = "";
                let statusColor = k.rgb(100, 100, 100);

                if (ship.tradeRoute) {
                    if (ship.waitingForDock) {
                        statusText = "WAITING";
                        statusColor = k.rgb(220, 180, 80);  // Yellow/gold
                    } else if (ship.dockingState?.action === 'loading') {
                        statusText = "LOADING";
                        statusColor = k.rgb(80, 180, 80);   // Green
                    } else if (ship.dockingState?.action === 'unloading') {
                        statusText = "UNLOADING";
                        statusColor = k.rgb(220, 180, 80);  // Gold
                    } else {
                        statusText = "AUTO-LOOP";
                        statusColor = k.rgb(100, 180, 220); // Cyan/blue
                    }
                } else if (ship.pendingUnload) {
                    if (ship.waitingForDock) {
                        statusText = "WAITING";
                        statusColor = k.rgb(220, 180, 80);
                    } else if (ship.dockingState?.action === 'unloading') {
                        statusText = "UNLOADING";
                        statusColor = k.rgb(220, 180, 80);
                    } else {
                        statusText = "RETURNING";
                        statusColor = k.rgb(180, 140, 100);
                    }
                }

                if (statusText) {
                    // Draw status badge
                    const badgeWidth = 70;
                    const badgeHeight = 14;
                    const badgeX = infoPanelX + infoPanelWidth / 2 - badgeWidth / 2;
                    const badgeY = infoPanelY + 26;

                    k.drawRect({
                        pos: k.vec2(badgeX, badgeY),
                        width: badgeWidth,
                        height: badgeHeight,
                        color: statusColor,
                        radius: 3,
                        opacity: 0.3,
                    });

                    k.drawText({
                        text: statusText,
                        pos: k.vec2(infoPanelX + infoPanelWidth / 2, badgeY + badgeHeight / 2),
                        size: 9,
                        anchor: "center",
                        color: statusColor,
                    });
                }

                // Cargo section
                const cargoWood = ship.cargo?.wood || 0;
                const cargoFood = ship.cargo?.food || 0;
                const maxCargo = shipData.cargo;
                const totalCargo = cargoWood + cargoFood;

                k.drawText({
                    text: "CARGO",
                    pos: k.vec2(infoPanelX + infoPanelWidth / 2, infoPanelY + 48),
                    size: 9,
                    anchor: "center",
                    color: k.rgb(120, 120, 120),
                });

                // Wood count (brown)
                k.drawText({
                    text: `Wood: ${cargoWood}`,
                    pos: k.vec2(infoPanelX + 12, infoPanelY + 66),
                    size: 11,
                    anchor: "left",
                    color: k.rgb(180, 130, 70),
                });

                // Food count (green)
                k.drawText({
                    text: `Food: ${cargoFood}`,
                    pos: k.vec2(infoPanelX + 12, infoPanelY + 80),
                    size: 11,
                    anchor: "left",
                    color: k.rgb(100, 160, 80),
                });

                // Cargo capacity
                k.drawText({
                    text: `${totalCargo}/${maxCargo}`,
                    pos: k.vec2(infoPanelX + infoPanelWidth - 12, infoPanelY + 73),
                    size: 11,
                    anchor: "right",
                    color: totalCargo > 0 ? k.rgb(180, 180, 180) : k.rgb(100, 100, 100),
                });
            }
        });

        // Left-click/drag for selection
        k.onMousePress("left", () => {
            isLeftMouseDown = true;
            selectStartX = k.mousePos().x;
            selectStartY = k.mousePos().y;
            selectEndX = selectStartX;
            selectEndY = selectStartY;
        });

        k.onMouseRelease("left", () => {
            const dx = k.mousePos().x - selectStartX;
            const dy = k.mousePos().y - selectStartY;
            const dist = Math.sqrt(dx * dx + dy * dy);

            if (dist > DRAG_THRESHOLD && isSelecting) {
                // Selection box drag - select units in box
                handleSelectionBox();
            } else {
                // Click - handle unit selection or waypoint
                handleClick();
            }
            isLeftMouseDown = false;
            isSelecting = false;
        });

        // Right-click/drag for panning
        k.onMousePress("right", () => {
            // Cancel placement mode on right-click
            if (gameState.portBuildMode.active) {
                exitPortBuildMode(gameState);
                console.log("Port placement cancelled");
                return;  // Don't start panning
            }
            if (gameState.farmBuildMode.active) {
                exitFarmBuildMode(gameState);
                console.log("Farm placement cancelled");
                return;  // Don't start panning
            }

            isPanning = true;
            panStartX = k.mousePos().x;
            panStartY = k.mousePos().y;
            cameraStartX = cameraX;
            cameraStartY = cameraY;
        });

        k.onMouseRelease("right", () => {
            isPanning = false;
        });

        k.onMouseMove(() => {
            // Selection box dragging (only when left mouse is held)
            if (isLeftMouseDown) {
                const dx = k.mousePos().x - selectStartX;
                const dy = k.mousePos().y - selectStartY;
                if (Math.sqrt(dx * dx + dy * dy) > DRAG_THRESHOLD) {
                    isSelecting = true;
                }
                selectEndX = k.mousePos().x;
                selectEndY = k.mousePos().y;
            }

            // Camera panning with right-drag
            if (isPanning) {
                const pdx = k.mousePos().x - panStartX;
                const pdy = k.mousePos().y - panStartY;
                cameraX = cameraStartX - pdx / zoom;
                cameraY = cameraStartY - pdy / zoom;
            }
        });

        // WASD and edge scrolling for camera panning
        const EDGE_SCROLL_MARGIN = 20; // pixels from edge to trigger scroll
        k.onUpdate(() => {
            const panSpeed = 300 / zoom;
            const mouse = k.mousePos();

            // WASD panning
            if (k.isKeyDown("w") || k.isKeyDown("up")) cameraY -= panSpeed * k.dt();
            if (k.isKeyDown("s") || k.isKeyDown("down")) cameraY += panSpeed * k.dt();
            if (k.isKeyDown("a") || k.isKeyDown("left")) cameraX -= panSpeed * k.dt();
            if (k.isKeyDown("d") || k.isKeyDown("right")) cameraX += panSpeed * k.dt();

            // Edge scrolling (only when not dragging selection box)
            if (!isSelecting) {
                if (mouse.x < EDGE_SCROLL_MARGIN) cameraX -= panSpeed * k.dt();
                if (mouse.x > k.width() - EDGE_SCROLL_MARGIN) cameraX += panSpeed * k.dt();
                if (mouse.y < EDGE_SCROLL_MARGIN) cameraY -= panSpeed * k.dt();
                if (mouse.y > k.height() - EDGE_SCROLL_MARGIN) cameraY += panSpeed * k.dt();
            }
        });

        // Scroll to zoom
        k.onScroll((delta) => {
            const zoomFactor = 1.1;
            if (delta.y < 0) {
                zoom = Math.min(zoom * zoomFactor, 3);
            } else {
                zoom = Math.max(zoom / zoomFactor, 0.3);
            }
        });

        // Time scale controls
        k.onKeyPress("1", () => { gameState.timeScale = 1; });
        k.onKeyPress("2", () => { gameState.timeScale = 2; });
        k.onKeyPress("3", () => { gameState.timeScale = 3; });
        k.onKeyPress("space", () => {
            gameState.timeScale = gameState.timeScale === 0 ? 1 : 0;
        });

        // ESC to cancel placement modes
        k.onKeyPress("escape", () => {
            if (gameState.portBuildMode.active) {
                exitPortBuildMode(gameState);
                console.log("Port placement cancelled");
            }
            if (gameState.farmBuildMode.active) {
                exitFarmBuildMode(gameState);
                console.log("Farm placement cancelled");
            }
        });

        // Click handler for selection and waypoints
        function handleClick() {
            const mouseX = k.mousePos().x;
            const mouseY = k.mousePos().y;

            // Handle placement mode click FIRST
            if (gameState.portBuildMode.active) {
                if (gameState.portBuildMode.hoveredHex) {
                    // Valid placement - create the port under construction
                    const hex = gameState.portBuildMode.hoveredHex;
                    const portType = gameState.portBuildMode.portType;
                    const builderShipIndex = gameState.portBuildMode.builderShipIndex;
                    const portData = PORTS[portType];

                    // Check and deduct cost
                    if (!canAfford(gameState.resources, portData.cost)) {
                        console.log(`Can't afford ${portType}`);
                        exitPortBuildMode(gameState);
                        return;
                    }
                    deductCost(gameState.resources, portData.cost);

                    // Create port with construction state (tracking which ship is building it)
                    const newPort = createPort(portType, hex.q, hex.r, true, builderShipIndex);
                    gameState.ports.push(newPort);

                    // Don't reveal fog yet - wait until construction is complete

                    console.log(`Started building ${portType} at (${hex.q}, ${hex.r}) by ship ${builderShipIndex}`);

                    // Exit placement mode
                    exitPortBuildMode(gameState);
                }
                // Click on invalid hex in placement mode - do nothing (don't exit mode)
                return;
            }

            // Handle farm placement mode click
            if (gameState.farmBuildMode.active) {
                if (gameState.farmBuildMode.hoveredHex) {
                    // Valid placement - create the farm under construction
                    const hex = gameState.farmBuildMode.hoveredHex;
                    const builderPortIndex = gameState.farmBuildMode.builderPortIndex;

                    // Create farm with construction state
                    const newFarm = createFarm(hex.q, hex.r, true, builderPortIndex);
                    gameState.farms.push(newFarm);

                    console.log(`Started building farm at (${hex.q}, ${hex.r}) by port ${builderPortIndex}`);

                    // Exit placement mode
                    exitFarmBuildMode(gameState);
                }
                // Click on invalid hex in placement mode - do nothing (don't exit mode)
                return;
            }

            // Check if clicking on ship build panel (for port building)
            if (shipBuildPanelBounds) {
                const sbp = shipBuildPanelBounds;
                if (mouseX >= sbp.x && mouseX <= sbp.x + sbp.width &&
                    mouseY >= sbp.y && mouseY <= sbp.y + sbp.height) {
                    // Check which button was clicked
                    for (const btn of sbp.buttons) {
                        if (mouseY >= btn.y && mouseY <= btn.y + btn.height) {
                            // Only enter placement mode if can afford
                            const portData = PORTS[btn.portType];
                            if (canAfford(gameState.resources, portData.cost)) {
                                enterPortBuildMode(gameState, sbp.shipIndex, btn.portType);
                                console.log(`Entering port placement mode: ${btn.portType}`);
                            }
                            return;
                        }
                    }
                    return;  // Clicked panel but not button
                }
            }

            // Check if clicking on build panel UI
            if (buildPanelBounds) {
                const bp = buildPanelBounds;
                if (mouseX >= bp.x && mouseX <= bp.x + bp.width &&
                    mouseY >= bp.y && mouseY <= bp.y + bp.height) {
                    // Check which ship build button was clicked
                    for (const btn of bp.buttons) {
                        if (mouseY >= btn.y && mouseY <= btn.y + btn.height) {
                            // Get the selected port and start building
                            const selectedPortIndices = gameState.selectedUnits.filter(u => u.type === 'port');
                            if (selectedPortIndices.length === 1) {
                                const portIdx = selectedPortIndices[0].index;
                                const port = gameState.ports[portIdx];
                                const shipData = SHIPS[btn.shipType];
                                const portBusy = port.buildQueue || isPortBuildingSettlement(portIdx, gameState.farms);
                                if (!portBusy && canAfford(gameState.resources, shipData.cost)) {
                                    deductCost(gameState.resources, shipData.cost);
                                    startBuilding(port, btn.shipType);
                                    console.log(`Started building: ${btn.shipType}`);
                                }
                            }
                            return;  // Don't process as world click
                        }
                    }

                    // Check if upgrade button was clicked
                    if (bp.upgradeButton) {
                        const ubtn = bp.upgradeButton;
                        if (mouseY >= ubtn.y && mouseY <= ubtn.y + ubtn.height) {
                            const selectedPortIndices = gameState.selectedUnits.filter(u => u.type === 'port');
                            if (selectedPortIndices.length === 1) {
                                const portIdx = selectedPortIndices[0].index;
                                const port = gameState.ports[portIdx];
                                const nextPortData = PORTS[ubtn.portType];
                                const portBusy = port.buildQueue || isPortBuildingSettlement(portIdx, gameState.farms);
                                if (!portBusy && !port.construction && canAfford(gameState.resources, nextPortData.cost)) {
                                    deductCost(gameState.resources, nextPortData.cost);
                                    startPortUpgrade(port);
                                    console.log(`Started upgrading to: ${ubtn.portType}`);
                                }
                            }
                            return;
                        }
                    }

                    // Check if farm button was clicked
                    if (bp.farmButton) {
                        const fbtn = bp.farmButton;
                        if (mouseY >= fbtn.y && mouseY <= fbtn.y + fbtn.height) {
                            // Only enter if not already building a settlement
                            if (!isPortBuildingSettlement(bp.portIndex, gameState.farms)) {
                                enterFarmBuildMode(gameState, bp.portIndex);
                                console.log(`Entering farm placement mode from port ${bp.portIndex}`);
                            }
                            return;
                        }
                    }

                    return;  // Clicked on panel but not on a button - still don't process as world click
                }
            }

            const worldX = (mouseX - k.width() / 2) / zoom + cameraX;
            const worldY = (mouseY - k.height() / 2) / zoom + cameraY;
            const clickedHex = pixelToHex(worldX, worldY);

            // Check modifier keys
            const isShiftHeld = k.isKeyDown("shift");
            const isCommandHeld = k.isKeyDown("meta");  // Command on Mac

            // First, check if clicking on a unit
            let clickedOnUnit = false;

            // Check ships
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
                    clickedOnUnit = true;
                    console.log(`Selected ship: ${ship.type}`);
                    break;
                }
            }

            // Check if Command+clicking on a FOREIGN port with ships selected → set up trade route
            if (!clickedOnUnit) {
                const selectedShips = getSelectedShips(gameState);
                if (selectedShips.length > 0 && isCommandHeld) {
                    // Check foreign ports only (index > 0, skip home port at index 0)
                    for (let i = 1; i < gameState.ports.length; i++) {
                        const port = gameState.ports[i];
                        // Skip ports still under construction
                        if (port.construction) continue;

                        const portPos = hexToPixel(port.q, port.r);
                        const dx = worldX - portPos.x;
                        const dy = worldY - portPos.y;
                        const dist = Math.sqrt(dx * dx + dy * dy);

                        if (dist < SELECTION_RADIUS) {
                            // Found a foreign port - set up trade route for selected ships
                            const adjacentWater = findFreeAdjacentWater(map, port.q, port.r, gameState.ships);

                            for (const sel of gameState.selectedUnits) {
                                if (sel.type !== 'ship') continue;
                                // Skip ships that are currently building a port
                                if (isShipBuildingPort(sel.index, gameState.ports)) continue;

                                const ship = gameState.ships[sel.index];
                                ship.tradeRoute = { foreignPortIndex: i, homePortIndex: 0 };
                                ship.dockingState = null;  // Cancel any current loading
                                ship.waitingForDock = null;

                                if (adjacentWater) {
                                    // Dock is free - navigate directly
                                    ship.waypoint = { q: adjacentWater.q, r: adjacentWater.r };
                                    ship.path = null;
                                    ship.moveProgress = 0;
                                } else {
                                    // Dock is busy - find nearby waiting spot
                                    const waitingSpot = findNearbyWaitingHex(map, port.q, port.r, gameState.ships);
                                    if (waitingSpot) {
                                        ship.waypoint = { q: waitingSpot.q, r: waitingSpot.r };
                                        ship.path = null;
                                        ship.moveProgress = 0;
                                        ship.waitingForDock = { portIndex: i, retryTimer: 0 };
                                        console.log(`Ship waiting for dock at port ${i}`);
                                    }
                                }
                            }
                            console.log(`Set trade route to foreign port ${i}`);
                            clickedOnUnit = true;  // Prevent further processing
                            break;
                        }
                    }
                }
            }

            // Check if clicking on HOME port with ships carrying cargo → navigate and unload
            if (!clickedOnUnit && gameState.ports.length > 0) {
                const selectedShips = getSelectedShips(gameState);
                // Check if any selected ship has cargo
                const shipsWithCargo = selectedShips.filter(ship =>
                    (ship.cargo?.wood || 0) + (ship.cargo?.food || 0) > 0
                );

                if (shipsWithCargo.length > 0 && isCommandHeld) {
                    const homePort = gameState.ports[0];
                    const portPos = hexToPixel(homePort.q, homePort.r);
                    const dx = worldX - portPos.x;
                    const dy = worldY - portPos.y;
                    const dist = Math.sqrt(dx * dx + dy * dy);

                    if (dist < SELECTION_RADIUS) {
                        // Clicked on home port - navigate ships with cargo to unload
                        const adjacentWater = findFreeAdjacentWater(map, homePort.q, homePort.r, gameState.ships);

                        for (const sel of gameState.selectedUnits) {
                            if (sel.type !== 'ship') continue;
                            if (isShipBuildingPort(sel.index, gameState.ports)) continue;

                            const ship = gameState.ships[sel.index];
                            const hasCargo = (ship.cargo?.wood || 0) + (ship.cargo?.food || 0) > 0;
                            if (!hasCargo) continue;

                            // Cancel any trade route, set up one-time unload
                            ship.tradeRoute = null;
                            ship.dockingState = null;
                            ship.pendingUnload = true;
                            ship.waitingForDock = null;

                            if (adjacentWater) {
                                // Dock is free - navigate directly
                                ship.waypoint = { q: adjacentWater.q, r: adjacentWater.r };
                                ship.path = null;
                                ship.moveProgress = 0;
                            } else {
                                // Dock is busy - find nearby waiting spot
                                const waitingSpot = findNearbyWaitingHex(map, homePort.q, homePort.r, gameState.ships);
                                if (waitingSpot) {
                                    ship.waypoint = { q: waitingSpot.q, r: waitingSpot.r };
                                    ship.path = null;
                                    ship.moveProgress = 0;
                                    ship.waitingForDock = { portIndex: 0, retryTimer: 0 };
                                    console.log(`Ship waiting for dock at home port`);
                                }
                            }
                        }
                        console.log(`Sending ${shipsWithCargo.length} ship(s) to unload at home port`);
                        clickedOnUnit = true;
                    }
                }
            }

            // Check ports if no ship clicked (regular port selection)
            if (!clickedOnUnit) {
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
                        clickedOnUnit = true;
                        console.log(`Selected port: ${port.type}`);
                        break;
                    }
                }
            }

            // Check farms if no ship or port clicked
            if (!clickedOnUnit) {
                for (let i = 0; i < gameState.farms.length; i++) {
                    const farm = gameState.farms[i];
                    const farmPos = hexToPixel(farm.q, farm.r);
                    const dx = worldX - farmPos.x;
                    const dy = worldY - farmPos.y;
                    const dist = Math.sqrt(dx * dx + dy * dy);

                    if (dist < SELECTION_RADIUS) {
                        if (isShiftHeld) {
                            toggleSelection(gameState, 'farm', i);
                        } else {
                            selectUnit(gameState, 'farm', i);
                        }
                        clickedOnUnit = true;
                        console.log(`Selected farm at (${farm.q}, ${farm.r})`);
                        break;
                    }
                }
            }

            // If clicked on empty space...
            if (!clickedOnUnit) {
                const selectedShips = getSelectedShips(gameState);

                // If Command+click with ships selected, set waypoint
                if (selectedShips.length > 0 && isCommandHeld) {
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
                            // No water found - can't set waypoint
                            return;
                        }
                    }

                    // Set waypoint for each selected ship (skip ships that are building ports)
                    let movedCount = 0;
                    for (const sel of gameState.selectedUnits) {
                        if (sel.type !== 'ship') continue;
                        // Skip ships that are currently building a port
                        if (isShipBuildingPort(sel.index, gameState.ports)) continue;

                        const ship = gameState.ships[sel.index];
                        // Cancel any active trade route when manually setting waypoint
                        if (ship.tradeRoute) {
                            cancelTradeRoute(ship);
                        }
                        ship.waypoint = { q: targetQ, r: targetR };
                        ship.path = null;
                        ship.moveProgress = 0;
                        movedCount++;
                    }
                    if (movedCount > 0) {
                        console.log(`Set waypoint at (${targetQ}, ${targetR}) for ${movedCount} ship(s)`);
                    }
                } else if (!isShiftHeld) {
                    // Click on empty space without Command = deselect all
                    clearSelection(gameState);
                }
            }
        }

        // Selection box handler - select all units within box bounds
        function handleSelectionBox() {
            const halfWidth = k.width() / 2;
            const halfHeight = k.height() / 2;

            // Box bounds in screen coordinates
            const boxLeft = Math.min(selectStartX, selectEndX);
            const boxRight = Math.max(selectStartX, selectEndX);
            const boxTop = Math.min(selectStartY, selectEndY);
            const boxBottom = Math.max(selectStartY, selectEndY);

            // Clear selection first
            clearSelection(gameState);

            // Check each ship
            for (let i = 0; i < gameState.ships.length; i++) {
                const ship = gameState.ships[i];
                const pos = getShipVisualPos(ship);
                const screenX = (pos.x - cameraX) * zoom + halfWidth;
                const screenY = (pos.y - cameraY) * zoom + halfHeight;

                if (screenX >= boxLeft && screenX <= boxRight &&
                    screenY >= boxTop && screenY <= boxBottom) {
                    addToSelection(gameState, 'ship', i);
                }
            }

            // Check each port
            for (let i = 0; i < gameState.ports.length; i++) {
                const port = gameState.ports[i];
                const pos = hexToPixel(port.q, port.r);
                const screenX = (pos.x - cameraX) * zoom + halfWidth;
                const screenY = (pos.y - cameraY) * zoom + halfHeight;

                if (screenX >= boxLeft && screenX <= boxRight &&
                    screenY >= boxTop && screenY <= boxBottom) {
                    addToSelection(gameState, 'port', i);
                }
            }

            // Check each farm
            for (let i = 0; i < gameState.farms.length; i++) {
                const farm = gameState.farms[i];
                const pos = hexToPixel(farm.q, farm.r);
                const screenX = (pos.x - cameraX) * zoom + halfWidth;
                const screenY = (pos.y - cameraY) * zoom + halfHeight;

                if (screenX >= boxLeft && screenX <= boxRight &&
                    screenY >= boxTop && screenY <= boxBottom) {
                    addToSelection(gameState, 'farm', i);
                }
            }

            const count = gameState.selectedUnits.length;
            if (count > 0) {
                console.log(`Selected ${count} unit(s)`);
            }
        }

        // Center camera on starting position (or map center if no start)
        if (startTile) {
            const startPos = hexToPixel(startTile.q, startTile.r);
            cameraX = startPos.x;
            cameraY = startPos.y;
        } else {
            const centerQ = Math.floor(map.width / 2);
            const centerR = Math.floor(map.height / 2);
            const centerPos = hexToPixel(centerQ, centerR);
            cameraX = centerPos.x;
            cameraY = centerPos.y;
        }
    };
}
