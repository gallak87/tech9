import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import { createFreestyleController, landingEstimate } from './controller.js';
import { freestyleAirPoints } from './scoring.js';

const track = {
  jumps: Array.from({ length: 5 }, (_, i) => ({
    id: `jump-${i}`,
    target: i * 100,
    targetLateral: 0,
  })),
  sample: (distance) => ({
    position: new T.Vector3(0, 0, distance),
    right: new T.Vector3(1, 0, 0),
    up: new T.Vector3(0, 1, 0),
    tangent: new T.Vector3(0, 0, 1),
    quaternion: new T.Quaternion(),
  }),
};
function steps(controller, input, seconds) {
  for (let i = 0; i < Math.round(seconds * 120); i++)
    controller.step(input, 1 / 120);
}
function settle(controller, options = {}, seconds = 0.3) {
  let leg = null;
  for (let i = 0; i < Math.round(seconds * 120); i++) {
    controller.step({}, 1 / 120);
    leg ??= controller.settle({
      supported: true,
      quaternion: new T.Quaternion(),
      ...options,
    });
  }
  return leg;
}
function contact(controller, index = 0) {
  const jump = track.jumps[index];
  const quaternion = new T.Quaternion().fromArray(
    controller.snapshot().orientation,
  );
  return (
    controller.land({
      jump,
      outcome: 'landed',
      position: new T.Vector3(0, 0.72, jump.target),
      quaternion,
      velocity: new T.Vector3(0, 0, 145),
    }) ?? settle(controller, { distance: jump.target, quaternion })
  );
}

test('directional torque ramps up, coasts on release, reverses and remains bounded on diagonals', () => {
  const c = createFreestyleController({ track });
  c.launch('jump-0');
  steps(c, { aerialRoll: 1 }, 0.2);
  const ramp = c.snapshot();
  assert.ok(ramp.angular[2] > 0 && ramp.angular[2] < 3);
  const before = new T.Quaternion().fromArray(ramp.orientation);
  c.step({}, 1 / 120);
  assert.ok(c.snapshot().angular[2] > 0);
  assert.ok(
    before.angleTo(new T.Quaternion().fromArray(c.snapshot().orientation)) > 0,
  );
  steps(c, { aerialRoll: -1 }, 0.7);
  assert.ok(c.snapshot().angular[2] < -2);
  steps(c, { aerialRoll: 1, aerialPitch: 1, aerialYaw: 1 }, 3);
  assert.ok(Math.hypot(...c.snapshot().angular) <= 3.200001);
});

test('full rolls in both directions and multi-axis corkscrews are recognized without one-button animations', () => {
  for (const input of [
    { aerialRoll: 1 },
    { aerialRoll: -1 },
    { aerialPitch: 1, aerialRoll: 1 },
  ]) {
    const c = createFreestyleController({ track });
    c.launch('jump-0');
    steps(c, input, 2);
    steps(c, {}, 1);
    assert.ok(
      c
        .snapshot()
        .flight.tricks.includes(input.aerialPitch ? 'corkscrew' : 'roll'),
    );
  }
});

test('held partial rotations earn immediately and keep earning across direction changes without a full trick', () => {
  const c = createFreestyleController({ track });
  c.launch('jump-0');
  let previous = 0;
  for (let i = 0; i < 24; i++) {
    assert.equal(c.step({ aerialRoll: 1 }, 1 / 120), null);
    const current = c.snapshot().flight.rotationPoints;
    assert.ok(current > previous);
    previous = current;
  }
  assert.deepEqual(c.snapshot().flight.tricks, []);
  assert.ok(c.snapshot().progress[2] < Math.PI);
  steps(c, { aerialRoll: -1 }, 0.3);
  assert.ok(c.snapshot().flight.rotationPoints > previous);
  assert.ok(c.snapshot().angular[2] < 0);
  assert.deepEqual(c.snapshot().flight.tricks, []);
  assert.equal(c.snapshot().score, 0, 'airborne points remain provisional');
});

test('steady rotation rate scales with analog effort, stays bounded and slows during directional fine trim', () => {
  const full = createFreestyleController({ track });
  const half = createFreestyleController({ track });
  const trim = createFreestyleController({ track });
  for (const c of [full, half, trim]) c.launch('jump-0');
  steps(full, { aerialRoll: 1 }, 2);
  steps(half, { aerialRoll: 0.5 }, 2);
  steps(trim, { aerialRoll: 1, airbrake: true }, 2);
  const points = full.snapshot().flight.rotationPoints;
  assert.ok(
    Math.abs(half.snapshot().flight.rotationPoints * 2 - points) < 1e-9,
  );
  assert.ok(trim.snapshot().flight.rotationPoints < points * 0.4);
  steps(full, { aerialRoll: 1 }, 1);
  const steady = full.snapshot().flight.rotationPoints - points;
  assert.ok(steady > 790 && steady <= 800);
  const diagonal = createFreestyleController({ track });
  diagonal.launch('jump-0');
  steps(diagonal, { aerialPitch: 1, aerialYaw: 1, aerialRoll: 1 }, 2);
  assert.ok(diagonal.snapshot().flight.rotationPoints <= 1600);
});

