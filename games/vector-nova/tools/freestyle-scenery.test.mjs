import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import * as T from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import createLevel from '../src/levels/launchworks/index.js';
import { createLaunchworksEnvironment } from '../src/levels/launchworks/environment.js';
import { batchSkywellScenery } from '../src/levels/launchworks/scenery-batches.js';
import { createDeviceRuntime } from '../src/pickups/runtime.js';
import { createVehicleState } from '../src/physics/index.js';
import { createCameraRig } from '../src/camera/index.js';
import { COLLISION_HULLS } from '../src/ships/collision-hulls.js';
import { createTransferPilot } from './freestyle-pilot.mjs';

const root = new URL('../', import.meta.url);
const cellSize = 160;
const cellKey = (x, y, z) => `${x},${y},${z}`;

test('spatial batches retain hierarchical transforms and per-draw water frames while borrowing source art', () => {
  const assembly = new T.Group(),
    nested = new T.Group(),
    material = new T.MeshStandardMaterial(),
    stone = new T.Mesh(new T.BoxGeometry(15, 25, 20), material),
    waterGeometry = new T.PlaneGeometry(30, 90);
  waterGeometry.setAttribute(
    'flowRight',
    new T.Float32BufferAttribute(
      new Array(waterGeometry.attributes.position.count).fill([1, 0, 0]).flat(),
      3,
    ),
  );
  const water = new T.Mesh(waterGeometry, material);
  assembly.position.set(400, 900, -750);
  assembly.rotation.set(0.12, 0.7, -0.05);
  assembly.scale.set(1.3, 0.8, 1.1);
  nested.position.set(-60, 100, 20);
  nested.rotation.y = 0.5;
  nested.add(stone, water);
  assembly.add(nested);
  const batches = batchSkywellScenery([assembly]);
  batches.group.updateWorldMatrix(true, true);
  const matrix = new T.Matrix4();
  for (const source of [stone, water]) {
    const draw = batches.group.children.find(
      (mesh) => mesh.geometry === source.geometry,
    );
    assert.ok(draw);
    if (draw.isInstancedMesh) {
      draw.getMatrixAt(0, matrix);
      matrix.premultiply(draw.matrixWorld);
    } else matrix.copy(draw.matrixWorld);
    const point = new T.Vector3(1.2, -4, 5),
      actual = point.clone().applyMatrix4(matrix),
      expected = source.localToWorld(point.clone());
    assert.ok(actual.distanceTo(expected) < 0.0001);
    if (source === water) {
      assert.equal(
        draw.isInstancedMesh,
        undefined,
        'custom flowRight shader retains a full per-draw model matrix',
      );
      const across = new T.Vector3(1, 0, 0),
        original = across
          .clone()
          .applyNormalMatrix(
            new T.Matrix3().getNormalMatrix(source.matrixWorld),
          ),
        retained = across
          .clone()
          .applyNormalMatrix(new T.Matrix3().getNormalMatrix(draw.matrixWorld));
      assert.ok(original.distanceTo(retained) < 1e-10);
    }
  }
  let sourceDisposals = 0;
  for (const resource of [stone.geometry, waterGeometry, material])
    resource.addEventListener('dispose', () => sourceDisposals++);
  batches.dispose();
  batches.dispose();
  assert.equal(sourceDisposals, 0);
  stone.geometry.dispose();
  waterGeometry.dispose();
  material.dispose();
});

function makeCorridor(position, quaternion, box, label) {
  const matrix = new T.Matrix4().compose(
    position,
    quaternion,
    new T.Vector3(1, 1, 1),
  );
  return {
    box,
    bounds: box.clone().applyMatrix4(matrix),
    inverse: matrix.clone().invert(),
    label,
  };
}

