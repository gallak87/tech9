import { Euler, Quaternion, Vector3 } from 'three';

// Shared humanoid motion. Times are seconds, distances scale with the subject.
// Foot contacts indicate the support phase; walk is intentionally treadmill-style.
export const CLIPS = [
  {
    id: 'rest', label: 'Bind pose', duration: 1, loop: true,
    description: 'Unmodified bind pose for inspecting proportions and joint placement.',
    markers: [{ time: 0, label: 'Neutral' }],
  },
  {
    id: 'idle', label: 'Grounded idle', duration: 3.6, loop: true,
    description: 'A quiet breath through the torso, with both feet anchored. No sideways root sway.',
    markers: [{ time: 0, label: 'Exhale' }, { time: 1.8, label: 'Inhale' }],
  },
  {
    id: 'walk', label: 'Walk · in place', duration: 1.12, loop: true,
    description: 'A reusable treadmill walk with a support interval, lifted swing foot, knee bend, and opposing arms.',
    markers: [
      { time: 0, label: 'Left heel' }, { time: 0.1344, label: 'Right toe-off' },
      { time: 0.56, label: 'Right heel' }, { time: 0.6944, label: 'Left toe-off' },
    ],
  },
  {
    id: 'attack', label: 'Sword · step and cut', duration: 1.65, loop: false,
    description: 'Wind up, step into range, cut through the target, then recover the planted stance. Target proximity is measured separately.',
    markers: [
      { time: 0, label: 'Ready' }, { time: 0.36, label: 'Anticipation' },
      { time: 0.55, label: 'Travel' }, { time: 0.73, label: 'Contact' },
      { time: 0.94, label: 'Follow-through' }, { time: 1.26, label: 'Recovery' },
      { time: 1.65, label: 'Ready' },
    ],
  },
  {
    id: 'hit', label: 'Hit reaction', duration: 0.78, loop: false,
    description: 'A short chest recoil absorbed through bent knees, followed by a balanced recovery.',
    markers: [{ time: 0, label: 'Impact' }, { time: 0.12, label: 'Recoil' }, { time: 0.78, label: 'Recovered' }],
  },
];

const DOWN = new Vector3(0, -1, 0);
const FORWARD = new Vector3(0, 0, 1);
const TAU = Math.PI * 2;
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const mix = (a, b, t) => a + (b - a) * t;
const smooth = (t) => { const u = clamp(t, 0, 1); return u * u * (3 - 2 * u); };
const finite = (value, fallback) => Number.isFinite(value) ? value : fallback;

function rotate(bone, x = 0, y = 0, z = 0) {
  bone.quaternion.multiply(new Quaternion().setFromEuler(new Euler(x, y, z, 'XYZ')));
}

function resetRig(rig) {
  rig.root.position.set(0, 0, 0);
  rig.root.quaternion.identity();
  rig.root.scale.set(1, 1, 1);
  for (const [name, bone] of Object.entries(rig.bones)) {
    const rest = rig.rest[name];
    bone.position.copy(rest.position);
    bone.quaternion.copy(rest.quaternion);
    bone.scale.copy(rest.scale);
  }
  rig.root.updateMatrixWorld(true);
}

function setWorldQuaternion(bone, worldQuaternion) {
  const parentRotation = bone.parent.getWorldQuaternion(new Quaternion());
  bone.quaternion.copy(parentRotation.invert().multiply(worldQuaternion));
  bone.updateWorldMatrix(false, true);
}

/**
 * Analytic two-bone IK. Both segment axes are -Y in this family's bind pose.
 * The pole is a world-space bend direction, not a point. Targets beyond the
 * limb's reach are clamped honestly; the caller still measures the actual tip.
 */
function solveLimb(upper, lower, end, target, lengthA, lengthB, pole) {
  upper.updateWorldMatrix(true, true);
  const origin = upper.getWorldPosition(new Vector3());
  const toTarget = target.clone().sub(origin);
  const requestedDistance = toTarget.length();
  const distance = clamp(requestedDistance, Math.abs(lengthA - lengthB) + 1e-5, lengthA + lengthB - 1e-5);
  const direction = requestedDistance > 1e-6 ? toTarget.divideScalar(requestedDistance) : DOWN.clone();
  const bend = pole.clone().addScaledVector(direction, -pole.dot(direction));
  if (bend.lengthSq() < 1e-8) bend.set(1, 0, 0).addScaledVector(direction, -direction.x);
  bend.normalize();
  const along = (lengthA * lengthA - lengthB * lengthB + distance * distance) / (2 * distance);
  const outward = Math.sqrt(Math.max(0, lengthA * lengthA - along * along));
  const knee = origin.clone().addScaledVector(direction, along).addScaledVector(bend, outward);
  const endpoint = origin.clone().addScaledVector(direction, distance);
  setWorldQuaternion(upper, new Quaternion().setFromUnitVectors(DOWN, knee.clone().sub(origin).normalize()));
  setWorldQuaternion(lower, new Quaternion().setFromUnitVectors(DOWN, endpoint.sub(knee).normalize()));
  end.updateWorldMatrix(true, true);
  return Math.abs(requestedDistance - distance);
}

