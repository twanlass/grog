# Grog - Game Design Overview

## What is Grog?

Grog is a hex-based naval strategy game set in a procedurally generated archipelago. Players build a maritime empire by commanding ships, establishing ports and settlements, managing resources, and defending against pirates or rival factions.

The visual style is retro pixel art with animated water effects, fog of war, and charming ship sprites sailing between islands.

## Game Modes

### Sandbox
Open-ended exploration and trading. Build your fleet, establish trade routes between islands, and expand your territory at your own pace. Pirates roam the waters as a persistent threat.

### Defend
Wave-based survival. Start with extra resources and fortify your position against increasingly large pirate waves. 10 waves total, culminating in a 15-ship assault.

### Versus AI
3-way free-for-all against 2 AI opponents. Each faction starts on a separate island with equal resources. Victory requires eliminating both enemies - destroy all their ships, ports, settlements, and towers.

## Ships

| Ship | Role | Notes |
|------|------|-------|
| **Cutter** | Scout | Fast, cheap, low cargo. Good for early exploration |
| **Schooner** | Trader | Balanced speed and cargo. Backbone of trade routes |
| **Brigantine** | Warship | Strong in combat, moderate cargo |
| **Galleon** | Capital | Slow but massive cargo and firepower |

Ships can:
- Navigate via waypoints (click to set destination, right-click to add waypoints)
- Patrol routes continuously (P key)
- Auto-attack enemies while patrolling
- Establish trade routes between ports
- Build ports and towers when docked at shore
- Be repaired when damaged

## Building

### Ports
Built by ships at coastal tiles. Three tiers:
- **Dock**: Basic port, can build Cutters
- **Port**: Mid-tier, unlocks Schooners
- **Stronghold**: Top tier, can build all ships including Galleons

Ports can be upgraded and serve as resource collection points.

### Settlements
Built by ports on inland tiles. Generate +5 wood and +5 food every 30 seconds. Must be land-connected to a port to function.

### Towers
Defensive structures built by ships. Auto-attack enemies within 3 hexes. Essential for defending key positions.

## Resources

- **Wood**: Universal building material for everything
- **Food**: Required alongside wood for ship construction
- **Crew**: Consumed when building larger ships

Resources flow from settlements → ports → global stockpile (via trade ships).

## Combat

Ships and towers automatically fire projectiles at enemies within range. Combat is cooldown-based - each unit fires, waits, fires again. Damaged units can be repaired at proportional cost.

## Trade Routes

The economic backbone. Command+click a foreign port to establish an auto-trade loop:
1. Ship sails to foreign port
2. Loads available resources from port storage
3. Returns to home port and unloads
4. Repeats indefinitely

Multiple ships can share routes. Ships wait politely if a dock is occupied.

## Fog of War

The map starts shrouded in darkness. Ships reveal terrain as they explore based on their sight range. Settlements and ports reveal their surroundings when built. Once revealed, areas stay visible.

## AI Opponents (Versus Mode)

Each AI randomly selects a strategy:

- **Aggressive**: Rushes military early, attacks before you're established
- **Defensive**: Builds towers, turtles, then counterattacks with force
- **Economic**: Expands settlements rapidly, builds a massive late-game fleet

The AI scouts to find your base, coordinates group attacks, and retreats to defend when threatened.

## Controls

| Input | Action |
|-------|--------|
| Click | Select unit / Set destination |
| Right-click | Add waypoint |
| Cmd+Click | Attack / Trade route |
| P | Enter patrol mode |
| R | Repair selected unit |
| H | Snap camera to home port |
| Escape | Cancel current mode |
| . (period) | Pause game |

## The Vibe

Grog is meant to feel like a chill-but-strategic experience. Build up your little empire, watch your ships sail between islands, defend against pirates. The pixel art and gentle pacing create a satisfying loop of expansion and optimization.
