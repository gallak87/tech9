import { createFlightModel } from '../physics/flight.js';
import { createVehicleState } from '../physics/index.js';
import { createMagneticRuntime } from '../core/session-runtime.js';
import { getShip } from '../ships/catalog.js';

export const EDITOR_JUMP_SPEEDS = Object.freeze({
  cruise: getShip('kestrel').handling.cruiseSpeed,
  boost: getShip('kestrel').handling.boostSpeed,
});
export const EDITOR_FLIGHT_RULES = Object.freeze({
  gravity: 26,
  timeout: 30,
  missBelow: 300,
  missBeyond: 200,
  missLateral: 180,
  airAcceleration: 4,
  airYaw: 0.16,
  pitchTolerance: 1.05,
});
const model = createFlightModel(EDITOR_FLIGHT_RULES);
const SUPPORT_HEIGHT = 0.04;
const predictionCache = new WeakMap();

/** Normalized entries refer to the entire authored curve, including a downhill
 * finish runout. Gaps are unrestricted in length; the receiver must fit on road. */
export function compileEditorJumps(doc, track) {
  const source = doc.jumps ?? [];
  if (!Array.isArray(source)) throw new Error('Invalid jump spans.');
  const ids = new Set();
  const jumps = source
    .map((span, index) => {
      if (
        !span ||
        typeof span.id !== 'string' ||
        !/^[a-z][a-z0-9-]{0,79}$/.test(span.id) ||
        ids.has(span.id) ||
        !Number.isFinite(span.start) ||
        !Number.isFinite(span.end) ||
        span.start < 0 ||
        span.end > 1 ||
        span.end <= span.start ||
        !Number.isFinite(span.receiving) ||
        span.receiving < 150 ||
        span.receiving > 1200
      )
        throw new Error(
          'Choose a valid takeoff, landing point and receiving road.',
        );
      ids.add(span.id);
      return {
        id: span.id,
        label: `Jump ${index + 1}`,
        takeoff: span.start * track.length,
        landingStart: span.end * track.length,
        landingEnd: span.end * track.length + span.receiving,
        recovery: span.end * track.length + span.receiving,
        halfWidth: track.width / 2,
      };
    })
    .sort((a, b) => a.takeoff - b.takeoff);
  let previousEnd = -1;
  const finish = track.finishDistance ?? track.length;
  for (const jump of jumps) {
    if (jump.takeoff <= previousEnd)
      throw new Error('Jump spans and receiving roads must not overlap.');
    if (jump.landingEnd >= finish)
      throw new Error('Leave the full receiving road before the finish.');
    previousEnd = jump.recovery;
  }
  return jumps;
}

function runtimeOptions(track, extra = {}) {
  return {
    id: 'editor-ballistic-flight',
    version: 1,
    rulesId: `editor-flight-v1:${JSON.stringify({ geometry: track.geometryVersion ?? track.id, courseType: track.closed === false ? 'downhill' : 'circuit', jumps: track.jumps, rules: model.rules })}`,
    forgivingContacts: true,
    supportHeight: SUPPORT_HEIGHT,
    surfaceLanding: true,
    groundOptions: () => ({ supportHeight: SUPPORT_HEIGHT }),
    ...extra,
  };
}

/** Ordinary magnetic handling remains unchanged for designs with no gaps. Real
 * jumps release at the visible lip and use the shared ballistic/contact engine. */
export function createEditorFlightRuntime(context) {
  if (!context.track.jumps?.length) return createMagneticRuntime(context);
  if (
    context.dynamics?.gravity !== undefined &&
    context.dynamics.gravity !== model.rules.gravity
  )
    throw new Error(
      'Editor jump physics and world gravity must both use 26 m/s².',
    );
  return model.createRuntime(
    context,
    runtimeOptions(context.track, {
      automaticRecovery: context.playtest?.automaticRecovery !== false,
      testLaunch: Boolean(context.playtest),
    }),
  );
}

function jumpWarnings(track, jump) {
  const warnings = [];
  const launch = track.sample(jump.takeoff),
    arrival = track.sample(jump.landingStart);
  if (jump.landingStart - jump.takeoff > 500)
    warnings.push(
      'Large gap: check the approach speed and receiving road in Test Drive.',
    );
  if (launch.tangent.y < 0.03)
    warnings.push(
      'The launch is flat or points down. A rising ramp gives a longer arc.',
    );
  if (launch.tangent.dot(arrival.tangent) < Math.cos(0.35))
    warnings.push('The receiver turns away from the launch direction.');
  if (launch.up.y < 0.7 || arrival.up.y < 0.7)
    warnings.push('A rotated launch or receiver needs careful alignment.');
  return warnings;
}

