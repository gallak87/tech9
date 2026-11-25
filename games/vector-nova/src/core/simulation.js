import { validateCollisionWorld, validateTrack } from '../levels/contract.js';
import { createCombatSimulation } from '../pickups/combat.js';
import { createDeviceRuntime } from '../pickups/runtime.js';
import { createMagneticRuntime } from './session-runtime.js';
import { createLifetime } from './lifecycle.js';

function releaseAfterFailure(lifetime, error) {
  try {
    lifetime.dispose();
  } catch (cleanupError) {
    if (error instanceof Error) error.cause ??= cleanupError;
  }
  throw error;
}

// The caller supplies the selected definition. No catalog, graphics or alternate
// world is loaded here. Supplied tracks remain borrowed, including capture tracks.
export async function createSimulationWorld(
  definition,
  { track: suppliedTrack, shape = false, signal, onStage, yieldWork } = {},
) {
  const lifetime = createLifetime();
  const adopt = (resource) => {
    if (typeof resource?.dispose === 'function') lifetime.own(resource);
    return resource;
  };
  const stage = async (name) => {
    signal?.throwIfAborted();
    await onStage?.(name);
    await yieldWork?.(name);
    signal?.throwIfAborted();
  };
  try {
    signal?.throwIfAborted();
    const track = suppliedTrack ?? adopt(await definition.createTrack());
    validateTrack(track);
    await stage('collision');
    const collisionWorld = definition.createCollisionWorld
      ? adopt(await definition.createCollisionWorld({ track }))
      : null;
    if (collisionWorld) validateCollisionWorld(collisionWorld);
    signal?.throwIfAborted();
    const racingEnabled = Boolean(definition.racing) && !shape;
    let dynamics = null;
    if (racingEnabled) {
      await stage('boundaries');
      const { withMagneticBoundaries } =
        await import('../physics/magnetic-boundaries.js');
      const physicalWorld = withMagneticBoundaries(track, collisionWorld);
      await stage('dynamics');
      const { createRapierWorld } = await import('../physics/rapier-world.js');
      dynamics = lifetime.own(
        definition.createDynamics
          ? await definition.createDynamics({
              track,
              collisionWorld: physicalWorld,
            })
          : await createRapierWorld({ collisionWorld: physicalWorld }),
      );
    } else if (definition.createDynamics) {
      await stage('dynamics');
      dynamics = lifetime.own(
        await definition.createDynamics({ track, collisionWorld }),
      );
    }
    // The live sweep index can build beside native collider setup. Join it
    // before starting actors, which may enter the fallback query immediately.
    await collisionWorld?.prepareSweepIndex?.(signal);
    signal?.throwIfAborted();
    return {
      definition,
      track,
      collisionWorld,
      dynamics,
      racingEnabled,
      dispose: () => lifetime.dispose(),
    };
  } catch (error) {
    return releaseAfterFailure(lifetime, error);
  }
}

// A wrapper owns its supplied motion on success and failure. The live wrapper
// supplies presentation; CPU actors use this equivalent, presentation-free path.
function wrapDeviceRuntime(context, { motion, devices, identity, scenarios }) {
  try {
    return createDeviceRuntime({
      ...context,
      motion,
      devices,
      identity,
      scenarios,
    });
  } catch (error) {
    motion.dispose();
    throw error;
  }
}

