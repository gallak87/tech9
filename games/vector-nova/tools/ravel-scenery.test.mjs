import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import * as T from 'three';
import { readFile } from 'node:fs/promises';
import createLevel from '../src/levels/ravel/index.js';
import { createRavelEnvironment } from '../src/levels/ravel/environment.js';
import { createVehicleState, getVehiclePace } from '../src/physics/index.js';
import {
  sampleRavelWave,
  ravelWaveTimeForPhase,
} from '../src/levels/ravel/waves.js';

let definition, track, environment, rigging, scenery, collisionWorld, dynamics;
const valueAt = (value, s) => (typeof value === 'function' ? value(s) : value);
const step = 1 / 120;

// Actual rendered triangles, including every BatchedMesh instance. Spatial
// queries use local BVHs shared by prototype geometry, then precise triangle /
// oriented-box SAT in world space; large mesh boxes alone cannot prove a clear
// driving corridor beneath an overlapping canopy.
function geometryTree(geometry, range) {
  const attribute = geometry.attributes.position;
  const index = geometry.index;
  const start = range?.start ?? 0;
  const count = range?.count ?? index?.count ?? attribute.count;
  const faces = [];
  for (let i = start; i < start + count; i += 3) {
    const points = [0, 1, 2].map((j) =>
      new T.Vector3().fromBufferAttribute(
        attribute,
        index ? index.getX(i + j) : i + j,
      ),
    );
    const triangle = new T.Triangle(...points);
    const box = new T.Box3().setFromPoints(points);
    faces.push({ triangle, box, center: box.getCenter(new T.Vector3()) });
  }
  function build(entries) {
    const bounds = new T.Box3();
    for (const entry of entries) bounds.union(entry.box);
    if (entries.length <= 12) return { bounds, faces: entries };
    const size = bounds.getSize(new T.Vector3());
    const axis =
      size.x > size.y && size.x > size.z ? 'x' : size.y > size.z ? 'y' : 'z';
    entries.sort((a, b) => a.center[axis] - b.center[axis]);
    const half = Math.floor(entries.length / 2);
    return {
      bounds,
      left: build(entries.slice(0, half)),
      right: build(entries.slice(half)),
    };
  }
  return build(faces);
}

function createSceneryQuery(root) {
  const records = [];
  const trees = new Map();
  const cells = new Map();
  const cellSize = 128;
  root.updateWorldMatrix(true, true);
  root.traverse((object) => {
    if (!object.isMesh) return;
    const count = object.isBatchedMesh
      ? object.instanceCount
      : object.isInstancedMesh
        ? object.count
        : 1;
    for (let instance = 0; instance < count; instance++) {
      const geometryId = object.isBatchedMesh
        ? object.getGeometryIdAt(instance)
        : 'all';
      const key = `${object.geometry.uuid}/${geometryId}`;
      if (!trees.has(key))
        trees.set(
          key,
          geometryTree(
            object.geometry,
            object.isBatchedMesh ? object.getGeometryRangeAt(geometryId) : null,
          ),
        );
      const matrix = object.matrixWorld.clone();
      if (object.isBatchedMesh || object.isInstancedMesh) {
        const local = new T.Matrix4();
        object.getMatrixAt(instance, local);
        matrix.multiply(local);
      }
      const tree = trees.get(key);
      const bounds = tree.bounds.clone().applyMatrix4(matrix);
      const record = {
        tree,
        matrix,
        inverse: matrix.clone().invert(),
        bounds,
        name: `${object.name}/${instance}`,
        rimMount: object.userData.ravelRimMount ?? null,
      };
      const id = records.push(record) - 1;
      const low = bounds.min.clone().divideScalar(cellSize).floor(),
        high = bounds.max.clone().divideScalar(cellSize).floor();
      for (let x = low.x; x <= high.x; x++)
        for (let y = low.y; y <= high.y; y++)
          for (let z = low.z; z <= high.z; z++) {
            const cell = `${x}/${y}/${z}`;
            if (!cells.has(cell)) cells.set(cell, []);
            cells.get(cell).push(id);
          }
    }
  });
  const transformed = new T.Triangle();
  function firstIntersection(
    position,
    quaternion,
    half,
    ignoreRimMounts = false,
  ) {
    const localBox = new T.Box3(half.clone().negate(), half.clone());
    const pose = new T.Matrix4().compose(
      position,
      quaternion,
      new T.Vector3(1, 1, 1),
    );
    const inversePose = pose.clone().invert();
    const worldBounds = localBox.clone().applyMatrix4(pose);
    const low = worldBounds.min.clone().divideScalar(cellSize).floor(),
      high = worldBounds.max.clone().divideScalar(cellSize).floor();
    const ids = new Set();
    for (let x = low.x; x <= high.x; x++)
      for (let y = low.y; y <= high.y; y++)
        for (let z = low.z; z <= high.z; z++)
          for (const id of cells.get(`${x}/${y}/${z}`) ?? []) ids.add(id);
    for (const id of ids) {
      const record = records[id];
      if (ignoreRimMounts && record.rimMount) continue;
      if (!record.bounds.intersectsBox(worldBounds)) continue;
      const geometryBox = worldBounds.clone().applyMatrix4(record.inverse);
      const toHull = inversePose.clone().multiply(record.matrix);
      const stack = [record.tree];
      while (stack.length) {
        const node = stack.pop();
        if (!node.bounds.intersectsBox(geometryBox)) continue;
        if (!node.faces) {
          stack.push(node.left, node.right);
          continue;
        }
        for (const { triangle, box } of node.faces) {
          if (!box.intersectsBox(geometryBox)) continue;
          transformed.a.copy(triangle.a).applyMatrix4(toHull);
          transformed.b.copy(triangle.b).applyMatrix4(toHull);
          transformed.c.copy(triangle.c).applyMatrix4(toHull);
          if (localBox.intersectsTriangle(transformed)) return record.name;
        }
      }
    }
    return null;
  }
  return {
    firstIntersection,
    instances: records.length,
    geometries: trees.size,
  };
}

