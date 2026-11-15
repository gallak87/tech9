import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import { generateDocument, applySectionShape, addJump } from './document.js';
import { createEditorTrack } from './track.js';
import {
  createEditorWorld,
  createEditorRoad,
  createEditorEnvironment,
  createEditorCollisionWorld,
  createEditorLevel,
} from './nightweir.js';
import { assertTrackContract } from '../../tools/level-checks/track-contract.mjs';
import { createMagneticRuntime } from '../core/session-runtime.js';
import { createVehicleState } from '../physics/index.js';
import { createRapierWorld } from '../physics/rapier-world.js';
import { withMagneticBoundaries } from '../physics/magnetic-boundaries.js';
import { getRacerControl } from '../race/racers.js';

const plainDocument = (options = {}) =>
  generateDocument({ generatorVersion: 1, seedJumps: false, ...options });

const DT = 1 / 120;

test('compiled custom circuits preserve physical metres, bank continuity and seam frames', () => {
  for (const seed of [0, 7, 4294967295]) {
    const doc = plainDocument({
      seed,
      length: 1800,
      elevation: 1,
      bendiness: 1,
    });
    doc.points[0].bank = 0.12;
    const track = createEditorTrack(doc);
    assertTrackContract(track);
    assert.ok(Math.abs(track.length - 1800) < 0.1);
    const before = track.sample(-0.01),
      after = track.sample(0.01);
    assert.ok(before.position.distanceTo(after.position) < 0.03);
    assert.ok(before.quaternion.angleTo(after.quaternion) < 0.005);
    for (let s = 0; s < track.length; s += 7) {
      assert.ok(Math.abs(track.sample(s).bank) <= 0.6);
      assert.ok(track.sample(s).up.y > 0.7);
    }
  }
});

test('rendered deck normals, exact pier triangles and collision owner share the compiled geometry', async () => {
  const doc = plainDocument({ density: 0 }),
    track = createEditorTrack(doc);
  const collected = [];
  const road = createEditorRoad(track, {
    collectSolid: (solid) => collected.push(solid),
  });
  await road.ready;
  const deck = road.group.children.find((o) => o.userData.roadSurface);
  assert.ok(deck.geometry.hasAttribute('roadCoord'));
  const positions = deck.geometry.attributes.position,
    indices = deck.geometry.index.array;
  const a = new T.Vector3().fromBufferAttribute(positions, indices[0]);
  const b = new T.Vector3().fromBufferAttribute(positions, indices[1]);
  const c = new T.Vector3().fromBufferAttribute(positions, indices[2]);
  assert.ok(
    b.sub(a).cross(c.sub(a)).normalize().dot(track.sample(0).up) > 0.99,
  );
  const pier = collected.find((s) => s.name === 'Automatic concrete pier');
  assert.ok(pier && track.supportFootprints.length > 0);
  const expected = new T.Vector3()
    .fromBufferAttribute(
      pier.geometry.attributes.position,
      pier.geometry.index?.array[0] ?? 0,
    )
    .applyMatrix4(pier.matrix)
    .toArray();
  const collision = createEditorCollisionWorld(doc, track);
  const actual = collision.triangles.find(
    (t) => t.id === 'editor-automatic-concrete-pier',
  );
  assert.deepEqual(actual.points[0], expected);
  const world = createEditorWorld(doc);
  await world.ready;
  world.dispose();
  world.dispose();
  assert.equal(world.group.children.length, 0);
  road.dispose();
  collision.dispose();
});

