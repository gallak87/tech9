import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import * as T from 'three';
import { collectProductionSolids } from '../src/physics/production-solids.js';
import { sweepGeometry } from '../src/track/geometry.js';
import { createFlightModel } from '../src/physics/flight.js';
import { createVehicleState } from '../src/physics/index.js';
import { projectedHullExtent } from '../src/physics/hull.js';
import kit from '../src/levels/vesper/collision-kit.json' with { type: 'json' };

const track = {
  id: 'production-fixture',
  geometryVersion: 1,
  length: 1000,
  width: 20,
  jumps: [
    {
      id: 'gap',
      takeoff: 100,
      landingStart: 200,
      landingEnd: 500,
      recovery: 550,
      halfWidth: 10,
    },
  ],
  scenarios: {},
  checkpoints: [{ distance: 0 }, { distance: 200 }, { distance: 700 }],
  sample(s) {
    return {
      position: new T.Vector3(0, 0, s),
      right: new T.Vector3(1, 0, 0),
      up: new T.Vector3(0, 1, 0),
      tangent: new T.Vector3(0, 0, 1),
      quaternion: new T.Quaternion(),
      curvature: 0,
      bank: 0,
    };
  },
};
const pose = (y, z) => ({
  position: new T.Vector3(0, y, z),
  quaternion: new T.Quaternion(),
});

test('production extraction retains route coordinates, shallow undersides and instance transforms while preserving gaps', () => {
  const group = new T.Group(),
    material = new T.MeshBasicMaterial();
  const surface = new T.Mesh(
    sweepGeometry(
      track,
      [
        [-10, 0],
        [10, 0],
      ],
      { start: 200, end: 500, uvScale: 1 },
    ),
    material,
  );
  surface.name = 'deck';
  group.add(surface);
  const geometry = new T.BoxGeometry(20, 0.15, 70);
  const underside = new T.InstancedMesh(geometry, material, 1);
  underside.name = 'underside';
  underside.setMatrixAt(0, new T.Matrix4().makeTranslation(0, -3, 300));
  group.add(underside);
  let disposed = false;
  const world = collectProductionSolids({
    track,
    id: 'production-fixture',
    geometryId: 'v1',
    road: {
      group,
      dispose() {
        disposed = true;
        surface.geometry.dispose();
        geometry.dispose();
        material.dispose();
        group.clear();
      },
    },
    select: (object) =>
      object.name === 'deck'
        ? { kind: 'deck', uvScale: 1 }
        : { kind: 'structure' },
  });
  assert.equal(disposed, true);
  assert.ok(
    world.triangles
      .filter((t) => t.kind === 'deck')
      .every((t) => t.distance >= 200 && t.distance <= 500),
  );
  assert.equal(world.targets.length, 2);
  assert.equal(
    world.sweepHull(pose(-6, 300), pose(2, 300)).shape.kind,
    'structure',
  );
  assert.equal(world.sweepHull(pose(6, 300), pose(-1, 300)).shape.kind, 'deck');
  assert.equal(world.sweepHull(pose(6, 150), pose(-6, 150)), null);
  world.dispose();
});

test('forgiving magnetic support retains hull clearance under steering after landing settlement has ended', () => {
  const runtime = createFlightModel().createRuntime(
    { track },
    {
      id: 'support-fixture',
      version: 1,
      rulesId: 'support-fixture-v1',
      forgivingContacts: true,
      supportHeight: 0.067,
    },
  );
  const state = { ...createVehicleState(), distance: 300, speed: 50 };
  runtime.reset({ seed: 7 });
  for (let tick = 0; tick < 120; tick++) {
    runtime.advance(state, { throttle: 1, steer: 0.08 }, 1 / 120);
    const current = runtime.pose(1),
      frame = track.sample(state.distance);
    assert.equal(current.grounded, true);
    const clearance =
      current.position.clone().sub(frame.position).dot(frame.up) -
      projectedHullExtent(current.quaternion, frame.up);
    assert.ok(clearance >= 0.067 - 1e-8);
  }
  runtime.dispose();
});

test('Vesper physical bough kit matches its production GLB source', async () => {
  const bytes = await readFile(
    new URL(
      '../public/assets/levels/vesper/vesper-canopy.glb',
      import.meta.url,
    ),
  );
  assert.equal(
    kit.sourceHash,
    createHash('sha256').update(bytes).digest('hex'),
  );
  assert.ok(kit.modules.landing_branch.length > 0);
  assert.ok(
    kit.modules.landing_branch.every(
      (part) => part.positions.length > 0 && part.indices.length > 0,
    ),
  );
});

