# Workers

Workers are autonomous land units that turn nearby trees into wood. They
are **not player-controllable** — no selection, no commands, no panel.
Settlements spawn them automatically; they walk to the nearest tree, chop
it down, walk back to the nearest player hub (port or settlement), and
deposit. Trees are a limited resource (100 wood each, no regrowth), so
when a settlement strips its surroundings it goes quiet — forcing the
player to expand. Player attention stays on ships and combat; the
chopping loop is ambient.

This is a **prototype** — workers are colored dots with a small brown
cargo pip. AI players still get wood from settlements via the legacy
timer-based generator (no AI workers).

## How wood is produced

1. **Game start:** the home port has **no workers**. The player has
   25 starting wood — enough to build the first settlement (5 wood)
   plus a cutter (10) plus some buffer.
2. **Build a settlement** from the port build panel. When construction
   completes, the settlement spawns `SETTLEMENT_WORKERS` (3) workers
   next to it.
3. Every worker repeats: **idle → walk to nearest tree on the same island
   → chop until cargo full → walk to the SPECIFIC settlement that
   spawned them → deposit (instant +3 wood, floating number) → idle**.
   Workers don't deposit at the nearest hub or at ports — only at their
   home settlement.
4. When the nearest tree depletes (`woodRemaining <= 0`), the tile is
   marked `depleted` (renderer hides trees) and the worker BFS-finds the
   next one.
5. When **no tree is reachable on this island**, the worker idles
   indefinitely. This is the signal that the island is tapped out — go
   build a port somewhere else.

## What the player still controls

- Ports build everything (ships, settlements, watchtowers — unchanged
  from the pre-worker game).
- Settlements still raise the **crew cap**, so building them is mandatory
  even beyond the wood angle.
- Ships build new ports across water (any ship, as before — no Schooner
  gate). A brand-new port at game start has zero workers; it relies on
  whatever settlement crews end up land-connected to it.

## Worker state machine

```
idle ──cargo>0? yes──► returning ──arrive──► (deposit) ──► idle
  │
  └─cargo==0──► moving ──arrive on tree──► chopping ──cargo full──► returning
                                       └──tree gone──► startTreeTrip
```

States: `idle`, `moving`, `chopping`, `returning`. No `building` state —
workers don't build anything.

## Tree depletion

- Every inland (non-`isPortSite`) land tile starts with
  `tile.woodRemaining = TREE_HEX_WOOD` (100) at map gen.
- A chop drains `WORKER_CONFIG.cargoCapacity` (5) per `chopTime` (2s).
- When `woodRemaining` hits 0: `tile.depleted = true`, the decoration
  layer hides tree and palm sprites for that hex.
- A hex where a **settlement / tower / port** completes is also marked
  depleted (its trees are displaced) so workers don't try to chop under
  the structure.

## Why this design

- **Player attention stays on ships.** Workers don't need selection or
  commands; you watch them work.
- **Settlements matter.** Each new settlement is a wood-income boost
  (more workers, more chopping) AND a crew-cap boost (more ships).
- **Expansion is incentivised.** Strip your home island and you have to
  ship to a new one to keep the wood flowing.
- **The visual is satisfying.** Dots scurry across the island, trees
  disappear over time, "+3" pops over hubs.

## Data structures

### Worker
```js
worker = {
    id: 'worker-N',
    owner: 'player',
    q, r,
    path, moveProgress, movingToward,
    state: 'idle' | 'moving' | 'chopping' | 'returning',
    harvestTarget: {q, r} | null,
    cargo: 0..5,
    chopProgress: 0,
    health: 20,
    hitFlash: 0,
}
```

### Tree-hex tile fields
```js
tile.woodRemaining = 100;   // TREE_HEX_WOOD
tile.depleted = false;
```

## Files

| File | Purpose |
|------|---------|
| `game/src/sprites/workers.js` | `WORKER_CONFIG` + `TREE_HEX_WOOD` + `SETTLEMENT_WORKERS` |
| `game/src/systems/workers.js` | Autonomous state machine + `updateWorkers` + `getWorkerVisualPos` |
| `game/src/systems/construction.js` | `spawnHubWorkers`, `markHexDepleted`, settlement-completion spawn |
| `game/src/gameState.js` | `createWorker` |
| `game/src/mapGenerator.js` | Seeds `woodRemaining` on inland land tiles |
| `game/src/pathfinding.js` | `findLandPath`, `findNearestTreeOnIsland`, `findNearestDepositHexOnIsland` |
| `game/src/scenes/gameScene.js` | Workers update + draw wiring |
| `game/src/rendering/unitRenderer.js` | `drawWorkers` (dots + cargo pip) |
| `game/src/rendering/tileRenderer.js` | Hides trees on `tile.depleted === true` |
| `game/src/systems/resourceGeneration.js` | Player-settlement wood removed; AI settlement wood retained |

## Tunables (all in `sprites/workers.js`)

| Constant                          | Default | What it controls                                  |
| --------------------------------- | ------- | ------------------------------------------------- |
| `SETTLEMENT_WORKERS`              | 3       | Workers spawned when a settlement completes       |
| `WORKER_CONFIG.speed`             | 0.6     | Walk speed (hexes / sec)                          |
| `WORKER_CONFIG.health`            | 20      | HP                                                |
| `WORKER_CONFIG.cargoCapacity`     | 3       | Wood per trip                                     |
| `WORKER_CONFIG.chopTime`          | 8 s     | Seconds per chop                                  |
| `TREE_HEX_WOOD`                   | 100     | Initial wood per tree hex                         |

## Out of scope for this prototype

- **AI workers** — AIs still use the timer-based settlement wood gen.
- **Multiplayer sync** — worker state not serialized.
- **Combat targeting** — workers have HP but no enemy intentionally
  shoots them yet.
- **Tree regrowth** — depleted is permanent.
- **Pixel art** — workers are colored dots with a brown cargo pip.
- **Worker selection / commands** — by design. No panel.

## Edge cases

- **Home settlement destroyed:** orphaned workers idle holding cargo.
  They do NOT migrate to another settlement — the bond is to their
  specific home.
- **No tree reachable** (island stripped): worker idles indefinitely.
  Player must expand.
- **Worker mid-chop, tree depletes** (another worker hit zero first):
  the chopping check switches them to the next nearest tree.
- **Settlement / port / tower built on a tree hex:** that hex is marked
  depleted on completion so the worker doesn't try to chop the structure.
- **Game paused (timeScale === 0):** `updateWorkers` returns early.
