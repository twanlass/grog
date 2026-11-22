import * as THREE from 'three';
import { PALETTE, SURF, ownerColor } from '../palette.js';
import { bakeColor, merge, box, cyl, gable, rod, line, plank, tube, blob, hexDisc } from '../util/geo.js';
import { makeRng } from '../util/rng.js';
import { HEX_R } from '../world.js';

// Ports, settlements and towers, in the same vocabulary as the ships. Each is built on its hex with
// its base at y = 0; `units.js` lifts it onto the tile's surface. Ports are built facing +X — the
// pier runs out that way — and are turned toward the open water at placement.
//
// Owner colour goes on flags, banners and awnings, which is what the 2D sprites colour, so a port
// reads as "red's" from across the map without the whole building being painted red.
//
// Second pass: the first cut was a shed and a plank. These are now places — timber-framed buildings
// with doors, lit windows and chimneys, quays stacked with cargo, cranes with rope and tackle,
// people at work — because a port is the thing a player looks at longest.

// --- Shared pieces ------------------------------------------------------------------------------

/** A banner on a pole, rippling away from the hoist. */
function flag(x, y, z, col, h = 1.4, w = 0.6) {
  const g = new THREE.BoxGeometry(w, w * 0.6, 0.03, 5, 1, 1);
  const pos = g.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const u = pos.getX(i) / w + 0.5;
    pos.setZ(i, pos.getZ(i) + Math.sin(u * 7) * 0.06 * u);
    pos.setY(i, pos.getY(i) - u * 0.05);
  }
  g.translate(x + w / 2 + 0.03, y + h - w * 0.3 - 0.04, z);
  return [
    cyl(0.03, 0.045, h, x, y, z, PALETTE.mast, 6),
    blob(0.06, x, y + h + 0.03, z, PALETTE.gold),
    bakeColor(g, col, { crease: 1.2, mat: SURF.cloth }),
  ];
}

function crenellations(w, d, y, col, step = 0.42, cx = 0, cz = 0) {
  const out = [];
  const nx = Math.max(2, Math.round(w / step));
  const nz = Math.max(2, Math.round(d / step));
  for (let i = 0; i < nx; i += 2) {
    const x = cx - w / 2 + (i + 0.5) * (w / nx);
    out.push(box(w / nx, 0.22, 0.2, x, y, cz + d / 2 - 0.1, col));
    out.push(box(w / nx, 0.22, 0.2, x, y, cz - d / 2 + 0.1, col));
  }
  for (let i = 0; i < nz; i += 2) {
    const z = cz - d / 2 + (i + 0.5) * (d / nz);
    out.push(box(0.2, 0.22, d / nz, cx + w / 2 - 0.1, y, z, col));
    out.push(box(0.2, 0.22, d / nz, cx - w / 2 + 0.1, y, z, col));
  }
  return out;
}

/** A pier on piles, running +X from x0: deck, edge beams, cross-braced piles, mooring bollards. */
function pier(len, width, x0, z = 0, y = 0.15) {
  const parts = [
    box(len, 0.08, width, x0 + len / 2, y, z, PALETTE.wood),
    box(len, 0.06, 0.08, x0 + len / 2, y + 0.05, z + width / 2, PALETTE.woodDark),
    box(len, 0.06, 0.08, x0 + len / 2, y + 0.05, z - width / 2, PALETTE.woodDark),
  ];
  const n = Math.floor(len / 0.8);
  for (let i = 0; i <= n; i++) {
    const x = x0 + i * 0.8 + 0.1;
    for (const s of [1, -1]) {
      parts.push(cyl(0.075, 0.085, 1.35 + (i % 2 ? 0.14 : 0), x, y - 1.2, z + s * (width / 2 - 0.02), PALETTE.timber, 7));
    }
    parts.push(box(0.07, 0.07, width, x, y - 0.14, z, PALETTE.timber));
    if (i < n) parts.push(line(x, y - 0.1, z + width / 2 - 0.02, x + 0.8, y - 0.75, z + width / 2 - 0.02, 0.04, PALETTE.timber));
  }
  // Bollards and a coil of rope at the head.
  parts.push(cyl(0.07, 0.06, 0.2, x0 + len - 0.15, y + 0.08, z + width / 2 - 0.15, PALETTE.iron, 7));
  parts.push(cyl(0.07, 0.06, 0.2, x0 + len - 0.15, y + 0.08, z - width / 2 + 0.15, PALETTE.iron, 7));
  parts.push(cyl(0.13, 0.13, 0.06, x0 + len * 0.6, y + 0.08, z - width / 2 + 0.22, PALETTE.rope, 8));
  return parts;
}

function crate(x, y, z, s = 0.34, yaw = 0, col = PALETTE.wood) {
  const parts = [
    box(s, s * 0.85, s, 0, 0, 0, col),
    box(s * 1.04, s * 0.08, s * 1.04, 0, s * 0.38, 0, PALETTE.timber),
    box(s * 0.1, s * 0.86, s * 1.04, s * 0.36, 0, 0, PALETTE.timber),
    box(s * 0.1, s * 0.86, s * 1.04, -s * 0.36, 0, 0, PALETTE.timber),
  ];
  for (const p of parts) { p.rotateY(yaw); p.translate(x, y, z); }
  return parts;
}

function barrel(x, y, z, r = 0.14, h = 0.3, col = PALETTE.wood) {
  return [
    cyl(r * 0.84, r * 0.84, h, x, y, z, col, 8),
    cyl(r, r, h * 0.5, x, y + h * 0.25, z, col, 8),
    cyl(r * 0.9, r * 0.9, 0.03, x, y + h * 0.12, z, PALETTE.iron, 8),
    cyl(r * 0.9, r * 0.9, 0.03, x, y + h * 0.85, z, PALETTE.iron, 8),
  ];
}

function sack(x, y, z, r = 0.14) {
  return [blob(r, x, y + r * 0.6, z, PALETTE.canvas, null, { sy: 0.65, detail: 1, mat: SURF.cloth, crease: 1.2 })];
}

