// AI Player Decision System
// Handles strategic planning and action execution for AI opponent

import { hexKey, hexNeighbors, hexDistance } from "../hex.js";
import { SHIPS } from "../sprites/ships.js";
import { PORTS } from "../sprites/ports.js";
import { SETTLEMENTS } from "../sprites/settlements.js";
import { TOWERS } from "../sprites/towers.js";
import {
    createShip, createPort, createSettlement, createTower,
    findFreeAdjacentWater, findAdjacentWater,
    isValidPortSite, isValidSettlementSite, isValidTowerSite,
    canAfford, deductCost, startBuilding, getBuildableShips,
    getPortsByOwner, getShipsByOwner, getSettlementsByOwner, getTowersByOwner,
    getHomePortIndexForOwner, isLandConnected, canAffordCrew,
    getPortIndicesByOwner
} from "../gameState.js";
import { findPath } from "../pathfinding.js";

// Decision intervals (seconds)
const STRATEGIC_DECISION_INTERVAL = 5;    // Major priority adjustments
const BUILD_DECISION_INTERVAL = 3;        // Building evaluation
const SHIP_COMMAND_INTERVAL = 2;          // Ship command updates

/**
 * Main AI update function - called every frame in versus mode
 */
export function updateAIPlayer(gameState, map, fogState, dt) {
    if (dt === 0) return; // Paused
    if (!gameState.aiPlayer) return; // No AI in this mode

    const ai = gameState.aiPlayer;

    // Update decision cooldowns
    ai.decisionCooldown = Math.max(0, (ai.decisionCooldown || 0) - dt);
    ai.buildDecisionCooldown = Math.max(0, (ai.buildDecisionCooldown || 0) - dt);
    ai.shipCommandCooldown = Math.max(0, (ai.shipCommandCooldown || 0) - dt);

    // Strategic decisions (every 5 seconds)
    if (ai.decisionCooldown <= 0) {
        updateStrategicPriorities(gameState, map);
        ai.decisionCooldown = STRATEGIC_DECISION_INTERVAL;
    }

    // Build decisions (every 3 seconds)
    if (ai.buildDecisionCooldown <= 0) {
        evaluateBuildOptions(gameState, map, fogState);
        ai.buildDecisionCooldown = BUILD_DECISION_INTERVAL;
    }

    // Ship commands (every 2 seconds)
    if (ai.shipCommandCooldown <= 0) {
        updateShipCommands(gameState, map);
        ai.shipCommandCooldown = SHIP_COMMAND_INTERVAL;
    }

    // Decay threat level over time
    ai.threatLevel = Math.max(0, (ai.threatLevel || 0) - dt * 0.1);
}

/**
 * Evaluate current game state and adjust strategic priorities
 */
function updateStrategicPriorities(gameState, map) {
    const ai = gameState.aiPlayer;
    const aiShips = getShipsByOwner(gameState, 'ai');
    const aiPorts = getPortsByOwner(gameState, 'ai');
    const aiSettlements = getSettlementsByOwner(gameState, 'ai');
    const aiTowers = getTowersByOwner(gameState, 'ai');

    const playerShips = getShipsByOwner(gameState, 'player');
    const playerPorts = getPortsByOwner(gameState, 'player');
    const playerTowers = getTowersByOwner(gameState, 'player');

    // Calculate relative power
    const aiPower = aiShips.length * 2 + aiPorts.length * 3 + aiTowers.length * 2;
    const playerPower = playerShips.length * 2 + playerPorts.length * 3 + playerTowers.length * 2;
    const powerRatio = playerPower > 0 ? aiPower / playerPower : 2;

    // Adjust priorities based on situation
    if (powerRatio < 0.5) {
        // Behind - focus on economy and defense
        ai.priorities.economy = 0.8;
        ai.priorities.defense = 0.7;
        ai.priorities.military = 0.3;
        ai.priorities.expansion = 0.3;
    } else if (powerRatio > 1.5) {
        // Ahead - be aggressive
        ai.priorities.military = 0.8;
        ai.priorities.expansion = 0.6;
        ai.priorities.economy = 0.4;
        ai.priorities.defense = 0.3;
    } else {
        // Even - balanced approach
        ai.priorities.economy = 0.5;
        ai.priorities.military = 0.5;
        ai.priorities.expansion = 0.5;
        ai.priorities.defense = 0.4;
    }

    // If recently attacked, boost defense
    if (ai.threatLevel > 0.5) {
        ai.priorities.defense = Math.max(ai.priorities.defense, 0.8);
        ai.priorities.military = Math.max(ai.priorities.military, 0.6);
    }
}

