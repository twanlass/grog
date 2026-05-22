// Designer Panel: hot-swap sprites and quick-spawn units while the game is running.
// Rendered only in debug mode when gameState.designerPanel.open is true.

import { ASSET_SLOTS, CATEGORY_LABELS, QUICK_SPAWN_OPTIONS, DIRECTIONAL_GROUPS, getSlotsByCategory } from '../designer/assetSlots.js';
import { isModified } from '../designer/assetSwap.js';
import { getTunableSprites, getRenderScale, SCALE_MIN, SCALE_MAX } from '../designer/scaleTuner.js';
import { drawPanelContainer, PANEL_COLORS } from './uiPrimitives.js';

const PANEL_WIDTH = 360;
const PANEL_RIGHT_MARGIN = 16;
const PANEL_TOP = 80;
const PANEL_BOTTOM_MARGIN = 16;

const ROW_HEIGHT = 44;
const ROW_GAP = 4;
const CATEGORY_GAP = 12;
const CATEGORY_HEADER_HEIGHT = 18;
const PADDING = 12;

const THUMB_SIZE = 28;
const BUTTON_HEIGHT = 22;
const BUTTON_WIDTH_UPLOAD = 70;
const BUTTON_WIDTH_RESET = 50;
const BUTTON_GAP = 6;

const QUICK_SPAWN_HEIGHT = 80; // 2 rows × (26 + 6) = 64 + a hint line below
const SPAWN_BUTTON_HEIGHT = 26;
const SPAWN_BUTTON_GAP = 6;

// Sprite scale tuner row layout
const SCALE_ROW_HEIGHT = 22;
const SCALE_SLIDER_WIDTH = 110;
const SCALE_TRACK_HEIGHT = 4;
const SCALE_THUMB_RADIUS = 6;
const SCALE_VALUE_WIDTH = 44;
const SCALE_RESET_WIDTH = 36;

/**
 * Render the panel. Returns hit regions for the click handler:
 *   { uploads: [{ key, x, y, w, h }], resets: [...], spawns: [{ id, x, y, w, h }],
 *     close: { x, y, w, h } }
 */
