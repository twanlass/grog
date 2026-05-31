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
 * Construction VFX: a looping dust puff with a hammer swinging on top.
 * Phase is per-entity (offset by hex coords) so neighboring builds don't
 * tick in lockstep. Call once per under-construction entity, on top of
 * the building sprite, before the progress bar.
 */
export function drawConstructionVFX(ctx, screenX, screenY, phaseSeed = 0) {
    const { k, zoom } = ctx;
    const t = k.time() + phaseSeed;

    // Dust loop: 5 frames at ~7 fps, anchored to the building's footprint.
    const dustFrame = Math.floor(t * 7) % 5;
    k.drawSprite({
        sprite: "dust-vfx",
        frame: dustFrame,
        pos: k.vec2(screenX, screenY + 8 * zoom),
        anchor: "bot",
        scale: zoom * 0.28,
    });

    // Hammer swings in a smooth constant arc around the handle tip.
    const angle = Math.sin(t * 8.4) * 35 - 15;
    k.drawSprite({
        sprite: "icon-hammer",
        pos: k.vec2(screenX + 10 * zoom, screenY - 2 * zoom),
        anchor: "botright",
        scale: zoom * 0.28,
        angle,
    });
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
 * Map a health percentage (0-1) to a tiered status color.
 * Shared by in-world health bars and selection dots so they stay in sync.
 */
export function healthToColor(k, healthPercent) {
    if (healthPercent > 0.66) return k.rgb(80, 200, 100);
    if (healthPercent > 0.33) return k.rgb(220, 180, 60);
    return k.rgb(220, 70, 60);
}
