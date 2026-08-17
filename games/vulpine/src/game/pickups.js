import * as THREE from 'three';
import { rng } from '../core/rng.js';
import { emissive } from '../render/materials.js';

// ─────────────────────────────────────────────────────────────────────────────
// Pickups — the things a kill leaves behind.  OWNER: combat agent.
//
// The rule the whole file is built around: **a drop cannot be missed.** It pops
// out of the wreck on a short ballistic arc so the player sees where it came
// from, then it flies to the player at a speed floor above the player's own and
// never expires. There is no collection skill here and no penalty for ignoring
// it — the skill was killing the thing that dropped it. Anything that lets a
// drop escape (a timer, a collect radius you can thread, a speed the rail can
// outrun) turns "you earned this" into "you fumbled this", which is the exact
// feeling the drops exist to remove.
//
// Consequences of that rule, all of them load-bearing:
//   - `seekOver` is added to the *player's live speed*, not to a constant, so a
//     boosting player cannot outrun a drop.
//   - Nothing decrements a lifetime. The only exits are collection and a level
//     reset.
//   - The steering rate rises as the range collapses, for the same reason the
//     homing rounds in combat.js do it: a fixed turn rate has a fixed turn
//     radius, and a body that is 20 m off-axis with 20 m to run cannot correct.
//
// This file owns the drop's body and its flight. What a drop *does* is combat's
// (`onCollect`), because that is where shields, bombs and weapon tiers live.
// ─────────────────────────────────────────────────────────────────────────────

const R = rng('combat.pickup');

/**
 * The drop table. `tail` is linear RGB for the ribbon, so it is not the same
 * numbers as `color` (which is sRGB-ish and goes through `emissive`).
 *
 * Colour is the whole identification system — a drop is first read at 400 m as
 * a coloured streak, long before its silhouette resolves — so the three hues are
 * picked to be separable at low saturation and against Corneria's blue haze:
 * gold, orange-red, mint.
 */
export const PICKUP_KINDS = {
  weapon: {
    color: 0xffc23a, glow: 5.2,
    tail: [1.00, 0.78, 0.30], tailEnd: [1.00, 0.36, 0.05],
    label: 'WEAPON UP',
    radius: 2.5,
  },
  bomb: {
    color: 0xff7526, glow: 4.6,
    tail: [1.00, 0.50, 0.18], tailEnd: [0.90, 0.14, 0.02],
    label: 'BOMB +1',
    radius: 2.4,
  },
  health: {
    color: 0x36ffbe, glow: 4.8,
    tail: [0.35, 1.00, 0.80], tailEnd: [0.05, 0.55, 0.90],
    label: 'SHIELD +35',
    radius: 2.4,
  },
};

const TUNE = {
  // Ballistic pop. Long enough to read as ejected from a wreck, short enough
  // that a drop from a kill 900 m out is already inbound before the player has
  // finished looking at the explosion.
  pop: 0.40,
  popUp: 26,               // m/s of the pop's vertical kick
  popOut: 14,              // m/s of lateral scatter
  popGravity: 18,

  // Chase. `seekOver` is relative to the player's live speed — see the header.
  seekAccel: 340,          // m/s²
  seekOver: 300,           // m/s it is allowed to beat the player's speed by
  seekMin: 210,            // m/s floor, for the stationary case (a paused sim)
  turn: 2.4,               // rad/s far out
  turnCloseGain: 2.2,      // extra rad/s ∝ speed/range as it closes
  turnCloseFloor: 45,      // m — clamp on the 1/d term
  turnMax: 14,             // rad/s

  grab: 17,                // m — collect radius, generous on purpose

  // Idle motion. A drop that only translates reads as a projectile; the spin
  // and the bob are what make it read as an object waiting to be taken.
  spin: 2.1,               // rad/s of the core
  cageSpin: -1.35,         // rad/s of the shell, counter-rotating
  bobAmp: 1.5, bobRate: 3.4,
  pulse: 0.16,             // shell scale wobble

  // The tell on the enemy that is carrying one. Sized off the smallest hostile
  // that can carry a drop (a 2.6 m raptor) so the halo always clears the hull.
  beaconR: 5.2,
  beaconSpin: 1.9,
};

/* ── bodies ───────────────────────────────────────────────────────────────── */
//
// Silhouette first (CONTRACT §5): the three kinds must be tellable apart from
// their outline alone, because bloom blows the colour out to white at the centre
// of anything this emissive. Octahedron, sphere-with-belt, cross.

