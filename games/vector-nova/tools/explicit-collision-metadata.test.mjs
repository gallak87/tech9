import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import * as T from 'three';
import { declareCollisionSolid } from '../src/physics/solid-metadata.js';
import { collectProductionSolids } from '../src/physics/production-solids.js';
import { createRoadSurface } from '../src/physics/road-surface.js';
import { withMagneticBoundaries } from '../src/physics/magnetic-boundaries.js';
import { sweepGeometry, boxProfile } from '../src/track/geometry.js';
import { createVesperTrack } from '../src/levels/vesper-forest/track/model.js';
import { createVesperRoad } from '../src/levels/vesper-forest/track/road.js';
import { createVesperCollisionWorld } from '../src/levels/vesper-forest/collision.js';
import { createVesperRuntime } from '../src/levels/vesper-forest/runtime.js';
import {
  compatibleRuntime,
  runtimeIdentity,
} from '../src/core/session-runtime.js';

const digest = (value) =>
  createHash('sha256').update(JSON.stringify(value)).digest('hex');
const track = {
  id: 'metadata-fixture',
  geometryVersion: 'unchanged',
  length: 1000,
  width: 20,
  jumps: [{ id: 'gap', takeoff: 100, landingStart: 200, landingEnd: 500 }],
  sample(distance) {
    return {
      position: new T.Vector3(0, 0, distance),
      right: new T.Vector3(1, 0, 0),
      up: new T.Vector3(0, 1, 0),
      tangent: new T.Vector3(0, 0, 1),
      quaternion: new T.Quaternion(),
      curvature: 0,
      bank: 0,
    };
  },
};
const coordinates = { attribute: 'roadCoord', distance: 0, lateral: 1 };
function owner(meshes) {
  const group = new T.Group();
  group.add(...meshes);
  return {
    group,
    disposed: false,
    dispose() {
      this.disposed = true;
      const geometries = new Set(),
        materials = new Set();
      group.traverse((object) => {
        if (object.isInstancedMesh) object.dispose();
        if (object.geometry) geometries.add(object.geometry);
        if (object.material) materials.add(object.material);
      });
      geometries.forEach((geometry) => geometry.dispose());
      materials.forEach((material) => material.dispose());
      group.clear();
    },
  };
}
function deck() {
  const geometry = new T.BufferGeometry();
  geometry.setAttribute(
    'position',
    new T.Float32BufferAttribute([-10, 0, 300, -10, 0, 320, 10, 0, 300], 3),
  );
  geometry.setAttribute(
    'roadCoord',
    new T.Float32BufferAttribute([300, -10, 320, -10, 300, 10], 2),
  );
  geometry.setAttribute(
    'uv',
    new T.Float32BufferAttribute([0, 18.75, 0, 20, 1, 18.75], 2),
  );
  const mesh = new T.Mesh(geometry, new T.MeshBasicMaterial());
  mesh.name = 'deck';
  return mesh;
}
function collect(road, options = {}) {
  return collectProductionSolids({
    track,
    road,
    id: 'metadata-fixture',
    geometryId: 'unchanged',
    fullDeck: true,
    ...options,
  });
}
const targetPhysics = (targets) =>
  targets.map((target) => {
    const physical = { ...target };
    delete physical.name;
    return physical;
  });

test('explicit physical coordinates and stable IDs survive art renaming, rendering flags and retexturing', () => {
  const legacy = collect(owner([deck()]), { select: () => ({ kind: 'deck' }) });
  const mesh = deck();
  mesh.geometry.setAttribute(
    'physicalRoute',
    new T.Float32BufferAttribute([-10, 91, 300, -10, 92, 320, 10, 93, 300], 3),
  );
  mesh.geometry.deleteAttribute('roadCoord');
  mesh.geometry.attributes.uv.array.fill(-9999);
  mesh.name = 'Decorative barrier painted by an artist';
  mesh.userData.drivingSurface = false;
  declareCollisionSolid(mesh, {
    id: 'deck',
    kind: 'deck',
    routeCoordinates: { attribute: 'physicalRoute', distance: 2, lateral: 0 },
  });
  const authored = collect(owner([mesh]), {
    select: () => assert.fail('Do not infer a declared solid from art'),
  });
  try {
    assert.deepEqual(authored.triangles, legacy.triangles);
    assert.deepEqual(
      targetPhysics(authored.targets),
      targetPhysics(legacy.targets),
    );
    assert.equal(authored.rulesId, legacy.rulesId);
  } finally {
    authored.dispose();
    legacy.dispose();
  }
});

