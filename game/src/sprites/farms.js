// Farm sprites - Pixel art for farms
import { W, D, M, Y, G, _ } from "./colors.js";

// Wheat colors
const WH = [220, 190, 90];   // Wheat yellow
const WD = [180, 150, 60];   // Wheat dark

// Farm - Wheat field with rows (16x16)
export const FARM = [
    [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
    [_, _, WH, _, WH, _, WH, _, WH, _, WH, _, WH, _, _, _],
    [_, _, WH, _, WH, _, WH, _, WH, _, WH, _, WH, _, _, _],
    [_, _, WD, _, WD, _, WD, _, WD, _, WD, _, WD, _, _, _],
    [_, D, D, D, D, D, D, D, D, D, D, D, D, D, D, _],
    [_, _, WH, _, WH, _, WH, _, WH, _, WH, _, WH, _, _, _],
    [_, _, WH, _, WH, _, WH, _, WH, _, WH, _, WH, _, _, _],
    [_, _, WD, _, WD, _, WD, _, WD, _, WD, _, WD, _, _, _],
    [_, D, D, D, D, D, D, D, D, D, D, D, D, D, D, _],
    [_, _, WH, _, WH, _, WH, _, WH, _, WH, _, WH, _, _, _],
    [_, _, WH, _, WH, _, WH, _, WH, _, WH, _, WH, _, _, _],
    [_, _, WD, _, WD, _, WD, _, WD, _, WD, _, WD, _, _, _],
    [_, D, D, D, D, D, D, D, D, D, D, D, D, D, D, _],
    [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
    [_, M, _, _, _, _, _, _, _, _, _, _, _, _, M, _],
    [_, M, _, _, _, _, _, _, _, _, _, _, _, _, M, _],
];

// Farm metadata
export const FARMS = {
    farm: {
        name: "Settlement",
        sprite: FARM,
        buildTime: 30,
        sight_distance: 3,
        description: "Produces food over time",
    },
};
