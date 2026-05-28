// Worker entity definition - the land unit that harvests wood from trees
// and carries it back to the nearest player port.

export const WORKER_CONFIG = {
    // Starting count spawned at the home port at game start
    startingCount: 5,

    // How fast a worker walks across hexes (hexes per second). Ships are
    // ~1.2 hex/sec for reference; workers should feel slower than ships.
    speed: 0.6,

    // Combat
    health: 20,

    // Wood carried per trip back to the port
    cargoCapacity: 5,

    // Seconds to chop one cargo's worth of wood (cargoCapacity wood)
    chopTime: 2,

    // Visual radius of the worker dot (in world pixels at zoom 1)
    radius: 5,

    // Color (RGB) — uses a warm earthy color so it reads against grass.
    color: [220, 180, 90],
    selectedRingColor: [255, 255, 255],
    cargoIndicatorColor: [180, 110, 50],  // brown — visible when carrying wood
};

// Per-tree-hex wood pool. Each inland land tile starts with this much wood.
export const TREE_HEX_WOOD = 100;
