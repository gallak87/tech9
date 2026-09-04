import * as THREE from 'three';
import { LOCKED_YAW_DEG } from '../core/const.js';

// ─────────────────────────────────────────────────────────────────────────────
// traversal — free-roam play sample.
//
// Phase 2.0.1, and deliberately a SAMPLE rather than the traversal tier: one
// character, WASD, real terrain, the locked follow camera. The full lane —
// party of three, follower spacing, collision, footfall audio — is Phase 5 and
// none of it is here.
//
// It exists because a showcase that stages a fixed lineup at a fixed camera can
// only be judged on the things it chose to show. Driving the character yourself
// is how you find the things it did not: how she reads from behind, how she
// crests a dune, whether her feet touch the ground on a slope, whether the
// silhouette survives being a hundred metres away and moving.
//
//   ?play=1              boot straight into it
//   ?showcase=traversal  same thing, lane-showcase spelling
//
// Opt-in on purpose. tools/shot.mjs boots with neither, so every existing
// capture is unaffected.
//
// WASD / arrows move, Shift sprints, Space swings, C casts, V for victory,
// H for hurt. Movement is CAMERA-RELATIVE — W is away from the lens, not
// world −Z — because the camera yaw is locked and a player pressing W on a
// rotated world axis is the oldest bad feel in the genre.
//
// This module never touches the actor's mesh, its material or its clips. It
// writes `base.x/z/yaw` and the actors lane's own `place()` grounds it, so the
// seam between "where is she" and "what does she look like" stays where
// CONTRACT.md puts it.
//
// Owned by the `traversal` lane. See CONTRACT.md §1.
// ─────────────────────────────────────────────────────────────────────────────

/** Metres per second. Tuned against the run clip's 0.58 s cycle so the stride
 *  reads at the default; both are live on the dev panel because the right
 *  number is a feel judgement and feel judgements are made by driving. */
const WALK_SPEED = 4.0;
const SPRINT_MUL = 1.9;

/** The speed the run clip was authored at. Playback scales against this, so a
 *  sprint takes faster steps rather than longer ones and the feet stop
 *  skating. See Animator.timeScale in ../actors/poses.js. */
const REF_RUN_SPEED = 4.0;

/** Ground speed under which she is standing still, not creeping. */
const IDLE_EPS = 0.15;

/** Acceleration half-lives, seconds. Movement eases in; facing eases faster,
 *  because a character who turns as slowly as she accelerates reads as drunk. */
const MOVE_HALF_LIFE = 0.09;
const TURN_HALF_LIFE = 0.07;

/** Camera looks at hip height, not at her feet — framing her at the bottom of
 *  the screen is what a ground-level focus actually does. */
const FOCUS_LIFT_M = 0.95;

const KEYS = {
  KeyW: 'f', ArrowUp: 'f',
  KeyS: 'b', ArrowDown: 'b',
  KeyA: 'l', ArrowLeft: 'l',
  KeyD: 'r', ArrowRight: 'r',
  ShiftLeft: 'sprint', ShiftRight: 'sprint',
};
const ACTIONS = { Space: 'attack', KeyC: 'cast', KeyV: 'victory', KeyH: 'hurt' };

