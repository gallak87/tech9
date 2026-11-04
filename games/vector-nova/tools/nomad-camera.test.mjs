import assert from 'node:assert/strict';
import { before, after, test } from 'node:test';
import { readFile } from 'node:fs/promises';
import * as T from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import createLevel from '../src/levels/nomad/index.js';
import { createCameraRig } from '../src/camera/index.js';
import { createVehicleState } from '../src/physics/index.js';
import { createDeviceRuntime } from '../src/pickups/runtime.js';
import { getRacerControl } from '../src/race/racers.js';

// Desktop geometry checks: actual production camera and road/environment GLBs.
// Only texture decoding is replaced; no art or collision stand-ins are used.
const loader = new GLTFLoader()
  .register(() => ({
    name: 'KHR_texture_basisu',
    loadTexture: async () => new T.Texture(),
  }))
  .register(() => ({
    name: 'CPU_TEXTURES',
    loadTexture: async () => new T.Texture(),
  }));
const level = createLevel(),
  track = level.createTrack();
const aspects = [16 / 10, 16 / 9];
let bounds,
  corners,
  road,
  environment,
  scene,
  solids,
  collisionWorld,
  dynamics,
  devices,
  shipModel;
const ray = new T.Raycaster();
const settings = { quality: 'high', reducedMotion: true };
async function model(path) {
  const bytes = await readFile(
    new URL(`../public/assets/${path}`, import.meta.url),
  );
  return loader.parseAsync(
    bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
    '',
  );
}
before(async () => {
  shipModel = (await model('ships/kestrel/kestrel.glb')).scene;
  bounds = new T.Box3().setFromObject(shipModel);
  corners = [];
  for (const x of [bounds.min.x, bounds.max.x])
    for (const y of [bounds.min.y, bounds.max.y])
      for (const z of [bounds.min.z, bounds.max.z])
        corners.push(new T.Vector3(x, y, z));
  road = level.createRoad({ track });
  environment = level.createEnvironment({
    track,
    road,
    settings,
    loadAsset: (url) => model(`levels/nomad/${url.split('/').at(-1)}`),
  });
  await Promise.all([road.ready, environment.ready]);
  scene = new T.Group();
  scene.add(road.group, environment.group);
  solids = [];
  scene.traverse((mesh) => {
    if (!mesh.isMesh || (!mesh.castShadow && !mesh.userData.drivingSurface))
      return;
    solids.push(mesh);
    // Physical camera clearance must also catch an eye inside a closed freight
    // mesh. Query both sides of the actual triangles, without changing geometry.
    for (const material of Array.isArray(mesh.material)
      ? mesh.material
      : [mesh.material])
      material.side = T.DoubleSide;
  });
  collisionWorld = level.createCollisionWorld({ track });
  dynamics = await level.createDynamics({ track, collisionWorld });
  devices = level.racing.createDevices(track);
});
after(() => {
  dynamics?.dispose();
  collisionWorld?.dispose();
  environment?.dispose();
  road?.dispose();
  const geometries = new Set(),
    materials = new Set(),
    textures = new Set();
  shipModel?.traverse((mesh) => {
    if (mesh.geometry) geometries.add(mesh.geometry);
    for (const material of Array.isArray(mesh.material)
      ? mesh.material
      : [mesh.material]) {
      if (!material) continue;
      materials.add(material);
      for (const value of Object.values(material))
        if (value?.isTexture) textures.add(value);
    }
  });
  for (const value of [...geometries, ...materials, ...textures])
    value.dispose();
});

function cameraObserver(aspect) {
  const camera = new T.PerspectiveCamera(61, aspect, 0.2, 30000);
  const subject = new T.Object3D();
  const rig = createCameraRig(camera, level.camera, bounds);
  let previous = null;
  const frame = (state, pose, dt = 1 / 60) => {
    track.presentationTime = state.time;
    subject.position.copy(pose.position);
    subject.quaternion.copy(pose.quaternion);
    rig.update(track, state, dt, {
      subject,
      worldPose: pose,
      reducedMotion: true,
    });
    subject.updateWorldMatrix(true, false);
    camera.updateMatrixWorld();
    assert.ok(
      [...camera.position, ...camera.quaternion, camera.fov].every(
        Number.isFinite,
      ),
    );
    assert.ok(Math.abs(camera.quaternion.length() - 1) < 1e-8);
    for (const corner of corners) {
      const point = corner
        .clone()
        .applyMatrix4(subject.matrixWorld)
        .project(camera);
      const safe =
        pose.grounded === false
          ? { left: -0.98, right: 0.98, bottom: -0.98, top: 0.98 }
          : level.camera.safeFrame;
      assert.ok(
        point.x >= safe.left - 0.002 &&
          point.x <= safe.right + 0.002 &&
          point.y >= safe.bottom - 0.002 &&
          point.y <= safe.top + 0.002 &&
          point.z > -1 &&
          point.z < 1,
        `desktop${aspect}: actual Kestrel clipped at ${state.distance.toFixed(2)}: ${point.toArray()}`,
      );
    }
    const relative = camera.position.clone().sub(pose.position);
    if (previous) {
      assert.ok(
        camera.quaternion.angleTo(previous.quaternion) < 0.25,
        `desktop${aspect}: chase orientation snapped at ${state.distance.toFixed(2)}`,
      );
      assert.ok(
        relative.distanceTo(previous.relative) < 7,
        `desktop${aspect}: eye offset snapped at ${state.distance.toFixed(2)}`,
      );
    }
    previous = { relative, quaternion: camera.quaternion.clone() };
    return camera;
  };
  return { camera, subject, frame };
}

