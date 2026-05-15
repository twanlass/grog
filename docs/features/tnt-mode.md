# TNT Mode (Kamikaze Schooner)

Schooners can light their powder kegs and sail into the enemy. The crew commits suicide for a massive AoE explosion that damages every enemy ship and structure in a small radius.

## Activation

| Trigger | Where |
|---------|-------|
| **K** hotkey | Any selection where every ship has a `tntAttack` config |
| **TNT** action button | Right side of HUD, alongside Move / Attack / Patrol / Broadside |

Unlike other action modes, TNT is **instant** — no target click. Pressing the button arms every eligible selected ship and the action button handler returns immediately. The ship continues to obey existing move/attack orders during the fuse, so the standard pattern is:

1. Select a Schooner
2. Issue a Move/Attack order *toward* the target
3. Press **K** when it's close enough — the ship sails the rest of the way with a lit fuse

## Fuse Lifecycle

```
armTNT()  ->  ship.tntFuse = fuseDuration  (3.0s)
        |
        v  (updateTNTFuses, every frame)
ship.tntFuse -= dt
        |
        v  (ship.tntFuse hits 0)
detonateTNT()  ->  destroyShip(self) + AoE damage + massive explosion
```

While the fuse burns, the ship renderer drives a red **accelerating square-wave blink** off `ship.tntFuse` (see `tntBlinkIntensity` in `unitRenderer.js`). Frequency ramps linearly from 2 Hz at arm to 14 Hz just before detonation — visually you get slow red pulses that crescendo into a strobe right before the boom. The blink uses a dedicated `redFlash` shader (parallel to `whiteFlash`) and overrides hit-flash feedback for the duration of the fuse. Because the blink is computed from `tntFuse` alone, multiplayer guests render the same telegraph for free off the synced field.

The explosion is flagged `massive: true`, which the renderer reads to:
- Scale the blast radius 2.4x
- Double the particle counts
- Stamp a brief full-screen white flash
- Trigger a 3x stronger camera shake (24 vs the usual 8)

## Blast Radius

Radius is **derived** from the ship's cannon range, not configured per-ship:

```
radius = max(1, round(shipData.attackDistance / 2))
```

For the Schooner with `attackDistance: 5`, that's a 3-hex radius (19 hexes hit). Any future hull that gets a `tntAttack` config picks up a proportional blast for free.

## Damage Falloff

```
factor = 1 - (1 - minDamageFactor) * (dist / radius)
damage = round(maxDamage * factor)
```

With the default Schooner config (`damage: 60`, `radius: 3`, `minDamageFactor: 0.4`):

| Distance | Damage |
|---------:|-------:|
| 0 (epicenter) | 60 |
| 1 hex | 48 |
| 2 hex | 36 |
| 3 hex | 24 |
| 4+ hex | (out of range, no damage) |

**Friendly fire is on.** Every entity in radius takes damage regardless of owner — your own ships, ports, settlements, and towers will burn if they're standing too close. The only entity spared is the bomber itself (it's already the source of the blast). This is the deliberate risk-reward tradeoff of the kamikaze: pilot it carefully.

## Index Safety

`detonateTNT()` may destroy multiple entities in one frame, and `destroyShip`/`destroyPort`/etc. all splice their arrays and run `cleanupStaleReferences`. To avoid stale-index bugs, the function:

1. Collects every victim as `{ type, id, damage }` up front
2. Resolves the current array index from the id **inside the apply loop**
3. Destroys the bomber **last**, also via id lookup

## Destruction Effects vs. Fog

Each victim that dies in the blast runs through the normal `destroyShip` / `destroyPort` / `destroyTower` / `destroySettlement` path, so every kill spawns its own explosion + debris pile. The trick is that the bomber was the thing providing vision in enemy territory — once it dies, fog snaps back and would normally hide every effect at the blast site.

