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
armTNT()  ->  ship.tntFuse = fuseDuration  (1.0s)
        |
        v  (updateTNTFuses, every frame)
ship.tntFuse -= dt
ship.hitFlash = HIT_FLASH_DURATION   // visible red pulse
        |
        v  (ship.tntFuse hits 0)
detonateTNT()  ->  destroyShip(self) + AoE damage + massive explosion
```

The fuse is also re-armed on the **hitFlash** field every frame, so the schooner visibly pulses red while the fuse burns. The explosion is flagged `massive: true`, which the renderer reads to:
- Scale the blast radius 2.4x
- Double the particle counts
- Stamp a brief full-screen white flash
- Trigger a 3x stronger camera shake (24 vs the usual 8)

## Damage Falloff

```
factor = 1 - (1 - minDamageFactor) * (dist / radius)
damage = round(maxDamage * factor)
```

With the default config (`damage: 60`, `radius: 2`, `minDamageFactor: 0.4`):

| Distance | Damage |
|---------:|-------:|
| 0 (epicenter) | 60 |
| 1 hex | 42 |
| 2 hex | 24 |
| 3+ hex | (out of range, no damage) |

Only enemies are damaged — friendly ships, ports, towers, and settlements with the same `owner` are spared. Pirates count as their own faction, so player-owned schooners damage pirates but pirate-owned schooners (if any ever existed) would damage players.

## Index Safety

`detonateTNT()` may destroy multiple entities in one frame, and `destroyShip`/`destroyPort`/etc. all splice their arrays and run `cleanupStaleReferences`. To avoid stale-index bugs, the function:

1. Collects every victim as `{ type, id, damage }` up front
2. Resolves the current array index from the id **inside the apply loop**
3. Destroys the bomber **last**, also via id lookup

## Config

The whole behavior is keyed off the `tntAttack` block in `SHIPS[type]`:

```js
SHIPS.schooner.tntAttack = {
    name: "TNT",
    hotkey: "K",
    fuseDuration: 1.0,     // Seconds between arming and detonation
    radius: 2,             // Hex radius of AoE
    damage: 60,            // Max damage at epicenter
    minDamageFactor: 0.4,  // Damage at the edge of the radius (40% of max)
};
```

Add this block to any other hull to give it TNT — the action button, hotkey, network command, and detonation logic all key off the presence of `tntAttack`.

## Multiplayer

| Direction | Mechanism |
|-----------|-----------|
| Guest → Host | `COMMAND_TYPES.DETONATE_TNT` with `{ shipIds }`. `commandProcessor.handleDetonateTNT()` validates guest ownership of each id and calls `armTNT()`. |
| Host → Guest | `ship.tntFuse` is included in the state snapshot. The guest's local `updateCombat → updateTNTFuses` does **not** run (guests skip the simulation), so the visible pulse comes from the host re-arming `hitFlash` and the explosion arrives via `shipExplosions`. |

## Files

| File | Purpose |
|------|---------|
| `game/src/sprites/ships.js` | `SHIPS.schooner.tntAttack` config |
| `game/src/gameState.js` | `ship.tntFuse` field on `createShip` |
| `game/src/systems/combat.js` | `armTNT`, `updateTNTFuses`, `detonateTNT` |
| `game/src/rendering/uiPanels.js` | TNT button in `drawActionButtons` |
| `game/src/rendering/effectsRenderer.js` | `massive` explosion scaling + white flash |
| `game/src/scenes/gameScene.js` | `K` hotkey, TNT button click handler, beefed camera shake for `massive` |
| `game/src/networking/commands.js` | `COMMAND_TYPES.DETONATE_TNT` |
| `game/src/networking/commandProcessor.js` | `handleDetonateTNT` |
| `game/src/networking/stateSync.js` | `tntFuse` in ship snapshot |

## Edge Cases

- **Already armed:** `armTNT` returns `false` if `ship.tntFuse > 0` — re-pressing K does nothing.
- **Mixed selection:** TNT button only shows when *every* selected ship has a `tntAttack` config. A Schooner + Cutter selection hides the button.
- **Ship destroyed mid-fuse:** Normal damage destroys the schooner before detonation — the explosion is the standard sinking-ship animation, not the kamikaze blast. The TNT only goes off if `tntFuse` reaches 0.
- **Ship docked/building:** The button click path skips ships that are building a port or tower. Ships in dock state still arm — they explode at the dock, which is fine (and dramatic).
- **Friendly fire:** Only entities with a different `owner` than the bomber take damage. Pirates and AI players are valid targets; same-faction units are spared.
