import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import * as T from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import {
  createCollisionWorld,
  indexedTriangles,
  COLLISION_RULES,
} from '../src/physics/collision-world.js';
import { projectedHullExtent } from '../src/physics/hull.js';
import { createFlightModel } from '../src/physics/flight.js';
import { createVehicleState } from '../src/physics/index.js';
import { createRace } from '../src/race/index.js';
import { createDeviceRuntime } from '../src/pickups/runtime.js';
import {
  advanceSession,
  captureInitial,
  runtimeIdentity,
  compatibleRuntime,
} from '../src/core/session-runtime.js';
import createSaffronLevel from '../src/levels/saffron/index.js';
import kit from '../src/levels/saffron/collision-kit.json' with { type: 'json' };
import {
  createLandformSurvey,
  createTerrain,
} from '../src/levels/saffron/environment/terrain.js';
import { createResources } from '../src/levels/saffron/environment/geometry.js';
import { createSaffronRoad } from '../src/levels/saffron/track/road.js';

const DT = 1 / 120;
const model = createFlightModel();
const pose = (x, y, z, yaw = 0) => ({
  position: new T.Vector3(x, y, z),
  quaternion: new T.Quaternion().setFromAxisAngle(new T.Vector3(0, 1, 0), yaw),
});
const plane = (x0, x1, y, z0, z1, info) => [
  {
    ...info,
    points: [
      [x0, y, z0],
      [x0, y, z1],
      [x1, y, z0],
    ],
  },
  {
    ...info,
    points: [
      [x0, y, z1],
      [x1, y, z1],
      [x1, y, z0],
    ],
  },
];
function box(position, size, info) {
  const data = new T.BoxGeometry(...size);
  const result = indexedTriangles(
    data.attributes.position.array,
    data.index.array,
    info,
    new T.Matrix4().makeTranslation(...position),
  );
  data.dispose();
  return result;
}
const jump = {
  id: 'transfer',
  takeoff: 100,
  landingStart: 200,
  landingEnd: 500,
  recovery: 550,
  halfWidth: 10,
};
const track = {
  id: 'flat',
  name: 'flat',
  length: 1000,
  width: 20,
  jumps: [jump],
  scenarios: {},
  checkpoints: [{ distance: 0 }, { distance: 200 }, { distance: 700 }],
  sample(distance) {
    return {
      position: new T.Vector3(0, 0, distance),
      tangent: new T.Vector3(0, 0, 1),
      right: new T.Vector3(1, 0, 0),
      up: new T.Vector3(0, 1, 0),
      quaternion: new T.Quaternion(),
      curvature: 0,
      bank: 0,
    };
  },
};
const triangles = [
  ...plane(-10, 10, 0, 200, 500, {
    id: 'deck',
    kind: 'deck',
    start: 200,
    end: 500,
  }),
  ...box([10, 1.5, 350], [0.6, 3, 300], {
    id: 'border',
    kind: 'rail',
    distance: 350,
  }),
  ...box([0, -2, 350], [20, 4, 300], { id: 'underside', kind: 'structure' }),
  ...plane(-200, 200, -12, 80, 700, { id: 'ground', kind: 'terrain' }),
];
const world = createCollisionWorld({
  id: 'test-solids',
  version: 1,
  geometryId: 'test-v1',
  triangles,
});
function flightAt(
  position,
  velocity,
  {
    yaw = 0,
    mode = 'flight',
    remaining = 0.5,
    collisionWorld = world,
    forgivingContacts = false,
  } = {},
) {
  const runtime = model.createRuntime(
    { track, collisionWorld },
    {
      id: 'test-flight',
      version: 1,
      rulesId: 'test-flight-v1',
      forgivingContacts,
    },
  );
  const state = { ...createVehicleState(), distance: 99.8, speed: 100 };
  runtime.advance(state, {}, DT);
  const saved = runtime.snapshot();
  const current = pose(...position, yaw);
  saved.mode = mode;
  saved.currentPose = saved.previousPose = {
    position: current.position.toArray(),
    quaternion: current.quaternion.toArray(),
  };
  Object.assign(saved.flight, {
    velocity,
    elapsed: 0.4,
    remaining,
    lastImpactAt: -1,
    contacts: 0,
  });
  runtime.restore(saved);
  return { runtime, state };
}

