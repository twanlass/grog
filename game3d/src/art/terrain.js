import * as THREE from 'three';
import { hexKey } from '@grog/hex.js';
import { TILE_TYPES, CLIMATE_ZONES } from '@grog/mapGenerator.js';
import { PALETTE, SURF, jitterColor } from '../palette.js';
import { makeRng } from '../util/rng.js';
import { bakeColor, merge, cyl, blob, surfaceMaterial, propsMaterial } from '../util/geo.js';
import { hexToWorld, worldToHex, mapBounds, HEX_R } from '../world.js';
import { createHeightField, tileTop, landRings, fbm2, noise2 } from './heightfield.js';

export { tileTop, landRings };

// The islands, as one sculpted surface.
//
// The first cut drew a prism per hex. This draws `heightfield.js`'s continuous ground as a grid
// mesh — beaches that run down under the sea, hills between the flat pads buildings stand on —
// coloured per vertex by what the ground *is* there (wet sand, beach, grass or snow or jungle,
// bare rock where it is steep), and textured by the surface shader's `ground` kind. Lit smooth:
// normals come from the height grid itself.
//
// Vegetation is instanced: a handful of generated variants per species, thousands of placements.
// Each instance sways in the wind about its own root (`propsMaterial`), and folds away when
// something is built on its hex (`syncOccupied`), which is what lets forests run right up to the coast.

const GRID = 0.8;              // world units between height samples
const SHELF = -2.6;            // the sea floor is drawn down to here; below it the water hides it

const C = (hex) => new THREE.Color(hex);
const COL = {
  seabed: C(PALETTE.seabed), seabedDeep: C(PALETTE.seabedDeep),
  cliff: C(PALETTE.cliff), cliffArctic: C(PALETTE.cliffArctic), rock: C(PALETTE.rock),
  beach: { arctic: C(PALETTE.beachArctic), temperate: C(PALETTE.beachTemperate), tropical: C(PALETTE.beachTropical) },
  groundA: { arctic: C(PALETTE.snow), temperate: C(PALETTE.grass), tropical: C(PALETTE.jungle) },
  groundB: { arctic: C(PALETTE.snowShade), temperate: C(PALETTE.grassDark), tropical: C(PALETTE.jungleDark) },
  groundC: { arctic: C(PALETTE.tundra), temperate: C(PALETTE.dryGrass), tropical: C(PALETTE.sand) },
};
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

