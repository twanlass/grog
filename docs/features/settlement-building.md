# Settlement Building

Ports can construct settlements on nearby land. Settlements generate wood and food over time.

## Behavior

### Placement
- Select a port to see the build panel
- Click "BUILD SETTLEMENT" to enter placement mode
- Green highlights show valid placement hexes (land within range)
- Click a valid hex to start construction
- Press ESC or right-click to cancel

### Construction
- Settlement appears semi-transparent with "BUILDING" label and progress bar
- Progress bar is cyan/blue
- Construction takes 30 seconds
- Fog of war reveals (3-hex radius) when construction completes

### Resource Generation
- Completed settlements generate +5 wood and +5 food every 30 seconds
- **Home port settlements** (port index 0): Resources added to global storage
- **Built port settlements**: Resources added to port's local `storage`
- Floating "+5" numbers animate upward when resources generate:
  - Brown for wood
  - Green for food

## Restrictions
- Port can only build one thing at a time (ship, settlement, or upgrade)
- Port can only have one settlement under construction at a time
- Must be placed on land hex within 10 hexes of port
- Cannot place on hex already occupied by port or settlement

## Files

| File | Purpose |
|------|---------|
| `game/src/gameState.js` | Settlement creation, placement mode, validation |
| `game/src/scenes/gameScene.js` | UI, construction progress, resource generation |
| `game/src/sprites/settlements.js` | Settlement definition with `buildTime`, `sight_distance` |

## Key Functions

### gameState.js
- `createSettlement(q, r, isConstructing, builderPortIndex)` - Creates settlement with `parentPortIndex` and `generationTimer`
- `enterSettlementBuildMode(gameState, portIndex)` - Activates placement mode
- `exitSettlementBuildMode(gameState)` - Cancels/exits placement mode
- `isValidSettlementSite(map, q, r, settlements, ports)` - Checks if hex is valid
- `isPortBuildingSettlement(portIndex, settlements)` - Returns true if port is building a settlement

## Data Structures

### Settlement
```javascript
settlement = {
    q, r,
    parentPortIndex: 0,      // Which port owns this settlement
    generationTimer: 0,      // Time since last resource generation
    construction: {
        progress: 0,
        buildTime: 30,
    } | null,
}
```

### Placement mode state
```javascript
gameState.settlementBuildMode = {
    active: false,
    builderPortIndex: null,
    hoveredHex: null,
}
```

### Floating numbers
```javascript
floatingNumbers = [{
    q, r,                   // Hex position
    text: '+5',
    type: 'wood' | 'food',
    age: 0,
    duration: 0.75,
    offsetX: -30 | 30,      // Horizontal offset
}]
```

## Constants
- `GENERATION_INTERVAL`: 30 seconds
- `GENERATION_AMOUNT`: 5 (wood and food)
- `MAX_SETTLEMENT_BUILD_DISTANCE`: 10 hexes from port
- `sight_distance`: 3 hexes (fog reveal on completion)

## Edge Cases
- **Port busy building ship**: Settlement button greyed out
- **Already building settlement**: Button shows "(building...)"
- **Game paused**: Construction and generation pause (uses timeScale)
- **Port destroyed**: Settlements continue generating (orphaned)
