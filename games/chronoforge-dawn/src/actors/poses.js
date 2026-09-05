// ─────────────────────────────────────────────────────────────────────────────
// The pose / animation system.
//
// Clips are FUNCTIONS OF TIME, not keyframe arrays baked at author time. That
// is the whole argument for a rig over a sprite sheet: Kaida idling, running,
// striking, hurt and victorious is one skeleton evaluated at five different t,
// and she is identical in every one by construction. A sprite sheet cannot make
// that promise and this game needs ~40 poses per hero.
//
// Every clip writes ABSOLUTE rotations for every joint it touches; joints it
// does not name snap back to the bind pose. A clip that accumulated would drift
// over a long session, and drift is exactly what tools/rig.mjs exists to catch.
//
// Axis reminder for this rig (character faces +Z, limbs hang along −Y):
//   spine  +rx = lean forward        arm  −rx = swing forward
//   knee   +rx = heel toward −Z      hip  −rx = thigh forward
// ─────────────────────────────────────────────────────────────────────────────

const TAU = Math.PI * 2;
const smooth = (t) => t * t * (3 - 2 * t);

/** Piecewise keyframe track with smoothstep easing. `keys` = [[t, v], …]. */
function track(t, keys) {
  if (t <= keys[0][0]) return keys[0][1];
  for (let i = 1; i < keys.length; i++) {
    if (t <= keys[i][0]) {
      const [t0, v0] = keys[i - 1], [t1, v1] = keys[i];
      const u = smooth((t - t0) / Math.max(1e-6, t1 - t0));
      return v0 + (v1 - v0) * u;
    }
  }
  return keys[keys.length - 1][1];
}

/** A pose accumulator. `set(bone, x, y, z)`; everything unset stays at bind. */
function P() {
  const j = {};
  return {
    j,
    root: { y: 0, z: 0, yaw: 0 },
    set(name, x = 0, y = 0, z = 0) { j[name] = [x, y, z]; return this; },
  };
}

/* ── idle ────────────────────────────────────────────────────────────────────
   Two beats on different periods (breath 3.1 s, weight shift 4.6 s) so the loop
   never visibly repeats. At 48 virtual rows most of this is sub-pixel; what
   actually reads is the shoulder rise and the slow hip sway, which is why they
   carry the largest amplitudes. */
function idle(t) {
  const p = P();
  const br = Math.sin((t / 3.1) * TAU);
  const sw = Math.sin((t / 4.6) * TAU);
  p.root.y = br * 0.012;
  p.set('hips', 0, sw * 0.05, sw * 0.03);
  p.set('spine_lower', 0.03 + br * 0.018, -sw * 0.03, 0);
  p.set('spine_upper', 0.01 - br * 0.012, -sw * 0.02, 0);
  p.set('neck', -0.04, sw * 0.10, 0);
  p.set('shoulder_L', 0.02 + br * 0.03, 0, 0.16);
  p.set('shoulder_R', 0.05 + br * 0.03, 0, -0.14);
  p.set('upperArm_L', -0.16, 0, 0);
  p.set('upperArm_R', -0.30, 0, 0);
  p.set('lowerArm_R', 0, 0, -0.18);
  p.set('upperLeg_L', -0.02, 0.05, 0.02);
  p.set('upperLeg_R', 0.01, -0.05, -0.02);
  p.set('lowerLeg_L', 0.05, 0, 0);
  p.set('lowerLeg_R', 0.02, 0, 0);
  return p;
}

/* ── run ─────────────────────────────────────────────────────────────────────
   0.58 s cycle. The bounce is at 2× the stride so the body rises on each
   contact, and the torso counter-rotates against the legs — without that the
   run reads as a slide even when the legs are perfect. */
function run(t) {
  const p = P();
  const ph = (t / 0.58) * TAU;
  const s = Math.sin(ph), c = Math.cos(ph);
  p.root.y = Math.abs(Math.sin(ph)) * 0.055 - 0.02;
  p.set('hips', 0.06, -s * 0.16, 0);
  p.set('spine_lower', 0.20, s * 0.10, 0);
  p.set('spine_upper', 0.10, s * 0.14, 0);
  p.set('neck', -0.22, -s * 0.10, 0);
  p.set('shoulder_L', s * 0.95, 0, 0.20);
  p.set('shoulder_R', -s * 0.95, 0, -0.20);
  p.set('upperArm_L', -0.85 - Math.max(0, s) * 0.5, 0, 0);
  p.set('upperArm_R', -0.85 - Math.max(0, -s) * 0.5, 0, 0);
  p.set('upperLeg_L', -s * 0.92, 0.04, 0.03);
  p.set('upperLeg_R', s * 0.92, -0.04, -0.03);
  p.set('lowerLeg_L', 0.35 + Math.max(0, c) * 1.15, 0, 0);
  p.set('lowerLeg_R', 0.35 + Math.max(0, -c) * 1.15, 0, 0);
  p.set('foot_L', -0.18 + s * 0.30, 0, 0);
  p.set('foot_R', -0.18 - s * 0.30, 0, 0);
  return p;
}

