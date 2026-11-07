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
export const COMPLETION_SLIDE = Object.freeze({
  delay: 0.15,
  steer: -0.3,
  turn: 0.28,
  counter: 0.28,
  brake: 0.12,
});
function slideControl(actor, ordinary, pattern) {
  if (actor.specification.id !== 'hero' || !actor.race.complete || !pattern)
    return ordinary;
  const age = actor.state.time - actor.race.elapsed - pattern.delay;
  if (age < 0 || age >= pattern.turn + pattern.counter) return ordinary;
  return {
    throttle: 0,
    brake: pattern.brake,
    airbrake: true,
    boost: false,
    steer:
      age < pattern.turn
        ? pattern.steer
        : (-pattern.steer * pattern.turn) / pattern.counter,
  };
}
function slideTelemetry(actor, input, track, pattern) {
  if (!pattern || actor.specification.id !== 'hero' || !actor.race.complete)
    return null;
  const age = actor.state.time - actor.race.elapsed - pattern.delay;
  if (age < 0) return null;
  const body = actor.physical.read(),
    frame = track.sample(actor.state.distance);
  const forward = new T.Vector3(0, 0, 1).applyQuaternion(body.quaternion);
  forward.addScaledVector(frame.up, -forward.dot(frame.up)).normalize();
  const side = frame.up.clone().cross(forward).normalize();
  const slipSpeed = body.velocity.dot(side),
    speed = body.velocity.dot(forward);
  const slipAngle = Math.atan2(slipSpeed, Math.max(1, Math.abs(speed)));
  let clearance = Infinity;
  const vertex = new T.Vector3();
  const vertices = getCollisionHull(actor.state.chassisId).vertices;
  for (let i = 0; i < vertices.length; i += 3) {
    vertex
      .fromArray(vertices, i)
      .applyQuaternion(body.quaternion)
      .add(body.position)
      .sub(frame.position);
    clearance = Math.min(
      clearance,
      track.width / 2 - Math.abs(vertex.dot(frame.right)),
    );
  }
  const commanded = input.airbrake === true;
  const active =
    commanded ||
    (age < pattern.turn + pattern.counter + 1 &&
      (Math.abs(slipSpeed) > 0.25 || Math.abs(actor.state.heading) > 0.025));
  return { active, slipAngle, slipSpeed, yaw: actor.state.heading, clearance };
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
// rolling grid is seeded; every later pose, velocity, hit and landing is produced
// by ordinary driver inputs, the production devices and the shared native solve.
// The final shipped data owns no native resources and plays at one real second/second.
export async function generateCompletionRun({
  track,
  shipId,
  signal,
  onProgress,
  slidePattern = COMPLETION_SLIDE,
  onFinishProbe,
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
      let physical;
      const actorDynamics = Object.create(dynamics);
      Object.defineProperty(actorDynamics, 'createActor', {
        value: (...args) => {
          physical = dynamics.createActor(...args);
          return physical;
        },
      });
      const motion = level.createRuntime({
        track,
        collisionWorld,
        dynamics: actorDynamics,
        settings: { steeringAssist: STEERING_ASSIST },
      });
      const actor = {
        specification,
        motion,
        physical,
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
    const record = (inputs, pattern) => {
      const telemetry = slideTelemetry(actors[0], inputs[0], track, pattern);
      const encoded = Object.fromEntries(
        actors.map((actor, index) => [
          actor.specification.id,
          recordActor(actor, inputs[index]),
        ]),
      );
      if (telemetry) encoded.hero.effects.slide = telemetry;
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
    const ticks = Math.round(COMPLETION_RUN_DURATION / COMPLETION_RUN_STEP);
    onProgress?.(0.12);
    let yieldedAt = performance.now();
    const advanceTick = (tick, pattern) => {
      signal?.throwIfAborted();
      const nearby = actors.map((actor) => actor.state);
      const inputs = actors.map((actor) =>
        slideControl(
          actor,
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
          pattern,
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
      record(inputs, pattern);
    };
    let probed = false;
    for (let tick = 0; tick < ticks; tick++) {
      advanceTick(tick, slidePattern);
      if (actors[0].race.complete && onFinishProbe && !probed) {
        probed = true;
        const raceKeys = [
          'completedTransfers',
          'lap',
          'checkpoint',
          'elapsed',
          'lastLap',
          'best',
          'valid',
          'complete',
          'startDistance',
          'history',
          'splits',
          'completedTime',
        ];
        const saved = {
          native: dynamics.snapshot(),
          time,
          frameLength: frames.length,
          eventLength: events.length,
          actors: actors.map((actor) => ({
            state: copy(actor.state),
            runtime: actor.runtime.snapshot(),
            effects: copy(actor.effects),
            race: Object.fromEntries(
              raceKeys.map((key) => [key, copy(actor.race[key])]),
            ),
          })),
        };
        const restore = () => {
          actors.forEach((actor, index) => {
            const state = saved.actors[index];
            Object.assign(actor.state, copy(state.state));
            actor.runtime.restore(copy(state.runtime));
            Object.assign(actor.race, copy(state.race));
            actor.effects = copy(state.effects);
          });
          dynamics.restore(copy(saved.native));
          time = saved.time;
          frames.length = saved.frameLength;
          events.length = saved.eventLength;
          stepEvents = [];
        };
        await onFinishProbe({
          track,
          probe(pattern) {
            restore();
            for (let next = tick + 1; next < ticks; next++)
              advanceTick(next, pattern);
            const result = copy({
              frames: frames.slice(saved.frameLength),
              events: events.slice(saved.eventLength),
            });
            restore();
            return result;
          },
        });
        restore();
      }
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
    const slideFrames = frames.filter(
      (frame) => frame.hero.effects.slide?.active,
    );
    const peakSlide = slideFrames.reduce(
      (peak, frame) =>
        !peak ||
        Math.abs(frame.hero.effects.slide.slipAngle) >
          Math.abs(peak.hero.effects.slide.slipAngle)
          ? frame
          : peak,
      null,
    );
    const slideStartTime = slideFrames[0]?.time ?? null;
    const slideEndTime = slideFrames.length
      ? (frames.find((frame) => frame.time > slideFrames.at(-1).time)?.time ??
        null)
      : null;
    return {
      version: COMPLETION_CAPTURE.version,
      metadata: {
        course: 'shatterline',
        trackId: track.id,
        geometryVersion: track.geometryVersion,
        hullsId: COLLISION_HULLS_ID,
        trackLength: track.length,
      },
      identity: `completion-shatterline-native-v${COMPLETION_CAPTURE.version}:${track.geometryVersion}:${shipId}`,
      step: COMPLETION_RUN_STEP,
      duration: COMPLETION_RUN_DURATION,
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
        slideStartTime,
        slidePeakTime: peakSlide?.time ?? null,
        slideEndTime,
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

// Compare post-finish input programs by restoring one real native checkpoint;
// no alternate world, scripted trajectory or overwritten velocity is involved.
export async function probeCompletionSlides({
  shipId = 'shrike',
  patterns,
  ...options
}) {
  let reports;
  await generateCompletionRun({
    ...options,
    shipId,
    slidePattern: null,
    onFinishProbe({ probe }) {
      reports = patterns.map((pattern) => {
        const { frames, events } = probe(pattern);
        const slide = frames.filter(
          (frame) => frame.hero.effects.slide?.active,
        );
        let nearest = Infinity;
        for (const frame of frames)
          for (const id of ['rook', 'manta'])
            nearest = Math.min(
              nearest,
              new T.Vector3()
                .fromArray(frame.hero.position)
                .distanceTo(new T.Vector3().fromArray(frame[id].position)),
            );
        return {
          pattern,
          start: slide[0]?.time,
          end: slide.at(-1)?.time,
          maxYaw: Math.max(
            ...slide.map((frame) => Math.abs(frame.hero.state.heading)),
          ),
          maxSlip: Math.max(
            ...slide.map((frame) =>
              Math.abs(frame.hero.effects.slide.slipAngle),
            ),
          ),
          maxSlipSpeed: Math.max(
            ...slide.map((frame) =>
              Math.abs(frame.hero.effects.slide.slipSpeed),
            ),
          ),
          minClearance: Math.min(
            ...frames.map(
              (frame) => frame.hero.effects.slide?.clearance ?? Infinity,
            ),
          ),
          nearest,
          final: frames.at(-1).hero.state,
          allGrounded: frames.every(
            (frame) => frame.hero.grounded && !frame.hero.recovering,
          ),
          contacts: events.filter((event) =>
            ['impact', 'road-departure', 'road-recovery'].includes(event.type),
          ),
        };
      });
    },
  });
  return reports;
}
