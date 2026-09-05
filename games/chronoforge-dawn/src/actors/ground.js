import * as THREE from 'three';

// ─────────────────────────────────────────────────────────────────────────────
// Ground contact — Phase 2.4.
//
// The problem, stated as a number rather than a complaint. An actor is placed by
// ONE heightAt() sample at its root and stood up world-vertical. At a run her
// feet are ~0.70 m apart fore-aft, so on the steepest walkable ground —
// MAX_WALKABLE_SLOPE_DEG = 34 — the two feet stand over 0.70·tan(34°) = 0.47 m
// of height difference. Her leg is 0.88 m. More than half a leg in the air.
// At a routine 20° biome slope it is still 0.25 m on a 1.72 m character.
//
// Four things fix it, in the order they must run:
//
//   1. SLOPE-ALIGN THE ROOT, partially. Fully aligning a character to the
//      surface normal makes her read like a car on a ramp; not aligning at all
//      makes her read like a cardboard cutout stuck in sand. Real bodies split
//      the difference — ankles and hips absorb the rest — so blend.
//   2. LIFT THE ROOT so the foot that needs the most help is exactly planted,
//      rather than averaging the two and burying one.
//   3. EXTEND THE OTHER LEG to reach its own ground, by solving the knee. This
//      is the part that actually kills the float: after step 2 one foot is
//      correct by construction and the other is hanging by the full slope
//      difference.
//   4. ROLL THE FOOT onto the surface, so the sole lies on the hill instead of
//      cutting into it.
//
// Everything here runs AFTER the clip has been sampled and writes on top of it.
// Clips author absolute rotations (see poses.js), so this layers cleanly and
// poses.js needs no changes at all — which is the whole reason the animation
// system was built that way.
//
// Rigid skinning makes the bent knee a hard crease rather than a smooth bulge.
// That is the correct read for this character, not a compromise.
// ─────────────────────────────────────────────────────────────────────────────

/** How far to rotate the body toward the surface normal. 0 = always vertical,
 *  1 = lie flat on the hill like a vehicle. Bodies do roughly half. */
const ALIGN = 0.45;

/** Ceiling on any single correction, in metres of rig space. A cliff edge
 *  sampled between two feet can ask for a metre, and honouring that dislocates
 *  her. Clamping leaves a visible error on terrain we do not let her walk on. */
const MAX_CORRECTION = 0.34;

/** Bone lengths of the CODE-BUILT rig, from docs/specs/rig.mjs. Defaults, not
 *  constants: a forged character carries its own, measured off the glb at load
 *  and hung on the actor as `limb` and `soleM` (gltf-actor.js `measureLegs`).
 *
 *  SOLE is 5 mm off its own rig. Kaida's boot loft bottoms at −0.075 in
 *  foot-local space, and the foot bone sits at y 0.06 rather than the 0.08 the
 *  spec table implies — rig.mjs sums hips.y as 0.42+0.46+0.08 but the chain
 *  also carries upperLeg's −0.02. Pre-existing; her sole rests 5 mm high. */
const THIGH = 0.42;
const SHIN = 0.46;
const SOLE = 0.08;          // ankle-to-sole, baked into the foot's rest pose

/** A foot floating further than this above its ground is SWINGING, not planted,
 *  and must be left alone. Grounding both feet of a running character is wrong
 *  by construction: half a run cycle is one foot deliberately in the air, and
 *  dragging it down turns a run into a shuffle. Measured on the real run clip,
 *  whose feet reach 1.42 m apart at full extension. */
const PLANT_NEAR = 0.06;
const PLANT_FAR = 0.34;

/** How fast corrections ease in. Snapping the hips to every heightfield sample
 *  reads as a twitch on noisy ground; a short half-life is invisible and kills
 *  it. Feet ease faster than hips — a planted foot must not slide. */
const HIP_HALF_LIFE = 0.07;
const FOOT_HALF_LIFE = 0.045;

const _n = new THREE.Vector3();
const _up = new THREE.Vector3(0, 1, 0);
const _q = new THREE.Quaternion();
const _qy = new THREE.Quaternion();
const _hip = new THREE.Vector3();
const _ankle = new THREE.Vector3();
const _dir = new THREE.Vector3();

const damp = (dt, halfLife) => 1 - Math.pow(0.5, dt / Math.max(1e-4, halfLife));

/** Add to a bone's rotation about one axis, in the frame the CLIPS are authored
 *  in. On the code-built rig that is the bone's own frame, so this is the `+=`
 *  it has always been. A forged rig's bone axes are whatever the auto-rigger
 *  produced, so the delta goes through the retarget — otherwise "flex the knee
 *  about X" flexes it about an arbitrary diagonal. */
const rot = (a, bone, axis, d) => {
  if (a.retarget) a.retarget.add(bone, axis, d);
  else bone.rotation[axis] += d;
};

