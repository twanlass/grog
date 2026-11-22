import * as THREE from 'three';
import { hexKey, hexNeighbors } from '@grog/hex.js';
import { isWater, TILE_TYPES } from '@grog/mapGenerator.js';
import { hexToWorld, worldToHex, HEX_R, BEACH_Y, LAND_STEP, LAND_MAX_RINGS } from '../world.js';

// The shape of the world as one continuous height function, built from nothing but Grog's tiles.
//
// The sim only knows land/shallow/ocean/deep per hex, and the first cut drew exactly that: a flat
// prism per hex, a step per ring inland. Here every hex contributes a *level* — its pad height if
// it is land, a seabed depth by distance from shore if it is water — and the ground is the smooth
// blend of the levels around a point, roughened by noise. Three things are kept on purpose:
//
//   - Each land hex is flat near its centre, at exactly `tileTop`. Buildings stand on hex centres,
//     so the pad is where they sit level; the slopes and the noise are between pads.
//   - The shoreline falls a little outside the land hexes' edges, so a pier built from a coast
//     hex's centre reaches the water.
//   - Nothing here feeds back into the sim. It is a look.
//
// The same function is baked into a texture the sea samples for depth (absorption, foam, the
// shallows), so the water and the ground under it always agree.

const AX = [[1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1]];
const KERNEL = 8;                 // world units; under 2·HEX_R so the 7-hex set is always enough
const SEABED_BY_RING = [0, -0.55, -1.7, -3.0, -4.6];
export const DEEP = -4.6;

/** Rings from the sea for every land tile (1 = coast). */
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

/** Top height of a land tile's pad. The one number units, markers and terrain all agree on. */
export function tileTop(tile, rings) {
  if (!tile) return DEEP;
  if (tile.type !== TILE_TYPES.LAND) return -1;
  const ring = rings.get(hexKey(tile.q, tile.r)) || 1;
  return BEACH_Y + Math.min(ring - 1, LAND_MAX_RINGS) * LAND_STEP;
}

// Value noise on a hashed lattice — the CPU twin of the shaders' gNoise.
function hash(ix, iz) {
  const s = Math.sin(ix * 127.1 + iz * 311.7) * 43758.5453;
  return s - Math.floor(s);
}
export function noise2(x, z) {
  const ix = Math.floor(x), iz = Math.floor(z);
  let fx = x - ix, fz = z - iz;
  fx = fx * fx * (3 - 2 * fx); fz = fz * fz * (3 - 2 * fz);
  const a = hash(ix, iz), b = hash(ix + 1, iz), c = hash(ix, iz + 1), d = hash(ix + 1, iz + 1);
  return a + (b - a) * fx + (c - a) * fz + (a - b - c + d) * fx * fz;
}
export function fbm2(x, z) {
  return noise2(x, z) * 0.55 + noise2(x * 2.3 + 7.1, z * 2.3 + 1.7) * 0.3 + noise2(x * 5.1 + 3.7, z * 5.1 + 9.2) * 0.15;
}

const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