/** A person: legs, shirt, arms, head, hat. A third of a unit tall, like the sailors. */
function person(x, y, z, shirt = PALETTE.shirt, hat = PALETTE.timber, yaw = 0) {
  const parts = [
    box(0.09, 0.13, 0.07, 0, 0, 0, PALETTE.timber, { mat: SURF.cloth }),
    box(0.11, 0.13, 0.08, 0, 0.13, 0, shirt, { mat: SURF.cloth }),
    box(0.035, 0.11, 0.035, 0, 0.14, 0.075, shirt, { mat: SURF.cloth }),
    box(0.035, 0.11, 0.035, 0, 0.14, -0.075, shirt, { mat: SURF.cloth }),
    blob(0.048, 0, 0.305, 0, PALETTE.skin, null, { mat: SURF.plain }),
    cyl(0.03, 0.062, 0.035, 0, 0.335, 0, hat, 6, { mat: SURF.cloth }),
  ];
  for (const p of parts) { p.rotateY(yaw); p.translate(x, y, z); }
  return parts;
}

function lampPost(x, y, z, h = 0.9) {
  return [
    cyl(0.025, 0.035, h, x, y, z, PALETTE.iron, 6),
    box(0.1, 0.13, 0.1, x, y + h, z, PALETTE.glass),
    cyl(0, 0.09, 0.07, x, y + h + 0.13, z, PALETTE.iron, 4),
  ];
}

/**
 * A building: a walled box under a gabled roof (ridge along X), dressed with a corner-post timber
 * frame, a door, lit windows, eaves boards and a chimney. Returned at the origin; callers turn and
 * place it with `put`.
 */
function house(w, h, d, { wall = PALETTE.plaster, roof = PALETTE.roof, frame = PALETTE.timber, roofH = d * 0.55,
  door = 'z', windows = 2, chimney = true, base = PALETTE.stoneDark, storeys = 1 } = {}) {
  const parts = [
    box(w + 0.06, 0.12, d + 0.06, 0, 0, 0, base),
    box(w, h, d, 0, 0.1, 0, wall),
    gable(w, d, roofH, 0, 0.1 + h, 0, roof, 0.14),
    box(w + 0.3, 0.05, 0.06, 0, 0.1 + h + roofH - 0.01, 0, frame),            // ridge board
  ];
  // Gable ends: the triangle under the roof, in the wall material.
  for (const s of [1, -1]) {
    const g = new THREE.BoxGeometry(0.04, roofH * 0.92, d * 0.96);
    const pos = g.attributes.position;
    for (let i = 0; i < pos.count; i++) if (pos.getY(i) > 0) pos.setZ(i, pos.getZ(i) * 0.02);
    g.translate(s * (w / 2 - 0.021), 0.1 + h + roofH * 0.46, 0);
    parts.push(bakeColor(g, wall));
  }
  if (frame) {
    for (const [x, z] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) parts.push(box(0.07, h, 0.07, x * (w / 2 - 0.01), 0.1, z * (d / 2 - 0.01), frame));
    for (let k = 1; k <= storeys; k++) {
      const y = 0.1 + (h * k) / storeys - 0.06;
      parts.push(box(w + 0.03, 0.06, d + 0.03, 0, y, 0, frame));
    }
    const nPost = Math.max(1, Math.round(w / 0.55));
    for (let i = 1; i < nPost; i++) for (const s of [1, -1]) parts.push(box(0.05, h, 0.03, -w / 2 + (w * i) / nPost, 0.1, s * (d / 2 + 0.005), frame));
  }
  const zf = d / 2 + 0.012;
  if (door === 'z') {
    parts.push(box(0.2, 0.32, 0.03, -w * 0.22, 0.1, zf, PALETTE.woodDark));
    parts.push(box(0.26, 0.04, 0.04, -w * 0.22, 0.42, zf, frame || PALETTE.timber));
  } else if (door === 'x') {
    parts.push(box(0.03, 0.42, 0.5, w / 2 + 0.012, 0.1, 0, PALETTE.woodDark));
  }
  for (let st = 0; st < storeys; st++) {
    const y = 0.1 + (h * st) / storeys + (h / storeys) * 0.45;
    for (let i = 0; i < windows; i++) {
      const x = -w / 2 + (w * (i + 0.5)) / windows + (st === 0 && door === 'z' && i === 0 ? w * 0.18 : 0);
      for (const s of [1, -1]) {
        if (s > 0 && st === 0 && door === 'z' && Math.abs(x + w * 0.22) < 0.22) continue;
        parts.push(box(0.15, 0.16, 0.02, x, y, s * zf, PALETTE.glass));
        parts.push(box(0.19, 0.03, 0.035, x, y - 0.03, s * zf, frame || PALETTE.timber));
        parts.push(box(0.02, 0.16, 0.03, x, y, s * (zf + 0.004), frame || PALETTE.timber));
      }
    }
  }
  if (chimney) {
    parts.push(box(0.17, roofH + 0.28, 0.17, w * 0.28, 0.1 + h, -d * 0.2, PALETTE.brick));
    const cap = box(0.21, 0.04, 0.21, w * 0.28, 0.1 + h + roofH + 0.28, -d * 0.2, PALETTE.stoneDark);
    cap.userData.smoke = true;      // structureGeometry reads where this ended up; effects smoke from it
    parts.push(cap);
  }
  return parts;
}

/** Turn parts about Y and move them. */
function put(parts, x, y, z, yaw = 0) {
  for (const p of parts) { if (yaw) p.rotateY(yaw); p.translate(x, y, z); }
  return parts;
}

/** A timber crane: post, braced jib, rope and a slung load. */
function crane(x, y, z, h = 2.6, reach = 1.5, yaw = 0) {
  const parts = [
    cyl(0.07, 0.1, h, 0, 0, 0, PALETTE.timber, 7),
    box(0.5, 0.1, 0.5, 0, 0, 0, PALETTE.stoneDark),
    line(0, h - 0.05, 0, reach, h + 0.35, 0, 0.09, PALETTE.timber),
    line(0, h * 0.55, 0, reach * 0.55, h + 0.14, 0, 0.06, PALETTE.timber),
    line(-0.45, h * 0.3, 0, 0, h - 0.1, 0, 0.05, PALETTE.timber),
    line(reach - 0.04, h + 0.33, 0, reach - 0.04, h * 0.42, 0, 0.018, PALETTE.rope),
    cyl(0.06, 0.06, 0.06, reach - 0.04, h + 0.3, 0, PALETTE.iron, 6),
    ...crate(reach - 0.04, h * 0.42 - 0.26, 0, 0.3, 0.4),
    cyl(0.16, 0.16, 0.12, -0.2, 0.55, 0, PALETTE.wood, 8),          // the winch drum
  ];
  return put(parts, x, y, z, yaw);
}

