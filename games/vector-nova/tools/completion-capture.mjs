import {
  COMPLETION_DURATION,
  COMPLETION_CAPTURE,
} from '../src/frontend/completion-config.js';
import * as T from 'three';
import {
  COLLISION_HULLS_ID,
  getCollisionHull,
} from '../src/ships/collision-hulls.js';
import createShatterlineLevel from '../src/levels/shatterline/index.js';
import { createRace } from '../src/race/index.js';
import { withMagneticBoundaries } from '../src/physics/magnetic-boundaries.js';
import { createVehicleState, STEERING_ASSIST } from '../src/physics/index.js';
import { createDeviceRuntime } from '../src/pickups/runtime.js';
import { createCombatSimulation } from '../src/pickups/combat.js';
import { getRacerControl } from '../src/race/racers.js';

export const COMPLETION_RUN_STEP = 1 / 120;
export const COMPLETION_RUN_DURATION = COMPLETION_DURATION;
const HERO_SHIPS = new Set(['kestrel', 'shrike', 'bastion', 'needle']);
const ACTORS = Object.freeze([
  {
    id: 'hero',
    combatId: 'player',
    offset: 0,
    lateral: 10,
    speed: 150,
    lane: 10,
    pace: 1,
    difficulty: 'hard',
  },
  {
    id: 'rook',
    combatId: 'rook',
    shipId: 'kestrel',
    offset: -28,
    lateral: -6,
    speed: 145,
    lane: -6,
    pace: 0.91,
    difficulty: 'medium',
  },
  {
    id: 'manta',
    combatId: 'manta',
    shipId: 'bastion',
    offset: 56,
    lateral: 4,
    speed: 140,
    lane: 4,
    pace: 0.92,
    difficulty: 'medium',
  },
]);
export const COMPLETION_DRIFT = Object.freeze({
  delay: 0.5,
  duration: 1.9,
  turnDuration: 0.75,
  lateralDuration: 1.1,
  lateral: 14,
  yaw: (78 * Math.PI) / 180,
});
const clampUnit = (value) => Math.max(0, Math.min(1, value));
const smooth = (value) => value * value * (3 - 2 * value);
function roadQuaternion(frame) {
  return new T.Quaternion().setFromRotationMatrix(
    new T.Matrix4().makeBasis(frame.right, frame.up, frame.tangent),
  );
}

