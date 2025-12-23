# Trade Winds
## Game Design Document (v0.2)

---

### Concept
Build a trading empire across a procedurally generated hex ocean. Establish ports, run trade routes, and defend against pirates. You're the company director — you issue orders, not control ships.

---

### Core Loop (Simulation-First)

```
┌─────────────────────────────────────────────────────┐
│                                                     │
│   COMMISSION    →    WATCH    →    RESULTS         │
│   (spend resources)  (sim runs)   (gain/lose)      │
│        ↑                              │            │
│        └──────────── REINVEST ────────┘            │
│                                                     │
└─────────────────────────────────────────────────────┘
```

**Time Controls:** Pause / 1x / 2x / 4x speed

---

### Resources

| Resource | Use |
|----------|-----|
| **Wood** | Repairs, upgrades, building ports/ships |
| **Steel** | Repairs, upgrades, building ports/ships |
| **Food** | Crew supplies for voyages |
| **Grog** | Crew wages/morale for voyages |

**Resource Pattern:**
- Food + Grog = operating costs (ongoing, per voyage)
- Wood + Steel = capital costs (one-time investments)

#### Global Stockpile

One shared resource pool. Any port can add to it.

```
┌─────────────────────────────────────────────┐
│            GLOBAL STOCKPILE                 │
│   Wood: 150  Steel: 80  Food: 200  Grog: 45 │
└─────────────────────────────────────────────┘
         ↑           ↑           ↑
      Port A      Port B      Port C
         ↑           ↑           ↑
       Ship 1     Ship 2     Ship 3
```

#### Island Yields by Climate

| Climate | Primary Yield | Secondary Yield |
|---------|---------------|-----------------|
| Tropical | Food | Wood |
| Temperate | Wood | Steel |
| Arctic | Steel | Grog |

**Yield = base × richness × (1 - depletion)**

#### Route Value

**Route Value = Distance × Scarcity**
- Short/common route → 1x multiplier
- Medium/moderate route → 2x
- Long/rare route → 4x

#### Cost Table

| Action | Wood | Steel | Food | Grog |
|--------|------|-------|------|------|
| Expedition | — | — | ✓ | ✓ |
| Trade Run | — | — | ✓ | ✓ |
| Repair Ship | ✓ | ✓ | — | — |
| Upgrade Ship | ✓ | ✓ | — | — |
| Build Ship | ✓ | ✓ | — | — |
| Build Port | ✓ | ✓ | — | — |
| Upgrade Port | ✓ | ✓ | — | — |
| Build Tower | ✓ | ✓ | — | — |

#### Run Economics

```
Supplies spent = (base + crew_tier) × round_trip_distance
Cargo returned = min(ship_capacity, island_yield)
Net gain = Cargo - Supplies
```

- If `island_yield > ship_capacity` → upgrade Cargo or send bigger ships
- If route costs more than it returns → bad route, retire it

---

### Ships

#### Ship Classes

| Class | Port Required | Notes |
|-------|---------------|-------|
| Cutter | Outpost | Small, scrappy starter |
| Sloop | Port | Balanced workhorse |
| Brigantine | Stronghold | Fast, medium cargo |
| Galleon | Stronghold | Big slow beast, massive cargo |

#### Ship Upgrades (3 tiers each, no tradeoffs)

| Upgrade | Tier 1 | Tier 2 | Tier 3 | Effect |
|---------|--------|--------|--------|--------|
| Sail | Canvas | Rigged | Full Mast | +speed (faster runs) |
| Cargo | Standard | Expanded | Bursting | +capacity (more per run) |
| Crew | Skeleton | Working | Press Gang | +load/unload speed, +pirate defense, +food/grog cost |

#### Ship Health
- Ships have a half-life; wear down over voyages
- Must return to port to repair (costs Wood, Steel)

#### Ship Actions (chosen while docked)

| Action | Effect |
|--------|--------|
| **Trade Run** | Default. Auto-loops assigned route. |
| **Expedition** | Explores fog, claims new islands. |
| **Repair** | Costs Wood + Steel, restores health. |
| **Upgrade** | Costs Wood + Steel, improves ship. |

---

### Ports & Trading

#### Core Concept

You **trade with** islands, you don't own them. Building a port is **colonization** — a strategic choice that sacrifices trade income for infrastructure.

| Location | What It Is | Can Trade? | Can Dock? |
|----------|------------|------------|-----------|
| **Discovered Island** 🏝 | Found by expedition, has "locals" | ✓ Yes | ✗ No |
| **Your Port** ⚓ | Infrastructure you built | ✗ No (colonized) | ✓ Yes |

**Key Rule:** Building a port on an island **kills its trade income**. The "locals" are gone — it's now your outpost.

#### Trade Route Example

```
     ⚓ Your Port
      │
      │  Ship sails out (carries Food + Grog)
      ▼
     🏝 Discovered Island
      │
      │  Ship loads cargo from locals
      ▼
     🏝 Discovered Island
      │
      │  Ship returns (carries cargo)
      ▼
     ⚓ Your Port (unload → global stockpile)
```

