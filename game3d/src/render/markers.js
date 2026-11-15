import * as THREE from 'three';
import { hexToPixel, hexKey, hexDistance } from '@grog/hex.js';
import { getShipVisualPos } from '@grog/systems/shipMovement.js';
import { isHexExplored } from '@grog/fogOfWar.js';
import { isValidPortSite, isValidSettlementSite, isValidTowerSite } from '@grog/gameState.js';
import { PALETTE } from '../palette.js';
import { unlitMaterial, bakeColor } from '../util/geo.js';
import { hexToWorld, grogToWorld, HEX_R } from '../world.js';
import { tileTop } from '../art/terrain.js';
import { SHIP_SIZE } from '../art/ships.js';
import { STRUCTURE_SIZE } from '../art/structures.js';

// Everything drawn *about* the game rather than *in* it: selection rings, waypoint trails, rally
// flags, attack-target rings, patrol loops and the placement grid. All unlit (sim-taxi rule: a
// marker's content is its colour, so neither the sun nor the haze gets a say), all instanced.

const MAX = 512;
const dummy = new THREE.Object3D();
const col = new THREE.Color();

function pool(geometry, material, name, order) {
  const m = new THREE.InstancedMesh(geometry, material, MAX);
  m.name = name;
  m.frustumCulled = false;   // see effects.js — an instanced pool must never latch a bounding sphere
  m.count = 0;
  m.renderOrder = order;
  m.setColorAt(0, col.set('#fff'));
  return m;
}

const ringGeo = bakeColor(new THREE.RingGeometry(0.86, 1, 40).rotateX(-Math.PI / 2), '#ffffff');
const dotGeo = bakeColor(new THREE.CircleGeometry(0.22, 8).rotateX(-Math.PI / 2), '#ffffff');
const hexGeo = bakeColor(new THREE.CircleGeometry(HEX_R * 0.9, 6).rotateX(-Math.PI / 2), '#ffffff');
const hexRimGeo = bakeColor(new THREE.RingGeometry(HEX_R * 0.78, HEX_R * 0.93, 6, 1).rotateX(-Math.PI / 2), '#ffffff');
const flagGeo = (() => {
  const pole = new THREE.CylinderGeometry(0.06, 0.06, 2.2, 5).translate(0, 1.1, 0);
  const cloth = new THREE.BoxGeometry(0.8, 0.5, 0.05).translate(0.4, 1.9, 0);
  return [bakeColor(pole, '#ffffff'), bakeColor(cloth, '#ffffff')];
})();

