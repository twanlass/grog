# Speed Boost ("Full Sail")

Cutters can hoist full sail for a short burst of speed and firepower — a StarCraft-stim-pack-style
timed buff. Activating multiplies the ship's **movement speed and fire rate by 1.5× for 8 seconds**
at a one-time cost of **10 HP**, then goes on a **60-second cooldown**.

This replaced the Cutter's old **Broadside** volley. The generic Broadside (`burstAttack`) system is
retained but **dormant** — no ship currently uses it (see [Combat](combat.md)).

## Activation

| Trigger | Where |
|---------|-------|
| **B** hotkey | Any selection where every ship has a `speedBoost` config |
| **Full Sail** action button | Alongside Move / Attack / Patrol — bottom-left ship menu (single selected ship, desktop) or the bottom-right HUD row (multi-select / touch) |

Like TNT, the boost is **instant** — no target click. Pressing the button/hotkey activates every
eligible selected Cutter immediately and returns. The ship keeps obeying its existing move/attack
orders while boosted, so the standard pattern is: issue a Move or Attack order, then hit **B** to
cover ground or trade blows faster.

## Boost Lifecycle

```
triggerSpeedBoost()  ->  ship.boostTimer    = duration (8s)
                         ship.boostCooldown = cooldown (60s)
                         ship.health       -= hpPenalty (10, clamped to >=1)
        |
        v  (handlePlayerAttacks, every frame)
ship.boostTimer    -= dt   (buff active while > 0)
ship.boostCooldown -= dt   (button ready again at 0)
        |
        v  (ship.boostTimer hits 0)
buff ends — speed and fire rate revert to base
```

The multipliers aren't stored on the ship; they're applied where speed and fire rate are *read*, by
checking `ship.boostTimer > 0`:

- **Movement:** `shipMovement.js` multiplies `SHIPS[type].speed` by `speedBoost.speedMult` when active.
- **Fire rate:** `combat.js` `handlePlayerAttacks` divides `SHIPS[type].fireCooldown` by
  `speedBoost.fireRateMult` when resetting `attackCooldown`.

## Visual Telegraph

While `boostTimer > 0`, the ship renderer (`unitRenderer.js`) draws a **pulsing cyan hex ring** under
the ship (`boostPulseIntensity` modulates its radius/opacity at ~3 Hz). Because the pulse is computed
from `boostTimer` alone, multiplayer guests render the same telegraph for free off the synced field.
The action button also shows the standard blue left-to-right cooldown fill from `boostCooldown`.

## Config

Keyed off the `speedBoost` block in `SHIPS[type]`:

```js
SHIPS.cutter.speedBoost = {
    name: "Full Sail",   // Button label
    hotkey: "B",
    duration: 8,         // Seconds the boost lasts
    speedMult: 1.5,      // Movement-speed multiplier while active
    fireRateMult: 1.5,   // Fire-rate multiplier (cooldown divided by this)
    cooldown: 60,        // Seconds before reusable
    hpPenalty: 10,       // One-time self-damage on activation (clamped, can't kill)
};
```

Add this block to any other hull to give it the ability — the action button, hotkey, cooldown UI,
telegraph, and multiplayer command all key off the presence of `speedBoost`.

## Eligibility

`triggerSpeedBoost()` returns `false` (silently) if:
- The ship has no `speedBoost` config
- `ship.boostCooldown > 0` (still recharging)
- `ship.boostTimer > 0` (already boosting — no stacking or refresh)
- `ship.health <= hpPenalty` (would be too damaged to pay the cost — repair first)

## Multiplayer

| Direction | Mechanism |
|-----------|-----------|
| Guest → Host | `COMMAND_TYPES.SPEED_BOOST` with `{ shipIds }`. `commandProcessor.handleSpeedBoost()` validates guest ownership of each id and calls `triggerSpeedBoost()`. The HP penalty is applied host-side. |
| Host → Guest | `ship.boostTimer` and `ship.boostCooldown` are included in the state snapshot (`stateSync.js`). Guests skip the simulation but render the cyan ring and cooldown fill off the synced fields. |

## Files

| File | Purpose |
|------|---------|
| `game/src/sprites/ships.js` | `SHIPS.cutter.speedBoost` config |
| `game/src/gameState.js` | `boostTimer` / `boostCooldown` fields on `createShip` |
| `game/src/systems/combat.js` | `triggerSpeedBoost`, per-frame timer decrement, fire-rate multiplier |
| `game/src/systems/shipMovement.js` | Movement-speed multiplier when boosted |
| `game/src/rendering/unitRenderer.js` | `boostPulseIntensity` + pulsing cyan ring |
| `game/src/rendering/uiPanels.js` | Full Sail button in `getShipActionButtons` |
| `game/src/scenes/gameScene.js` | `B` hotkey, `triggerBoostOnSelected`, button click handler |
| `game/src/networking/commands.js` | `COMMAND_TYPES.SPEED_BOOST` |
| `game/src/networking/commandProcessor.js` | `handleSpeedBoost` |
| `game/src/networking/stateSync.js` | `boostTimer` / `boostCooldown` in ship snapshot |

## Edge Cases

- **Already boosting:** re-pressing B does nothing (`boostTimer > 0` guard) — no refresh or stacking.
- **On cooldown:** the button stays clickable but ships still recharging are skipped silently (matches the old Broadside behavior); only ready ships boost.
- **Too damaged:** a Cutter at or below `hpPenalty` HP refuses to boost. Repair to restore it.
- **Mixed selection:** the button only shows when *every* selected ship has a `speedBoost` config. A Cutter + Schooner selection hides it.
- **Building ship:** `triggerBoostOnSelected` skips ships building a port or tower.
