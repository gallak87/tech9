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
    for (const s of [125, 150, 175, 330, 400, 650, 800, 920, 980]) {
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
    assert.equal(track.sampleSurface(1500, 22), null);
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
  const exit = driver(context, 720, 30, 90);
  try {
    for (let tick = 0; tick < 1500 && exit.state.distance < 1000; tick++)
      exit.step();
    assert.ok(
      exit.state.distance >= 1000,
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
