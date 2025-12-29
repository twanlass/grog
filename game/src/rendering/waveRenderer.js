// Wave effect rendering - animated waves around island shorelines
import { hexCorners, hexNeighbors, hexKey, hexToPixel, HEX_SIZE } from "../hex.js";

// Wave constants
const ISLAND_WAVE_RINGS = 2;        // Number of wave rings
const ISLAND_WAVE_MAX_DIST = 20;    // Max distance from shore (pixels, before zoom)
const ISLAND_WAVE_SPEED = 0.15;     // How fast waves travel inward (cycles per second)
const ISLAND_WAVE_THICKNESS = 12;   // Thickness of each wave band (pixels, before zoom)
const ISLAND_WAVE_OPACITY = 0.3;    // Max opacity of waves

/**
 * Compute islands by flood-filling connected land tiles
 * @param {object} map - The game map with tiles
 * @returns {Array} Array of island objects with outline edge segments
 */
export function computeIslands(map) {
    const visited = new Set();
    const islands = [];

    for (const tile of map.tiles.values()) {
        if (tile.type !== 'land') continue;
        const key = hexKey(tile.q, tile.r);
        if (visited.has(key)) continue;

        // Flood-fill to find all connected land tiles
        const islandTiles = new Set();
        const stack = [tile];

        while (stack.length > 0) {
            const current = stack.pop();
            const currentKey = hexKey(current.q, current.r);
            if (visited.has(currentKey)) continue;
            visited.add(currentKey);
            islandTiles.add(currentKey);

            // Check all neighbors for more land
            for (const neighbor of hexNeighbors(current.q, current.r)) {
                const neighborKey = hexKey(neighbor.q, neighbor.r);
                const neighborTile = map.tiles.get(neighborKey);
                if (neighborTile && neighborTile.type === 'land' && !visited.has(neighborKey)) {
                    stack.push(neighborTile);
                }
            }
        }

        // Compute outline edges and center
        const outline = computeIslandOutline(map, islandTiles);
        const center = computeIslandCenter(map, islandTiles);

        islands.push({ tiles: islandTiles, outline, center });
    }

    return islands;
}

/**
 * Compute the outline of an island as an ordered list of vertices
 * Returns array of vertex objects with position and outward normal
 */
function computeIslandOutline(map, islandTiles) {
    // Collect all boundary edges as start->end pairs with a unique key
    const edgeMap = new Map();  // key -> { start, end }

    for (const key of islandTiles) {
        const [q, r] = key.split(',').map(Number);
        const pos = hexToPixel(q, r);
        const corners = hexCorners(pos.x, pos.y, HEX_SIZE);
        const neighbors = hexNeighbors(q, r);

        for (let i = 0; i < 6; i++) {
            const neighborKey = hexKey(neighbors[i].q, neighbors[i].r);
            const neighborTile = map.tiles.get(neighborKey);
            // Only add wave edge if neighbor is water (not if it's off the map edge)
            if (!islandTiles.has(neighborKey) && neighborTile && neighborTile.type === 'water') {
                const c1Idx = (6 - i) % 6;
                const c2Idx = (c1Idx + 1) % 6;
                const start = corners[c1Idx];
                const end = corners[c2Idx];

                // Create a unique key for this edge (round to avoid floating point issues)
                const edgeKey = `${Math.round(start.x)},${Math.round(start.y)}-${Math.round(end.x)},${Math.round(end.y)}`;
                edgeMap.set(edgeKey, { start: { x: start.x, y: start.y }, end: { x: end.x, y: end.y } });
            }
        }
    }

    if (edgeMap.size === 0) return [];

    // Build adjacency: for each vertex, which edges touch it?
    const vertexToEdges = new Map();  // "x,y" -> [edgeKeys]

    for (const [edgeKey, edge] of edgeMap) {
        const startKey = `${Math.round(edge.start.x)},${Math.round(edge.start.y)}`;
        const endKey = `${Math.round(edge.end.x)},${Math.round(edge.end.y)}`;

        if (!vertexToEdges.has(startKey)) vertexToEdges.set(startKey, []);
        if (!vertexToEdges.has(endKey)) vertexToEdges.set(endKey, []);

        vertexToEdges.get(startKey).push({ edgeKey, isStart: true });
        vertexToEdges.get(endKey).push({ edgeKey, isStart: false });
    }

    // Walk the perimeter to create ordered vertex list
    const orderedVertices = [];
    const usedEdges = new Set();

    // Start with any edge
    const firstEdgeKey = edgeMap.keys().next().value;
    let currentEdge = edgeMap.get(firstEdgeKey);
    let currentVertex = currentEdge.start;
    usedEdges.add(firstEdgeKey);

    // Walk until we return to start
    const maxIterations = edgeMap.size + 10;
    let iterations = 0;

    while (iterations < maxIterations) {
        iterations++;
        orderedVertices.push({ x: currentVertex.x, y: currentVertex.y });

        // Find next vertex (the other end of current edge)
        const nextVertex = (Math.abs(currentVertex.x - currentEdge.start.x) < 0.1 &&
                          Math.abs(currentVertex.y - currentEdge.start.y) < 0.1)
            ? currentEdge.end : currentEdge.start;

        // Find the next edge from nextVertex that we haven't used
        const nextVertexKey = `${Math.round(nextVertex.x)},${Math.round(nextVertex.y)}`;
        const candidateEdges = vertexToEdges.get(nextVertexKey) || [];

        let foundNext = false;
        for (const candidate of candidateEdges) {
            if (!usedEdges.has(candidate.edgeKey)) {
                usedEdges.add(candidate.edgeKey);
                currentEdge = edgeMap.get(candidate.edgeKey);
                currentVertex = nextVertex;
                foundNext = true;
                break;
            }
        }

        if (!foundNext) break;  // Completed the loop or hit a dead end
    }

    // Now compute outward normals at each vertex (average of adjacent edge normals)
    const n = orderedVertices.length;
    if (n < 3) return [];

    for (let i = 0; i < n; i++) {
        const prev = orderedVertices[(i - 1 + n) % n];
        const curr = orderedVertices[i];
        const next = orderedVertices[(i + 1) % n];

        // Edge before this vertex
        const dx1 = curr.x - prev.x;
        const dy1 = curr.y - prev.y;
        const len1 = Math.sqrt(dx1 * dx1 + dy1 * dy1) || 1;
        const n1x = -dy1 / len1;
        const n1y = dx1 / len1;

        // Edge after this vertex
        const dx2 = next.x - curr.x;
        const dy2 = next.y - curr.y;
        const len2 = Math.sqrt(dx2 * dx2 + dy2 * dy2) || 1;
        const n2x = -dy2 / len2;
        const n2y = dx2 / len2;

        // Average normal (negated to point outward toward ocean)
        let nx = -(n1x + n2x) / 2;
        let ny = -(n1y + n2y) / 2;
        const nlen = Math.sqrt(nx * nx + ny * ny) || 1;
        nx /= nlen;
        ny /= nlen;

        curr.nx = nx;
        curr.ny = ny;
    }

    return orderedVertices;
}

