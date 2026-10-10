import * as T from 'three';
import { shatterlineGroundHeight } from './terrain.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
/** Actual diagonal load paths between route-local keels and plumb foundations. */
export function createShatterlineCradleGeometry(track, placements) {
  const halfWidth = track.width / 2;
  const pieces = [],
    beamSource = new T.CylinderGeometry(1, 1, 1, 6),
    capSource = new T.BoxGeometry(1, 1, 1);
  const yAxis = new T.Vector3(0, 1, 0),
    identity = new T.Quaternion();
  const box = (position, quaternion, size) => {
    const g = capSource.clone();
    g.applyMatrix4(
      new T.Matrix4().compose(position, quaternion, new T.Vector3(...size)),
    );
    pieces.push(g);
  };
  const beam = (a, b, r) => {
    const d = b.clone().sub(a),
      q = new T.Quaternion().setFromUnitVectors(yAxis, d.clone().normalize());
    const g = beamSource.clone();
    g.applyMatrix4(
      new T.Matrix4().compose(
        a.clone().add(b).multiplyScalar(0.5),
        q,
        new T.Vector3(r, d.length(), r),
      ),
    );
    pieces.push(g);
  };
  for (const p of placements) {
    if (p.asset !== 'load-foundation' || p.lateral !== 0) continue;
    for (const z of [-21, 21]) {
      const top = track.sample(p.s + z);
      box(top.position.clone().addScaledVector(top.up, -7.7), top.quaternion, [
        track.width + 7,
        3.4,
        5,
      ]);
      for (const side of [-1, 1]) {
        const a = top.position
          .clone()
          .addScaledVector(top.right, side * (halfWidth - 1))
          .addScaledVector(top.up, -8.5);
        const b = p.position
          .clone()
          .add(
            new T.Vector3(side * 11, 1, z * 0.5).applyQuaternion(p.quaternion),
          );
        beam(a, b, 2.3);
        box(b.clone().add(new T.Vector3(0, 1, 0)), p.quaternion, [8, 3, 9]);
      }
    }
    box(p.position.clone().add(new T.Vector3(0, 3, 0)), identity, [
      track.width + 7,
      4,
      42,
    ]);
  }
  // Connect maintenance gallery loads to the main spine, with genuine outer
  // suspension and diagonal braces rather than isolated floating shelf modules.
  for (const p of placements.filter((p) => p.asset === 'service-gallery')) {
    const f = track.sample(p.s),
      side = Math.sign(p.lateral);
    for (const z of [-23, 23]) {
      const inner = f.position
        .clone()
        .addScaledVector(f.tangent, z)
        .addScaledVector(f.right, side * halfWidth)
        .addScaledVector(f.up, -8);
      const outer = p.position
        .clone()
        .add(new T.Vector3(-side * 10, -5, z).applyQuaternion(p.quaternion));
      beam(inner, outer, 1.65);
      beam(inner.clone().addScaledVector(f.up, -18), outer, 1.5);
      box(outer, p.quaternion, [6, 5, 7]);
    }
  }
  // Crown shoes reach actual bedrock even over the two deep clefts. Source
  // meshes carry the ceramic shoes; these constructed piers connect beneath them.
  const feet = {
    'crown-severed': [123.25, -80.65],
    'crown-broken': [95.2, -87.84],
    'crown-hero': [136, -91.2],
    'crown-terminal': [106.25, -72.25],
  };
  for (const p of placements) {
    if (!feet[p.asset]) continue;
    for (const side of [-1, 1]) {
      const [x, y] = feet[p.asset],
        top = new T.Vector3(side * x, y, 0).applyMatrix4(p.matrix);
      const floor = shatterlineGroundHeight(track, top.x, top.z) - 18;
      if (floor >= top.y - 12) continue;
      box(new T.Vector3(top.x, floor + 5, top.z), p.quaternion, [
        68 * p.scale.x,
        14,
        73 * p.scale.z,
      ]);
      const h = top.y - floor;
      for (const dx of [-12, 12]) {
        const offset = new T.Vector3(dx * p.scale.x, 0, 0).applyQuaternion(
          p.quaternion,
        );
        box(
          top
            .clone()
            .add(offset)
            .add(new T.Vector3(0, -h / 2, 0)),
          p.quaternion,
          [9 * p.scale.x, h, 21 * p.scale.z],
        );
      }
      for (let lower = floor + 20; lower < top.y - 10; lower += 55) {
        const a = new T.Vector3(-12 * p.scale.x, 0, 0)
          .applyQuaternion(p.quaternion)
          .add(new T.Vector3(top.x, lower, top.z));
        const b = new T.Vector3(12 * p.scale.x, 0, 0)
          .applyQuaternion(p.quaternion)
          .add(new T.Vector3(top.x, Math.min(top.y - 3, lower + 50), top.z));
        beam(a, b, 2.6);
        beam(a.clone().setY(b.y), b.clone().setY(a.y), 2.6);
      }
    }
  }
  const geometry = mergeGeometries(pieces, false) ?? new T.BufferGeometry();
  pieces.forEach((g) => g.dispose());
  beamSource.dispose();
  capSource.dispose();
  return geometry;
}
