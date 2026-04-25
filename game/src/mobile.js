// Mobile detection helper - true for touch-primary devices
// Uses pointer media query (most reliable) plus a UA fallback for older browsers
let cached = null;
export function isMobile() {
    if (cached !== null) return cached;
    if (typeof window === 'undefined') return false;
    let result = false;
    if (window.matchMedia) {
        result = window.matchMedia('(hover: none) and (pointer: coarse)').matches;
    }
    if (!result && typeof navigator !== 'undefined') {
        result = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent || '');
    }
    cached = result;
    return result;
}
