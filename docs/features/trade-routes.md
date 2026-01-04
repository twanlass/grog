# Plundering (formerly Trade Routes)

Ships can plunder resources from enemy ports, stealing directly from the enemy's treasury.

## Resource Generation

All settlements contribute directly to their owner's global resources:
- **Player settlements** → `gameState.resources.wood`
- **AI settlements** → `gameState.aiPlayers[n].resources.wood`

No manual trading is needed between your own ports.

## Plundering

Plundering lets you steal resources from enemy factions.

### How to Plunder (Player)
1. Select a ship
2. **Shift + right-click** on an enemy port
3. Ship navigates to enemy port and loads resources from enemy's global treasury
4. Ship returns to your home port and unloads to your treasury
5. Route auto-loops until cancelled

### Controls
| Action | Input |
|--------|-------|
| Plunder enemy port | Shift + right-click |
| Attack enemy port | Right-click (no shift) |
| Cancel plunder route | Right-click elsewhere / set new destination |

## Resource Flow

```
Enemy Treasury (global)
    ↓ (ship loads at enemy port)
Ship Cargo
    ↓ (ship unloads at home port)
Your Treasury (global)
```

### Risk/Reward
- Resources are deducted from enemy immediately when loaded
- Resources are NOT added to your treasury until ship unloads
- **If ship is destroyed**, cargo is lost forever
- Enemy gets no resources back if your ship is sunk

## AI Plundering

AI opponents can also plunder your ports.

### AI Decision Making
- **Strategy-based**: Aggressive AI plunders frequently (~63%), Defensive rarely (~28%), Economic moderate (~21%)
- **Uses idle ships**: Only ships with no other tasks
- **No cheating**: AI doesn't know your resource count - just attempts plundering opportunistically

### AI Plunder Behavior
- Evaluates every 5 seconds
- Picks nearest enemy port
- Sends one idle ship per evaluation
- Ships complete loading before being reassigned

## Ship Cargo Capacity

| Ship | Cargo Capacity |
|------|----------------|
| Cutter | 2 |
| Schooner | 4 |
| Brigantine | 6 |
| Galleon | 12 |

## Loading/Unloading

- **Speed**: 1 second per resource unit
- **Progress bar**: Green (loading), Gold (unloading)
- Ship stays docked until fully loaded or enemy treasury is empty

## Waiting System

When a dock is occupied:
- Ship navigates to nearby water hex (2+ hexes from port)
- Ship enters "WAITING" status
- Retries every 2 seconds
- Resumes when dock is free

## Status Indicators

| Status | Color | Meaning |
|--------|-------|---------|
| PLUNDERING | Cyan | Active plunder route, traveling |
| LOADING | Green | Loading cargo at enemy port |
| UNLOADING | Gold | Unloading cargo at home port |
| WAITING | Yellow | Waiting for dock to be free |

## Files

| File | Purpose |
|------|---------|
| `game/src/systems/tradeRoutes.js` | Loading/unloading state machine |
| `game/src/systems/inputHandler.js` | Shift+right-click handling |
| `game/src/systems/aiPlayer.js` | AI plunder decisions |
| `game/src/systems/resourceGeneration.js` | Settlement → global resources |
| `game/src/gameState.js` | Ship state, helper functions |

## Key Functions

### tradeRoutes.js
- `updateTradeRoutes()` - Main state machine for loading/unloading
- `getResourcesForOwner()` - Gets global resources for a faction

### inputHandler.js
- `handleTradeRouteClick()` - Handles Shift+right-click for plunder routes

### aiPlayer.js
- `evaluatePlunderRoutes()` - AI decision to send ships plundering

### gameState.js
- `createShip()` - Creates ship with `tradeRoute`, `cargo`, `isPlundering`, `dockingState`
- `cancelTradeRoute()` - Clears plunder route and related state

## Data Structures

### Ship plunder state
```javascript
ship = {
    tradeRoute: { foreignPortIndex: 1, homePortIndex: 0 } | null,
    isPlundering: true | false,  // Distinguishes plunder from legacy trade
    cargo: { wood: 0 },
    dockingState: {
        action: 'loading' | 'unloading',
        progress: 0,
        totalUnits: 4,
        unitsTransferred: 0,
        targetPortIndex: 1,
    } | null,
    waitingForDock: { portIndex: 1, retryTimer: 0 } | null,
}
```

## Edge Cases

- **Enemy has no resources**: Ship waits at dock, checks each frame
- **Enemy port destroyed**: Plunder route cancelled
- **Enemy port captured**: Plunder route cancelled (now friendly)
- **Ship destroyed mid-voyage**: Cargo lost, enemy doesn't get it back
- **Multiple ships same target**: Each operates independently
- **Dock occupied**: Ship waits nearby, retries every 2 seconds

## Constants

| Constant | Value | Location |
|----------|-------|----------|
| `LOAD_TIME_PER_UNIT` | 1.0 seconds | tradeRoutes.js |
| `DOCK_RETRY_INTERVAL` | 2.0 seconds | tradeRoutes.js |
| AI plunder cooldown | 5 seconds | aiPlayer.js |
