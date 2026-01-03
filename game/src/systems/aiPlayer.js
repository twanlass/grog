// AI Player Decision System
// Handles strategic planning and action execution for AI opponent

import { hexKey, hexNeighbors, hexDistance } from "../hex.js";
import { SHIPS } from "../sprites/ships.js";
import { PORTS } from "../sprites/ports.js";
import { SETTLEMENTS } from "../sprites/settlements.js";
import { TOWERS } from "../sprites/towers.js";
import {
    createShip, createPort, createSettlement, createTower,
    findFreeAdjacentWater, findAdjacentWater, findNearestWaterInRange,
    isValidPortSite, isValidSettlementSite, isValidTowerSite,
    canAfford, deductCost, startBuilding, getBuildableShips,
    getPortsByOwner, getShipsByOwner, getSettlementsByOwner, getTowersByOwner,
    getHomePortIndexForOwner, isLandConnected, canAffordCrew,
    getPortIndicesByOwner, getNextTowerType, startTowerUpgrade, isAIOwner
} from "../gameState.js";
import { findPath } from "../pathfinding.js";

// Decision intervals (seconds)
const STRATEGIC_DECISION_INTERVAL = 5;    // Major priority adjustments
const BUILD_DECISION_INTERVAL = 3;        // Building evaluation
const SHIP_COMMAND_INTERVAL = 2;          // Ship command updates
const TACTICS_DECISION_INTERVAL = 4;      // Tactical decisions (scout, attack groups, defend)

// AI Strategy Definitions
// Each strategy has different priorities, build configs, and ship behaviors
export const AI_STRATEGIES = {
    aggressive: {
        name: "Aggressive",
        description: "Early military rush, attack before player establishes",

        // Base priority weights (before situational adjustments)
        basePriorities: {
            expansion: 0.3,
            economy: 0.3,
            military: 0.9,
            defense: 0.2,
        },

        // Build order preferences
        buildConfig: {
            minShips: 3,              // Maintain more ships before other builds
            maxSettlements: 2,        // Build fewer settlements (less eco focus)
            maxTowers: 1,             // Minimal tower investment
            preferredShipType: 'schooner',  // Prefer combat-capable ships
            shipCap: 8,               // Allow more ships for aggression
            settlementWoodThreshold: 10,  // Higher threshold (deprioritize settlements)
            towerDefenseThreshold: 0.7,   // Only build towers if defense very high
            towerUpgradePriority: 0.2,    // Rarely upgrade towers (focused on ships)
            attackGroupSize: 2,           // Attack with fewer ships (aggressive)
        },

        // Ship behavior
        shipBehavior: {
            patrolRadiusMin: 10,      // Patrol farther from home
            patrolRadiusMax: 20,      // Aggressive patrolling into enemy territory
            engagementRange: 10,      // Detect and chase enemies from farther
            pursuitPersistence: 0.9,  // High chance to continue pursuit
            retreatHealthThreshold: 0.2,  // Only retreat when very damaged
        },

        // Priority modifiers per game phase
        phaseModifiers: {
            early: { military: 1.2, economy: 0.8 },   // Rush early
            mid: { military: 1.1, expansion: 0.9 },
            late: { military: 1.0, defense: 1.1 },
        },
    },

    defensive: {
        name: "Defensive",
        description: "Heavy tower investment, turtle, counterattack",

        basePriorities: {
            expansion: 0.4,
            economy: 0.5,
            military: 0.4,
            defense: 0.9,
        },

        buildConfig: {
            minShips: 2,              // Standard minimum
            maxSettlements: 3,        // Moderate economy
            maxTowers: 4,             // Heavy tower investment
            preferredShipType: 'cutter',  // Cheaper ships for defense
            shipCap: 5,               // Fewer ships (rely on towers)
            settlementWoodThreshold: 5,
            towerDefenseThreshold: 0.3,   // Build towers even with low defense priority
            towerUpgradePriority: 0.8,    // Aggressively upgrade towers
            attackGroupSize: 3,           // Wait for more ships before attacking
        },

        shipBehavior: {
            patrolRadiusMin: 4,       // Stay close to home
            patrolRadiusMax: 8,       // Tight patrol radius
            engagementRange: 6,       // Only engage when close
            pursuitPersistence: 0.4,  // Often break off pursuit
            retreatHealthThreshold: 0.5,  // Retreat early to preserve forces
        },

        phaseModifiers: {
            early: { defense: 1.2, military: 0.8 },
            mid: { defense: 1.1, economy: 1.1 },
            late: { military: 1.2, defense: 1.0 },  // Counterattack late
        },
    },

    economic: {
        name: "Economic",
        description: "Max settlements early, boom before striking",

        basePriorities: {
            expansion: 0.8,
            economy: 0.9,
            military: 0.3,
            defense: 0.4,
        },

        buildConfig: {
            minShips: 2,              // Standard minimum
            maxSettlements: 6,        // Maximum settlement investment
            maxTowers: 2,             // Some defense
            preferredShipType: 'schooner',  // Balanced ships
            shipCap: 6,               // Moderate ship count
            settlementWoodThreshold: 3,    // Very low threshold (prioritize settlements)
            towerDefenseThreshold: 0.5,
            towerUpgradePriority: 0.4,    // Sometimes upgrade towers
            attackGroupSize: 4,           // Wait for large force before attacking
        },

        shipBehavior: {
            patrolRadiusMin: 5,       // Moderate patrol
            patrolRadiusMax: 10,
            engagementRange: 5,       // Avoid engagement early
            pursuitPersistence: 0.5,  // Sometimes pursue
            retreatHealthThreshold: 0.4,
        },

        phaseModifiers: {
            early: { economy: 1.3, military: 0.6 },   // Boom hard early
            mid: { economy: 1.1, military: 0.9 },
            late: { military: 1.4, economy: 0.8 },     // Convert eco to military late
        },
    },
};