test('ground, coasting, brake-only, stopped simulation and failed flights cannot farm rotation points', () => {
  const c = createFreestyleController({ track });
  steps(c, { aerialRoll: 1 }, 1);
  assert.equal(c.snapshot().flight, null);
  assert.equal(c.snapshot().score, 0);
  c.launch('jump-0');
  steps(c, { airbrake: true }, 1);
  assert.equal(c.snapshot().flight.rotationPoints, 0);
  steps(c, { aerialRoll: 1 }, 0.2);
  const points = c.snapshot().flight.rotationPoints;
  c.step({}, 1 / 120);
  assert.ok(c.snapshot().angular[2] > 0, 'the hull still physically coasts');
  steps(c, {}, 0.5);
  steps(c, { airbrake: true }, 0.2);
  c.step({ aerialRoll: 1 }, 0);
  assert.equal(c.snapshot().flight.rotationPoints, points);
  c.fail();
  steps(c, { aerialRoll: 1 }, 1);
  assert.equal(c.snapshot().flight.rotationPoints, points);
  c.launch('jump-1');
  assert.equal(c.snapshot().flight.rotationPoints, 0);
});

test('continuous air points survive snapshots, freeze at touchdown and bank exactly once with trick bonuses', () => {
  const a = createFreestyleController({ track });
  a.launch('jump-0');
  steps(a, { aerialRoll: 1 }, 2.4);
  assert.ok(a.snapshot().flight.tricks.includes('roll'));
  const b = createFreestyleController({ track });
  b.restore(JSON.parse(JSON.stringify(a.snapshot())));
  for (const c of [a, b]) steps(c, { aerialPitch: -0.5, aerialRoll: -1 }, 0.25);
  assert.deepEqual(a.snapshot(), b.snapshot());
  const expectedAir = freestyleAirPoints(a.snapshot());
  assert.ok(expectedAir > 1000);
  for (const c of [a, b]) {
    const exposed = c.readFrame();
    exposed.flight.rotationPoints = -1;
    assert.equal(freestyleAirPoints(c.snapshot()), expectedAir);
    c.land({
      jump: track.jumps[0],
      outcome: 'landed',
      position: new T.Vector3(0, 0.72, 0),
      quaternion: new T.Quaternion(),
      velocity: new T.Vector3(0, 0, 145),
      angularSpeed: 1.5,
    });
    assert.equal(c.snapshot().pendingLanding.style, expectedAir);
    assert.equal(c.snapshot().score, 0);
    steps(c, { aerialRoll: 1 }, 0.15);
    assert.equal(c.snapshot().pendingLanding.style, expectedAir);
    const leg = settle(c);
    assert.equal(leg.bank, Math.round(expectedAir + 1000));
    const banked = c.snapshot().score;
    assert.equal(contact(c), null);
    steps(c, { aerialRoll: 1 }, 0.2);
    assert.equal(c.snapshot().score, banked);
  }
  assert.deepEqual(a.snapshot(), b.snapshot());
});

test('five clean geometric transfers grow a chain, bank only once each, and earn gold without mandatory tricks', () => {
  const c = createFreestyleController({ track });
  for (let i = 0; i < 5; i++) {
    c.launch(track.jumps[i].id);
    steps(c, {}, 0.1);
    steps(c, { airbrake: true }, 0.25);
    const leg = contact(c, i);
    assert.equal(leg.perfect, true);
    assert.equal(leg.chain, i + 1);
    const score = c.snapshot().score;
    assert.equal(contact(c, i), null);
    assert.equal(c.snapshot().score, score);
  }
  const result = c.complete('kestrel');
  assert.equal(result.bestChain, 5);
  assert.equal(result.score, 37500);
  assert.equal(result.medal, 'Gold');
  assert.equal(result.playerValid, true);
});

test('held or early brake can settle a legitimate landing without the fresh-brake precision bonus', () => {
  const c = createFreestyleController({ track });
  steps(c, { airbrake: true }, 1);
  c.launch('jump-0');
  steps(c, { airbrake: true }, 0.3);
  const held = contact(c);
  assert.equal(held.clean, true);
  assert.equal(held.perfect, false);
  c.reset();
  c.launch('jump-0');
  steps(c, { airbrake: true }, 1);
  const early = contact(c);
  assert.equal(early.clean, true);
  assert.equal(early.perfect, false);
});

