import test from 'node:test';
import assert from 'node:assert/strict';
import { FlightSimulation, AIRCRAFT } from '../src/flight/FlightSimulation.js';
import { FlightInput } from '../src/flight/FlightInput.js';
import { groundHeight, getObstacle } from '../src/flight/FlightWorld.js';
const run = (sim, seconds, input) => {
  for (let n = 0; n < seconds * 120; n++) sim.update(1 / 120, input);
};

test('both aircraft accelerate and need flying speed before liftoff', () => {
  for (const type of Object.keys(AIRCRAFT)) {
    const sim = new FlightSimulation({ type });
    sim.start();
    run(sim, 2, { throttle: 1, pitch: 1 });
    assert.equal(sim.state.grounded, true);
    run(sim, 12, { throttle: 1, pitch: 0.3 });
    assert.equal(sim.state.grounded, false, type);
    assert.ok(sim.state.y > 3 && sim.state.speed >= AIRCRAFT[type].rotate);
  }
});
test('bank gives coordinated turns and level assistance steadies aircraft', () => {
  const sim = new FlightSimulation();
  sim.start();
  Object.assign(sim.state, {
    grounded: false,
    phase: 'flight',
    y: 200,
    speed: 40,
    throttle: 0.6,
  });
  run(sim, 1, { roll: 1 });
  assert.ok(sim.state.heading > 0.02);
  assert.ok(sim.state.roll > 0.5);
  run(sim, 2, { level: true });
  assert.ok(Math.abs(sim.state.roll) < 0.01);
});
test('low airspeed produces a stall and sink; throttle recovers lift', () => {
  const sim = new FlightSimulation();
  sim.start();
  Object.assign(sim.state, {
    grounded: false,
    phase: 'flight',
    y: 200,
    speed: 12,
    pitch: 0.15,
  });
  run(sim, 1, {});
  assert.equal(sim.state.stall, true);
  assert.ok(sim.state.verticalSpeed < -5);
  run(sim, 9, { throttle: 1 });
  assert.equal(sim.state.stall, false);
  assert.ok(sim.state.speed > 25);
});
test('gentle aligned touchdown rolls to a successful stop; hard impact is recoverable', () => {
  for (const type of Object.keys(AIRCRAFT)) {
    const sim = new FlightSimulation({ type });
    sim.start();
    Object.assign(sim.state, {
      grounded: false,
      phase: 'flight',
      y: AIRCRAFT[type].gear + 0.03,
      z: 0,
      speed: AIRCRAFT[type].stall + 3,
      pitch: -0.03,
      verticalSpeed: -1,
      airborneTime: 10,
    });
    run(sim, 0.2, {});
    assert.equal(sim.state.phase, 'rollout');
    run(sim, 6, { brake: true });
    assert.equal(sim.state.phase, 'landed');
    sim.reset();
    sim.start();
    Object.assign(sim.state, {
      grounded: false,
      phase: 'flight',
      y: AIRCRAFT[type].gear + 0.02,
      speed: 40,
      pitch: -0.5,
      verticalSpeed: -10,
    });
    run(sim, 0.1, {});
    assert.equal(sim.state.phase, 'crashed');
    sim.reset();
    assert.equal(sim.state.phase, 'ready');
    assert.equal(sim.state.speed, 0);
    assert.equal(sim.state.type, type);
  }
});
test('paused or invalid time does not advance flight and snapshots do not leak visited arrays', () => {
  const sim = new FlightSimulation();
  sim.start();
  run(sim, 1, { throttle: 1 });
  sim.paused = true;
  const before = sim.snapshot();
  run(sim, 5, { throttle: 1, pitch: 1 });
  assert.deepEqual(sim.snapshot(), before);
  sim.paused = false;
  const time = sim.state.time;
  sim.update(NaN);
  sim.update(-1);
  assert.equal(sim.state.time, time);
  sim.snapshot().visited.push('fake');
  assert.deepEqual(sim.state.visited, []);
});
test('landmarks are optional observations, obstacles and valley bounds end flight', () => {
  const sim = new FlightSimulation({
    landmarks: [{ id: 'view', x: 0, y: 0, z: 330 }],
  });
  sim.start();
  run(sim, 0.1, {});
  assert.deepEqual(sim.state.visited, ['view']);
  sim.obstacle = () => ({ name: 'a tree' });
  run(sim, 0.1, {});
  assert.equal(sim.state.phase, 'crashed');
  assert.match(sim.state.reason, /tree/);
  sim.reset();
  sim.start();
  sim.obstacle = () => null;
  sim.state.x = 2401;
  run(sim, 0.1, {});
  assert.equal(sim.state.phase, 'crashed');
});
test('airfield runway and both approach corridors are graded and free of colliders', () => {
  for (let z = -890; z <= 890; z += 20) {
    for (const x of [-15, 0, 15]) {
      if (Math.abs(z) <= 700) assert.equal(groundHeight(x, z), 0);
      assert.equal(getObstacle(x, groundHeight(x, z) + 3, z, 4), null);
    }
  }
  assert.match(getObstacle(-100, 4, 185).name, /hangar/);
  assert.ok(groundHeight(1800, 0) > 100);
});
test('held flight keys clear on blur, hidden document and disposal', () => {
  const target = new EventTarget(),
    doc = new EventTarget();
  let blurs = 0;
  const input = new FlightInput({
    target,
    documentTarget: doc,
    onAction() {},
    onBlur() {
      blurs++;
    },
  });
  function key(code) {
    const event = new Event('keydown', { cancelable: true });
    Object.defineProperty(event, 'code', { value: code });
    target.dispatchEvent(event);
  }
  key('ArrowDown');
  key('KeyW');
  assert.equal(input.sample().pitch, 1);
  target.dispatchEvent(new Event('blur'));
  assert.equal(input.sample().pitch, 0);
  assert.equal(input.sample().throttle, 0);
  key('KeyA');
  doc.hidden = true;
  doc.dispatchEvent(new Event('visibilitychange'));
  assert.equal(input.sample().yaw, 0);
  assert.equal(blurs, 2);
  input.dispose();
  key('KeyW');
  assert.equal(input.sample().throttle, 0);
});