export function createMarkers(scene, map, rings) {
  const overlay = { transparent: true, depthWrite: false, vertexColors: false };
  const rings_ = pool(ringGeo, unlitMaterial({ ...overlay, opacity: 0.95 }), 'select-rings', 5);
  const dots = pool(dotGeo, unlitMaterial({ ...overlay, opacity: 0.85 }), 'path-dots', 5);
  const hexes = pool(hexGeo, unlitMaterial({ ...overlay, opacity: 0.28 }), 'place-hexes', 3);
  const rims = pool(hexRimGeo, unlitMaterial({ ...overlay, opacity: 0.9 }), 'hover-hex', 4);
  const poles = pool(flagGeo[0], unlitMaterial({}), 'flag-poles', 5);
  const cloths = pool(flagGeo[1], unlitMaterial({}), 'flag-cloths', 5);
  const group = new THREE.Group();
  group.name = 'markers';
  group.add(rings_, dots, hexes, rims, poles, cloths);
  scene.add(group);

  const groundY = (q, r) => {
    const t = map.tiles.get(hexKey(q, r));
    return t && t.type === 'land' ? tileTop(t, rings) : 0;
  };

  function put(mesh, i, x, y, z, s, color, rotY = 0) {
    if (i >= MAX) return i;
    dummy.position.set(x, y, z);
    dummy.rotation.set(0, rotY, 0);
    dummy.scale.setScalar(s);
    dummy.updateMatrix();
    mesh.setMatrixAt(i, dummy.matrix);
    mesh.setColorAt(i, col.set(color));
    return i + 1;
  }
  function finish(mesh, n) {
    mesh.count = n;
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }

  /** Dots from a start point through a list of hexes — a ship's path or route. */
  function trail(n, from, hexesList, color, spacing = 1.6) {
    let px = from.x, pz = from.z;
    for (const h of hexesList) {
      const p = hexToWorld(h.q, h.r);
      const len = Math.hypot(p.x - px, p.z - pz);
      const steps = Math.max(1, Math.floor(len / spacing));
      for (let s = 1; s <= steps; s++) {
        const t = s / steps;
        n = put(dots, n, px + (p.x - px) * t, 0.45, pz + (p.z - pz) * t, 1, color);
      }
      px = p.x; pz = p.z;
    }
    return n;
  }

  return {
    update(gameState, fogState, hover, time) {
      let nr = 0, nd = 0, nh = 0, nrim = 0, nf = 0;
      const pulse = 1 + Math.sin(time * 5) * 0.04;

      // Selection rings and the trails/flags of what is selected.
      for (const sel of gameState.selectedUnits) {
        const list = sel.type === 'ship' ? gameState.ships : sel.type === 'port' ? gameState.ports
          : sel.type === 'tower' ? gameState.towers : gameState.settlements;
        const e = list[sel.index];
        if (!e) continue;
        const mine = e.owner === 'player';
        const c = mine ? PALETTE.select : PALETTE.selectEnemy;
        if (sel.type === 'ship') {
          const p = getShipVisualPos(hexToPixel, e);
          const w = grogToWorld(p.x, p.y);
          nr = put(rings_, nr, w.x, 0.5, w.z, (SHIP_SIZE[e.type] || 3.5) * 0.62 * pulse, c);
          if (mine) {
            const path = e.path && e.path.length ? e.path : [];
            nd = trail(nd, w, path, PALETTE.waypoint);
            // Queued waypoints beyond the current path get a flag each.
            for (const wp of e.waypoints || []) {
              const q = hexToWorld(wp.q, wp.r);
              nf = putFlag(nf, q.x, 0.2, q.z, PALETTE.waypoint);
            }
            if (e.isPatrolling && e.patrolRoute && e.patrolRoute.length > 1) {
              const loop = [...e.patrolRoute, e.patrolRoute[0]];
              const start = hexToWorld(loop[0].q, loop[0].r);
              nd = trail(nd, start, loop.slice(1), '#9fe3ff', 2.2);
            }
            if (e.attackTarget) {
              const t = targetPos(gameState, e.attackTarget);
              if (t) nr = put(rings_, nr, t.x, 0.6, t.z, t.r * pulse, PALETTE.selectEnemy);
            }
          }
        } else {
          const p = hexToWorld(e.q, e.r);
          const size = (STRUCTURE_SIZE[sel.type === 'settlement' ? 'settlement' : e.type] || { r: 2 }).r;
          nr = put(rings_, nr, p.x, groundY(e.q, e.r) + 0.12, p.z, size * 1.25 * pulse, c);
          if (mine && e.rallyPoint) {
            const q = hexToWorld(e.rallyPoint.q, e.rallyPoint.r);
            nd = trail(nd, p, [e.rallyPoint], '#ffe08a', 2.0);
            nf = putFlag(nf, q.x, 0.2, q.z, '#ffe08a');
          }
        }
      }

      // Placement modes: every valid site the 2D game would highlight, green in range, amber
      // out of range (port builds then become "sail there and build"), and a rim on the hovered one.
      const pm = gameState.portBuildMode, sm = gameState.settlementBuildMode, tm = gameState.towerBuildMode;
      if (pm.active || sm.active || tm.active) {
        let builder = null, maxD = Infinity, validate = null, builderPort = null;
        if (pm.active) {
          builder = gameState.ships[pm.builderShipIndex];
          maxD = 5;
          validate = (q, r) => isValidPortSite(map, q, r, gameState.ports, gameState.towers, gameState.settlements);
        } else if (sm.active) {
          builder = builderPort = gameState.ports[sm.builderPortIndex];
          maxD = 10;
          validate = (q, r) => hexDistance(builder.q, builder.r, q, r) <= 10 &&
            isValidSettlementSite(map, q, r, gameState.settlements, gameState.ports, gameState.towers, builderPort);
        } else {
          builder = tm.builderShipIndex !== null ? gameState.ships[tm.builderShipIndex] : gameState.ports[tm.builderPortIndex];
          builderPort = tm.builderPortIndex !== null ? gameState.ports[tm.builderPortIndex] : null;
          maxD = 5;
          validate = (q, r) => hexDistance(builder.q, builder.r, q, r) <= 5 &&
            isValidTowerSite(map, q, r, gameState.towers, gameState.ports, gameState.settlements, builderPort);
        }
        if (builder) {
          for (const t of map.tiles.values()) {
            if (t.type !== 'land') continue;
            if (pm.active && !t.isPortSite) continue;
            if (!pm.active && hexDistance(builder.q, builder.r, t.q, t.r) > maxD) continue;
            if (!isHexExplored(fogState, t.q, t.r)) continue;
            if (!validate(t.q, t.r)) continue;
            const p = hexToWorld(t.q, t.r);
            const far = pm.active && hexDistance(builder.q, builder.r, t.q, t.r) > maxD;
            nh = put(hexes, nh, p.x, tileTop(t, rings) + 0.15, p.z, 1, far ? PALETTE.placeFar : PALETTE.placeOk);
          }
        }
        const hh = pm.active ? pm.hoveredHex : sm.active ? sm.hoveredHex : tm.hoveredHex;
        if (hh) {
          const p = hexToWorld(hh.q, hh.r);
          nrim = put(rims, nrim, p.x, groundY(hh.q, hh.r) + 0.2, p.z, 1, hh.deferred ? PALETTE.placeFar : PALETTE.placeOk);
        }
      } else if (hover && hover.hex) {
        // A faint rim under the cursor, so the hex grid the sim thinks in is always legible.
        const p = hexToWorld(hover.hex.q, hover.hex.r);
        const t = map.tiles.get(hexKey(hover.hex.q, hover.hex.r));
        if (t && isHexExplored(fogState, t.q, t.r)) {
          nrim = put(rims, nrim, p.x, (t.type === 'land' ? tileTop(t, rings) : 0.45) + 0.12, p.z, 1,
            gameState.actionMode.active === 'attack' || gameState.actionMode.active === 'broadside' ? PALETTE.selectEnemy : '#ffffff');
        }
      }

      finish(rings_, nr); finish(dots, nd); finish(hexes, nh); finish(rims, nrim);
      finish(poles, nf); finish(cloths, nf);

      function putFlag(n, x, y, z, color) {
        put(poles, n, x, y, z, 1, color);
        return put(cloths, n, x, y, z, 1, color);
      }
    },
  };
}

function targetPos(gameState, t) {
  const list = t.type === 'ship' ? gameState.ships : t.type === 'port' ? gameState.ports
    : t.type === 'tower' ? gameState.towers : gameState.settlements;
  const e = list[t.index];
  if (!e) return null;
  if (t.type === 'ship') {
    const p = getShipVisualPos(hexToPixel, e);
    const w = grogToWorld(p.x, p.y);
    return { x: w.x, z: w.z, r: (SHIP_SIZE[e.type] || 3.5) * 0.7 };
  }
  const p = hexToWorld(e.q, e.r);
  return { x: p.x, z: p.z, r: 3 };
}
