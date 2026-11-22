import * as THREE from 'three';
import { hexToPixel, hexKey, hexNeighbors } from '@grog/hex.js';
import { isWater } from '@grog/mapGenerator.js';
import { getShipVisualPos } from '@grog/systems/shipMovement.js';
import { shouldRenderEntity } from '@grog/fogOfWar.js';
import { SHIPS } from '@grog/sprites/ships.js';
import { PORTS } from '@grog/sprites/ports.js';
import { TOWERS } from '@grog/sprites/towers.js';
import { SETTLEMENTS } from '@grog/sprites/settlements.js';
import { PALETTE, ownerColor } from '../palette.js';
import { surfaceMaterial, unlitMaterial, hash01 } from '../util/geo.js';
import { shipGeometry, SHIP_SIZE, SHIP_HEIGHT } from '../art/ships.js';
import { structureGeometry, scaffoldGeometry, STRUCTURE_SIZE } from '../art/structures.js';
import { tileTop } from '../art/terrain.js';
import { grogToWorld, hexToWorld, HEX_R } from '../world.js';
import { BILLBOARD } from './camera.js';

// Keeps one mesh per Grog entity, in step with gameState every frame. The sim owns every number;
// this file only *reads* gameState — positions from getShipVisualPos (the same interpolation the
// 2D renderer draws with), visibility from shouldRenderEntity, construction progress, hit flashes —
// and never writes to it.

