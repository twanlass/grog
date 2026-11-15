import { hexToPixel, pixelToHex, HEX_SIZE } from '@grog/hex.js';

// The one place 3D space meets Grog's coordinates.
//
// The simulation thinks in *Grog pixels* (hex.js: flat-top hexes, HEX_SIZE 32, x right, y down).
// 3D space is that plane laid on the ground: Grog x → world +X, Grog y → world +Z, scaled so a hex
// is a comfortable size against the boxes everything is built from. Up is +Y.
//
// Every input handler in game/src/systems/inputHandler.js takes Grog pixels, so a click becomes
// world (x, z) off a ray against the sea, then `worldToGrog` — and the 2D game's own rules run.

/** Grog pixels per world unit. A hex is HEX_SIZE / PX_PER_UNIT = 4 units centre to corner. */
export const PX_PER_UNIT = 8;
export const HEX_R = HEX_SIZE / PX_PER_UNIT;
export const HEX_H = Math.sqrt(3) * HEX_R; // flat-to-flat

/** Heights. The sea surface is y = 0; everything is measured off it. */
export const SEA_Y = 0;
export const SEABED = { shallow: -0.9, ocean: -2.2, deep_ocean: -3.6 };
export const BEACH_Y = 0.35;
export const LAND_STEP = 0.55;      // each ring inland climbs this much
export const LAND_MAX_RINGS = 4;

export function hexToWorld(q, r) {
  const p = hexToPixel(q, r);
  return { x: p.x / PX_PER_UNIT, z: p.y / PX_PER_UNIT };
}

export function worldToGrog(x, z) {
  return { x: x * PX_PER_UNIT, y: z * PX_PER_UNIT };
}

export function grogToWorld(px, py) {
  return { x: px / PX_PER_UNIT, z: py / PX_PER_UNIT };
}

export function worldToHex(x, z) {
  return pixelToHex(x * PX_PER_UNIT, z * PX_PER_UNIT);
}

/** World bounds of a Grog map, measured off its tiles (the offset layout skews in pixel space). */
export function mapBounds(map) {
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (const t of map.tiles.values()) {
    const p = hexToWorld(t.q, t.r);
    minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x);
    minZ = Math.min(minZ, p.z); maxZ = Math.max(maxZ, p.z);
  }
  return { minX: minX - HEX_R, maxX: maxX + HEX_R, minZ: minZ - HEX_H, maxZ: maxZ + HEX_H };
}
