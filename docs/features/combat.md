# Combat

Ships, towers, and structures exchange fire through a unified projectile system. Players issue attack orders via action-mode buttons (or hotkeys) and the host-authoritative simulation resolves shots, cooldowns, and target acquisition.

## Action Modes

When ships are selected, the bottom-center HUD shows a row of action buttons. Each one has a hotkey and corresponds to an entry in `gameState.actionMode.active`.

| Button | Hotkey | When shown | Behavior |
|--------|--------|------------|----------|
| Move | M | Ships selected | Next left-click sets a single waypoint |
| Attack | A | Ships selected | Next left-click is an **attack-move** at a target/location |
| Patrol | P | Ships selected | Next clicks add patrol waypoints |
| Broadside | B | All selected ships have a `burstAttack` config and at least one is off-cooldown | Next left-click fires a burst at the chosen target (costs each firing ship 10 HP) |

Clicking the active button again or pressing **Escape** exits the mode. Cooldown-gated buttons (Broadside) draw a blue left-to-right cooldown fill behind the label and ignore clicks until ready.

Ports get their own mode set (e.g. Rally) — same UI plumbing, different buttons.

## Attack-Click vs Attack-Move

There are two attack semantics. Both call `handleAttackClick()` in `inputHandler.js`, distinguished by the `isAttackMove` argument:

| Order | Trigger | `guardMode` after order | Behavior after target dies |
|-------|---------|------------------------|----------------------------|
| **Attack-target** | Cmd+click / right-click on an enemy | `false` | Ship stops; no auto-acquisition |
| **Attack-move** | A then click (button or `A` hotkey) | `true` | Ship auto-acquires the next enemy ship or structure within `sightDistance` |

Attack-move ships cascade through a base because `handlePatrolAutoAttack()` scans ports/settlements/towers in addition to ships when `ship.guardMode` is set. Without `guardMode`, the structure scan is skipped so patrol behavior is unchanged.

The `isAttackMove` flag is also propagated through the multiplayer `ATTACK` command so the host applies the same `guardMode` on the guest's ships.

## Broadside (Burst Attack)

Cutters can fire a 5-shot volley at a single target on a 60-second cooldown. Firing costs the cutter 10 HP (recoil/strain), so it's a real risk/reward call. The ability is configured per ship type, so other hulls can opt in with different tuning later by adding a `burstAttack` block to their `SHIPS[type]` entry:

```js
SHIPS.cutter = {
    // ...
    burstAttack: {
        name: "Broadside",     // Button label
        shots: 5,              // Total shots fired (first immediate, rest queued)
        staggerDelay: 0.2,     // Seconds between staggered shots
        cooldown: 60,          // Seconds before the ability is ready again
        hotkey: "B",
        hpPenalty: 10,         // Self-damage applied when fired (clamped: can't kill)
    },
}
```

### Flow

1. Select one or more Cutters; press **B** or click the Broadside button
2. Click an enemy ship, port, settlement, or tower
3. For each in-range selected Cutter, `triggerBroadside()`:
   - Fires the first cannon shot immediately
   - Queues the remaining shots into `ship.pendingShots` with staggered delays
   - Sets `ship.burstCooldown = burstAttack.cooldown`
   - Subtracts `hpPenalty` from `ship.health` (clamped to a minimum of 1; the volley can never kill the firing ship outright)
4. Each frame, `handlePlayerAttacks()` decrements `burstCooldown` and drains `pendingShots` whose delay has elapsed (firing each as a standard projectile)
5. The button fill (`cooldownProgress = 1 - remaining/cooldown`) grows back to 1 over the cooldown window

### Eligibility

`triggerBroadside()` returns `false` (silently) if:
- The ship has no `burstAttack` config
- `ship.burstCooldown > 0`
- `ship.health <= hpPenalty` (would die from the recoil — repair first)
- Target is missing or already destroyed
- Target is farther than `attackDistance`

The button is only shown when **every** selected ship has a `burstAttack` config; it is disabled (clicks consumed but ignored) when **all** selected ships are still on cooldown. Today only Cutters ship with a `burstAttack` config, so mixed selections that include any other hull hide the button.

## Cooldowns on a Ship

| Field | Set by | Drained in | Purpose |
|-------|--------|------------|---------|
| `attackCooldown` | Each fired shot | `handlePlayerAttacks` | Standard fire rate (`fireCooldown` from ship metadata) |
| `burstCooldown` | `triggerBroadside` | `handlePlayerAttacks` | Special-ability gate |
| `chaseCooldownTimer` | Giving up chase | `handlePlayerAttacks` | Suppress re-acquisition after losing a target |
| `pendingShots[]` | `triggerBroadside` | `handlePlayerAttacks` | Staggered queued projectiles |

## Files

| File | Purpose |
|------|---------|
| `game/src/systems/combat.js` | `handlePlayerAttacks`, `handlePatrolAutoAttack`, `triggerBroadside`, projectile resolution |
| `game/src/systems/inputHandler.js` | `handleAttackClick`, `handleBroadsideClick` |
| `game/src/scenes/gameScene.js` | `A`/`B` hotkey wiring, action-mode click routing, multiplayer command dispatch |
| `game/src/rendering/uiPanels.js` | `drawActionButtons` (button + cooldown fill) |
| `game/src/sprites/ships.js` | Per-ship `burstAttack` configs and combat stats |
| `game/src/networking/commands.js` | `COMMAND_TYPES.ATTACK` (with `isAttackMove`), `COMMAND_TYPES.BROADSIDE` |
| `game/src/networking/commandProcessor.js` | Host-side `handleAttack`, `handleBroadside` |

## Adding a New Burst Ability

1. Add a `burstAttack` block to the relevant `SHIPS[type]` entry in `sprites/ships.js`
2. That's it for damage/cooldown tuning — the action button appears automatically and the host-side command pipeline already supports any ship type

For abilities with different mechanics (not just a burst of standard shots), extend `triggerBroadside` or add a sibling helper, plumb a new `COMMAND_TYPES.*` entry through `commandProcessor.js`, and add a button entry to `drawActionButtons`.

## Edge Cases

- **Mixed selection**: Broadside button only shows when every selected ship has a `burstAttack`. Selecting one Cutter and one Schooner hides it.
- **One Cutter on cooldown, others ready**: Button shows the worst-case cooldown progress but stays clickable; only ready ships fire.
- **Cutter too damaged to fire**: A cutter at or below `hpPenalty` HP refuses the volley. If every selected cutter is in this state the click is consumed but nothing fires — repair to restore the ability.
- **Target dies mid-volley**: Queued `pendingShots` are still fired, but they resolve against a dead target and miss. Standard `cleanupStaleReferences` clears `attackTarget` so the ship returns to idle (or auto-acquires next target if `guardMode`).
- **Multiplayer guest issues Broadside**: `BROADSIDE` command sent to host with `shipIds[]` + `targetType` + `targetId`. Host calls `triggerBroadside()` per ship and the resulting projectiles sync via the normal state snapshot. The HP penalty is applied host-side so both players see the cutter take recoil damage.
