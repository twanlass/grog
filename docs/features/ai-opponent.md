# AI Opponent

A full AI opponent that can perform all player actions: build ships, ports, settlements, towers, and engage in combat. Used in "Versus AI" game mode.

## Game Mode: Versus AI

Select "Versus AI" from the scenario menu to play against the AI.

### Setup
- **Mirror start**: Player and AI each get a home port on opposite sides of the map (~25+ hexes apart)
- **Same resources**: Both start with 25 wood
- **No pirates**: Pirates are disabled in versus mode

### Win Condition
**Total elimination**: Destroy all enemy ships, ports, settlements, and towers.

## Ownership System

All entities have an `owner` field: `'player'` or `'ai'`.

```js
// Entity creation functions accept owner parameter
createShip(type, q, r, owner = 'player')
createPort(type, q, r, isConstructing, builderShipIndex, owner = 'player')
createSettlement(q, r, isConstructing, builderPortIndex, owner = 'player')
createTower(type, q, r, isConstructing, builderShipIndex, builderPortIndex, owner = 'player')
```

### Helper Functions (gameState.js)
- `getShipsByOwner(gameState, owner)` - Get ships for a faction
- `getPortsByOwner(gameState, owner)` - Get ports for a faction
- `getSettlementsByOwner(gameState, owner)` - Get settlements for a faction
- `getTowersByOwner(gameState, owner)` - Get towers for a faction
- `countEntitiesForOwner(gameState, owner)` - Returns `{ ships, ports, settlements, towers, total }`

## AI State

Stored in `gameState.aiPlayer`:

```js
{
    resources: { wood: 25 },           // AI's resource pool
    decisionCooldown: 0,               // Timer for strategic decisions
    buildDecisionCooldown: 0,          // Timer for build decisions
    shipCommandCooldown: 0,            // Timer for ship commands
    priorities: {
        expansion: 0.5,                // Weight for expansion actions
        economy: 0.5,                  // Weight for economic actions
        military: 0.5,                 // Weight for military actions
        defense: 0.5,                  // Weight for defensive actions
    },
    threatLevel: 0,                    // 0-1, increases when attacked
}
```

## Decision System

The AI runs three decision loops at different intervals:

| Decision Type | Interval | Function |
|---------------|----------|----------|
| Strategic | 5 seconds | `updateStrategicPriorities()` |
| Build | 3 seconds | `evaluateBuildOptions()` |
| Ship Commands | 2 seconds | `updateShipCommands()` |

### Strategic Priorities

Priorities adjust based on power ratio (AI power vs player power):

| Situation | Economy | Military | Defense | Expansion |
|-----------|---------|----------|---------|-----------|
| Behind (ratio < 0.5) | 0.8 | 0.3 | 0.7 | 0.3 |
| Even (0.5-1.5) | 0.5 | 0.5 | 0.4 | 0.5 |
| Ahead (ratio > 1.5) | 0.4 | 0.8 | 0.3 | 0.6 |

Threat level (when attacked) boosts defense and military priorities.

### Build Priority Order

1. **Minimum ships**: Always maintain at least 2 ships
2. **Settlements**: Build up to 4 settlements for resource generation
3. **Military ships**: Build schooners/cutters when military priority > 0.5
4. **Defensive towers**: Build watchtowers when defense priority > 0.5 (max 2)

### Ship Commands

AI ships follow this logic:
1. **Attack**: If enemy within 8 hexes, set attack target and pursue
2. **Patrol**: If idle, patrol 6-14 hexes around home port

## Combat Integration

### Owner-Aware Targeting
- Ships only attack enemy-owned entities
- Towers only attack enemy ships
- Projectiles only hit enemies (no friendly fire)

### Player Attacking AI Structures
- Cmd+click on AI ships, ports, settlements, or towers to attack
- Uses `findNearestWaterInRange()` for inland structures
- Attack range determined by ship's `attackDistance` property

## Visual Differentiation

AI-owned entities are marked with a red indicator circle:
- Ships: Red circle behind the ship sprite
- Ports/Settlements/Towers: Red circle overlay
- AI ships are hidden in fog of war (same as pirates)

## Files

| File | Purpose |
|------|---------|
| `game/src/systems/aiPlayer.js` | AI decision engine (main file) |
| `game/src/gameState.js` | Ownership helpers, AI state creation |
| `game/src/scenarios/index.js` | Versus scenario definition |
| `game/src/scenes/gameScene.js` | Versus mode init, AI update call, win conditions |
| `game/src/systems/combat.js` | Owner-aware combat |
| `game/src/systems/inputHandler.js` | Attack targeting for AI entities |
| `game/src/systems/resourceGeneration.js` | AI resource routing |
| `game/src/systems/construction.js` | Ship ownership inheritance |
| `game/src/rendering/unitRenderer.js` | Red indicators for AI units |

## Key Functions

### aiPlayer.js
- `updateAIPlayer(gameState, map, fogState, dt)` - Main update (called every frame)
- `updateStrategicPriorities(gameState, map)` - Adjust priorities based on game state
- `evaluateBuildOptions(gameState, map, fogState)` - Decide what to build
- `updateShipCommands(gameState, map)` - Command AI ships
- `findNearestEnemy(ship, gameState)` - Find closest player entity
- `notifyAIAttacked(gameState)` - Called when AI is attacked (increases threat)

### gameState.js
- `findOppositeStartingPositions(map)` - Find two home port locations ~25+ hexes apart
- `createAIPlayerState(config)` - Initialize AI state structure
- `getHomePortIndexForOwner(gameState, map, owner)` - Get home port for a faction

### combat.js
- `handlePatrolAutoAttack(gameState)` - Auto-attack for patrolling ships (owner-aware)
- `handlePlayerAttacks(gameState, dt)` - Player/AI ship attacks (uses ship's attackDistance)

## Constants

| Constant | Value | Description |
|----------|-------|-------------|
| STRATEGIC_DECISION_INTERVAL | 5s | How often to recalculate priorities |
| BUILD_DECISION_INTERVAL | 3s | How often to evaluate builds |
| SHIP_COMMAND_INTERVAL | 2s | How often to update ship commands |
| Enemy detection range | 8 hexes | Distance to detect and chase enemies |
| Patrol radius | 6-14 hexes | Random patrol distance from home port |

## Future Expansion Ideas
- Difficulty levels (easy/medium/hard)
- Multiple AI opponents
- AI port upgrades and ship repairs
- AI trade routes for resource generation
- More sophisticated targeting (prioritize damaged units, high-value targets)
- Team modes (2v2)
