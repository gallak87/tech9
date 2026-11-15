import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import {
  generateDocument,
  analyzeDocument,
  validateDocument,
} from './document.js';
import { createSeededLayoutGeometry } from './seeded-layout.js';
import { createEditorTrack } from './track.js';
import { createEditorCollisionWorld } from './nightweir.js';
import {
  predictEditorJumpTrajectory,
  createEditorFlightRuntime,
  EDITOR_JUMP_SPEEDS,
} from './jumps.js';
import { SHIPS } from '../ships/catalog.js';
import { createVehicleState } from '../physics/index.js';
import { createRapierWorld } from '../physics/rapier-world.js';
import { withMagneticBoundaries } from '../physics/magnetic-boundaries.js';

const make = (options) =>
  generateDocument({ generatorVersion: 4, courseType: 'downhill', ...options });
const label = (options) => JSON.stringify(options);
const drop = (document) => document.points[0].y - document.points.at(-1).y;

test('historical v3 downhill layouts retain their resolved geometry', () => {
  const fixtures = [
    [
      {
        seed: 42,
        length: 5000,
        bendiness: 0.85,
        elevation: 0.4,
        jumpFrequency: 'normal',
        jumpSize: 'mixed',
      },
      '7c410a88d7461faf61a7e4324d200f8c8b689bad564e5986c70c888b76fa63ba',
    ],
    [
      {
        seed: 2884341318,
        length: 20000,
        bendiness: 1,
        elevation: 1,
        jumpFrequency: 'many',
        jumpSize: 'large',
      },
      'f64f32b4b0c9322a5af617fc74a524d72aae32a674a77cd81764c95fbcae52ce',
    ],
  ];
  for (const [options, expected] of fixtures) {
    const geometry = createSeededLayoutGeometry({
      version: 3,
      courseType: 'downhill',
      ...options,
    });
    const source = JSON.stringify(geometry, (_, value) =>
      typeof value === 'number' ? Math.round(value * 1e6) / 1e6 : value,
    );
    assert.equal(createHash('sha256').update(source).digest('hex'), expected);
  }
});

test('v4 downhill seeds sustain a mountain descent across UI lengths and control extremes', () => {
  const failures = [];
  for (const seed of [0, 42, 42017, 4294967295])
    for (const length of [3000, 5000, 10000, 15000, 20000])
      for (const profile of [
        {
          bendiness: 0,
          elevation: 0,
          jumpFrequency: 'none',
          jumpSize: 'small',
        },
        {
          bendiness: 1,
          elevation: 1,
          jumpFrequency: 'none',
          jumpSize: 'small',
        },
        {
          bendiness: 0.55,
          elevation: 0.45,
          jumpFrequency: 'normal',
          jumpSize: 'mixed',
        },
        {
          bendiness: 1,
          elevation: 1,
          jumpFrequency: 'many',
          jumpSize: 'large',
        },
      ]) {
        const options = { seed, length, ...profile };
        try {
          const document = make(options),
            track = createEditorTrack(document);
          const report = analyzeDocument(document, { strict: true });
          assert(report.valid, report.errors.join(' '));
          assert.equal(document.generator.version, 4);
          assert.deepEqual(validateDocument(document), document);
          assert(Math.abs(track.length - length) < 0.01);
          assert(Math.abs(track.length - track.finishDistance - 600) < 0.001);
          assert(
            drop(document) >= (length - 600) * 0.05,
            'a descent must lose meaningful height even with many jumps',
          );
          if (profile.jumpFrequency === 'none')
            assert(drop(document) >= (length - 600) * 0.1);
          // Missing-deck control curves inside a gap are not a drivable road
          // height. Compare the retained road at each course stage instead.
          const stages = [0, 0.25, 0.5, 0.75, 1]
            .map((u) => u * track.finishDistance)
            .filter((distance) => !track.isGap(distance))
            .map((distance) => track.sample(distance).position.y);
          assert(
            stages.every(
              (height, index) => !index || height <= stages[index - 1] + 1,
            ),
            'the descent is distributed through the whole course',
          );
          let ordinary = 0,
            falling = 0;
          for (
            let distance = 220;
            distance < track.finishDistance - 100;
            distance += 20
          ) {
            if (track.isJumpProtected(distance)) continue;
            ordinary++;
            if (track.sample(distance).tangent.y < -0.02) falling++;
          }
          if (ordinary >= 5)
            assert(
              falling / ordinary > 0.75,
              `ordinary road must descend too (${falling}/${ordinary})`,
            );
          assert(
            Math.abs(track.sample(130).tangent.y) < 1e-9,
            'the initial pickup grid remains level',
          );
          assert(
            Math.abs(track.sample(track.finishDistance + 200).tangent.y) < 1e-8,
            'the braking runout remains level',
          );
        } catch (error) {
          failures.push(`${label(options)}: ${error.message}`);
        }
      }
  assert.deepEqual(failures, []);
});

