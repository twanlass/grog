// Tower sprites - Defensive structures with upgrade tiers
import { G, K, D, R, W, H, _ } from "./colors.js";

// Watchtower - Wooden observation tower (12x16)
export const WATCHTOWER = [
    [_, _, _, _, _, R, R, _, _, _, _, _],
    [_, _, _, _, R, R, R, R, _, _, _, _],
    [_, _, _, _, K, W, W, K, _, _, _, _],
    [_, _, _, _, K, W, W, K, _, _, _, _],
    [_, _, _, _, K, W, W, K, _, _, _, _],
    [_, _, _, K, W, W, W, W, K, _, _, _],
    [_, _, _, K, W, K, K, W, K, _, _, _],
    [_, _, _, K, W, W, W, W, K, _, _, _],
    [_, _, _, _, K, W, W, K, _, _, _, _],
    [_, _, _, _, K, W, W, K, _, _, _, _],
    [_, _, _, K, W, W, W, W, K, _, _, _],
    [_, _, _, K, W, K, K, W, K, _, _, _],
    [_, _, K, W, W, W, W, W, W, K, _, _],
    [_, _, K, W, W, W, W, W, W, K, _, _],
    [_, K, K, K, K, K, K, K, K, K, K, _],
    [D, D, D, D, D, D, D, D, D, D, D, D],
];

// Mortar Tower - Stone tower with single cannon (12x16)
export const MORTAR_TOWER = [
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

// Cannon Battery - Fortified dual-cannon emplacement (12x16)
export const CANNON_BATTERY = [
    [_, _, R, R, R, R, R, R, R, R, _, _],
    [_, K, K, K, K, K, K, K, K, K, K, _],
    [_, K, G, G, G, K, K, G, G, G, K, _],
    [K, K, G, G, G, K, K, G, G, G, K, K],
    [K, G, G, K, K, G, G, K, K, G, G, K],
    [K, G, G, K, K, G, G, K, K, G, G, K],
    [K, G, G, G, G, G, G, G, G, G, G, K],
    [K, G, G, G, G, G, G, G, G, G, G, K],
    [K, K, G, G, G, G, G, G, G, G, K, K],
    [_, K, G, G, G, G, G, G, G, G, K, _],
    [_, K, G, G, G, K, K, G, G, G, K, _],
    [_, K, G, G, G, K, K, G, G, G, K, _],
    [_, K, K, G, G, G, G, G, G, K, K, _],
    [_, K, G, G, G, G, G, G, G, G, K, _],
    [K, K, K, K, K, K, K, K, K, K, K, K],
    [D, D, D, D, D, D, D, D, D, D, D, D],
];

// Tower tech tree (upgrade order)
export const TOWER_TECH_TREE = ['watchtower', 'mortarTower', 'cannonBattery'];

// Tower metadata
export const TOWERS = {
    watchtower: {
        name: "Watchtower",
        sprite: WATCHTOWER,
        buildTime: 15,
        health: 75,
        cost: { wood: 25 },
        crewCost: 5,
        sightDistance: 3,
        description: "Reveals fog of war",
    },
    mortarTower: {
        name: "Mortar Tower",
        sprite: MORTAR_TOWER,
        buildTime: 15,
        health: 100,
        cost: { wood: 25 },
        crewCost: 5,
        attackRange: 4,
        fireCooldown: 4,
        damage: 5,
        projectileCount: 1,
        sightDistance: 5,
        description: "Single cannon tower",
    },
    cannonBattery: {
        name: "Cannon Battery",
        sprite: CANNON_BATTERY,
        buildTime: 15,
        health: 125,
        cost: { wood: 25 },
        crewCost: 5,
        attackRange: 5,
        fireCooldown: 4,
        damage: 5,
        projectileCount: 2,
        sightDistance: 7,
        description: "Dual cannon tower",
    },
};