/**
 * Evaluate what to build next
 */
function evaluateBuildOptions(gameState, map, fogState) {
    const ai = gameState.aiPlayer;
    const aiPorts = getPortsByOwner(gameState, 'ai');
    const aiShips = getShipsByOwner(gameState, 'ai');
    const aiSettlements = getSettlementsByOwner(gameState, 'ai');
    const aiTowers = getTowersByOwner(gameState, 'ai');

    // Skip if no ports
    if (aiPorts.length === 0) return;

    // Priority 1: Always maintain at least 2 ships
    if (aiShips.length < 2) {
        if (tryBuildShip(gameState, map, 'cutter', fogState)) return;
    }

    // Priority 2: Build settlements for resources (max 4)
    const completedSettlements = aiSettlements.filter(s => !s.construction).length;
    if (completedSettlements < 4 && ai.resources.wood >= 5) {
        if (tryBuildSettlement(gameState, map)) return;
    }

    // Priority 3: Build ships based on priorities
    if (ai.priorities.military > 0.5 && aiShips.length < 6) {
        // Build combat ships
        if (ai.resources.wood >= 25) {
            if (tryBuildShip(gameState, map, 'schooner', fogState)) return;
        } else if (ai.resources.wood >= 10) {
            if (tryBuildShip(gameState, map, 'cutter', fogState)) return;
        }
    } else if (ai.priorities.economy > 0.5 && aiShips.length < 4) {
        // Build cargo ships for trading
        if (tryBuildShip(gameState, map, 'schooner', fogState)) return;
        if (tryBuildShip(gameState, map, 'cutter', fogState)) return;
    }

    // Priority 4: Build defensive towers near home port
    if (ai.priorities.defense > 0.5 && aiTowers.length < 2 && ai.resources.wood >= 15) {
        if (tryBuildTower(gameState, map)) return;
    }
}

/**
 * Try to build a ship at an available port
 */
function tryBuildShip(gameState, map, preferredType, fogState) {
    const ai = gameState.aiPlayer;
    const aiPorts = getPortsByOwner(gameState, 'ai');

    for (const port of aiPorts) {
        // Skip if port is busy
        if (port.construction || port.buildQueue) continue;

        const buildable = getBuildableShips(port);
        const shipType = buildable.includes(preferredType) ? preferredType : buildable[0];
        if (!shipType) continue;

        const shipData = SHIPS[shipType];

        // Check resources
        if (!canAfford(ai.resources, shipData.cost)) continue;

        // Check crew
        if (!canAffordCrewForOwner(gameState, shipData.crewCost, 'ai')) continue;

        // Check if there's space to spawn
        const waterTile = findFreeAdjacentWater(map, port.q, port.r, gameState.ships);
        if (!waterTile) continue;

        // Build!
        deductCost(ai.resources, shipData.cost);
        startBuilding(port, shipType);
        return true;
    }
    return false;
}

/**
 * Check if AI can afford crew cost
 */
