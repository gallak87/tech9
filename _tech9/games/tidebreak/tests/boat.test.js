import test from 'node:test';
import assert from 'node:assert/strict';
import { BoatSimulation } from '../src/game/BoatSimulation.js';
import { LapRules } from '../src/game/LapRules.js';
import { VESSELS, getVessel } from '../src/game/vessels.js';
import {
  START,
  GATES,
  DOCK_ZONE,
  DOCK_PARTS,
  OCEAN_HALF,
  isNavigable,
} from '../src/world/islandDefinition.js';

const close = (actual, expected, tolerance = 1e-8) =>
  assert.ok(
    Math.abs(actual - expected) < tolerance,
    `${actual} != ${expected}`,
  );

function move(boat, seconds, input = {}) {
  for (let frame = 0; frame < Math.round(seconds * 60); frame++)
    boat.step(1 / 60, input);
}

function crossing(gate, forward = true, offset = 0) {
  const side = forward ? 1 : -1;
  const center = { x: gate.x - gate.nz * offset, z: gate.z + gate.nx * offset };
  return [
    { x: center.x - gate.nx * side * 2, z: center.z - gate.nz * side * 2 },
    {
      x: center.x + gate.nx * side * 2,
      z: center.z + gate.nz * side * 2,
      vx: 0,
      vz: 0,
    },
  ];
}

function passGates(rules) {
  for (const gate of GATES) rules.update(1, ...crossing(gate));
}

function dockedBoat(vx = 0, vz = 0) {
  return { x: DOCK_ZONE.x, z: DOCK_ZONE.z, vx, vz, speed: vx };
}

test('boat accelerates, carries momentum, brakes and reverses; reset clears all motion', () => {
  const boat = new BoatSimulation();
  assert.deepEqual(
    [boat.x, boat.z, boat.heading],
    [START.x, START.z, START.heading],
  );
  move(boat, 12, { throttle: 1 });
  assert.ok(boat.speed > 6 && boat.speed < 6.6, 'cruise settles near 6.5 m/s');
  const cruising = boat.snapshot();
  move(boat, 1);
  assert.ok(boat.x > cruising.x + 4, 'release carries the hull forward');
  assert.ok(
    boat.speed > 3 && boat.speed < cruising.speed,
    'water drag slows the hull',
  );
  move(boat, 3, { throttle: -1 });
  assert.ok(boat.speed < -0.5, 'braking progresses into reverse');
  assert.ok(boat.vx < 0);
  move(boat, 2, { throttle: 1 });
  assert.ok(boat.speed > 0, 'forward throttle recovers from reverse');
  boat.reset();
  assert.deepEqual(boat.snapshot(), {
    vesselId: 'schooner',
    footprint: getVessel('schooner').footprint,
    ...START,
    speed: 0,
    planarSpeed: 0,
    vx: 0,
    vz: 0,
    steer: 0,
    collisions: 0,
  });
});

test('ship selection resets motion, survives restart, and uses a safe default', () => {
  const boat = new BoatSimulation();
  assert.equal(boat.vessel, getVessel('schooner'));
  assert.equal(getVessel('missing'), boat.vessel);
  assert.equal(new BoatSimulation('galleon').vessel.id, 'galleon');
  boat.step(3, { throttle: 1, steer: 0.5 });
  const selected = boat.selectVessel('galleon');
  assert.equal(selected.vesselId, 'galleon');
  assert.equal(boat.vessel.name, 'Resolute');
  assert.deepEqual(
    [
      boat.x,
      boat.z,
      boat.heading,
      boat.speed,
      boat.vx,
      boat.vz,
      boat.steer,
      boat.collisions,
    ],
    [START.x, START.z, START.heading, 0, 0, 0, 0, 0],
  );
  boat.step(3, { throttle: 1 });
  boat.reset();
  assert.equal(
    boat.snapshot().vesselId,
    'galleon',
    'restart retains the selected ship',
  );
  assert.equal(boat.speed, 0);
  boat.selectVessel('unavailable');
  assert.equal(boat.vessel.name, 'Kestrel');
  assert.equal(boat.snapshot().vesselId, 'schooner');
});

test('both assisted sailing ships retain the same drive and steering response', () => {
  const ships = VESSELS.map((vessel) => new BoatSimulation(vessel.id));
  for (const boat of ships) {
    boat.x = 160;
    boat.z = 160;
    boat.step(8, { throttle: 1, steer: -0.2 });
  }
  for (const key of ['x', 'z', 'heading', 'vx', 'vz', 'speed', 'steer'])
    close(ships[0][key], ships[1][key]);
});

