import * as THREE from 'three';
import { PALETTE } from '../palette.js';

// Sky, light and air — sim-taxi's game/scene.js reduced to what an open sea needs.
//
// Kept from it: the gradient sky dome; the hemisphere fill under one warm directional sun angled
// *across* the grid (a sun parallel to the rows lines shadows up with the hexes and flattens the
// map); and distance haze as three's plain linear `Fog` placed AROUND the camera standoff rather
// than from zero — under an orthographic camera every pixel is ~DISTANCE from the eye, so fog from
// zero is a uniform wash, while a band around the standoff becomes a gradient up the screen.

export const SKY_RADIUS = 1400;
const SKY_DROP = 120;

function createSky() {
  const geometry = new THREE.SphereGeometry(SKY_RADIUS, 24, 12);
  const material = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: {
      topColor: { value: new THREE.Color(PALETTE.skyTop) },
      bottomColor: { value: new THREE.Color(PALETTE.skyBottom) },
    },
    vertexShader: /* glsl */ `
      varying vec3 vWorld;
      void main() {
        vWorld = (modelMatrix * vec4(position, 1.0)).xyz;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 topColor;
      uniform vec3 bottomColor;
      varying vec3 vWorld;
      void main() {
        float h = normalize(vWorld - cameraPosition + vec3(0.0, ${SKY_DROP.toFixed(1)}, 0.0)).y;
        gl_FragColor = vec4(mix(bottomColor, topColor, pow(max(h, 0.0), 0.7)), 1.0);
      }`,
  });
  const sky = new THREE.Mesh(geometry, material);
  sky.name = 'sky';
  sky.frustumCulled = false;
  return sky;
}

export const SUN = {
  elevation: THREE.MathUtils.degToRad(38),
  // On the camera's side of the map (the camera looks from +Z), off to the right: every model
  // shows one lit face to the player and throws its shadow up-screen and left, where it reads as
  // depth instead of hiding the thing that cast it. Behind the scene, the first cut showed the
  // player nothing but shaded sails.
  azimuth: THREE.MathUtils.degToRad(38),
  intensity: 2.9,
  fill: 1.35,
};

export function createScene({ shadowMapSize = 4096 } = {}) {
  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(PALETTE.fog, 1, 2);
  const sky = createSky();
  scene.add(sky);

  const hemi = new THREE.HemisphereLight(PALETTE.hemiSky, PALETTE.hemiGround, SUN.fill);
  scene.add(hemi);

  const sun = new THREE.DirectionalLight(PALETTE.sun, SUN.intensity);
  sun.castShadow = shadowMapSize > 0;
  sun.shadow.mapSize.set(Math.max(256, shadowMapSize), Math.max(256, shadowMapSize));
  // The shadow frustum follows the camera target (see `followSun`) and spans a bit more than the
  // widest zoom shows; a whole 500-unit map in one 4096 map would be 0.25 units a texel, which
  // smears a mast's shadow into nothing.
  const ext = 150;
  Object.assign(sun.shadow.camera, { left: -ext, right: ext, top: ext, bottom: -ext, near: 1, far: 900 });
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.05;
  scene.add(sun);
  scene.add(sun.target);

  return { scene, sun, hemi, sky };
}

const sunDir = new THREE.Vector3(
  Math.cos(SUN.azimuth) * Math.cos(SUN.elevation),
  Math.sin(SUN.elevation),
  Math.sin(SUN.azimuth) * Math.cos(SUN.elevation),
);

/** Re-centre the sun (and its shadow frustum) on the camera's target, snapped to whole texels. */
export function followSun(sun, target, extent) {
  const ext = Math.min(Math.max(extent * 1.25, 80), 380);
  const cam = sun.shadow.camera;
  if (Math.abs(cam.right - ext) > 1) {
    Object.assign(cam, { left: -ext, right: ext, top: ext, bottom: -ext });
    cam.updateProjectionMatrix();
  }
  // Snap the centre to the texel grid so shadows don't crawl while panning.
  const texel = (2 * ext) / sun.shadow.mapSize.x;
  const x = Math.round(target.x / texel) * texel;
  const z = Math.round(target.z / texel) * texel;
  sun.target.position.set(x, 0, z);
  sun.position.set(x + sunDir.x * 400, sunDir.y * 400, z + sunDir.z * 400);
}