const unitMat = surfaceMaterial({ key: 'units' });
const flashMat = unlitMaterial({ color: '#ffffff' });
const hexMats = new Map();
function factionHexMat(owner) {
  if (!hexMats.has(owner)) {
    // A territory mark, not a slab: a firm line at the hex's edge fading to a light wash inside,
    // so the ground and whatever is built on it still read through it.
    hexMats.set(owner, new THREE.ShaderMaterial({
      uniforms: { uColor: { value: new THREE.Color(ownerColor(owner)) } },
      vertexShader: /* glsl */ `varying vec2 vP; void main() { vP = position.xz; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: /* glsl */ `
        uniform vec3 uColor;
        varying vec2 vP;
        void main() {
          float e = max(abs(vP.y), max(abs(vP.x * 0.8660254 + vP.y * 0.5), abs(vP.x * 0.8660254 - vP.y * 0.5))) / ${(0.92 * 3.4641016).toFixed(5)};
          float a = 0.07 + 0.2 * smoothstep(0.55, 0.95, e) + 0.5 * smoothstep(0.9, 0.97, e);
          gl_FragColor = vec4(uColor, a);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
      transparent: true, depthWrite: false, side: THREE.DoubleSide,
    }));
  }
  return hexMats.get(owner);
}

/**
 * The territory mark for one hex, draped over the ground: each of the hex's six triangles cut into
 * sixteen, every vertex lifted to the terrain under it. A flat disc was half buried wherever the
 * ground rose away from the building's pad.
 */
function drapedHex(cx, cz, heightAt) {
  const R = HEX_R * 0.92, N = 4, pos = [];
  const corner = (i) => [Math.cos((i * Math.PI) / 3) * R, Math.sin((i * Math.PI) / 3) * R];
  const at = (ax, az, bx, bz, u, v) => {
    const x = ax * u + bx * v, z = az * u + bz * v;
    pos.push(x, Math.max(heightAt(cx + x, cz + z), 0.02) + 0.07, z);
  };
  for (let i = 0; i < 6; i++) {
    const [ax, az] = corner(i), [bx, bz] = corner(i + 1);
    for (let a = 0; a < N; a++) {
      for (let b = 0; b < N - a; b++) {
        const u0 = a / N, v0 = b / N, d = 1 / N;
        at(ax, az, bx, bz, u0, v0); at(ax, az, bx, bz, u0 + d, v0); at(ax, az, bx, bz, u0, v0 + d);
        if (b < N - a - 1) { at(ax, az, bx, bz, u0 + d, v0); at(ax, az, bx, bz, u0 + d, v0 + d); at(ax, az, bx, bz, u0, v0 + d); }
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  return g;
}

// Bars: a unit-height quad, scaled. Billboarded with the camera's own orientation.
const barGeo = new THREE.PlaneGeometry(1, 1);
const barBackMat = unlitMaterial({ color: PALETTE.healthBack, transparent: true, opacity: 0.75, depthTest: false });
const barMats = {
  good: unlitMaterial({ color: PALETTE.healthGood, depthTest: false }),
  mid: unlitMaterial({ color: PALETTE.healthMid, depthTest: false }),
  bad: unlitMaterial({ color: PALETTE.healthBad, depthTest: false }),
  progress: unlitMaterial({ color: PALETTE.progress, depthTest: false }),
};

function makeBar() {
  const g = new THREE.Group();
  const back = new THREE.Mesh(barGeo, barBackMat);
  const fill = new THREE.Mesh(barGeo, barMats.good);
  back.renderOrder = 20; fill.renderOrder = 21;
  fill.position.z = 0.01;
  g.add(back, fill);
  g.userData.fill = fill;
  g.visible = false;
  return g;
}

function setBar(bar, frac, width, mat) {
  const fill = bar.userData.fill;
  bar.scale.set(width, 0.36, 1);
  frac = THREE.MathUtils.clamp(frac, 0, 1);
  fill.scale.set(Math.max(frac, 0.001), 0.7, 1);
  fill.position.x = -(1 - frac) / 2;
  fill.material = mat;
  bar.visible = true;
}

function healthMat(frac) {
  return frac > 0.6 ? barMats.good : frac > 0.3 ? barMats.mid : barMats.bad;
}

/** Angle (about +Y, from +X) toward the most open water around a coastal hex. */
function seaFacing(map, q, r) {
  let sx = 0, sz = 0;
  const c = hexToWorld(q, r);
  for (const n of hexNeighbors(q, r)) {
    if (!isWater(map.tiles.get(hexKey(n.q, n.r)))) continue;
    const p = hexToWorld(n.q, n.r);
    sx += p.x - c.x; sz += p.z - c.z;
  }
  if (sx === 0 && sz === 0) return 0;
  // rotation.y turns +X toward -Z for positive angles, so negate the z component.
  return Math.atan2(-sz, sx);
}

export function createUnitLayer(scene, map, rings, field = null) {
  const group = new THREE.Group();
  group.name = 'units';
  scene.add(group);
  const records = new Map();

  function makeRecord(kind, entity) {
    const root = new THREE.Group();
    const body = new THREE.Mesh();
    body.castShadow = true;
    body.receiveShadow = true;
    root.add(body);
    const rec = { kind, root, body, typeKey: null, yaw: 0, seen: 0, bar: makeBar(), bar2: makeBar(), hex: null, scaffold: null };
    group.add(root);
    rec.bar.userData.noAO = rec.bar2.userData.noAO = true;
    group.add(rec.bar, rec.bar2);
    if (kind !== 'ship') {
      const hw = hexToWorld(entity.q, entity.r);
      rec.hex = new THREE.Mesh(drapedHex(hw.x, hw.z, field ? field.heightAt : () => groundY(entity.q, entity.r)), factionHexMat(entity.owner));
      rec.hex.renderOrder = 1;
      rec.hex.userData.noAO = true;
      group.add(rec.hex);
    }
    records.set(entity.id, rec);
    return rec;
  }

  function dispose(id, rec) {
    group.remove(rec.root, rec.bar, rec.bar2);
    if (rec.hex) { group.remove(rec.hex); rec.hex.geometry.dispose(); }
    records.delete(id);
  }

  function groundY(q, r) {
    return tileTop(map.tiles.get(hexKey(q, r)), rings);
  }

  function syncStructure(kind, e, frame, fogState, selected) {
    let rec = records.get(e.id) || makeRecord(kind, e);
    rec.seen = frame;
    const type = kind === 'settlement' ? 'settlement' : e.type;
    const typeKey = `${type}:${e.owner}`;
    if (rec.typeKey !== typeKey) {
      rec.typeKey = typeKey;
      rec.body.geometry = structureGeometry(kind === 'settlement' ? 'settlement' : kind, type, e.owner, Math.abs(e.q * 7 + e.r * 13));
      if (rec.hex) rec.hex.material = factionHexMat(e.owner);
      rec.size = STRUCTURE_SIZE[type] || { r: 2, h: 2 };
    }
    const visible = shouldRenderEntity(fogState, e);
    rec.root.visible = visible;
    if (rec.hex) rec.hex.visible = visible;
    if (!visible) { rec.bar.visible = false; rec.bar2.visible = false; return rec; }

    const { x, z } = hexToWorld(e.q, e.r);
    const y = groundY(e.q, e.r);
    rec.root.position.set(x, y, z);
    if (kind === 'port') rec.root.rotation.y = seaFacing(map, e.q, e.r);
    else rec.root.rotation.y = (hash01(e.q, e.r) - 0.5) * 1.2;
    rec.hex.position.set(x, 0, z);

    // Construction (new build or upgrade): rise out of a scaffold.
    const con = e.construction;
    if (con && !con.upgradeTo) {
      const p = THREE.MathUtils.clamp(con.progress / con.buildTime, 0, 1);
      rec.body.scale.set(1, 0.15 + 0.85 * p, 1);
    } else {
      rec.body.scale.set(1, 1, 1);
    }
    // Hearths: lit once the building stands. Chimney anchors turn with the building (about Y only).
    if (!con) {
      const th = rec.root.rotation.y, c = Math.cos(th), sn = Math.sin(th);
      for (const a of rec.body.geometry.userData.smoke || []) {
        chimneys.push(x + a.x * c + a.z * sn, y + a.y, z - a.x * sn + a.z * c);
      }
    }
    if (con) {
      if (!rec.scaffold) {
        rec.scaffold = new THREE.Mesh(scaffoldGeometry(rec.size.r * 1.2, rec.size.h * 0.9), unitMat);
        rec.scaffold.castShadow = true;
        rec.root.add(rec.scaffold);
      }
      rec.scaffold.visible = true;
    } else if (rec.scaffold) {
      rec.scaffold.visible = false;
    }

    rec.body.material = e.hitFlash > 0 ? flashMat : unitMat;

    // Bars: health when hurt or selected; progress for construction, ship builds, repairs.
    const maxHp = kind === 'port' ? PORTS[e.type].health : kind === 'tower' ? TOWERS[e.type].health : SETTLEMENTS.settlement.health;
    const hp = e.health / maxHp;
    const top = y + rec.size.h + 0.9;
    let progress = null;
    if (con) progress = con.progress / con.buildTime;
    else if (e.repair) progress = e.repair.progress / e.repair.totalTime;
    else if (kind === 'port' && e.buildQueue && e.buildQueue.length && e.buildQueue[0].progress !== null) {
      const item = e.buildQueue[0];
      progress = item.progress / (item.buildTime || SHIPS[item.shipType]?.buildTime || 1);
    }
    placeBar(rec.bar, x, top, z, (hp < 0.999 || selected) && !con, hp, rec.size.r * 1.1, healthMat(hp));
    placeBar(rec.bar2, x, top - 0.5, z, progress !== null, progress ?? 0, rec.size.r * 1.1, barMats.progress);
    return rec;
  }

  function placeBar(bar, x, y, z, show, frac, width, mat) {
    if (!show) { bar.visible = false; return; }
    setBar(bar, frac, width, mat);
    bar.position.set(x, y, z);
    bar.quaternion.copy(BILLBOARD);
  }

  function syncShip(ship, frame, fogState, time, selected) {
    let rec = records.get(ship.id) || makeRecord('ship', ship);
    rec.seen = frame;
    const typeKey = `${ship.type}:${ship.owner}`;
    if (rec.typeKey !== typeKey) {
      rec.typeKey = typeKey;
      rec.body.geometry = shipGeometry(ship.type, ship.owner);
      rec.yaw = -(ship.heading || 0);
    }
    const visible = shouldRenderEntity(fogState, ship);
    rec.root.visible = visible;
    if (!visible) { rec.bar.visible = false; rec.bar2.visible = false; return rec; }

    const p = getShipVisualPos(hexToPixel, ship);
    const { x, z } = grogToWorld(p.x, p.y);
    // Heading: Grog's is an angle in pixel space with y down; world z is that y, so the yaw about
    // +Y is its negative. Eased so a 60° hex turn swings rather than snaps.
    const want = -(ship.heading || 0);
    let d = want - rec.yaw;
    d = Math.atan2(Math.sin(d), Math.cos(d));
    rec.yaw += d * Math.min(1, 0.12 + 6 * (1 / 60));
    const phase = hash01(ship.q * 3.1, ship.r * 1.7) * 6.28 + ship.id.length;
    const moving = ship.path && ship.path.length > 0;
    rec.root.position.set(x, Math.sin(time * 1.6 + phase) * 0.08, z);
    rec.root.rotation.set(
      Math.sin(time * 1.3 + phase) * 0.05 + (moving ? -Math.sign(d) * 0.06 : 0),
      rec.yaw,
      Math.sin(time * 1.1 + phase * 0.7) * 0.035,
      'YXZ',
    );
    rec.body.material = ship.hitFlash > 0 ? flashMat : unitMat;

    const def = SHIPS[ship.type];
    const hp = ship.health / def.health;
    const top = (SHIP_HEIGHT[ship.type] || 3.5) + 0.6;
    const w = (SHIP_SIZE[ship.type] || 3.5) * 0.75;
    let progress = null;
    if (ship.repair) progress = ship.repair.progress / ship.repair.totalTime;
    else if (ship.dockingState) progress = Math.min(1, ship.dockingState.progress / Math.max(0.01, ship.dockingState.totalUnits * 0.5));
    placeBar(rec.bar, x, top, z, hp < 0.999 || selected, hp, w, healthMat(hp));
    placeBar(rec.bar2, x, top - 0.5, z, progress !== null, progress ?? 0, w, barMats.progress);
    rec.worldPos = { x, z };
    return rec;
  }

  let frame = 0;
  const chimneys = [];     // x, y, z triples of every visible, finished building's chimney tops, this frame
  return {
    group,
    records,
    chimneys,
    update(gameState, fogState, time, selectedSet) {
      frame++;
      chimneys.length = 0;
      for (const s of gameState.ships) syncShip(s, frame, fogState, time, selectedSet.has(s.id));
      for (const p of gameState.ports) syncStructure('port', p, frame, fogState, selectedSet.has(p.id));
      for (const s of gameState.settlements) syncStructure('settlement', s, frame, fogState, selectedSet.has(s.id));
      for (const t of gameState.towers) syncStructure('tower', t, frame, fogState, selectedSet.has(t.id));
      for (const [id, rec] of records) if (rec.seen !== frame) dispose(id, rec);
    },
    /** World position of an entity's mesh, for markers and DOM labels. */
    positionOf(id) {
      const rec = records.get(id);
      return rec ? rec.root.position : null;
    },
  };
}
