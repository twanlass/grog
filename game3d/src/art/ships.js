import * as THREE from 'three';
import { PALETTE, ownerColor } from '../palette.js';
import { bakeColor, merge, box, cyl, rod } from '../util/geo.js';

// Grog's fleet, generated in code the way sim-taxi builds its boats (geometry/boat.js): hulls are a
// segmented box drawn in along its length, everything else is boxes and cylinders, every part is
// `bakeColor`ed and the lot merges into one geometry per (type, owner).
//
// The bow points +X — Grog's heading 0 ("east"). Lengths are set against a hex 8 units across:
// the cutter is a dinghy that fits twice in a hex, the galleon nearly fills one, and the spread
// between them is the spread between their sprites in 2D. The owner colour goes where the 2D
// sprites put it: the stripe along the sheer, the pennant, and a band on the sails. Pirates sail
// black.

/**
 * A hull, as a box drawn in along X. `plan[k]` is the beam fraction at station k from stern to bow;
 * `rake[k]` lifts the keel there so the bow climbs out of the water. Positive per-vertex scaling
 * keeps handedness and the rake only ever raises a bottom vertex to below the top, so no face can
 * turn over (sim-taxi's hullPiece, same argument).
 */
function hullPiece(len, beam, y0, y1, plan, rake, col) {
  const segs = plan.length - 1;
  const g = new THREE.BoxGeometry(len, y1 - y0, beam, segs, 1, 1);
  g.translate(0, (y0 + y1) / 2, 0);
  const pos = g.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const k = Math.round((pos.getX(i) / len + 0.5) * segs);
    pos.setZ(i, pos.getZ(i) * plan[k]);
    if (rake && pos.getY(i) < y1 - 1e-6) pos.setY(i, Math.min(y0 + rake[k], y1 - 0.03));
  }
  return bakeColor(g, col);
}

/**
 * Hull, owner stripe and deck, stacked so the deck's top face covers the stripe's: the stripe shows
 * as a band down the sides and a hairline from above, not as a painted deck. (The first cut stacked
 * a solid stripe over the deck and every ship read as a red, green or blue tub.)
 */
function hullStack(L, B, y0, top, plan, rake, trim) {
  return [
    hullPiece(L, B, y0, top - 0.14, plan, rake, PALETTE.hull),
    hullPiece(L, B * 1.03, top - 0.14, top - 0.02, plan, null, trim),
    hullPiece(L, B, top - 0.02, top + 0.02, plan, null, PALETTE.wood),
  ];
}

/** A stern-to-bow plan: square-ish stern, full midships, a rounded bow ending at `tip`. */
function makePlan(n, { stern = 0.78, tip = 0.12, bowFrac = 0.32 } = {}) {
  const plan = [];
  const rake = [];
  for (let k = 0; k < n; k++) {
    const u = k / (n - 1);
    const toBow = Math.max(0, (u - (1 - bowFrac)) / bowFrac);  // 0 until the bow, 1 at the stem
    const fromStern = Math.min(1, u / 0.18);
    plan.push(Math.min(stern + (1 - stern) * fromStern, tip + (1 - tip) * Math.sqrt(Math.max(0, 1 - toBow * toBow))));
    rake.push(0.55 * toBow * toBow + 0.08 * (1 - fromStern));
  }
  return { plan, rake };
}

/**
 * A square sail: a thin sheet across the hull, bellied forward, its yard braced round `BRACE`.
 * Bracing is what real square-riggers do on most points of sail, and it is also what keeps a
 * brigantine readable from this camera: square-on, a ship sailing east or west shows its sails
 * edge-on and reads as bare masts.
 */
const BRACE = 0.5;
function squareSail(x, y, w, h, col, belly = 0.22) {
  const g = new THREE.BoxGeometry(0.05, h, w, 1, 3, 4);
  const pos = g.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const zz = pos.getZ(i) / (w / 2);
    const yy = pos.getY(i) / (h / 2);
    pos.setX(i, pos.getX(i) + belly * (1 - zz * zz) * (1 - 0.35 * yy * yy));
  }
  g.rotateY(BRACE);
  g.translate(x, y + h / 2, 0);
  return bakeColor(g, col);
}

/** An owner-colour band across a braced square sail, just forward of its belly. */
function band(x, y, w, col) {
  const g = new THREE.BoxGeometry(0.08, 0.2, w);
  g.translate(0.24, 0.1, 0);
  g.rotateY(BRACE);
  g.translate(x - 0.12, y, 0);
  return bakeColor(g, col);
}