test('steering needs speed, turns right while moving forward, and reverses with the hull', () => {
  const boat = new BoatSimulation();
  boat.x = 180;
  boat.z = 180;
  boat.heading = 0;
  move(boat, 2, { steer: 1 });
  close(boat.heading, 0);
  move(boat, 6, { throttle: 1 });
  move(boat, 2, { throttle: 1, steer: 1 });
  assert.ok(boat.heading > 0.7, 'right rudder produces a useful turn');
  assert.ok(boat.vx > 0);
  const sideVelocity =
    boat.vx * Math.cos(boat.heading) + boat.vz * Math.sin(boat.heading);
  assert.ok(
    Math.abs(sideVelocity) > 0.1,
    'turning retains some sideways momentum',
  );

  boat.reset();
  boat.x = 180;
  boat.z = 180;
  boat.heading = 0;
  move(boat, 5, { throttle: -1 });
  move(boat, 2, { throttle: -1, steer: 1 });
  assert.ok(boat.heading < -0.3);
  assert.ok(boat.speed < -2 && boat.speed > -3.5);
});

test('fixed motion ticks are independent of caller frame subdivision', () => {
  const once = new BoatSimulation();
  const frames = new BoatSimulation();
  once.step(3, { throttle: 1, steer: -0.3 });
  move(frames, 3, { throttle: 1, steer: -0.3 });
  for (const key of ['x', 'z', 'heading', 'vx', 'vz', 'speed', 'steer'])
    close(once[key], frames[key]);
  const irregular = new BoatSimulation();
  for (let i = 0; i < 100; i++) {
    irregular.step(0.013, { throttle: 1, steer: -0.3 });
    irregular.step(0.017, { throttle: 1, steer: -0.3 });
  }
  for (const key of ['x', 'z', 'heading', 'vx', 'vz'])
    close(once[key], irregular[key]);
});

test('swept movement stops at the authored coast, rocks, dock and finite ocean bounds', () => {
  for (const vessel of VESSELS) {
    for (let i = 0; i < 16; i++) {
      const angle = (i / 16) * Math.PI * 2;
      const boat = new BoatSimulation(vessel.id);
      boat.x = Math.cos(angle) * 125;
      boat.z = Math.sin(angle) * 125;
      boat.heading = Math.atan2(-boat.x, boat.z);
      for (let frame = 0; frame < 80; frame++) {
        boat.step(0.25, { throttle: 1 });
        assert.ok(
          isNavigable(boat.x, boat.z, vessel.footprint),
          `${vessel.id} coast approach ${i} keeps its full footprint in water`,
        );
      }
      assert.ok(
        boat.collisions > 0,
        `approach ${i} reaches a solid shoreline proxy`,
      );
    }
    const dock = new BoatSimulation(vessel.id);
    dock.x = 25;
    dock.z = 101;
    dock.heading = -Math.PI / 2;
    dock.step(12, { throttle: 1 });
    const dockEdge = DOCK_PARTS[1].x + DOCK_PARTS[1].width / 2;
    assert.ok(
      dock.x >= dockEdge + vessel.footprint &&
        dock.x < dockEdge + vessel.footprint + 0.2,
      `${vessel.id} stops its hull outside the authored dock`,
    );
    assert.ok(isNavigable(dock.x, dock.z, vessel.footprint));
    const contactX = dock.x;
    dock.step(3, { throttle: -1 });
    assert.ok(
      dock.x > contactX + 2,
      `${vessel.id} can reverse away from the jetty`,
    );

    const edge = new BoatSimulation(vessel.id);
    edge.x = 250;
    edge.step(10, { throttle: 1 });
    assert.ok(isNavigable(edge.x, edge.z, vessel.footprint));
    assert.ok(edge.x <= OCEAN_HALF - vessel.footprint);
    assert.ok(edge.collisions > 0);
  }
});

test('shore collision leaves reverse available, and glancing impacts retain a free component', () => {
  const boat = new BoatSimulation();
  boat.x = 110;
  boat.z = 0;
  boat.heading = -Math.PI / 2;
  boat.step(12, { throttle: 1 });
  assert.ok(boat.collisions > 0);
  const contactX = boat.x;
  boat.step(3, { throttle: -1 });
  assert.ok(boat.x > contactX + 2, 'reverse moves away from contact');
  assert.ok(boat.speed < -1);
  assert.ok(isNavigable(boat.x, boat.z));

  const glance = new BoatSimulation();
  glance.x = OCEAN_HALF - glance.vessel.footprint - 1;
  glance.z = 130;
  glance.heading = Math.PI / 4;
  glance.step(6, { throttle: 1 });
  assert.ok(glance.collisions > 0);
  assert.ok(
    glance.z < 123,
    'free forward component slides along the ocean edge',
  );
  assert.ok(isNavigable(glance.x, glance.z));
});