test('a tilted static deck capture and its full settling interval keep the supported hull above the road', () => {
  const group = new T.Group(),
    material = new T.MeshBasicMaterial();
  const deck = new T.Mesh(
    sweepGeometry(
      track,
      [
        [-10, 0],
        [10, 0],
      ],
      { start: 200, end: 500 },
    ),
    material,
  );
  deck.name = 'deck';
  group.add(deck);
  const world = collectProductionSolids({
    track,
    id: 'capture-fixture',
    geometryId: 'v1',
    road: {
      group,
      dispose() {
        deck.geometry.dispose();
        material.dispose();
      },
    },
    select: () => ({ kind: 'deck' }),
  });
  const runtime = createFlightModel().createRuntime(
    { track, collisionWorld: world, playtest: {} },
    {
      id: 'capture-fixture',
      version: 1,
      rulesId: 'v1',
      forgivingContacts: true,
    },
  );
  const state = { ...createVehicleState(), distance: 99.8, speed: 100 };
  runtime.advance(state, {}, 1 / 120);
  const saved = runtime.snapshot();
  const quaternion = new T.Quaternion().setFromAxisAngle(
    new T.Vector3(0, 0, 1),
    0.9,
  );
  saved.currentPose = saved.previousPose = {
    position: [0, 3, 260],
    quaternion: quaternion.toArray(),
  };
  saved.flight.velocity = [0, -15, 60];
  runtime.restore(saved);
  let supported = 0;
  for (let tick = 0; tick < 180; tick++) {
    runtime.advance(state, { throttle: 1, steer: 0.08 }, 1 / 120);
    if (runtime.snapshot().mode !== 'magnetic') continue;
    const current = runtime.pose(1),
      frame = track.sample(state.distance);
    assert.ok(
      current.position.y - projectedHullExtent(current.quaternion, frame.up) >=
        -1e-8,
    );
    supported++;
    if (supported === 120) break;
  }
  assert.equal(supported, 120);
  runtime.dispose();
  world.dispose();
});

test('left/right steering keeps magnetic height fixed on flat, banked and inverted road frames', () => {
  for (const bank of [0, 0.8, Math.PI]) {
    const quaternion = new T.Quaternion().setFromAxisAngle(
      new T.Vector3(0, 0, 1),
      bank,
    );
    const groundTrack = {
      ...track,
      jumps: [],
      sample(s) {
        const frame = track.sample(s);
        for (const axis of ['right', 'up', 'tangent'])
          frame[axis].applyQuaternion(quaternion);
        frame.quaternion.copy(quaternion);
        return frame;
      },
    };
    for (const speed of [0, 50]) {
      const runtime = createFlightModel().createRuntime(
        { track: groundTrack },
        {
          id: 'steering-height-fixture',
          version: 1,
          rulesId: 'v1',
          forgivingContacts: true,
          supportHeight: 0.067,
        },
      );
      const state = { ...createVehicleState(), distance: 300, speed };
      runtime.reset({ state, seed: 7 });
      for (const steer of [0, 1, 0, -1, 1, -1, 0]) {
        runtime.advance(state, { steer }, 1 / 120);
        const current = runtime.pose(1),
          frame = groundTrack.sample(state.distance);
        const height = current.position
          .clone()
          .sub(frame.position)
          .dot(frame.up);
        assert.ok(
          Math.abs(height - 0.787) < 1e-9,
          `steering ${steer} changes magnetic height on bank ${bank}`,
        );
        assert.equal(current.steeringBank, true);
        assert.ok(
          new T.Vector3(0, 1, 0)
            .applyQuaternion(current.quaternion)
            .dot(frame.up) >
            1 - 1e-9,
        );
      }
      runtime.dispose();
    }
  }
});

test('rival presentation preserves cosmetic steering lean without changing its physical hover position', async () => {
  const { createRacerPresentation } =
    await import('../src/race/racer-presentation.js');
  const group = new T.Group(),
    scene = new T.Scene();
  let steeringBank = true;
  const physical = {
    position: new T.Vector3(0, 0.72, 300),
    quaternion: new T.Quaternion(),
  };
  const opponent = {
    specification: { id: 'rook', name: 'Rook' },
    state: { steer: 1 },
    runtime: { pose: () => ({ ...physical, steeringBank }) },
  };
  const presentation = await createRacerPresentation({
    racers: { enabled: true, opponents: [opponent] },
    scene,
    track,
    loadRival: async () => ({
      group,
      dispose() {
        group.removeFromParent();
      },
    }),
  });
  for (const steer of [-1, 0, 1]) {
    opponent.state.steer = steer;
    presentation.update({ mode: 'paused' });
    assert.deepEqual(group.position.toArray(), physical.position.toArray());
    const expected = new T.Quaternion().setFromAxisAngle(
      new T.Vector3(0, 0, 1),
      steer * 0.08,
    );
    assert.ok(group.quaternion.angleTo(expected) < 1e-7);
  }
  steeringBank = false;
  presentation.update({ mode: 'paused' });
  assert.ok(group.quaternion.angleTo(physical.quaternion) < 1e-7);
  presentation.dispose();
});