// Only this disposable finale owns the post-checker choreography. The race,
// jump, overtaking and half-second finish runout stay exactly as captured from
// production physics. The staged drift never changes gameplay handling.
function choreographFinish(frames, track, finishTime) {
  const pattern = COMPLETION_DRIFT;
  const startIndex = frames.findIndex(
    (frame) => frame.time >= finishTime + pattern.delay,
  );
  const stopIndex =
    startIndex + Math.round(pattern.duration / COMPLETION_RUN_STEP);
  if (startIndex < 1 || stopIndex >= frames.length)
    throw new Error('The completion drift needs its full braking and hold.');
  const start = frames[startIndex];
  const original = copy(start.hero);
  const startTime = start.time,
    stopTime = frames[stopIndex].time;
  const initialFrame = track.sample(original.state.distance);
  const initialPosition = new T.Vector3().fromArray(original.position);
  const relative = initialPosition.clone().sub(initialFrame.position);
  const height = relative.dot(initialFrame.up);
  const rightResidual =
    relative.dot(initialFrame.right) - original.state.lateral;
  const forwardResidual = relative.dot(initialFrame.tangent);
  const entryVelocity = initialPosition
    .clone()
    .sub(new T.Vector3().fromArray(frames[startIndex - 1].hero.position))
    .divideScalar(COMPLETION_RUN_STEP);
  const entrySpeed = Math.max(0, entryVelocity.dot(initialFrame.tangent));
  const initialYaw = original.state.heading;
  const initialBasis = roadQuaternion(initialFrame).multiply(
    new T.Quaternion().setFromAxisAngle(new T.Vector3(0, 1, 0), initialYaw),
  );
  const correction = initialBasis
    .invert()
    .multiply(new T.Quaternion().fromArray(original.quaternion));
  const identity = new T.Quaternion();
  const poses = [];
  for (let index = startIndex; index < frames.length; index++) {
    const elapsed =
      index >= stopIndex ? pattern.duration : frames[index].time - startTime;
    const u = clampUnit(elapsed / pattern.duration);
    const turn = smooth(clampUnit(elapsed / pattern.turnDuration));
    const distance =
      original.state.distance +
      entrySpeed * pattern.duration * (u - u * u * u + 0.5 * u * u * u * u);
    const lateral =
      original.state.lateral +
      (pattern.lateral - original.state.lateral) *
        smooth(clampUnit(elapsed / pattern.lateralDuration));
    const yaw = initialYaw + (pattern.yaw - initialYaw) * turn;
    const frame = track.sample(distance);
    const position = frame.position
      .clone()
      .addScaledVector(frame.right, lateral + rightResidual)
      .addScaledVector(frame.up, height)
      .addScaledVector(frame.tangent, forwardResidual);
    const quaternion = roadQuaternion(frame)
      .multiply(
        new T.Quaternion().setFromAxisAngle(new T.Vector3(0, 1, 0), yaw),
      )
      .multiply(correction.clone().slerp(identity, turn));
    poses.push({ position, quaternion, frame, distance, lateral, yaw, u });
  }
  const vertex = new T.Vector3();
  const vertices = getCollisionHull(original.state.chassisId).vertices;
  for (let index = startIndex; index < frames.length; index++) {
    const local = index - startIndex,
      pose = poses[local],
      sample = frames[index],
      hero = sample.hero;
    const velocity =
      index >= stopIndex
        ? new T.Vector3()
        : local === 0
          ? entryVelocity.clone()
          : poses[Math.min(local + 1, poses.length - 1)].position
              .clone()
              .sub(poses[local - 1].position)
              .divideScalar(2 * COMPLETION_RUN_STEP);
    const forward = new T.Vector3(0, 0, 1).applyQuaternion(pose.quaternion);
    const side = pose.frame.up.clone().cross(forward).normalize();
    const slipSpeed = velocity.dot(side),
      speed = velocity.dot(forward);
    let clearance = Infinity;
    for (let i = 0; i < vertices.length; i += 3) {
      vertex
        .fromArray(vertices, i)
        .applyQuaternion(pose.quaternion)
        .add(pose.position)
        .sub(pose.frame.position);
      clearance = Math.min(
        clearance,
        track.width / 2 - Math.abs(vertex.dot(pose.frame.right)),
      );
    }
    hero.position = pose.position.toArray();
    hero.quaternion = pose.quaternion.toArray();
    hero.grounded = true;
    hero.recovering = false;
    hero.steeringBank = false;
    Object.assign(hero.state, {
      distance: pose.distance,
      lateral: pose.lateral,
      speed,
      lateralSpeed: velocity.dot(pose.frame.right),
      heading: pose.yaw,
      steeringHeading: 0,
      steer: 0,
      boosting: false,
      impact: 0,
    });
    hero.input = {
      throttle: 0,
      brake: 1,
      airbrake: index < stopIndex,
      boost: false,
      steer: 0,
    };
    hero.effects.slide = {
      source: 'choreographed-finish',
      active: index < stopIndex,
      phase: index < stopIndex ? 'drifting' : 'stopped',
      progress: pose.u,
      velocity: velocity.toArray(),
      linearSpeed: velocity.length(),
      slipAngle: Math.atan2(slipSpeed, Math.max(1, Math.abs(speed))),
      slipSpeed,
      yaw: pose.yaw,
      clearance,
    };
  }
  const active = frames.slice(startIndex, stopIndex);
  const peak = active.reduce((peak, frame) =>
    Math.abs(frame.hero.effects.slide.slipSpeed) >
    Math.abs(peak.hero.effects.slide.slipSpeed)
      ? frame
      : peak,
  );
  return { start: startTime, peak: peak.time, stop: stopTime };
}
const waitForPaint = () => new Promise((resolve) => setTimeout(resolve, 0));
const copy = (value) => structuredClone(value);
const eventTag = (event) => {
  const kind = event.payload?.kind;
  if (['arc', 'repulsor', 'ion'].includes(kind)) {
    if (event.type === 'combat-fire') return `${kind}-fire`;
    if (event.type === 'combat-hit' || event.type === 'combat-confirm')
      return `${kind}-hit`;
  }
  return event.type;
};
function combatFrame(combat) {
  const { time, shots, flashes, wakes, emitters, disruptions } = combat.view();
  return copy({ time, shots, flashes, wakes, emitters, disruptions });
}
function recordActor(actor, input) {
  const pose = actor.runtime.pose(1);
  if (!pose) throw new Error('Completion racer has no physical pose.');
  const snapshot = actor.motion.snapshot();
  const flight = snapshot.flight;
  return {
    position: pose.position.toArray(),
    quaternion: pose.quaternion.toArray(),
    grounded: pose.grounded !== false,
    recovering: Boolean(pose.recovering),
    steeringBank: pose.steeringBank === true,
    state: { ...actor.state },
    input: { ...input },
    race: {
      complete: actor.race.complete,
      checkpoint: actor.race.checkpoint,
      elapsed: actor.race.elapsed,
      valid: actor.race.valid,
    },
    effects: { ...actor.effects },
    motion: {
      mode: snapshot.mode,
      landingSettle: snapshot.landingSettle
        ? copy(snapshot.landingSettle)
        : null,
      flight: flight
        ? {
            elapsed: flight.elapsed,
            from: flight.from,
            velocity: [...flight.velocity],
          }
        : null,
    },
  };
}

