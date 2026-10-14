import { createFlightModel } from '../../physics/flight.js';
import { surfaceAt } from './surface.js';
import { FIRST_SHELF_RULES } from './environment/first-shelf.js';
import {
  CALVING_RULES,
  calvingSeparationDistance,
} from './environment/event.js';

export const GLASSWAKE_RULES = Object.freeze({ gravity: 26 });
const flightModel = createFlightModel(GLASSWAKE_RULES);
const runtimes = new WeakMap();
export const glasswakeFlightState = (track) =>
  runtimes.get(track)?.snapshot() ?? { mode: 'magnetic' };
export function createGlasswakeRuntime(context) {
  const { track } = context;
  const runtime = flightModel.createRuntime(context, {
    testLaunch: Boolean(context.playtest),
    forgivingContacts: Boolean(context.collisionWorld),
    id: 'glasswake-fracture-grip',
    version: 6,
    rulesId: `glasswake-v6:${JSON.stringify({ geometry: track.geometryVersion, jumps: track.jumps, frost: track.gripZones, rules: flightModel.rules, openingShelf: FIRST_SHELF_RULES, calving: CALVING_RULES })}`,
    scenarios: Object.fromEntries(
      Object.entries(track.scenarios).map(([name, state]) => [
        name,
        {
          state: { ...state },
          label:
            {
              'jump1-approach':
                'Fracture 1 · short setup · W + Shift from rest',
              'jump1-straight-setup': 'Fracture 1 · straight boost setup',
              'jump1-bend-approach':
                'Gallery bend approach · steer into launch',
              'jump2-approach': 'Fracture 2 · supported run-up · W + Shift',
              'frost-matched': 'Frost lane · brake and steer at 270 km/h',
              'crystal-matched': 'Clear lane · brake and steer at 270 km/h',
              'first-shelf-approach': 'Opening sheet · first collapse approach',
              'first-shelf-crack': 'Opening sheet · fracture',
              'first-shelf-fall': 'Opening sheet · falling ice and powder',
              'first-shelf-gone': 'Opening sheet · later-lap view',
              'calving-approach': 'Calving shelf · approach',
              'calving-cracks': 'Calving shelf · bright fractures',
              'calving-open': 'Calving shelf · cavern reveal',
              'calving-departure': 'Calving shelf · departure',
            }[name] ?? name.replaceAll('-', ' '),
        },
      ]),
    ),
    groundOptions: ({ state }) => ({
      surface: { grip: surfaceAt(track, state.distance, state.lateral).grip },
    }),
  });
  let openingShelf = null;
  let calvingSoundLap = -1;
  let staged = null;
  const calvingSoundAt = calvingSeparationDistance(track);
  const { advance, reset, snapshot, restore } = runtime;
  const owner = { ...runtime };
  function finishLocal(state, events, beforeDistance, beforeTime) {
    const elapsed = state.time - beforeTime;
    if (!(elapsed > 0)) return events;
    if (openingShelf !== null) {
      openingShelf = Math.min(
        FIRST_SHELF_RULES.duration,
        openingShelf + elapsed,
      );
    } else if (state.distance >= FIRST_SHELF_RULES.triggerDistance) {
      // A late section setup is already past the event. Only a real forward
      // crossing releases the sheet and emits its once-per-session sound.
      if (beforeDistance <= FIRST_SHELF_RULES.triggerDistance) {
        openingShelf = 0;
        events.push({
          type: 'glasswake-shelf',
          id: 'opening-sheet',
          payload: { distance: state.distance },
        });
      } else openingShelf = FIRST_SHELF_RULES.duration;
    }
    // The second shelf remains route-sampled, including during real flight.
    // Give each forward lap crossing one cue; seeking/recovery never farms it.
    const launched = events.some(
      (e) => e.type === 'jump-launch' && e.payload.id === track.jumps[1].id,
    );
    const lap = launched
      ? Math.max(
          0,
          Math.round((state.distance - calvingSoundAt) / track.length),
        )
      : Math.floor((state.distance - calvingSoundAt) / track.length);
    if (lap >= 0 && lap > calvingSoundLap) {
      if (launched)
        events.push({
          type: 'glasswake-shelf',
          id: `calving-shelf:${lap}`,
          payload: { distance: state.distance },
        });
      calvingSoundLap = lap;
    }
    return events;
  }
  owner.advance = (state, input, dt, modifiers) => {
    const beforeDistance = state.distance;
    const beforeTime = state.time;
    return finishLocal(
      state,
      advance(state, input, dt, modifiers),
      beforeDistance,
      beforeTime,
    );
  };
  if (runtime.beginAdvance) {
    owner.beginAdvance = (state, input, dt, modifiers) => {
      if (staged) throw new Error('Finish the pending Glasswake step first');
      staged = { distance: state.distance, time: state.time };
      runtime.beginAdvance(state, input, dt, modifiers);
    };
    owner.finishAdvance = (state) => {
      if (!staged)
        throw new Error('Stage the Glasswake step before resolving it');
      const before = staged;
      const events = runtime.finishAdvance(state);
      staged = null;
      return finishLocal(state, events, before.distance, before.time);
    };
  }
  owner.reset = (args = {}) => {
    staged = null;
    reset(args);
    if (args.reason === 'manual-recover') return;
    openingShelf = null;
    calvingSoundLap = -1;
    if (args.reason === 'scenario') {
      calvingSoundLap = Math.floor(
        ((args.state?.distance ?? 0) - calvingSoundAt) / track.length,
      );
      const phases = {
        'first-shelf-crack': 0.18,
        'first-shelf-fall': 1.65,
        'first-shelf-gone': FIRST_SHELF_RULES.duration,
      };
      openingShelf =
        phases[args.scenario] ??
        ((args.state?.distance ?? 0) > FIRST_SHELF_RULES.triggerDistance
          ? FIRST_SHELF_RULES.duration
          : null);
    }
  };
  owner.snapshot = () => ({ ...snapshot(), openingShelf, calvingSoundLap });
  owner.restore = (data) => {
    if (
      data?.openingShelf !== null &&
      (!Number.isFinite(data?.openingShelf) ||
        data.openingShelf < 0 ||
        data.openingShelf > FIRST_SHELF_RULES.duration)
    )
      throw new Error('Invalid Glasswake opening shelf state.');
    if (!Number.isInteger(data?.calvingSoundLap) || data.calvingSoundLap < -1)
      throw new Error('Invalid Glasswake calving sound ledger.');
    restore(data);
    staged = null;
    openingShelf = data.openingShelf;
    calvingSoundLap = data.calvingSoundLap;
  };
  if (context.presentation !== false) runtimes.set(track, owner);
  const dispose = runtime.dispose;
  owner.dispose = () => {
    staged = null;
    if (runtimes.get(track) === owner) runtimes.delete(track);
    dispose();
  };
  return owner;
}