// Sized off the Arwing, which is 12 m nose to tail: a drop is ~9 m across the
// cage, so at the 260–900 m it is first seen it is a few pixels of very bright
// colour — enough to notice, not enough to identify — and it resolves into its
// shape over the two seconds it takes to arrive. Measured against `combat-wave`
// at 1080p: at 2.4 m core radius it was a speck the eye skipped over.
let GEO = null;
function geometry() {
  if (GEO) return GEO;
  const cross = [];
  {
    const bar = new THREE.BoxGeometry(6.2, 2.0, 2.0);
    const post = new THREE.BoxGeometry(2.0, 6.2, 2.0);
    cross.push(bar, post);
  }
  GEO = {
    weapon: [new THREE.OctahedronGeometry(3.2, 0)],
    bomb: [new THREE.SphereGeometry(2.5, 14, 10), new THREE.TorusGeometry(3.4, 0.46, 8, 20)],
    health: cross,
    cage: new THREE.IcosahedronGeometry(4.7, 0),
    beacon: new THREE.TorusGeometry(TUNE.beaconR, 0.28, 6, 22),
  };
  return GEO;
}

let MATS = null;
function materials() {
  if (MATS) return MATS;
  MATS = {};
  for (const [k, spec] of Object.entries(PICKUP_KINDS)) {
    MATS[k] = {
      core: emissive(spec.color, spec.glow),
      // The shell is a wireframe rather than a shaded hull so the core reads
      // through it. Additive so it brightens the haze instead of cutting a hole.
      cage: emissive(spec.color, 1.9, {
        wireframe: true, transparent: true, opacity: 0.85,
        blending: THREE.AdditiveBlending, depthWrite: false,
      }),
      beacon: emissive(spec.color, 3.0, {
        transparent: true, opacity: 0.9,
        blending: THREE.AdditiveBlending, depthWrite: false,
      }),
    };
  }
  return MATS;
}

function buildBody(kind) {
  const g = geometry();
  const m = materials()[kind];
  const root = new THREE.Group();
  root.name = 'pickup-' + kind;

  const core = new THREE.Group();
  for (const geo of g[kind]) core.add(new THREE.Mesh(geo, m.core));
  root.add(core);

  const cage = new THREE.Mesh(g.cage, m.cage);
  root.add(cage);

  root.userData.core = core;
  root.userData.cage = cage;
  // Small bodies moving fast across a 9 km level: culling them per-frame costs
  // more than drawing them, and a false cull on the frame a drop arrives is a
  // pickup that visibly teleports into the ship.
  root.frustumCulled = false;
  return root;
}

/* ═══════════════════════════════════════════════════════════════════════════ */

/**
 * @param ctx    the shared context (needs `fx`, `audio`, `world`)
 * @param group  the scene group drops are parented to — combat's, so drops are
 *               excluded from motion blur along with everything else that moves
 *               with the player.
 * @param onCollect  `(kind) => void`. Applies the effect; see combat.js.
 */
