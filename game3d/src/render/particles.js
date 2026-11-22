import * as THREE from 'three';

// Soft particles: smoke, fire, spray and foam.
//
// Three layers, each one InstancedMesh of a unit quad, simulated on the CPU and repacked every
// frame (a busy battle is a few hundred live particles; the packing is a tight loop over typed
// arrays):
//   soft — camera-facing, normal blend: smoke, spray, splinters. Shaded top-light to bottom-dark so
//          a plume reads as a volume under the sun rather than a sticker.
//   add  — camera-facing, emissive: fire and sparks. HDR values, so the bloom pass picks them up.
//   flat — lying on the sea, normal blend: wake foam and ripple rings.
//
// The quad's shape is drawn in the fragment shader (a noise-eaten puff, a ring, or a hard spark),
// so there are no textures. Every mesh sets `frustumCulled = false` for the same reason the effect
// pools do: an InstancedMesh's bounding sphere is computed once and never again.

const STRIDE = 20;
// Offsets into a particle's slot.
const X = 0, Y = 1, Z = 2, VX = 3, VY = 4, VZ = 5, AGE = 6, LIFE = 7, S0 = 8, S1 = 9,
  R = 10, G = 11, B = 12, A = 13, ROT = 14, SPIN = 15, DRAG = 16, GRAV = 17, SHAPE = 18, SEED = 19;

export const SHAPE_PUFF = 0, SHAPE_RING = 1, SHAPE_SPARK = 2, SHAPE_FOAM = 3;

const VERT = /* glsl */ `
attribute vec4 iA;   // xyz, size
attribute vec4 iB;   // rgb, alpha
attribute vec4 iC;   // rotation, shape, seed, unused
varying vec2 vUv;
varying vec4 vCol;
varying vec2 vKind;
#include <fog_pars_vertex>
void main() {
  float c = cos(iC.x), s = sin(iC.x);
  vec2 q = vec2(position.x * c - position.y * s, position.x * s + position.y * c) * iA.w;
  #ifdef FLAT
    vec4 mvPosition = viewMatrix * vec4(iA.xyz + vec3(q.x, 0.0, q.y), 1.0);
  #else
    vec4 mvPosition = viewMatrix * vec4(iA.xyz, 1.0);
    mvPosition.xy += q;
  #endif
  gl_Position = projectionMatrix * mvPosition;
  vUv = position.xy * 2.0;
  vCol = iB;
  vKind = iC.yz;
  #include <fog_vertex>
}
`;

