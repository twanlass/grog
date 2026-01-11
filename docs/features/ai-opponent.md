# AI Opponent

A full AI opponent that can perform all player actions: build ships, ports, settlements, towers, and engage in combat. Used in "Versus AI" game mode.

## Game Mode: Versus AI

Select "Versus AI" from the scenario menu to play against the AI.

### Setup
- **Mirror start**: Player and AI each get a home port on opposite sides of the map (~25+ hexes apart)
- **Same resources**: Both start with 25 wood
- **No pirates**: Pirates are disabled in versus mode
- **Random strategy**: AI randomly selects one of three strategies (see below)

### Win Condition
**Total elimination**: Destroy all enemy ships, ports, settlements, and towers.

## AI Strategies

The AI uses one of three strategies, randomly selected at game start. Each strategy has different priorities, build preferences, and ship behaviors.

### Aggressive
Early military rush - attacks before player establishes.

| Aspect | Configuration |
|--------|---------------|
| Focus | High military (0.9), low defense (0.2) |
| Min ships | 3 |
| Max settlements | 2 |
| Max towers | 1 |
| Max distant ports | 1 |
| Preferred ship | Schooner |
| Ship cap | 8 |
| Patrol radius | 10-20 hexes (far from home) |
| Engagement range | 10 hexes |
| Retreat threshold | 20% health |
| Attack group size | 2 ships |
| Expansion priority | Low (4 ships required, 50 wood buffer) |

### Defensive
Heavy tower investment - turtles and counterattacks.

| Aspect | Configuration |
|--------|---------------|
| Focus | High defense (0.9), moderate economy (0.5) |
| Min ships | 2 |
| Max settlements | 3 |
| Max towers | 4 |
| Max distant ports | 2 |
| Preferred ship | Cutter |
| Ship cap | 5 |
| Patrol radius | 4-8 hexes (close to home) |
| Engagement range | 6 hexes |
| Retreat threshold | 50% health |
| Attack group size | 3 ships |
| Expansion priority | Moderate (3 ships required, 40 wood buffer) |

### Economic
Max settlements early - booms before striking.

| Aspect | Configuration |
|--------|---------------|
| Focus | High economy (0.9), high expansion (0.8) |
| Min ships | 2 |
| Max settlements | 6 |
| Max towers | 2 |
| Max distant ports | 3 |
| Preferred ship | Schooner |
| Ship cap | 6 |
| Patrol radius | 5-10 hexes |
| Engagement range | 5 hexes |
| Retreat threshold | 40% health |
| Attack group size | 4 ships |
| Expansion priority | High (2 ships required, 20 wood buffer, builds shipyards) |

## Game Phases

The AI adjusts priorities based on game phase:

| Phase | Condition |
|-------|-----------|
| Early | First 90 seconds OR < 3 total settlements |
| Mid | Between early and late |
| Late | After 300 seconds OR > 8 total settlements |

