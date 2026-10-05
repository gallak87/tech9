import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import * as T from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { createCameraRig } from '../src/camera/index.js';
import { createVehicleState } from '../src/physics/index.js';
import { createLevel3Track } from '../src/levels/nacre/track/model.js';
import {
  createNacreClearance,
  seededRandom,
} from '../src/levels/nacre/environment/geometry.js';
import { createNacreWorld } from '../src/levels/nacre/environment/world.js';
import { createNacreMaterials } from '../src/levels/nacre/environment/materials.js';
import { nacreSeabedBaseY } from '../src/levels/nacre/environment/seabed.js';
import { createNacreLeviathan } from '../src/levels/nacre/environment/leviathan/index.js';
import {
  NACRE_LEVIATHAN,
  createLeviathanPath,
  createLeviathanReturnPath,
  createLeviathanClock,
} from '../src/levels/nacre/environment/leviathan/path.js';

const track = createLevel3Track();
const path = createLeviathanPath(track);
const returnPath = createLeviathanReturnPath(track);
async function loadModel() {
  const bytes = await fs.readFile(
    new URL(
      '../public/assets/levels/nacre/leviathan/nacre-leviathan-v2.glb',
      import.meta.url,
    ),
  );
  const buffer = bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  );
  return new GLTFLoader().parseAsync(buffer, '');
}
function tick(clock, from, duration, distance = 330, speed = 100) {
  const count = Math.ceil(duration * 120);
  for (let i = 1; i <= count; i++) {
    const dt = Math.min(duration, i / 120);
    clock.updateVehicle({
      time: from + dt,
      distance: distance + speed * dt,
      speed,
      mode: 'racing',
    });
  }
}

test('Blender GLB has one continuous 280m animal, five materials and no texture dependencies', async () => {
  const gltf = await loadModel();
  gltf.scene.updateMatrixWorld(true);
  let meshes = 0,
    triangles = 0,
    radius = 0;
  const materials = new Set();
  const bounds = new T.Box3();
  const point = new T.Vector3();
  gltf.scene.traverse((o) => {
    if (!o.isMesh) return;
    meshes++;
    materials.add(o.material);
    triangles +=
      (o.geometry.index?.count ?? o.geometry.attributes.position.count) / 3;
    assert.equal(o.material.map, null);
    const p = o.geometry.attributes.position;
    for (let i = 0; i < p.count; i++) {
      point.fromBufferAttribute(p, i).applyMatrix4(o.matrixWorld);
      bounds.expandByPoint(point);
      radius = Math.max(radius, Math.hypot(point.y, point.z));
    }
  });
  assert.equal(meshes, 5);
  assert.equal(materials.size, 5);
  assert.equal(triangles, 35772);
  assert.ok(bounds.min.x >= -0.2 && bounds.max.x > 280 && bounds.max.x < 286);
  assert.ok(radius < NACRE_LEVIATHAN.envelopeRadius);
  const blend = await fs.stat(
    new URL(
      '../assets/levels/nacre/blender/leviathan/nacre-leviathan-v2.blend',
      import.meta.url,
    ),
  );
  assert.ok(blend.size > 200000, 'Editable native Blender source is delivered');
});

test('full conservative animal envelope clears banked road, flight corridors and existing world placements', () => {
  const clearance = createNacreClearance(track);
  const world = createNacreWorld(
    track,
    createNacreMaterials({ value: 0 }, 0),
    clearance,
    seededRandom(),
    nacreSeabedBaseY(track),
  );
  const radius = NACRE_LEVIATHAN.envelopeRadius;
  for (const route of [path, returnPath]) {
    for (let arc = route.startArc - 286; arc <= route.endArc; arc += 0.5) {
      const p = route.sample(arc).position;
      assert.ok(
        clearance.clears(p.x, p.z, radius, p.y - radius, p.y + radius),
        `${route.encounter}: route obstruction at ${arc}`,
      );
      for (const placement of world.placements) {
        if (p.y - radius >= placement.maxY || p.y + radius <= placement.minY)
          continue;
        assert.ok(
          Math.hypot(p.x - placement.x, p.z - placement.z) >
            radius + placement.radius,
          `${route.encounter}: ${placement.kind} obstruction at ${arc}`,
        );
      }
    }
  }
  assert.equal(path.sample(path.arcAtCross(0)).position.y, 180);
  for (const contact of path.contacts) {
    assert.ok(Math.abs(contact.position.y - 0.25) < 1e-8);
    const expected = path
      .atCross(contact.side * NACRE_LEVIATHAN.waterCross)
      .setY(0.25);
    assert.ok(contact.position.distanceTo(expected) < 1e-8);
  }
  assert.ok(path.sample(path.startArc).position.y <= -35);
  assert.ok(path.sample(path.endArc - 286).position.y <= -35);
});

