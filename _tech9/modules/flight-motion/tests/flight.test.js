import test from 'node:test';
import assert from 'node:assert/strict';
import { FlightSimulation, FLIGHT_PROFILES } from '../src/FlightSimulation.js';
import { FlightInput } from '../src/FlightInput.js';

const near = (actual, expected) =>
  assert.ok(Math.abs(actual - expected) < 1e-8, `${actual} != ${expected}`);
const run = (flight, seconds, input = {}, fps = 60) => {
  for (let i = 0; i < seconds * fps; i++) flight.step(1 / fps, input);
  return flight.snapshot();
};
const until = (flight, predicate, input = {}, maxSeconds = 15) => {
  for (let i = 0; i < maxSeconds * 120; i++) {
    const state = flight.step(1 / 120, input);
    if (predicate(state)) return state;
  }
  assert.fail('Expected flight state was not reached.');
};

for (const profile of ['trainer', 'sport']) {
  test(`${profile} taxis, rotates and climbs using its handling profile`, () => {
    const h = FLIGHT_PROFILES[profile];
    const flight = new FlightSimulation({
      profile,
      spawn: { x: 120, z: 330, heading: Math.PI / 2 },
      groundHeight: () => 17,
    });
    assert.equal(flight.snapshot().y, 17 + h.groundClearance);
    const airborne = until(flight, (state) => !state.grounded, {
      throttle: 1,
      pitch: 0.7,
    });
    assert.ok(airborne.speed >= h.takeoffSpeed);
    assert.ok(airborne.x > 150 && Math.abs(airborne.z - 330) < 1e-8);
    const climb = run(flight, 1, { throttle: 1, pitch: 0.2 });
    assert.ok(climb.y > airborne.y + 1 && climb.verticalSpeed > 0);
    assert.equal(climb.stall, false);
  });

  test(`${profile} coordinated turns and leveling preserve controllable flight`, () => {
    const spawn = {
      x: 12,
      z: -30,
      y: 300,
      heading: 0,
      speed: 40,
      throttle: 0.65,
    };
    const turn = run(new FlightSimulation({ profile, spawn }), 2, {
      roll: 0.3,
      yaw: 0.1,
    });
    assert.ok(turn.heading > 0 && turn.roll > 0 && turn.x > spawn.x);
    const recovery = { ...spawn, pitch: 0.3, roll: 0.65 };
    const assisted = run(
      new FlightSimulation({ profile, spawn: recovery }),
      1,
      { level: true },
    );
    const natural = run(new FlightSimulation({ profile, spawn: recovery }), 1);
    assert.ok(Math.abs(assisted.roll) < Math.abs(natural.roll) / 4);
    assert.ok(
      Math.abs(assisted.pitch - 0.015) < Math.abs(natural.pitch - 0.015) / 4,
    );
  });

  test(`${profile} stall sink and touchdown observations work away from an airfield`, () => {
    const stalled = run(
      new FlightSimulation({
        profile,
        spawn: { x: 0, z: 0, y: 300, heading: 0, speed: 10 },
      }),
      1,
    );
    assert.equal(stalled.stall, true);
    assert.ok(stalled.verticalSpeed < -10 && stalled.y < 295);
    const ground = (x, z) => 25 + x * 0.001 + z * 0.002;
    const spawn = {
      x: 400,
      z: -900,
      heading: 1.2,
      speed: 32,
      y: ground(400, -900) + FLIGHT_PROFILES[profile].groundClearance + 1,
      verticalSpeed: -5,
      pitch: -0.08,
    };
    const flight = new FlightSimulation({
      profile,
      spawn,
      groundHeight: ground,
    });
    const landed = until(
      flight,
      (state) => state.contact?.kind === 'ground',
      {},
      2,
    );
    assert.equal(landed.grounded, true);
    assert.equal(landed.verticalSpeed, 0);
    assert.ok(landed.contact.verticalSpeed < -2 && landed.contact.speed > 25);
    near(
      landed.y,
      ground(landed.x, landed.z) + FLIGHT_PROFILES[profile].groundClearance,
    );
    const observation = flight.snapshot();
    observation.contact.verticalSpeed = 999;
    assert.ok(flight.snapshot().contact.verticalSpeed < 0);
    const after = flight.step(1 / 120, { brake: true });
    assert.equal(after.contact, null);
    assert.ok(after.speed < landed.speed);
  });
}

