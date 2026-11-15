import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// The low-poly toolkit, carried over from sim-taxi (src/util/geo.js). The look is the same three
// things there:
//
//   1. Non-indexed geometry + `flatShading`, so every facet keeps its own hard edge.
//   2. Colour baked into a vertex attribute (`bakeColor`), so hundreds of parts with dozens of
//      colours merge into ONE mesh with ONE material.
//   3. Jitter keyed on vertex *position*, not index, so non-indexed solids stay welded.
//
// What is left behind on purpose: sim-taxi's SSAO, bloom, gloss, crayon and cartoon patches. They
// are ~2000 lines tuned against a city under one fixed sun, and none of them is what makes the
// look; they can come across later, one at a time, if the islands want them.
//
// What is added: the fog-of-war patch (`FOG_UNIFORMS`), because in 3D a flat fog sheet laid over
// the map would not line up with anything taller than the sea — under a tilted camera a sheet at
// any height projects off the hexes beneath it. So fog is applied *per surface*, by looking up the
// hex under each fragment's world position, which is right for a wave crest, a cliff and a mast
// alike.

/**
 * Non-indexed, one baked colour, no uv. Same contract as sim-taxi's: anything that will be merged
 * goes through here (or `bakeColors`) first, because mergeGeometries needs identical attribute sets.
 */
export function bakeColor(geometry, colorInput) {
  const geo = geometry.index ? geometry.toNonIndexed() : geometry;
  const c = colorInput instanceof THREE.Color ? colorInput : new THREE.Color(colorInput);
  const count = geo.attributes.position.count;
  const colors = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    colors[i * 3] = c.r;
    colors[i * 3 + 1] = c.g;
    colors[i * 3 + 2] = c.b;
  }
  return bakeColors(geo, colors);
}

/**
 * The same with a colour per vertex. `flatShading` only reaches the *normal* (a screen-space
 * derivative); `vColor` still interpolates, so a gradient across a facet costs nothing.
 */
export function bakeColors(geometry, colors) {
  const geo = geometry.index ? geometry.toNonIndexed() : geometry;
  for (const name of Object.keys(geo.attributes)) {
    if (name !== 'position' && name !== 'normal') geo.deleteAttribute(name);
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.computeVertexNormals();
  return geo;
}

/**
 * Displace every vertex by an offset keyed on its position. Keying on index tears a non-indexed
 * solid open (sim-taxi's tree canopies did exactly that); keying on position keeps it welded.
 */
export function jitterVertices(geometry, rng, amount, { y = 1 } = {}) {
  const pos = geometry.attributes.position;
  const offsets = new Map();
  const key = (x, yy, z) => `${x.toFixed(4)},${yy.toFixed(4)},${z.toFixed(4)}`;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const yy = pos.getY(i);
    const z = pos.getZ(i);
    const id = key(x, yy, z);
    let o = offsets.get(id);
    if (!o) {
      o = [rng.jitter(amount), rng.jitter(amount) * y, rng.jitter(amount)];
      offsets.set(id, o);
    }
    pos.setXYZ(i, x + o[0], yy + o[1], z + o[2]);
  }
  pos.needsUpdate = true;
  geometry.computeVertexNormals();
  return geometry;
}

/** Deterministic 0..1 hash of a ground position — variety that spends no rng draw. */
export function hash01(x, z) {
  const s = Math.sin(x * 12.9898 + z * 78.233) * 43758.5453;
  return s - Math.floor(s);
}

/** Merge baked parts. Throws on an empty list rather than handing back null to crash later. */
export function merge(parts) {
  if (!parts.length) throw new Error('merge: no parts');
  const geo = mergeGeometries(parts, false);
  if (!geo) throw new Error('merge: attribute mismatch — was every part baked?');
  return geo;
}