**Trade routes connect YOUR PORTS to DISCOVERED ISLANDS.**

A ship:
1. Departs from a port (costs Food + Grog)
2. Sails to discovered island
3. Loads cargo (limited by ship Cargo capacity)
4. Returns to nearest port
5. Unloads → resources added to global stockpile
6. Repeats

#### Port Decision Matrix

| Island Type | Trade Value | Port Value | Best Move |
|-------------|-------------|------------|-----------|
| Rich + Far | High income | Great staging point | Tough call — trade first, port later? |
| Rich + Near | High income | Redundant | Keep trading |
| Poor + Far | Low income | Great staging point | Colonize immediately |
| Poor + Near | Low income | Redundant | Ignore it |

#### Port Progression

| Level | Ship Capacity | Capabilities | Cost |
|-------|---------------|--------------|------|
| Outpost ⚓ | 2 ships | Docking, build Cutters | Wood + Steel |
| Port ⚓⚓ | 5 ships | + Repairs, build Sloops | More Wood + Steel |
| Stronghold 🏰 | 10 ships | + Upgrades, build all ships | Most Wood + Steel |

- **Any discovered island** can become a port (no restrictions)
- Any port can upgrade to Stronghold (even tiny islands)
- No upkeep cost (MVP)
- Building a port is immediate — no waiting

#### Defense Structures

| Structure | Effect | Cost |
|-----------|--------|------|
| Watchtower | Early warning, +3 hex visibility | Wood + Steel |
| Cannon Tower | Repels pirates | Wood + Steel |
| Fort | + Repairs ships, spawns patrol? | Wood + Steel |

---

### Map

#### Hex Grid
- **Size:** 50-60 hexes
- **6 directions** for natural movement/pathfinding

#### Hex Types

| Type | Visual | Notes |
|------|--------|-------|
| Ocean | 🌊 | Passable |
| Undiscovered Island | ▓ | Hidden under fog |
| Discovered Island | 🏝 | Can trade with (has locals) |
| Your Port | ⚓ | Can dock, unload, build (no trade — colonized) |
| Ship | ⛵ | Moving unit |
| Fog | ▓ | Unexplored |

#### Climate Zones (by latitude)

```
┌────────────────────────────────────────┐
│ ❄️  ARCTIC (top)                        │
│     Sparse islands, high value         │
│                                        │
│ 🌲 TEMPERATE (middle)                  │
│     Moderate islands, balanced         │
│     ⚓ HOME PORT spawns here           │
│                                        │
│ 🌴 TROPICAL (bottom)                   │
│     Dense islands, common goods        │
└────────────────────────────────────────┘
```

#### Map Generation

1. Fill with ocean hexes
2. Seed island clusters (random points)
3. Grow landmass blobs outward (organic shapes)
4. Assign climate by latitude
5. Assign richness (Poor / Moderate / Rich / Legendary)
6. Cover in fog
7. Place Home Port (Stronghold) on a temperate coastal hex

**Placement Rules:**
- Home port: always temperate, coastal, safe
- Guarantee 1-2 discoverable islands nearby (easy first trades)
- Rare/legendary islands spawn far, often arctic

---

### Fog of War

**Once revealed, stays revealed.**

| Element | Reveal Radius |
|---------|---------------|
| Ship (moving) | +1 hex around path |
| Port | +2 hex permanent |
| Watchtower | +3 hex permanent |

Only **Expeditions** push into fog. Trade runs follow known routes.

---

### Exploration

#### Expedition Flow

1. Commission expedition from port (costs Food + Grog)
2. Ship sails into fog, reveals +1 hex radius as it moves
3. Ship touches island → **Discovered!** → toast "Discovered [Island Name]"
4. Ship continues exploring
5. At 50% supplies → auto-return to nearest port
6. New trade route now available to discovered islands

#### Discovery Example

```
Before Expedition:
     ▓ ▓ ▓ ▓ ▓
    ▓ ▓ ▓ ▓ ▓
     ⚓ 🌊 🌊 ▓      ⚓ = Home Port
    🌊 🌊 🌊 ▓
     🌊 🌊 🌊 ▓

After Expedition:
     ▓ ▓ ▓ ▓ ▓
    🌊 🌊 🏝 🌊 ▓     🏝 = Discovered Island (can trade!)
     ⚓ 🌊 🌊 🌊 ▓
    🌊 🌊 🌊 🌊 ▓
     🌊 🌊 🌊 ▓ ▓
```

Now you can:
- Send trade ships to 🏝 (income)
- Or colonize 🏝 → becomes ⚓ (forward port, but no more trade income)

#### Supply Model

```
Full supplies ████████████ 100%
                          
Outbound →→→→→ ██████░░░░░░ 50% ← MUST turn back
                          
Return ←←←←←←← ░░░░░░░░░░░░ 0% ← arrives home empty
```

