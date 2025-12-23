// Resource generation system - handles farm resource production and floating numbers

// Generation constants
const GENERATION_INTERVAL = 30;  // seconds between resource generation
const GENERATION_AMOUNT = 5;     // amount of each resource generated

/**
 * Updates resource generation from farms and floating number animations
 * @param {Object} gameState - The game state
 * @param {Array} floatingNumbers - Array to push floating number animations to
 * @param {number} dt - Delta time (already scaled by timeScale)
 */
export function updateResourceGeneration(gameState, floatingNumbers, dt) {
    if (dt === 0) return; // Paused

    // Update settlement resource generation
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
}

// Export constants for use in other modules if needed
export { GENERATION_INTERVAL, GENERATION_AMOUNT };
