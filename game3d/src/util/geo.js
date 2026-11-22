import * as THREE from 'three';
import { mergeGeometries, toCreasedNormals } from 'three/addons/utils/BufferGeometryUtils.js';
import { SURFACE_OF } from '../palette.js';

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
export function bakeColor(geometry, colorInput, opts = {}) {
  const geo = geometry.index ? geometry.toNonIndexed() : geometry;
  if (opts.mat === undefined && typeof colorInput === 'string') opts = { ...opts, mat: SURFACE_OF[colorInput] || 0 };
  const c = colorInput instanceof THREE.Color ? colorInput : new THREE.Color(colorInput);
  const count = geo.attributes.position.count;
  const colors = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    colors[i * 3] = c.r;
    colors[i * 3 + 1] = c.g;
    colors[i * 3 + 2] = c.b;
  }
  return bakeColors(geo, colors, opts);
}

/**
 * The same with a colour per vertex. `flatShading` only reaches the *normal* (a screen-space
 * derivative); `vColor` still interpolates, so a gradient across a facet costs nothing.
 */
export function bakeColors(geometry, colors, { mat = 0, crease = 0 } = {}) {
  let geo = geometry.index ? geometry.toNonIndexed() : geometry;
  for (const name of Object.keys(geo.attributes)) {
    if (name !== 'position' && name !== 'normal') geo.deleteAttribute(name);
  }
  // `crease` (radians) rounds a part: faces meeting at less than that angle share a normal, so a
  // sail bellies and a hull curves while a box keeps its edges. Zero is the faceted default.
  if (crease > 0) geo = toCreasedNormals(geo, crease);
  else geo.computeVertexNormals();
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.setAttribute('mat', new THREE.BufferAttribute(new Float32Array(geo.attributes.position.count).fill(mat), 1));
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
export function box(w, h, d, x, y, z, col, { segX = 1, segY = 1, segZ = 1, ...opts } = {}) {
  const g = new THREE.BoxGeometry(w, h, d, segX, segY, segZ);
  g.translate(x, y + h / 2, z);
  return bakeColor(g, col, opts);
}

/** Upright cylinder (or cone when rTop is 0) whose base is centred on (x, y, z). */
export function cyl(rTop, rBot, h, x, y, z, col, sides = 8, { open = false, ...opts } = {}) {
  const g = new THREE.CylinderGeometry(rTop, rBot, h, sides, 1, open);
  g.translate(x, y + h / 2, z);
  return bakeColor(g, col, { crease: sides >= 7 ? 1.0 : 0, ...opts });
}

/** A thin square rod from `a` to `b`. Rotation preserves winding. */
export function rod(a, b, t, col, opts = {}) {
  const dir = new THREE.Vector3().subVectors(b, a);
  const g = new THREE.BoxGeometry(t, t, dir.length());
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), dir.normalize()));
  g.translate((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
  return bakeColor(g, col, opts);
}

/** `rod` from plain coordinates, for rigging runs where six numbers read better than two vectors. */
export function line(ax, ay, az, bx, by, bz, t, col, opts) {
  return rod(new THREE.Vector3(ax, ay, az), new THREE.Vector3(bx, by, bz), t, col, opts);
}

/**
 * A horizontal plank from (ax, az) to (bx, bz), `h` tall with its base at `y` and `t` thick: rails,
 * wales, fences, wall runs. Overruns each end by half its thickness so a chain of them has no gaps.
 */
export function plank(ax, az, bx, bz, y, h, t, col, opts = {}) {
  const dx = bx - ax, dz = bz - az;
  const g = new THREE.BoxGeometry(Math.hypot(dx, dz) + t * 0.6, h, t);
  g.rotateY(Math.atan2(-dz, dx));
  g.translate((ax + bx) / 2, y + h / 2, (az + bz) / 2);
  return bakeColor(g, col, opts);
}

/** A cylinder lying along a horizontal direction (cannon barrels, logs, spars), centred on (x,y,z). */
export function tube(r0, r1, len, x, y, z, yaw, col, sides = 7, opts = {}) {
  const g = new THREE.CylinderGeometry(r1, r0, len, sides);
  g.rotateZ(-Math.PI / 2);   // +Y → +X
  g.rotateY(yaw);
  g.translate(x, y, z);
  return bakeColor(g, col, { crease: 1.0, ...opts });
}

/** A low icosahedron blob — rocks, crowns, smoke. */
export function blob(r, x, y, z, col, rng, { detail = 0, jitter = 0.18, sy = 1, ...opts } = {}) {
  const g = new THREE.IcosahedronGeometry(r, detail);
  if (rng && jitter) jitterVertices(g, rng, r * jitter);
  g.scale(1, sy, 1);
  g.translate(x, y, z);
  return bakeColor(g, col, opts);
}

/**
 * A gabled roof over a `w × d` footprint, ridge along X, eaves at `y`. Built from a box whose top
 * edge is pinched to the ridge — a positive per-vertex move, so no face can turn over.
 */
export function gable(w, d, h, x, y, z, col, overhang = 0.12, opts = {}) {
  const g = new THREE.BoxGeometry(w + overhang * 2, h, d + overhang * 2);
  const pos = g.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    if (pos.getY(i) > 0) pos.setZ(i, pos.getZ(i) * 0.02);
  }
  g.translate(x, y + h / 2, z);
  return bakeColor(g, col, opts);
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

// --- Surfaces ----------------------------------------------------------------------------------
// Texture without texture files. Every part carries a surface kind in its `mat` attribute, and
// this patch draws that kind's detail procedurally in *object* space (so it rides a turning ship
// and a rising building): plank seams and grain on wood, panel seams on canvas, coursed blocks on
// stone, overlapping rows on a roof. The same height field that tints the colour also bends the
// normal (a derivative bump, three's bumpMap recipe without the map) and sets the roughness, so
// planks catch the sun along their edges and iron glints where wood does not.
//
// Detail is faded by its own screen-space frequency: at play zoom a plank is under a pixel wide,
// and unfaded it would crawl. Zoomed in, it resolves.

// Cloud shadows: one slow noise field drifting downwind, read in world space by the land, the sea
// and everything standing on them, so a shadow crosses an island, its harbour and the fleet as one
// shape. It dims and cools the surface rather than touching the light, which keeps it out of every
// program's light state (sim-taxi: anything that changes what a pass counts as a light relinks the
// city).
export const CLOUD_UNIFORMS = { uCloud: { value: 0.9 } };
export const CLOUD_GLSL = /* glsl */ `
uniform float uCloudTime;
uniform float uCloud;
float cHash(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float cNoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(cHash(i), cHash(i + vec2(1.0, 0.0)), f.x), mix(cHash(i + vec2(0.0, 1.0)), cHash(i + vec2(1.0, 1.0)), f.x), f.y);
}
float cloudCover(vec2 w) {
  vec2 p = (w - vec2(1.0, 0.35) * uCloudTime * 1.4) * 0.016;
  float n = cNoise(p) * 0.6 + cNoise(p * 2.1 + 5.3) * 0.28 + cNoise(p * 4.3 + 1.7) * 0.12;
  return smoothstep(0.5, 0.72, n) * uCloud;
}
vec3 cloudShade(vec2 w) { return mix(vec3(1.0), vec3(0.55, 0.62, 0.76), cloudCover(w)); }
`;

const SURFACE_VERTEX_PARS = /* glsl */ `
attribute float mat;
uniform float uSurfTime;
varying float vMat;
varying vec3 vObj;
varying vec3 vObjN;
varying vec2 vWorldXZ;
`;
const SURFACE_VERTEX = /* glsl */ `
vMat = mat;
vObj = position;
vObjN = normal;
{
  vec4 gw = vec4(position, 1.0);
  #ifdef USE_INSTANCING
    gw = instanceMatrix * gw;
  #endif
  vWorldXZ = (modelMatrix * gw).xz;
}
// Canvas breathes: sails, flags and awnings ripple a few centimetres along their own normal. Too
// small to need the shadow pass patched, large enough that a fleet at anchor is not a still life.
if (mat > 1.5 && mat < 2.5) {
  transformed += normal * sin(uSurfTime * 2.6 + position.x * 1.9 + position.y * 2.7 + position.z * 1.3) * 0.04;
}
`;
const SURFACE_FRAGMENT_PARS = /* glsl */ `
varying float vMat;
varying vec3 vObj;
varying vec3 vObjN;
varying vec2 vWorldXZ;
${CLOUD_GLSL}

// Sine-free (Hoskins) hash: terrain is textured in world space, hundreds of units from the origin,
// where the classic sine hash runs out of precision and goes blocky.
float gHash(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float gNoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(gHash(i), gHash(i + vec2(1.0, 0.0)), f.x), mix(gHash(i + vec2(0.0, 1.0)), gHash(i + vec2(1.0, 1.0)), f.x), f.y);
}
float gFbm(vec2 p) { return gNoise(p) * 0.55 + gNoise(p * 2.3 + 7.1) * 0.3 + gNoise(p * 5.1 + 3.7) * 0.15; }
// 1 inside a cell, falling to 0 in a groove of width w at both edges; aa is the pixel footprint.
float gGroove(float f, float w, float aa) {
  return smoothstep(0.0, w + aa, f) * smoothstep(0.0, w + aa, 1.0 - f);
}

// rgb = albedo multiplier, a = height (0 groove .. 1 face). Also writes roughness and glow.
vec4 grogSurface(out float rough, out float glow) {
  rough = 0.9; glow = 0.0;
  int m = int(vMat + 0.5);
  if (m == 0) return vec4(1.0, 1.0, 1.0, 1.0);
  vec3 n = abs(normalize(vObjN));
  // (u, v): u runs along the grain or course, v across it, picked by which way the face looks.
  vec2 uv = n.y > max(n.x, n.z) ? vObj.xz : (n.z > n.x ? vObj.xy : vObj.zy);
  float top = step(max(n.x, n.z), n.y);
  vec3 tint = vec3(1.0);
  float h = 1.0;
  if (m == 1 || m == 7) {            // planks; paint is the same boards under a coat
    float W = 0.105;
    float pv = uv.y / W;
    float aa = fwidth(pv);
    float fade = clamp(1.0 - aa * 1.4, 0.0, 1.0);
    float row = floor(pv);
    float pu = uv.x / 0.95 + gHash(vec2(row, 3.0)) * 9.0;
    float seam = gGroove(fract(pv), 0.05, aa) * gGroove(fract(pu), 0.012, fwidth(pu));
    float board = gHash(vec2(row, floor(pu)));
    float grain = gNoise(vec2(uv.x * 2.2 + board * 31.0, uv.y * 46.0));
    float knots = smoothstep(0.78, 0.9, gNoise(vec2(uv.x * 3.1 + board * 17.0, uv.y * 9.0)));
    float k = m == 7 ? 0.45 : 1.0;
    h = mix(1.0, seam * (0.86 + 0.14 * grain), fade);
    float shade = (0.7 + 0.3 * seam) * (0.86 + 0.26 * board) * (0.92 + 0.16 * grain) * (1.0 - 0.2 * knots);
    tint = vec3(mix(1.0, shade, fade * k));
    tint *= mix(1.0, 0.88 + 0.24 * gFbm(vObj.xz * 1.3 + vObj.y), 0.8);   // weathering survives the fade
    rough = m == 7 ? 0.62 : 0.86;
  } else if (m == 2) {               // canvas: sewn panels, reef bands, weather stains
    float pu = uv.x / 0.34;
    float aa = fwidth(pu);
    float fade = clamp(1.0 - aa * 1.4, 0.0, 1.0);
    float seam = gGroove(fract(pu), 0.03, aa);
    float pv = uv.y / 0.62;
    float reef = gGroove(fract(pv), 0.02, fwidth(pv));
    float weave = 0.96 + 0.08 * gNoise(uv * vec2(90.0, 90.0));
    h = mix(1.0, seam * reef, fade);
    float stain = gFbm(uv * 1.6 + 2.0);
    tint = vec3(mix(1.0, (0.91 + 0.09 * seam) * (0.96 + 0.04 * reef) * weave, fade));
    tint *= vec3(0.9 + 0.16 * stain, 0.9 + 0.15 * stain, 0.86 + 0.18 * stain);
    rough = 0.95;
  } else if (m == 3 || m == 10) {    // coursed masonry / brick
    vec2 cell = m == 10 ? vec2(0.24, 0.1) : vec2(0.46, 0.21);
    if (top > 0.5) cell = vec2(0.4, 0.4);
    float pv = uv.y / cell.y;
    float row = floor(pv);
    float pu = uv.x / cell.x + mod(row, 2.0) * 0.5 + gHash(vec2(row, 1.0)) * 0.2;
    float aa = max(fwidth(pv), fwidth(pu));
    float fade = clamp(1.0 - aa * 1.4, 0.0, 1.0);
    float mortar = gGroove(fract(pv), 0.07, fwidth(pv)) * gGroove(fract(pu), 0.04, fwidth(pu));
    float blk = gHash(vec2(row, floor(pu)));
    float pit = gFbm(uv * 9.0);
    h = mix(1.0, mortar * (0.8 + 0.2 * pit), fade);
    tint = vec3(mix(1.0, (0.62 + 0.38 * mortar) * (0.82 + 0.34 * blk) * (0.9 + 0.2 * pit), fade));
    // Moss and damp toward the foot of a wall, lichen blotches everywhere.
    float damp = smoothstep(0.9, 0.0, vObj.y) * (1.0 - top) * gFbm(vObj.xz * 2.0 + vObj.y);
    tint *= mix(vec3(1.0), vec3(0.72, 0.84, 0.66), damp * 0.7);
    tint *= 0.9 + 0.2 * gFbm(uv * 0.9 + 11.0);
    rough = 0.93;
  } else if (m == 4) {               // shingles / tiles, each row lapping the one below
    float pv = uv.y / 0.15;
    if (top < 0.5) pv = vObj.y / 0.15;
    float row = floor(pv);
    float pu = uv.x / 0.16 + mod(row, 2.0) * 0.5;
    float aa = max(fwidth(pv), fwidth(pu));
    float fade = clamp(1.0 - aa * 1.4, 0.0, 1.0);
    float lap = fract(pv);
    float gap = gGroove(fract(pu), 0.05, fwidth(pu));
    float tile = gHash(vec2(row, floor(pu)));
    h = mix(1.0, (0.35 + 0.65 * lap) * gap, fade);
    tint = vec3(mix(1.0, (0.7 + 0.3 * smoothstep(0.0, 0.35, lap)) * (0.6 + 0.4 * gap) * (0.82 + 0.36 * tile), fade));
    tint *= 0.9 + 0.2 * gFbm(uv * 1.1 + 5.0);
    rough = 0.8;
  } else if (m == 5) {               // thatch: combed straw in thick layers
    float pv = (top > 0.5 ? uv.y : vObj.y) / 0.28;
    float aa = fwidth(pv);
    float fade = clamp(1.0 - aa * 1.4, 0.0, 1.0);
    float straw = gNoise(vec2(uv.x * 60.0, uv.y * 3.0));
    float lap = fract(pv + 0.06 * gNoise(vec2(uv.x * 8.0, 0.0)));
    h = mix(1.0, 0.5 + 0.5 * lap * straw, fade);
    tint = vec3(mix(1.0, (0.72 + 0.28 * lap) * (0.82 + 0.3 * straw), fade));
    tint *= 0.9 + 0.2 * gFbm(uv * 1.4);
    rough = 1.0;
  } else if (m == 6) {               // iron and brass: smooth, with a little pitting
    float pit = gFbm(vObj.xy * 14.0 + vObj.z * 9.0);
    tint = vec3(0.86 + 0.24 * pit);
    h = 0.9 + 0.1 * pit;
    rough = 0.38 + 0.2 * pit;
  } else if (m == 8) {               // limewashed plaster: blotchy, cracked at the corners
    float b = gFbm(uv * 2.2 + 3.0);
    float fine = gNoise(uv * 38.0);
    tint = vec3(0.86 + 0.2 * b) * (0.97 + 0.06 * fine);
    tint *= mix(vec3(1.0), vec3(0.8, 0.76, 0.66), smoothstep(0.45, 0.0, vObj.y) * 0.6);   // splashback
    h = 0.92 + 0.08 * fine;
    rough = 0.95;
  } else if (m == 9) {               // lit glass
    glow = 1.0;
    rough = 0.3;
  } else if (m == 12) {              // foliage: mottled, with a fine leafy break-up
    float mottle = gFbm(vObj.xz * 3.0 + vObj.y * 2.0);
    float fine = gNoise(vObj.xy * 17.0 + vObj.z * 11.0);
    float aa = clamp(1.0 - fwidth(vObj.x * 17.0), 0.0, 1.0);
    tint = vec3(0.8 + 0.36 * mottle) * mix(1.0, 0.88 + 0.24 * fine, aa);
    tint *= 0.82 + 0.3 * smoothstep(0.0, 1.6, vObj.y);       // darker under the canopy, lit at the crown
    h = mix(1.0, fine, aa);
    rough = 0.82;
  } else if (m == 13) {              // the ground itself, in world space
    vec2 w = vObj.xz;
    float nrmY = normalize(vObjN).y;
    float broad = gFbm(w * 0.55);
    float fine = gNoise(w * 7.0) * 0.6 + gNoise(w * 19.0) * 0.4;
    float aa = clamp(1.0 - fwidth(w.x * 7.0) * 1.2, 0.0, 1.0);
    tint = vec3(0.86 + 0.26 * broad) * mix(1.0, 0.9 + 0.2 * fine, aa);
    // Steep ground shows its strata.
    float steep = smoothstep(0.88, 0.7, nrmY);
    float strata = gNoise(vec2(vObj.y * 9.0 + broad * 2.5, dot(w, vec2(0.33, 0.21))));
    tint *= mix(1.0, 0.72 + 0.5 * strata, steep);
    // Wet sand along the waterline, then dry.
    float wet = smoothstep(0.26, 0.04, vObj.y) * step(-0.05, vObj.y);
    tint *= 1.0 - 0.3 * wet;
    h = mix(1.0, fine * (0.6 + 0.4 * strata * steep), aa);
    rough = mix(0.96, 0.45, wet);
    // The hex grid, faintly: this is still a game played on hexes.
    if (uGrid > 0.0 && vObj.y > 0.12) {
      float q = (2.0 / 3.0 * w.x) / 4.0;
      float r = (-1.0 / 3.0 * w.x + 0.57735027 * w.y) / 4.0;
      float s2 = -q - r;
      float rq = floor(q + 0.5), rr = floor(r + 0.5), rs = floor(s2 + 0.5);
      float dq = abs(rq - q), dr = abs(rr - r), ds = abs(rs - s2);
      if (dq > dr && dq > ds) rq = -rr - rs; else if (dr > ds) rr = -rq - rs;
      vec2 d = w - vec2(6.0 * rq, 6.92820323 * (rr + rq * 0.5));
      float e = max(abs(d.y), max(abs(d.x * 0.8660254 + d.y * 0.5), abs(d.x * 0.8660254 - d.y * 0.5)));
      float edge = 3.46410162 - e;
      tint *= 1.0 - uGrid * (1.0 - smoothstep(0.0, 0.06 + fwidth(e) * 1.5, edge));
    }
  } else if (m == 14) {              // bare rock: bedding and cracks
    float bed = gFbm(vec2(vObj.y * 5.0 + gFbm(vObj.xz * 1.5) * 2.0, dot(vObj.xz, vec2(0.7, 0.5)) * 1.3));
    float speck = gNoise(vObj.xz * 23.0 + vObj.y * 17.0);
    tint = vec3(0.76 + 0.4 * bed) * (0.94 + 0.12 * speck);
    h = bed * 0.7 + speck * 0.3;
    rough = 0.9;
  } else if (m == 15) {              // bark: long vertical furrows
    float furrow = gNoise(vec2((vObj.x + vObj.z) * 26.0, vObj.y * 3.0));
    tint = vec3(0.78 + 0.4 * furrow);
    h = furrow;
    rough = 0.95;
  } else if (m == 11) {              // rope: a twist along its length
    float tw = fract((uv.x + uv.y) * 22.0);
    float aa = fwidth((uv.x + uv.y) * 22.0);
    tint = vec3(mix(1.0, 0.75 + 0.25 * tw, clamp(1.0 - aa, 0.0, 1.0)));
    rough = 1.0;
  }
  return vec4(tint, h);
}

vec3 grogBump(vec3 pos, vec3 nrm, float h, float scale) {
  vec3 sx = dFdx(pos), sy = dFdy(pos);
  vec3 r1 = cross(sy, nrm), r2 = cross(nrm, sx);
  float det = dot(sx, r1);
  vec3 grad = sign(det) * (dFdx(h) * r1 + dFdy(h) * r2) * scale;
  return normalize(abs(det) * nrm - grad);
}
`;

/** Emissive strength of `SURF.glow` parts (lanterns, lit windows). One uniform, so dusk can raise it. */
export const SURFACE_UNIFORMS = { uGlow: { value: 1.6 }, uGrid: { value: 0.1 }, uTime: { value: 0 }, uWind: { value: new THREE.Vector2(1, 0.35) } };

/**
 * The material for every built thing: merged, vertex-coloured, physically lit, with the procedural
 * surface detail above. `flatShading` is off because parts bring their own normals — faceted by
 * default, rounded where a builder asked for a `crease`.
 */
export function surfaceMaterial({ fog = true, key = 'surface' } = {}) {
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, metalness: 0 });
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uGlow = SURFACE_UNIFORMS.uGlow;
    shader.uniforms.uGrid = SURFACE_UNIFORMS.uGrid;
    shader.uniforms.uSurfTime = SURFACE_UNIFORMS.uTime;
    shader.uniforms.uCloudTime = SURFACE_UNIFORMS.uTime;
    shader.uniforms.uCloud = CLOUD_UNIFORMS.uCloud;
    shader.vertexShader = replaceOnce(shader.vertexShader, '#include <common>', `#include <common>\n${SURFACE_VERTEX_PARS}`);
    shader.vertexShader = replaceOnce(shader.vertexShader, '#include <begin_vertex>', `#include <begin_vertex>\n${SURFACE_VERTEX}`);
    shader.fragmentShader = replaceOnce(shader.fragmentShader, '#include <common>', `#include <common>\nuniform float uGlow;\nuniform float uGrid;\n${SURFACE_FRAGMENT_PARS}`);
    shader.fragmentShader = replaceOnce(shader.fragmentShader, '#include <color_fragment>', `#include <color_fragment>
float grogRough; float grogGlow;
vec4 grogSurf = grogSurface(grogRough, grogGlow);
diffuseColor.rgb *= grogSurf.rgb;`);
    shader.fragmentShader = replaceOnce(shader.fragmentShader, '#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
roughnessFactor = grogRough;`);
    shader.fragmentShader = replaceOnce(shader.fragmentShader, '#include <metalnessmap_fragment>', `#include <metalnessmap_fragment>
metalnessFactor = int(vMat + 0.5) == 6 ? 0.75 : 0.0;`);
    shader.fragmentShader = replaceOnce(shader.fragmentShader, '#include <normal_fragment_maps>', `#include <normal_fragment_maps>
normal = grogBump(-vViewPosition, normal, grogSurf.a, 0.035);`);
    shader.fragmentShader = replaceOnce(shader.fragmentShader, '#include <emissivemap_fragment>', `#include <emissivemap_fragment>
totalEmissiveRadiance += diffuseColor.rgb * grogGlow * uGlow;
diffuseColor.rgb *= cloudShade(vWorldXZ);`);
  };
  if (fog) patchFog(m, `surface-${key}`);
  else m.customProgramCacheKey = () => `grog-surface-${key}`;
  return m;
}

// --- Vegetation: wind ----------------------------------------------------------------------------
// Props are instanced, so each one's root is its instance origin. In the vertex shader a vertex
// leans downwind by the square of its height above the root, in gusts that travel across the map,
// so a wood moves in waves rather than in step. The same patch goes on the shadow pass's depth
// material, or the shadows would stand still under moving trees (sim-taxi: vertex animation has to
// be patched into every depth pass).

const PROPS_VERTEX_PARS = /* glsl */ `
uniform float uTime;
uniform vec2 uWind;
uniform float uSway;
`;
const PROPS_VERTEX = /* glsl */ `
#ifdef USE_INSTANCING
{
  vec3 root = (instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
  float hgt = max(0.0, transformed.y);
  float gust = sin(dot(root.xz, uWind) * 0.11 - uTime * 1.3) * 0.6 + sin(dot(root.xz, vec2(-uWind.y, uWind.x)) * 0.23 + uTime * 2.1) * 0.25 + 0.55;
  float flutter = sin(uTime * 5.3 + root.x * 3.1 + transformed.x * 4.0) * 0.15;
  // The lean is in world space; instances only turn about Y, so project it onto their own axes.
  vec2 lean = uWind * (gust + flutter) * uSway * 0.045 * hgt * hgt;
  vec3 ax = instanceMatrix[0].xyz, az = instanceMatrix[2].xyz;
  float sx = max(length(ax), 1e-5), sz = max(length(az), 1e-5);
  transformed.x += dot(vec2(ax.x, ax.z), lean) / (sx * sx);
  transformed.z += dot(vec2(az.x, az.z), lean) / (sz * sz);
}
#endif
`;

const propsCache = new Map();
/** Surface material plus wind, and the matching depth material, per sway strength. */
export function propsMaterial(sway) {
  if (propsCache.has(sway)) return propsCache.get(sway);
  const uSway = { value: sway };
  const patch = (shader) => {
    shader.uniforms.uTime = SURFACE_UNIFORMS.uTime;
    shader.uniforms.uWind = SURFACE_UNIFORMS.uWind;
    shader.uniforms.uSway = uSway;
    shader.vertexShader = replaceOnce(shader.vertexShader, '#include <common>', `#include <common>\n${PROPS_VERTEX_PARS}`);
    shader.vertexShader = replaceOnce(shader.vertexShader, '#include <begin_vertex>', `#include <begin_vertex>\n${PROPS_VERTEX}`);
  };
  const material = surfaceMaterial({ key: 'props' });
  const base = material.onBeforeCompile;
  material.onBeforeCompile = (shader, renderer) => { patch(shader); base(shader, renderer); };
  material.customProgramCacheKey = () => 'grog-props';
  const depth = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking });
  depth.onBeforeCompile = patch;
  depth.customProgramCacheKey = () => 'grog-props-depth';
  const out = { material, depth };
  propsCache.set(sway, out);
  return out;
}