function canAffordCrewForOwner(gameState, crewCost, owner) {
    let cap = 0;
    let used = 0;

    // Ports contribute to cap (only completed ports)
    for (const port of gameState.ports) {
        if (port.owner !== owner) continue;
        if (!port.construction) {
            const portData = PORTS[port.type];
            cap += portData.crewCapContribution || 0;
        }
        // Ships in build queue count toward crew used
        if (port.buildQueue) {
            const shipData = SHIPS[port.buildQueue.shipType];
            used += shipData.crewCost || 0;
        }
    }

    // Settlements contribute to cap
    for (const settlement of gameState.settlements) {
        if (settlement.owner !== owner) continue;
        if (!settlement.construction) {
            cap += SETTLEMENTS.settlement.crewCapContribution || 0;
        }
    }

    // Ships use crew
    for (const ship of gameState.ships) {
        if (ship.owner !== owner) continue;
        const shipData = SHIPS[ship.type];
        used += shipData.crewCost || 0;
    }

    // Towers use crew
    for (const tower of gameState.towers) {
        if (tower.owner !== owner) continue;
        const towerData = TOWERS[tower.type];
        used += towerData.crewCost || 0;
    }

    return (cap - used) >= crewCost;
}

/**
 * Try to build a settlement from a port
 */
function tryBuildSettlement(gameState, map) {
    const ai = gameState.aiPlayer;
    const aiPorts = getPortsByOwner(gameState, 'ai');
    const settlementData = SETTLEMENTS.settlement;

    if (!canAfford(ai.resources, settlementData.cost)) return false;

    for (let i = 0; i < gameState.ports.length; i++) {
        const port = gameState.ports[i];
        if (port.owner !== 'ai') continue;
        if (port.construction) continue;

        // Check if port is already building a settlement
        const alreadyBuilding = gameState.settlements.some(
            s => s.construction && s.parentPortIndex === i
        );
        if (alreadyBuilding) continue;

        // Find valid settlement site connected to this port
        const site = findSettlementSite(map, port, gameState);
        if (site) {
            deductCost(ai.resources, settlementData.cost);
            const portIndex = gameState.ports.indexOf(port);
            const settlement = createSettlement(site.q, site.r, true, portIndex, 'ai');
            gameState.settlements.push(settlement);
            return true;
        }
    }
    return false;
}

/**
 * Find a valid settlement site near a port
 */
function findSettlementSite(map, port, gameState) {
    // BFS from port to find inland grass tiles
    const visited = new Set();
    const queue = [{ q: port.q, r: port.r }];

    while (queue.length > 0) {
        const current = queue.shift();
        const key = hexKey(current.q, current.r);
        if (visited.has(key)) continue;
        visited.add(key);

        const tile = map.tiles.get(key);
        if (!tile || tile.type !== 'land') continue;

        // Check if valid settlement site
        if (isValidSettlementSite(map, current.q, current.r, gameState.settlements, gameState.ports, port)) {
            return current;
        }

        // Add neighbors to search (limit search radius)
        if (visited.size < 50) {
            const neighbors = hexNeighbors(current.q, current.r);
            for (const n of neighbors) {
                if (!visited.has(hexKey(n.q, n.r))) {
                    queue.push(n);
                }
            }
        }
    }
    return null;
}

/**
 * Try to build a tower near the home port
 */
function tryBuildTower(gameState, map) {
    const ai = gameState.aiPlayer;
    const towerData = TOWERS.watchtower;

    if (!canAfford(ai.resources, towerData.cost)) return false;
    if (!canAffordCrewForOwner(gameState, towerData.crewCost, 'ai')) return false;

    // Find a good tower site near AI home port
    if (!gameState.aiHomeIslandHex) return false;

    const homeQ = gameState.aiHomeIslandHex.q;
    const homeR = gameState.aiHomeIslandHex.r;

    // Search for valid tower site
    const visited = new Set();
    const queue = [{ q: homeQ, r: homeR }];

    while (queue.length > 0) {
        const current = queue.shift();
        const key = hexKey(current.q, current.r);
        if (visited.has(key)) continue;
        visited.add(key);

        const tile = map.tiles.get(key);
        if (!tile || tile.type !== 'land') continue;

        // Check if valid tower site
        if (isValidTowerSite(map, current.q, current.r, gameState.towers, gameState.ports, gameState.settlements)) {
            deductCost(ai.resources, towerData.cost);
            const tower = createTower('watchtower', current.q, current.r, true, null, null, 'ai');
            gameState.towers.push(tower);
            return true;
        }

        // Add neighbors (limit search)
        if (visited.size < 30) {
            const neighbors = hexNeighbors(current.q, current.r);
            for (const n of neighbors) {
                if (!visited.has(hexKey(n.q, n.r))) {
                    queue.push(n);
                }
            }
        }
    }
    return false;
}