test('compiled test-drive descriptors run a real native magnetic actor through banked road while retaining speed and grounded support', async (t) => {
  const doc = plainDocument({
    length: 2400,
    elevation: 1,
    bendiness: 1,
    density: 0,
  });
  const level = createEditorLevel(doc),
    track = level.createTrack();
  const collision = level.createCollisionWorld({ track });
  const dynamics = await createRapierWorld({
    collisionWorld: withMagneticBoundaries(track, collision),
  });
  const runtime = createMagneticRuntime({
    track,
    dynamics,
    collisionWorld: collision,
    settings: { steeringAssist: 0.3 },
  });
  t.after(() => {
    runtime.dispose();
    dynamics.dispose();
    collision.dispose();
  });
  for (const fraction of [0, 0.25, 0.5, 0.75]) {
    dynamics.reset();
    const state = {
      ...createVehicleState(),
      distance: track.length * fraction,
      speed: 95,
    };
    const initial = state.distance;
    runtime.reset({ state });
    for (let tick = 0; tick < 120; tick++) {
      const controls = getRacerControl(state, track, {
        runtime,
        difficulty: 'hard',
        lane: 0,
      });
      runtime.advance(state, controls, DT);
      assert.ok(Number.isFinite(state.speed) && Number.isFinite(state.lateral));
      assert.ok(Math.abs(state.lateral) < track.width / 2);
    }
    assert.ok(
      state.distance > initial + 60,
      `native movement at ${fraction}: ${state.distance - initial}`,
    );
    assert.ok(state.speed > 70);
    assert.equal(runtime.pose(1).grounded, true);
  }
});

test('Nightweir parcels join into retained terraces with exact visible collision and a horizon-sized basin', async () => {
  const doc = plainDocument({
      environment: { version: 1, seed: 7, layoutVersion: 0 },
    }),
    track = createEditorTrack(doc),
    collected = [];
  const road = createEditorRoad(track);
  const environment = createEditorEnvironment(doc, track, {
    collectSolid: (solid) => collected.push(solid),
  });
  await environment.ready;
  const terraces = collected.filter(
    (solid) => solid.name === 'Connected retaining terrace',
  );
  assert.ok(
    terraces.length >= 10,
    'occupied parcels form connected waterfront districts',
  );
  const water = environment.group.children.find(
    (o) => o.name === 'Retained harbor basin',
  );
  water.geometry.computeBoundingBox();
  assert.ok(water.geometry.boundingBox.getSize(new T.Vector3()).x >= 50000);
  const collision = createEditorCollisionWorld(doc, track);
  const a = terraces[0],
    local = new T.Vector3()
      .fromBufferAttribute(
        a.geometry.attributes.position,
        a.geometry.index?.array[0] ?? 0,
      )
      .applyMatrix4(a.matrix);
  const triangle = collision.triangles.find(
    (value) => value.id === 'editor-connected-retaining-terrace',
  );
  assert.deepEqual(triangle.points[0], local.toArray());
  for (const terrace of terraces) {
    const inverse = terrace.matrix.clone().invert();
    for (const support of track.supportFootprints) {
      // Piers must stay out of terrace interiors; both are generated solids.
      const center = new T.Vector3(
        support.x,
        doc.settings.waterLevel - 1,
        support.z,
      ).applyMatrix4(inverse);
      assert.ok(Math.abs(center.x) > 0.5 || Math.abs(center.z) > 0.5);
    }
  }
  road.dispose();
  environment.dispose();
  collision.dispose();
});

test('four connected quarter-turn chunks close physical frames while retaining the full authored turn', () => {
  let doc = plainDocument({ length: 4800 });
  const ids = [0, 4, 8, 12, 15].map((i) => doc.points[i].id);
  for (let i = 0; i < 4; i++)
    doc = applySectionShape(doc, {
      startPointId: ids[i],
      endPointId: ids[i + 1],
      angle: Math.PI / 2,
    });
  const track = createEditorTrack(doc);
  assertTrackContract(track);
  assert.ok(track.sample(track.length * 0.5).up.y < -0.8);
  assert.ok(track.sample(track.length - 0.01).authoredRoll > Math.PI * 1.99);
  assert.ok(
    track.sample(-0.01).quaternion.angleTo(track.sample(0.01).quaternion) <
      0.005,
  );
  const road = createEditorRoad(track),
    geometry = road.group.children.find((o) => o.userData.roadSurface).geometry;
  assert.ok(
    new Set(
      Array.from({ length: geometry.getAttribute('roadCoord').count }, (_, i) =>
        Math.round(geometry.getAttribute('roadCoord').getY(i) * 1000),
      ),
    ).size > track.width,
    'twisted decks receive physical transverse subdivisions',
  );
  assert.ok(
    road.group.children.some(
      (mesh) =>
        mesh.name === 'Editor / oxide municipal steel' && mesh.isInstancedMesh,
    ),
  );
  road.dispose();
});

