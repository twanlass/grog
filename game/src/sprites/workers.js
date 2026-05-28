// Worker entity definition - the land unit that harvests wood from trees
// and carries it back to the nearest player port. Workers are also the
// only way to build land structures (settlements, towers, and new ports
// on the same island). Ships still build ports across water — and each
// completed port spawns a small starter crew so a new island isn't left
// without labour.

export const WORKER_CONFIG = {
    // Starting count spawned at the home port at game start. Matches the
    // PORT_STARTER_WORKERS count so the early game scales the same way
    // for newly-built ports.
    startingCount: 3,

    // How fast a worker walks across hexes (hexes per second). Ships are
    // ~1.2 hex/sec for reference; workers should feel slower than ships.
    speed: 0.6,

    // Combat
    health: 20,

    // Wood carried per trip back to the port
    cargoCapacity: 5,

    // Seconds to chop one cargo's worth of wood (cargoCapacity wood)
    chopTime: 2,

    // Cost + build time when produced from a port. Cheap and quick so the
    // player can grow their labour pool without it feeling like a second
    // ship-build queue. (Worker production at ports is single-slot, not
    // queueable — each port can build one worker at a time.)
    cost: { wood: 5 },
    buildTime: 5,

    // Visual radius of the worker dot (in world pixels at zoom 1)
    radius: 5,

    // Color (RGB) — uses a warm earthy color so it reads against grass.
    color: [220, 180, 90],
    selectedRingColor: [255, 255, 255],
    cargoIndicatorColor: [180, 110, 50],  // brown — visible when carrying wood
};

// Per-tree-hex wood pool. Each inland land tile starts with this much wood.
export const TREE_HEX_WOOD = 100;

// Number of starter workers spawned next to a port the instant it finishes
// construction (in addition to the home port, which spawns these at game
// start). Lets a brand-new island bootstrap a labour pool without making
// the player ferry workers over.
export const PORT_STARTER_WORKERS = 3;