test('an unrecovered landing breaks the link while a supported scrape can recover', () => {
  const c = createFreestyleController({ track });
  c.launch('jump-0');
  steps(c, {}, 0.1);
  steps(c, { airbrake: true }, 0.25);
  contact(c);
  assert.equal(c.snapshot().score, 2500);
  c.launch('jump-1');
  steps(c, { aerialRoll: 1 }, 1);
  steps(c, { airbrake: true }, 0.25);
  assert.equal(contact(c, 1).clean, false);
  assert.equal(c.snapshot().chain, 0);
  assert.equal(c.snapshot().score, 2500);
  c.launch('jump-2');
  steps(c, {}, 0.1);
  steps(c, { airbrake: true }, 0.25);
  c.damage();
  const scraped = contact(c, 2);
  assert.equal(scraped.clean, false);
  assert.equal(scraped.landed, true);
  assert.equal(scraped.chain, 1);
});

test('pause-safe snapshots replay torque and points, while partial routes and manual recovery stay unranked', () => {
  const a = createFreestyleController({ track }),
    b = createFreestyleController({ track });
  a.launch('jump-0');
  steps(a, { aerialPitch: -1 }, 1);
  const saved = JSON.parse(JSON.stringify(a.snapshot()));
  b.restore(saved);
  steps(a, { aerialRoll: 1 }, 0.5);
  steps(b, { aerialRoll: 1 }, 0.5);
  assert.deepEqual(a.snapshot(), b.snapshot());
  assert.equal(a.complete('kestrel').playerValid, false);
  b.invalidate();
  assert.equal(b.complete('kestrel').playerValid, false);
});

test('touchdown scoring uses the actual receiving bank rather than its distant precision marker', () => {
  const jump = {
    id: 'curving-bank',
    label: 'Crown Hook',
    target: 250,
    landingStart: 100,
    landingEnd: 350,
    targetLateral: 0,
    catchWidth: 34,
  };
  const sample = (distance) => {
    const quaternion = new T.Quaternion().setFromAxisAngle(
      new T.Vector3(0, 0, 1),
      distance * 0.004,
    );
    return {
      position: new T.Vector3(0, 0, distance),
      quaternion,
      tangent: new T.Vector3(0, 0, 1),
      right: new T.Vector3(1, 0, 0).applyQuaternion(quaternion),
      up: new T.Vector3(0, 1, 0).applyQuaternion(quaternion),
    };
  };
  const course = { jumps: [jump], sample };
  const c = createFreestyleController({ track: course });
  c.launch(jump.id);
  steps(c, {}, 0.5);
  const frame = sample(110);
  c.land({
    jump,
    distance: 110,
    lateral: 0,
    outcome: 'landed',
    position: frame.position.clone().addScaledVector(frame.up, 0.72),
    quaternion: frame.quaternion,
    velocity: frame.tangent.clone().multiplyScalar(145),
  });
  const leg = settle(c, { distance: 110, quaternion: frame.quaternion });
  assert.equal(leg.clean, true);
  assert.equal(leg.perfect, false);
  assert.equal(leg.reason, 'Clean banked catch');
  assert.equal(leg.bank, 2000);
});

test('a recovered rotation or off-bank arrival receives landing points and preserves its chain', () => {
  for (const [quaternion, angularSpeed] of [
    [new T.Quaternion(), 1.4],
    [new T.Quaternion().setFromAxisAngle(new T.Vector3(0, 0, 1), 0.55), 0],
  ]) {
    const c = createFreestyleController({ track });
    c.launch('jump-0');
    steps(c, {}, 0.5);
    assert.equal(
      c.land({
        jump: track.jumps[0],
        distance: 0,
        lateral: 0,
        outcome: 'landed',
        position: new T.Vector3(0, 0.72, 0),
        quaternion,
        velocity: new T.Vector3(0, 0, 145),
        angularSpeed,
      }),
      null,
    );
    assert.equal(
      c.snapshot().score,
      0,
      'first contact cannot bank unproven support',
    );
    const leg = settle(c);
    assert.equal(leg.landed, true);
    assert.equal(leg.clean, false);
    assert.equal(leg.perfect, false);
    assert.equal(leg.reason, 'Recovered landing');
    assert.equal(leg.bank, 1000);
    assert.equal(leg.chain, 1);
  }
});

