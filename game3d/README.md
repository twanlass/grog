# Grog 3D

Grog rebuilt as a low-poly 3D game using sim-taxi's techniques: Three.js and Vite, with every mesh generated in code (merged flat-shaded geometry, baked vertex colours, position-keyed jitter, one named palette).

The simulation is the 2D game's own code, imported unchanged through the `@grog` alias (`../game/src`). That covers map generation, ships, trade, construction, combat, the AI, pirates and fog. This folder holds only the renderer, input and HUD, so a balance or rules change in `game/` shows up here for free.

```bash
cd game3d && npm install
npm run dev      # http://localhost:5173, model bench at /gallery.html
npm run check    # headless suite: modules, geometry winding, fog lookup, a sim of every mode, actions through the 2D handlers
npm run build
```

Netlify builds it alongside the 2D game and serves it at `/3d/` (see `netlify.toml`).

URL params: `?play&mode=skirmish|defend|sandbox&ai=1-3&difficulty=easy|normal|hard&seed=N`, `fog=off`, `shadows=off`.

## Layout

| Path | What |
|---|---|
| `src/session.js` | Builds a game the way `gameScene.js` does and runs the host system order each step |
| `src/actions.js` | HUD buttons → the 2D `handle*PanelClick` handlers, so costs and rules stay in one place |
| `src/input.js` | Grog's click priority: select, box, right-click move/attack/trade, placement modes, hotkeys |
| `src/world.js` | 1 world unit = 8 Grog pixels; Grog x → world X, Grog y → world Z |
| `src/art/` | Terrain (stepped hex islands, climate props), water (swell shader), ships, structures |
| `src/render/` | Scene/sun/haze, ortho camera, units, effects pools, markers, fog DataTexture |
| `src/ui/` | DOM HUD, title screen, minimap |

Fog is applied per surface: a map-sized texture (shroud, unexplored) is sampled in an `onBeforeCompile` patch that repeats `hex.js`'s hex rounding in GLSL, which `npm run check` compares against the JS.

## Not ported yet

Multiplayer, voice chat, the tutorial, and touch input. sim-taxi's post effects (SSAO, bloom) aren't in.
