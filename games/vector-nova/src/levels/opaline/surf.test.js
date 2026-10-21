import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import { createOpalineTrack } from './track/model.js';
import {
  createOpalineSurfGeometry,
  roadIntervals,
  sampleOpalineSurfBank,
} from './track/geometry.js';
import { createShelfBankGeometry } from './environment/strata.js';
import { createOpalineCollisionWorld } from './collision.js';
import { createOpalineRuntime } from './runtime.js';
import { createRoadSurface } from '../../physics/road-surface.js';
import { createCollisionWorld } from '../../physics/collision-world.js';
import { VEHICLE_HULL } from '../../physics/hull.js';
import { createRapierWorld } from '../../physics/rapier-world.js';
import { createVehicleState } from '../../physics/index.js';
import { createRace } from '../../race/index.js';
import { advanceSession } from '../../core/session-runtime.js';

const track = createOpalineTrack();
const DT = 1 / 120;
const CRUISE = {
  throttle: 1,
  brake: 0,
  steer: 0,
  boost: false,
  airbrake: false,
};

test('the concave surf skin joins the rendered cliff exactly and is the finite deck used for support', () => {
  const world = createOpalineCollisionWorld({ track });
  const sampleRoad = createRoadSurface(world.triangles);
  try {
    for (const bank of track.surfBanks) {
      const surf = createOpalineSurfGeometry(track, bank);
      const span = roadIntervals(track).find(
        (span) => span.start === bank.start && span.end === bank.end,
      );
      const cliff = createShelfBankGeometry(track, { ...span, side: 1 });
      try {
        const positions = surf.attributes.position;
        const coords = surf.attributes.roadCoord;
        const rows = positions.count / 7;
        for (let row = 0; row < rows; row++) {
          const edge = new T.Vector3().fromBufferAttribute(
            positions,
            row * 7 + 6,
          );
          const join = new T.Vector3().fromBufferAttribute(
            cliff.attributes.position,
            row * 13,
          );
          assert.ok(edge.distanceTo(join) < 0.00001, `visible join row ${row}`);
        }
        for (let index = 0; index < positions.count; index++) {
          const s = coords.getX(index),
            lateral = coords.getY(index);
          const reference = track.sampleSurface(s, lateral);
          assert.ok(reference, `surface at ${s}/${lateral}`);
          assert.ok(
            reference.position.distanceTo(
              new T.Vector3().fromBufferAttribute(positions, index),
            ) < 0.001,
          );
          assert.ok(lateral >= 16 && lateral <= reference.bounds.max + 0.001);
          assert.ok(
            !track.isGap(s) ||
              Math.abs(s - bank.start) < 0.001 ||
              Math.abs(s - bank.end) < 0.001,
          );
        }
      } finally {
        surf.dispose();
        cliff.dispose();
      }
    }
    for (const s of track.surfBanks.flatMap((bank) => [
      bank.start + bank.entry / 2,
      (bank.start + bank.end) / 2,
      bank.end - bank.exit / 2,
    ])) {
      const bank = sampleOpalineSurfBank(track, s);
      for (const fraction of [0.1, 0.4, 0.75, 0.95]) {
        const lateral = 16 + bank.width * fraction;
        const reference = track.sampleSurface(s, lateral);
        const actual = sampleRoad(s, lateral, reference);
        assert.ok(
          actual?.roadOwners.some((id) => id.includes('surf')),
          `exact deck at ${s}/${lateral}`,
        );
        assert.ok(actual.position.distanceTo(reference.position) < 0.1);
        assert.ok(actual.up.dot(reference.up) > 0.99);
      }
    }
    for (const bank of track.surfBanks) {
      assert.equal(sampleOpalineSurfBank(track, bank.start).width, 0);
      assert.equal(sampleOpalineSurfBank(track, bank.end).width, 0);
    }
    assert.equal(track.sampleSurface(1600, 22), null);
    assert.equal(track.width, 32, 'ordinary flat road remains unchanged');
  } finally {
    sampleRoad.dispose();
    world.dispose();
  }
});

async function production(t) {
  const collisionWorld = createOpalineCollisionWorld({ track });
  const dynamics = await createRapierWorld({ collisionWorld });
  t.after(() => {
    dynamics.dispose();
    collisionWorld.dispose();
  });
  return { collisionWorld, dynamics };
}

function driver(context, distance, lateral, speed) {
  const state = { ...createVehicleState(), distance, lateral, speed };
  const runtime = createOpalineRuntime({ track, ...context });
  const race = createRace(track, { rulesId: runtime.rulesId, untimed: true });
  const events = [];
  runtime.reset({ state, seed: 7 });
  race.placeScenario(distance);
  return {
    state,
    runtime,
    events,
    step(input = CRUISE) {
      advanceSession({
        state,
        runtime,
        ...context,
        race,
        input,
        dt: DT,
        emit: (event) => events.push(event),
      });
    },
  };
}

