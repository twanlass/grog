// Window-level modifier-key state tracker.
//
// Kaplay tracks key state via canvas-scoped keydown/keyup listeners and never
// clears it on window blur. Any focus shift while a modifier is held (Cmd+Tab,
// macOS mission-control / spaces swipe, force-click look-up, Touch ID prompt,
// etc.) drops the keyup and leaves the modifier stuck "down" — which makes
// every subsequent click behave as if shift/meta were held. That manifested as
// a shift-style additive selection bug on MacBook trackpads.
//
// This module listens at the window level (which receives events regardless of
// which DOM element has focus) and resets on blur / visibility change so
// re-focusing the page always starts with a clean modifier state.

const down = new Set();

function onKeyDown(e) {
    if (e.key === "Shift") down.add("shift");
    if (e.key === "Meta") down.add("meta");
    if (e.key === "Control") down.add("ctrl");
    if (e.key === "Alt") down.add("alt");
    // Also trust the event's own modifier flags — covers the case where a
    // modifier was pressed before our listener attached.
    syncFromEvent(e);
}

function onKeyUp(e) {
    if (e.key === "Shift") down.delete("shift");
    if (e.key === "Meta") down.delete("meta");
    if (e.key === "Control") down.delete("ctrl");
    if (e.key === "Alt") down.delete("alt");
    syncFromEvent(e);
}

function syncFromEvent(e) {
    if (!e.shiftKey) down.delete("shift");
    if (!e.metaKey) down.delete("meta");
    if (!e.ctrlKey) down.delete("ctrl");
    if (!e.altKey) down.delete("alt");
}

function clearAll() {
    down.clear();
}

let initialized = false;
export function initModifierTracker() {
    if (initialized) return;
    initialized = true;
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", clearAll);
    document.addEventListener("visibilitychange", () => {
        if (document.hidden) clearAll();
    });
    // Mouse events carry authoritative modifier flags — use them to stay in sync.
    window.addEventListener("mousedown", syncFromEvent, { capture: true });
    window.addEventListener("mouseup", syncFromEvent, { capture: true });
}

export function isShiftHeld() { return down.has("shift"); }
export function isMetaHeld() { return down.has("meta"); }
export function isCtrlHeld() { return down.has("ctrl"); }
export function isAltHeld() { return down.has("alt"); }
