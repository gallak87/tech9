import * as T from 'three';
import { ionWakeContact, sampleIonContact } from './ion-contact.js';
import {
  COMBAT_CONSEQUENCES,
  combatDisruption,
  sampleCombatDisruption,
} from './combat-consequences.js';
import {
  ARC_SHOT_HEIGHT,
  ARC_MUZZLE_HEIGHT,
  ARC_TARGET_HALF_LENGTH,
} from './rules.js';

export const COMBAT_RULES = Object.freeze({
  version: 4,
  consequences: COMBAT_CONSEQUENCES,
  pulseDelay: 0.5,
  pulseRadius: 36,
  arcDelay: 0.15,
  arcInterval: 0.45,
  arcSpeed: 345,
  arcLifetime: 0.8,
  arcLockRange: 220,
  arcLockCone: Math.PI / 6,
  arcTurnRate: 0.9,
  wakeDuration: 4.5,
  wakeLifetime: 3.2,
  wakeInterval: 0.09,
  hitGrace: 0.7,
});
export const COMBAT_TYPES = Object.freeze(['repulsor', 'arc', 'ion']);
export const isCombatDevice = (type) => COMBAT_TYPES.includes(type);
const copy = (value) => structuredClone(value);
const vector = (value) => new T.Vector3().fromArray(value);
const up = new T.Vector3(0, 1, 0);
const forward = new T.Vector3(0, 0, 1);
const boltHull = { halfWidth: 0.15, halfLength: 0.15, hover: 0.15 };

// Continuous segment/box test, also used with relative target motion so fast
// opposing movement cannot step over a bolt between two fixed ticks.
export function segmentBoxFraction(start, end, half) {
  let enter = 0,
    leave = 1;
  for (const axis of ['x', 'y', 'z']) {
    const change = end[axis] - start[axis];
    if (Math.abs(change) < 1e-9) {
      if (Math.abs(start[axis]) > half[axis]) return null;
    } else {
      const a = (-half[axis] - start[axis]) / change;
      const b = (half[axis] - start[axis]) / change;
      enter = Math.max(enter, Math.min(a, b));
      leave = Math.min(leave, Math.max(a, b));
      if (enter > leave) return null;
    }
  }
  return enter;
}