// Build-time capture of a small genuine race. Only the supported
// rolling grid is seeded; racing, combat, flight and landing use ordinary inputs
// and the shared native solve. Only the hero's finish drift is choreographed.
// The final shipped data owns no native resources and plays at one real second/second.
export async function generateCompletionRun({
  track,
  shipId,
  signal,
  onProgress,
  duration = COMPLETION_RUN_DURATION,
} = {}) {
  if (!HERO_SHIPS.has(shipId)) throw new Error('Unknown completion chassis.');
  signal?.throwIfAborted();
  const level = createShatterlineLevel({ shape: false });
  track ??= level.createTrack();
  let collisionWorld, dynamics;
  const actors = [];
  try {
    await waitForPaint();
    signal?.throwIfAborted();
    collisionWorld = level.createCollisionWorld({ track });
    onProgress?.(0.02);
    await waitForPaint();
    signal?.throwIfAborted();
    const physicalWorld = withMagneticBoundaries(track, collisionWorld);
    onProgress?.(0.05);
    await waitForPaint();
    signal?.throwIfAborted();
    dynamics = await level.createDynamics({
      track,
      collisionWorld: physicalWorld,
    });
    signal?.throwIfAborted();
    const devices = level.racing.createDevices(track);
    const jump = track.jumps.find((item) => item.id === 'horizon-transfer');
    const weapon = devices.find(
      (item) => item.id === 'horizon-approach-repulsor',
    );
    const startDistance = weapon.distance - 180;
    // Only these genuine gates can appear in this bounded final leg. Physics
    // still consumes the complete production layout; presentation retains only
    // its visible device ledgers instead of copying all 21 km into every frame.
    const visibleDevices = devices.filter(
      (device) => device.distance >= startDistance - 50,
    );
    const combat = createCombatSimulation({ track, collisionWorld, dynamics });
    const events = [],
      frames = [];
    let stepEvents = [],
      time = 0;
    for (const specification of ACTORS) {
      const chassis = specification.shipId ?? shipId;
      const motion = level.createRuntime({
        track,
        collisionWorld,
        dynamics,
        settings: { steeringAssist: STEERING_ASSIST },
      });
      const actor = {
        specification,
        motion,
        effects: {},
        runtime: null,
        state: {
          ...createVehicleState(chassis),
          chassisId: specification.id === 'hero' ? chassis : specification.id,
          distance: startDistance + specification.offset,
          lateral: specification.lateral,
          speed: specification.speed,
        },
      };
      actor.runtime = createDeviceRuntime({
        track,
        devices,
        motion,
        combat,
        combatId: specification.combatId,
        presentation: {
          reset() {
            actor.effects = {};
          },
          update({ effects }) {
            actor.effects = {
              vectorActive: effects.vectorActive,
              vectorDevice: effects.vectorDevice,
              aegisRemaining: effects.aegisRemaining,
              used: Object.fromEntries(
                visibleDevices.map((device) => [
                  device.id,
                  effects.used[device.id],
                ]),
              ),
            };
          },
          dispose() {},
        },
      });
      actor.race = createRace(track, {
        rulesId: actor.runtime.rulesId,
        laps: 1,
      });
      actor.race.placeScenario(actor.state.distance);
      actor.runtime.observePresentation({
        reset() {},
        events(emitted) {
          for (const event of emitted) {
            const recorded = {
              ...copy(event),
              actor: specification.id,
              time,
              tag: eventTag(event),
            };
            events.push(recorded);
            stepEvents.push(recorded);
          }
        },
      });
      actors.push(actor);
      actor.runtime.reset({ state: actor.state });
      actor.runtime.update({});
    }
    const record = (inputs) => {
      const encoded = Object.fromEntries(
        actors.map((actor, index) => [
          actor.specification.id,
          recordActor(actor, inputs[index]),
        ]),
      );
      frames.push({
        time,
        ...encoded,
        combat: combatFrame(combat),
        events: stepEvents,
      });
      stepEvents = [];
    };
    record(
      actors.map(() => ({ throttle: 1, steer: 0, brake: 0, boost: false })),
    );
    const ticks = Math.round(duration / COMPLETION_RUN_STEP);
    onProgress?.(0.12);
    let yieldedAt = performance.now();
    const advanceTick = (tick) => {
      signal?.throwIfAborted();
      const nearby = actors.map((actor) => actor.state);
      const inputs = actors.map((actor) =>
        actor.race.runoutControl(
          actor.state,
          getRacerControl(actor.state, track, {
            lane: actor.specification.lane,
            pace: actor.specification.pace,
            difficulty: actor.specification.difficulty,
            devices,
            nearby,
            runtime: actor.runtime,
          }),
        ),
      );
      time = (tick + 1) * COMPLETION_RUN_STEP;
      const previousDistances = actors.map((actor) => actor.state.distance);
      actors.forEach((actor, index) =>
        actor.runtime.beginAdvance(
          actor.state,
          inputs[index],
          COMPLETION_RUN_STEP,
        ),
      );
      dynamics.step(COMPLETION_RUN_STEP);
      actors.forEach((actor, index) => {
        const physics = actor.runtime.finishAdvance(actor.state);
        const raceEvents = actor.race.step(
          previousDistances[index],
          actor.state.distance,
          COMPLETION_RUN_STEP,
          physics,
          { grounded: actor.runtime.pose(1)?.grounded !== false },
        );
        for (const event of raceEvents) {
          const recorded = {
            ...copy(event),
            actor: actor.specification.id,
            time:
              event.type === 'sprint-complete' ? event.payload.duration : time,
            tag: eventTag(event),
          };
          events.push(recorded);
          stepEvents.push(recorded);
        }
      });
      actors[0].runtime.advanceInteractions(COMPLETION_RUN_STEP);
      actors.forEach((actor) => actor.runtime.update({}));
      record(inputs);
    };
    for (let tick = 0; tick < ticks; tick++) {
      advanceTick(tick);
      if (performance.now() - yieldedAt >= 10 || (tick + 1) % 24 === 0) {
        onProgress?.(0.12 + 0.88 * ((tick + 1) / ticks));
        await waitForPaint();
        yieldedAt = performance.now();
      }
    }
    signal?.throwIfAborted();
    events.sort((a, b) => a.time - b.time);
    const heroEvent = (type) =>
      events.find((event) => event.actor === 'hero' && event.type === type);
    const finishTimes = Object.fromEntries(
      actors.map((actor) => [
        actor.specification.id,
        events.find(
          (event) =>
            event.actor === actor.specification.id &&
            event.type === 'sprint-complete',
        )?.time ?? null,
      ]),
    );
    const finishOrder = Object.keys(finishTimes)
      .filter((id) => finishTimes[id] !== null)
      .sort((a, b) => finishTimes[a] - finishTimes[b]);
    for (const event of events)
      if (event.type === 'sprint-complete')
        event.place = finishOrder.indexOf(event.actor) + 1;
    const drift = choreographFinish(frames, track, finishTimes.hero);
    return {
      version: COMPLETION_CAPTURE.version,
      metadata: {
        course: 'shatterline',
        raceMotion: 'native',
        finishMotion: 'choreographed-drift',
        trackId: track.id,
        geometryVersion: track.geometryVersion,
        hullsId: COLLISION_HULLS_ID,
        trackLength: track.length,
      },
      identity: `completion-shatterline-v${COMPLETION_CAPTURE.version}:${track.geometryVersion}:${shipId}`,
      step: COMPLETION_RUN_STEP,
      duration,
      actors: ACTORS.map((actor) => ({
        id: actor.id,
        combatId: actor.combatId,
        shipId: actor.shipId ?? shipId,
      })),
      landmarks: {
        startDistance,
        weaponDistance: weapon.distance,
        vectorDistance: devices.find(
          (item) => item.id === 'horizon-transfer-vector',
        ).distance,
        jumpId: jump.id,
        takeoffDistance: jump.takeoff,
        landingDistance: jump.landingStart,
        finishDistance: track.finishDistance,
        finishTime: finishTimes.hero,
        finishTimes,
        slideStartTime: drift.start,
        slidePeakTime: drift.peak,
        slideEndTime: drift.stop,
        slideStopTime: drift.stop,
        gateTime:
          events.find(
            (event) =>
              event.actor === 'hero' &&
              event.type === 'pickup-activate' &&
              event.payload.kind === 'repulsor',
          )?.time ?? null,
        firstFireTime: heroEvent('combat-fire')?.time ?? null,
        firstHitTime: heroEvent('combat-confirm')?.time ?? null,
        launchTime: heroEvent('jump-launch')?.time ?? null,
        landingTime: heroEvent('jump-transfer')?.time ?? null,
      },
      outcome: {
        winner: finishOrder[0] ?? null,
        heroPosition: finishOrder.indexOf('hero') + 1 || null,
        finishOrder,
      },
      devices: copy(visibleDevices),
      frames,
      events,
    };
  } finally {
    actors.forEach((actor) => actor.runtime?.dispose());
    dynamics?.dispose();
    collisionWorld?.dispose();
  }
}
