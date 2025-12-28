# Unit Repair

Damaged units (ships, ports, towers) can be repaired to restore health.

## Behavior
- Select a damaged unit to see the "Repair (R)" button in the info panel
- Click the button or press R to start repair
- Repair costs resources proportional to damage
- Repair time is proportional to damage (2x build time)
- Cyan progress bar replaces health bar during repair
- Units cannot move or attack while repairing
- Units CAN still take damage while repairing

## Costs

Repair cost is proportional to the unit's build cost based on missing health:

```
repairCost = buildCost * (missingHealth / maxHealth)
```

**Example - Cutter at 50% health (costs 20 wood to build):**
- Repair cost: 10 wood
- Repair time: 5s (50% of 2x build time)

## Restrictions
- Units cannot move while repairing
- Ships cannot attack while repairing
- Towers cannot fire while repairing
- Pirates cannot be repaired (no cost data)
- Ports cannot upgrade while repairing

## Visual Style
- Repair button: Dark background (rgb 40,50,60), hover (rgb 60,80,60)
- Repair progress bar: Cyan fill (rgb 80,180,220)
- Progress bar replaces health bar above unit during repair
- Hotkey hint shown: "Repair (R)"

## Files

| File | Purpose |
|------|---------|
| `game/src/systems/repair.js` | Core repair logic, cost/time calculations |
| `game/src/gameState.js` | Repair state on units (`repair: null`) |
| `game/src/rendering/uiPanels.js` | Repair button in info panels |
| `game/src/rendering/effectsRenderer.js` | Health bar → repair bar swap |
| `game/src/systems/inputHandler.js` | Click handlers for repair buttons |
| `game/src/systems/shipMovement.js` | Skip movement for repairing ships |
| `game/src/systems/combat.js` | Skip attacks for repairing units |
| `game/src/scenes/gameScene.js` | R hotkey, updateRepair in game loop |

## Key Functions

### repair.js
- `updateRepair(gameState, dt)` - Updates repair progress for all units
- `getRepairCost(unitType, unit)` - Calculates proportional resource cost
- `getRepairTime(unitType, unit)` - Calculates repair time (2x build time * damage%)
- `startRepair(unitType, unit, resources)` - Initiates repair, deducts cost

### inputHandler.js
- `handleShipInfoPanelClick()` - Handles ship repair button
- `handleTowerInfoPanelClick()` - Handles tower repair button
- `handleBuildPanelClick()` - Handles port repair button

## Data Structures

### Repair state
```javascript
unit.repair = {
    progress: 0,           // Current progress in seconds
    totalTime: 10,         // Total repair time
    healthToRestore: 50,   // Health to add when complete
} | null
```

### Repair cost calculation
```javascript
const missingHealth = maxHealth - unit.health;
const damagePercent = missingHealth / maxHealth;

return {
    wood: Math.ceil(metadata.cost.wood * damagePercent),
    food: Math.ceil((metadata.cost.food || 0) * damagePercent),
};
```

### Repair time calculation
```javascript
const REPAIR_TIME_MULTIPLIER = 2;
const damagePercent = (maxHealth - unit.health) / maxHealth;
return buildTime * damagePercent * REPAIR_TIME_MULTIPLIER;
```

## Edge Cases
- **Can't afford**: Button greyed out, costs shown in red
- **Already repairing**: Button hidden, progress bar shown above unit
- **Full health**: Repair button not shown
- **Pirate selected**: Repair section not shown (no cost data)
- **Under construction**: Repair not available
- **Game paused**: Repair progress pauses (uses timeScale)
- **Attacked while repairing**: Damage still applies, may extend repair