test('settlement retains the marked receiver boundary instead of crediting arbitrary supported road', () => {
  const c = createFreestyleController({ track });
  c.launch('jump-0');
  c.land({
    jump: track.jumps[0],
    distance: 0,
    lateral: 9,
    outcome: 'landed',
    position: new T.Vector3(9, 0.72, 0),
    quaternion: new T.Quaternion(),
    velocity: new T.Vector3(0, 0, 145),
  });
  const leg = settle(c, { distance: 0, lateral: 9 });
  assert.equal(leg.landed, false);
  assert.equal(leg.bank, 0);
  assert.equal(leg.reason, 'Outside landing zone');
});

test('bouncing away, staying unsettled or a real miss cannot bank a landing', () => {
  for (const observation of [
    { supported: false },
    { angularSpeed: 2 },
    { normalSpeed: 12 },
    { supportError: 3 },
  ]) {
    const c = createFreestyleController({ track });
    c.launch('jump-0');
    c.land({
      jump: track.jumps[0],
      outcome: 'landed',
      position: new T.Vector3(0, 0.72, 0),
      quaternion: new T.Quaternion(),
      velocity: new T.Vector3(0, 0, 145),
    });
    const leg = settle(c, observation);
    assert.equal(leg.landed, false);
    assert.equal(leg.bank, 0);
    assert.equal(leg.chain, 0);
  }
  const c = createFreestyleController({ track });
  c.launch('jump-0');
  c.land({
    jump: track.jumps[0],
    outcome: 'landed',
    position: new T.Vector3(0, 0.72, 0),
    quaternion: new T.Quaternion(),
    velocity: new T.Vector3(0, 0, 145),
  });
  c.fail();
  assert.equal(
    c.settle({ supported: true, quaternion: new T.Quaternion() }).landed,
    false,
  );
});

test('settling snapshots replay exactly; held grounded axes cannot farm tricks, upgrade arrival quality or bank twice', () => {
  const a = createFreestyleController({ track });
  a.launch('jump-0');
  steps(a, { aerialRoll: 1 }, 0.2);
  a.land({
    jump: track.jumps[0],
    outcome: 'landed',
    position: new T.Vector3(0, 0.72, 0),
    quaternion: new T.Quaternion(),
    velocity: new T.Vector3(0, 0, 145),
    angularSpeed: 1.5,
  });
  const touchdownStyle = a.snapshot().pendingLanding.style;
  settle(a, {}, 0.1);
  const b = createFreestyleController({ track });
  b.restore(JSON.parse(JSON.stringify(a.snapshot())));
  assert.equal(
    a.complete('shrike'),
    null,
    'results wait for the pending touchdown',
  );
  for (let i = 0; i < 30; i++)
    for (const c of [a, b]) {
      c.step({ aerialRoll: 1, airbrake: true }, 1 / 120);
      c.settle({ supported: true, quaternion: new T.Quaternion() });
    }
  assert.deepEqual(a.snapshot(), b.snapshot());
  assert.equal(a.snapshot().legs.length, 1);
  assert.equal(a.snapshot().legs[0].bank, Math.round(1000 + touchdownStyle));
  assert.equal(a.snapshot().legs[0].perfect, false);
  assert.deepEqual(a.snapshot().legs[0].tricks, []);
  assert.equal(
    a.settle({ supported: true, quaternion: new T.Quaternion() }),
    null,
  );
});

test('holding the rotation brake permits slow deliberate bank trim instead of fighting a full-speed spin', () => {
  const c = createFreestyleController({ track });
  c.launch('jump-0');
  steps(c, { aerialRoll: 1, airbrake: true }, 1);
  const snapshot = c.snapshot();
  assert.ok(snapshot.angular[2] > 0.7 && snapshot.angular[2] < 0.8);
  assert.ok(snapshot.progress[2] < 0.8);
  steps(c, { airbrake: true }, 0.3);
  assert.ok(c.snapshot().angular[2] < 0.025);
});

test('touchdown guidance uses the course gravity while retaining the default ballistic estimate', () => {
  const plane = {
    sample: () => ({ position: new T.Vector3(), up: new T.Vector3(0, 1, 0) }),
  };
  const pose = { position: new T.Vector3(0, 100, 0) };
  const velocity = new T.Vector3();
  const jump = { target: 0 };
  const ordinary = landingEstimate(plane, jump, pose, velocity);
  const skywell = landingEstimate(plane, jump, pose, velocity, {
    gravity: 18,
    timeout: 10,
  });
  assert.ok(Math.abs(ordinary - Math.sqrt((2 * (100 - 0.72)) / 26)) < 1e-8);
  assert.ok(Math.abs(skywell - Math.sqrt((2 * (100 - 0.72)) / 18)) < 1e-8);
  assert.ok(skywell > ordinary);
});
