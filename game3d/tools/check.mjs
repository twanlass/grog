// npm run check — the headless suite. Same idea as sim-taxi's tools/check.mjs: assertions about
// what matters (does the sim run, do clicks do what the 2D game does, is every face wound the
// right way) in a couple of seconds, instead of screenshots that can't assert any of it.
//
// Modules load through Vite's SSR loader so the `@grog` alias (→ ../game/src) resolves exactly as
// it does in the browser.

import { createServer } from 'vite';
import { readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const server = await createServer({ root, configFile: join(root, 'vite.config.js'), server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
const load = (p) => server.ssrLoadModule(p);

let failures = 0, passes = 0;
const t0 = Date.now();
function check(name, cond, detail = '') {
  if (cond) { passes++; return; }
  failures++;
  console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`);
}
async function section(name, fn) {
  const s = Date.now();
  try { await fn(); } catch (e) { failures++; console.log(`  ✗ ${name} threw: ${e.stack || e}`); }
  console.log(`${failures ? '·' : '✓'} ${name} (${Date.now() - s} ms)`);
}

// Silence the sim's console chatter (it logs every build) while it runs.
const quiet = async (fn) => { const l = console.log; console.log = () => {}; try { return await fn(); } finally { console.log = l; } };

const THREE = await load('three');
const world = await load('/src/world.js');
const hex = await load('@grog/hex.js');

// --- 1. Every browser module at least compiles (sim-taxi's BOOT lesson: a scope slip in a module
// nothing headless imports ships unnoticed).
await section('every module transforms', async () => {
  const files = [];
  const walk = (d) => { for (const f of readdirSync(d)) { const p = join(d, f); if (statSync(p).isDirectory()) walk(p); else if (p.endsWith('.js')) files.push(p); } };
  walk(join(root, 'src'));
  for (const f of files) {
    const r = await server.transformRequest('/' + relative(root, f));
    check(`transform ${relative(root, f)}`, r && r.code.length > 0);
  }
});

// --- 2. Coordinates: world ↔ Grog pixels ↔ hex round-trip, and the fog shader's hex lookup
// (a GLSL copy of hex.js pixelToHex) agrees with the real one.
await section('coordinates and the fog shader lookup', async () => {
  const { generateMap } = await load('@grog/mapGenerator.js');
  const map = generateMap({ width: 60, height: 60, versusMode: true, seed: 3 });
  let bad = 0;
  for (const t of map.tiles.values()) {
    const w = world.hexToWorld(t.q, t.r);
    const h = world.worldToHex(w.x, w.z);
    if (h.q !== t.q || h.r !== t.r) bad++;
  }
  check('hexToWorld → worldToHex round-trips every tile', bad === 0, `${bad} mismatches`);
  // JS mirror of FOG_FRAGMENT_PARS grogFogAt's rounding.
  const glslHex = (x, z) => {
    const px = x * world.PX_PER_UNIT, py = z * world.PX_PER_UNIT;
    const q = (2 / 3 * px) / 32, r = (-1 / 3 * px + 0.57735027 * py) / 32, s = -q - r;
    let rq = Math.floor(q + 0.5), rr = Math.floor(r + 0.5); const rs = Math.floor(s + 0.5);
    const dq = Math.abs(rq - q), dr = Math.abs(rr - r), ds = Math.abs(rs - s);
    if (dq > dr && dq > ds) rq = -rr - rs; else if (dr > ds) rr = -rq - rs;
    return { q: rq, r: rr };
  };
  const { makeRng } = await load('/src/util/rng.js');
  const rng = makeRng(9);
  let off = 0;
  for (let i = 0; i < 5000; i++) {
    const x = rng.range(-150, 350), z = rng.range(0, 500);
    const a = glslHex(x, z), b = world.worldToHex(x, z);
    if (a.q !== b.q || a.r !== b.r) off++;
  }
  // Points exactly on a hex edge may round either way; anything beyond a hair is a real bug.
  check('fog shader hex rounding matches hex.js', off <= 5, `${off}/5000 disagree`);
  const { FOG_FRAGMENT_PARS } = await load('/src/util/geo.js');
  check('fog shader still uses HEX_SIZE 32 via uniform', FOG_FRAGMENT_PARS.includes('uHexSize') && hex.HEX_SIZE === 32);
});

// --- 3. Geometry: everything merged is non-indexed and coloured; nothing is wound inside out.
function signedVolume(geo) {
  const p = geo.attributes.position;
  let v = 0;
  for (let i = 0; i < p.count; i += 3) {
    const ax = p.getX(i), ay = p.getY(i), az = p.getZ(i);
    const bx = p.getX(i + 1), by = p.getY(i + 1), bz = p.getZ(i + 1);
    const cx = p.getX(i + 2), cy = p.getY(i + 2), cz = p.getZ(i + 2);
    v += (ax * (by * cz - bz * cy) - ay * (bx * cz - bz * cx) + az * (bx * cy - by * cx)) / 6;
  }
  return v;
}
function faceNormalsUp(geo, minY = 0.5) {
  // For a sheet (sea, a hex top): every triangle's winding normal must point up.
  const p = geo.attributes.position;
  let down = 0;
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  for (let i = 0; i < p.count; i += 3) {
    a.fromBufferAttribute(p, i); b.fromBufferAttribute(p, i + 1); c.fromBufferAttribute(p, i + 2);
    const n = b.sub(a).cross(c.sub(a)).normalize();
    if (n.y < minY) down++;
  }
  return down;
}
function sane(name, geo) {
  check(`${name}: non-indexed`, !geo.index);
  check(`${name}: has colour`, !!geo.attributes.color);
  const arr = geo.attributes.position.array;
  let nan = false; for (let i = 0; i < arr.length; i++) if (!Number.isFinite(arr[i])) { nan = true; break; }
  check(`${name}: finite positions`, !nan);
  check(`${name}: wound outward (positive signed volume)`, signedVolume(geo) > 0, `volume ${signedVolume(geo).toFixed(3)}`);
}

await section('models are merged, coloured and wound outward', async () => {
  const ships = await load('/src/art/ships.js');
  for (const t of ships.SHIP_TYPES) for (const o of ['player', 'ai1', 'pirate']) sane(`ship ${t}/${o}`, ships.shipGeometry(t, o));
  const st = await load('/src/art/structures.js');
  for (const [k, t] of [['port', 'dock'], ['port', 'shipyard'], ['port', 'stronghold'], ['settlement', 'settlement'], ['tower', 'watchtower'], ['tower', 'crossbowTower'], ['tower', 'cannonBattery']]) {
    sane(`${k} ${t}`, st.structureGeometry(k, t, 'player', 2));
  }
  sane('scaffold', st.scaffoldGeometry(3, 3));
});

await section('terrain and sea face the sky', async () => {
  const { generateMap } = await load('@grog/mapGenerator.js');
  const { buildTerrain } = await load('/src/art/terrain.js');
  const { buildWater } = await load('/src/art/water.js');
  const map = generateMap({ width: 30, height: 30, versusMode: true, seed: 5 });
  const { group, field } = buildTerrain(map);
  const land = group.getObjectByName('land').geometry;
  // The ground and the sea are indexed sheets: walk the index (sim-taxi: reading an indexed
  // geometry's positions in order tests triangles that do not exist) and check each winding.
  const sheetDown = (geo, minY) => {
    const p = geo.attributes.position, ix = geo.index;
    let down = 0;
    const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
    for (let i = 0; i < ix.count; i += 3) {
      a.fromBufferAttribute(p, ix.getX(i)); b.fromBufferAttribute(p, ix.getX(i + 1)); c.fromBufferAttribute(p, ix.getX(i + 2));
      if (b.sub(a).cross(c.sub(a)).normalize().y < minY) down++;
    }
    return down;
  };
  check('land: indexed, coloured, finite', !!land.index && !!land.attributes.color && !!land.attributes.mat && land.attributes.position.array.every(Number.isFinite));
  check('every ground triangle faces up', land.index.count > 0 && sheetDown(land, 0.05) === 0);
  // Each land hex is flat at its pad height where a building would stand, and above the sea.
  const { tileTop } = await load('/src/art/heightfield.js');
  let padOff = 0, pads = 0;
  for (const t of map.tiles.values()) {
    if (t.type !== 'land') continue;
    pads++;
    const w = world.hexToWorld(t.q, t.r);
    if (Math.abs(field.heightAt(w.x, w.z) - tileTop(t, field.rings)) > 1e-6 || field.heightAt(w.x + 1, w.z) < 0.3) padOff++;
  }
  check('every land hex has a level pad at its centre', pads > 0 && padOff === 0, `${padOff}/${pads}`);
  const water = buildWater(map, world.mapBounds(map), field);
  check('every sea triangle faces up', sheetDown(water.geometry, 0.99) === 0);
  const props = group.getObjectByName('props');
  check('vegetation is instanced and can clear a hex', props.children.length > 0 && props.children.every((m) => m.isInstancedMesh && m.frustumCulled === false) && typeof props.userData.syncOccupied === 'function');
});

// --- 4. The simulation runs under the 3D session glue, every mode, and the AI actually plays.
await section('session: every mode simulates 3 minutes without throwing', async () => {
  const { createSession } = await load('/src/session.js');
  for (const [mode, n] of [['versus', 3], ['versus', 1], ['defend', 0], ['sandbox', 0]]) {
    const s = await quiet(() => createSession({ scenarioId: mode, aiCount: n, seed: 21 }));
    await quiet(() => { for (let i = 0; i < 60 * 180; i++) s.step(1 / 60); });
    check(`${mode}/${n}: player has a port`, s.gameState.ports.some((p) => p.owner === 'player') || s.gameState.gameOver);
    if (mode === 'versus') {
      const aiShips = s.gameState.ships.filter((x) => x.owner.startsWith('ai')).length;
      check(`${mode}/${n}: AI built ships`, aiShips > 0, `${aiShips}`);
    }
  }
});

// --- 5. HUD actions go through the 2D handlers and do what the 2D buttons do.
await section('actions: build, place, upgrade through the 2D handlers', async () => {
  const { createSession } = await load('/src/session.js');
  const act = await load('/src/actions.js');
  const gsMod = await load('@grog/gameState.js');
  const ih = await load('@grog/systems/inputHandler.js');
  const s = await quiet(() => createSession({ scenarioId: 'sandbox', seed: 8 }));
  const gs = s.gameState;
  gs.resources.wood = 500;
  const home = gs.ports.findIndex((p) => p.owner === 'player');
  gs.selectedUnits = [{ type: 'port', index: home }];
  await quiet(() => act.buildShip(gs, home, 'cutter'));
  check('build cutter: queued', gs.ports[home].buildQueue.length === 1);
  check('build cutter: wood deducted', gs.resources.wood === 490, `${gs.resources.wood}`);
  await quiet(() => { for (let i = 0; i < 60 * 8; i++) s.step(1 / 60); });
  const cutterIdx = gs.ships.findIndex((x) => x.owner === 'player' && x.type === 'cutter');
  check('build cutter: a cutter launched', cutterIdx >= 0);

  // Queue a second and cancel it: refund.
  gs.selectedUnits = [{ type: 'port', index: home }];
  await quiet(() => act.buildShip(gs, home, 'cutter'));
  const before = gs.resources.wood;
  await quiet(() => act.cancelQueueItem(gs, home, 0));
  check('cancel queued build: refunded', gs.resources.wood === before + 10 && gs.ports[home].buildQueue.length === 0, `${before} → ${gs.resources.wood}`);

  // Settlement placement from the port.
  await quiet(() => act.placeSettlementFrom(gs, home));
  check('settlement: placement mode', gs.settlementBuildMode.active);
  const port = gs.ports[home];
  let site = null;
  for (const t of s.map.tiles.values()) {
    if (hex.hexDistance(port.q, port.r, t.q, t.r) <= 10 && gsMod.isValidSettlementSite(s.map, t.q, t.r, gs.settlements, gs.ports, gs.towers, port)) { site = t; break; }
  }
  check('settlement: a valid site exists', !!site);
  if (site) {
    gs.settlementBuildMode.hoveredHex = { q: site.q, r: site.r };
    await quiet(() => ih.handleSettlementPlacementClick(gs));
    check('settlement: placed under construction', gs.settlements.some((x) => x.q === site.q && x.r === site.r && x.construction));
  }

  // Dock from the cutter → port placement mode.
  if (cutterIdx >= 0) {
    gs.selectedUnits = [{ type: 'ship', index: cutterIdx }];
    await quiet(() => act.buildPortFromShip(gs, cutterIdx));
    check('dock from ship: placement mode', gs.portBuildMode.active && gs.portBuildMode.builderShipIndex === cutterIdx);
    act.cancelPlacement(gs);
    check('dock from ship: Esc cancels', !gs.portBuildMode.active);
  }

  // Upgrade the home port. Grog won't upgrade a port that is still building its settlement, so let it finish.
  await quiet(() => { for (let i = 0; i < 60 * 120 && gs.settlements.some((x) => x.construction); i++) s.step(1 / 60); });
  gs.resources.wood = 500;
  gs.selectedUnits = [{ type: 'port', index: home }];
  await quiet(() => act.upgradePort(gs, home, 'shipyard'));
  check('upgrade to shipyard: under way', gs.ports[home].construction && gs.ports[home].construction.upgradeTo === 'shipyard');

  // Ship commands.
  if (cutterIdx >= 0) {
    gs.selectedUnits = [{ type: 'ship', index: cutterIdx }];
    act.shipCommand(gs, 'attack');
    check('attack command: action mode', gs.actionMode.active === 'attack');
    act.shipCommand(gs, 'attack');
    check('attack command: toggles off', !gs.actionMode.active);
    const ids = act.shipCommandButtons([gs.ships[cutterIdx]]).map((b) => b.id);
    check('cutter commands include Broadside', ids.includes('broadside') && !ids.includes('tnt'), ids.join(','));
  }
});

await server.close();
console.log(`\n${failures ? `✗ ${failures} failed` : '✓ all passed'} — ${passes} assertions, ${((Date.now() - t0) / 1000).toFixed(1)}s`);
process.exit(failures ? 1 : 0);
