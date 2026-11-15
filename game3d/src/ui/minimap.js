import { hexToPixel, hexKey } from '@grog/hex.js';
import { isHexExplored, isHexVisible, shouldRenderEntity } from '@grog/fogOfWar.js';
import { getShipVisualPos } from '@grog/systems/shipMovement.js';
import { TILE_TYPES } from '@grog/mapGenerator.js';
import { PALETTE, ownerColor } from '../palette.js';
import { grogToWorld, worldToGrog, worldToHex, mapBounds, hexToWorld } from '../world.js';
import { screenToGround } from '../render/camera.js';

// The 2D game's minimap (rendering/minimap.js) as a small canvas in the corner: terrain under fog,
// unit dots in faction colours, the camera's ground footprint, click to jump, right-click to send
// the selection there. Drawn at ~6 Hz; the terrain layer is cached and only redrawn when the
// explored set grows.

const SIZE = 190;

export function createMinimap(root, { session, cam, canvas, onCommand }) {
  const { map, gameState, fogState } = session;
  const el = document.createElement('canvas');
  el.className = 'minimap';
  el.width = SIZE * 2; el.height = SIZE * 2;
  root.appendChild(el);
  const ctx = el.getContext('2d');
  const terrain = document.createElement('canvas');
  terrain.width = el.width; terrain.height = el.height;
  const tctx = terrain.getContext('2d');

  const b = mapBounds(map);
  const span = Math.max(b.maxX - b.minX, b.maxZ - b.minZ);
  const k = (el.width - 8) / span;
  const ox = 4 + ((el.width - 8) - (b.maxX - b.minX) * k) / 2;
  const oz = 4 + ((el.height - 8) - (b.maxZ - b.minZ) * k) / 2;
  const toMini = (x, z) => [ox + (x - b.minX) * k, oz + (z - b.minZ) * k];
  const fromMini = (mx, mz) => [b.minX + (mx - ox) / k, b.minZ + (mz - oz) / k];

  const colors = {
    [TILE_TYPES.DEEP_OCEAN]: PALETTE.deep, [TILE_TYPES.OCEAN]: PALETTE.ocean,
    [TILE_TYPES.SHALLOW]: PALETTE.shallow, [TILE_TYPES.LAND]: PALETTE.grass,
  };
  let exploredCount = -1;
  function drawTerrain() {
    tctx.clearRect(0, 0, terrain.width, terrain.height);
    const r = 4 * k * 1.05;
    for (const t of map.tiles.values()) {
      const { x, z } = hexToWorld(t.q, t.r);
      const [mx, mz] = toMini(x, z);
      const explored = isHexExplored(fogState, t.q, t.r) || fogState.debugHideFog;
      tctx.fillStyle = explored ? (t.type === TILE_TYPES.LAND ? (t.climate === 'arctic' ? PALETTE.snow : t.climate === 'tropical' ? PALETTE.sand : PALETTE.grass) : colors[t.type]) : PALETTE.fogUnexplored;
      tctx.beginPath();
      for (let i = 0; i < 6; i++) {
        const a = (Math.PI / 3) * i;
        const px = mx + Math.cos(a) * r, pz = mz + Math.sin(a) * r;
        if (i) tctx.lineTo(px, pz); else tctx.moveTo(px, pz);
      }
      tctx.fill();
    }
  }

  function draw() {
    if (fogState.exploredHexes.size !== exploredCount) { exploredCount = fogState.exploredHexes.size; drawTerrain(); }
    ctx.clearRect(0, 0, el.width, el.height);
    ctx.drawImage(terrain, 0, 0);
    // Shroud: darken explored hexes not currently in sight.
    ctx.fillStyle = 'rgba(10,16,30,0.45)';
    const r = 4 * k;
    for (const key of fogState.exploredHexes) {
      const [q, rr] = key.split(',').map(Number);
      if (isHexVisible(fogState, q, rr)) continue;
      const { x, z } = hexToWorld(q, rr);
      const [mx, mz] = toMini(x, z);
      ctx.fillRect(mx - r, mz - r, r * 2, r * 2);
    }
    const dot = (x, z, c, s) => { const [mx, mz] = toMini(x, z); ctx.fillStyle = c; ctx.fillRect(mx - s / 2, mz - s / 2, s, s); };
    for (const list of [gameState.ports, gameState.settlements, gameState.towers]) {
      for (const e of list) {
        if (!shouldRenderEntity(fogState, e) && !isHexExplored(fogState, e.q, e.r)) continue;
        const { x, z } = hexToWorld(e.q, e.r);
        dot(x, z, ownerColor(e.owner), list === gameState.ports ? 9 : 6);
      }
    }
    for (const s of gameState.ships) {
      if (!shouldRenderEntity(fogState, s)) continue;
      const p = getShipVisualPos(hexToPixel, s);
      const w = grogToWorld(p.x, p.y);
      dot(w.x, w.z, ownerColor(s.owner), 5);
    }
    // Camera footprint: the four screen corners on the sea.
    const vw = canvas.clientWidth, vh = canvas.clientHeight;
    const pts = [[0, 0], [vw, 0], [vw, vh], [0, vh]].map(([x, y]) => screenToGround(cam.camera, x, y, vw, vh)).filter(Boolean);
    if (pts.length === 4) {
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 2;
      ctx.beginPath();
      pts.forEach((p, i) => { const [mx, mz] = toMini(p.x, p.z); if (i) ctx.lineTo(mx, mz); else ctx.moveTo(mx, mz); });
      ctx.closePath(); ctx.stroke();
    }
  }

  function at(e) {
    const r = el.getBoundingClientRect();
    return fromMini((e.clientX - r.left) * (el.width / r.width), (e.clientY - r.top) * (el.height / r.height));
  }
  let dragging = false;
  el.addEventListener('contextmenu', (e) => e.preventDefault());
  el.addEventListener('pointerdown', (e) => {
    e.stopPropagation();
    const [x, z] = at(e);
    if (e.button === 2) { onCommand(x, z, e.shiftKey); return; }
    dragging = true; el.setPointerCapture(e.pointerId);
    cam.lookAt(x, z);
  });
  el.addEventListener('pointermove', (e) => { if (dragging) { const [x, z] = at(e); cam.lookAt(x, z); } });
  el.addEventListener('pointerup', () => { dragging = false; });

  let t = 1;
  return {
    update(dt) { t += dt; if (t > 0.16) { t = 0; draw(); } },
  };
}