To prevent that, the entire detonation chain plumbs an `ignoreFog: true` flag from `detonateTNT` → `applyDamage` → `destroyX` → `spawnDestructionEffects`. Effect entries written into `gameState.shipExplosions` and `gameState.floatingDebris` carry this flag; the renderers (`drawExplosions`, `drawFloatingDebris`) skip their fog check when it's set. The flag is included in the network snapshot for free since both arrays sync wholesale.

## Config

The whole behavior is keyed off the `tntAttack` block in `SHIPS[type]`:

```js
SHIPS.schooner.tntAttack = {
    name: "TNT",
    hotkey: "K",
    fuseDuration: 3.0,     // Seconds between arming and detonation
    damage: 60,            // Max damage at epicenter
    minDamageFactor: 0.4,  // Damage at the edge of the radius (40% of max)
    // Note: radius is computed at detonation time from shipData.attackDistance,
    // not stored here. See detonateTNT.
};
```

Add this block to any other hull to give it TNT — the action button, hotkey, network command, and detonation logic all key off the presence of `tntAttack`. Blast radius auto-scales with `attackDistance`.

## Multiplayer

| Direction | Mechanism |
|-----------|-----------|
| Guest → Host | `COMMAND_TYPES.DETONATE_TNT` with `{ shipIds }`. `commandProcessor.handleDetonateTNT()` validates guest ownership of each id and calls `armTNT()`. |
| Host → Guest | `ship.tntFuse` is included in the state snapshot. The guest's local `updateCombat → updateTNTFuses` does **not** run (guests skip the simulation), but the red accelerating blink is computed by `tntBlinkIntensity(ship)` in the renderer purely from the synced `tntFuse` field. The explosion arrives via `shipExplosions` (with the `ignoreFog` flag preserved). |

## Files

| File | Purpose |
|------|---------|
| `game/src/sprites/ships.js` | `SHIPS.schooner.tntAttack` config |
| `game/src/gameState.js` | `ship.tntFuse` field on `createShip` |
| `game/src/systems/combat.js` | `armTNT`, `updateTNTFuses`, `detonateTNT`, `ignoreFog` plumbing through `applyDamage`/`destroyX`/`spawnDestructionEffects` |
| `game/src/rendering/unitRenderer.js` | `tntBlinkIntensity` — red accelerating blink driven off `tntFuse` |
| `game/src/rendering/uiPanels.js` | TNT button in `drawActionButtons` |
| `game/src/rendering/effectsRenderer.js` | `massive` explosion scaling + `ignoreFog` check in `drawExplosions`/`drawFloatingDebris` |
| `game/src/main.js` | `redFlash` shader (parallel to `whiteFlash`) for the fuse telegraph |
| `game/src/sprites/utils.js` | `drawSpriteFlash` accepts a color for the pixel-art fallback red flash |
| `game/src/scenes/gameScene.js` | `K` hotkey, TNT button click handler, beefed camera shake for `massive` |
| `game/src/networking/commands.js` | `COMMAND_TYPES.DETONATE_TNT` |
| `game/src/networking/commandProcessor.js` | `handleDetonateTNT` |
| `game/src/networking/stateSync.js` | `tntFuse` in ship snapshot |

## Edge Cases

- **Already armed:** `armTNT` returns `false` if `ship.tntFuse > 0` — re-pressing K does nothing.
- **Mixed selection:** TNT button only shows when *every* selected ship has a `tntAttack` config. A Schooner + Cutter selection hides the button.
- **Ship destroyed mid-fuse:** Normal damage destroys the schooner before detonation — the explosion is the standard sinking-ship animation, not the kamikaze blast. The TNT only goes off if `tntFuse` reaches 0.
- **Ship docked/building:** The button click path skips ships that are building a port or tower. Ships in dock state still arm — they explode at the dock, which is fine (and dramatic).
- **Friendly fire:** Every entity in radius takes damage regardless of owner — pirates, enemies, AND your own ships/ports/towers/settlements. Only the bomber itself is spared.
