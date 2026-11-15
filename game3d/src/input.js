import { hexToPixel, hexDistance } from '@grog/hex.js';
import {
  clearSelection, addToSelection, getSelectedShips, exitActionMode, exitPatrolMode, showNotification,
  isValidPortSite, isValidSettlementSite, isValidTowerSite, isPirateShip, isShipBuildingPort, isShipBuildingTower,
  saveSelectionToGroup, recallSelectionFromGroup, getHomePortIndex,
} from '@grog/gameState.js';
import {
  handlePortPlacementClick, handleSettlementPlacementClick, handleTowerPlacementClick, handleUnitSelection,
  handleWaypointClick, handlePatrolWaypointClick, handleAttackClick, handleBroadsideClick, handlePortRallyPointClick,
  handleTradeRouteClick, handleHomePortUnloadClick,
} from '@grog/systems/inputHandler.js';
import { getShipVisualPos } from '@grog/systems/shipMovement.js';
import { HEX_SIZE } from '@grog/hex.js';
import { screenToGround, worldToScreen } from './render/camera.js';
import { worldToGrog, worldToHex, grogToWorld, hexToWorld } from './world.js';
import { shipCommand, cancelPlacement, lightTNT } from './actions.js';

// Mouse and keyboard, mapped onto the 2D game's click semantics. Every click becomes a point on
// the sea (a ray against y = 0), converted to Grog pixels, and handed to the same inputHandler
// functions gameScene.js calls, in the same priority order:
//
//   left:  placement → action mode (move/attack/broadside/patrol/rally) → select → deselect
//   right: cancel placement → attack → plunder (shift) → unload → patrol point → rally / waypoint
//
// Drags: left-drag is a selection box, right- or middle-drag pans. Arrow keys pan, the wheel
// zooms toward the cursor, H snaps home, Esc backs out of whatever mode is open.

const SELECTION_RADIUS = HEX_SIZE * 1.2;
const DRAG = 6;
const DOUBLE_CLICK = 350;

