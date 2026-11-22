import * as THREE from 'three';
import { hexToPixel } from '@grog/hex.js';
import { shouldRenderEntity, isHexVisible } from '@grog/fogOfWar.js';
import { getShipVisualPos } from '@grog/systems/shipMovement.js';
import { SHIPS } from '@grog/sprites/ships.js';
import { PORTS } from '@grog/sprites/ports.js';
import { TOWERS } from '@grog/sprites/towers.js';
import { SETTLEMENTS } from '@grog/sprites/settlements.js';
import { PALETTE } from '../palette.js';
import { bakeColor, propMaterial, SURFACE_UNIFORMS } from '../util/geo.js';
import { SHIP_SIZE } from '../art/ships.js';
import { createParticles, SHAPE_PUFF, SHAPE_RING, SHAPE_SPARK, SHAPE_FOAM } from './particles.js';
import { hexToWorld, grogToWorld, PX_PER_UNIT } from '../world.js';

// Combat and weather effects, drawn from the arrays the sim already keeps: projectiles,
// shipExplosions, waterSplashes, floatingDebris, lootDrops, woodSplinters, cannonSmoke. Solid
// things (shot, planks, barrels) are one InstancedMesh each, refilled every frame. Everything soft
// (smoke, fire, spray, foam) is a burst of particles (particles.js) emitted the first frame the
// renderer sees a sim event, then left to the particle system: the sim says *that* a ship blew up,
// and the plume it leaves outlives the sim's own record of it.
//
// Every one sets `frustumCulled = false`: sim-taxi's trap — three computes an InstancedMesh's
// bounding sphere once, from the instances as they stood on the first culled frame, and never
// again, so an effect pool that opened empty would latch a sphere of radius −1 and vanish.

const MAX = 256;
const dummy = new THREE.Object3D();
const col = new THREE.Color();

function pool(geometry, material, name, { shadow = false } = {}) {
  const mesh = new THREE.InstancedMesh(geometry, material, MAX);
  mesh.name = name;
  mesh.frustumCulled = false;
  mesh.count = 0;
  mesh.castShadow = shadow;
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  mesh.setColorAt(0, col.set('#ffffff'));
  return mesh;
}

function white(g) { return bakeColor(g, '#ffffff'); }

