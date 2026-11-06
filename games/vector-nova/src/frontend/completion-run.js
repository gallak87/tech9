import * as T from 'three';
import { COMPLETION_DURATION } from './completion-timeline.js';
import createNacreLevel from '../levels/nacre/index.js';
import { createRapierWorld } from '../physics/rapier-world.js';
import { withMagneticBoundaries } from '../physics/magnetic-boundaries.js';
import { createVehicleState, STEERING_ASSIST } from '../physics/index.js';
import { createDeviceRuntime } from '../pickups/runtime.js';
import { createCombatSimulation } from '../pickups/combat.js';
import { getRacerControl } from '../race/racers.js';
import {
  createLeviathanPath,
  createLeviathanClock,
} from '../levels/nacre/environment/leviathan/path.js';

export const COMPLETION_RUN_STEP = 1 / 120;
export const COMPLETION_RUN_DURATION = COMPLETION_DURATION;
const HERO_SHIPS = new Set(['kestrel', 'shrike', 'bastion', 'needle']);
const ACTORS = Object.freeze([
  {
    id: 'hero',
    combatId: 'player',
    distance: 250,
    lateral: -6,
    speed: 112,
    lane: -6,
  },
  {
    id: 'rook',
    combatId: 'rook',
    shipId: 'kestrel',
    distance: 310,
    lateral: -5,
    speed: 112,
    lane: -4,
  },
  {
    id: 'manta',
    combatId: 'manta',
    shipId: 'bastion',
    distance: 350,
    lateral: 5,
    speed: 106,
    lane: 4,
  },
]);
const waitForPaint = () => new Promise((resolve) => setTimeout(resolve, 0));
const copy = (value) => structuredClone(value);
const eventTag = (event) => {
  if (event.payload?.kind === 'arc') {
    if (event.type === 'combat-fire') return 'arc-fire';
    if (event.type === 'combat-hit' || event.type === 'combat-confirm')
      return 'arc-hit';
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

// A small genuine race is recorded while the finale loads. Only the supported
// rolling grid is seeded; every later pose, velocity, hit and landing is produced
// by ordinary driver inputs, the production devices and the shared native solve.
// The returned data owns no native resources and plays at one real second/second.
export async function generateCompletionRun({
  track,
  shipId,
  signal,
  onProgress,
} = {}) {
  if (!HERO_SHIPS.has(shipId)) throw new Error('Unknown completion chassis.');
  signal?.throwIfAborted();
  const level = createNacreLevel({ shape: false });
  track ??= level.createTrack();
  const collisionWorld = level.createCollisionWorld({ track });
  let dynamics;
  const actors = [];
  try {
    signal?.throwIfAborted();
    dynamics = await createRapierWorld({
      collisionWorld: withMagneticBoundaries(track, collisionWorld),
    });
    signal?.throwIfAborted();
    const devices = level.racing.createDevices(track);
    const combat = createCombatSimulation({ track, collisionWorld, dynamics });
    const leviathanPath = createLeviathanPath(track);
    const leviathan = createLeviathanClock(track, leviathanPath);
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
          distance: specification.distance,
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
              used: { ...effects.used },
            };
          },
          dispose() {},
        },
      });
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
      const hero = actors[0].state;
      leviathan.updateVehicle({ ...hero, mode: 'racing' });
      frames.push({
        time,
        ...Object.fromEntries(
          actors.map((actor, index) => [
            actor.specification.id,
            recordActor(actor, inputs[index]),
          ]),
        ),
        combat: combatFrame(combat),
        leviathan: leviathan.getState(),
        events: stepEvents,
      });
      stepEvents = [];
    };
    record(
      actors.map(() => ({ throttle: 1, steer: 0, brake: 0, boost: false })),
    );
    const ticks = Math.round(COMPLETION_RUN_DURATION / COMPLETION_RUN_STEP);
    for (let tick = 0; tick < ticks; tick++) {
      signal?.throwIfAborted();
      const nearby = actors.map((actor) => actor.state);
      const inputs = actors.map((actor) =>
        getRacerControl(actor.state, track, {
          lane: actor.specification.lane,
          pace: 1,
          difficulty: 'hard',
          devices,
          nearby,
          runtime: actor.runtime,
        }),
      );
      time = (tick + 1) * COMPLETION_RUN_STEP;
      actors.forEach((actor, index) =>
        actor.runtime.beginAdvance(
          actor.state,
          inputs[index],
          COMPLETION_RUN_STEP,
        ),
      );
      dynamics.step(COMPLETION_RUN_STEP);
      actors.forEach((actor) => actor.runtime.finishAdvance(actor.state));
      actors[0].runtime.advanceInteractions(COMPLETION_RUN_STEP);
      actors.forEach((actor) => actor.runtime.update({}));
      record(inputs);
      if ((tick + 1) % 24 === 0) {
        onProgress?.((tick + 1) / ticks);
        await waitForPaint();
      }
    }
    signal?.throwIfAborted();
    return {
      version: 1,
      identity: `completion-nacre-native-v1:${track.geometryVersion}:${shipId}`,
      step: COMPLETION_RUN_STEP,
      duration: COMPLETION_RUN_DURATION,
      actors: ACTORS.map((actor) => ({
        id: actor.id,
        combatId: actor.combatId,
        shipId: actor.shipId ?? shipId,
      })),
      landmarks: {
        startDistance: ACTORS[0].distance,
        weaponDistance: devices.find((device) => device.id === 'breaker-arc')
          .distance,
        vectorDistance: devices.find((device) => device.id === 'breaker-vector')
          .distance,
        takeoffDistance: track.jumps[0].takeoff,
        landingDistance: track.jumps[0].landingStart,
        wormPeakTime:
          frames.find(
            (frame) =>
              frame.leviathan.active &&
              frame.leviathan.age >= leviathanPath.heroAge,
          )?.time ?? null,
        wormCrownTime:
          frames.find(
            (frame) =>
              frame.leviathan.active &&
              frame.leviathan.age >= leviathanPath.crownAge,
          )?.time ?? null,
        gateTime:
          events.find(
            (event) =>
              event.actor === 'hero' &&
              event.type === 'pickup-activate' &&
              event.payload.kind === 'arc',
          )?.time ?? null,
        firstFireTime:
          events.find(
            (event) => event.actor === 'hero' && event.tag === 'arc-fire',
          )?.time ?? null,
        firstHitTime:
          events.find(
            (event) => event.actor === 'hero' && event.tag === 'arc-hit',
          )?.time ?? null,
        launchTime:
          events.find(
            (event) => event.actor === 'hero' && event.type === 'jump-launch',
          )?.time ?? null,
        landingTime:
          events.find(
            (event) => event.actor === 'hero' && event.type === 'jump-transfer',
          )?.time ?? null,
      },
      devices: copy(devices),
      frames,
      events,
    };
  } finally {
    actors.forEach((actor) => actor.runtime?.dispose());
    dynamics?.dispose();
    collisionWorld.dispose();
  }
}