/** A rowing boat pulled up or moored: a tapered box with thwarts. */
function skiff(x, y, z, yaw = 0, len = 0.95) {
  const g = new THREE.BoxGeometry(len, 0.16, len * 0.4, 4, 1, 1);
  const pos = g.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const u = pos.getX(i) / len + 0.5;
    pos.setZ(i, pos.getZ(i) * (u > 0.6 ? 1 - ((u - 0.6) / 0.4) ** 2 * 0.9 : 0.85 + 0.15 * (u / 0.6)) * (pos.getY(i) < 0 ? 0.6 : 1));
    if (pos.getY(i) < 0 && u > 0.7) pos.setY(i, pos.getY(i) + (u - 0.7) * 0.3);
  }
  g.translate(0, 0.08, 0);
  const parts = [
    bakeColor(g, PALETTE.wood, { crease: 0.7 }),
    box(len * 0.8, 0.02, len * 0.26, -0.03, 0.14, 0, PALETTE.timber),
    box(0.05, 0.02, len * 0.34, 0.1, 0.16, 0, PALETTE.wood), box(0.05, 0.02, len * 0.32, -0.2, 0.16, 0, PALETTE.wood),
  ];
  return put(parts, x, y, z, yaw);
}

function awning(x, y, z, w, d, col, yaw = 0) {
  const g = new THREE.BoxGeometry(w, 0.03, d, 1, 1, 1);
  const pos = g.attributes.position;
  for (let i = 0; i < pos.count; i++) if (pos.getZ(i) > 0) pos.setY(i, pos.getY(i) - 0.22);
  const parts = [
    bakeColor(g, col, { mat: SURF.cloth }),
    line(-w / 2 + 0.03, -0.22, d / 2 - 0.02, -w / 2 + 0.03, -0.75, d / 2 - 0.02, 0.03, PALETTE.timber),
    line(w / 2 - 0.03, -0.22, d / 2 - 0.02, w / 2 - 0.03, -0.75, d / 2 - 0.02, 0.03, PALETTE.timber),
  ];
  return put(parts, x, y, z, yaw);
}

function logPile(x, y, z, yaw = 0, n = 3, len = 1.1) {
  const parts = [];
  let row = 0;
  for (let k = n; k > 0; k--, row++) {
    for (let i = 0; i < k; i++) parts.push(tube(0.075, 0.07, len, 0, 0.075 + row * 0.13, (i - (k - 1) / 2) * 0.155, 0, row % 2 ? PALETTE.wood : PALETTE.trunk, 7, { mat: SURF.wood }));
  }
  return put(parts, x, y, z, yaw);
}

// --- Ports --------------------------------------------------------------------------------------

function dock(trim) {
  return [
    // A stone-kerbed quay with a planked landing stage, and the pier out over the water.
    box(2.9, 0.16, 3.0, -0.55, 0, 0, PALETTE.stoneDark),
    box(2.7, 0.04, 2.8, -0.55, 0.16, 0, PALETTE.wood),
    ...pier(3.4, 1.05, 0.85, 0, 0.14),
    ...pier(1.5, 0.6, 0.85, 1.15, 0.14),                               // a side jetty for the boats
    // Harbour-master's house and a lean-to store.
    ...put(house(1.5, 0.95, 1.2, { windows: 2, roof: PALETTE.roof }), -1.05, 0.18, -0.65),
    ...put(house(0.9, 0.6, 0.8, { wall: PALETTE.wood, frame: null, roof: PALETTE.thatch, windows: 0, chimney: false, door: 'x', base: PALETTE.woodDark }), -1.25, 0.18, 0.8),
    ...awning(-0.05, 1.0, -0.4, 0.9, 0.7, trim, Math.PI / 2),
    // Cargo on the quay.
    ...crate(0.35, 0.2, 0.7, 0.4, 0.3), ...crate(0.72, 0.2, 0.95, 0.32, -0.2), ...crate(0.4, 0.54, 0.74, 0.3, 0.9, PALETTE.woodDark),
    ...barrel(-0.1, 0.2, 1.1), ...barrel(0.14, 0.2, 1.22, 0.13, 0.28), ...barrel(-0.25, 0.2, 0.86, 0.12, 0.26, PALETTE.woodDark),
    ...sack(0.05, 0.2, -0.45), ...sack(0.22, 0.2, -0.3, 0.12), ...sack(0.12, 0.34, -0.38, 0.11),
    ...lampPost(0.75, 0.2, -0.75), ...lampPost(4.1, 0.2, 0.42, 0.75),
    ...skiff(1.7, -0.12, 1.75, 0.2), ...skiff(1.2, 0.2, -1.05, 1.9, 0.8),
    ...person(0.55, 0.2, 0.2, trim, PALETTE.timber, 0.6), ...person(2.4, 0.22, -0.15, PALETTE.shirt, PALETTE.rope, 2.2),
    ...person(-0.35, 0.2, 0.35, PALETTE.canvas, PALETTE.timber, 1.4),
    ...flag(-1.9, 0.18, 1.3, trim, 2.1, 0.7),
  ];
}

