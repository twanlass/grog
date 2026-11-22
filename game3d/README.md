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

## How it looks the way it does

Nothing is loaded from a model or texture file. Everything below is generated in code.

- **Surfaces** (`util/geo.js`, `surfaceMaterial`): every part carries a surface kind (wood, canvas, stone, roof, thatch, metal, plaster, foliage, ground...). One shader patch draws that kind's detail procedurally in object space, bends the normal with the same height field, and sets roughness, so planks, masonry courses and shingles hold up when zoomed in.
- **Models** (`art/ships.js`, `art/structures.js`): hulls with bulwarks, wales and sheer; two-part masts, yards, shrouds and stays; decks with guns, boats, lanterns and crew. Ports are quays with timber-framed buildings, cranes and cargo.
- **Islands** (`art/heightfield.js`, `art/terrain.js`): one continuous height function blended from the hex tiles. Each land hex keeps a level pad at its centre for buildings. Vegetation is instanced, sways in the wind, and clears off a hex when something is built there.
- **Sea** (`art/water.js`): depth comes from the same height field, so the water is clear over the beach, turquoise on the shelf and the tile's deep colour beyond, with surf at the shore, ripple normals and sky reflection.
- **Frame** (`render/post.js`): sky-dome environment light, ambient occlusion, bloom, ACES tone mapping. Quality steps down by itself if the frame rate drops.

URL params: `post=off`, `ao=off`, `bloom=off`, `quality=high` (never step down), and `?play&mode=skirmish|defend|sandbox&ai=1-3&difficulty=easy|normal|hard&seed=N`, `fog=off`, `shadows=off`.

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

Multiplayer, voice chat, the tutorial, and touch input.
