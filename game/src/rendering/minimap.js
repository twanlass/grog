// Minimap rendering for fog of war visualization
import { hexToPixel, hexKey, parseHexKey } from "../hex.js";
import { TILE_TYPES, CLIMATE_ZONES } from "../mapGenerator.js";

// Minimap dimensions
const MINIMAP_DIAMETER = 150;
const MINIMAP_MARGIN_RIGHT = 15;
const MINIMAP_MARGIN_BOTTOM = 80;
const MINIMAP_BORDER_WIDTH = 2;
const MINIMAP_PADDING = 8;

// Minimap colors
const COLORS = {
    // Fog states
    explored: { r: 40, g: 50, b: 60 },

    // Terrain (visible)
    deepOcean: { r: 25, g: 70, b: 130 },
    shallow: { r: 50, g: 110, b: 170 },
    land: { r: 90, g: 130, b: 80 },
    landArctic: { r: 200, g: 210, b: 220 },
    landTropical: { r: 180, g: 160, b: 100 },

    // UI
    background: { r: 0, g: 0, b: 0 },
    border: { r: 60, g: 70, b: 80 },
    viewport: { r: 200, g: 60, b: 60 },
};

/**
 * Pre-calculate minimap state at scene initialization
 * Caches tile positions for efficient per-frame rendering
 */
export function createMinimapState(map) {
    // Calculate world bounds from all tiles
    let minX = Infinity, maxX = -Infinity;
    let minY = Infinity, maxY = -Infinity;

    for (const tile of map.tiles.values()) {
        const pos = hexToPixel(tile.q, tile.r);
        minX = Math.min(minX, pos.x);
        maxX = Math.max(maxX, pos.x);
        minY = Math.min(minY, pos.y);
        maxY = Math.max(maxY, pos.y);
    }

    const worldWidth = maxX - minX;
    const worldHeight = maxY - minY;

    // Calculate scale to fit within circle (with padding)
    const effectiveDiameter = MINIMAP_DIAMETER - MINIMAP_PADDING * 2;

    // Pre-calculate normalized positions for each tile
    const tileCache = new Map();

    for (const tile of map.tiles.values()) {
        const worldPos = hexToPixel(tile.q, tile.r);

        // Normalized position (0-1) within world bounds
        const normX = (worldPos.x - minX) / worldWidth;
        const normY = (worldPos.y - minY) / worldHeight;

        tileCache.set(hexKey(tile.q, tile.r), {
            normX,
            normY,
            tile,
        });
    }

    // Calculate tile size to ensure overlap (no gaps)
    const tilesAcross = Math.max(map.width, map.height);
    const tileSize = Math.max(3, (effectiveDiameter / tilesAcross) * 1.6);

    return {
        diameter: MINIMAP_DIAMETER,
        tileCache,
        worldWidth,
        worldHeight,
        worldMinX: minX,
        worldMinY: minY,
        tileSize,
        // Cache for rendered tile colors (updated only when fog changes)
        colorCache: new Map(),
        lastExploredCount: 0,
    };
}

/**
 * Get the terrain color for a visible tile
 */
function getTerrainColor(tile) {
    if (tile.type === TILE_TYPES.DEEP_OCEAN) {
        return COLORS.deepOcean;
    }
    if (tile.type === TILE_TYPES.SHALLOW) {
        return COLORS.shallow;
    }
    // Land - vary by climate
    if (tile.climate === CLIMATE_ZONES.ARCTIC) {
        return COLORS.landArctic;
    }
    if (tile.climate === CLIMATE_ZONES.TROPICAL) {
        return COLORS.landTropical;
    }
    return COLORS.land;
}

/**
 * Draw the circular minimap with camera viewport indicator
 * Returns bounds for click detection
 */
