import * as THREE from 'three';
import { hexKey, hexNeighbors } from '@grog/hex.js';
import { isWater, TILE_TYPES, CLIMATE_ZONES } from '@grog/mapGenerator.js';
import { PALETTE, jitterColor } from '../palette.js';
import { makeRng } from '../util/rng.js';
import { bakeColor, bakeColors, merge, hash01, propMaterial, cyl, blob, box } from '../util/geo.js';
import { hexToWorld, HEX_R, SEABED, BEACH_Y, LAND_STEP, LAND_MAX_RINGS } from '../world.js';

// The islands: every land hex is a terraced prism that climbs a step per ring inland, with the
// coast ring as beach. Everything is one merged, flat-shaded, vertex-coloured mesh — the sim-taxi
// recipe — and the props (trees, rocks) are a second merged mesh beside it so their crowns can be
// lit smooth while the terrain stays faceted.
//
// Heights are a *look*, not gameplay: Grog's sim only knows land/shallow/ocean/deep, and nothing
// here feeds back into it.

const HEX_CORNERS = [];
for (let i = 0; i < 6; i++) {
  const a = (Math.PI / 3) * i; // flat-top: first corner on +X, same as hex.js hexCorners
  HEX_CORNERS.push([Math.cos(a), Math.sin(a)]);
}

/** Rings from the sea for every land tile (1 = coast). Water tiles get 0. */
export function landRings(map) {
  const rings = new Map();
  let frontier = [];
  for (const t of map.tiles.values()) {
    if (t.type !== TILE_TYPES.LAND) continue;
    const coast = hexNeighbors(t.q, t.r).some((n) => {
      const nt = map.tiles.get(hexKey(n.q, n.r));
      return !nt || isWater(nt);
    });
    if (coast) { rings.set(hexKey(t.q, t.r), 1); frontier.push(t); }
  }
  let ring = 1;
  while (frontier.length) {
    const next = [];
    ring++;
    for (const t of frontier) {
      for (const n of hexNeighbors(t.q, t.r)) {
        const k = hexKey(n.q, n.r);
        const nt = map.tiles.get(k);
        if (!nt || nt.type !== TILE_TYPES.LAND || rings.has(k)) continue;
        rings.set(k, ring);
        next.push(nt);
      }
    }
    frontier = next;
  }
  return rings;
}

/** Top height of a tile's surface (land) or seabed (water). Exported for unit placement. */
export function tileTop(tile, rings) {
  if (!tile) return SEABED.deep_ocean;
  if (tile.type !== TILE_TYPES.LAND) return SEABED[tile.type] ?? SEABED.ocean;
  const ring = rings.get(hexKey(tile.q, tile.r)) || 1;
  const steps = Math.min(ring - 1, LAND_MAX_RINGS);
  return BEACH_Y + steps * LAND_STEP;
}

function topColor(tile, ring, rng) {
  const c = tile.climate;
  if (ring <= 1) {
    const base = c === CLIMATE_ZONES.ARCTIC ? PALETTE.beachArctic
      : c === CLIMATE_ZONES.TROPICAL ? PALETTE.beachTropical : PALETTE.beachTemperate;
    return jitterColor(base, rng, { l: 0.03 });
  }
  if (c === CLIMATE_ZONES.ARCTIC) return jitterColor(rng.chance(0.3) ? PALETTE.snowShade : PALETTE.snow, rng, { l: 0.03 });
  if (c === CLIMATE_ZONES.TROPICAL) return jitterColor(rng.chance(0.35) ? PALETTE.sandDark : PALETTE.sand, rng, { l: 0.04 });
  return jitterColor(rng.chance(0.4) ? PALETTE.grassDark : PALETTE.grass, rng, { l: 0.04 });
}

function sideColor(tile) {
  return tile.climate === CLIMATE_ZONES.ARCTIC ? PALETTE.cliffArctic : PALETTE.cliff;
}

/** Corner heights wobble by a hash of their world position, so neighbours at one height weld. */
const wobble = (x, z, amt) => (hash01(x * 0.71, z * 0.71) - 0.5) * amt;

/**
 * One hex prism: a 6-triangle top (centre slightly raised so the facets catch the sun) and six
 * side quads down to `bottom`. Written as raw triangles, so the winding is asserted in the check
 * suite (sim-taxi lesson: compute the normal from the winding, never eyeball it).
 */
