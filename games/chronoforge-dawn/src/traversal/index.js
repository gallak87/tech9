import * as THREE from 'three';
import { LOCKED_YAW_DEG, LOCKED_PITCH_DEG, FRAME_HEIGHT_M } from '../core/const.js';

// ─────────────────────────────────────────────────────────────────────────────
// traversal — free-roam movement. THE DEFAULT WAY THE GAME OPENS.
//
// Started life as the Phase 2.0.1 play SAMPLE behind `?play=1`, because at the
// time the only thing to walk on was a placeholder dune and the only reason to
// walk was to judge a rig. Graduated 2026-09-05: twelve authored maps are
// drivable, so needing a flag to move was the flag being wrong, not the feature.
//
// Still a sample in SCOPE, and that has not changed: one character, WASD, the
// locked follow camera. The full lane — party of three, follower spacing,
// collision, footfall audio — is Phase 5 and none of it is here.
//
//   (nothing)            boots into it
//   &play=0              opt OUT. Every tool in tools/ passes this, so review
//                        captures still frame the world and not the back of
//                        Kaida's head — a spawned player drags ctx.world.focus
//                        to itself and would silently re-aim every shot.
//   ?showcase=traversal  lane-showcase spelling
//   &map=<id>            any of the twelve, or `proto` for the placeholder dune
//   &dev=1               readouts you glance at while driving
//   &dev=2               LOOK MODE — orbit, tilt, zoom, outline, nothing else.
//                        Opens at 0deg / 32deg tilt / 3.3 m, the framing a
//                        character is actually judged at.
//   &tune=1              the knobs, when you actually mean to tune something
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

/** Metres of world across the frame while playing.
 *
 *  Was 10.0 — a PLAY-SAMPLE override cut so a 1.72 m character read big enough
 *  to judge her rig by. That was the right number for looking AT Kaida and the
 *  wrong one for looking THROUGH her: at 10 m the locked 55 deg pitch fills the
 *  frame with the ground immediately around her and you cannot see what you are
 *  walking toward. Back to the shipping value in core/const.js now that the
 *  sample is the game. The Frame slider under `?tune=1` still moves it live. */
const PLAY_FRAME_HEIGHT_M = FRAME_HEIGHT_M;

/** Where ?dev=2 look mode opens: straight on, tilted down 32 deg, 3.3 m of world
 *  across the frame. Chosen by the human at the panel, not derived — it is the
 *  framing a character actually gets judged at, so it is the framing look mode
 *  should hand you without three slider drags first. `Reset` returns here
 *  rather than to the locked exploration camera; inside look mode, "reset"
 *  means back to the view you started from. */