test('v4 elevation changes a real net descent and reproduces its seed without regenerating saved points', () => {
  for (const length of [3000, 20000]) {
    const options = {
      seed: 42017,
      length,
      jumpFrequency: 'none',
      bendiness: 0.55,
    };
    const gentle = make({ ...options, elevation: 0 }),
      steep = make({ ...options, elevation: 1 });
    assert(drop(steep) > drop(gentle) + 100);
    assert.deepEqual(steep, make({ ...options, elevation: 1 }));
    assert.deepEqual(validateDocument(steep).points, steep.points);
  }
  const options = {
    seed: 2884341318,
    length: 20000,
    bendiness: 1,
    elevation: 1,
    jumpFrequency: 'many',
    jumpSize: 'large',
  };
  const current = make(options),
    old = generateDocument({
      ...options,
      courseType: 'downhill',
      generatorVersion: 3,
    });
  assert(
    drop(current) > drop(old) * 1.6,
    'the reported long jump-heavy course gains a sustained ordinary-road descent',
  );
  assert.equal(
    make({
      seed: 42017,
      length: 3000,
      jumpFrequency: 'normal',
      jumpSize: 'mixed',
    }).jumps.length,
    3,
  );
});

test('v4 descent preserves stock-hull cruise and boost landings around its rigid jumps', () => {
  for (const options of [
    {
      seed: 42017,
      length: 3000,
      elevation: 1,
      bendiness: 1,
      jumpFrequency: 'normal',
      jumpSize: 'mixed',
    },
    {
      seed: 2884341318,
      length: 20000,
      elevation: 1,
      bendiness: 1,
      jumpFrequency: 'many',
      jumpSize: 'large',
    },
  ]) {
    const track = createEditorTrack(make(options));
    for (const jump of track.jumps)
      for (const ship of SHIPS)
        for (const boost of [false, true]) {
          const prediction = predictEditorJumpTrajectory(track, jump, {
            shipId: ship.id,
            speed: boost ? ship.handling.boostSpeed : ship.handling.cruiseSpeed,
            boost,
          });
          assert(
            prediction.landed,
            `${label(options)}/${jump.label}/${ship.id}/${boost}: ${prediction.summary}`,
          );
        }
  }
});

test('a v4 downhill jump launches and lands through native road collision', async () => {
  const document = make({
    seed: 42017,
    length: 3000,
    elevation: 1,
    bendiness: 0.55,
    density: 0,
    jumpFrequency: 'normal',
    jumpSize: 'mixed',
  });
  const track = createEditorTrack(document),
    jump = track.jumps[0];
  const collision = createEditorCollisionWorld(document, track);
  const dynamics = await createRapierWorld({
    collisionWorld: withMagneticBoundaries(track, collision),
  });
  const runtime = createEditorFlightRuntime({
    track,
    collisionWorld: collision,
    dynamics,
    settings: { steeringAssist: 0.3 },
  });
  try {
    const state = {
      ...createVehicleState(),
      distance: jump.takeoff - 20,
      speed: EDITOR_JUMP_SPEEDS.cruise,
    };
    runtime.reset({ state });
    const events = [];
    for (
      let tick = 0;
      tick < 2400 && !events.some((event) => event.type === 'jump-transfer');
      tick++
    )
      events.push(
        ...runtime.advance(
          state,
          { throttle: 1, brake: 0, steer: 0, boost: false, airbrake: false },
          1 / 120,
        ),
      );
    assert(events.some((event) => event.type === 'jump-launch'));
    assert.equal(
      events.find((event) => event.type === 'jump-transfer')?.payload.outcome,
      'landed',
      JSON.stringify(events),
    );
    assert.equal(runtime.status().mode, 'magnetic');
    assert(state.distance >= jump.landingStart);
  } finally {
    runtime.dispose();
    dynamics.dispose();
    collision.dispose();
  }
});
