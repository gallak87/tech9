import * as THREE from 'three';
import { RNG, rng } from '../core/rng.js';
import { registerShot } from '../game/shots.js';
import { ParticleSystem, P, resetP } from './particles.js';
import { RibbonBank } from './ribbons.js';
import { CELL } from './fxtextures.js';
import { ShellBank, RingBank, ShieldBank } from './volumes.js';
import { DebrisField } from './debris.js';
import { SpeedLines, VapourCone } from './screen.js';
import { ChargeOrb } from './charge.js';
import { installTransit } from './transit.js';

// ─────────────────────────────────────────────────────────────────────────────
// FX subsystem.  OWNER: fx agent.
//
// Everything visible here is drawn by about a dozen draw calls total. The rules
// that keep it there:
//
//   · Two ParticleSystems (one additive, one alpha) carry every sprite in the
//     game — sparks, fire, smoke, dust, laser bolts, embers. Effects differ by
//     the numbers they write at spawn, not by owning their own buffers.
//   · A particle is written once and never touched again; the vertex shader
//     integrates its trajectory. A thousand-particle explosion costs one loop
//     at spawn and nothing per frame.
//   · Nothing here allocates in update(). The scratch vectors are module-level
//     and `P` is a single reused spawn record.
//   · Every random number comes from a named RNG stream, so a capture at t=14
//     is byte-identical run to run.
//
// Brightness convention: additive fragments output premultiplied colour, and
// the numbers below are *linear scene radiance*. Diffuse white in this scene
// sits near 1.0, so a laser core at 6 is a few stops of headroom over the hull —
// enough for bloom to catch it without the grade clipping the frame. If an
// effect only reads because it is blowing the frame out, it is wrong.
// ─────────────────────────────────────────────────────────────────────────────

/* ── palette (linear radiance, pre-exposure) ─────────────────────────────── */
const COL = {
  playerCore: [3.4, 5.6, 6.4],
  playerGlow: [0.55, 2.30, 3.60],
  enemyCore: [3.2, 6.0, 1.8],
  enemyGlow: [0.85, 2.60, 0.55],
  chargeCore: [6.2, 4.4, 1.5],
  chargeGlow: [2.60, 1.35, 0.30],
  shield: [0.45, 1.35, 2.60],

  flashHot: [5.2, 4.6, 3.8],
  fireHot: [4.6, 2.35, 0.62],
  fireCool: [0.75, 0.135, 0.028],
  sparkHot: [5.0, 3.0, 1.1],
  sparkCool: [2.4, 0.42, 0.06],
  emberHot: [3.4, 1.15, 0.22],
  emberCool: [0.85, 0.16, 0.03],
  shockHot: [2.5, 2.05, 1.55],

  smokeLit: [0.62, 0.36, 0.20],
  smokeCold: [0.155, 0.155, 0.170],
  dust: [0.60, 0.52, 0.40],
  waterSpray: [0.80, 0.88, 0.95],
  engineHot: [1.55, 2.60, 3.60],
  engineCold: [0.16, 0.42, 0.95],
};

const setA = (r, g, b) => { P.r0 = r; P.g0 = g; P.b0 = b; };
const setB = (r, g, b) => { P.r1 = r; P.g1 = g; P.b1 = b; };
const rampA = (c) => setA(c[0], c[1], c[2]);
const rampB = (c) => setB(c[0], c[1], c[2]);

/* ── module scratch — nothing in this file allocates per frame ───────────── */
const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _v3 = new THREE.Vector3();
const _d = new THREE.Vector3();
const _n = new THREE.Vector3();
const _t = new THREE.Vector3();
const _b = new THREE.Vector3();
const _fogCol = new THREE.Color();

/** Active random stream. `withSeed` swaps it so review scenes replay exactly. */
let R = rng('fx.main');

function withSeed(name, fn) {
  const prev = R;
  R = new RNG('vulpine:fx.scene.' + name);
  try { fn(); } finally { R = prev; }
}

/** Unit vector in a cone of half-angle `spread` around `dir`. */
function coneDir(dir, spread, out) {
  _t.set(0, 1, 0);
  if (Math.abs(dir.y) > 0.94) _t.set(1, 0, 0);
  _b.crossVectors(dir, _t).normalize();
  _t.crossVectors(_b, dir).normalize();
  const a = R.next() * Math.PI * 2;
  const s = Math.acos(1 - R.next() * (1 - Math.cos(spread)));
  const sn = Math.sin(s);
  return out.copy(dir).multiplyScalar(Math.cos(s))
    .addScaledVector(_b, Math.cos(a) * sn)
    .addScaledVector(_t, Math.sin(a) * sn);
}