function groundedPose(state) {
  const surface = track.surfaceAtTime(
    state.distance,
    state.lateral,
    state.time,
  );
  return {
    position: surface.position.clone().addScaledVector(surface.up, 0.76),
    quaternion: surface.quaternion,
    grounded: true,
  };
}
function updateRendered(camera, state) {
  track.presentationTime = state.time;
  road.update();
  environment.update({ camera, settings });
  scene.updateMatrixWorld(true);
}
function renderedOccluder(start, end) {
  const direction = end.clone().sub(start),
    length = direction.length();
  ray.set(start, direction.normalize());
  ray.near = 0.03;
  ray.far = Math.max(0.03, length - 0.35);
  return ray.intersectObjects(solids, false)[0] ?? null;
}
function visibleReceiver(camera, jump, time) {
  const owner = road.owners.get(jump.receivingCarrierId);
  const receiving = owner.children.filter(
    (mesh) => mesh.userData.drivingSurface,
  );
  const seen = [],
    blocked = [];
  for (const ahead of [30, 90, 170, 270])
    for (const lateralFraction of [-0.3, 0, 0.3]) {
      const distance = Math.min(
        jump.landingEnd - 20,
        jump.landingStart + ahead,
      );
      const surface = track.surfaceAtTime(
        distance,
        track.halfWidthAt(distance) * lateralFraction,
        time,
      );
      ray.set(
        surface.position.clone().addScaledVector(surface.up, 12),
        surface.up.clone().negate(),
      );
      ray.near = 0;
      ray.far = 30;
      const actual = ray.intersectObjects(receiving, false)[0];
      assert.ok(
        actual,
        `${jump.id}: target belongs to the actual tessellated receiver skin`,
      );
      const point = actual.point.clone().project(camera);
      if (
        Math.abs(point.x) >= 0.94 ||
        Math.abs(point.y) >= 0.94 ||
        point.z <= -1 ||
        point.z >= 1
      )
        continue;
      const direction = actual.point.clone().sub(camera.position);
      ray.set(camera.position, direction.clone().normalize());
      ray.near = 0.03;
      ray.far = direction.length() + 0.1;
      const first = ray.intersectObjects(solids, false)[0];
      if (
        first?.object.userData.drivingSurface &&
        first.object.userData.motionGroup === jump.receivingCarrierId
      )
        seen.push({ ahead, lateralFraction });
      else blocked.push({ ahead, object: first?.object.name ?? 'none' });
    }
  return { seen, blocked };
}

test('desktop big-air approaches keep the actual craft framed and expose an unobstructed receiving road at commitment', () => {
  const big = track.jumps.filter((jump) => jump.bigAir);
  assert.equal(big.length, 4);
  dynamics.reset();
  dynamics.setNomadTime(0);
  const failures = [];
  for (const jump of big)
    for (const aspect of aspects)
      for (const lateral of [-10, 0, 10]) {
        const observer = cameraObserver(aspect);
        const state = {
          ...createVehicleState(),
          distance: jump.takeoff - 380,
          speed: jump.targetSpeed,
          lateral,
          time: 0,
        };
        try {
          let tick = 0;
          while (state.distance < jump.takeoff - 0.5) {
            state.distance = Math.min(
              jump.takeoff - 0.5,
              state.distance + state.speed / 60,
            );
            const pose = groundedPose(state),
              camera = observer.frame(state, pose);
            if (tick++ % 24 === 0) {
              assert.ok(
                dynamics.occlusionFraction(camera.position, pose.position) >
                  0.995,
                `${jump.id}: native carrier structure blocks the approach camera at ${state.distance}`,
              );
            }
          }
          updateRendered(observer.camera, state);
          const visible = visibleReceiver(observer.camera, jump, 0);
          assert.ok(
            visible.seen.length >= 3 &&
              new Set(visible.seen.map((point) => point.ahead)).size >= 2,
            `${jump.id}/desktop${aspect}/lane${lateral}: receiving road hidden at commitment: ${JSON.stringify(visible)}`,
          );
          assert.equal(
            renderedOccluder(
              observer.camera.position,
              observer.subject.position,
            ),
            null,
            `${jump.id}: actual rendered geometry blocks camera-to-craft sightline`,
          );
        } catch (error) {
          failures.push(error.message);
        }
      }
  assert.deepEqual(failures, []);
});

