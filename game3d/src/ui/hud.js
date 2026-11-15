import { SHIPS } from '@grog/sprites/ships.js';
import { PORTS } from '@grog/sprites/ports.js';
import { TOWERS } from '@grog/sprites/towers.js';
import { SETTLEMENTS } from '@grog/sprites/settlements.js';
import {
  getNextPortType, getNextTowerType, canAfford, computeCrewStatus, getBuildableShips, isPortBuildingSettlement,
  isShipBuildingPort, isShipBuildingTower, getHomePortIndex,
} from '@grog/gameState.js';
import { getRepairCost } from '@grog/systems/repair.js';
import { getWaveStatus } from '@grog/systems/waveSpawner.js';
import * as act from '../actions.js';
import { worldToScreen } from '../render/camera.js';
import { hexToWorld } from '../world.js';
import { ownerColor } from '../palette.js';

// The HUD is DOM over the canvas — sim-taxi's approach (its pedals, run-end card and panels are all
// HTML) rather than the 3,600 lines of hand-placed Kaplay rectangles the 2D game draws. Panel
// contents follow the 2D panels one for one: what a port can build, upgrade to and repair, what a
// ship can do, tower upgrades, the build queue with its ✕. Every button calls actions.js, which
// routes it through the 2D game's own panel handlers.

const OWNER_NAMES = { player: 'You', ai1: 'Green', ai2: 'Blue', ai3: 'Orange', pirate: 'Pirates', player2: 'Blue' };

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const cost = (c) => (c && c.wood ? `<span class="wood">${c.wood}</span>` : '');
const crew = (n) => (n ? `<span class="crew">${n}</span>` : '');

function btn(action, label, { sub = '', disabled = false, active = false, hotkey = '', title = '', fill = null } = {}) {
  const f = fill !== null && fill < 1 ? `<i class="cd" style="width:${Math.round(fill * 100)}%"></i>` : '';
  return `<button data-a="${esc(action)}" class="${active ? 'on' : ''}" ${disabled ? 'disabled' : ''} title="${esc(title)}">${f}<b>${esc(label)}</b>${sub ? `<small>${sub}</small>` : ''}${hotkey ? `<kbd>${hotkey}</kbd>` : ''}</button>`;
}

function hpBar(hp, max) {
  const f = Math.max(0, Math.min(1, hp / max));
  const c = f > 0.6 ? 'good' : f > 0.3 ? 'mid' : 'bad';
  return `<div class="hp"><i class="${c}" style="width:${(f * 100).toFixed(0)}%"></i><span>${Math.ceil(hp)} / ${max}</span></div>`;
}
function progBar(f, label) {
  return `<div class="prog"><i style="width:${(Math.max(0, Math.min(1, f)) * 100).toFixed(0)}%"></i><span>${esc(label)}</span></div>`;
}