/**
 * Update AI ship commands - patrol, attack, etc.
 */
function updateShipCommands(gameState, map) {
    const aiShips = getShipsByOwner(gameState, 'ai');
    const playerShips = getShipsByOwner(gameState, 'player');
    const playerPorts = getPortsByOwner(gameState, 'player');
    const playerSettlements = getSettlementsByOwner(gameState, 'player');
    const playerTowers = getTowersByOwner(gameState, 'player');

    for (let i = 0; i < gameState.ships.length; i++) {
        const ship = gameState.ships[i];
        if (ship.owner !== 'ai') continue;
        if (ship.repair) continue; // Don't command ships being repaired

        // Find nearest enemy target
        const nearestEnemy = findNearestEnemy(ship, gameState);

        if (nearestEnemy && nearestEnemy.dist <= 8) {
            // Chase and attack nearby enemies
            ship.attackTarget = { type: nearestEnemy.type, index: nearestEnemy.index };

            // Set waypoint to target
            const targetPos = getTargetPosition(nearestEnemy, gameState, map);
            if (targetPos && (ship.waypoints.length === 0 ||
                ship.waypoints[0].q !== targetPos.q ||
                ship.waypoints[0].r !== targetPos.r)) {
                ship.waypoints = [{ q: targetPos.q, r: targetPos.r }];
                ship.path = null;
            }
        } else {
            // Clear attack target if enemy is far
            ship.attackTarget = null;

            // Patrol: If idle, patrol around home port
            if (ship.waypoints.length === 0) {
                const aiHomePort = gameState.ports.find(p => p.owner === 'ai');
                if (aiHomePort) {
                    const patrolPoint = generatePatrolPoint(aiHomePort, map, gameState);
                    if (patrolPoint) {
                        ship.waypoints = [patrolPoint];
                        ship.path = null;
                    }
                }
            }
        }
    }
}

/**
 * Get the position to move to for attacking a target
 */
function getTargetPosition(target, gameState, map) {
    if (target.type === 'ship') {
        const ship = gameState.ships[target.index];
        if (ship) return { q: ship.q, r: ship.r };
    } else if (target.type === 'port') {
        const port = gameState.ports[target.index];
        if (port) {
            // Find adjacent water to the port
            const water = findAdjacentWater(map, port.q, port.r);
            if (water) return { q: water.q, r: water.r };
        }
    } else if (target.type === 'settlement') {
        const settlement = gameState.settlements[target.index];
        if (settlement) {
            // Find nearby water
            return findNearestWaterToLand(map, settlement.q, settlement.r);
        }
    } else if (target.type === 'tower') {
        const tower = gameState.towers[target.index];
        if (tower) {
            return findNearestWaterToLand(map, tower.q, tower.r);
        }
    }
    return null;
}

/**
 * Find nearest water tile to a land position
 */
function findNearestWaterToLand(map, landQ, landR) {
    const visited = new Set();
    const queue = [{ q: landQ, r: landR }];

    while (queue.length > 0) {
        const current = queue.shift();
        const key = hexKey(current.q, current.r);
        if (visited.has(key)) continue;
        visited.add(key);

        const tile = map.tiles.get(key);
        if (tile && (tile.type === 'shallow' || tile.type === 'deep_ocean')) {
            return { q: current.q, r: current.r };
        }

        if (visited.size < 30) {
            const neighbors = hexNeighbors(current.q, current.r);
            for (const n of neighbors) {
                if (!visited.has(hexKey(n.q, n.r))) {
                    queue.push(n);
                }
            }
        }
    }
    return null;
}