test('ordinary production steering climbs the bank, follows its slope, and returns to the flat road', async (t) => {
  const context = await production(t);
  const run = driver(context, 380, 10, 65);
  t.after(() => run.runtime.dispose());
  let returning = false,
    peakLateral = 10,
    peakRise = 0,
    leastBaseAlignment = 1;
  for (let tick = 0; tick < 900; tick++) {
    const target = returning ? 8 : 28;
    const heading = T.MathUtils.clamp(
      (target - run.state.lateral) * 0.055,
      -0.28,
      0.28,
    );
    const steer = T.MathUtils.clamp(
      (run.state.heading - heading) * 2,
      -0.6,
      0.6,
    );
    run.step({ ...CRUISE, steer });
    const pose = run.runtime.pose(1);
    assert.ok(!pose.recovering, 'bank traversal retains real deck support');
    peakLateral = Math.max(peakLateral, run.state.lateral);
    if (run.state.lateral > 26) returning = true;
    if (run.state.lateral > 22) {
      const base = track.sample(run.state.distance);
      const surface = track.sampleSurface(
        run.state.distance,
        run.state.lateral,
      );
      const up = new T.Vector3(0, 1, 0).applyQuaternion(pose.quaternion);
      assert.ok(
        up.dot(surface.up) > 0.98,
        'body orientation follows the incline',
      );
      leastBaseAlignment = Math.min(leastBaseAlignment, up.dot(base.up));
      peakRise = Math.max(
        peakRise,
        pose.position.clone().sub(base.position).dot(base.up),
      );
    }
    if (returning && run.state.lateral < 9) break;
  }
  assert.ok(peakLateral > 26 && peakRise > 4);
  assert.ok(
    leastBaseAlignment < 0.9,
    'the craft visibly banks with the mineral face',
  );
  assert.ok(
    returning && run.state.lateral < 9,
    'normal steering returns from bank to road',
  );
  assert.ok(
    !run.events.some((event) =>
      ['road-departure', 'impact', 'road-recovery'].includes(event.type),
    ),
  );
});

test('the narrowing visible cliff guides a high line through the exit and the approach bank preserves the first jump', async (t) => {
  const context = await production(t);
  const bank = track.surfBanks[1];
  const exit = driver(context, bank.end - bank.exit, 30, 400 / 3.6);
  try {
    for (let tick = 0; tick < 1500 && exit.state.distance < bank.end; tick++)
      exit.step();
    assert.ok(
      exit.state.distance >= bank.end,
      'high line completes the gradual bank return',
    );
    assert.ok(
      exit.state.lateral <= 16.15,
      'physical taper returns support to ordinary road bounds',
    );
    assert.ok(!exit.events.some((event) => event.type === 'road-departure'));
  } finally {
    exit.runtime.dispose();
  }
  const approach = driver(context, 145, 22, 65);
  try {
    for (let tick = 0; tick < 900; tick++) {
      approach.step();
      if (approach.events.some((event) => event.type === 'jump-transfer'))
        break;
    }
    assert.equal(
      approach.events.find((event) => event.type === 'jump-transfer')?.payload
        .outcome,
      'landed',
    );
    assert.ok(
      !approach.events.some((event) => event.type === 'road-departure'),
    );
  } finally {
    approach.runtime.dispose();
  }
});

test('every natural lower bank is supported while connectors and real gaps retain ordinary ownership', () => {
  const natural = roadIntervals(track).filter((span) => !span.constructed);
  assert.deepEqual(
    track.surfBanks.map(({ start, end }) => [start, end]),
    natural.map(({ start, end }) => [start, end]),
  );
  const covered = track.surfBanks.reduce(
    (sum, bank) => sum + bank.end - bank.start,
    0,
  );
  assert.ok(
    covered > 5000,
    'support covers the whole natural route, not selected showcases',
  );
  for (const bank of track.surfBanks) {
    for (let s = bank.start + 1; s < bank.end - 1; s += 17) {
      const bounds = sampleOpalineSurfBank(track, s);
      assert.ok(bounds.width > 0, `no unsupported lower-bank hole at ${s}`);
      assert.equal(track.sampleSurface(s, bounds.max).bounds.max, bounds.max);
    }
  }
  for (const span of track.constructedIntervals)
    assert.equal(
      sampleOpalineSurfBank(track, (span.start + span.end) / 2),
      null,
    );
  for (const jump of track.jumps)
    assert.equal(
      sampleOpalineSurfBank(track, (jump.takeoff + jump.landingStart) / 2),
      null,
    );
});

