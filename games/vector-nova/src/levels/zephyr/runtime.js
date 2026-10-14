import { wetnessAt } from './environment/atmosphere.js';
import { createFlightModel } from '../../physics/flight.js';
const model = createFlightModel({ gravity: 26 });
export function createZephyrRuntime(context) {
  const { track } = context;
  const runtime = model.createRuntime(context, {
    testLaunch: Boolean(context.playtest),
    forgivingContacts: Boolean(context.collisionWorld),
    id: 'zephyr-flight',
    version: 3,
    rulesId: `zephyr-flight-v3:${JSON.stringify({ geometry: track.geometryVersion, rules: model.rules, jumps: track.jumps, tower: 'fall-v7-long-arc', wet: 'physical-curtain-trail-v2' })}`,
    edgeSource: 'zephyr-receiving-shelf',
  });
  const trigger = track.sections.find((s) => s.id === 'falls').start - 60;
  const presentation = {
    towerStart: null,
    wetStart: null,
    exposure: 0,
    lastLap: 0,
  };
  if (context.presentation !== false) track.zephyrPresentation = presentation;
  let staged = null;
  function finishLocal(state, events, previousDistance) {
    for (const curtain of track.curtains ?? []) {
      const at =
        Math.floor(previousDistance / track.length) * track.length + curtain.s;
      if (
        previousDistance < at &&
        state.distance >= at &&
        state.distance - previousDistance < 60
      )
        presentation.wetStart = state.time;
    }
    presentation.exposure =
      runtime.snapshot().mode === 'magnetic'
        ? wetnessAt(track, state.distance)
        : 0;
    if (presentation.exposure > 0.02) presentation.wetStart = state.time;
    const lap = Math.floor(state.distance / track.length);
    if (lap !== presentation.lastLap) {
      presentation.towerStart = null;
      presentation.lastLap = lap;
    }
    const s = ((state.distance % track.length) + track.length) % track.length;
    if (presentation.towerStart === null && s >= trigger && s < trigger + 1100)
      presentation.towerStart = state.time;
    return events;
  }
  return {
    ...runtime,
    advance(state, input, dt, modifiers) {
      const previousDistance = state.distance;
      return finishLocal(
        state,
        runtime.advance(state, input, dt, modifiers),
        previousDistance,
      );
    },
    ...(runtime.beginAdvance
      ? {
          beginAdvance(state, input, dt, modifiers) {
            if (staged) throw new Error('Finish the pending Zephyr step first');
            staged = { distance: state.distance };
            runtime.beginAdvance(state, input, dt, modifiers);
          },
          finishAdvance(state) {
            if (!staged)
              throw new Error('Stage the Zephyr step before resolving it');
            const before = staged;
            const events = runtime.finishAdvance(state);
            staged = null;
            return finishLocal(state, events, before.distance);
          },
        }
      : {}),
    reset(options) {
      staged = null;
      runtime.reset(options);
      presentation.towerStart = null;
      presentation.wetStart = null;
      presentation.exposure = 0;
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
        !Number.isFinite(data.zephyr.exposure) ||
        data.zephyr.exposure < 0 ||
        data.zephyr.exposure > 1 ||
        !Number.isFinite(data.zephyr.lastLap)
      )
        throw new Error('Invalid Zephyr spectacle state');
      runtime.restore(data);
      staged = null;
      Object.assign(presentation, data.zephyr);
    },
    dispose() {
      staged = null;
      runtime.dispose();
    },
  };
}
