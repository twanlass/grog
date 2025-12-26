// Shared render context passed to all rendering functions
import { hexToPixel, hexCorners, HEX_SIZE, hexDistance, hexNeighbors } from "../hex.js";

/**
 * Creates a render context object containing all shared state for rendering
 * @param {object} k - Kaplay context
 * @param {number} zoom - Current zoom level
 * @param {number} cameraX - Camera X position (includes shake)
 * @param {number} cameraY - Camera Y position (includes shake)
 * @returns {object} Render context
 */
export function createRenderContext(k, zoom, cameraX, cameraY) {
    const halfWidth = k.width() / 2;
    const halfHeight = k.height() / 2;
    const screenWidth = k.width();
    const screenHeight = k.height();
    const scaledHexSize = HEX_SIZE * zoom;

    return {
        k,
        zoom,
        cameraX,
        cameraY,
        halfWidth,
        halfHeight,
        screenWidth,
        screenHeight,
        scaledHexSize,
        HEX_SIZE,
    };
}

/**
 * Convert world coordinates to screen coordinates
 * @param {object} ctx - Render context
 * @param {number} worldX - World X position
 * @param {number} worldY - World Y position
 * @returns {object} { x, y } screen coordinates
 */
export function worldToScreen(ctx, worldX, worldY) {
    return {
        x: (worldX - ctx.cameraX) * ctx.zoom + ctx.halfWidth,
        y: (worldY - ctx.cameraY) * ctx.zoom + ctx.halfHeight,
    };
}

/**
 * Convert hex coordinates to screen coordinates
 * @param {object} ctx - Render context
 * @param {number} q - Hex Q coordinate
 * @param {number} r - Hex R coordinate
 * @returns {object} { x, y } screen coordinates
 */
export function hexToScreen(ctx, q, r) {
    const worldPos = hexToPixel(q, r);
    return worldToScreen(ctx, worldPos.x, worldPos.y);
}

/**
 * Check if a point is visible on screen (with margin)
 * @param {object} ctx - Render context
 * @param {number} screenX - Screen X position
 * @param {number} screenY - Screen Y position
 * @param {number} margin - Margin in pixels (default 100)
 * @returns {boolean} True if visible
 */
export function isOnScreen(ctx, screenX, screenY, margin = 100) {
    return screenX >= -margin && screenX <= ctx.screenWidth + margin &&
           screenY >= -margin && screenY <= ctx.screenHeight + margin;
}

/**
 * Get screen corners for a hex
 * @param {object} ctx - Render context
 * @param {number} screenX - Center screen X
 * @param {number} screenY - Center screen Y
 * @returns {array} Array of corner points
 */
export function getHexScreenCorners(ctx, screenX, screenY) {
    return hexCorners(screenX, screenY, ctx.scaledHexSize);
}

// Re-export hex utilities for convenience
export { hexToPixel, hexCorners, HEX_SIZE, hexDistance, hexNeighbors };