test('arc-length transport stays smooth, orthonormal and length preserving through the breach', () => {
  for (const route of [path, returnPath]) {
    let previous = route.sample(route.startArc - 286).position;
    for (let arc = route.startArc - 285.5; arc <= route.endArc; arc += 0.5) {
      const f = route.sample(arc);
      assert.ok(Math.abs(f.position.distanceTo(previous) - 0.5) < 0.001);
      assert.ok(Math.abs(f.back.dot(f.up)) < 1e-9);
      assert.ok(Math.abs(f.side.dot(f.up)) < 1e-9);
      assert.ok(Math.abs(f.back.length() - 1) < 1e-9);
      assert.ok(f.up.y > 0.45);
      previous = f.position;
    }
  }
});

test('speed-aware event occurs once per unwrapped lap, with repeatable pause/reset behavior', () => {
  for (const speed of [78.4, 112, 157]) {
    const clock = createLeviathanClock(track, path);
    clock.updateVehicle({ time: 0, distance: 0, speed, mode: 'racing' });
    const duration = (track.length + 1300) / speed;
    tick(clock, 0, duration, 0, speed);
    assert.equal(clock.getState().eventCount, 2);
    assert.equal(clock.getState().consumedLap, 1);
  }
  const clock = createLeviathanClock(track, path);
  clock.updateVehicle({ time: 0, distance: 330, speed: 100 });
  tick(clock, 0, 1);
  const age = clock.getState().age;
  clock.updateVehicle({ time: 1, distance: 430, speed: 100, mode: 'paused' });
  clock.updateVehicle({ time: 31, distance: 430, speed: 100, mode: 'paused' });
  assert.equal(clock.getState().age, age);
  clock.updateVehicle({ time: 31, distance: 430, speed: 100, mode: 'racing' });
  clock.updateVehicle({
    time: 31.1,
    distance: 440,
    speed: 100,
    mode: 'racing',
  });
  assert.ok(
    Math.abs(
      clock.getState().age - age - (0.1 * 100) / NACRE_LEVIATHAN.referenceSpeed,
    ) < 1e-8,
  );
  clock.updateVehicle({ time: 0, distance: 330, speed: 100, reset: true });
  assert.equal(clock.getState().eventCount, 0);
  assert.equal(clock.getState().active, false);
  tick(clock, 0, 0.1);
  assert.equal(clock.getState().eventCount, 1);
  clock.updateVehicle({ time: 0.2, distance: 340, mode: 'inspection' });
  assert.equal(clock.getState().active, false);
  assert.equal(clock.getState().eventCount, 0);
});

