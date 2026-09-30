import test from 'node:test';
import assert from 'node:assert/strict';
import { createRace } from '../src/race/index.js';
const track = {
  length: 1000,
  checkpoints: [0, 100, 220, 320, 440, 600, 740, 900].map((distance) => ({
    distance,
  })),
  jumps: [
    {
      id: 'one',
      takeoff: 150,
      landingStart: 220,
      landingEnd: 260,
      recovery: 280,
    },
    {
      id: 'two',
      takeoff: 480,
      landingStart: 600,
      landingEnd: 650,
      recovery: 680,
    },
  ],
};
function transfer(race, jump, outcome) {
  const target = outcome === 'landed' ? jump.landingStart + 10 : jump.recovery;
  return race.step(jump.takeoff, target, 1 / 120, [
    {
      type: 'jump-transfer',
      payload: { id: jump.id, from: jump.takeoff, to: target, outcome },
    },
  ]);
}
test('timed recovery awards only ordered landing CP once and finishes a valid delayed lap', () => {
  const race = createRace(track, { rulesId: 'nacre-test' });
  race.step(0, 150, 2);
  for (let i = 0; i < 180; i++) race.step(150, 150, 1 / 120);
  const first = transfer(race, track.jumps[0], 'recovered');
  assert.equal(first.filter((e) => e.type === 'checkpoint').length, 1);
  assert.equal(race.checkpoint, 2);
  assert.equal(race.valid, true);
  assert.ok(Math.abs(race.elapsed - (3.5 + 1 / 120)) < 1e-10);
  race.step(280, 480, 2);
  transfer(race, track.jumps[1], 'landed');
  race.step(610, 1000, 4);
  assert.equal(race.lap, 2);
  assert.equal(race.history[0].valid, true);
  assert.equal(race.best, race.history[0].duration);
  assert.equal(race.history[0].rulesId, 'nacre-test');
});
test('wrong jump, arbitrary target and duplicate transfers cannot credit or finish early', () => {
  for (const target of [280, 900, 1000]) {
    const race = createRace(track);
    race.step(0, 150, 1);
    const events = race.step(150, target, 1, [
      {
        type: 'jump-transfer',
        payload: { id: 'two', from: 150, to: target, outcome: 'recovered' },
      },
    ]);
    assert.equal(events.length, 0);
    assert.equal(race.valid, false);
    assert.equal(race.lap, 1);
    assert.equal(race.checkpoint, 1);
  }
  const race = createRace(track);
  race.step(0, 150, 1);
  transfer(race, track.jumps[0], 'recovered');
  assert.equal(transfer(race, track.jumps[0], 'recovered').length, 0);
  assert.equal(race.checkpoint, 2);
  assert.equal(race.valid, false);
});
test('scenario and manual recovery use actual nonuniform checkpoint distances', () => {
  const race = createRace(track);
  race.placeScenario(350);
  assert.equal(race.checkpoint, 3);
  assert.equal(race.recover(), 320);
  assert.equal(race.valid, false);
});

for (const launch of ['short', 'long'])
  test(`actual Nacre ${launch} launches retain a valid lap and credit only their landing checkpoint`, async () => {
    const { createLevel3Track } =
      await import('../src/levels/nacre/track/model.js');
    const { createNacreRuntime } =
      await import('../src/levels/nacre/track/runtime.js');
    const { createVehicleState } = await import('../src/physics/index.js');
    const { advanceSession } = await import('../src/core/session-runtime.js');
    const course = createLevel3Track(),
      runtime = createNacreRuntime({ track: course });
    const race = createRace(course, { rulesId: runtime.rulesId });
    const state = createVehicleState(),
      events = [];
    let old = 0,
      total = 0;
    for (let i = 0; i < 2; i++) {
      const source = course.scenarios[`jump${i + 1}-${launch}`];
      Object.assign(state, source);
      race.step(old, state.distance, 1);
      total += 1;
      runtime.reset({ seed: 7 });
      const before = events.length;
      for (let tick = 0; tick < 2000; tick++) {
        advanceSession({
          state,
          input:
            launch === 'short' ? { brake: 1 } : { throttle: 1, boost: true },
          dt: 1 / 120,
          runtime,
          race,
          emit: (event) => events.push({ ...event, time: state.time }),
        });
        total += 1 / 120;
        if (events.slice(before).some((e) => e.type === 'jump-transfer')) break;
      }
      const occurred = events.slice(before),
        miss = occurred.find((e) => e.type === 'jump-miss'),
        recovered = occurred.find((e) => e.type === 'jump-transfer');
      assert.equal(
        recovered.payload.outcome,
        launch === 'short' ? 'recovered' : 'landed',
      );
      if (launch === 'short')
        assert.ok(Math.abs(recovered.time - miss.time - 1.5) < 1e-8);
      else {
        assert.equal(miss, undefined);
        assert.ok(
          recovered.payload.to >
            course.jumps[i].landingStart + (i === 0 ? 82 : 76),
          'full boost lands beyond the former strip',
        );
      }
      assert.equal(race.valid, true);
      assert.equal(state.resetCount, 0);
      assert.equal(occurred.filter((e) => e.type === 'checkpoint').length, 1);
      assert.ok(Math.abs(race.elapsed - total) < 1e-8);
      old = state.distance;
    }
    race.step(old, course.length, 1);
    total += 1;
    assert.equal(race.history[0].valid, true);
    assert.ok(Math.abs(race.history[0].duration - total) < 1e-8);
    assert.equal(race.history[0].rulesId, runtime.rulesId);
    assert.equal(race.lap, 2);
    runtime.dispose();
  });