/* ── turn ────────────────────────────────────────────────────────────────────
   A 90° change of facing, not a wiggle. The root yaws through the whole angle;
   the head leads it and the chest follows, which is the only thing that makes a
   turn read as intent rather than as the model being rotated by the engine. */
function turn(t) {
  const p = P();
  const d = 0.52;
  const u = Math.min(1, t / d);
  const e = smooth(u);
  p.root.yaw = e * Math.PI * 0.5;
  const lead = Math.sin(u * Math.PI);
  p.root.y = -lead * 0.02;
  p.set('hips', 0.04, -lead * 0.22, lead * 0.10);
  p.set('spine_lower', 0.06 + lead * 0.05, lead * 0.16, -lead * 0.06);
  p.set('spine_upper', 0.02, lead * 0.24, -lead * 0.05);
  p.set('neck', -0.05, lead * 0.42, 0);
  p.set('shoulder_L', 0.10 + lead * 0.30, 0, 0.20 + lead * 0.10);
  p.set('shoulder_R', 0.06 - lead * 0.22, 0, -0.16 - lead * 0.10);
  p.set('upperArm_L', -0.24 - lead * 0.25, 0, 0);
  p.set('upperArm_R', -0.34, 0, 0);
  p.set('upperLeg_L', -0.10 - lead * 0.42, 0.10, 0.03);
  p.set('upperLeg_R', 0.06 + lead * 0.20, -0.10, -0.03);
  p.set('lowerLeg_L', 0.14 + lead * 0.75, 0, 0);
  p.set('lowerLeg_R', 0.06, 0, 0);
  p.set('foot_L', -0.10 - lead * 0.25, 0, 0);
  return p;
}

/* ── attack ──────────────────────────────────────────────────────────────────
   The one clip that uses shoulder_* as a separate joint from upperArm_*, which
   is the reason the spec kept them apart: the wind-up lives in the shoulder and
   survives a combo finisher's close crop, where an elbow does not. */
function attack(t) {
  const p = P();
  const wind = track(t, [[0, 0], [0.22, 1], [0.34, 1], [0.46, 0], [0.72, 0]]);
  const strike = track(t, [[0, 0], [0.30, 0], [0.40, 1], [0.55, 0.85], [0.72, 0]]);
  const lunge = track(t, [[0, 0], [0.30, -0.1], [0.42, 1], [0.72, 0.15]]);
  p.root.z = lunge * 0.26;
  p.root.y = -Math.abs(lunge) * 0.02;
  p.set('hips', 0.05 + strike * 0.08, wind * 0.32 - strike * 0.50, 0);
  p.set('spine_lower', 0.05 - wind * 0.16 + strike * 0.34, wind * 0.30 - strike * 0.46, 0);
  p.set('spine_upper', 0.02 - wind * 0.12 + strike * 0.22, wind * 0.40 - strike * 0.60, 0);
  p.set('neck', -0.06 + strike * 0.16, -wind * 0.20 - strike * 0.05, 0);
  p.set('shoulder_R', 0.10 + wind * 1.35 - strike * 1.75, 0, -0.14 - wind * 0.45 + strike * 0.30);
  p.set('upperArm_R', -0.30 - wind * 1.05 + strike * 0.95, 0, 0);
  p.set('lowerArm_R', 0, 0, -0.18 + wind * 0.25);
  p.set('shoulder_L', 0.05 - wind * 0.40 + strike * 0.55, 0, 0.20 + wind * 0.30);
  p.set('upperArm_L', -0.22 - wind * 0.55, 0, 0);
  p.set('upperLeg_L', -0.06 - lunge * 0.55, 0.06, 0.03);
  p.set('upperLeg_R', 0.06 + lunge * 0.32, -0.06, -0.03);
  p.set('lowerLeg_L', 0.10 + Math.abs(lunge) * 0.35, 0, 0);
  p.set('lowerLeg_R', 0.06 + Math.max(0, lunge) * 0.55, 0, 0);
  p.set('foot_L', -0.06 - lunge * 0.20, 0, 0);
  return p;
}