test('native magnetic driving stays supported through wall rides, inversion and the full-turn seam', async (t) => {
  const doc = plainDocument({ length: 1800, width: 32, density: 0 });
  doc.points.forEach((p, i) => {
    p.roll = (i / doc.points.length) * Math.PI * 2;
  });
  const track = createEditorTrack(doc),
    collision = createEditorCollisionWorld(doc, track);
  const dynamics = await createRapierWorld({
    collisionWorld: withMagneticBoundaries(track, collision),
  });
  const runtime = createMagneticRuntime({
    track,
    dynamics,
    collisionWorld: collision,
    settings: { steeringAssist: 0.3 },
  });
  t.after(() => {
    runtime.dispose();
    dynamics.dispose();
    collision.dispose();
  });
  for (const fraction of [0.25, 0.5, 0.75, 0.99]) {
    dynamics.reset();
    const state = {
        ...createVehicleState(),
        distance: track.length * fraction,
        speed: 95,
      },
      initial = state.distance;
    runtime.reset({ state });
    for (let tick = 0; tick < 120; tick++)
      runtime.advance(
        state,
        getRacerControl(state, track, { runtime, difficulty: 'hard', lane: 0 }),
        DT,
      );
    assert.ok(state.distance > initial + 90);
    assert.ok(state.speed > 95);
    assert.ok(Math.abs(state.lateral) < 1);
    assert.equal(runtime.pose(1).grounded, true);
  }
});

test('a full-sized rotated road compiles collision without spreading its triangle array into arguments', () => {
  const doc = applySectionShape(
    plainDocument({ length: 3000, width: 32, density: 0 }),
    { startIndex: 2, endIndex: 6, angle: Math.PI * 1.5 },
  );
  const track = createEditorTrack(doc),
    collision = createEditorCollisionWorld(doc, track);
  const deckTriangles = collision.triangles.filter(
    (triangle) => triangle.kind === 'deck',
  ).length;
  assert.ok(
    deckTriangles > 125000,
    `exercise a road above browser and Node argument limits: ${deckTriangles}`,
  );
  assert.ok(collision.triangleCount > deckTriangles);
  collision.dispose();
});

test('Downhill compiled routes clamp forward, support the rear grid and finish before the braking runout', () => {
  const track = createEditorTrack(plainDocument({ courseType: 'downhill' }));
  assert.equal(track.closed, false);
  assert.ok(Math.abs(track.length - track.finishDistance - 600) < 0.001);
  assertTrackContract(track);
  assert.ok(
    track
      .sample(track.length)
      .position.distanceTo(track.sample(track.length + 500).position) < 1e-8,
  );
  assert.ok(
    track.sample(0).position.distanceTo(track.sample(-12).position) - 12 < 1e-6,
  );
  assert.equal(track.checkpoints.at(-1).distance, track.finishDistance);
});

test('v3 fractional-length descents retain the exact finish checkpoint and 600 m runout', () => {
  for (const options of [
    {},
    { bendiness: 0, elevation: 0, jumpFrequency: 'none', width: 32 },
  ]) {
    const track = createEditorTrack(
      generateDocument({
        generatorVersion: 3,
        seed: 0,
        length: 15000,
        courseType: 'downhill',
        ...options,
      }),
    );
    assert.equal(track.checkpoints.at(-1).distance, track.finishDistance);
    assert.equal(track.length - track.finishDistance, 600);
  }
});

