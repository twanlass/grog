# Tooltips

UI tooltips that appear on hover to provide additional information about menu items.

## Overview

Tooltips display contextual help text when hovering over UI elements. They appear to the right of the hovered item, top-aligned.

## Implementation

### Data Structure

Tooltips are passed through panel bounds objects:

```javascript
bounds.tooltip = {
    x: number,      // X position (right of panel)
    y: number,      // Y position (top-aligned with item)
    text: string,   // Tooltip content (auto-wraps)
};
```

### Key Files

- `game/src/rendering/uiPanels.js` - Contains `drawTooltip()` function and tooltip data in panel functions
- `game/src/scenes/gameScene.js` - Renders tooltips after panels are drawn

### Adding a New Tooltip

1. In the panel drawing function (e.g., `drawPortBuildPanel`), detect mouse hover:

```javascript
const isMouseOver = mousePos.x >= btnX && mousePos.x <= btnX + btnWidth &&
                    mousePos.y >= btnY && mousePos.y <= btnY + btnHeight;
```

2. Set tooltip data on bounds when hovered:

```javascript
if (isMouseOver) {
    bounds.tooltip = {
        x: panelX + panelWidth + 8,  // 8px gap from panel
        y: btnY,                      // Top-aligned with button
        text: "Your tooltip text here",
    };
}
```

3. Ensure `drawTooltip(ctx, bounds.tooltip)` is called in gameScene.js after the panel is drawn.

### Tooltip Rendering

The `drawTooltip()` function handles:
- Word wrapping for long text (maxWidth: 220px)
- Multi-line layout with proper line height
- Dark background with subtle border
- 14px font size

### Current Tooltips

| Location | Item | Tooltip Text |
|----------|------|--------------|
| Port Build Panel | Settlement | "Produces wood and increases your crew cap allowing you to build more ships and structures" |

## Future Additions

Potential tooltips to add:
- Cutter: Ship stats and abilities
- Schooner: Ship stats and abilities
- Watchtower: Defense capabilities
- Upgrade options: What upgrades provide