async function routeAndFlightCorridors(level, track) {
  const corridors = [],
    roadBox = new T.Box3(new T.Vector3(-25, 0.2, -8), new T.Vector3(25, 17, 8)),
    hullBox = new T.Box3(
      new T.Vector3(...COLLISION_HULLS.kestrel.bounds.min),
      new T.Vector3(...COLLISION_HULLS.kestrel.bounds.max),
    ).expandByScalar(0.6),
    cameraBox = new T.Box3(new T.Vector3(-2, -2, -2), new T.Vector3(2, 2, 2));
  for (let s = 0; s <= track.finishDistance; s += 12) {
    if (track.isGap(s)) continue;
    const frame = track.sample(s);
    corridors.push(
      makeCorridor(
        frame.position,
        frame.quaternion,
        roadBox,
        `road ${Math.round(s)}m`,
      ),
    );
  }
  const collisionWorld = await level.createCollisionWorld({ track }),
    dynamics = await level.createDynamics({ track, collisionWorld }),
    runtime = createDeviceRuntime({
      track,
      devices: level.racing.createDevices(track),
      equipmentEnabled: false,
      motion: level.createRuntime({
        track,
        collisionWorld,
        dynamics,
        presentation: false,
        settings: { steeringAssist: 0.3 },
      }),
    });
  let flightSamples = 0;
  try {
    for (const [index, jump] of track.jumps.entries()) {
      const state = {
        ...createVehicleState('kestrel'),
        ...track.scenarios[`jump${index + 1}-approach`],
      };
      runtime.reset({ state, seed: 7 });
      const pilot = createTransferPilot(track, {
          reaction: 0.15,
          quantum: 0.25,
          targetSpeed: 'course',
        }),
        camera = new T.PerspectiveCamera(61, 16 / 9, 0.1, 24000),
        rig = createCameraRig(camera, level.camera);
      let landed = false;
      for (let tick = 0; tick < 1800; tick++) {
        const motion = runtime.snapshot(),
          pose = runtime.pose(1),
          controls = pilot({ state, motion, pose });
        rig.update(track, state, 1 / 120, { worldPose: pose });
        if (motion.flight && tick % 6 === 0) {
          // Separate occupied hull, real chase camera and connecting sightline.
          // A large rotating rectangle around all three includes empty corners
          // below the receiving road and falsely flags its accepted supports.
          const halfBoom = camera.position.distanceTo(pose.position) / 2,
            boomBox = new T.Box3(
              new T.Vector3(-1.5, -1.5, -halfBoom),
              new T.Vector3(1.5, 1.5, halfBoom),
            ),
            boomCenter = camera.position
              .clone()
              .add(pose.position)
              .multiplyScalar(0.5),
            boomRotation = new T.Quaternion().setFromRotationMatrix(
              new T.Matrix4().lookAt(
                camera.position,
                pose.position,
                new T.Vector3(0, 1, 0).applyQuaternion(camera.quaternion),
              ),
            );
          corridors.push(
            makeCorridor(
              pose.position,
              pose.quaternion,
              hullBox,
              `${jump.label} hull ${tick}`,
            ),
            makeCorridor(
              camera.position,
              camera.quaternion,
              cameraBox,
              `${jump.label} camera ${tick}`,
            ),
            makeCorridor(
              boomCenter,
              boomRotation,
              boomBox,
              `${jump.label} camera sightline ${tick}`,
            ),
          );
          flightSamples++;
        }
        const events = runtime.advance(state, controls, 1 / 120);
        assert.equal(
          events.some(({ type }) =>
            ['jump-miss', 'road-recovery'].includes(type),
          ),
          false,
          `${jump.label}: native approach stays valid`,
        );
        const contact = events.find(({ type }) => type === 'jump-transfer');
        if (!contact) continue;
        assert.equal(contact.payload.outcome, 'landed');
        landed = true;
        break;
      }
      assert.ok(
        landed,
        `${jump.label}: actual native hull reaches its approved receiver`,
      );
    }
  } finally {
    runtime.dispose();
    dynamics.dispose();
    collisionWorld.dispose();
  }
  assert.ok(
    flightSamples > 100,
    'clearance samples the real five airborne paths',
  );
  return corridors;
}

