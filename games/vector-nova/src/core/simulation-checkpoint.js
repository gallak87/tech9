import { captureOwnedRace, restoreOwnedRace } from '../race/checkpoint.js';

// Owned physics only. Navigation, async owners and published ReplayInitial
// validation remain with their host and keep their separate lifetime/format.
export function captureSimulationCheckpoint({
  state,
  race,
  runtime,
  racers,
  dynamics,
  settings,
}) {
  return {
    ...(settings === undefined ? {} : { settings: structuredClone(settings) }),
    state: structuredClone(state),
    race: captureOwnedRace(race),
    runtime: runtime.snapshot(),
    racers: racers?.serialize(),
    dynamics: dynamics?.snapshot(),
  };
}

export function restoreSimulationCheckpoint(
  checkpoint,
  { state, race, runtime, racers, dynamics },
  { presentation = true } = {},
) {
  for (const key of Object.keys(state)) delete state[key];
  Object.assign(state, structuredClone(checkpoint.state));
  // Motion adapters may retain the actual state object (and chassis shape).
  // Establish those bindings before restoring their local simulation data.
  runtime.reset({ reason: 'restart', state, presentation: false });
  if (racers) {
    const gridOrder = Object.entries(checkpoint.racers.field.grid)
      .sort(([, a], [, b]) => b.distance - a.distance || b.lateral - a.lateral)
      .map(([id]) => id);
    racers.reset({
      enabled: checkpoint.racers.enabled,
      difficulty: checkpoint.racers.difficulty,
      fieldBuild: checkpoint.racers.field.rivalBuild ?? null,
      gridOrder,
      presentation: false,
    });
  }
  restoreOwnedRace(race, checkpoint.race);
  runtime.restore(checkpoint.runtime, { presentation, state });
  racers?.restore(checkpoint.racers, {
    trusted: true,
    presentation,
    bindState: true,
  });
  // Actor reset/restore may change native bodies. Their complete shared world
  // is the final authority, restored only after every actor has its real hull.
  dynamics?.restore(checkpoint.dynamics);
}