// Available strategy keys for random selection
export const STRATEGY_KEYS = ['aggressive', 'defensive', 'economic'];

/**
 * Main AI update function - called every frame in versus mode
 * Now supports multiple AI players (3-way free-for-all)
 */
export function updateAIPlayer(gameState, map, fogState, dt) {
    if (dt === 0) return; // Paused
    if (!gameState.aiPlayers || gameState.aiPlayers.length === 0) return; // No AIs in this mode

    // Update each AI player independently
    for (let aiIndex = 0; aiIndex < gameState.aiPlayers.length; aiIndex++) {
        const aiOwner = `ai${aiIndex + 1}`;  // 'ai1' or 'ai2'
        const ai = gameState.aiPlayers[aiIndex];
        if (!ai) continue;

        updateSingleAI(gameState, map, fogState, dt, ai, aiOwner, aiIndex);
    }
}

/**
 * Update a single AI player's decisions
 */
function updateSingleAI(gameState, map, fogState, dt, ai, aiOwner, aiIndex) {
    // Track total game time for phase determination
    ai.gameTime = (ai.gameTime || 0) + dt;

    // Update decision cooldowns
    ai.decisionCooldown = Math.max(0, (ai.decisionCooldown || 0) - dt);
    ai.buildDecisionCooldown = Math.max(0, (ai.buildDecisionCooldown || 0) - dt);
    ai.shipCommandCooldown = Math.max(0, (ai.shipCommandCooldown || 0) - dt);
    ai.tacticsCooldown = Math.max(0, (ai.tacticsCooldown || 0) - dt);

    // Strategic decisions (every 5 seconds)
    if (ai.decisionCooldown <= 0) {
        updateStrategicPriorities(gameState, map, ai, aiOwner);
        ai.decisionCooldown = STRATEGIC_DECISION_INTERVAL;
    }

    // Build decisions (every 3 seconds)
    if (ai.buildDecisionCooldown <= 0) {
        evaluateBuildOptions(gameState, map, fogState, ai, aiOwner);
        ai.buildDecisionCooldown = BUILD_DECISION_INTERVAL;
    }

    // Tactical decisions (every 4 seconds)
    if (ai.tacticsCooldown <= 0) {
        updateTactics(gameState, map, ai, aiOwner);
        ai.tacticsCooldown = TACTICS_DECISION_INTERVAL;
    }

    // Ship commands (every 2 seconds)
    if (ai.shipCommandCooldown <= 0) {
        updateShipCommands(gameState, map, ai, aiOwner);
        ai.shipCommandCooldown = SHIP_COMMAND_INTERVAL;
    }

    // Decay threat level over time
    ai.threatLevel = Math.max(0, (ai.threatLevel || 0) - dt * 0.1);
}

