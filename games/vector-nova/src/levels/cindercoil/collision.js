import * as T from 'three';
import {
  createCollisionWorld,
  indexedTriangles,
} from '../../physics/collision-world.js';
import { createCindercoilRoad, roadIntervals } from './track/production.js';

const worlds = new WeakMap();
// A deliberately local first pass. Collect the exact production vertices and
// instance transforms before presentation; decals and small fixtures stay out.
export function createCindercoilCollisionWorld({ track }) {
  if (worlds.has(track)) return worlds.get(track);
  const jump = track.jumps[0];
  const corridor = new T.Box3();
  for (let s = jump.takeoff - 80; s <= jump.recovery + 80; s += 5)
    corridor.expandByPoint(track.sample(s).position);
  corridor.min.add(new T.Vector3(-65, -250, -65));
  corridor.max.add(new T.Vector3(65, 70, 65));
  const triangles = [],
    targets = [];
  const intervals = roadIntervals(track);
  const large =
    /box keel|ramp end faces|inner ceramic curb|continuous edge cap|shoulder ledges|upper wall masses|wall caps|wall cantilever brackets|offset ceramic piers|under-deck bracket arms|foundation blocks|support plinths|bearing capitals|landing marker backboards|reinforcement ribs/;
  const road = createCindercoilRoad({
    track,
    collectSolid({ name, geometry, drivingSurface, matrix, index, distance }) {
      if (!drivingSurface && !large.test(name)) return;
      geometry.computeBoundingBox();
      const bounds = geometry.boundingBox.clone();
      if (matrix) bounds.applyMatrix4(matrix);
      if (!bounds.intersectsBox(corridor)) return;
      const kind = drivingSurface
        ? 'deck'
        : /curb|edge cap/.test(name)
          ? 'rail'
          : 'structure';
      const id =
        name
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/-$/, '') + (index === undefined ? '' : `-${index}`);
      const positions = geometry.attributes.position.array;
      const indices =
        geometry.index?.array ??
        Array.from({ length: positions.length / 3 }, (_, i) => i);
      const route = geometry.attributes.routeDistance;
      const uv = geometry.attributes.uv;
      const roadBoundary =
        /curb|edge cap|upper wall masses|wall caps|wall cantilever brackets/.test(
          name,
        );
      const source = indexedTriangles(
        positions,
        indices,
        {
          id,
          kind,
          ...(roadBoundary
            ? {
                roadBoundary: true,
                ...(Number.isFinite(distance) ? { distance } : {}),
              }
            : {}),
        },
        matrix,
      );
      const kept = [];
      for (const [i, triangle] of source.entries()) {
        const box = new T.Box3().setFromPoints(
          triangle.points.map((p) => new T.Vector3(...p)),
        );
        if (!box.intersectsBox(corridor)) continue;
        if (kind === 'deck' || kind === 'rail') {
          const distances = [0, 1, 2].map((n) =>
            route
              ? route.getX(indices[i * 3 + n])
              : uv.getY(indices[i * 3 + n]) * 16,
          );
          const station = distances.reduce((sum, value) => sum + value, 0) / 3;
          const interval = intervals.find(
            ({ start, end }) =>
              station >= start - 0.001 && station <= end + 0.001,
          );
          if (!interval) continue;
          triangle.start = interval.start;
          triangle.end = interval.end;
        }
        kept.push(triangle);
      }
      if (!kept.length) return;
      triangles.push(...kept);
      const actualBounds = new T.Box3().setFromPoints(
        kept.flatMap((triangle) =>
          triangle.points.map((p) => new T.Vector3(...p)),
        ),
      );
      targets.push({
        id,
        name,
        kind,
        min: actualBounds.min.toArray(),
        max: actualBounds.max.toArray(),
      });
    },
  });
  road.dispose();
  const world = createCollisionWorld({
    id: 'cindercoil-vent-solids',
    version: 1,
    geometryId: `${track.geometryVersion}:production-vent-solids-v2`,
    triangles,
  });
  const owner = Object.freeze({
    ...world,
    targets: Object.freeze(targets),
    dispose() {
      if (worlds.get(track) === owner) worlds.delete(track);
      world.dispose();
    },
  });
  worlds.set(track, owner);
  return owner;
}