Each strategy has phase modifiers that adjust priorities. For example:
- **Aggressive**: Boosts military in early game (rush)
- **Defensive**: Boosts defense early, military late (counterattack)
- **Economic**: Boosts economy early, military late (boom then attack)

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
    strategy: 'aggressive',            // One of: aggressive, defensive, economic
    gameTime: 0,                       // Total game time in seconds
    gamePhase: 'early',                // Current phase: early, mid, late
    decisionCooldown: 0,               // Timer for strategic decisions
    buildDecisionCooldown: 0,          // Timer for build decisions
    shipCommandCooldown: 0,            // Timer for ship commands
    tacticsCooldown: 0,                // Timer for tactical decisions
    priorities: {
        expansion: 0.5,                // Weight for expansion actions
        economy: 0.5,                  // Weight for economic actions
        military: 0.5,                 // Weight for military actions
        defense: 0.5,                  // Weight for defensive actions
    },
    threatLevel: 0,                    // 0-1, increases when attacked
    tactics: {
        scoutShipIndex: null,          // Ship assigned to scouting
        attackGroup: [],               // Ship indices in attack group
        attackTarget: null,            // Current group attack target {q, r}
        enemyBaseLocation: null,       // Discovered enemy base {q, r}
        isDefending: false,            // Whether in defend mode
        // Port expansion
        discoveredIslands: [],         // Array of { portSiteHex, distanceFromHome, hasEnemyPresence }
        expansionShipIndex: null,      // Ship assigned to expansion mission
    },
}
```

## Decision System

The AI runs four decision loops at different intervals:

| Decision Type | Interval | Function |
|---------------|----------|----------|
| Strategic | 5 seconds | `updateStrategicPriorities()` |
| Tactics | 4 seconds | `updateTactics()` |
| Build | 3 seconds | `evaluateBuildOptions()` |
| Ship Commands | 2 seconds | `updateShipCommands()` |

### Strategic Priorities

Priorities start from the strategy's base values, then:

1. **Phase modifiers** are applied based on game phase
2. **Situational adjustments** based on power ratio (AI power vs player power):
   - Behind (ratio < 0.5): Boost economy/defense, reduce military
   - Ahead (ratio > 1.5): Boost military/expansion
3. **Threat response**: High threat (>0.5) boosts defense and military

### Build Priority Order

1. **Minimum ships**: Maintain strategy-defined minimum (2-3 ships)
2. **Settlements**: Build up to strategy max (2-6) when above wood threshold
3. **Military ships**: When military priority > 0.5, build preferred ship type up to ship cap
4. **Defensive towers**: When defense priority > threshold, build up to strategy max
5. **Tower upgrades**: When defense priority > upgrade threshold
6. **Port upgrades**: When expansion priority > port upgrade threshold, upgrade existing ports
7. **Port expansion**: When expansion priority > 0.5, send ships to build ports on new islands
8. **Economic bonus**: Economic strategy builds extra settlements when rich (50+ wood)

## Port Expansion System

The AI can expand to new islands by discovering them and sending ships to build ports.

### Island Discovery
- All AI ships scan nearby hexes (8-hex sight range) for valid port sites
- Islands are tracked in `tactics.discoveredIslands`
- Skips home island and islands where AI already has a port
- Tracks enemy presence on each discovered island

### Expansion Triggers
The AI considers expanding when:
- Has enough ships (strategy-defined: 2-4 ships)
- Has resources > port cost + buffer (strategy-defined: 20-50 wood)
- Expansion priority > 0.5
- Threat level < 0.5 (not under attack)
- Has discovered unexploited islands
- Below max distant ports limit

### Expansion Mission Phases
1. **Traveling**: Ship sails to docking hex adjacent to target port site
2. **Docking**: Ship arrives and waits for resources if needed
3. **Building**: Ship is locked while port construction progresses

### Strategy Differences

| Strategy | Min Ships | Wood Buffer | Max Ports | Port Type |
|----------|-----------|-------------|-----------|-----------|
| Economic | 2 | 20 | 3 | Shipyard |
| Defensive | 3 | 40 | 2 | Dock |
| Aggressive | 4 | 50 | 1 | Dock |

### Port Upgrades
The AI also upgrades existing ports (dock → shipyard → stronghold) when expansion priority exceeds the strategy's port upgrade threshold.

## Tactics System

The tactics system manages coordinated behaviors beyond individual ship commands.

### Scout Ship
- One ship is assigned as scout (requires 2+ ships)
- Explores 20-30 hexes from home to find enemy base
- Once enemy found, patrols 10-15 hexes around enemy base (harassing)
- Updates `enemyBaseLocation` when enemy port discovered

### Group Attacks
- Waits until enough ships are available (strategy-defined: 2-4 ships)
- Forms attack group and sends them to enemy base location
- Only launches attack once enemy base is discovered by scout
- Attack group moves together toward target
- Attack completes when any ship reaches within 3 hexes of target

### Defend Mode
- **Triggered** when threat level reaches 0.7+
- **All ships** recalled to home port
- **Attack group** disbanded
- **Exits** when threat drops below 0.3

### Ship Commands (Individual)

Ships not managed by tactics (not scout, not in attack group, not defending):

1. **Retreat**: If health below strategy threshold, retreat to home port
2. **Attack**: If enemy within engagement range, decide to pursue based on `pursuitPersistence`
3. **Patrol**: If idle, patrol within strategy-defined radius around home port

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
- `updateStrategicPriorities(gameState, map)` - Adjust priorities based on strategy/phase
- `updateTactics(gameState, map)` - Manage scout, group attacks, defend mode
- `evaluateBuildOptions(gameState, map, fogState)` - Decide what to build
- `updateShipCommands(gameState, map)` - Command AI ships
- `findNearestEnemy(ship, gameState)` - Find closest player entity
- `notifyAIAttacked(gameState)` - Called when AI is attacked (increases threat)

### Tactics Functions
- `checkDefendMode(gameState, map)` - Enter/exit defend mode
- `executeDefend(gameState, map)` - Recall all ships to home
- `manageScout(gameState, map)` - Assign and control scout ship
- `generateScoutTarget(gameState, map, tactics)` - Generate exploration waypoints
- `manageGroupAttack(gameState, map)` - Coordinate group attacks

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
| TACTICS_DECISION_INTERVAL | 4s | How often to update tactics |
| BUILD_DECISION_INTERVAL | 3s | How often to evaluate builds |
| SHIP_COMMAND_INTERVAL | 2s | How often to update ship commands |

### Strategy-Specific Values

| Strategy | Patrol Radius | Chase Distance Multiplier | Scout Behavior | Attack Group Size |
|----------|---------------|---------------------------|----------------|-------------------|
| Aggressive | 10-20 hexes | 1.5x | engage | 2 ships |
| Defensive | 4-8 hexes | 1.0x | observe | 3 ships |
| Economic | 5-10 hexes | 1.0x | hit-and-run | 4 ships |

### Detection and Chase System

AI ships use the ship type's `sightDistance` for detection (not a strategy-defined value). When a ship detects an enemy within its sight distance:

1. **Detection**: Ship spots enemy within `sightDistance` (varies by ship type: Cutter 3, Schooner 6, etc.)
2. **Chase**: Ship pursues target, tracking distance traveled
3. **Chase Limit**: When `chaseDistanceTraveled` reaches `maxChaseDistance * chaseDistanceMultiplier`, ship gives up
4. **Cooldown**: Ship enters 5-second cooldown, ignoring all enemies
5. **Resume**: After cooldown, ship resumes patrol/normal behavior

| Ship | sightDistance | maxChaseDistance |
|------|---------------|------------------|
| Cutter | 3 hexes | 8 hexes |
| Schooner | 6 hexes | 10 hexes |
| Brigantine | 2 hexes | 12 hexes |
| Galleon | 3 hexes | 15 hexes |

## Future Expansion Ideas
- Difficulty levels (easy/medium/hard)
- AI ship repairs
- AI trade routes for resource generation
- More sophisticated targeting (prioritize damaged units, high-value targets)
- Team modes (2v2)