/** A deterministic advisory run of the same shared flight engine. This has no
 * scene, scenery collision, steering, pickups, career storage or hidden impulse.
 * Boost follows ordinary stock reserve/thrust rules; Test Drive adds real walls. */
export function predictEditorJumpTrajectory(
  track,
  jump,
  {
    speed = EDITOR_JUMP_SPEEDS.cruise,
    boost = false,
    shipId = 'kestrel',
    energy = 100,
  } = {},
) {
  if (
    !Number.isFinite(speed) ||
    speed <= 0 ||
    typeof boost !== 'boolean' ||
    !Number.isFinite(energy) ||
    energy < 0 ||
    energy > 100
  )
    throw new Error(
      'Choose a positive preview speed and reserve between zero and 100.',
    );
  if (!track.jumps?.includes(jump))
    throw new Error('Choose a jump from this track.');
  const key = JSON.stringify([jump, speed, boost, shipId, energy]);
  let cache = predictionCache.get(track);
  if (!cache) predictionCache.set(track, (cache = new Map()));
  if (cache.has(key)) return structuredClone(cache.get(key));
  const runtime = model.createRuntime(
    { track },
    runtimeOptions(track, {
      testLaunch: true,
      automaticRecovery: false,
    }),
  );
  const state = {
    ...createVehicleState(shipId),
    distance: jump.takeoff,
    speed,
    energy,
  };
  const frame =
    track.sampleSurface?.(jump.takeoff, 0) ?? track.sample(jump.takeoff);
  const position = frame.position
    .clone()
    .addScaledVector(frame.up, model.rules.hover + SUPPORT_HEIGHT);
  const samples = [{ time: 0, position: position.toArray() }];
  let status = 'timeout',
    landing = null;
  const dt = model.rules.step;
  let elapsed = 0;
  try {
    runtime.launch(state, {
      jump: jump.id,
      position: position.toArray(),
      velocity: frame.tangent.clone().multiplyScalar(speed).toArray(),
      quaternion: frame.quaternion.toArray(),
    });
    const limit = Math.ceil(model.rules.timeout / dt) + 1;
    for (let tick = 0; tick < limit; tick++) {
      const events = runtime.advance(
        state,
        { throttle: 1, brake: 0, steer: 0, boost, airbrake: false },
        dt,
      );
      elapsed = state.time;
      const transfer = events.find(
        (event) =>
          event.type === 'jump-transfer' && event.payload.outcome === 'landed',
      );
      const missed = events.find((event) => event.type === 'jump-miss');
      const pose = runtime.pose(1);
      if (tick % 4 === 3 || transfer || missed)
        samples.push({ time: elapsed, position: pose.position.toArray() });
      if (transfer) {
        status = 'landed';
        landing = {
          distance: transfer.payload.to,
          lateral: state.lateral,
          time: elapsed,
          position: pose.position.toArray(),
        };
        break;
      }
      if (missed) {
        status = missed.payload.reason;
        break;
      }
    }
  } finally {
    runtime.dispose();
  }
  const warnings = jumpWarnings(track, jump);
  if (status !== 'landed')
    warnings.push(
      'This approach misses the receiver. Shape the ramp, gap or receiving road, then test it.',
    );
  const missSummary = {
    short: 'Falls short of the receiving road.',
    long: 'Overshoots the receiving road.',
    lateral: 'Passes beside the receiving road.',
    timeout: 'Does not reach the receiving road within the preview time.',
  };
  const result = {
    points: samples.map((sample) => sample.position),
    samples,
    landed: status === 'landed',
    status,
    summary: landing
      ? `Lands ${Math.round(landing.distance - jump.landingStart)} m into the receiver after ${elapsed.toFixed(1)} s.`
      : (missSummary[status] ?? 'Misses the receiving road.'),
    landing,
    landingDistance: landing?.distance ?? null,
    time: elapsed,
    speed,
    boost,
    gapLength: jump.landingStart - jump.takeoff,
    warnings,
  };
  if (cache.size >= 64) cache.delete(cache.keys().next().value);
  cache.set(key, result);
  return structuredClone(result);
}

export function analyzeEditorJumps(track) {
  const jumps = (track.jumps ?? []).map((jump) => {
    const cruise = predictEditorJumpTrajectory(track, jump);
    const boost = predictEditorJumpTrajectory(track, jump, {
      speed: EDITOR_JUMP_SPEEDS.boost,
      boost: true,
    });
    return {
      id: jump.id,
      cruise,
      boost,
      warnings: [...new Set([...cruise.warnings, ...boost.warnings])],
    };
  });
  return {
    jumps,
    warnings: [...new Set(jumps.flatMap((jump) => jump.warnings))],
  };
}
