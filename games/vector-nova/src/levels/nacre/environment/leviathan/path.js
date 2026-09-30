import * as T from 'three';

export const NACRE_LEVIATHAN = Object.freeze({
  anchor: 'first-jump-midpoint-minus-5m',
  launchOffset: 5,
  length: 280,
  envelopeRadius: 24,
  speed: 120,
  swimY: -40,
  crownY: 180,
  archWidth: 165,
  startCross: -455,
  endCross: 780,
  waterCross: Math.sqrt(2 * Math.log(5.5)) * 165,
  firstTriggerDistance: 0,
  heroLeadMetres: 300,
  referenceSpeed: 112,
});

const up = new T.Vector3(0, 1, 0);
const clamp = T.MathUtils.clamp;

/** Reusable arc-length transport keeps the body length constant on either swim. */
function createArcPath(atCross, min, max, { bake = false } = {}) {
  const points = [];
  const arcs = [];
  const crosses = [];
  let total = 0;
  for (let u = min; u <= max; u += 0.5) {
    const point = atCross(u);
    if (points.length) total += point.distanceTo(points.at(-1));
    points.push(point);
    arcs.push(total);
    crosses.push(u);
  }
  // The return follows a banked road spline. Bake its transport once rather
  // than resampling the track three times per body station on every frame.
  const backs = bake
    ? points.map((_, i) =>
        points[Math.max(0, i - 1)]
          .clone()
          .sub(points[Math.min(points.length - 1, i + 1)])
          .normalize(),
      )
    : null;
  function arcAtCross(u) {
    const x = clamp((u - min) * 2, 0, arcs.length - 1);
    const i = Math.min(Math.floor(x), arcs.length - 2);
    return T.MathUtils.lerp(arcs[i], arcs[i + 1], x - i);
  }
  const scratchBefore = new T.Vector3();
  const scratchAfter = new T.Vector3();
  function sample(arc, target = {}) {
    let lo = 0,
      hi = arcs.length - 1;
    const s = clamp(arc, 0, total);
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (arcs[mid] <= s) lo = mid;
      else hi = mid;
    }
    const fraction = (s - arcs[lo]) / Math.max(1e-8, arcs[hi] - arcs[lo]);
    const u = T.MathUtils.lerp(crosses[lo], crosses[hi], fraction);
    target.position ??= new T.Vector3();
    target.back ??= new T.Vector3();
    target.up ??= new T.Vector3();
    target.side ??= new T.Vector3();
    if (bake) {
      target.position.copy(points[lo]).lerp(points[hi], fraction);
      target.back.copy(backs[lo]).lerp(backs[hi], fraction).normalize();
    } else {
      atCross(u, target.position);
      atCross(u - 0.05, scratchBefore);
      atCross(u + 0.05, scratchAfter);
      target.back.copy(scratchBefore).sub(scratchAfter).normalize();
    }
    target.side.crossVectors(target.back, up).normalize();
    target.up.crossVectors(target.side, target.back).normalize();
    target.cross = u;
    return target;
  }
  return { atCross, sample, arcAtCross };
}

/** Arc-length lookup keeps the 280 m body length constant through the breach. */
export function createLeviathanPath(track) {
  const jump = track.jumps[0];
  const anchorDistance =
    (jump.takeoff + jump.landingStart) / 2 - NACRE_LEVIATHAN.launchOffset;
  const frame = track.sample(anchorDistance);
  const cross = frame.right.clone().setY(0).normalize();
  const forward = new T.Vector3().crossVectors(cross, up).normalize();
  const center = frame.position.clone().setY(track.waterY ?? 0);
  function atCross(u, out = new T.Vector3()) {
    const bell = Math.exp(-0.5 * (u / NACRE_LEVIATHAN.archWidth) ** 2);
    const swimFade = clamp((Math.abs(u) - 280) / 80, 0, 1);
    const swim = Math.sin(u * 0.022) * 4 * swimFade ** 2 * (3 - 2 * swimFade);
    return out
      .copy(center)
      .addScaledVector(cross, u)
      .addScaledVector(forward, swim)
      .setY(
        center.y +
          NACRE_LEVIATHAN.swimY +
          (NACRE_LEVIATHAN.crownY - NACRE_LEVIATHAN.swimY) * bell,
      );
  }
  const { sample, arcAtCross } = createArcPath(atCross, -900, 1100);
  const startArc = arcAtCross(NACRE_LEVIATHAN.startCross);
  const endArc = arcAtCross(NACRE_LEVIATHAN.endCross);
  const crownArc = arcAtCross(0);
  const contacts = [-1, 1].map((side) => {
    const u = side * NACRE_LEVIATHAN.waterCross;
    const position = atCross(u).setY(center.y + 0.25);
    return {
      side,
      position,
      age: (arcAtCross(u) - startArc) / NACRE_LEVIATHAN.speed,
    };
  });
  return {
    encounter: 'first-jump',
    center,
    anchorDistance,
    takeoffDistance: jump.takeoff,
    heroDistance: jump.takeoff - NACRE_LEVIATHAN.heroLeadMetres,
    heroAge:
      (crownArc - startArc + NACRE_LEVIATHAN.length * 0.5) /
      NACRE_LEVIATHAN.speed,
    cross,
    forward,
    atCross,
    sample,
    arcAtCross,
    startArc,
    endArc,
    crownAge: (crownArc - startArc) / NACRE_LEVIATHAN.speed,
    duration: (endArc - startArc) / NACRE_LEVIATHAN.speed,
    contacts,
    headArc: (age) => startArc + Math.max(0, age) * NACRE_LEVIATHAN.speed,
  };
}