/** A fore-and-aft (gaff) sail aft of a mast: a trapezoid sheet in the hull's plane. */
function gaffSail(x, y, foot, h, col, headFrac = 0.62, belly = 0.12) {
  const g = new THREE.BoxGeometry(foot, h, 0.05, 3, 3, 1);
  const pos = g.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    // u runs from the +X end (the mast) aft, so the remap below stays increasing in x — a
    // decreasing one would mirror the sheet and turn every face inside out.
    const u = 0.5 - (pos.getX(i) / foot);               // 0 at the mast, 1 at the clew
    const v = (pos.getY(i) / h) + 0.5;                  // 0 at the foot, 1 at the head
    pos.setX(i, foot / 2 - (u * (1 - v * (1 - headFrac))) * foot);
    pos.setZ(i, pos.getZ(i) + belly * Math.sin(Math.PI * u) * Math.sin(Math.PI * Math.min(1, v + 0.15)));
  }
  g.translate(x - foot / 2, y + h / 2, 0);   // mast end lands on x, clew aft at x - foot
  return bakeColor(g, col);
}

/** A triangular jib from the bowsprit to the foremast. */
function jib(xTack, xMast, y, h, col) {
  const foot = xTack - xMast;
  const g = new THREE.BoxGeometry(foot, h, 0.05, 2, 2, 1);
  const pos = g.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const u = (pos.getX(i) / foot) + 0.5;
    const v = (pos.getY(i) / h) + 0.5;
    pos.setX(i, (u * (1 - v)) * foot - foot / 2);
  }
  g.translate(xMast + foot / 2, y + h / 2, 0);
  return bakeColor(g, col);
}

function pennant(x, yTop, col, long = 0.7) {
  const g = new THREE.BoxGeometry(long, 0.28, 0.03, 2, 1, 1);
  const pos = g.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const u = pos.getX(i) / long + 0.5;
    pos.setY(i, pos.getY(i) * (1 - 0.7 * u));
  }
  g.translate(x - long / 2, yTop - 0.18, 0);
  return bakeColor(g, col);
}

function mast(x, y0, h, r = 0.07) {
  return cyl(r * 0.7, r, h, x, y0, 0, PALETTE.mast, 6);
}

/** Gun ports: dark squares along both sides of a hull band. */
function gunPorts(x0, x1, y, halfBeam, n, col = PALETTE.iron) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const x = x0 + (x1 - x0) * (n === 1 ? 0.5 : i / (n - 1));
    out.push(box(0.16, 0.14, halfBeam * 2 + 0.04, x, y, 0, col));
  }
  return out;
}

// --- The five hulls -----------------------------------------------------------------------------

const DECK = 0.42;   // deck height above the waterline, cutter scale

function cutter(trim, sail) {
  const L = 3.0, B = 1.15;
  const { plan, rake } = makePlan(9, { stern: 0.7 });
  return [
    ...hullStack(L, B, -0.25, DECK, plan, rake, trim),
    mast(0.15, DECK, 2.5),
    rod(new THREE.Vector3(L * 0.45, DECK, 0), new THREE.Vector3(L * 0.8, DECK + 0.15, 0), 0.06, PALETTE.mast),
    gaffSail(0.1, DECK + 0.25, 1.5, 1.9, sail),
    jib(L * 0.78, 0.18, DECK + 0.2, 1.8, sail),
    box(0.95, 0.16, 0.22, -0.47, DECK + 1.4, 0.05, trim), // sail band, abaft the mast
    pennant(0.15, DECK + 2.5, trim),
  ];
}

function schooner(trim, sail) {
  const L = 4.1, B = 1.45;
  const { plan, rake } = makePlan(11);
  return [
    ...hullStack(L, B, -0.3, DECK + 0.1, plan, rake, trim),
    box(0.7, 0.32, B * 0.6, -1.25, DECK, 0, PALETTE.woodDark), // deckhouse
    mast(0.75, DECK, 3.1),
    mast(-0.45, DECK, 3.5),
    rod(new THREE.Vector3(L * 0.45, DECK + 0.1, 0), new THREE.Vector3(L * 0.75, DECK + 0.25, 0), 0.07, PALETTE.mast),
    gaffSail(0.72, DECK + 0.35, 1.05, 2.4, sail),
    gaffSail(-0.48, DECK + 0.35, 1.45, 2.8, sail),
    jib(L * 0.73, 0.8, DECK + 0.3, 2.3, sail),
    box(1.0, 0.18, 0.22, -1.04, DECK + 2.0, 0.05, trim),
    pennant(-0.45, DECK + 3.5, trim, 0.9),
  ];
}

