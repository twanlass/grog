// Scenario definitions for different game modes

export const SCENARIOS = [
    {
        id: 'versus',
        name: 'Skirmish',
        description: 'Play against AI opponents',
        gameMode: 'versus',
        mapSize: { width: 60, height: 60 },
        startingResources: { wood: 25 },
        pirateConfig: {
            startingCount: 2,  // Neutral pirates spawn at map center
            initialDelay: 0,
            spawnAtCenter: true,  // Spawn in middle of map instead of near home port
        },
        aiConfig: {
            enabled: true,
            aiCount: 2,  // Number of AI opponents (3-way free-for-all)
            startingResources: { wood: 25 },  // Mirror player starting resources
        },
    },
    {
        id: 'defend',
        name: 'Defend',
        description: 'Survive waves of pirates',
        gameMode: 'defend',
        mapSize: { width: 40, height: 40 },
        startingResources: { wood: 50 },
        pirateConfig: {
            startingCount: 0,
            initialDelay: 30,  // seconds before first wave
        },
        waveConfig: {
            rebuildDelay: 20,  // seconds after wave cleared before next
            waves: [
                { count: 2 },
                { count: 3 },
                { count: 4 },
                { count: 5 },
                { count: 6 },
                { count: 7 },
                { count: 8 },
                { count: 10 },
                { count: 12 },
                { count: 15 },
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
];

// Get scenario by ID
export function getScenario(id) {
    return SCENARIOS.find(s => s.id === id) || SCENARIOS[0];
}

// Default scenario
export const DEFAULT_SCENARIO_ID = 'versus';
