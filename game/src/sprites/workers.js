// Worker entity definition — autonomous land units that handle the
// chopping loop. Workers are NOT player-controlled: they spawn from
// settlements, find the nearest non-depleted tree on their island, chop
// it, and walk the cargo back to the SPECIFIC settlement that spawned
// them (not the nearest one). When their home settlement is gone or no
// tree is reachable on their island, they idle. They're a visual +
// economic substrate, not a unit the player micromanages.

export const WORKER_CONFIG = {
    // How fast a worker walks across hexes (hexes per second). Ships are
    // ~1.2 hex/sec for reference; workers should feel slower than ships.
    speed: 0.6,

    // Combat (workers have HP for future targeting but no enemy shoots
    // them yet)
    health: 20,

    // Wood carried per trip back to a hub
    cargoCapacity: 3,

    // Seconds to chop one cargo's worth of wood. Bigger number = slower
    // economy. At chopTime=8 with cargoCapacity=3 and 3 workers per
    // settlement, a settlement whose workers don't walk far yields about
    // 3 * 3 / 8 = ~1.1 wood/sec at the chop step (walks subtract from that).
    chopTime: 8,

    // Sprite scale at zoom 1 (villager sheet is 32×32 per cell)
    spriteScale: 1.0,

    // Walk-cycle frame rate (fps). 8 fps × 3 frames = one cycle per 0.375s.
    animSpeed: 8,

    // Cargo indicator pip color (RGB) — small brown dot above the head
    // when the worker is carrying wood.
    cargoIndicatorColor: [180, 110, 50],
};

// Per-tree-hex wood pool. Each inland land tile starts with this much wood.
export const TREE_HEX_WOOD = 100;

// Workers spawned next to a settlement the moment its construction
// completes. These workers immediately start the chopping loop.
export const SETTLEMENT_WORKERS = 3;

// Villager sprite sheet layout (3 anim frames × 5 rows of facings,
// 32×32 per cell). The artist drew the south-half: top → bottom is
// W, SW, S, SE, E. There are NO back-facing (north) poses on the
// sheet, so northward facings alias to the closest side profile —
// villagers walking away from the camera are shown side-on, not from
// behind. flipX is never needed because both east and west sides are
// drawn explicitly.
export const VILLAGER_SPRITE = 'villager';
export const VILLAGER_ROWS = 5;
export const VILLAGER_COLS = 3;
export const VILLAGER_DEFAULT_ROW = 2;  // 'south' = facing camera

// Map 8-way facing → { row, flipX } for the villager sheet.
// Hex flat-top walks only ever produce n, ne, se, s, sw, nw (no pure
// e/w), so the e/w entries below mainly cover the alias targets.
export const FACING_TO_ROW = {
    w:  { row: 0, flipX: false },
    sw: { row: 1, flipX: false },
    s:  { row: 2, flipX: false },
    se: { row: 3, flipX: false },
    e:  { row: 4, flipX: false },
    // Northward facings: no back views on the sheet, so alias to the
    // closest side profile. nw → W, ne → E, pure n → E (arbitrary but
    // consistent — pure n is rare in flat-top hex movement).
    nw: { row: 0, flipX: false },
    n:  { row: 4, flipX: false },
    ne: { row: 4, flipX: false },
};

/**
 * Convert a screen-space movement vector (+x east, +y south) to one of
 * the 8 facing keys. Returns null for (0, 0) so callers can keep the
 * previous facing when the worker isn't moving.
 */
export function facingFromVec(dx, dy) {
    if (dx === 0 && dy === 0) return null;
    // Round to the nearest 45° sector. atan2 returns [-π, π].
    const sector = ((Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) % 8) + 8) % 8;
    // 0=E, 1=SE, 2=S, 3=SW, 4=W, 5=NW, 6=N, 7=NE
    return ['e', 'se', 's', 'sw', 'w', 'nw', 'n', 'ne'][sector];
}

