import * as THREE from 'three';
import { PALETTE, SURF, ownerColor } from '../palette.js';
import { bakeColor, merge, box, cyl, rod, line, plank, tube, blob } from '../util/geo.js';

// Grog's fleet, generated in code the way sim-taxi builds its boats (geometry/boat.js): hulls are a
// segmented box drawn in along its length, everything else is boxes, cylinders and rods, every part
// is baked with a colour and a surface kind, and the lot merges into one geometry per (type, owner).
//
// The bow points +X — Grog's heading 0 ("east"). Lengths are set against a hex 8 units across: the
// cutter is a dinghy that fits twice in a hex, the galleon nearly fills one. The owner colour goes
// where the 2D sprites put it: the stripe along the sheer, the ensign and pennants, and a band on
// the sails. Pirates sail black.
//
// Second pass. The first cut was a hull, a deck and sheets for sails. What makes a ship read as a
// ship up close is everything that pass left out, so each hull now carries bulwarks round a sunken
// deck, wales, a keel, stem and rudder; masts in two parts with a top between them; a yard for
// every square sail and a gaff and boom for every fore-and-aft one; shrouds with ratlines and stays
// fore and aft; and a deck with things on it — hatches, a capstan, a wheel, guns, a boat, lanterns
// and a crew. Curved parts (hull, sails, spars) are creased-smooth; everything else stays faceted.

const HULL_CREASE = 0.7;
const SAIL_CREASE = 1.2;

/**
 * A hull, as a box drawn in along X. `plan[k]` is the beam fraction at station k from stern to bow;
 * `rake[k]` lifts the keel there so the bow climbs out of the water; `flare` narrows the bottom so
 * the sides lean out. Positive per-vertex scaling keeps handedness and the rake only ever raises a
 * bottom vertex to below the top, so no face can turn over (sim-taxi's hullPiece, same argument).
 */
function hullPiece(len, beam, y0, y1, plan, rake, col, { flare = 1, sheer = null } = {}) {
  const segs = plan.length - 1;
  const g = new THREE.BoxGeometry(len, y1 - y0, beam, segs, 1, 1);
  g.translate(0, (y0 + y1) / 2, 0);
  const pos = g.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const k = Math.round((pos.getX(i) / len + 0.5) * segs);
    const bottom = pos.getY(i) < (y0 + y1) / 2;
    pos.setZ(i, pos.getZ(i) * plan[k] * (bottom ? flare : 1));
    if (bottom && rake) pos.setY(i, Math.min(y0 + rake[k], y1 - 0.03));
    if (sheer) pos.setY(i, pos.getY(i) + sheer[k]);
  }
  return bakeColor(g, col, { crease: HULL_CREASE });
}

/** A stern-to-bow plan: square-ish stern, full midships, a rounded bow ending at `tip`. */
function makePlan(n, { stern = 0.78, tip = 0.12, bowFrac = 0.32, sheerAft = 0.1, sheerFwd = 0.16 } = {}) {
  const plan = [], rake = [], sheer = [];
  for (let k = 0; k < n; k++) {
    const u = k / (n - 1);
    const toBow = Math.max(0, (u - (1 - bowFrac)) / bowFrac);  // 0 until the bow, 1 at the stem
    const fromStern = Math.min(1, u / 0.18);
    plan.push(Math.min(stern + (1 - stern) * fromStern, tip + (1 - tip) * Math.sqrt(Math.max(0, 1 - toBow * toBow))));
    rake.push(0.55 * toBow * toBow + 0.1 * (1 - fromStern));
    // Sheer: the deck line dips amidships and climbs to both ends, the way every wooden hull does.
    const d = u - 0.42;
    sheer.push(d < 0 ? sheerAft * (d / 0.42) ** 2 : sheerFwd * (d / 0.58) ** 2);
  }
  return { plan, rake, sheer };
}

/** Strips following the hull's side between stations, both sides: bulwarks, rails, wales. */
function sideRun(L, B, P, y, h, t, col, { out = 0, k0 = 0, k1 = P.plan.length - 1, opts = {} } = {}) {
  const parts = [];
  const n = P.plan.length - 1;
  const at = (k) => ({ x: -L / 2 + (k / n) * L, z: (B / 2) * P.plan[k] + out, s: P.sheer[k] });
  for (let k = k0; k < k1; k++) {
    const a = at(k), b = at(k + 1);
    const lift = (a.s + b.s) / 2;
    for (const s of [1, -1]) parts.push(plank(a.x, a.z * s, b.x, b.z * s, y + lift, h, t, col, opts));
  }
  return parts;
}

/**
 * The whole lower hull: flared planked sides, a wale and the owner's stripe standing proud of them,
 * a deck sunk inside bulwarks with a rail cap, plus keel, stem post and rudder.
 * Returns { parts, deckY(x), halfBeam(x) } so everything else can stand on the deck it built.
 */
