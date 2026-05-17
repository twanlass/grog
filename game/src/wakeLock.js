// Keeps the screen awake during gameplay.
// iOS Safari dims and then locks the screen when it considers the device idle;
// canvas taps don't reset its idle timer, so we hold a Screen Wake Lock and
// re-acquire it whenever the page becomes visible again (the lock is released
// automatically on visibility change).
let wakeLock = null;

async function acquire() {
    if (!('wakeLock' in navigator)) return;
    if (document.visibilityState !== 'visible') return;
    try {
        wakeLock = await navigator.wakeLock.request('screen');
        wakeLock.addEventListener('release', () => {
            wakeLock = null;
        });
    } catch (e) {
        wakeLock = null;
    }
}

export function enableScreenWakeLock() {
    acquire();
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible' && wakeLock === null) {
            acquire();
        }
    });
    // Safari can drop the lock when returning from bfcache without firing
    // visibilitychange; pageshow covers that case.
    window.addEventListener('pageshow', () => {
        if (wakeLock === null) acquire();
    });
}
