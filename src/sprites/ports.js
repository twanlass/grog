// Port sprites - Pixel art harbors and docks
import { W, D, M, R, G, K, T, _ } from "./colors.js";

// Dock - Simple wooden dock (16x14)
export const DOCK = [
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
    dock: {
        name: "Dock",
        sprite: DOCK,
        capacity: 2,
        canBuild: ["Cutter"],
        buildTime: 25,
        cost: { wood: 20 },
        description: "Basic dock, small capacity",
    },
    port: {
        name: "Port",
        sprite: PORT,
        capacity: 5,
        canBuild: ["Cutter", "Schooner"],
        buildTime: 100,
        cost: { wood: 50 },
        description: "Harbor with repairs",
    },
    stronghold: {
        name: "Stronghold",
        sprite: STRONGHOLD,
        capacity: 10,
        canBuild: ["Cutter", "Schooner", "Brigantine", "Galleon"],
        buildTime: 200,
        cost: { wood: 100 },
        description: "Fortified, builds all ships",
    },
};
