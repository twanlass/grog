// Wave spawner system for Defend mode
// Handles wave timing, spawning, and progression

import { getHomePortIndex } from "../gameState.js";

/**
 * Update wave spawner state for defend mode
 * @param {Object} gameState - The game state
 * @param {Object} map - The map object
 * @param {Function} createShip - Ship creation function
 * @param {Function} hexKey - Hex key function
 * @param {number} dt - Delta time (already scaled by timeScale)
 */
export function updateWaveSpawner(gameState, map, createShip, hexKey, dt) {
    if (dt === 0) return; // Paused

    const scenario = gameState.scenario;
    if (!scenario || scenario.gameMode !== 'defend') return;

    const waveState = gameState.waveState;
    const waveConfig = scenario.waveConfig;

    // Count active pirates
    const activePirates = gameState.ships.filter(s => s.type === 'pirate').length;

    // Phase 1: Initial delay before first wave
    if (!waveState.waveStarted) {
        waveState.initialTimer -= dt;
        if (waveState.initialTimer <= 0) {
            waveState.waveStarted = true;
            waveState.currentWave = 1;
            spawnWave(gameState, map, createShip, hexKey, waveConfig, 1);
            waveState.waveActive = true;
        }
        return;
    }

    // Phase 2: Wave in progress - check if cleared
    if (waveState.waveActive && activePirates === 0) {
        waveState.waveActive = false;
        waveState.rebuildTimer = waveConfig.rebuildDelay;
    }

    // Phase 3: Rebuild period - countdown to next wave
    if (!waveState.waveActive && waveState.rebuildTimer > 0) {
        waveState.rebuildTimer -= dt;
        if (waveState.rebuildTimer <= 0) {
            // Start next wave
            waveState.currentWave++;
            spawnWave(gameState, map, createShip, hexKey, waveConfig, waveState.currentWave);
            waveState.waveActive = true;
        }
    }
}

/**
 * Spawn a wave of pirates
 */
function spawnWave(gameState, map, createShip, hexKey, waveConfig, waveNumber) {
    // Get wave definition (or extrapolate for waves beyond defined)
    const waveIndex = Math.min(waveNumber - 1, waveConfig.waves.length - 1);
    const waveDef = waveConfig.waves[waveIndex];

    // For waves beyond defined, add extra pirates
    const extraPirates = Math.max(0, waveNumber - waveConfig.waves.length);
    const pirateCount = waveDef.count + extraPirates;

    // Find home port for spawn location reference
    const homePortIndex = getHomePortIndex(gameState, map);
    const homePort = homePortIndex !== null ? gameState.ports[homePortIndex] : null;

    if (!homePort) return; // No home port to defend

    let spawned = 0;
    const startAngle = Math.random() * Math.PI * 2;

    // Spawn pirates in a spread pattern around the home port
    for (let i = 0; i < pirateCount; i++) {
        // Vary distance and angle for each pirate
        const dist = 10 + Math.floor(i / 4) * 2; // Spread out at different distances
        const angleOffset = (i % 8) * (Math.PI / 4) + (Math.random() - 0.5) * 0.3;
        const angle = startAngle + angleOffset;

        // Try to find a valid spawn location
        for (let attempt = 0; attempt < 12; attempt++) {
            const tryAngle = angle + attempt * (Math.PI / 6);
            const pirateQ = homePort.q + Math.round(Math.cos(tryAngle) * dist);
            const pirateR = homePort.r + Math.round(Math.sin(tryAngle) * dist);
            const pirateTile = map.tiles.get(hexKey(pirateQ, pirateR));

            if (pirateTile && (pirateTile.type === 'shallow' || pirateTile.type === 'deep_ocean')) {
                // Check not occupied by another ship
                const occupied = gameState.ships.some(s => s.q === pirateQ && s.r === pirateR);
                if (!occupied) {
                    gameState.ships.push(createShip('pirate', pirateQ, pirateR));
                    spawned++;
                    break;
                }
            }
        }
    }

    console.log(`Wave ${waveNumber}: Spawned ${spawned}/${pirateCount} pirates`);
}

/**
 * Get wave status for UI display
 */
export function getWaveStatus(gameState) {
    const scenario = gameState.scenario;
    if (!scenario || scenario.gameMode !== 'defend') {
        return null;
    }

    const waveState = gameState.waveState;
    const activePirates = gameState.ships.filter(s => s.type === 'pirate').length;

    if (!waveState.waveStarted) {
        return {
            phase: 'preparing',
            timer: Math.ceil(waveState.initialTimer),
            message: `Wave 1 in ${Math.ceil(waveState.initialTimer)}s`,
        };
    }

    if (waveState.waveActive) {
        return {
            phase: 'active',
            wave: waveState.currentWave,
            remaining: activePirates,
            message: `Wave ${waveState.currentWave} - ${activePirates} pirates remaining`,
        };
    }

    if (waveState.rebuildTimer > 0) {
        return {
            phase: 'rebuild',
            wave: waveState.currentWave,
            timer: Math.ceil(waveState.rebuildTimer),
            message: `Wave ${waveState.currentWave + 1} in ${Math.ceil(waveState.rebuildTimer)}s`,
        };
    }

    return null;
}
