// Pixel art sprites for Trade Winds - Side view ships
// Ships are defined as 2D arrays where each value is [r, g, b] or null (transparent)

const W = [139, 90, 43];    // Wood brown
const D = [101, 67, 33];    // Dark wood
const H = [80, 50, 25];     // Hull dark
const S = [240, 230, 210];  // Sail cream
const M = [60, 40, 20];     // Mast dark
const R = [180, 60, 60];    // Red accent
const B = [40, 80, 120];    // Water blue
const G = [120, 120, 120];  // Stone gray
const K = [80, 80, 80];     // Dark stone
const T = [160, 80, 60];    // Roof terracotta
const Y = [200, 180, 100];  // Sand/beach
const _ = null;             // Transparent

// Cutter - Small single-mast ship (16x14)
export const CUTTER = [
    [_, _, _, _, _, _, _, _, M, _, _, _, _, _, _, _],
    [_, _, _, _, _, _, _, _, M, _, _, _, _, _, _, _],
    [_, _, _, _, _, _, _, S, M, S, _, _, _, _, _, _],
    [_, _, _, _, _, _, S, S, M, S, S, _, _, _, _, _],
    [_, _, _, _, _, S, S, S, M, S, S, S, _, _, _, _],
    [_, _, _, _, S, S, S, S, M, S, S, S, S, _, _, _],
    [_, _, _, _, S, S, S, S, M, S, S, S, S, _, _, _],
    [_, _, _, _, _, _, _, _, M, _, _, _, _, _, _, _],
    [_, _, _, D, D, D, D, D, D, D, D, D, D, _, _, _],
    [_, _, D, W, W, W, W, W, W, W, W, W, W, D, _, _],
    [_, D, W, W, W, W, W, W, W, W, W, W, W, W, D, _],
    [_, H, H, H, H, H, H, H, H, H, H, H, H, H, H, _],
    [_, _, H, H, H, H, H, H, H, H, H, H, H, H, _, _],
    [_, _, _, _, H, H, H, H, H, H, H, H, _, _, _, _],
];

// Sloop - Two-mast balanced ship (20x16)
export const SLOOP = [
    [_, _, _, _, _, _, M, _, _, _, _, _, M, _, _, _, _, _, _, _],
    [_, _, _, _, _, _, M, _, _, _, _, _, M, _, _, _, _, _, _, _],
    [_, _, _, _, _, S, M, S, _, _, _, S, M, S, _, _, _, _, _, _],
    [_, _, _, _, S, S, M, S, S, _, S, S, M, S, S, _, _, _, _, _],
    [_, _, _, S, S, S, M, S, S, S, S, S, M, S, S, S, _, _, _, _],
    [_, _, _, S, S, S, M, S, S, S, S, S, M, S, S, S, _, _, _, _],
    [_, _, _, S, S, S, M, S, S, S, S, S, M, S, S, S, _, _, _, _],
    [_, _, _, _, S, S, M, S, S, _, S, S, M, S, S, _, _, _, _, _],
    [_, _, _, _, _, _, M, _, _, _, _, _, M, _, _, _, _, _, _, _],
    [_, _, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, _, _],
    [_, D, W, W, W, W, W, W, W, W, W, W, W, W, W, W, W, W, D, _],
    [D, W, W, W, R, W, W, W, W, W, W, W, W, W, W, R, W, W, W, D],
    [H, H, H, H, H, H, H, H, H, H, H, H, H, H, H, H, H, H, H, H],
    [_, H, H, H, H, H, H, H, H, H, H, H, H, H, H, H, H, H, H, _],
    [_, _, H, H, H, H, H, H, H, H, H, H, H, H, H, H, H, H, _, _],
    [_, _, _, _, _, H, H, H, H, H, H, H, H, H, H, _, _, _, _, _],
];