test('explicit exclusions take precedence while unmarked meshes retain the legacy selector', () => {
  const retained = deck(),
    excluded = deck();
  declareCollisionSolid(excluded, false);
  let selections = 0;
  const world = collect(owner([retained, excluded]), {
    select(object) {
      selections++;
      assert.equal(object, retained);
      return { kind: 'deck' };
    },
  });
  try {
    assert.equal(selections, 1);
    assert.equal(world.triangleCount, 1);
  } finally {
    world.dispose();
  }
});

test('invalid declarations reject rather than guessing UVs, and failed extraction disposes its road', () => {
  const mesh = deck();
  assert.throws(
    () => declareCollisionSolid(mesh, { id: 'deck', kind: 'deck' }),
    /explicit route/,
  );
  assert.throws(
    () =>
      declareCollisionSolid(mesh, {
        id: 'deck',
        kind: 'deck',
        routeCoordinates: { attribute: 'roadCoord', distance: 0, lateral: 0 },
      }),
    /route-coordinate/,
  );
  declareCollisionSolid(mesh, {
    id: 'deck',
    kind: 'deck',
    routeCoordinates: { ...coordinates, attribute: 'absent' },
  });
  const road = owner([mesh]);
  assert.throws(() => collect(road), /match mesh vertices/);
  assert.equal(road.disposed, true);
  const source = deck();
  const instanced = new T.InstancedMesh(source.geometry, source.material, 1);
  declareCollisionSolid(instanced, {
    id: 'deck',
    kind: 'deck',
    routeCoordinates: coordinates,
  });
  const instances = owner([instanced]);
  assert.throws(
    () => collect(instances),
    /match mesh vertices/,
    'one local coordinate attribute cannot locate different instances on the route',
  );
  assert.equal(instances.disposed, true);
});

test('explicit instanced structures preserve every transformed triangle and legacy identifier', () => {
  function structures(explicit) {
    const mesh = new T.InstancedMesh(
      new T.BoxGeometry(4, 6, 8),
      new T.MeshBasicMaterial(),
      2,
    );
    mesh.name = 'supports';
    mesh.setMatrixAt(0, new T.Matrix4().makeTranslation(20, -5, 250));
    mesh.setMatrixAt(
      1,
      new T.Matrix4().makeRotationY(0.7).setPosition(-20, -5, 350),
    );
    if (explicit)
      declareCollisionSolid(mesh, { id: 'supports', kind: 'structure' });
    return owner([mesh]);
  }
  const legacy = collect(structures(false), {
    select: () => ({ kind: 'structure' }),
  });
  const explicit = collect(structures(true));
  try {
    assert.deepEqual(explicit.triangles, legacy.triangles);
    assert.deepEqual(explicit.targets, legacy.targets);
    assert.equal(explicit.targets.length, 2);
  } finally {
    explicit.dispose();
    legacy.dispose();
  }
});

test('nonfinite declared stations and lateral coordinates reject before filtering and dispose the road', () => {
  for (const component of ['distance', 'lateral'])
    for (const value of [NaN, Infinity, -Infinity]) {
      const mesh = deck();
      mesh.geometry.attributes.roadCoord.setComponent(
        1,
        coordinates[component],
        value,
      );
      declareCollisionSolid(mesh, {
        id: 'deck',
        kind: 'deck',
        routeCoordinates: coordinates,
      });
      const road = owner([mesh]);
      assert.throws(
        () => collect(road),
        /route coordinates must be finite/,
        `${component}=${value} cannot silently remove a solid`,
      );
      assert.equal(
        road.disposed,
        true,
        `${component}=${value} releases its acquired road`,
      );
    }
});