/**
 * Find nearest enemy target for an AI ship
 */
function findNearestEnemy(ship, gameState) {
    let nearest = null;
    let nearestDist = Infinity;

    // Check player ships
    for (let i = 0; i < gameState.ships.length; i++) {
        const target = gameState.ships[i];
        if (target.owner !== 'player') continue;

        const dist = hexDistance(ship.q, ship.r, target.q, target.r);
        if (dist < nearestDist) {
            nearestDist = dist;
            nearest = { type: 'ship', index: i, target, dist };
        }
    }

    // Check player ports
    for (let i = 0; i < gameState.ports.length; i++) {
        const target = gameState.ports[i];
        if (target.owner !== 'player') continue;

        const dist = hexDistance(ship.q, ship.r, target.q, target.r);
        if (dist < nearestDist) {
            nearestDist = dist;
            nearest = { type: 'port', index: i, target, dist };
        }
    }

    // Check player settlements
    for (let i = 0; i < gameState.settlements.length; i++) {
        const target = gameState.settlements[i];
        if (target.owner !== 'player') continue;

        const dist = hexDistance(ship.q, ship.r, target.q, target.r);
        if (dist < nearestDist) {
            nearestDist = dist;
            nearest = { type: 'settlement', index: i, target, dist };
        }
    }

    // Check player towers
    for (let i = 0; i < gameState.towers.length; i++) {
        const target = gameState.towers[i];
        if (target.owner !== 'player') continue;

        const dist = hexDistance(ship.q, ship.r, target.q, target.r);
        if (dist < nearestDist) {
            nearestDist = dist;
            nearest = { type: 'tower', index: i, target, dist };
        }
    }

    return nearest;
}

/**
 * Generate a random patrol point near a port
 */
function generatePatrolPoint(port, map, gameState) {
    const patrolRadius = 6 + Math.floor(Math.random() * 8);
    const angle = Math.random() * Math.PI * 2;

    // Hex offset approximation
    const dq = Math.round(Math.cos(angle) * patrolRadius * 0.866);
    const dr = Math.round(Math.sin(angle) * patrolRadius);

    const targetQ = port.q + dq;
    const targetR = port.r + dr;

    const tile = map.tiles.get(hexKey(targetQ, targetR));
    if (tile && (tile.type === 'shallow' || tile.type === 'deep_ocean')) {
        // Check not occupied
        const occupied = gameState.ships.some(s => s.q === targetQ && s.r === targetR);
        if (!occupied) {
            return { q: targetQ, r: targetR };
        }
    }

    // Fallback: find any nearby water
    for (let attempts = 0; attempts < 10; attempts++) {
        const randAngle = Math.random() * Math.PI * 2;
        const randRadius = 4 + Math.floor(Math.random() * 10);
        const rq = port.q + Math.round(Math.cos(randAngle) * randRadius * 0.866);
        const rr = port.r + Math.round(Math.sin(randAngle) * randRadius);

        const t = map.tiles.get(hexKey(rq, rr));
        if (t && (t.type === 'shallow' || t.type === 'deep_ocean')) {
            const occ = gameState.ships.some(s => s.q === rq && s.r === rr);
            if (!occ) {
                return { q: rq, r: rr };
            }
        }
    }

    return null;
}

/**
 * Called when AI entity is attacked - increases threat level
 */
export function notifyAIAttacked(gameState) {
    if (gameState.aiPlayer) {
        gameState.aiPlayer.threatLevel = Math.min(1, (gameState.aiPlayer.threatLevel || 0) + 0.3);
    }
}
