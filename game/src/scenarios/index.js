// Scenario definitions for different game modes

export const SCENARIOS = [
    {
        id: 'multiplayer',
        name: 'Multiplayer',
        description: 'Play against a friend (P2P)',
        gameMode: 'multiplayer',
        mapSize: { width: 60, height: 60 },
        startingResources: { wood: 25 },
        pirateConfig: {
            startingCount: 0,  // No pirates in multiplayer
        },
        aiConfig: {
            enabled: false,
            aiCount: 0,
        },
    },
    {
        id: 'versus',
        name: 'Skirmish',
        description: 'Play against AI opponents',
        gameMode: 'versus',
        mapSize: { width: 60, height: 60 },
        startingResources: { wood: 25 },
        pirateConfig: {
            startingCount: 0,  // No pirates in versus mode
        },
        aiConfig: {
            enabled: true,
            aiCount: 3,  // Number of AI opponents (4-way free-for-all)
            difficulty: 'normal',  // 'easy' | 'normal' | 'hard'
            startingResources: { wood: 25 },  // Mirror player starting resources
        },
    },
    {
        id: 'defend',
        name: 'Defend',
        description: 'Survive waves of enemies',
        gameMode: 'defend',
        mapSize: { width: 40, height: 40 },
        startingResources: { wood: 50 },
        pirateConfig: {
            startingCount: 0,
            initialDelay: 30,  // seconds before first wave
        },
        waveConfig: {
            rebuildDelay: 20,  // seconds after wave cleared before next
            // Each wave: { ships: [{type, count}], abilities: { broadside, tnt } }
            // Difficulty ramp:
            //   - Waves 1-3: cutter-only swarm
            //   - Wave 4+:   schooners join the mix
            //   - Wave 6+:   pirate cutters unlock Broadside (5-shot volley)
            //   - Wave 8+:   pirate schooners unlock TNT kamikaze
            waves: [
                { ships: [{ type: 'cutter', count: 2 }] },
                { ships: [{ type: 'cutter', count: 3 }] },
                { ships: [{ type: 'cutter', count: 4 }] },
                { ships: [{ type: 'cutter', count: 4 }, { type: 'schooner', count: 1 }] },
                { ships: [{ type: 'cutter', count: 5 }, { type: 'schooner', count: 1 }] },
                { ships: [{ type: 'cutter', count: 5 }, { type: 'schooner', count: 2 }], abilities: { broadside: true } },
                { ships: [{ type: 'cutter', count: 6 }, { type: 'schooner', count: 2 }], abilities: { broadside: true } },
                { ships: [{ type: 'cutter', count: 6 }, { type: 'schooner', count: 3 }], abilities: { broadside: true, tnt: true } },
                { ships: [{ type: 'cutter', count: 8 }, { type: 'schooner', count: 4 }], abilities: { broadside: true, tnt: true } },
                { ships: [{ type: 'cutter', count: 10 }, { type: 'schooner', count: 5 }], abilities: { broadside: true, tnt: true } },
            ],
        },
    },
    {
        id: 'sandbox',
        name: 'Sandbox',
        description: 'Casual adventure',
        gameMode: 'sandbox',
        mapSize: { width: 60, height: 60 },
        startingResources: { wood: 25 },
        pirateConfig: {
            startingCount: 1,
            initialDelay: 120,  // seconds before first pirates spawn
        },
    },
    {
        // Hidden debug/testing scenario — entered from the title footer link, not the cards
        id: 'debug',
        name: 'Debug',
        description: 'Sandbox for testing features',
        gameMode: 'debug',
        mapSize: { width: 60, height: 60 },
        startingResources: { wood: 1000 },
        crewCapOverride: 1000,   // Force player crew cap to 1000 regardless of buildings
        instantBuild: true,      // Ships, structures and upgrades complete instantly
        pirateConfig: {
            startingCount: 0,
        },
        aiConfig: {
            enabled: true,
            aiCount: 1,
            difficulty: 'normal',
            startingResources: { wood: 25 },
        },
    },
];

// Get scenario by ID
export function getScenario(id) {
    return SCENARIOS.find(s => s.id === id) || SCENARIOS[0];
}

// Default scenario
export const DEFAULT_SCENARIO_ID = 'versus';
