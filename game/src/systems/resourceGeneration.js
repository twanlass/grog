// Resource generation system - handles settlement resource production and floating numbers
import { SETTLEMENTS } from "../sprites/settlements.js";
import { findNearestLandConnectedPortForOwner } from "../gameState.js";

/**
 * Updates resource generation from settlements and floating number animations
 * @param {Object} gameState - The game state
 * @param {Array} floatingNumbers - Array to push floating number animations to
 * @param {number} dt - Delta time (already scaled by timeScale)
 * @param {Object} map - The game map (for checking land connectivity)
 */
export function updateResourceGeneration(gameState, floatingNumbers, dt, map) {
    if (dt === 0) return; // Paused

    // Update settlement resource generation
    for (const settlement of gameState.settlements) {
        if (settlement.construction) continue;  // Skip settlements under construction

        const settlementOwner = settlement.owner || 'player';

        // Check if settlement has a land-connected port owned by the same faction
        const connectedPortIndex = findNearestLandConnectedPortForOwner(map, settlement.q, settlement.r, gameState.ports, settlementOwner);
        if (connectedPortIndex === null) {
            // No connected port of same owner - settlement is inactive, don't produce resources
            continue;
        }

        const settlementData = SETTLEMENTS.settlement;  // Currently only one settlement type
        const interval = settlementData.generationInterval;
        const woodAmount = settlementData.woodPerHarvest;

        settlement.generationTimer = (settlement.generationTimer || 0) + dt;

        if (settlement.generationTimer >= interval) {
            settlement.generationTimer = 0;

            // All settlements contribute directly to owner's global resources
            if (settlementOwner === 'ai1' && gameState.aiPlayers && gameState.aiPlayers[0]) {
                gameState.aiPlayers[0].resources.wood += woodAmount;
            } else if (settlementOwner === 'ai2' && gameState.aiPlayers && gameState.aiPlayers[1]) {
                gameState.aiPlayers[1].resources.wood += woodAmount;
            } else if (settlementOwner === 'ai3' && gameState.aiPlayers && gameState.aiPlayers[2]) {
                gameState.aiPlayers[2].resources.wood += woodAmount;
            } else if (settlementOwner === 'player') {
                gameState.resources.wood += woodAmount;
            }

            // Spawn floating number (only for player settlements for now)
            if (settlementOwner === 'player') {
                floatingNumbers.push({
                    q: settlement.q, r: settlement.r,
                    text: `+${woodAmount}`,
                    type: 'wood',
                    age: 0,
                    duration: 3.0,  // Total: 0.5s rise + 2s pause + 0.5s fade
                    offsetX: 0,
                });
            }
        }
    }

    // Update floating numbers animation
    for (let i = floatingNumbers.length - 1; i >= 0; i--) {
        floatingNumbers[i].age += dt;
        if (floatingNumbers[i].age >= floatingNumbers[i].duration) {
            floatingNumbers.splice(i, 1);
        }
    }
}