function shipyard(trim) {
  const parts = [
    box(3.9, 0.18, 4.0, -0.75, 0, 0, PALETTE.stoneDark),
    box(3.7, 0.04, 3.8, -0.75, 0.18, 0, PALETTE.wood),
    ...pier(3.0, 1.1, 1.0, 1.3, 0.16),
    // Slipway: greased ways running down into the water, with a hull in frame on them.
    box(3.4, 0.1, 1.5, 1.5, 0.02, -0.9, PALETTE.woodDark),
    box(3.4, 0.07, 0.1, 1.5, 0.12, -1.35, PALETTE.timber), box(3.4, 0.07, 0.1, 1.5, 0.12, -0.45, PALETTE.timber),
  ];
  // The hull on the slip: keel, stem, ribs, and the first strakes of planking on the far side.
  parts.push(line(0.3, 0.26, -0.9, 2.7, 0.32, -0.9, 0.11, PALETTE.timber));
  parts.push(line(2.68, 0.3, -0.9, 3.0, 1.05, -0.9, 0.1, PALETTE.timber));
  parts.push(line(0.32, 0.26, -0.9, 0.22, 0.95, -0.9, 0.09, PALETTE.timber));
  for (let i = 0; i < 9; i++) {
    const x = 0.45 + i * 0.27;
    const w = 0.5 * Math.sin(Math.PI * Math.min(1, (i + 1.6) / 8.5)) ** 0.7;
    for (const s of [1, -1]) {
      parts.push(line(x, 0.3, -0.9, x, 0.55, -0.9 + s * w * 0.8, 0.055, PALETTE.wood));
      parts.push(line(x, 0.55, -0.9 + s * w * 0.8, x, 1.0, -0.9 + s * w, 0.055, PALETTE.wood));
    }
    if (i < 8) {
      const w2 = 0.5 * Math.sin(Math.PI * Math.min(1, (i + 2.6) / 8.5)) ** 0.7;
      parts.push(plank(x, -0.9 - w * 0.86, x + 0.27, -0.9 - w2 * 0.86, 0.42, 0.26, 0.03, PALETTE.wood));
      parts.push(plank(x, -0.9 - w, x + 0.27, -0.9 - w2, 0.92, 0.07, 0.04, PALETTE.timber));
      parts.push(plank(x, -0.9 + w, x + 0.27, -0.9 + w2, 0.92, 0.07, 0.04, PALETTE.timber));
    }
  }
  // Shores propping the hull, and staging alongside.
  for (const x of [0.9, 1.7, 2.4]) for (const s of [1, -1]) parts.push(line(x, 0.12, -0.9 + s * 0.95, x, 0.7, -0.9 + s * 0.5, 0.04, PALETTE.timber));
  parts.push(box(2.0, 0.04, 0.3, 1.5, 0.75, -0.1, PALETTE.wood));
  for (const x of [0.55, 1.5, 2.45]) parts.push(cyl(0.035, 0.035, 0.6, x, 0.18, -0.02, PALETTE.timber, 5));
  // The building hall: long, tall, open-fronted workshop with a sail loft and a smithy chimney.
  parts.push(...put(house(2.3, 1.45, 1.8, { wall: PALETTE.wood, frame: PALETTE.timber, roof: PALETTE.slate, windows: 3, storeys: 2, door: 'x', chimney: true, roofH: 0.95 }), -1.5, 0.2, 0.75));
  parts.push(...put(house(1.2, 0.7, 1.0, { wall: PALETTE.plaster, roof: PALETTE.roof, windows: 1, chimney: false }), -1.9, 0.2, -1.2));
  parts.push(...crane(0.1, 0.2, -1.95, 2.7, 1.6, -0.5));
  parts.push(...logPile(-0.4, 0.22, 2.3, 0.1, 4, 1.5), ...logPile(-0.2, 0.22, -0.2, Math.PI / 2, 3, 1.0));
  // Sawhorses with a plank on them, tools, a tar barrel, people.
  parts.push(box(1.0, 0.04, 0.22, 0.2, 0.52, 1.0, PALETTE.wood));
  for (const x of [-0.15, 0.55]) { parts.push(line(x, 0.22, 0.85, x, 0.52, 1.0, 0.04, PALETTE.timber)); parts.push(line(x, 0.22, 1.15, x, 0.52, 1.0, 0.04, PALETTE.timber)); }
  parts.push(...barrel(0.75, 0.22, 0.35, 0.14, 0.3, PALETTE.timber), ...crate(-0.2, 0.22, 0.4, 0.34, 0.5), ...sack(-0.55, 0.22, 0.2));
  parts.push(...lampPost(0.75, 0.22, 2.0), ...lampPost(-2.55, 0.22, 1.9, 1.0));
  parts.push(...person(0.2, 0.22, 0.75, PALETTE.shirt, PALETTE.timber, 3.1), ...person(1.2, 0.79, -0.1, trim, PALETTE.rope, 1.5),
    ...person(-0.55, 0.22, -0.7, PALETTE.canvas, PALETTE.timber, 0.4), ...person(2.2, 0.24, 1.35, PALETTE.shirt, PALETTE.rope, 2.0));
  parts.push(...skiff(2.6, -0.12, 2.15, -0.1));
  parts.push(...flag(-2.5, 0.2, -0.3, trim, 2.5, 0.8));
  return parts;
}

/** A round tower with a conical roof, an arrow slit and a lit window. */
function roundTower(x, z, h, r, roofCol, trim) {
  const parts = [
    cyl(r, r * 1.12, h, x, 0.25, z, PALETTE.stone, 10),
    cyl(r * 1.12, r, 0.14, x, 0.25 + h, z, PALETTE.stoneDark, 10),
    cyl(0, r * 1.25, r * 1.5, x, 0.39 + h, z, roofCol, 10, { crease: 0.3 }),
    blob(0.06, x, 0.39 + h + r * 1.5, z, PALETTE.gold),
  ];
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + 0.6;
    parts.push(box(0.07, 0.24, 0.07, x + Math.cos(a) * r * 0.99, 0.25 + h * 0.62, z + Math.sin(a) * r * 0.99, i % 2 ? PALETTE.glass : PALETTE.cannonball, { mat: i % 2 ? SURF.glow : SURF.plain }));
  }
  return parts;
}