function hull(L, B, y0, top, P, trim, { bulwark = 0.16, hullCol = PALETTE.hull } = {}) {
  const n = P.plan.length - 1;
  const station = (x) => THREE.MathUtils.clamp((x / L + 0.5) * n, 0, n);
  const lerp = (arr, x) => { const f = station(x), k = Math.min(n - 1, Math.floor(f)); return arr[k] + (arr[k + 1] - arr[k]) * (f - k); };
  const deckY = (x) => top + lerp(P.sheer, x);
  const halfBeam = (x) => (B / 2) * lerp(P.plan, x);
  const sternX = -L / 2;
  const parts = [
    hullPiece(L, B, y0, top, P.plan, P.rake, hullCol, { flare: 0.72, sheer: P.sheer }),
    // The deck, a hair above the hull's own top so the two never share a plane.
    hullPiece(L * 0.995, B * 0.93, top, top + 0.02, P.plan, null, PALETTE.wood, { sheer: P.sheer }),
    // Wale (a heavy dark strake) low on the side, the owner's stripe under the rail.
    ...sideRun(L, B, P, top - 0.34, 0.07, 0.05, PALETTE.mast, { out: -0.02 }),
    ...sideRun(L, B, P, top - 0.13, 0.1, 0.05, trim, { out: 0.0 }),
    // Bulwarks and their cap rail.
    ...sideRun(L, B, P, top, bulwark, 0.05, hullCol, { out: -0.025 }),
    ...sideRun(L, B, P, top + bulwark, 0.035, 0.09, PALETTE.wood, { out: -0.025 }),
    // Transom: bulwark and rail across the stern.
    plank(sternX + 0.02, -halfBeam(sternX), sternX + 0.02, halfBeam(sternX), deckY(sternX), bulwark, 0.05, hullCol),
    plank(sternX + 0.02, -halfBeam(sternX), sternX + 0.02, halfBeam(sternX), deckY(sternX) + bulwark, 0.035, 0.09, PALETTE.wood),
    // Keel, stem post and rudder.
    box(L * 0.8, 0.12, 0.07, -L * 0.06, y0 - 0.06, 0, PALETTE.mast),
    line(L / 2 - 0.02, y0 + P.rake[n] - 0.05, 0, L / 2 + 0.1, deckY(L / 2) + bulwark + 0.12, 0, 0.09, PALETTE.mast),
    box(0.07, top - y0 + 0.1, 0.05, sternX - 0.06, y0 - 0.02, 0, PALETTE.mast),
    box(0.22, (top - y0) * 0.7, 0.04, sternX - 0.17, y0 - 0.04, 0, hullCol),
  ];
  return { parts, deckY, halfBeam, bulwark };
}

// --- Canvas -------------------------------------------------------------------------------------

/**
 * A square sail: a sheet across the hull hung from a yard, bellied forward and braced round
 * `BRACE`. Bracing is what real square-riggers do on most points of sail, and it is also what keeps
 * a brigantine readable from this camera: square-on, a ship sailing east or west shows its sails
 * edge-on and reads as bare masts. The foot is drawn in narrower than the head of the sail below
 * would be, and scalloped up in the middle, the way a sheeted-home course sets.
 */
const BRACE = 0.5;
function squareSail(x, y, w, h, col, { belly = 0.24, taper = 0.9, yard = true } = {}) {
  const g = new THREE.BoxGeometry(0.035, h, w, 1, 5, 8);
  const pos = g.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const zz = pos.getZ(i) / (w / 2);            // -1..1 across
    const yy = pos.getY(i) / (h / 2);            // -1 foot .. 1 head
    const low = (1 - yy) / 2;
    pos.setX(i, pos.getX(i) + belly * (1 - zz * zz) * (0.25 + 0.75 * Math.sin(Math.PI * (0.2 + 0.7 * low))));
    pos.setZ(i, pos.getZ(i) * (taper + (1 - taper) * (1 - low)) * (1 + 0.06 * low));
    if (yy < -0.99) pos.setY(i, pos.getY(i) + 0.09 * h * (1 - zz * zz));   // the roach of the foot
  }
  const parts = [bakeColor(g, col, { crease: SAIL_CREASE })];
  if (yard) {
    const yd = new THREE.CylinderGeometry(0.035, 0.035, w * 1.08, 6);
    yd.rotateX(Math.PI / 2);
    yd.translate(-0.03, h / 2 + 0.03, 0);
    parts.push(bakeColor(yd, PALETTE.mast, { crease: 1 }));
    // Furled reef and the lifts from the yardarms up to the mast.
    for (const s of [1, -1]) parts.push(line(-0.03, h / 2 + 0.03, s * w * 0.5, -0.03, h / 2 + 0.55, 0, 0.018, PALETTE.rope));
  }
  for (const p of parts) { p.rotateY(BRACE); p.translate(x, y + h / 2, 0); }
  return parts;
}

/** An owner-colour band across a braced square sail, lying on its belly. */
function band(x, y, w, col, belly = 0.24) {
  const g = new THREE.BoxGeometry(0.045, 0.22, w * 0.94, 1, 1, 8);
  const pos = g.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const zz = pos.getZ(i) / (w * 0.47);
    pos.setX(i, pos.getX(i) + belly * (1 - zz * zz) * 0.97);
  }
  g.rotateY(BRACE);
  g.translate(x, y, 0);
  return bakeColor(g, col, { crease: SAIL_CREASE, mat: SURF.cloth });
}

