// Scenario definitions for different game modes

export const SCENARIOS = [
    {
        id: 'sandbox',
        name: 'Sandbox',
        description: 'Open world trading',
        gameMode: 'sandbox',
        mapSize: { width: 60, height: 60 },
        startingResources: { wood: 25 },
        pirateConfig: {
            startingCount: 2,
            initialDelay: 60,  // seconds before first pirates spawn
        },
    },
    {
        id: 'defend',
        name: 'Defend',
        description: 'Survive the waves',
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
        id: 'versus',
        name: 'Versus AI',
        description: 'Eliminate the enemy',
        gameMode: 'versus',
        mapSize: { width: 60, height: 60 },
        startingResources: { wood: 25 },
        pirateConfig: {
            startingCount: 0,  // No neutral pirates in versus mode
            initialDelay: 0,
        },
        aiConfig: {
            enabled: true,
            startingResources: { wood: 25 },  // Mirror player starting resources
        },
    },
];

// Get scenario by ID
export function getScenario(id) {
    return SCENARIOS.find(s => s.id === id) || SCENARIOS[0];
}

// Default scenario
export const DEFAULT_SCENARIO_ID = 'sandbox';