function brigantine(trim, sail) {
  const L = 4.4, B = 1.5;
  const { plan, rake } = makePlan(11, { tip: 0.08, bowFrac: 0.36 });
  return [
    ...hullStack(L, B, -0.3, DECK + 0.15, plan, rake, trim),
    mast(0.85, DECK, 3.4),
    mast(-0.55, DECK, 3.6),
    rod(new THREE.Vector3(L * 0.45, DECK + 0.1, 0), new THREE.Vector3(L * 0.8, DECK + 0.35, 0), 0.07, PALETTE.mast),
    squareSail(0.85, DECK + 0.55, 1.9, 1.15, sail),
    squareSail(0.85, DECK + 1.85, 1.5, 0.95, sail),
    band(0.95, DECK + 1.25, 1.95, trim), // band across the course
    gaffSail(-0.58, DECK + 0.4, 1.5, 2.7, sail),
    jib(L * 0.78, 0.9, DECK + 0.35, 2.4, sail),
    pennant(-0.55, DECK + 3.6, trim, 1.0),
  ];
}

function galleon(trim, sail) {
  const L = 5.6, B = 2.0;
  const { plan, rake } = makePlan(13, { stern: 0.86, tip: 0.1, bowFrac: 0.3 });
  const parts = [
    ...hullStack(L, B, -0.35, DECK + 0.35, plan, rake, trim),
    // Stern castle and forecastle.
    box(1.3, 0.75, B * 0.86, -L / 2 + 0.75, DECK + 0.3, 0, PALETTE.woodDark),
    box(1.32, 0.12, B * 0.9, -L / 2 + 0.75, DECK + 1.05, 0, trim),
    box(0.8, 0.4, B * 0.62, L / 2 - 1.2, DECK + 0.3, 0, PALETTE.woodDark),
    ...gunPorts(-1.6, 1.6, DECK - 0.05, B * 0.46, 5),
    mast(1.35, DECK + 0.3, 3.5, 0.08),
    mast(0.0, DECK + 0.3, 4.4, 0.1),
    mast(-1.45, DECK + 1.1, 2.8, 0.07),
    rod(new THREE.Vector3(L * 0.42, DECK + 0.3, 0), new THREE.Vector3(L * 0.75, DECK + 0.6, 0), 0.08, PALETTE.mast),
    squareSail(1.35, DECK + 0.95, 2.4, 1.3, sail, 0.28),
    squareSail(1.35, DECK + 2.4, 1.8, 0.95, sail, 0.22),
    squareSail(0.0, DECK + 1.05, 2.8, 1.5, sail, 0.3),
    squareSail(0.0, DECK + 2.75, 2.1, 1.15, sail, 0.24),
    band(0.12, DECK + 1.7, 2.85, trim),
    band(1.47, DECK + 1.5, 2.45, trim),
    gaffSail(-1.48, DECK + 1.5, 1.2, 1.9, sail),
    pennant(0.0, DECK + 4.7, trim, 1.2),
    pennant(1.35, DECK + 3.8, trim, 0.8),
  ];
  return parts;
}

function pirate(trim, sail) {
  // The legacy 'pirate' hull: a schooner under black canvas with a red band.
  return schooner(PALETTE.healthBad, sail).concat([
    box(0.5, 0.45, 0.2, -1.05, DECK + 1.3, 0.05, PALETTE.sail), // a pale patch on the main — the skull, at 20px
  ]);
}

const BUILDERS = { cutter, schooner, brigantine, galleon, pirate };

/** Overall length per type, for selection rings, health bars and hit flashes. */
export const SHIP_SIZE = { cutter: 3.0, schooner: 4.1, brigantine: 4.4, galleon: 5.6, pirate: 4.1 };
export const SHIP_HEIGHT = { cutter: 3.0, schooner: 3.9, brigantine: 4.0, galleon: 5.1, pirate: 3.9 };

const cache = new Map();

/** One merged geometry per (type, owner). Built once, shared by every ship like it. */
export function shipGeometry(type, owner) {
  const key = `${type}:${owner}`;
  if (cache.has(key)) return cache.get(key);
  const build = BUILDERS[type] || cutter;
  const isPirate = owner === 'pirate' || type === 'pirate';
  const trim = ownerColor(owner);
  const sail = isPirate ? PALETTE.pirateSail : PALETTE.sail;
  const geo = merge(build(trim, sail));
  geo.computeBoundingSphere();
  cache.set(key, geo);
  return geo;
}

export const SHIP_TYPES = Object.keys(BUILDERS);