before(async () => {
  definition = createLevel();
  track = definition.createTrack();
  // Run the production environment factory and both actual GLB loaders. Only
  // transport is adapted for Node; these local kits have no image resources.
  const assets = new Map(
    await Promise.all(
      [
        'anchor-fleet.glb',
        'tension-gallery.glb',
        'ventral-service-insert.glb',
      ].map(async (name) => [
        `/assets/levels/ravel/${name}`,
        await readFile(
          new URL(`../public/assets/levels/ravel/${name}`, import.meta.url),
        ),
      ]),
    ),
  );
  const requested = new Set();
  const fetchBefore = globalThis.fetch;
  T.DefaultLoadingManager.setURLModifier(
    (url) => new URL(url, 'http://ravel-local.invalid/').href,
  );
  globalThis.fetch = async (request) => {
    const url = typeof request === 'string' ? request : request.url;
    const path = [...assets.keys()].find((asset) => url.endsWith(asset));
    assert.ok(path, `unexpected environment resource ${url}`);
    const bytes = assets.get(path);
    requested.add(path);
    return {
      status: 200,
      body: undefined,
      arrayBuffer: async () =>
        bytes.buffer.slice(
          bytes.byteOffset,
          bytes.byteOffset + bytes.byteLength,
        ),
    };
  };
  try {
    environment = createRavelEnvironment({ track });
    await environment.ready;
    assert.deepEqual(
      [...requested].sort(),
      [...assets.keys()].sort(),
      'the production environment must load all actual Blender kits',
    );
  } finally {
    globalThis.fetch = fetchBefore;
    T.DefaultLoadingManager.setURLModifier((url) => url);
  }
  rigging = {
    group: environment.group.getObjectByName('Ravel / connected sail rigging'),
  };
  scenery = createSceneryQuery(environment.group);
});
async function ensurePhysics() {
  if (dynamics) return;
  collisionWorld = await definition.createCollisionWorld({ track });
  dynamics = await definition.createDynamics({ track, collisionWorld });
}
after(() => {
  dynamics?.dispose();
  collisionWorld?.dispose();
  environment?.dispose();
});
const makeRuntime = () =>
  definition.createRuntime({ track, collisionWorld, dynamics });