test('entire animal is framed 300m before the first jump at 70%, full, boost and changing speed', async () => {
  assert.equal(
    path.anchorDistance,
    (track.jumps[0].takeoff + track.jumps[0].landingStart) / 2 - 5,
  );
  const gltf = await loadModel();
  gltf.scene.updateMatrixWorld(true);
  const rest = [];
  gltf.scene.traverse((object) => {
    if (!object.isMesh) return;
    const positions = object.geometry.attributes.position;
    for (let i = 0; i < positions.count; i++)
      rest.push(
        new T.Vector3()
          .fromBufferAttribute(positions, i)
          .applyMatrix4(object.matrixWorld),
      );
  });
  const speeds = [
    () => 78.4,
    () => 112,
    () => 157,
    (distance) => 78.4 + 78.6 * Math.min(1, distance / path.heroDistance),
  ];
  for (const speedAt of speeds) {
    const clock = createLeviathanClock(track, path);
    const camera = new T.PerspectiveCamera(65, 1.6, 0.1, 7000);
    const rig = createCameraRig(camera);
    const state = createVehicleState();
    state.speed = speedAt(0);
    clock.updateVehicle({
      time: 0,
      distance: 0,
      speed: state.speed,
      mode: 'racing',
    });
    const dt = 1 / 120;
    while (state.distance < path.heroDistance) {
      state.speed = speedAt(state.distance);
      state.time += dt;
      state.distance += state.speed * dt;
      clock.updateVehicle({ ...state, mode: 'racing' });
      rig.update(track, state, dt);
    }
    camera.updateMatrixWorld(true);
    assert.equal(clock.getState().active, true);
    assert.ok(Math.abs(clock.getState().age - path.heroAge) < 0.025);
    const headArc = path.headArc(clock.getState().age);
    for (const vertex of rest) {
      const x = T.MathUtils.clamp(vertex.x, 0, 285 - 0.001);
      const i = Math.floor(x),
        fraction = x - i;
      const a = path.sample(headArc - i),
        b = path.sample(headArc - i - 1);
      const world = a.position
        .lerp(b.position, fraction)
        .addScaledVector(a.up.lerp(b.up, fraction), vertex.y)
        .addScaledVector(a.side.lerp(b.side, fraction), vertex.z);
      assert.ok(world.y > track.waterY, 'whole animal has breached');
      const screen = world.project(camera);
      assert.ok(
        Math.abs(screen.x) < 0.95 &&
          Math.abs(screen.y) < 0.95 &&
          Math.abs(screen.z) < 1,
        'full body and fins remain inside the source chase camera',
      );
    }
  }
  gltf.scene.traverse((object) => {
    if (!object.isMesh) return;
    object.geometry.dispose();
    object.material.dispose();
  });
});

test('clock clears on navigation and time discontinuity, without replaying on duplicate updates', () => {
  const clock = createLeviathanClock(track, path);
  clock.updateVehicle({ time: 0, distance: 330, speed: 100 });
  tick(clock, 0, 0.25);
  const before = clock.getState();
  clock.updateVehicle({ time: 0.25, distance: 355, speed: 100 });
  assert.deepEqual(clock.getState(), before);
  clock.updateVehicle({ time: 0.3, distance: 1400, speed: 100 });
  assert.equal(clock.getState().active, false);
  clock.updateVehicle({ time: 8, distance: 330, speed: 100 });
  assert.equal(clock.getState().eventCount, 0);
});

test('Node construction does not fetch; loader failure is contained and disposal is idempotent', async () => {
  const neutral = createNacreLeviathan(track);
  assert.equal(await neutral.ready, false);
  assert.equal(neutral.getPresentation().loading, false);
  assert.equal(neutral.getPresentation().visible, false);
  neutral.dispose();
  neutral.dispose();
  const failed = createNacreLeviathan(track, {
    loadAsset: async () => {
      throw Error('asset unavailable');
    },
  });
  assert.equal(await failed.ready, false);
  assert.equal(failed.getPresentation().error, 'asset unavailable');
  failed.dispose();
  const gltf = await loadModel();
  let finish;
  let released = 0;
  gltf.scene.traverse((object) => {
    if (object.isMesh)
      object.geometry.addEventListener('dispose', () => released++);
  });
  const late = createNacreLeviathan(track, {
    loadAsset: () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  });
  await Promise.resolve();
  late.dispose();
  finish(gltf);
  assert.equal(await late.ready, false);
  assert.equal(released, 5);
  assert.equal(late.group.children.length, 0);
});