// Brigantine - Fast two-mast trader (24x18)
export const BRIGANTINE = [
    [_, _, _, _, _, _, _, M, _, _, _, _, _, _, _, _, M, _, _, _, _, _, _, _],
    [_, _, _, _, _, _, _, M, _, _, _, _, _, _, _, _, M, _, _, _, _, _, _, _],
    [_, _, _, _, _, _, S, M, S, _, _, _, _, _, _, S, M, S, _, _, _, _, _, _],
    [_, _, _, _, _, S, S, M, S, S, _, _, _, _, S, S, M, S, S, _, _, _, _, _],
    [_, _, _, _, S, S, S, M, S, S, S, _, _, S, S, S, M, S, S, S, _, _, _, _],
    [_, _, _, S, S, S, S, M, S, S, S, S, S, S, S, S, M, S, S, S, S, _, _, _],
    [_, _, _, S, S, S, S, M, S, S, S, S, S, S, S, S, M, S, S, S, S, _, _, _],
    [_, _, _, S, S, S, S, M, S, S, S, S, S, S, S, S, M, S, S, S, S, _, _, _],
    [_, _, _, _, S, S, S, M, S, S, S, _, _, S, S, S, M, S, S, S, _, _, _, _],
    [_, _, _, _, _, _, _, M, _, _, _, _, _, _, _, _, M, _, _, _, _, _, _, _],
    [_, _, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, _, _],
    [_, D, W, W, W, W, W, W, W, W, W, W, W, W, W, W, W, W, W, W, W, W, D, _],
    [D, W, W, W, R, W, W, W, W, W, W, W, W, W, W, W, W, W, W, R, W, W, W, D],
    [D, W, W, W, W, W, W, W, W, W, W, W, W, W, W, W, W, W, W, W, W, W, W, D],
    [H, H, H, H, H, H, H, H, H, H, H, H, H, H, H, H, H, H, H, H, H, H, H, H],
    [_, H, H, H, H, H, H, H, H, H, H, H, H, H, H, H, H, H, H, H, H, H, H, _],
    [_, _, H, H, H, H, H, H, H, H, H, H, H, H, H, H, H, H, H, H, H, H, _, _],
    [_, _, _, _, _, _, H, H, H, H, H, H, H, H, H, H, H, H, _, _, _, _, _, _],
];

// Galleon - Massive three-mast cargo ship (30x22)
export const GALLEON = [
    [_, _, _, _, _, _, _, _, _, M, _, _, _, _, _, _, _, _, _, M, _, _, _, _, _, _, _, M, _, _],
    [_, _, _, _, _, _, _, _, _, M, _, _, _, _, _, _, _, _, _, M, _, _, _, _, _, _, _, M, _, _],
    [_, _, _, _, _, _, _, _, S, M, S, _, _, _, _, _, _, _, S, M, S, _, _, _, _, _, S, M, S, _],
    [_, _, _, _, _, _, _, S, S, M, S, S, _, _, _, _, _, S, S, M, S, S, _, _, _, S, S, M, S, S],
    [_, _, _, _, _, _, S, S, S, M, S, S, S, _, _, _, S, S, S, M, S, S, S, _, S, S, S, M, S, S],
    [_, _, _, _, _, S, S, S, S, M, S, S, S, S, _, S, S, S, S, M, S, S, S, S, S, S, S, M, S, S],
    [_, _, _, _, S, S, S, S, S, M, S, S, S, S, S, S, S, S, S, M, S, S, S, S, S, S, S, M, S, _],
    [_, _, _, _, S, S, S, S, S, M, S, S, S, S, S, S, S, S, S, M, S, S, S, S, S, S, S, M, _, _],
    [_, _, _, _, S, S, S, S, S, M, S, S, S, S, S, S, S, S, S, M, S, S, S, S, S, S, S, M, _, _],
    [_, _, _, _, _, S, S, S, S, M, S, S, S, S, _, S, S, S, S, M, S, S, S, _, _, S, S, M, _, _],
    [_, _, _, _, _, _, _, _, _, M, _, _, _, _, _, _, _, _, _, M, _, _, _, _, _, _, _, M, _, _],
    [_, _, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, _],
    [_, D, W, W, W, W, W, W, W, W, W, W, W, W, W, W, W, W, W, W, W, W, W, W, W, W, W, W, W, D],
    [D, W, W, W, R, W, W, W, W, W, W, W, W, W, W, W, W, W, W, W, W, W, W, W, W, W, R, W, W, D],
    [D, W, W, W, W, W, W, W, W, W, W, W, W, W, W, W, W, W, W, W, W, W, W, W, W, W, W, W, W, D],
    [D, W, W, W, W, W, W, W, W, W, W, W, W, W, W, W, W, W, W, W, W, W, W, W, W, W, W, W, W, D],
    [H, H, H, H, H, H, H, H, H, H, H, H, H, H, H, H, H, H, H, H, H, H, H, H, H, H, H, H, H, H],
    [H, H, H, H, H, H, H, H, H, H, H, H, H, H, H, H, H, H, H, H, H, H, H, H, H, H, H, H, H, H],
    [_, H, H, H, H, H, H, H, H, H, H, H, H, H, H, H, H, H, H, H, H, H, H, H, H, H, H, H, H, _],
    [_, _, H, H, H, H, H, H, H, H, H, H, H, H, H, H, H, H, H, H, H, H, H, H, H, H, H, H, _, _],
    [_, _, _, _, _, _, _, H, H, H, H, H, H, H, H, H, H, H, H, H, H, H, H, H, _, _, _, _, _, _],
    [_, _, _, _, _, _, _, _, _, _, H, H, H, H, H, H, H, H, H, H, _, _, _, _, _, _, _, _, _, _],
];

