import * as THREE from 'three';
import { hexKey } from '@grog/hex.js';
import { TILE_TYPES } from '@grog/mapGenerator.js';
import { PALETTE } from '../palette.js';
import { patchFog, replaceOnce, CLOUD_GLSL, CLOUD_UNIFORMS, SURFACE_UNIFORMS } from '../util/geo.js';
import { hexToWorld, worldToHex } from '../world.js';
import { SUN_DIR } from '../render/scene.js';

// The sea.
//
// One sheet over the whole map, physically lit, transparent where it is shallow. What it looks
// like at any point comes from three things:
//
//   - Depth, read from the height field's texture (art/heightfield.js): the water is clear over
//     the sand at the shore, turquoise on the shelf, and goes to the tile's own deep colour (the
//     2D game's shallow / ocean / deep ramp, so the shipping lanes still read) as the bottom falls
//     away. Foam laps where the depth runs out.
//   - Its surface: a few crossing swells move the vertices; the fragment shader adds several
//     octaves of travelling ripple to the normal, so the sun breaks into glitter and the sky's
//     reflection moves.
//   - The sky: a Fresnel term mixes in the sky dome's own gradient along the reflected ray.
//
// It stays a MeshStandardMaterial underneath, so the sun's specular, the ships' shadows, the
// distance haze and the fog of war all come from the same code as everything else.

export const WATER_UNIFORMS = {
  uTime: { value: 0 },
  tHeight: { value: null },
  uHOrigin: { value: new THREE.Vector2() },
  uHSize: { value: new THREE.Vector2(1, 1) },
  uShallow: { value: new THREE.Color(PALETTE.lagoon) },
  uFoam: { value: new THREE.Color(PALETTE.foam) },
  uSkyTop: { value: new THREE.Color(PALETTE.skyTop) },
  uSkyBottom: { value: new THREE.Color(PALETTE.skyBottom) },
  uSunDir: { value: SUN_DIR.clone() },
  uSunColor: { value: new THREE.Color(PALETTE.sun) },
};

const LATTICE = 4.0;
const MARGIN = 90;
const AX = [[0, 0], [1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1]];

const TIER = {
  [TILE_TYPES.DEEP_OCEAN]: new THREE.Color(PALETTE.deep),
  [TILE_TYPES.OCEAN]: new THREE.Color(PALETTE.ocean),
  [TILE_TYPES.SHALLOW]: new THREE.Color(PALETTE.shallow),
  [TILE_TYPES.LAND]: new THREE.Color(PALETTE.shallow),
};
const DEEP = new THREE.Color(PALETTE.deep);

/** The deep-water colour at a point: the tiles around it, blended, so tiers meet without a hex edge. */
function tierColor(map, x, z, out) {
  const h = worldToHex(x, z);
  let r = 0, g = 0, b = 0, ws = 0;
  for (const [dq, dr] of AX) {
    const c = hexToWorld(h.q + dq, h.r + dr);
    const d2 = ((x - c.x) ** 2 + (z - c.z) ** 2) / 81;
    if (d2 >= 1) continue;
    const w = (1 - d2) * (1 - d2);
    const t = map.tiles.get(hexKey(h.q + dq, h.r + dr));
    const col = t ? TIER[t.type] || DEEP : DEEP;
    r += col.r * w; g += col.g * w; b += col.b * w; ws += w;
  }
  return ws ? out.setRGB(r / ws, g / ws, b / ws) : out.copy(DEEP);
}

const WATER_PARS = /* glsl */ `
uniform float uTime;
uniform sampler2D tHeight;
uniform vec2 uHOrigin;
uniform vec2 uHSize;
varying vec3 vWaterPos;
float seaDepth(vec2 w) { return -texture2D(tHeight, (w - uHOrigin) / uHSize).r; }
// Height and slope of the long swells, shared by the vertex and fragment stages.
vec3 swell(vec2 p, float t) {
  vec3 o = vec3(0.0);
  vec2 d; float k, a, ph;
  d = vec2(0.86, 0.5);  k = 0.19; a = 0.11; ph = dot(p, d) * k + t * 0.9;  o += vec3(a * sin(ph), a * k * cos(ph) * d);
  d = vec2(-0.3, 0.95); k = 0.31; a = 0.07; ph = dot(p, d) * k + t * 1.25; o += vec3(a * sin(ph), a * k * cos(ph) * d);
  d = vec2(0.6, -0.8);  k = 0.47; a = 0.04; ph = dot(p, d) * k + t * 1.7;  o += vec3(a * sin(ph), a * k * cos(ph) * d);
  return o;
}
`;

