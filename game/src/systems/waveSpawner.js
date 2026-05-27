// Wave spawner system for Defend mode
// Handles wave timing, spawning, and progression

import { getHomePortIndex, isPirateShip } from "../gameState.js";
import { isHexVisible } from "../fogOfWar.js";
import { isWater } from "../mapGenerator.js";

// Default ship type when a wave def doesn't specify (legacy {count: N} entries).
const DEFAULT_WAVE_SHIP = 'cutter';

// Normalize a wave def to { ships: [{type, count}], abilities: {} }
function normalizeWave(waveDef) {
    if (!waveDef) return { ships: [{ type: DEFAULT_WAVE_SHIP, count: 0 }], abilities: {} };
    const abilities = waveDef.abilities || {};
    if (Array.isArray(waveDef.ships)) {
        return { ships: waveDef.ships, abilities };
    }
    // Legacy schema: { count: N } → spawn N cutters.
    if (typeof waveDef.count === 'number') {
        return { ships: [{ type: DEFAULT_WAVE_SHIP, count: waveDef.count }], abilities };
    }
    return { ships: [{ type: DEFAULT_WAVE_SHIP, count: 0 }], abilities };
}

/**
 * Update wave spawner state for defend mode
 * @param {Object} gameState - The game state
 * @param {Object} map - The map object
 * @param {Function} createShip - Ship creation function
 * @param {Function} hexKey - Hex key function
 * @param {number} dt - Delta time (already scaled by timeScale)
 * @param {Object} fogState - Fog of war state for visibility checks
 */
export function updateWaveSpawner(gameState, map, createShip, hexKey, dt, fogState) {
    if (dt === 0) return; // Paused

    const scenario = gameState.scenario;
    if (!scenario || scenario.gameMode !== 'defend') return;

    const waveState = gameState.waveState;
    const waveConfig = scenario.waveConfig;

    // Count active pirate-faction ships (cutter / schooner / legacy pirate hull)
    const activePirates = gameState.ships.filter(isPirateShip).length;

    // Phase 1: Initial delay before first wave
    if (!waveState.waveStarted) {
        waveState.initialTimer -= dt;
        if (waveState.initialTimer <= 0) {
            waveState.waveStarted = true;
            waveState.currentWave = 1;
            spawnWave(gameState, map, createShip, hexKey, waveConfig, 1, fogState);
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
            spawnWave(gameState, map, createShip, hexKey, waveConfig, waveState.currentWave, fogState);
            waveState.waveActive = true;
        }
    }
}

/**
 * Spawn a wave of pirates
 * @param {Object} fogState - Fog of war state for visibility checks
 */
function spawnWave(gameState, map, createShip, hexKey, waveConfig, waveNumber, fogState) {
    // Get wave definition (or extrapolate for waves beyond defined)
    const waveIndex = Math.min(waveNumber - 1, waveConfig.waves.length - 1);
    const wave = normalizeWave(waveConfig.waves[waveIndex]);

    // For waves past the defined list, escalate by adding extra cutters and
    // keeping the last defined wave's abilities — endless mode keeps ramping.
    const extraCutters = Math.max(0, waveNumber - waveConfig.waves.length);
    const shipQueue = [];
    for (const group of wave.ships) {
        for (let i = 0; i < group.count; i++) shipQueue.push(group.type);
    }
    for (let i = 0; i < extraCutters; i++) shipQueue.push(DEFAULT_WAVE_SHIP);
    const pirateCount = shipQueue.length;

    // Apply ability unlocks for this wave (sticky — once unlocked, stays on for
    // later endless waves since they fall through to the last defined wave's
    // abilities anyway).
    gameState.waveState.enabledAbilities = {
        broadside: !!wave.abilities.broadside,
        tnt: !!wave.abilities.tnt,
    };

    // Find home port for spawn location reference
    const homePortIndex = getHomePortIndex(gameState, map);
    const homePort = homePortIndex !== null ? gameState.ports[homePortIndex] : null;

    if (!homePort) return; // No home port to defend

    let spawned = 0;

    // Determine spawn pattern based on wave number
    let getAngleForPirate;
    const baseAngle = Math.random() * Math.PI * 2;

    if (waveNumber <= 4) {
        // Waves 1-4: Single angle attack - all pirates from one direction
        getAngleForPirate = (i) => baseAngle + (Math.random() - 0.5) * 0.5;
    } else if (waveNumber <= 9) {
        // Waves 5-9: Flanking attack - pirates from two opposite sides
        getAngleForPirate = (i) => {
            const side = i % 2 === 0 ? 0 : Math.PI;
            return baseAngle + side + (Math.random() - 0.5) * 0.5;
        };
    } else {
        // Waves 10+: Random all-sides attack
        getAngleForPirate = (i) => Math.random() * Math.PI * 2;
    }

    // Spawn pirates
    for (let i = 0; i < pirateCount; i++) {
        const shipType = shipQueue[i];
        // Increase base distance to ensure spawning in fog (12-15+ tiles out)
        const dist = 13 + Math.floor(i / 4) * 2;
        const angle = getAngleForPirate(i);

        // Try to find a valid spawn location in fog
        for (let attempt = 0; attempt < 20; attempt++) {
            // Vary angle and distance on each attempt
            const tryAngle = angle + attempt * (Math.PI / 10);
            const tryDist = dist + Math.floor(attempt / 4) * 2;
            const pirateQ = homePort.q + Math.round(Math.cos(tryAngle) * tryDist);
            const pirateR = homePort.r + Math.round(Math.sin(tryAngle) * tryDist);
            const pirateTile = map.tiles.get(hexKey(pirateQ, pirateR));

            if (isWater(pirateTile)) {
                // Check not occupied by another ship
                const occupied = gameState.ships.some(s => s.q === pirateQ && s.r === pirateR);
                // Check that spawn location is in fog (not visible)
                const inFog = !isHexVisible(fogState, pirateQ, pirateR);
                if (!occupied && inFog) {
                    gameState.ships.push(createShip(shipType, pirateQ, pirateR, 'pirate'));
                    spawned++;
                    break;
                }
            }
        }
    }

    const abilityStr = [
        gameState.waveState.enabledAbilities.broadside ? 'broadside' : null,
        gameState.waveState.enabledAbilities.tnt ? 'tnt' : null,
    ].filter(Boolean).join('+') || 'no abilities';
    console.log(`Wave ${waveNumber}: Spawned ${spawned}/${pirateCount} pirates (${abilityStr})`);
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
    const activePirates = gameState.ships.filter(isPirateShip).length;

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