test('hard touchdown reports impact attitude and sink before ground response', () => {
  const flight = new FlightSimulation({
    spawn: {
      x: 0,
      z: 0,
      heading: 0,
      y: 2,
      speed: 35,
      verticalSpeed: -24,
      pitch: -0.4,
      roll: 0.6,
    },
  });
  const contact = until(flight, (state) => state.contact, {}, 1);
  assert.equal(contact.contact.kind, 'ground');
  assert.ok(contact.contact.verticalSpeed < -15 && contact.contact.roll > 0.5);
  assert.equal(contact.grounded, true);
  assert.equal(contact.verticalSpeed, 0);
  assert.ok(contact.speed > 0);
});

test('swept obstacle contacts stop at a clear pose and own the returned descriptor', () => {
  const hit = { id: 'wall', material: { name: 'stone' } };
  const radii = [];
  const flight = new FlightSimulation({
    footprint: 0.3,
    handling: { acceleration: 0, drag: 0 },
    spawn: { x: 0, z: 0, heading: 0, speed: 1000 },
    obstacle: (x, y, z, radius) => {
      radii.push(radius);
      return Math.abs(z + 2) <= radius ? hit : null;
    },
  });
  const impact = flight.step(1 / 60);
  assert.equal(impact.contact.kind, 'obstacle');
  assert.ok(impact.z > -1.7 && impact.z < 0);
  assert.equal(impact.speed, 0);
  assert.ok(impact.contact.speed > 990);
  assert.ok(radii.every((radius) => radius === 0.3));
  hit.material.name = 'changed';
  impact.contact.obstacle.material.name = 'also changed';
  assert.equal(flight.snapshot().contact.obstacle.material.name, 'stone');
  impact.x = 900;
  assert.notEqual(flight.snapshot().x, 900);
});

test('fixed ticks agree across frame rates for both profiles; frame stalls are bounded', () => {
  for (const profile of ['trainer', 'sport']) {
    const options = {
      profile,
      spawn: { x: 50, z: -20, y: 500, heading: 0.4, speed: 40, throttle: 0.7 },
    };
    const controls = { roll: 0.08, pitch: 0.04, yaw: -0.03, throttle: 0.05 };
    const slow = run(new FlightSimulation(options), 4, controls, 30);
    const fast = run(new FlightSimulation(options), 4, controls, 144);
    for (const key of [
      'x',
      'y',
      'z',
      'heading',
      'pitch',
      'roll',
      'speed',
      'verticalSpeed',
      'throttle',
    ])
      near(slow[key], fast[key]);
    const a = new FlightSimulation(options),
      b = new FlightSimulation(options);
    assert.deepEqual(a.step(90, controls), b.step(0.1, controls));
  }
});

test('spawn reset is atomic and respects relocated ground, altitude and obstacles', () => {
  const flight = new FlightSimulation({
    groundHeight: (x) => 10 + x * 0.1,
    obstacle: (x) => (x < 0 ? 'ridge' : null),
  });
  run(flight, 2, { throttle: 1 });
  const before = flight.snapshot();
  for (const spawn of [
    { x: -1, z: 0, heading: 0 },
    { x: 1, y: 0, z: 0, heading: 0 },
    { x: NaN, z: 0, heading: 0 },
  ])
    assert.throws(() => flight.reset(spawn));
  assert.deepEqual(flight.snapshot(), before);
  flight.reset({ x: 40, z: 80, heading: Math.PI * 4 + 0.5 });
  near(flight.snapshot().y, 14 + 1.35);
  near(flight.snapshot().heading, 0.5);
  run(flight, 2, { throttle: 1 });
  assert.deepEqual(flight.reset(), {
    x: 40,
    y: 15.35,
    z: 80,
    heading: flight.snapshot().heading,
    pitch: 0,
    roll: 0,
    speed: 0,
    verticalSpeed: 0,
    throttle: 0,
    grounded: true,
    stall: false,
    pitchInput: 0,
    rollInput: 0,
    yawInput: 0,
    contact: null,
  });
});

test('invalid tuning and ground queries fail early; invalid axes and frame times stay finite', () => {
  for (const options of [
    { profile: 'unknown' },
    { handling: { lift: 20 } },
    { handling: { stallSpeed: 0 } },
    { handling: { drag: -1 } },
    { handling: { takeoffSpeed: 10 } },
    { footprint: Infinity },
    { maxFrameTime: 4 },
    { groundHeight: () => NaN },
  ])
    assert.throws(() => new FlightSimulation(options));
  const flight = new FlightSimulation();
  const before = flight.snapshot();
  for (const dt of [NaN, Infinity, -1, 0])
    assert.deepEqual(flight.step(dt), before);
  const bad = flight.step(1 / 60, {
    pitch: NaN,
    roll: Infinity,
    yaw: '1',
    throttle: NaN,
  });
  assert.equal(bad.pitchInput, 0);
  assert.equal(bad.rollInput, 0);
  assert.equal(bad.yawInput, 0);
  assert.ok(
    Object.values(bad)
      .filter((value) => typeof value === 'number')
      .every(Number.isFinite),
  );
  const good = new FlightSimulation();
  assert.deepEqual(
    flight.step(1 / 60, { throttle: 100 }),
    good.step(1 / 60, { throttle: 1 }),
  );
});

