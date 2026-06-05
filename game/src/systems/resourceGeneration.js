// Resource generation system — currently only advances floating-number
// animations. Settlement wood production has been removed: wood is now
// gathered exclusively by workers harvesting tree hexes (see
// systems/workers.js). Settlements remain as buildable structures whose
// future role (population, crew cap, etc.) is parked while we prototype
// the worker economy.
//
// AI players still receive wood from their settlements (the AI doesn't
// have workers yet), so the AI-side generation loop is kept intact.

import { SETTLEMENTS } from "../sprites/settlements.js";
import { findNearestLandConnectedPortForOwner } from "../gameState.js";

export function updateResourceGeneration(gameState, floatingNumbers, dt, map) {
    if (dt === 0) return; // Paused

    // AI settlements still produce wood (AI doesn't use workers yet). Player
    // settlements are inert — players must harvest trees with workers.
    for (const settlement of gameState.settlements) {
        if (settlement.construction) continue;

        const settlementOwner = settlement.owner || 'player';
        if (settlementOwner === 'player' || settlementOwner === 'player2') continue;

        const connectedPortIndex = findNearestLandConnectedPortForOwner(map, settlement.q, settlement.r, gameState.ports, settlementOwner);
        if (connectedPortIndex === null) continue;

        const settlementData = SETTLEMENTS.settlement;
        const interval = settlementData.generationInterval;
        const woodAmount = settlementData.woodPerHarvest;

        settlement.generationTimer = (settlement.generationTimer || 0) + dt;
        if (settlement.generationTimer >= interval) {
            settlement.generationTimer = 0;
            if (settlementOwner === 'ai1' && gameState.aiPlayers?.[0]) {
                gameState.aiPlayers[0].resources.wood += woodAmount;
            } else if (settlementOwner === 'ai2' && gameState.aiPlayers?.[1]) {
                gameState.aiPlayers[1].resources.wood += woodAmount;
            } else if (settlementOwner === 'ai3' && gameState.aiPlayers?.[2]) {
                gameState.aiPlayers[2].resources.wood += woodAmount;
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