export function buildTerrain(map, field = createHeightField(map, mapBounds(map))) {
  const rng = makeRng((map.seed >>> 0) ^ 0x9e3779b9);
  const b = mapBounds(map);
  const x0 = b.minX - 4, z0 = b.minZ - 4;
  const nx = Math.ceil((b.maxX - b.minX + 8) / GRID) + 1;
  const nz = Math.ceil((b.maxZ - b.minZ + 8) / GRID) + 1;

  // 1. Heights on the grid. NaN where there is nothing but deep water.
  const H = new Float32Array(nx * nz).fill(NaN);
  for (let j = 0; j < nz; j++) {
    const z = z0 + j * GRID;
    for (let i = 0; i < nx; i++) {
      const x = x0 + i * GRID;
      if (field.nearShore(x, z)) H[j * nx + i] = field.heightAt(x, z);
    }
  }
  const at = (i, j) => { const h = H[j * nx + i]; return Number.isNaN(h) ? SHELF - 2 : h; };

  // 2. Emit the quads that show: any corner above the shelf.
  const index = new Int32Array(nx * nz).fill(-1);
  const pos = [], nor = [], col = [], idx = [];
  const tmp = new THREE.Color(), n = new THREE.Vector3();
  function vertex(i, j) {
    const k = j * nx + i;
    if (index[k] >= 0) return index[k];
    const x = x0 + i * GRID, z = z0 + j * GRID, y = at(i, j);
    // Normal from the grid's own slopes.
    const hl = at(Math.max(0, i - 1), j), hr = at(Math.min(nx - 1, i + 1), j);
    const hd = at(i, Math.max(0, j - 1)), hu = at(i, Math.min(nz - 1, j + 1));
    n.set(hl - hr, 2 * GRID, hd - hu).normalize();
    groundColor(tmp, map, x, y, z, n.y);
    index[k] = pos.length / 3;
    pos.push(x, y, z); nor.push(n.x, n.y, n.z); col.push(tmp.r, tmp.g, tmp.b);
    return index[k];
  }
  for (let j = 0; j < nz - 1; j++) {
    for (let i = 0; i < nx - 1; i++) {
      const a = H[j * nx + i], bb = H[j * nx + i + 1], c = H[(j + 1) * nx + i], d = H[(j + 1) * nx + i + 1];
      if (!(Math.max(a, bb, c, d) > SHELF)) continue;      // also false for an all-NaN quad
      const va = vertex(i, j), vb = vertex(i + 1, j), vc = vertex(i, j + 1), vd = vertex(i + 1, j + 1);
      // Counter-clockwise seen from +Y (z grows toward the viewer), so the faces point up.
      idx.push(va, vc, vb, vb, vc, vd);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  geo.setAttribute('mat', new THREE.BufferAttribute(new Float32Array(pos.length / 3).fill(SURF.ground), 1));
  geo.setIndex(idx);

  const group = new THREE.Group();
  group.name = 'terrain';
  const landMesh = new THREE.Mesh(geo, surfaceMaterial({ key: 'terrain' }));
  landMesh.name = 'land';
  landMesh.receiveShadow = true;
  landMesh.castShadow = true;
  group.add(landMesh);

  group.add(buildProps(map, field, rng));
  return { group, rings: field.rings, field };
}

/** What colour is the ground here: by height against the sea, by climate, by steepness. */
function groundColor(out, map, x, y, z, ny) {
  const h = worldToHex(x, z);
  const tile = map.tiles.get(hexKey(h.q, h.r));
  const climate = (tile && tile.climate) || CLIMATE_ZONES.TEMPERATE;
  if (y < 0.02) {
    // Sea floor: pale sand in the shallows, going grey-green with depth and weed.
    out.copy(COL.beach[climate]).lerp(COL.seabed, 0.5).lerp(COL.seabedDeep, smooth(-0.3, -2.4, y));
    const weed = smooth(0.55, 0.75, fbm2(x * 0.35, z * 0.35)) * smooth(-0.5, -1.5, y);
    return out.lerp(COL.groundB.temperate, weed * 0.5);
  }
  const patch = fbm2(x * 0.11 + 13, z * 0.11);
  const fine = noise2(x * 0.7, z * 0.7);
  out.copy(COL.groundA[climate]).lerp(COL.groundB[climate], smooth(0.35, 0.7, patch));
  out.lerp(COL.groundC[climate], smooth(0.62, 0.8, fbm2(x * 0.19 + 50, z * 0.19 + 9)) * 0.75);
  out.multiplyScalar(0.94 + 0.12 * fine);
  // Beach below, with a ragged edge where the grass gives out.
  const edge = 0.62 + (fbm2(x * 0.6, z * 0.6) - 0.5) * 0.5;
  out.lerp(COL.beach[climate], 1 - smooth(edge - 0.12, edge + 0.22, y));
  // Bare rock where it is steep.
  const steep = smooth(0.9, 0.72, ny);
  out.lerp(climate === CLIMATE_ZONES.ARCTIC ? COL.cliffArctic : (patch > 0.5 ? COL.cliff : COL.rock), steep);
  return out;
}

// --- Vegetation -----------------------------------------------------------------------------------

const LEAF = { crease: 1.2, mat: SURF.leaf };

function pineGeo(rng, snowy) {
  const parts = [cyl(0.09, 0.15, 0.9, 0, 0, 0, PALETTE.trunk, 5, { mat: SURF.bark, open: true })];
  const tiers = rng.int(4, 5);
  const lean = rng.range(-0.05, 0.05);
  let y = 0.45;
  for (let k = 0; k < tiers; k++) {
    const t = k / (tiers - 1);
    const r = 0.95 * (1 - t * 0.72);
    const h = 0.95 - t * 0.25;
    const green = jitterColor(k % 2 ? PALETTE.pine : PALETTE.leafDark, rng, { l: 0.03 });
    const g = new THREE.ConeGeometry(r, h, 7, 1, true);
    g.rotateY(rng.range(0, 1));
    g.translate(lean * k, y + h / 2, 0);
    const baked = bakeColor(g, green, LEAF);
    if (snowy) snowCap(baked, y + h * 0.45, t);
    parts.push(baked);
    y += h * 0.5;
  }
  return merge(parts);
}

/** Whiten a cone's upper faces: snow lies on top of the boughs, not under them. */
function snowCap(geo, yLine, t) {
  const p = geo.attributes.position, c = geo.attributes.color;
  const snow = new THREE.Color(PALETTE.pineSnow);
  for (let i = 0; i < p.count; i++) {
    if (p.getY(i) > yLine - 0.1 + (1 - t) * 0.25) c.setXYZ(i, snow.r, snow.g, snow.b);
  }
}

function broadleafGeo(rng) {
  const parts = [
    cyl(0.1, 0.17, 1.1, 0, 0, 0, PALETTE.trunk, 5, { mat: SURF.bark, open: true }),
  ];
  const lobes = rng.int(3, 5);
  for (let k = 0; k < lobes; k++) {
    const a = (k / lobes) * Math.PI * 2 + rng.range(0, 0.8);
    const d = k === 0 ? 0 : rng.range(0.35, 0.6);
    const r = k === 0 ? rng.range(0.75, 0.9) : rng.range(0.5, 0.68);
    const y = k === 0 ? 1.65 : rng.range(1.15, 1.5);
    parts.push(blob(r, Math.cos(a) * d, y, Math.sin(a) * d, jitterColor(rng.chance(0.5) ? PALETTE.leaf : PALETTE.leafDark, rng, { l: 0.05 }), rng, { jitter: 0.22, sy: 0.85, detail: 1, ...LEAF }));
  }
  return merge(parts);
}

function palmGeo(rng) {
  const parts = [];
  const lean = rng.range(0.2, 0.55), dir = rng.range(0, Math.PI * 2);
  const segs = 6, hTot = rng.range(2.0, 2.7);
  let px = 0, pz = 0, py = 0;
  for (let k = 0; k < segs; k++) {
    const h = hTot / segs;
    const bend = lean * ((k + 1) / segs) ** 1.6 * 0.5;
    const g = new THREE.CylinderGeometry(0.075 - k * 0.004, 0.1 - k * 0.004, h * 1.08, 6, 1, true);
    g.translate(0, h / 2, 0);
    g.rotateZ(-bend);
    g.rotateY(dir);
    g.translate(px, py, pz);
    parts.push(bakeColor(g, k % 2 ? PALETTE.trunk : PALETTE.woodDark, { mat: SURF.bark, crease: 1 }));
    px += Math.cos(dir) * Math.sin(bend) * h; pz -= Math.sin(dir) * Math.sin(bend) * h; py += Math.cos(bend) * h;
  }
  // Fronds: a bent, tapering blade each, drooping at the tip.
  const fronds = rng.int(7, 9);
  for (let k = 0; k < fronds; k++) {
    const a = (k / fronds) * Math.PI * 2 + rng.range(0, 0.4);
    const len = rng.range(1.1, 1.5);
    const g = new THREE.BoxGeometry(len, 0.03, 0.36, 5, 1, 2);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const u = p.getX(i) / len + 0.5;
      p.setX(i, u * len);
      p.setZ(i, p.getZ(i) * Math.sin(Math.PI * Math.min(1, u * 0.9 + 0.12)));
      p.setY(i, p.getY(i) + 0.28 * Math.sin(u * 1.4) - 0.75 * u * u - Math.abs(p.getZ(i)) * 0.5);
    }
    g.rotateZ(rng.range(0.1, 0.45));
    g.rotateY(a);
    g.translate(px, py, pz);
    parts.push(bakeColor(g, jitterColor(k % 3 ? PALETTE.frond : PALETTE.palm, rng, { l: 0.04 }), LEAF));
  }
  for (let k = 0; k < 3; k++) parts.push(blob(0.09, px + rng.range(-0.1, 0.1), py - 0.12, pz + rng.range(-0.1, 0.1), PALETTE.coconut));
  return merge(parts);
}

function bushGeo(rng, col) {
  const parts = [];
  const nB = rng.int(2, 3);
  for (let k = 0; k < nB; k++) {
    parts.push(blob(rng.range(0.28, 0.42), rng.range(-0.3, 0.3), rng.range(0.18, 0.3), rng.range(-0.3, 0.3), jitterColor(col, rng, { l: 0.05 }), rng, { jitter: 0.25, sy: 0.75, ...LEAF }));
  }
  return merge(parts);
}

function tuftGeo(rng, col) {
  const parts = [];
  for (let k = 0; k < 7; k++) {
    const a = rng.range(0, Math.PI * 2), d = rng.range(0, 0.22);
    const g = new THREE.ConeGeometry(0.045, rng.range(0.25, 0.5), 3, 1, true);
    g.translate(0, 0.18, 0);
    g.rotateZ(rng.range(-0.35, 0.35));
    g.rotateY(a);
    g.translate(Math.cos(a) * d, 0, Math.sin(a) * d);
    parts.push(bakeColor(g, jitterColor(col, rng, { l: 0.06 }), { mat: SURF.leaf }));
  }
  return merge(parts);
}

function rockGeo(rng, col) {
  const parts = [];
  const nR = rng.int(1, 3);
  for (let k = 0; k < nR; k++) {
    const r = k === 0 ? rng.range(0.4, 0.6) : rng.range(0.18, 0.32);
    const a = rng.range(0, Math.PI * 2), d = k === 0 ? 0 : rng.range(0.45, 0.7);
    parts.push(blob(r, Math.cos(a) * d, r * 0.3, Math.sin(a) * d, jitterColor(col, rng, { l: 0.05 }), rng, { jitter: 0.3, sy: 0.72, detail: 1, crease: 0.5, mat: SURF.rock }));
  }
  return merge(parts);
}

function flowersGeo(rng, col) {
  const parts = [];
  for (let k = 0; k < 9; k++) {
    const x = rng.range(-0.5, 0.5), z = rng.range(-0.5, 0.5);
    parts.push(cyl(0.012, 0.012, 0.16, x, 0, z, PALETTE.bush, 3, { mat: SURF.leaf, open: true }));
    parts.push(blob(0.05, x, 0.18, z, col, null, { mat: SURF.plain }));
  }
  return merge(parts);
}

/** Species: `sway` is how far the wind moves the top; `n` variants are generated per species. */
const SPECIES = {
  pine: { n: 4, sway: 0.5, make: (rng) => pineGeo(rng, false) },
  pineSnow: { n: 4, sway: 0.4, make: (rng) => pineGeo(rng, true) },
  broadleaf: { n: 4, sway: 0.7, make: (rng) => broadleafGeo(rng) },
  palm: { n: 4, sway: 1.0, make: (rng) => palmGeo(rng) },
  bush: { n: 3, sway: 0.5, make: (rng) => bushGeo(rng, PALETTE.bush) },
  tuft: { n: 3, sway: 2.2, make: (rng) => tuftGeo(rng, PALETTE.meadow) },
  tuftDry: { n: 2, sway: 2.2, make: (rng) => tuftGeo(rng, PALETTE.hay) },
  flowers: { n: 2, sway: 1.5, make: (rng) => flowersGeo(rng, PALETTE.flower) },
  rock: { n: 4, sway: 0, make: (rng) => rockGeo(rng, rng.chance(0.5) ? PALETTE.rock : PALETTE.rockDark) },
  rockArctic: { n: 3, sway: 0, make: (rng) => rockGeo(rng, PALETTE.cliffArctic) },
};

function buildProps(map, field, rng) {
  const placements = {};   // species:variant → [{x,y,z,s,a}]
  const add = (species, x, z, s, minY = 0.42) => {
    const y = field.heightAt(x, z);
    if (y < minY) return;
    const key = `${species}:${rng.int(0, SPECIES[species].n - 1)}`;
    const h = worldToHex(x, z);
    (placements[key] ||= []).push({ x, y: y - 0.04, z, s, a: rng.range(0, Math.PI * 2), hex: hexKey(h.q, h.r) });
  };
  for (const t of map.tiles.values()) {
    if (t.type !== TILE_TYPES.LAND) continue;
    const { x: cx, z: cz } = hexToWorld(t.q, t.r);
    const ring = field.rings.get(hexKey(t.q, t.r)) || 1;
    const climate = t.climate;
    // Forest comes in drifts: a slow noise decides wood or clearing, the ring thins the coast.
    const wood = fbm2(cx * 0.045 + 3, cz * 0.045 + 8);
    const density = THREE.MathUtils.clamp((wood - 0.3) * 2.4, 0, 1) * (ring <= 1 ? 0.35 : 1);
    const spot = () => { const a = rng.range(0, Math.PI * 2), d = Math.sqrt(rng.next()) * HEX_R * 0.95; return [cx + Math.cos(a) * d, cz + Math.sin(a) * d]; };
    const trees = Math.round(density * (climate === CLIMATE_ZONES.TROPICAL ? 5 : 7) + rng.range(-0.4, 0.8));
    for (let i = 0; i < trees; i++) {
      const [x, z] = spot();
      const s = rng.range(0.85, 1.35);
      if (climate === CLIMATE_ZONES.ARCTIC) add('pineSnow', x, z, s);
      else if (climate === CLIMATE_ZONES.TROPICAL) add(rng.chance(0.75) ? 'palm' : 'broadleaf', x, z, s, 0.3);
      else add(rng.chance(0.55) ? 'broadleaf' : 'pine', x, z, s);
    }
    // Understorey: bushes, grass, flowers, stones.
    const under = climate === CLIMATE_ZONES.ARCTIC ? 1 : 4;
    for (let i = 0; i < under; i++) {
      const [x, z] = spot();
      const pick = rng.next();
      if (climate === CLIMATE_ZONES.ARCTIC) add('rockArctic', x, z, rng.range(0.6, 1.3), 0.1);
      else if (pick < 0.3) add('bush', x, z, rng.range(0.8, 1.4), 0.5);
      else if (pick < 0.75) add(climate === CLIMATE_ZONES.TROPICAL || rng.chance(0.3) ? 'tuftDry' : 'tuft', x, z, rng.range(0.8, 1.5), 0.45);
      else if (pick < 0.87 && climate === CLIMATE_ZONES.TEMPERATE) add('flowers', x, z, rng.range(0.8, 1.3), 0.7);
      else add('rock', x, z, rng.range(0.6, 1.4), -0.25);
    }
    if (rng.chance(0.25)) { const [x, z] = spot(); add(climate === CLIMATE_ZONES.ARCTIC ? 'rockArctic' : 'rock', x, z, rng.range(1.0, 2.0), -0.3); }
  }

  const group = new THREE.Group();
  group.name = 'props';
  const byHex = {};        // hexKey → the instances rooted on it, so a building can clear its hex
  const vrng = makeRng(0x51a7);
  const variants = {};
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), p = new THREE.Vector3(), sc = new THREE.Vector3();
  for (const [key, list] of Object.entries(placements)) {
    const [species] = key.split(':');
    const spec = SPECIES[species];
    const geo = (variants[key] ||= spec.make(vrng));
    const { material, depth } = propsMaterial(spec.sway);
    const mesh = new THREE.InstancedMesh(geo, material, list.length);
    mesh.customDepthMaterial = depth;
    mesh.name = `props-${key}`;
    list.forEach((e, i) => {
      q.setFromAxisAngle(up, e.a);
      const m = m4.compose(p.set(e.x, e.y, e.z), q, sc.set(e.s, e.s * (0.9 + 0.2 * noise2(e.x, e.z)), e.s)).clone();
      mesh.setMatrixAt(i, m);
      (byHex[e.hex] ||= []).push({ mesh, i, m });
    });
    mesh.instanceMatrix.needsUpdate = true;
    // sim-taxi trap: three computes an InstancedMesh's bounding sphere once and culls with it.
    mesh.frustumCulled = false;
    mesh.castShadow = spec.sway < 2;       // grass throws no shadow worth its cost
    mesh.receiveShadow = true;
    group.add(mesh);
  }

  // A structure's hex has nothing growing on it. Done on the CPU by zeroing the instances' matrices
  // (rather than in the shader) so every pass — colour, shadow, ambient occlusion — agrees, and the
  // wood comes back if the building is lost.
  const cleared = new Set();
  let stamp = -1;
  const zero = new THREE.Matrix4().makeScale(0, 0, 0);
  group.userData.syncOccupied = (gameState) => {
    const lists = [gameState.ports, gameState.settlements, gameState.towers];
    const s = lists[0].length * 31 + lists[1].length * 37 + lists[2].length * 41;
    if (s === stamp) return;
    stamp = s;
    const now = new Set();
    for (const list of lists) for (const e of list) now.add(hexKey(e.q, e.r));
    const touched = new Set();
    for (const k of now) if (!cleared.has(k)) for (const it of byHex[k] || []) { it.mesh.setMatrixAt(it.i, zero); touched.add(it.mesh); }
    for (const k of cleared) if (!now.has(k)) for (const it of byHex[k] || []) { it.mesh.setMatrixAt(it.i, it.m); touched.add(it.mesh); }
    cleared.clear(); for (const k of now) cleared.add(k);
    for (const mesh of touched) mesh.instanceMatrix.needsUpdate = true;
  };
  return group;
}
