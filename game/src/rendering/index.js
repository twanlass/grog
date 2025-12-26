// Rendering module index - re-exports all rendering functions

// Core context and helpers
export { createRenderContext, worldToScreen, hexToScreen, isOnScreen, getHexScreenCorners } from "./renderContext.js";
export { drawProgressBar, drawConstructionProgressBar, drawHexOutline, drawHexRangeFilled, drawHexRangeOutline, drawHealthBar } from "./renderHelpers.js";

// Tile rendering
export { drawTiles, drawFogOfWar } from "./tileRenderer.js";

// Unit rendering
export { drawPorts, drawSettlements, drawTowers, drawShips, drawFloatingNumbers, drawBirds, drawDockingProgress } from "./unitRenderer.js";

// Effects rendering
export { drawShipTrails, drawFloatingDebris, drawProjectiles, drawWaterSplashes, drawExplosions, drawHealthBars } from "./effectsRenderer.js";

// Selection UI
export { drawShipSelectionIndicators, drawPortSelectionIndicators, drawSettlementSelectionIndicators, drawTowerSelectionIndicators, drawSelectionBox, drawAllSelectionUI } from "./selectionUI.js";

// Placement UI
export { drawPortPlacementMode, drawSettlementPlacementMode, drawTowerPlacementMode, drawAllPlacementUI } from "./placementUI.js";

// UI Panels
export { drawResourcePanel, drawGameTitle, drawTimeIndicator, drawShipInfoPanel, drawPanelButton, drawPanelSeparator, drawPanelHeader, drawConstructionStatusPanel, drawPortStorage, drawShipBuildingStatus, drawSimpleUIPanels } from "./uiPanels.js";