test('whole hull sweeps a thin face at 600 km/h; long sweeps and rotated corners cannot tunnel', () => {
  const thin = createCollisionWorld({
    id: 'thin',
    version: 1,
    geometryId: 'thin-v1',
    triangles: box([0, 4, 0], [0.04, 10, 20], {
      id: 'wall',
      kind: 'structure',
    }),
  });
  const a = pose(-3.1, 4, 0),
    b = pose(-3.1 + (600 / 3.6) * DT, 4, 0);
  const hit = thin.sweepHull(a, b);
  assert.ok(hit && hit.fraction > 0 && hit.fraction < 1);
  assert.ok(hit.normal.x < -0.99);
  assert.ok(Math.abs(hit.point.x + 0.02) < 1e-6);
  assert.ok(thin.sweepHull(pose(-150, 4, 0, 1.1), pose(150, 4, 0, 1.1)));
  const rotation = thin.sweepHull(pose(-3, 4, 0), pose(-3, 4, 0, Math.PI / 2));
  assert.ok(
    rotation && rotation.fraction < 1,
    'rotation sweeps the nose, not just the centre',
  );
  assert.deepEqual(
    thin.sweepHull(a, b),
    hit,
    'earliest contact order is stable',
  );
  thin.dispose();
  assert.equal(thin.sweepHull(a, b), null);
});

test('invalid heading and low overlap still cause physical deck/border impacts', () => {
  const wrong = flightAt([0, 1.05, 300], [0, -90, 80], { yaw: 1.15 });
  const events = wrong.runtime.advance(wrong.state, {}, DT);
  assert.ok(
    events.some(
      (event) => event.type === 'impact' && event.payload.response === 'crash',
    ),
  );
  assert.equal(wrong.runtime.snapshot().mode, 'recovery');
  assert.ok(!events.some((event) => event.type === 'jump-transfer'));
  const outside = flightAt([14.7, 1.7, 300], [-120, 0, 80], { yaw: 0.9 });
  const hits = outside.runtime.advance(outside.state, {}, DT);
  assert.ok(
    hits.some(
      (event) =>
        event.type === 'impact' && event.payload.response === 'deflection',
    ),
  );
  assert.ok(
    outside.runtime.snapshot().flight.velocity[0] > 0,
    'outer border reflects away from the deck',
  );
  assert.ok(!hits.some((event) => event.type === 'jump-transfer'));
});

test('glancing border contacts deflect toward and away from the deck without fabricating a landing', () => {
  for (const [position, vx, sign] of [
    [[5, 1.7, 300], 120, -1],
    [[14.7, 1.7, 300], -120, 1],
  ]) {
    const { runtime, state } = flightAt(position, [vx, 0, 80], { yaw: 0.9 });
    const events = runtime.advance(state, {}, DT);
    const impact = events.find((event) => event.type === 'impact');
    assert.equal(impact?.payload.response, 'deflection');
    assert.equal(impact.payload.collider, 'border');
    assert.equal(impact.payload.side, -sign);
    assert.ok(runtime.snapshot().flight.velocity[0] * sign > 0);
    assert.equal(state.distance, jump.takeoff);
    assert.ok(!events.some((event) => event.type === 'jump-transfer'));
    assert.ok(
      Math.abs(new T.Vector3(...impact.payload.normal).length() - 1) < 1e-8,
    );
  }
});

test('accepted deck contact relatches; underside/ramp face contacts crash without racing credit', () => {
  const clean = flightAt([0, 1.1, 300], [0, -90, 80]);
  const accepted = clean.runtime.advance(clean.state, {}, DT);
  assert.equal(
    accepted.find((event) => event.type === 'jump-transfer')?.payload.outcome,
    'landed',
  );
  assert.equal(clean.runtime.snapshot().mode, 'magnetic');
  assert.ok(!accepted.some((event) => event.type === 'impact'));
  const under = flightAt([0, -5.1, 300], [0, 90, 80]);
  const events = under.runtime.advance(under.state, {}, DT);
  assert.ok(
    events.some(
      (event) =>
        event.type === 'impact' && event.payload.contactKind === 'structure',
    ),
  );
  assert.equal(under.runtime.snapshot().mode, 'recovery');
  assert.ok(under.runtime.snapshot().flight.velocity[1] < 0);
  assert.ok(!events.some((event) => event.type === 'jump-transfer'));
});

