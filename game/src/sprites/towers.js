// Tower sprites - Defensive structures
import { G, K, D, R, _ } from "./colors.js";

// Tower - Stone defensive tower (12x16)
export const TOWER = [
    [_, _, _, _, R, R, R, R, _, _, _, _],
    [_, _, _, K, K, K, K, K, K, _, _, _],
    [_, _, _, K, G, G, G, G, K, _, _, _],
    [_, _, K, K, G, G, G, G, K, K, _, _],
    [_, _, K, G, G, G, G, G, G, K, _, _],
    [_, _, K, G, G, K, K, G, G, K, _, _],
    [_, _, K, G, G, K, K, G, G, K, _, _],
    [_, _, K, G, G, G, G, G, G, K, _, _],
    [_, _, K, G, G, G, G, G, G, K, _, _],
    [_, _, K, G, G, K, K, G, G, K, _, _],
    [_, _, K, G, G, K, K, G, G, K, _, _],
    [_, _, K, G, G, G, G, G, G, K, _, _],
    [_, K, K, G, G, G, G, G, G, K, K, _],
    [_, K, G, G, G, G, G, G, G, G, K, _],
    [K, K, K, K, K, K, K, K, K, K, K, K],
    [D, D, D, D, D, D, D, D, D, D, D, D],
];

// Tower metadata
export const TOWERS = {
    tower: {
        name: "Tower",
        sprite: TOWER,
        buildTime: 15,
        health: 30,
        cost: { wood: 15 },
        attackRange: 3,      // hexes
        fireCooldown: 4,     // seconds between shots
        damage: 5,           // same as ships
        sightDistance: 3,
        description: "Defensive tower, attacks pirates",
    },
};
