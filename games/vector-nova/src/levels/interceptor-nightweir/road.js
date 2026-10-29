import * as T from 'three';
import { createNightweirRoad } from '../nightweir/track/road.js';
import {
  createCollisionWorld,
  indexedTriangles,
} from '../../physics/collision-world.js';

// Nightweir's sprint road extends 70m behind its start grid. Collapse that
// extension to the closed loop's zero frame and remove its zero-area faces,
// preserving an exact supported seam instead of overlapping the final 70m.
function closeRoadStart(track, geometry) {
  if (geometry.userData.lockdownClosedStart || !geometry.attributes.roadCoord)
    return;
  const p = geometry.attributes.position,
    coord = geometry.attributes.roadCoord,
    start = track.sample(0),
    point = new T.Vector3();
  for (let i = 0; i < p.count; i++) {
    const distance = coord.getX(i);
    if (distance >= 0) continue;
    const old = track.sample(distance),
      height = point.fromBufferAttribute(p, i).sub(old.position).dot(old.up);
    point
      .copy(start.position)
      .addScaledVector(start.right, coord.getY(i))
      .addScaledVector(start.up, height);
    p.setXYZ(i, point.x, point.y, point.z);
    coord.setX(i, 0);
  }
  const indices = geometry.index.array,
    kept = [];
  for (let i = 0; i < indices.length; i += 3)
    if ([0, 1, 2].some((v) => coord.getX(indices[i + v]) > 0))
      kept.push(indices[i], indices[i + 1], indices[i + 2]);
  geometry.setIndex(kept);
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  geometry.userData.lockdownClosedStart = true;
}
export function createLockdownRoad({ track, collectSolid, ...context }) {
  const road = createNightweirRoad({
    ...context,
    track,
    collectSolid: collectSolid
      ? (solid) => {
          closeRoadStart(track, solid.geometry);
          collectSolid(solid);
        }
      : null,
  });
  road.group.traverse((mesh) => {
    if (mesh.geometry) closeRoadStart(track, mesh.geometry);
  });
  return road;
}
export function createLockdownCollision({ track }) {
  const triangles = [],
    targets = [];
  const road = createLockdownRoad({
    track,
    shape: true,
    collectSolid({ name, geometry, matrix, ...info }) {
      const id = `lockdown-${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
      triangles.push(
        ...indexedTriangles(
          geometry.attributes.position.array,
          geometry.index?.array ??
            Array.from(
              { length: geometry.attributes.position.count },
              (_, i) => i,
            ),
          { id, ...info },
          matrix,
          geometry.attributes.roadCoord,
        ),
      );
      geometry.computeBoundingBox();
      targets.push({
        id,
        name,
        kind: info.kind,
        min: geometry.boundingBox.min.toArray(),
        max: geometry.boundingBox.max.toArray(),
      });
    },
  });
  road.dispose();
  const world = createCollisionWorld({
    id: 'nightweir-lockdown-road-solids',
    version: 1,
    geometryId: track.geometryVersion,
    triangles,
  });
  return { ...world, targets };
}