function stronghold(trim) {
  const W = 1.75;      // half-size of the ward
  const parts = [
    // A battered stone plinth, flagged inside.
    box(4.5, 0.25, 4.5, -0.3, 0, 0, PALETTE.stoneDark),
    box(3.4, 0.03, 3.3, -0.3, 0.25, 0, PALETTE.stone),
    ...pier(2.7, 1.15, 1.75, 0, 0.16),
  ];
  // Curtain walls with a wall-walk and battlements; the seaward wall is pierced by the gate.
  const wallH = 1.15;
  const wall = (ax, az, bx, bz) => {
    parts.push(plank(ax, az, bx, bz, 0.25, wallH, 0.34, PALETTE.stone));
    parts.push(plank(ax, az, bx, bz, 0.25 + wallH, 0.05, 0.44, PALETTE.stoneDark));
    const len = Math.hypot(bx - ax, bz - az), n = Math.round(len / 0.36);
    for (let i = 0; i < n; i += 2) {
      const t = (i + 0.5) / n;
      const along = Math.abs(bx - ax) > Math.abs(bz - az);
      for (const s of [1, -1]) {
        parts.push(box(along ? len / n : 0.1, 0.2, along ? 0.1 : len / n, ax + (bx - ax) * t + (along ? 0 : s * 0.17), 0.3 + wallH, az + (bz - az) * t + (along ? s * 0.17 : 0), PALETTE.stone));
      }
    }
  };
  const cx = -0.3;
  wall(cx - W, W, cx + W, W); wall(cx - W, -W, cx + W, -W); wall(cx - W, -W, cx - W, W);
  wall(cx + W, W, cx + W, 0.55); wall(cx + W, -0.55, cx + W, -W);
  // Gatehouse over the sea gate: twin turrets, an arch, a portcullis and the owner's banner.
  parts.push(box(0.5, 1.75, 0.45, cx + W, 0.25, 0.72, PALETTE.stone), box(0.5, 1.75, 0.45, cx + W, 0.25, -0.72, PALETTE.stone));
  parts.push(box(0.5, 0.55, 1.1, cx + W, 1.45, 0, PALETTE.stone));
  parts.push(...crenellations(0.56, 1.95, 2.0, PALETTE.stone, 0.3, cx + W, 0));
  parts.push(box(0.06, 1.05, 0.95, cx + W + 0.05, 0.28, 0, PALETTE.iron));
  for (let i = -2; i <= 2; i++) parts.push(box(0.09, 1.05, 0.04, cx + W + 0.07, 0.28, i * 0.19, PALETTE.cannonball, { mat: SURF.metal }));
  parts.push(box(0.03, 0.7, 0.42, cx + W + 0.27, 1.2, 0, trim, { mat: SURF.cloth }));
  // Corner towers.
  for (const [x, z] of [[cx - W, W], [cx - W, -W], [cx + W, W], [cx + W, -W]]) parts.push(...roundTower(x, z, 1.85, 0.5, PALETTE.slate, trim));
  // The keep: a tall square tower on a spreading base with corner turrets and a lit great hall.
  const kx = cx - 0.45, kz = -0.1, kw = 1.7, kh = 2.7;
  parts.push(box(kw + 0.2, 0.35, kw + 0.2, kx, 0.25, kz, PALETTE.stoneDark));
  parts.push(box(kw, kh, kw, kx, 0.25, kz, PALETTE.stone));
  parts.push(box(kw + 0.16, 0.12, kw + 0.16, kx, 0.25 + kh, kz, PALETTE.stoneDark));
  parts.push(...crenellations(kw + 0.16, kw + 0.16, 0.37 + kh, PALETTE.stone, 0.34, kx, kz));
  for (const [sx, sz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
    parts.push(cyl(0.2, 0.2, 0.8, kx + sx * kw / 2, 0.25 + kh - 0.35, kz + sz * kw / 2, PALETTE.stone, 8));
    parts.push(cyl(0, 0.27, 0.45, kx + sx * kw / 2, 0.25 + kh + 0.45, kz + sz * kw / 2, PALETTE.slate, 8, { crease: 0.3 }));
  }
  for (const y of [1.1, 1.9]) for (const o of [-0.4, 0.4]) {
    parts.push(box(0.14, 0.26, 0.03, kx + o, y, kz + kw / 2 + 0.01, PALETTE.glass));
    parts.push(box(0.03, 0.26, 0.14, kx + kw / 2 + 0.01, y, kz + o, PALETTE.glass));
  }
  parts.push(box(0.03, 0.5, 0.36, kx + kw / 2 + 0.012, 0.28, kz, PALETTE.timber));
  parts.push(box(0.03, 0.9, 0.34, kx + kw / 2 + 0.03, 1.5, kz, trim, { mat: SURF.cloth }));
  // The ward: a barracks against the wall, a well, stores, a guard on the wall-walk.
  parts.push(...put(house(1.0, 0.55, 0.7, { roof: PALETTE.slate, windows: 1, chimney: true }), cx + 0.95, 0.27, 1.15, 0));
  parts.push(cyl(0.2, 0.22, 0.22, cx + 1.0, 0.28, -1.0, PALETTE.stone, 8), cyl(0.15, 0.15, 0.02, cx + 1.0, 0.44, -1.0, PALETTE.cannonball, 8, { mat: SURF.metal }));
  parts.push(...barrel(cx + 0.7, 0.28, -1.3), ...crate(cx + 1.3, 0.28, -1.3, 0.3, 0.4), ...lampPost(cx + 1.35, 0.28, 0.4, 0.8));
  parts.push(...person(cx + 1.2, 0.28, 0.0, trim, PALETTE.iron, 0), ...person(cx + W, 2.05, 0.3, trim, PALETTE.iron, 0), ...person(cx - W, 1.45, 0.6, trim, PALETTE.iron, 3.1));
  // Guns on the seaward wall.
  for (const z of [1.15, -1.15]) {
    parts.push(box(0.3, 0.1, 0.2, cx + W, 1.45, z, PALETTE.woodDark));
    parts.push(tube(0.06, 0.045, 0.5, cx + W + 0.14, 1.6, z, 0, PALETTE.iron));
  }
  parts.push(...flag(kx, 0.37 + kh, kz, trim, 1.8, 0.9));
  return parts;
}

// --- Settlement ---------------------------------------------------------------------------------

function settlement(trim, seed = 1) {
  const rng = makeRng(seed);
  const parts = [
    box(3.4, 0.08, 2.9, 0, 0, 0, PALETTE.field, { mat: SURF.thatch }),
    box(1.5, 0.03, 2.4, -0.55, 0.08, 0, PALETTE.sandDark),                      // the trodden yard
  ];
  // A ploughed field: ridges of earth with a crop coming up, behind a wattle fence.
  for (let i = 0; i < 6; i++) {
    parts.push(box(1.35, 0.07, 0.11, 0.95, 0.08, -1.1 + i * 0.26, PALETTE.cliff));
    if (i % 2 === 0) for (let k = 0; k < 6; k++) parts.push(blob(0.07, 0.4 + k * 0.22, 0.2, -1.1 + i * 0.26, PALETTE.leaf, null, { sy: 1.2 }));
    else for (let k = 0; k < 5; k++) parts.push(cyl(0.02, 0.05, 0.22, 0.5 + k * 0.24, 0.13, -1.1 + i * 0.26, PALETTE.hay, 5));
  }
  const fence = (ax, az, bx, bz) => {
    parts.push(plank(ax, az, bx, bz, 0.2, 0.03, 0.03, PALETTE.wood), plank(ax, az, bx, bz, 0.32, 0.03, 0.03, PALETTE.wood));
    const n = Math.max(1, Math.round(Math.hypot(bx - ax, bz - az) / 0.35));
    for (let i = 0; i <= n; i++) parts.push(box(0.045, 0.34, 0.045, ax + (bx - ax) * (i / n), 0.08, az + (bz - az) * (i / n), PALETTE.timber));
  };
  fence(0.2, -1.3, 1.65, -1.3); fence(1.65, -1.3, 1.65, 0.45); fence(0.2, 0.45, 1.65, 0.45);
  const houses = [[-0.95, -0.7, 0], [-0.75, 0.75, Math.PI / 2], [0.25, 0.95, 0.25]];
  houses.forEach(([x, z, a], i) => {
    const w = 0.95 + rng.range(0, 0.25), d = 0.75, h = 0.6 + rng.range(0, 0.15);
    const thatch = rng.chance(0.5);
    parts.push(...put(house(w, h, d, { roof: thatch ? PALETTE.thatch : PALETTE.roof, windows: i === 0 ? 2 : 1, chimney: true, roofH: thatch ? 0.6 : 0.5 }), x, 0.06, z, a));
  });
  // A well with a roof, a hay rick, a cart, firewood, the villagers, a banner.
  parts.push(cyl(0.16, 0.18, 0.2, -0.1, 0.08, -0.05, PALETTE.stone, 8), cyl(0.12, 0.12, 0.02, -0.1, 0.22, -0.05, PALETTE.cannonball, 8, { mat: SURF.metal }));
  parts.push(box(0.03, 0.42, 0.03, -0.27, 0.08, -0.05, PALETTE.timber), box(0.03, 0.42, 0.03, 0.07, 0.08, -0.05, PALETTE.timber));
  parts.push(gable(0.44, 0.3, 0.14, -0.1, 0.5, -0.05, PALETTE.thatch, 0.03));
  parts.push(blob(0.3, 1.25, 0.34, 0.95, PALETTE.hay, null, { sy: 1.15, detail: 1, mat: SURF.thatch, crease: 1.2 }));
  parts.push(box(0.5, 0.05, 0.3, -0.25, 0.22, -1.15, PALETTE.wood), box(0.5, 0.12, 0.03, -0.25, 0.27, -1.0, PALETTE.wood), box(0.5, 0.12, 0.03, -0.25, 0.27, -1.3, PALETTE.wood));
  for (const z of [-0.98, -1.32]) { const wh = new THREE.CylinderGeometry(0.11, 0.11, 0.03, 8); wh.rotateX(Math.PI / 2); wh.translate(-0.25, 0.19, z); parts.push(bakeColor(wh, PALETTE.timber)); }
  parts.push(...sack(-0.3, 0.27, -1.15, 0.11), ...barrel(-1.45, 0.08, 0.1, 0.11, 0.24), ...logPile(-1.5, 0.08, -0.15, Math.PI / 2, 3, 0.45));
  parts.push(...person(0.15, 0.08, 0.3, PALETTE.shirt, PALETTE.hay, 0.4), ...person(0.9, 0.12, -0.5, PALETTE.canvas, PALETTE.hay, 2.0), ...person(-0.45, 0.08, 0.15, trim, PALETTE.timber, 1.2));
  parts.push(...flag(1.45, 0.08, 1.25, trim, 1.5, 0.55));
  return parts;
}

// --- Towers -------------------------------------------------------------------------------------

function watchtower(trim) {
  const parts = [];
  const legs = [[-0.5, -0.5], [0.5, -0.5], [-0.5, 0.5], [0.5, 0.5]];
  for (const [x, z] of legs) {
    parts.push(line(x * 1.35, 0, z * 1.35, x, 2.6, z, 0.14, PALETTE.timber));
    parts.push(box(0.3, 0.1, 0.3, x * 1.35, 0, z * 1.35, PALETTE.stoneDark));
  }
  // Cross bracing on all four faces, in two tiers, and a ladder up the front.
  for (const [y0, y1, k0, k1] of [[0.15, 1.3, 1.3, 0.92], [1.3, 2.45, 0.92, 0.55]]) {
    for (const [ax, az, bx, bz] of [[-1, -1, 1, -1], [1, -1, 1, 1], [1, 1, -1, 1], [-1, 1, -1, -1]]) {
      parts.push(line(ax * 0.5 * k0 / 0.5 * 0.5, y0, az * k0 * 0.5, bx * k1 * 0.5, y1, bz * k1 * 0.5, 0.06, PALETTE.wood));
      parts.push(line(bx * k0 * 0.5, y0, bz * k0 * 0.5, ax * k1 * 0.5, y1, az * k1 * 0.5, 0.06, PALETTE.wood));
    }
    parts.push(box(k1 * 1.0 + 0.1, 0.07, k1 * 1.0 + 0.1, 0, y1, 0, PALETTE.timber));
  }
  for (const s of [1, -1]) parts.push(line(s * 0.14, 0, 0.85, s * 0.14, 2.62, 0.62, 0.04, PALETTE.wood));
  for (let i = 1; i < 12; i++) parts.push(box(0.3, 0.03, 0.03, 0, i * 0.215, 0.85 - (i / 12) * 0.23, PALETTE.wood));
  // The platform: deck, railing with balusters, corner posts and a shingled cap.
  parts.push(box(1.6, 0.1, 1.6, 0, 2.6, 0, PALETTE.wood));
  for (const [ax, az, bx, bz] of [[-0.76, -0.76, 0.76, -0.76], [0.76, -0.76, 0.76, 0.76], [0.76, 0.76, -0.76, 0.76], [-0.76, 0.76, -0.76, -0.76]]) {
    parts.push(plank(ax, az, bx, bz, 2.7, 0.28, 0.04, PALETTE.woodDark), plank(ax, az, bx, bz, 3.0, 0.04, 0.07, PALETTE.wood));
  }
  for (const [x, z] of legs) parts.push(cyl(0.05, 0.05, 1.2, x * 1.42, 2.7, z * 1.42, PALETTE.timber, 5));
  parts.push(cyl(0, 1.22, 0.8, 0, 3.87, 0, PALETTE.roof, 4, { crease: 0 }).rotateY(Math.PI / 4));
  parts.push(box(1.56, 0.05, 1.56, 0, 3.85, 0, PALETTE.timber));
  // A signal brazier, a bell, a lookout.
  parts.push(cyl(0.12, 0.08, 0.1, 0.45, 2.92, -0.45, PALETTE.iron, 6), blob(0.09, 0.45, 3.06, -0.45, PALETTE.glass, null, { mat: SURF.glow }));
  parts.push(line(0.45, 2.7, -0.45, 0.45, 2.92, -0.45, 0.03, PALETTE.iron));
  parts.push(...person(-0.2, 2.7, 0.3, trim, PALETTE.iron, 0.8));
  parts.push(...flag(0, 4.63, 0, trim, 1.0, 0.55));
  return parts;
}

function crossbowTower(trim) {
  const parts = [
    cyl(1.12, 1.3, 0.3, 0, 0, 0, PALETTE.stoneDark, 12),
    cyl(0.85, 1.05, 2.6, 0, 0.2, 0, PALETTE.stone, 12),
    // Corbelled head: the top steps out on a ring of brackets.
    cyl(1.1, 0.86, 0.3, 0, 2.75, 0, PALETTE.stoneDark, 12),
    cyl(1.1, 1.1, 0.1, 0, 3.05, 0, PALETTE.stone, 12),
  ];
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    if (i % 2 === 0) parts.push(put([box(0.36, 0.3, 0.16, 0, 0, 0, PALETTE.stone)], Math.cos(a) * 1.02, 3.15, Math.sin(a) * 1.02, -a + Math.PI / 2)[0]);
    parts.push(put([box(0.1, 0.2, 0.2, 0, 0, 0, PALETTE.stoneDark)], Math.cos(a) * 0.95, 2.6, Math.sin(a) * 0.95, -a + Math.PI / 2)[0]);
  }
  // Arrow slits, a lit window and a door with steps.
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + 0.4;
    parts.push(put([box(0.07, 0.42, 0.06, 0, 0, 0, PALETTE.cannonball, { mat: SURF.plain })], Math.cos(a) * 0.95, 1.5, Math.sin(a) * 0.95, -a + Math.PI / 2)[0]);
  }
  parts.push(box(0.05, 0.5, 0.32, 1.02, 0.3, 0, PALETTE.timber), box(0.3, 0.14, 0.5, 1.2, 0.16, 0, PALETTE.stoneDark));
  parts.push(box(0.05, 0.2, 0.14, 0.93, 2.0, 0.25, PALETTE.glass));
  // The engine: a great crossbow on a turning mount, with a rack of bolts.
  parts.push(cyl(0.12, 0.16, 0.3, 0, 3.15, 0, PALETTE.timber, 7));
  parts.push(box(1.25, 0.12, 0.16, 0.12, 3.45, 0, PALETTE.woodDark));
  parts.push(line(0.62, 3.52, 0, 0.3, 3.52, 0.72, 0.07, PALETTE.wood), line(0.62, 3.52, 0, 0.3, 3.52, -0.72, 0.07, PALETTE.wood));
  parts.push(line(0.3, 3.52, 0.72, -0.25, 3.52, 0, 0.015, PALETTE.rope), line(0.3, 3.52, -0.72, -0.25, 3.52, 0, 0.015, PALETTE.rope));
  parts.push(line(-0.3, 3.58, 0, 0.8, 3.58, 0, 0.03, PALETTE.iron));
  for (let i = 0; i < 4; i++) parts.push(line(-0.55, 3.15, -0.5 + i * 0.07, -0.5, 3.6, -0.5 + i * 0.07, 0.02, PALETTE.wood));
  parts.push(...person(-0.3, 3.15, 0.35, trim, PALETTE.iron, 0.3));
  parts.push(...flag(-0.55, 3.15, -0.55, trim, 1.3, 0.55));
  return parts;
}