export function installTraversal(ctx) {
  const params = new URLSearchParams(location.search);
  const wantPlay = params.get('play') === '1' || params.get('showcase') === 'traversal';

  const down = Object.create(null);
  let player = null;
  let listening = false;

  const vel = new THREE.Vector2(0, 0);      // world XZ, metres/second
  let yaw = 0;                              // current facing, radians
  let speed = 0;                            // |vel|, cached for the readout
  let slopeDeg = 0;
  let clip = 'idle';

  let speedScale = 1;                       // dev-panel multiplier on WALK_SPEED

  /* Camera basis on the ground plane. The rig's yaw is locked, so these are
     constants — computed once rather than per frame, and re-read only if the
     integrator ever relocks the camera. */
  const fwd = new THREE.Vector2();
  const right = new THREE.Vector2();
  function basis() {
    const y = THREE.MathUtils.degToRad(ctx.rig?.yawDeg ?? LOCKED_YAW_DEG);
    fwd.set(-Math.sin(y), -Math.cos(y));     // into the screen
    right.set(Math.cos(y), -Math.sin(y));    // screen right
  }
  basis();

  /* ── input ────────────────────────────────────────────────────────────────
     Listeners set flags; the fixed step reads them. Input is a poll of devices,
     not a quantity the sim integrates — see the note in main.js. Held keys must
     therefore survive a frame in which no event fired, which a queue would not. */
  function onDown(e) {
    if (e.repeat) return;
    if (KEYS[e.code]) { down[KEYS[e.code]] = true; e.preventDefault(); return; }
    const act = ACTIONS[e.code];
    if (act && player) {
      ctx.actors?.pose(player, act);
      clip = act;
      e.preventDefault();
    }
  }
  function onUp(e) { if (KEYS[e.code]) { down[KEYS[e.code]] = false; e.preventDefault(); } }
  /* A window that loses focus mid-stride keeps the key flag set forever and she
     runs off the map on her own. Clear on blur. */
  function onBlur() { for (const k of Object.keys(down)) down[k] = false; }

  function listen(on) {
    if (on === listening) return;
    listening = on;
    const fn = on ? window.addEventListener : window.removeEventListener;
    fn('keydown', onDown);
    fn('keyup', onUp);
    fn('blur', onBlur);
    if (!on) onBlur();
  }

  /* ── take control ─────────────────────────────────────────────────────── */
  function start() {
    const actors = ctx.actors;
    if (!actors) return false;
    if (player) return true;
    actors.clear();
    const w = ctx.world;
    const f = w?.focus ?? new THREE.Vector3();
    player = actors.spawn({ id: 'kaida', faction: 'ally', x: f.x, z: f.z, yaw: 0, pose: 'idle' });
    yaw = 0;
    vel.set(0, 0);
    clip = 'idle';
    listen(true);
    ctx.rig?.reset(f);
    ctx.bus?.emit('traversal:control', { id: player.id });
    return true;
  }

  function stop() {
    listen(false);
    if (player) { ctx.actors?.despawn(player); player = null; }
    vel.set(0, 0);
    speed = 0;
    return true;
  }

  /* ── the step ─────────────────────────────────────────────────────────── */
  function update(dt, c = ctx) {
    if (!player) return;
    const w = c.world;

    let ix = 0, iz = 0;
    if (down.f) iz += 1;
    if (down.b) iz -= 1;
    if (down.r) ix += 1;
    if (down.l) ix -= 1;

    /* Normalise the stick, not the axes — diagonals must not be 1.41x faster. */
    let tx = fwd.x * iz + right.x * ix;
    let tz = fwd.y * iz + right.y * ix;
    const mag = Math.hypot(tx, tz);
    const top = WALK_SPEED * speedScale * (down.sprint ? SPRINT_MUL : 1);
    if (mag > 1e-6) { tx = (tx / mag) * top; tz = (tz / mag) * top; }
    else { tx = 0; tz = 0; }

    const k = 1 - Math.pow(0.5, dt / MOVE_HALF_LIFE);
    vel.x += (tx - vel.x) * k;
    vel.y += (tz - vel.y) * k;
    speed = Math.hypot(vel.x, vel.y);

    /* Integrate, then clamp inside the world. No collision yet — Phase 5 owns
       it — so the only wall is the heightfield's own extent. A margin, not the
       exact edge: the terrain's normal goes undefined past the last vertex. */
    const half = (w?.size ?? 240) * 0.5 - 4;
    player.base.x = THREE.MathUtils.clamp(player.base.x + vel.x * dt, -half, half);
    player.base.z = THREE.MathUtils.clamp(player.base.z + vel.y * dt, -half, half);

    /* Face the direction of travel. The rig's bind pose faces +Z, so a heading
       of (dx, dz) is atan2(dx, dz) — NOT the atan2(z, x) that a top-down 2D
       game would use, and the sign error is invisible until she runs backwards. */
    if (speed > IDLE_EPS) {
      const want = Math.atan2(vel.x, vel.y);
      let d = want - yaw;
      d = Math.atan2(Math.sin(d), Math.cos(d));         // shortest way round
      yaw += d * (1 - Math.pow(0.5, dt / TURN_HALF_LIFE));
    }
    player.base.yaw = yaw;

    /* Clip selection, and the reason the run does not skate: playback rate is
       driven by ground speed against the speed the clip was authored at. */
    const moving = speed > IDLE_EPS;
    const want = moving ? 'run' : 'idle';
    const oneShot = clip !== 'idle' && clip !== 'run';
    if (oneShot && player.anim.finished) clip = player.anim.clip;
    if (!oneShot && want !== clip) { ctx.actors.pose(player, want); clip = want; }
    player.anim.timeScale = moving ? Math.max(0.35, speed / REF_RUN_SPEED) : 1;

    /* Slope under her feet — a readout, not yet a behaviour. Foot IK and the
       slope-aligned root are Phase 2.4; this is here so the problem is VISIBLE
       while she runs rather than argued about from a still. */
    if (w?.normalAt) {
      const n = w.normalAt(player.base.x, player.base.z);
      slopeDeg = THREE.MathUtils.radToDeg(Math.acos(THREE.MathUtils.clamp(n.y ?? 1, -1, 1)));
    }

    /* Drive the camera. main.js reads ctx.world.focus every frame and the rig
       damps toward it, so moving this point IS the follow camera. */
    if (w?.focus) {
      const g = w.heightAt ? w.heightAt(player.base.x, player.base.z) : 0;
      w.focus.set(player.base.x, g + FOCUS_LIFT_M, player.base.z);
    }
  }

  /** `?showcase=traversal` boots straight into it. */
  function showcase() { return start(); }

  if (wantPlay) {
    /* The world builds during install; actors installs after traversal, so the
       spawn cannot happen inline. One microtask is enough and is cheaper than
       an event subscription for a one-shot. */
    queueMicrotask(() => { start(); });
  }

  /* ── dev panel ────────────────────────────────────────────────────────────
     Registered from this file through ctx.dev.register — devpanel.js is not
     edited. Speed is live because the right run speed is a feel judgement. */
  const dev = ctx.dev;
  if (dev) {
    dev.register({
      group: 'play', label: 'WASD', type: 'toggle',
      get: () => !!player,
      set: (v) => (v ? start() : stop()),
    });
    dev.register({
      group: 'play', label: 'Speed', type: 'range', min: 0.25, max: 3, step: 0.05,
      get: () => speedScale, set: (v) => { speedScale = v; },
      format: (v) => (WALK_SPEED * v).toFixed(1) + ' m/s',
    });
    dev.register({
      group: 'play', label: 'Camera', type: 'range', min: 0, max: 0.6, step: 0.01,
      get: () => ctx.rig?.halfLife ?? 0, set: (v) => { if (ctx.rig) ctx.rig.halfLife = v; },
      format: (v) => v.toFixed(2) + 's',
    });
    /* The camera's own zoom, live. This is the knob behind open issue
       rig-snap-subpixel and P0-6 — FRAME_HEIGHT_M was set from a pixel-height
       argument and has never been driven. Drive it. Pulling in re-frames the
       whole game, so it is a look decision, not a convenience. */
    dev.register({
      group: 'play', label: 'Frame', type: 'range', min: 7, max: 26, step: 0.5,
      get: () => ctx.rig?.frameHeight ?? 18,
      set: (v) => { if (ctx.rig) { ctx.rig.frameHeight = v; ctx.rig.relock?.({ frameHeight: v }); } },
      format: (v) => v.toFixed(1) + ' m',
    });
    dev.register({
      group: 'play', label: 'Move', type: 'readout',
      get: () => (player ? `${speed.toFixed(1)} m/s  ${clip}` : 'off'),
    });
    dev.register({
      group: 'play', label: 'Slope', type: 'readout',
      get: () => (player ? `${slopeDeg.toFixed(0)}deg` : '--'),
    });
    dev.register({
      group: 'play', label: 'Where', type: 'readout',
      get: () => (player
        ? `${player.base.x.toFixed(0)} ${player.base.z.toFixed(0)}  y${(ctx.world?.heightAt?.(player.base.x, player.base.z) ?? 0).toFixed(1)}`
        : '--'),
    });
  }

  return {
    update,
    showcase,
    start, stop,
    get player() { return player; },
    /** Put her somewhere. The dev-panel teleport backlog item builds on this. */
    teleport(x, z) {
      if (!player) return false;
      player.base.x = x; player.base.z = z;
      vel.set(0, 0);
      const g = ctx.world?.heightAt?.(x, z) ?? 0;
      ctx.world?.focus?.set(x, g + FOCUS_LIFT_M, z);
      ctx.rig?.reset(ctx.world?.focus);
      return true;
    },
    report() {
      return player
        ? { control: player.id, speed: +speed.toFixed(2), clip, slopeDeg: +slopeDeg.toFixed(1),
            x: +player.base.x.toFixed(1), z: +player.base.z.toFixed(1) }
        : { control: null };
    },
    dispose() { stop(); },
  };
}
