// Island templates for fair starting islands in versus mode
// Each template guarantees at least 6 inland hexes (settlement spots)

import { hexNeighbors, hexKey } from "./hex.js";

const MIN_INLAND_HEXES = 6;

/**
 * Starter island templates.
 * Each template is an array of relative hex offsets from the island center.
 * Templates are designed so that at least 6 hexes end up as inland (no water neighbors)
 * when placed and surrounded by water. Inland hexes become settlement spots.
 */
export const STARTER_ISLAND_TEMPLATES = [
    {
        name: "compact",
        // Hexagonal blob (radius 2): 7 inland hexes (center + first ring)
        hexes: [
            // Center + ring 1 (all inland)
            { q: 0, r: 0 },
            { q: 1, r: 0 },
            { q: 1, r: -1 },
            { q: 0, r: -1 },
            { q: -1, r: 0 },
            { q: -1, r: 1 },
            { q: 0, r: 1 },
            // Ring 2 (coastal)
            { q: 2, r: 0 },
            { q: 2, r: -1 },
            { q: 2, r: -2 },
            { q: 1, r: -2 },
            { q: 0, r: -2 },
            { q: -1, r: -1 },
            { q: -2, r: 0 },
            { q: -2, r: 1 },
            { q: -2, r: 2 },
            { q: -1, r: 2 },
            { q: 0, r: 2 },
            { q: 1, r: 1 },
        ],
    },
    {
        name: "crescent",
        // Elongated shape: 6 inland hexes in a stretched curve
        hexes: [
            // Inner hexes (inland)
            { q: 0, r: 0 },
            { q: 0, r: 1 },
            { q: 1, r: -1 },
            { q: 1, r: 0 },
            { q: 2, r: -1 },
            { q: 2, r: -2 },
            // Outer ring (coastal)
            { q: 0, r: -1 },
            { q: -1, r: 0 },
            { q: -1, r: 1 },
            { q: -1, r: 2 },
            { q: 0, r: 2 },
            { q: 1, r: 1 },
            { q: 1, r: -2 },
            { q: 2, r: 0 },
            { q: 3, r: -1 },
            { q: 3, r: -2 },
            { q: 3, r: -3 },
            { q: 2, r: -3 },
        ],
    },
    {
        name: "chunky",
        // Clustered shape: 6 inland hexes spread across a wider body
        hexes: [
            // Inner hexes (inland)
            { q: 0, r: 0 },
            { q: 1, r: -1 },
            { q: 1, r: 0 },
            { q: 2, r: -1 },
            { q: -1, r: 1 },
            { q: 0, r: 1 },
            // Outer ring (coastal)
            { q: 0, r: -1 },
            { q: -1, r: 0 },
            { q: 1, r: -2 },
            { q: 2, r: -2 },
            { q: 2, r: 0 },
            { q: 1, r: 1 },
            { q: 3, r: -1 },
            { q: 3, r: -2 },
            { q: -2, r: 1 },
            { q: -2, r: 2 },
            { q: -1, r: 2 },
            { q: 0, r: 2 },
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
 * Validate all templates have at least MIN_INLAND_HEXES inland hexes
 * @returns {boolean} True if all templates are valid
 */
export function validateAllTemplates() {
    for (const template of STARTER_ISLAND_TEMPLATES) {
        const inlandCount = countInlandHexes(template);
        if (inlandCount < MIN_INLAND_HEXES) {
            console.warn(`Template "${template.name}" has ${inlandCount} inland hexes, expected at least ${MIN_INLAND_HEXES}`);
            return false;
        }
    }
    return true;
}
