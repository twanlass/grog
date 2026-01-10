// Hex grid utilities using axial coordinates (q, r)
// Uses flat-top hexagons

export const HEX_SIZE = 32; // Radius of hex (center to corner)

// Hex dimensions derived from size
export const HEX_WIDTH = HEX_SIZE * 2;
export const HEX_HEIGHT = Math.sqrt(3) * HEX_SIZE;

// Convert axial hex coordinates to pixel position
export function hexToPixel(q, r) {
    const x = HEX_SIZE * (3 / 2 * q);
    const y = HEX_SIZE * (Math.sqrt(3) / 2 * q + Math.sqrt(3) * r);
    return { x, y };
}

// Convert pixel position to axial hex coordinates
export function pixelToHex(x, y) {
    const q = (2 / 3 * x) / HEX_SIZE;
    const r = (-1 / 3 * x + Math.sqrt(3) / 3 * y) / HEX_SIZE;
    return hexRound(q, r);
}

// Round fractional hex coordinates to nearest hex
export function hexRound(q, r) {
    const s = -q - r;

    let rq = Math.round(q);
    let rr = Math.round(r);
    let rs = Math.round(s);

    const qDiff = Math.abs(rq - q);
    const rDiff = Math.abs(rr - r);
    const sDiff = Math.abs(rs - s);

    if (qDiff > rDiff && qDiff > sDiff) {
        rq = -rr - rs;
    } else if (rDiff > sDiff) {
        rr = -rq - rs;
    }

    return { q: rq, r: rr };
}

// Get distance between two hexes
export function hexDistance(q1, r1, q2, r2) {
    return (Math.abs(q1 - q2) + Math.abs(q1 + r1 - q2 - r2) + Math.abs(r1 - r2)) / 2;
}

// Get the 6 neighboring hex coordinates
export function hexNeighbors(q, r) {
    const directions = [
        { q: 1, r: 0 },   // East
        { q: 1, r: -1 },  // Northeast
        { q: 0, r: -1 },  // Northwest
        { q: -1, r: 0 },  // West
        { q: -1, r: 1 },  // Southwest
        { q: 0, r: 1 },   // Southeast
    ];

    return directions.map(d => ({ q: q + d.q, r: r + d.r }));
}

// Generate corner points for drawing a flat-top hex
export function hexCorners(centerX, centerY, size = HEX_SIZE) {
    const corners = [];
    for (let i = 0; i < 6; i++) {
        const angle = (Math.PI / 180) * (60 * i);
        corners.push({
            x: centerX + size * Math.cos(angle),
            y: centerY + size * Math.sin(angle),
        });
    }
    return corners;
}

// Create a hex key for use in maps/sets
export function hexKey(q, r) {
    return `${q},${r}`;
}

// Parse a hex key back to coordinates
export function parseHexKey(key) {
    const [q, r] = key.split(",").map(Number);
    return { q, r };
}

// Get all hexes at exactly 'radius' distance from center (forms a ring)
export function getHexRing(centerQ, centerR, radius) {
    if (radius === 0) return [{ q: centerQ, r: centerR }];
    const results = [];
    // Start at the hex directly east of center at distance 'radius'
    let q = centerQ + radius;
    let r = centerR;
    // Walk around the ring in 6 directions
    const directions = [
        { q: 0, r: -1 },   // NW
        { q: -1, r: 0 },   // W
        { q: -1, r: 1 },   // SW
        { q: 0, r: 1 },    // SE
        { q: 1, r: 0 },    // E
        { q: 1, r: -1 },   // NE
    ];
    for (const dir of directions) {
        for (let i = 0; i < radius; i++) {
            results.push({ q, r });
            q += dir.q;
            r += dir.r;
        }
    }
    return results;
}