const WATER_FRAGMENT_PARS = /* glsl */ `
${CLOUD_GLSL}
// Caustics: the bright web sunlight draws on a shallow floor. One noise warped by another, folded
// about its middle so the ridges come out as thin lines.
float wNoise(vec2 p);
float caustic(vec2 p, float t) {
  float a = wNoise(p * 0.6 + t * 0.2);
  float b = wNoise(p * 1.1 - t * 0.24 + a * 1.4);
  float c = wNoise(p * 1.9 + t * 0.28 - a * 1.0);
  float v = (1.0 - abs(2.0 * b - 1.0)) * (0.55 + 0.45 * (1.0 - abs(2.0 * c - 1.0)));
  return pow(v, 7.0);
}
uniform vec3 uShallow;
uniform vec3 uFoam;
uniform vec3 uSkyTop;
uniform vec3 uSkyBottom;
uniform vec3 uSunDir;
uniform vec3 uSunColor;
// Sine-free hash: the sine one loses its low bits a few hundred units from the origin and goes blocky.
float wHash(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float wNoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(wHash(i), wHash(i + vec2(1.0, 0.0)), f.x), mix(wHash(i + vec2(0.0, 1.0)), wHash(i + vec2(1.0, 1.0)), f.x), f.y);
}
// Slope of the ripples: travelling sines at several scales, bent by noise so they never line up.
vec2 ripple(vec2 p, float t) {
  vec2 g = vec2(0.0);
  vec2 warp = vec2(wNoise(p * 0.21 + t * 0.05), wNoise(p * 0.21 + 9.0 - t * 0.04)) * 3.0;
  vec2 q = p + warp;
  vec2 d; float k, a;
  d = vec2(0.9, 0.44);   k = 1.1; a = 0.085; g += d * a * cos(dot(q, d) * k + t * 1.6);
  d = vec2(-0.5, 0.87);  k = 1.7; a = 0.07;  g += d * a * cos(dot(q, d) * k + t * 2.1);
  d = vec2(0.34, -0.94); k = 2.9; a = 0.06;  g += d * a * cos(dot(q, d) * k + t * 2.8);
  d = vec2(-0.97, -0.24); k = 4.7; a = 0.05; g += d * a * cos(dot(q, d) * k + t * 3.6);
  d = vec2(0.71, 0.71);  k = 7.9; a = 0.04;  g += d * a * cos(dot(q, d) * k + t * 4.9);
  return g;
}
`;

