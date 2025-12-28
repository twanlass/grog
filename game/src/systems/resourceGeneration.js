// Resource generation system - handles settlement resource production and floating numbers
import { SETTLEMENTS } from "../sprites/settlements.js";
import { findNearestLandConnectedPort, getHomePortIndex } from "../gameState.js";

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

        // Check if settlement has a land-connected port
        const connectedPortIndex = findNearestLandConnectedPort(map, settlement.q, settlement.r, gameState.ports);
        if (connectedPortIndex === null) {
            // No connected port - settlement is inactive, don't produce resources
            continue;
        }

        const settlementData = SETTLEMENTS.settlement;  // Currently only one settlement type
        const interval = settlementData.generationInterval;
        const woodAmount = settlementData.woodPerHarvest;

        settlement.generationTimer = (settlement.generationTimer || 0) + dt;

        if (settlement.generationTimer >= interval) {
            settlement.generationTimer = 0;

            const homePortIndex = getHomePortIndex(gameState, map);
            const isHomePort = connectedPortIndex === homePortIndex;

            if (isHomePort) {
                // Add to global resources
                gameState.resources.wood += woodAmount;
            } else {
                // Add to port's local storage
                const port = gameState.ports[connectedPortIndex];
                if (port && port.storage) {
                    port.storage.wood += woodAmount;
                }
            }

            // Spawn floating number
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

    // Update floating numbers animation
    for (let i = floatingNumbers.length - 1; i >= 0; i--) {
        floatingNumbers[i].age += dt;
        if (floatingNumbers[i].age >= floatingNumbers[i].duration) {
            floatingNumbers.splice(i, 1);
        }
    }
}
