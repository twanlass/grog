import * as THREE from 'three';
import './style.css';
import { createScene, followSun } from './render/scene.js';
import { createCamera, DISTANCE, ELEVATION } from './render/camera.js';
import { createSession } from './session.js';
import { buildTerrain } from './art/terrain.js';
import { buildWater, WATER_UNIFORMS } from './art/water.js';
import { createUnitLayer } from './render/units.js';
import { createEffects } from './render/effects.js';
import { createMarkers } from './render/markers.js';
import { createFog } from './render/fog.js';
import { createInput } from './input.js';
import { createHud } from './ui/hud.js';
import { createSfx } from './sfx.js';
import { mapBounds, hexToWorld } from './world.js';
import { showTitle } from './ui/title.js';
import { createMinimap } from './ui/minimap.js';
import * as actions from './actions.js';

// ?mode= names the title screen's three modes; Grog's own id for Skirmish is 'versus'. Anything else
// (tutorial, debug) falls back to Skirmish rather than to getScenario's default, the tutorial map.
const PLAY_MODES = { skirmish: 'versus', versus: 'versus', defend: 'defend', sandbox: 'sandbox' };

// Grog 3D: the 2D game's simulation under a Three.js renderer built the sim-taxi way.
//
// Frame order: sim step (Grog's systems, untouched) → read gameState into meshes (units, effects,
// markers, fog texture) → camera, sun, haze → render. Nothing in the presentation layer writes back
// into gameState except through the 2D game's own input handlers.

const params = new URLSearchParams(location.search);
const canvas = document.getElementById('game');
const hudRoot = document.getElementById('hud');

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: params.has('shot') });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = params.get('shadows') !== 'off';
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;

const { scene, sun } = createScene({ shadowMapSize: params.get('shadows') === 'off' ? 0 : 4096 });
const cam = createCamera();
const sfx = createSfx();
window.addEventListener('pointerdown', () => sfx.unlock(), { once: false });
window.addEventListener('keydown', () => sfx.unlock(), { once: false });

let game = null;   // { session, world, units, effects, markers, fog, input, hud }

function clearGame() {
  if (!game) return;
  game.input.dispose();
  scene.remove(game.world);
  game.world.traverse((o) => { if (o.geometry && !o.geometry.userData.shared) o.geometry.dispose?.(); });
  hudRoot.innerHTML = '';
  game = null;
}

/** Build the world for a session. `interactive` false = the title screen's backdrop. */
function startGame(opts, interactive = true) {
  clearGame();
  const session = createSession(opts);
  const world = new THREE.Group();
  world.name = 'world';
  scene.add(world);

  const t0 = performance.now();
  const { group: terrain, rings } = buildTerrain(session.map);
  world.add(terrain);
  const bounds = mapBounds(session.map);
  world.add(buildWater(session.map, bounds));
  const units = createUnitLayer(world, session.map, rings);
  const effects = createEffects(world);
  const markers = createMarkers(world, session.map, rings);
  const fog = createFog(session.map);
  fog.setEnabled(interactive && params.get('fog') !== 'off');
  if (params.get('fog') === 'off') session.fogState.debugHideFog = true;
  console.info(`[grog3d] world built in ${(performance.now() - t0).toFixed(0)} ms`);

  cam.setBounds({ minX: bounds.minX, maxX: bounds.maxX, minZ: bounds.minZ + 10, maxZ: bounds.maxZ + 25 });
  const home = session.gameState.ports.find((p) => p.owner === 'player');
  if (home) { const w = hexToWorld(home.q, home.r); cam.lookAt(w.x, w.z + 8); }

  let input = { dispose() {}, update() {}, hover: {} };
  let hud = { update() {}, showBox() {} };
  if (interactive) {
    hud = createHud(hudRoot, {
      session, sfx, cam,
      onQuit: () => toTitle(),
      onRestart: () => startGame(opts, true),
    });
    input = createInput({ canvas, cam, session, sfx, onBox: (b) => hud.showBox(b) });
    const minimap = createMinimap(hudRoot, { session, cam, canvas, onCommand: (x, z, shift) => input.commandAt(x, z, shift) });
    const hudUpdate = hud.update;
    hud.update = (dt, view) => { hudUpdate(dt, view); minimap.update(dt); };
    sfx.loop('ocean', 0.25, 'sfx');
    sfx.loop('music', 0.25, 'music');
  }
  game = { session, world, units, effects, markers, fog, input, hud, interactive, opts, actions, cam };
  window.__grog = game;   // test hook, like sim-taxi's window.__taxi
  return game;
}

