# Combat

Ships, towers, and structures exchange fire through a unified projectile system. Players issue attack orders via action-mode buttons (or hotkeys) and the host-authoritative simulation resolves shots, cooldowns, and target acquisition.

## Action Modes

When ships are selected, action buttons are shown. Each one has a hotkey and corresponds to an entry in `gameState.actionMode.active`.

**Placement:** On desktop, a **single** selected ship shows its commands as a 2-column grid inside the bottom-left selected-ship menu (`drawShipActionGrid`, between the ship name and the Build options). When **2+ ships** are selected — or on **touch** devices — the commands appear instead as the bottom-right button row left of the minimap (`drawActionButtons`, which returns `null` for the single-ship desktop case). Both paths produce button bounds with the same `{ id, x, y, width, height, disabled }` shape, so the click handler in `gameScene.js` treats them identically.

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
3. Every selected Cutter is engaged against the target — `attackTarget` is set and a waypoint pointed at the target (or a water tile within range, for land structures):
   - **In-range cutters**: `triggerBroadside()` fires the volley immediately — first shot now, remaining shots queued into `ship.pendingShots`, `burstCooldown` and `hpPenalty` applied
   - **Out-of-range cutters**: `ship.pendingBroadside = { type, index }` is set so they sail toward the target and fire the volley when they enter range
4. Each frame, `handlePlayerAttacks()` decrements `burstCooldown`, drains `pendingShots` whose delay has elapsed, and (for ships with `pendingBroadside`) calls `triggerBroadside()` — succeeding once the cutter is in range and clearing the queue
5. The button fill (`cooldownProgress = 1 - remaining/cooldown`) grows back to 1 over the cooldown window

### Eligibility

`triggerBroadside()` returns `false` (silently) if:
- The ship has no `burstAttack` config
- `ship.burstCooldown > 0`
- `ship.health <= hpPenalty` (would die from the recoil — repair first)
- Target is missing or already destroyed
- Target is farther than `attackDistance`

The button is only shown when **every** selected ship has a `burstAttack` config; it is disabled (clicks consumed but ignored) when **all** selected ships are still on cooldown. Today only Cutters ship with a `burstAttack` config, so mixed selections that include any other hull hide the button.

## Aim & Hit Resolution

Hit detection is **position-based**: a projectile damages whatever sits on its destination hex when it arrives. Projectile flight time is fixed (~0.8s, from `1 / PROJECTILE_SPEED`) regardless of distance, so a fast hull (cutter speed=2) can cover 1.6 hexes during flight. Two mechanics prevent that from turning combat into a whiff-fest:

### Predictive Aim (Lead Shots)

Every fire site (`handlePirateAttacks`, `handlePlayerAttacks`, `processShipPendingShots`, `triggerBroadside`, `handleTowerAttacks`) routes ship targets through `predictTargetHex(target, LEAD_TIME)`, which walks forward along the target's planned `path` by `LEAD_TIME * speed` hexes and returns the lead hex as the projectile destination.

- `LEAD_TIME = 1 / PROJECTILE_SPEED` (~0.8s)
- Stationary targets (no `path`) return current position — gunners still aim at idle ships normally
- Structures (port/tower/settlement) skip prediction entirely
- Pending shots in a volley re-predict at fire time, so later shots in a Broadside track sharp turns mid-volley
- Skill expression preserved: a cutter that changes course after a shot is fired still dodges, because the prediction was baked in at fire time

### Splash Damage (Near-Miss)

When a projectile lands on its destination hex and finds nothing there, `updateProjectiles` checks whether the **originally intended ship target** is within `SPLASH_RADIUS` (1 hex) of impact. If so, it applies `proj.damage * SPLASH_DAMAGE_FACTOR` (25%, minimum 1) to that ship.

- Only applies to `targetType === 'ship'` — structures don't move so direct hits resolve normally
- Only applies to the intended target, not any nearby enemy — keeps semantics clean ("you almost nailed the dodge") and avoids friendly-fire on bystanders
- Skipped if `proj.targetIndex === -1` (target destroyed mid-flight via `cleanupStaleReferences`)
- Source-owner check prevents a projectile from splashing a friendly that happens to be near the impact

### Tunables (in `combat.js`)

| Constant | Default | Effect |
|---|---|---|
| `LEAD_TIME` | `1 / PROJECTILE_SPEED` | Lower = less prediction = cutters dodge more |
| `SPLASH_DAMAGE_FACTOR` | `0.25` | Higher = more forgiving near-misses |
| `SPLASH_RADIUS` | `1` (hex) | Bump to 2 if 1-hex splash still feels too punishing on dodging |

## Cooldowns on a Ship

| Field | Set by | Drained in | Purpose |
|-------|--------|------------|---------|
| `attackCooldown` | Each fired shot | `handlePlayerAttacks` | Standard fire rate (`fireCooldown` from ship metadata) |
| `burstCooldown` | `triggerBroadside` | `handlePlayerAttacks` | Special-ability gate |
| `chaseCooldownTimer` | Giving up chase | `handlePlayerAttacks` | Suppress re-acquisition after losing a target |
| `pendingShots[]` | `triggerBroadside` | `handlePlayerAttacks` | Staggered queued projectiles |
| `pendingBroadside` | `handleBroadsideClick` / `handleBroadside` | `handlePlayerAttacks` | Queued volley; fires when out-of-range cutter reaches range |

## Files

| File | Purpose |
|------|---------|
| `game/src/systems/combat.js` | `handlePlayerAttacks`, `handlePatrolAutoAttack`, `triggerBroadside`, projectile resolution |
| `game/src/systems/inputHandler.js` | `handleAttackClick`, `handleBroadsideClick` |
| `game/src/scenes/gameScene.js` | `A`/`B` hotkey wiring, action-mode click routing, multiplayer command dispatch |
| `game/src/rendering/uiPanels.js` | `drawActionButtons` (bottom-right row), `drawShipActionGrid` (single-ship menu grid), shared `getShipActionButtons` |
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
- **Target dies mid-volley**: Queued `pendingShots` are still fired, but they resolve against a dead target and miss. Standard `cleanupStaleReferences` clears `attackTarget` and `pendingBroadside` so the ship returns to idle (or auto-acquires next target if `guardMode`).
- **Target dies before pursuing cutter arrives**: `cleanupStaleReferences` clears the pending cutter's `pendingBroadside` and `attackTarget`; the ship goes idle on arrival.
- **Move / Attack order overrides a queued broadside**: `handleWaypointClick` and the attack-click path both clear `pendingBroadside` when they assign a new destination or target.
- **Multiplayer guest issues Broadside**: `BROADSIDE` command sent to host with `shipIds[]` + `targetType` + `targetId`. Host calls `triggerBroadside()` per ship and the resulting projectiles sync via the normal state snapshot. The HP penalty is applied host-side so both players see the cutter take recoil damage.
