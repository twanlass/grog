import * as THREE from 'three';
import { PALETTE, ownerColor } from '../palette.js';
import { bakeColor, merge, box, cyl, gable, rod, hexDisc } from '../util/geo.js';
import { makeRng } from '../util/rng.js';
import { HEX_R } from '../world.js';

// Ports, settlements and towers, in the same boxes-and-cylinders vocabulary as the ships. Each is
// built on its hex with its base at y = 0; `units.js` lifts it onto the tile's surface. Ports are
// built facing +X — the pier runs out that way — and are turned toward the open water at placement.
//
// Owner colour goes on roofs' ridge flags and banners, which is what the 2D sprites colour, so a
// port reads as "red's" from across the map without the whole building being painted red.

function flag(x, y, z, col, h = 1.4) {
  return [
    cyl(0.04, 0.05, h, x, y, z, PALETTE.mast, 5),
    box(0.55, 0.32, 0.04, x + 0.28, y + h - 0.36, z, col),
  ];
}

function crenellations(w, d, y, col, step = 0.42) {
  const out = [];
  const nx = Math.max(2, Math.round(w / step));
  const nz = Math.max(2, Math.round(d / step));
  for (let i = 0; i < nx; i += 2) {
    const x = -w / 2 + (i + 0.5) * (w / nx);
    out.push(box(w / nx, 0.22, 0.2, x, y, d / 2 - 0.1, col));
    out.push(box(w / nx, 0.22, 0.2, x, y, -d / 2 + 0.1, col));
  }
  for (let i = 0; i < nz; i += 2) {
    const z = -d / 2 + (i + 0.5) * (d / nz);
    out.push(box(0.2, 0.22, d / nz, w / 2 - 0.1, y, z, col));
    out.push(box(0.2, 0.22, d / nz, -w / 2 + 0.1, y, z, col));
  }
  return out;
}

function pier(len, width, x0) {
  const parts = [box(len, 0.12, width, x0 + len / 2, 0.15, 0, PALETTE.wood)];
  for (let i = 0; i <= Math.floor(len / 0.8); i++) {
    const x = x0 + i * 0.8 + 0.1;
    parts.push(cyl(0.07, 0.07, 1.1, x, -0.85, width / 2 - 0.06, PALETTE.woodDark, 5));
    parts.push(cyl(0.07, 0.07, 1.1, x, -0.85, -width / 2 + 0.06, PALETTE.woodDark, 5));
  }
  return parts;
}

function dock(trim) {
  return [
    box(2.4, 0.18, 2.6, -0.4, 0, 0, PALETTE.woodDark),           // landing stage
    ...pier(3.4, 1.0, 0.8),                                    // out over the water
    box(1.5, 1.0, 1.3, -0.9, 0.18, -0.5, PALETTE.wood),          // shed
    gable(1.5, 1.3, 0.7, -0.9, 1.18, -0.5, PALETTE.roof),
    box(0.5, 0.4, 0.5, 0.3, 0.18, 0.7, PALETTE.woodDark),        // crates
    box(0.4, 0.35, 0.4, 0.75, 0.18, 0.75, PALETTE.wood),
    cyl(0.22, 0.22, 0.45, -0.1, 0.18, 0.95, PALETTE.woodDark, 7), // barrel
    ...flag(-1.6, 0.18, 0.6, trim),
  ];
}

function shipyard(trim) {
  const parts = [
    box(3.4, 0.2, 3.6, -0.6, 0, 0, PALETTE.woodDark),
    ...pier(3.0, 1.1, 1.0).map((g) => g.translate(0, 0, 1.15) && g),
    // Slipway with a hull's ribs on it.
    box(3.0, 0.12, 1.4, 1.4, 0.0, -0.9, PALETTE.wood),
  ];
  for (let i = 0; i < 5; i++) {
    const x = 0.5 + i * 0.45;
    parts.push(rod(new THREE.Vector3(x, 0.15, -1.45), new THREE.Vector3(x, 0.95, -1.25), 0.08, PALETTE.wood));
    parts.push(rod(new THREE.Vector3(x, 0.15, -0.35), new THREE.Vector3(x, 0.95, -0.55), 0.08, PALETTE.wood));
  }
  parts.push(rod(new THREE.Vector3(0.4, 0.2, -0.9), new THREE.Vector3(2.6, 0.35, -0.9), 0.12, PALETTE.woodDark)); // keel
  // Workshop and crane.
  parts.push(box(2.0, 1.4, 1.7, -1.3, 0.2, 0.5, PALETTE.wood));
  parts.push(gable(2.0, 1.7, 0.9, -1.3, 1.6, 0.5, PALETTE.roof));
  parts.push(box(0.35, 0.6, 0.35, -0.7, 2.0, 0.5, PALETTE.stoneDark));  // chimney
  parts.push(cyl(0.1, 0.12, 3.0, 0.2, 0.2, -1.8, PALETTE.woodDark, 6));
  parts.push(rod(new THREE.Vector3(0.2, 3.1, -1.8), new THREE.Vector3(1.8, 2.7, -1.0), 0.1, PALETTE.woodDark));
  parts.push(rod(new THREE.Vector3(1.75, 2.7, -1.0), new THREE.Vector3(1.75, 1.4, -1.0), 0.03, PALETTE.mast));
  parts.push(...flag(-2.1, 0.2, -0.6, trim, 2.0));
  return parts;
}

