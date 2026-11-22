import { hexKey } from '@grog/hex.js';
import { generateMap, findPortSiteOnStarterIsland } from '@grog/mapGenerator.js';
import {
  createGameState, createShip, createPort, findStartingPosition, findTriangularStartingPositions,
  createAIPlayerState, getHomePortIndex, countEntitiesForOwner, isPirateShip, getResourcesForOwner,
  canAffordCrew, resetEntityIdCounter, updateNotification,
} from '@grog/gameState.js';
import { createFogState, initializeFog, isVisibilityDirty, recalculateVisibility, updateFogAnimations, isHexVisible } from '@grog/fogOfWar.js';
import { hexToPixel } from '@grog/hex.js';
import { updateShipMovement, updatePirateAI } from '@grog/systems/shipMovement.js';
import { updateTradeRoutes } from '@grog/systems/tradeRoutes.js';
import { updateConstruction } from '@grog/systems/construction.js';
import { updateResourceGeneration } from '@grog/systems/resourceGeneration.js';
import { updateCombat, updatePirateRespawns, handlePatrolAutoAttack } from '@grog/systems/combat.js';
import { updateWaveSpawner } from '@grog/systems/waveSpawner.js';
import { updateRepair } from '@grog/systems/repair.js';
import { updateAIPlayer, STRATEGY_KEYS } from '@grog/systems/aiPlayer.js';
import { setLocalPlayerId } from '@grog/systems/inputHandler.js';
import { getScenario } from '@grog/scenarios/index.js';
import { SHIPS } from '@grog/sprites/ships.js';

// A game of Grog, minus the drawing: map, state, fog and the per-frame system order.
//
// This is game/src/scenes/gameScene.js's setup (lines ~180–390) and its host/single-player
// `onUpdate` path (~836–1230) with every Kaplay call taken out. The systems themselves are imported
// untouched; only the glue between them lives here, in the same order, so the 3D game is the same
// simulation running under a different renderer. Multiplayer and the scripted tutorial are the two
// branches not carried over yet.

const FOG_RECALC_INTERVAL = 0.1;