test('broad ownership intervals never turn a short authored face into full road or curb coverage', () => {
  const surface = deck();
  declareCollisionSolid(surface, {
    id: 'deck',
    kind: 'deck',
    routeCoordinates: coordinates,
  });
  const curb = new T.Mesh(
    sweepGeometry(track, boxProfile(-11, 0.5, 2, 1), { start: 300, end: 320 }),
    new T.MeshBasicMaterial(),
  );
  declareCollisionSolid(curb, {
    id: 'curb',
    kind: 'rail',
    roadBoundary: true,
    routeCoordinates: coordinates,
  });
  const world = collect(owner([surface, curb]));
  const sample = createRoadSurface(world.triangles);
  try {
    const face = world.triangles.find((triangle) => triangle.kind === 'deck');
    assert.equal(face.start, 200);
    assert.equal(face.end, 1000);
    assert.deepEqual(face.roadCoordinates, [
      [300, -10],
      [320, -10],
      [300, 10],
    ]);
    assert.ok(sample(305, 0, track.sample(305)));
    assert.equal(sample(800, 0, track.sample(800)), null);
    assert.equal(sample(150, 0, track.sample(150)), null);
    const withEdges = withMagneticBoundaries(track, world);
    assert.ok(
      withEdges.triangles.some(
        (triangle) =>
          triangle.id === 'magnetic-edge--1' &&
          triangle.start <= 800 &&
          triangle.end >= 804,
      ),
      'a short authored curb cannot suppress the distant left boundary',
    );
    assert.equal(
      withEdges.triangles.some(
        (triangle) =>
          triangle.id.startsWith('magnetic-edge-') &&
          triangle.start > 100 &&
          triangle.end < 200,
      ),
      false,
      'the jump remains open',
    );
  } finally {
    sample.dispose();
    world.dispose();
  }
});

// Frozen pre-migration selector: it is the independent oracle for the pilot's
// exact authored triangle stream, including historical IDs and ownership spans.
function legacyVesper(road, track) {
  road.group.traverse((object) => {
    delete object.userData.collisionSolid;
  });
  return collectProductionSolids({
    track,
    id: 'vesper-forest-jump-solids',
    geometryId: 'cast-ribbon-v3-deck-owned-decals',
    fullDeck: true,
    road,
    select(object) {
      if (object.userData.drivingSurface) return { kind: 'deck' };
      if (/resin curb|protective divider/.test(object.name))
        return { kind: 'rail', roadBoundary: true };
      if (/resin sides and underside/.test(object.name))
        return { kind: 'structure' };
      return null;
    },
  });
}
test('Vesper pilot keeps exact legacy collision/replay identity after migration and arbitrary art-label/UV edits', () => {
  const track = createVesperTrack();
  function contract(world) {
    const runtime = createVesperRuntime({ track, collisionWorld: world });
    try {
      return {
        id: world.id,
        version: world.version,
        rulesId: world.rulesId,
        triangles: world.triangleCount,
        triangleDigest: digest(world.triangles),
        targets: targetPhysics(world.targets),
        nativeBoundaryDigest: digest(
          withMagneticBoundaries(track, world).triangles,
        ),
        runtime: runtimeIdentity(runtime),
      };
    } finally {
      runtime.dispose();
      world.dispose();
    }
  }
  const legacy = contract(legacyVesper(createVesperRoad({ track }), track));
  const migrated = contract(createVesperCollisionWorld({ track }));
  assert.deepEqual(migrated, legacy);
  const renamed = createVesperRoad({ track });
  renamed.group.traverse((object) => {
    if (!object.isMesh) return;
    object.name = 'Protective divider / renamed art';
    object.userData.drivingSurface = false;
    object.geometry.attributes.uv?.array.fill(-9000);
  });
  const edited = contract(
    collectProductionSolids({
      track,
      id: 'vesper-forest-jump-solids',
      geometryId: 'cast-ribbon-v3-deck-owned-decals',
      fullDeck: true,
      road: renamed,
    }),
  );
  assert.deepEqual(edited, legacy);
  const runtime = { ...migrated.runtime };
  assert.equal(compatibleRuntime(runtime, legacy.runtime), true);
});
