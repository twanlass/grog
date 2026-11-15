// Sound: the 2D game's own recordings (game/public/sounds, served as this build's publicDir),
// played through Web Audio with the same two categories game/src/audio.js keeps — music and sfx —
// and the same storage key, so a player's volume settings carry between the 2D and 3D builds.
//
// Audio cannot start until the page has been touched (every browser's autoplay rule), so nothing
// is created until `unlock()` runs off the first pointer or key press.

const STORAGE_KEY = 'grog.audio.v1';
const FILES = {
  ui: ['sounds/ui/ui-click.mp3'],
  'select-ship': [1, 2, 3, 4, 5].map((i) => `sounds/units/ships/selected-${i}.mp3`),
  'select-port': ['sounds/units/ports/selected-1.mp3'],
  waypoint: ['sounds/units/ports/waypoint-1.mp3', 'sounds/units/ports/waypoint-2.mp3'],
  'cannon-fire': [1, 2, 3, 4].map((i) => `sounds/units/cannons/fire-${i}.mp3`),
  'cannon-impact': [1, 2, 3, 4, 5].map((i) => `sounds/units/cannons/impact-${i}.mp3`),
  'arrow-fire': [1, 2, 3, 4].map((i) => `sounds/units/crossbow-tower/arrow-${i}.mp3`),
  ocean: ['sounds/ambient/ocean.mp3'],
  music: ['sounds/ambient/background-music.mp3'],
  title: ['sounds/grog-title.mp3'],
};
const MIX = { ui: 0.5, 'select-ship': 0.5, 'select-port': 0.5, waypoint: 0.45, 'cannon-fire': 0.35, 'cannon-impact': 0.35, 'arrow-fire': 0.3 };

function load() {
  try {
    const s = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    return { music: s.music ?? 1, sfx: s.sfx ?? 1, muted: !!s.muted };
  } catch { return { music: 1, sfx: 1, muted: false }; }
}

export function createSfx() {
  const settings = load();
  let ctx = null;
  let musicBus = null;
  let sfxBus = null;
  const buffers = new Map();
  const loops = new Map();
  const lastPlayed = new Map();

  function save() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(settings)); } catch { /* private mode */ }
  }
  function applyVolumes() {
    if (!ctx) return;
    musicBus.gain.value = settings.muted ? 0 : settings.music;
    sfxBus.gain.value = settings.muted ? 0 : settings.sfx;
  }

  async function fetchBuffer(url) {
    if (buffers.has(url)) return buffers.get(url);
    const p = fetch(url).then((r) => r.arrayBuffer()).then((b) => ctx.decodeAudioData(b)).catch(() => null);
    buffers.set(url, p);
    return p;
  }

  function unlock() {
    if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    musicBus = ctx.createGain(); musicBus.connect(ctx.destination);
    sfxBus = ctx.createGain(); sfxBus.connect(ctx.destination);
    applyVolumes();
    for (const list of Object.values(FILES)) for (const u of list) fetchBuffer(u);
  }

  async function play(name, { volume = 1 } = {}) {
    if (!ctx || settings.muted) return;
    // Rate-limit identical sounds: a 10-ship volley is one boom, not ten stacked.
    const now = ctx.currentTime;
    if ((lastPlayed.get(name) || -1) > now - 0.06) return;
    lastPlayed.set(name, now);
    const list = FILES[name];
    if (!list) return;
    const buf = await fetchBuffer(list[Math.floor(Math.random() * list.length)]);
    if (!buf) return;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const g = ctx.createGain();
    g.gain.value = (MIX[name] ?? 0.5) * volume;
    src.connect(g).connect(sfxBus);
    src.start();
  }

  async function loop(name, volume, category) {
    if (!ctx || loops.has(name)) return;
    loops.set(name, null);
    const buf = await fetchBuffer(FILES[name][0]);
    if (!buf) return;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    const g = ctx.createGain();
    g.gain.value = volume;
    src.connect(g).connect(category === 'music' ? musicBus : sfxBus);
    src.start();
    loops.set(name, src);
  }
  function stopLoop(name) {
    const src = loops.get(name);
    if (src) src.stop();
    loops.delete(name);
  }

  return {
    unlock, play, loop, stopLoop,
    get settings() { return settings; },
    setMuted(m) { settings.muted = m; applyVolumes(); save(); },
    setVolume(cat, v) { settings[cat] = v; applyVolumes(); save(); },
    suspend(on) { if (ctx) (on ? ctx.suspend() : ctx.resume()); },
  };
}
