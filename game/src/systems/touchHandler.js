/**
 * Touch Handler System for Mobile Support
 *
 * Provides touch-based input handling for mobile devices:
 * - Single tap: Left-click equivalent (select units)
 * - Long-press (300ms) released without moving: Right-click equivalent (commands)
 * - Long-press (300ms) then drag: Selection box (drag-select units)
 * - Single-finger drag (without holding first): Pan camera
 * - Pinch: Zoom in/out
 * - Two-finger drag: Pan camera
 */

// Touch state
let touchState = {
    // Active touches
    touches: [],

    // Single touch tracking
    singleTouchStart: null,
    singleTouchStartTime: 0,

    // Long-press detection
    longPressTimer: null,
    longPressArmed: false,       // Hold has reached 300ms without moving - ready for drag-select or right-click

    // Pinch zoom tracking
    initialPinchDistance: 0,
    initialZoom: 1,
    isPinching: false,

    // Two-finger pan tracking
    panStartX: 0,
    panStartY: 0,
    cameraStartX: 0,
    cameraStartY: 0,
    isTwoFingerPanning: false,

    // Drag detection
    hasMoved: false,
    isDragging: false,            // Pan drag (started without long-press arm)
    isSelectionDragging: false,   // Selection box drag (started after long-press arm)
    dragStartX: 0,
    dragStartY: 0,
    dragCurrentX: 0,
    dragCurrentY: 0,
};

// Configuration
const LONG_PRESS_DURATION = 300; // ms
const TAP_MOVE_THRESHOLD = 15; // pixels - movement allowed for tap
const DRAG_THRESHOLD = 10; // pixels

/**
 * Detect if the device's primary input is touch (phones, tablets).
 * Uses `pointer: coarse` so desktops with touchscreens — which expose
 * `ontouchstart` / `maxTouchPoints > 0` but are driven by a mouse — are
 * correctly treated as desktop.
 */
export function isTouchDevice() {
    return window.matchMedia?.("(pointer: coarse)").matches ?? false;
}

/**
 * Initialize touch handlers on the canvas
 * @param {HTMLCanvasElement} canvas - The game canvas
 * @param {Object} callbacks - Event callbacks
 */