/** A fore-and-aft (gaff) sail aft of a mast, with its boom and gaff. */
function gaffSail(x, y, foot, h, col, { headFrac = 0.6, belly = 0.14, peak = 0.3 } = {}) {
  const g = new THREE.BoxGeometry(foot, h, 0.035, 6, 6, 1);
  const pos = g.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    // u runs from the +X end (the mast) aft, so the remap below stays increasing in x — a
    // decreasing one would mirror the sheet and turn every face inside out.
    const u = 0.5 - (pos.getX(i) / foot);               // 0 at the mast, 1 at the clew
    const v = (pos.getY(i) / h) + 0.5;                  // 0 at the foot, 1 at the head
    pos.setX(i, foot / 2 - (u * (1 - v * (1 - headFrac))) * foot);
    pos.setY(i, pos.getY(i) + v * u * peak * h);        // the gaff peaks up toward the leech
    pos.setZ(i, pos.getZ(i) + belly * Math.sin(Math.PI * u) * Math.sin(Math.PI * Math.min(1, v * 0.8 + 0.2)));
  }
  g.translate(x - foot / 2, y + h / 2, 0);   // mast end lands on x, clew aft at x - foot
  return [
    bakeColor(g, col, { crease: SAIL_CREASE }),
    line(x + 0.05, y - 0.03, 0, x - foot * 1.04, y - 0.03, 0, 0.055, PALETTE.mast),                       // boom
    line(x + 0.03, y + h + 0.02, 0, x - foot * headFrac * 1.05, y + h * (1 + peak) + 0.02, 0, 0.045, PALETTE.mast),  // gaff
    line(x - foot, y - 0.03, 0, x - foot * 0.75, y - 0.5, 0, 0.018, PALETTE.rope),                           // sheet
  ];
}

/** A triangular jib from the bowsprit up to the foremast, bellied to leeward. */
function jib(xTack, xMast, y, h, col, belly = 0.12) {
  const foot = xTack - xMast;
  const g = new THREE.BoxGeometry(foot, h, 0.03, 4, 4, 1);
  const pos = g.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const u = (pos.getX(i) / foot) + 0.5;
    const v = (pos.getY(i) / h) + 0.5;
    pos.setX(i, (u * (1 - v)) * foot - foot / 2);
    pos.setZ(i, pos.getZ(i) + belly * Math.sin(Math.PI * u * (1 - v)) * 1.4);
  }
  g.translate(xMast + foot / 2, y + h / 2, 0);
  return bakeColor(g, col, { crease: SAIL_CREASE });
}

/** A swallow-tailed pennant streaming aft from a masthead. */
function pennant(x, yTop, col, long = 0.7) {
  const g = new THREE.BoxGeometry(long, 0.26, 0.025, 5, 1, 1);
  const pos = g.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const u = 0.5 - pos.getX(i) / long;      // 0 at the hoist, 1 at the fly
    pos.setY(i, pos.getY(i) * (1 - 0.75 * u));
    pos.setZ(i, pos.getZ(i) + Math.sin(u * 7) * 0.07 * u);
  }
  g.translate(x - long / 2, yTop - 0.16, 0);
  return bakeColor(g, col, { crease: SAIL_CREASE, mat: SURF.cloth });
}

/** An ensign on a staff at the stern, rippling. */
function ensign(x, y, col, w = 0.75, h = 0.48, staff = 1.1) {
  const g = new THREE.BoxGeometry(w, h, 0.025, 6, 1, 1);
  const pos = g.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const u = 0.5 - pos.getX(i) / w;
    pos.setZ(i, pos.getZ(i) + Math.sin(u * 8) * 0.06 * u);
    pos.setY(i, pos.getY(i) - u * 0.08);
  }
  g.translate(x - w / 2 - 0.03, y + staff - h / 2, 0);
  return [
    line(x, y, 0, x - 0.12, y + staff + 0.05, 0, 0.035, PALETTE.mast),
    bakeColor(g, col, { crease: SAIL_CREASE, mat: SURF.cloth }),
  ];
}

// --- Spars and rigging --------------------------------------------------------------------------

/**
 * A mast in two parts — lower mast, a top (the platform), and a thinner topmast doubled past it —
 * with a truck at the head. Returns the parts and the heights rigging hangs from.
 */
function mast(x, y0, h, r = 0.07, { topAt = 0.58 } = {}) {
  const yTop = y0 + h * topAt;
  return {
    yTop, yHead: y0 + h,
    parts: [
      cyl(r * 0.8, r, h * topAt + 0.1, x, y0, 0, PALETTE.mast, 8),
      cyl(r * 2.6, r * 2.1, 0.05, x, yTop, 0, PALETTE.wood, 8),               // the top
      cyl(r * 2.75, r * 2.75, 0.03, x, yTop + 0.05, 0, PALETTE.mast, 8),
      cyl(r * 0.42, r * 0.66, h * (1 - topAt) + 0.1, x + r * 0.9, yTop - 0.1, 0, PALETTE.mast, 7),
      blob(r * 0.75, x + r * 0.9, y0 + h + 0.03, 0, PALETTE.gold),
    ],
  };
}

/** Shrouds from a mast's top down to the rails on both sides, laddered with ratlines. */
function shrouds(x, yTop, yRail, halfBeam, n = 3, spread = 0.2) {
  const parts = [];
  for (const s of [1, -1]) {
    const feet = [];
    for (let i = 0; i < n; i++) {
      const fx = x - 0.08 - i * spread;
      feet.push(fx);
      parts.push(line(x, yTop, s * 0.1, fx, yRail, s * halfBeam, 0.02, PALETTE.rope));
    }
    const rungs = Math.max(3, Math.round((yTop - yRail) / 0.24));
    for (let j = 1; j < rungs; j++) {
      const t = j / rungs;
      const z = s * (0.1 + (halfBeam - 0.1) * (1 - t));
      const yy = yRail + (yTop - yRail) * t;
      parts.push(line(x + (feet[0] - x) * (1 - t), yy, z, x + (feet[n - 1] - x) * (1 - t), yy, z, 0.014, PALETTE.rope));
    }
  }
  return parts;
}

const stay = (ax, ay, bx, by) => line(ax, ay, 0, bx, by, 0, 0.02, PALETTE.rope);