export function drawDesignerPanel(ctx, gameState) {
    const { k, screenWidth, screenHeight } = ctx;
    const hits = {
        uploads: [], resets: [], spawns: [], groupToggles: [], close: null,
        // Sprite-scale tuner: tracks (sliderTrack | valueBox | resetBtn) regions per row
        scaleTracks: [], scaleValues: [], scaleResets: [],
    };

    const panelX = screenWidth - PANEL_WIDTH - PANEL_RIGHT_MARGIN;
    const panelY = PANEL_TOP;
    const panelHeight = screenHeight - PANEL_TOP - PANEL_BOTTOM_MARGIN;

    drawPanelContainer(ctx, panelX, panelY, PANEL_WIDTH, panelHeight, { opacity: 0.92 });

    // Border to separate the panel from dark map backgrounds
    k.drawRect({
        pos: k.vec2(panelX, panelY),
        width: PANEL_WIDTH,
        height: panelHeight,
        radius: 6,
        fill: false,
        outline: { width: 2, color: k.rgb(120, 130, 150) },
        opacity: 0.9,
    });

    // Header
    k.drawText({
        text: 'DESIGNER PANEL',
        pos: k.vec2(panelX + PADDING, panelY + PADDING),
        size: 12,
        color: k.rgb(220, 200, 120),
    });
    k.drawText({
        text: 'Shift+D to close',
        pos: k.vec2(panelX + PANEL_WIDTH - PADDING, panelY + PADDING),
        size: 10,
        anchor: 'topright',
        color: k.rgb(120, 120, 120),
    });

    // Quick Spawn section (top)
    const spawnSectionY = panelY + PADDING + 22;
    drawSectionHeader(ctx, panelX + PADDING, spawnSectionY, 'Quick spawn (click button, then click map)');

    const activeSpawn = gameState.designerPanel.spawnType;
    let sx = panelX + PADDING;
    let sy = spawnSectionY + 20;
    const spawnButtonWidth = (PANEL_WIDTH - PADDING * 2 - SPAWN_BUTTON_GAP * 2) / 3;

    for (let i = 0; i < QUICK_SPAWN_OPTIONS.length; i++) {
        const opt = QUICK_SPAWN_OPTIONS[i];
        const col = i % 3;
        const row = Math.floor(i / 3);
        const bx = panelX + PADDING + col * (spawnButtonWidth + SPAWN_BUTTON_GAP);
        const by = sy + row * (SPAWN_BUTTON_HEIGHT + SPAWN_BUTTON_GAP);
        const active = activeSpawn === opt.id;
        const isAction = opt.kind === 'action';

        const bgColor = active ? k.rgb(220, 180, 80)
            : isAction ? k.rgb(140, 70, 70)
            : k.rgb(60, 70, 80);
        const textColor = active ? k.rgb(20, 20, 20)
            : isAction ? k.rgb(255, 230, 230)
            : k.rgb(220, 220, 220);

        k.drawRect({
            pos: k.vec2(bx, by),
            width: spawnButtonWidth,
            height: SPAWN_BUTTON_HEIGHT,
            color: bgColor,
            radius: 3,
        });
        k.drawText({
            text: opt.label,
            pos: k.vec2(bx + spawnButtonWidth / 2, by + SPAWN_BUTTON_HEIGHT / 2),
            size: 11,
            anchor: 'center',
            color: textColor,
        });
        hits.spawns.push({ id: opt.id, x: bx, y: by, w: spawnButtonWidth, h: SPAWN_BUTTON_HEIGHT });
    }

    if (activeSpawn) {
        const hintY = sy + Math.ceil(QUICK_SPAWN_OPTIONS.length / 3) * (SPAWN_BUTTON_HEIGHT + SPAWN_BUTTON_GAP);
        k.drawText({
            text: `Click map to place. Esc/right-click to cancel.`,
            pos: k.vec2(panelX + PADDING, hintY),
            size: 10,
            color: k.rgb(220, 180, 80),
        });
    }

    // Asset Swap section (scrollable list with collapsible category headers)
    const assetsTop = panelY + PADDING + 22 + QUICK_SPAWN_HEIGHT;
    drawSectionHeader(ctx, panelX + PADDING, assetsTop, 'Asset swap');

    const listTop = assetsTop + 20;
    const listBottom = panelY + panelHeight - PADDING;

    const grouped = getSlotsByCategory();
    const scrollY = gameState.designerPanel.scrollY;
    let y = listTop - scrollY;

    // Skip rows entirely outside the viewport so off-panel sprites don't bleed past
    // the panel bottom. Partial draws are allowed within a small overdraw margin so
    // a row scrolling in/out doesn't pop.
    const isRowVisible = (top, height) => {
        const bottom = top + height;
        return bottom > listTop && top < listBottom;
    };

    // Sprite Scale tuner (collapsible group at top of scrollable area)
    const scaleToggleId = 'group:scale-tuner';
    const scaleCollapsed = gameState.designerPanel.collapsedGroups.has(scaleToggleId);
    const scaleHeaderH = CATEGORY_HEADER_HEIGHT + 4;
    if (isRowVisible(y, scaleHeaderH)) {
        k.drawText({
            text: `${scaleCollapsed ? '▶' : '▼'} Sprite scale (live)`,
            pos: k.vec2(panelX + PADDING, y),
            size: 10,
            color: k.rgb(150, 170, 200),
        });
    }
    hits.groupToggles.push({ id: scaleToggleId, x: panelX + PADDING, y, w: PANEL_WIDTH - PADDING * 2, h: scaleHeaderH });
    y += scaleHeaderH;

    if (!scaleCollapsed) {
        const tunables = getTunableSprites();
        for (const t of tunables) {
            if (isRowVisible(y, SCALE_ROW_HEIGHT)) {
                drawScaleRow(ctx, gameState, t, panelX + PADDING, y, PANEL_WIDTH - PADDING * 2, hits);
            }
            y += SCALE_ROW_HEIGHT + 2;
        }
    }
    y += CATEGORY_GAP;

    for (const cat of Object.keys(grouped)) {
        const slots = grouped[cat];
        if (slots.length === 0) continue;

        const catToggleId = `cat:${cat}`;
        const catCollapsed = gameState.designerPanel.collapsedGroups.has(catToggleId);
        const catHeaderH = CATEGORY_HEADER_HEIGHT + 4;

        if (isRowVisible(y, catHeaderH)) {
            k.drawText({
                text: `${catCollapsed ? '▶' : '▼'} ${CATEGORY_LABELS[cat] || cat}`,
                pos: k.vec2(panelX + PADDING, y),
                size: 10,
                color: k.rgb(150, 170, 200),
            });
        }
        hits.groupToggles.push({ id: catToggleId, x: panelX + PADDING, y, w: PANEL_WIDTH - PADDING * 2, h: catHeaderH });
        y += catHeaderH;

        if (catCollapsed) {
            y += CATEGORY_GAP;
            continue;
        }

        if (cat === 'directional') {
            // Group directional sheets by ship (cutter, schooner) and render collapsible headers
            const slotsByGroup = {};
            for (const slot of slots) {
                const g = slot.group || 'other';
                (slotsByGroup[g] = slotsByGroup[g] || []).push(slot);
            }

            for (const group of DIRECTIONAL_GROUPS) {
                const groupSlots = slotsByGroup[group.id] || [];
                if (groupSlots.length === 0) continue;
                const groupToggleId = `group:${group.id}`;
                const collapsed = gameState.designerPanel.collapsedGroups.has(groupToggleId);

                // Group header (clickable to toggle) — indented under the category
                const headerH = CATEGORY_HEADER_HEIGHT + 4;
                if (isRowVisible(y, headerH)) {
                    k.drawText({
                        text: `${collapsed ? '▶' : '▼'} ${group.label}`,
                        pos: k.vec2(panelX + PADDING + 16, y),
                        size: 10,
                        color: k.rgb(200, 200, 220),
                    });
                }
                hits.groupToggles.push({ id: groupToggleId, x: panelX + PADDING, y, w: PANEL_WIDTH - PADDING * 2, h: headerH });
                y += headerH;

                if (!collapsed) {
                    for (const slot of groupSlots) {
                        if (isRowVisible(y, ROW_HEIGHT)) {
                            drawSlotRow(ctx, slot, panelX + PADDING, y, PANEL_WIDTH - PADDING * 2, hits);
                        }
                        y += ROW_HEIGHT + ROW_GAP;
                    }
                }
            }
        } else {
            for (const slot of slots) {
                if (isRowVisible(y, ROW_HEIGHT)) {
                    drawSlotRow(ctx, slot, panelX + PADDING, y, PANEL_WIDTH - PADDING * 2, hits);
                }
                y += ROW_HEIGHT + ROW_GAP;
            }
        }

        y += CATEGORY_GAP;
    }

    // Track total content height + clamp scroll position so collapsing a group
    // can't leave us scrolled past the new content end.
    const totalRendered = (y + scrollY) - listTop;
    gameState.designerPanel.contentHeight = totalRendered;
    gameState.designerPanel.viewportHeight = listBottom - listTop;
    gameState.designerPanel.bounds = { x: panelX, y: panelY, w: PANEL_WIDTH, h: panelHeight };
    const maxScroll = Math.max(0, totalRendered - (listBottom - listTop));
    if (gameState.designerPanel.scrollY > maxScroll) gameState.designerPanel.scrollY = maxScroll;

    // Scrollbar (only when content overflows)
    const overflow = totalRendered - (listBottom - listTop);
    if (overflow > 0) {
        const trackX = panelX + PANEL_WIDTH - 6;
        const trackH = listBottom - listTop;
        k.drawRect({
            pos: k.vec2(trackX, listTop),
            width: 3,
            height: trackH,
            color: k.rgb(40, 45, 55),
            radius: 1,
        });
        const thumbH = Math.max(20, trackH * (trackH / totalRendered));
        const thumbY = listTop + (scrollY / overflow) * (trackH - thumbH);
        k.drawRect({
            pos: k.vec2(trackX, thumbY),
            width: 3,
            height: thumbH,
            color: k.rgb(140, 150, 170),
            radius: 1,
        });
    }

    return hits;
}