/**
 * Knee flex that yields a given hip-to-ankle span.
 *
 * The leg is two links hinged at the knee. With `k` the flex angle away from
 * straight, the law of cosines gives the span directly — no iteration, no
 * search. k = 0 is a locked knee at THIGH + SHIN; k = π folds the calf onto the
 * thigh at |THIGH − SHIN|.
 */
function flexFor(span, l1, l2) {
  const c = (span * span - l1 * l1 - l2 * l2) / (2 * l1 * l2);
  return Math.acos(THREE.MathUtils.clamp(c, -1, 1));
}

/**
 * Ground one actor. Call once per sim step, after `anim.update()` and after the
 * root has been placed and yawed.
 *
 * @param {object} a    the actor from buildActor()
 * @param {object} w    the world module — needs heightAt() and normalAt()
 * @param {number} dt   fixed step, seconds
 * @param {object} o    { align, enabled }
 */
export function groundActor(a, w, dt, o = {}) {
  if (!w?.heightAt || !w.normalAt) return null;
  const align = o.align ?? ALIGN;
  const s = a.root.scale.x || 1;
  /* Measured off the glb when there is one; the spec table otherwise. */
  const l1 = (a.limb?.thigh ?? THIGH) * s, l2 = (a.limb?.shin ?? SHIN) * s;
  const sole = a.soleM ?? SOLE;

  a.ik = a.ik || { lift: 0, legL: 0, legR: 0, pitch: 0, roll: 0, slopeDeg: 0, plantL: 0, plantR: 0 };
  const ik = a.ik;

  /* ── 1. slope-align ──────────────────────────────────────────────────────
     Build the rotation that takes world up onto the surface normal, take
     `align` of it, then apply the actor's yaw INSIDE it — yaw first, then tilt,
     so she turns on the hillside rather than about the hill's own axis. */
  w.normalAt(a.root.position.x, a.root.position.z, _n);
  ik.slopeDeg = THREE.MathUtils.radToDeg(Math.acos(THREE.MathUtils.clamp(_n.y, -1, 1)));
  _q.setFromUnitVectors(_up, _n);
  _q.slerp(new THREE.Quaternion(), 1 - align);   // identity ← → full normal
  _qy.setFromAxisAngle(_up, a.root.rotation.y);
  a.root.quaternion.copy(_q).multiply(_qy);
  a.root.updateMatrixWorld(true);

  /* ── 2. measure both feet ────────────────────────────────────────────────
     What each foot needs, in world metres. Positive = the foot is below its
     ground and must come up. */
  const need = {}, plant = {};
  for (const side of ['L', 'R']) {
    const foot = a.boneByName.get(`foot_${side}`);
    if (!foot) return null;
    foot.getWorldPosition(_ankle);
    const g = w.heightAt(_ankle.x, _ankle.z);
    const err = (g + sole * s) - _ankle.y;         // >0 buried, <0 floating
    need[side] = THREE.MathUtils.clamp(err, -MAX_CORRECTION, MAX_CORRECTION);
    /* Plant weight, derived rather than authored. A clip COULD carry a per-foot
       plant flag and eventually should, but that means editing every clip in
       poses.js and the animation is parked. The height above ground says the
       same thing for free: a foot at the surface is planted, a foot a third of
       a metre up is mid-swing, and the blend between is the roll-off. A buried
       foot is always planted — it is inside the hill and must come out. */
    plant[side] = err >= 0 ? 1 : 1 - THREE.MathUtils.smoothstep(-err, PLANT_NEAR, PLANT_FAR);
  }

  /* ── 3. lift the root so the NEEDIEST foot is exactly planted ────────────
     max(), not the average. Averaging splits the error between the feet and
     buries the downhill one, which is the thing this whole file exists to
     stop. The other leg is then extended in step 4 — that asymmetry IS what
     standing on a hill looks like. */
  /* Only a planted foot may lift the hips. A swing foot passing over a rise
     would otherwise pogo the whole character upward once per stride. */
  const lift = Math.max(need.L * plant.L, need.R * plant.R, 0) > 0
    ? Math.max(need.L * (plant.L > 0.5 ? 1 : 0), need.R * (plant.R > 0.5 ? 1 : 0))
    : Math.max(need.L * plant.L, need.R * plant.R);
  ik.lift += (lift - ik.lift) * damp(dt, HIP_HALF_LIFE);
  a.root.position.y += ik.lift;
  a.root.updateMatrixWorld(true);

  /* ── 4. extend each leg to its own ground ────────────────────────────────
     After the lift, one foot is correct and the other hangs by the slope
     difference. Solve the knee for the extra span, then give half of it back
     to the hip so the foot drops rather than swinging forward. */
  for (const side of ['L', 'R']) {
    const upper = a.boneByName.get(`upperLeg_${side}`);
    const lower = a.boneByName.get(`lowerLeg_${side}`);
    const foot = a.boneByName.get(`foot_${side}`);
    upper.getWorldPosition(_hip);
    foot.getWorldPosition(_ankle);

    const g = w.heightAt(_ankle.x, _ankle.z);
    let dy = (g + sole * s) - _ankle.y;
    dy = THREE.MathUtils.clamp(dy, -MAX_CORRECTION, MAX_CORRECTION);

    /* The correction we want is VERTICAL; the leg is not. Project it onto the
       leg's own axis, or a leg swung out mid-stride under-corrects badly.
       The floor on the divisor stops a near-horizontal leg from demanding an
       infinite one. */
    _dir.subVectors(_ankle, _hip);
    const spanNow = Math.max(1e-4, _dir.length());
    const vertical = Math.max(0.35, -_dir.y / spanNow);
    /* MINUS, and the sign is the whole solve. dy is target-minus-current, so a
       FLOATING foot (current above its ground) gives dy < 0 and has to move
       DOWN — which is AWAY from the hip, a LONGER span. Adding dy shortened the
       leg of the foot that was already hanging and the correction measured as
       no better than doing nothing at all. */
    /* The 0.005 ceiling costs a standing residual whenever a clip holds the
       knee straighter than it: `idle` sits at 0.05 rad, a span of 0.8797
       against a 0.875 ceiling, so the solve over-flexes by ~4.7 mm and holds
       there. Inside tools/ground.mjs's 0.02 p95 band, and not free to raise —
       a locked knee has no IK solution. */
    const wantSpan = THREE.MathUtils.clamp(
      spanNow - dy / vertical, Math.abs(l1 - l2) + 0.02 * s, (l1 + l2) - 0.005 * s);

    const kNow = flexFor(THREE.MathUtils.clamp(spanNow, Math.abs(l1 - l2) + 1e-3, l1 + l2 - 1e-3), l1, l2);
    const kWant = flexFor(wantSpan, l1, l2);
    const target = kWant - kNow;                    // signed change in knee flex

    const key = side === 'L' ? 'legL' : 'legR';
    ik[key] += (target * plant[side] - ik[key]) * damp(dt, FOOT_HALF_LIFE);

    rot(a, lower, 'x', ik[key]);
    rot(a, upper, 'x', -ik[key] * 0.5);             // keep the ankle under the hip
  }
  a.root.updateMatrixWorld(true);

  /* ── 5. roll the sole onto the hill ──────────────────────────────────────
     The surface normal expressed in the actor's own yaw frame: pitch is toe-up
     or heel-up, roll is the outside edge lifting. Applied on top of whatever
     the clip authored, and damped, so a footfall does not snap. */
  const yaw = a.root.rotation.y || 0;
  const cy = Math.cos(-yaw), sy = Math.sin(-yaw);
  const nx = _n.x * cy - _n.z * sy;
  const nz = _n.x * sy + _n.z * cy;
  const pitch = Math.atan2(nz, Math.max(0.1, _n.y)) * align;
  const roll = -Math.atan2(nx, Math.max(0.1, _n.y)) * align;
  ik.pitch += (pitch - ik.pitch) * damp(dt, FOOT_HALF_LIFE);
  ik.roll += (roll - ik.roll) * damp(dt, FOOT_HALF_LIFE);
  for (const side of ['L', 'R']) {
    const foot = a.boneByName.get(`foot_${side}`);
    rot(a, foot, 'x', ik.pitch);
    rot(a, foot, 'z', ik.roll);
  }

  /* ── 6. lean into the hill ───────────────────────────────────────────────
     A runner going uphill pitches forward and downhill leans back. Without it
     the grounding is geometrically right and still reads as a doll being
     carried up a slope — this is the beat that makes it read as effort.
     Small: the spine is already carrying the clip's own motion. */
  const spine = a.boneByName.get('spine_lower');
  if (spine) rot(a, spine, 'x', ik.pitch * 0.55);

  ik.plantL = plant.L; ik.plantR = plant.R;
  a.root.updateMatrixWorld(true);
  return ik;
}

/** Per-foot ground error after solving, in metres — what tools measure to prove
 *  the feet actually plant. Positive = still buried, negative = still floating. */
export function footError(a, w) {
  const out = {};
  const s = a.root.scale.x || 1;
  const sole = a.soleM ?? SOLE;
  for (const side of ['L', 'R']) {
    const foot = a.boneByName.get(`foot_${side}`);
    if (!foot) continue;
    foot.getWorldPosition(_ankle);
    out[side] = _ankle.y - (w.heightAt(_ankle.x, _ankle.z) + sole * s);
  }
  return out;
}
