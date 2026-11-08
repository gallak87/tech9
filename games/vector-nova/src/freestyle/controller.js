import * as T from 'three';

import { FREESTYLE_RULES, TRICKS } from './rules.js';
export { FREESTYLE_RULES, TRICKS } from './rules.js';
const clamp = T.MathUtils.clamp;

// Held direction supplies torque, not an animation choice. Angular momentum
// persists on release; countersteering and recovery cost real airtime.
export function createFreestyleController({ track }) {
  let data;
  function reset() {
    data = {
      clock: 0,
      score: 0,
      chain: 0,
      bestChain: 0,
      flight: null,
      pendingLanding: null,
      orientation: [0, 0, 0, 1],
      angular: [0, 0, 0],
      progress: [0, 0, 0],
      signs: [0, 0, 0],
      compoundProgress: 0,
      compoundAxis: [0, 0, 1],
      lastTorque: -99,
      catchDown: false,
      braceAt: -99,
      legs: [],
      invalid: false,
      result: null,
    };
  }
  function bankLanding(landed, failureReason = 'Unsettled landing') {
    const pending = data.pendingLanding;
    if (!pending) return null;
    if (landed && !pending.line) {
      landed = false;
      failureReason = 'Outside landing zone';
    }
    const clean = landed && pending.clean && !pending.damaged;
    const perfect = clean && pending.perfect;
    data.chain = landed ? data.chain + 1 : 0;
    data.bestChain = Math.max(data.bestChain, data.chain);
    const base = perfect
      ? FREESTYLE_RULES.points.perfect
      : clean
        ? FREESTYLE_RULES.points.clean
        : FREESTYLE_RULES.points.landed;
    const bank = landed ? Math.round((pending.style + base) * data.chain) : 0;
    const leg = {
      id: pending.id,
      label: pending.label,
      at: data.clock,
      touchdownAt: pending.at,
      landed,
      clean,
      perfect,
      quality: perfect
        ? 'perfect'
        : clean
          ? 'clean'
          : landed
            ? 'landed'
            : 'rough',
      bank,
      chain: data.chain,
      tricks: [...pending.tricks],
      reason: perfect
        ? 'Perfect banked catch'
        : clean
          ? pending.tube
            ? 'Tube catch'
            : 'Clean banked catch'
          : landed
            ? 'Recovered landing'
            : failureReason,
      speed: pending.speed,
    };
    data.score += bank;
    data.legs.push(leg);
    data.pendingLanding = null;
    return leg;
  }
  reset();
  return {
    reset,
    snapshot() {
      const names = ['flip', 'spin', 'roll']
        .filter((_, i) => Math.abs(data.angular[i]) > 0.25)
        .map((k) => TRICKS[k].name);
      return {
        ...structuredClone(data),
        active: names.length ? names.join(' + ') : null,
      };
    },
    readFrame() {
      const names = ['flip', 'spin', 'roll']
        .filter((_, i) => Math.abs(data.angular[i]) > 0.25)
        .map((kind) => TRICKS[kind].name);
      return {
        clock: data.clock,
        score: data.score,
        chain: data.chain,
        invalid: data.invalid,
        braceAt: data.braceAt,
        angular: [...data.angular],
        pendingLanding: data.pendingLanding
          ? {
              id: data.pendingLanding.id,
              label: data.pendingLanding.label,
              elapsed: data.pendingLanding.elapsed,
            }
          : null,
        active: names.length ? names.join(' + ') : null,
        flight: data.flight
          ? { ...data.flight, tricks: [...data.flight.tricks] }
          : null,
        legs: data.legs.map((leg) => ({ ...leg, tricks: [...leg.tricks] })),
      };
    },
    restore: (saved) => {
      data = structuredClone(saved);
      delete data.active;
    },
    launch(id) {
      const interrupted = data.pendingLanding
        ? bankLanding(false, 'Landing interrupted')
        : null;
      data.flight = { id, tricks: [], damaged: false };
      data.orientation = [0, 0, 0, 1];
      data.angular = [0, 0, 0];
      data.progress = [0, 0, 0];
      data.signs = [0, 0, 0];
      data.compoundProgress = 0;
      data.compoundAxis = [0, 0, 1];
      data.braceAt = -99;
      return interrupted;
    },
    step(input, dt) {
      data.clock += dt;
      const brace = !!input.airbrake;
      if (brace && !data.catchDown && data.flight) data.braceAt = data.clock;
      data.catchDown = brace;
      if (!data.flight || data.flight.failed || data.result) return;
      const controls = [
        input.aerialPitch ?? 0,
        input.aerialYaw ?? 0,
        input.aerialRoll ?? 0,
      ].map((v) => clamp(v, -1, 1));
      const turning = controls.some((v) => Math.abs(v) > 0.05);
      if (turning) data.lastTorque = data.clock;
      for (let i = 0; i < 3; i++) {
        const target =
          controls[i] * FREESTYLE_RULES.angularSpeed[i] * (brace ? 0.25 : 1);
        const response = brace
          ? 12
          : turning
            ? FREESTYLE_RULES.acceleration
            : FREESTYLE_RULES.releaseDamping;
        data.angular[i] +=
          (target - data.angular[i]) * -Math.expm1(-response * dt);
      }
      const angular = new T.Vector3(...data.angular).clampLength(0, 3.2),
        speed = angular.length();
      data.angular = angular.toArray();
      if (speed > 0.0001) {
        const orientation = new T.Quaternion().fromArray(data.orientation);
        orientation
          .multiply(
            new T.Quaternion().setFromAxisAngle(
              angular.clone().normalize(),
              speed * dt,
            ),
          )
          .normalize();
        // Gyros only settle a nearly upright, slowly rotating hull. They never
        // unwind an inverted craft or supply scored rotations.
        if (
          !turning &&
          speed < 0.45 &&
          orientation.angleTo(new T.Quaternion()) < 0.3
        )
          orientation.slerp(new T.Quaternion(), -Math.expm1(-3 * dt));
        data.orientation = orientation.toArray();
      }
      const compound =
        data.angular.filter((v) => Math.abs(v) > 0.45).length > 1;
      if (compound) {
        const axis = angular.clone().normalize();
        if (
          data.compoundProgress === 0 ||
          axis.dot(new T.Vector3(...data.compoundAxis)) < 0.4
        ) {
          data.compoundProgress = 0;
          data.compoundAxis = axis.toArray();
        }
        data.compoundProgress += speed * dt;
        if (data.compoundProgress >= 2 * Math.PI - 0.15) {
          data.flight.tricks.push('corkscrew');
          data.compoundProgress -= 2 * Math.PI;
          data.progress = [0, 0, 0];
        }
      } else data.compoundProgress = 0;
      for (let i = 0; i < 3; i++) {
        if (Math.abs(data.angular[i]) < 0.05) continue;
        const sign = Math.sign(data.angular[i]);
        if (data.signs[i] !== sign) {
          data.progress[i] = 0;
          data.signs[i] = sign;
        }
        data.progress[i] += Math.abs(data.angular[i]) * dt;
        // A near-complete revolution can settle into its last few degrees.
        // Recognition tolerates that; banking still needs a recovered hull.
        if (!compound && data.progress[i] >= 2 * Math.PI - 0.15) {
          data.progress[i] -= 2 * Math.PI;
          data.flight.tricks.push(['flip', 'spin', 'roll'][i]);
        }
      }
    },
    attitude(target) {
      target.multiply(new T.Quaternion().fromArray(data.orientation));
    },
    damage() {
      if (data.flight) data.flight.damaged = true;
      if (data.pendingLanding) data.pendingLanding.damaged = true;
    },
    fail() {
      if (data.flight) {
        data.flight.failed = true;
        data.flight.damaged = true;
      }
      if (data.pendingLanding) data.pendingLanding.failed = true;
      data.chain = 0;
      data.angular = [0, 0, 0];
    },
    invalidate() {
      data.pendingLanding = null;
      data.invalid = true;
      data.chain = 0;
      data.flight = null;
      data.orientation = [0, 0, 0, 1];
      data.angular = [0, 0, 0];
    },
    land({
      jump,
      distance = jump.target,
      lateral: surfaceLateral = null,
      outcome,
      position,
      quaternion,
      velocity,
      edgeCaught = false,
      angularSpeed = 0,
    }) {
      if (
        !data.flight ||
        data.pendingLanding ||
        data.flight.id !== jump.id ||
        data.legs.some((l) => l.id === jump.id)
      )
        return null;
      // Score the surface actually contacted. A banked receiver can turn or
      // twist substantially between its lip and its far-away precision marker.
      const frame =
        track.sampleSurface?.(distance, surfaceLateral ?? 0) ??
        track.sample(distance);
      const delta = position.clone().sub(frame.position);
      const lateral = surfaceLateral ?? delta.dot(frame.right);
      const along = distance - jump.target;
      const up = new T.Vector3(0, 1, 0).applyQuaternion(quaternion);
      const forward = new T.Vector3(0, 0, 1).applyQuaternion(quaternion);
      const lead = data.clock - data.braceAt;
      const rotating =
        Math.hypot(...data.angular) >= 0.9 || angularSpeed >= 1.2;
      const bankAligned = up.dot(frame.up) > Math.cos(0.48);
      const headingAligned = forward.dot(frame.tangent) > Math.cos(0.58);
      const ready = !rotating && bankAligned && headingAligned;
      const tube = jump.receiverType === 'tube' && frame.period > 0;
      const halfCatchWidth = (jump.catchWidth ?? 11) / 2;
      const receiverStart = jump.landingStart ?? jump.target - 130;
      const receiverEnd = jump.landingEnd ?? jump.target + 130;
      const laneError = Math.abs(lateral - (jump.targetLateral ?? 0));
      const line =
        distance >= receiverStart &&
        distance <= receiverEnd &&
        (tube || laneError <= halfCatchWidth);
      const timed =
        lead >= FREESTYLE_RULES.catchLead &&
        lead <= FREESTYLE_RULES.catchWindow;
      const clean =
        outcome === 'landed' &&
        !data.flight.failed &&
        !data.flight.damaged &&
        !edgeCaught &&
        ready &&
        line;
      // Airbrake is a real rotation brake. A fresh well-timed squeeze earns
      // precision; holding it early never vetoes an otherwise sound landing.
      const perfect =
        clean &&
        (tube || laneError < Math.max(2.5, halfCatchWidth * 0.5)) &&
        Math.abs(along) < (jump.precisionLength ?? 150) &&
        Math.abs(velocity.dot(frame.up)) < 38 &&
        timed;
      const style = data.flight.tricks.reduce(
        (sum, kind, i, all) =>
          sum +
          TRICKS[kind].points *
            0.5 ** all.slice(0, i).filter((k) => k === kind).length,
        0,
      );
      data.pendingLanding = {
        id: jump.id,
        label: jump.label ?? jump.id,
        at: data.clock,
        elapsed: 0,
        lastObservedAt: data.clock,
        stableTime: 0,
        distance,
        lateral,
        line,
        clean,
        perfect,
        tube,
        style,
        failed: !!data.flight.failed || outcome !== 'landed',
        damaged: !!data.flight.damaged || edgeCaught,
        speed: velocity.length(),
        tricks: [...data.flight.tricks],
      };
      // Contact ends the trick. Grounded keys cannot add rotations or upgrade
      // arrival quality while the physical hull settles onto its receiver.
      data.flight = null;
      data.orientation = [0, 0, 0, 1];
      data.angular = [0, 0, 0];
      data.braceAt = -99;
      return data.pendingLanding.failed
        ? bankLanding(false, 'Missed receiver')
        : null;
    },
    settle({
      supported,
      quaternion,
      distance,
      lateral,
      angularSpeed = 0,
      normalSpeed = 0,
      supportError = 0,
    }) {
      const pending = data.pendingLanding;
      if (!pending) return null;
      if (pending.failed) return bankLanding(false, 'Missed receiver');
      const dt = data.clock - pending.lastObservedAt;
      if (dt <= 0) return null;
      pending.lastObservedAt = data.clock;
      pending.elapsed = data.clock - pending.at;
      const frame =
        track.sampleSurface?.(
          distance ?? pending.distance,
          lateral ?? pending.lateral,
        ) ?? track.sample(distance ?? pending.distance);
      const aligned =
        quaternion &&
        new T.Vector3(0, 1, 0).applyQuaternion(quaternion).dot(frame.up) >
          Math.cos(0.48) &&
        new T.Vector3(0, 0, 1).applyQuaternion(quaternion).dot(frame.tangent) >
          Math.cos(0.58);
      const stable =
        supported &&
        aligned &&
        angularSpeed < 1.2 &&
        Math.abs(normalSpeed) < 8 &&
        Math.abs(supportError) < 1.5;
      pending.stableTime = stable ? pending.stableTime + dt : 0;
      if (pending.elapsed + 1e-9 < FREESTYLE_RULES.landingWindow) return null;
      return bankLanding(
        pending.stableTime + 1e-9 >= FREESTYLE_RULES.stableWindow,
        supported ? 'Unsettled landing' : 'Lost receiver support',
      );
    },
    rejectLanding(reason = 'Lost receiver support') {
      return bankLanding(false, reason);
    },
    complete(shipId) {
      if (data.result) return data.result;
      if (data.pendingLanding) return null;
      const medals = FREESTYLE_RULES.medals;
      const complete =
        data.legs.length === track.jumps.length &&
        data.legs.every((leg, i) => leg.id === track.jumps[i].id);
      data.result = {
        mode: 'freestyle',
        score: data.score,
        bestChain: data.bestChain,
        clean: data.legs.filter((l) => l.clean).length,
        landed: data.legs.filter((l) => l.landed).length,
        legs: structuredClone(data.legs),
        playerValid: !data.invalid && complete,
        shipId,
        medal:
          data.score >= medals.gold
            ? 'Gold'
            : data.score >= medals.silver
              ? 'Silver'
              : data.score >= medals.bronze
                ? 'Bronze'
                : 'Complete',
      };
      return data.result;
    },
  };
}

// Estimate from the real ballistic state against the receiving slope, never an
// authored airtime countdown. Continuing to boost can change this estimate.
export function landingEstimate(
  track,
  jump,
  pose,
  velocity,
  { gravity = 26, timeout = 8 } = {},
) {
  if (!pose || !jump || !velocity) return null;
  const frame = track.sample(jump.target),
    normal = frame.up;
  const a = -0.5 * gravity * normal.y,
    b = velocity.dot(normal),
    c = pose.position.clone().sub(frame.position).dot(normal) - 0.72;
  if (Math.abs(a) < 1e-6) {
    const time = -c / b;
    return Number.isFinite(time) && time > 0 && time < timeout ? time : null;
  }
  const disc = b * b - 4 * a * c;
  if (disc < 0) return null;
  const roots = [
    (-b + Math.sqrt(disc)) / (2 * a),
    (-b - Math.sqrt(disc)) / (2 * a),
  ].filter((t) => t > 0 && t < timeout);
  return roots.length ? Math.max(...roots) : null;
}