// Ship metadata
export const SHIPS = {
    cutter: {
        name: "Cutter",
        sprite: CUTTER,
        speed: 2,
        cargo: 2,
        combat: 1,
        description: "Small, scrappy starter",
    },
    sloop: {
        name: "Sloop",
        sprite: SLOOP,
        speed: 1.5,
        cargo: 4,
        combat: 2,
        description: "Balanced workhorse",
    },
    brigantine: {
        name: "Brigantine",
        sprite: BRIGANTINE,
        speed: 2.5,
        cargo: 6,
        combat: 3,
        description: "Fast, medium cargo",
    },
    galleon: {
        name: "Galleon",
        sprite: GALLEON,
        speed: 1,
        cargo: 12,
        combat: 4,
        description: "Massive cargo hauler",
    },
};

// ==================== PORT SPRITES ====================

// Outpost - Simple wooden dock (16x14)
export const OUTPOST = [
    [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
    [_, _, _, _, _, _, _, M, _, _, _, _, _, _, _, _],
    [_, _, _, _, _, _, _, M, _, _, _, _, _, _, _, _],
    [_, _, _, _, _, D, D, D, D, D, _, _, _, _, _, _],
    [_, _, _, _, _, D, W, W, W, D, _, _, _, _, _, _],
    [_, _, _, _, _, D, W, W, W, D, _, _, _, _, _, _],
    [_, _, _, _, _, D, D, D, D, D, _, _, _, _, _, _],
    [_, _, _, _, _, _, _, M, _, _, _, _, _, _, _, _],
    [_, _, D, D, D, D, D, D, D, D, D, D, D, D, _, _],
    [_, _, W, W, W, W, W, W, W, W, W, W, W, W, _, _],
    [_, _, D, D, D, D, D, D, D, D, D, D, D, D, _, _],
    [_, _, _, M, _, _, M, _, _, M, _, _, M, _, _, _],
    [_, _, _, M, _, _, M, _, _, M, _, _, M, _, _, _],
    [_, _, _, M, _, _, M, _, _, M, _, _, M, _, _, _],
];

// Port - Dock with warehouse (20x16)
export const PORT = [
    [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
    [_, _, _, _, _, _, T, T, T, T, T, T, _, _, _, _, _, _, _, _],
    [_, _, _, _, _, T, T, T, T, T, T, T, T, _, _, _, _, _, _, _],
    [_, _, _, _, _, D, D, D, D, D, D, D, D, _, _, M, _, _, _, _],
    [_, _, _, _, _, D, W, W, W, W, W, W, D, _, _, M, _, _, _, _],
    [_, _, _, _, _, D, W, W, W, W, W, W, D, _, _, M, _, _, _, _],
    [_, _, _, _, _, D, W, D, D, D, D, W, D, _, _, M, _, _, _, _],
    [_, _, _, _, _, D, D, D, D, D, D, D, D, _, _, M, _, _, _, _],
    [_, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, _],
    [_, W, W, W, W, W, W, W, W, W, W, W, W, W, W, W, W, W, W, _],
    [_, W, W, W, W, W, W, W, W, W, W, W, W, W, W, W, W, W, W, _],
    [_, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, _],
    [_, _, M, _, M, _, M, _, M, _, M, _, M, _, M, _, M, _, _, _],
    [_, _, M, _, M, _, M, _, M, _, M, _, M, _, M, _, M, _, _, _],
    [_, _, M, _, M, _, M, _, M, _, M, _, M, _, M, _, M, _, _, _],
    [_, _, M, _, M, _, M, _, M, _, M, _, M, _, M, _, M, _, _, _],
];

// Stronghold - Fortified harbor (26x18)
export const STRONGHOLD = [
    [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
    [_, _, _, _, _, G, K, G, _, _, _, _, _, _, _, _, _, _, G, K, G, _, _, _, _, _],
    [_, _, _, _, _, G, R, G, _, _, _, _, _, _, _, _, _, _, G, R, G, _, _, _, _, _],
    [_, _, _, _, G, G, G, G, G, T, T, T, T, T, T, T, T, G, G, G, G, G, _, _, _, _],
    [_, _, _, _, G, G, G, G, T, T, T, T, T, T, T, T, T, T, G, G, G, G, _, _, _, _],
    [_, _, _, _, G, K, K, G, D, D, D, D, D, D, D, D, D, D, G, K, K, G, _, _, _, _],
    [_, _, _, _, G, K, K, G, D, W, W, W, W, W, W, W, W, D, G, K, K, G, _, M, _, _],
    [_, _, _, _, G, K, K, G, D, W, W, W, W, W, W, W, W, D, G, K, K, G, _, M, _, _],
    [_, _, _, _, G, G, G, G, D, W, W, D, D, D, D, W, W, D, G, G, G, G, _, M, _, _],
    [_, _, _, _, G, G, G, G, D, D, D, D, D, D, D, D, D, D, G, G, G, G, _, M, _, _],
    [_, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, _],
    [_, W, W, W, W, W, W, W, W, W, W, W, W, W, W, W, W, W, W, W, W, W, W, W, W, _],
    [_, W, W, W, W, W, W, W, W, W, W, W, W, W, W, W, W, W, W, W, W, W, W, W, W, _],
    [_, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, _],
    [_, _, M, _, M, _, M, _, M, _, M, _, M, _, M, _, M, _, M, _, M, _, M, _, _, _],
    [_, _, M, _, M, _, M, _, M, _, M, _, M, _, M, _, M, _, M, _, M, _, M, _, _, _],
    [_, _, M, _, M, _, M, _, M, _, M, _, M, _, M, _, M, _, M, _, M, _, M, _, _, _],
    [_, _, M, _, M, _, M, _, M, _, M, _, M, _, M, _, M, _, M, _, M, _, M, _, _, _],
];

// Port metadata
export const PORTS = {
    outpost: {
        name: "Outpost",
        sprite: OUTPOST,
        capacity: 2,
        canBuild: ["Cutter"],
        description: "Basic dock, small capacity",
    },
    port: {
        name: "Port",
        sprite: PORT,
        capacity: 5,
        canBuild: ["Cutter", "Sloop"],
        description: "Harbor with repairs",
    },
    stronghold: {
        name: "Stronghold",
        sprite: STRONGHOLD,
        capacity: 10,
        canBuild: ["Cutter", "Sloop", "Brigantine", "Galleon"],
        description: "Fortified, builds all ships",
    },
};

// Draw a pixel sprite at given position with scale
export function drawSprite(k, sprite, x, y, scale = 4) {
    const height = sprite.length;
    const width = sprite[0].length;

    for (let row = 0; row < height; row++) {
        for (let col = 0; col < width; col++) {
            const pixel = sprite[row][col];
            if (pixel) {
                k.drawRect({
                    pos: k.vec2(x + col * scale, y + row * scale),
                    width: scale,
                    height: scale,
                    color: k.rgb(pixel[0], pixel[1], pixel[2]),
                });
            }
        }
    }
}

// Get sprite dimensions
export function getSpriteSize(sprite, scale = 4) {
    return {
        width: sprite[0].length * scale,
        height: sprite.length * scale,
    };
}
