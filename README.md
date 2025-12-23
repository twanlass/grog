# Grog

A hex-based naval trading game built with [Kaplay](https://kaplayjs.com/).

Build ports, command ships, establish trade routes, and expand your maritime empire across procedurally generated archipelagos.

## Quick Start

```bash
cd game
npm install
npm run dev
```

Open http://localhost:5173 in your browser.

## Controls

- **Click** - Select ships/ports/farms
- **Shift+Click** - Add to selection
- **Cmd+Click** (water) - Set waypoint for selected ships
- **Cmd+Click** (foreign port) - Establish trade route
- **Cmd+Click** (home port) - Unload cargo
- **WASD / Arrow keys** - Pan camera
- **Scroll** - Zoom in/out
- **1/2/3** - Time controls (pause/normal/fast)

## Features

- [Adding Features](game/docs/features/adding-features.md) - Developer guide for extending the game
- [Fog of War](docs/features/fog-of-war.md)
- [Ship Building](docs/features/ship-building.md)
- [Port Building](docs/features/port-building.md)
- [Settlement Building](docs/features/settlement-building.md)
- [Trade Routes](docs/features/trade-routes.md)

## Project Structure

```
grog/
  CLAUDE.md          # Project context for AI assistants
  game/              # Game source code
    src/
      main.js        # Entry point
      systems/       # Game logic modules
      scenes/        # Kaplay scenes
      sprites/       # Ship, port, farm definitions
  docs/              # Feature documentation
```