/** The bowsprit, steeved up from the stem, with its bobstay underneath. */
function bowsprit(x0, y0, x1, y1, r = 0.07, yStem = y0 - 0.5) {
  return [
    rod(new THREE.Vector3(x0, y0, 0), new THREE.Vector3(x1, y1, 0), r, PALETTE.mast),
    line(x1 - 0.1, y1 - 0.03, 0, x0 + (x1 - x0) * 0.35, yStem, 0, 0.018, PALETTE.rope),
  ];
}

// --- Deck furniture and crew --------------------------------------------------------------------

/** Gun ports with their muzzles run out, both sides. */
function gunPorts(x0, x1, y, hb, n) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const x = x0 + (x1 - x0) * (n === 1 ? 0.5 : i / (n - 1));
    for (const s of [1, -1]) {
      const z = hb(x) * s;
      out.push(box(0.17, 0.15, 0.05, x, y, z * 0.97, PALETTE.cannonball, { mat: SURF.plain }));
      out.push(box(0.19, 0.03, 0.09, x, y + 0.15, z * 0.99, PALETTE.player, { mat: SURF.paint }));   // the lid, hinged up
      out.push(tube(0.045, 0.036, 0.22, x, y + 0.075, z + s * 0.06, s > 0 ? -Math.PI / 2 : Math.PI / 2, PALETTE.iron));
    }
  }
  return out;
}

/** A deck gun on its carriage, pointing outboard on side `s`. */
function deckGun(x, y, z, s) {
  return [
    box(0.22, 0.09, 0.24, x, y, z, PALETTE.woodDark),
    cyl(0.05, 0.05, 0.03, x - 0.08, y + 0.02, z, PALETTE.iron, 6).rotateX(0),
    tube(0.055, 0.04, 0.42, x, y + 0.13, z + s * 0.08, s > 0 ? -Math.PI / 2 : Math.PI / 2, PALETTE.iron),
  ];
}

function hatch(x, y, z, w = 0.5, d = 0.4) {
  return [
    box(w, 0.06, d, x, y, z, PALETTE.woodDark),
    box(w - 0.1, 0.02, d - 0.1, x, y + 0.06, z, PALETTE.cannonball, { mat: SURF.metal }),   // the grating
  ];
}

function capstan(x, y, z = 0) {
  const parts = [cyl(0.09, 0.12, 0.2, x, y, z, PALETTE.woodDark, 8), cyl(0.13, 0.13, 0.04, x, y + 0.2, z, PALETTE.wood, 8)];
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI;
    parts.push(line(x - Math.cos(a) * 0.26, y + 0.17, z - Math.sin(a) * 0.26, x + Math.cos(a) * 0.26, y + 0.17, z + Math.sin(a) * 0.26, 0.025, PALETTE.wood));
  }
  return parts;
}

function wheel(x, y) {
  const parts = [box(0.08, 0.26, 0.08, x, y, 0, PALETTE.woodDark)];
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI;
    parts.push(line(x + 0.05, y + 0.3 - Math.cos(a) * 0.17, -Math.sin(a) * 0.17, x + 0.05, y + 0.3 + Math.cos(a) * 0.17, Math.sin(a) * 0.17, 0.025, PALETTE.wood));
  }
  return parts;
}

/** A lantern on an iron bracket. Its glass is `SURF.glow`, so it shines. */
function lantern(x, y, z, size = 0.1) {
  return [
    box(0.02, 0.2, 0.02, x, y, z, PALETTE.iron),
    box(size, size * 1.3, size, x, y + 0.2, z, PALETTE.glass),
    cyl(0, size * 0.75, size * 0.6, x, y + 0.2 + size * 1.3, z, PALETTE.gold, 4),
  ];
}

function barrel(x, y, z, r = 0.1, h = 0.2) {
  return [cyl(r * 0.85, r, h, x, y, z, PALETTE.wood, 8), cyl(r * 0.92, r * 0.92, 0.025, x, y + h * 0.5, z, PALETTE.iron, 8)];
}

/** The ship's boat, lashed down on deck (or towed), built with the same hull piece in miniature. */
function boat(x, y, z, len = 0.8) {
  const P = makePlan(7, { stern: 0.7, sheerAft: 0.02, sheerFwd: 0.04 });
  const g = hullPiece(len, len * 0.36, 0, 0.13, P.plan, P.rake.map((r) => r * 0.25), PALETTE.wood, { flare: 0.6 });
  const inner = hullPiece(len * 0.86, len * 0.26, 0.1, 0.135, P.plan, null, PALETTE.woodDark);
  const thwart = box(0.05, 0.02, len * 0.3, 0, 0.12, 0, PALETTE.wood);
  for (const p of [g, inner, thwart]) p.translate(x, y, z);
  return [g, inner, thwart];
}

