import * as T from 'three';
import { beamTransform } from '../../../track/geometry.js';
import { framePoint } from '../../../track/frames.js';
import { createAssetInstances } from './assets.js';
import { finishUmbraMaterial } from './materials.js';

// Attached repaired load paths and a genuine enclosing instrument vault. Their
// clearance is checked against all stacked roads, rather than only their owner.
export function createUmbraConstruction(track, assets, layout) {
  const group = new T.Group();
  group.name = 'Umbra / attached repair network and inverted vault';
  const box = new T.BoxGeometry(1, 1, 1);
  const material = finishUmbraMaterial(
    new T.MeshStandardMaterial({
      color: '#738692',
      metalness: 0.7,
      roughness: 0.5,
    }),
    'metal',
  );
  const transforms = [];
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
      if (clear) beam(start, end, 1.3, 2.6);
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
      material.dispose();
      group.clear();
    },
  };
}