/** The same animal crosses the trench ahead of the driver, left to right. */
export function createLeviathanReturnPath(track) {
  const anchorDistance = 2360;
  const speed = 180;
  const frame = track.sample(anchorDistance);
  const center = frame.position.clone().setY((track.waterY ?? 0) - 27);
  // Track +right is screen-left. Keep a fixed world-space crossing direction;
  // following successive road frames made the animal turn along the bend.
  const forward = frame.tangent.clone().setY(0).normalize();
  const cross = new T.Vector3().crossVectors(forward, up).normalize();
  const direction = cross.clone().addScaledVector(forward, 0.8).normalize();
  function atCross(u, out = new T.Vector3()) {
    return out
      .copy(center)
      .addScaledVector(direction, u)
      .addScaledVector(forward, 8 * Math.sin(u * 0.012))
      .setY(center.y + Math.sin(u * 0.013));
  }
  const { sample, arcAtCross } = createArcPath(atCross, -720, 720, {
    bake: true,
  });
  const startArc = arcAtCross(-390);
  const endArc = arcAtCross(700);
  return {
    encounter: 'trench-return',
    center,
    cross,
    forward,
    anchorDistance,
    firstTriggerDistance: 1650,
    triggerEndDistance: 2300,
    heroDistance: 2140,
    heroAge: (arcAtCross(0) - startArc + NACRE_LEVIATHAN.length * 0.5) / speed,
    atCross,
    sample,
    arcAtCross,
    startArc,
    endArc,
    duration: (endArc - startArc) / speed,
    contacts: [],
    headArc: (age) => startArc + Math.max(0, age) * speed,
  };
}

/** Presentation-only event clock: never writes vehicle state or race events. */
export function createLeviathanClock(track, path) {
  let previous = null;
  let age = 0;
  let active = false;
  let consumedLap = null;
  let eventCount = 0;
  let currentMode = 'title';
  let triggerDistance = null;
  function clear() {
    previous = null;
    age = 0;
    active = false;
    consumedLap = null;
    eventCount = 0;
    triggerDistance = null;
  }
  return {
    clear,
    updateVehicle({
      time = 0,
      distance = 0,
      speed = 0,
      mode = 'racing',
      reset = false,
    }) {
      currentMode = mode;
      if (reset) clear();
      if (mode !== 'racing' && mode !== 'paused') {
        clear();
        return;
      }
      if (!Number.isFinite(time) || !Number.isFinite(distance)) {
        clear();
        return;
      }
      const next = { time, distance, speed, mode };
      if (!previous) {
        previous = next;
        return;
      }
      if (mode === 'paused' || previous.mode === 'paused') {
        previous = next;
        return;
      }
      const dt = time - previous.time;
      const travelled = distance - previous.distance;
      if (
        dt < -1e-8 ||
        dt > 0.5 ||
        travelled < -2 ||
        Math.abs(travelled) >
          3 + Math.max(speed, previous.speed) * Math.max(dt, 0) * 2.3
      ) {
        clear();
        previous = next;
        return;
      }
      previous = next;
      if (dt <= 1e-8) return;
      if (active) {
        // Match the reveal's tempo to forward speed, so acceleration and boost
        // retain the same full-body window before the lip. Bounded slow motion
        // lets a stopped spectator still see the animal complete its dive.
        age += dt * clamp(speed / NACRE_LEVIATHAN.referenceSpeed, 0.45, 1.45);
        if (age >= path.duration) {
          active = false;
          age = path.duration;
        }
      }
      const lap = Math.floor(distance / track.length);
      const local = distance - lap * track.length;
      const rate = clamp(speed / NACRE_LEVIATHAN.referenceSpeed, 0.45, 1.45);
      const lead = (Math.max(0, speed) * path.heroAge) / rate;
      const threshold = Math.max(
        path.firstTriggerDistance ?? NACRE_LEVIATHAN.firstTriggerDistance,
        path.heroDistance - lead,
      );
      if (
        !active &&
        consumedLap !== lap &&
        local >= threshold &&
        local < (path.triggerEndDistance ?? path.takeoffDistance) &&
        travelled >= 0
      ) {
        active = true;
        age = 0;
        consumedLap = lap;
        eventCount++;
        triggerDistance = distance;
      }
    },
    getState: () => ({
      age,
      active,
      eventCount,
      consumedLap,
      mode: currentMode,
      triggerDistance,
    }),
  };
}
