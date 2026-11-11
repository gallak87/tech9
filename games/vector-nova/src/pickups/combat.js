import { toughness } from '../progression/catalog.js';
import { projectMagneticBody } from '../physics/magnetic-body.js';
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
  LANCE_SPEED,
  LANCE_LIFETIME,
} from './rules.js';

export const COMBAT_RULES = Object.freeze({
  version: 6,
  consequences: COMBAT_CONSEQUENCES,
  pulseDelay: 0.5,
  pulseRadius: 108,
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
export function validateCombatResistance(value = 0) {
  if (!Number.isFinite(value) || value < 0 || value > 1)
    throw new Error(
      'Combat resistance must be a finite value from zero to one',
    );
  return value;
}
const copy = (value) => structuredClone(value);
const vector = (value) => new T.Vector3().fromArray(value);
const up = new T.Vector3(0, 1, 0);
const forward = new T.Vector3(0, 0, 1);
const boltHull = { halfWidth: 0.15, halfLength: 0.15, hover: 0.15 };
const defaultHitBounds = Object.freeze({
  half: Object.freeze({ x: 2.5, y: 1.8, z: ARC_TARGET_HALF_LENGTH }),
  center: Object.freeze([0, 0, 0]),
});

// Actor-local bounds are configuration, not damage state. Large event chassis
// provide their actual hull envelope instead of inheriting the racer-sized box.
export function combatHitBounds(bounds) {
  if (bounds == null) return null;
  const half = bounds.half ?? bounds;
  const values = Array.isArray(half) ? half : [half.x, half.y, half.z];
  const offset = bounds.center ?? [0, 0, 0];
  const center = Array.isArray(offset)
    ? [...offset]
    : [offset.x, offset.y, offset.z];
  if (
    values.length !== 3 ||
    !values.every((value) => Number.isFinite(value) && value > 0) ||
    center.length !== 3 ||
    !center.every(Number.isFinite)
  )
    throw new Error(
      'Combat hit bounds need positive finite half extents and a finite local center',
    );
  return Object.freeze({
    half: Object.freeze({ x: values[0], y: values[1], z: values[2] }),
    center: Object.freeze(center),
  });
}

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
  onHit,
}) {
  if (onHit !== undefined && typeof onHit !== 'function')
    throw new Error('Combat hit observer must be a function');
  const actors = new Map();
  const boxes = new WeakMap();
  const touched = new Set();
  const movingFrames = typeof track.frameAtTime === 'function';
  let requests = [];
  let state;
  const fresh = () => ({
    version: COMBAT_RULES.version,
    time: 0,
    ...(movingFrames ? { frameTime: 0 } : {}),
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
  function sameTeam(source, target) {
    const team = actors.get(source)?.team;
    return (
      typeof team === 'string' &&
      team.length > 0 &&
      team === actors.get(target)?.team
    );
  }
  function hitBounds(actor) {
    if (!actor.hitBounds) return defaultHitBounds;
    let box = boxes.get(actor.hitBounds);
    if (!box) {
      box = combatHitBounds(actor.hitBounds);
      boxes.set(actor.hitBounds, box);
    }
    return box;
  }
  const courseFrame = (distance, time = state.frameTime) =>
    movingFrames ? track.frameAtTime(distance, time) : track.sample(distance);
  function eligible(id, requireTouched = true) {
    const actor = actors.get(id);
    const pose = actor?.pose();
    return (!requireTouched || touched.has(id)) &&
      pose?.grounded !== false &&
      !pose?.recovering
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
    if (!other || target === shot.source || sameTeam(shot.source, target))
      return null;
    let ahead = other.actor.state.distance - shot.distance;
    if (track.closed !== false)
      ahead =
        T.MathUtils.euclideanModulo(ahead + track.length / 2, track.length) -
        track.length / 2;
    if (ahead <= 0 || ahead > COMBAT_RULES.arcLockRange) return null;
    const frame = courseFrame(other.actor.state.distance);
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
  function hit(
    source,
    target,
    kind,
    impulse,
    cost,
    position,
    equipment,
    incomingQuaternion,
    signature,
  ) {
    const damageOnly = (state.grace[target] ?? 0) > state.time;
    if (damageOnly && !actors.get(target)?.damageDuringGrace) return;
    const targetActor = eligible(target);
    if (!targetActor || source === target || sameTeam(source, target)) return;
    const entrySpeed = targetActor.actor.state.speed;
    const resistance = targetActor.actor.combatResistance ?? 0;
    const mitigation = resistance
      ? 1 - (1 - toughness(targetActor.actor.state)) * (1 - resistance)
      : toughness(targetActor.actor.state);
    const reserveCost = COMBAT_CONSEQUENCES[kind]?.reserveCost ?? cost;
    const shielded = targetActor.actor.hit({
      source,
      kind,
      impulse: damageOnly
        ? new T.Vector3()
        : resistance
          ? impulse.clone().multiplyScalar(1 - resistance)
          : impulse,
      cost: damageOnly
        ? 0
        : resistance
          ? reserveCost * (1 - resistance)
          : reserveCost,
      ...(damageOnly ? { damageOnly: true } : {}),
    });
    if (!shielded && !damageOnly) {
      state.disruptions[target] = {
        ...combatDisruption(
          state.disruptions[target],
          kind,
          state.time,
          entrySpeed,
          mitigation,
          equipment,
        ),
        ...(resistance ? { combatResistance: resistance } : {}),
        ...(signature ? { signature } : {}),
      };
      targetActor.actor.disrupt?.(
        sampleCombatDisruption(state.disruptions[target], state.time),
      );
    }
    if (!damageOnly)
      state.grace[target] =
        state.time + (kind === 'ion' ? 1.25 : COMBAT_RULES.hitGrace);
    const payload = {
      source,
      target,
      kind,
      shielded,
      duration:
        shielded || damageOnly
          ? 0
          : resistance
            ? state.disruptions[target].duration
            : COMBAT_CONSEQUENCES[kind].duration,
      position: position.toArray(),
      ...(equipment ? { equipment } : {}),
      ...(signature ? { signature } : {}),
      ...(damageOnly ? { damageOnly: true } : {}),
    };
    notify(target, 'combat-hit', payload);
    notify(source, 'combat-confirm', payload);
    const hitId = state.sequence++;
    state.flashes.push({
      id: hitId,
      target,
      kind: shielded ? 'aegis' : kind,
      ...(equipment ? { equipment } : {}),
      ...(signature ? { signature } : {}),
      position: payload.position,
      quaternion:
        !shielded && incomingQuaternion
          ? [...incomingQuaternion]
          : targetActor.pose.quaternion.toArray(),
      age: 0,
      radius: 4,
    });
    onHit?.({ ...copy(payload), hitId });
    return true;
  }
  function pulse(id, actor, pose) {
    const origin = pose.position;
    const roadFrame = (distance, lateral) => {
      const surface = movingFrames
        ? track.surfaceAtTime?.(distance, lateral, state.frameTime)
        : track.sampleSurface?.(distance, lateral);
      if (surface) return surface;
      const frame = courseFrame(distance);
      return {
        ...frame,
        position: frame.position.clone().addScaledVector(frame.right, lateral),
      };
    };
    const sourceFrame = roadFrame(actor.state.distance, actor.state.lateral);
    const sourceHeight = origin
      .clone()
      .sub(sourceFrame.position)
      .dot(sourceFrame.up);
    state.flashes.push({
      id: state.sequence++,
      kind: 'repulsor',
      position: origin.toArray(),
      quaternion: pose.quaternion.toArray(),
      age: 0,
      radius: COMBAT_RULES.pulseRadius,
      distance: actor.state.distance,
      lateral: actor.state.lateral,
    });
    notify(id, 'combat-fire', { kind: 'repulsor' });
    for (const [target] of actors) {
      const other = eligible(target);
      if (
        !other ||
        id === target ||
        sameTeam(id, target) ||
        !nearCourse(
          actor.state.distance,
          other.actor.state.distance,
          COMBAT_RULES.pulseRadius,
        )
      )
        continue;
      let along = other.actor.state.distance - actor.state.distance;
      if (track.closed !== false)
        along =
          T.MathUtils.euclideanModulo(along + track.length / 2, track.length) -
          track.length / 2;
      const across = other.actor.state.lateral - actor.state.lateral;
      const distance = Math.hypot(along, across);
      if (distance > COMBAT_RULES.pulseRadius) continue;
      const targetFrame = roadFrame(
        other.actor.state.distance,
        other.actor.state.lateral,
      );
      const targetHeight = other.pose.position
        .clone()
        .sub(targetFrame.position)
        .dot(targetFrame.up);
      if (Math.abs(targetHeight - sourceHeight) > 6) continue;
      // A longer wave travels along the supported course, rather than a chord
      // through a hill. Static cover still blocks it on each short interval.
      const steps = Math.max(1, Math.ceil(distance / 8));
      let before = origin;
      let occluded = false;
      for (let i = 1; i <= steps; i++) {
        const t = i / steps;
        const frame = roadFrame(
          actor.state.distance + along * t,
          actor.state.lateral + across * t,
        );
        const after =
          i === steps
            ? other.pose.position
            : frame.position
                .clone()
                .addScaledVector(
                  frame.up,
                  T.MathUtils.lerp(sourceHeight, targetHeight, t),
                );
        if (blocked(before, after) < 0.99) {
          occluded = true;
          break;
        }
        before = after;
      }
      if (occluded) continue;
      const delta = targetFrame.tangent
        .clone()
        .multiplyScalar(along)
        .addScaledVector(targetFrame.right, across);
      if (distance < 0.01) delta.copy(targetFrame.right);
      else delta.normalize();
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
  function shoot(id, actor, pose, heavy = false, signature) {
    const direction = forward.clone().applyQuaternion(pose.quaternion);
    const frame = courseFrame(
      actor.state.distance,
      Number.isFinite(actor.state.time) ? actor.state.time : state.frameTime,
    );
    const heading = Math.atan2(
      direction.dot(frame.right),
      direction.dot(frame.tangent),
    );
    const height =
      pose.position
        .clone()
        .sub(frame.position)
        .addScaledVector(frame.right, -actor.state.lateral)
        .dot(frame.up) + (signature ? 0 : ARC_SHOT_HEIGHT);
    const shot = {
      id: state.sequence++,
      source: id,
      ...(heavy ? { heavy: true } : {}),
      ...(signature ? { signature } : {}),
      age: 0,
      distance: actor.state.distance,
      lateral: actor.state.lateral,
      heading,
      height,
      speed:
        (heavy ? LANCE_SPEED : COMBAT_RULES.arcSpeed) +
        Math.max(0, actor.state.speed),
      position: pose.position
        .clone()
        .addScaledVector(frame.up, signature ? 0 : ARC_SHOT_HEIGHT)
        .toArray(),
      velocity: direction
        .multiplyScalar(COMBAT_RULES.arcSpeed + Math.max(0, actor.state.speed))
        .toArray(),
      quaternion: pose.quaternion.toArray(),
    };
    if (signature) {
      const projected = projectMagneticBody(
        track,
        pose.position,
        actor.state.distance,
        actor.state.lateral,
      );
      shot.distance = projected.distance;
      shot.lateral = projected.lateral;
      shot.velocity = forward
        .clone()
        .applyQuaternion(pose.quaternion)
        .multiplyScalar(shot.speed)
        .toArray();
    }
    shot.target = heavy || signature ? null : acquireArcTarget(shot);
    state.shots.push(shot);
    state.flashes.push({
      id: state.sequence++,
      kind: 'arc',
      ...(heavy ? { equipment: 'lance' } : {}),
      type: 'muzzle',
      ...(signature ? { signature } : {}),
      source: id,
      position: pose.position
        .clone()
        .addScaledVector(
          up.clone().applyQuaternion(pose.quaternion),
          signature ? 0 : ARC_MUZZLE_HEIGHT,
        )
        .toArray(),
      quaternion: pose.quaternion.toArray(),
      age: 0,
      radius: 1.5,
    });
    notify(id, 'combat-fire', {
      kind: 'arc',
      ...(heavy ? { equipment: 'lance' } : {}),
    });
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
    bind(id, actor, { touch = true } = {}) {
      hitBounds(actor);
      validateCombatResistance(actor.combatResistance);
      if (
        actor.damageDuringGrace !== undefined &&
        typeof actor.damageDuringGrace !== 'boolean'
      )
        throw new Error('Damage during grace must be a boolean');
      actors.set(id, actor);
      if (touch) touched.add(id);
      if (touch && movingFrames && Number.isFinite(actor.state.time))
        state.frameTime = actor.state.time;
    },
    draftTarget(id) {
      const source = eligible(id);
      if (!source) return null;
      for (const [target] of actors) {
        const other = eligible(target, false);
        if (!other || id === target) continue;
        let ahead = other.actor.state.distance - source.actor.state.distance;
        if (track.closed !== false)
          ahead =
            T.MathUtils.euclideanModulo(
              ahead + track.length / 2,
              track.length,
            ) -
            track.length / 2;
        if (
          ahead > 5 &&
          ahead < 180 &&
          Math.abs(other.actor.state.lateral - source.actor.state.lateral) <
            9 &&
          blocked(source.pose.position, other.pose.position) > 0.99
        )
          return target;
      }
      return null;
    },
    fireLance(id, options = {}) {
      const source = eligible(id);
      if (!source) return false;
      if (
        options.signature !== undefined &&
        !['goliath-pressure', 'bulwark-slab'].includes(options.signature)
      )
        throw new Error('Unknown signature projectile');
      const pose = options.pose ?? source.pose;
      if (
        !pose.position?.isVector3 ||
        !pose.quaternion?.isQuaternion ||
        ![...pose.position.toArray(), ...pose.quaternion.toArray()].every(
          Number.isFinite,
        ) ||
        Math.abs(pose.quaternion.lengthSq() - 1) > 1e-5
      )
        throw new Error('Signature fire requires a finite physical pose');
      shoot(id, source.actor, pose, true, options.signature);
      return true;
    },
    fireArc(id, options = {}) {
      const source = eligible(id);
      if (!source) return false;
      if (options.signature !== 'wraith-scissor')
        throw new Error('Unknown Arc signature projectile');
      const pose = options.pose;
      if (
        !pose?.position?.isVector3 ||
        !pose.quaternion?.isQuaternion ||
        ![...pose.position.toArray(), ...pose.quaternion.toArray()].every(
          Number.isFinite,
        ) ||
        Math.abs(pose.quaternion.lengthSq() - 1) > 1e-5
      )
        throw new Error('Signature fire requires a finite physical pose');
      shoot(id, source.actor, pose, false, options.signature);
      return true;
    },
    request(id, event) {
      requests.push({ id, event });
    },
    // A destroyed emitter ends future deposits, never the physical trail it
    // already laid. Keep the burst's existing contact ledger until it expires.
    stopIon(id) {
      const pending = requests.length;
      requests = requests.filter(
        ({ id: source, event }) =>
          source !== id || event.payload.kind !== 'ion',
      );
      const emitter = state.emitters[id];
      if (emitter?.kind !== 'ion') return requests.length !== pending;
      delete state.emitters[id];
      notify(id, 'pickup-expire', { kind: 'ion', deviceId: emitter.deviceId });
      return true;
    },
    resetActor,
    step(dt) {
      if (!Number.isFinite(dt) || dt <= 0) return;
      state.time += dt;
      if (movingFrames) {
        const simulationTime = [...touched]
          .map((id) => actors.get(id)?.state.time)
          .find(Number.isFinite);
        state.frameTime = simulationTime ?? state.frameTime + dt;
      }
      for (const [id, disruption] of Object.entries(state.disruptions))
        if (state.time >= disruption.startedAt + disruption.duration)
          delete state.disruptions[id];
      for (const flash of state.flashes) flash.age += dt;
      state.flashes = state.flashes.filter((flash) => flash.age < 0.55);
      // Preserve crossing order without making racers compete for a gate.
      requests.sort(
        (a, b) =>
          (a.event.payload.fraction ?? 0) - (b.event.payload.fraction ?? 0) ||
          a.id.localeCompare(b.id) ||
          a.event.payload.deviceId.localeCompare(b.event.payload.deviceId),
      );
      for (const { id, event } of requests) {
        if (!eligible(id)) continue;
        const { kind, deviceId } = event.payload;
        const wakeMuzzle = event.payload.wakeMuzzle;
        if (
          wakeMuzzle !== undefined &&
          (kind !== 'ion' ||
            !Array.isArray(wakeMuzzle) ||
            wakeMuzzle.length !== 3 ||
            !wakeMuzzle.every((v) => Number.isFinite(v) && Math.abs(v) <= 100))
        )
          throw new Error('Ion emitter requires a finite physical muzzle');
        // Each accepted gate starts its full program, replacing any emitter.
        // Fired shots, deposited wakes and their burst hit ledgers still own
        // their original lifetime independently of the refreshed emitter.
        state.emitters[id] = {
          kind,
          deviceId,
          elapsed: 0,
          shots: 0,
          nextWake: 0,
          tail: null,
          burst: state.sequence++,
          ...(wakeMuzzle ? { wakeMuzzle: [...wakeMuzzle] } : {}),
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
            const tail = emitter.wakeMuzzle
              ? vector(emitter.wakeMuzzle)
                  .applyQuaternion(pose.quaternion)
                  .add(pose.position)
              : pose.position
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
        if (shot.age > (shot.heavy ? LANCE_LIFETIME : COMBAT_RULES.arcLifetime))
          return false;
        const a = vector(shot.position);
        // Bounded homing adjusts road-local yaw; hills and banks still need
        // no separate pitch aim, and every movement keeps the swept collision.
        if (!shot.signature) steerArc(shot, dt);
        let b;
        if (shot.signature) {
          // A siege bolt leaves its real offset muzzle along the frozen aim.
          // It never snaps to the actor centre or steers after the lane locks.
          b = a.clone().addScaledVector(vector(shot.velocity), dt);
          const projected = projectMagneticBody(
            track,
            b,
            shot.distance,
            shot.lateral,
          );
          shot.distance = projected.distance;
          shot.lateral = projected.lateral;
        } else {
          shot.distance += shot.speed * Math.cos(shot.heading) * dt;
          shot.lateral += shot.speed * Math.sin(shot.heading) * dt;
        }
        if (
          (track.closed === false && shot.distance > track.length) ||
          Math.abs(shot.lateral) > track.width / 2
        )
          return false;
        const frame = courseFrame(shot.distance);
        b ??= frame.position
          .clone()
          .addScaledVector(frame.right, shot.lateral)
          .addScaledVector(frame.up, shot.height);
        const velocity = b.clone().sub(a).divideScalar(dt);
        const quaternion = shot.signature
          ? new T.Quaternion().fromArray(shot.quaternion)
          : frame.quaternion
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
            sameTeam(shot.source, id) ||
            !nearCourse(shot.distance, other.actor.state.distance, 600)
          )
            continue;
          const inverse = other.pose.quaternion.clone().invert();
          const box = hitBounds(other.actor);
          const center = new T.Vector3()
            .fromArray(box.center)
            .applyQuaternion(other.pose.quaternion);
          const previous = state.positions[id]
            ? vector(state.positions[id])
            : other.pose.position;
          const fraction = segmentBoxFraction(
            a.clone().sub(previous).sub(center).applyQuaternion(inverse),
            b
              .clone()
              .sub(other.pose.position)
              .sub(center)
              .applyQuaternion(inverse),
            box.half,
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
            shot.heavy ? 'repulsor' : 'arc',
            right
              .multiplyScalar(side * 5)
              .addScaledVector(velocity.clone().normalize(), 2),
            8,
            a.clone().lerp(b, first),
            shot.heavy ? 'lance' : undefined,
            shot.heavy ? shot.quaternion : undefined,
            shot.signature,
          );
          // Damage grace suppresses repeated impulses, not visible contact.
          if (!applied) {
            const payload = {
              source: shot.source,
              target,
              kind: 'arc',
              ...(shot.heavy ? { equipment: 'lance' } : {}),
              ...(shot.signature ? { signature: shot.signature } : {}),
              position: a.clone().lerp(b, first).toArray(),
            };
            notify(shot.source, 'combat-contact', payload);
            notify(target, 'combat-contact', payload);
            state.flashes.push({
              id: state.sequence++,
              target,
              kind: 'arc',
              ...(shot.heavy ? { equipment: 'lance' } : {}),
              ...(shot.signature ? { signature: shot.signature } : {}),
              position: a.clone().lerp(b, first).toArray(),
              quaternion: shot.heavy
                ? [...shot.quaternion]
                : other.pose.quaternion.toArray(),
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
            sameTeam(wake.source, id) ||
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
        // Keep the last physical pose even while this actor is immune. The
        // landing tick must not sweep its entire flight from the takeoff point.
        const pose = actors.get(id)?.pose();
        if (pose) state.positions[id] = pose.position.toArray();
      }
      for (const [id, exposure] of Object.entries(state.wakeHits))
        if (exposure.until <= state.time) delete state.wakeHits[id];
      touched.clear();
    },
    disruption(id) {
      const pose = actors.get(id)?.pose();
      // Keep the ground-contact envelope's clock, but suspend its physical and
      // presentation sampling through flight. Supported contact resumes it.
      if (pose?.grounded === false || pose?.recovering) return null;
      return sampleCombatDisruption(state.disruptions[id], state.time);
    },
    avoidance(id) {
      const actor = actors.get(id);
      if (!actor) return null;
      const horizon = Math.max(35, actor.state.speed * 0.7);
      for (const wake of state.wakes) {
        if (
          wake.source === id ||
          sameTeam(wake.source, id) ||
          wake.age > COMBAT_RULES.wakeLifetime - 0.3
        )
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
        (wake) =>
          !sameTeam(wake.source, id) &&
          nearCourse(wake.distance, actor.state.distance, 45),
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
        (movingFrames &&
          (!Number.isFinite(data.frameTime) || data.frameTime < 0)) ||
        !Number.isSafeInteger(data.sequence) ||
        !Array.isArray(data.shots) ||
        data.shots.length > 30 ||
        data.shots.some(
          (shot) =>
            shot.signature !== undefined &&
            !(
              (['goliath-pressure', 'bulwark-slab'].includes(shot.signature) &&
                shot.heavy === true) ||
              (shot.signature === 'wraith-scissor' &&
                shot.heavy === undefined &&
                shot.target === null)
            ),
        ) ||
        !Array.isArray(data.wakes) ||
        data.wakes.length > 256 ||
        !Array.isArray(data.flashes) ||
        data.flashes.length > 32 ||
        data.flashes.some(
          (flash) =>
            flash.signature !== undefined &&
            !(
              (['goliath-pressure', 'bulwark-slab'].includes(flash.signature) &&
                flash.equipment === 'lance') ||
              (flash.signature === 'wraith-scissor' &&
                flash.equipment === undefined)
            ),
        ) ||
        !data.emitters ||
        Object.values(data.emitters).some(
          (emitter) =>
            emitter.wakeMuzzle !== undefined &&
            (emitter.kind !== 'ion' ||
              !Array.isArray(emitter.wakeMuzzle) ||
              emitter.wakeMuzzle.length !== 3 ||
              !emitter.wakeMuzzle.every(
                (v) => Number.isFinite(v) && Math.abs(v) <= 100,
              )),
        ) ||
        !data.grace ||
        !data.disruptions ||
        Object.values(data.disruptions).some(
          (entry) =>
            !entry ||
            !COMBAT_CONSEQUENCES[entry.kind] ||
            entry.duration !==
              COMBAT_CONSEQUENCES[entry.kind].duration *
                (1 - (entry.mitigation ?? 0)) ||
            (entry.combatResistance !== undefined &&
              (!Number.isFinite(entry.combatResistance) ||
                entry.combatResistance <= 0 ||
                entry.combatResistance > 1 ||
                entry.mitigation == null)) ||
            (entry.mitigation != null &&
              (!Number.isFinite(entry.mitigation) ||
                entry.mitigation < (entry.combatResistance ?? 0) ||
                entry.mitigation >
                  (entry.combatResistance
                    ? 1 - 0.8 * (1 - entry.combatResistance)
                    : 0.2))) ||
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