**Run cost = base Food/Grog + (crew level × distance)**

#### Circumnavigation (Scout)

When ship discovers land, can auto-scout:
- Ship hugs coastline
- Reveals full island shape, all coastal hexes
- Burns supplies until 50%, then returns
- Reveals: size, port sites, richness, special features

---

### Route Management

- Trade routes connect **Your Ports ↔ Discovered Islands**
- Ships auto-route to **nearest port** when returning
- Port placement = network optimization (closer port = faster trips = more income)
- Multiple ships on one island = faster collection but faster depletion
- Island yields regenerate slowly over time
- Depleted islands still produce, just lower yields

#### Route Depletion

| Ships on Route | Effect |
|----------------|--------|
| 1 ship | Sustainable, slow income |
| 2-3 ships | Faster income, gradual depletion |
| 4+ ships | Rapid depletion, diminishing returns |

Spread your fleet across many islands, or focus on Rich/Legendary ones that can handle the load.

---

### Pirates (TODO)

- Spawn from map edges
- Target rich, undefended routes
- Raid = dice roll vs defense
- Risk scales with player wealth

---

### Win/Lose (TODO)

- **Win:** Target wealth? Control X ports? Discover legendary island?
- **Lose:** Bankruptcy (no resources + no ships)

---

### MVP Scope

- [ ] Hex map generation with climate zones
- [ ] Fog of war + exploration
- [ ] Island discovery (ship touches island → discovered)
- [ ] Basic ship commissioning (Cutter only?)
- [ ] Trade route loop (Port ↔ Discovered Island)
- [ ] Resource collection + global stockpile
- [ ] Port building (colonize island, sacrifice trade)
- [ ] Ship health + repairs
- [ ] Time controls (pause, 1x, 2x, 4x)

### Stretch Goals

- All ship classes + upgrades
- Full port progression (Outpost → Port → Stronghold)
- Pirates + combat
- Watchtowers / defense structures
- Route depletion + regeneration
- Island scouting (circumnavigation)
- Natural harbors (rare, required for Stronghold)
- Win/lose conditions

---

### Tech Spec

#### Stack
- **Engine:** Kaplay.js
- **Language:** JavaScript
- **UI Layer:** React (for HUD, menus, panels)
- **Perspective:** Top-down 2D

#### Art Style
- Simple pixel art / flat colors
- Hex tiles: solid color fills (blue ocean, green/white/yellow land by climate)
- Ships: tiny pixel sprites, ~8x8 or 16x16
- Ports: simple icons, grow visually with upgrades
- UI: clean, minimal, pixel font optional
- No gradients, no shadows — just flat and readable

#### Architecture (Class-Based, Separation of Concerns)

```
src/
├── core/
│   ├── Game.js              # Main game loop, state machine
│   ├── Clock.js             # Time controls (pause, 1x, 2x, 4x)
│   └── EventBus.js          # Pub/sub for decoupled communication
│
├── map/
│   ├── HexGrid.js           # Hex math, coordinates, neighbors
│   ├── MapGenerator.js      # Procedural generation
│   ├── FogOfWar.js          # Visibility state
│   └── Tile.js              # Individual hex tile (ocean, land, port site)
│
├── entities/
│   ├── Ship.js              # Ship state, health, upgrades
│   ├── Port.js              # Port level, capacity, services
│   ├── Island.js            # Climate, richness, port sites
│   └── Pirate.js            # Enemy AI (future)
│
├── systems/
│   ├── NavigationSystem.js  # Pathfinding, movement
│   ├── TradeSystem.js       # Route management, resource conversion
│   ├── ExplorationSystem.js # Fog reveal, claiming
│   ├── EconomySystem.js     # Resource tracking, costs
│   └── CombatSystem.js      # Pirate encounters (future)
│
├── ui/ (React)
│   ├── HUD.js               # Resources, time controls
│   ├── ShipPanel.js         # Selected ship actions
│   ├── PortPanel.js         # Port management
│   ├── RouteList.js         # Active trade routes
│   └── ToastNotifications.js
│
└── utils/
    ├── HexUtils.js          # Hex coord conversions, distance
    ├── Random.js            # Seeded RNG for map gen
    └── Constants.js         # Game balance values
```

#### Key Patterns

| Pattern | Use |
|---------|-----|
| **Component classes** | Each entity owns its state + behavior |
| **Systems** | Cross-cutting logic (e.g., all movement in NavigationSystem) |
| **EventBus** | Decouple UI from game logic ("ship:claimed", "route:completed") |
| **State machines** | Ship states (docked, sailing, exploring, returning) |

#### Kaplay + React Integration

- Kaplay handles: rendering, sprites, game loop, input on canvas
- React handles: all UI panels, HUD, menus (overlaid on canvas)
- Communication via EventBus or shared state store

---

*Target: Playable prototype in ~2-3 weeks*