/**
 * Determine game phase based on time and game state
 */
function determineGamePhase(gameTime, gameState) {
    const totalSettlements = gameState.settlements.length;

    // Early: first 90 seconds or < 3 total settlements
    if (gameTime < 90 || totalSettlements < 3) {
        return 'early';
    }
    // Late: after 300 seconds or > 8 total settlements
    if (gameTime > 300 || totalSettlements > 8) {
        return 'late';
    }
    return 'mid';
}

/**
 * Evaluate current game state and adjust strategic priorities
 * Now uses strategy-based priorities with phase modifiers
 */
function updateStrategicPriorities(gameState, map, ai, aiOwner) {
    const strategy = AI_STRATEGIES[ai.strategy];

    // Update game phase
    ai.gamePhase = determineGamePhase(ai.gameTime, gameState);

    // Get phase modifiers for current phase
    const phaseModifiers = strategy.phaseModifiers[ai.gamePhase] || {};

    // Get this AI's units
    const aiShips = getShipsByOwner(gameState, aiOwner);
    const aiPorts = getPortsByOwner(gameState, aiOwner);
    const aiTowers = getTowersByOwner(gameState, aiOwner);

    // Calculate total enemy power (all non-self factions)
    let enemyPower = 0;
    const factions = ['player', 'ai1', 'ai2'];
    for (const faction of factions) {
        if (faction === aiOwner) continue;  // Skip self
        const ships = getShipsByOwner(gameState, faction);
        const ports = getPortsByOwner(gameState, faction);
        const towers = getTowersByOwner(gameState, faction);
        enemyPower += ships.length * 2 + ports.length * 3 + towers.length * 2;
    }

    // Calculate relative power (against all enemies)
    const aiPower = aiShips.length * 2 + aiPorts.length * 3 + aiTowers.length * 2;
    const powerRatio = enemyPower > 0 ? aiPower / enemyPower : 2;

    // Start with strategy base priorities
    ai.priorities.economy = strategy.basePriorities.economy;
    ai.priorities.military = strategy.basePriorities.military;
    ai.priorities.defense = strategy.basePriorities.defense;
    ai.priorities.expansion = strategy.basePriorities.expansion;

    // Apply phase modifiers
    ai.priorities.economy *= (phaseModifiers.economy || 1.0);
    ai.priorities.military *= (phaseModifiers.military || 1.0);
    ai.priorities.defense *= (phaseModifiers.defense || 1.0);
    ai.priorities.expansion *= (phaseModifiers.expansion || 1.0);

    // Apply situational adjustments (scaled down to not override strategy)
    if (powerRatio < 0.5) {
        // Behind - boost eco/defense moderately
        ai.priorities.economy = Math.min(1.0, ai.priorities.economy + 0.2);
        ai.priorities.defense = Math.min(1.0, ai.priorities.defense + 0.2);
        ai.priorities.military = Math.max(0.2, ai.priorities.military - 0.1);
    } else if (powerRatio > 1.5) {
        // Ahead - boost aggression moderately
        ai.priorities.military = Math.min(1.0, ai.priorities.military + 0.2);
        ai.priorities.expansion = Math.min(1.0, ai.priorities.expansion + 0.1);
    }

    // Threat response (all strategies respond, but aggressive less so)
    if (ai.threatLevel > 0.5) {
        const threatResponse = ai.strategy === 'aggressive' ? 0.2 : 0.4;
        ai.priorities.defense = Math.min(1.0, ai.priorities.defense + threatResponse);
        ai.priorities.military = Math.min(1.0, ai.priorities.military + threatResponse * 0.5);
    }

    // Clamp all priorities to 0-1
    for (const key of Object.keys(ai.priorities)) {
        ai.priorities[key] = Math.max(0, Math.min(1, ai.priorities[key]));
    }
}

// ============================================================
// TACTICS SYSTEM
// ============================================================

/**
 * Main tactics update - manages scout, attack groups, and defend mode
 */
function updateTactics(gameState, map, ai, aiOwner) {
    if (!ai.tactics) return;

    // Priority 1: Check if we need to enter/exit defend mode
    checkDefendMode(gameState, map, ai, aiOwner);

    // If defending, skip other tactics
    if (ai.tactics.isDefending) return;

    // Priority 2: Manage scout ship
    manageScout(gameState, map, ai, aiOwner);

    // Priority 3: Manage group attacks
    manageGroupAttack(gameState, map, ai, aiOwner);
}

