import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import test from 'node:test';
import * as T from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import createLevel from '../src/levels/nomad/index.js';
import { createNomadCompanions } from '../src/levels/nomad/companions.js';
import { createNomadWheelContacts } from '../src/levels/nomad/wheel-contact.js';
import {
  createCollisionWorld,
  indexedTriangles,
} from '../src/physics/collision-world.js';
import {
  createNomadTerrain,
  createNomadTerrainPlacements,
  createNomadTerrainTriangles,
  NOMAD_TERRAIN_GEOMETRY_VERSION,
} from '../src/levels/nomad/terrain.js';
import {
  NOMAD_GROUND_GROUP,
  sampleNomadGroundMotion,
} from '../src/levels/nomad/ground-motion.js';
import { createNomadGroundGuides } from './export-nomad-ground-guides.mjs';
import manifest from '../assets/levels/nomad/blender/salt-escarpments/salt-escarpments-provenance.json' with { type: 'json' };
import collision from '../assets/levels/nomad/blender/salt-escarpments/salt-escarpments-collision.json' with { type: 'json' };

const game = new URL('..', import.meta.url).pathname;
const folder = resolve(game, 'assets/levels/nomad/blender/salt-escarpments');
const runtimePath = resolve(game, manifest.runtimeAsset);
async function loadAsset() {
  const bytes = await readFile(runtimePath);
  return new GLTFLoader().parseAsync(
    bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
    '',
  );
}
function releaseScene(scene) {
  const geometries = new Set(),
    materials = new Set();
  scene.traverse((mesh) => {
    if (mesh.geometry) geometries.add(mesh.geometry);
    for (const material of Array.isArray(mesh.material)
      ? mesh.material
      : [mesh.material])
      if (material) materials.add(material);
  });
  for (const geometry of geometries) geometry.dispose();
  for (const material of materials) material.dispose();
}
function pointIndex() {
  const cells = new Map(),
    points = [],
    tolerance = 0.00025;
  return (point) => {
    const cell = point.toArray().map((value) => Math.floor(value / tolerance));
    for (let x = -1; x <= 1; x++)
      for (let y = -1; y <= 1; y++)
        for (let z = -1; z <= 1; z++)
          for (const index of cells.get(
            [cell[0] + x, cell[1] + y, cell[2] + z].join('/'),
          ) ?? [])
            if (points[index].distanceTo(point) < tolerance) return index;
    const index = points.length,
      key = cell.join('/');
    points.push(point.clone());
    if (!cells.has(key)) cells.set(key, []);
    cells.get(key).push(index);
    return index;
  };
}
const faceKey = (ids) => ids.toSorted((a, b) => a - b).join('/');

test('retained salt guides describe the actual frozen shelf profile and current companion layout', async () => {
  const guides = JSON.parse(
    await readFile(resolve(folder, manifest.groundGuides), 'utf8'),
  );
  assert.deepEqual(guides, createNomadGroundGuides());
  assert.ok(
    NOMAD_TERRAIN_GEOMETRY_VERSION.includes(
      manifest.hashes['salt-escarpments-collision.json'],
    ),
  );
  assert.ok(
    NOMAD_TERRAIN_GEOMETRY_VERSION.includes(
      manifest.hashes['salt-ground-guides.json'],
    ),
  );
  const track = createLevel().createTrack();
  const native = createLevel().createCollisionWorld({ track });
  try {
    assert.ok(native.rulesId.includes(NOMAD_TERRAIN_GEOMETRY_VERSION));
  } finally {
    native.dispose();
  }
});