export function drawMinimap(ctx, minimapState, map, fogState, cameraX, cameraY, zoom) {
    const { k, screenWidth, screenHeight } = ctx;
    const { diameter, tileCache, worldWidth, worldHeight, worldMinX, worldMinY, tileSize, colorCache } = minimapState;

    // Calculate minimap center position (bottom-right)
    const centerX = screenWidth - MINIMAP_MARGIN_RIGHT - diameter / 2;
    const centerY = screenHeight - MINIMAP_MARGIN_BOTTOM - diameter / 2;
    const radius = diameter / 2;

    // Draw background circle (black = unexplored)
    k.drawCircle({
        pos: k.vec2(centerX, centerY),
        radius: radius,
        color: k.rgb(COLORS.background.r, COLORS.background.g, COLORS.background.b),
        opacity: 0.9,
    });

    // Calculate the drawable area within the circle
    const drawRadius = radius - MINIMAP_PADDING;

    // Determine aspect ratio adjustment to center the map
    const aspectRatio = worldWidth / worldHeight;
    let drawWidth, drawHeight;
    if (aspectRatio > 1) {
        drawWidth = drawRadius * 2;
        drawHeight = drawWidth / aspectRatio;
    } else {
        drawHeight = drawRadius * 2;
        drawWidth = drawHeight * aspectRatio;
    }

    // Calculate map area origin in minimap coordinates
    const mapOriginX = centerX - drawWidth / 2;
    const mapOriginY = centerY - drawHeight / 2;

    const maxDistSq = (radius - MINIMAP_BORDER_WIDTH - 1) * (radius - MINIMAP_BORDER_WIDTH - 1);

    // Only update color cache when fog state changes
    const currentExploredCount = fogState.exploredHexes.size;
    const fogChanged = currentExploredCount !== minimapState.lastExploredCount;

    if (fogChanged) {
        minimapState.lastExploredCount = currentExploredCount;
        colorCache.clear();
    }

    // Only draw explored tiles (skip unexplored - they're black on black)
    for (const key of fogState.exploredHexes) {
        const cached = tileCache.get(key);
        if (!cached) continue;

        // Calculate position within minimap
        const tileX = mapOriginX + cached.normX * drawWidth;
        const tileY = mapOriginY + cached.normY * drawHeight;

        // Circular bounds check
        const dx = tileX - centerX;
        const dy = tileY - centerY;
        if (dx * dx + dy * dy > maxDistSq) continue;

        // Get color (use cache or compute)
        let color;
        if (!fogChanged && colorCache.has(key)) {
            color = colorCache.get(key);
        } else {
            const isVisible = fogState.visibleHexes.has(key);
            color = isVisible ? getTerrainColor(cached.tile) : COLORS.explored;
            colorCache.set(key, color);
        }

        // Draw tile
        k.drawRect({
            pos: k.vec2(tileX - tileSize / 2, tileY - tileSize / 2),
            width: tileSize,
            height: tileSize,
            color: k.rgb(color.r, color.g, color.b),
        });
    }

    // Draw camera viewport rectangle
    const viewportWorldWidth = screenWidth / zoom;
    const viewportWorldHeight = screenHeight / zoom;

    // Convert camera position to normalized coordinates
    const viewportNormX = (cameraX - worldMinX) / worldWidth;
    const viewportNormY = (cameraY - worldMinY) / worldHeight;
    const viewportNormW = viewportWorldWidth / worldWidth;
    const viewportNormH = viewportWorldHeight / worldHeight;

    // Convert to minimap coordinates
    const vpX = mapOriginX + viewportNormX * drawWidth - (viewportNormW * drawWidth) / 2;
    const vpY = mapOriginY + viewportNormY * drawHeight - (viewportNormH * drawHeight) / 2;
    const vpW = viewportNormW * drawWidth;
    const vpH = viewportNormH * drawHeight;

    // Draw viewport rectangle (red outline)
    k.drawRect({
        pos: k.vec2(vpX, vpY),
        width: vpW,
        height: vpH,
        fill: false,
        outline: { width: 1.5, color: k.rgb(COLORS.viewport.r, COLORS.viewport.g, COLORS.viewport.b) },
    });

    // Draw circular border
    k.drawCircle({
        pos: k.vec2(centerX, centerY),
        radius: radius,
        fill: false,
        outline: { width: MINIMAP_BORDER_WIDTH, color: k.rgb(COLORS.border.r, COLORS.border.g, COLORS.border.b) },
    });

    // Return bounds for click detection
    return {
        centerX,
        centerY,
        radius,
        mapOriginX,
        mapOriginY,
        drawWidth,
        drawHeight,
    };
}

/**
 * Check if a screen position is within the minimap and convert to world coordinates
 * Returns { hit: true, worldX, worldY } or { hit: false }
 */
export function minimapClickToWorld(mouseX, mouseY, minimapBounds, minimapState) {
    if (!minimapBounds) return { hit: false };

    const { centerX, centerY, radius, mapOriginX, mapOriginY, drawWidth, drawHeight } = minimapBounds;
    const { worldWidth, worldHeight, worldMinX, worldMinY } = minimapState;

    // Check if click is within the circular minimap
    const dx = mouseX - centerX;
    const dy = mouseY - centerY;
    if (dx * dx + dy * dy > radius * radius) {
        return { hit: false };
    }

    // Convert minimap position to normalized coordinates (0-1)
    const normX = (mouseX - mapOriginX) / drawWidth;
    const normY = (mouseY - mapOriginY) / drawHeight;

    // Convert to world coordinates
    const worldX = worldMinX + normX * worldWidth;
    const worldY = worldMinY + normY * worldHeight;

    return { hit: true, worldX, worldY };
}