export function createHud(root, { session, sfx, cam, onQuit, onRestart }) {
  const { gameState, map, fogState } = session;
  root.innerHTML = `
    <div class="bar top-left"><div id="res"></div><div id="mode"></div></div>
    <div class="bar top-right">
      <div class="speeds" id="speeds"></div>
      <button data-a="mute" id="mute" title="Mute (sound)">♪</button>
      <button data-a="help" title="Controls">?</button>
      <button data-a="menu" title="Menu">☰</button>
    </div>
    <div class="panel" id="panel"></div>
    <div class="toast" id="toast"></div>
    <div class="hint" id="hint"></div>
    <div class="labels" id="labels"></div>
    <div class="box" id="box"></div>
    <div class="overlay" id="overlay"></div>`;
  const $ = (id) => root.querySelector(`#${id}`);
  const panel = $('panel'), res = $('res'), mode = $('mode'), speeds = $('speeds'), toast = $('toast');
  const hint = $('hint'), labels = $('labels'), box = $('box'), overlay = $('overlay'), mute = $('mute');
  let overlayKind = null;
  let lastPanel = '';

  root.addEventListener('pointerdown', (e) => { if (e.target.closest('button,.panel,.overlay,.bar')) e.stopPropagation(); });
  root.addEventListener('click', (e) => {
    const b = e.target.closest('button[data-a]');
    if (!b || b.disabled) return;
    sfx.play('ui');
    run(b.dataset.a);
    lastPanel = '';   // force a redraw so the button state reflects the action at once
  });

  function sel(type) {
    return gameState.selectedUnits.filter((u) => u.type === type)
      .map((u) => ({ i: u.index, e: (type === 'ship' ? gameState.ships : type === 'port' ? gameState.ports : type === 'tower' ? gameState.towers : gameState.settlements)[u.index] }))
      .filter((x) => x.e);
  }

  function run(a) {
    const [cmd, arg, arg2] = a.split(':');
    const one = (type) => sel(type)[0];
    switch (cmd) {
      case 'speed': gameState.timeScale = Number(arg); break;
      case 'mute': sfx.setMuted(!sfx.settings.muted); break;
      case 'help': showOverlay(overlayKind === 'help' ? null : 'help'); break;
      case 'menu': showOverlay(overlayKind === 'menu' ? null : 'menu'); break;
      case 'close': showOverlay(null); break;
      case 'quit': showOverlay(null); onQuit(); break;
      case 'restart': showOverlay(null); onRestart(); break;
      case 'surrender-accept': session.acceptSurrender(); break;
      case 'surrender-decline': session.declineSurrender(); break;
      case 'cmd': act.shipCommand(gameState, arg); break;
      case 'ship': act.buildShip(gameState, one('port').i, arg); break;
      case 'upgrade': act.upgradePort(gameState, one('port').i, arg); break;
      case 'settle': act.placeSettlementFrom(gameState, one('port').i); break;
      case 'ptower': act.placeTowerFromPort(gameState, one('port').i); break;
      case 'prepair': act.repairPort(gameState, one('port').i); break;
      case 'pcancel': act.cancelPort(gameState, one('port').i, fogState); break;
      case 'qcancel': act.cancelQueueItem(gameState, Number(arg), Number(arg2)); break;
      case 'dock': act.buildPortFromShip(gameState, one('ship').i, 'dock'); break;
      case 'stower': act.placeTowerFromShip(gameState, one('ship').i); break;
      case 'tupgrade': act.upgradeTower(gameState, arg, fogState); break;
      case 'trepair': act.repairTower(gameState, fogState); break;
      case 'tcancel': act.cancelTower(gameState, fogState); break;
      case 'srepair': act.repairSettlement(gameState); break;
      case 'cancel-place': act.cancelPlacement(gameState); break;
      case 'home': {
        const i = getHomePortIndex(gameState, map);
        if (i !== null) { const p = gameState.ports[i]; const w = hexToWorld(p.q, p.r); cam.lookAt(w.x, w.z + 8); }
        break;
      }
      default: break;
    }
  }

  // --- Panels --------------------------------------------------------------------------------------
  function portPanel(i, port) {
    const d = PORTS[port.type];
    const r = gameState.resources;
    let h = `<h3>${esc(d.name)}${i === getHomePortIndex(gameState, map) ? ' <em>home</em>' : ''}</h3>${hpBar(port.health, d.health)}`;
    if (port.construction) {
      const c = port.construction;
      h += progBar(c.progress / c.buildTime, c.upgradeTo ? `Upgrading to ${PORTS[c.upgradeTo].name}` : 'Under construction');
      h += `<div class="row">${btn('pcancel', 'Cancel', { sub: 'refund' })}</div>`;
      return h;
    }
    if (port.storage && port.storage.wood > 0 && i !== getHomePortIndex(gameState, map)) h += `<p class="dim">Stored: ${cost(port.storage)} — send a ship to collect</p>`;
    if (port.buildQueue.length) {
      h += '<div class="queue">';
      port.buildQueue.forEach((item, k) => {
        const p = item.progress !== null ? item.progress / (item.buildTime || 1) : 0;
        h += `<button data-a="qcancel:${i}:${k}" class="qi" title="Cancel">${k === 0 ? `<i class="cd" style="width:${Math.round(p * 100)}%"></i>` : ''}<b>${esc(SHIPS[item.shipType].name)}</b><small>✕</small></button>`;
      });
      h += '</div>';
    }
    const busySettle = isPortBuildingSettlement(i, gameState.settlements);
    const full = port.buildQueue.length >= (d.maxQueueSize || 3);
    h += '<h4>Ships</h4><div class="grid">';
    for (const t of getBuildableShips(port)) {
      const s = SHIPS[t];
      h += btn(`ship:${t}`, s.name, { sub: `${cost(s.cost)} ${crew(s.crewCost)} · ${s.build_time}s`, disabled: full || !!port.repair || (port.buildQueue.length === 0 && !canAfford(r, s.cost)), title: s.description });
    }
    h += '</div><h4>Build</h4><div class="grid">';
    h += btn('settle', 'Settlement', { sub: `${cost(SETTLEMENTS.settlement.cost)} · +${SETTLEMENTS.settlement.crewCapContribution} crew`, disabled: busySettle || !!port.repair || !canAfford(r, SETTLEMENTS.settlement.cost), title: SETTLEMENTS.settlement.description, active: gameState.settlementBuildMode.active });
    h += btn('ptower', 'Watchtower', { sub: `${cost(TOWERS.watchtower.cost)} ${crew(TOWERS.watchtower.crewCost)}`, disabled: !!port.repair || !canAfford(r, TOWERS.watchtower.cost), title: TOWERS.watchtower.description, active: gameState.towerBuildMode.active });
    const next = getNextPortType(port.type);
    if (next) {
      const nd = PORTS[next];
      h += btn(`upgrade:${next}`, `→ ${nd.name}`, { sub: `${cost(nd.cost)} · ${nd.buildTime}s`, disabled: port.buildQueue.length > 0 || busySettle || !!port.repair || !canAfford(r, nd.cost), title: nd.description });
    }
    h += btn('cmd:rally', 'Rally point', { hotkey: 'R', active: gameState.actionMode.active === 'rally' });
    if (port.health < d.health && !port.repair) h += btn('prepair', 'Repair', { sub: cost(getRepairCost('port', port)) });
    h += '</div>';
    if (port.repair) h += progBar(port.repair.progress / port.repair.totalTime, 'Repairing');
    return h;
  }

  function shipPanel(ships) {
    let h = '';
    if (ships.length === 1) {
      const { i, e: s } = ships[0];
      const d = SHIPS[s.type];
      h += `<h3>${esc(d.name)}</h3>${hpBar(s.health, d.health)}`;
      h += `<p class="dim">${esc(d.description)} · speed ${d.speed} · range ${d.attackDistance}${d.cargo ? ` · cargo ${s.cargo?.wood || 0}/${d.cargo}` : ''}</p>`;
      if (s.tradeRoute) h += `<p class="dim">${s.isPlundering ? 'Plundering' : 'Trading'}…</p>`;
      if (s.repair) h += progBar(s.repair.progress / s.repair.totalTime, 'Repairing');
      h += commandGrid(ships.map((x) => x.e));
      const stationary = s.waypoints.length === 0;
      if (stationary && !isShipBuildingPort(i, gameState.ports) && !isShipBuildingTower(i, gameState.towers)) {
        const r = gameState.resources;
        h += '<h4>Build</h4><div class="grid">';
        h += btn('dock', 'Dock', { sub: `${cost(PORTS.dock.cost)} · ${PORTS.dock.buildTime}s`, disabled: !canAfford(r, PORTS.dock.cost), active: gameState.portBuildMode.active, title: 'Click a shore — your ship sails there and builds on arrival' });
        h += btn('stower', 'Watchtower', { sub: `${cost(TOWERS.watchtower.cost)} ${crew(TOWERS.watchtower.crewCost)}`, disabled: !canAfford(r, TOWERS.watchtower.cost), active: gameState.towerBuildMode.active });
        h += '</div>';
      } else if (isShipBuildingPort(i, gameState.ports) || isShipBuildingTower(i, gameState.towers)) {
        h += '<p class="dim">Building…</p>';
      }
    } else {
      const counts = {};
      for (const { e } of ships) counts[e.type] = (counts[e.type] || 0) + 1;
      h += `<h3>${ships.length} ships</h3><p class="dim">${Object.entries(counts).map(([t, n]) => `${n} ${SHIPS[t].name}`).join(' · ')}</p>`;
      h += commandGrid(ships.map((x) => x.e));
    }
    return h;
  }

  function commandGrid(ships) {
    const mine = ships.filter((s) => s.owner === 'player');
    if (!mine.length) return '';
    return `<div class="grid cmds">${act.shipCommandButtons(mine).map((b) => btn(`cmd:${b.id}`, b.label, {
      hotkey: b.hotkey, active: gameState.actionMode.active === b.id, disabled: b.ready !== undefined && b.ready < 1, fill: b.ready ?? null,
    })).join('')}</div><p class="dim tiny">Right-click: move / attack · Shift+right-click a port: plunder</p>`;
  }

  function towerPanel(t) {
    const d = TOWERS[t.type];
    let h = `<h3>${esc(d.name)}</h3>${hpBar(t.health, d.health)}<p class="dim">${esc(d.description)}${d.attackRange ? ` · range ${d.attackRange}` : ''} · sight ${d.sightDistance}</p>`;
    if (t.construction) {
      h += progBar(t.construction.progress / t.construction.buildTime, t.construction.upgradeTo ? `Upgrading to ${TOWERS[t.construction.upgradeTo].name}` : 'Under construction');
      return h + `<div class="row">${btn('tcancel', 'Cancel', { sub: 'refund' })}</div>`;
    }
    h += '<div class="grid">';
    const next = getNextTowerType(t.type);
    if (next) {
      const nd = TOWERS[next];
      h += btn(`tupgrade:${next}`, `→ ${nd.name}`, { sub: `${cost(nd.cost)} ${crew(nd.crewCost)}`, disabled: !canAfford(gameState.resources, nd.cost), title: nd.description });
    }
    if (t.health < d.health && !t.repair) h += btn('trepair', 'Repair', { sub: cost(getRepairCost('tower', t)) });
    h += '</div>';
    if (t.repair) h += progBar(t.repair.progress / t.repair.totalTime, 'Repairing');
    return h;
  }

  function settlementPanel(s) {
    const d = SETTLEMENTS.settlement;
    let h = `<h3>${esc(d.name)}</h3>${hpBar(s.health, d.health)}<p class="dim">${esc(d.description)} · +${d.crewCapContribution} crew</p>`;
    if (s.construction) return h + progBar(s.construction.progress / s.construction.buildTime, 'Under construction');
    if (s.health < d.health && !s.repair) h += `<div class="grid">${btn('srepair', 'Repair', { sub: cost(getRepairCost('settlement', s)) })}</div>`;
    if (s.repair) h += progBar(s.repair.progress / s.repair.totalTime, 'Repairing');
    return h;
  }

  function enemyPanel(type, e) {
    const d = type === 'ship' ? SHIPS[e.type] : type === 'port' ? PORTS[e.type] : type === 'tower' ? TOWERS[e.type] : SETTLEMENTS.settlement;
    return `<h3><span class="swatch" style="background:${ownerColor(e.owner)}"></span>${esc(OWNER_NAMES[e.owner] || e.owner)} ${esc(d.name)}</h3>${hpBar(e.health, d.health)}`;
  }

  function panelHtml() {
    const ships = sel('ship'), ports = sel('port'), towers = sel('tower'), settlements = sel('settlement');
    const all = [...ships, ...ports, ...towers, ...settlements];
    if (!all.length) return '';
    const mine = (x) => x.e.owner === 'player';
    if (ships.length) return ships.some(mine) ? shipPanel(ships.filter(mine)) : enemyPanel('ship', ships[0].e);
    if (ports.length === 1) return mine(ports[0]) ? portPanel(ports[0].i, ports[0].e) : enemyPanel('port', ports[0].e);
    if (ports.length > 1) return `<h3>${ports.length} ports</h3><div class="grid">${btn('cmd:rally', 'Rally point', { hotkey: 'R' })}</div>`;
    if (towers.length) return mine(towers[0]) ? towerPanel(towers[0].e) : enemyPanel('tower', towers[0].e);
    if (settlements.length) return mine(settlements[0]) ? settlementPanel(settlements[0].e) : enemyPanel('settlement', settlements[0].e);
    return '';
  }

  // --- Overlays ------------------------------------------------------------------------------------
  function showOverlay(kind) {
    overlayKind = kind;
    if (!kind) { overlay.className = 'overlay'; overlay.innerHTML = ''; return; }
    overlay.className = 'overlay show';
    if (kind === 'help') {
      overlay.innerHTML = `<div class="card"><h2>Controls</h2><table>
        <tr><td>Left click / drag</td><td>Select · box-select your ships</td></tr>
        <tr><td>Double click</td><td>Select all of that type on screen</td></tr>
        <tr><td>Right click</td><td>Move · attack · set rally point</td></tr>
        <tr><td>Shift + right click</td><td>Plunder an enemy port · queue waypoints</td></tr>
        <tr><td>Right / middle drag, arrows</td><td>Pan</td></tr>
        <tr><td>Wheel, + / −</td><td>Zoom</td></tr>
        <tr><td>M · A · P · B · K</td><td>Move · attack-move · patrol · Broadside · TNT</td></tr>
        <tr><td>R</td><td>Rally point (ports)</td></tr>
        <tr><td>Ctrl+1–9 · 1–9</td><td>Save · recall group</td></tr>
        <tr><td>H · Space · Esc</td><td>Home port · pause · cancel</td></tr></table>
        <div class="row">${btn('close', 'Close')}</div></div>`;
    } else if (kind === 'menu') {
      overlay.innerHTML = `<div class="card"><h2>Paused</h2><div class="col">${btn('close', 'Resume')}${btn('restart', 'Restart')}${btn('quit', 'Quit to title')}</div></div>`;
    }
  }

  function endOverlayHtml() {
    if (gameState.surrenderPending) {
      const who = OWNER_NAMES[gameState.surrenderPending] || gameState.surrenderPending;
      return `<div class="card"><h2>${esc(who)} forces surrender</h2><p>They have no ships and no way to build one.</p><div class="row">${btn('surrender-accept', 'Accept')}${btn('surrender-decline', 'Fight on')}</div></div>`;
    }
    if (gameState.gameOver) {
      const win = gameState.gameOver === 'win';
      return `<div class="card"><h2>${win ? 'Victory' : 'Defeat'}</h2><p>${win ? 'The seas are yours.' : 'Your fleet is gone.'}</p><div class="row">${btn('restart', 'Play again')}${btn('quit', 'Title')}</div></div>`;
    }
    return '';
  }

  // --- Per-frame -----------------------------------------------------------------------------------
  let t = 0;
  const labelPool = [];
  return {
    showBox(b) {
      if (!b) { box.style.display = 'none'; return; }
      box.style.display = 'block';
      box.style.left = `${Math.min(b.x0, b.x1)}px`; box.style.top = `${Math.min(b.y0, b.y1)}px`;
      box.style.width = `${Math.abs(b.x1 - b.x0)}px`; box.style.height = `${Math.abs(b.y1 - b.y0)}px`;
    },
    update(dt, view) {
      t += dt;
      // Floating numbers (+wood, +crew) every frame, so they ride the camera.
      let n = 0;
      for (const f of session.floatingNumbers) {
        const p = hexToWorld(f.q, f.r);
        const s = worldToScreen(cam.camera, p.x, 4 + Math.min(f.age, 0.5) * 3, p.z, view.w, view.h);
        let el = labelPool[n];
        if (!el) { el = document.createElement('div'); el.className = 'float'; labels.appendChild(el); labelPool.push(el); }
        el.style.display = 'block';
        el.style.transform = `translate(${s.x}px, ${s.y}px) translate(-50%, -50%)`;
        el.style.opacity = String(Math.max(0, Math.min(1, (f.duration - f.age) / 0.5)));
        el.className = `float ${f.type}`;
        el.textContent = f.text;
        n++;
      }
      for (let i = n; i < labelPool.length; i++) labelPool[i].style.display = 'none';

      if (t < 0.12) return;   // the panel text only needs ~8 Hz
      t = 0;
      const status = computeCrewStatus(gameState, 'player');
      res.innerHTML = `<span class="wood" title="Wood">${Math.floor(gameState.resources.wood)}</span><span class="crew ${status.available <= 0 ? 'warn' : ''}" title="Crew used / cap">${status.used}/${status.cap}</span>`;
      const wave = getWaveStatus(gameState);
      const m = session.scenario;
      mode.textContent = wave ? wave.message : `${m.name}${gameState.pirateKills ? ` · ${gameState.pirateKills} pirates sunk` : ''}`;
      speeds.innerHTML = [0, 1, 2, 3, 5].map((s) => `<button data-a="speed:${s}" class="${gameState.timeScale === s ? 'on' : ''}">${s === 0 ? '❚❚' : `${s}×`}</button>`).join('');
      mute.classList.toggle('on', !sfx.settings.muted);
      mute.textContent = sfx.settings.muted ? '✕' : '♪';

      const html = panelHtml();
      if (html !== lastPanel) {
        panel.innerHTML = html;
        panel.style.display = html ? 'block' : 'none';
        lastPanel = html;
      }

      const note = gameState.notification;
      toast.textContent = note ? note.message : '';
      toast.style.opacity = note ? '1' : '0';

      const pm = gameState.portBuildMode.active, smm = gameState.settlementBuildMode.active, tm = gameState.towerBuildMode.active;
      const hintText = pm ? 'Click a shore — your ship sails there and builds on arrival'
        : smm ? 'Click a green hex to place the settlement'
          : tm ? 'Click a green hex to place the watchtower'
            : gameState.actionMode.active === 'patrol' ? 'Click to add patrol points · Esc to finish' : '';
      hint.innerHTML = hintText ? `${esc(hintText)} ${btn('cancel-place', 'Cancel', { hotkey: 'Esc' })}` : '';
      hint.style.display = hintText && (pm || smm || tm) ? 'flex' : hintText ? 'flex' : 'none';

      if (!overlayKind || overlayKind === 'end') {
        const end = endOverlayHtml();
        if (end) {
          if (overlay.innerHTML !== end) { overlay.innerHTML = end; overlay.className = 'overlay show'; }
          overlayKind = 'end';
        } else if (overlayKind === 'end') showOverlay(null);
      }
    },
    showOverlay,
  };
}