test('both retained terrain layers preserve exact render/native faces and verified editable-source dependencies', async () => {
  for (const [name, expected] of Object.entries(manifest.hashes)) {
    const path = name.endsWith('.glb') ? runtimePath : resolve(folder, name);
    assert.equal(
      createHash('sha256')
        .update(await readFile(path))
        .digest('hex'),
      expected,
      name,
    );
  }
  assert.deepEqual(manifest.prototypes.map((part) => part.name).toSorted(), [
    'nomad_salt_scarp_details',
    'nomad_salt_terraces',
  ]);
  assert.equal(
    manifest.prototypes.reduce(
      (total, part) => total + part.materialBatches,
      0,
    ),
    6,
    'Longer brows retain the six existing terrain material batches',
  );
  assert.ok(
    manifest.totalTriangles < 125000,
    'Full-speed coverage retains a bounded terrain face cost',
  );
  const loaded = await loadAsset();
  loaded.scene.updateMatrixWorld(true);
  try {
    let mineralArea = 0,
      detailArea = 0;
    for (const prototype of collision.prototypes) {
      const root = loaded.scene.getObjectByName(prototype.name);
      assert.ok(root, prototype.name);
      const index = pointIndex(),
        triangles = new Map();
      for (let offset = 0; offset < prototype.indices.length; offset += 3) {
        const key = faceKey(
          [0, 1, 2].map((corner) =>
            index(
              new T.Vector3().fromArray(
                prototype.positions,
                prototype.indices[offset + corner] * 3,
              ),
            ),
          ),
        );
        triangles.set(key, (triangles.get(key) ?? 0) + 1);
      }
      let count = 0;
      const inverse = root.parent.matrixWorld.clone().invert();
      root.traverse((mesh) => {
        if (!mesh.isMesh) return;
        assert.equal(
          mesh.material.metalness,
          0,
          'Salt keeps a rough carbonate finish',
        );
        const matrix = inverse.clone().multiply(mesh.matrixWorld),
          positions = mesh.geometry.attributes.position;
        const size = mesh.geometry.index?.count ?? positions.count;
        for (let offset = 0; offset < size; offset += 3) {
          const points = [0, 1, 2].map((corner) =>
            new T.Vector3()
              .fromBufferAttribute(
                positions,
                mesh.geometry.index?.getX(offset + corner) ?? offset + corner,
              )
              .applyMatrix4(matrix),
          );
          const key = faceKey(points.map((point) => index(point)));
          assert.ok(
            triangles.get(key) > 0,
            `${prototype.name}: rendered face is an actual native face`,
          );
          triangles.set(key, triangles.get(key) - 1);
          if (prototype.motion === NOMAD_GROUND_GROUP) {
            const area = new T.Triangle(...points).getArea();
            detailArea += area;
            if (mesh.material.name.includes('mineral interbed'))
              mineralArea += area;
          }
          count++;
        }
      });
      assert.equal(count, prototype.triangles);
      assert.ok([...triangles.values()].every((value) => value === 0));
    }
    assert.ok(
      mineralArea > 0 && mineralArea / detailArea < 0.05,
      'Real mineral interbeds remain subordinate to white carbonate',
    );
  } finally {
    releaseScene(loaded.scene);
  }
});

test('production terrain keeps exact identity coordinates and assigns only sculpted brows to moving ground', () => {
  const placements = createNomadTerrainPlacements();
  assert.equal(placements.length, 2);
  for (const placement of placements)
    assert.ok(placement.matrix.equals(new T.Matrix4()));
  const index = pointIndex(),
    expected = new Map();
  for (const prototype of collision.prototypes)
    for (let offset = 0; offset < prototype.indices.length; offset += 3) {
      const key =
        `${prototype.motion}:` +
        faceKey(
          [0, 1, 2].map((corner) =>
            index(
              new T.Vector3().fromArray(
                prototype.positions,
                prototype.indices[offset + corner] * 3,
              ),
            ),
          ),
        );
      expected.set(key, (expected.get(key) ?? 0) + 1);
    }
  const triangles = createNomadTerrainTriangles();
  assert.equal(triangles.length, manifest.totalTriangles);
  for (const triangle of triangles) {
    assert.equal(triangle.kind, 'terrain');
    const motion = triangle.motionGroup ?? 'static';
    const key =
      `${motion}:` +
      faceKey(triangle.points.map((point) => index(new T.Vector3(...point))));
    assert.ok(
      expected.get(key) > 0,
      'Every production face keeps its exact authored placement and motion owner',
    );
    expected.set(key, expected.get(key) - 1);
  }
  assert.ok([...expected.values()].every((value) => value === 0));
});