test('loaded GLB deforms once per simulation age; reduced motion, overview and cleanup are safe', async () => {
  const animal = createNacreLeviathan(track, { loadAsset: loadModel });
  assert.equal(await animal.ready, true);
  animal.updateVehicle({ time: 0, distance: 330, speed: 100 });
  const crownTicks =
    Math.round(((path.crownAge * NACRE_LEVIATHAN.referenceSpeed) / 100) * 120) +
    1;
  for (let i = 1; i <= crownTicks; i++)
    animal.updateVehicle({
      time: i / 120,
      distance: 330 + (i / 120) * 100,
      speed: 100,
    });
  animal.update(crownTicks / 120, { quality: 'high' });
  const body = animal.group.children[0];
  assert.equal(body.children.length, 5);
  assert.equal(animal.getPresentation().visible, true);
  const attr = body.children[0].geometry.attributes.position;
  const version = attr.version;
  animal.update(crownTicks / 120, { quality: 'high' });
  assert.equal(attr.version, version);
  assert.ok([...attr.array].every(Number.isFinite));
  assert.ok(Math.abs(animal.getPresentation().headPosition[1] - 180) < 1);
  animal.update(crownTicks / 120, { reducedMotion: true });
  assert.equal(animal.getPresentation().phase, 'quiet-submerged');
  const quietVersion = attr.version;
  animal.update(12, { reducedMotion: true });
  assert.equal(attr.version, quietVersion);
  assert.equal(animal.group.children[1].visible, false);
  animal.update(12, { overview: true });
  assert.equal(animal.group.visible, false);
  const parent = new T.Group();
  parent.add(animal.group);
  let disposed = 0;
  body.children.forEach((mesh) =>
    mesh.geometry.addEventListener('dispose', () => disposed++),
  );
  animal.dispose();
  animal.dispose();
  assert.equal(parent.children.length, 0);
  assert.equal(disposed, 5);
});

test('return swim crosses left-to-right without turning along the road, entirely underwater', () => {
  let previousSide = -Infinity;
  for (
    let arc = returnPath.startArc - 286;
    arc <= returnPath.endArc;
    arc += 0.5
  ) {
    const frame = returnPath.sample(arc);
    assert.ok(frame.position.y + NACRE_LEVIATHAN.envelopeRadius < track.waterY);
    const side = frame.position
      .clone()
      .sub(returnPath.center)
      .dot(returnPath.cross);
    assert.ok(
      side > previousSide,
      'all of the body continues across; no turn back along the road',
    );
    assert.ok(
      -frame.back.dot(returnPath.cross) > 0.72,
      'travel stays predominantly across the track',
    );
    previousSide = side;
  }
  assert.ok(
    returnPath
      .sample(returnPath.startArc)
      .position.sub(returnPath.center)
      .dot(returnPath.cross) < -280,
  );
  assert.ok(
    returnPath
      .sample(returnPath.endArc - 286)
      .position.sub(returnPath.center)
      .dot(returnPath.cross) > 280,
  );
  assert.equal(returnPath.contacts.length, 0);
  assert.ok(returnPath.atCross(0).distanceTo(returnPath.center) < 1e-9);
  assert.ok(
    returnPath.heroDistance < 2300,
    'crossing is staged before the player enters the second bend',
  );
});

