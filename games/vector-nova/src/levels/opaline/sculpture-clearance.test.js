import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import * as T from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { loadOpalineSculptures } from '@worldkit/environment/opaline';
import { createLifetime } from '../../core/lifecycle.js';
import { createVehicleState } from '../../physics/index.js';
import { VEHICLE_HULL } from '../../physics/hull.js';
import { createOpalineTrack } from './track/model.js';
import { createOpalineRuntime } from './runtime.js';
import { createSculptedPassages } from './environment/sculpted-passages.js';

const track = createOpalineTrack();
const half = new T.Vector3(
  VEHICLE_HULL.halfWidth,
  VEHICLE_HULL.hover,
  VEHICLE_HULL.halfLength,
);
const hullBox = new T.Box3(half.clone().negate(), half);
function corridorPoses() {
  const poses = [];
  const add = (position, quaternion, label) => {
    const matrix = new T.Matrix4().compose(
      position,
      quaternion,
      new T.Vector3(1, 1, 1),
    );
    poses.push({
      bounds: hullBox.clone().applyMatrix4(matrix),
      inverse: matrix.invert(),
      label,
    });
  };
  for (let s = 0; s < track.length; s += 4) {
    if (track.isGap(s)) continue;
    for (const lateral of [-12, 0, 12, 18, 22, 26, 30]) {
      const frame = track.sampleSurface(s, lateral);
      if (!frame || lateral > frame.bounds.max - 3.5) continue;
      add(
        frame.position.clone().addScaledVector(frame.up, VEHICLE_HULL.hover),
        frame.quaternion,
        `${s}m / lane ${lateral}`,
      );
    }
  }
  const input = {
    throttle: 0,
    brake: 0,
    steer: 0,
    boost: false,
    airbrake: false,
  };
  for (const jump of track.jumps)
    for (const speed of [65, 112, 140])
      for (const lateral of [-9, 0, 9]) {
        const runtime = createOpalineRuntime({ track });
        const state = {
          ...createVehicleState(),
          distance: jump.takeoff - 0.01,
          speed,
          lateral,
        };
        try {
          runtime.reset({ state, seed: 7 });
          for (let tick = 0; tick < 1200; tick++) {
            const events = runtime.advance(state, input, 1 / 120),
              pose = runtime.pose(1);
            add(
              pose.position,
              pose.quaternion,
              `${jump.id} / ${speed}m/s / lane ${lateral} / tick ${tick}`,
            );
            if (events.some((event) => event.type === 'jump-transfer')) break;
          }
        } finally {
          runtime.dispose();
        }
      }
  return poses;
}

// Exact triangle/OBB narrow phase; coarse bounds only select potential contacts.
function assertClear(mesh, poses, detail) {
  const geometry = mesh.geometry,
    positions = geometry.attributes.position;
  const worldBounds = geometry.boundingBox
    .clone()
    .applyMatrix4(mesh.matrixWorld);
  const candidates = poses.filter((pose) =>
    pose.bounds.intersectsBox(worldBounds),
  );
  if (!candidates.length) return;
  const points = Array.from({ length: positions.count }, (_, i) =>
    new T.Vector3()
      .fromBufferAttribute(positions, i)
      .applyMatrix4(mesh.matrixWorld),
  );
  const index = geometry.index,
    count = index?.count ?? positions.count;
  const triangle = new T.Triangle(),
    local = new T.Triangle(),
    bounds = new T.Box3();
  for (let i = 0; i < count; i += 3) {
    triangle.set(
      points[index ? index.getX(i) : i],
      points[index ? index.getX(i + 1) : i + 1],
      points[index ? index.getX(i + 2) : i + 2],
    );
    bounds.setFromPoints([triangle.a, triangle.b, triangle.c]);
    for (const pose of candidates) {
      if (!bounds.intersectsBox(pose.bounds)) continue;
      local.copy(triangle);
      local.a.applyMatrix4(pose.inverse);
      local.b.applyMatrix4(pose.inverse);
      local.c.applyMatrix4(pose.inverse);
      assert.ok(
        !hullBox.intersectsTriangle(local),
        `${mesh.name} (${detail}) intrudes into ${pose.label}`,
      );
    }
  }
}

test('real sculpture passage triangles at every LOD clear full road, surf-bank and ballistic ship hulls', async () => {
  const parser = new GLTFLoader();
  const sculptures = await loadOpalineSculptures({
    loader: {
      async loadAsync(url) {
        const bytes = await readFile(fileURLToPath(url));
        return parser.parseAsync(
          bytes.buffer.slice(
            bytes.byteOffset,
            bytes.byteOffset + bytes.byteLength,
          ),
          '',
        );
      },
    },
  });
  const lifetime = createLifetime(),
    material = lifetime.own(new T.MeshStandardMaterial());
  try {
    const passages = createSculptedPassages(
      track,
      sculptures,
      { stone: material },
      lifetime,
    );
    passages.group.updateMatrixWorld(true);
    const poses = corridorPoses();
    const camera = new T.PerspectiveCamera();
    const observed = new Set();
    for (const mesh of passages.group.children) {
      for (const distance of [0, 700, 1400]) {
        camera.position.copy(mesh.position).add(new T.Vector3(distance, 0, 0));
        passages.update({ camera, quality: 'high', reducedMotion: true });
        const detail = Object.keys(sculptures).find(
          (tier) =>
            tier !== 'dispose' &&
            Object.values(sculptures[tier]).some(
              (part) => part.geometry === mesh.geometry,
            ),
        );
        observed.add(detail);
        assertClear(mesh, poses, detail);
      }
    }
    assert.deepEqual([...observed].sort(), ['distant', 'high', 'low']);
  } finally {
    lifetime.dispose();
    sculptures.dispose();
  }
});
