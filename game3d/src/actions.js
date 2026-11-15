import { SHIPS } from '@grog/sprites/ships.js';
import {
  enterActionMode, exitActionMode, enterPatrolMode, exitPatrolMode, getSelectedShips, showNotification,
  isShipBuildingPort, isShipBuildingTower, isPirateShip, exitPortBuildMode, exitSettlementBuildMode,
  exitTowerBuildMode,
} from '@grog/gameState.js';
import {
  handleBuildPanelClick, handleShipBuildPanelClick, handleTowerInfoPanelClick, handleSettlementInfoPanelClick,
  handleBuildQueueClick,
} from '@grog/systems/inputHandler.js';
import { armTNT } from '@grog/systems/combat.js';

// Every HUD button, routed through the 2D game's own panel handlers.
//
// The handlers in inputHandler.js hit-test a click against a `bounds` object the Kaplay panel drew
// that frame ({ x, y, width, height, buttons: [{ y, height, shipType }], upgradeButton, ... }). The
// DOM HUD has no such rectangles, so each button here builds a one-button bounds with that button
// at (0, 0, 1, 1) and "clicks" it at (0.5, 0.5). That keeps every rule — affordability, crew cap,
// queue limits, "port busy", the notifications — in exactly one place: the 2D game's code.

const HIT = { x: 0, y: 0, width: 1, height: 1 };
const BTN = { y: 0, height: 1 };
const click = (fn, bounds, ...rest) => fn(0.5, 0.5, { ...HIT, buttons: [], ...bounds }, ...rest);

export function buildShip(gameState, portIndex, shipType) {
  return click(handleBuildPanelClick, { portIndex, buttons: [{ ...BTN, shipType }] }, gameState);
}
export function upgradePort(gameState, portIndex, portType) {
  return click(handleBuildPanelClick, { portIndex, upgradeButton: { ...BTN, portType } }, gameState);
}
export function placeSettlementFrom(gameState, portIndex) {
  return click(handleBuildPanelClick, { portIndex, settlementButton: { ...BTN } }, gameState);
}
export function placeTowerFromPort(gameState, portIndex) {
  return click(handleBuildPanelClick, { portIndex, towerButton: { ...BTN } }, gameState);
}
export function repairPort(gameState, portIndex) {
  return click(handleBuildPanelClick, { portIndex, repairButton: { ...BTN } }, gameState);
}
export function cancelPort(gameState, portIndex, fogState) {
  return click(handleBuildPanelClick, { portIndex, cancelButton: { ...BTN, entityIndex: portIndex } }, gameState, fogState);
}
export function buildPortFromShip(gameState, shipIndex, portType = 'dock') {
  return click(handleShipBuildPanelClick, { shipIndex, buttons: [{ ...BTN, portType }] }, gameState);
}
export function placeTowerFromShip(gameState, shipIndex) {
  return click(handleShipBuildPanelClick, { shipIndex, towerButton: { ...BTN } }, gameState);
}
export function upgradeTower(gameState, towerType, fogState) {
  return click(handleTowerInfoPanelClick, { upgradeButton: { ...BTN, towerType } }, gameState, fogState);
}
export function repairTower(gameState, fogState) {
  return click(handleTowerInfoPanelClick, { repairButton: { ...BTN } }, gameState, fogState);
}
export function cancelTower(gameState, fogState) {
  return click(handleTowerInfoPanelClick, { cancelButton: { ...BTN } }, gameState, fogState);
}
export function repairSettlement(gameState) {
  return click(handleSettlementInfoPanelClick, { repairButton: { ...BTN } }, gameState);
}

/** Cancel one queued ship build — the build-queue panel's per-item ✕ in 2D. */
export function cancelQueueItem(gameState, portIndex, itemIndex) {
  const port = gameState.ports[portIndex];
  const item = port && port.buildQueue[itemIndex];
  if (!item) return false;
  return handleBuildQueueClick(0.5, 0.5, {
    ...HIT,
    items: [{ ...HIT, portIndex, index: itemIndex, shipType: item.shipType, isActive: itemIndex === 0 }],
  }, gameState);
}

/** The ship command row (Move / Attack / Patrol / Broadside / TNT) — gameScene's action buttons. */
export function shipCommand(gameState, id) {
  if (id === 'tnt') return lightTNT(gameState);
  if (gameState.actionMode.active === id) {
    exitActionMode(gameState);
    if (id === 'patrol') exitPatrolMode(gameState);
    return;
  }
  enterActionMode(gameState, id);
  if (id === 'move') showNotification(gameState, 'Choose destination');
  else if (id === 'attack') showNotification(gameState, 'Choose target');
  else if (id === 'broadside') showNotification(gameState, 'Choose Broadside target');
  else if (id === 'rally') showNotification(gameState, 'Select rally point');
  else if (id === 'patrol') {
    enterPatrolMode(gameState);
    for (const ship of getSelectedShips(gameState)) {
      const first = ship.waypoints && ship.waypoints.length ? { q: ship.waypoints[0].q, r: ship.waypoints[0].r } : { q: ship.q, r: ship.r };
      ship.patrolRoute = [first];
      ship.isPatrolling = true;
      ship.showRouteLine = true;
    }
    showNotification(gameState, 'Choose patrol route');
  }
}

export function lightTNT(gameState) {
  let n = 0;
  for (const sel of gameState.selectedUnits) {
    if (sel.type !== 'ship') continue;
    if (isShipBuildingPort(sel.index, gameState.ports) || isShipBuildingTower(sel.index, gameState.towers)) continue;
    const ship = gameState.ships[sel.index];
    if (!ship || isPirateShip(ship) || ship.owner !== 'player') continue;
    if (!SHIPS[ship.type]?.tntAttack) continue;
    if (armTNT(gameState, sel.index)) n++;
  }
  if (n) showNotification(gameState, n > 1 ? `TNT lit on ${n} ships!` : 'TNT lit!');
}

/** The commands available to a set of ships — uiPanels.getShipActionButtons, same rules. */
export function shipCommandButtons(ships) {
  const out = [
    { id: 'move', label: 'Move', hotkey: 'M' },
    { id: 'attack', label: 'Attack', hotkey: 'A' },
    { id: 'patrol', label: 'Patrol', hotkey: 'P' },
  ];
  const bursts = ships.map((s) => SHIPS[s.type]?.burstAttack);
  if (bursts.length && bursts.every(Boolean)) {
    let ready = 1;
    ships.forEach((s, i) => {
      const rem = s.burstCooldown || 0;
      if (rem > 0 && bursts[i].cooldown > 0) ready = Math.min(ready, 1 - rem / bursts[i].cooldown);
    });
    out.push({ id: 'broadside', label: bursts[0].name || 'Broadside', hotkey: bursts[0].hotkey || 'B', ready });
  }
  const tnts = ships.map((s) => SHIPS[s.type]?.tntAttack);
  if (tnts.length && tnts.every(Boolean)) {
    const unarmed = ships.some((s) => !s.tntFuse || s.tntFuse <= 0);
    out.push({ id: 'tnt', label: tnts[0].name || 'TNT', hotkey: tnts[0].hotkey || 'K', ready: unarmed ? 1 : 0 });
  }
  return out;
}

export function cancelPlacement(gameState) {
  if (gameState.portBuildMode.active) { exitPortBuildMode(gameState); return true; }
  if (gameState.settlementBuildMode.active) { exitSettlementBuildMode(gameState); return true; }
  if (gameState.towerBuildMode.active) { exitTowerBuildMode(gameState); return true; }
  return false;
}