function footAnchors(rig) {
  return {
    left: rig.bones.footL.getWorldPosition(new Vector3()),
    right: rig.bones.footR.getWorldPosition(new Vector3()),
  };
}

function placeFoot(rig, side, target, pitch = 0) {
  const { bones, metrics } = rig;
  const error = solveLimb(
    bones[`thigh${side}`], bones[`shin${side}`], bones[`foot${side}`],
    target, metrics.upperLeg, metrics.lowerLeg, FORWARD,
  );
  setWorldQuaternion(bones[`foot${side}`], new Quaternion().setFromEuler(new Euler(pitch, 0, 0, 'XYZ')));
  return error < metrics.height * 0.006;
}

function quietUpperBody(rig, breath = 0, intensity = 1) {
  const b = rig.bones;
  rotate(b.spine, 0.018 + breath * 0.008 * intensity);
  rotate(b.chest, -0.028 - breath * 0.012 * intensity);
  rotate(b.neck, 0.01);
  rotate(b.upperArmL, -0.055, 0, 0.035);
  rotate(b.forearmL, -0.12);
  rotate(b.upperArmR, -0.09, 0, -0.045);
  rotate(b.forearmR, -0.17);
  rotate(b.handR, 0.06);
}

function idle(rig, t, tuning, anchors) {
  const breath = Math.sin(TAU * t / 3.6 - Math.PI / 2);
  rig.bones.pelvis.position.y -= rig.metrics.height * (0.012 - breath * 0.0015 * tuning.intensity);
  quietUpperBody(rig, breath, tuning.intensity);
  rig.root.updateMatrixWorld(true);
  return {
    phase: breath > 0 ? 'Breathing · inhale' : 'Breathing · exhale',
    contacts: { left: placeFoot(rig, 'L', anchors.left), right: placeFoot(rig, 'R', anchors.right) },
    strike: 0,
  };
}

function walkingFoot(phase, anchor, span, height, footHeight) {
  const support = phase < 0.62;
  let z, lift, pitch;
  if (support) {
    const p = phase / 0.62;
    z = mix(span * 0.5, -span * 0.5, p);
    const heel = 1 - smooth(p / 0.16);
    const toe = smooth((p - 0.79) / 0.21);
    pitch = -0.10 * heel + 0.18 * toe;
    lift = 0;
  } else {
    const p = (phase - 0.62) / 0.38;
    z = mix(-span * 0.5, span * 0.5, smooth(p));
    lift = height * 0.075 * Math.sin(Math.PI * p);
    pitch = mix(0.18, -0.10, smooth(p));
  }
  // Pivot about the boot sole's heel/toe, rather than driving its edge through
  // the floor. These proportions belong to this shared humanoid boot family.
  const soleReach = footHeight * (pitch >= 0 ? 1.75 : -0.30);
  lift += footHeight * (Math.cos(pitch) - 1) + soleReach * Math.sin(pitch);
  return { target: anchor.clone().add(new Vector3(0, lift, z)), pitch, support };
}

function walk(rig, t, tuning, anchors) {
  const h = rig.metrics.height;
  const phase = t / 1.12;
  const span = h * 0.25 * tuning.stride;
  const left = walkingFoot(phase, anchors.left, span, h, rig.metrics.footHeight);
  const right = walkingFoot((phase + 0.5) % 1, anchors.right, span, h, rig.metrics.footHeight);
  const swing = Math.cos(TAU * phase);
  const b = rig.bones;
  // The pelvis drops enough to allow the stance leg to reach its forward/rear limits.
  b.pelvis.position.y -= h * (0.023 + 0.013 * tuning.stride * tuning.stride - 0.003 * Math.cos(2 * TAU * phase));
  b.pelvis.position.x += h * 0.008 * Math.sin(TAU * phase);
  rotate(b.pelvis, 0, -0.045 * swing * tuning.intensity);
  rotate(b.spine, 0.04, 0.03 * swing * tuning.intensity);
  rotate(b.chest, 0.025, 0.035 * swing * tuning.intensity);
  rotate(b.head, -0.05, -0.02 * swing * tuning.intensity);
  rotate(b.upperArmL, 0.31 * swing * tuning.stride, 0, 0.035);
  rotate(b.upperArmR, -0.27 * swing * tuning.stride, 0, -0.045);
  rotate(b.forearmL, -0.23 - 0.07 * Math.max(0, -swing));
  rotate(b.forearmR, -0.25 - 0.06 * Math.max(0, swing));
  rotate(b.handR, 0.08);
  rig.root.updateMatrixWorld(true);
  const leftReach = placeFoot(rig, 'L', left.target, left.pitch);
  const rightReach = placeFoot(rig, 'R', right.target, right.pitch);
  return {
    phase: left.support && right.support ? 'Walk · double support' : left.support ? 'Walk · left support' : 'Walk · right support',
    contacts: { left: left.support && leftReach, right: right.support && rightReach },
    strike: 0,
  };
}