export function createCombatSimulation({
  track,
  collisionWorld = null,
  dynamics = null,
}) {
  const actors = new Map();
  const touched = new Set();
  let requests = [];
  let state;
  const fresh = () => ({
    version: COMBAT_RULES.version,
    time: 0,
    sequence: 0,
    emitters: {},
    grace: {},
    disruptions: {},
    positions: {},
    wakeHits: {},
    shots: [],
    wakes: [],
    flashes: [],
  });
  state = fresh();
  function eligible(id) {
    const actor = actors.get(id);
    const pose = actor?.pose();
    return touched.has(id) && pose?.grounded !== false && !pose?.recovering
      ? actor && pose && { actor, pose }
      : null;
  }
  function nearCourse(a, b, limit) {
    let gap = Math.abs(a - b);
    if (track.closed !== false) {
      gap %= track.length;
      gap = Math.min(gap, track.length - gap);
    }
    return gap <= limit;
  }
  function blocked(a, b, quaternion = new T.Quaternion()) {
    if (dynamics?.occlusionFraction) return dynamics.occlusionFraction(a, b);
    return (
      collisionWorld?.sweepHull(
        { position: a, quaternion },
        { position: b, quaternion },
        boltHull,
      )?.fraction ?? 1
    );
  }
  function arcAim(shot, target) {
    const other = eligible(target);
    if (!other || target === shot.source) return null;
    let ahead = other.actor.state.distance - shot.distance;
    if (track.closed !== false)
      ahead =
        T.MathUtils.euclideanModulo(ahead + track.length / 2, track.length) -
        track.length / 2;
    if (ahead <= 0 || ahead > COMBAT_RULES.arcLockRange) return null;
    const frame = track.sample(other.actor.state.distance);
    const height = other.pose.position
      .clone()
      .sub(frame.position)
      .dot(frame.up);
    if (Math.abs(height - shot.height) > 1.8) return null;
    const lateral = other.actor.state.lateral - shot.lateral;
    return {
      other,
      heading: Math.atan2(lateral, ahead),
      distance: Math.hypot(ahead, lateral),
    };
  }
  function acquireArcTarget(shot) {
    let target = null;
    let nearest = Infinity;
    for (const [id] of actors) {
      const aim = arcAim(shot, id);
      if (
        !aim ||
        Math.abs(aim.heading - shot.heading) > COMBAT_RULES.arcLockCone ||
        aim.distance > COMBAT_RULES.arcLockRange ||
        aim.distance > nearest ||
        (aim.distance === nearest && id >= target) ||
        blocked(vector(shot.position), aim.other.pose.position) < 0.99
      )
        continue;
      target = id;
      nearest = aim.distance;
    }
    return target;
  }
  function steerArc(shot, dt) {
    if (shot.target === null) return;
    const aim = arcAim(shot, shot.target);
    // Each bolt owns one lock. Losing it never snaps onto a different racer;
    // passing the target releases it rather than turning the bolt around.
    if (!aim) {
      shot.target = null;
      return;
    }
    shot.heading += T.MathUtils.clamp(
      aim.heading - shot.heading,
      -COMBAT_RULES.arcTurnRate * dt,
      COMBAT_RULES.arcTurnRate * dt,
    );
  }
  function notify(id, type, payload) {
    actors.get(id)?.notify({ type, payload });
  }
  function hit(source, target, kind, impulse, cost, position) {
    if ((state.grace[target] ?? 0) > state.time) return;
    const targetActor = eligible(target);
    if (!targetActor || source === target) return;
    const entrySpeed = targetActor.actor.state.speed;
    const shielded = targetActor.actor.hit({
      source,
      kind,
      impulse,
      cost: COMBAT_CONSEQUENCES[kind]?.reserveCost ?? cost,
    });
    if (!shielded) {
      state.disruptions[target] = combatDisruption(
        state.disruptions[target],
        kind,
        state.time,
        entrySpeed,
      );
      targetActor.actor.disrupt?.(
        sampleCombatDisruption(state.disruptions[target], state.time),
      );
    }
    state.grace[target] =
      state.time + (kind === 'ion' ? 1.25 : COMBAT_RULES.hitGrace);
    const payload = {
      source,
      target,
      kind,
      shielded,
      duration: shielded ? 0 : COMBAT_CONSEQUENCES[kind].duration,
      position: position.toArray(),
    };
    notify(target, 'combat-hit', payload);
    notify(source, 'combat-confirm', payload);
    state.flashes.push({
      id: state.sequence++,
      target,
      kind: shielded ? 'aegis' : kind,
      position: payload.position,
      quaternion: targetActor.pose.quaternion.toArray(),
      age: 0,
      radius: 4,
    });
    return true;
  }
  function pulse(id, actor, pose) {
    const origin = pose.position;
    const normal = up.clone().applyQuaternion(pose.quaternion);
    state.flashes.push({
      id: state.sequence++,
      kind: 'repulsor',
      position: origin.toArray(),
      quaternion: pose.quaternion.toArray(),
      age: 0,
      radius: COMBAT_RULES.pulseRadius,
    });
    notify(id, 'combat-fire', { kind: 'repulsor' });
    for (const [target] of actors) {
      const other = eligible(target);
      if (
        !other ||
        id === target ||
        !nearCourse(actor.state.distance, other.actor.state.distance, 60)
      )
        continue;
      const delta = other.pose.position.clone().sub(origin);
      if (Math.abs(delta.dot(normal)) > 6) continue;
      delta.addScaledVector(normal, -delta.dot(normal));
      const distance = delta.length();
      if (
        distance > COMBAT_RULES.pulseRadius ||
        blocked(origin, other.pose.position) < 0.99
      )
        continue;
      if (distance < 0.01) delta.set(1, 0, 0).applyQuaternion(pose.quaternion);
      else delta.divideScalar(distance);
      const force = 12 * (1 - (distance / COMBAT_RULES.pulseRadius) * 0.65);
      hit(
        id,
        target,
        'repulsor',
        delta.multiplyScalar(force),
        6,
        other.pose.position,
      );
    }
  }
  function shoot(id, actor, pose) {
    const direction = forward.clone().applyQuaternion(pose.quaternion);
    const frame = track.sample(actor.state.distance);
    const heading = Math.atan2(
      direction.dot(frame.right),
      direction.dot(frame.tangent),
    );
    const height =
      pose.position
        .clone()
        .sub(frame.position)
        .addScaledVector(frame.right, -actor.state.lateral)
        .dot(frame.up) + ARC_SHOT_HEIGHT;
    const shot = {
      id: state.sequence++,
      source: id,
      age: 0,
      distance: actor.state.distance,
      lateral: actor.state.lateral,
      heading,
      height,
      speed: COMBAT_RULES.arcSpeed + Math.max(0, actor.state.speed),
      position: pose.position
        .clone()
        .addScaledVector(frame.up, ARC_SHOT_HEIGHT)
        .toArray(),
      velocity: direction
        .multiplyScalar(COMBAT_RULES.arcSpeed + Math.max(0, actor.state.speed))
        .toArray(),
      quaternion: pose.quaternion.toArray(),
    };
    shot.target = acquireArcTarget(shot);
    state.shots.push(shot);
    state.flashes.push({
      id: state.sequence++,
      kind: 'arc',
      type: 'muzzle',
      source: id,
      position: pose.position
        .clone()
        .addScaledVector(
          up.clone().applyQuaternion(pose.quaternion),
          ARC_MUZZLE_HEIGHT,
        )
        .toArray(),
      quaternion: pose.quaternion.toArray(),
      age: 0,
      radius: 1.5,
    });
    notify(id, 'combat-fire', { kind: 'arc' });
  }
  function resetActor(id, all = false) {
    actors.delete(id);
    touched.delete(id);
    requests = requests.filter((entry) => entry.id !== id);
    if (all) {
      actors.clear();
      touched.clear();
      requests = [];
      state = fresh();
    } else {
      delete state.emitters[id];
      delete state.grace[id];
      delete state.disruptions[id];
      delete state.positions[id];
      state.shots = state.shots.filter((shot) => shot.source !== id);
      state.wakes = state.wakes.filter((wake) => wake.source !== id);
    }
  }
  return {
    bind(id, actor) {
      actors.set(id, actor);
      touched.add(id);
    },
    request(id, event) {
      requests.push({ id, event });
    },
    resetActor,
    step(dt) {
      if (!Number.isFinite(dt) || dt <= 0) return;
      state.time += dt;
      for (const [id, disruption] of Object.entries(state.disruptions))
        if (state.time >= disruption.startedAt + disruption.duration)
          delete state.disruptions[id];
      for (const flash of state.flashes) flash.age += dt;
      state.flashes = state.flashes.filter((flash) => flash.age < 0.55);
      // Preserve crossing order without making racers compete for a gate.
      requests.sort(
        (a, b) =>
          (a.event.payload.fraction ?? 0) - (b.event.payload.fraction ?? 0) ||
          a.id.localeCompare(b.id),
      );
      for (const { id, event } of requests) {
        if (!eligible(id)) continue;
        const { kind, deviceId } = event.payload;
        if (state.emitters[id])
          notify(id, 'pickup-unavailable', {
            kind,
            deviceId,
            reason: 'active',
          });
        else {
          state.emitters[id] = {
            kind,
            deviceId,
            elapsed: 0,
            shots: 0,
            nextWake: 0,
            tail: null,
            burst: state.sequence++,
          };
          if (kind === 'ion')
            state.wakeHits[state.emitters[id].burst] = {
              until:
                state.time +
                COMBAT_RULES.wakeDuration +
                COMBAT_RULES.wakeLifetime,
              targets: [],
            };
          notify(id, 'pickup-activate', event.payload);
        }
      }
      requests = [];
      for (const [id, emitter] of Object.entries(state.emitters)) {
        const current = eligible(id);
        if (!current) {
          delete state.emitters[id];
          continue;
        }
        const { actor, pose } = current;
        emitter.elapsed += dt;
        let finished = false;
        if (
          emitter.kind === 'repulsor' &&
          emitter.elapsed >= COMBAT_RULES.pulseDelay
        ) {
          pulse(id, actor, pose);
          finished = true;
        }
        if (emitter.kind === 'arc') {
          if (
            emitter.shots < 3 &&
            emitter.elapsed >=
              COMBAT_RULES.arcDelay + emitter.shots * COMBAT_RULES.arcInterval
          ) {
            shoot(id, actor, pose);
            emitter.shots++;
          }
          finished = emitter.shots === 3;
        }
        if (emitter.kind === 'ion') {
          if (emitter.elapsed >= emitter.nextWake) {
            const tail = pose.position
              .clone()
              .addScaledVector(
                forward.clone().applyQuaternion(pose.quaternion),
                -5,
              );
            if (emitter.tail)
              state.wakes.push({
                id: state.sequence++,
                source: id,
                age: 0,
                burst: emitter.burst,
                lateral: actor.state.lateral,
                a: emitter.tail,
                b: tail.toArray(),
                quaternion: pose.quaternion.toArray(),
                distance: actor.state.distance,
              });
            emitter.tail = tail.toArray();
            emitter.nextWake = emitter.elapsed + COMBAT_RULES.wakeInterval;
          }
          finished = emitter.elapsed >= COMBAT_RULES.wakeDuration;
        }
        if (finished) {
          notify(id, 'pickup-expire', {
            kind: emitter.kind,
            deviceId: emitter.deviceId,
          });
          delete state.emitters[id];
        }
      }
      state.shots = state.shots.filter((shot) => {
        shot.age += dt;
        if (shot.age > COMBAT_RULES.arcLifetime) return false;
        const a = vector(shot.position);
        // Bounded homing adjusts road-local yaw; hills and banks still need
        // no separate pitch aim, and every movement keeps the swept collision.
        steerArc(shot, dt);
        shot.distance += shot.speed * Math.cos(shot.heading) * dt;
        shot.lateral += shot.speed * Math.sin(shot.heading) * dt;
        if (
          (track.closed === false && shot.distance > track.length) ||
          Math.abs(shot.lateral) > track.width / 2
        )
          return false;
        const frame = track.sample(shot.distance);
        const b = frame.position
          .clone()
          .addScaledVector(frame.right, shot.lateral)
          .addScaledVector(frame.up, shot.height);
        const velocity = b.clone().sub(a).divideScalar(dt);
        const quaternion = frame.quaternion
          .clone()
          .multiply(new T.Quaternion().setFromAxisAngle(up, shot.heading));
        shot.quaternion = quaternion.toArray();
        shot.velocity = velocity.toArray();
        let first = blocked(a, b, quaternion);
        let target = null;
        for (const [id] of actors) {
          const other = eligible(id);
          if (
            !other ||
            id === shot.source ||
            !nearCourse(shot.distance, other.actor.state.distance, 600)
          )
            continue;
          const inverse = other.pose.quaternion.clone().invert();
          const previous = state.positions[id]
            ? vector(state.positions[id])
            : other.pose.position;
          const fraction = segmentBoxFraction(
            a.clone().sub(previous).applyQuaternion(inverse),
            b.clone().sub(other.pose.position).applyQuaternion(inverse),
            { x: 2.5, y: 1.8, z: ARC_TARGET_HALF_LENGTH },
          );
          if (fraction !== null && fraction < first) {
            first = fraction;
            target = id;
          }
        }
        if (target) {
          const other = eligible(target);
          const right = new T.Vector3(1, 0, 0).applyQuaternion(
            other.pose.quaternion,
          );
          const side =
            a.clone().sub(other.pose.position).dot(right) >= 0 ? -1 : 1;
          const applied = hit(
            shot.source,
            target,
            'arc',
            right
              .multiplyScalar(side * 5)
              .addScaledVector(velocity.clone().normalize(), 2),
            8,
            a.clone().lerp(b, first),
          );
          // Damage grace suppresses repeated impulses, not visible contact.
          if (!applied) {
            const payload = {
              source: shot.source,
              target,
              kind: 'arc',
              position: a.clone().lerp(b, first).toArray(),
            };
            notify(shot.source, 'combat-contact', payload);
            notify(target, 'combat-contact', payload);
            state.flashes.push({
              id: state.sequence++,
              target,
              kind: 'arc',
              position: a.clone().lerp(b, first).toArray(),
              quaternion: other.pose.quaternion.toArray(),
              age: 0,
              radius: 4,
            });
          }
        }
        if (target || first < 1) return false;
        shot.position = b.toArray();
        return true;
      });
      for (const wake of state.wakes) {
        wake.age += dt;
        if (wake.age > COMBAT_RULES.wakeLifetime) continue;
        for (const [id] of actors) {
          const other = eligible(id);
          const exposure = state.wakeHits[wake.burst];
          if (
            !other ||
            id === wake.source ||
            exposure?.targets.includes(id) ||
            !nearCourse(wake.distance, other.actor.state.distance, 45)
          )
            continue;
          const nearest = new T.Vector3();
          if (ionWakeContact(wake, other.pose.position, nearest) < 0) continue;
          const delta = other.pose.position.clone().sub(nearest);
          const right = new T.Vector3(1, 0, 0).applyQuaternion(
            other.pose.quaternion,
          );
          const side = delta.dot(right) >= 0 ? 1 : -1;
          if (
            hit(
              wake.source,
              id,
              'ion',
              right.multiplyScalar(side * 4),
              4,
              nearest,
            )
          )
            exposure?.targets.push(id);
        }
      }
      state.wakes = state.wakes
        .filter((wake) => wake.age < COMBAT_RULES.wakeLifetime)
        .slice(-256);
      state.flashes = state.flashes.slice(-32);
      for (const [id] of actors) {
        const current = eligible(id);
        if (current) state.positions[id] = current.pose.position.toArray();
      }
      for (const [id, exposure] of Object.entries(state.wakeHits))
        if (exposure.until <= state.time) delete state.wakeHits[id];
      touched.clear();
    },
    disruption(id) {
      return sampleCombatDisruption(state.disruptions[id], state.time);
    },
    avoidance(id) {
      const actor = actors.get(id);
      if (!actor) return null;
      const horizon = Math.max(35, actor.state.speed * 0.7);
      for (const wake of state.wakes) {
        if (wake.source === id || wake.age > COMBAT_RULES.wakeLifetime - 0.3)
          continue;
        let ahead = wake.distance - actor.state.distance;
        if (track.closed !== false && ahead < -track.length / 2)
          ahead += track.length;
        if (ahead < 0 || ahead > horizon) continue;
        const lane = wake.lateral;
        if (Math.abs(lane - actor.state.lateral) >= 5)
          return actor.state.lateral;
        return Math.max(
          -track.width / 2 + 4,
          Math.min(track.width / 2 - 4, lane > 0 ? lane - 8 : lane + 8),
        );
      }
      return null;
    },
    pose(id) {
      return actors.get(id)?.pose() ?? null;
    },
    ionContact(id) {
      const actor = actors.get(id);
      const pose = actor?.pose();
      if (
        !state.positions[id] ||
        !pose ||
        pose.grounded === false ||
        pose.recovering
      )
        return 0;
      return sampleIonContact(
        state.wakes,
        pose.position,
        id,
        COMBAT_RULES.wakeLifetime,
        (wake) => nearCourse(wake.distance, actor.state.distance, 45),
      );
    },
    view() {
      return state;
    },
    snapshot() {
      return copy(state);
    },
    restore(data) {
      const finite = (value) =>
        typeof value === 'number'
          ? Number.isFinite(value)
          : Array.isArray(value)
            ? value.every(finite)
            : value && typeof value === 'object'
              ? Object.values(value).every(finite)
              : value === null ||
                typeof value === 'string' ||
                typeof value === 'boolean';
      if (
        !data ||
        data.version !== COMBAT_RULES.version ||
        !finite(data) ||
        !Number.isFinite(data.time) ||
        data.time < 0 ||
        !Number.isSafeInteger(data.sequence) ||
        !Array.isArray(data.shots) ||
        data.shots.length > 30 ||
        !Array.isArray(data.wakes) ||
        data.wakes.length > 256 ||
        !Array.isArray(data.flashes) ||
        data.flashes.length > 32 ||
        !data.emitters ||
        !data.grace ||
        !data.disruptions ||
        Object.values(data.disruptions).some(
          (entry) =>
            !entry ||
            !COMBAT_CONSEQUENCES[entry.kind] ||
            entry.duration !== COMBAT_CONSEQUENCES[entry.kind].duration ||
            !Number.isFinite(entry.entrySpeed) ||
            entry.entrySpeed < 0 ||
            !Number.isFinite(entry.startedAt) ||
            entry.startedAt < 0 ||
            entry.startedAt > data.time,
        ) ||
        !data.positions ||
        !data.wakeHits
      )
        throw new Error('Combat replay state mismatch');
      state = copy(data);
      requests = [];
      touched.clear();
    },
  };
}
