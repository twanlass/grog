// Fog of war state and logic
import { hexKey, hexNeighbors, hexDistance } from "./hex.js";
import { SHIPS } from "./sprites/ships.js";
import { PORTS } from "./sprites/ports.js";
import { SETTLEMENTS } from "./sprites/settlements.js";
import { TOWERS } from "./sprites/towers.js";

// Animation constants
const RING_DELAY = 0.06;      // Seconds between each ring reveal
const FADE_DURATION = 0.12;   // Seconds for each hex to fade in/out

// Create fog state with explored (permanent) and visible (dynamic) hex sets
export function createFogState() {
    return {
        exploredHexes: new Set(),  // Hexes ever seen (permanent)
        visibleHexes: new Set(),   // Hexes currently visible (recalculated)
        isDirty: true,             // Flag to trigger recalculation
        // Animation state
        revealingHexes: new Map(), // hexKey -> { startTime, ringDelay }
        shroudingHexes: new Map(), // hexKey -> { startTime, ringDelay }
    };
}

// Reveal a single hex (adds to explored set)
export function revealHex(fogState, q, r) {
    fogState.exploredHexes.add(hexKey(q, r));
}

// Reveal hex and all hexes within given radius
export function revealRadius(fogState, q, r, radius = 1) {
    revealHex(fogState, q, r);

    if (radius <= 0) return;

    // Use BFS to reveal all hexes within radius
    const visited = new Set([hexKey(q, r)]);
    let current = [{ q, r }];

    for (let ring = 1; ring <= radius; ring++) {
        const next = [];
        for (const hex of current) {
            for (const neighbor of hexNeighbors(hex.q, hex.r)) {
                const key = hexKey(neighbor.q, neighbor.r);
                if (!visited.has(key)) {
                    visited.add(key);
                    revealHex(fogState, neighbor.q, neighbor.r);
                    next.push(neighbor);
                }
            }
        }
        current = next;
    }
}

// Check if a hex has been explored (permanent)
export function isHexExplored(fogState, q, r) {
    return fogState.exploredHexes.has(hexKey(q, r));
}

// Check if a hex is currently visible (dynamic)
export function isHexVisible(fogState, q, r) {
    return fogState.visibleHexes.has(hexKey(q, r));
}

// Legacy alias for compatibility - checks if explored
export function isHexRevealed(fogState, q, r) {
    return fogState.exploredHexes.has(hexKey(q, r));
}

// Mark fog as needing recalculation
export function markVisibilityDirty(fogState) {
    fogState.isDirty = true;
}

// Check if visibility needs recalculation
export function isVisibilityDirty(fogState) {
    return fogState.isDirty;
}

// Helper: Add hexes within radius to a target set using BFS
function addRadiusToSet(targetSet, q, r, radius) {
    targetSet.add(hexKey(q, r));
    if (radius <= 0) return;

    const visited = new Set([hexKey(q, r)]);
    let current = [{ q, r }];

    for (let ring = 1; ring <= radius; ring++) {
        const next = [];
        for (const hex of current) {
            for (const neighbor of hexNeighbors(hex.q, hex.r)) {
                const key = hexKey(neighbor.q, neighbor.r);
                if (!visited.has(key)) {
                    visited.add(key);
                    targetSet.add(key);
                    next.push(neighbor);
                }
            }
        }
        current = next;
    }
}