function hexPrism(cx, cz, top, bottom, topCol, sideCol, { wob = 0.12, crown = 0.06 } = {}) {
  const pos = [];
  const col = [];
  const tc = new THREE.Color(topCol);
  const sc = new THREE.Color(sideCol);
  const scDark = sc.clone().multiplyScalar(0.8);
  const corner = HEX_CORNERS.map(([dx, dz]) => {
    const x = cx + dx * HEX_R;
    const z = cz + dz * HEX_R;
    return [x, top + wobble(x, z, wob), z];
  });
  const centre = [cx, top + crown, cz];
  const push = (p, c) => { pos.push(p[0], p[1], p[2]); col.push(c.r, c.g, c.b); };
  for (let i = 0; i < 6; i++) {
    const a = corner[i];
    const b = corner[(i + 1) % 6];
    // Corners run counter-clockwise seen from +Y in (x, z)… which is clockwise in a right-handed
    // view from above (z points toward the viewer), so the top is centre → b → a.
    push(centre, tc); push(b, tc); push(a, tc);
    // Side quad a-b down to bottom, facing outward.
    const a0 = [a[0], bottom, a[2]];
    const b0 = [b[0], bottom, b[2]];
    push(a, sc); push(b, sc); push(b0, scDark);
    push(a, sc); push(b0, scDark); push(a0, scDark);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  return bakeColors(g, new Float32Array(col));
}

export function buildTerrain(map) {
  const rng = makeRng((map.seed >>> 0) ^ 0x9e3779b9);
  const rings = landRings(map);
  const land = [];
  const props = [];

  for (const t of map.tiles.values()) {
    const { x, z } = hexToWorld(t.q, t.r);
    const top = tileTop(t, rings);
    if (t.type === TILE_TYPES.LAND) {
      const ring = rings.get(hexKey(t.q, t.r)) || 1;
      land.push(hexPrism(x, z, top, -0.8, topColor(t, ring, rng), sideColor(t)));
      placeProps(props, t, ring, x, z, top, rng);
    }
    // No seabed: the sea is opaque and carries the depth in its own vertex colours (art/water.js),
    // so a floor under it would be 170k vertices nobody sees.
  }

  const group = new THREE.Group();
  group.name = 'terrain';

  const landMesh = new THREE.Mesh(merge(land), propMaterial({ key: 'terrain' }));
  landMesh.name = 'land';
  landMesh.receiveShadow = true;
  landMesh.castShadow = true;
  group.add(landMesh);

  if (props.length) {
    const propMesh = new THREE.Mesh(merge(props), propMaterial({ key: 'props' }));
    propMesh.name = 'props';
    propMesh.castShadow = true;
    propMesh.receiveShadow = true;
    group.add(propMesh);
  }

  return { group, rings };
}

// --- Props ---------------------------------------------------------------------------------------

function placeProps(out, tile, ring, cx, cz, top, rng) {
  const climate = tile.climate;
  // Coast hexes are where ports and settlements go; keep them mostly clear so a building never
  // stands in a tree. Interior hexes get a small grove.
  const count = ring <= 1 ? (rng.chance(climate === CLIMATE_ZONES.TROPICAL ? 0.35 : 0.12) ? 1 : 0)
    : rng.int(1, 3) + (ring >= 3 ? 1 : 0);
  for (let i = 0; i < count; i++) {
    const a = rng.range(0, Math.PI * 2);
    const d = rng.range(0.6, HEX_R * 0.62);
    const x = cx + Math.cos(a) * d;
    const z = cz + Math.sin(a) * d;
    const y = top - 0.05;
    if (rng.chance(0.18)) { out.push(rock(x, y, z, rng, climate)); continue; }
    if (climate === CLIMATE_ZONES.ARCTIC) out.push(...pine(x, y, z, rng, true));
    else if (climate === CLIMATE_ZONES.TROPICAL) out.push(...palm(x, y, z, rng));
    else out.push(...(rng.chance(0.5) ? pine(x, y, z, rng, false) : broadleaf(x, y, z, rng)));
  }
}

function rock(x, y, z, rng, climate) {
  const r = rng.range(0.35, 0.7);
  const col = climate === CLIMATE_ZONES.ARCTIC ? PALETTE.cliffArctic : (rng.chance(0.5) ? PALETTE.rock : PALETTE.rockDark);
  return blob(r, x, y + r * 0.35, z, jitterColor(col, rng), rng, { sy: 0.7, jitter: 0.25 });
}

function pine(x, y, z, rng, snowy) {
  const s = rng.range(0.8, 1.25);
  const parts = [cyl(0.12 * s, 0.16 * s, 0.6 * s, x, y, z, PALETTE.trunk, 5)];
  const green = jitterColor(PALETTE.pine, rng);
  let h = y + 0.45 * s;
  for (let k = 0; k < 3; k++) {
    const r = (0.95 - k * 0.25) * s;
    const t = 0.9 * s;
    parts.push(cyl(0, r, t, x, h, z, k === 2 && snowy ? PALETTE.pineSnow : green, 6));
    h += t * 0.55;
  }
  return parts;
}

function broadleaf(x, y, z, rng) {
  const s = rng.range(0.8, 1.2);
  return [
    cyl(0.13 * s, 0.18 * s, 0.9 * s, x, y, z, PALETTE.trunk, 5),
    blob(0.85 * s, x, y + 1.35 * s, z, jitterColor(rng.chance(0.5) ? PALETTE.leaf : PALETTE.leafDark, rng), rng, { jitter: 0.2, sy: 0.85 }),
  ];
}

function palm(x, y, z, rng) {
  const s = rng.range(0.85, 1.2);
  const parts = [];
  const lean = rng.range(-0.35, 0.35);
  const leanZ = rng.range(-0.35, 0.35);
  const segs = 4;
  let px = x, pz = z, py = y;
  for (let k = 0; k < segs; k++) {
    const h = 0.45 * s;
    parts.push(cyl(0.09 * s, 0.12 * s, h, px, py, pz, k % 2 ? PALETTE.trunk : PALETTE.woodDark, 5));
    px += lean * 0.12; pz += leanZ * 0.12; py += h;
  }
  const leaf = jitterColor(PALETTE.palm, rng);
  for (let k = 0; k < 5; k++) {
    const a = (k / 5) * Math.PI * 2 + rng.range(0, 0.6);
    const g = new THREE.BoxGeometry(1.3 * s, 0.05, 0.38 * s);
    g.translate(0.65 * s, 0, 0);
    g.rotateZ(-0.35);
    g.rotateY(a);
    g.translate(px, py, pz);
    parts.push(bakeColor(g, leaf));
  }
  parts.push(box(0.25 * s, 0.25 * s, 0.25 * s, px, py - 0.2 * s, pz, PALETTE.woodDark));
  return parts;
}