export function createHeightField(map, bounds) {
  const rings = landRings(map);
  const W = map.width, Hh = map.height;
  // Levels in Grog's offset layout (col = q + floor(r/2), row = r) — no string keys in the hot loop.
  const level = new Float32Array(W * Hh).fill(DEEP);
  const isLand = new Uint8Array(W * Hh);
  const ringOf = new Uint8Array(W * Hh);       // land ring, or water ring from shore (capped at 4)
  const idx = (q, r) => {
    const col = q + Math.floor(r / 2);
    return (r < 0 || r >= Hh || col < 0 || col >= W) ? -1 : r * W + col;
  };
  let frontier = [];
  for (const t of map.tiles.values()) {
    const i = idx(t.q, t.r);
    if (i < 0) continue;
    if (t.type === TILE_TYPES.LAND) {
      isLand[i] = 1;
      ringOf[i] = Math.min(255, rings.get(hexKey(t.q, t.r)) || 1);
      level[i] = tileTop(t, rings);
      frontier.push([t.q, t.r]);
    }
  }
  // Water rings outward from the shore: the shelf drops in steps, then falls away.
  for (let ring = 1; ring <= 4 && frontier.length; ring++) {
    const next = [];
    for (const [q, r] of frontier) {
      for (const [dq, dr] of AX) {
        const i = idx(q + dq, r + dr);
        if (i < 0 || isLand[i] || ringOf[i]) continue;
        ringOf[i] = ring;
        level[i] = SEABED_BY_RING[ring];
        next.push([q + dq, r + dr]);
      }
    }
    frontier = next;
  }

  /** Is anything interesting (land or shelf) within a hex of this point? Cheap prefilter. */
  function nearShore(x, z) {
    const h = worldToHex(x, z);
    const i = idx(h.q, h.r);
    return i >= 0 && (isLand[i] || ringOf[i] > 0);
  }

  function heightAt(x, z) {
    const h = worldToHex(x, z);
    const i0 = idx(h.q, h.r);
    let sum = 0, wsum = 0;
    const c0 = hexToWorld(h.q, h.r);
    const d0 = Math.hypot(x - c0.x, z - c0.z);
    const acc = (i, cx, cz) => {
      const d2 = ((x - cx) ** 2 + (z - cz) ** 2) / (KERNEL * KERNEL);
      if (d2 >= 1) return;
      const w = (1 - d2) * (1 - d2);
      sum += w * (i < 0 ? DEEP : level[i]); wsum += w;
    };
    acc(i0, c0.x, c0.z);
    for (const [dq, dr] of AX) {
      const c = hexToWorld(h.q + dq, h.r + dr);
      acc(idx(h.q + dq, h.r + dr), c.x, c.z);
    }
    let f = sum / wsum;
    // A wandering shoreline: push the blended field about before it is read as height.
    const coast = smooth(1.6, 0.0, Math.abs(f));
    f += (fbm2(x * 0.22, z * 0.22) - 0.5) * 0.9 * coast;
    if (i0 >= 0 && isLand[i0]) {
      const pad = 1 - smooth(HEX_R * 0.4, HEX_R * 0.86, d0);
      const hills = (fbm2(x * 0.16 + 40, z * 0.16) - 0.5) * 1.1 * smooth(0.5, 1.6, f) + (noise2(x * 0.9, z * 0.9) - 0.5) * 0.12 * smooth(0.3, 0.9, f);
      return (f + hills) * (1 - pad) + level[i0] * pad;
    }
    return f + (fbm2(x * 0.3, z * 0.3 + 20) - 0.5) * 0.25 * smooth(-3, -0.3, f);
  }

  // Bake to a texture for the sea: 1 texel per TEXEL world units, linear filtered.
  const TEXEL = 1.25;
  const M = 6;
  const tx0 = bounds.minX - M, tz0 = bounds.minZ - M;
  const tw = Math.ceil((bounds.maxX - bounds.minX + 2 * M) / TEXEL);
  const th = Math.ceil((bounds.maxZ - bounds.minZ + 2 * M) / TEXEL);
  const data = new Uint16Array(tw * th);
  const deepHalf = THREE.DataUtils.toHalfFloat(DEEP);
  for (let j = 0; j < th; j++) {
    const z = tz0 + (j + 0.5) * TEXEL;
    for (let i = 0; i < tw; i++) {
      const x = tx0 + (i + 0.5) * TEXEL;
      data[j * tw + i] = nearShore(x, z) ? THREE.DataUtils.toHalfFloat(heightAt(x, z)) : deepHalf;
    }
  }
  const texture = new THREE.DataTexture(data, tw, th, THREE.RedFormat, THREE.HalfFloatType);
  texture.magFilter = texture.minFilter = THREE.LinearFilter;
  texture.wrapS = texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.needsUpdate = true;

  return {
    rings, heightAt, nearShore, texture,
    /** world (x, z) → texture uv is (xz - origin) / size. */
    origin: new THREE.Vector2(tx0, tz0), size: new THREE.Vector2(tw * TEXEL, th * TEXEL),
    ringAt(q, r) { const i = idx(q, r); return i < 0 ? 0 : (isLand[i] ? ringOf[i] : -ringOf[i]); },
  };
}