// Recalculate all currently visible hexes from all vision sources
export function recalculateVisibility(fogState, gameState, currentTime = 0) {
    // Store previous visibility to detect changes
    const previousVisible = new Set(fogState.visibleHexes);

    fogState.visibleHexes.clear();

    // Collect all vision sources for animation calculations
    const visionSources = [];

    // Player ships (pirates don't grant vision)
    for (const ship of gameState.ships) {
        if (ship.type === 'pirate') continue;
        const sightDistance = SHIPS[ship.type].sightDistance;
        addRadiusToSet(fogState.visibleHexes, ship.q, ship.r, sightDistance);
        visionSources.push({ q: ship.q, r: ship.r });
    }

    // Completed ports
    for (const port of gameState.ports) {
        if (port.construction) continue;  // Under construction
        const sightDistance = PORTS[port.type].sightDistance;
        addRadiusToSet(fogState.visibleHexes, port.q, port.r, sightDistance);
        visionSources.push({ q: port.q, r: port.r });
    }

    // Completed settlements
    for (const settlement of gameState.settlements) {
        if (settlement.construction) continue;
        const sightDistance = SETTLEMENTS.settlement.sightDistance;
        addRadiusToSet(fogState.visibleHexes, settlement.q, settlement.r, sightDistance);
        visionSources.push({ q: settlement.q, r: settlement.r });
    }

    // Completed towers
    for (const tower of gameState.towers) {
        if (tower.construction) continue;
        const sightDistance = TOWERS[tower.type].sightDistance;
        addRadiusToSet(fogState.visibleHexes, tower.q, tower.r, sightDistance);
        visionSources.push({ q: tower.q, r: tower.r });
    }

    // Determine newly visible and lost visibility hexes
    const newlyVisible = new Set();
    const lostVisibility = new Set();

    for (const key of fogState.visibleHexes) {
        if (!previousVisible.has(key)) {
            newlyVisible.add(key);
        }
    }

    for (const key of previousVisible) {
        if (!fogState.visibleHexes.has(key)) {
            lostVisibility.add(key);
        }
    }

    // Start animations for changed hexes
    if (currentTime > 0) {
        if (newlyVisible.size > 0 && visionSources.length > 0) {
            startRevealAnimation(fogState, newlyVisible, visionSources, currentTime);
        }
        if (lostVisibility.size > 0) {
            startShroudAnimation(fogState, lostVisibility, fogState.visibleHexes, currentTime);
        }
    }

    // Mark all visible hexes as explored (permanent)
    for (const key of fogState.visibleHexes) {
        fogState.exploredHexes.add(key);
    }

    fogState.isDirty = false;
}

// Initialize fog with starting visibility around ships and ports
export function initializeFog(fogState, gameState) {
    // Use recalculateVisibility to set up initial state
    recalculateVisibility(fogState, gameState);
}

// Parse hex key back to coordinates
function parseHexKey(key) {
    const [q, r] = key.split(',').map(Number);
    return { q, r };
}

// Start reveal animation for newly visible hexes
// visionSources: array of { q, r } positions that are granting vision
function startRevealAnimation(fogState, newlyVisibleHexes, visionSources, currentTime) {
    for (const key of newlyVisibleHexes) {
        // If already revealing, skip
        if (fogState.revealingHexes.has(key)) continue;

        // If shrouding, cancel that animation
        fogState.shroudingHexes.delete(key);

        // Track if this hex was previously explored (for rendering correct fog type)
        const wasExplored = fogState.exploredHexes.has(key);

        const hex = parseHexKey(key);

        // Find minimum distance to any vision source
        let minDist = Infinity;
        for (const source of visionSources) {
            const dist = hexDistance(hex.q, hex.r, source.q, source.r);
            if (dist < minDist) minDist = dist;
        }

        // Ring delay based on distance from nearest source
        const ringDelay = minDist * RING_DELAY;

        fogState.revealingHexes.set(key, {
            startTime: currentTime,
            ringDelay: ringDelay,
            wasExplored: wasExplored,
        });
    }
}