// Acquire this phase after live road/ship presentation, so actors are released
// before their borrowed scene resources and before the separately owned world.
export function createSimulationActors(
  world,
  { settings = {}, signal, forceCombat = false, combatOptions = {} } = {},
) {
  const { definition, track, collisionWorld, dynamics, racingEnabled } = world;
  const lifetime = createLifetime();
  let devices,
    combat,
    disposed = false;
  const alive = () => {
    if (disposed) throw new Error('Simulation actors are disposed.');
    signal?.throwIfAborted();
  };
  function dispose() {
    if (disposed) return;
    disposed = true;
    lifetime.dispose();
  }
  function fail(error) {
    disposed = true;
    return releaseAfterFailure(lifetime, error);
  }
  function ownRuntime(runtime) {
    if (disposed) {
      runtime.dispose();
      alive();
    }
    return lifetime.own(runtime);
  }
  function prepareRacing() {
    alive();
    if (devices) return { devices, combat };
    devices = racingEnabled ? definition.racing.createDevices(track) : [];
    combat =
      forceCombat ||
      devices.some((device) => ['repulsor', 'arc', 'ion'].includes(device.type))
        ? createCombatSimulation({
            track,
            collisionWorld,
            dynamics,
            ...combatOptions,
          })
        : null;
    return { devices, combat };
  }
  const contextFor = (context) => ({
    track,
    collisionWorld,
    dynamics,
    settings,
    ...context,
  });
  async function createPlayer(
    context = {},
    {
      wrap = wrapDeviceRuntime,
      motionFactory = definition.createRuntime ?? createMagneticRuntime,
    } = {},
  ) {
    alive();
    let motion,
      transferred = false;
    try {
      const runtimeContext = contextFor(context);
      motion = await motionFactory(runtimeContext);
      alive();
      prepareRacing();
      runtimeContext.combat = combat;
      // Live and worker players create motion before devices. The same context
      // object remains borrowed by that motion when combat is attached afterward.
      transferred = true;
      const runtime = racingEnabled
        ? await wrap(runtimeContext, { motion, devices, ...definition.racing })
        : motion;
      ownRuntime(runtime);
      alive();
      return { motion, runtime };
    } catch (error) {
      if (motion && !transferred) motion.dispose();
      return fail(error);
    }
  }
  async function createActor({
    context = {},
    combatId,
    presentation = null,
    motionFactory = definition.createRuntime ?? createMagneticRuntime,
  } = {}) {
    alive();
    let motion,
      transferred = false;
    try {
      motion = await motionFactory(contextFor(context));
      alive();
      prepareRacing();
      transferred = true;
      // Explicit actors keep their selected motion factory and context flags;
      // unlike normal field rivals, no role defaults or racing identity are added.
      const runtime = wrapDeviceRuntime(
        { track, combat, combatId, presentation },
        { motion, devices },
      );
      ownRuntime(runtime);
      return { motion, runtime };
    } catch (error) {
      if (motion && !transferred) motion.dispose();
      return fail(error);
    }
  }
  async function createField({
    continuous = false,
    field = null,
    createRuntime: createFieldRuntime,
  } = {}) {
    alive();
    if (!racingEnabled) return null;
    const partial = createLifetime();
    let fieldOwnsRuntimes = false;
    lifetime.defer(() => partial.dispose());
    try {
      prepareRacing();
      const { createRacers } = await import('../race/racers.js');
      alive();
      const racers = createRacers({
        track,
        continuous,
        field,
        devices,
        dynamics,
        createRuntime(specification, { validation = false } = {}) {
          const actorCombat =
            validation && combat
              ? createCombatSimulation({ track, collisionWorld, dynamics })
              : combat;
          const context = contextFor({
            presentation: false,
            ...(createFieldRuntime ? {} : { equipment: true }),
          });
          let runtime;
          if (createFieldRuntime)
            runtime = createFieldRuntime(specification, {
              context,
              combat: actorCombat,
              devices,
              validation,
            });
          else {
            const motion = (
              definition.racing.createMotion ?? createMagneticRuntime
            )(context);
            runtime = wrapDeviceRuntime(
              { track, combat: actorCombat, combatId: specification.id },
              { motion, devices, identity: definition.racing.identity },
            );
          }
          if (!validation)
            partial.defer(() => {
              if (!fieldOwnsRuntimes) runtime.dispose();
            });
          return runtime;
        },
      });
      lifetime.own(racers);
      fieldOwnsRuntimes = true;
      return racers;
    } catch (error) {
      return fail(error);
    }
  }
  return { prepareRacing, createPlayer, createActor, createField, dispose };
}