test('gates require ordered forward crossing within the opening and can be retried', () => {
  const rules = new LapRules();
  rules.start();
  rules.update(1, ...crossing(GATES[1]));
  assert.equal(rules.nextGate, 0, 'out-of-order gate does not count');
  rules.update(1, ...crossing(GATES[0], false));
  assert.equal(rules.nextGate, 0, 'backwards crossing does not count');
  rules.update(1, ...crossing(GATES[0], true, GATES[0].halfWidth + 0.1));
  assert.equal(
    rules.nextGate,
    0,
    'crossing outside buoy opening does not count',
  );
  const center = { x: GATES[0].x, z: GATES[0].z, vx: 0, vz: 0 };
  rules.update(1, center, center);
  assert.equal(rules.nextGate, 0, 'sitting on a gate cannot count');
  rules.update(1, ...crossing(GATES[0]));
  assert.equal(rules.nextGate, 1, 'missed gate can be approached again');
  rules.update(1, ...crossing(GATES[0]));
  assert.equal(rules.nextGate, 1, 'completed gate cannot count twice');
  rules.update(1, ...crossing(GATES[1]));
  rules.update(1, ...crossing(GATES[2]));
  assert.equal(rules.nextGate, 3);
  assert.equal(rules.state, 'running');
});

test('gate opening is evaluated at swept intersection rather than endpoint', () => {
  const gate = { x: 0, z: 0, nx: 0, nz: -1, halfWidth: 2, name: 'Test gate' };
  const rules = new LapRules({ gates: [gate] });
  rules.start();
  rules.update(1, { x: -3, z: 2 }, { x: 3, z: -2, vx: 6, vz: -4 });
  assert.equal(
    rules.nextGate,
    1,
    'segment crosses opening while both endpoints are outside it',
  );
});

test('docking needs all gates, low actual planar speed and a continuous hold', () => {
  const rules = new LapRules();
  rules.start();
  const still = dockedBoat();
  rules.update(2, still, still);
  assert.equal(rules.state, 'running');
  assert.equal(rules.dockHold, 0, 'cannot win at the starting dock');
  passGates(rules);
  const reverse = dockedBoat(-3);
  rules.update(2, reverse, reverse);
  assert.equal(rules.dockHold, 0, 'fast reverse is not a gentle landing');
  const sideways = { ...dockedBoat(0, 2), speed: 0 };
  rules.update(2, sideways, sideways);
  assert.equal(rules.dockHold, 0, 'sideways speed also counts');
  rules.update(1, dockedBoat(0.8), dockedBoat(0.8));
  assert.equal(rules.dockHold, 0, 'must be below the displayed threshold');
  rules.update(0.8, still, still);
  assert.equal(rules.state, 'running');
  const outside = { ...still, x: still.x + DOCK_ZONE.radius + 0.1 };
  rules.update(0.1, still, outside);
  assert.equal(rules.dockHold, 0, 'leaving the dock resets the hold');
  rules.update(0.1, outside, still);
  assert.equal(
    rules.dockHold,
    0,
    'entering the dock does not credit time outside it',
  );
  rules.update(0.6, still, still);
  rules.update(0.6, still, still);
  assert.equal(rules.state, 'finished');
  close(rules.dockHold, 1.2);
  close(rules.best, rules.elapsed);
});

test('pause freezes route and time; restart clears route but retains session best', () => {
  const rules = new LapRules();
  assert.equal(rules.state, 'ready');
  rules.update(5, ...crossing(GATES[0]));
  assert.equal(rules.elapsed, 0);
  rules.start();
  rules.update(1, ...crossing(GATES[0]));
  rules.pause();
  const paused = rules.snapshot();
  rules.update(10, ...crossing(GATES[1]));
  assert.deepEqual(rules.snapshot(), paused);
  rules.resume();
  rules.update(1, ...crossing(GATES[1]));
  rules.update(1, ...crossing(GATES[2]));
  rules.update(1.2, dockedBoat(), dockedBoat());
  close(rules.best, 4.2);
  const completed = rules.snapshot();
  rules.update(10, dockedBoat(), dockedBoat());
  assert.deepEqual(rules.snapshot(), completed);
  rules.reset();
  assert.equal(rules.state, 'ready');
  assert.equal(rules.nextGate, 0);
  assert.equal(rules.elapsed, 0);
  assert.equal(rules.dockHold, 0);
  close(rules.best, 4.2);
  rules.start();
  rules.update(5, dockedBoat(), dockedBoat());
  passGates(rules);
  rules.update(1.2, dockedBoat(), dockedBoat());
  close(rules.best, 4.2, 1e-8);
});