function degenerateFlowTangents(group) {
  const findings = [],
    instance = new T.Matrix4(),
    world = new T.Matrix4(),
    shaderFrame = new T.Matrix3(),
    surfaceFrame = new T.Matrix3(),
    normal = new T.Vector3(),
    across = new T.Vector3();
  group.updateWorldMatrix(true, true);
  group.traverseVisible((mesh) => {
    const flow = mesh.geometry?.attributes.flowRight,
      normals = mesh.geometry?.attributes.normal;
    if (!mesh.isMesh || !flow || !normals) return;
    shaderFrame.getNormalMatrix(mesh.matrixWorld);
    for (
      let instanceIndex = 0;
      instanceIndex < (mesh.isInstancedMesh ? mesh.count : 1);
      instanceIndex++
    ) {
      if (mesh.isInstancedMesh) {
        mesh.getMatrixAt(instanceIndex, instance);
        world.multiplyMatrices(mesh.matrixWorld, instance);
      } else world.copy(mesh.matrixWorld);
      surfaceFrame.getNormalMatrix(world);
      for (let i = 0; i < flow.count; i++) {
        normal.fromBufferAttribute(normals, i).applyNormalMatrix(surfaceFrame);
        across.fromBufferAttribute(flow, i).applyMatrix3(shaderFrame);
        across.addScaledVector(normal, -across.dot(normal));
        if (
          [...normal.toArray(), ...across.toArray()].every(Number.isFinite) &&
          across.lengthSq() > 1e-8
        )
          continue;
        findings.push(`${mesh.name} instance ${instanceIndex} vertex ${i}`);
        if (findings.length >= 20) return;
      }
    }
  });
  return findings;
}

function sceneryIntersections(group, corridors) {
  const cells = new Map();
  function eachCell(box, visit) {
    const low = box.min.clone().divideScalar(cellSize).floor(),
      high = box.max.clone().divideScalar(cellSize).floor();
    for (let x = low.x; x <= high.x; x++)
      for (let y = low.y; y <= high.y; y++)
        for (let z = low.z; z <= high.z; z++) visit(cellKey(x, y, z));
  }
  corridors.forEach((corridor, index) =>
    eachCell(corridor.bounds, (key) => {
      if (!cells.has(key)) cells.set(key, []);
      cells.get(key).push(index);
    }),
  );
  const findings = [],
    instance = new T.Matrix4(),
    world = new T.Matrix4(),
    triangle = new T.Triangle(),
    localTriangle = new T.Triangle(),
    triangleBounds = new T.Box3();
  group.updateWorldMatrix(true, true);
  group.traverseVisible((mesh) => {
    if (!mesh.isMesh) return;
    const materials = [mesh.material].flat(),
      opaque = materials.some(
        (material) =>
          material.visible && !material.transparent && material.opacity > 0,
      );
    if (!opaque) return;
    const geometry = mesh.geometry,
      vertices = geometry.attributes.position,
      indices = geometry.index;
    geometry.computeBoundingBox();
    for (let i = 0; i < (mesh.isInstancedMesh ? mesh.count : 1); i++) {
      if (mesh.isInstancedMesh) {
        mesh.getMatrixAt(i, instance);
        world.multiplyMatrices(mesh.matrixWorld, instance);
      } else world.copy(mesh.matrixWorld);
      const bounds = geometry.boundingBox.clone().applyMatrix4(world),
        candidates = new Set();
      eachCell(bounds, (key) => {
        for (const index of cells.get(key) ?? [])
          if (corridors[index].bounds.intersectsBox(bounds))
            candidates.add(index);
      });
      if (!candidates.size) continue;
      for (let n = 0; n < (indices?.count ?? vertices.count); n += 3) {
        for (const [corner, target] of [
          [0, triangle.a],
          [1, triangle.b],
          [2, triangle.c],
        ])
          target
            .fromBufferAttribute(
              vertices,
              indices ? indices.getX(n + corner) : n + corner,
            )
            .applyMatrix4(world);
        triangleBounds.setFromPoints([triangle.a, triangle.b, triangle.c]);
        for (const index of candidates) {
          const corridor = corridors[index];
          if (!corridor.bounds.intersectsBox(triangleBounds)) continue;
          localTriangle.copy(triangle);
          for (const point of [
            localTriangle.a,
            localTriangle.b,
            localTriangle.c,
          ])
            point.applyMatrix4(corridor.inverse);
          if (!corridor.box.intersectsTriangle(localTriangle)) continue;
          const detail = `${mesh.name} instance ${i} intersects ${corridor.label}`;
          if (!findings.includes(detail)) findings.push(detail);
          if (findings.length >= 20) return;
        }
        if (findings.length >= 20) return;
      }
    }
  });
  return findings;
}

