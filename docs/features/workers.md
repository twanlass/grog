# Workers

Workers are the player's land-based labour force. They harvest wood from
tree hexes, carry it back to the nearest port, and are the **only** way
to build settlements, watchtowers, and new ports on the same island.
Ships still build ports across water (but only Schooners do, now), and
every completed port spawns a small starter crew so a new island can
bootstrap without ferrying workers over.

This is a **prototype** — minimal art (colored dots), no caps, no food
cost, single-player only. AI players still get wood from settlements.

## What workers do

| Action                  | How                                                                                |
| ----------------------- | ---------------------------------------------------------------------------------- |
| Harvest wood            | Right-click a tree hex → auto-loop (chop → return to nearest port → repeat)        |
| Walk                    | Right-click any non-tree land hex                                                  |
| Build a settlement      | Select worker(s) → **BUILD SETTLEMENT** (S) → click a valid hex                    |
| Build a watchtower      | Select worker(s) → **BUILD WATCHTOWER** (T) → click a valid hex                    |
| Build a new dock        | Select worker(s) → **BUILD DOCK** (D) → click a valid coastal hex                  |

## What ports do (worker production)

Ports produce workers, single-slot:

- **BUILD WORKER (W)** in the port build panel: deducts 5 wood, ticks
  for 5 seconds, spawns a worker on the nearest free land hex.
- Only one worker production per port at a time. Click again after the
  current one finishes to start another.
- The port build panel no longer has BUILD SETTLEMENT or BUILD WATCHTOWER
  — those moved to the worker panel.

## Schooner gate for ship-built ports

A ship's BUILD PORT button (Build Dock from sea) now requires a Schooner.
Cutters can no longer plant ports. Expansion = upgrade Dock → Shipyard,
build a Schooner, sail it across, plant a port. Once the new port
completes it spawns `PORT_STARTER_WORKERS` (3) workers right next to it —
so the island has labour from frame one without you having to ferry
workers across water.

## Starting state

- Home port starts with `WORKER_CONFIG.startingCount` (3) workers next
  to it.
- Each new port — whether built by a worker on the same island OR by a
  Schooner across water — spawns `PORT_STARTER_WORKERS` (3) starter
  workers when its construction completes.
- The worker that built the port is released back to idle on completion,
  so a worker-built port nets +2 workers (3 new − 1 invested as builder).

## Construction tether

When a player builds a settlement / tower / dock:

1. Click the button → enter placement mode.
2. Click a valid hex → the structure spawns in its `construction` state
   with `construction.builderWorkerId = <nearest selected worker>.id`.
3. That worker walks to the site and enters the `building` state.
4. **Construction progress only ticks while the tethered worker is alive,
   on-site, and in the `building` state.** If the worker is reassigned
   (impossible right now — locked) or destroyed, progress pauses.
5. On completion, the worker is released back to `idle` and the structure
   becomes operational.
6. **Cancelling** an in-progress structure (the existing CANCEL button on
   the construction status panel) releases the worker AND refunds the wood.

Workers in the `building` state ignore new move / harvest / build orders
until the build finishes or is cancelled — same lock-during-construction
model as ships building ports.

## Selection

- **Single click** on a worker selects it (small white ring on the dot).
- **Double-click** on a worker selects all visible workers.
- **Drag-box select** picks up any worker dots in the box.
- Shift toggles individual workers in the selection.
- Mobile uses the existing tap / double-tap / long-press vocabulary.

## Right-click semantics with workers selected

| Click target                          | Behavior                                      |
| ------------------------------------- | --------------------------------------------- |
| Tree hex (woodRemaining > 0)          | Auto-harvest loop                             |
| Plain land hex                        | Walk there                                    |
| Water / off-island land               | No-op (silently)                              |
| Workers in `building` state           | Reject — they're locked to the construction   |

If both ships and workers are selected, the right-click resolves both —
workers act on land, ships fall through to their normal handlers.

## Data structures

### Worker
```js
worker = {
    id: 'worker-N',
    owner: 'player',
    q, r,
    path, moveProgress, movingToward,
    state: 'idle' | 'moving' | 'chopping' | 'returning' | 'building',
    harvestTarget: {q, r} | null,
    buildTask: { structureType, structureId, q, r } | null,
    cargo: 0..5,
    chopProgress: 0,
    health: 20,
    hitFlash: 0,
}
```

### Structure construction fields
```js
// Each of settlement / tower / port carries a builderWorkerId when
// player-built; AI / ship-built leave it null.
structure.construction = {
    progress, buildTime,
    builderWorkerId: 'worker-N' | null,
    // (ports also carry builderShipIndex for cross-water builds)
}
```

### Port worker production
```js
port.workerBuild = { progress, buildTime } | null;
```

### Worker build mode
```js
gameState.workerBuildMode = {
    active: false,
    structureType: 'settlement' | 'tower' | 'port' | null,
    portType: 'dock' | null,  // for structureType === 'port'
    hoveredHex: {q, r} | null,
}
```

