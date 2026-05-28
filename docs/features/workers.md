# Workers

Workers are land-based units that harvest wood from tree hexes and carry it
back to the nearest player port. They replace settlement-based wood
generation: the only way to acquire wood is now to send workers chopping.

This is a **prototype** feature — minimal art (colored dots), no caps, no
worker production, single-player only. AI players still get wood from
settlements (they don't yet manage workers).

## Behavior

### Spawning
- **5 starting workers** spawn next to the player's home port at game
  start (BFS outward for the nearest land hexes). Sandbox, defend, and
  versus modes all spawn them; multiplayer and tutorial do not.
- No way to build more workers. No food cost, no crew cap.

### Selection
- **Single click** on a worker selects it (small white ring at the dot).
- **Double-click** on any visible worker selects all visible workers.
- **Drag-box select** includes any worker dots in the box.
- Selection follows the moving dot — easy to grab a walker.

### Movement
- **Right-click on a land hex (any non-tree land)** sends selected workers
  to walk there. Pathfinding is A* on land tiles (`findLandPath`).
- **Right-click on water or off-island land** is rejected — no path, no
  movement. Workers can't cross water.
- Walk speed is ~0.6 hex/sec (slower than ships).

### Harvest loop
- **Right-click on a tree hex** (inland land tile with wood remaining)
  starts an auto-harvest loop:
  1. Walk to the target tree hex.
  2. Chop for 2 seconds → cargo += 5 wood, tile.woodRemaining -= 5.
  3. When cargo is full (5), walk to the nearest player port on the same
     island.
  4. Deposit cargo into `gameState.resources.wood` (a "+5" floats over
     the port).
  5. Walk back to the original tree and resume.
- When the target tree depletes (`woodRemaining <= 0`), the tile is
  marked `depleted` and trees stop rendering on it. The worker BFS-finds
  the nearest non-depleted tree on the same island and continues; if none
  remain, it idles.
- If a worker's right-click lands on a non-tree land hex but the
  worker is selected for harvest, the system BFS-finds the nearest tree
  from the clicked hex and uses that as the target.

### Mixed selection
- If workers AND ships are selected, a single right-click resolves both:
  workers take the worker command (move/harvest on land), ships fall
  through to the normal ship handlers (attack, plunder, sail).

### Combat
- Workers carry `health` (default 20) and `hitFlash`. The damage
  application path is in place but no AI / pirate logic targets them yet
  — they're effectively invulnerable for the prototype. (Targeting will
  be wired up once we add AI workers and pirate-vs-worker behaviour.)

## Data structures

### Worker
```js
worker = {
    id: 'worker-N',
    owner: 'player',
    q, r,                     // Current hex
    path: [{q,r}, ...] | null,// A* path being walked
    moveProgress: 0,          // 0..1 progress along the current path segment
    movingToward: {q,r} | null,
    state: 'idle' | 'moving' | 'chopping' | 'returning',
    harvestTarget: {q,r} | null,  // The tree the worker is bound to
    cargo: 0,                 // Wood currently being carried (max cargoCapacity)
    chopProgress: 0,          // Seconds elapsed in the current chop
    health: 20,
    hitFlash: 0,
}
```

### Tree-hex tile fields (added at map gen)
Every inland (non-`isPortSite`) land tile gets:
```js
tile.woodRemaining = 100;   // TREE_HEX_WOOD
tile.depleted = false;
```
When `woodRemaining` drops to 0, `depleted` is set to `true` and the
decoration renderer hides tree and palm sprites for that hex (grass still
draws). Settlement placement rules are unchanged — you can still build
on a tree hex, but it's now a real economic trade-off.

## Files

| File | Purpose |
|------|---------|
| `game/src/sprites/workers.js` | `WORKER_CONFIG` constants + `TREE_HEX_WOOD` |
| `game/src/systems/workers.js` | State machine, movement, `commandWorkerMove`, `commandWorkerHarvest`, `updateWorkers`, `getWorkerVisualPos` |
| `game/src/gameState.js` | `createWorker`, `getSelectedWorkers`, worker support in selection helpers |
| `game/src/mapGenerator.js` | Seeds `woodRemaining` / `depleted` on inland land tiles (PHASE 4) |
| `game/src/pathfinding.js` | `findLandPath`, `findNearestTreeOnIsland`, `findNearestPortIndexOnIsland` |
| `game/src/systems/inputHandler.js` | `handleWorkerCommandClick`, `handleWorkerSelection` |
| `game/src/scenes/gameScene.js` | `spawnStartingWorkers`, wiring into update / draw / click / box / right-click |
| `game/src/rendering/unitRenderer.js` | `drawWorkers` (dots + cargo pip) |
| `game/src/rendering/selectionUI.js` | Worker selection ring at visual position |
| `game/src/rendering/tileRenderer.js` | Hides trees on `tile.depleted === true` |
| `game/src/systems/resourceGeneration.js` | Player-settlement wood removed |

## Tunables

All in `sprites/workers.js`:

| Constant | Default | What it controls |
|----------|---------|------------------|
| `WORKER_CONFIG.startingCount` | 5 | Workers spawned at the home port |
| `WORKER_CONFIG.speed` | 0.6 | Walk speed (hexes/sec) |
| `WORKER_CONFIG.health` | 20 | HP |
| `WORKER_CONFIG.cargoCapacity` | 5 | Wood per trip |
| `WORKER_CONFIG.chopTime` | 2 | Seconds per chop |
| `WORKER_CONFIG.radius` | 5 | Render dot radius (world px) |
| `TREE_HEX_WOOD` | 100 | Initial wood per tree hex |

## Out of scope for this prototype

- **AI workers** — AIs still produce wood from settlements.
- **Multiplayer sync** — worker state is not serialized in net snapshots.
- **Combat targeting** — workers have HP but no enemy intentionally
  shoots at them yet.
- **Worker production** — no way to build more, no caps, no food cost.
- **Tree regrowth** — depleted is permanent.
- **Pixel art** — workers are colored dots; cargo is a small brown pip.
- **Settlement role** — settlements still buildable, just no longer
  produce player wood. Future role (population, crew cap) is parked.

## Edge cases

- **All ports destroyed mid-trip:** worker can't find a return path,
  goes `idle` holding cargo. As soon as a port comes back, the next
  command (harvest or move) resumes the loop.
- **Tree depletes while walking to it:** on arrival the chopping check
  finds `depleted`, runs `resumeHarvest()` to find the next nearest tree.
- **Worker on a different island than the clicked target:**
  `findLandPath` returns null, the command is silently rejected.
- **Worker clicked on a coastal land hex with no trees nearby:**
  `findNearestTreeOnIsland` returns null, the worker goes idle.
- **Game paused (timeScale === 0):** `updateWorkers` returns early, all
  state freezes.
