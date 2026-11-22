import * as THREE from 'three';
import { hexKey } from '@grog/hex.js';
import { isHexExplored } from '@grog/fogOfWar.js';
import { TILE_TYPES } from '@grog/mapGenerator.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { bakeColor, propMaterial, replaceOnce, SURFACE_UNIFORMS } from '../util/geo.js';
import { hexToWorld, worldToHex } from '../world.js';
import { makeRng } from '../util/rng.js';

// Gulls. Grog's 2D game circles one bird over the home port; here small flocks wheel over the
// coasts, one of them over home. They are scenery: nothing in the sim knows about them.
//
// One InstancedMesh. The wingbeat is in the vertex shader — each wing vertex carries how far out
// along the wing it is (`flap`), each instance a phase — so the CPU only moves 40 matrices. A gull
// flaps in bursts and glides between them, which is what the slow second sine is for.

const PER_FLOCK = 5;
const MAX_FLOCKS = 8;

function gullGeometry() {
  const white = '#F4F4EE', grey = '#9AA3AD', dark = '#3B4048';
  const tri = (pts, col, flap) => {
    const g = new THREE.BufferGeometry();
    // Each triangle twice, once wound each way: front-facing from above and from below, so the
    // up-pointing normal below is never flipped by a double-sided material.
    g.setAttribute('position', new THREE.Float32BufferAttribute([...pts.flat(), ...[pts[0], pts[2], pts[1]].flat()], 3));
    g.computeVertexNormals();
    bakeColor(g, col);
    g.setAttribute('flap', new THREE.Float32BufferAttribute([...flap, flap[0], flap[2], flap[1]], 1));
    return g;
  };
  const parts = [
    // Body: a flat dart, nose on +X.
    tri([[0.34, 0, 0], [-0.3, 0, 0.07], [-0.3, 0, -0.07]], white, [0, 0, 0]),
    tri([[-0.3, 0, 0.07], [-0.46, 0, 0], [-0.3, 0, -0.07]], grey, [0, 0, 0]),
  ];
  for (const s of [1, -1]) {
    // Inner wing, then the swept grey hand with a dark tip.
    parts.push(tri([[0.12, 0, 0], [-0.12, 0, 0], [0.02, 0, 0.36 * s]], white, [0, 0, 0.36]));
    parts.push(tri([[-0.12, 0, 0], [-0.1, 0, 0.36 * s], [0.02, 0, 0.36 * s]], white, [0, 0.36, 0.36]));
    parts.push(tri([[0.02, 0, 0.36 * s], [-0.1, 0, 0.36 * s], [-0.2, 0, 0.74 * s]], grey, [0.36, 0.36, 0.74]));
    parts.push(tri([[-0.14, 0, 0.6 * s], [-0.2, 0, 0.74 * s], [-0.17, 0, 0.6 * s]], dark, [0.6, 0.74, 0.6]));
  }
  const merged = mergeGeometries(parts);
  // Every normal up, so both wings and both faces light alike.
  const n = merged.attributes.normal;
  for (let i = 0; i < n.count; i++) n.setXYZ(i, 0, 1, 0);
  return merged;
}

export function createBirds(parent, map, rings, homeHex = null) {
  const rng = makeRng(0xb12d);
  // Flock centres: coastal land hexes, spread out; home first.
  const coast = [];
  for (const t of map.tiles.values()) {
    if (t.type === TILE_TYPES.LAND && (rings.get(hexKey(t.q, t.r)) || 0) === 1) coast.push(t);
  }
  const centres = [];
  if (homeHex) centres.push(hexToWorld(homeHex.q, homeHex.r));
  for (let tries = 0; tries < 200 && centres.length < MAX_FLOCKS && coast.length; tries++) {
    const t = rng.pick(coast);
    const c = hexToWorld(t.q, t.r);
    if (centres.every((o) => Math.hypot(o.x - c.x, o.z - c.z) > 45)) centres.push(c);
  }

  const count = centres.length * PER_FLOCK;
  const geometry = gullGeometry();
  const phase = new Float32Array(Math.max(1, count));
  const birds = [];
  for (const c of centres) {
    const dir = rng.chance(0.5) ? 1 : -1;
    for (let i = 0; i < PER_FLOCK; i++) {
      phase[birds.length] = rng.range(0, 6.283);
      birds.push({
        cx: c.x + rng.range(-3, 3), cz: c.z + rng.range(-3, 3),
        r: rng.range(5, 11), a: rng.range(0, 6.283), w: dir * rng.range(0.16, 0.3),
        y: rng.range(6.5, 10), bob: rng.range(0, 6.283), size: rng.range(1.2, 1.6),
      });
    }
  }
  geometry.setAttribute('phase', new THREE.InstancedBufferAttribute(phase, 1));

  const material = propMaterial({ smooth: true, key: 'birds' });
  const base = material.onBeforeCompile;
  material.onBeforeCompile = (shader, renderer) => {
    base?.(shader, renderer);
    shader.uniforms.uBirdTime = SURFACE_UNIFORMS.uTime;
    shader.vertexShader = replaceOnce(shader.vertexShader, '#include <common>', '#include <common>\nattribute float flap;\nattribute float phase;\nuniform float uBirdTime;');
    shader.vertexShader = replaceOnce(shader.vertexShader, '#include <begin_vertex>', `#include <begin_vertex>
{
  float burst = smoothstep(-0.2, 0.5, sin(uBirdTime * 0.55 + phase * 3.0));
  float beat = sin(uBirdTime * 9.0 + phase);
  // Gliding wings are held a little above level; flapping swings through it.
  transformed.y += flap * (0.22 + beat * 0.75 * burst) * (0.6 + flap);
}`);
  };
  const baseKey = material.customProgramCacheKey?.bind(material);
  material.customProgramCacheKey = () => `${baseKey ? baseKey() : ''}-birds`;

  const mesh = new THREE.InstancedMesh(geometry, material, Math.max(1, count));
  mesh.name = 'birds';
  mesh.count = count;
  mesh.frustumCulled = false;       // they move; three computes an instanced bounding sphere once
  mesh.castShadow = true;
  mesh.userData.noAO = true;
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  parent.add(mesh);

  const dummy = new THREE.Object3D();
  dummy.rotation.order = 'YXZ';
  return {
    mesh,
    update(fogState, time) {
      for (let i = 0; i < birds.length; i++) {
        const b = birds[i];
        const a = b.a + b.w * time;
        const r = b.r + Math.sin(time * 0.21 + b.bob) * 1.6;
        const x = b.cx + Math.cos(a) * r, z = b.cz + Math.sin(a) * r;
        const h = worldToHex(x, z);
        const shown = !fogState || fogState.debugHideFog || isHexExplored(fogState, h.q, h.r);
        dummy.position.set(x, b.y + Math.sin(time * 0.5 + b.bob) * 0.7, z);
        // Tangent to the circle; +X is the nose, and rotation.y turns +X toward -Z.
        const vx = -Math.sin(a) * Math.sign(b.w), vz = Math.cos(a) * Math.sign(b.w);
        dummy.rotation.set(-Math.sign(b.w) * 0.32, Math.atan2(-vz, vx), 0);
        dummy.scale.setScalar(shown ? b.size : 0);
        dummy.updateMatrix();
        mesh.setMatrixAt(i, dummy.matrix);
      }
      mesh.instanceMatrix.needsUpdate = true;
    },
  };
}