/**
 * Check if we should enter or exit defend mode based on threat level
 */
function checkDefendMode(gameState, map, ai, aiOwner) {
    const tactics = ai.tactics;

    // Enter defend mode at high threat (0.7+)
    if (!tactics.isDefending && ai.threatLevel >= 0.7) {
        tactics.isDefending = true;
        tactics.attackGroup = [];  // Cancel attack group
        tactics.attackTarget = null;

        // Recall all ships to home port
        executeDefend(gameState, map, ai, aiOwner);
    }

    // Exit defend mode when threat drops below 0.3
    if (tactics.isDefending && ai.threatLevel < 0.3) {
        tactics.isDefending = false;
    }
}

/**
 * Recall all AI ships to defend home port
 */
function executeDefend(gameState, map, ai, aiOwner) {
    const aiShips = getShipsByOwner(gameState, aiOwner);
    const aiHomePort = gameState.ports.find(p => p.owner === aiOwner);

    if (!aiHomePort) return;

    // Find water near home port for ships to gather
    const rallyPoint = findAdjacentWater(map, aiHomePort.q, aiHomePort.r);
    if (!rallyPoint) return;

    // Send all ships back to defend
    for (const ship of aiShips) {
        if (ship.repair) continue;  // Don't interrupt repairs

        ship.attackTarget = null;
        ship.waypoints = [{ q: rallyPoint.q, r: rallyPoint.r }];
        ship.path = null;
    }
}

/**
 * Manage the scout ship - assign one ship to explore far from home
 */
function manageScout(gameState, map, ai, aiOwner) {
    const tactics = ai.tactics;
    const aiShips = getShipsByOwner(gameState, aiOwner);

    // Need at least 2 ships to have a scout (keep one for defense)
    if (aiShips.length < 2) {
        tactics.scoutShipIndex = null;
        return;
    }

    // Check if current scout is still valid
    if (tactics.scoutShipIndex !== null) {
        const scout = gameState.ships[tactics.scoutShipIndex];
        if (!scout || scout.owner !== aiOwner) {
            tactics.scoutShipIndex = null;
        }
    }

    // Assign a new scout if needed
    if (tactics.scoutShipIndex === null) {
        // Pick a ship that's not in the attack group
        for (let i = 0; i < gameState.ships.length; i++) {
            const ship = gameState.ships[i];
            if (ship.owner !== aiOwner) continue;
            if (ship.repair) continue;
            if (tactics.attackGroup.includes(i)) continue;

            tactics.scoutShipIndex = i;
            break;
        }
    }

    // Control scout behavior
    if (tactics.scoutShipIndex !== null) {
        const scout = gameState.ships[tactics.scoutShipIndex];
        if (scout && scout.waypoints.length === 0) {
            // Generate a far patrol point for scouting
            const scoutTarget = generateScoutTarget(gameState, map, tactics, aiOwner);
            if (scoutTarget) {
                scout.waypoints = [scoutTarget];
                scout.path = null;
            }
        }

        // Check if scout found enemy base (any enemy faction)
        if (!tactics.enemyBaseLocation) {
            const factions = ['player', 'ai1', 'ai2'];
            for (const faction of factions) {
                if (faction === aiOwner) continue;  // Skip self
                const enemyPorts = getPortsByOwner(gameState, faction);
                for (const port of enemyPorts) {
                    const dist = hexDistance(scout.q, scout.r, port.q, port.r);
                    if (dist <= 8) {  // Scout is close enough to "see" enemy base
                        tactics.enemyBaseLocation = { q: port.q, r: port.r };
                        break;
                    }
                }
                if (tactics.enemyBaseLocation) break;
            }
        }
    }
}

/**
 * Generate a target location for the scout to explore
 */