export function createInput({ canvas, cam, session, sfx, onBox }) {
  const { gameState, map, fogState } = session;
  const vp = () => ({ w: canvas.clientWidth, h: canvas.clientHeight });
  const keys = new Set();
  const mouse = { x: 0, y: 0, inside: false };
  let left = null;    // { x, y, box }
  let right = null;   // { x, y, panning }
  let lastClick = { unit: null, time: 0 };
  const hover = { hex: null };
  const ac = new AbortController();
  const sig = { signal: ac.signal };
  const getPos = (s) => getShipVisualPos(hexToPixel, s);

  function pointer(e) {
    const r = canvas.getBoundingClientRect();
    mouse.x = e.clientX - r.left;
    mouse.y = e.clientY - r.top;
  }

  function worldAt(px, py) {
    const { w, h } = vp();
    // Ships and their hit circles sit on the sea, so the sea plane is the right one to pick on;
    // a building on a raised island is still within SELECTION_RADIUS of its hex centre.
    const p = screenToGround(cam.camera, px, py, w, h, 0.4);
    if (!p) return null;
    const g = worldToGrog(p.x, p.z);
    return { worldX: g.x, worldY: g.y, hex: worldToHex(p.x, p.z), ground: p };
  }

  function updateHover() {
    const at = worldAt(mouse.x, mouse.y);
    hover.hex = at ? at.hex : null;
    // placementUI.js sets hoveredHex while it draws; there is no 2D draw here, so do it now.
    const pm = gameState.portBuildMode, sm = gameState.settlementBuildMode, tm = gameState.towerBuildMode;
    if (!at) return;
    const { q, r } = at.hex;
    if (pm.active) {
      const ship = gameState.ships[pm.builderShipIndex];
      if (ship && isValidPortSite(map, q, r, gameState.ports, gameState.towers, gameState.settlements)) {
        pm.hoveredHex = { q, r, deferred: hexDistance(ship.q, ship.r, q, r) > 5 };
      } else pm.hoveredHex = null;
    } else if (sm.active) {
      const port = gameState.ports[sm.builderPortIndex];
      sm.hoveredHex = port && hexDistance(port.q, port.r, q, r) <= 10 &&
        isValidSettlementSite(map, q, r, gameState.settlements, gameState.ports, gameState.towers, port) ? { q, r } : null;
    } else if (tm.active) {
      const b = tm.builderShipIndex !== null ? gameState.ships[tm.builderShipIndex] : gameState.ports[tm.builderPortIndex];
      const bp = tm.builderPortIndex !== null ? gameState.ports[tm.builderPortIndex] : null;
      tm.hoveredHex = b && hexDistance(b.q, b.r, q, r) <= 5 &&
        isValidTowerSite(map, q, r, gameState.towers, gameState.ports, gameState.settlements, bp) ? { q, r } : null;
    }
  }

  // --- Left click: gameScene.handleClick, minus its panels (the DOM HUD eats its own clicks). ---
  function leftClick(shift, meta) {
    if (gameState.gameOver || gameState.surrenderPending) return;
    updateHover();
    if (handlePortPlacementClick(gameState, map) || handleSettlementPlacementClick(gameState) || handleTowerPlacementClick(gameState)) {
      sfx.play('ui'); return;
    }
    const at = worldAt(mouse.x, mouse.y);
    if (!at) return;
    const { worldX, worldY, hex } = at;
    const mode = gameState.actionMode.active;

    if (mode === 'move') {
      handleWaypointClick(gameState, map, hex, shift);
      exitActionMode(gameState);
      return;
    }
    if (mode === 'attack') {
      if (!handleAttackClick(gameState, map, worldX, worldY, hexToPixel, SELECTION_RADIUS, getPos, shift, true)) {
        handleWaypointClick(gameState, map, hex, shift);
        for (const s of getSelectedShips(gameState)) s.guardMode = true;
      }
      exitActionMode(gameState);
      return;
    }
    if (mode === 'broadside') {
      const res = handleBroadsideClick(gameState, map, worldX, worldY, hexToPixel, SELECTION_RADIUS, getPos);
      if (res && res.fired) exitActionMode(gameState);
      else if (res && !res.fired) showNotification(gameState, 'No water approach to target');
      return;
    }
    if (mode === 'patrol') {
      const u = handleUnitSelection(gameState, worldX, worldY, hexToPixel, SELECTION_RADIUS, false, getPos);
      if (u) { exitActionMode(gameState); exitPatrolMode(gameState); return; }
      handlePatrolWaypointClick(gameState, map, hex);
      return;
    }
    if (mode === 'rally') {
      if (handlePortRallyPointClick(gameState, map, hex)) sfx.play('waypoint');
      exitActionMode(gameState);
      return;
    }

    let clicked = false;
    if (meta) {
      if (handleAttackClick(gameState, map, worldX, worldY, hexToPixel, SELECTION_RADIUS, getPos)) return;
      if (handleTradeRouteClick(gameState, map, worldX, worldY, hexToPixel, SELECTION_RADIUS)) clicked = true;
      else if (handleHomePortUnloadClick(gameState, map, worldX, worldY, hexToPixel, SELECTION_RADIUS)) clicked = true;
    }
    if (!clicked) {
      const u = handleUnitSelection(gameState, worldX, worldY, hexToPixel, SELECTION_RADIUS, shift, getPos);
      clicked = !!u;
      if (u && gameState.actionMode.active) { exitActionMode(gameState); exitPatrolMode(gameState); }
      if (u) {
        const sub = u.type === 'ship' ? gameState.ships[u.index].type : u.type === 'port' ? gameState.ports[u.index].type
          : u.type === 'tower' ? gameState.towers[u.index].type : 'settlement';
        const now = performance.now();
        if (lastClick.unit && lastClick.unit.type === u.type && lastClick.unit.sub === sub && now - lastClick.time < DOUBLE_CLICK) {
          selectAllOfTypeInView(u.type, sub);
          lastClick = { unit: null, time: 0 };
        } else {
          sfx.play(u.type === 'ship' ? 'select-ship' : 'select-port');
          lastClick = { unit: { type: u.type, sub }, time: now };
        }
      } else lastClick = { unit: null, time: 0 };
    }
    if (!clicked) {
      if (meta) {
        if (handlePortRallyPointClick(gameState, map, hex)) sfx.play('waypoint');
        else handleWaypointClick(gameState, map, hex, shift);
      } else if (!shift) clearSelection(gameState);
    }
  }

  // --- Right click: gameScene.handleRightClick. ---
  function rightClick(shift) {
    if (gameState.gameOver || gameState.surrenderPending) return;
    if (cancelPlacement(gameState)) return;
    const at = worldAt(mouse.x, mouse.y);
    if (!at) return;
    const { worldX, worldY, hex } = at;
    if (handleAttackClick(gameState, map, worldX, worldY, hexToPixel, SELECTION_RADIUS, getPos, shift)) { sfx.play('ui'); return; }
    if (handleTradeRouteClick(gameState, map, worldX, worldY, hexToPixel, SELECTION_RADIUS, shift)) return;
    if (handleHomePortUnloadClick(gameState, map, worldX, worldY, hexToPixel, SELECTION_RADIUS)) return;
    if (gameState.patrolMode.active) { handlePatrolWaypointClick(gameState, map, hex); return; }
    if (handlePortRallyPointClick(gameState, map, hex)) sfx.play('waypoint');
    else if (handleWaypointClick(gameState, map, hex, shift)) sfx.play('waypoint');
  }

  function shipsOnScreen(test) {
    const { w, h } = vp();
    const out = [];
    gameState.ships.forEach((s, i) => {
      if (isPirateShip(s) || s.owner !== 'player') return;
      const p = getPos(s);
      const wp = grogToWorld(p.x, p.y);
      const sp = worldToScreen(cam.camera, wp.x, 0.5, wp.z, w, h);
      if (test(sp, s, i)) out.push(i);
    });
    return out;
  }

  function selectAllOfTypeInView(type, sub) {
    const { w, h } = vp();
    const on = (sp) => sp.x >= -50 && sp.x <= w + 50 && sp.y >= -50 && sp.y <= h + 50;
    clearSelection(gameState);
    if (type === 'ship') {
      for (const i of shipsOnScreen((sp, s, k) => s.type === sub && on(sp) &&
        !isShipBuildingPort(k, gameState.ports) && !isShipBuildingTower(k, gameState.towers))) addToSelection(gameState, 'ship', i);
      return;
    }
    const list = type === 'port' ? gameState.ports : type === 'tower' ? gameState.towers : gameState.settlements;
    list.forEach((e, i) => {
      if (e.owner !== 'player') return;
      if (type !== 'settlement' && e.type !== sub) return;
      const p = hexToWorld(e.q, e.r);
      if (on(worldToScreen(cam.camera, p.x, 0, p.z, w, h))) addToSelection(gameState, type, i);
    });
  }

  function boxSelect(x0, y0, x1, y1, shift) {
    const l = Math.min(x0, x1), r = Math.max(x0, x1), t = Math.min(y0, y1), b = Math.max(y0, y1);
    if (!shift) clearSelection(gameState);
    const inBox = (sp) => sp.x >= l && sp.x <= r && sp.y >= t && sp.y <= b;
    const ships = shipsOnScreen((sp) => inBox(sp));
    for (const i of ships) addToSelection(gameState, 'ship', i);
    if (ships.length) sfx.play('select-ship');
    const { w, h } = vp();
    gameState.ports.forEach((p, i) => {
      if (p.owner !== 'player') return;
      const wp = hexToWorld(p.q, p.r);
      if (inBox(worldToScreen(cam.camera, wp.x, 0, wp.z, w, h))) addToSelection(gameState, 'port', i);
    });
  }

  // --- Events -----------------------------------------------------------------------------------
  canvas.addEventListener('contextmenu', (e) => e.preventDefault(), sig);
  canvas.addEventListener('pointermove', (e) => {
    pointer(e);
    mouse.inside = true;
    if (right && (right.panning || Math.hypot(mouse.x - right.x, mouse.y - right.y) > DRAG)) {
      right.panning = true;
      cam.panScreen(e.movementX, e.movementY, vp().h);
    }
    if (left && Math.hypot(mouse.x - left.x, mouse.y - left.y) > DRAG) {
      left.box = true;
      onBox({ x0: left.x, y0: left.y, x1: mouse.x, y1: mouse.y });
    }
  }, sig);
  canvas.addEventListener('pointerleave', () => { mouse.inside = false; }, sig);
  canvas.addEventListener('pointerdown', (e) => {
    pointer(e);
    canvas.setPointerCapture(e.pointerId);
    if (e.button === 0) left = { x: mouse.x, y: mouse.y, box: false };
    else right = { x: mouse.x, y: mouse.y, panning: e.button === 1 };
  }, sig);
  canvas.addEventListener('pointerup', (e) => {
    pointer(e);
    if (e.button === 0 && left) {
      if (left.box) boxSelect(left.x, left.y, mouse.x, mouse.y, e.shiftKey);
      else leftClick(e.shiftKey, e.metaKey || e.ctrlKey);
      left = null;
      onBox(null);
    } else if (right) {
      if (!right.panning && e.button === 2) rightClick(e.shiftKey);
      right = null;
    }
  }, sig);
  canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    const { w, h } = vp();
    const before = screenToGround(cam.camera, mouse.x, mouse.y, w, h);
    cam.zoomBy(Math.exp(e.deltaY * 0.0012));
    cam.update(0);
    const after = screenToGround(cam.camera, mouse.x, mouse.y, w, h);
    if (before && after) cam.panWorld(before.x - after.x, before.z - after.z);
  }, { passive: false, signal: ac.signal });

  function snapHome() {
    const i = getHomePortIndex(gameState, map);
    const p = i !== null ? gameState.ports[i] : gameState.ports.find((pp) => pp.owner === 'player');
    if (p) { const w = hexToWorld(p.q, p.r); cam.lookAt(w.x, w.z + 8); }
  }

  window.addEventListener('keydown', (e) => {
    if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT')) return;
    keys.add(e.key.toLowerCase());
    const k = e.key.toLowerCase();
    const shipsSel = getSelectedShips(gameState).filter((s) => s.owner === 'player');
    // Control groups: Ctrl/Cmd+digit saves, digit recalls (double-tap centres).
    if (/^[0-9]$/.test(k)) {
      const slot = Number(k);
      if (e.ctrlKey || e.metaKey) { saveSelectionToGroup(gameState, slot); showNotification(gameState, `Group ${slot} saved`); }
      else recallSelectionFromGroup(gameState, slot);
      e.preventDefault();
      return;
    }
    if (k === 'escape') {
      if (!cancelPlacement(gameState)) {
        if (gameState.actionMode.active) { exitActionMode(gameState); exitPatrolMode(gameState); }
        else clearSelection(gameState);
      }
    } else if (k === 'h') snapHome();
    else if (shipsSel.length && ['m', 'a', 'p'].includes(k) && !e.repeat && !keys.has('control')) {
      shipCommand(gameState, { m: 'move', a: 'attack', p: 'patrol' }[k]);
    } else if (k === 'b' && shipsSel.length) shipCommand(gameState, 'broadside');
    else if (k === 'k' && shipsSel.length) lightTNT(gameState);
    else if (k === 'r' && !shipsSel.length && gameState.selectedUnits.some((u) => u.type === 'port')) shipCommand(gameState, 'rally');
    else if (k === ' ') { gameState.timeScale = gameState.timeScale === 0 ? 1 : 0; e.preventDefault(); }
    else if (k === '=' || k === '+') cam.zoomBy(0.85);
    else if (k === '-') cam.zoomBy(1.18);
  }, sig);
  window.addEventListener('keyup', (e) => keys.delete(e.key.toLowerCase()), sig);
  window.addEventListener('blur', () => keys.clear(), sig);

  return {
    hover,
    snapHome,
    dispose() { ac.abort(); },
    /** A right-click on the minimap: gameScene.handleMinimapActionClick, minus targeting. */
    commandAt(x, z, shift) {
      if (gameState.gameOver || gameState.surrenderPending) return;
      const hex = worldToHex(x, z);
      if (gameState.actionMode.active === 'patrol' || gameState.patrolMode.active) { handlePatrolWaypointClick(gameState, map, hex); return; }
      if (handlePortRallyPointClick(gameState, map, hex)) sfx.play('waypoint');
      else if (handleWaypointClick(gameState, map, hex, shift)) sfx.play('waypoint');
      if (gameState.actionMode.active === 'move' || gameState.actionMode.active === 'rally') exitActionMode(gameState);
    },
    update(dt) {
      // Keyboard pan, at a speed that scales with zoom so it feels the same in and out.
      const s = cam.state.zoom * 1.6 * dt;
      let dx = 0, dz = 0;
      // Arrows only: Grog's letter keys are already commands (A attack, P patrol, M move…).
      if (keys.has('arrowleft')) dx -= s;
      if (keys.has('arrowright')) dx += s;
      if (keys.has('arrowup')) dz -= s;
      if (keys.has('arrowdown')) dz += s;
      if (dx || dz) cam.panWorld(dx, dz);
      if (mouse.inside) updateHover();
    },
  };
}