test('every supported inner bank corridor clears the full rendered terrain hull', () => {
  const full = createOpalineCollisionWorld({ track });
  const terrain = createCollisionWorld({
    id: 'opaline-supported-bank-clearance',
    version: 1,
    geometryId: track.geometryVersion,
    triangles: full.triangles.filter((triangle) => triangle.kind === 'terrain'),
  });
  try {
    for (const bank of track.surfBanks) {
      for (let s = bank.start + 4; s < bank.end; s += 8) {
        for (const lateral of [18, 22, 26, 30]) {
          const frame = track.sampleSurface(s, lateral);
          if (lateral > frame.bounds.max - 3.5) continue;
          const hit = terrain.sweepHull(
            {
              position: frame.position.clone().addScaledVector(frame.up, 4),
              quaternion: frame.quaternion,
            },
            {
              position: frame.position
                .clone()
                .addScaledVector(frame.up, VEHICLE_HULL.hover),
              quaternion: frame.quaternion,
            },
            VEHICLE_HULL,
          );
          assert.equal(
            hit,
            null,
            `${hit?.shape.id} blocks supported bank ${s}/${lateral}`,
          );
        }
      }
    }
  } finally {
    terrain.dispose();
    full.dispose();
  }
});

function steerToward(run, target) {
  const frame =
    track.sampleSurface(run.state.distance, run.state.lateral) ??
    track.sample(run.state.distance);
  const heading = T.MathUtils.clamp(
    (target - run.state.lateral) * 0.055,
    -0.28,
    0.28,
  );
  // Ordinary steering with a curve preview; production assist remains unchanged.
  return T.MathUtils.clamp(
    (run.state.heading - heading) * 2 -
      (frame.curvature * run.state.speed) /
        (frame.longitudinalMetric ?? 1) /
        1.5,
    -1,
    1,
  );
}

test('later basin, veil, crown and return banks support climbing and descending at racing speed', async (t) => {
  const context = await production(t);
  for (const [distance, speed] of [
    [1750, 80],
    [2800, 400 / 3.6],
    [3550, 400 / 3.6],
    [5300, 400 / 3.6],
  ]) {
    const run = driver(context, distance, 10, speed);
    let returning = false,
      peak = 10,
      peakRise = 0;
    try {
      for (let tick = 0; tick < 1000; tick++) {
        const bounds = track.sampleSurface(
          run.state.distance,
          run.state.lateral,
        )?.bounds ?? { max: 16 };
        const target = returning ? 8 : Math.min(28, bounds.max - 4);
        run.step({ ...CRUISE, steer: steerToward(run, target) });
        const pose = run.runtime.pose(1);
        assert.ok(
          !pose.recovering,
          `supported bank departed after starting at ${distance}`,
        );
        peak = Math.max(peak, run.state.lateral);
        if (run.state.lateral > 26) returning = true;
        if (run.state.lateral > 22) {
          const frame = track.sampleSurface(
            run.state.distance,
            run.state.lateral,
          );
          const up = new T.Vector3(0, 1, 0).applyQuaternion(pose.quaternion);
          assert.ok(up.dot(frame.up) > 0.98, `slope alignment at ${distance}`);
          const base = track.sample(run.state.distance);
          peakRise = Math.max(
            peakRise,
            pose.position.clone().sub(base.position).dot(base.up),
          );
        }
        if (returning && run.state.lateral < 9) break;
      }
      assert.ok(
        peak > 26 && peakRise > 4,
        `climbed the real bank at ${distance}`,
      );
      assert.ok(
        returning && run.state.lateral < 9,
        `returned from bank at ${distance}`,
      );
      assert.ok(
        !run.events.some((event) =>
          ['road-departure', 'road-recovery', 'impact'].includes(event.type),
        ),
        `clean contact at ${distance}`,
      );
    } finally {
      run.runtime.dispose();
    }
  }
});

test('400km/h entries and early exit steering retain support on every long bank', async (t) => {
  const context = await production(t);
  for (const bank of track.surfBanks.slice(1)) {
    for (const phase of ['entry', 'exit']) {
      const start =
        phase === 'entry'
          ? track.isGap(bank.start - 25)
            ? bank.start + 0.1
            : bank.start - 25
          : bank.end - bank.exit - 20;
      const end =
        phase === 'entry' ? bank.start + bank.entry + 130 : bank.end - 0.5;
      const run = driver(
        context,
        start,
        phase === 'entry' ? 10 : 30,
        400 / 3.6,
      );
      let peak = run.state.lateral;
      try {
        for (let tick = 0; tick < 1800 && run.state.distance < end; tick++) {
          const preview = phase === 'exit' ? 60 : 0;
          const max =
            sampleOpalineSurfBank(track, run.state.distance + preview)?.max ??
            16;
          run.step({
            ...CRUISE,
            steer: steerToward(run, Math.min(28, max - 5)),
          });
          peak = Math.max(peak, run.state.lateral);
          assert.ok(
            !run.runtime.pose(1)?.recovering,
            `${bank.id} ${phase} lost support`,
          );
        }
        assert.ok(run.state.distance >= end, `${bank.id} completes ${phase}`);
        if (phase === 'entry')
          assert.ok(peak > 25, `${bank.id} climbs into bank`);
        else
          assert.ok(
            run.state.lateral < 15,
            `${bank.id} returns to ordinary road before the boundary`,
          );
        assert.ok(
          !run.events.some((event) =>
            ['road-departure', 'road-recovery', 'impact'].includes(event.type),
          ),
          `${bank.id} ${phase} has no false collision/release`,
        );
      } finally {
        run.runtime.dispose();
      }
    }
  }
});
