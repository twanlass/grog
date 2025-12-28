// Shared rendering helper functions
import { hexToPixel, hexCorners, hexDistance, hexNeighbors, HEX_SIZE } from "../hex.js";
import { worldToScreen, hexToScreen, getHexScreenCorners } from "./renderContext.js";

/**
 * Draw a progress bar with background and fill
 * @param {object} ctx - Render context
 * @param {number} screenX - Center X position
 * @param {number} screenY - Y position (top of bar)
 * @param {number} progress - Progress value 0-1
 * @param {object} options - Optional settings
 */
export function drawProgressBar(ctx, screenX, screenY, progress, options = {}) {
    const {
        width = 50,
        height = 8,
        bgColor = { r: 40, g: 40, b: 40 },
        fillColor = { r: 80, g: 180, b: 220 },
        radius = 2,
        label = null,
        labelSize = 9,
        labelColor = { r: 200, g: 200, b: 200 },
    } = options;

    const { k, zoom } = ctx;
    const barWidth = width * zoom;
    const barHeight = height * zoom;

    // Background
    k.drawRect({
        pos: k.vec2(screenX - barWidth / 2, screenY),
        width: barWidth,
        height: barHeight,
        color: k.rgb(bgColor.r, bgColor.g, bgColor.b),
        radius: radius,
    });

    // Fill
    if (progress > 0) {
        k.drawRect({
            pos: k.vec2(screenX - barWidth / 2, screenY),
            width: barWidth * Math.min(progress, 1),
            height: barHeight,
            color: k.rgb(fillColor.r, fillColor.g, fillColor.b),
            radius: radius,
        });
    }

    // Label
    if (label) {
        k.drawText({
            text: label,
            pos: k.vec2(screenX, screenY - 10 * zoom),
            size: labelSize * zoom,
            anchor: "center",
            color: k.rgb(labelColor.r, labelColor.g, labelColor.b),
        });
    }
}

/**
 * Draw construction progress bar (no label, matches health bar thickness)
 * Common pattern used for ports, settlements, and towers under construction
 */
export function drawConstructionProgressBar(ctx, screenX, screenY, progress) {
    drawProgressBar(ctx, screenX, screenY, progress, {
        width: 40,
        height: 5,
        bgColor: { r: 40, g: 40, b: 40 },
        fillColor: { r: 80, g: 180, b: 220 },
        radius: 2,
    });
}

/**
 * Draw a hex outline (for selection indicators)
 * @param {object} ctx - Render context
 * @param {number} q - Hex Q coordinate
 * @param {number} r - Hex R coordinate
 * @param {object} color - RGB color object or k.rgb color
 * @param {number} lineWidth - Line width in pixels
 */
export function drawHexOutline(ctx, q, r, color, lineWidth = 2) {
    const { k, zoom, cameraX, cameraY, halfWidth, halfHeight, scaledHexSize } = ctx;
    const pos = hexToPixel(q, r);
    const screenX = (pos.x - cameraX) * zoom + halfWidth;
    const screenY = (pos.y - cameraY) * zoom + halfHeight;
    const corners = hexCorners(screenX, screenY, scaledHexSize);

    // Draw outline by connecting corners
    for (let i = 0; i < 6; i++) {
        const c1 = corners[i];
        const c2 = corners[(i + 1) % 6];
        k.drawLine({
            p1: k.vec2(c1.x, c1.y),
            p2: k.vec2(c2.x, c2.y),
            width: lineWidth,
            color: color,
        });
    }
}

/**
 * Draw filled hexes within a range (transparent overlay)
 * Used for placement and attack range preview
 */
export function drawHexRangeFilled(ctx, centerQ, centerR, range, color, opacity) {
    const { k, zoom, cameraX, cameraY, halfWidth, halfHeight, scaledHexSize } = ctx;

    for (let dq = -range; dq <= range; dq++) {
        for (let dr = Math.max(-range, -dq - range); dr <= Math.min(range, -dq + range); dr++) {
            const q = centerQ + dq;
            const r = centerR + dr;
            const dist = hexDistance(centerQ, centerR, q, r);
            if (dist > range) continue;

            const pos = hexToPixel(q, r);
            const screenX = (pos.x - cameraX) * zoom + halfWidth;
            const screenY = (pos.y - cameraY) * zoom + halfHeight;
            const corners = hexCorners(screenX, screenY, scaledHexSize);
            const pts = corners.map(c => k.vec2(c.x, c.y));

            k.drawPolygon({
                pts,
                color: color,
                opacity: opacity,
            });
        }
    }
}

/**
 * Draw outline around outer boundary of a hex range
 * Used for attack range and placement range boundaries
 */
export function drawHexRangeOutline(ctx, centerQ, centerR, range, color, lineWidth) {
    const { k, zoom, cameraX, cameraY, halfWidth, halfHeight, scaledHexSize } = ctx;

    for (let dq = -range; dq <= range; dq++) {
        for (let dr = Math.max(-range, -dq - range); dr <= Math.min(range, -dq + range); dr++) {
            const q = centerQ + dq;
            const r = centerR + dr;
            const dist = hexDistance(centerQ, centerR, q, r);
            if (dist > range) continue;

            const neighbors = hexNeighbors(q, r);
            const pos = hexToPixel(q, r);
            const screenX = (pos.x - cameraX) * zoom + halfWidth;
            const screenY = (pos.y - cameraY) * zoom + halfHeight;
            const corners = hexCorners(screenX, screenY, scaledHexSize);

            for (let i = 0; i < 6; i++) {
                const neighbor = neighbors[i];
                const neighborDist = hexDistance(centerQ, centerR, neighbor.q, neighbor.r);
                if (neighborDist > range) {
                    // Neighbor is outside range, draw edge
                    const c1 = (6 - i) % 6;
                    const c2 = (c1 + 1) % 6;
                    k.drawLine({
                        p1: k.vec2(corners[c1].x, corners[c1].y),
                        p2: k.vec2(corners[c2].x, corners[c2].y),
                        width: lineWidth,
                        color: color,
                    });
                }
            }
        }
    }
}

/**
 * Draw a health bar (red/green style)
 * @param {object} ctx - Render context
 * @param {number} screenX - Center X position
 * @param {number} screenY - Y position (top of bar)
 * @param {number} currentHealth - Current health value
 * @param {number} maxHealth - Maximum health value
 * @param {object} options - Optional settings
 */
export function drawHealthBar(ctx, screenX, screenY, currentHealth, maxHealth, options = {}) {
    const {
        width = 40,
        height = 4,
    } = options;

    const { k, zoom } = ctx;
    const barWidth = width * zoom;
    const barHeight = height * zoom;
    const healthPercent = currentHealth / maxHealth;

    // Background (dark)
    k.drawRect({
        pos: k.vec2(screenX - barWidth / 2, screenY),
        width: barWidth,
        height: barHeight,
        color: k.rgb(40, 40, 40),
    });

    // Health fill (green to red based on health)
    const r = Math.floor(255 * (1 - healthPercent));
    const g = Math.floor(200 * healthPercent);
    k.drawRect({
        pos: k.vec2(screenX - barWidth / 2, screenY),
        width: barWidth * healthPercent,
        height: barHeight,
        color: k.rgb(r, g, 40),
    });
}