export function buildWater(map, bounds, field = null) {
  const minX = bounds.minX - MARGIN, maxX = bounds.maxX + MARGIN;
  const minZ = bounds.minZ - MARGIN, maxZ = bounds.maxZ + MARGIN;
  const cols = Math.ceil((maxX - minX) / LATTICE) + 1;
  const rows = Math.ceil((maxZ - minZ) / LATTICE) + 1;
  const pos = new Float32Array(cols * rows * 3);
  const col = new Float32Array(cols * rows * 3);
  const c = new THREE.Color();
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < cols; i++) {
      const k = (j * cols + i) * 3;
      const x = minX + i * LATTICE, z = minZ + j * LATTICE;
      pos[k] = x; pos[k + 1] = 0; pos[k + 2] = z;
      tierColor(map, x, z, c);
      col[k] = c.r; col[k + 1] = c.g; col[k + 2] = c.b;
    }
  }
  const idx = new Uint32Array((cols - 1) * (rows - 1) * 6);
  let n = 0;
  for (let j = 0; j < rows - 1; j++) {
    for (let i = 0; i < cols - 1; i++) {
      const a = j * cols + i, b = a + 1, d = a + cols, e = d + 1;
      // Counter-clockwise seen from +Y (z grows down-screen), so the faces point up.
      idx[n++] = a; idx[n++] = d; idx[n++] = b; idx[n++] = b; idx[n++] = d; idx[n++] = e;
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.setIndex(new THREE.BufferAttribute(idx, 1));
  geo.computeVertexNormals();

  if (field) {
    WATER_UNIFORMS.tHeight.value = field.texture;
    WATER_UNIFORMS.uHOrigin.value.copy(field.origin);
    WATER_UNIFORMS.uHSize.value.copy(field.size);
  } else if (!WATER_UNIFORMS.tHeight.value) {
    // No height field (the check suite, the gallery): open sea everywhere.
    const t = new THREE.DataTexture(new Float32Array([-5]), 1, 1, THREE.RedFormat, THREE.FloatType);
    t.needsUpdate = true;
    WATER_UNIFORMS.tHeight.value = t;
  }

  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.16, metalness: 0, transparent: true });
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, WATER_UNIFORMS);
    shader.uniforms.uCloudTime = SURFACE_UNIFORMS.uTime;
    shader.uniforms.uCloud = CLOUD_UNIFORMS.uCloud;
    shader.vertexShader = replaceOnce(shader.vertexShader, '#include <common>', `#include <common>\n${WATER_PARS}`);
    shader.vertexShader = replaceOnce(shader.vertexShader, '#include <begin_vertex>', `#include <begin_vertex>
// The swell dies away over the shelf, so the sea never climbs a beach.
float wCalm = smoothstep(0.1, 2.2, seaDepth(position.xz));
transformed.y += swell(position.xz, uTime).x * wCalm;
vWaterPos = transformed;`);
    shader.fragmentShader = replaceOnce(shader.fragmentShader, '#include <common>', `#include <common>\n${WATER_PARS}\n${WATER_FRAGMENT_PARS}`);
    shader.fragmentShader = replaceOnce(shader.fragmentShader, '#include <color_fragment>', `#include <color_fragment>
vec2 wp = vWaterPos.xz;
float wDepth = seaDepth(wp);
float wCalm = smoothstep(0.1, 2.2, wDepth);
// Surface normal in world space: swell slope plus ripple slope, calmer in the shallows.
vec2 wSlope = swell(wp, uTime).yz * wCalm + ripple(wp, uTime) * (0.35 + 0.65 * wCalm);
vec3 wN = normalize(vec3(-wSlope.x, 1.0, -wSlope.y));
// Colour by depth: clear, then lagoon, then the tile's deep colour.
vec3 wDeep = diffuseColor.rgb;
float wAbs = 1.0 - exp(-max(wDepth, 0.0) * 0.95);
diffuseColor.rgb = mix(uShallow, wDeep, wAbs);
diffuseColor.rgb *= 0.92 + 0.16 * wNoise(wp * 0.08 + uTime * 0.01);
// Opaque by two units down: the sea floor mesh stops at the shelf, and past it there is only sky behind.
float wAlpha = clamp((1.0 - exp(-max(wDepth, 0.0) * 1.5)) * 1.07, 0.0, 1.0);
// Foam: a wash at the waterline, then two bands of surf rolling in behind it, broken up by noise.
float wBreak = wNoise(wp * 1.3 + uTime * 0.15) * 0.6 + wNoise(wp * 3.7 - uTime * 0.2) * 0.4;
float wEdge = smoothstep(0.34, 0.02, wDepth) * smoothstep(-0.25, 0.0, wDepth);
float wSurf = smoothstep(0.8, 1.0, sin(wDepth * 7.5 + uTime * 1.5 + wBreak * 2.0)) * smoothstep(1.0, 0.15, wDepth) * smoothstep(-0.05, 0.1, wDepth);
float wCaps = 0.0;
float wFoam = clamp(max(wEdge * (0.55 + 0.6 * wBreak), wSurf * wBreak * 1.1) + wCaps, 0.0, 1.0);
diffuseColor.rgb = mix(diffuseColor.rgb, uFoam, wFoam);
diffuseColor.a = max(wAlpha, wFoam);
float wCloud = cloudCover(wp);
diffuseColor.rgb *= mix(vec3(1.0), vec3(0.55, 0.62, 0.76), wCloud);
// Caustics over the shelf: strongest in a hand's depth of water, gone by the drop-off.
float wCaustic = caustic(wp, uTime) * smoothstep(0.05, 0.4, wDepth) * smoothstep(1.5, 0.45, wDepth) * (1.0 - wFoam) * (1.0 - wCloud);
if (wDepth < -0.3) discard;`);
    shader.fragmentShader = replaceOnce(shader.fragmentShader, '#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
roughnessFactor = mix(0.14, 0.9, wFoam);`);
    shader.fragmentShader = replaceOnce(shader.fragmentShader, '#include <normal_fragment_maps>', `#include <normal_fragment_maps>
normal = normalize((viewMatrix * vec4(wN, 0.0)).xyz);`);
    shader.fragmentShader = replaceOnce(shader.fragmentShader, '#include <emissivemap_fragment>', `#include <emissivemap_fragment>
{
  // Sky reflection. The view never turns, so the eye vector is the camera's own axis.
  vec3 wV = normalize((vec4(0.0, 0.0, 1.0, 0.0) * viewMatrix).xyz);
  vec3 wR = reflect(-wV, wN);
  float wF = 0.03 + 0.97 * pow(1.0 - clamp(dot(wN, wV), 0.0, 1.0), 4.0);
  vec3 wSky = mix(uSkyBottom, uSkyTop, pow(clamp(wR.y, 0.0, 1.0), 0.6));
  // Glitter: the sun's reflection, sharpened far past what the lit specular gives.
  float wSun = pow(max(dot(wR, uSunDir), 0.0), 220.0) * 6.0 + pow(max(dot(wR, uSunDir), 0.0), 24.0) * 0.25;
  wSun *= 1.0 - wCloud;
  totalEmissiveRadiance += (wSky * wF * 0.45 + uSunColor * wSun) * (1.0 - wFoam) + uSunColor * wCaustic * 0.2;
  diffuseColor.a = max(diffuseColor.a, clamp(wF * 1.5 + wSun + wCaustic * 0.3, 0.0, 1.0));
}`);
  };
  patchFog(mat, 'water');
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = 'water';
  mesh.receiveShadow = true;
  mesh.renderOrder = -1;      // first of the transparent things, so wakes and markers draw over it
  return mesh;
}