export function installPickups(ctx, group, onCollect) {
  const live = [];
  const beacons = [];      // { mesh, foe } — halos riding carrier enemies
  const _v = new THREE.Vector3();
  const _v2 = new THREE.Vector3();
  const _d = new THREE.Vector3();

  /**
   * Eject a drop from a kill.
   * @param kind  key into PICKUP_KINDS
   * @param pos   where the wreck was
   * @param vel   the wreck's velocity, inherited so the pop carries its momentum
   */
  function spawn(kind, pos, vel) {
    if (!PICKUP_KINDS[kind]) return null;
    const root = buildBody(kind);
    root.position.copy(pos);
    group.add(root);
    const ang = R.range(0, Math.PI * 2);
    const p = {
      kind, root,
      x: pos.x, y: pos.y, z: pos.z,
      // A third of the wreck's momentum, not all of it: a drop that keeps a
      // raptor's full 260 m/s away-vector spends its first second outrunning the
      // player, which reads as the pickup fleeing.
      vx: (vel ? vel.x : 0) * 0.33 + Math.cos(ang) * TUNE.popOut,
      vy: (vel ? vel.y : 0) * 0.33 + TUNE.popUp,
      vz: (vel ? vel.z : 0) * 0.33 + Math.sin(ang) * TUNE.popOut,
      t: 0, speed: 0, phase: R.range(0, 6.28),
      seeking: false,
    };
    live.push(p);
    ctx.fx.impact(pos, _d.set(0, 1, 0), { scale: 0.9 });
    ctx.audio.play('pickupDrop', { pos });
    return p;
  }

  /**
   * Ride a halo on the hostile carrying `kind`, so the player can see which one
   * in a wave is worth killing. Without this the drop system is invisible until
   * the moment it pays out, and a reward you cannot aim at is not a reward.
   */
  function markCarrier(foe, kind) {
    const spec = PICKUP_KINDS[kind];
    if (!spec) return;
    const mesh = new THREE.Mesh(geometry().beacon, materials()[kind].beacon);
    mesh.frustumCulled = false;
    group.add(mesh);
    beacons.push({ mesh, foe, t: R.range(0, 6.28) });
  }

  function collect(p, i) {
    _v.set(p.x, p.y, p.z);
    ctx.fx.impact(_v, _d.set(0, 1, 0), { scale: 1.6 });
    ctx.fx.addFlash(0.09);
    ctx.fx.tracerEnd(p);
    // No `pos`: collection happens at the ship, but `locate` measures from the
    // camera 17 m behind it, so a positional cue would come in quiet and panned
    // for an event that is about the player and not about a place.
    ctx.audio.play('pickup', { kind: p.kind });
    group.remove(p.root);
    disposeBody(p.root);
    live[i] = live[live.length - 1]; live.pop();
    onCollect(p.kind);
  }

  function disposeBody(root) {
    // Geometry and materials are shared across every drop of a kind and are
    // owned by this module's caches — only the graph node is per-drop, so
    // nothing here is disposable. Kept as a named no-op so the next reader does
    // not add a dispose() that guts the cache for every live drop.
    root.clear();
  }

  /**
   * @param playerPos  where the drop is flying to
   * @param playerVel  the player's velocity, for the lead and the speed floor
   */
  function update(dt, playerPos, playerVel) {
    /* carrier halos */
    for (let i = beacons.length - 1; i >= 0; i--) {
      const b = beacons[i];
      const a = b.foe.agent;
      if (!a || a.dying || a.dead || b.foe.retired) {
        group.remove(b.mesh);
        beacons[i] = beacons[beacons.length - 1]; beacons.pop();
        continue;
      }
      b.t += dt;
      b.mesh.position.copy(a.pos);
      b.mesh.rotation.x = Math.PI * 0.5;
      b.mesh.rotation.z = b.t * TUNE.beaconSpin;
      // Breathing rather than flashing: a hard blink at 60 fps reads as a
      // rendering fault at range, where the halo is a few pixels across.
      const s = 1 + 0.10 * Math.sin(b.t * 4.2);
      b.mesh.scale.setScalar(s);
      b.mesh.material.opacity = 0.55 + 0.35 * (0.5 + 0.5 * Math.sin(b.t * 4.2));
    }

    /* drops */
    const pSpeed = playerVel ? playerVel.length() : 0;
    const cap = Math.max(TUNE.seekMin, pSpeed + TUNE.seekOver);

    for (let i = live.length - 1; i >= 0; i--) {
      const p = live[i];
      p.t += dt;

      if (p.t < TUNE.pop) {
        // Ballistic. Deliberately unguided: the arc is the "something came out
        // of that" beat, and steering during it hides the ejection.
        p.vy -= TUNE.popGravity * dt;
        p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
        // Never sink into the floor. A field world has no floor and `groundAt`
        // returns -Infinity there, which this comparison handles for free.
        const g = ctx.world.groundAt(p.x, p.z);
        if (p.y < g + 6) { p.y = g + 6; p.vy = Math.max(p.vy, 0); }
      } else {
        if (!p.seeking) {
          p.seeking = true;
          p.speed = Math.hypot(p.vx, p.vy, p.vz);
        }
        // Lead the player. Flying at where the ship *is* means tail-chasing a
        // 175 m/s target from behind and closing at only the 300 m/s margin;
        // leading it turns the last stretch into a head-on merge, which both
        // arrives sooner and puts the drop in frame while it does.
        _d.copy(playerPos).sub(_v.set(p.x, p.y, p.z));
        const dist = _d.length();
        if (playerVel && dist > 1) {
          const eta = dist / Math.max(1, p.speed + 1);
          _d.copy(playerPos).addScaledVector(playerVel, Math.min(eta, 1.2)).sub(_v);
        }
        if (dist > 1e-3) _d.normalize(); else _d.set(0, 0, -1);

        p.speed = Math.min(cap, p.speed + TUNE.seekAccel * dt);

        // Rotate the velocity toward the lead point, same construction as the
        // homing rounds: constant speed, bending direction.
        const sp = Math.hypot(p.vx, p.vy, p.vz);
        if (sp > 1e-3) {
          _v2.set(p.vx / sp, p.vy / sp, p.vz / sp);
          const cos = Math.min(1, Math.max(-1, _v2.dot(_d)));
          const ang = Math.acos(cos);
          const omega = Math.min(
            TUNE.turnMax,
            TUNE.turn * (1 + TUNE.turnCloseGain * p.speed / Math.max(dist, TUNE.turnCloseFloor)),
          );
          const step = Math.min(ang, omega * dt);
          const s = Math.sin(ang);
          if (step > 1e-5 && s > 1e-4) {
            const k1 = Math.sin(ang - step) / s, k2 = Math.sin(step) / s;
            _v2.set(_v2.x * k1 + _d.x * k2, _v2.y * k1 + _d.y * k2, _v2.z * k1 + _d.z * k2);
          }
          p.vx = _v2.x * p.speed; p.vy = _v2.y * p.speed; p.vz = _v2.z * p.speed;
        } else {
          p.vx = _d.x * p.speed; p.vy = _d.y * p.speed; p.vz = _d.z * p.speed;
        }

        p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;

        // Swept collect. At 475 m/s closing speed a drop covers 4 m per fixed
        // step, so a point test at the step position is fine at this grab
        // radius — but the *approach* is what matters: test the segment, or a
        // drop arriving down the ship's own axis can straddle it.
        const d = segPointDist(
          p.x - p.vx * dt, p.y - p.vy * dt, p.z - p.vz * dt, p.x, p.y, p.z, playerPos,
        );
        if (d < TUNE.grab) { collect(p, i); continue; }
      }

      // Body: spin, counter-spin, bob, and a comet tail once it is inbound.
      const root = p.root;
      const bob = p.seeking ? 0 : Math.sin(p.t * TUNE.bobRate + p.phase) * TUNE.bobAmp;
      root.position.set(p.x, p.y + bob, p.z);
      root.userData.core.rotation.set(p.t * TUNE.spin * 0.7, p.t * TUNE.spin, 0);
      root.userData.cage.rotation.set(p.t * TUNE.cageSpin * 0.6, p.t * TUNE.cageSpin, p.t * 0.4);
      root.userData.cage.scale.setScalar(1 + TUNE.pulse * Math.sin(p.t * 5.6 + p.phase));

      if (p.seeking) {
        const spec = PICKUP_KINDS[p.kind];
        // Wide. A tap round's 0.85 m ribbon is sized to read against a dark
        // canyon wall at 200 m; a drop's has to read against a blown-out sky at
        // 600 m, where an additive ribbon that thin composites to white and
        // disappears into the haze — measured on `shots/drop1`.
        ctx.fx.tracer(p, root.position.x, root.position.y, root.position.z, {
          col: spec.tail, colTail: spec.tailEnd, width: 3.2,
        });
      }
    }
  }

  function segPointDist(ax, ay, az, bx, by, bz, q) {
    const dx = bx - ax, dy = by - ay, dz = bz - az;
    const len2 = dx * dx + dy * dy + dz * dz;
    let t = len2 > 1e-9 ? ((q.x - ax) * dx + (q.y - ay) * dy + (q.z - az) * dz) / len2 : 0;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    const cx = ax + dx * t - q.x, cy = ay + dy * t - q.y, cz = az + dz * t - q.z;
    return Math.sqrt(cx * cx + cy * cy + cz * cz);
  }

  /**
   * Radar feed. Carriers are not published here — they are hostiles, and
   * combat.js already flags them on the contact it publishes for the hull.
   */
  function publish(out) {
    for (const p of live) out.push({ x: p.x, y: p.y, z: p.z, kind: p.kind });
  }

  function reset() {
    for (const p of live) { ctx.fx.tracerEnd(p); group.remove(p.root); disposeBody(p.root); }
    live.length = 0;
    for (const b of beacons) group.remove(b.mesh);
    beacons.length = 0;
  }

  return {
    spawn, markCarrier, update, publish, reset,
    get live() { return live; },
    get carriers() { return beacons.length; },
    dispose() {
      reset();
      if (GEO) {
        for (const v of Object.values(GEO)) {
          if (Array.isArray(v)) for (const g of v) g.dispose(); else v.dispose();
        }
        GEO = null;
      }
      if (MATS) {
        for (const set of Object.values(MATS)) for (const m of Object.values(set)) m.dispose();
        MATS = null;
      }
    },
  };
}