// Interpolation only observes two recorded physical endpoint poses. Gameplay
// booleans, flight mode and effects retain their current recorded 120 Hz tick.
export function sampleCompletionRun(run, time) {
  const at = T.MathUtils.clamp(
    Number.isFinite(time) ? time : 0,
    0,
    run.duration,
  );
  let index = Math.min(run.frames.length - 1, Math.floor(at / run.step));
  // Division can round an exact stored tick just below its integer index.
  // Compare recorded timestamps so discrete events/modes never lag a tick.
  while (index > 0 && run.frames[index].time > at) index--;
  while (index < run.frames.length - 1 && run.frames[index + 1].time <= at)
    index++;
  const before = run.frames[index],
    after = run.frames[Math.min(index + 1, run.frames.length - 1)];
  const fraction = T.MathUtils.clamp((at - before.time) / run.step, 0, 1);
  const sample = {
    time: at,
    duration: run.duration,
    combat: before.combat,
    leviathan: before.leviathan,
    events: before.events,
    eventsThroughTime: run.events.filter((event) => event.time <= at),
  };
  for (const { id } of run.actors) {
    const a = before[id],
      b = after[id];
    sample[id] = {
      ...a,
      position: new T.Vector3()
        .fromArray(a.position)
        .lerp(new T.Vector3().fromArray(b.position), fraction)
        .toArray(),
      quaternion: new T.Quaternion()
        .fromArray(a.quaternion)
        .slerp(new T.Quaternion().fromArray(b.quaternion), fraction)
        .toArray(),
      state: { ...a.state },
      distance: a.state.distance,
      lateral: a.state.lateral,
      speed: a.state.speed,
      heading: a.state.heading,
      steer: a.state.steer,
      boost: a.state.boosting,
      energy: a.state.energy,
    };
  }
  return sample;
}