export function initTouchHandlers(canvas, callbacks) {
    const {
        onTap,           // Single tap (x, y) - left click equivalent
        onLongPress,     // Long press released without movement (x, y) - right click equivalent
        onLongPressArm,  // Long press timer reached without movement (x, y) - drag-select armed
        onDragStart,     // Pan drag start (x, y)
        onDragMove,      // Pan drag move (x, y, dx, dy)
        onDragEnd,       // Pan drag end (x, y, wasDrag)
        onSelectionDragStart, // Selection-box drag start (x, y) - after long-press arm
        onSelectionDragMove,  // Selection-box drag move (x, y)
        onSelectionDragEnd,   // Selection-box drag end (x, y)
        onPinchStart,    // Pinch start
        onPinchMove,     // Pinch move (scale, centerX, centerY)
        onPinchEnd,      // Pinch end
        onTwoFingerPanStart, // Two-finger pan start
        onTwoFingerPanMove,  // Two-finger pan move (dx, dy)
        onTwoFingerPanEnd,   // Two-finger pan end
    } = callbacks;

    // Helper to get touch position relative to canvas
    function getTouchPos(touch) {
        const rect = canvas.getBoundingClientRect();
        return {
            x: touch.clientX - rect.left,
            y: touch.clientY - rect.top,
        };
    }

    // Calculate distance between two touch points
    function getTouchDistance(touch1, touch2) {
        const dx = touch1.clientX - touch2.clientX;
        const dy = touch1.clientY - touch2.clientY;
        return Math.sqrt(dx * dx + dy * dy);
    }

    // Calculate center point between two touches
    function getTouchCenter(touch1, touch2) {
        const rect = canvas.getBoundingClientRect();
        return {
            x: (touch1.clientX + touch2.clientX) / 2 - rect.left,
            y: (touch1.clientY + touch2.clientY) / 2 - rect.top,
        };
    }

    // Clear long-press timer
    function clearLongPress() {
        if (touchState.longPressTimer) {
            clearTimeout(touchState.longPressTimer);
            touchState.longPressTimer = null;
        }
    }

    // Touch start handler
    function handleTouchStart(e) {
        e.preventDefault();
        const touches = e.touches;

        if (touches.length === 1) {
            // Single touch
            const pos = getTouchPos(touches[0]);
            touchState.singleTouchStart = pos;
            touchState.singleTouchStartTime = Date.now();
            touchState.hasMoved = false;
            touchState.longPressArmed = false;
            touchState.isDragging = false;
            touchState.isSelectionDragging = false;
            touchState.dragStartX = pos.x;
            touchState.dragStartY = pos.y;
            touchState.dragCurrentX = pos.x;
            touchState.dragCurrentY = pos.y;

            // Start long-press timer - arms drag-select / right-click mode, does NOT fire commands yet
            clearLongPress();
            touchState.longPressTimer = setTimeout(() => {
                if (!touchState.hasMoved && !touchState.isDragging) {
                    touchState.longPressArmed = true;
                    if (onLongPressArm) {
                        onLongPressArm(touchState.dragStartX, touchState.dragStartY);
                    }
                }
            }, LONG_PRESS_DURATION);

        } else if (touches.length === 2) {
            // Two touches - could be pinch or pan
            clearLongPress();
            touchState.longPressArmed = false;
            touchState.isSelectionDragging = false;

            const distance = getTouchDistance(touches[0], touches[1]);
            const center = getTouchCenter(touches[0], touches[1]);

            touchState.initialPinchDistance = distance;
            touchState.isPinching = true;
            touchState.isTwoFingerPanning = true;
            touchState.panStartX = center.x;
            touchState.panStartY = center.y;

            if (onPinchStart) {
                onPinchStart();
            }
            if (onTwoFingerPanStart) {
                onTwoFingerPanStart(center.x, center.y);
            }
        }
    }

    // Touch move handler
    function handleTouchMove(e) {
        e.preventDefault();
        const touches = e.touches;

        if (touches.length === 1 && !touchState.isPinching) {
            // Single finger drag
            const pos = getTouchPos(touches[0]);
            const dx = pos.x - touchState.dragStartX;
            const dy = pos.y - touchState.dragStartY;
            const distance = Math.sqrt(dx * dx + dy * dy);

            touchState.dragCurrentX = pos.x;
            touchState.dragCurrentY = pos.y;

            if (touchState.longPressArmed) {
                // Long-press already armed: motion grows a selection box
                if (distance > DRAG_THRESHOLD) {
                    if (!touchState.isSelectionDragging) {
                        touchState.isSelectionDragging = true;
                        if (onSelectionDragStart) {
                            onSelectionDragStart(touchState.dragStartX, touchState.dragStartY);
                        }
                    }
                    if (onSelectionDragMove) {
                        onSelectionDragMove(pos.x, pos.y);
                    }
                }
            } else {
                // Not armed yet: standard pan-drag behavior
                if (distance > TAP_MOVE_THRESHOLD) {
                    touchState.hasMoved = true;
                    clearLongPress();
                }

                if (distance > DRAG_THRESHOLD) {
                    if (!touchState.isDragging) {
                        touchState.isDragging = true;
                        if (onDragStart) {
                            onDragStart(touchState.dragStartX, touchState.dragStartY);
                        }
                    }
                    if (onDragMove) {
                        onDragMove(pos.x, pos.y, dx, dy);
                    }
                }
            }

        } else if (touches.length === 2) {
            // Two-finger gesture (pinch and/or pan)
            const distance = getTouchDistance(touches[0], touches[1]);
            const center = getTouchCenter(touches[0], touches[1]);

            // Pinch zoom
            if (touchState.isPinching && touchState.initialPinchDistance > 0) {
                const scale = distance / touchState.initialPinchDistance;
                if (onPinchMove) {
                    onPinchMove(scale, center.x, center.y);
                }
            }

            // Two-finger pan
            if (touchState.isTwoFingerPanning) {
                const dx = center.x - touchState.panStartX;
                const dy = center.y - touchState.panStartY;
                if (onTwoFingerPanMove) {
                    onTwoFingerPanMove(dx, dy);
                }
            }
        }
    }

    // Touch end handler
    function handleTouchEnd(e) {
        e.preventDefault();
        const touches = e.touches;
        const changedTouches = e.changedTouches;

        if (touches.length === 0) {
            // All touches ended
            clearLongPress();

            // Handle pinch/pan end
            if (touchState.isPinching) {
                touchState.isPinching = false;
                if (onPinchEnd) {
                    onPinchEnd();
                }
            }
            if (touchState.isTwoFingerPanning) {
                touchState.isTwoFingerPanning = false;
                if (onTwoFingerPanEnd) {
                    onTwoFingerPanEnd();
                }
            }

            // Handle single touch end
            if (changedTouches.length === 1 && touchState.singleTouchStart) {
                const pos = getTouchPos(changedTouches[0]);
                const timeDelta = Date.now() - touchState.singleTouchStartTime;

                if (touchState.isSelectionDragging) {
                    // End of selection-box drag (long-press → drag)
                    if (onSelectionDragEnd) {
                        onSelectionDragEnd(pos.x, pos.y);
                    }
                } else if (touchState.longPressArmed) {
                    // Armed long-press released without dragging → deferred right-click
                    if (onLongPress) {
                        onLongPress(pos.x, pos.y);
                    }
                } else if (touchState.isDragging) {
                    // End of pan drag
                    if (onDragEnd) {
                        onDragEnd(pos.x, pos.y, true);
                    }
                } else if (!touchState.hasMoved) {
                    // Quick tap (not armed, not dragged)
                    if (onTap) {
                        onTap(pos.x, pos.y);
                    }
                } else {
                    // End without drag (moved past tap threshold but not drag threshold)
                    if (onDragEnd) {
                        onDragEnd(pos.x, pos.y, false);
                    }
                }
            }

            // Reset state
            touchState.singleTouchStart = null;
            touchState.isDragging = false;
            touchState.isSelectionDragging = false;
            touchState.hasMoved = false;
            touchState.longPressArmed = false;

        } else if (touches.length === 1) {
            // Went from 2 touches to 1
            touchState.isPinching = false;
            touchState.isTwoFingerPanning = false;
            if (onPinchEnd) {
                onPinchEnd();
            }
            if (onTwoFingerPanEnd) {
                onTwoFingerPanEnd();
            }

            // Reset for single touch tracking - don't arm a long-press from this finger
            const pos = getTouchPos(touches[0]);
            touchState.singleTouchStart = pos;
            touchState.singleTouchStartTime = Date.now();
            touchState.hasMoved = false;
            touchState.longPressArmed = false;
            touchState.isSelectionDragging = false;
            touchState.dragStartX = pos.x;
            touchState.dragStartY = pos.y;
        }
    }

    // Touch cancel handler
    function handleTouchCancel(e) {
        e.preventDefault();
        clearLongPress();
        touchState.isPinching = false;
        touchState.isTwoFingerPanning = false;
        touchState.isDragging = false;
        touchState.isSelectionDragging = false;
        touchState.singleTouchStart = null;
        touchState.hasMoved = false;
        touchState.longPressArmed = false;
    }

    // Add event listeners
    canvas.addEventListener('touchstart', handleTouchStart, { passive: false });
    canvas.addEventListener('touchmove', handleTouchMove, { passive: false });
    canvas.addEventListener('touchend', handleTouchEnd, { passive: false });
    canvas.addEventListener('touchcancel', handleTouchCancel, { passive: false });

    // Return cleanup function
    return function cleanup() {
        canvas.removeEventListener('touchstart', handleTouchStart);
        canvas.removeEventListener('touchmove', handleTouchMove);
        canvas.removeEventListener('touchend', handleTouchEnd);
        canvas.removeEventListener('touchcancel', handleTouchCancel);
        clearLongPress();
    };
}

/**
 * Get current touch state (for debugging/UI)
 */
export function getTouchState() {
    return {
        isPinching: touchState.isPinching,
        isTwoFingerPanning: touchState.isTwoFingerPanning,
        isDragging: touchState.isDragging,
        isSelectionDragging: touchState.isSelectionDragging,
        longPressArmed: touchState.longPressArmed,
    };
}

/**
 * Reset touch state (useful when changing scenes)
 */
export function resetTouchState() {
    if (touchState.longPressTimer) {
        clearTimeout(touchState.longPressTimer);
        touchState.longPressTimer = null;
    }
    touchState.touches = [];
    touchState.singleTouchStart = null;
    touchState.isPinching = false;
    touchState.isTwoFingerPanning = false;
    touchState.isDragging = false;
    touchState.isSelectionDragging = false;
    touchState.hasMoved = false;
    touchState.longPressArmed = false;
}