// Start shroud animation for hexes that lost visibility
// remainingVisibleHexes: Set of hex keys still visible (to calculate distance from edge)
function startShroudAnimation(fogState, lostVisibilityHexes, remainingVisibleHexes, currentTime) {
    for (const key of lostVisibilityHexes) {
        // If already shrouding, skip
        if (fogState.shroudingHexes.has(key)) continue;

        // If revealing, cancel that animation
        fogState.revealingHexes.delete(key);

        const hex = parseHexKey(key);

        // Find minimum distance to any still-visible hex
        // Closer hexes shroud later (ripple inward effect)
        let minDist = 0;
        if (remainingVisibleHexes.size > 0) {
            minDist = Infinity;
            for (const visibleKey of remainingVisibleHexes) {
                const visible = parseHexKey(visibleKey);
                const dist = hexDistance(hex.q, hex.r, visible.q, visible.r);
                if (dist < minDist) minDist = dist;
            }
        }

        // Ring delay: closer to remaining vision = later shroud (reverse ripple)
        // Use maxDist - minDist to invert, or just use minDist directly for edge-first
        const ringDelay = minDist * RING_DELAY;

        fogState.shroudingHexes.set(key, {
            startTime: currentTime,
            ringDelay: ringDelay,
        });
    }
}

// Update fog animations (call each frame)
export function updateFogAnimations(fogState, currentTime) {
    // Clean up completed reveal animations
    for (const [key, anim] of fogState.revealingHexes) {
        const elapsed = currentTime - anim.startTime - anim.ringDelay;
        if (elapsed >= FADE_DURATION) {
            fogState.revealingHexes.delete(key);
        }
    }

    // Clean up completed shroud animations
    for (const [key, anim] of fogState.shroudingHexes) {
        const elapsed = currentTime - anim.startTime - anim.ringDelay;
        if (elapsed >= FADE_DURATION) {
            fogState.shroudingHexes.delete(key);
        }
    }
}

// Get fog opacity for a hex (0 = fully visible, 1 = fully fogged)
// Returns { shroudOpacity, unexploredOpacity } for rendering
export function getHexFogOpacity(fogState, q, r, currentTime) {
    const key = hexKey(q, r);
    const isVisible = fogState.visibleHexes.has(key);
    const isExplored = fogState.exploredHexes.has(key);

    // Check for active animations
    const revealAnim = fogState.revealingHexes.get(key);
    const shroudAnim = fogState.shroudingHexes.get(key);

    // Currently visible hex
    if (isVisible) {
        if (revealAnim) {
            // Animating from fog to visible
            const elapsed = currentTime - revealAnim.startTime - revealAnim.ringDelay;
            if (elapsed < 0) {
                // Hasn't started yet (waiting for ring delay)
                // Show appropriate fog based on whether it was previously explored
                if (revealAnim.wasExplored) {
                    return { shroudOpacity: 0.5, unexploredOpacity: 0 };
                } else {
                    return { shroudOpacity: 0, unexploredOpacity: 0.92 };
                }
            }
            const progress = Math.min(1, elapsed / FADE_DURATION);
            // Fade from fog to visible
            if (revealAnim.wasExplored) {
                // Fade from shroud (0.5) to visible (0)
                return { shroudOpacity: 0.5 * (1 - progress), unexploredOpacity: 0 };
            } else {
                // Fade from unexplored fog (0.92) to visible (0)
                return { shroudOpacity: 0, unexploredOpacity: 0.92 * (1 - progress) };
            }
        }
        // Fully visible, no animation
        return { shroudOpacity: 0, unexploredOpacity: 0 };
    }

    // Explored but not visible (shrouded)
    if (isExplored) {
        if (shroudAnim) {
            // Animating from visible to shroud
            const elapsed = currentTime - shroudAnim.startTime - shroudAnim.ringDelay;
            if (elapsed < 0) {
                // Hasn't started yet
                return { shroudOpacity: 0, unexploredOpacity: 0 };
            }
            const progress = Math.min(1, elapsed / FADE_DURATION);
            // Fade from visible (0) to shroud (0.5)
            return { shroudOpacity: 0.5 * progress, unexploredOpacity: 0 };
        }
        // Fully shrouded
        return { shroudOpacity: 0.5, unexploredOpacity: 0 };
    }

    // Unexplored (full fog)
    return { shroudOpacity: 0, unexploredOpacity: 0.92 };
}