function stronghold(trim) {
  const parts = [
    box(4.2, 0.25, 4.2, -0.3, 0, 0, PALETTE.stoneDark),
    // Curtain wall.
    box(3.6, 1.1, 0.35, -0.3, 0.25, 1.7, PALETTE.stone),
    box(3.6, 1.1, 0.35, -0.3, 0.25, -1.7, PALETTE.stone),
    box(0.35, 1.1, 3.4, -2.0, 0.25, 0, PALETTE.stone),
    box(0.35, 1.1, 1.2, 1.4, 0.25, 1.1, PALETTE.stone),
    box(0.35, 1.1, 1.2, 1.4, 0.25, -1.1, PALETTE.stone),
    // Keep.
    box(1.7, 2.6, 1.7, -0.5, 0.25, 0, PALETTE.stone),
    ...crenellations(1.7, 1.7, 2.85, PALETTE.stone).map((g) => g.translate(-0.5, 0, 0) && g),
    // Sea gate pier.
    ...pier(2.6, 1.1, 1.6),
  ];
  for (const [x, z] of [[-2.0, 1.7], [-2.0, -1.7], [1.4, 1.7], [1.4, -1.7]]) {
    parts.push(cyl(0.48, 0.55, 1.75, x, 0.25, z, PALETTE.stone, 8));
    parts.push(cyl(0.0, 0.62, 0.7, x, 2.0, z, PALETTE.roof, 8));
  }
  parts.push(...flag(-0.5, 3.05, 0, trim, 1.6));
  return parts;
}

function settlement(trim, seed = 1) {
  const rng = makeRng(seed);
  const parts = [box(3.2, 0.1, 2.6, 0, 0, 0, PALETTE.field)];
  // Furrows in the field.
  for (let i = 0; i < 4; i++) parts.push(box(1.3, 0.06, 0.12, 0.9, 0.1, -1.0 + i * 0.32, PALETTE.sandDark));
  const houses = [[-0.8, -0.5, 0], [-0.2, 0.75, Math.PI / 2], [0.7, -0.25, 0.3]];
  for (const [x, z, a] of houses) {
    const w = 0.9 + rng.range(0, 0.25);
    const d = 0.75;
    const h = 0.6 + rng.range(0, 0.15);
    const house = [
      box(w, h, d, 0, 0.1, 0, PALETTE.sail),
      gable(w, d, 0.55, 0, 0.1 + h, 0, rng.chance(0.5) ? PALETTE.thatch : PALETTE.roof),
      box(0.18, 0.4, 0.18, w * 0.25, 0.1 + h + 0.15, d * 0.2, PALETTE.stoneDark),
      box(0.2, 0.34, 0.04, 0, 0.1, d / 2 + 0.01, PALETTE.woodDark),
    ];
    for (const g of house) { g.rotateY(a); g.translate(x, 0, z); }
    parts.push(...house);
  }
  parts.push(...flag(1.3, 0.1, 0.9, trim, 1.1));
  return parts;
}

function watchtower(trim) {
  const parts = [];
  const legs = [[-0.5, -0.5], [0.5, -0.5], [-0.5, 0.5], [0.5, 0.5]];
  for (const [x, z] of legs) parts.push(rod(new THREE.Vector3(x * 1.3, 0, z * 1.3), new THREE.Vector3(x, 2.6, z), 0.14, PALETTE.woodDark));
  parts.push(rod(new THREE.Vector3(-0.6, 1.2, -0.6), new THREE.Vector3(0.6, 1.2, 0.6), 0.08, PALETTE.wood));
  parts.push(rod(new THREE.Vector3(0.6, 1.2, -0.6), new THREE.Vector3(-0.6, 1.2, 0.6), 0.08, PALETTE.wood));
  parts.push(box(1.4, 0.16, 1.4, 0, 2.6, 0, PALETTE.wood));
  parts.push(box(1.4, 0.35, 0.08, 0, 2.76, 0.66, PALETTE.woodDark));
  parts.push(box(1.4, 0.35, 0.08, 0, 2.76, -0.66, PALETTE.woodDark));
  parts.push(box(0.08, 0.35, 1.4, 0.66, 2.76, 0, PALETTE.woodDark));
  parts.push(box(0.08, 0.35, 1.4, -0.66, 2.76, 0, PALETTE.woodDark));
  for (const [x, z] of legs) parts.push(cyl(0.05, 0.05, 0.8, x * 1.2, 2.76, z * 1.2, PALETTE.woodDark, 4));
  parts.push(cyl(0, 1.15, 0.75, 0, 3.55, 0, PALETTE.roof, 4).rotateY(Math.PI / 4));
  parts.push(...flag(0, 4.25, 0, trim, 0.9));
  return parts;
}

