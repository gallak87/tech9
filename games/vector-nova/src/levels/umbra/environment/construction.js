import * as T from 'three';
import { beamTransform } from '../../../track/geometry.js';
import { framePoint } from '../../../track/frames.js';
import { createAssetInstances } from './assets.js';
import { finishUmbraMaterial } from './materials.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// Attached repaired load paths and a genuine enclosing instrument vault. Their
// clearance is checked against all stacked roads, rather than only their owner.
export function createUmbraConstruction(track, assets, layout) {
  const group = new T.Group();
  group.name = 'Umbra / attached repair network and inverted vault';
  // An I section with end shoes stays inside the original clearance envelope.
  const sections = [
    new T.BoxGeometry(0.18, 1, 0.72),
    new T.BoxGeometry(1, 1, 0.14).translate(0, 0, -0.43),
    new T.BoxGeometry(1, 1, 0.14).translate(0, 0, 0.43),
    new T.BoxGeometry(1, 0.025, 1).translate(0, -0.475, 0),
    new T.BoxGeometry(1, 0.025, 1).translate(0, 0.475, 0),
  ];
  const box = mergeGeometries(sections);
  sections.forEach((section) => section.dispose());
  const material = finishUmbraMaterial(
    new T.MeshStandardMaterial({
      color: '#738692',
      metalness: 0.7,
      roughness: 0.31,
    }),
    'metal',
  );
  const transforms = [];
  const seats = [];
  const seatGeometry = new T.BoxGeometry(1, 1, 1);
  const route = Array.from(
    { length: Math.ceil(track.length / 8) },
    (_, i) => track.sample(i * 8).position,
  );
  const margin = (p) =>
    Math.sqrt(Math.min(...route.map((r) => r.distanceToSquared(p))));
  const beam = (a, b, width, depth = width) => {
    const transform = beamTransform(a, b, width, depth);
    transforms.push(
      new T.Matrix4().compose(
        transform.position,
        transform.quaternion,
        transform.scale,
      ),
    );
  };
  for (const entry of layout.filter(
    (e) =>
      (['connector', 'route-gallery'].includes(e.role) &&
        (e.type === 'terrace' || e.type.startsWith('wall'))) ||
      e.role === 'near-load-node',
  )) {
    const position = new T.Vector3(...entry.position);
    let nearest = 0,
      distance = Infinity;
    for (let i = 0; i < route.length; i++) {
      const d = route[i].distanceToSquared(position);
      if (d < distance) {
        distance = d;
        nearest = i * 8;
      }
    }
    const frame = track.sample(nearest);
    const side =
      Math.sign(position.clone().sub(frame.position).dot(frame.right)) || 1;
    for (const z of [-9, 9]) {
      const start = framePoint(frame, side * 9, -7, z);
      const end = new T.Vector3(
        0,
        entry.type === 'wall_breach'
          ? -58
          : entry.type.startsWith('wall')
            ? -21
            : entry.type === 'pier'
              ? -9
              : -8,
        0,
      )
        .applyMatrix4(entry.matrix)
        .addScaledVector(frame.tangent, z);
      // The first portion belongs to the attached keel; later portions must
      // clear every separate crossing and airborne corridor.
      let clear = true;
      for (let t = 0.25; t <= 1; t += 0.05)
        if (margin(start.clone().lerp(end, t)) < 23) {
          clear = false;
          break;
        }
      if (clear) {
        beam(start, end, 1.3, 2.6);
        const lowerStart = start.clone().addScaledVector(frame.up, -3.8);
        const lowerEnd = end.clone().addScaledVector(frame.up, -3.8);
        let webClear = true;
        for (let t = 0.25; t <= 1; t += 0.05)
          if (margin(lowerStart.clone().lerp(lowerEnd, t)) < 23)
            webClear = false;
        if (webClear) {
          beam(lowerStart, lowerEnd, 0.8, 1.8);
          const bays = Math.max(2, Math.ceil(start.distanceTo(end) / 12));
          for (let bay = 0; bay < bays; bay++) {
            const a = start.clone().lerp(end, bay / bays),
              b = lowerStart.clone().lerp(lowerEnd, (bay + 1) / bays);
            beam(a, b, 0.42, 0.75);
          }
        }

        for (const point of [start, end]) {
          seats.push(
            new T.Matrix4().compose(
              point,
              frame.quaternion,
              new T.Vector3(4.2, 1.5, 5.4),
            ),
          );
          for (const side of [-1, 1])
            seats.push(
              new T.Matrix4().compose(
                point
                  .clone()
                  .addScaledVector(frame.right, side * 1.55)
                  .addScaledVector(frame.up, -1.7),
                frame.quaternion,
                new T.Vector3(0.55, 3.4, 4.4),
              ),
            );
        }
      }
    }
  }
  const meshes = [];
  const vaults = [];
  for (const distance of [
    track.inversion.holdStart + 85,
    (track.inversion.holdStart + track.inversion.holdEnd) / 2,
    track.inversion.holdEnd - 75,
  ]) {
    const frame = track.sample(distance);
    const matrix = new T.Matrix4().compose(
      framePoint(frame, 0, -12),
      frame.quaternion,
      new T.Vector3(0.6, 0.6, 0.6),
    );
    let clearance = Infinity;
    for (const { geometry } of assets.templates.vault) {
      const vertices = geometry.attributes.position;
      for (let i = 0; i < vertices.count; i += 3) {
        const p = new T.Vector3()
          .fromBufferAttribute(vertices, i)
          .applyMatrix4(matrix);
        clearance = Math.min(clearance, margin(p));
      }
    }
    if (clearance > 24) vaults.push(matrix);
  }
  if (vaults.length) {
    const batch = createAssetInstances(
      assets.templates.vault,
      vaults,
      'Attached inverted instrument shell / open magnetic corridor',
    );
    group.add(batch);
    batch.traverse((n) => {
      if (n.isInstancedMesh) meshes.push(n);
    });
  }
  // Plumb tethers remain aligned to world vertical through the magnetic roll,
  // making the upside-down road distinct from another ordinary upright bend.
  for (let s = track.inversion.start; s < track.inversion.end; s += 90) {
    const frame = track.sample(s);
    for (const side of [-1, 1]) {
      const a = framePoint(frame, side * 23, -4);
      const b = a.clone().add(new T.Vector3(0, -32, 0));
      if (margin(b) > 22) beam(a, b, 0.5);
    }
  }
  if (transforms.length) {
    const mesh = new T.InstancedMesh(box, material, transforms.length);
    transforms.forEach((m, i) => mesh.setMatrixAt(i, m));
    mesh.computeBoundingSphere();
    mesh.receiveShadow = true;
    group.add(mesh);
    meshes.push(mesh);
  }
  if (seats.length) {
    const joints = new T.InstancedMesh(seatGeometry, material, seats.length);
    seats.forEach((matrix, index) => joints.setMatrixAt(index, matrix));
    joints.computeBoundingSphere();
    joints.receiveShadow = true;
    joints.name = 'Umbra / bearing plates and boxed repair seats';
    group.add(joints);
    meshes.push(joints);
  }
  group.userData.construction = {
    attachedBeams: transforms.length,
    vaults: vaults.length,
  };
  let disposed = false;
  return {
    group,
    dispose() {
      if (disposed) return;
      disposed = true;
      meshes.forEach((m) => m.dispose());
      box.dispose();
      seatGeometry.dispose();
      material.dispose();
      group.clear();
    },
  };
}