const FRAG = /* glsl */ `
varying vec2 vUv;
varying vec4 vCol;
varying vec2 vKind;
#include <fog_pars_fragment>
float pHash(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
float pNoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(pHash(i), pHash(i + vec2(1.0, 0.0)), f.x), mix(pHash(i + vec2(0.0, 1.0)), pHash(i + vec2(1.0, 1.0)), f.x), f.y);
}
void main() {
  float r = length(vUv);
  if (r > 1.0) discard;
  int shape = int(vKind.x + 0.5);
  vec2 np = vUv * 2.2 + vKind.y * 17.0;
  float n = pNoise(np) * 0.65 + pNoise(np * 2.3) * 0.35;
  float a;
  vec3 col = vCol.rgb;
  if (shape == 1) {
    // Ring: a thin band that breaks up as it spreads.
    a = smoothstep(0.62, 0.78, r) * smoothstep(0.98, 0.84, r) * (0.55 + 0.45 * n);
  } else if (shape == 2) {
    a = smoothstep(1.0, 0.0, r);
    a *= a;
  } else if (shape == 3) {
    // Foam: a soft body with lace worked into it, so overlapping patches read as one streak.
    a = smoothstep(1.0, 0.25, r) * mix(0.3, 1.0, smoothstep(0.3, 0.66, n + (1.0 - r) * 0.2));
  } else {
    // Puff: soft, with a noise-worn edge, lit from above.
    a = smoothstep(1.0, 0.15, r + (n - 0.5) * 0.7);
    #ifndef ADDITIVE
      col *= 0.72 + 0.4 * (vUv.y * 0.5 + 0.5) + (n - 0.5) * 0.2;
    #endif
  }
  a *= vCol.a;
  if (a < 0.004) discard;
  #ifdef ADDITIVE
    gl_FragColor = vec4(col * a, a * 0.75);
  #else
    gl_FragColor = vec4(col, a);
  #endif
  #include <fog_fragment>
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

function layer(name, capacity, { flat = false, additive = false } = {}) {
  const quad = new THREE.PlaneGeometry(1, 1);
  const geometry = new THREE.InstancedBufferGeometry();
  geometry.index = quad.index;
  geometry.setAttribute('position', quad.attributes.position);
  const iA = new THREE.InstancedBufferAttribute(new Float32Array(capacity * 4), 4).setUsage(THREE.DynamicDrawUsage);
  const iB = new THREE.InstancedBufferAttribute(new Float32Array(capacity * 4), 4).setUsage(THREE.DynamicDrawUsage);
  const iC = new THREE.InstancedBufferAttribute(new Float32Array(capacity * 4), 4).setUsage(THREE.DynamicDrawUsage);
  geometry.setAttribute('iA', iA).setAttribute('iB', iB).setAttribute('iC', iC);
  geometry.instanceCount = 0;

  const defines = {};
  if (flat) defines.FLAT = '';
  if (additive) defines.ADDITIVE = '';
  const material = new THREE.ShaderMaterial({
    vertexShader: VERT,
    fragmentShader: FRAG,
    defines,
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog]),
    transparent: true,
    depthWrite: false,
    fog: !additive,
    side: THREE.DoubleSide,
    // Fire is premultiplied and mostly opaque rather than purely additive: added onto a bright
    // sea, orange washes out to white; covering three quarters of what is behind it keeps its hue.
    blending: additive ? THREE.CustomBlending : THREE.NormalBlending,
    blendSrc: additive ? THREE.OneFactor : THREE.SrcAlphaFactor,
    blendDst: THREE.OneMinusSrcAlphaFactor,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = `particles-${name}`;
  mesh.frustumCulled = false;
  mesh.renderOrder = flat ? 2 : additive ? 6 : 5;

  const data = new Float32Array(capacity * STRIDE);
  let count = 0;

  return {
    mesh,
    get count() { return count; },
    /**
     * Add one particle. `size` and `size1` are diameters at birth and death; `color` is a
     * THREE.Color already in working space; `alpha` fades in over the first tenth of the life and
     * out over the rest.
     */
    emit(o) {
      if (count >= capacity) return;
      const i = count++ * STRIDE;
      data[i + X] = o.x; data[i + Y] = o.y; data[i + Z] = o.z;
      data[i + VX] = o.vx || 0; data[i + VY] = o.vy || 0; data[i + VZ] = o.vz || 0;
      data[i + AGE] = 0; data[i + LIFE] = o.life;
      data[i + S0] = o.size; data[i + S1] = o.size1 ?? o.size;
      data[i + R] = o.color.r * (o.gain || 1); data[i + G] = o.color.g * (o.gain || 1); data[i + B] = o.color.b * (o.gain || 1);
      data[i + A] = o.alpha ?? 1;
      data[i + ROT] = o.rot ?? Math.random() * 6.283; data[i + SPIN] = o.spin || 0;
      data[i + DRAG] = o.drag || 0; data[i + GRAV] = o.gravity || 0;
      data[i + SHAPE] = o.shape || 0; data[i + SEED] = Math.random();
    },
    update(dt) {
      const a = iA.array, b = iB.array, c = iC.array;
      let n = 0;
      for (let k = 0; k < count; k++) {
        const i = k * STRIDE;
        const age = data[i + AGE] + dt;
        if (age >= data[i + LIFE]) continue;
        const j = n * STRIDE;
        if (j !== i) data.copyWithin(j, i, i + STRIDE);
        data[j + AGE] = age;
        const drag = Math.max(0, 1 - data[j + DRAG] * dt);
        data[j + VX] *= drag; data[j + VZ] *= drag;
        data[j + VY] = data[j + VY] * drag - data[j + GRAV] * dt;
        data[j + X] += data[j + VX] * dt; data[j + Y] += data[j + VY] * dt; data[j + Z] += data[j + VZ] * dt;
        data[j + ROT] += data[j + SPIN] * dt;
        const u = age / data[j + LIFE];
        const grow = 1 - (1 - u) * (1 - u);      // fast at first, settling
        const fade = Math.min(1, u * 10) * (1 - u) * (1 - u * 0.3);
        const o = n * 4;
        a[o] = data[j + X]; a[o + 1] = data[j + Y]; a[o + 2] = data[j + Z];
        a[o + 3] = data[j + S0] + (data[j + S1] - data[j + S0]) * grow;
        b[o] = data[j + R]; b[o + 1] = data[j + G]; b[o + 2] = data[j + B]; b[o + 3] = data[j + A] * fade;
        c[o] = data[j + ROT]; c[o + 1] = data[j + SHAPE]; c[o + 2] = data[j + SEED];
        n++;
      }
      count = n;
      geometry.instanceCount = n;
      iA.needsUpdate = iB.needsUpdate = iC.needsUpdate = true;
    },
  };
}

export function createParticles(parent) {
  const soft = layer('soft', 3072);
  const add = layer('add', 1024, { additive: true });
  const flat = layer('flat', 6144, { flat: true });
  parent.add(flat.mesh, soft.mesh, add.mesh);
  return {
    soft, add, flat,
    update(dt) { soft.update(dt); add.update(dt); flat.update(dt); },
    get count() { return soft.count + add.count + flat.count; },
  };
}
