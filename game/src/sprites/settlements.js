// Settlement sprites - Pixel art for settlements
import { W, D, M, Y, G, _ } from "./colors.js";

// Wheat colors
const WH = [220, 190, 90];   // Wheat yellow
const WD = [180, 150, 60];   // Wheat dark

// Settlement - Wheat field with rows (16x16)
export const SETTLEMENT = [
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

// Settlement metadata
export const SETTLEMENTS = {
    settlement: {
        name: "Settlement",
        sprite: SETTLEMENT,
        imageSprite: "settlement",
        cost: { wood: 5 },
        crewCapContribution: 5,
        buildTime: 5,
        sightDistance: 3,
        health: 25,
        description: "Produces wood over time",
        // Resource generation
        generationInterval: 15,  // seconds between harvests
        woodPerHarvest: 5,
    },
};