test('recovery deck landing clears flight once and continues driving, including at timeout', () => {
  for (const remaining of [0.5, DT / 2]) {
    const { runtime, state } = flightAt([0, 1.1, 300], [0, -90, 80], {
      mode: 'recovery',
      remaining,
      forgivingContacts: true,
    });
    const events = runtime.advance(state, {}, DT);
    const transfers = events.filter((event) => event.type === 'jump-transfer');
    assert.equal(transfers.length, 1);
    assert.equal(transfers[0].payload.outcome, 'landed');
    assert.equal(runtime.snapshot().mode, 'magnetic');
    assert.equal(runtime.snapshot().flight, null);
    assert.ok(state.distance >= jump.landingStart);
    assert.ok(state.distance < jump.landingEnd);
    const landedDistance = state.distance;
    const landedTime = state.time;
    for (let tick = 0; tick < 30; tick++)
      runtime.advance(state, { throttle: 1 }, DT);
    assert.ok(state.distance > landedDistance);
    assert.ok(state.time > landedTime);
    runtime.dispose();
  }
});

test('physical contact with another route interval cannot award the current jump landing', () => {
  const wrongRoad = createCollisionWorld({
    id: 'other-road',
    version: 1,
    geometryId: 'other-v1',
    triangles: plane(-10, 10, 0, 200, 500, {
      id: 'other-deck',
      kind: 'deck',
      start: 700,
      end: 800,
    }),
  });
  const { runtime, state } = flightAt([0, 1.1, 300], [0, -90, 80], {
    collisionWorld: wrongRoad,
  });
  const events = runtime.advance(state, {}, DT);
  assert.ok(events.some((event) => event.type === 'impact'));
  assert.equal(state.distance, jump.takeoff);
  assert.equal(runtime.snapshot().mode, 'recovery');
  assert.ok(!events.some((event) => event.type === 'jump-transfer'));
  wrongRoad.dispose();
});

test('terrain crashes bump in world space; recovery keeps colliding and only the authored delayed recovery credits the jump', () => {
  const { runtime, state } = flightAt([25, -10.95, 150], [30, -90, 100]);
  const race = createRace(track);
  race.placeScenario(99.8);
  const events = [];
  const advance = () =>
    advanceSession({
      state,
      runtime,
      race,
      input: {},
      dt: DT,
      emit: (event) => events.push(event),
    });
  advance();
  const impact = events.find((event) => event.type === 'impact');
  assert.equal(impact.payload.contactKind, 'terrain');
  assert.ok(Math.abs(impact.payload.position[1] + 12) < 1e-8);
  assert.equal(runtime.snapshot().mode, 'recovery');
  assert.equal(state.distance, jump.takeoff);
  assert.ok(runtime.snapshot().flight.velocity[1] > 0);
  assert.ok(!events.some((event) => event.type === 'checkpoint'));
  const firstContacts = runtime.snapshot().flight.contacts;
  const saved = captureInitial(state, runtime);
  const continueRecovery = () => {
    const output = [];
    for (let i = 0; i < 180; i++) {
      output.push(...runtime.advance(state, {}, DT));
      const p = runtime.pose();
      if (runtime.snapshot().mode === 'recovery') {
        assert.ok(
          p.position.y -
            projectedHullExtent(p.quaternion, new T.Vector3(0, 1, 0)) >=
            -12.02,
        );
        assert.ok(
          runtime.snapshot().flight.contacts <=
            firstContacts + (i + 1) * COLLISION_RULES.maxContacts,
        );
      }
    }
    return { state: { ...state }, snapshot: runtime.snapshot(), output };
  };
  const expected = continueRecovery();
  assert.equal(
    expected.output.find((event) => event.type === 'jump-transfer')?.payload
      .outcome,
    'recovered',
  );
  assert.equal(state.distance, jump.recovery);
  Object.assign(state, saved.vehicle);
  runtime.restore(saved.runtime);
  assert.deepEqual(
    continueRecovery(),
    expected,
    'recovery contacts/velocity/cooldowns restore deterministically',
  );
  Object.assign(state, saved.vehicle);
  runtime.restore(saved.runtime);
  for (let i = 0; i < 180; i++) advance();
  assert.equal(events.filter((event) => event.type === 'checkpoint').length, 1);
  assert.ok(
    !events.some(
      (event) =>
        event.type === 'jump-transfer' && event.payload.outcome === 'landed',
    ),
  );
  runtime.reset({ state });
  assert.equal(runtime.pose(), null);
  assert.equal(runtime.snapshot().flight, null);
});

