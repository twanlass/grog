// Minimap rendering for fog of war visualization
import { hexToPixel, hexKey, parseHexKey } from "../hex.js";
import { TILE_TYPES, CLIMATE_ZONES } from "../mapGenerator.js";

// Minimap dimensions
const MINIMAP_DIAMETER = 100;
const MINIMAP_MARGIN_RIGHT = 15;
const MINIMAP_MARGIN_BOTTOM = 15;
const MINIMAP_BORDER_WIDTH = 0;
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
    alert: { r: 255, g: 60, b: 60 },
};

// Attack alert constants
const ATTACK_ALERT_DURATION = 3000;  // 3 seconds in milliseconds

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
 * Check if a world position is visible on the player's screen
 */
function isPositionOnScreen(worldX, worldY, cameraX, cameraY, zoom, screenW, screenH) {
    const screenX = (worldX - cameraX) * zoom + screenW / 2;
    const screenY = (worldY - cameraY) * zoom + screenH / 2;
    // Add margin to avoid edge cases
    const margin = 50;
    return screenX >= -margin && screenX <= screenW + margin &&
           screenY >= -margin && screenY <= screenH + margin;
}

/**
 * Find which island a hex belongs to and return its center
 * Returns null if not found on any island
 */
function findIslandCenter(hexQ, hexR, islands) {
    if (!islands || islands.length === 0) return null;

    const key = `${hexQ},${hexR}`;
    for (const island of islands) {
        if (island.tiles.has(key)) {
            return island.center;
        }
    }
    return null;
}

/**
 * Draw the circular minimap with camera viewport indicator
 * Returns bounds for click detection
 */
export function drawMinimap(ctx, minimapState, map, fogState, cameraX, cameraY, zoom, gameState = null, islands = null) {
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

    // Debug mode: show all tiles with full color
    const debugHideFog = fogState.debugHideFog;

    // Only update color cache when fog state changes
    const currentExploredCount = fogState.exploredHexes.size;
    const fogChanged = currentExploredCount !== minimapState.lastExploredCount || debugHideFog;

    if (fogChanged) {
        minimapState.lastExploredCount = currentExploredCount;
        colorCache.clear();
    }

    // Iterate all tiles in debug mode, or only explored tiles normally
    const tilesToDraw = debugHideFog ? tileCache.keys() : fogState.exploredHexes;

    for (const key of tilesToDraw) {
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
            // In debug mode, always show full terrain color
            const isVisible = debugHideFog || fogState.visibleHexes.has(key);
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

    // Draw attack alerts for off-screen structure attacks
    if (gameState && gameState.attackedStructures && gameState.attackedStructures.size > 0) {
        const now = Date.now();
        const alertedIslandCenters = new Map();  // island center key → true

        // Collect off-screen attacked islands and clean up stale entries
        for (const [key, attack] of gameState.attackedStructures) {
            const age = now - attack.timestamp;

            // Remove stale attacks
            if (age > ATTACK_ALERT_DURATION) {
                gameState.attackedStructures.delete(key);
                continue;
            }

            // Convert hex to world position
            const cached = tileCache.get(key);
            if (!cached) continue;

            const worldX = worldMinX + cached.normX * worldWidth;
            const worldY = worldMinY + cached.normY * worldHeight;

            // Skip if the attack is visible on screen
            if (isPositionOnScreen(worldX, worldY, cameraX, cameraY, zoom, screenWidth, screenHeight)) {
                continue;
            }

            // Find which island this structure is on
            const islandCenter = findIslandCenter(attack.q, attack.r, islands);
            if (islandCenter) {
                const centerKey = `${Math.round(islandCenter.x)},${Math.round(islandCenter.y)}`;
                alertedIslandCenters.set(centerKey, islandCenter);
            } else {
                // No island found, use the structure's own position
                alertedIslandCenters.set(key, { x: worldX, y: worldY });
            }
        }

        // Draw alerts if there are any off-screen attacks
        if (alertedIslandCenters.size > 0) {
            const time = now / 1000;  // Convert to seconds for animation

            // Draw pulsing red border around minimap
            const borderPulse = 0.5 + 0.5 * Math.sin(time * 4);
            k.drawCircle({
                pos: k.vec2(centerX, centerY),
                radius: radius,
                fill: false,
                outline: {
                    width: 4,
                    color: k.rgb(COLORS.alert.r, COLORS.alert.g, COLORS.alert.b),
                    opacity: 0.3 + 0.7 * borderPulse,
                },
            });

            // Draw flashing and pulsing X markers at each attacked island center
            const xFlash = Math.sin(time * 6) > 0 ? 1 : 0.4;
            const xScalePulse = 1 + 0.3 * Math.sin(time * 5);  // Scale between 1.0 and 1.3
            const xBaseSize = 6;
            const xSize = xBaseSize * xScalePulse;
            const xStroke = 2 * xScalePulse;

            for (const [, center] of alertedIslandCenters) {
                // Convert world position to minimap position
                const normX = (center.x - worldMinX) / worldWidth;
                const normY = (center.y - worldMinY) / worldHeight;
                const markerX = mapOriginX + normX * drawWidth;
                const markerY = mapOriginY + normY * drawHeight;

                // Check if marker is within minimap bounds
                const dx = markerX - centerX;
                const dy = markerY - centerY;
                if (dx * dx + dy * dy > radius * radius) continue;

                // Draw X marker
                const alertColor = k.rgb(COLORS.alert.r, COLORS.alert.g, COLORS.alert.b);
                k.drawLine({
                    p1: k.vec2(markerX - xSize, markerY - xSize),
                    p2: k.vec2(markerX + xSize, markerY + xSize),
                    width: xStroke,
                    color: alertColor,
                    opacity: xFlash,
                });
                k.drawLine({
                    p1: k.vec2(markerX + xSize, markerY - xSize),
                    p2: k.vec2(markerX - xSize, markerY + xSize),
                    width: xStroke,
                    color: alertColor,
                    opacity: xFlash,
                });
            }
        }
    }

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