test('every uphill brow retains raised native crests ahead of the full race throughout the supported ground-clock span', async () => {
  const track = createLevel().createTrack();
  const guides = JSON.parse(
    await readFile(resolve(folder, manifest.groundGuides), 'utf8'),
  );
  // The exact floor stays at identity in the convoy frame. Its apron covers
  // the race and far clip; common ground travel belongs only to the brows.
  assert.ok(guides.staticDomain.maxZ > track.length + 30000);
  assert.ok(guides.staticDomain.minZ < -30000);
  assert.ok(
    guides.staticDomain.minX < -30000 && guides.staticDomain.maxX > 32000,
  );
  const details = collision.prototypes.find(
    (part) => part.name === 'nomad_salt_scarp_details',
  );
  const sample = (track.nominalSample ?? track.sample).bind(track);
  const forwardViews = [0, 0.25, 0.5, 0.75, 1].map(
    (fraction) => sample((track.finishDistance - 100) * fraction).position.z,
  );
  assert.equal(
    guides.detailCoverage.groundTravel,
    guides.detailMotion.convoySpeed * 150,
  );
  assert.ok(
    guides.detailCoverage.maxZ - guides.detailCoverage.groundTravel >=
      guides.detailCoverage.courseMaxZ + guides.detailCoverage.forwardDistance,
    'The moving source covers race, full common travel and forward context together',
  );
  const point = new T.Vector3();
  for (const band of guides.detailBands) {
    const part = details.parts.find((part) =>
      part.name.startsWith(`${band.id} /`),
    );
    assert.ok(part, `${band.id}: retained sculpted source member`);
    const vertices = new Set(
      details.indices.slice(part.indexStart, part.indexStart + part.indexCount),
    );
    const upper = Math.max(
      ...guides.saltBenches
        .filter((bench) => [band.fromBench, band.toBench].includes(bench.id))
        .map((bench) => bench.heightOffset),
    );
    for (const time of [0, 30, 60, 90, 120, 150]) {
      const displacement = sampleNomadGroundMotion(track, time).translation;
      const raised = forwardViews.map(() => 0);
      for (const vertex of vertices) {
        point.fromArray(details.positions, vertex * 3).add(displacement);
        const aboveUpper =
          point.y +
          track.saltPlane.grade * point.z -
          track.saltPlane.height -
          upper;
        if (aboveUpper > 5)
          for (const [index, z] of forwardViews.entries())
            if (point.z > z + 2000 && point.z < z + 8000) raised[index]++;
      }
      for (const [index, count] of raised.entries())
        assert.ok(
          count > 0,
          `${band.id}: higher-shelf crest has scrolled behind race view ${index} at ${time}s`,
        );
    }
  }
});