test('Aegis consumes on a real world impact and protects reserve while retaining the bounce', () => {
  const { runtime: motion, state } = flightAt(
    [25, -10.95, 150],
    [30, -90, 100],
  );
  const devices = [
    {
      id: 'shield',
      type: 'aegis',
      distance: 50,
      lateral: 0,
      width: 8,
      length: 8,
    },
  ];
  const runtime = createDeviceRuntime({ track, motion, devices });
  const saved = runtime.snapshot();
  saved.aegisRemaining = 1;
  saved.aegisDevice = 'shield';
  saved.lastDistance = saved.highWaterDistance = state.distance;
  runtime.restore(saved);
  const events = runtime.advance(state, {}, DT);
  const hit = events.find((event) => event.type === 'impact');
  assert.equal(hit.payload.shielded, true);
  assert.equal(hit.payload.energyCost, 0);
  assert.equal(state.energy, 100);
  assert.ok(events.some((event) => event.type === 'shield-hit'));
  assert.equal(runtime.snapshot().aegisRemaining, 0);
  assert.ok(runtime.snapshot().flight.velocity[1] > 0);
});

const saffron = createSaffronLevel({});
const saffronTrack = saffron.createTrack();
const saffronWorld = saffron.createCollisionWorld({ track: saffronTrack });
test('disposing an old Saffron world twice does not evict its replacement', () => {
  const track = { ...saffronTrack };
  const first = saffron.createCollisionWorld({ track });
  first.dispose();
  const replacement = saffron.createCollisionWorld({ track });
  first.dispose();
  assert.equal(saffron.createCollisionWorld({ track }), replacement);
  replacement.dispose();
});
test('untimed playtests cannot record a valid lap even after cycling the finish', () => {
  const race = createRace({ ...track, jumps: [] }, { untimed: true });
  race.placeScenario(0);
  for (let s = 0; s < 2100; s += 100) race.step(s, s + 100, 1);
  assert.equal(race.history.length, 2);
  assert.ok(race.history.every((lap) => !lap.valid));
  assert.equal(race.best, null);
  assert.equal(race.valid, false);
});
test('Saffron shares one headless collision world and exact rendered terrain; fossil bake is source-verified', async () => {
  assert.equal(
    saffron.createCollisionWorld({ track: saffronTrack }),
    saffronWorld,
  );
  const survey = createLandformSurvey(saffronTrack);
  assert.equal(saffronWorld.survey, survey);
  const road = createSaffronRoad(
    { track: saffronTrack, collisionWorld: saffronWorld },
    { shape: true },
  );
  const leg = road.group.getObjectByName('Forked gold ceramic support legs');
  const matrix = new T.Matrix4();
  for (const [i, support] of saffronWorld.supports) {
    leg.getMatrixAt(i, matrix);
    for (let n = 0; n < 16; n++)
      assert.ok(
        Math.abs(matrix.elements[n] - support.leg.elements[n]) < 0.0001,
      );
  }
  road.dispose();
  const resources = createResources();
  const terrain = createTerrain(saffronTrack, survey, {}, resources, true);
  assert.deepEqual(
    terrain.terrain.geometry.attributes.position.array,
    survey.meshData.positions,
  );
  resources.dispose();
  const bytes = await readFile(
    new URL(
      '../public/assets/levels/saffron/leviathan-kit.glb',
      import.meta.url,
    ),
  );
  assert.equal(
    kit.sourceHash,
    createHash('sha256').update(bytes).digest('hex'),
  );
  const gltf = await new GLTFLoader().parseAsync(
    bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
    '',
  );
  gltf.scene.updateMatrixWorld(true);
  const decode = (value, Type) =>
    new Type(Uint8Array.from(atob(value), (c) => c.charCodeAt(0)).buffer);
  for (const [name, parts] of Object.entries(kit.modules)) {
    const root = gltf.scene.getObjectByName(name),
      inverse = root.matrixWorld.clone().invert();
    let i = 0;
    root.traverse((object) => {
      if (!object.isMesh) return;
      const geometry = object.geometry
        .clone()
        .applyMatrix4(inverse.clone().multiply(object.matrixWorld));
      assert.deepEqual(
        decode(parts[i].positions, Float32Array),
        geometry.attributes.position.array,
      );
      assert.deepEqual(
        Array.from(decode(parts[i].indices, Uint32Array)),
        Array.from(geometry.index.array),
      );
      i++;
      geometry.dispose();
    });
    assert.equal(i, parts.length);
  }
});