function sampleTrack(track, time) {
  if (time <= track[0][0]) return track[0].slice(1);
  for (let i = 1; i < track.length; i++) {
    if (time <= track[i][0]) {
      const before = track[i - 1];
      const after = track[i];
      const t = smooth((time - before[0]) / (after[0] - before[0]));
      return after.slice(1).map((value, j) => mix(before[j + 1], value, t));
    }
  }
  return track.at(-1).slice(1);
}

function swordOffset(rig) {
  // Captured after reset; includes weaponScale, grip translation, and the real blade length.
  const hand = rig.bones.handR;
  return hand.worldToLocal(rig.weapon.tip.getWorldPosition(new Vector3()));
}

function swordHand(rig, target, quaternion) {
  const error = solveLimb(
    rig.bones.upperArmR, rig.bones.forearmR, rig.bones.handR, target,
    rig.metrics.upperArm, rig.metrics.forearm, new Vector3(-1, -0.2, -0.25),
  );
  setWorldQuaternion(rig.bones.handR, quaternion);
  return error;
}

function keepBladeClear(rig) {
  // Longer faction weapons share the walk/idle clips: adjust the wrist only
  // when necessary, using the actual blade instead of assuming a fixed length.
  const hand = rig.bones.handR;
  const origin = hand.getWorldPosition(new Vector3());
  const tip = rig.weapon.tip.getWorldPosition(new Vector3());
  const clearance = rig.metrics.height * 0.035;
  if (tip.y >= clearance) return;
  const offset = tip.sub(origin);
  const sagittalLength = Math.hypot(offset.y, offset.z);
  if (sagittalLength < 1e-6) return;
  const angle = Math.atan2(offset.z, -offset.y);
  const requiredAngle = Math.acos(clamp((origin.y - clearance) / sagittalLength, -1, 1));
  const correction = new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), angle - requiredAngle);
  setWorldQuaternion(hand, correction.multiply(hand.getWorldQuaternion(new Quaternion())));
}

function attack(rig, t, tuning, anchors, bladeOffset) {
  const h = rig.metrics.height;
  const b = rig.bones;
  const [advance, drop, twist, lean] = sampleTrack([
    [0, 0, 0.012, 0, 0], [0.36, -0.025, 0.028, -0.18, -0.035],
    [0.73, 0.16, 0.039, 0.15, 0.12], [0.94, 0.17, 0.043, 0.22, 0.15],
    [1.12, 0.15, 0.035, 0.12, 0.08], [1.65, 0, 0.012, 0, 0],
  ], t);
  rig.root.position.z = advance * h * tuning.reach;
  b.pelvis.position.y -= h * drop;
  rotate(b.pelvis, 0, twist * 0.4 * tuning.intensity);
  rotate(b.spine, lean * 0.4, twist * 0.3 * tuning.intensity);
  rotate(b.chest, lean * 0.6, twist * 0.3 * tuning.intensity);
  rotate(b.neck, -lean * 0.55, -twist * 0.65 * tuning.intensity);
  rotate(b.upperArmL, -0.24 - Math.abs(twist) * 0.5, 0.1, 0.12);
  rotate(b.forearmL, -0.65 - Math.abs(twist) * 0.6);
  rotate(b.handL, 0.08);

  const [footZ, footLift] = sampleTrack([
    [0, 0, 0], [0.29, 0, 0], [0.49, 0.12, 0.065], [0.65, 0.27, 0],
    [1.10, 0.27, 0], [1.33, 0.14, 0.055], [1.59, 0, 0], [1.65, 0, 0],
  ], t);
  const leftTarget = anchors.left.clone().add(new Vector3(0, footLift * h, footZ * h * tuning.reach));
  rig.root.updateMatrixWorld(true);
  const leftReach = placeFoot(rig, 'L', leftTarget);
  const rightReach = placeFoot(rig, 'R', anchors.right);

  const readyRotation = new Quaternion().setFromEuler(new Euler(-0.16, 0, 0, 'XYZ'));
  const readyOffset = bladeOffset.clone().applyQuaternion(readyRotation);
  const restHand = new Vector3(-0.13 * h, Math.max(0.50 * h, h * 0.035 - readyOffset.y), 0.06 * h);
  const windHand = new Vector3(-0.21 * h, 0.87 * h, 0.025 * h);
  const strikeRotation = new Quaternion().setFromEuler(new Euler(-1.08, 0, 0, 'XYZ'));
  const strikeTarget = new Vector3(-h * 0.13, h * 0.62, h * 0.65 * tuning.reach);
  const strikeHand = strikeTarget.clone().sub(bladeOffset.clone().applyQuaternion(strikeRotation));
  const followHand = new Vector3(-0.09 * h, 0.69 * h, 0.40 * h * tuning.reach);
  const [x, y, z, swordAngle] = sampleTrack([
    [0, ...restHand.toArray(), -0.16],
    [0.36, ...windHand.toArray(), 2.48],
    // Interpolating the unwrapped angle brings the blade over the head and down.
    [0.73, ...strikeHand.toArray(), TAU - 1.08],
    [0.94, ...followHand.toArray(), TAU - 0.30],
    [1.12, ...followHand.toArray(), TAU - 0.30],
    [1.65, ...restHand.toArray(), TAU - 0.16],
  ], t);
  swordHand(rig, new Vector3(x, y, z), new Quaternion().setFromEuler(new Euler(swordAngle, 0, 0, 'XYZ')));

  const phase = t < 0.36 ? 'Anticipation' : t < 0.68 ? 'Travel · step and swing'
    : t < 0.79 ? 'Contact window' : t < 1.10 ? 'Follow-through' : t < 1.59 ? 'Recovery' : 'Ready';
  return {
    phase,
    contacts: { left: footLift < 0.001 && leftReach, right: rightReach },
    // This is timing emphasis, not a fabricated collision or successful-hit flag.
    strike: Math.max(0, 1 - Math.abs(t - 0.73) / 0.07),
  };
}

