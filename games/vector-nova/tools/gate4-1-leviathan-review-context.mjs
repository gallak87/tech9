// Static authoring evidence only: source geometry/cameras, no game or browser.
import * as T from 'three';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createLevel3Track } from '../src/levels/nacre/track/model.js';
import { buildNacreTrack } from '../src/levels/nacre/track/production.js';
import { createCameraRig } from '../src/camera/index.js';
import { createVehicleState } from '../src/physics/index.js';
import { createNacreRuntime } from '../src/levels/nacre/track/runtime.js';
import {
  createLeviathanPath,
  createLeviathanClock,
  NACRE_LEVIATHAN,
} from '../src/levels/nacre/environment/leviathan/path.js';

import {
  createLeviathanSpray,
  sampleLeviathanSpray,
} from '../src/levels/nacre/environment/leviathan/spray.js';

const out = path.resolve(
  process.env.VN_EVIDENCE || '.experiments/gate4-1/leviathan-review/current',
);
await fs.mkdir(out, { recursive: true });
const track = createLevel3Track(),
  road = buildNacreTrack(track),
  route = createLeviathanPath(track);
const spray = createLeviathanSpray(route);
road.updateMatrixWorld(true);
const meshes = [];
const point = new T.Vector3(),
  transform = new T.Matrix4(),
  instance = new T.Matrix4();