// --- Part builders -----------------------------------------------------------------------------
// The boxes-and-cylinders vocabulary every model here is written in. Each returns a baked,
// non-indexed geometry ready for `merge`. A box cannot be built inside out, which is why hulls and
// roofs are made by moving a box's vertices rather than by hand-winding triangles (sim-taxi's
// roadworks ramp and bridge deck both shipped wound backwards).

/** Box `w×h×d` whose base is centred on (x, y, z). */
export function box(w, h, d, x, y, z, col, { segX = 1, segY = 1, segZ = 1 } = {}) {
  const g = new THREE.BoxGeometry(w, h, d, segX, segY, segZ);
  g.translate(x, y + h / 2, z);
  return bakeColor(g, col);
}

/** Upright cylinder (or cone when rTop is 0) whose base is centred on (x, y, z). */
export function cyl(rTop, rBot, h, x, y, z, col, sides = 8) {
  const g = new THREE.CylinderGeometry(rTop, rBot, h, sides);
  g.translate(x, y + h / 2, z);
  return bakeColor(g, col);
}

/** A thin square rod from `a` to `b`. Rotation preserves winding. */
export function rod(a, b, t, col) {
  const dir = new THREE.Vector3().subVectors(b, a);
  const g = new THREE.BoxGeometry(t, t, dir.length());
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), dir.normalize()));
  g.translate((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
  return bakeColor(g, col);
}

/** A low icosahedron blob — rocks, crowns, smoke. */
export function blob(r, x, y, z, col, rng, { detail = 0, jitter = 0.18, sy = 1 } = {}) {
  const g = new THREE.IcosahedronGeometry(r, detail);
  if (rng && jitter) jitterVertices(g, rng, r * jitter);
  g.scale(1, sy, 1);
  g.translate(x, y, z);
  return bakeColor(g, col);
}

/**
 * A gabled roof over a `w × d` footprint, ridge along X, eaves at `y`. Built from a box whose top
 * edge is pinched to the ridge — a positive per-vertex move, so no face can turn over.
 */
export function gable(w, d, h, x, y, z, col, overhang = 0.12) {
  const g = new THREE.BoxGeometry(w + overhang * 2, h, d + overhang * 2);
  const pos = g.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    if (pos.getY(i) > 0) pos.setZ(i, pos.getZ(i) * 0.02);
  }
  g.translate(x, y + h / 2, z);
  return bakeColor(g, col);
}

/** A flat hexagon (flat-top, like Grog's grid) of radius `r` at height `y`. */
export function hexDisc(r, y, col, x = 0, z = 0) {
  const g = new THREE.CylinderGeometry(r, r, 0.02, 6);
  // CylinderGeometry puts a vertex at +Z; a flat-top hex wants one on +X.
  g.rotateY(Math.PI / 6 + Math.PI / 2);
  g.translate(x, y, z);
  return bakeColor(g, col);
}

// --- Fog of war --------------------------------------------------------------------------------

/**
 * One uniform bag every lit material reads (the sim-taxi pattern: the same uniform *objects* are
 * handed to every patched material, so one write reaches all of them).
 *
 * `tFog` is a map-sized texture, one texel per hex in Grog's offset layout (col = q + floor(r/2),
 * row = r): red = shroud (explored, not in sight), green = unexplored. `world` converts world units
 * back to Grog pixels so the shader can run the same pixel→hex rounding hex.js does.
 */
export const FOG_UNIFORMS = {
  tFog: { value: null },
  uFogSize: { value: new THREE.Vector2(1, 1) },
  uFogColor: { value: new THREE.Color('#14213A') },
  uFogOn: { value: 0 },
  uFogScale: { value: 8 },     // Grog pixels per world unit (world.js PX_PER_UNIT)
  uHexSize: { value: 32 },     // hex.js HEX_SIZE
};

