// Island templates for fair starting islands in versus mode
// Each template guarantees exactly 4 inland hexes (settlement spots)

import { hexNeighbors, hexKey } from "./hex.js";

/**
 * Starter island templates.
 * Each template is an array of relative hex offsets from the island center.
 * Templates are designed so that exactly 4 hexes end up as inland (no water neighbors)
 * when placed and surrounded by water.
 */
export const STARTER_ISLAND_TEMPLATES = [
    {
        name: "compact",
        // Compact cluster: 4 inner hexes surrounded by coastal ring
        hexes: [
            // Inner hexes (will be inland - all neighbors are land)
            { q: 0, r: 0 },
            { q: 1, r: -1 },
            { q: 0, r: -1 },
            { q: -1, r: 1 },
            // Outer ring (will be coastal - have water neighbors)
            { q: 1, r: 0 },
            { q: 2, r: -1 },
            { q: 2, r: -2 },
            { q: 1, r: -2 },
            { q: 0, r: -2 },
            { q: -1, r: -1 },
            { q: -1, r: 0 },
            { q: -2, r: 1 },
            { q: -2, r: 2 },
            { q: -1, r: 2 },
            { q: 0, r: 1 },
        ],
    },
    {
        name: "crescent",
        // Crescent shape: 4 inland hexes in a curved pattern
        hexes: [
            // Inner hexes (inland)
            { q: 0, r: 0 },
            { q: 1, r: 0 },
            { q: 2, r: -1 },
            { q: 2, r: 0 },
            // Outer hexes (coastal)
            { q: -1, r: 0 },
            { q: -1, r: 1 },
            { q: 0, r: 1 },
            { q: 1, r: 1 },
            { q: 2, r: 1 },
            { q: 3, r: 0 },
            { q: 3, r: -1 },
            { q: 3, r: -2 },
            { q: 2, r: -2 },
            { q: 1, r: -1 },
            { q: 0, r: -1 },
        ],
    },
    {
        name: "chunky",
        // Wider/blockier shape: 4 inland hexes in a 2x2-ish pattern
        hexes: [
            // Inner hexes (inland)
            { q: 0, r: 0 },
            { q: 1, r: 0 },
            { q: 0, r: 1 },
            { q: 1, r: -1 },
            // Outer ring (coastal)
            { q: -1, r: 0 },
            { q: -1, r: 1 },
            { q: -1, r: 2 },
            { q: 0, r: 2 },
            { q: 1, r: 1 },
            { q: 2, r: 0 },
            { q: 2, r: -1 },
            { q: 2, r: -2 },
            { q: 1, r: -2 },
            { q: 0, r: -1 },
        ],
    },
];

/**
 * Select random templates for each faction (allows same template to be used multiple times)
 * @param {number} count - Number of templates to select
 * @param {function} random - Seeded random function
 * @returns {Array} Array of selected templates
 */
export function selectRandomTemplates(count, random) {
    const selected = [];
    for (let i = 0; i < count; i++) {
        const idx = Math.floor(random() * STARTER_ISLAND_TEMPLATES.length);
        selected.push(STARTER_ISLAND_TEMPLATES[idx]);
    }
    return selected;
}

/**
 * Count how many inland hexes a template will produce when placed.
 * Inland = land hex where all 6 neighbors are also land.
 * @param {Object} template - Template to validate
 * @returns {number} Count of inland hexes
 */
export function countInlandHexes(template) {
    const hexSet = new Set(template.hexes.map(h => hexKey(h.q, h.r)));
    let inlandCount = 0;

    for (const hex of template.hexes) {
        const neighbors = hexNeighbors(hex.q, hex.r);
        const allNeighborsAreLand = neighbors.every(n => hexSet.has(hexKey(n.q, n.r)));
        if (allNeighborsAreLand) {
            inlandCount++;
        }
    }

    return inlandCount;
}

/**
 * Validate all templates have exactly 4 inland hexes
 * @returns {boolean} True if all templates are valid
 */
export function validateAllTemplates() {
    for (const template of STARTER_ISLAND_TEMPLATES) {
        const inlandCount = countInlandHexes(template);
        if (inlandCount !== 4) {
            console.warn(`Template "${template.name}" has ${inlandCount} inland hexes, expected 4`);
            return false;
        }
    }
    return true;
}
