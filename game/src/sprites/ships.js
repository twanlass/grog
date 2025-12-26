// Ship sprites - Side view pixel art ships
import { W, D, H, S, M, R, BK, _ } from "./colors.js";

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

// Schooner - Two-mast balanced ship (20x16)
export const SCHOONER = [
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

// Pirate - Enemy ship with black sails (20x16, based on Schooner)
export const PIRATE = [
    [_, _, _, _, _, _, M, _, _, _, _, _, M, _, _, _, _, _, _, _],
    [_, _, _, _, _, _, M, _, _, _, _, _, M, _, _, _, _, _, _, _],
    [_, _, _, _, _,BK, M,BK, _, _, _,BK, M,BK, _, _, _, _, _, _],
    [_, _, _, _,BK,BK, M,BK,BK, _,BK,BK, M,BK,BK, _, _, _, _, _],
    [_, _, _,BK,BK,BK, M,BK,BK,BK,BK,BK, M,BK,BK,BK, _, _, _, _],
    [_, _, _,BK,BK,BK, M,BK,BK,BK,BK,BK, M,BK,BK,BK, _, _, _, _],
    [_, _, _,BK,BK,BK, M,BK,BK,BK,BK,BK, M,BK,BK,BK, _, _, _, _],
    [_, _, _, _,BK,BK, M,BK,BK, _,BK,BK, M,BK,BK, _, _, _, _, _],
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
        imageSprite: "cutter",  // Kaplay sprite name (loaded in main.js)
        spriteScale: 1,       // scale multiplier for image sprite
        build_time: 5,
        speed: 2,
        cargo: 2,
        combat: 1,
        health: 20,
        fireCooldown: 6,        // seconds between shots
        sightDistance: 1,
        cost: { wood: 10, food: 5 },
        description: "Small, scrappy starter",
    },
    schooner: {
        name: "Schooner",
        sprite: SCHOONER,
        imageSprite: "schooner",
        spriteScale: 1.5,
        build_time: 10,
        speed: 1.5,
        cargo: 4,
        combat: 3,
        health: 30,
        fireCooldown: 3,        // seconds between shots
        sightDistance: 1,
        cost: { wood: 25, food: 10 },
        description: "Balanced workhorse",
    },
    brigantine: {
        name: "Brigantine",
        sprite: BRIGANTINE,
        build_time: 25,
        speed: 2.5,
        cargo: 6,
        combat: 3,
        health: 30,
        fireCooldown: 4,        // seconds between shots
        sightDistance: 2,
        cost: { wood: 50, food: 20 },
        description: "Fast, medium cargo",
    },
    galleon: {
        name: "Galleon",
        sprite: GALLEON,
        build_time: 50,
        speed: 1,
        cargo: 12,
        combat: 4,
        health: 50,
        fireCooldown: 3,        // seconds between shots
        sightDistance: 3,
        cost: { wood: 100, food: 75 },
        description: "Massive cargo hauler",
    },
    pirate: {
        name: "Pirate Ship",
        sprite: PIRATE,
        imageSprite: "pirate",
        spriteScale: 1.5,
        speed: 1,
        cargo: 4,
        combat: 3,
        health: 25,
        fireCooldown: 5,        // seconds between shots
        sightDistance: 2,
        description: "Enemy pirate vessel",
        // AI behavior constants
        enemySightDistance: 5,  // Detection range for player ships/ports
        attackDistance: 2,      // Range to stop and attack
        maxChaseDistance: 15,   // Give up chase if target gets this far
        retreatCooldown: 5,     // Seconds before returning to patrol
    },
};
