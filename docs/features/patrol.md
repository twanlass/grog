# Patrol Routes

Ships can be assigned patrol routes to continuously loop through a series of waypoints.

## How to Create a Patrol

1. Select one or more ships
2. Press **P** to enter patrol mode (notification appears)
   - Ship's current location is automatically added as waypoint 1
3. Right-click to add additional waypoints (ships start moving immediately)
4. Press **Escape** or select another unit to exit patrol mode
5. Ships will loop through waypoints continuously, returning to their starting position

## Behavior

- Ships navigate to each waypoint in order
- When the last waypoint is reached, ships return to the first waypoint (loop)
- Patrol continues indefinitely until cancelled
- Multiple ships can share the same patrol route

## Auto-Attack

Patrolling ships automatically engage nearby pirates:

1. Ship detects pirate within its `sightDistance` (varies by ship type)
2. Ship interrupts patrol and chases the pirate
3. Ship fires when within attack range (2 hexes)
4. When pirate is destroyed, ship resumes patrol from its route

### Detection Ranges

| Ship | sightDistance |
|------|---------------|
| Cutter | 1 hex |
| Schooner | 1 hex |
| Brigantine | 2 hexes |
| Galleon | 3 hexes |

## Cancelling a Patrol

- **Regular click** on a new destination cancels the patrol and sets a single waypoint
- Patrol state is cleared (`ship.isPatrolling = false`, `ship.patrolRoute = []`)

## Visual Indicators

| Element | Patrol | Regular Waypoint |
|---------|--------|------------------|
| Route line | Solid red | Dashed red |
| Waypoint marker | Dot | X |
| Loop visualization | Full loop shown | Current path only |

Patrol routes always show the complete loop connecting all waypoints, including the closing segment from last waypoint back to first.

## Hotkeys

| Key | Action |
|-----|--------|
| P | Enter patrol mode (when ships selected) |
| Escape | Exit patrol mode |
| . | Pause/Resume game |

## Files

| File | Purpose |
|------|---------|
| `game/src/gameState.js` | Patrol mode state, ship patrol properties |
| `game/src/scenes/gameScene.js` | P hotkey, escape handling, click routing |
| `game/src/systems/inputHandler.js` | Patrol waypoint click handler |
| `game/src/systems/shipMovement.js` | Patrol loop logic |
| `game/src/systems/combat.js` | Auto-attack detection and combat |
| `game/src/rendering/selectionUI.js` | Patrol route visualization |

## Key Functions

### gameState.js
- `enterPatrolMode(gameState)` - Activates patrol waypoint setting mode
- `exitPatrolMode(gameState)` - Deactivates patrol mode
- `createShip()` - Creates ship with `patrolRoute` and `isPatrolling` properties

### inputHandler.js
- `handlePatrolWaypointClick(gameState, map, clickedHex)` - Adds waypoint to patrol route
- `handleWaypointClick()` - Clears patrol on regular click
- `handleUnitSelection()` - Exits patrol mode when selecting new units

### shipMovement.js
- Waypoint completion logic checks `ship.isPatrolling`
- When waypoints empty and patrolling, restores from `ship.patrolRoute`

### selectionUI.js
- `drawPatrolRoute()` - Draws solid route lines in a loop
- `drawPatrolWaypointMarker()` - Draws dot markers

### combat.js
- `handlePatrolAutoAttack(gameState)` - Detects pirates within sightDistance, sets `attackTarget`
- `handlePatrolChase(gameState)` - Navigates patrolling ships toward attack targets
- `cleanupStaleReferences()` - Resumes patrol when target destroyed (restores `waypoints` from `patrolRoute`)

## Data Structures

### Game State
```javascript
gameState.patrolMode = {
    active: false,  // Whether patrol waypoint setting mode is active
}
```

### Ship Patrol State
```javascript
ship = {
    // ... existing properties
    patrolRoute: [],      // Array of { q, r } - saved patrol waypoints
    isPatrolling: false,  // Whether ship is in patrol loop mode
    waypoints: [],        // Current active waypoints (consumed as ship moves)
}
```

## State Flow

```
Press P with ships selected
    ↓
PATROL_MODE_ACTIVE (notification shown)
ship.patrolRoute = [{ q: ship.q, r: ship.r }]  (current location as waypoint 1)
ship.isPatrolling = true
    ↓
Right-click to add waypoints
    ↓
ship.waypoints.push({ q, r })
ship.patrolRoute.push({ q, r })
    ↓
Ship navigates through waypoints
    ↓
Last waypoint reached, waypoints empty
    ↓
ship.waypoints = [...ship.patrolRoute]  (restore loop)
    ↓
Continue navigation (infinite loop, returning to start)
```

### Auto-Attack Flow

```
Patrolling ship detects pirate within sightDistance
    ↓
handlePatrolAutoAttack() sets ship.attackTarget
ship.waypoints = []  (interrupt patrol)
    ↓
handlePatrolChase() sets waypoint to target location
    ↓
Ship navigates toward pirate
    ↓
Within attackDistance (2 hexes), ship fires
    ↓
Pirate destroyed → cleanupStaleReferences() called
    ↓
ship.attackTarget = null
ship.waypoints = [...ship.patrolRoute]  (resume patrol)
    ↓
Continue patrol loop
```

## Edge Cases

- **Single waypoint patrol**: Ship navigates to waypoint, then immediately loops back
- **Cancel mid-patrol**: Regular click clears patrol, ship goes to new destination
- **Ship destroyed**: No special handling needed
- **Blocked path**: Standard A* pathfinding handles obstacles
- **Multiple ships**: Each ship maintains independent patrol state
- **Escape during setup**: Exits patrol mode, ships keep any waypoints already set
- **Pirate detected during patrol**: Ship chases and attacks, then resumes patrol
- **Multiple pirates**: Ship attacks nearest one, then resumes or re-engages