function toTitle() {
  // The title sits over a live, fog-free skirmish between AIs — the game playing itself.
  startGame({ scenarioId: 'versus', aiCount: 3, seed: 7 }, false);
  game.session.fogState.debugHideFog = true;
  cam.state.zoom = 70;
  showTitle(hudRoot, {
    onStart: (opts) => { sfx.unlock(); startGame(opts, true); },
  });
}

// --- Haze: three's linear fog placed around the standoff (sim-taxi scene.js). ------------------
// Under this ortho camera a ground point `s` world-units up the screen sits at depth
// DISTANCE + s·cot(elevation); so the frame's depth band is DISTANCE ± zoom·cot(elev), and the band
// moves with the camera, never creeping onto the bottom of the frame.
const HAZE_TOP = 0.2;
const unSmoothstep = (y) => 0.5 - Math.sin(Math.asin(1 - 2 * y) / 3);
function updateHaze() {
  const half = cam.state.zoom / Math.tan(ELEVATION);
  scene.fog.near = DISTANCE - half;
  scene.fog.far = scene.fog.near + (2 * half) / unSmoothstep(HAZE_TOP);
}

function resize() {
  const w = window.innerWidth, h = window.innerHeight;
  renderer.setSize(w, h, false);
  canvas.style.width = `${w}px`; canvas.style.height = `${h}px`;
  cam.resize(w, h);
}
window.addEventListener('resize', resize);
resize();

document.addEventListener('visibilitychange', () => sfx.suspend(document.hidden));

const selectedIds = new Set();
let last = performance.now();
let wallTime = 0;
function frame(now) {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  wallTime += dt;
  if (game) {
    const { session } = game;
    session.step(dt);
    if (!game.interactive) {
      // Title backdrop: drift slowly across the map.
      cam.panWorld(dt * 3, -dt * 1.2);
    }
    for (const e of session.events.splice(0)) {
      if (e.type === 'explosion') {
        cam.state.shake = Math.max(cam.state.shake, e.massive ? 2.4 : 0.8);
        sfx.play('cannon-impact', { volume: e.massive ? 1.6 : 1 });
      } else if (e.type) sfx.play(e.type);
    }
    selectedIds.clear();
    for (const u of session.gameState.selectedUnits) {
      const list = u.type === 'ship' ? session.gameState.ships : u.type === 'port' ? session.gameState.ports
        : u.type === 'tower' ? session.gameState.towers : session.gameState.settlements;
      if (list[u.index]) selectedIds.add(list[u.index].id);
    }
    WATER_UNIFORMS.uTime.value = wallTime;
    game.input.update(dt);
    game.units.update(session.gameState, session.fogState, wallTime, selectedIds);
    game.effects.update(session.gameState, session.fogState, wallTime, dt * session.gameState.timeScale);
    game.markers.update(session.gameState, session.fogState, game.input.hover, wallTime);
    game.fog.update(session.fogState, session.time);
    game.hud.update(dt, { w: window.innerWidth, h: window.innerHeight });
  }
  cam.update(dt);
  followSun(sun, cam.state.target, cam.state.zoom * cam.state.aspect);
  updateHaze();
  renderer.render(scene, cam.camera);
  requestAnimationFrame(frame);
}

if (params.has('play')) {
  startGame({ scenarioId: PLAY_MODES[params.get('mode')] || 'versus', aiCount: Number(params.get('ai') || 3), difficulty: params.get('difficulty') || 'normal', seed: params.has('seed') ? Number(params.get('seed')) : undefined }, true);
} else {
  toTitle();
}
requestAnimationFrame(frame);
