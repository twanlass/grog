// Worker entity definition — autonomous land units that handle the
// chopping loop. Workers are NOT player-controlled: they spawn from
// settlements (and from the home port at game start), find the nearest
// non-depleted tree, walk → chop → walk back to the nearest player-owned
// hub (port or settlement) → deposit → repeat. When no tree is reachable
// on their island, they idle. They're a visual + economic substrate, not
// a unit the player micromanages.

export const WORKER_CONFIG = {
    // How fast a worker walks across hexes (hexes per second). Ships are
    // ~1.2 hex/sec for reference; workers should feel slower than ships.
    speed: 0.6,

    // Combat (workers have HP for future targeting but no enemy shoots
    // them yet)
    health: 20,

    // Wood carried per trip back to a hub
    cargoCapacity: 5,

    // Seconds to chop one cargo's worth of wood
    chopTime: 2,

    // Visual radius of the worker dot (in world pixels at zoom 1)
    radius: 5,

    // Color (RGB) — warm earthy color so it reads against grass
    color: [220, 180, 90],
    cargoIndicatorColor: [180, 110, 50],
};

// Per-tree-hex wood pool. Each inland land tile starts with this much wood.
export const TREE_HEX_WOOD = 100;

// Workers spawned next to a settlement the moment its construction
// completes. These workers immediately start the chopping loop.
export const SETTLEMENT_WORKERS = 3;