// These queries cover the complete production environment, including the
// actual Blender fleet GLB, placed instances and socket-to-sail tension stays.
test('actual rigging is batched and anchored at the real folded sail edges', () => {
  const report = rigging.group.userData.ravelRigging;
  assert.ok(report.assemblyCount >= 8);
  assert.ok(report.cableCount >= report.assemblyCount * 3);
  assert.ok(report.batchCount <= 12);
  assert.ok(scenery.instances > 1000 && scenery.geometries > 10);
  for (const item of report.assemblies) {
    if (!item.sheet) continue;
    const bounds = track.sheetBoundsAt(item.distance);
    assert.ok(
      Math.abs(item.lateral - (item.side < 0 ? bounds.min : bounds.max)) < 1e-6,
    );
  }
});

test('real canopy and rigging triangles clear all drivable sheets and three branches at every wave phase', () => {
  let tested = 0;
  const hits = new Map();
  for (let distance = 0; distance < track.length; distance += 26) {
    for (const band of track.roadBands) {
      if (distance < band.start || distance > band.end) continue;
      const low = valueAt(band.min, distance),
        high = valueAt(band.max, distance);
      const columns = Math.max(2, Math.ceil((high - low) / 27));
      for (let column = 0; column <= columns; column++) {
        const lateral = T.MathUtils.lerp(low, high, column / columns);
        if ((track.surfaceCoverage?.(distance, lateral) ?? 1) <= 0) continue;
        const surface = track.surfaceAtTime(distance, lateral, 0);
        // A live floor moves at most 6m and rotates its finite craft footprint.
        // An extra 8m in every local direction encloses its entire continuous
        // phase envelope, rather than checking only a few convenient frames.
        const wavePadding =
          sampleRavelWave(track, distance, lateral, 0).weight > 1e-8 ? 8 : 0;
        const half = new T.Vector3(
          27.25 + wavePadding,
          25.72 + wavePadding,
          28.5 + wavePadding,
        );
        const position = surface.position
          .clone()
          .addScaledVector(surface.up, 0.8);
        // A seated underside bracket necessarily enters the broad 25m
        // scenery margin. It still must clear the actual hull at every heading.
        const hit = scenery.firstIntersection(
          position,
          surface.quaternion,
          half,
          true,
        );
        const raw = scenery.firstIntersection(
          position,
          surface.quaternion,
          new T.Vector3(
            4.25 + wavePadding,
            1.3 + wavePadding,
            4.25 + wavePadding,
          ),
        );
        const key = hit ?? raw;
        if (key && hits.size < 60 && !hits.has(key))
          hits.set(key, { distance, lateral, hit, rawHullHit: raw });
        tested++;
      }
    }
  }
  assert.ok(tested > 5000, `full route + walls + branches sampled (${tested})`);
  assert.deepEqual(
    [...hits.values()],
    [],
    'ordinary scenery must clear25m; every mesh, including seated underside mounts, must clear the full hull',
  );
});

test('seated rim mounts preserve hull clearance at every heading along the actual foil boundary', () => {
  const mounts = [];
  environment.group.traverse((object) => {
    if (object.userData.ravelRimMount)
      mounts.push(object.userData.ravelRimMount);
  });
  assert.ok(
    mounts.length >= 2 && mounts.length <= 16,
    'only declared small under-rim attachment meshes receive the margin exception',
  );
  for (const mount of mounts) {
    const s = mount.station ?? mount.distance,
      side = mount.side;
    assert.ok(Number.isFinite(s) && Math.abs(side) === 1);
    for (let ds = -18; ds <= 18; ds += 1.5)
      for (let inset = 0; inset <= 12; inset += 1.5) {
        const at = s + ds,
          bounds = track.sheetBoundsAt(at) ?? track.branchAt(at, 0);
        const x = (side < 0 ? bounds.min : bounds.max) - side * inset;
        assert.equal(
          sampleRavelWave(track, at, x, 0).weight,
          0,
          'the structural attachment seats on a fixed rim',
        );
        const f = track.surfaceAtTime(at, x, 0),
          position = f.position.clone().addScaledVector(f.up, 0.8);
        const hit = scenery.firstIntersection(
          position,
          f.quaternion,
          new T.Vector3(4.25, 1.3, 4.25),
        );
        assert.equal(
          hit,
          null,
          `rim attachment enters a craft envelope at ${at},${x}: ${hit}`,
        );
      }
  }
});