test('completed Skywell scenery clears real native transfers and owns its resources exactly once', async (t) => {
  const level = createLevel(),
    track = level.createTrack(),
    resources = new Map();
  function observe(resource) {
    if (resources.has(resource)) return;
    resources.set(resource, 0);
    resource.addEventListener('dispose', () =>
      resources.set(resource, resources.get(resource) + 1),
    );
  }
  function observeTree(group) {
    group.traverse((mesh) => {
      if (mesh.geometry) observe(mesh.geometry);
      if (mesh.isInstancedMesh) observe(mesh);
      for (const material of [mesh.material].flat().filter(Boolean)) {
        observe(material);
        for (const value of Object.values(material))
          if (value?.isTexture) observe(value);
      }
    });
  }
  const environment = await createLaunchworksEnvironment({
    track,
    async loadAsset(url) {
      const data = await readFile(
        new URL(`public/${url.replace(/^\/+/, '')}`, root),
      );
      const gltf = await new GLTFLoader().parseAsync(
        data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength),
        '',
      );
      observeTree(gltf.scene);
      return gltf;
    },
    async loadTexture() {
      const texture = new T.Texture();
      observe(texture);
      return texture;
    },
  });
  t.after(() => environment.dispose());
  observeTree(environment.group);
  const externalReflection = new T.Texture();
  let reflectionDisposals = 0;
  externalReflection.addEventListener('dispose', () => reflectionDisposals++);
  environment.setReflection(externalReflection);
  const corridors = await routeAndFlightCorridors(level, track);
  await t.test(
    'every visible water vertex retains a finite nonzero across-flow shading tangent',
    () => {
      assert.deepEqual(degenerateFlowTangents(environment.group), []);
    },
  );
  await t.test(
    'actual world matrices and triangles keep the road, air and close camera corridor open',
    () => {
      assert.deepEqual(sceneryIntersections(environment.group, corridors), []);
    },
  );
  await t.test(
    'teardown releases owned source/batched/garden/water resources without taking the reflection',
    () => {
      environment.dispose();
      environment.dispose();
      const incorrect = [...resources]
        .filter(([, count]) => count !== 1)
        .map(
          ([resource, count]) =>
            `${resource.type ?? resource.constructor.name} ${resource.name || resource.uuid}: ${count} disposals`,
        );
      assert.deepEqual(incorrect, []);
      assert.equal(reflectionDisposals, 0);
      externalReflection.dispose();
    },
  );
});

test('Skywell composition rejection releases loaded source art and limestone exactly once', async () => {
  const track = createLevel().createTrack(),
    resources = new Map();
  let limestone,
    oversizedNave = false;
  function observe(resource) {
    if (resources.has(resource)) return;
    resources.set(resource, 0);
    resource.addEventListener('dispose', () =>
      resources.set(resource, resources.get(resource) + 1),
    );
  }
  await assert.rejects(
    createLaunchworksEnvironment({
      track,
      async loadAsset(url) {
        const data = await readFile(
          new URL(`public/${url.replace(/^\/+/, '')}`, root),
        );
        const gltf = await new GLTFLoader().parseAsync(
          data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength),
          '',
        );
        const nave = url.endsWith('/nave-bay.glb');
        gltf.scene.traverse((mesh) => {
          // Valid loaded geometry that cannot fit any real precinct site forces
          // composition to fail after the private source library is acquired.
          if (mesh.geometry) {
            if (nave) mesh.geometry.scale(1000, 1000, 1000);
            observe(mesh.geometry);
          }
          for (const material of [mesh.material].flat().filter(Boolean)) {
            observe(material);
            for (const value of Object.values(material))
              if (value?.isTexture) observe(value);
          }
        });
        oversizedNave ||= nave;
        return gltf;
      },
      async loadTexture() {
        limestone = new T.Texture();
        observe(limestone);
        return limestone;
      },
    }),
    /No clear Skywell precinct site: Cloister walk\/nave-bay/,
  );
  assert.ok(
    oversizedNave,
    'failure uses an oversized loaded architectural asset',
  );
  assert.ok(
    resources.size > 1,
    'source assets were acquired before composition failed',
  );
  assert.equal(resources.get(limestone), 1, 'limestone is released once');
  assert.deepEqual(
    [...resources]
      .filter(([, count]) => count !== 1)
      .map(
        ([resource, count]) =>
          `${resource.type ?? resource.constructor.name} ${resource.name || resource.uuid}: ${count} disposals`,
      ),
    [],
  );
});
