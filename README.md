# Grog

Grog is a retro real-time strategy game. Build ports, defend your territory with towers, command ships, plunder enemies, and expand your empire across procedurally generated archipelagos. Built with [Kaplay](https://kaplayjs.com/) and [Claude Code](https://claude.com/product/claude-code). 

👉 [Play](https://grog-rts.netlify.app)

<img width="2384" height="1634" alt="CleanShot 2026-01-05 at 07 45 03" src="https://github.com/user-attachments/assets/76301209-3dfb-4182-be95-fda895fde774" />

## Controls

- **Left click** - Select ships/ports/settlements
- **Double Left Click** – Select all units of same type
- **Right Click** - Action (attack, set waypoints) with selected units
- **Shift + Right Click** – Plunder enemy port
- **P + Right Click** – Set patrol route for selected ships

See in-game Controls menu for more

## Development Quick Start

```bash
cd game
npm install
npm run dev
```

See [Adding Features](game/docs/features/adding-features.md). 

## Project Structure

```
grog/
  CLAUDE.md          # Project context for Claude Code
  game/              # Game source code
    src/
      main.js        # Entry point
      systems/       # Game logic modules
      scenes/        # Kaplay scenes
      sprites/       # Ship, port, settlement assets
  docs/              # Feature documentation
```