test('actual physical jump paths clear canopy and rigging geometry across fleet speed envelopes', async () => {
  await ensurePhysics();
  const cases = track.jumps
    .filter((jump) => !jump.optional)
    .flatMap((jump) =>
      [
        ['shrike', false],
        ['kestrel', false],
        ['needle', true],
      ].map(([shipId, boost]) => ({
        jump,
        shipId,
        boost,
        time: 0,
        lateral: 0,
      })),
    );
  const outer = track.jumps.find((jump) => jump.lane === 'outer');
  cases.push({
    jump: outer,
    shipId: 'kestrel',
    boost: false,
    time: 0,
    lateral: 100,
  });
  const crest = track.jumps.find((jump) => jump.lane === 'crest');
  for (const phase of [-Math.PI / 2, Math.PI / 2])
    cases.push({
      jump: crest,
      shipId: 'kestrel',
      boost: false,
      time: ravelWaveTimeForPhase(track, crest.takeoff, phase, 30),
      lateral: 30,
    });
  for (const { jump, shipId, boost, time, lateral } of cases) {
    const runtime = makeRuntime();
    try {
      const pace = getVehiclePace(shipId, track.pace);
      const state = {
        ...createVehicleState(shipId),
        distance: jump.takeoff - 0.08,
        speed: jump.optional
          ? jump.targetSpeed
          : boost
            ? pace.boostSpeed
            : pace.cruiseSpeed,
        lateral,
        time,
      };
      runtime.reset({ state });
      let launched = false,
        sampled = 0;
      for (let tick = 0; tick < 1500; tick++) {
        const events = runtime.advance(
          state,
          { throttle: 1, steer: 0, brake: 0, boost },
          step,
        );
        if (events.some((event) => event.type === 'jump-launch'))
          launched = true;
        if (launched && tick % 12 === 0) {
          const pose = runtime.pose(1);
          // The extra longitudinal half-length encloses travel between these
          // 100ms samples even at the fleet's fastest boosted flight speed.
          const hit = scenery.firstIntersection(
            pose.position,
            pose.quaternion,
            new T.Vector3(27.25, 25.72, 41),
          );
          assert.equal(
            hit,
            null,
            `${jump.id}/${shipId}: scenery enters real flight envelope at tick ${tick}: ${hit}`,
          );
          sampled++;
        }
        if (
          events.some(
            (event) =>
              event.type === 'jump-transfer' || event.type === 'jump-miss',
          )
        )
          break;
      }
      assert.ok(
        launched && sampled > 0,
        `${jump.id}: actual flight was exercised`,
      );
    } finally {
      runtime.dispose();
    }
  }
});

test('both walls of every asymmetric sail bay support real parked and propelled native hulls', async () => {
  await ensurePhysics();
  assert.ok(track.sheetProfiles.length >= 3);
  for (const profile of track.sheetProfiles) {
    const distance = (profile.entryEnd + profile.plateauEnd) / 2;
    const bounds = track.sheetBoundsAt(distance);
    for (const side of [-1, 1]) {
      const runtime = makeRuntime();
      try {
        const lateral = (side < 0 ? bounds.min : bounds.max) * 0.55;
        const state = {
          ...createVehicleState(),
          distance: distance - 35,
          lateral,
          speed: 0,
        };
        runtime.reset({ state });
        for (let tick = 0; tick < 90; tick++) {
          runtime.advance(state, { throttle: 0, steer: 0, brake: 0 }, step);
          assert.equal(
            runtime.pose(1).grounded,
            true,
            `${profile.id}/${side}: parked wall support`,
          );
        }
        const start = runtime.pose(1).position.clone();
        for (
          let tick = 0;
          tick < 1200 && state.distance < distance + 35;
          tick++
        ) {
          const events = runtime.advance(
            state,
            { throttle: 1, steer: 0, brake: 0 },
            step,
          );
          assert.equal(
            runtime.pose(1).grounded,
            true,
            `${profile.id}/${side}: propelled wall support`,
          );
          assert.equal(Boolean(runtime.pose(1).recovering), false);
          assert.ok(
            !events.some(
              (event) =>
                event.type === 'impact' || event.type === 'road-departure',
            ),
          );
        }
        assert.ok(state.distance >= distance + 35);
        assert.ok(
          Math.abs(state.lateral) > 150,
          'actual driving is far outside the centre guide',
        );
        assert.ok(runtime.pose(1).position.distanceTo(start) > 40);
      } finally {
        runtime.dispose();
      }
    }
  }
});