function hit(rig, t, tuning, anchors) {
  const amount = t < 0.12 ? smooth(t / 0.12) : 1 - smooth((t - 0.12) / 0.66);
  const recoil = amount * tuning.intensity;
  const b = rig.bones;
  b.pelvis.position.y -= rig.metrics.height * (0.012 + 0.025 * recoil);
  b.pelvis.position.z -= rig.metrics.height * 0.035 * recoil;
  quietUpperBody(rig);
  rotate(b.spine, -0.13 * recoil, 0.04 * recoil);
  rotate(b.chest, -0.15 * recoil, 0.05 * recoil);
  rotate(b.head, 0.10 * recoil);
  rotate(b.upperArmL, -0.22 * recoil, 0, 0.13 * recoil);
  rotate(b.upperArmR, -0.16 * recoil, 0, -0.10 * recoil);
  rotate(b.forearmL, -0.35 * recoil);
  rig.root.updateMatrixWorld(true);
  return {
    phase: t < 0.12 ? 'Impact · recoil' : t < 0.58 ? 'Absorb and recover' : 'Recovered',
    contacts: { left: placeFoot(rig, 'L', anchors.left), right: placeFoot(rig, 'R', anchors.right) },
    strike: 0,
  };
}

/** Samples an absolute pose. Scrubbing and clip changes cannot accumulate motion. */
export function applyPose(rig, clipId, time = 0, motion = {}) {
  const clip = CLIPS.find((candidate) => candidate.id === clipId) || CLIPS[1];
  const rawTime = Math.max(0, finite(time, 0));
  const t = clip.loop ? rawTime % clip.duration : Math.min(rawTime, clip.duration);
  const tuning = {
    stride: clamp(finite(motion.stride, 1), 0.35, 1.6),
    intensity: clamp(finite(motion.intensity, 1), 0.25, 1.75),
    reach: clamp(finite(motion.reach, 1), 0.6, 1.35),
  };
  resetRig(rig);
  const anchors = footAnchors(rig);
  let result = { phase: 'Bind pose', contacts: { left: true, right: true }, strike: 0 };
  if (clip.id === 'idle') result = idle(rig, t, tuning, anchors);
  else if (clip.id === 'walk') result = walk(rig, t, tuning, anchors);
  else if (clip.id === 'attack') result = attack(rig, t, tuning, anchors, swordOffset(rig));
  else if (clip.id === 'hit') result = hit(rig, t, tuning, anchors);
  rig.root.updateMatrixWorld(true);
  if (clip.id === 'idle' || clip.id === 'walk' || clip.id === 'hit') keepBladeClear(rig);
  rig.root.updateMatrixWorld(true);
  rig.skeleton.update();
  return { ...result, progress: t / clip.duration };
}