function crossbowTower(trim) {
  const parts = [
    cyl(0.85, 1.05, 2.8, 0, 0, 0, PALETTE.stone, 8),
    cyl(1.05, 0.9, 0.3, 0, 2.8, 0, PALETTE.stoneDark, 8),
  ];
  for (let i = 0; i < 8; i += 2) {
    const a = (i / 8) * Math.PI * 2;
    parts.push(box(0.35, 0.35, 0.35, Math.cos(a) * 0.85, 3.1, Math.sin(a) * 0.85, PALETTE.stone));
  }
  // The crossbow: a stock and a bow.
  parts.push(box(1.1, 0.16, 0.18, 0.1, 3.2, 0, PALETTE.woodDark));
  parts.push(box(0.12, 0.12, 1.2, 0.55, 3.25, 0, PALETTE.wood));
  parts.push(box(0.2, 0.3, 0.06, 0, 1.4, 0.94, PALETTE.iron));   // arrow slit
  parts.push(...flag(-0.45, 3.1, -0.45, trim, 1.0));
  return parts;
}

function cannonBattery(trim) {
  const parts = [
    cyl(1.55, 1.75, 1.1, 0, 0, 0, PALETTE.stone, 10),
    cyl(1.6, 1.55, 0.18, 0, 1.1, 0, PALETTE.stoneDark, 10),
  ];
  for (let i = 0; i < 10; i += 2) {
    const a = (i / 10) * Math.PI * 2 + 0.3;
    parts.push(box(0.42, 0.3, 0.42, Math.cos(a) * 1.45, 1.28, Math.sin(a) * 1.45, PALETTE.stone));
  }
  for (const z of [-0.5, 0.5]) {
    parts.push(box(0.6, 0.3, 0.4, 0.2, 1.28, z, PALETTE.woodDark));
    const barrel = new THREE.CylinderGeometry(0.12, 0.16, 1.3, 7);
    barrel.rotateZ(-Math.PI / 2 + 0.12);
    barrel.translate(0.75, 1.68, z);
    parts.push(bakeColor(barrel, PALETTE.iron));
  }
  parts.push(...flag(-0.9, 1.28, 0, trim, 1.4));
  return parts;
}

/** Scaffolding: four poles and two rails at the given height, for anything under construction. */
export function scaffoldGeometry(w, h) {
  const parts = [];
  const c = [[-w / 2, -w / 2], [w / 2, -w / 2], [-w / 2, w / 2], [w / 2, w / 2]];
  for (const [x, z] of c) parts.push(cyl(0.06, 0.06, h, x, 0, z, PALETTE.wood, 4));
  for (const y of [h * 0.45, h * 0.9]) {
    parts.push(box(w, 0.07, 0.07, 0, y, -w / 2, PALETTE.wood));
    parts.push(box(w, 0.07, 0.07, 0, y, w / 2, PALETTE.wood));
    parts.push(box(0.07, 0.07, w, -w / 2, y, 0, PALETTE.wood));
    parts.push(box(0.07, 0.07, w, w / 2, y, 0, PALETTE.wood));
  }
  return merge(parts);
}

const BUILDERS = {
  port: { dock, shipyard, stronghold },
  tower: { watchtower, crossbowTower, cannonBattery },
};

/**
 * Models are written at "a person is about 0.6 tall" scale and then grown to sit on a hex 8 units
 * across: at 1:1 a dock was a crate on a beach next to a cutter. The 2D sprites fill most of their
 * hex, so these do too, without crowding a neighbour.
 */
const STRUCTURE_SCALE = { dock: 1.3, shipyard: 1.15, stronghold: 1.05, settlement: 1.35, watchtower: 1.2, crossbowTower: 1.25, cannonBattery: 1.2 };

/** Footprint/size per structure (after scaling), for selection rings, bars and scaffolds. */
export const STRUCTURE_SIZE = {
  dock: { r: 3.0, h: 2.8 }, shipyard: { r: 3.3, h: 3.7 }, stronghold: { r: 3.3, h: 4.8 },
  settlement: { r: 2.9, h: 2.4 },
  watchtower: { r: 1.9, h: 5.4 }, crossbowTower: { r: 2.0, h: 4.5 }, cannonBattery: { r: 2.4, h: 3.1 },
};

const cache = new Map();

export function structureGeometry(kind, type, owner, seed = 1) {
  const key = `${kind}:${type}:${owner}:${kind === 'settlement' ? seed % 4 : 0}`;
  if (cache.has(key)) return cache.get(key);
  const trim = ownerColor(owner);
  let parts;
  if (kind === 'settlement') parts = settlement(trim, (seed % 4) + 1);
  else parts = (BUILDERS[kind][type] || Object.values(BUILDERS[kind])[0])(trim);
  const geo = merge(parts);
  const k = STRUCTURE_SCALE[kind === 'settlement' ? 'settlement' : type] || 1;
  geo.scale(k, k, k);
  geo.computeBoundingSphere();
  cache.set(key, geo);
  return geo;
}

/** A flat owner-coloured hex under a structure — Grog's 2D faction hex, laid on the ground. */
export function factionHexGeometry() {
  return hexDisc(HEX_R * 0.92, 0, '#ffffff');
}