export function installFx(ctx) {
  const group = new THREE.Group();
  group.name = 'fx';
  ctx.scene.add(group);

  const rand = () => R.next();

  /* ── systems ───────────────────────────────────────────────────────────── */
  const add = new ParticleSystem(14000, 'add', { renderOrder: 12, nearFade: 1.6 });
  const alp = new ParticleSystem(5200, 'alpha', { renderOrder: 8, nearFade: 2.4 });
  const trails = new RibbonBank(3, 26, { blend: 'add', renderOrder: 9, fadePow: 1.25 });
  const soft = new RibbonBank(6, 22, { blend: 'alpha', renderOrder: 7, fadePow: 1.6 });
  // Homing rounds cannot use the `laser()` bolt: that is a GPU particle whose
  // position is integrated as p₀ + v₀t, so it flies dead straight no matter what
  // the simulated round does. A tracked shot that curves onto its target while
  // its own visible bolt carries on into the distance is worse than no homing at
  // all. These ribbons are pushed a point per sim tick from the round's actual
  // position, so the streak is the flight path by construction.
  const tracers = new RibbonBank(12, 44, { blend: 'add', renderOrder: 10, fadePow: 1.15 });
  const shells = new ShellBank(16);
  const rings = new RingBank(40);
  const shields = new ShieldBank(8);
  const debris = new DebrisField(56, rand, onDebrisTrail);
  const lines = new SpeedLines(240, rand);
  const cone = new VapourCone();
  const orb = new ChargeOrb({ color: 0xffc24a });

  group.add(
    alp.mesh, soft.mesh, trails.mesh, tracers.mesh, add.mesh,
    shells.mesh, rings.mesh, shields.mesh, debris.mesh,
    cone.mesh, orb.group, orb.arcs.mesh, lines.mesh,
  );

  /* ── pooled dynamic lights ─────────────────────────────────────────────────
     Added once, up front, and never removed: three.js keys shader programs on
     the light counts, so adding or hiding a light mid-game would recompile every
     material in the scene. They idle at intensity 0 instead.                  */
  const LIGHTS = 3;
  const lights = [];
  for (let i = 0; i < LIGHTS; i++) {
    const l = new THREE.PointLight(0xffffff, 0, 90, 2);
    l.castShadow = false;
    group.add(l);
    lights.push({ l, age: 1e9, life: 1, peak: 0 });
  }
  let lightNext = 0;

  function pulse(x, y, z, r, g, b, peak, life) {
    const e = lights[lightNext];
    lightNext = (lightNext + 1) % LIGHTS;
    e.l.position.set(x, y, z);
    e.l.color.setRGB(r, g, b);
    e.age = 0; e.life = life; e.peak = peak;
  }

  /* ── state ─────────────────────────────────────────────────────────────── */
  const st = {
    time: 0,
    boost: 0,
    flash: 0,
    charge: 0,          // 0..1
    charging: false,
    chargePos: new THREE.Vector3(),
    demo: false,
    demoT: 0,
    sceneKey: null,
    forceBoost: -1,
    envT: 0,
    wakeOn: false,
  };

  const camPos = ctx.camera.position;

  /* ── ship anchors ──────────────────────────────────────────────────────── */
  // local-space mounts on the Arwing, resolved to world space each frame
  const MOUNT = {
    engines: [[0, 0, 2.62], [-0.82, -0.06, 2.28], [0.82, -0.06, 2.28]],
    engineR: [0.30, 0.155, 0.155],
    pods: [[2.52, -0.10, -1.88], [-2.52, -0.10, -1.88]],
    tips: [[3.06, 0.30, 0.28], [-3.06, 0.30, 0.28]],
  };

  function shipPoint(local, out) {
    const s = ctx.ship.scale.x || 1;
    return out.set(local[0] * s, local[1] * s, local[2] * s)
      .applyQuaternion(ctx.ship.quaternion).add(ctx.ship.position);
  }
  function shipDir(local, out) {
    return out.set(local[0], local[1], local[2]).applyQuaternion(ctx.ship.quaternion);
  }

  /* ── ship velocity, for inheritance ────────────────────────────────────── */
  const shipVel = new THREE.Vector3();
  const lastShipPos = new THREE.Vector3().copy(ctx.ship.position);

  /* ═══════════════════════════════════════════════════════════════════════ */
  /*  EXPLOSION                                                              */
  /* ═══════════════════════════════════════════════════════════════════════ */

  /**
   * Multi-stage explosion.
   * @param {THREE.Vector3} pos
   * @param {object} opts scale (1 = a fighter), normal, velocity, debris, light
   */
  function explosion(pos, opts = {}) {
    const s = Math.max(0.15, opts.scale ?? 1);
    const rs = Math.sqrt(s);
    const vx = opts.velocity ? opts.velocity.x : 0;
    const vy = opts.velocity ? opts.velocity.y : 0;
    const vz = opts.velocity ? opts.velocity.z : 0;
    const seed = R.next();

    /* stage 1 — the flash. Two frames of near-white, before the eye can resolve
       anything else. Cheap, and it is what sells the detonation. */
    resetP();
    P.x = pos.x; P.y = pos.y; P.z = pos.z;
    P.vx = vx * 0.3; P.vy = vy * 0.3; P.vz = vz * 0.3;
    P.cell = CELL.flare; P.mode = 0;
    P.life = 0.11 + 0.05 * rs; P.fadeIn = 0.012; P.fadePow = 2.6;
    P.size0 = 3.2 * s; P.size1 = 13 * s;
    P.rot = R.next() * 6.28;
    rampA(COL.flashHot); rampB(COL.fireHot); P.bias = 1.4;
    P.alpha = 1;
    add.emit();

    // a second, tighter core so the middle stays white a beat longer
    P.size0 = 1.1 * s; P.size1 = 5.0 * s;
    P.life = 0.19 + 0.09 * rs; P.fadePow = 3.4;
    setA(6.0, 5.6, 5.0); rampB(COL.fireHot);
    add.emit();

    /* stage 2 — fireball. Puffs pushed outward with heavy drag, so they burst
       and then hang; colour rides white → orange → soot over their life. */
    const nFire = Math.round(10 + 16 * s);
    for (let i = 0; i < nFire; i++) {
      const u = i / nFire;
      R.onSphere(_d);
      _d.y = _d.y * 0.75 + 0.18;             // blasts climb
      _d.normalize();
      const sp = (5 + 17 * s) * (0.30 + Math.pow(R.next(), 1.6));
      resetP();
      P.x = pos.x + _d.x * 0.4 * s; P.y = pos.y + _d.y * 0.4 * s; P.z = pos.z + _d.z * 0.4 * s;
      P.vx = _d.x * sp + vx * 0.35; P.vy = _d.y * sp + vy * 0.35; P.vz = _d.z * sp + vz * 0.35;
      P.cell = CELL.fire; P.mode = 0;
      P.drag = 2.9 / Math.pow(s, 0.25);
      P.gravity = -1.5 * s;                   // hot gas rises
      P.turb = 0.9 * s;
      P.life = 0.45 + 0.75 * s + R.next() * 0.5;
      P.fadeIn = 0.035; P.fadePow = 1.5;
      P.size0 = (0.9 + 0.9 * R.next()) * s;
      P.size1 = (3.4 + 3.2 * R.next()) * s;
      P.rot = R.next() * 6.28; P.rotVel = R.range(-1.5, 1.5);
      P.seed = R.next();
      P.delay = u * 0.055 * rs;               // the ball unfurls, it does not pop
      const hot = 1 - u * 0.45;
      setA(COL.fireHot[0] * hot, COL.fireHot[1] * hot * 0.95, COL.fireHot[2] * hot * 0.8);
      rampB(COL.fireCool);
      P.bias = 0.62;
      P.alpha = 0.95;
      add.emit();
    }

    /* stage 3 — rolling smoke. Alpha-blended and lit warm at birth, cooling to
       neutral: fire that turns into smoke, not smoke that appears next to it. */
    const nSmoke = Math.round(7 + 13 * s);
    for (let i = 0; i < nSmoke; i++) {
      R.onSphere(_d);
      _d.y = _d.y * 0.6 + 0.35;
      _d.normalize();
      const sp = (3 + 8 * s) * (0.25 + R.next());
      resetP();
      P.x = pos.x + _d.x * 0.6 * s; P.y = pos.y + _d.y * 0.6 * s; P.z = pos.z + _d.z * 0.6 * s;
      P.vx = _d.x * sp + vx * 0.2; P.vy = _d.y * sp + vy * 0.2; P.vz = _d.z * sp + vz * 0.2;
      P.cell = CELL.smoke; P.mode = 0;
      P.drag = 1.5; P.gravity = -1.1 * s; P.turb = 1.6 * s;
      P.life = 1.6 + 2.6 * s + R.next() * 1.6;
      P.fadeIn = 0.10; P.fadePow = 1.25;
      P.size0 = (1.6 + 1.2 * R.next()) * s;
      P.size1 = (7.5 + 5.5 * R.next()) * s;
      P.rot = R.next() * 6.28; P.rotVel = R.range(-0.7, 0.7);
      P.seed = R.next();
      P.delay = R.next() * 0.16 * rs;
      rampA(COL.smokeLit); rampB(COL.smokeCold);
      P.bias = 0.30;
      P.alpha = 0.52 + 0.20 * R.next();
      alp.emit();
    }

    // lingering drift — arrives late, outlives everything, sells the aftermath
    const nLinger = Math.round(3 + 6 * s);
    for (let i = 0; i < nLinger; i++) {
      R.onSphere(_d);
      resetP();
      P.x = pos.x + _d.x * 1.4 * s; P.y = pos.y + Math.abs(_d.y) * 1.6 * s; P.z = pos.z + _d.z * 1.4 * s;
      P.vx = _d.x * 2.2 + vx * 0.12; P.vy = 1.4 + R.next() * 1.6; P.vz = _d.z * 2.2 + vz * 0.12;
      P.cell = CELL.smoke; P.mode = 0;
      P.drag = 0.5; P.gravity = -0.35; P.turb = 3.0 * s;
      P.life = 4.5 + 3.5 * s + R.next() * 2;
      P.fadeIn = 0.28; P.fadePow = 1.6;
      P.size0 = 3.0 * s; P.size1 = (13 + 8 * R.next()) * s;
      P.rot = R.next() * 6.28; P.rotVel = R.range(-0.3, 0.3);
      P.seed = R.next();
      P.delay = 0.25 + R.next() * 0.9;
      setA(0.30, 0.27, 0.26); rampB(COL.smokeCold);
      P.bias = 0.7;
      P.alpha = 0.30 + 0.16 * R.next();
      alp.emit();
    }

    /* stage 4 — shockwave. A shell plus two orthogonal rings: the shell gives
       the front a silhouette in depth, the rings give it a readable direction. */
    const shockCol = { r: COL.shockHot[0], g: COL.shockHot[1], b: COL.shockHot[2] };
    shells.spawn(pos, {
      r0: 0.8 * s, r1: 9 * s + 7, life: 0.30 + 0.20 * rs,
      color: shockCol, alpha: 0.85, seed, wobble: 0.16,
    });
    if (opts.normal) _n.copy(opts.normal); else R.onSphere(_n);
    if (_n.lengthSq() < 1e-6) _n.set(0, 1, 0);
    _n.normalize();
    rings.spawn(pos, _n, {
      r0: 1.0 * s, r1: 13 * s + 9, life: 0.34 + 0.22 * rs,
      color: shockCol, alpha: 1.0, seed, band: 0.5, spin: 0.4,
    });
    _t.set(0, 1, 0);
    if (Math.abs(_n.y) > 0.9) _t.set(1, 0, 0);
    _v3.crossVectors(_n, _t).normalize();
    rings.spawn(pos, _v3, {
      r0: 0.8 * s, r1: 10 * s + 6, life: 0.28 + 0.18 * rs,
      color: shockCol, alpha: 0.55, seed: seed + 0.31, band: 0.62, spin: -0.6,
    });

    /* stage 5 — sparks on real ballistic arcs. Velocity-aligned and stretched,
       so a fast one is a streak and a slow one is a point: the arc reads. */
    const nSpark = Math.round(26 + 64 * s);
    for (let i = 0; i < nSpark; i++) {
      R.onSphere(_d);
      const sp = (14 + 46 * s) * Math.pow(R.next(), 0.55);
      resetP();
      P.x = pos.x; P.y = pos.y; P.z = pos.z;
      P.vx = _d.x * sp + vx * 0.5; P.vy = _d.y * sp + vy * 0.5 + 3; P.vz = _d.z * sp + vz * 0.5;
      P.cell = CELL.streak; P.mode = 1; P.stretch = 0.020;
      P.drag = 0.9 + R.next() * 1.1;
      P.gravity = 24 + R.next() * 12;
      P.life = 0.35 + R.next() * (0.8 + 0.7 * s);
      P.fadeIn = 0.01; P.fadePow = 1.1;
      P.size0 = 0.34 + 0.22 * R.next(); P.size1 = 0.07;
      P.seed = R.next();
      rampA(COL.sparkHot); rampB(COL.sparkCool);
      P.bias = 0.8;
      P.alpha = 1;
      add.emit();
    }

    // embers — slow, long-lived, they keep the volume alive after the fire dies
    const nEmber = Math.round(10 + 22 * s);
    for (let i = 0; i < nEmber; i++) {
      R.onSphere(_d);
      const sp = (3 + 11 * s) * R.next();
      resetP();
      P.x = pos.x + _d.x * s; P.y = pos.y + _d.y * s; P.z = pos.z + _d.z * s;
      P.vx = _d.x * sp; P.vy = _d.y * sp + 2; P.vz = _d.z * sp;
      P.cell = CELL.dot; P.mode = 0;
      P.drag = 1.4; P.gravity = 3.5 + R.next() * 4; P.turb = 2.2;
      P.life = 1.2 + R.next() * (1.4 + s);
      P.fadeIn = 0.05; P.fadePow = 1.9;
      P.size0 = 0.30 + 0.22 * R.next(); P.size1 = 0.10;
      P.seed = R.next();
      P.delay = R.next() * 0.12;
      rampA(COL.emberHot); rampB(COL.emberCool);
      P.bias = 0.9;
      P.alpha = 0.95;
      add.emit();
    }

    /* stage 6 — tumbling burning debris, each dragging its own smoke. */
    if (opts.debris !== false && s > 0.45) {
      const nDeb = Math.min(14, Math.round(2 + 7 * s));
      for (let i = 0; i < nDeb; i++) {
        R.onSphere(_d);
        _d.y = _d.y * 0.8 + 0.3;
        _d.normalize();
        const sp = (7 + 17 * s) * (0.35 + R.next() * 0.9);
        const sz = (0.20 + R.next() * 0.42) * Math.pow(s, 0.7);
        debris.spawn(
          pos.x + _d.x * s, pos.y + _d.y * s, pos.z + _d.z * s,
          _d.x * sp + vx * 0.55, _d.y * sp + vy * 0.55 + 4, _d.z * sp + vz * 0.55,
          {
            life: 1.5 + R.next() * (1.0 + s * 0.9),
            sx: sz, sy: sz * R.range(0.5, 1.4), sz: sz * R.range(0.5, 1.4),
            spinX: R.range(-9, 9), spinY: R.range(-11, 11), spinZ: R.range(-7, 7),
            drag: 0.35 + R.next() * 0.5,
            seed: R.next(),
          },
        );
      }
    }

    /* stage 7 — light, camera shake, screen flash. */
    if (opts.light !== false) {
      pulse(pos.x, pos.y, pos.z, 1.0, 0.62, 0.28, 380 * s * s, 0.42 + 0.2 * rs);
    }
    const d = camPos.distanceTo(pos);
    st.flash = Math.min(1.1, st.flash + (1.6 * s * s) / (1 + (d * d) / (900 * s)));
    if (ctx.flight?.addShake) ctx.flight.addShake(Math.min(0.9, (1.4 * s) / (1 + d / 45)));
  }

  /** Smoke + fire dragged behind a live debris chunk. */
  function onDebrisTrail(x, y, z, vx, vy, vz, heat, seed) {
    if (heat <= 0.02) return;
    resetP();
    P.x = x; P.y = y; P.z = z;
    P.vx = vx * -0.10; P.vy = vy * -0.10 + 0.7; P.vz = vz * -0.10;
    P.cell = CELL.smoke; P.mode = 0;
    P.drag = 1.8; P.gravity = -0.5; P.turb = 0.5;
    P.life = 0.7 + heat * 1.4;
    P.fadeIn = 0.12; P.fadePow = 1.4;
    P.size0 = 0.30; P.size1 = 1.9 + heat * 1.6;
    P.rot = seed * 6.28; P.rotVel = 0.6;
    P.seed = seed;
    setA(0.34, 0.26, 0.22); rampB(COL.smokeCold);
    P.bias = 0.45;
    P.alpha = 0.30 * heat + 0.06;
    alp.emit();

    if (heat > 0.35) {
      resetP();
      P.x = x; P.y = y; P.z = z;
      P.vx = vx * -0.05; P.vy = vy * -0.05 + 0.4; P.vz = vz * -0.05;
      P.cell = CELL.fire; P.mode = 0;
      P.drag = 3.0; P.gravity = -1.0;
      P.life = 0.16 + 0.16 * heat;
      P.fadeIn = 0.05; P.fadePow = 1.6;
      P.size0 = 0.42 * heat; P.size1 = 0.95 * heat;
      P.rot = seed * 3.1; P.seed = seed;
      setA(COL.fireHot[0] * heat, COL.fireHot[1] * heat, COL.fireHot[2] * heat);
      rampB(COL.fireCool);
      P.bias = 0.7; P.alpha = 0.9;
      add.emit();
    }
  }

  /* ═══════════════════════════════════════════════════════════════════════ */
  /*  LASERS                                                                 */
  /* ═══════════════════════════════════════════════════════════════════════ */

  // Visible size of a player tap bolt. One number: every part of the bolt derives
  // its size from `w`, so this scales core, sheath, head and tail together.
  const BOLT_SCALE = 2.0;

  /**
   * A travelling bolt plus its muzzle event.
   * @param {THREE.Vector3} origin @param {THREE.Vector3} dir (unit)
   * @param {object} opts { enemy, speed, range, width, inherit, muzzle, charged }
   */
  function laser(origin, dir, opts = {}) {
    const enemy = !!opts.enemy;
    const charged = !!opts.charged;
    const speed = opts.speed ?? (charged ? 470 : enemy ? 520 : 980);
    const range = opts.range ?? (charged ? 900 : enemy ? 700 : 1100);
    // Player tap bolts read too small at anything short of full screen — the
    // owner's report is that they are hard to see at all in a window. Every part
    // of the bolt (hot core, sheath, leading flash, tail) derives its size from
    // `w`, so scaling here scales the whole thing coherently. Charged rounds are
    // already 3x and enemy fire is legible as it is, so neither is touched: this
    // is one number for the bolt the player looks at most.
    const w = (opts.width ?? 1) * (charged ? 3.0 : 1) * (!enemy && !charged ? BOLT_SCALE : 1);
    const life = range / speed;
    const core = charged ? COL.chargeCore : enemy ? COL.enemyCore : COL.playerCore;
    const glow = charged ? COL.chargeGlow : enemy ? COL.enemyGlow : COL.playerGlow;
    const ix = opts.inherit ? opts.inherit.x : 0;
    const iy = opts.inherit ? opts.inherit.y : 0;
    const iz = opts.inherit ? opts.inherit.z : 0;

    _d.copy(dir).normalize();
    const vX = _d.x * speed + ix, vY = _d.y * speed + iy, vZ = _d.z * speed + iz;

    // 1 — hot core: velocity-aligned, stretched by speed into a hard bar
    resetP();
    P.x = origin.x; P.y = origin.y; P.z = origin.z;
    P.vx = vX; P.vy = vY; P.vz = vZ;
    P.cell = CELL.streak; P.mode = 1;
    P.stretch = charged ? 0.0055 : enemy ? 0.0080 : 0.0092;
    P.life = life; P.fadeIn = 0.006; P.fadePow = 0.35;
    P.size0 = 0.34 * w; P.size1 = 0.30 * w;
    setA(core[0], core[1], core[2]);
    setB(core[0] * 0.75, core[1] * 0.75, core[2] * 0.75);
    P.bias = 1; P.alpha = 1; P.seed = R.next();
    add.emit();

    // 2 — soft sheath, wider and dimmer; this is what bloom actually grabs
    resetP();
    P.x = origin.x; P.y = origin.y; P.z = origin.z;
    P.vx = vX; P.vy = vY; P.vz = vZ;
    P.cell = CELL.streak; P.mode = 1;
    P.stretch = charged ? 0.0038 : enemy ? 0.0056 : 0.0062;
    P.life = life; P.fadeIn = 0.008; P.fadePow = 0.5;
    P.size0 = 1.05 * w; P.size1 = 0.85 * w;
    setA(glow[0], glow[1], glow[2]); setB(glow[0] * 0.5, glow[1] * 0.5, glow[2] * 0.5);
    P.alpha = 0.75;
    add.emit();

    // 3 — leading flash: a round head that outruns the bar
    resetP();
    P.x = origin.x; P.y = origin.y; P.z = origin.z;
    P.vx = vX; P.vy = vY; P.vz = vZ;
    P.cell = CELL.flare; P.mode = 0;
    P.life = life; P.fadeIn = 0.005; P.fadePow = 0.4;
    P.size0 = (charged ? 2.4 : 0.95) * w; P.size1 = (charged ? 3.0 : 0.85) * w;
    P.rot = R.next() * 6.28;
    setA(core[0] * 0.9, core[1] * 0.9, core[2] * 0.9);
    setB(glow[0], glow[1], glow[2]);
    P.alpha = 0.9;
    add.emit();

    // 4 — the tail. Same p₀ and v₀, staggered start times: the shader strings
    //     them out behind the head for free. Enemy fire gets a longer, lazier
    //     tail so incoming rounds read differently at a glance.
    const nTail = charged ? 16 : enemy ? 9 : 5;
    const gap = charged ? 0.010 : enemy ? 0.013 : 0.006;
    for (let i = 1; i <= nTail; i++) {
      const u = i / nTail;
      resetP();
      P.x = origin.x; P.y = origin.y; P.z = origin.z;
      P.vx = vX; P.vy = vY; P.vz = vZ;
      P.cell = charged ? CELL.fire : CELL.flare;
      P.mode = 0;
      P.delay = i * gap;
      P.life = (charged ? 0.34 : enemy ? 0.24 : 0.10) * (1 - u * 0.35);
      P.fadeIn = 0.02; P.fadePow = 1.4;
      P.size0 = (charged ? 2.2 : 0.72) * w * (1 - u * 0.5);
      P.size1 = (charged ? 3.4 : 0.30) * w * (1 - u * 0.5);
      P.rot = R.next() * 6.28; P.rotVel = R.range(-3, 3);
      P.turb = charged ? 0.5 : 0;
      P.seed = R.next();
      const k = (1 - u * 0.75) * (charged ? 0.9 : 0.55);
      setA(glow[0] * k, glow[1] * k, glow[2] * k);
      setB(glow[0] * k * 0.15, glow[1] * k * 0.15, glow[2] * k * 0.15);
      P.alpha = 0.85;
      add.emit();
    }

    if (charged) {
      // orbiting motes, so the lock-on round has internal motion
      for (let i = 0; i < 14; i++) {
        R.onSphere(_v2);
        resetP();
        P.x = origin.x + _v2.x * 0.9; P.y = origin.y + _v2.y * 0.9; P.z = origin.z + _v2.z * 0.9;
        P.vx = vX + _v2.x * 5; P.vy = vY + _v2.y * 5; P.vz = vZ + _v2.z * 5;
        P.cell = CELL.dot; P.mode = 0;
        P.turb = 2.2; P.drag = 0.4;
        P.life = life * R.range(0.4, 0.95);
        P.fadeIn = 0.05; P.fadePow = 1.2;
        P.size0 = 0.55; P.size1 = 0.14;
        P.seed = R.next();
        setA(core[0], core[1], core[2]); rampB(COL.emberCool);
        P.alpha = 0.9;
        add.emit();
      }
    }

    if (opts.muzzle !== false) muzzle(origin, _d, { enemy, charged, w, inherit: opts.inherit });
  }

  /** Muzzle flash — the bit that lights the wing the bolt came off. */
  function muzzle(origin, dir, { enemy = false, charged = false, w = 1, inherit = null } = {}) {
    const core = charged ? COL.chargeCore : enemy ? COL.enemyCore : COL.playerCore;
    const glow = charged ? COL.chargeGlow : enemy ? COL.enemyGlow : COL.playerGlow;
    const ix = inherit ? inherit.x : 0, iy = inherit ? inherit.y : 0, iz = inherit ? inherit.z : 0;
    const s = charged ? 2.6 : 1;

    resetP();
    P.x = origin.x; P.y = origin.y; P.z = origin.z;
    P.vx = ix; P.vy = iy; P.vz = iz;
    P.cell = CELL.flare; P.mode = 0;
    P.life = 0.075 * (charged ? 1.7 : 1); P.fadeIn = 0.01; P.fadePow = 2.2;
    P.size0 = 2.6 * w * s; P.size1 = 0.9 * w * s;
    P.rot = R.next() * 6.28;
    setA(core[0] * 1.25, core[1] * 1.25, core[2] * 1.25);
    setB(glow[0], glow[1], glow[2]);
    P.alpha = 1;
    add.emit();

    // a snap ring facing down the barrel — the frame-one read
    rings.spawn(origin, dir, {
      r0: 0.12 * w * s, r1: 1.5 * w * s, life: 0.11,
      color: { r: glow[0] * 0.8, g: glow[1] * 0.8, b: glow[2] * 0.8 },
      alpha: 0.9, seed: R.next(), band: 0.85,
    });

    const n = charged ? 14 : 5;
    for (let i = 0; i < n; i++) {
      coneDir(dir, 0.55, _v2);
      const sp = 16 + R.next() * 34;
      resetP();
      P.x = origin.x; P.y = origin.y; P.z = origin.z;
      P.vx = _v2.x * sp + ix; P.vy = _v2.y * sp + iy; P.vz = _v2.z * sp + iz;
      P.cell = CELL.streak; P.mode = 1; P.stretch = 0.012;
      P.drag = 5.5; P.life = 0.08 + R.next() * 0.14;
      P.fadeIn = 0.01; P.fadePow = 1.4;
      P.size0 = 0.28 * w; P.size1 = 0.05;
      P.seed = R.next();
      setA(core[0], core[1], core[2]); setB(glow[0] * 0.4, glow[1] * 0.4, glow[2] * 0.4);
      P.alpha = 1;
      add.emit();
    }

    pulse(origin.x, origin.y, origin.z,
      core[0] / 6, core[1] / 6, core[2] / 6,
      charged ? 90 : 26, charged ? 0.16 : 0.075);
  }

  /* ═══════════════════════════════════════════════════════════════════════ */
  /*  IMPACTS                                                                */
  /* ═══════════════════════════════════════════════════════════════════════ */

  /**
   * @param {THREE.Vector3} pos @param {THREE.Vector3} normal surface normal
   * @param {object} opts { scale, enemy, shield, shieldCenter, shieldRadius }
   */
  function impact(pos, normal, opts = {}) {
    const s = Math.max(0.2, opts.scale ?? 1);
    const enemy = !!opts.enemy;
    if (normal) _n.copy(normal); else _n.set(0, 1, 0);
    if (_n.lengthSq() < 1e-6) _n.set(0, 1, 0);
    _n.normalize();

    if (opts.shield) {
      shieldHit(opts.shieldCenter || pos, pos, opts.shieldRadius ?? 3 * s, s);
      return;
    }

    const core = enemy ? COL.enemyCore : COL.playerCore;
    const glow = enemy ? COL.enemyGlow : COL.playerGlow;

    // scorch flash — hot at the contact point, gone in two frames
    resetP();
    P.x = pos.x + _n.x * 0.1; P.y = pos.y + _n.y * 0.1; P.z = pos.z + _n.z * 0.1;
    P.cell = CELL.flare; P.mode = 0;
    P.life = 0.09; P.fadeIn = 0.008; P.fadePow = 2.4;
    P.size0 = 1.1 * s; P.size1 = 3.4 * s;
    P.rot = R.next() * 6.28;
    setA(core[0] * 1.1, core[1] * 1.1, core[2] * 1.1);
    setB(COL.fireHot[0], COL.fireHot[1], COL.fireHot[2]);
    P.alpha = 1;
    add.emit();

    rings.spawn(pos, _n, {
      r0: 0.15 * s, r1: 2.6 * s, life: 0.20,
      color: { r: glow[0], g: glow[1], b: glow[2] },
      alpha: 0.8, seed: R.next(), band: 0.7,
    });

    // sparks: a cone off the surface with a rim-spray component, real gravity
    const nSpark = Math.round(16 + 22 * s);
    for (let i = 0; i < nSpark; i++) {
      const rim = R.next() < 0.4;
      coneDir(_n, rim ? 1.35 : 0.75, _v2);
      const sp = (10 + 28 * s) * Math.pow(R.next(), 0.5);
      resetP();
      P.x = pos.x + _n.x * 0.05; P.y = pos.y + _n.y * 0.05; P.z = pos.z + _n.z * 0.05;
      P.vx = _v2.x * sp; P.vy = _v2.y * sp; P.vz = _v2.z * sp;
      P.cell = CELL.streak; P.mode = 1; P.stretch = 0.020;
      P.drag = 1.2 + R.next(); P.gravity = 26 + R.next() * 10;
      P.life = 0.22 + R.next() * 0.62;
      P.fadeIn = 0.008; P.fadePow = 1.2;
      P.size0 = 0.24 + 0.16 * R.next(); P.size1 = 0.05;
      P.seed = R.next();
      rampA(COL.sparkHot); rampB(COL.sparkCool);
      P.bias = 0.85; P.alpha = 1;
      add.emit();
    }

    // scorch decal — plane-aligned card, iVel carries the surface normal
    resetP();
    P.x = pos.x + _n.x * 0.06; P.y = pos.y + _n.y * 0.06; P.z = pos.z + _n.z * 0.06;
    P.vx = _n.x; P.vy = _n.y; P.vz = _n.z;
    P.cell = CELL.scorch; P.mode = 2;
    P.life = 1.1 + 0.9 * s; P.fadeIn = 0.02; P.fadePow = 2.0;
    P.size0 = 1.5 * s; P.size1 = 2.1 * s;
    P.rot = R.next() * 6.28;
    setA(0.05, 0.04, 0.04); setB(0.10, 0.09, 0.09);
    P.alpha = 0.75;
    alp.emit();

    // debris puff off the surface
    const nPuff = Math.round(3 + 4 * s);
    for (let i = 0; i < nPuff; i++) {
      coneDir(_n, 1.0, _v2);
      const sp = 3 + R.next() * 9 * s;
      resetP();
      P.x = pos.x; P.y = pos.y; P.z = pos.z;
      P.vx = _v2.x * sp; P.vy = _v2.y * sp; P.vz = _v2.z * sp;
      P.cell = CELL.smoke; P.mode = 0;
      P.drag = 2.4; P.gravity = 1.2; P.turb = 0.5;
      P.life = 0.55 + R.next() * 0.8;
      P.fadeIn = 0.06; P.fadePow = 1.5;
      P.size0 = 0.35 * s; P.size1 = (1.8 + R.next()) * s;
      P.rot = R.next() * 6.28; P.rotVel = R.range(-1, 1);
      P.seed = R.next();
      setA(0.36, 0.30, 0.25); rampB(COL.smokeCold);
      P.bias = 0.5; P.alpha = 0.34;
      alp.emit();
    }

    if (s > 0.7) {
      pulse(pos.x, pos.y, pos.z, core[0] / 7, core[1] / 7, core[2] / 7, 22 * s, 0.10);
    }
  }

  /** Rippling hex shield strike. */
  function shieldHit(center, hitPos, radius, s = 1) {
    _v2.copy(hitPos).sub(center);
    if (_v2.lengthSq() < 1e-6) _v2.set(0, 0, -1);
    _v2.normalize();
    _v3.copy(center).addScaledVector(_v2, radius);

    shields.spawn(center, _v2, {
      radius, life: 0.62 + 0.2 * s, alpha: 1.0, seed: R.next(),
      color: { r: COL.shield[0], g: COL.shield[1], b: COL.shield[2] },
    });

    resetP();
    P.x = _v3.x; P.y = _v3.y; P.z = _v3.z;
    P.cell = CELL.flare; P.mode = 0;
    P.life = 0.13; P.fadeIn = 0.01; P.fadePow = 2.0;
    P.size0 = 1.2 * s; P.size1 = 3.2 * s;
    P.rot = R.next() * 6.28;
    setA(2.6, 4.4, 6.2); rampB(COL.shield);
    P.alpha = 1;
    add.emit();

    // charge runs *along* the shell rather than spraying off it
    for (let i = 0; i < 18; i++) {
      coneDir(_v2, 1.45, _v);
      const sp = 6 + R.next() * 16;
      resetP();
      P.x = _v3.x; P.y = _v3.y; P.z = _v3.z;
      P.vx = _v.x * sp; P.vy = _v.y * sp; P.vz = _v.z * sp;
      P.cell = CELL.streak; P.mode = 1; P.stretch = 0.016;
      P.drag = 4.0; P.life = 0.14 + R.next() * 0.3;
      P.fadeIn = 0.01; P.fadePow = 1.6;
      P.size0 = 0.22; P.size1 = 0.04;
      P.seed = R.next();
      setA(2.2, 3.8, 6.0); rampB(COL.shield);
      P.alpha = 1;
      add.emit();
    }
    rings.spawn(_v3, _v2, {
      r0: 0.2 * s, r1: radius * 1.15, life: 0.28,
      color: { r: COL.shield[0], g: COL.shield[1], b: COL.shield[2] },
      alpha: 0.7, seed: R.next(), band: 0.6,
    });
    pulse(_v3.x, _v3.y, _v3.z, 0.28, 0.6, 1.0, 30 * s, 0.16);
  }

  /* ═══════════════════════════════════════════════════════════════════════ */
  /*  ENVIRONMENT                                                            */
  /* ═══════════════════════════════════════════════════════════════════════ */

  /**
   * Ground interaction under the ship.
   * @param {object} opts { kind:'water'|'dust', amount, dir }
   */
  function spray(pos, opts = {}) {
    const kind = opts.kind || 'dust';
    const amount = opts.amount ?? 1;
    const water = kind === 'water';
    const n = Math.max(1, Math.round((water ? 5 : 3) * amount));
    const dirx = opts.dir ? opts.dir.x : 0;
    const dirz = opts.dir ? opts.dir.z : -1;

    for (let i = 0; i < n; i++) {
      const a = R.next() * Math.PI * 2;
      const rr = R.next() * (water ? 6 : 9);
      resetP();
      P.x = pos.x + Math.cos(a) * rr;
      P.y = pos.y + R.next() * 0.4;
      P.z = pos.z + Math.sin(a) * rr;
      if (water) {
        P.vx = Math.cos(a) * (4 + R.next() * 9) - dirx * 6;
        P.vy = 7 + R.next() * 14;
        P.vz = Math.sin(a) * (4 + R.next() * 9) - dirz * 6;
        P.cell = R.next() < 0.55 ? CELL.smoke : CELL.wisp;
        P.drag = 1.5; P.gravity = 16; P.turb = 0.8;
        P.life = 0.5 + R.next() * 0.9;
        P.size0 = 0.5 + R.next(); P.size1 = 2.6 + R.next() * 2.4;
        rampA(COL.waterSpray);
        setB(COL.waterSpray[0] * 0.8, COL.waterSpray[1] * 0.8, COL.waterSpray[2] * 0.85);
        P.alpha = (0.22 + 0.20 * R.next()) * Math.min(1, amount);
      } else {
        P.vx = Math.cos(a) * (2 + R.next() * 6) - dirx * 10;
        P.vy = 2.5 + R.next() * 6;
        P.vz = Math.sin(a) * (2 + R.next() * 6) - dirz * 10;
        P.cell = CELL.smoke;
        P.drag = 1.1; P.gravity = 2.5; P.turb = 1.6;
        P.life = 1.1 + R.next() * 1.6;
        P.size0 = 1.2 + R.next() * 1.4; P.size1 = 5 + R.next() * 6;
        rampA(COL.dust);
        setB(COL.dust[0] * 0.85, COL.dust[1] * 0.85, COL.dust[2] * 0.9);
        P.alpha = (0.13 + 0.13 * R.next()) * Math.min(1, amount);
      }
      P.mode = 0;
      P.fadeIn = 0.10; P.fadePow = 1.5;
      P.rot = R.next() * 6.28; P.rotVel = R.range(-0.8, 0.8);
      P.seed = R.next();
      P.bias = 0.7;
      alp.emit();
    }

    if (water && R.next() < 0.5 * amount) {
      rings.spawn(_v2.set(pos.x, pos.y + 0.05, pos.z), _v3.set(0, 1, 0), {
        r0: 1.0, r1: 9 + R.next() * 7, life: 0.75,
        color: { r: 0.42, g: 0.55, b: 0.62 },
        alpha: 0.30 * Math.min(1, amount), seed: R.next(), band: 0.30,
      });
    }
  }

  /* ═══════════════════════════════════════════════════════════════════════ */
  /*  SHIP-ATTACHED — engine trails, vortices, boost                         */
  /* ═══════════════════════════════════════════════════════════════════════ */

  let trailsPrimed = false;

  function updateShip(dt) {
    const boost = st.forceBoost >= 0 ? st.forceBoost : st.boost;
    const throttle = ctx.flight?.throttleN ?? 0.5;

    /* engine ribbons */
    for (let i = 0; i < 3; i++) {
      const rb = trails.ribbons[i];
      shipPoint(MOUNT.engines[i], _v);
      if (!trailsPrimed) rb.reset(_v.x, _v.y, _v.z);
      else rb.push(_v.x, _v.y, _v.z);
      rb.active = true;
      const r = MOUNT.engineR[i];
      rb.width0 = r * (2.6 + throttle * 1.1 + boost * 2.4);
      rb.width1 = r * (0.5 + boost * 1.1);
      rb.taper = 4 - boost * 2.2;         // boost stretches the tail out
      rb.alpha = 0.42 + throttle * 0.28 + boost * 0.42;
      rb.col.setRGB(
        COL.engineHot[0] + boost * 0.9,
        COL.engineHot[1] + boost * 0.5,
        COL.engineHot[2],
      );
      rb.colTail.setRGB(COL.engineCold[0], COL.engineCold[1], COL.engineCold[2] * (0.7 + boost * 0.3));
    }

    /* exhaust shimmer — faint, turbulent, desaturated. Not a refraction; it is
       the cue that the air behind three thrusters is not still. */
    if (throttle > 0.25) {
      const n = boost > 0.4 ? 2 : 1;
      for (let k = 0; k < n; k++) {
        const i = R.int(0, 2);
        shipPoint(MOUNT.engines[i], _v);
        shipDir([0, 0, 1], _d);
        resetP();
        P.x = _v.x + R.range(-0.2, 0.2); P.y = _v.y + R.range(-0.2, 0.2); P.z = _v.z + R.range(-0.2, 0.2);
        P.vx = shipVel.x * 0.55 + _d.x * (9 + boost * 26);
        P.vy = shipVel.y * 0.55 + _d.y * (9 + boost * 26);
        P.vz = shipVel.z * 0.55 + _d.z * (9 + boost * 26);
        P.cell = CELL.wisp; P.mode = 1; P.stretch = 0.006;
        P.drag = 2.2; P.turb = 1.4;
        P.life = 0.22 + 0.30 * boost;
        P.fadeIn = 0.15; P.fadePow = 1.6;
        P.size0 = 0.5; P.size1 = 2.2 + boost * 2.4;
        P.rot = R.next() * 6.28; P.seed = R.next();
        setA(0.60, 0.66, 0.74); setB(0.42, 0.44, 0.48);
        P.alpha = 0.055 + 0.075 * boost;
        alp.emit();
      }
    }

    /* wingtip vortices — vapour pulled off the tips in a hard turn */
    const g = Math.min(1, Math.abs(ctx.flight?.offVel?.x ?? 0) / 95
                        + Math.abs(ctx.flight?.bank ?? 0) * 0.42);
    for (let i = 0; i < 2; i++) {
      const rb = soft.ribbons[i];
      shipPoint(MOUNT.tips[i], _v);
      if (!trailsPrimed) rb.reset(_v.x, _v.y, _v.z);
      else rb.push(_v.x, _v.y, _v.z);
      rb.active = g > 0.06;
      rb.width0 = 0.16 + g * 0.5;
      rb.width1 = 0.05 + g * 0.55;
      rb.taper = 2.0;
      rb.alpha = Math.min(0.55, g * g * 0.75);
      rb.col.setRGB(0.92, 0.95, 1.0);
      rb.colTail.setRGB(0.72, 0.78, 0.86);
    }

    /* vapour cone + speed lines */
    shipPoint([0, 0, -0.6], _v);
    cone.update(dt, Math.max(0, boost - 0.25) * 1.35, _v, ctx.ship.quaternion);
    lines.update(dt, Math.max(0, boost - 0.10) * 0.9, ctx.engine.camera.aspect || 16 / 9);

    trailsPrimed = true;
  }

  /* ── environment sampling ──────────────────────────────────────────────── */
  function updateEnv(dt) {
    if (!ctx.world) return;
    st.envT += dt;
    if (st.envT < 1 / 30) return;
    const step = st.envT;
    st.envT = 0;

    const p = ctx.flight?.pos || ctx.ship.position;
    const ground = ctx.world.groundAt(p.x, p.z);
    const overWater = ground <= 0.05;
    const h = p.y - ground;
    if (h > 34 || h < -2) { setWake(false); return; }

    const amount = Math.pow(1 - Math.min(1, h / 34), 1.7)
                 * (0.5 + (ctx.flight?.throttleN ?? 0.5));
    if (amount < 0.03) { setWake(false); return; }

    _v.set(p.x, ground + 0.15, p.z);
    shipDir([0, 0, -1], _d);
    spray(_v, { kind: overWater ? 'water' : 'dust', amount: amount * step * 30, dir: _d });
    setWake(overWater && h < 22, _v, amount);
  }

  function setWake(on, at = null, amount = 1) {
    for (let i = 0; i < 2; i++) {
      const rb = soft.ribbons[2 + i];
      if (!on) { rb.active = false; continue; }
      const sx = i === 0 ? -1 : 1;
      _v2.copy(at);
      _v2.x += sx * (2.5 + amount * 4.5);
      if (!rb.active) rb.reset(_v2.x, _v2.y, _v2.z);
      else rb.push(_v2.x, _v2.y, _v2.z);
      rb.active = true;
      rb.width0 = 1.2 + amount * 3.5;
      rb.width1 = 3.5 + amount * 7;
      rb.taper = 1.5;
      rb.alpha = Math.min(0.5, amount * 0.55);
      rb.col.setRGB(0.92, 0.96, 1.0);
      rb.colTail.setRGB(0.70, 0.80, 0.86);
    }
    st.wakeOn = on;
  }

  /* ═══════════════════════════════════════════════════════════════════════ */
  /*  TRACERS — the visible body of a homing round                           */
  /* ═══════════════════════════════════════════════════════════════════════ */
  //
  // Owned by key, not by index: combat.js has no stable slot for a round, so it
  // hands us the round object itself and we keep the association. A round that
  // stops calling `tracer()` has its ribbon collapse to nothing over the next
  // few frames rather than vanishing on the frame it died, which is what makes
  // an intercept read as a streak arriving *into* the explosion.

  const tracerOf = new Map();          // key → { rb, idle }
  const tracerFree = tracers.ribbons.slice();

  /**
   * Push the current position of a tracked round.
   * @param key   any stable object identifying the round
   * @param opts  { charged } — charged rounds are fatter and gold, taps are cyan
   *   { col, colTail, width } — anything that is not a round supplies its own
   *   colour and gauge. A pickup flying to the player is the case this exists
   *   for: at 400 m the streak resolves before the body does, so it is the
   *   streak that has to say which of the three drops is inbound, and a cyan
   *   one would say "bullet".
   */
  function tracer(key, x, y, z, opts = {}) {
    let e = tracerOf.get(key);
    if (!e) {
      const rb = tracerFree.pop();
      if (!rb) return;                 // pool exhausted: the round still flies
      rb.reset(x, y, z);
      e = { rb, idle: 0 };
      tracerOf.set(key, e);
    }
    const rb = e.rb;
    e.idle = 0;
    rb.push(x, y, z);
    rb.active = true;
    const ch = !!opts.charged;
    const w = opts.width ?? 1;
    rb.width0 = (ch ? 2.6 : 0.85) * w;       // head
    rb.width1 = (ch ? 0.9 : 0.30) * w;       // tail
    rb.taper = 1.25;
    rb.alpha = ch ? 1 : 0.85;
    const c = opts.col;
    if (c) {
      rb.col.setRGB(c[0], c[1], c[2]);
      const t = opts.colTail || c;
      rb.colTail.setRGB(t[0], t[1], t[2]);
    } else if (ch) { rb.col.setRGB(1.0, 0.86, 0.45); rb.colTail.setRGB(1.0, 0.42, 0.10); }
    else { rb.col.setRGB(0.72, 0.95, 1.0); rb.colTail.setRGB(0.20, 0.55, 1.0); }
  }

  /** Let a round's streak retract and hand the ribbon back. */
  function tracerEnd(key) {
    const e = tracerOf.get(key);
    if (e) e.idle = 1e-6;              // non-zero: collapse begins next tick
  }

  function updateTracers(dt) {
    for (const [key, e] of tracerOf) {
      if (e.idle <= 0) { e.idle = dt; continue; }   // still being driven
      e.idle += dt;
      e.rb.collapse();
      e.rb.alpha *= 0.72;
      if (e.idle > 0.34) {
        e.rb.active = false;
        tracerFree.push(e.rb);
        tracerOf.delete(key);
      }
    }
  }

  /* ═══════════════════════════════════════════════════════════════════════ */
  /*  CHARGED SHOT                                                           */
  /* ═══════════════════════════════════════════════════════════════════════ */

  function chargeStart() { st.charging = true; }
  function chargeStop() { st.charging = false; st.charge = 0; }

  /**
   * Fire the charged round from `origin` along `dir`. Consumes the charge.
   * `opts.bolt === false` emits the release burst and the light but not the
   * travelling bolt — for a homing round, which draws itself with `tracer()`
   * because a straight GPU bolt cannot follow a curved flight path.
   */
  function chargedShot(origin, dir, opts = {}) {
    const lvl = Math.max(0.25, st.charge);
    if (opts.bolt !== false) {
      laser(origin, dir, { ...opts, charged: true, width: (opts.width ?? 1) * (0.6 + lvl * 0.7) });
    }
    // release burst: the orb collapses into the round
    for (let i = 0; i < 26; i++) {
      R.onSphere(_d);
      const sp = 8 + R.next() * 26;
      resetP();
      P.x = origin.x + _d.x * 0.6; P.y = origin.y + _d.y * 0.6; P.z = origin.z + _d.z * 0.6;
      P.vx = _d.x * sp; P.vy = _d.y * sp; P.vz = _d.z * sp;
      P.cell = CELL.streak; P.mode = 1; P.stretch = 0.014;
      P.drag = 6.5; P.life = 0.14 + R.next() * 0.24;
      P.fadeIn = 0.01; P.fadePow = 1.5;
      P.size0 = 0.30; P.size1 = 0.05;
      P.seed = R.next();
      rampA(COL.chargeCore); rampB(COL.chargeGlow);
      P.alpha = 1;
      add.emit();
    }
    rings.spawn(origin, dir, {
      r0: 0.3, r1: 5.5, life: 0.24,
      color: { r: COL.chargeGlow[0], g: COL.chargeGlow[1], b: COL.chargeGlow[2] },
      alpha: 1, seed: R.next(), band: 0.7,
    });
    st.charge = 0;
    st.charging = false;
    st.flash = Math.min(1.1, st.flash + 0.10);
  }

  function updateCharge(dt) {
    if (st.charging) st.charge = Math.min(1, st.charge + dt / 1.1);
    else st.charge = Math.max(0, st.charge - dt * 5);

    if (st.charge > 0.01) {
      // between the wingtip pods, a little forward of the nose
      shipPoint([0, -0.10, -2.55], st.chargePos);
      const r = 0.35 + st.charge * 1.25;
      orb.update(dt, st.chargePos, st.charge, r);

      // matter falling into the orb — the lensing cue that actually reads
      if (R.next() < st.charge * 0.9) {
        R.onSphere(_d);
        const d0 = r * (3.2 + R.next() * 3.5);
        resetP();
        P.x = st.chargePos.x + _d.x * d0;
        P.y = st.chargePos.y + _d.y * d0;
        P.z = st.chargePos.z + _d.z * d0;
        const inSp = d0 / 0.28;
        P.vx = -_d.x * inSp + shipVel.x; P.vy = -_d.y * inSp + shipVel.y; P.vz = -_d.z * inSp + shipVel.z;
        P.cell = CELL.streak; P.mode = 1; P.stretch = 0.010;
        P.drag = 0.1; P.life = 0.26;
        P.fadeIn = 0.15; P.fadePow = 0.8;
        P.size0 = 0.20; P.size1 = 0.30;
        P.seed = R.next();
        rampA(COL.chargeGlow); rampB(COL.chargeCore);
        P.alpha = 0.9;
        add.emit();
      }
      pulse(st.chargePos.x, st.chargePos.y, st.chargePos.z,
        1.0, 0.72, 0.28, 20 * st.charge * st.charge, 1 / 60);
    } else {
      orb.update(dt, st.chargePos, 0, 1);
    }
  }

  /* ═══════════════════════════════════════════════════════════════════════ */
  /*  RE-ENTRY ABLATION                                                      */
  /* ═══════════════════════════════════════════════════════════════════════ */
  //
  // Compression heating is a function of edge, not of surface: it happens where
  // the airflow has to turn hardest. These three mounts are the Arwing's leading
  // edges, and the plasma is emitted from them and left behind, so the streaks
  // read as the hull ablating rather than as an exhaust.

  const EDGES = [[0, -0.05, -3.05], [3.06, 0.30, 0.28], [-3.06, 0.30, 0.28]];

  function ablation(heat, dt) {
    shipDir([0, 0, 1], _d);                       // aft, in world space
    const n = Math.max(1, Math.round(heat * 26 * Math.min(dt, 1 / 30)));
    for (let i = 0; i < EDGES.length; i++) {
      shipPoint(EDGES[i], _v);

      // the standing glow welded to the edge itself
      resetP();
      P.x = _v.x; P.y = _v.y; P.z = _v.z;
      P.vx = shipVel.x; P.vy = shipVel.y; P.vz = shipVel.z;
      P.cell = CELL.flare; P.mode = 0;
      P.life = 0.05; P.fadeIn = 0.006; P.fadePow = 1.2;
      P.size0 = (i === 0 ? 2.2 : 1.5) * (0.5 + heat); P.size1 = P.size0 * 1.2;
      P.rot = R.next() * 6.28;
      setA(5.2 * heat, 2.5 * heat, 0.85 * heat);
      setB(2.4 * heat, 0.55 * heat, 0.10 * heat);
      P.alpha = 1;
      add.emit();

      for (let k = 0; k < n; k++) {
        coneDir(_d, 0.28, _v2);
        const sp = (55 + R.next() * 190) * (0.5 + heat);
        resetP();
        P.x = _v.x + R.range(-0.3, 0.3); P.y = _v.y + R.range(-0.3, 0.3); P.z = _v.z + R.range(-0.3, 0.3);
        P.vx = _v2.x * sp + shipVel.x * 0.2;
        P.vy = _v2.y * sp + shipVel.y * 0.2;
        P.vz = _v2.z * sp + shipVel.z * 0.2;
        P.cell = CELL.streak; P.mode = 1; P.stretch = 0.010;
        P.drag = 1.6; P.turb = 2.2;
        P.life = 0.16 + R.next() * 0.30;
        P.fadeIn = 0.01; P.fadePow = 1.5;
        P.size0 = 0.26 + 0.22 * R.next(); P.size1 = 0.05;
        P.seed = R.next();
        setA(4.8 * heat, 2.1 * heat, 0.55 * heat);
        rampB(COL.emberCool);
        P.bias = 0.85; P.alpha = 1;
        add.emit();
      }
    }
  }

  /* ═══════════════════════════════════════════════════════════════════════ */
  /*  DEMO DRIVER — a self-contained firefight for review                    */
  /* ═══════════════════════════════════════════════════════════════════════ */

  const demo = {
    lastFire: 0, lastEnemy: 0, lastImpact: 0, lastBoom: 0,
    lastShield: 0, boomIdx: 0, chargeCycle: 0,
  };

  function demoTick(dt) {
    st.demoT += dt;
    const t = st.demoT;
    const p = ctx.flight?.pos || ctx.ship.position;
    shipDir([0, 0, -1], _d);

    // player twin-linked fire
    if (t - demo.lastFire > 0.17) {
      demo.lastFire = t;
      for (let i = 0; i < 2; i++) {
        shipPoint(MOUNT.pods[i], _v);
        laser(_v, _d, { inherit: shipVel });
      }
    }

    // incoming enemy fire from ahead, aimed just off the player
    if (t - demo.lastEnemy > 0.33) {
      demo.lastEnemy = t;
      _v2.copy(p).addScaledVector(_d, 260 + 60 * Math.sin(t * 1.7));
      _v2.x += Math.sin(t * 2.3) * 34;
      _v2.y += Math.cos(t * 1.9) * 16 + 6;
      _v3.copy(p).sub(_v2);
      _v3.x += Math.sin(t * 5.1) * 9;
      _v3.y += Math.cos(t * 4.3) * 5;
      _v3.normalize();
      laser(_v2, _v3, { enemy: true });
    }

    // impacts on a virtual target that sits ahead of the player
    if (t - demo.lastImpact > 0.21) {
      demo.lastImpact = t;
      _v2.copy(p).addScaledVector(_d, 95 + 25 * Math.sin(t * 0.9));
      _v2.x += Math.sin(t * 1.3) * 22;
      _v2.y += Math.cos(t * 1.1) * 10;
      _v3.copy(p).sub(_v2).normalize();
      impact(_v2, _v3, { scale: 0.9 });
    }

    // shield strikes on a second target, off to the other side
    if (t - demo.lastShield > 0.9) {
      demo.lastShield = t;
      _v2.copy(p).addScaledVector(_d, 120);
      _v2.x -= 30 + Math.sin(t * 0.7) * 12;
      _v2.y += 8 + Math.cos(t * 0.8) * 6;
      _v3.copy(_v2);
      _v3.x += 3.6; _v3.z += 1.2;
      impact(_v3, null, { shield: true, shieldCenter: _v2, shieldRadius: 4.2, scale: 1 });
    }

    // explosions, cycling small → medium → large
    if (t - demo.lastBoom > 0.85) {
      demo.lastBoom = t;
      const k = demo.boomIdx++;
      const sizes = [0.55, 1.0, 1.9, 0.75, 1.35];
      const s = sizes[k % sizes.length];
      _v2.copy(p).addScaledVector(_d, 130 + (k % 3) * 55);
      _v2.x += Math.sin(k * 2.1) * 46;
      _v2.y += Math.cos(k * 1.4) * 22 + 4;
      _v3.copy(_d).multiplyScalar(-40);
      _v3.x += Math.sin(k) * 20;
      explosion(_v2, { scale: s, velocity: _v3 });
    }

    // charge / release loop
    demo.chargeCycle += dt;
    if (demo.chargeCycle < 1.25) st.charging = true;
    else if (demo.chargeCycle < 1.32) {
      if (st.charge > 0.1) {
        shipPoint([0, -0.10, -2.9], _v);
        chargedShot(_v, _d, { inherit: shipVel });
      }
    } else if (demo.chargeCycle > 2.9) demo.chargeCycle = 0;
  }

  /* ═══════════════════════════════════════════════════════════════════════ */
  /*  UPDATE                                                                 */
  /* ═══════════════════════════════════════════════════════════════════════ */

  let fogSyncT = 0;

  /* ── clock ─────────────────────────────────────────────────────────────────
     FX advances on **sim time**, not on the wall clock it is handed.
     `main.frame()` in shot mode runs `applyShot(); updateScene(realDt)` every
     frame while the simulation is frozen, so wall-paced FX kept ageing while the
     harness took the screenshot: a shot built for t=0.34 s was captured at
     whatever 0.3–1 s the machine happened to drift to, and never twice the same.
     Reading `ctx.time` instead makes a parked review frame cost exactly zero
     seconds, and makes `__VULPINE__.step(n)` advance effects by exactly n/120 s —
     so `--seq` produces a reproducible filmstrip. Live play is unaffected: there
     the sim advances every frame anyway.                                        */
  let simPaced = true;
  let lastSim = 0;

  function syncFog() {
    const f = ctx.scene.fog;
    if (!f) return;
    _fogCol.copy(f.color);
    const d = f.density ?? 0.0004;
    add.setFog(_fogCol, d);
    alp.setFog(_fogCol, d);
    trails.setFog(_fogCol, d);
    soft.setFog(_fogCol, d);
    tracers.setFog(_fogCol, d);
    shells.material.uniforms.uFogDensity.value = d;
    rings.material.uniforms.uFogDensity.value = d;
    shields.material.uniforms.uFogDensity.value = d;
  }

  function update(dtWall) {
    let dt = dtWall;
    if (simPaced) {
      const now = ctx.time ?? 0;
      dt = now - lastSim;
      lastSim = now;
      // `seekTo()` fast-forwards the sim by seconds without rendering; ageing FX
      // by that in one call would spray a frame's worth of environment dust in a
      // single step. One long frame is the most any single update may represent.
      if (dt > 0.30) dt = 0.30;
    }
    if (!(dt > 0)) return;
    st.time += dt;

    fogSyncT += dt;
    if (fogSyncT > 0.25) { fogSyncT = 0; syncFog(); }

    // ship velocity for inheritance (finite difference — flight owns the model)
    shipVel.copy(ctx.ship.position).sub(lastShipPos).multiplyScalar(1 / dt);
    lastShipPos.copy(ctx.ship.position);
    if (!Number.isFinite(shipVel.x)) shipVel.set(0, 0, 0);

    if (st.demo) demoTick(dt);

    updateShip(dt);
    updateEnv(dt);
    updateCharge(dt);
    transit.update(dt);
    debris.update(dt);

    // pooled lights
    for (const e of lights) {
      if (e.age >= e.life) { if (e.l.intensity !== 0) e.l.intensity = 0; continue; }
      e.age += dt;
      const u = Math.min(1, e.age / e.life);
      e.l.intensity = e.peak * Math.pow(1 - u, 2.2);
    }

    add.update(dt);
    alp.update(dt);
    updateTracers(dt);
    trails.commit();
    soft.commit();
    tracers.commit();
    shells.update(dt);
    rings.update(dt);
    shields.update(dt);

    // screen flash → the grade pass. Fast attack, fast decay; a flash you can
    // name is too long.
    st.flash = Math.max(0, st.flash - dt * 4.2);
    const gu = ctx.engine.post?.grade?.material?.uniforms;
    if (gu?.uFlash) gu.uFlash.value = st.flash * st.flash * 0.55;
  }

  /* ═══════════════════════════════════════════════════════════════════════ */
  /*  REVIEW SCENES                                                          */
  /* ═══════════════════════════════════════════════════════════════════════ */

  function clearAll() {
    add.clear(); alp.clear();
    trails.clear(); soft.clear(); tracers.clear();
    for (const e of tracerOf.values()) { e.rb.active = false; tracerFree.push(e.rb); }
    tracerOf.clear();
    shells.clear(); rings.clear(); shields.clear();
    debris.clear();
    trailsPrimed = false;
    st.flash = 0; st.charge = 0; st.charging = false;
    lastSim = ctx.time ?? 0;
    for (const e of lights) { e.age = 1e9; e.l.intensity = 0; }
  }

  /**
   * Deterministic single-effect setup for a review shot: wipe, spawn from a
   * fixed seed, then integrate forward so the frame lands mid-life. Cached by
   * key, because `applyShot` runs every frame while the sim is frozen.
   */
  function scene(name, age = 0.3, build = null) {
    const key = `${name}|${age}`;
    if (st.sceneKey === key) return;
    st.sceneKey = key;
    const wasDemo = st.demo;
    st.demo = false;
    clearAll();
    withSeed(name, () => { if (build) build(); });
    // integrate by hand, off the sim clock, so the frame lands mid-life
    const h = 1 / 120;
    simPaced = false;
    try { for (let t = 0; t < age - 1e-6; t += h) update(h); }
    finally { simPaced = true; lastSim = ctx.time ?? 0; }
    st.demo = wasDemo;
  }

  /* ── review shots ──────────────────────────────────────────────────────── */
  const _at = new THREE.Vector3();
  const _sp = new THREE.Vector3();

  function frame(cam, target, dist, yawDeg, pitchDeg, fov = 38) {
    const y = THREE.MathUtils.degToRad(yawDeg);
    const p = THREE.MathUtils.degToRad(pitchDeg);
    _at.set(Math.sin(y) * Math.cos(p), Math.sin(p), Math.cos(y) * Math.cos(p)).multiplyScalar(dist);
    cam.position.copy(target).add(_at);
    cam.fov = fov;
    cam.updateProjectionMatrix();
    cam.lookAt(target);
  }

  /** Where a review effect is planted: ahead of the ship, clear of the terrain. */
  function stage(out, forward = 46, up = 10, side = 0) {
    shipDir([0, 0, -1], _d);
    out.copy(ctx.ship.position).addScaledVector(_d, forward);
    out.y += up;
    out.x += side;
    return out;
  }

  registerShot('fx-explosion', (c) => {
    scene('explosion', 0.34, () => {
      explosion(stage(_v2, 46, 8), { scale: 1.7 });
    });
    stage(_sp, 46, 8);
    frame(c.engine.camera, _sp, 44, 152, 9, 40);
  });

  registerShot('fx-explosion-late', (c) => {
    scene('explosion', 1.5, () => {
      explosion(stage(_v2, 46, 8), { scale: 1.7 });
    });
    stage(_sp, 46, 8);
    frame(c.engine.camera, _sp, 58, 152, 12, 42);
  });

  registerShot('fx-explosion-small', (c) => {
    scene('explosion-small', 0.22, () => {
      explosion(stage(_v2, 30, 5), { scale: 0.55 });
    });
    stage(_sp, 30, 5);
    frame(c.engine.camera, _sp, 17, 148, 8, 38);
  });

  registerShot('fx-explosion-chase', (c) => {
    scene('explosion-chase', 0.30, () => {
      explosion(stage(_v2, 62, 6), { scale: 1.7 });
    });
    c.flight.updateCamera(1 / 60, c.engine.camera);
  });

  registerShot('fx-lasers', (c) => {
    scene('lasers', 0.055, () => {
      shipDir([0, 0, -1], _d);
      for (let i = 0; i < 2; i++) {
        shipPoint(MOUNT.pods[i], _v);
        laser(_v, _d, { inherit: shipVel });
      }
    });
    _sp.copy(c.ship.position);
    _sp.y += 0.2;
    frame(c.engine.camera, _sp, 15, 196, 12, 40);
  });

  registerShot('fx-lasers-chase', (c) => {
    scene('lasers-chase', 0.20, () => {
      shipDir([0, 0, -1], _d);
      for (let k = 0; k < 4; k++) {
        for (let i = 0; i < 2; i++) {
          shipPoint(MOUNT.pods[i], _v);
          _v.addScaledVector(_d, -k * 26);
          laser(_v, _d, { inherit: shipVel, muzzle: k === 0 });
        }
      }
      shipPoint(MOUNT.pods[0], _v);
      _v.addScaledVector(_d, 240);
      _v.x += 18; _v.y += 9;
      _v3.copy(_d).multiplyScalar(-1);
      for (let k = 0; k < 3; k++) {
        _v2.copy(_v).addScaledVector(_v3, -k * 40);
        laser(_v2, _v3, { enemy: true, muzzle: k === 0 });
      }
    });
    c.flight.updateCamera(1 / 60, c.engine.camera);
  });

  registerShot('fx-impacts', (c) => {
    scene('impacts', 0.16, () => {
      stage(_sp, 26, 3);
      for (let i = 0; i < 3; i++) {
        _v2.copy(_sp);
        _v2.x += (i - 1) * 5.5;
        _v2.y += Math.sin(i * 2.1) * 2;
        _v3.copy(c.ship.position).sub(_v2).normalize();
        impact(_v2, _v3, { scale: 1.0 });
      }
    });
    stage(_sp, 26, 3);
    frame(c.engine.camera, _sp, 16, 155, 10, 38);
  });

  registerShot('fx-shield', (c) => {
    scene('shield', 0.22, () => {
      stage(_sp, 26, 3);
      _v3.copy(_sp);
      _v3.x += 3.2; _v3.y += 1.4; _v3.z += 1.6;
      impact(_v3, null, { shield: true, shieldCenter: _sp, shieldRadius: 4.0 });
    });
    stage(_sp, 26, 3);
    frame(c.engine.camera, _sp, 15, 150, 12, 36);
  });

  registerShot('fx-charge', (c) => {
    scene('charge', 0.85, () => { st.charging = true; });
    shipPoint([0, -0.10, -2.55], _sp);
    frame(c.engine.camera, _sp, 8.5, 205, 10, 34);
  });

  registerShot('fx-charged-shot', (c) => {
    scene('charged-shot', 0.16, () => {
      st.charge = 1;
      shipDir([0, 0, -1], _d);
      shipPoint([0, -0.10, -2.9], _v);
      chargedShot(_v, _d, { inherit: shipVel });
    });
    shipDir([0, 0, -1], _d);
    shipPoint([0, -0.10, -2.9], _sp);
    _sp.addScaledVector(_d, 40);
    frame(c.engine.camera, _sp, 26, 200, 10, 40);
  });

  registerShot('fx-trails', (c) => {
    st.sceneKey = null;
    _sp.copy(c.ship.position);
    _sp.y += 0.2; _sp.z += 6;
    frame(c.engine.camera, _sp, 16, 22, 8, 40);
  });

  registerShot('fx-boost', (c) => {
    st.sceneKey = null;
    st.forceBoost = 1;
    lines.update(0, 0.9, c.engine.camera.aspect || 16 / 9);
    shipPoint([0, 0, -0.6], _v);
    cone.update(0, 1.0, _v, c.ship.quaternion);
    c.flight.updateCamera(1 / 60, c.engine.camera);
  });

  registerShot('fx-firefight', (c) => {
    st.sceneKey = null;
    st.demo = true;
    c.flight.updateCamera(1 / 60, c.engine.camera);
  });

  registerShot('fx-firefight-wide', (c) => {
    st.sceneKey = null;
    st.demo = true;
    shipDir([0, 0, -1], _d);
    _sp.copy(c.ship.position).addScaledVector(_d, 90);
    _sp.y += 6;
    frame(c.engine.camera, _sp, 130, 128, 14, 46);
  });

  /* ── orbital hop ───────────────────────────────────────────────────────── */
  const transit = installTransit(ctx, { ablation });

  /* ── URL switch so the demo can be booted without a shot ───────────────── */
  try {
    if (new URLSearchParams(location.search).get('fxdemo') === '1') st.demo = true;
  } catch { /* non-browser host */ }

  /* ═══════════════════════════════════════════════════════════════════════ */
  const api = {
    group, transit,
    explosion, laser, impact, spray,
    muzzle, shieldHit, chargedShot,
    tracer, tracerEnd,
    chargeStart, chargeStop,
    get charge() { return st.charge; },
    setBoost(v) { st.boost = THREE.MathUtils.clamp(v, 0, 1); },
    /** Additive screen flash, 0..1, decays on its own. */
    addFlash(v) { st.flash = Math.min(1.2, st.flash + v); },
    demo(on = true) { st.demo = !!on; if (on) st.sceneKey = null; },
    scene, clear: clearAll,
    update,
    stats() {
      return {
        addSpawned: add.spawned, alphaSpawned: alp.spawned,
        addLive: add._hi, alphaLive: alp._hi,
        debris: debris.live,
      };
    },
    dispose() {
      ctx.scene.remove(group);
      add.dispose(); alp.dispose();
      trails.dispose(); soft.dispose(); tracers.dispose();
      shells.dispose(); rings.dispose(); shields.dispose();
      debris.dispose(); lines.dispose(); cone.dispose(); orb.dispose();
      transit.dispose();
    },
  };
  return api;
}