/** A sailor: legs, shirt, head, hat. A third of a unit tall, which sets the scale of everything. */
function sailor(x, y, z, shirt = PALETTE.shirt, hat = PALETTE.timber, yaw = 0) {
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

function anchor(x, y, z) {
  return [
    line(x, y, z, x, y - 0.3, z, 0.03, PALETTE.iron),
    line(x - 0.1, y - 0.3, z, x + 0.1, y - 0.3, z, 0.03, PALETTE.iron),
    line(x - 0.1, y - 0.3, z, x - 0.14, y - 0.22, z, 0.03, PALETTE.iron),
    line(x + 0.1, y - 0.3, z, x + 0.14, y - 0.22, z, 0.03, PALETTE.iron),
    line(x - 0.08, y - 0.02, z, x + 0.08, y - 0.02, z, 0.035, PALETTE.wood),
  ];
}

/** A raised deck (quarterdeck, forecastle): planked box with a rail of balusters round its edge. */
function castle(x0, x1, y, h, hb, trim, { rail = 0.15, shrink = 0.9, wall = PALETTE.woodDark } = {}) {
  const cx = (x0 + x1) / 2, len = x1 - x0;
  const w0 = hb(x0) * 2 * shrink, w1 = hb(x1) * 2 * shrink;
  const g = new THREE.BoxGeometry(len, h, 1, 1, 1, 1);
  const pos = g.attributes.position;
  for (let i = 0; i < pos.count; i++) pos.setZ(i, pos.getZ(i) * (pos.getX(i) < 0 ? w0 : w1));
  g.translate(cx, y + h / 2, 0);
  const parts = [bakeColor(g, wall), box(len + 0.06, 0.03, Math.max(w0, w1) * 0.5, cx, y + h, 0, PALETTE.wood)];
  const top = new THREE.BoxGeometry(len + 0.04, 0.03, 1);
  const tp = top.attributes.position;
  for (let i = 0; i < tp.count; i++) tp.setZ(i, tp.getZ(i) * (tp.getX(i) < 0 ? w0 : w1) * 1.02);
  top.translate(cx, y + h + 0.015, 0);
  parts.push(bakeColor(top, PALETTE.wood));
  // Owner's stripe under the deck edge, then balusters and a hand rail down both sides.
  for (const s of [1, -1]) {
    parts.push(plank(x0, s * w0 / 2, x1, s * w1 / 2, y + h - 0.12, 0.08, 0.03, trim, { mat: SURF.paint }));
    parts.push(plank(x0, s * w0 / 2, x1, s * w1 / 2, y + h + rail, 0.03, 0.045, PALETTE.wood));
    const nb = Math.max(2, Math.round(len / 0.16));
    for (let i = 0; i <= nb; i++) {
      const t = i / nb;
      parts.push(box(0.025, rail, 0.025, x0 + len * t, y + h + 0.02, s * (w0 + (w1 - w0) * t) / 2, PALETTE.woodDark));
    }
  }
  return parts;
}

// --- The five hulls -----------------------------------------------------------------------------

const DECK = 0.42;   // deck height above the waterline, cutter scale

function cutter(trim, sail) {
  const L = 3.0, B = 1.15;
  const P = makePlan(11, { stern: 0.7, sheerAft: 0.06, sheerFwd: 0.12 });
  const H = hull(L, B, -0.25, DECK, P, trim, { bulwark: 0.11 });
  const d = H.deckY, m = mast(0.25, d(0.25), 2.7, 0.06, { topAt: 0.7 });
  return [
    ...H.parts, ...m.parts,
    ...bowsprit(L * 0.4, d(L * 0.4) + 0.12, L * 0.82, d(L * 0.5) + 0.42, 0.055, d(L / 2) - 0.25),
    ...gaffSail(0.2, d(0) + 0.42, 1.5, 1.55, sail),
    jib(L * 0.8, 0.3, d(1) + 0.35, 1.9, sail),
    box(0.9, 0.2, 0.045, -0.4, d(0) + 1.25, 0.1, trim, { mat: SURF.cloth }),      // sail band, abaft the mast
    stay(0.3, m.yHead - 0.1, L * 0.8, d(L * 0.5) + 0.42),
    ...shrouds(0.25, m.yTop, d(0.2) + 0.11, H.halfBeam(0.1), 2, 0.22),
    pennant(0.3, m.yHead + 0.12, trim),
    // Tiller, a hatch, a couple of casks and two hands.
    line(-L / 2 + 0.05, d(-1.4) + 0.2, 0, -L / 2 + 0.55, d(-1) + 0.24, 0, 0.035, PALETTE.wood),
    ...hatch(0.85, d(0.85), 0, 0.36, 0.32),
    ...barrel(-0.55, d(-0.5), 0.26, 0.08, 0.16), ...barrel(-0.72, d(-0.7), 0.24, 0.08, 0.16),
    ...sailor(-L / 2 + 0.6, d(-0.9), 0.02, PALETTE.shirt, PALETTE.timber),
    ...sailor(1.05, d(1), -0.22, trim, PALETTE.rope, 1.2),
    ...lantern(-L / 2 + 0.1, d(-1.5) + 0.1, 0, 0.07),
  ];
}

function schooner(trim, sail) {
  const L = 4.1, B = 1.45;
  const P = makePlan(13);
  const H = hull(L, B, -0.3, DECK + 0.1, P, trim, { bulwark: 0.14 });
  const d = H.deckY;
  const fore = mast(0.85, d(0.85), 3.2, 0.065, { topAt: 0.68 });
  const main = mast(-0.4, d(-0.4), 3.6, 0.07, { topAt: 0.68 });
  const rail = (x) => d(x) + 0.14;
  return [
    ...H.parts, ...fore.parts, ...main.parts,
    // Deckhouse with a companionway and lit windows.
    box(0.8, 0.3, B * 0.5, -1.3, d(-1.3), 0, PALETTE.woodDark),
    box(0.86, 0.035, B * 0.56, -1.3, d(-1.3) + 0.3, 0, PALETTE.wood),
    box(0.12, 0.1, B * 0.51, -1.2, d(-1.3) + 0.12, 0, PALETTE.glass),
    ...bowsprit(L * 0.4, d(L * 0.4) + 0.15, L * 0.78, d(L * 0.5) + 0.5, 0.06, d(L / 2) - 0.3),
    ...gaffSail(0.8, d(0.8) + 0.45, 1.05, 2.0, sail),
    ...gaffSail(-0.45, d(-0.4) + 0.45, 1.45, 2.25, sail),
    jib(L * 0.76, 0.9, d(1.5) + 0.4, 2.3, sail),
    jib(L * 0.6, 0.92, d(1.5) + 0.38, 1.7, sail, -0.08),
    box(1.0, 0.2, 0.045, -1.0, d(0) + 1.75, 0.12, trim, { mat: SURF.cloth }),
    stay(0.9, fore.yHead - 0.1, L * 0.76, d(L * 0.5) + 0.5),
    stay(-0.35, main.yHead - 0.1, 0.9, fore.yHead - 0.15),
    ...shrouds(0.85, fore.yTop, rail(0.7), H.halfBeam(0.6), 3, 0.18),
    ...shrouds(-0.4, main.yTop, rail(-0.6), H.halfBeam(-0.7), 3, 0.18),
    pennant(-0.34, main.yHead + 0.12, trim, 0.9),
    ...ensign(-L / 2 + 0.05, rail(-2), trim, 0.6, 0.38, 0.85),
    ...hatch(0.2, d(0.2), 0), ...capstan(1.45, d(1.45)),
    ...wheel(-1.82, d(-1.8)),
    ...barrel(0.15, d(0.2), 0.42), ...barrel(-0.05, d(0), 0.44), ...barrel(0.06, d(0), -0.45),
    ...sailor(-1.72, d(-1.7), 0, trim), ...sailor(1.2, d(1.2), 0.3, PALETTE.shirt, PALETTE.timber, 0.7),
    ...sailor(-0.1, d(0), -0.2, PALETTE.canvas, PALETTE.rope, 2.4),
    ...lantern(-L / 2 + 0.08, rail(-2), 0.3, 0.08), ...lantern(-L / 2 + 0.08, rail(-2), -0.3, 0.08),
    ...anchor(L / 2 - 0.45, rail(1.6) + 0.02, H.halfBeam(L / 2 - 0.45) + 0.05),
  ];
}

function brigantine(trim, sail) {
  const L = 4.5, B = 1.55;
  const P = makePlan(13, { tip: 0.08, bowFrac: 0.36 });
  const H = hull(L, B, -0.3, DECK + 0.15, P, trim, { bulwark: 0.15 });
  const d = H.deckY, rail = (x) => d(x) + 0.15;
  const fore = mast(0.9, d(0.9), 3.6, 0.07);
  const main = mast(-0.55, d(-0.55), 3.7, 0.075, { topAt: 0.66 });
  const parts = [
    ...H.parts, ...fore.parts, ...main.parts,
    ...castle(-L / 2 + 0.04, -L / 2 + 1.1, d(-1.8), 0.3, H.halfBeam, trim, { shrink: 0.93 }),
    box(0.04, 0.12, B * 0.5, -L / 2 + 0.02, d(-2) + 0.06, 0, PALETTE.glass),    // stern lights
    ...bowsprit(L * 0.4, d(L * 0.4) + 0.15, L * 0.82, d(L * 0.5) + 0.6, 0.065, d(L / 2) - 0.3),
    ...squareSail(0.98, d(1) + 0.7, 1.95, 1.2, sail),
    ...squareSail(0.98, d(1) + 2.0, 1.5, 0.95, sail, { belly: 0.2 }),
    ...squareSail(0.98, d(1) + 3.0, 1.05, 0.55, sail, { belly: 0.14 }),
    band(1.0, d(1) + 1.35, 1.95, trim),
    ...gaffSail(-0.6, d(-0.6) + 0.5, 1.5, 2.15, sail),
    jib(L * 0.8, 1.0, d(1.6) + 0.45, 2.5, sail),
    jib(L * 0.62, 1.02, d(1.6) + 0.42, 1.8, sail, -0.08),
    stay(0.95, fore.yHead - 0.1, L * 0.8, d(L * 0.5) + 0.6),
    stay(-0.5, main.yHead - 0.1, 0.95, fore.yTop + 0.1),
    ...shrouds(0.9, fore.yTop, rail(0.75), H.halfBeam(0.6), 3, 0.2),
    ...shrouds(-0.55, main.yTop, rail(-0.7), H.halfBeam(-0.8), 3, 0.2),
    pennant(-0.48, main.yHead + 0.12, trim, 1.0), pennant(0.97, fore.yHead + 0.12, trim, 0.6),
    ...ensign(-L / 2 + 0.05, d(-2) + 0.47, trim, 0.7, 0.44, 0.95),
    ...hatch(0.1, d(0.1), 0), ...capstan(1.55, d(1.55)), ...wheel(-L / 2 + 0.75, d(-1.8) + 0.33),
    ...boat(0.15, d(0.1) + 0.09, 0, 0.72),
    ...lantern(-L / 2 + 0.06, d(-2) + 0.47, 0, 0.1),
    ...anchor(L / 2 - 0.5, rail(1.7) + 0.02, H.halfBeam(L / 2 - 0.5) + 0.05),
    ...sailor(-L / 2 + 0.62, d(-1.8) + 0.33, 0.12, trim, PALETTE.timber),
    ...sailor(1.3, d(1.3), -0.3, PALETTE.shirt, PALETTE.rope, 0.6), ...sailor(-0.2, d(0), 0.42, PALETTE.canvas, PALETTE.timber, 1.6),
    ...sailor(0.88, fore.yTop + 0.08, 0.1, PALETTE.shirt, PALETTE.timber, 0.3),    // a lookout in the foretop
  ];
  for (const x of [-0.25, 0.45]) for (const s of [1, -1]) parts.push(...deckGun(x, d(x), s * (H.halfBeam(x) - 0.22), s));
  return parts;
}

function galleon(trim, sail) {
  const L = 5.8, B = 2.05;
  const P = makePlan(15, { stern: 0.88, tip: 0.1, bowFrac: 0.3, sheerAft: 0.2, sheerFwd: 0.2 });
  const top = DECK + 0.4;
  const H = hull(L, B, -0.4, top, P, trim, { bulwark: 0.17 });
  const d = H.deckY, hb = H.halfBeam, rail = (x) => d(x) + 0.17;
  const sx = -L / 2;
  const qd = 0.42, poop = 0.36;                       // quarterdeck and poop heights above the deck
  const yQ = d(-1.9) + qd, yP = yQ + poop;
  const fore = mast(1.55, d(1.55), 3.8, 0.085);
  const main = mast(0.05, d(0), 4.7, 0.1);
  const mizzen = mast(-1.75, yQ, 2.9, 0.07, { topAt: 0.62 });
  const yF = d(2.2) + 0.34;                           // forecastle deck
  const parts = [
    ...H.parts, ...fore.parts, ...main.parts, ...mizzen.parts,
    // Second wale and a gilded strake: this is the flagship, and it dresses like one.
    ...sideRun(L, B, P, top - 0.52, 0.06, 0.05, PALETTE.mast, { out: -0.06 }),
    ...sideRun(L, B, P, top - 0.02, 0.03, 0.055, PALETTE.gold, { out: 0.0 }),
    // Quarterdeck, poop above it, forecastle forward — each with its own rail.
    ...castle(sx + 0.04, sx + 1.9, d(-1.9), qd, hb, trim, { shrink: 0.95 }),
    ...castle(sx + 0.04, sx + 0.95, yQ, poop, hb, trim, { shrink: 0.9 }),
    ...castle(L / 2 - 1.5, L / 2 - 0.55, d(2.2), 0.34, hb, trim, { shrink: 0.92 }),
    // Stern gallery: a gilded transom with two rows of lit windows and a balcony.
    box(0.05, qd + poop + 0.1, hb(sx) * 1.86, sx + 0.0, d(-2.9) - 0.05, 0, PALETTE.woodDark),
    box(0.06, 0.05, hb(sx) * 1.95, sx - 0.01, yQ - 0.03, 0, PALETTE.gold),
    box(0.06, 0.05, hb(sx) * 1.9, sx - 0.01, yP + 0.02, 0, PALETTE.gold),
    box(0.16, 0.03, hb(sx) * 1.9, sx - 0.08, d(-2.9) + 0.02, 0, PALETTE.wood),                 // balcony
    plank(sx - 0.15, -hb(sx) * 0.95, sx - 0.15, hb(sx) * 0.95, d(-2.9) + 0.05, 0.1, 0.02, PALETTE.gold),
    // Bulkhead doors under the quarterdeck and the forecastle.
    box(0.03, 0.26, 0.2, sx + 1.92, d(-1), 0, PALETTE.timber), box(0.03, 0.22, 0.18, L / 2 - 1.52, d(1.4), 0, PALETTE.timber),
    ...gunPorts(-1.75, 1.9, top - 0.42, hb, 7),
    ...bowsprit(L * 0.36, d(L * 0.36) + 0.4, L * 0.8, d(L * 0.5) + 1.0, 0.085, d(L / 2) - 0.4),
    // Beakhead and figurehead under the bowsprit.
    line(L / 2 - 0.25, d(2.8) - 0.12, 0, L / 2 + 0.5, d(2.9) + 0.2, 0, 0.1, trim, { mat: SURF.paint }),
    blob(0.1, L / 2 + 0.56, d(2.9) + 0.26, 0, PALETTE.gold),
    // Fore: course, topsail, topgallant. Main: the same, bigger. Mizzen: a lateen-cut gaff.
    ...squareSail(1.65, d(1.6) + 1.0, 2.5, 1.3, sail, { belly: 0.3 }),
    ...squareSail(1.65, d(1.6) + 2.4, 1.9, 0.95, sail),
    ...squareSail(1.65, d(1.6) + 3.4, 1.3, 0.6, sail, { belly: 0.16 }),
    ...squareSail(0.17, d(0) + 1.05, 2.95, 1.55, sail, { belly: 0.32 }),
    ...squareSail(0.17, d(0) + 2.72, 2.2, 1.15, sail, { belly: 0.26 }),
    ...squareSail(0.17, d(0) + 3.95, 1.5, 0.7, sail, { belly: 0.18 }),
    band(0.2, d(0) + 1.75, 2.95, trim, 0.32), band(1.68, d(1.6) + 1.6, 2.5, trim, 0.3),
    ...gaffSail(-1.78, yQ + 0.55, 1.25, 1.55, sail, { peak: 0.38 }),
    ...squareSail(-1.66, yQ + 2.0, 1.2, 0.7, sail, { belly: 0.14 }),
    // A spritsail under the bowsprit.
    ...squareSail(L * 0.62, d(L / 2) + 0.1, 1.5, 0.55, sail, { belly: 0.14 }),
    jib(L * 0.78, 1.7, d(2) + 1.0, 2.5, sail),
    // Standing rigging.
    stay(1.65, fore.yHead - 0.1, L * 0.8, d(L * 0.5) + 1.0), stay(1.6, fore.yTop, L * 0.6, d(L * 0.5) + 0.7),
    stay(0.14, main.yHead - 0.1, 1.65, fore.yTop + 0.2), stay(0.1, main.yTop, 1.6, d(1.6) + 0.5),
    stay(-1.7, mizzen.yHead - 0.1, 0.1, main.yTop + 0.1),
    ...shrouds(1.55, fore.yTop, rail(1.4), hb(1.3), 4, 0.19),
    ...shrouds(0.05, main.yTop, rail(-0.1), hb(-0.2), 5, 0.19),
    ...shrouds(-1.75, mizzen.yTop, yQ + 0.15, hb(-1.9) * 0.9, 3, 0.17),
    pennant(0.14, main.yHead + 0.14, trim, 1.3), pennant(1.63, fore.yHead + 0.14, trim, 0.85), pennant(-1.69, mizzen.yHead + 0.14, trim, 0.6),
    ...ensign(sx + 0.02, yP + 0.15, trim, 1.0, 0.62, 1.25),
    // Three great stern lanterns, and one at each castle break.
    ...lantern(sx + 0.0, yP + 0.15, 0, 0.14), ...lantern(sx + 0.02, yP + 0.15, hb(sx) * 0.7, 0.11), ...lantern(sx + 0.02, yP + 0.15, -hb(sx) * 0.7, 0.11),
    ...lantern(sx + 1.9, yQ + 0.15, hb(-1) * 0.8, 0.08), ...lantern(L / 2 - 1.5, yF + 0.15, -hb(1.4) * 0.8, 0.08),
    // The waist: a hatch with the boat stowed over it, the capstan, guns along both rails.
    ...hatch(0.75, d(0.75), 0, 0.6, 0.5), ...boat(0.78, d(0.75) + 0.09, 0, 0.9), ...capstan(-0.55, d(-0.55)),
    ...hatch(-0.05, d(0), 0.0, 0.3, 0.3),
    ...wheel(sx + 1.5, yQ + 0.03),
    ...anchor(L / 2 - 0.75, yF + 0.2, hb(L / 2 - 0.75) + 0.06), ...anchor(L / 2 - 0.75, yF + 0.2, -hb(L / 2 - 0.75) - 0.06),
    ...barrel(-0.95, d(-0.9), 0.6), ...barrel(-0.95, d(-0.9), -0.62), ...barrel(-0.78, d(-0.8), 0.68),
    // The ship's company.
    ...sailor(sx + 1.38, yQ + 0.03, 0.02, trim, PALETTE.timber),                   // helmsman
    ...sailor(sx + 0.6, yP + 0.03, 0.15, trim, PALETTE.gold, 0.2),                 // the captain, on the poop
    ...sailor(sx + 1.2, yQ + 0.03, -0.4, PALETTE.shirt, PALETTE.timber, 1.0),
    ...sailor(0.4, d(0.4), 0.6, PALETTE.canvas, PALETTE.rope, 1.9), ...sailor(-0.3, d(-0.3), -0.55, PALETTE.shirt, PALETTE.timber, 0.4),
    ...sailor(1.2, d(1.2), -0.5, PALETTE.shirt, PALETTE.rope, 2.6), ...sailor(L / 2 - 1.0, yF + 0.03, 0.1, PALETTE.canvas, PALETTE.timber, 0.1),
    ...sailor(0.1, main.yTop + 0.08, 0.12, PALETTE.shirt, PALETTE.timber, 0.5),    // lookouts aloft
    ...sailor(1.6, fore.yTop + 0.08, -0.1, PALETTE.canvas, PALETTE.timber, 2.0),
  ];
  for (const x of [-0.2, 0.35, 1.05]) for (const s of [1, -1]) parts.push(...deckGun(x, d(x), s * (hb(x) - 0.24), s));
  for (const s of [1, -1]) parts.push(...deckGun(sx + 1.55, yQ + 0.03, s * (hb(-1.3) * 0.9 - 0.22), s));
  // Stern windows: two rows of panes across the transom, and a row down each quarter.
  for (const [y, n] of [[d(-2.9) + 0.12, 5], [yQ + 0.1, 4]]) {
    for (let i = 0; i < n; i++) {
      const z = (i - (n - 1) / 2) * (hb(sx) * 1.5 / n);
      parts.push(box(0.03, 0.16, hb(sx) * 1.1 / n, sx - 0.03, y, z, PALETTE.glass));
    }
  }
  for (const s of [1, -1]) for (let i = 0; i < 3; i++) {
    const x = sx + 0.35 + i * 0.45;
    parts.push(box(0.2, 0.13, 0.03, x, d(-1.9) + 0.14, s * (hb(x) * 0.95 + 0.012), PALETTE.glass));
  }
  return parts;
}

function pirate(trim, sail) {
  // The legacy 'pirate' hull: a schooner under black canvas with a red band and a pale patch on
  // the main where the skull is.
  return schooner(PALETTE.healthBad, sail).concat([
    box(0.5, 0.45, 0.045, -1.0, DECK + 1.25, 0.13, PALETTE.sail),
  ]);
}

const BUILDERS = { cutter, schooner, brigantine, galleon, pirate };

/** Overall length per type, for selection rings, health bars and hit flashes. */
export const SHIP_SIZE = { cutter: 3.0, schooner: 4.1, brigantine: 4.5, galleon: 5.8, pirate: 4.1 };
export const SHIP_HEIGHT = { cutter: 3.2, schooner: 4.1, brigantine: 4.3, galleon: 5.6, pirate: 4.1 };

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
