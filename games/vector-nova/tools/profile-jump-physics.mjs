import { parseArgs } from 'node:util';
import RAPIER from '@dimforge/rapier3d-compat';
import { loadLevel } from './level-checks/level-contract.mjs';
import { createRapierWorld } from '../src/physics/rapier-world.js';
import { withMagneticBoundaries } from '../src/physics/magnetic-boundaries.js';
import { createVehicleState } from '../src/physics/index.js';
import { createDeviceRuntime } from '../src/pickups/runtime.js';
import { getRacerControl } from '../src/race/racers.js';
import { RACE_OPPONENTS, RACE_GRID } from '../src/race/roster.js';

// CPU simulation probe, not an FPS benchmark. No browser, captures or reports.
const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    jump: { type: 'string', default: '1' },
    ticks: { type: 'string', default: '1000' },
    racers: { type: 'string', default: '10' },
    approach: { type: 'string', default: '300' },
    start: { type: 'string' },
    speed: { type: 'string', default: '130' },
  },
});
const jumpIndex = Number(values.jump) - 1;
const ticks = Number(values.ticks),
  count = Number(values.racers);
const approach = Number(values.approach);
const startDistance = values.start === undefined ? null : Number(values.start);
const startSpeed = Number(values.speed);
if (
  positionals.length !== 1 ||
  !Number.isInteger(jumpIndex) ||
  jumpIndex < 0 ||
  !Number.isInteger(ticks) ||
  ticks < 1 ||
  ticks > 10000 ||
  !Number.isInteger(count) ||
  count < 1 ||
  count > 10 ||
  !Number.isFinite(approach) ||
  (startDistance !== null && !Number.isFinite(startDistance)) ||
  !Number.isFinite(startSpeed) ||
  startSpeed < 0
)
  throw new Error(
    'Usage: node tools/profile-jump-physics.mjs <slug> [--jump 1] [--ticks 1000] [--racers 10] [--approach 300] [--start metres] [--speed 130]',
  );
const { createLevel } = await loadLevel(positionals[0]);
const level = await createLevel({}),
  track = level.createTrack();
const jump = track.jumps?.[jumpIndex];
if (!jump) throw new Error('The selected circuit has no jump at that index.');
const collisionWorld = level.createCollisionWorld({ track });
let dynamics;
const racers = [],
  bins = new Map(),
  events = new Map();
let queries = {};
const probes = [
  [
    RAPIER.World.prototype,
    'collidersWithAabbIntersectingAabb',
    'broadPhaseMs',
    'broadPhaseQueries',
  ],
  [RAPIER.Collider.prototype, 'castCollider', 'sweepMs', 'sweeps'],
  [
    RAPIER.Collider.prototype,
    'contactCollider',
    'proximityMs',
    'proximityQueries',
  ],
].map(([prototype, method, timing, count]) => ({
  prototype,
  method,
  timing,
  count,
  original: prototype[method],
}));
try {
  dynamics = await (level.createDynamics ?? createRapierWorld)({
    track,
    collisionWorld: withMagneticBoundaries(track, collisionWorld),
  });
  const devices = level.racing.createDevices(track);
  const specs = [
    { id: 'player', shipId: 'kestrel', lane: 4, pace: 1 },
    ...RACE_OPPONENTS,
  ].slice(0, count);
  for (const spec of specs) {
    const motion = level.createRuntime({
      track,
      collisionWorld,
      dynamics,
      presentation: false,
      settings: { steeringAssist: 0.3 },
    });
    const runtime = createDeviceRuntime({ track, devices, motion });
    const state = {
      ...createVehicleState(spec.shipId),
      chassisId: spec.id === 'player' ? 'kestrel' : spec.id,
      ...RACE_GRID[spec.id],
      distance:
        (startDistance ?? jump.takeoff - approach) +
        RACE_GRID[spec.id].distance,
      speed: startSpeed,
    };
    racers.push({
      spec,
      runtime,
      state,
      outcomes: { landed: 0, recovered: 0, misses: 0, departures: 0 },
    });
    runtime.reset({ state });
  }
  // Instrument public query boundaries only in this probe. Production ticks
  // have no profiling overhead or diagnostic logging.
  for (const probe of probes)
    probe.prototype[probe.method] = function (...args) {
      const start = performance.now();
      const result = probe.original.apply(this, args);
      queries[probe.timing] += performance.now() - start;
      queries[probe.count]++;
      return result;
    };
  for (let tick = 0; tick < ticks; tick++) {
    queries = Object.fromEntries(
      probes.flatMap(({ timing, count }) => [
        [timing, 0],
        [count, 0],
      ]),
    );
    const start = performance.now(),
      nearby = racers.map((r) => r.state);
    const inputs = racers.map(({ spec, runtime, state }) =>
      getRacerControl(state, track, {
        lane: spec.lane,
        pace: spec.pace,
        difficulty: 'hard',
        nearby,
        runtime,
        devices,
      }),
    );
    const aiMs = performance.now() - start,
      stageStart = performance.now();
    racers.forEach(({ runtime, state }, i) =>
      runtime.beginAdvance(state, inputs[i], 1 / 120),
    );
    const stageMs = performance.now() - stageStart,
      worldStart = performance.now();
    dynamics.step(1 / 120);
    const worldMs = performance.now() - worldStart,
      finishStart = performance.now();
    for (const { runtime, state, outcomes } of racers) {
      for (const event of runtime.finishAdvance(state)) {
        events.set(event.type, (events.get(event.type) ?? 0) + 1);
        if (event.type === 'jump-transfer' && event.payload.id === jump.id)
          outcomes[event.payload.outcome]++;
        if (event.type === 'jump-miss') outcomes.misses++;
        if (event.type === 'road-departure') outcomes.departures++;
      }
      runtime.update({});
    }
    const row = {
      ...queries,
      aiMs,
      stageMs,
      worldMs,
      finishMs: performance.now() - finishStart,
      totalMs: performance.now() - start,
      airborne: racers.filter((r) => !r.runtime.pose(1).grounded).length,
    };
    const bin =
      Math.floor((racers[0].state.distance - jump.takeoff) / 100) * 100;
    if (!bins.has(bin)) bins.set(bin, []);
    bins.get(bin).push(row);
  }
  console.log(
    JSON.stringify(
      {
        level: positionals[0],
        jump: jump.id,
        startDistance: startDistance ?? jump.takeoff - approach,
        startSpeed,
        racers: count,
        ticks,
        note: 'Milliseconds per 120 Hz control tick; CPU only. Query timers are included in world/total time, so do not sum columns.',
        sections: [...bins].map(([metresFromTakeoff, rows]) => {
          const result = { metresFromTakeoff, ticks: rows.length };
          for (const key of Object.keys(rows[0]))
            result[key] = +(
              rows.reduce((sum, row) => sum + row[key], 0) / rows.length
            ).toFixed(3);
          const sorted = rows.map((row) => row.totalMs).sort((a, b) => a - b);
          result.p95Ms =
            +sorted[Math.floor((sorted.length - 1) * 0.95)].toFixed(3);
          return result;
        }),
        events: Object.fromEntries(events),
        field: racers.map(({ spec, state, outcomes }) => ({
          id: spec.id,
          metresFromTakeoff: state.distance - jump.takeoff,
          speed: state.speed,
          ...outcomes,
        })),
      },
      null,
      2,
    ),
  );
} finally {
  for (const probe of probes) probe.prototype[probe.method] = probe.original;
  racers.forEach(({ runtime }) => runtime.dispose());
  dynamics?.dispose();
  collisionWorld.dispose();
}