function cannonBattery(trim) {
  const parts = [
    cyl(1.9, 2.05, 0.3, 0, 0, 0, PALETTE.stoneDark, 14),
    cyl(1.6, 1.8, 1.0, 0, 0.2, 0, PALETTE.stone, 14),
    cyl(1.66, 1.6, 0.14, 0, 1.15, 0, PALETTE.stoneDark, 14),
    cyl(1.45, 1.45, 0.03, 0, 1.28, 0, PALETTE.stone, 14),
  ];
  // Parapet with embrasures for the guns facing +X.
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * Math.PI * 2 + Math.PI / 14;
    const facing = Math.cos(a) > 0.55;
    if (facing && i % 2 === 0) continue;
    parts.push(put([box(0.5, 0.36, 0.24, 0, 0, 0, PALETTE.stone)], Math.cos(a) * 1.5, 1.28, Math.sin(a) * 1.5, -a + Math.PI / 2)[0]);
  }
  // Three guns on wheeled carriages, shot piled between them, powder kegs under cover.
  for (const [z, yaw] of [[-0.75, 0.32], [0, 0], [0.75, -0.32]]) {
    const g = [
      box(0.62, 0.12, 0.36, 0, 0, 0, PALETTE.woodDark), box(0.3, 0.1, 0.3, -0.12, 0.12, 0, PALETTE.woodDark),
      tube(0.13, 0.085, 1.25, 0.3, 0.32, 0, 0, PALETTE.iron, 8),
      tube(0.14, 0.14, 0.06, -0.3, 0.32, 0, 0, PALETTE.iron, 8), tube(0.1, 0.1, 0.05, 0.9, 0.32, 0, 0, PALETTE.iron, 8),
    ];
    for (const [wx, wz] of [[0.2, 0.2], [0.2, -0.2], [-0.2, 0.2], [-0.2, -0.2]]) {
      const wh = new THREE.CylinderGeometry(0.1, 0.1, 0.05, 8); wh.rotateX(Math.PI / 2); wh.translate(wx, 0.06, wz);
      g.push(bakeColor(wh, PALETTE.timber));
    }
    parts.push(...put(g, 0.55, 1.31, z, yaw));
  }
  for (const [x, z] of [[0.0, 0.42], [0.0, -0.42]]) {
    for (const [dx, dz, dy] of [[0, 0, 0], [0.11, 0, 0], [0.055, 0.1, 0], [0.055, 0.035, 0.09]]) parts.push(blob(0.06, x + dx, 1.37 + dy, z + dz, PALETTE.cannonball, null, { detail: 1, crease: 1.2 }));
  }
  parts.push(...barrel(-0.9, 1.31, 0.4, 0.13, 0.28, PALETTE.timber), ...barrel(-1.0, 1.31, 0.1, 0.13, 0.28, PALETTE.timber), ...crate(-0.85, 1.31, -0.4, 0.3, 0.3));
  parts.push(...awning(-0.95, 2.1, 0.05, 1.0, 0.9, trim, -Math.PI / 2));
  parts.push(box(0.05, 0.45, 0.3, -1.72, 0.3, 0, PALETTE.timber));      // sally port
  parts.push(...person(-0.15, 1.31, -0.7, trim, PALETTE.iron, 0.2), ...person(-0.2, 1.31, 0.75, trim, PALETTE.iron, -0.3));
  parts.push(...lampPost(-0.6, 1.31, -0.95, 0.7));
  parts.push(...flag(-1.15, 1.31, -0.75, trim, 1.9, 0.7));
  return parts;
}

