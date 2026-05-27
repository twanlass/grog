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

// Crossbow Tower - Stone tower garrisoned with crossbowmen (12x16)
export const CROSSBOW_TOWER = [
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
export const TOWER_TECH_TREE = ['watchtower', 'crossbowTower', 'cannonBattery'];

// Tower metadata
export const TOWERS = {
    watchtower: {
        name: "Watchtower",
        sprite: WATCHTOWER,
        imageSprite: "tower",  // Per-owner color resolved at draw time (tower-red/green/blue/orange)
        imageFrames: 3,
        imageScale: 0.75,
        buildTime: 15,
        health: 40,
        cost: { wood: 25 },
        crewCost: 2,
        sightDistance: 4,
        description: "Reveals fog of war",
    },
    crossbowTower: {
        name: "Crossbow Tower",
        sprite: CROSSBOW_TOWER,
        imageSprite: "mortar-tower",  // Asset slot still uses legacy "mortar-tower" name; rename PNGs + loaders when new art lands
        imageFrames: 3,
        imageScale: 0.65,
        buildTime: 15,
        health: 60,
        cost: { wood: 25 },
        crewCost: 5,
        attackRange: 4,
        fireCooldown: 3,
        damage: 1.5,
        projectileCount: 3,
        staggerDelay: 0.12,
        projectileType: 'arrow',
        sightDistance: 6,
        description: "Rapid-volley arrow tower",
    },
    cannonBattery: {
        name: "Cannon Battery",
        sprite: CANNON_BATTERY,
        imageSprite: "cannon-battery",  // Per-owner color resolved at draw time
        imageFrames: 4,
        imageScale: 0.6,
        buildTime: 15,
        health: 100,
        cost: { wood: 25 },
        crewCost: 8,
        attackRange: 5,
        fireCooldown: 4,
        damage: 5,
        projectileCount: 2,
        sightDistance: 8,
        description: "Dual cannon tower",
    },
};