export function createSession({ scenarioId = 'versus', aiCount = 3, difficulty = 'normal', seed } = {}) {
  const scenario = getScenario(scenarioId);
  setLocalPlayerId('player');
  resetEntityIdCounter();

  const versusish = ['versus', 'debug', 'multiplayer', 'tutorial'].includes(scenario.gameMode);
  const map = generateMap({
    width: scenario.mapSize.width,
    height: scenario.mapSize.height,
    versusMode: versusish,
    seed: seed ?? Date.now(),
  });
  const gameState = createGameState({ startingResources: scenario.startingResources });
  gameState.scenario = scenario;
  if (typeof scenario.crewCapOverride === 'number') gameState.crewCapOverride = scenario.crewCapOverride;
  gameState.instantBuild = !!scenario.instantBuild;
  gameState.isMultiplayer = false;
  gameState.localPlayerId = 'player';

  const pickStrategies = (n, aiConfig) => {
    const used = [];
    gameState.aiPlayers = [];
    for (let i = 0; i < n; i++) {
      const avail = STRATEGY_KEYS.filter((s) => !used.includes(s));
      const strategy = avail.length ? avail[Math.floor(Math.random() * avail.length)]
        : STRATEGY_KEYS[Math.floor(Math.random() * STRATEGY_KEYS.length)];
      used.push(strategy);
      gameState.aiPlayers.push(createAIPlayerState({ ...aiConfig, strategy }));
    }
  };

  if (scenario.gameMode === 'versus' || scenario.gameMode === 'debug') {
    const n = scenario.gameMode === 'debug' ? (scenario.aiConfig?.aiCount ?? 1) : aiCount;
    const aiConfig = { ...scenario.aiConfig, difficulty };
    if (map.starterPositions) {
      const idx = [0, 1, 2, 3].slice(0, 1 + n);
      for (let i = idx.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [idx[i], idx[j]] = [idx[j], idx[i]];
      }
      const home = findPortSiteOnStarterIsland(map, map.starterPositions[idx[0]]);
      gameState.ports.push(createPort('dock', home.q, home.r, false, null, 'player'));
      gameState.homeIslandHex = { q: home.q, r: home.r };
      gameState.aiHomeIslandHexes = [];
      const owners = ['ai1', 'ai2', 'ai3'];
      for (let i = 0; i < n; i++) {
        const p = findPortSiteOnStarterIsland(map, map.starterPositions[idx[1 + i]]);
        gameState.ports.push(createPort('dock', p.q, p.r, false, null, owners[i]));
        gameState.aiHomeIslandHexes.push({ q: p.q, r: p.r });
      }
      pickStrategies(n, aiConfig);
      if (scenario.pirateConfig && scenario.pirateConfig.startingCount > 0) {
        for (let p = 0; p < scenario.pirateConfig.startingCount; p++) {
          gameState.pirateRespawnQueue.push({ timer: scenario.pirateConfig.initialDelay || 0, spawnAtCenter: true });
        }
      }
    } else {
      const pos = findTriangularStartingPositions(map);
      if (pos) {
        const m = Math.min(n, 2);
        gameState.ports.push(createPort('dock', pos.player.q, pos.player.r, false, null, 'player'));
        gameState.homeIslandHex = { q: pos.player.q, r: pos.player.r };
        gameState.aiHomeIslandHexes = [];
        [pos.ai1, pos.ai2].slice(0, m).forEach((p, i) => {
          gameState.ports.push(createPort('dock', p.q, p.r, false, null, `ai${i + 1}`));
          gameState.aiHomeIslandHexes.push({ q: p.q, r: p.r });
        });
        pickStrategies(m, aiConfig);
      }
    }
  } else {
    // Sandbox and Defend: one player start, pirates by mode.
    const start = findStartingPosition(map);
    if (start) {
      gameState.ports.push(createPort('dock', start.q, start.r, false, null, 'player'));
      gameState.homeIslandHex = { q: start.q, r: start.r };
      if (scenario.gameMode === 'sandbox') {
        for (let p = 0; p < scenario.pirateConfig.startingCount; p++) {
          gameState.pirateRespawnQueue.push({ timer: scenario.pirateConfig.initialDelay });
        }
      } else if (scenario.gameMode === 'defend') {
        gameState.waveState.initialTimer = scenario.pirateConfig.initialDelay;
      }
    }
  }

  const fogState = createFogState();
  fogState.localPlayerId = 'player';
  initializeFog(fogState, gameState);

  const floatingNumbers = [];
  let gameTime = 0;
  let fogCooldown = 0;
  const events = [];   // sound + shake events for the presentation layer

  function piratePatrolCenter() {
    if (scenario.gameMode === 'versus' || scenario.gameMode === 'debug') {
      const row = Math.floor(map.height / 2);
      const col = Math.floor(map.width / 2);
      return { q: col - Math.floor(row / 2), r: row };
    }
    const i = getHomePortIndex(gameState, map);
    return i !== null ? gameState.ports[i] : null;
  }

  function step(rawDtIn) {
    const rawDt = Math.min(rawDtIn, 0.1);
    const dt = rawDt * gameState.timeScale;
    gameTime += rawDt;
    updateFogAnimations(fogState, gameTime);
    updateNotification(gameState, rawDt);

    if (gameState.gameOver || gameState.surrenderPending) return;

    updateShipMovement(hexToPixel, gameState, map, fogState, dt, floatingNumbers);
    updatePirateAI(gameState, map, piratePatrolCenter(), dt);
    updateAIPlayer(gameState, map, fogState, dt);
    handlePatrolAutoAttack(gameState, map);
    updateTradeRoutes(gameState, map, dt);
    updateConstruction(gameState, map, fogState, gameState.instantBuild ? dt * 10000 : dt, floatingNumbers);
    updateResourceGeneration(gameState, floatingNumbers, dt, map);
    updateCombat(hexToPixel, gameState, map, dt, fogState);

    if (gameState.soundEvents && gameState.soundEvents.length) {
      for (const e of gameState.soundEvents) if (isHexVisible(fogState, e.q, e.r)) events.push(e);
      gameState.soundEvents = [];
    }

    updateRepair(gameState, dt);
    updatePirateRespawns(gameState, map, createShip, hexKey, dt);
    updateWaveSpawner(gameState, map, createShip, hexKey, dt, fogState);

    fogCooldown = Math.max(0, fogCooldown - rawDt);
    if (isVisibilityDirty(fogState) && fogCooldown <= 0) {
      recalculateVisibility(fogState, gameState, gameTime, 'player');
      fogCooldown = FOG_RECALC_INTERVAL;
    }

    for (const list of [gameState.ships, gameState.ports, gameState.towers, gameState.settlements]) {
      for (const e of list) if (e.hitFlash > 0) e.hitFlash -= rawDt;
    }

    for (let i = gameState.shipExplosions.length - 1; i >= 0; i--) {
      const ex = gameState.shipExplosions[i];
      const delay = ex.delay || 0;
      if (!ex.silent && ex.age >= delay && ex.age < delay + rawDt * 2) {
        events.push({ type: 'explosion', q: ex.q, r: ex.r, massive: !!ex.massive });
      }
      ex.age += dt;
      if (ex.age >= delay + ex.duration) gameState.shipExplosions.splice(i, 1);
    }
    for (const key of ['floatingDebris', 'lootSparkles', 'waterSplashes']) {
      const arr = gameState[key];
      for (let i = arr.length - 1; i >= 0; i--) {
        arr[i].age += dt;
        if (arr[i].age >= arr[i].duration) arr.splice(i, 1);
      }
    }
    for (const loot of gameState.lootDrops) loot.age += dt;

    checkGameOver();
  }

  function checkGameOver() {
    const mode = scenario.gameMode;
    if (mode === 'defend' && !gameState.gameOver && getHomePortIndex(gameState, map) === null) {
      gameState.gameOver = 'lose';
    }
    if ((mode === 'versus' || mode === 'debug') && !gameState.gameOver) {
      const me = countEntitiesForOwner(gameState, 'player');
      const ai = ['ai1', 'ai2', 'ai3'].map((o) => countEntitiesForOwner(gameState, o));
      if (ai.every((c) => c.total === 0)) gameState.gameOver = 'win';
      if (me.total === 0) gameState.gameOver = 'lose';
      if (!gameState.surrenderPending) {
        const cost = SHIPS.cutter.cost.wood;
        const crew = SHIPS.cutter.crewCost;
        ['ai1', 'ai2', 'ai3'].forEach((owner, k) => {
          if (gameState.surrenderPending) return;
          const c = ai[k];
          if (c.total === 0 || c.ships > 0 || gameState.surrenderDeclined[owner]) return;
          if (gameState.ports.some((p) => p.owner === owner && p.buildQueue && p.buildQueue.length)) return;
          const res = getResourcesForOwner(gameState, owner);
          const canBuild = c.ports > 0 && res && res.wood >= cost && canAffordCrew(gameState, crew, owner);
          if (!canBuild) gameState.surrenderPending = owner;
        });
      }
    }
    const playerShips = gameState.ships.filter((s) => !isPirateShip(s));
    if (!['versus', 'debug', 'tutorial'].includes(mode) && playerShips.length === 0 && gameState.ports.length === 0) {
      gameState.gameOver = 'lose';
    }
  }

  /** gameScene's surrender Accept: remove the AI entirely so the offer can't re-trigger. */
  function acceptSurrender() {
    const o = gameState.surrenderPending;
    if (!o) return;
    gameState.ships = gameState.ships.filter((s) => s.owner !== o);
    gameState.ports = gameState.ports.filter((p) => p.owner !== o);
    gameState.settlements = gameState.settlements.filter((s) => s.owner !== o);
    gameState.towers = gameState.towers.filter((t) => t.owner !== o);
    gameState.surrenderPending = null;
  }
  function declineSurrender() {
    if (!gameState.surrenderPending) return;
    gameState.surrenderDeclined[gameState.surrenderPending] = true;
    gameState.surrenderPending = null;
  }

  return {
    scenario, map, gameState, fogState, floatingNumbers, events,
    step, acceptSurrender, declineSurrender,
    get time() { return gameTime; },
  };
}
