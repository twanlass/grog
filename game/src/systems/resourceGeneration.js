// Resource generation system - handles settlement resource production and floating numbers
import { SETTLEMENTS } from "../sprites/settlements.js";

/**
 * Updates resource generation from settlements and floating number animations
 * @param {Object} gameState - The game state
 * @param {Array} floatingNumbers - Array to push floating number animations to
 * @param {number} dt - Delta time (already scaled by timeScale)
 */
export function updateResourceGeneration(gameState, floatingNumbers, dt) {
    if (dt === 0) return; // Paused

    // Update settlement resource generation
    for (const settlement of gameState.settlements) {
        if (settlement.construction) continue;  // Skip settlements under construction

        const settlementData = SETTLEMENTS.settlement;  // Currently only one settlement type
        const interval = settlementData.generationInterval;
        const woodAmount = settlementData.woodPerHarvest;
        const foodAmount = settlementData.foodPerHarvest;

        settlement.generationTimer = (settlement.generationTimer || 0) + dt;

        if (settlement.generationTimer >= interval) {
            settlement.generationTimer = 0;

            const isHomePort = settlement.parentPortIndex === 0;

            if (isHomePort) {
                // Add to global resources
                gameState.resources.wood += woodAmount;
                gameState.resources.food += foodAmount;
            } else {
                // Add to port's local storage
                const port = gameState.ports[settlement.parentPortIndex];
                if (port && port.storage) {
                    port.storage.wood += woodAmount;
                    port.storage.food += foodAmount;
                }
            }

            // Spawn floating numbers
            floatingNumbers.push({
                q: settlement.q, r: settlement.r,
                text: `+${woodAmount}`,
                type: 'wood',
                age: 0,
                duration: 0.75,
                offsetX: -30,  // Offset left for wood
            });
            floatingNumbers.push({
                q: settlement.q, r: settlement.r,
                text: `+${foodAmount}`,
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
}