road.traverse((object) => {
  if (!object.isMesh) return;
  const geometry = object.geometry,
    p = geometry.attributes.position,
    index = geometry.index,
    colors = geometry.attributes.color;
  const material = object.material;
  for (
    let item = 0;
    item < (object.isInstancedMesh ? object.count : 1);
    item++
  ) {
    if (object.isInstancedMesh) {
      object.getMatrixAt(item, instance);
      transform.multiplyMatrices(object.matrixWorld, instance);
    } else transform.copy(object.matrixWorld);
    const positions = [],
      triangles = [],
      vertexColors = [];
    const count = index?.count ?? p.count;
    for (let i = 0; i < count; i += 3) {
      const ids = [0, 1, 2].map((k) => (index ? index.getX(i + k) : i + k));
      const vertices = ids.map((id) =>
        point.fromBufferAttribute(p, id).applyMatrix4(transform).toArray(),
      );
      const center = vertices.reduce(
        (a, v) => a.map((n, k) => n + v[k] / 3),
        [0, 0, 0],
      );
      if (
        Math.abs(center[0] - route.center.x) > 800 ||
        Math.abs(center[2] - route.center.z) > 720
      )
        continue;
      const start = positions.length / 3;
      positions.push(...vertices.flat());
      triangles.push(start, start + 1, start + 2);
      for (const id of ids)
        vertexColors.push(
          ...(colors
            ? [colors.getX(id), colors.getY(id), colors.getZ(id)]
            : [1, 1, 1]),
        );
    }
    if (positions.length)
      meshes.push({
        name: object.name,
        positions,
        triangles,
        vertexColors,
        color: material.color?.toArray() ?? [0.15, 0.2, 0.2],
        emissive: material.emissive?.toArray() ?? [0, 0, 0],
        roughness: material.roughness ?? 0.5,
        metalness: material.metalness ?? 0,
      });
  }
});
await fs.writeFile(
  path.join(out, 'track-geometry.json'),
  JSON.stringify({
    coordinateSystem:
      'Three.js world +Y up; exact current production road triangles; clipped to review region',
    meshes,
  }),
);
const sequences = [];
for (const speed of [78.4, 112, 157]) {
  const clock = createLeviathanClock(track, route),
    camera = new T.PerspectiveCamera(65, 1.6, 0.1, 7000),
    rig = createCameraRig(camera);
  const state = createVehicleState();
  state.speed = speed;
  const frames = [];
  const targets = [
    ['approach-wide', track.jumps[0].takeoff - 300],
    ['approach-near', track.jumps[0].takeoff - 150],
    ['takeoff', track.jumps[0].takeoff - 0.5],
  ];
  let targetIndex = 0,
    trigger = null,
    firstVisible = null;
  const snap = (name, worldPose = null) => {
    camera.updateMatrixWorld(true);
    const age = clock.getState().age,
      headArc = route.headArc(age),
      stations = [];
    let visible = 0,
      above = 0;
    const projected = [];
    for (let station = 0; station <= 285; station++) {
      const f = route.sample(headArc - station);
      stations.push({
        position: f.position.toArray(),
        back: f.back.toArray(),
        up: f.up.toArray(),
        side: f.side.toArray(),
      });
      if (station <= 280) {
        const screen = f.position.clone().project(camera);
        projected.push(screen.toArray());
        if (f.position.y > 0) {
          above++;
          if (Math.abs(screen.x) < 1 && Math.abs(screen.y) < 1 && screen.z < 1)
            visible++;
        }
      }
    }
    const dir = new T.Vector3(0, 0, -1).applyQuaternion(camera.quaternion),
      camUp = new T.Vector3(0, 1, 0).applyQuaternion(camera.quaternion);
    const ship =
      worldPose?.position ??
      track
        .sample(state.distance)
        .position.clone()
        .addScaledVector(track.sample(state.distance).up, 0.72);
    return {
      name,
      speed,
      distance: state.distance,
      age,
      phase: clock.getState(),
      camera: {
        position: camera.position.toArray(),
        quaternion: camera.quaternion.toArray(),
        target: camera.position.clone().add(dir).toArray(),
        up: camUp.toArray(),
        verticalFov: camera.fov,
        aspect: camera.aspect,
      },
      shipPosition: ship.toArray(),
      shipQuaternion: (
        worldPose?.quaternion ?? track.sample(state.distance).quaternion
      ).toArray(),
      stations,
      waterParticles: sampleLeviathanSpray(spray, age),
      aboveWaterCenterlineSamples: above,
      visibleAboveWaterCenterlineSamples: visible,
      aboveWaterVisibleFraction: above ? visible / above : 0,
      projectedCenterline: projected,
    };
  };
  clock.updateVehicle({ time: 0, distance: 0, speed, mode: 'racing' });
  const dt = 1 / 120;
  while (state.distance < track.jumps[0].takeoff - 0.05) {
    state.time += dt;
    state.distance = Math.min(
      state.distance + speed * dt,
      track.jumps[0].takeoff - 0.05,
    );
    clock.updateVehicle({
      time: state.time,
      distance: state.distance,
      speed,
      mode: 'racing',
    });
    rig.update(track, state, dt);
    camera.updateMatrixWorld(true);
    if (clock.getState().active && trigger === null)
      trigger = { distance: state.distance, time: state.time };
    if (clock.getState().active && firstVisible === null) {
      const head = route.sample(route.headArc(clock.getState().age)).position;
      const screen = head.clone().project(camera);
      if (
        head.y > 0 &&
        Math.abs(screen.x) < 1 &&
        Math.abs(screen.y) < 1 &&
        screen.z < 1
      )
        firstVisible = { distance: state.distance, age: clock.getState().age };
    }
    if (
      targetIndex < targets.length &&
      state.distance >= targets[targetIndex][1]
    )
      frames.push(snap(targets[targetIndex++][0]));
  }
  const runtime = createNacreRuntime({ track });
  for (let tick = 0; tick < 65; tick++) {
    runtime.advance(
      state,
      { throttle: 0, brake: 0, steer: 0, boost: false, airbrake: false },
      dt,
    );
    clock.updateVehicle({
      time: state.time,
      distance: state.distance,
      speed: state.speed,
      mode: 'racing',
    });
    rig.update(track, state, dt, { worldPose: runtime.pose(1) });
    if (tick === 60) frames.push(snap('early-airborne', runtime.pose(1)));
  }
  runtime.dispose();
  sequences.push({ speed, trigger, firstVisible, frames });
}
const contactStudyAge = route.contacts[1].age + 0.65;
const contactStations = [];
for (let station = 0; station <= 285; station++) {
  const f = route.sample(route.headArc(contactStudyAge) - station);
  contactStations.push({
    position: f.position.toArray(),
    back: f.back.toArray(),
    up: f.up.toArray(),
    side: f.side.toArray(),
  });
}
const context = {
  kind: 'Blender authoring context; NOT gameplay screenshots or a game playtest',
  coordinateSystem:
    'Three.js world +Y up. Transform to Blender with (x,-z,y); camera matrix/orientation must receive the same transform.',
  trackGeometry: 'track-geometry.json',
  modelAsset: 'public/assets/levels/nacre/leviathan/nacre-leviathan-v2.glb',
  constants: NACRE_LEVIATHAN,
  path: {
    anchorDistance: route.anchorDistance,
    center: route.center.toArray(),
    heroAge: route.heroAge,
    crownAge: route.crownAge,
    duration: route.duration,
    contacts: route.contacts.map((c) => ({
      ...c,
      position: c.position.toArray(),
    })),
  },
  firstJump: track.jumps[0],
  waterContactStudy: {
    label:
      'Source path contact pose; diagnostic authoring camera, not game camera',
    age: contactStudyAge,
    stations: contactStations,
    waterParticles: sampleLeviathanSpray(spray, contactStudyAge),
  },
  sequences,
};
await fs.writeFile(
  path.join(out, 'context.json'),
  JSON.stringify(context, null, 2) + '\n',
);
const summary = {
  path: context.path,
  sequences: sequences.map((s) => ({
    speed: s.speed,
    trigger: s.trigger,
    firstVisible: s.firstVisible,
    frames: s.frames.map(
      ({
        name,
        distance,
        age,
        aboveWaterCenterlineSamples,
        aboveWaterVisibleFraction,
        camera,
      }) => ({
        name,
        distance,
        age,
        aboveWaterCenterlineSamples,
        aboveWaterVisibleFraction,
        camera,
      }),
    ),
  })),
};
await fs.writeFile(
  path.join(out, 'timing-summary.json'),
  JSON.stringify(summary, null, 2) + '\n',
);
console.log(JSON.stringify(summary, null, 2));
road.userData.dispose();
