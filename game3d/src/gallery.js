import * as THREE from 'three';
import { createScene, followSun } from './render/scene.js';
import { createCamera } from './render/camera.js';
import { shipGeometry, SHIP_TYPES } from './art/ships.js';
import { structureGeometry } from './art/structures.js';
import { propMaterial, FOG_UNIFORMS, hexDisc, merge } from './util/geo.js';
import { PALETTE } from './palette.js';

// Every model on one bench, under the game's own sun and camera — the 2D game's galleryScene and a
// cut-down sim-taxi /workshop/. `?zoom=` and `?x=&z=` frame it; `?owner=` repaints the trims.

const params = new URLSearchParams(location.search);
const canvas = document.getElementById('game');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
const { scene, sun } = createScene();
scene.fog = null;
FOG_UNIFORMS.uFogOn.value = 0;
const cam = createCamera();
const mat = propMaterial({ key: 'gallery' });

const sea = new THREE.Mesh(new THREE.PlaneGeometry(400, 400).rotateX(-Math.PI / 2), new THREE.MeshLambertMaterial({ color: PALETTE.ocean }));
sea.receiveShadow = true;
scene.add(sea);

const owners = (params.get('owner') || 'player,ai1,ai2,ai3,pirate').split(',');
SHIP_TYPES.forEach((t, i) => {
  owners.forEach((o, j) => {
    if (t === 'pirate' && o !== 'pirate') return;
    const m = new THREE.Mesh(shipGeometry(t, o), mat);
    m.position.set(-24 + i * 8, 0, -14 + j * 6);
    m.rotation.y = 0.5;
    m.castShadow = m.receiveShadow = true;
    scene.add(m);
  });
});
const structures = [['port', 'dock'], ['port', 'shipyard'], ['port', 'stronghold'], ['settlement', 'settlement'], ['tower', 'watchtower'], ['tower', 'crossbowTower'], ['tower', 'cannonBattery']];
structures.forEach(([k, t], i) => {
  const base = new THREE.Mesh(merge([hexDisc(4, 0.3, PALETTE.grass)]), mat);
  base.position.set(-27 + i * 9, 0, 18);
  scene.add(base);
  const m = new THREE.Mesh(structureGeometry(k, t, owners[0], 3), mat);
  m.position.set(-27 + i * 9, 0.32, 18);
  m.castShadow = m.receiveShadow = true;
  scene.add(m);
});

cam.state.zoom = Number(params.get('zoom') || 26);
cam.lookAt(Number(params.get('x') || 0), Number(params.get('z') || 8));
function resize() { renderer.setSize(innerWidth, innerHeight, false); cam.resize(innerWidth, innerHeight); }
addEventListener('resize', resize);
resize();
function frame() {
  cam.update(0);
  followSun(sun, cam.state.target, 60);
  renderer.render(scene, cam.camera);
  requestAnimationFrame(frame);
}
frame();