function generateScoutTarget(gameState, map, tactics, aiOwner) {
    const aiHomePort = gameState.ports.find(p => p.owner === aiOwner);
    if (!aiHomePort) return null;

    // If enemy base is known, scout around it (harassing)
    if (tactics.enemyBaseLocation) {
        const enemyQ = tactics.enemyBaseLocation.q;
        const enemyR = tactics.enemyBaseLocation.r;

        // Patrol in a circle around enemy base (10-15 hex radius)
        const angle = Math.random() * Math.PI * 2;
        const radius = 10 + Math.floor(Math.random() * 6);
        const dq = Math.round(Math.cos(angle) * radius * 0.866);
        const dr = Math.round(Math.sin(angle) * radius);

        const targetQ = enemyQ + dq;
        const targetR = enemyR + dr;

        const tile = map.tiles.get(hexKey(targetQ, targetR));
        if (tile && (tile.type === 'shallow' || tile.type === 'deep_ocean')) {
            return { q: targetQ, r: targetR };
        }
    }

    // Otherwise, explore far from home (20-30 hex radius)
    const angle = Math.random() * Math.PI * 2;
    const radius = 20 + Math.floor(Math.random() * 15);
    const dq = Math.round(Math.cos(angle) * radius * 0.866);
    const dr = Math.round(Math.sin(angle) * radius);

    const targetQ = aiHomePort.q + dq;
    const targetR = aiHomePort.r + dr;

    const tile = map.tiles.get(hexKey(targetQ, targetR));
    if (tile && (tile.type === 'shallow' || tile.type === 'deep_ocean')) {
        return { q: targetQ, r: targetR };
    }

    // Fallback: random direction
    for (let attempts = 0; attempts < 10; attempts++) {
        const randAngle = Math.random() * Math.PI * 2;
        const randRadius = 15 + Math.floor(Math.random() * 20);
        const rq = aiHomePort.q + Math.round(Math.cos(randAngle) * randRadius * 0.866);
        const rr = aiHomePort.r + Math.round(Math.sin(randAngle) * randRadius);

        const t = map.tiles.get(hexKey(rq, rr));
        if (t && (t.type === 'shallow' || t.type === 'deep_ocean')) {
            return { q: rq, r: rr };
        }
    }

    return null;
}

/**
 * Manage coordinated group attacks
 */
function manageGroupAttack(gameState, map, ai, aiOwner) {
    const tactics = ai.tactics;
    const strategy = AI_STRATEGIES[ai.strategy];
    const requiredGroupSize = strategy.buildConfig.attackGroupSize;

    const aiShips = getShipsByOwner(gameState, aiOwner);

    // Clean up attack group - remove dead/invalid ships
    tactics.attackGroup = tactics.attackGroup.filter(idx => {
        const ship = gameState.ships[idx];
        return ship && ship.owner === aiOwner && !ship.repair;
    });

    // If we have an active attack, coordinate the group
    if (tactics.attackTarget && tactics.attackGroup.length > 0) {
        // Check if we've reached the target (any ship close enough)
        let targetReached = false;
        for (const idx of tactics.attackGroup) {
            const ship = gameState.ships[idx];
            if (ship) {
                const dist = hexDistance(ship.q, ship.r, tactics.attackTarget.q, tactics.attackTarget.r);
                if (dist <= 3) {
                    targetReached = true;
                    break;
                }
            }
        }

        // If target reached or all ships destroyed, clear attack
        if (targetReached || tactics.attackGroup.length === 0) {
            tactics.attackTarget = null;
            tactics.attackGroup = [];
        }
        return;
    }

    // No active attack - try to form a new attack group
    // Only attack if we know where enemy is
    if (!tactics.enemyBaseLocation) return;

    // Count available ships (not scout, not repairing)
    const availableShips = [];
    for (let i = 0; i < gameState.ships.length; i++) {
        const ship = gameState.ships[i];
        if (ship.owner !== aiOwner) continue;
        if (ship.repair) continue;
        if (i === tactics.scoutShipIndex) continue;  // Don't use scout

        availableShips.push(i);
    }

    // If we have enough ships, form attack group
    if (availableShips.length >= requiredGroupSize) {
        // Take required number of ships for the attack
        tactics.attackGroup = availableShips.slice(0, requiredGroupSize);
        tactics.attackTarget = { ...tactics.enemyBaseLocation };

        // Find water near enemy base to attack
        const attackPoint = findAdjacentWater(map, tactics.attackTarget.q, tactics.attackTarget.r);
        if (attackPoint) {
            tactics.attackTarget = attackPoint;
        }

        // Send attack group to target
        for (const idx of tactics.attackGroup) {
            const ship = gameState.ships[idx];
            if (ship) {
                ship.waypoints = [{ q: tactics.attackTarget.q, r: tactics.attackTarget.r }];
                ship.path = null;
            }
        }
    }
}