test('static profile covers every real tire at late clocks and moving brow bases remain seated on H(x)-grade*z', () => {
  const track = createLevel().createTrack();
  const profile = collision.prototypes.find(
    (part) => part.name === 'nomad_salt_terraces',
  );
  const world = createCollisionWorld({
    id: 'nomad-static-profile-coverage',
    version: 1,
    geometryId: NOMAD_TERRAIN_GEOMETRY_VERSION,
    triangles: indexedTriangles(profile.positions, profile.indices, {
      id: 'profile',
      kind: 'terrain',
    }),
  });
  const contacts = createNomadWheelContacts({
    track,
    carriers: [...track.carriers, ...createNomadCompanions(track)],
  });
  const matrix = new T.Matrix4(),
    point = new T.Vector3(),
    quaternion = new T.Quaternion();
  const hitAt = (x, z) => {
    const y = track.groundHeightAt(x, z);
    const hit = world.sweepHull(
      { position: new T.Vector3(x, y + 2, z), quaternion },
      { position: new T.Vector3(x, y - 2, z), quaternion },
      { halfWidth: 0.002, halfLength: 0.002, hover: 0.002 },
    );
    assert.ok(hit, `Actual static terrain covers ${x},${z}`);
    assert.ok(
      Math.abs(hit.point.y - track.groundHeightAt(hit.point.x, hit.point.z)) <
        0.003,
      'The native contact is on the exact physical profile',
    );
  };
  try {
    for (const time of [0, 9.5, 19, 28.5, 102.7, 7200]) {
      track.presentationTime = time;
      contacts.update();
      for (let index = 0; index < contacts.mesh.count; index++) {
        contacts.mesh.getMatrixAt(index, matrix);
        point.setFromMatrixPosition(matrix);
        hitAt(point.x, point.z);
      }
    }
    const xs = track.groundProfileKnots.flatMap((knot, index, knots) =>
      index ? [knot.x, (knot.x + knots[index - 1].x) / 2] : [knot.x],
    );
    for (const x of xs) for (const z of [-2000, 0, 12000, 24000]) hitAt(x, z);
    for (const x of [-60000, 0, 60000])
      for (const z of [-60000, 60000]) hitAt(x, z);
    for (const prototype of collision.prototypes) {
      assert.ok(
        prototype.groundContactVertices.length > 0,
        `${prototype.name}: retained real contact vertices`,
      );
      for (const vertex of prototype.groundContactVertices) {
        point.fromArray(prototype.positions, vertex * 3);
        for (const time of prototype.motion === NOMAD_GROUND_GROUP
          ? [0, 45, 130, 7200]
          : [0]) {
          const actual = point
            .clone()
            .add(
              prototype.motion === NOMAD_GROUND_GROUP
                ? sampleNomadGroundMotion(track, time).translation
                : new T.Vector3(),
            );
          assert.ok(
            Math.abs(actual.y - track.groundHeightAt(actual.x, actual.z)) <
              0.003,
            `${prototype.name}: its actual base stays seated throughout ground travel`,
          );
        }
      }
    }
  } finally {
    contacts.dispose();
    world.dispose();
  }
});

test('terrain art and collision clear supported full-width roads and the moving 25m camera volume', () => {
  const track = createLevel().createTrack();
  for (const prototype of collision.prototypes) {
    const world = createCollisionWorld({
      id: prototype.name,
      version: 1,
      geometryId: NOMAD_TERRAIN_GEOMETRY_VERSION,
      triangles: indexedTriangles(prototype.positions, prototype.indices, {
        id: prototype.name,
        kind: 'terrain',
      }),
    });
    try {
      for (const time of [0, 9.5, 19, 28.5, 102.7])
        for (let distance = 0; distance < track.length - 16; distance += 16) {
          if ([distance, distance + 16].some((s) => track.isGap(s))) continue;
          const a = track.frameAtTime(distance, time),
            b = track.frameAtTime(distance + 16, time);
          if (prototype.motion === NOMAD_GROUND_GROUP) {
            const displacement = sampleNomadGroundMotion(
              track,
              time,
            ).translation;
            a.position.sub(displacement);
            b.position.sub(displacement);
          }
          assert.equal(
            world.sweepHull(a, b, {
              halfWidth:
                Math.max(
                  track.halfWidthAt(distance),
                  track.halfWidthAt(distance + 16),
                ) + 25,
              halfLength: 25,
              hover: 25,
            }),
            null,
            `${prototype.name}: actual terrain crowds the supported road/camera at ${distance}, time${time}`,
          );
        }
    } finally {
      world.dispose();
    }
  }
});