function drawSectionHeader(ctx, x, y, label) {
    const { k } = ctx;
    k.drawText({
        text: label,
        pos: k.vec2(x, y),
        size: 10,
        color: k.rgb(PANEL_COLORS.headerText.r, PANEL_COLORS.headerText.g, PANEL_COLORS.headerText.b),
    });
}

function drawSlotRow(ctx, slot, x, y, w, hits) {
    const { k } = ctx;
    const modified = isModified(slot.key);

    // Thumbnail
    k.drawRect({
        pos: k.vec2(x, y + 4),
        width: THUMB_SIZE + 4,
        height: THUMB_SIZE + 4,
        color: k.rgb(30, 35, 45),
        radius: 2,
    });
    try {
        k.drawSprite({
            sprite: slot.key,
            frame: 0,
            pos: k.vec2(x + 2 + THUMB_SIZE / 2, y + 6 + THUMB_SIZE / 2),
            anchor: 'center',
            // Scale to fit roughly inside THUMB_SIZE for a 32px source
            scale: THUMB_SIZE / 32,
        });
    } catch (_) {
        // Sprite not yet loaded — skip preview
    }

    // Label + size hint
    const textX = x + THUMB_SIZE + 12;
    k.drawText({
        text: slot.label + (modified ? '  *' : ''),
        pos: k.vec2(textX, y + 4),
        size: 11,
        color: modified ? k.rgb(220, 180, 80) : k.rgb(220, 220, 220),
    });
    k.drawText({
        text: slot.expectedSize,
        pos: k.vec2(textX, y + 18),
        size: 9,
        color: k.rgb(130, 130, 130),
    });

    // Buttons (right-aligned)
    const buttonsRight = x + w;
    const resetX = buttonsRight - BUTTON_WIDTH_RESET;
    const uploadX = resetX - BUTTON_GAP - BUTTON_WIDTH_UPLOAD;
    const buttonY = y + (ROW_HEIGHT - BUTTON_HEIGHT) / 2;

    // Upload
    k.drawRect({
        pos: k.vec2(uploadX, buttonY),
        width: BUTTON_WIDTH_UPLOAD,
        height: BUTTON_HEIGHT,
        color: k.rgb(60, 110, 160),
        radius: 3,
    });
    k.drawText({
        text: 'Upload',
        pos: k.vec2(uploadX + BUTTON_WIDTH_UPLOAD / 2, buttonY + BUTTON_HEIGHT / 2),
        size: 11,
        anchor: 'center',
        color: k.rgb(255, 255, 255),
    });
    hits.uploads.push({ key: slot.key, x: uploadX, y: buttonY, w: BUTTON_WIDTH_UPLOAD, h: BUTTON_HEIGHT });

    // Reset (disabled visually if not modified)
    k.drawRect({
        pos: k.vec2(resetX, buttonY),
        width: BUTTON_WIDTH_RESET,
        height: BUTTON_HEIGHT,
        color: modified ? k.rgb(100, 70, 70) : k.rgb(50, 55, 65),
        radius: 3,
    });
    k.drawText({
        text: 'Reset',
        pos: k.vec2(resetX + BUTTON_WIDTH_RESET / 2, buttonY + BUTTON_HEIGHT / 2),
        size: 11,
        anchor: 'center',
        color: modified ? k.rgb(255, 220, 220) : k.rgb(120, 120, 120),
    });
    if (modified) {
        hits.resets.push({ key: slot.key, x: resetX, y: buttonY, w: BUTTON_WIDTH_RESET, h: BUTTON_HEIGHT });
    }
}