/**
 * Evaluate what to build next
 * Now uses strategy-based build config
 */
function evaluateBuildOptions(gameState, map, fogState, ai, aiOwner) {
    const strategy = AI_STRATEGIES[ai.strategy];
    const buildConfig = strategy.buildConfig;

    const aiPorts = getPortsByOwner(gameState, aiOwner);
    const aiShips = getShipsByOwner(gameState, aiOwner);
    const aiSettlements = getSettlementsByOwner(gameState, aiOwner);
    const aiTowers = getTowersByOwner(gameState, aiOwner);

    // Skip if no ports
    if (aiPorts.length === 0) return;

    // Priority 1: Maintain minimum ships (strategy-defined)
    if (aiShips.length < buildConfig.minShips) {
        if (tryBuildShip(gameState, map, 'cutter', fogState, ai, aiOwner)) return;
    }

    // Priority 2: Build settlements (strategy-defined limits and thresholds)
    const completedSettlements = aiSettlements.filter(s => !s.construction).length;
    if (completedSettlements < buildConfig.maxSettlements &&
        ai.resources.wood >= buildConfig.settlementWoodThreshold) {
        if (tryBuildSettlement(gameState, map, ai, aiOwner)) return;
    }

    // Priority 3: Build ships based on priorities and strategy
    if (ai.priorities.military > 0.5 && aiShips.length < buildConfig.shipCap) {
        // Try preferred ship type first
        const preferredCost = SHIPS[buildConfig.preferredShipType]?.cost?.wood || 25;
        if (ai.resources.wood >= preferredCost) {
            if (tryBuildShip(gameState, map, buildConfig.preferredShipType, fogState, ai, aiOwner)) return;
        }
        // Fallback to cutter
        if (ai.resources.wood >= 10) {
            if (tryBuildShip(gameState, map, 'cutter', fogState, ai, aiOwner)) return;
        }
    } else if (ai.priorities.economy > 0.5 && aiShips.length < Math.min(4, buildConfig.shipCap)) {
        // Build cargo ships for trading
        if (tryBuildShip(gameState, map, 'schooner', fogState, ai, aiOwner)) return;
        if (tryBuildShip(gameState, map, 'cutter', fogState, ai, aiOwner)) return;
    }

    // Priority 4: Build towers (strategy-defined limits and threshold)
    if (ai.priorities.defense > buildConfig.towerDefenseThreshold &&
        aiTowers.length < buildConfig.maxTowers &&
        ai.resources.wood >= 25) {
        if (tryBuildTower(gameState, map, ai, aiOwner)) return;
    }

    // Priority 5: Upgrade existing towers (strategy-aware)
    // Defensive AI upgrades aggressively, others rarely
    if (ai.priorities.defense > buildConfig.towerUpgradePriority && aiTowers.length > 0) {
        if (tryUpgradeTower(gameState, ai, aiOwner)) return;
    }

    // Priority 6 (Economic strategy bonus): Aggressive expansion when rich
    if (ai.strategy === 'economic' && ai.resources.wood > 50 &&
        aiShips.length >= 3 && completedSettlements < buildConfig.maxSettlements) {
        if (tryBuildSettlement(gameState, map, ai, aiOwner)) return;
    }
}

/**
 * Try to build a ship at an available port
 */
