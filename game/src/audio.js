// Centralized audio playback with per-category volume settings.
//
// Two categories: 'music' (composed background tracks: title, mode-card,
// ambient-music) and 'sfx' (everything else, including ambient-ocean and
// combat sounds). Each call applies the current category multiplier to the
// caller's base volume, so existing per-sound mix levels are preserved.
//
// Looping plays are tracked so live slider drags in the settings panel
// update them without restarting the loop. One-shots aren't tracked since
// they finish before a slider drag matters.

const STORAGE_KEY = 'grog.audio.v1';
const DEFAULTS = { music: 1.0, sfx: 1.0 };

function clamp01(v) {
    if (typeof v !== 'number' || Number.isNaN(v)) return 1.0;
    return Math.max(0, Math.min(1, v));
}

function loadSettings() {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return { ...DEFAULTS };
        const parsed = JSON.parse(raw);
        return {
            music: clamp01(parsed.music ?? DEFAULTS.music),
            sfx: clamp01(parsed.sfx ?? DEFAULTS.sfx),
        };
    } catch (e) {
        return { ...DEFAULTS };
    }
}

const settings = loadSettings();
const trackedLoops = new Set();  // { handle, base, category }

function saveSettings() {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    } catch (e) {
        // localStorage may be unavailable (private browsing) - just skip persist
    }
}

function applyTrackedVolumes(category) {
    for (const entry of trackedLoops) {
        if (entry.category !== category) continue;
        try {
            entry.handle.volume = entry.base * settings[category];
        } catch (e) {
            trackedLoops.delete(entry);
        }
    }
}

export function getMusicVolume() { return settings.music; }
export function getSfxVolume() { return settings.sfx; }

export function setMusicVolume(v) {
    settings.music = clamp01(v);
    saveSettings();
    applyTrackedVolumes('music');
}

export function setSfxVolume(v) {
    settings.sfx = clamp01(v);
    saveSettings();
    applyTrackedVolumes('sfx');
}

function trackLoopHandle(handle, base, category) {
    const entry = { handle, base, category };
    trackedLoops.add(entry);
    // Clean up when the clip ends or is stopped externally so the set
    // doesn't grow unbounded across scene re-entries.
    try {
        if (typeof handle.onEnd === 'function') {
            handle.onEnd(() => trackedLoops.delete(entry));
        }
    } catch (e) {}
    const origStop = typeof handle.stop === 'function' ? handle.stop.bind(handle) : null;
    if (origStop) {
        handle.stop = (...args) => {
            trackedLoops.delete(entry);
            return origStop(...args);
        };
    }
}

function play(k, category, name, opts = {}) {
    const base = typeof opts.volume === 'number' ? opts.volume : 1.0;
    const handle = k.play(name, { ...opts, volume: base * settings[category] });
    if (opts.loop) trackLoopHandle(handle, base, category);
    return handle;
}

export function playMusic(k, name, opts = {}) {
    return play(k, 'music', name, opts);
}

export function playSfx(k, name, opts = {}) {
    return play(k, 'sfx', name, opts);
}
