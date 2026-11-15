import * as THREE from 'three';
import { hexKey, hexNeighbors } from '@grog/hex.js';
import { isWater, TILE_TYPES } from '@grog/mapGenerator.js';
import { PALETTE } from '../palette.js';
import { bakeColors, patchFog, replaceOnce } from '../util/geo.js';
import { hexToWorld, worldToHex, HEX_R } from '../world.js';

// The sea: one triangle-lattice sheet over the whole map plus a margin, coloured per vertex by the
// tile under it (deep → ocean → shallow → shoal → foam at the beach) and rolled by a vertex-shader
// swell. Flat shading turns the swell into the faceted low-poly sea; the colours are the 2D game's
// depth tiers, so the shipping lanes read the same as they always did.
//
// This is *not* sim-taxi's river shader, and on purpose: that one is a shelf-and-channel effect
// measured off a river outline (absorption, caustics, Fresnel against a two-unit wall). Grog's sea
// has no walls and is seen from high up over hundreds of units, where the thing that reads is the
// depth colour and the facets catching the sun. The uniform-bag pattern is the same, so the fog
// patch rides along.

export const WATER_UNIFORMS = {
  uTime: { value: 0 },
};

const LATTICE = 3.2;   // triangle edge, world units — ~10px at default zoom, small enough to roll
const MARGIN = 70;

function tileColor(tile, map) {
  if (!tile) return new THREE.Color(PALETTE.deep);
  if (tile.type === TILE_TYPES.DEEP_OCEAN) return new THREE.Color(PALETTE.deep);
  if (tile.type === TILE_TYPES.OCEAN) return new THREE.Color(PALETTE.ocean);
  if (tile.type === TILE_TYPES.SHALLOW) return new THREE.Color(PALETTE.shallow);
  return new THREE.Color(PALETTE.shoal); // under land — only its rim ever shows
}

export function buildWater(map, bounds) {
  const minX = bounds.minX - MARGIN;
  const maxX = bounds.maxX + MARGIN;
  const minZ = bounds.minZ - MARGIN;
  const maxZ = bounds.maxZ + MARGIN;
  const rowH = LATTICE * Math.sqrt(3) / 2;
  const cols = Math.ceil((maxX - minX) / LATTICE) + 2;
  const rows = Math.ceil((maxZ - minZ) / rowH) + 1;

  // Colour each lattice point once, then emit triangles from the grid.
  const shoalCol = new THREE.Color(PALETTE.shoal);
  const foamCol = new THREE.Color(PALETTE.foam);
  const pts = new Array(rows);
  for (let j = 0; j < rows; j++) {
    pts[j] = new Array(cols);
    const z = minZ + j * rowH;
    const off = (j % 2) * LATTICE * 0.5;
    for (let i = 0; i < cols; i++) {
      const x = minX + i * LATTICE + off;
      const h = worldToHex(x, z);
      const tile = map.tiles.get(hexKey(h.q, h.r));
      let c = tileColor(tile, map);
      if (tile && isWater(tile)) {
        // Distance to the nearest land hex centre among the neighbours → shoal and foam bands.
        let near = Infinity;
        for (const n of hexNeighbors(h.q, h.r)) {
          const nt = map.tiles.get(hexKey(n.q, n.r));
          if (nt && nt.type === TILE_TYPES.LAND) {
            const p = hexToWorld(n.q, n.r);
            near = Math.min(near, Math.hypot(p.x - x, p.z - z));
          }
        }
        if (near < HEX_R * 2) {
          const t = THREE.MathUtils.clamp((HEX_R * 2 - near) / (HEX_R * 0.9), 0, 1);
          c = c.clone().lerp(shoalCol, t * 0.85);
          if (near < HEX_R * 1.22) c = c.clone().lerp(foamCol, 0.75);
        }
      }
      pts[j][i] = { x, z, c };
    }
  }

  const tris = (rows - 1) * (cols - 1) * 2;
  const pos = new Float32Array(tris * 9);
  const col = new Float32Array(tris * 9);
  let k = 0;
  const put = (p) => {
    pos[k] = p.x; pos[k + 1] = 0; pos[k + 2] = p.z;
    col[k] = p.c.r; col[k + 1] = p.c.g; col[k + 2] = p.c.b;
    k += 3;
  };
  for (let j = 0; j < rows - 1; j++) {
    const even = j % 2 === 0;
    for (let i = 0; i < cols - 1; i++) {
      const a = pts[j][i], b = pts[j][i + 1], c = pts[j + 1][i], d = pts[j + 1][i + 1];
      // Wound counter-clockwise seen from +Y (z grows down-screen), so the faces point up.
      if (even) { put(a); put(c); put(b); put(b); put(c); put(d); }
      else { put(a); put(d); put(b); put(a); put(c); put(d); }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const geo = bakeColors(g, col);

  const mat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
  const prev = (shader) => {
    shader.uniforms.uTime = WATER_UNIFORMS.uTime;
    shader.vertexShader = replaceOnce(shader.vertexShader, '#include <common>', `#include <common>
uniform float uTime;
float grogSwell(vec2 p) {
  return sin(p.x * 0.21 + uTime * 1.1) * 0.16
       + sin(p.y * 0.17 - uTime * 0.9 + p.x * 0.05) * 0.14
       + sin((p.x + p.y) * 0.43 + uTime * 1.7) * 0.06;
}`);
    shader.vertexShader = replaceOnce(shader.vertexShader, '#include <begin_vertex>', `#include <begin_vertex>
transformed.y += grogSwell(position.xz);`);
  };
  mat.onBeforeCompile = prev;
  patchFog(mat, 'water');
  // patchFog chains the swell patch before its own; its cache key covers both.
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = 'water';
  mesh.receiveShadow = true;
  return mesh;
}