/* ── cast ────────────────────────────────────────────────────────────────────
   Both arms up and open, weight back, head tilted to the focus. Reads at 48
   rows because the silhouette changes shape, not because of the hands. */
function cast(t) {
  const p = P();
  const rise = track(t, [[0, 0], [0.34, 1], [0.78, 1], [1.0, 0.15]]);
  const puls = Math.sin(t * TAU * 2.4) * rise;
  p.root.y = rise * 0.03;
  p.set('hips', -0.04 * rise, 0, 0);
  p.set('spine_lower', -0.10 * rise, 0, 0);
  p.set('spine_upper', -0.14 * rise, 0, 0);
  p.set('neck', 0.10 + 0.16 * rise, 0, 0);
  p.set('shoulder_L', 0.10 - rise * 2.05, 0, 0.20 + rise * 0.55);
  p.set('shoulder_R', 0.10 - rise * 2.15 + puls * 0.05, 0, -0.16 - rise * 0.50);
  p.set('upperArm_L', -0.20 - rise * 0.55, 0, 0);
  p.set('upperArm_R', -0.20 - rise * 0.45, 0, 0);
  p.set('upperLeg_L', 0.06 * rise, 0.06, 0.03);
  p.set('upperLeg_R', -0.10 * rise, -0.06, -0.03);
  p.set('lowerLeg_L', 0.10 + rise * 0.18, 0, 0);
  p.set('lowerLeg_R', 0.06, 0, 0);
  return p;
}

/* ── hurt ────────────────────────────────────────────────────────────────── */
function hurt(t) {
  const p = P();
  const hit = track(t, [[0, 0], [0.07, 1], [0.26, 0.45], [0.5, 0]]);
  const shake = Math.sin(t * TAU * 9) * hit * 0.08;
  p.root.z = -hit * 0.20;
  p.root.y = -hit * 0.035;
  p.set('hips', -hit * 0.22, shake, 0);
  p.set('spine_lower', -hit * 0.34, shake, hit * 0.10);
  p.set('spine_upper', -hit * 0.26, shake, hit * 0.08);
  p.set('neck', -hit * 0.40, shake * 2, 0);
  p.set('shoulder_L', -hit * 0.50, 0, 0.20 + hit * 0.55);
  p.set('shoulder_R', -hit * 0.45, 0, -0.16 - hit * 0.50);
  p.set('upperArm_L', -0.20 - hit * 0.95, 0, 0);
  p.set('upperArm_R', -0.30 - hit * 0.85, 0, 0);
  p.set('upperLeg_L', hit * 0.30, 0.06, 0.03);
  p.set('upperLeg_R', -hit * 0.18, -0.06, -0.03);
  p.set('lowerLeg_L', 0.10 + hit * 0.35, 0, 0);
  p.set('lowerLeg_R', 0.06 + hit * 0.20, 0, 0);
  return p;
}

/* ── victory ─────────────────────────────────────────────────────────────── */
function victory(t) {
  const p = P();
  const up = track(t, [[0, 0], [0.42, 1], [1.6, 1]]);
  const bob = Math.sin(((t - 0.42) / 1.18) * TAU) * (t > 0.42 ? 1 : 0);
  p.root.y = up * 0.03 + bob * 0.012;
  p.set('hips', -up * 0.06, -up * 0.12, 0);
  p.set('spine_lower', -up * 0.14 + bob * 0.02, up * 0.10, 0);
  p.set('spine_upper', -up * 0.10, up * 0.16, 0);
  p.set('neck', up * 0.22 + bob * 0.03, -up * 0.10, 0);
  p.set('shoulder_R', 0.10 - up * 2.55, 0, -0.16 - up * 0.22);
  p.set('upperArm_R', -0.28 - up * 0.30, 0, 0);
  p.set('shoulder_L', 0.10 - up * 0.30, 0, 0.20 + up * 0.75);
  p.set('upperArm_L', -0.20 - up * 1.15, 0, 0);
  p.set('upperLeg_L', -up * 0.32, 0.08, 0.03);
  p.set('upperLeg_R', up * 0.14, -0.08, -0.03);
  p.set('lowerLeg_L', 0.10 + up * 0.30, 0, 0);
  p.set('lowerLeg_R', 0.06, 0, 0);
  p.set('foot_L', -up * 0.14, 0, 0);
  return p;
}

