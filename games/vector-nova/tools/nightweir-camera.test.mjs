import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import * as T from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import createLevel from '../src/levels/nightweir/index.js';
import { createCameraRig } from '../src/camera/index.js';
import { createVehicleState } from '../src/physics/index.js';

const level = createLevel();
const track = level.createTrack();
const heroes = track.jumps.filter((jump) => jump.hero);
// Geometry-only CPU framing; texture decoding remains a browser concern.
const loader = new GLTFLoader()
  .register(() => ({
    name: 'KHR_texture_basisu',
    loadTexture: async () => new T.Texture(),
  }))
  .register(() => ({
    name: 'CPU_TEXTURES',
    loadTexture: async () => new T.Texture(),
  }));
const bytes = await readFile(
  new URL('../public/assets/ships/kestrel/kestrel.glb', import.meta.url),
);
const model = (
  await loader.parseAsync(
    bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
    '',
  )
).scene;
const bounds = new T.Box3().setFromObject(model);
const corners = [];
for (const x of [bounds.min.x, bounds.max.x])
  for (const y of [bounds.min.y, bounds.max.y])
    for (const z of [bounds.min.z, bounds.max.z])
      corners.push(new T.Vector3(x, y, z));
const coast = {
  throttle: 0,
  brake: 0,
  steer: 0,
  boost: false,
  airbrake: false,
};
function cameraScene() {
  const camera = new T.PerspectiveCamera(68, 1440 / 900, 0.2, 22000);
  const subject = new T.Object3D();
  const rig = createCameraRig(camera, level.camera, bounds);
  function frame(state, worldPose = null) {
    const route = track.sample(state.distance);
    subject.position.copy(
      worldPose?.position ??
        route.position.clone().addScaledVector(route.up, 0.76),
    );
    subject.quaternion.copy(worldPose?.quaternion ?? route.quaternion);
    rig.update(track, state, 1 / 60, { subject, worldPose });
    camera.updateMatrixWorld();
    subject.updateWorldMatrix(true, false);
    const projected = corners.map((corner) =>
      corner.clone().applyMatrix4(subject.matrixWorld).project(camera),
    );
    for (const point of projected) {
      assert.ok(
        Math.abs(point.x) < 0.94 &&
          Math.abs(point.y) < 0.94 &&
          point.z > -1 &&
          point.z < 1,
        `craft clipped at ${state.distance.toFixed(1)}: ${point.toArray()}`,
      );
    }
    return camera;
  }
  return { camera, rig, frame };
}

test('Nightweir hero approaches retain a city-facing horizon and the full craft', () => {
  for (const jump of heroes)
    for (const offset of [-100, -60, -2]) {
      const state = {
        ...createVehicleState(),
        distance: jump.takeoff + offset,
        speed: 160,
      };
      const { frame } = cameraScene();
      const camera = frame(state);
      const pitch = Math.asin(camera.getWorldDirection(new T.Vector3()).y);
      assert.ok(
        pitch > -Math.PI / 4,
        `${jump.id} approach points into the deck: ${pitch}`,
      );
      // The old 27 m lift plus distant receiver target hid the skyline by pitching
      // the safe-framed camera roughly 60 degrees downward.
    }
});

test('Nightweir production chase carries each huge flight into a supported landing', () => {
  for (const jump of heroes)
    for (const speed of [160, 255]) {
      const state = {
        ...createVehicleState(),
        distance: jump.takeoff - 0.5,
        speed,
      };
      const runtime = level.createRuntime({ track, presentation: false });
      runtime.reset({ state });
      const { camera, frame } = cameraScene();
      frame(state, runtime.pose(1));
      let transfer = null,
        afterLanding = 0,
        previous = camera.quaternion.clone();
      try {
        for (let tick = 0; tick < 840; tick++) {
          const events = runtime.advance(state, coast, 1 / 120);
          transfer ??= events.find((event) => event.type === 'jump-transfer');
          if (tick % 2 === 0) {
            frame(state, runtime.pose(1));
            assert.ok(
              camera.quaternion.angleTo(previous) < 0.25,
              `${jump.id} camera snaps across flight or landing`,
            );
            previous.copy(camera.quaternion);
          }
          if (transfer && ++afterLanding > 40) break;
        }
        assert.equal(
          transfer?.payload.outcome,
          'landed',
          `${jump.id} did not reach its receiving shelf`,
        );
      } finally {
        runtime.dispose();
      }
    }
});
