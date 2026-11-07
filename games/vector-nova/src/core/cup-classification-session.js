import { discoverLevels } from '../levels/catalog.js';
import { validateCollisionWorld, validateTrack } from '../levels/contract.js';
import { withMagneticBoundaries } from '../physics/magnetic-boundaries.js';
import { createRapierWorld } from '../physics/rapier-world.js';
import { createVehicleState } from '../physics/index.js';
import { createCombatSimulation } from '../pickups/combat.js';
import { createDeviceRuntime } from '../pickups/runtime.js';
import { createRacers } from '../race/racers.js';
import { createRace } from '../race/index.js';
import { CUP_FINISH_GRACE } from '../race/cup.js';
import { advanceSession, createMagneticRuntime } from './session-runtime.js';

const STEP = 1 / 120;
const BRAKE = Object.freeze({
  throttle: 0,
  brake: 1,
  airbrake: false,
  boost: false,
  steer: 0,
});
const clone = (value) => structuredClone(value);
const yieldTask = () => new Promise((resolve) => setTimeout(resolve, 0));
const noEvents = () => {};

// The worker owns this selected circuit's CPU simulation. No renderer, road,
// environment, model, audio or decorative presentation factory is constructed.
export async function createCupClassificationSession({
  levelId,
  settings = {},
  loadLevel = (id) => discoverLevels().load(id),
  now = () => performance.now(),
  yieldWork = yieldTask,
} = {}) {
  let track, collisionWorld, dynamics, motion, runtime, racers;
  let disposed = false;
  const rivalRuntimes = [];
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    if (racers) racers.dispose();
    else rivalRuntimes.forEach((rival) => rival.dispose());
    if (runtime) runtime.dispose();
    else motion?.dispose();
    dynamics?.dispose();
    collisionWorld?.dispose();
    track?.dispose?.();
  };
  try {
    const { definition, shape } = await loadLevel(levelId);
    if (shape || !definition.racing)
      throw new Error(
        'Cup classification requires a production racing circuit.',
      );
    track = validateTrack(await definition.createTrack());
    collisionWorld = definition.createCollisionWorld
      ? validateCollisionWorld(await definition.createCollisionWorld({ track }))
      : null;
    const physicalWorld = withMagneticBoundaries(track, collisionWorld);
    dynamics = definition.createDynamics
      ? await definition.createDynamics({
          track,
          collisionWorld: physicalWorld,
        })
      : await createRapierWorld({ collisionWorld: physicalWorld });
    // A level's player motion may own a simulation clock (Nomad). Keep the
    // normal player context; silence belongs to the device/presentation adapter.
    const context = {
      track,
      collisionWorld,
      dynamics,
      settings: clone(settings),
      equipment: true,
    };
    motion = await (definition.createRuntime ?? createMagneticRuntime)(context);
    const devices = definition.racing.createDevices(track);
    const combat = devices.some((device) =>
      ['repulsor', 'arc', 'ion'].includes(device.type),
    )
      ? createCombatSimulation({ track, collisionWorld, dynamics })
      : null;
    runtime = createDeviceRuntime({
      ...context,
      motion,
      devices,
      combat,
      identity: definition.racing.identity,
      scenarios: definition.racing.scenarios,
      presentation: null,
    });
    racers = createRacers({
      track,
      devices,
      dynamics,
      createRuntime: (specification) => {
        const rival = createDeviceRuntime({
          combat,
          combatId: specification.id,
          track,
          devices,
          identity: definition.racing.identity,
          motion: (definition.racing.createMotion ?? createMagneticRuntime)({
            track,
            collisionWorld,
            dynamics,
            settings: context.settings,
            presentation: false,
          }),
        });
        rivalRuntimes.push(rival);
        return rival;
      },
    });
    const state = createVehicleState();
    return {
      async resolve(checkpoint, { signal } = {}) {
        if (disposed)
          throw new Error('Cup classification session is disposed.');
        signal?.throwIfAborted();
        if (
          !checkpoint ||
          checkpoint.racers?.trackId !== track.id ||
          !checkpoint.racers.enabled
        )
          throw new Error('Cup classification checkpoint circuit mismatch.');
        if (checkpoint.settings !== undefined) {
          if (
            !checkpoint.settings ||
            typeof checkpoint.settings !== 'object' ||
            Array.isArray(checkpoint.settings)
          )
            throw new Error('Cup classification settings must be an object.');
          for (const key of Object.keys(context.settings))
            delete context.settings[key];
          Object.assign(context.settings, clone(checkpoint.settings));
        }
        const gridOrder = Object.entries(checkpoint.racers.field.grid)
          .sort(
            ([, a], [, b]) => b.distance - a.distance || b.lateral - a.lateral,
          )
          .map(([id]) => id);
        for (const key of Object.keys(state)) delete state[key];
        Object.assign(state, clone(checkpoint.state));
        // Set each actor's actual chassis shape before restoring the shared
        // native world, whose snapshot validates actor IDs and hull identities.
        runtime.reset({ reason: 'restart', state });
        racers.reset({
          enabled: true,
          difficulty: checkpoint.racers.difficulty,
          gridOrder,
        });
        const race = createRace(track, {
          rulesId: checkpoint.race.rulesId,
          laps: Infinity,
        });
        Object.assign(race, clone(checkpoint.race));
        runtime.restore(checkpoint.runtime, { presentation: false });
        racers.restore(checkpoint.racers, {
          trusted: true,
          presentation: false,
        });
        dynamics.restore(checkpoint.dynamics);
        const snapshot = () =>
          racers.snapshot({
            playerState: state,
            playerRace: race,
            playerPose: runtime.pose(1),
          });
        if (!snapshot().results)
          throw new Error('Cup classification needs the player finish.');
        let untilYield = now() + 12;
        for (let tick = 0; tick < Math.round(CUP_FINISH_GRACE / STEP); tick++) {
          signal?.throwIfAborted();
          if (racers.opponents.every((opponent) => opponent.finish)) break;
          advanceSession({
            state,
            input: BRAKE,
            dt: STEP,
            runtime,
            race,
            dynamics,
            racers,
            emit: noEvents,
            presentation: false,
          });
          if (now() >= untilYield) {
            await yieldWork();
            untilYield = now() + 12;
          }
        }
        signal?.throwIfAborted();
        return clone(snapshot().results);
      },
      dispose,
    };
  } catch (error) {
    dispose();
    throw error;
  }
}