/** Scaffolding: poles, ledgers, cross braces and a plank walk, for anything under construction. */
export function scaffoldGeometry(w, h) {
  const parts = [];
  const c = [[-w / 2, -w / 2], [w / 2, -w / 2], [-w / 2, w / 2], [w / 2, w / 2], [0, -w / 2], [0, w / 2], [-w / 2, 0], [w / 2, 0]];
  for (const [x, z] of c) parts.push(cyl(0.05, 0.06, h, x, 0, z, PALETTE.wood, 5));
  for (const y of [h * 0.3, h * 0.6, h * 0.9]) {
    parts.push(box(w, 0.06, 0.06, 0, y, -w / 2, PALETTE.wood), box(w, 0.06, 0.06, 0, y, w / 2, PALETTE.wood));
    parts.push(box(0.06, 0.06, w, -w / 2, y, 0, PALETTE.wood), box(0.06, 0.06, w, w / 2, y, 0, PALETTE.wood));
  }
  parts.push(box(w, 0.04, 0.3, 0, h * 0.6 + 0.06, w / 2 - 0.15, PALETTE.woodDark), box(0.3, 0.04, w, -w / 2 + 0.15, h * 0.6 + 0.06, 0, PALETTE.woodDark));
  parts.push(line(-w / 2, 0, w / 2, 0, h * 0.6, w / 2, 0.04, PALETTE.wood), line(0, 0, -w / 2, w / 2, h * 0.6, -w / 2, 0.04, PALETTE.wood));
  parts.push(line(w / 2, 0, -w / 2, w / 2, h * 0.6, 0, 0.04, PALETTE.wood));
  return merge(parts);
}

