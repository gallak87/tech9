import * as T from 'three';
import { beamTransform } from '../../../track/geometry.js';
import { framePoint } from '../../../track/frames.js';

// The reachable jump supports use the same CPU fossil floors as collision.
// Rendering borrows this plan rather than moving these solids after physics boot.
export function jumpSupportPlan(track, survey, fossilTriangles) {
  const targets = fossilTriangles
    .filter((triangle) => triangle.id.startsWith('vertebra'))
    .map((triangle) => {
      const points = triangle.points.map((point) => new T.Vector3(...point));
      return {
        points,
        bounds: new T.Box3().setFromPoints(points),
        normal: new T.Triangle(...points).getNormal(new T.Vector3()),
        id: triangle.id,
      };
    });
  const supports = new Map();
  let index = 0;
  for (let s = 40; s < track.length; s += 80) {
    if (track.isGap(s)) continue;
    const frame = track.sample(s);
    for (const side of [-1, 1]) {
      const i = index++;
      const jump = track.jumps.find(
        (jump) => s > jump.takeoff - 80 && s < jump.landingEnd + 60,
      );
      if (!jump) continue;
      const from = framePoint(frame, side * 12, -3.5);
      const to = frame.position
        .clone()
        .addScaledVector(frame.right, side * 4.8);
      to.y = survey.heightAt(to.x, to.z) + 1.2;
      let hit = null;
      if (!jump.optional)
        for (const offset of [0, -8, 8, -16, 16]) {
          const candidate = to.clone().addScaledVector(frame.right, offset);
          const direction = candidate.clone().sub(from).normalize();
          const ray = new T.Ray(from, direction);
          let distance = from.distanceTo(candidate) + 30;
          for (const target of targets) {
            if (!ray.intersectsBox(target.bounds)) continue;
            const point = ray.intersectTriangle(
              ...target.points,
              false,
              new T.Vector3(),
            );
            if (!point || point.y >= from.y - 1.5) continue;
            const d = point.distanceTo(from);
            if (d < 1.5 || d >= distance) continue;
            const normal = target.normal.clone();
            if (normal.dot(direction) > 0) normal.negate();
            hit = { point, normal, source: target.id };
            distance = d;
          }
          if (hit) break;
        }
      const endpoint = hit
        ? hit.point.clone().addScaledVector(hit.normal, 1.2)
        : to;
      const beam = beamTransform(from, endpoint, 2.1, 3.1);
      const leg = new T.Matrix4().compose(
        beam.position,
        beam.quaternion,
        beam.scale,
      );
      const shoePosition = hit
        ? hit.point.clone().addScaledVector(hit.normal, 0.25)
        : to.clone().add(new T.Vector3(0, -1, 0));
      const shoeOrientation = hit
        ? new T.Quaternion().setFromUnitVectors(
            new T.Vector3(0, 1, 0),
            hit.normal,
          )
        : new T.Quaternion().setFromAxisAngle(
            new T.Vector3(0, 1, 0),
            Math.atan2(frame.tangent.x, frame.tangent.z),
          );
      const shoe = new T.Matrix4().compose(
        shoePosition,
        shoeOrientation,
        new T.Vector3(12, 3.4, 13),
      );
      const collar = hit
        ? new T.Matrix4().compose(
            endpoint.clone().addScaledVector(hit.normal, 1),
            shoeOrientation,
            new T.Vector3(4, 4, 4),
          )
        : shoe.clone();
      supports.set(i, {
        s,
        leg,
        shoe,
        collar,
        contact: hit
          ? {
              s,
              index: i,
              point: hit.point.toArray(),
              normal: hit.normal.toArray(),
              source: hit.source,
            }
          : null,
      });
    }
  }
  return supports;
}