const FOG_VERTEX_PARS = /* glsl */ `
varying vec3 vFogWorld;
`;
const FOG_VERTEX = /* glsl */ `
{
  vec4 fw = vec4(transformed, 1.0);
  #ifdef USE_INSTANCING
    fw = instanceMatrix * fw;
  #endif
  vFogWorld = (modelMatrix * fw).xyz;
}
`;
export const FOG_FRAGMENT_PARS = /* glsl */ `
varying vec3 vFogWorld;
uniform sampler2D tFog;
uniform vec2 uFogSize;
uniform vec3 uFogColor;
uniform float uFogOn;
uniform float uFogScale;
uniform float uHexSize;

// hex.js pixelToHex + hexRound, in GLSL. Returns (shroud, unexplored).
vec2 grogFogAt(vec2 world) {
  vec2 px = world * uFogScale;
  float q = (2.0 / 3.0 * px.x) / uHexSize;
  float r = (-1.0 / 3.0 * px.x + 0.57735027 * px.y) / uHexSize;
  float s = -q - r;
  float rq = floor(q + 0.5), rr = floor(r + 0.5), rs = floor(s + 0.5);
  float dq = abs(rq - q), dr = abs(rr - r), ds = abs(rs - s);
  if (dq > dr && dq > ds) rq = -rr - rs;
  else if (dr > ds) rr = -rq - rs;
  float col = rq + floor(rr / 2.0);
  float row = rr;
  if (col < 0.0 || row < 0.0 || col >= uFogSize.x || row >= uFogSize.y) return vec2(0.0, 0.92);
  return texture2D(tFog, (vec2(col, row) + 0.5) / uFogSize).rg;
}

vec3 applyGrogFog(vec3 c) {
  if (uFogOn < 0.5) return c;
  vec2 f = grogFogAt(vFogWorld.xz);
  c = mix(c, c * 0.42 + uFogColor * 0.18, f.r * 2.0);  // shroud: dim and cool, 0.5 → full dim
  c = mix(c, uFogColor, min(1.0, f.g * 1.087));        // unexplored: the fog colour (0.92 → 1)
  return c;
}
`;

/** Patch a material so it reads the fog. Asserts every chunk it replaces. */
export function patchFog(material, key) {
  const prev = material.onBeforeCompile;
  material.onBeforeCompile = (shader, renderer) => {
    if (prev) prev(shader, renderer);
    Object.assign(shader.uniforms, FOG_UNIFORMS);
    shader.vertexShader = replaceOnce(shader.vertexShader, '#include <common>', `#include <common>\n${FOG_VERTEX_PARS}`);
    shader.vertexShader = replaceOnce(shader.vertexShader, '#include <project_vertex>', `#include <project_vertex>\n${FOG_VERTEX}`);
    shader.fragmentShader = replaceOnce(shader.fragmentShader, '#include <common>', `#include <common>\n${FOG_FRAGMENT_PARS}`);
    shader.fragmentShader = replaceOnce(shader.fragmentShader, '#include <fog_fragment>',
      `gl_FragColor.rgb = applyGrogFog(gl_FragColor.rgb);\n#include <fog_fragment>`);
  };
  // sim-taxi trap: three keys programs on parameters *before* the patch runs, so a patched material
  // collides with an unpatched twin and gets whichever compiled first. Key it on its source.
  material.customProgramCacheKey = () => `grog-fog-${key}`;
  return material;
}

export function replaceOnce(src, find, replacement) {
  if (!src.includes(find)) throw new Error(`shader patch: no match for ${find}`);
  return src.replace(find, replacement);
}

/** The shared material for every merged, vertex-coloured, lit mesh. */
export function propMaterial({ smooth = false, fog = true, key = 'prop' } = {}) {
  const m = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: !smooth });
  if (fog) patchFog(m, `${key}-${smooth ? 's' : 'f'}`);
  return m;
}

/**
 * Everything unlit — markers, rings, bars, fire. Haze off, for sim-taxi's reason: a marker's whole
 * content is its colour, and distance fog would report a different one.
 */
export function unlitMaterial(params = {}) {
  return new THREE.MeshBasicMaterial({ fog: false, ...params });
}