function fixture(options = {}) {
  const window = new EventTarget(),
    document = new EventTarget();
  document.activeElement = null;
  document.hidden = false;
  const pauses = [],
    actions = [];
  const adapter = new FlightInput({
    window,
    document,
    enabled: true,
    onPause: (reason) => pauses.push(reason),
    onAction: (action) => actions.push(action),
    actions: { KeyC: 'camera' },
    ...options,
  });
  const key = (code, type = 'keydown', repeat = false) => {
    const event = new Event(type, { cancelable: true });
    Object.assign(event, { code, repeat });
    window.dispatchEvent(event);
    return event;
  };
  return { window, document, adapter, pauses, actions, key };
}

test('flight input maps all axes, supports partial bindings and releases each control', () => {
  const f = fixture({ bindings: { throttleUp: ['KeyE'] } });
  for (const code of [
    'KeyE',
    'ArrowDown',
    'ArrowRight',
    'KeyD',
    'KeyB',
    'Space',
  ])
    f.key(code);
  assert.deepEqual(f.adapter.sample(), {
    pitch: 1,
    roll: 1,
    yaw: 1,
    throttle: 1,
    brake: true,
    level: true,
  });
  for (const code of [
    'KeyE',
    'ArrowDown',
    'ArrowRight',
    'KeyD',
    'KeyB',
    'Space',
  ])
    f.key(code, 'keyup');
  f.key('KeyW');
  assert.equal(f.adapter.sample().throttle, 0);
  for (const code of ['KeyS', 'ArrowUp', 'ArrowLeft', 'KeyA']) f.key(code);
  assert.deepEqual(f.adapter.sample(), {
    pitch: -1,
    roll: -1,
    yaw: -1,
    throttle: -1,
    brake: false,
    level: false,
  });
  f.adapter.dispose();
});

test('input clears for pause, actions and menu focus without repeat-key resurrection', () => {
  const f = fixture();
  f.key('KeyW');
  f.key('KeyP');
  assert.deepEqual(f.pauses, ['keyboard']);
  assert.equal(f.adapter.sample().throttle, 0);
  f.adapter.setEnabled(true);
  f.key('KeyW', 'keydown', true);
  assert.equal(f.adapter.sample().throttle, 0);
  f.key('KeyW', 'keyup');
  f.key('KeyW');
  f.key('KeyC');
  f.key('KeyC', 'keydown', true);
  assert.deepEqual(f.actions, ['camera']);
  assert.equal(f.adapter.sample().throttle, 0);
  for (const tagName of ['INPUT', 'SELECT', 'TEXTAREA', 'BUTTON']) {
    f.document.activeElement = { tagName };
    assert.equal(f.key('ArrowDown').defaultPrevented, false);
    assert.equal(f.adapter.sample().pitch, 0);
  }
  f.document.activeElement = { isContentEditable: true };
  assert.equal(f.key('Space').defaultPrevented, false);
  f.adapter.dispose();
  f.adapter.setEnabled(true);
  f.document.activeElement = null;
  f.key('KeyW');
  assert.equal(f.adapter.sample().throttle, 0);
  assert.equal(f.key('KeyC').defaultPrevented, false);
});

test('blur and hidden document disable input once and release listeners', () => {
  const f = fixture();
  f.key('KeyW');
  f.window.dispatchEvent(new Event('blur'));
  f.window.dispatchEvent(new Event('blur'));
  f.adapter.setEnabled(true);
  f.document.hidden = true;
  f.document.dispatchEvent(new Event('visibilitychange'));
  assert.deepEqual(f.pauses, ['blur', 'hidden']);
  assert.equal(f.adapter.sample().throttle, 0);
  f.adapter.dispose();
  f.window.dispatchEvent(new Event('blur'));
  f.key('KeyC');
  assert.deepEqual(f.pauses, ['blur', 'hidden']);
  assert.deepEqual(f.actions, []);
});
