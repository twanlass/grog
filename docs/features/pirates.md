# Pirates

AI-controlled enemy ships that patrol the waters and hunt player ships.

## AI State Machine

Pirates have 4 states:

| State | Behavior |
|-------|----------|
| **PATROL** | Wander randomly 9-17 hexes around the home port |
| **CHASE** | Pursue a detected player ship or port |
| **ATTACK** | Stop and engage target (combat TBD) |
| **RETREAT** | Flee and cooldown before re-engaging |

### State Transitions
```
PATROL → CHASE    When target within enemySightDistance (8 hexes)
CHASE → ATTACK    When within attackDistance (2 hexes)
CHASE → RETREAT   When chased for maxChaseDistance (20 hexes)
ATTACK → CHASE    When target moves out of attack range
RETREAT → PATROL  After retreatCooldown (5 seconds)
```

## Behavior
- One pirate spawns 12-15 hexes from home port at game start
- Pirates are selectable (to view their current AI state)
- Pirates cannot be controlled by the player
- Uses same pathfinding as player ships

## Visual Style
- Based on Schooner ship (20x16 pixels, two masts)
- Black sails (`BK` color) instead of cream
- White/cream dots on sails representing skull flag

## Stats
| Stat | Value |
|------|-------|
| Speed | 1 hex/sec |
| Cargo | 4 |
| Combat | 3 |
| Health | 75 |
| Sight Distance | 2 hexes |

## AI Constants
| Constant | Value | Description |
|----------|-------|-------------|
| enemySightDistance | 8 | Detection range for targets |
| attackDistance | 2 | Range to stop and attack |
| maxChaseDistance | 20 | Give up chase after this many hexes |
| retreatCooldown | 5 | Seconds before returning to patrol |

## Files

| File | Purpose |
|------|---------|
| `game/src/sprites/ships.js` | PIRATE sprite, stats, AI constants |
| `game/src/sprites/colors.js` | BK (black) color definition |
| `game/src/systems/shipMovement.js` | `updatePirateAI()` state machine |
| `game/src/gameState.js` | Ship AI state properties |
| `game/src/scenes/gameScene.js` | Pirate spawn and AI update call |

## Key Functions

### shipMovement.js
- `updatePirateAI(gameState, map, patrolCenter, dt)` - State machine for pirate AI

### gameState.js
Ship AI properties:
- `aiState` - Current state ('patrol', 'chase', 'attack', 'retreat')
- `aiTarget` - Current target { type, index, q, r }
- `aiRetreatTimer` - Cooldown countdown
- `aiChaseDistance` - Hexes traveled while chasing

## Future Expansion Ideas
- Combat mechanics (damage, sinking)
- Multiple pirate ships spawning over time
- Pirate bases/hideouts
- Loot drops when defeated
- Different pirate ship types