test('static floor, moving details and borrowed salt finish retain pause ownership and release once on failure or cancellation', async () => {
  const track = createLevel().createTrack();
  for (const shape of [false, true]) {
    const loaded = await loadAsset(),
      released = new Map(),
      resources = new Set();
    loaded.scene.traverse((mesh) => {
      if (mesh.geometry) resources.add(mesh.geometry);
      if (mesh.material) resources.add(mesh.material);
    });
    for (const resource of resources)
      resource.addEventListener('dispose', () =>
        released.set(resource, (released.get(resource) ?? 0) + 1),
      );
    const borrowedTexture = new T.DataTexture(
      new Uint8Array([255, 255, 255, 255]),
      1,
      1,
    );
    const borrowed = shape
      ? new T.MeshStandardMaterial({ map: borrowedTexture })
      : new T.ShaderMaterial({
          uniforms: { saltDetail: { value: borrowedTexture } },
        });
    let borrowedDisposals = 0,
      borrowedTextureDisposals = 0;
    borrowed.addEventListener('dispose', () => borrowedDisposals++);
    borrowedTexture.addEventListener(
      'dispose',
      () => borrowedTextureDisposals++,
    );
    const terrain = createNomadTerrain({
      track,
      shape,
      floorMaterial: borrowed,
      loadAsset: async () => loaded,
    });
    await terrain.ready;
    assert.equal(terrain.group.children.length, 2);
    const floor = terrain.group.getObjectByName('Nomad / nomad_salt_terraces');
    const details = terrain.group.getObjectByName(
      'Nomad / nomad_salt_scarp_details',
    );
    assert.ok(floor && details);
    let borrowedUsers = 0;
    floor.traverse((mesh) => {
      if (mesh.isMesh && mesh.material === borrowed) {
        borrowedUsers++;
        assert.equal(mesh.castShadow, false);
        assert.equal(mesh.receiveShadow, true);
      }
    });
    assert.ok(
      borrowedUsers > 0,
      'Only the exact static floor binds the scrolling salt finish',
    );
    details.traverse((mesh) => {
      if (mesh.isMesh)
        assert.notEqual(
          mesh.material,
          borrowed,
          'Moving details do not scroll salt a second time',
        );
    });
    for (const time of [0, 22, 22, 91, 7200]) {
      track.presentationTime = time;
      terrain.update();
      assert.ok(terrain.group.position.equals(new T.Vector3()));
      assert.ok(
        floor.position.equals(new T.Vector3()),
        'Static profile never translates out of the race at a late clock',
      );
      assert.ok(
        details.position.equals(
          sampleNomadGroundMotion(track, time).translation,
        ),
      );
    }
    terrain.dispose();
    terrain.dispose();
    terrain.update();
    assert.equal(terrain.group.children.length, 0);
    assert.equal(released.size, resources.size);
    assert.ok([...released.values()].every((count) => count === 1));
    assert.equal(
      borrowedDisposals,
      0,
      'The environment retains ownership of its salt material',
    );
    assert.equal(
      borrowedTextureDisposals,
      0,
      'The environment retains ownership of its salt textures',
    );
    borrowed.dispose();
    borrowedTexture.dispose();
  }
  const late = await loadAsset();
  const lateResources = new Set(),
    lateReleased = new Map();
  late.scene.traverse((mesh) => {
    if (mesh.geometry) lateResources.add(mesh.geometry);
    if (mesh.material) lateResources.add(mesh.material);
  });
  for (const resource of lateResources)
    resource.addEventListener('dispose', () =>
      lateReleased.set(resource, (lateReleased.get(resource) ?? 0) + 1),
    );
  const lateTexture = new T.DataTexture(
    new Uint8Array([255, 255, 255, 255]),
    1,
    1,
  );
  const lateBorrowed = new T.ShaderMaterial({
    uniforms: { saltDetail: { value: lateTexture } },
  });
  let lateBorrowedDisposals = 0,
    lateTextureDisposals = 0;
  lateBorrowed.addEventListener('dispose', () => lateBorrowedDisposals++);
  lateTexture.addEventListener('dispose', () => lateTextureDisposals++);
  let resolveLoad;
  const pending = new Promise((resolve) => {
    resolveLoad = resolve;
  });
  const terrain = createNomadTerrain({
    track,
    floorMaterial: lateBorrowed,
    loadAsset: () => pending,
  });
  terrain.dispose();
  resolveLoad(late);
  await terrain.ready;
  assert.equal(terrain.group.children.length, 0);
  assert.equal(lateReleased.size, lateResources.size);
  assert.ok([...lateReleased.values()].every((count) => count === 1));
  assert.equal(lateBorrowedDisposals, 0);
  assert.equal(lateTextureDisposals, 0);
  lateBorrowed.dispose();
  lateTexture.dispose();
  const failed = createNomadTerrain({
    track,
    loadAsset: async () => {
      throw new Error('fixture interrupted');
    },
  });
  await assert.rejects(failed.ready, /salt escarpments could not load/);
  failed.dispose();
  failed.dispose();
});
