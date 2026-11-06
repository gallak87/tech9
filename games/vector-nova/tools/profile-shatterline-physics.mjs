import { parseArgs } from 'node:util';
import { Session } from 'node:inspector/promises';
import createLevel from '../src/levels/shatterline/index.js';
import { withMagneticBoundaries } from '../src/physics/magnetic-boundaries.js';
import { createVehicleState, STEERING_ASSIST } from '../src/physics/index.js';
import { createDeviceRuntime } from '../src/pickups/runtime.js';
import { getRacerControl } from '../src/race/racers.js';
import { RACE_OPPONENTS } from '../src/race/roster.js';

// Bounded CPU-only reproduction of a field behind the player's second-tube
// exit. Fresh grounded states use the reported positions, speeds and lanes;
// this is not a replay, browser/FPS benchmark or automated full lap.
const { values } = parseArgs({
  options: {
    case: { type: 'string', default: 'all' },
    ticks: { type: 'string', default: '240' },
    profile: { type: 'boolean', default: false },
  },
});
const ticks = Number(values.ticks);
if (
  !['all', 'reported', 'open', 'solo'].includes(values.case) ||
  !Number.isInteger(ticks) ||
  ticks < 80 ||
  ticks > 1000
)
  throw new Error(
    'Usage: node tools/profile-shatterline-physics.mjs [--case all|reported|open|solo] [--ticks 240]',
  );

const reported = [
  ['player', 12593.77, 103.8, -14.14],
  ['vise', 11337, 163.88, -4.11],
  ['gannet', 11180.2, 181.52, -3.82],
  ['pike', 10980.38, 177.46, 4.88],
  ['mule', 10784.65, 163.54, -3.9],
  ['manta', 10780.99, 166.9, 4.12],
  ['rook', 10625.93, 167.03, -3.42],
  ['latch', 10525.74, 149.94, 4.18],
  ['kite', 10334.42, 154.34, 4.1],
  ['tern', 10300.83, 151.65, -3.9],
];
const cases = {
  solo: reported.slice(0, 1),
  reported,
  // Keep all ten ships together on a genuine supported interval, with no jump
  // or tube. Compress spacing rather than changing their chassis or inputs.
  open: reported.map(([id, distance, speed, lateral]) => [
    id,
    15000 + (distance - reported[0][1]) * 0.2,
    speed,
    lateral,
  ]),
};
const level = createLevel();
const track = level.createTrack();
const collisionWorld = level.createCollisionWorld({ track });
let dynamics;
const dt = 1 / 120;
const keys = ['ai', 'stage', 'world', 'finish', 'total'];
const summary = (rows) =>
  Object.fromEntries(
    keys.map((key) => {
      const ordered = rows.map((row) => row[key]).sort((a, b) => a - b);
      return [
        key,
        {
          mean: ordered.reduce((a, b) => a + b, 0) / ordered.length,
          p50: ordered[Math.floor(ordered.length * 0.5)],
          p95: ordered[Math.floor(ordered.length * 0.95)],
        },
      ];
    }),
  );

try {
  dynamics = await level.createDynamics({
    track,
    collisionWorld: withMagneticBoundaries(track, collisionWorld),
  });
  const devices = level.racing.createDevices(track);
  for (const [name, field] of Object.entries(cases)) {
    if (values.case !== 'all' && name !== values.case) continue;
    dynamics.reset();
    const racers = [];
    try {
      for (const [id, distance, speed, lateral] of field) {
        const specification =
          id === 'player'
            ? { id, shipId: 'bastion', lane: 0, pace: 1 }
            : RACE_OPPONENTS.find((entry) => entry.id === id);
        const motion = level.createRuntime({
          track,
          collisionWorld,
          dynamics,
          presentation: false,
          settings: { steeringAssist: STEERING_ASSIST },
        });
        const runtime = createDeviceRuntime({ track, devices, motion });
        const state = {
          ...createVehicleState(specification.shipId),
          chassisId: id === 'player' ? 'bastion' : id,
          distance,
          speed,
          lateral,
        };
        racers.push({ specification, state, runtime });
        runtime.reset({ state });
      }
      const rows = [],
        events = {};
      const inspector = values.profile ? new Session() : null;
      if (inspector) {
        inspector.connect();
        await inspector.post('Profiler.enable');
        await inspector.post('Profiler.start');
      }
      for (let tick = 0; tick < ticks; tick++) {
        const start = performance.now();
        const nearby = racers.map((racer) => racer.state);
        const inputs = racers.map(({ specification, state, runtime }) =>
          getRacerControl(state, track, {
            lane: specification.lane,
            pace: specification.pace,
            difficulty: 'hard',
            devices,
            nearby,
            runtime,
          }),
        );
        const staging = performance.now();
        racers.forEach(({ runtime, state }, i) =>
          runtime.beginAdvance(state, inputs[i], dt),
        );
        const solving = performance.now();
        dynamics.step(dt);
        const finishing = performance.now();
        for (const { runtime, state } of racers) {
          for (const event of runtime.finishAdvance(state))
            events[event.type] = (events[event.type] ?? 0) + 1;
          runtime.update({});
        }
        const end = performance.now();
        if (tick >= 40)
          rows.push({
            ai: staging - start,
            stage: solving - staging,
            world: finishing - solving,
            finish: end - finishing,
            total: end - start,
          });
      }
      if (inspector) {
        const { profile } = await inspector.post('Profiler.stop');
        const self = new Map();
        for (let i = 0; i < profile.samples.length; i++)
          self.set(
            profile.samples[i],
            (self.get(profile.samples[i]) ?? 0) + profile.timeDeltas[i],
          );
        console.log(
          JSON.stringify({
            profile: profile.nodes
              .map((node) => ({
                name: node.callFrame.functionName,
                url: node.callFrame.url.split('/').slice(-2).join('/'),
                line: node.callFrame.lineNumber + 1,
                microseconds: self.get(node.id) ?? 0,
              }))
              .sort((a, b) => b.microseconds - a.microseconds)
              .slice(0, 30),
          }),
        );
        inspector.disconnect();
      }
      console.log(
        JSON.stringify({
          case: name,
          racers: racers.length,
          ticks: rows.length,
          note: 'Milliseconds per 120 Hz control tick, excludes initialization and the first 40 warmup ticks.',
          timings: summary(rows),
          events,
          field: racers.map(({ specification, state, runtime }) => ({
            id: specification.id,
            distance: state.distance,
            speed: state.speed,
            grounded: runtime.pose(1).grounded,
          })),
        }),
      );
    } finally {
      racers.forEach(({ runtime }) => runtime.dispose());
    }
  }
} finally {
  dynamics?.dispose();
  collisionWorld.dispose();
}