test('most of the actual GLB spans the road ahead through an early viewing window, including boost acceleration', async () => {
  const gltf = await loadModel();
  gltf.scene.updateMatrixWorld(true);
  const vertices = [];
  gltf.scene.traverse((object) => {
    if (!object.isMesh) return;
    const positions = object.geometry.attributes.position;
    for (let i = 0; i < positions.count; i++)
      vertices.push(
        new T.Vector3()
          .fromBufferAttribute(positions, i)
          .applyMatrix4(object.matrixWorld),
      );
  });
  const profiles = [
    { at: () => 78.4, minimumVisible: 0.85 },
    { at: () => 112, minimumVisible: 0.9 },
    { at: () => 157, minimumVisible: 0.98 },
    {
      at: (distance) =>
        78.4 + 78.6 * T.MathUtils.clamp((distance - 1770) / 300, 0, 1),
      minimumVisible: 0.97,
    },
  ];
  for (const profile of profiles) {
    const clock = createLeviathanClock(track, returnPath);
    const camera = new T.PerspectiveCamera(65, 1.6, 0.1, 7000);
    const rig = createCameraRig(camera);
    const state = createVehicleState();
    state.distance = 1650;
    state.speed = profile.at(state.distance);
    clock.updateVehicle({ ...state, mode: 'racing' });
    for (const target of [2100, returnPath.heroDistance, 2180]) {
      while (state.distance < target) {
        state.time += 1 / 120;
        state.speed = profile.at(state.distance);
        state.distance += state.speed / 120;
        clock.updateVehicle({ ...state, mode: 'racing' });
        rig.update(track, state, 1 / 120);
      }
      camera.updateMatrixWorld(true);
      assert.equal(clock.getState().active, true);
      if (target === returnPath.heroDistance)
        assert.ok(Math.abs(clock.getState().age - returnPath.heroAge) < 0.025);
      const headArc = returnPath.headArc(clock.getState().age);
      const headSide = returnPath
        .sample(headArc)
        .position.sub(returnPath.center)
        .dot(returnPath.cross);
      const tailSide = returnPath
        .sample(headArc - 280)
        .position.sub(returnPath.center)
        .dot(returnPath.cross);
      assert.ok(
        headSide > 40 && tailSide < -40,
        'body straddles both sides of the track throughout the window',
      );
      let framed = 0,
        nearby = 0;
      for (const vertex of vertices) {
        const x = T.MathUtils.clamp(vertex.x, 0, 284.999);
        const station = Math.floor(x),
          fraction = x - station;
        const a = returnPath.sample(headArc - station);
        const b = returnPath.sample(headArc - station - 1);
        const point = a.position
          .lerp(b.position, fraction)
          .addScaledVector(a.up.lerp(b.up, fraction), vertex.y)
          .addScaledVector(a.side.lerp(b.side, fraction), vertex.z);
        const distance = point.distanceTo(camera.position);
        const screen = point.project(camera);
        if (
          Math.abs(screen.x) < 0.95 &&
          Math.abs(screen.y) < 0.95 &&
          Math.abs(screen.z) < 1
        ) {
          framed++;
          if (distance < 350) nearby++;
        }
      }
      assert.ok(
        framed / vertices.length >= profile.minimumVisible,
        'most of the full model is visible ahead, even under sustained or newly engaged boost',
      );
      assert.ok(
        nearby / vertices.length > 0.85,
        'the crossing reads inside the underwater fog range',
      );
    }
  }
  gltf.scene.traverse((object) => {
    if (!object.isMesh) return;
    object.geometry.dispose();
    object.material.dispose();
  });
});

test('two separated appearances per lap share one loaded animal and suppress breach spray underwater', async () => {
  let loads = 0;
  const animal = createNacreLeviathan(track, {
    loadAsset: () => {
      loads++;
      return loadModel();
    },
  });
  await animal.ready;
  const [body, effects] = animal.group.children;
  const meshes = [...body.children];
  const speed = 112;
  animal.updateVehicle({ time: 0, distance: 0, speed });
  let time = 0,
    distance = 0;
  function advanceTo(target) {
    while (distance < target) {
      time += 1 / 120;
      distance += speed / 120;
      animal.updateVehicle({ time, distance, speed });
    }
    animal.update(time);
  }
  advanceTo(path.heroDistance);
  assert.equal(animal.getPresentation().encounter, 'first-jump');
  assert.equal(animal.getPresentation().eventCount, 1);
  assert.equal(effects.visible, true);
  advanceTo(returnPath.heroDistance);
  assert.equal(animal.getPresentation().phase, 'return-swim');
  assert.equal(animal.getPresentation().eventCount, 2);
  assert.equal(animal.getPresentation().visible, true);
  assert.equal(effects.visible, false);
  assert.equal(loads, 1);
  assert.deepEqual(body.children, meshes);
  assert.equal(animal.metrics.animalCount, 1);
  const positions = body.children[0].geometry.attributes.position;
  const version = positions.version;
  const age = animal.getPresentation().age;
  animal.updateVehicle({ time, distance, speed, mode: 'paused' });
  time += 30;
  animal.updateVehicle({ time, distance, speed, mode: 'paused' });
  animal.update(time);
  assert.equal(positions.version, version);
  assert.equal(animal.getPresentation().age, age);
  animal.updateVehicle({ time, distance, speed });
  advanceTo(track.length + returnPath.heroDistance);
  assert.equal(animal.getPresentation().eventCount, 4);
  assert.equal(animal.getPresentation().lap, 1);
  assert.equal(animal.getPresentation().phase, 'return-swim');
  animal.updateVehicle({ time: 0, distance: 0, speed: 0, reset: true });
  animal.update(0);
  assert.equal(animal.getPresentation().eventCount, 0);
  assert.equal(animal.getPresentation().visible, false);
  animal.dispose();
});