export function createEffects(scene) {
  const lit = propMaterial({ key: 'fx' });
  const group = new THREE.Group();
  group.name = 'effects';
  group.userData.noAO = true;
  scene.add(group);

  const balls = pool(white(new THREE.IcosahedronGeometry(0.28, 1)), lit, 'cannonballs', { shadow: true });
  const arrowGeo = white(new THREE.BoxGeometry(0.9, 0.06, 0.06));
  const arrows = pool(arrowGeo, lit, 'arrows');
  const planks = pool(white(new THREE.BoxGeometry(0.9, 0.12, 0.28)), lit, 'debris', { shadow: true });
  const barrels = pool(white(new THREE.CylinderGeometry(0.42, 0.42, 0.75, 8)), lit, 'loot', { shadow: true });
  group.add(balls, arrows, planks, barrels);
  const fx = createParticles(group);

  const seen = new WeakSet();          // sim events already turned into a burst
  const lastWake = new Map();          // ship id → { x, z } of its last foam
  const C = (hex) => new THREE.Color(hex);
  const cFireCore = C('#FFD98A'), cFire = C(PALETTE.fire), cEmber = C('#FF5210');
  const cSoot = C('#2A2623'), cSmoke = C('#6E6A66'), cPowder = C('#D9D5CC');
  const cHearth = C('#B9BDC6');
  const cWhite = C(PALETTE.splash), cFoam = C(PALETTE.foam), cWood = C(PALETTE.wood), cDust = C('#B79E7C');
  const tmpC = new THREE.Color();
  const rnd = (a, b) => a + Math.random() * (b - a);
  const wind = SURFACE_UNIFORMS.uWind.value;
  const FOAM_Y = 0.14;                 // above the swell's crest, or the sea's depth write eats it

  function ringOut(n, fn) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * 6.283;
      fn(Math.cos(a), Math.sin(a));
    }
  }

  function splashAt(x, z, k = 1) {
    ringOut(Math.round(11 * k), (cx, cz) => {
      const out = rnd(0.3, 1.7) * k;
      fx.soft.emit({ x: x + cx * 0.2, y: 0.2, z: z + cz * 0.2, vx: cx * out, vy: rnd(4, 8.5) * Math.sqrt(k), vz: cz * out,
        gravity: 15, life: rnd(0.55, 0.95), size: 0.35 * k, size1: 1.0 * k, color: cWhite, alpha: 0.85 });
    });
    fx.flat.emit({ x, y: FOAM_Y, z, life: 0.95, size: 1.0 * k, size1: 5.2 * k, color: cWhite, alpha: 0.75, shape: SHAPE_RING, spin: 0.2 });
    fx.flat.emit({ x, y: FOAM_Y, z, life: 2.2, size: 1.4 * k, size1: 3.4 * k, color: cFoam, alpha: 0.6, shape: SHAPE_FOAM });
  }

  function explodeAt(x, z, big, massive) {
    const many = massive ? 2 : 1;
    fx.add.emit({ x, y: 1.2 * big, z, life: 0.16, size: 2.5 * big, size1: 5 * big, color: cFireCore, gain: 3, alpha: 0.8 });
    ringOut(10 * many, (cx, cz) => {
      const out = rnd(0.6, 3) * big;
      fx.add.emit({ x: x + cx * 0.5 * big, y: rnd(0.6, 1.8) * big, z: z + cz * 0.5 * big, vx: cx * out, vy: rnd(1.5, 4.5) * big, vz: cz * out,
        drag: 2.2, life: rnd(0.35, 0.75), size: 1.1 * big, size1: 2.7 * big, color: tmpC.copy(cFireCore).lerp(cEmber, Math.random()), gain: 2.4, alpha: 0.9, spin: rnd(-1, 1) });
    });
    ringOut(13 * many, (cx, cz) => {
      const out = rnd(0.4, 2.2) * big;
      fx.soft.emit({ x: x + cx * 0.6 * big, y: rnd(0.8, 2.2) * big, z: z + cz * 0.6 * big,
        vx: cx * out + wind.x * 0.9, vy: rnd(1.2, 3.2) * big, vz: cz * out + wind.y * 0.9,
        drag: 1.1, gravity: -0.5, life: rnd(1.8, 3.6), size: 1.2 * big, size1: 4.2 * big,
        color: tmpC.copy(cSoot).lerp(cSmoke, Math.random() * 0.7), alpha: 0.7, spin: rnd(-0.6, 0.6) });
    });
    ringOut(16 * many, (cx, cz) => {
      const out = rnd(3, 8) * big;
      fx.add.emit({ x, y: 1.2, z, vx: cx * out, vy: rnd(5, 11) * Math.sqrt(big), vz: cz * out, gravity: 17,
        life: rnd(0.55, 1.1), size: 0.32, size1: 0.1, color: cFire, gain: 5, shape: SHAPE_SPARK });
    });
    splashAt(x, z, 1.5 * big);
  }

  function muzzleAt(x, z) {
    fx.add.emit({ x, y: 1.6, z, life: 0.09, size: 1.2, size1: 2.2, color: cFireCore, gain: 4 });
    ringOut(6, (cx, cz) => {
      fx.soft.emit({ x, y: 1.6, z, vx: cx * rnd(0.4, 1.8) + wind.x * 0.6, vy: rnd(0.4, 1.3), vz: cz * rnd(0.4, 1.8) + wind.y * 0.6,
        drag: 2.2, life: rnd(0.9, 1.7), size: 0.7, size1: 2.3, color: cPowder, alpha: 0.55, spin: rnd(-0.8, 0.8) });
    });
  }

  function splintersAt(x, z) {
    ringOut(9, (cx, cz) => {
      const out = rnd(1.5, 4.5);
      fx.soft.emit({ x, y: 1.5, z, vx: cx * out, vy: rnd(2, 6), vz: cz * out, gravity: 16,
        life: rnd(0.45, 0.8), size: rnd(0.16, 0.3), color: cWood, alpha: 1, shape: SHAPE_SPARK });
    });
    fx.soft.emit({ x, y: 1.5, z, vy: 0.6, vx: wind.x * 0.5, vz: wind.y * 0.5, life: 0.8, size: 0.8, size1: 1.9, color: cDust, alpha: 0.45 });
  }

  // Something on fire: dark smoke always, flame once it is badly hurt.
  function burn(x, y, z, hp, dt, spread) {
    const rate = hp < 0.25 ? 11 : 5;
    if (Math.random() < rate * dt) {
      fx.soft.emit({ x: x + rnd(-spread, spread), y, z: z + rnd(-spread, spread), vx: wind.x * 1.1, vy: rnd(1.4, 2.6), vz: wind.y * 1.1,
        drag: 0.3, life: rnd(1.6, 2.6), size: 0.6, size1: 2.4, color: tmpC.copy(cSoot).lerp(cSmoke, Math.random() * 0.5), alpha: 0.55, spin: rnd(-0.5, 0.5) });
    }
    if (hp < 0.25 && Math.random() < 14 * dt) {
      fx.add.emit({ x: x + rnd(-spread, spread), y: y - 0.3, z: z + rnd(-spread, spread), vy: rnd(1, 2.2),
        life: rnd(0.25, 0.45), size: 0.7, size1: 0.25, color: tmpC.copy(cFireCore).lerp(cEmber, Math.random()), gain: 2.2, alpha: 0.9 });
    }
  }


  function put(mesh, i, x, y, z, s, color, rot = null, sv = null) {
    if (i >= MAX) return i;
    dummy.position.set(x, y, z);
    if (rot) dummy.rotation.copy(rot); else dummy.rotation.set(0, 0, 0);
    if (sv) dummy.scale.copy(sv); else dummy.scale.setScalar(s);
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

  const rot = new THREE.Euler();
  const sv = new THREE.Vector3();

  return {
    particles: fx,
    update(gameState, fogState, time, dt, chimneys = null) {
      // --- Projectiles: the 2D arc (peak 40px for a ball, 12px for an arrow), now a real height.
      let nb = 0, na = 0;
      for (const p of gameState.projectiles) {
        if (p.sourceShipIndex !== undefined) {
          const s = gameState.ships[p.sourceShipIndex];
          if (s && !shouldRenderEntity(fogState, s)) continue;
        }
        if (p.sourceTowerIndex !== undefined) {
          const t = gameState.towers[p.sourceTowerIndex];
          if (t && !shouldRenderEntity(fogState, t)) continue;
        }
        const a = hexToWorld(p.fromQ, p.fromR);
        const b = hexToWorld(p.toQ, p.toR);
        const t = THREE.MathUtils.clamp(p.progress, 0, 1);
        const arrow = p.projectileType === 'arrow';
        const peak = arrow ? 2.2 : 5.5;
        const x = a.x + (b.x - a.x) * t;
        const z = a.z + (b.z - a.z) * t;
        const y = 1.2 + peak * 4 * t * (1 - t);
        if (arrow) {
          const vy = peak * 4 * (1 - 2 * t);
          const horiz = Math.hypot(b.x - a.x, b.z - a.z);
          rot.set(0, Math.atan2(-(b.z - a.z), b.x - a.x), Math.atan2(vy, horiz), 'YZX');
          na = put(arrows, na, x, y, z, 1, PALETTE.woodDark, rot);
        } else {
          nb = put(balls, nb, x, y, z, 1, PALETTE.cannonball);
          if (Math.random() < 45 * dt) fx.soft.emit({ x, y, z, vy: 0.3, life: 0.45, size: 0.28, size1: 0.75, color: cPowder, alpha: 0.32 });
        }
      }
      finish(balls, nb); finish(arrows, na);

      // --- Explosions: a flash, a fireball, sparks, and a column of smoke that outlasts them.
      for (const e of gameState.shipExplosions) {
        if (seen.has(e) || e.age < (e.delay || 0)) continue;
        seen.add(e);
        if (e.age - (e.delay || 0) > 0.25) continue;          // a stale record from a state sync
        if (!e.ignoreFog && !isHexVisible(fogState, e.q, e.r)) continue;
        const c = hexToWorld(e.q, e.r);
        explodeAt(c.x + (e.offsetX || 0) / PX_PER_UNIT, c.z + (e.offsetY || 0) / PX_PER_UNIT, e.massive ? 2.4 : 1, !!e.massive);
      }
      // Cannon smoke and wood splinters: the sim never ages these two, so the renderer does (2D
      // ages them the same way, in effectsRenderer).
      for (let i = gameState.cannonSmoke.length - 1; i >= 0; i--) {
        const s = gameState.cannonSmoke[i];
        if (!seen.has(s)) {
          seen.add(s);
          if (s.age < 0.2 && isHexVisible(fogState, s.q, s.r)) { const c = hexToWorld(s.q, s.r); muzzleAt(c.x, c.z); }
        }
        s.age += dt;
        if (s.age >= s.duration) gameState.cannonSmoke.splice(i, 1);
      }
      for (let i = gameState.woodSplinters.length - 1; i >= 0; i--) {
        const s = gameState.woodSplinters[i];
        if (!seen.has(s)) {
          seen.add(s);
          if (s.age < 0.2 && isHexVisible(fogState, s.q, s.r)) { const c = hexToWorld(s.q, s.r); splintersAt(c.x, c.z); }
        }
        s.age += dt;
        if (s.age >= s.duration) gameState.woodSplinters.splice(i, 1);
      }
      for (const s of gameState.waterSplashes) {
        if (seen.has(s)) continue;
        seen.add(s);
        if (s.age > 0.2 || !isHexVisible(fogState, s.q, s.r)) continue;
        const c = hexToWorld(s.q, s.r);
        splashAt(c.x, c.z);
      }

      // --- Ships: a wake while under way, a lit fuse, smoke and flame when hurt.
      for (const ship of gameState.ships) {
        if (!shouldRenderEntity(fogState, ship)) { lastWake.delete(ship.id); continue; }
        const p = getShipVisualPos(hexToPixel, ship);
        const w = grogToWorld(p.x, p.y);
        const len = SHIP_SIZE[ship.type] || 3.5;
        const h = ship.heading || 0;
        const fxd = Math.cos(h), fzd = Math.sin(h);
        const prev = lastWake.get(ship.id);
        if (!prev) lastWake.set(ship.id, { x: w.x, z: w.z, side: 1 });
        else {
          const moved = Math.hypot(w.x - prev.x, w.z - prev.z);
          if (moved > 6) { prev.x = w.x; prev.z = w.z; }      // a jump (state sync, respawn), not travel
          else if (moved > 0.55) {
            prev.x = w.x; prev.z = w.z; prev.side = -prev.side;
            const sx = -fzd, sz = fxd;
            const stern = len * 0.42, bow = len * 0.4, beam = len * 0.1;
            // Stern: churned water down the middle, and the two arms of the V spreading from it.
            fx.flat.emit({ x: w.x - fxd * stern, y: FOAM_Y, z: w.z - fzd * stern, life: 1.7, size: len * 0.26, size1: len * 0.46, color: cFoam, alpha: 0.5, shape: SHAPE_FOAM });
            for (const side of [-1, 1]) {
              fx.flat.emit({ x: w.x - fxd * stern + sx * beam * side, y: FOAM_Y, z: w.z - fzd * stern + sz * beam * side,
                vx: sx * side * 1.0, vz: sz * side * 1.0, drag: 0.7, life: 2.3, size: len * 0.2, size1: len * 0.52, color: cFoam, alpha: 0.34, shape: SHAPE_FOAM });
            }
            // Bow: the wave it pushes aside, and a little spray off the cutwater.
            const bs = prev.side;
            fx.flat.emit({ x: w.x + fxd * bow + sx * beam * bs, y: FOAM_Y, z: w.z + fzd * bow + sz * beam * bs,
              vx: sx * bs * 1.7 + fxd * 0.6, vz: sz * bs * 1.7 + fzd * 0.6, drag: 1.1, life: 1.6, size: len * 0.12, size1: len * 0.38, color: cWhite, alpha: 0.5, shape: SHAPE_FOAM });
            fx.soft.emit({ x: w.x + fxd * bow, y: 0.25, z: w.z + fzd * bow, vx: sx * bs * 1.3 + fxd, vy: rnd(1.2, 2.2), vz: sz * bs * 1.3 + fzd,
              gravity: 7, life: 0.45, size: 0.3, size1: 0.8, color: cWhite, alpha: 0.5 });
          }
        }
        if (ship.tntFuse > 0 && Math.random() < 50 * dt) {
          fx.add.emit({ x: w.x - fxd * len * 0.35, y: 1.4, z: w.z - fzd * len * 0.35, vx: rnd(-2, 2), vy: rnd(1.5, 4), vz: rnd(-2, 2), gravity: 12,
            life: rnd(0.2, 0.45), size: 0.3, size1: 0.08, color: cFireCore, gain: 5, shape: SHAPE_SPARK });
        }
        const def = SHIPS[ship.type];
        const hp = def ? ship.health / def.health : 1;
        if (hp < 0.5) burn(w.x, 1.7, w.z, hp, dt, len * 0.12);
      }
      // Buildings burn too.
      const structure = (list, maxOf) => {
        for (const e of list) {
          const max = maxOf(e);
          if (!max || !(e.health / max < 0.5) || !shouldRenderEntity(fogState, e)) continue;
          const c = hexToWorld(e.q, e.r);
          burn(c.x, 3.2, c.z, e.health / max, dt, 0.8);
        }
      };
      structure(gameState.ports, (e) => PORTS[e.type]?.health);
      structure(gameState.towers, (e) => TOWERS[e.type]?.health);
      structure(gameState.settlements, () => SETTLEMENTS.settlement?.health);

      // --- Debris: planks bobbing on the swell, sinking over their last second.
      let np = 0;
      for (const d of gameState.floatingDebris) {
        if (!isHexVisible(fogState, d.q, d.r)) continue;
        const c = hexToWorld(d.q, d.r);
        const left = d.duration - d.age;
        const sink = left < 1 ? (1 - left) * 0.6 : 0;
        const colr = d.debrisType === 'stone' ? PALETTE.stoneDark : PALETTE.wood;
        const pieces = d.pieces || [];
        for (let k = 0; k < Math.min(pieces.length, 8); k++) {
          const pc = pieces[k];
          const drift = Math.min(d.age, 3) / 3;
          const x = c.x + ((pc.offsetX || 0) + (pc.driftX || 0) * drift) / PX_PER_UNIT;
          const z = c.z + ((pc.offsetY || 0) + (pc.driftY || 0) * drift) / PX_PER_UNIT;
          rot.set(Math.sin(time * 2 + k) * 0.2, (pc.rotation || 0) + d.age * 0.2, 0);
          np = put(planks, np, x, 0.05 + Math.sin(time * 1.7 + k) * 0.06 - sink, z, (pc.size || 6) / 7, colr, rot);
        }
      }
      finish(planks, np);

      // --- Loot: barrels bobbing where a pirate went down.
      let nl = 0;
      for (const l of gameState.lootDrops) {
        if (!isHexVisible(fogState, l.q, l.r)) continue;
        const c = hexToWorld(l.q, l.r);
        rot.set(Math.PI / 2 + Math.sin(time * 1.4) * 0.15, l.age * 0.3, 0);
        nl = put(barrels, nl, c.x, 0.15 + Math.sin(time * 2.1 + c.x) * 0.1, c.z, 1, PALETTE.wood, rot);
      }
      finish(barrels, nl);

      // Hearth smoke: a thin pale thread from every chimney, bent by the wind.
      if (chimneys) {
        for (let i = 0; i < chimneys.length; i += 3) {
          if (Math.random() > 3.2 * dt) continue;
          fx.soft.emit({ x: chimneys[i], y: chimneys[i + 1] + 0.05, z: chimneys[i + 2], vx: wind.x * 0.55 + rnd(-0.1, 0.1), vy: rnd(0.7, 1.1), vz: wind.y * 0.55 + rnd(-0.1, 0.1),
            drag: 0.25, life: rnd(2.4, 3.4), size: 0.22, size1: 1.25, color: cHearth, alpha: 0.5, spin: rnd(-0.4, 0.4) });
        }
      }
      fx.update(dt);
    },
  };
}