/**
 * Compute the center point of an island (average of all tile positions)
 */
function computeIslandCenter(map, islandTiles) {
    let sumX = 0, sumY = 0, count = 0;

    for (const key of islandTiles) {
        const [q, r] = key.split(',').map(Number);
        const pos = hexToPixel(q, r);
        sumX += pos.x;
        sumY += pos.y;
        count++;
    }

    return { x: sumX / count, y: sumY / count };
}

/**
 * Draw waves that roll inward toward islands and fade out
 * @param {object} ctx - Render context
 * @param {Array} islands - Pre-computed island data from computeIslands()
 * @param {number} waveTime - Animation time
 */
export function drawIslandWaves(ctx, islands, waveTime) {
    const { k, zoom, cameraX, cameraY, halfWidth, halfHeight, screenWidth, screenHeight } = ctx;

    // Only draw when zoomed in enough
    if (zoom < 0.3) return;

    const waveColor = k.rgb(200, 220, 255);  // Light blue-white

    for (const island of islands) {
        // Skip islands with no valid outline
        if (island.outline.length < 3) continue;

        // Quick visibility check using island center
        const centerScreenX = (island.center.x - cameraX) * zoom + halfWidth;
        const centerScreenY = (island.center.y - cameraY) * zoom + halfHeight;

        // Rough culling - skip islands far off-screen
        const cullMargin = 500;
        if (centerScreenX < -cullMargin || centerScreenX > screenWidth + cullMargin ||
            centerScreenY < -cullMargin || centerScreenY > screenHeight + cullMargin) {
            continue;
        }

        // Phase offset based on island center for variation between islands
        const islandPhase = (island.center.x * 0.01 + island.center.y * 0.01) % 1;

        // Draw multiple wave rings, each at different points in the cycle
        for (let ring = 0; ring < ISLAND_WAVE_RINGS; ring++) {
            // Stagger each ring's phase so they don't all hit shore at once
            const ringOffset = ring / ISLAND_WAVE_RINGS;

            // Progress goes from 0 (far out) to 1 (at shore), then loops
            const progress = (waveTime * ISLAND_WAVE_SPEED + islandPhase + ringOffset) % 1;

            // Distance from shore: starts at max, decreases to 0
            const distFromShore = ISLAND_WAVE_MAX_DIST * (1 - progress);
            const baseOffset = distFromShore * zoom;

            // Opacity: fade in at start, fade out at end (smooth bell curve)
            // sin(progress * PI) goes 0 -> 1 -> 0
            const opacity = ISLAND_WAVE_OPACITY * Math.sin(progress * Math.PI);

            // Skip nearly invisible waves
            if (opacity < 0.03) continue;

            const lineWidth = Math.max(2, ISLAND_WAVE_THICKNESS * zoom);

            // Build offset points
            const pts = [];
            for (const vertex of island.outline) {
                const screenX = (vertex.x - cameraX) * zoom + halfWidth;
                const screenY = (vertex.y - cameraY) * zoom + halfHeight;

                // Offset along the vertex's pre-computed normal (outward into ocean)
                const offsetX = screenX + vertex.nx * baseOffset;
                const offsetY = screenY + vertex.ny * baseOffset;
                pts.push({ x: offsetX, y: offsetY });
            }

            // Draw individual line segments (avoids polygon corner overlap issues)
            const n = pts.length;
            for (let i = 0; i < n; i++) {
                const p1 = pts[i];
                const p2 = pts[(i + 1) % n];

                k.drawLine({
                    p1: k.vec2(p1.x, p1.y),
                    p2: k.vec2(p2.x, p2.y),
                    width: lineWidth,
                    color: waveColor,
                    opacity: opacity,
                    cap: "round",
                });
            }
        }
    }
}
