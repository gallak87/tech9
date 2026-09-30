import { createFlightModel } from '../../physics/flight.js';
const model = createFlightModel({ gravity: 26 });
export function createZephyrRuntime(context) {
  const { track } = context;
  const runtime = model.createRuntime(context, {
    id: 'zephyr-flight',
    version: 2,
    rulesId: `zephyr-flight-v2:${JSON.stringify({ geometry: track.geometryVersion, rules: model.rules, jumps: track.jumps, tower: 'fall-v1', wet: 'curtain-trail-v1' })}`,
    edgeSource: 'zephyr-receiving-shelf',
  });
  const trigger = track.sections.find((s) => s.id === 'falls').start;
  const presentation = (track.zephyrPresentation = {
    towerStart: null,
    wetStart: null,
    lastLap: 0,
  });
  return {
    ...runtime,
    advance(state, input, dt) {
      const previousDistance = state.distance;
      const events = runtime.advance(state, input, dt);
      for (const curtain of track.curtains ?? []) {
        const at =
          Math.floor(previousDistance / track.length) * track.length +
          curtain.s;
        if (
          previousDistance < at &&
          state.distance >= at &&
          state.distance - previousDistance < 60
        )
          presentation.wetStart = state.time;
      }
      const lap = Math.floor(state.distance / track.length);
      if (lap !== presentation.lastLap) {
        presentation.towerStart = null;
        presentation.lastLap = lap;
      }
      const s = ((state.distance % track.length) + track.length) % track.length;
      if (
        presentation.towerStart === null &&
        s >= trigger &&
        s < trigger + 1100
      )
        presentation.towerStart = state.time;
      return events;
    },
    reset(options) {
      runtime.reset(options);
      presentation.towerStart = null;
      presentation.wetStart = null;
      presentation.lastLap = 0;
    },
    snapshot() {
      return { ...runtime.snapshot(), zephyr: { ...presentation } };
    },
    restore(data) {
      if (
        !data?.zephyr ||
        !(
          data.zephyr.towerStart === null ||
          Number.isFinite(data.zephyr.towerStart)
        ) ||
        !(
          data.zephyr.wetStart === null || Number.isFinite(data.zephyr.wetStart)
        ) ||
        !Number.isFinite(data.zephyr.lastLap)
      )
        throw new Error('Invalid Zephyr spectacle state');
      runtime.restore(data);
      Object.assign(presentation, data.zephyr);
    },
  };
}
