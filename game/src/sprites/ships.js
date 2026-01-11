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
        name: "Cutter",                 // Ship display name
        sprite: CUTTER,                 // Ship ASCII art or pixel array for in-game display
        imageSprite: "cutter",          // Kaplay sprite asset name (loaded separately in main.js)
        directionalSprite: "cutter-v2", // 3x5 directional sprite (5 dirs, mirror for 3 more)
        animFrames: 3,                  // Animation frames per direction
        spriteScale: 1,               // scale multiplier for image sprite in UI/game
        build_time: 5,                  // Turns or seconds required to build in port
        speed: 2.5,                       // Speed (cells/second or units/turn) for moving on map
        cargo: 10,                      // Maximum cargo capacity
        combat: 3,                      // Combat power (simple base damage or stat)
        health: 15,                     // Ship hit points (HP)
        fireCooldown: 3,                // Cooldown (seconds between firing shots)
        attackDistance: 3,              // Range (in tiles/cells) for attacking enemies
        enemySightDistance: 3,          // How far AI can spot threats when controlling ship
        sightDistance: 3,               // How far player can reveal "fog of war"
        maxChaseDistance: 8,            // Give up chase after this many hex moves
        wakeSize: 8,                    // Base size of water trail wake
        cost: { wood: 10 },             // Build resource costs (object: wood)
        crewCost: 5,                    // Crew required to operate
        description: "Small, scrappy starter", // Description for UI/tooltips
    },
    schooner: {
        name: "Schooner",
        sprite: SCHOONER,
        imageSprite: "schooner",
        spriteScale: 1,
        build_time: 10,
        speed: 2,
        cargo: 50,
        combat: 2.5,
        health: 60,
        fireCooldown: 1.5,        // seconds between shots
        attackDistance: 5,      // range to attack targets
        enemySightDistance: 6,  // detection range when AI-controlled
        sightDistance: 6,
        maxChaseDistance: 10,   // give up chase after this many hex moves
        projectileCount: 2,     // fires two shots per volley
        wakeSize: 10,           // base size of water trail wake
        cost: { wood: 30 },
        crewCost: 10,
        description: "Balanced workhorse",
    },
    brigantine: {
        name: "Brigantine",
        sprite: BRIGANTINE,
        build_time: 25,
        speed: 2.5,
        cargo: 45,
        combat: 3,
        health: 30,
        fireCooldown: 4,        // seconds between shots
        attackDistance: 2,      // range to attack targets
        enemySightDistance: 7,  // detection range when AI-controlled
        sightDistance: 2,
        maxChaseDistance: 12,   // give up chase after this many hex moves
        wakeSize: 12,           // base size of water trail wake
        cost: { wood: 50 },
        crewCost: 12,
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
        attackDistance: 2,      // range to attack targets
        enemySightDistance: 8,  // detection range when AI-controlled
        sightDistance: 3,
        maxChaseDistance: 15,   // give up chase after this many hex moves
        wakeSize: 16,           // base size of water trail wake
        cost: { wood: 100 },
        crewCost: 20,
        description: "Massive cargo hauler",
    },
    pirate: {
        name: "Pirate Ship",
        sprite: PIRATE,
        imageSprite: "pirate",
        spriteScale: 1,
        speed: 1,
        cargo: 4,
        combat: 4,
        health: 30,
        fireCooldown: 5,        // seconds between shots
        sightDistance: 2,
        wakeSize: 10,           // base size of water trail wake
        description: "Enemy pirate vessel",
        // AI behavior constants
        enemySightDistance: 5,  // Detection range for player ships/ports
        attackDistance: 2,      // Range to stop and attack
        maxChaseDistance: 15,   // Give up chase if target gets this far
        retreatCooldown: 5,     // Seconds before returning to patrol
    },
};