### Tree-hex tile fields (unchanged from previous prototype)
```js
tile.woodRemaining = 100;   // TREE_HEX_WOOD
tile.depleted = false;
```

## Files

| File | Purpose |
|------|---------|
| `game/src/sprites/workers.js` | `WORKER_CONFIG` + `TREE_HEX_WOOD` + `PORT_STARTER_WORKERS` |
| `game/src/systems/workers.js` | State machine + `commandWorkerMove` / `commandWorkerHarvest` / `commandWorkerBuild` / `releaseWorkerFromBuild` |
| `game/src/systems/construction.js` | `canTickConstruction`, `spawnPortStarterWorkers`, `updatePortWorkerBuilds`, and the worker-aware progress loops |
| `game/src/systems/combat.js` | `cancelSettlementConstruction` (new), `releaseBuilderWorker` on cancel/destroy |
| `game/src/gameState.js` | `createWorker`, `enterWorkerBuildMode`, `exitWorkerBuildMode`, `workerBuild`/`buildTask` fields, worker support in selection helpers |
| `game/src/mapGenerator.js` | Seeds `woodRemaining` on inland land tiles |
| `game/src/pathfinding.js` | `findLandPath`, `findNearestTreeOnIsland`, `findNearestPortIndexOnIsland` |
| `game/src/systems/inputHandler.js` | `handleWorkerCommandClick`, `handleWorkerSelection`, `handleWorkerBuildPanelClick`, `handleWorkerBuildPlacementClick`, port BUILD WORKER button handler |
| `game/src/scenes/gameScene.js` | `spawnStartingWorkers`, panel wiring, hotkeys (S/T/D/W), ESC + right-click cancellation |
| `game/src/rendering/unitRenderer.js` | `drawWorkers` (dots + cargo pip) |
| `game/src/rendering/uiPanels.js` | `drawWorkerBuildPanel` + updated port build panel (BUILD WORKER) + Schooner-gated ship port section |
| `game/src/rendering/placementUI.js` | `drawWorkerBuildPlacementMode` (settlement / tower / port preview) |
| `game/src/rendering/selectionUI.js` | Worker selection ring |
| `game/src/rendering/tileRenderer.js` | Hides trees on `tile.depleted === true` |
| `game/src/systems/resourceGeneration.js` | Player-settlement wood removed |

## Tunables (all in `sprites/workers.js`)

| Constant                          | Default | What it controls                                  |
| --------------------------------- | ------- | ------------------------------------------------- |
| `WORKER_CONFIG.startingCount`     | 3       | Workers spawned next to home port                 |
| `PORT_STARTER_WORKERS`            | 3       | Workers spawned when any new port completes       |
| `WORKER_CONFIG.cost`              | 5 wood  | Cost to produce a worker at a port                |
| `WORKER_CONFIG.buildTime`         | 5 s     | Time to produce a worker at a port                |
| `WORKER_CONFIG.speed`             | 0.6     | Walk speed (hexes / sec)                          |
| `WORKER_CONFIG.health`            | 20      | HP                                                |
| `WORKER_CONFIG.cargoCapacity`     | 5       | Wood per harvest trip                             |
| `WORKER_CONFIG.chopTime`          | 2 s     | Seconds per chop                                  |
| `TREE_HEX_WOOD`                   | 100     | Initial wood per tree hex                         |

## Out of scope for this prototype

- **AI workers** — AIs still produce wood from settlements
- **Multiplayer sync** — worker state not serialized in net snapshots
- **Worker combat targeting** — workers have HP but no enemy intentionally
  shoots them yet
- **Worker production queueing** — single-slot only, no AoE-style "queue 5"
- **Tree regrowth** — depleted is permanent
- **Pixel art** — workers are colored dots with a brown cargo pip
- **Per-island reachability filter on placement preview** — every valid
  hex is highlighted; cross-island clicks are silently rejected at
  command time

## Edge cases

- **No idle worker selected when clicking BUILD button:** the placement
  hex click shows "No available worker selected" and exits build mode.
- **Selected workers are all `building`:** same — no eligible builder,
  placement click is a no-op + notification.
- **No land path to the placement hex:** the structure isn't created and
  wood is refunded; notification "No land path to that hex".
- **Worker mid-chop, player issues BUILD command via placement click:**
  the nearest eligible worker drops harvesting and walks to build.
  Chopping workers ARE eligible — only `building` / `buildTask`-locked
  workers are excluded.
- **Cancel mid-build:** structure removed, wood refunded, worker released.
- **All ports destroyed mid-trip:** worker can't find a return path,
  goes `idle` holding cargo. As soon as a port comes back, the next
  command resumes the loop.
- **Worker production at a port being destroyed:** the port disappears
  with its `workerBuild` field; queued wood is forfeit (already
  deducted). Considered acceptable for prototype.