const BUILDERS = {
  port: { dock, shipyard, stronghold },
  tower: { watchtower, crossbowTower, cannonBattery },
};

/**
 * Models are written at "a person is a third of a unit tall" scale and then grown to sit on a hex 8
 * units across: at 1:1 a dock was a crate on a beach next to a cutter. The 2D sprites fill most of
 * their hex, so these do too, without crowding a neighbour.
 */
const STRUCTURE_SCALE = { dock: 1.3, shipyard: 1.15, stronghold: 1.05, settlement: 1.35, watchtower: 1.2, crossbowTower: 1.25, cannonBattery: 1.2 };

/** Footprint/size per structure (after scaling), for selection rings, bars and scaffolds. */
export const STRUCTURE_SIZE = {
  dock: { r: 3.0, h: 2.8 }, shipyard: { r: 3.3, h: 3.7 }, stronghold: { r: 3.3, h: 4.8 },
  settlement: { r: 2.9, h: 2.4 },
  watchtower: { r: 1.9, h: 5.4 }, crossbowTower: { r: 2.0, h: 4.8 }, cannonBattery: { r: 2.4, h: 3.1 },
};

const cache = new Map();

export function structureGeometry(kind, type, owner, seed = 1) {
  const key = `${kind}:${type}:${owner}:${kind === 'settlement' ? seed % 4 : 0}`;
  if (cache.has(key)) return cache.get(key);
  const trim = ownerColor(owner);
  let parts;
  if (kind === 'settlement') parts = settlement(trim, (seed % 4) + 1);
  else parts = (BUILDERS[kind][type] || Object.values(BUILDERS[kind])[0])(trim);
  // Chimney tops, found after every `put` has moved them: where the hearth smoke rises from.
  const smoke = [];
  for (const part of parts) {
    if (!part.userData.smoke) continue;
    part.computeBoundingBox();
    const b = part.boundingBox;
    smoke.push({ x: (b.min.x + b.max.x) / 2, y: b.max.y, z: (b.min.z + b.max.z) / 2 });
  }
  const geo = merge(parts);
  const k = STRUCTURE_SCALE[kind === 'settlement' ? 'settlement' : type] || 1;
  geo.scale(k, k, k);
  geo.userData.smoke = smoke.map((a) => ({ x: a.x * k, y: a.y * k, z: a.z * k }));
  geo.computeBoundingSphere();
  cache.set(key, geo);
  return geo;
}

/** A flat owner-coloured hex under a structure — Grog's 2D faction hex, laid on the ground. */
export function factionHexGeometry() {
  return hexDisc(HEX_R * 0.92, 0, '#ffffff');
}
