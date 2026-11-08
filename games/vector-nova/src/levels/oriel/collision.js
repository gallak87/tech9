import { collectProductionSolids } from '../../physics/production-solids.js';
import {
  createCollisionWorld,
  indexedTriangles,
} from '../../physics/collision-world.js';
import { createOrielRoad } from './track/index.js';

export function createOrielCollisionWorld({ track }) {
  const road = createOrielRoad(track);
  const barriers = [];
  const inChallenge = (distance) =>
    track.challenges.some(
      (island) => distance >= island.start - 12 && distance <= island.end + 12,
    );
  road.group.updateWorldMatrix(true, true);
  road.group.traverse((object) => {
    const divider = object.userData.challengeBarrier;
    const parapet = /limestone parapet|parapet cap/i.test(object.name);
    if (!divider && !parapet) return;
    const geometry = object.geometry;
    const faces = indexedTriangles(
      geometry.attributes.position.array,
      geometry.index.array,
      {
        id: divider
          ? 'oriel-civic-chicane-dividers'
          : 'oriel-civic-outer-parapets',
        kind: 'rail',
        roadBoundary: true,
      },
      object.matrixWorld,
      geometry.attributes.roadCoord,
    );
    barriers.push(
      ...faces.filter((face) => divider || inChallenge(face.distance)),
    );
  });
  const base = collectProductionSolids({
    track,
    id: 'oriel-civic-road-solids',
    geometryId: `oriel-v2-full-deck-two-open-transfers:${track.challengeVersion}`,
    fullDeck: true,
    road,
    uvScale: 1,
    select(object) {
      if (object.userData.drivingSurface) return { kind: 'deck' };
      if (/limestone parapet|parapet cap/i.test(object.name))
        return { kind: 'rail', roadBoundary: true };
      if (
        /load-bearing bed|bridge keel|load arm|beacon base/i.test(object.name)
      )
        return { kind: 'structure' };
      return null;
    },
  });
  // Production collection intentionally limits scenery to transfer corridors.
  // Civic dividers are racing geometry around the entire lap, so retain their
  // exact rendered faces explicitly rather than relying on synthetic edges.
  const world = createCollisionWorld({
    id: base.id,
    version: 2,
    geometryId: base.rulesId,
    triangles: [
      ...base.triangles.filter(
        (face) =>
          !(
            /formed-limestone-parapet|bronze-parapet-cap/.test(face.id) &&
            inChallenge(face.distance)
          ),
      ),
      ...barriers,
    ],
  });
  base.dispose();
  const targets = [...base.targets];
  for (const id of new Set(barriers.map((triangle) => triangle.id))) {
    const min = [Infinity, Infinity, Infinity];
    const max = [-Infinity, -Infinity, -Infinity];
    for (const face of barriers.filter((triangle) => triangle.id === id))
      for (const point of face.points)
        for (let axis = 0; axis < 3; axis++) {
          min[axis] = Math.min(min[axis], point[axis]);
          max[axis] = Math.max(max[axis], point[axis]);
        }
    targets.push(Object.freeze({ id, name: id, kind: 'rail', min, max }));
  }
  return Object.freeze({ ...world, targets: Object.freeze(targets) });
}