test('a deliberate Saffron miss from the real approach hits reachable fossil/terrain during bounded recovery', () => {
  const state = {
    ...createVehicleState(),
    ...saffronTrack.scenarios['jump-playtest'],
  };
  const runtime = createDeviceRuntime({
    track: saffronTrack,
    devices: saffron.racing.createDevices(saffronTrack),
    motion: saffron.createRuntime({
      track: saffronTrack,
      collisionWorld: saffronWorld,
      presentation: false,
    }),
  });
  runtime.reset({ state });
  const events = [];
  for (let i = 0; i < 1200; i++) {
    events.push(
      ...runtime.advance(
        state,
        {
          throttle: 1,
          boost: true,
          steer: state.distance > saffronTrack.jumps[2].takeoff - 15 ? 1 : 0,
        },
        DT,
      ),
    );
    if (events.some((event) => event.type === 'jump-transfer')) break;
  }
  const impacts = events.filter((event) => event.type === 'impact');
  assert.ok(impacts.some((event) => event.payload.contactKind === 'structure'));
  assert.ok(impacts.some((event) => event.payload.contactKind === 'terrain'));
  const miss = events.findIndex((event) => event.type === 'jump-miss');
  assert.ok(
    miss < events.findIndex((event) => event.type === 'impact'),
    'falling recovery checks actual reachable scenery',
  );
  assert.equal(
    events.find((event) => event.type === 'jump-transfer')?.payload.outcome,
    'recovered',
  );
  assert.ok(
    !events.some(
      (event) =>
        event.type === 'jump-transfer' && event.payload.outcome === 'landed',
    ),
  );
  runtime.dispose();
});

test('Saffron grounded 320 m jump playtest reaches launch speed with real devices and repeats a deterministic clean landing', () => {
  const start = saffronTrack.scenarios['jump-playtest'];
  const lip = saffronTrack.jumps[2].takeoff;
  assert.equal(lip - start.distance, 320);
  for (let s = start.distance; s < lip; s += 1) {
    assert.equal(saffronTrack.isGap(s), false);
    assert.ok(Math.abs(saffronTrack.sample(s).curvature) < 1e-6);
  }
  for (const boost of [false, true]) {
    const motion = saffron.createRuntime({
      track: saffronTrack,
      collisionWorld: saffronWorld,
      presentation: false,
    });
    const runtime = createDeviceRuntime({
      track: saffronTrack,
      motion,
      devices: saffron.racing.createDevices(saffronTrack),
    });
    const state = { ...createVehicleState(), ...start };
    const run = () => {
      Object.assign(state, createVehicleState(), start);
      runtime.reset({ state, scenario: 'jump-playtest' });
      const events = [];
      for (let i = 0; i < 1000; i++) {
        events.push(...runtime.advance(state, { throttle: 1, boost }, DT));
        if (events.some((event) => event.type === 'jump-transfer')) break;
      }
      const launch = events.find((event) => event.type === 'jump-launch');
      assert.ok(launch.payload.speed > 155 && launch.payload.speed < 167);
      assert.equal(
        events.find((event) => event.type === 'jump-transfer')?.payload.outcome,
        'landed',
      );
      return { state: { ...state }, snapshot: runtime.snapshot(), events };
    };
    const expected = run();
    assert.deepEqual(run(), expected);
    const otherWorld = {
      ...saffronWorld,
      rulesId: saffronWorld.rulesId + '-different-geometry',
    };
    const other = saffron.createRuntime({
      track: saffronTrack,
      collisionWorld: otherWorld,
      presentation: false,
    });
    assert.equal(compatibleRuntime(other, runtimeIdentity(motion)), false);
    other.dispose();
    runtime.dispose();
  }
});