test(
  'four real native large flights retain continuous desktop chase through supported arrivals',
  { timeout: 120000 },
  () => {
    const failures = [];
    for (const jump of track.jumps.filter((entry) => entry.bigAir)) {
      dynamics.reset();
      const runtime = createDeviceRuntime({
        track,
        devices,
        motion: level.createRuntime({ track, collisionWorld, dynamics }),
      });
      const state = {
        ...createVehicleState(),
        distance: jump.takeoff - 140,
        speed: jump.targetSpeed,
        time: 0,
      };
      const observers = aspects.map(cameraObserver);
      let transfer = null,
        afterLanding = 0,
        airFrames = 0,
        committed = false;
      try {
        runtime.reset({ state });
        for (const observer of observers)
          observer.frame(state, runtime.pose(1));
        for (let tick = 0; tick < 2000; tick++) {
          const input = getRacerControl(state, track, {
            lane: 0,
            difficulty: 'hard',
            devices,
            runtime,
          });
          const events = runtime.advance(
            state,
            { ...input, throttle: 1, brake: 0, boost: false },
            1 / 120,
          );
          assert.ok(
            !events.some((event) =>
              ['jump-miss', 'road-departure', 'road-recovery'].includes(
                event.type,
              ),
            ),
            `${jump.id}: native approach/arrival failed before camera verification`,
          );
          transfer ??= events.find((event) => event.type === 'jump-transfer');
          if (tick % 2 === 0) {
            const pose = runtime.pose(1);
            if (!pose.grounded) airFrames++;
            const commitment =
              !committed &&
              pose.grounded &&
              jump.takeoff - state.distance >= 0 &&
              jump.takeoff - state.distance < 8;
            for (const observer of observers) {
              observer.frame(state, pose);
              if (tick % 24 === 0)
                assert.ok(
                  dynamics.occlusionFraction(
                    observer.camera.position,
                    pose.position,
                  ) > 0.995,
                  `${jump.id}: current native moving geometry blocks flight camera-to-craft sightline`,
                );
              if (commitment) {
                updateRendered(observer.camera, state);
                const visible = visibleReceiver(
                  observer.camera,
                  jump,
                  state.time,
                );
                assert.ok(
                  visible.seen.length >= 3 &&
                    new Set(visible.seen.map((point) => point.ahead)).size >= 2,
                  `${jump.id}: actual moving receiver hidden at native commitment: ${JSON.stringify(visible)}`,
                );
              }
              if (!pose.grounded && airFrames % 60 === 0) {
                updateRendered(observer.camera, state);
                const hit = renderedOccluder(
                  observer.camera.position,
                  pose.position,
                );
                assert.ok(
                  hit === null,
                  `${jump.id}: actual ${hit?.object.name} blocks the flight camera-to-craft sightline`,
                );
              }
            }
            if (commitment) committed = true;
          }
          if (transfer && ++afterLanding > 48) break;
        }
        assert.equal(
          transfer?.payload.outcome,
          'landed',
          `${jump.id}: actual supported arrival`,
        );
        assert.ok(
          committed && airFrames >= 120,
          `${jump.id}: observe commitment and at least two seconds of real airborne camera`,
        );
      } catch (error) {
        failures.push(error.message);
      } finally {
        runtime.dispose();
      }
    }
    assert.deepEqual(failures, []);
  },
);

test('Saltwind hold-to-outboard preview keeps the desktop eye and craft sightline outside actual hull and freight', () => {
  dynamics.reset();
  dynamics.setNomadTime(0);
  const carrier = track.carriers.find((entry) => entry.id === 'nomad-saltwind');
  const failures = [];
  for (const aspect of aspects) {
    const observer = cameraObserver(aspect);
    const state = {
      ...createVehicleState(),
      distance: carrier.end - 650,
      speed: 160,
      time: 0,
    };
    try {
      let tick = 0;
      while (state.distance < carrier.end - 2) {
        state.distance = Math.min(
          carrier.end - 2,
          state.distance + state.speed / 60,
        );
        const pose = groundedPose(state),
          camera = observer.frame(state, pose);
        if (tick++ % 12 === 0 || state.distance >= carrier.end - 2) {
          updateRendered(camera, state);
          assert.ok(
            dynamics.occlusionFraction(camera.position, pose.position) > 0.995,
            `Saltwind/desktop${aspect}: native structure traps the eye at ${state.distance.toFixed(2)}`,
          );
          const hit = renderedOccluder(camera.position, pose.position);
          assert.equal(
            hit,
            null,
            `Saltwind/desktop${aspect}: actual ${hit?.object.name} blocks the eye at ${state.distance.toFixed(2)}`,
          );
        }
      }
    } catch (error) {
      failures.push(error.message);
    }
  }
  assert.deepEqual(failures, []);
});