export const CLIPS = {
  idle: { fn: idle, duration: 9.2, loop: true },
  run: { fn: run, duration: 0.58, loop: true },
  turn: { fn: turn, duration: 0.52, loop: false },
  attack: { fn: attack, duration: 0.72, loop: false },
  cast: { fn: cast, duration: 1.0, loop: false },
  hurt: { fn: hurt, duration: 0.50, loop: false },
  victory: { fn: victory, duration: 1.60, loop: false },
};

export const POSE_NAMES = Object.keys(CLIPS);

/** Sample a clip at absolute time t, wrapping for loops and holding for
 *  one-shots. Pure — tools/rig.mjs poses the rig through this, so the gate
 *  measures exactly what the game renders. */
export function samplePose(name, t) {
  const c = CLIPS[name] || CLIPS.idle;
  const tt = c.loop ? ((t % c.duration) + c.duration) % c.duration : Math.min(t, c.duration);
  return c.fn(tt);
}

/**
 * Per-actor animator. Crossfades between clips so a pose change is a
 * transition, not a snap — the dev-panel viewer plays exactly these.
 */
export class Animator {
  constructor(actor) {
    this.actor = actor;
    this.clip = 'idle';
    this.t = 0;
    this.prev = null;
    this.prevT = 0;
    this.blend = 0;
    this.blendTime = 0.18;
    this.next = null;          // queued after a one-shot finishes
    /** Clip playback rate. Traversal drives this from ground speed so the run
     *  cycle advances with distance covered rather than with wall time — that
     *  is the whole fix for foot skate, and it is one multiply. */
    this.timeScale = 1;
    this._e = { x: 0, y: 0, z: 0 };
  }

  /** Start `name`. `queue` is what to fall back to when a one-shot ends. */
  play(name, { fade = 0.18, queue = 'idle', restart = true } = {}) {
    if (!CLIPS[name]) return this.clip;
    if (!restart && this.clip === name) return this.clip;
    this.prev = this.clip; this.prevT = this.t;
    this.clip = name; this.t = 0;
    this.blendTime = Math.max(0.001, fade);
    this.blend = fade > 0 ? 0 : 1;
    this.next = CLIPS[name].loop ? null : queue;
    return this.clip;
  }

  get finished() {
    const c = CLIPS[this.clip];
    return !c.loop && this.t >= c.duration;
  }

  update(dt) {
    const s = CLIPS[this.clip]?.loop ? this.timeScale : 1;  // one-shots keep real time
    this.t += dt * s;
    this.prevT += dt * s;
    if (this.blend < 1) this.blend = Math.min(1, this.blend + dt / this.blendTime);
    if (this.finished && this.next) this.play(this.next, { fade: 0.22, queue: null });
    this.apply();
  }

  /** Write the sampled pose onto the skeleton. Absolute, every frame. */
  apply() {
    const a = samplePose(this.clip, this.t);
    const b = this.blend < 1 && this.prev ? samplePose(this.prev, this.prevT) : null;
    const k = b ? smooth(this.blend) : 1;
    const A = this.actor;
    for (const bone of A.bones) {
      const ja = a.j[bone.name];
      const jb = b ? b.j[bone.name] : null;
      const x = lerp(jb ? jb[0] : 0, ja ? ja[0] : 0, k);
      const y = lerp(jb ? jb[1] : 0, ja ? ja[1] : 0, k);
      const z = lerp(jb ? jb[2] : 0, ja ? ja[2] : 0, k);
      /* A forged rig binds in an A-pose with arbitrary bone axes, so an
         absolute spec-space rotation goes through its derived per-bone
         correction (gltf-actor.js). `retarget` exists on a forged actor only. */
      if (A.retarget) A.retarget.set(bone, x, y, z);
      else bone.rotation.set(x, y, z);
    }
    const ry = lerp(b ? b.root.y : 0, a.root.y, k);
    const rz = lerp(b ? b.root.z : 0, a.root.z, k);
    const yaw = lerp(b ? b.root.yaw : 0, a.root.yaw, k);
    A.poseOffset = { y: ry, z: rz, yaw };
  }
}

const lerp = (x, y, t) => x + (y - x) * t;