/**
 * Render one row of the Sprite-scale tuner: label, draggable slider, click-to-edit
 * value, reset-to-default button. Pushes hit regions to `hits`.
 */
function drawScaleRow(ctx, gameState, tunable, x, y, w, hits) {
    const { k } = ctx;
    const currentScale = getRenderScale(gameState, tunable.key, tunable.defaultScale);
    const isOverridden = tunable.key in gameState.designerPanel.scaleOverrides;

    // Label on the left
    k.drawText({
        text: tunable.label,
        pos: k.vec2(x, y + SCALE_ROW_HEIGHT / 2),
        size: 11,
        anchor: 'left',
        color: isOverridden ? k.rgb(220, 180, 80) : k.rgb(220, 220, 220),
    });

    // Right-aligned: [reset] [value] [slider]
    const resetX = x + w - SCALE_RESET_WIDTH;
    const valueX = resetX - SCALE_VALUE_WIDTH - 6;
    const trackX = valueX - SCALE_SLIDER_WIDTH - 8;
    const centerY = y + SCALE_ROW_HEIGHT / 2;

    // Slider track
    k.drawRect({
        pos: k.vec2(trackX, centerY - SCALE_TRACK_HEIGHT / 2),
        width: SCALE_SLIDER_WIDTH,
        height: SCALE_TRACK_HEIGHT,
        color: k.rgb(50, 55, 65),
        radius: 2,
    });
    // Slider thumb
    const norm = (currentScale - SCALE_MIN) / (SCALE_MAX - SCALE_MIN);
    const thumbX = trackX + Math.max(0, Math.min(1, norm)) * SCALE_SLIDER_WIDTH;
    k.drawCircle({
        pos: k.vec2(thumbX, centerY),
        radius: SCALE_THUMB_RADIUS,
        color: isOverridden ? k.rgb(220, 180, 80) : k.rgb(160, 170, 190),
    });
    hits.scaleTracks.push({
        key: tunable.key, x: trackX, y: y, w: SCALE_SLIDER_WIDTH, h: SCALE_ROW_HEIGHT,
        trackX, trackW: SCALE_SLIDER_WIDTH,
    });

    // Value box (click to edit)
    k.drawRect({
        pos: k.vec2(valueX, y + 2),
        width: SCALE_VALUE_WIDTH,
        height: SCALE_ROW_HEIGHT - 4,
        color: k.rgb(40, 45, 55),
        radius: 2,
        outline: { width: 1, color: k.rgb(80, 90, 110) },
    });
    k.drawText({
        text: currentScale.toFixed(2),
        pos: k.vec2(valueX + SCALE_VALUE_WIDTH / 2, centerY),
        size: 11,
        anchor: 'center',
        color: k.rgb(220, 220, 220),
    });
    hits.scaleValues.push({
        key: tunable.key, x: valueX, y: y + 2, w: SCALE_VALUE_WIDTH, h: SCALE_ROW_HEIGHT - 4,
        defaultScale: tunable.defaultScale,
    });

    // Reset (only active when overridden)
    k.drawRect({
        pos: k.vec2(resetX, y + 2),
        width: SCALE_RESET_WIDTH,
        height: SCALE_ROW_HEIGHT - 4,
        color: isOverridden ? k.rgb(100, 70, 70) : k.rgb(40, 45, 55),
        radius: 2,
    });
    k.drawText({
        text: 'Reset',
        pos: k.vec2(resetX + SCALE_RESET_WIDTH / 2, centerY),
        size: 10,
        anchor: 'center',
        color: isOverridden ? k.rgb(255, 220, 220) : k.rgb(110, 110, 110),
    });
    if (isOverridden) {
        hits.scaleResets.push({ key: tunable.key, x: resetX, y: y + 2, w: SCALE_RESET_WIDTH, h: SCALE_ROW_HEIGHT - 4 });
    }
}

/**
 * Hit-test point against a list of regions, returning the first hit's identifier.
 */
export function hitTestRegion(point, regions, idField = 'key') {
    for (const r of regions) {
        if (point.x >= r.x && point.x <= r.x + r.w && point.y >= r.y && point.y <= r.y + r.h) {
            return r[idField];
        }
    }
    return null;
}