function tryBuildShip(gameState, map, preferredType, fogState, ai, aiOwner) {
    const aiPorts = getPortsByOwner(gameState, aiOwner);

    for (const port of aiPorts) {
        // Skip if port is busy
        if (port.construction || port.buildQueue.length > 0) continue;

        const buildable = getBuildableShips(port);
        const shipType = buildable.includes(preferredType) ? preferredType : buildable[0];
        if (!shipType) continue;

        const shipData = SHIPS[shipType];

        // Check resources
        if (!canAfford(ai.resources, shipData.cost)) continue;

        // Check crew
        if (!canAffordCrewForOwner(gameState, shipData.crewCost, aiOwner)) continue;

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
        // Ships in build queue count toward crew used (only active item)
        if (port.buildQueue.length > 0 && port.buildQueue[0].progress !== null) {
            const shipData = SHIPS[port.buildQueue[0].shipType];
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
function tryBuildSettlement(gameState, map, ai, aiOwner) {
    const aiPorts = getPortsByOwner(gameState, aiOwner);
    const settlementData = SETTLEMENTS.settlement;

    if (!canAfford(ai.resources, settlementData.cost)) return false;

    for (let i = 0; i < gameState.ports.length; i++) {
        const port = gameState.ports[i];
        if (port.owner !== aiOwner) continue;
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
            const settlement = createSettlement(site.q, site.r, true, portIndex, aiOwner);
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
function tryBuildTower(gameState, map, ai, aiOwner) {
    const towerData = TOWERS.watchtower;

    if (!canAfford(ai.resources, towerData.cost)) return false;
    if (!canAffordCrewForOwner(gameState, towerData.crewCost, aiOwner)) return false;

    // Find a good tower site near AI home port
    const aiIndex = aiOwner === 'ai1' ? 0 : 1;
    const homeHex = gameState.aiHomeIslandHexes[aiIndex];
    if (!homeHex) return false;

    const homeQ = homeHex.q;
    const homeR = homeHex.r;

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
            const tower = createTower('watchtower', current.q, current.r, true, null, null, aiOwner);
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
 * Try to upgrade an existing AI tower to the next tier
 */
function tryUpgradeTower(gameState, ai, aiOwner) {
    const aiTowers = getTowersByOwner(gameState, aiOwner);

    // Find towers that can be upgraded (not under construction)
    for (const tower of aiTowers) {
        if (tower.construction) continue;  // Already upgrading or building

        const nextType = getNextTowerType(tower.type);
        if (!nextType) continue;  // Already max tier

        const nextTowerData = TOWERS[nextType];
        if (!nextTowerData) continue;

        // Check if we can afford the upgrade
        if (!canAfford(ai.resources, nextTowerData.cost)) continue;

        // Check crew cost (upgrade costs additional crew)
        const currentTowerData = TOWERS[tower.type];
        const additionalCrew = (nextTowerData.crewCost || 0) - (currentTowerData.crewCost || 0);
        if (additionalCrew > 0 && !canAffordCrewForOwner(gameState, additionalCrew, aiOwner)) continue;

        // Upgrade the tower
        deductCost(ai.resources, nextTowerData.cost);
        startTowerUpgrade(tower);
        return true;
    }

    return false;
}

/**
 * Update AI ship commands - patrol, attack, etc.
 * Now uses strategy-based ship behavior
 */
function updateShipCommands(gameState, map, ai, aiOwner) {
    const strategy = AI_STRATEGIES[ai.strategy];
    const shipBehavior = strategy.shipBehavior;
    const tactics = ai.tactics;

    for (let i = 0; i < gameState.ships.length; i++) {
        const ship = gameState.ships[i];
        if (ship.owner !== aiOwner) continue;
        if (ship.repair) continue; // Don't command ships being repaired

        // Skip ships managed by tactics system (scout, attack group, defending)
        // They get their waypoints from updateTactics instead
        if (tactics) {
            if (tactics.isDefending) continue;  // All ships recalled
            if (i === tactics.scoutShipIndex) continue;  // Scout has own behavior
            if (tactics.attackGroup.includes(i)) continue;  // In attack group
        }

        const shipData = SHIPS[ship.type];

        // Use strategy-defined engagement range
        const engagementRange = shipBehavior.engagementRange;

        // Check ship health for retreat behavior
        const healthPercent = ship.health / shipData.health;
        const shouldRetreat = healthPercent < shipBehavior.retreatHealthThreshold;

        if (shouldRetreat) {
            // Retreat to home port
            ship.attackTarget = null;
            const aiHomePort = gameState.ports.find(p => p.owner === aiOwner);
            if (aiHomePort && ship.waypoints.length === 0) {
                const retreatPoint = findAdjacentWater(map, aiHomePort.q, aiHomePort.r);
                if (retreatPoint) {
                    ship.waypoints = [{ q: retreatPoint.q, r: retreatPoint.r }];
                    ship.path = null;
                }
            }
            continue;
        }

        // Find nearest enemy target (any non-self faction)
        const nearestEnemy = findNearestEnemy(ship, gameState, aiOwner);

        if (nearestEnemy && nearestEnemy.dist <= engagementRange) {
            // Decide whether to pursue based on strategy
            const shouldPursue = Math.random() < shipBehavior.pursuitPersistence || nearestEnemy.dist <= 3;

            if (shouldPursue) {
                // Chase and attack
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
                // Break off pursuit, clear target
                ship.attackTarget = null;
            }
        } else {
            // Clear attack target if enemy is far
            ship.attackTarget = null;

            // Patrol: If idle, patrol around home port with strategy-defined radius
            if (ship.waypoints.length === 0) {
                const aiHomePort = gameState.ports.find(p => p.owner === aiOwner);
                if (aiHomePort) {
                    const patrolPoint = generatePatrolPointWithStrategy(aiHomePort, map, gameState, shipBehavior);
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
 * In free-for-all mode, targets any entity not owned by aiOwner
 */
function findNearestEnemy(ship, gameState, aiOwner) {
    let nearest = null;
    let nearestDist = Infinity;

    // Check enemy ships (any ship not owned by self)
    for (let i = 0; i < gameState.ships.length; i++) {
        const target = gameState.ships[i];
        if (target.owner === aiOwner) continue;  // Skip own ships
        if (target.type === 'pirate') continue;  // Skip neutral pirates

        const dist = hexDistance(ship.q, ship.r, target.q, target.r);
        if (dist < nearestDist) {
            nearestDist = dist;
            nearest = { type: 'ship', index: i, target, dist };
        }
    }

    // Check enemy ports
    for (let i = 0; i < gameState.ports.length; i++) {
        const target = gameState.ports[i];
        if (target.owner === aiOwner) continue;  // Skip own ports

        const dist = hexDistance(ship.q, ship.r, target.q, target.r);
        if (dist < nearestDist) {
            nearestDist = dist;
            nearest = { type: 'port', index: i, target, dist };
        }
    }

    // Check enemy settlements
    for (let i = 0; i < gameState.settlements.length; i++) {
        const target = gameState.settlements[i];
        if (target.owner === aiOwner) continue;  // Skip own settlements

        const dist = hexDistance(ship.q, ship.r, target.q, target.r);
        if (dist < nearestDist) {
            nearestDist = dist;
            nearest = { type: 'settlement', index: i, target, dist };
        }
    }

    // Check enemy towers
    for (let i = 0; i < gameState.towers.length; i++) {
        const target = gameState.towers[i];
        if (target.owner === aiOwner) continue;  // Skip own towers

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
 * Generate a patrol point using strategy-defined radius
 */
function generatePatrolPointWithStrategy(port, map, gameState, shipBehavior) {
    const { patrolRadiusMin, patrolRadiusMax } = shipBehavior;
    const patrolRadius = patrolRadiusMin + Math.floor(Math.random() * (patrolRadiusMax - patrolRadiusMin + 1));
    const angle = Math.random() * Math.PI * 2;

    // Hex offset approximation
    const dq = Math.round(Math.cos(angle) * patrolRadius * 0.866);
    const dr = Math.round(Math.sin(angle) * patrolRadius);

    const targetQ = port.q + dq;
    const targetR = port.r + dr;

    const tile = map.tiles.get(hexKey(targetQ, targetR));
    if (tile && (tile.type === 'shallow' || tile.type === 'deep_ocean')) {
        const occupied = gameState.ships.some(s => s.q === targetQ && s.r === targetR);
        if (!occupied) {
            return { q: targetQ, r: targetR };
        }
    }

    // Fallback attempts with strategy parameters
    for (let attempts = 0; attempts < 10; attempts++) {
        const randAngle = Math.random() * Math.PI * 2;
        const randRadius = patrolRadiusMin + Math.floor(Math.random() * (patrolRadiusMax - patrolRadiusMin + 1));
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
 * Called when AI entity is attacked - increases threat level for the specific AI
 */
export function notifyAIAttacked(gameState, attackedOwner) {
    if (!attackedOwner || !isAIOwner(attackedOwner)) return;

    // Find which AI was attacked (ai1 -> index 0, ai2 -> index 1)
    const aiIndex = attackedOwner === 'ai1' ? 0 : 1;

    if (gameState.aiPlayers && gameState.aiPlayers[aiIndex]) {
        gameState.aiPlayers[aiIndex].threatLevel = Math.min(1,
            (gameState.aiPlayers[aiIndex].threatLevel || 0) + 0.3);
    }
}
