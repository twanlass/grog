import * as THREE from 'three';

// Every colour in the 3D game, by name — the sim-taxi discipline: per-instance variety comes from
// small HSL jitters around these bases (`jitterColor`), never from free colour choices inline.
//
// The bases are lifted from the 2D game wherever it had one (its tile colours in mapGenerator.js,
// its pixel-art palette in sprites/colors.js, its faction colours in unitRenderer.js), so a player
// who knows Grog reads the same islands and the same red/green/blue/orange fleets — only lit.

export const PALETTE = {
  // Sky and air. The same structure as sim-taxi's: a light blue overhead going paler, not white, at
  // the horizon, and a haze that is the sky's own hue at full saturation rather than a grey wash.
  skyTop: '#7DB9E3',
  skyBottom: '#D6ECF7',
  fog: '#86C9F0',

  sun: '#FFE2B0',
  hemiSky: '#CFE4F5',
  hemiGround: '#4A5A6A',

  // Water, by tile tier. The 2D game's own ramp (deep [10,30,70] → shallow [40,100,160]) lifted
  // about a third, because a lit surface under a warm sun reads darker than flat pixels did.
  deep: '#1D3F7A',
  ocean: '#24599A',
  shallow: '#3B86BE',
  shoal: '#5FB4D2',     // the last shallow ring against a beach, where the sand shows through
  foam: '#E8F6FA',

  // Land. Climate drives the top colour exactly as in 2D: arctic snow, temperate grass, tropical sand.
  snow: '#E6EEF4',
  snowShade: '#BCCAD6',
  grass: '#5E9E4A',
  grassDark: '#4C8A3E',
  sand: '#E2CC8E',
  sandDark: '#CDB273',
  beachArctic: '#B9C6D0',
  beachTemperate: '#C9B184',
  beachTropical: '#EED9A2',
  cliff: '#8A6B4E',
  cliffArctic: '#8C98A4',
  rock: '#8E8A84',
  rockDark: '#6D6964',

  // Vegetation.
  trunk: '#6B4A2E',
  leaf: '#4F9442',
  leafDark: '#3E7C36',
  pine: '#2F6B43',
  pineSnow: '#DCE7EE',
  palm: '#5DA448',

  // Wood, sail and stone — sprites/colors.js W/D/H/S/M/G/K/T.
  wood: '#8B5A2B',
  woodDark: '#654321',
  hull: '#50321A',
  sail: '#F0E6D2',
  mast: '#3C2814',
  stone: '#9A9890',
  stoneDark: '#6E6C66',
  roof: '#A0503C',
  thatch: '#C9A35A',
  iron: '#3A3A3E',
  field: '#C7B45A',
  pirateSail: '#2A2522',

  // Factions — unitRenderer.js FACTION_COLORS.
  player: '#C04040',
  player2: '#3C78C8',
  ai1: '#3CA050',
  ai2: '#3C78C8',
  ai3: '#DC8C28',
  pirate: '#DC8C28',

  // Fog of war: unexplored hexes go to this, explored-but-unseen hexes are darkened toward it.
  fogUnexplored: '#14213A',

  // Markers (unlit).
  select: '#FFFFFF',
  selectEnemy: '#FF5A4A',
  placeOk: '#7CFF8A',
  placeFar: '#FFC24A',
  waypoint: '#FFFFFF',
  healthGood: '#5BE06A',
  healthMid: '#F2C94C',
  healthBad: '#EB5757',
  healthBack: '#1B1B1B',
  progress: '#7FD3FF',
  fire: '#FFB347',
  fireCore: '#FFF1B8',
  smoke: '#4A4A4A',
  splash: '#F2FAFF',
  cannonball: '#1E1E1E',
};

export const OWNER_COLORS = {
  player: PALETTE.player,
  player2: PALETTE.player2,
  ai1: PALETTE.ai1,
  ai2: PALETTE.ai2,
  ai3: PALETTE.ai3,
  pirate: PALETTE.pirate,
};

export function ownerColor(owner) {
  return OWNER_COLORS[owner] || PALETTE.ai1;
}

const tmpHSL = { h: 0, s: 0, l: 0 };

/** A small HSL wobble around a base colour, drawn from the caller's rng. */
export function jitterColor(base, rng, { h = 0.015, s = 0.05, l = 0.05 } = {}) {
  const c = new THREE.Color(base);
  c.getHSL(tmpHSL);
  return c.setHSL(
    (tmpHSL.h + rng.jitter(h) + 1) % 1,
    THREE.MathUtils.clamp(tmpHSL.s + rng.jitter(s), 0, 1),
    THREE.MathUtils.clamp(tmpHSL.l + rng.jitter(l), 0, 1),
  );
}
