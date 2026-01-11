# AI Engagement Range vs Sight Distance

## Current State

There are two separate systems for enemy detection that don't interact:

### 1. `engagementRange` (AI Strategy Config)

**Location:** `game/src/systems/aiPlayer.js`

Used exclusively by AI player ship behavior (versus mode). The AI's `findNearestEnemy()` searches ALL enemies regardless of distance, then checks `nearestEnemy.dist <= engagementRange` to decide whether to engage.

**Values by strategy:**
| Strategy | engagementRange |
|----------|-----------------|
| Aggressive | 10 hexes |
| Defensive | 6 hexes |
| Economic | 5 hexes |

**Related settings:**
- `pursuitPersistence`: 0.4-0.9 (chance to continue pursuit each decision cycle)
- No hard max chase distance - disengages when target exceeds `engagementRange`

### 2. `sightDistance` (Ship Type Property)

**Location:** `game/src/sprites/ships.js`

Used for:
- **Player ship** patrol auto-attack (`combat.js:handlePatrolAutoAttack()`)
- **Pirate** AI detection (`shipMovement.js:updatePirateAI()`)
- **NOT used by AI player ships**

**Values by ship type:**
| Ship | sightDistance |
|------|---------------|
| Cutter | 1 hex |
| Schooner | 1 hex |
| Brigantine | 2 hexes |
| Galleon | 3 hexes |

### 3. Pirate-Specific Settings

**Location:** `game/src/sprites/ships.js:203-204`

Pirates have additional chase limits:
- `enemySightDistance`: Detection range (uses ship's sightDistance)
- `maxChaseDistance: 15` hexes - give up after 15 hex moves
- `retreatCooldown: 5` seconds - wait before re-engaging

## The Problem

AI players completely ignore the ship's `sightDistance` - they use their strategy's `engagementRange` instead.

**Example inconsistency:**
- A Galleon with `sightDistance: 3` controlled by AI with aggressive strategy will engage from **10 hexes**
- The same Galleon controlled by the player on patrol will only auto-attack from **3 hexes**

AI ships effectively have much better "vision" than their ship type would suggest.

## Potential Fixes

### Option A: Use ship's sightDistance for AI
Make AI ships respect their ship type's `sightDistance` instead of (or in addition to) the strategy's `engagementRange`.

```javascript
// In updateShipCommands()
const shipSightDistance = SHIPS[ship.type].sightDistance;
const effectiveRange = Math.min(engagementRange, shipSightDistance);
```

### Option B: Add max chase distance to AI
Like pirates, add a `maxChaseDistance` counter so AI ships don't chase indefinitely within engagement range.

### Option C: Make engagementRange a multiplier
Use `engagementRange` as a multiplier on the ship's base `sightDistance`:
```javascript
const effectiveRange = SHIPS[ship.type].sightDistance * engagementRange;
```

## Files to Modify

| File | Purpose |
|------|---------|
| `game/src/systems/aiPlayer.js` | AI ship engagement logic (~line 1484, 1512) |
| `game/src/sprites/ships.js` | Ship sightDistance definitions |

## Related Code References

- `aiPlayer.js:1484` - `engagementRange` used for AI engagement decision
- `aiPlayer.js:1512` - Distance check: `nearestEnemy.dist <= engagementRange`
- `aiPlayer.js:1624` - `findNearestEnemy()` - searches all enemies regardless of range
- `combat.js:423` - Player patrol uses `SHIPS[ship.type].sightDistance`
- `shipMovement.js:458` - Pirate AI uses ship's `enemySightDistance`
