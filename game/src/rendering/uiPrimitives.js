// Low-level UI drawing primitives for reusable panel components

/**
 * Standard panel colors
 */
export const PANEL_COLORS = {
    background: { r: 20, g: 30, b: 40 },
    separator: { r: 60, g: 70, b: 80 },
    headerText: { r: 150, g: 150, b: 150 },
    bodyText: { r: 200, g: 200, b: 200 },
    mutedText: { r: 120, g: 120, b: 120 },
    disabledText: { r: 80, g: 80, b: 80 },
    hoverBg: { r: 60, g: 80, b: 100 },
    progressBg: { r: 40, g: 40, b: 40 },
    readyGreen: { r: 80, g: 180, b: 80 },
    cooldownOrange: { r: 220, g: 140, b: 60 },
    healthGreen: { r: 100, g: 180, b: 100 },
    healthRed: { r: 220, g: 100, b: 80 },
    woodBrown: { r: 180, g: 130, b: 70 },
    foodGreen: { r: 100, g: 160, b: 80 },
};

/**
 * Draw a standard panel container background
 * @returns {object} Panel bounds { x, y, width, height }
 */
export function drawPanelContainer(ctx, x, y, width, height, options = {}) {
    const { k } = ctx;
    const { opacity = 0.9, radius = 6, bgColor = PANEL_COLORS.background } = options;

    k.drawRect({
        pos: k.vec2(x, y),
        width: width,
        height: height,
        color: k.rgb(bgColor.r, bgColor.g, bgColor.b),
        radius: radius,
        opacity: opacity,
    });

    return { x, y, width, height };
}

/**
 * Draw a status badge (colored background with text)
 */
export function drawStatusBadge(ctx, centerX, y, text, color, options = {}) {
    const { k } = ctx;
    const { width = 70, height = 14, radius = 3, textSize = 9, bgOpacity = 0.3 } = options;

    const badgeX = centerX - width / 2;

    k.drawRect({
        pos: k.vec2(badgeX, y),
        width: width,
        height: height,
        color: color,
        radius: radius,
        opacity: bgOpacity,
    });

    k.drawText({
        text: text,
        pos: k.vec2(centerX, y + height / 2),
        size: textSize,
        anchor: "center",
        color: color,
    });
}

/**
 * Draw a progress bar (generic)
 * @param {number} progress - Value between 0 and 1
 */
export function drawProgressBar(ctx, x, y, width, progress, options = {}) {
    const { k } = ctx;
    const {
        height = 8,
        radius = 2,
        bgColor = PANEL_COLORS.progressBg,
        fillColor = { r: 80, g: 180, b: 220 }
    } = options;

    // Background
    k.drawRect({
        pos: k.vec2(x, y),
        width: width,
        height: height,
        color: k.rgb(bgColor.r, bgColor.g, bgColor.b),
        radius: radius,
    });

    // Fill
    const fillWidth = width * Math.min(1, Math.max(0, progress));
    if (fillWidth > 0) {
        k.drawRect({
            pos: k.vec2(x, y),
            width: fillWidth,
            height: height,
            color: k.rgb(fillColor.r, fillColor.g, fillColor.b),
            radius: radius,
        });
    }

    return { x, y, width, height };
}

/**
 * Draw a cooldown bar that fills up as it recharges
 * Shows "READY" when ready, otherwise shows countdown
 */
export function drawCooldownBar(ctx, centerX, y, width, cooldown, maxCooldown, options = {}) {
    const { k } = ctx;
    const {
        height = 8,
        label = "CANNON",
        showLabel = true
    } = options;

    const barX = centerX - width / 2;
    const cooldownRatio = cooldown / maxCooldown;
    const isReady = cooldown <= 0;

    // Optional label above
    if (showLabel) {
        k.drawText({
            text: label,
            pos: k.vec2(centerX, y),
            size: 9,
            anchor: "center",
            color: k.rgb(PANEL_COLORS.mutedText.r, PANEL_COLORS.mutedText.g, PANEL_COLORS.mutedText.b),
        });
    }

    const barY = showLabel ? y + 10 : y;

    // Background
    k.drawRect({
        pos: k.vec2(barX, barY),
        width: width,
        height: height,
        color: k.rgb(PANEL_COLORS.progressBg.r, PANEL_COLORS.progressBg.g, PANEL_COLORS.progressBg.b),
        radius: 2,
    });

    // Fill (fills up as ready)
    const fillWidth = width * (1 - cooldownRatio);
    if (fillWidth > 0) {
        const fillColor = isReady ? PANEL_COLORS.readyGreen : PANEL_COLORS.cooldownOrange;
        k.drawRect({
            pos: k.vec2(barX, barY),
            width: fillWidth,
            height: height,
            color: k.rgb(fillColor.r, fillColor.g, fillColor.b),
            radius: 2,
        });
    }

    // Ready text or countdown
    const textColor = isReady ? PANEL_COLORS.readyGreen : { r: 180, g: 140, b: 80 };
    k.drawText({
        text: isReady ? "READY" : `${cooldown.toFixed(1)}s`,
        pos: k.vec2(centerX, barY + height + 8),
        size: 9,
        anchor: "center",
        color: k.rgb(textColor.r, textColor.g, textColor.b),
    });

    return { x: barX, y: barY, width, height };
}

/**
 * Draw wood/food resource pair
 */
export function drawResourcePair(ctx, x, y, wood, food, options = {}) {
    const { k } = ctx;
    const { size = 11, spacing = 14 } = options;

    k.drawText({
        text: `Wood: ${wood}`,
        pos: k.vec2(x, y),
        size: size,
        anchor: "left",
        color: k.rgb(PANEL_COLORS.woodBrown.r, PANEL_COLORS.woodBrown.g, PANEL_COLORS.woodBrown.b),
    });

    k.drawText({
        text: `Food: ${food}`,
        pos: k.vec2(x, y + spacing),
        size: size,
        anchor: "left",
        color: k.rgb(PANEL_COLORS.foodGreen.r, PANEL_COLORS.foodGreen.g, PANEL_COLORS.foodGreen.b),
    });
}

/**
 * Draw section separator line
 */
export function drawSeparator(ctx, x1, x2, y) {
    const { k } = ctx;
    k.drawLine({
        p1: k.vec2(x1, y),
        p2: k.vec2(x2, y),
        width: 1,
        color: k.rgb(PANEL_COLORS.separator.r, PANEL_COLORS.separator.g, PANEL_COLORS.separator.b),
    });
}

/**
 * Draw section header text
 */
export function drawSectionHeader(ctx, centerX, y, text, options = {}) {
    const { k } = ctx;
    const { size = 9, color = PANEL_COLORS.mutedText } = options;

    k.drawText({
        text: text,
        pos: k.vec2(centerX, y),
        size: size,
        anchor: "center",
        color: k.rgb(color.r, color.g, color.b),
    });
}

/**
 * Draw health display (value/max with color based on health ratio)
 */
export function drawHealthDisplay(ctx, centerX, y, health, maxHealth) {
    const { k } = ctx;
    const ratio = health / maxHealth;
    const color = ratio > 0.5 ? PANEL_COLORS.healthGreen : PANEL_COLORS.healthRed;

    k.drawText({
        text: `HP: ${health}/${maxHealth}`,
        pos: k.vec2(centerX, y),
        size: 10,
        anchor: "center",
        color: k.rgb(color.r, color.g, color.b),
    });
}
