import * as T from 'three';
import { createCollisionWorld, indexedTriangles } from './collision-world.js';

// Extract exact authored meshes in bounded jump corridors. Each level supplies
// its own solid selection and route-coordinate convention; decorative meshes
// and moving scenery are never inferred as colliders.
export function collectProductionSolids({
  track,
  id,
  geometryId,
  road,
  select,
  uvScale = 16,
  additionalTriangles = [],
}) {
  const group = road.group ?? road;
  const corridors = track.jumps.map((jump) => {
    const bounds = new T.Box3();
    for (let s = jump.takeoff - 70; s <= jump.landingEnd + 50; s += 5)
      bounds.expandByPoint(track.sample(s).position);
    bounds.min.add(new T.Vector3(-45, -160, -45));
    bounds.max.add(new T.Vector3(45, 45, 45));
    return bounds;
  });
  const near = (bounds) =>
    corridors.some((corridor) => corridor.intersectsBox(bounds));
  const stations = [];
  for (let s = 0; s < track.length; s += 6) {
    const position = track.sample(s).position.clone();
    if (corridors.some((c) => c.containsPoint(position)))
      stations.push({ s, position });
  }
  const nearest = (point) => {
    let best = Infinity,
      distance = 0;
    for (const station of stations) {
      const error = station.position.distanceToSquared(point);
      if (error < best) {
        best = error;
        distance = station.s;
      }
    }
    return distance;
  };
  const intervals = [];
  let start = 0;
  for (const jump of track.jumps) {
    intervals.push({ start, end: jump.takeoff });
    if (jump.optional)
      intervals.push({ start: jump.takeoff, end: jump.landingStart });
    start = jump.landingStart;
  }
  intervals.push({ start, end: track.length });
  const triangles = additionalTriangles.filter((triangle) =>
      near(
        new T.Box3().setFromPoints(
          triangle.points.map((p) => new T.Vector3(...p)),
        ),
      ),
    ),
    targets = [];
  for (const solidId of new Set(triangles.map((triangle) => triangle.id))) {
    const entries = triangles.filter((triangle) => triangle.id === solidId);
    const bounds = new T.Box3().setFromPoints(
      entries.flatMap((triangle) =>
        triangle.points.map((p) => new T.Vector3(...p)),
      ),
    );
    targets.push({
      id: solidId,
      name: solidId,
      kind: entries[0].kind,
      min: bounds.min.toArray(),
      max: bounds.max.toArray(),
    });
  }
  group.updateWorldMatrix(true, true);
  try {
    group.traverse((object) => {
      if (!object.isMesh) return;
      const info = select(object);
      if (!info) return;
      const geometry = object.geometry;
      geometry.computeBoundingBox();
      const indices =
        geometry.index?.array ??
        Array.from({ length: geometry.attributes.position.count }, (_, i) => i);
      for (
        let index = 0;
        index < (object.isInstancedMesh ? object.count : 1);
        index++
      ) {
        const matrix = object.matrixWorld.clone();
        if (object.isInstancedMesh) {
          const instance = new T.Matrix4();
          object.getMatrixAt(index, instance);
          matrix.multiply(instance);
        }
        if (!near(geometry.boundingBox.clone().applyMatrix4(matrix))) continue;
        const solidId = `${object.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${targets.length}-${index}`;
        const source = indexedTriangles(
          geometry.attributes.position.array,
          indices,
          { id: solidId, ...info },
          matrix,
        );
        const kept = [];
        for (const [i, triangle] of source.entries()) {
          const points = triangle.points.map((p) => new T.Vector3(...p));
          if (!near(new T.Box3().setFromPoints(points))) continue;
          if (info.kind === 'deck' || info.roadBoundary) {
            const route =
              geometry.attributes.roadCoord ??
              geometry.attributes.routeDistance;
            const uv = geometry.attributes.uv;
            const distance =
              object.isInstancedMesh || (!route && !uv)
                ? nearest(
                    new T.Vector3()
                      .add(points[0])
                      .add(points[1])
                      .add(points[2])
                      .multiplyScalar(1 / 3),
                  )
                : [0, 1, 2].reduce(
                    (sum, n) =>
                      sum +
                      (route
                        ? route.getX(indices[i * 3 + n])
                        : uv.getY(indices[i * 3 + n]) *
                          (info.uvScale ?? uvScale)),
                    0,
                  ) / 3;
            const interval = intervals.find(
              (range) =>
                distance >= range.start - 0.001 &&
                distance <= range.end + 0.001,
            );
            if (info.kind === 'deck' && !interval) continue;
            triangle.distance = distance;
            if (interval) Object.assign(triangle, interval);
          }
          kept.push(triangle);
        }
        if (!kept.length) continue;
        triangles.push(...kept);
        const bounds = new T.Box3().setFromPoints(
          kept.flatMap((t) => t.points.map((p) => new T.Vector3(...p))),
        );
        targets.push({
          id: solidId,
          name: object.name,
          kind: info.kind,
          min: bounds.min.toArray(),
          max: bounds.max.toArray(),
        });
      }
    });
  } finally {
    if (road.dispose) road.dispose();
    else group.userData.dispose?.();
  }
  const world = createCollisionWorld({
    id,
    version: 1,
    geometryId: `${track.geometryVersion}:${geometryId}`,
    triangles,
  });
  return Object.freeze({ ...world, targets: Object.freeze(targets) });
}