const LOOK_YAW_DEG = 0;
const LOOK_TILT_DEG = 32;
const LOOK_FRAME_M = 3.3;

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
  /* GRADUATED 2026-09-05. This stopped being a sample the moment the twelve
     authored maps became drivable: `?play=1` was a flag for a thing that had
     to be asked for, and walking the world is now the default way the game
     opens. `play=0` opts out, and every tool in tools/ passes it so review
     captures still frame the world rather than the back of Kaida's head. */
  const wantPlay = params.get('play') !== '0';

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
      ctx.actors?.pose(player, act);   // update() reads anim.clip back out
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
    if (ctx.rig) ctx.rig.frameHeight = PLAY_FRAME_HEIGHT_M;
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

    /* Clip selection. Read the Animator's OWN clip rather than tracking a copy:
       a one-shot queues itself back to idle inside anim.update(), so `finished`
       is true for zero observable frames from out here. Mirroring it in a local
       `clip` therefore latched on 'attack' forever and she floated instead of
       running — hit Space once and movement animation was gone for the session.
       The animator is the single source of truth; ask it. */
    const moving = speed > IDLE_EPS;
    const cur = player.anim.clip;
    const busy = cur !== 'idle' && cur !== 'run';       // a one-shot is playing
    if (!busy) {
      const want = moving ? 'run' : 'idle';
      if (want !== cur) ctx.actors.pose(player, want);
    }
    clip = player.anim.clip;
    /* Playback rate follows ground speed, so a sprint takes faster steps rather
       than longer ones. One-shots ignore it — see Animator.timeScale. */
    player.anim.timeScale = moving ? Math.max(0.35, speed / REF_RUN_SPEED) : 1;

    /* Slope under her feet — a readout, not yet a behaviour. Foot IK and the
       slope-aligned root are Phase 2.4; this is here so the problem is VISIBLE
       while she runs rather than argued about from a still. */
    if (w?.normalAt) {
      const n = w.normalAt(player.base.x, player.base.z);
      slopeDeg = THREE.MathUtils.radToDeg(Math.acos(THREE.MathUtils.clamp(n.y ?? 1, -1, 1)));
    }

    if (spin && ctx.rig) {
      ctx.rig.yawDeg = ((ctx.rig.yawDeg + 26 * dt + 180) % 360) - 180;
      basis();
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
  /* ── dev panel ────────────────────────────────────────────────────────────
     Two tiers, because a wall of sliders is not a tool. `?dev=1` shows what you
     read WHILE DRIVING; `?tune=1` adds the knobs you only touch when you are
     deliberately tuning. devpanel.js is integrator-only and its toggles re-read
     their getter on click rather than per frame, so a toggle is the wrong widget
     for state this module changes on its own — these are readouts on purpose. */
  const dev = ctx.dev;
  const tuning = params.get('tune') === '1';
  if (dev) {
    dev.register({
      group: 'play', label: 'Move', type: 'readout',
      get: () => (player ? `${speed.toFixed(1)} m/s  ${clip}` : 'off — ?play=1'),
    });
    dev.register({
      group: 'play', label: 'Slope', type: 'readout',
      get: () => (player ? `${slopeDeg.toFixed(0)}deg` : '--'),
    });
    dev.register({
      group: 'play', label: 'Frame', type: 'readout',
      get: () => `${(ctx.rig?.frameHeight ?? 0).toFixed(1)}m  ${ctx.actors?.report?.().heroScreenPx ?? '?'}px`,
    });
  }
  /* ── ?dev=2 — LOOK MODE ───────────────────────────────────────────────────
     Three sliders and nothing else: orbit her, tilt, zoom. This is the mode for
     judging a character, so every knob that is not about seeing her is out of
     the way.

     Orbiting moves rig.yawDeg, so rig.assertLocked() reads FALSE while look
     mode is on. That is honest rather than a bug — the camera genuinely is off
     its locked framing — and 'Reset' puts it back. Captures are unaffected:
     tools/shot.mjs never passes dev.

     STOPGAP, and worth naming: main.js registers time/camera/sim/perf/quality
     itself, and this file cannot un-register another lane's controls. Hiding
     them is done here in CSS rather than by editing src/core/devpanel.js, which
     is INTEGRATOR ONLY. The real fix is a `collapsed` option on dev.register,
     and it belongs to the integrator. Logged as devpanel-no-group-filter. */
  let spin = false;
  function applyLookCamera() {
    if (!ctx.rig) return;
    ctx.rig.yawDeg = LOOK_YAW_DEG;
    ctx.rig.pitchDeg = LOOK_TILT_DEG;
    ctx.rig.frameHeight = LOOK_FRAME_M;
    ctx.rig.reset(ctx.world?.focus);
    basis();
  }

  if (dev && params.get('dev') === '2') {
    /* Hide every group but ours by setting display on the group divs directly.
       NOT by adding a class to #dawn-dev: devpanel.js treats ANY className on
       its root as "hidden" (`if (root.className) return`) and would stop
       updating its own readouts. Found by trying it. */
    const KEEP = 'look';
    let looked = false;
    function applyLook() {
      const el = document.getElementById('dawn-dev');
      if (!el) return;
      const grps = el.querySelectorAll('.grp');
      if (!grps.length) return;
      for (const g of grps) {
        g.style.display = g.querySelector('.gl')?.textContent === KEEP ? '' : 'none';
      }
      looked = true;
    }
    dev.register({
      group: 'look', label: 'Orbit', type: 'range', min: -180, max: 180, step: 1,
      get: () => ctx.rig?.yawDeg ?? 0,
      set: (v) => { if (ctx.rig) { ctx.rig.yawDeg = v; basis(); } },
      format: (v) => v.toFixed(0) + 'deg',
    });
    dev.register({
      group: 'look', label: 'Tilt', type: 'range', min: 8, max: 88, step: 1,
      get: () => ctx.rig?.pitchDeg ?? LOCKED_PITCH_DEG,
      set: (v) => { if (ctx.rig) ctx.rig.pitchDeg = v; },
      format: (v) => v.toFixed(0) + 'deg',
    });
    dev.register({
      group: 'look', label: 'Zoom', type: 'range', min: 2.5, max: 26, step: 0.25,
      get: () => ctx.rig?.frameHeight ?? PLAY_FRAME_HEIGHT_M,
      set: (v) => { if (ctx.rig) ctx.rig.frameHeight = v; },
      format: (v) => v.toFixed(1) + 'm',
    });
    /* Turntable. Judging a silhouette from one angle is judging a drawing of it;
       the box-ness of the old rig was most obvious in rotation. */
    dev.register({
      group: 'look', label: 'Spin', type: 'toggle',
      get: () => spin, set: (v) => { spin = v; },
    });
    dev.register({
      group: 'look', label: 'Reset', type: 'button', text: 'lock',
      action: () => { applyLookCamera(); },
    });
    /* Doubles as the hide hook — the panel rebuilds lazily on its own update(),
       so the hide has to run after that and has to survive a rebuild. A control
       registered purely for the side effect would need a label anyway:
       dev.register() rejects a falsy one. Found by trying that too. */
    dev.register({
      group: 'look', label: 'Kaida', type: 'readout',
      get: () => {
        if (!looked || document.querySelector('#dawn-dev .grp[style=""]')) applyLook();
        return `${ctx.actors?.report?.().heroScreenPx ?? '?'}px  ${clip}  ${slopeDeg.toFixed(0)}deg`;
      },
    });
    dev.show(true);
    // The world and the player are not up yet at install time; the same
    // microtask that takes control sets the camera.
    queueMicrotask(() => { if (player) applyLookCamera(); });
  }

  if (dev && tuning) {
    dev.register({
      group: 'tune', label: 'WASD', type: 'toggle',
      get: () => !!player, set: (v) => (v ? start() : stop()),
    });
    dev.register({
      group: 'tune', label: 'Speed', type: 'range', min: 0.25, max: 3, step: 0.05,
      get: () => speedScale, set: (v) => { speedScale = v; },
      format: (v) => (WALK_SPEED * v).toFixed(1) + ' m/s',
    });
    dev.register({
      group: 'tune', label: 'Damp', type: 'range', min: 0, max: 0.6, step: 0.01,
      get: () => ctx.rig?.halfLife ?? 0, set: (v) => { if (ctx.rig) ctx.rig.halfLife = v; },
      format: (v) => v.toFixed(2) + 's',
    });
    /* The camera's own zoom, live. The knob behind open issue rig-snap-subpixel
       and P0-6 — FRAME_HEIGHT_M was set from a pixel-height argument and had
       never been driven. Sets frameHeight only; re-locking the baseline is
       integrator territory and assertLocked() does not guard it. */
    dev.register({
      group: 'tune', label: 'Frame', type: 'range', min: 5, max: 26, step: 0.5,
      get: () => ctx.rig?.frameHeight ?? 18,
      set: (v) => { if (ctx.rig) ctx.rig.frameHeight = v; },
      format: (v) => v.toFixed(1) + ' m',
    });
    dev.register({
      group: 'tune', label: 'Where', type: 'readout',
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