test('authored jumps remove actual road and collision while keeping one landing checkpoint and supported receiving deck', () => {
  const doc = addJump(plainDocument({ courseType: 'downhill', density: 0 }), {
    startIndex: 2,
    endIndex: 4,
  });
  const track = createEditorTrack(doc),
    jump = track.jumps[0],
    road = createEditorRoad(track),
    collision = createEditorCollisionWorld(doc, track);
  const deck = road.group.children.find((mesh) => mesh.userData.roadSurface),
    coord = deck.geometry.getAttribute('roadCoord');
  assert.ok(
    !Array.from({ length: coord.count }, (_, i) => coord.getX(i)).some(
      (distance) =>
        distance > jump.takeoff + 0.01 && distance < jump.landingStart - 0.01,
    ),
  );
  assert.ok(
    !collision.triangles.some(
      (triangle) =>
        triangle.kind === 'deck' &&
        triangle.distance > jump.takeoff + 0.01 &&
        triangle.distance < jump.landingStart - 0.01,
    ),
  );
  assert.equal(
    track.checkpoints.filter(
      (cp) => cp.distance > jump.takeoff && cp.distance <= jump.recovery,
    ).length,
    1,
  );
  assert.ok(
    track.checkpoints.some(
      (cp) => Math.abs(cp.distance - jump.landingStart) < 1e-6,
    ),
  );
  assert.equal(track.isGap((jump.takeoff + jump.landingStart) / 2), true);
  assert.equal(track.isGap(jump.landingStart + 20), false);
  road.dispose();
  collision.dispose();
});

test('adding a second assisted gap preserves the first actual launch and landing control-point positions', () => {
  const first = addJump(plainDocument({ length: 6000 }), {
      startIndex: 2,
      endIndex: 4,
    }),
    before = createEditorTrack(first),
    jump = before.jumps[0];
  const launch = before.sample(jump.takeoff).position,
    landing = before.sample(jump.landingStart).position;
  const second = addJump(first, {
      startPointId: 'point-10',
      endPointId: 'point-12',
    }),
    after = createEditorTrack(second),
    retained = after.jumps.find((j) => j.id === jump.id);
  assert.ok(launch.distanceTo(after.sample(retained.takeoff).position) < 0.02);
  assert.ok(
    landing.distanceTo(after.sample(retained.landingStart).position) < 0.02,
  );
});

test('native magnetic driving remains supported through the automatic seeded circuit return and lap seam', async (t) => {
  const doc = applySectionShape(
    generateDocument({
      generatorVersion: 2,
      seed: 42017,
      length: 3000,
      courseType: 'circuit',
      density: 0,
    }),
    { startIndex: 15, endIndex: 25, angle: Math.PI / 2 },
  );
  const track = createEditorTrack(doc),
    collision = createEditorCollisionWorld(doc, track),
    dynamics = await createRapierWorld({
      collisionWorld: withMagneticBoundaries(track, collision),
    });
  const runtime = createMagneticRuntime({
    track,
    dynamics,
    collisionWorld: collision,
    settings: { steeringAssist: 0.3 },
  });
  t.after(() => {
    runtime.dispose();
    dynamics.dispose();
    collision.dispose();
  });
  const state = {
      ...createVehicleState(),
      distance: track.length - 190,
      speed: 100,
    },
    initial = state.distance;
  runtime.reset({ state });
  for (let tick = 0; tick < 300; tick++)
    runtime.advance(
      state,
      getRacerControl(state, track, { runtime, difficulty: 'hard', lane: 0 }),
      DT,
    );
  assert.ok(
    state.distance > track.length + 40,
    `crosses the actual seam: ${state.distance - initial}`,
  );
  assert.ok(state.speed > 75);
  assert.ok(Math.abs(state.lateral) < 2);
  assert.equal(runtime.pose(1).grounded, true);
});
