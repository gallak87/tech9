import * as T from 'three';
import {
  createCollisionWorld,
  indexedTriangles,
} from '../../physics/collision-world.js';
import collisionKit from '../../../assets/levels/nomad/blender/carrier-collision.json' with { type: 'json' };
import kitManifest from '../../../assets/levels/nomad/blender/carrier-kit-provenance.json' with { type: 'json' };
import supportKit from '../../../assets/levels/nomad/blender/route-supports-collision.json' with { type: 'json' };
import supportManifest from '../../../assets/levels/nomad/blender/route-supports-provenance.json' with { type: 'json' };
import { createNomadRoad } from './track/road.js';

/** Exact nominal skin/member triangles retain rigid carrier ownership in Rapier. */
export function createNomadCollisionWorld({ track }) {
  const road = createNomadRoad({ track, collisionOnly: true });
  const triangles = [];
  try {
    road.group.updateWorldMatrix(true, true);
    road.group.traverse((mesh) => {
      const kind = mesh.userData.collisionKind;
      if (!mesh.isMesh || !kind) return;
      const geometry = mesh.geometry;
      const coord = geometry.attributes.roadCoord;
      const low = Math.min(
        ...Array.from({ length: coord.count }, (_, i) => coord.getX(i)),
      );
      const high = Math.max(
        ...Array.from({ length: coord.count }, (_, i) => coord.getX(i)),
      );
      const entries = indexedTriangles(
        geometry.attributes.position.array,
        geometry.index.array,
        {
          id: mesh.name,
          kind,
          motionGroup: mesh.userData.motionGroup,
          start: low,
          end: high,
          ...(mesh.userData.roadBoundary ? { roadBoundary: true } : {}),
        },
        mesh.matrixWorld,
        coord,
      );
      triangles.push(...entries);
    });
  } finally {
    road.dispose();
  }
  const body = collisionKit.prototypes.find(
    (part) => part.name === 'nomad_carrier',
  );
  const wheel = collisionKit.prototypes.find(
    (part) => part.name === 'nomad_wheel',
  );
  const anchors = kitManifest.prototypes.find(
    (part) => part.name === 'nomad_carrier',
  ).anchors;
  for (const carrier of track.carriers) {
    const matrix = new T.Matrix4().compose(
      carrier.origin,
      carrier.quaternion ?? new T.Quaternion(),
      carrier.scale,
    );
    triangles.push(
      ...indexedTriangles(
        body.positions,
        body.indices,
        {
          id: `${carrier.id}/structural-hull`,
          kind: 'structure',
          motionGroup: carrier.id,
        },
        matrix,
      ),
    );
    const supports = supportKit.prototypes.find(
      (part) => part.name === carrier.id,
    );
    if (supports) {
      const loadTriangles = indexedTriangles(
        supports.positions,
        supports.indices,
        {
          id: `${carrier.id}/route-load-frames`,
          kind: 'structure',
          motionGroup: carrier.id,
        },
        matrix,
      );
      for (const [index, triangle] of loadTriangles.entries()) {
        const part = supports.parts.find(
          (entry) =>
            index * 3 >= entry.indexStart &&
            index * 3 < entry.indexStart + entry.indexCount,
        );
        if (part?.contactFoot) triangle.contactFoot = true;
      }
      triangles.push(...loadTriangles);
    }
    // End bogies catch missed arrivals/departures. Other small running-gear
    // details and distant freight remain visual; the full hull stays solid.
    for (const anchor of anchors.filter(
      (entry) => entry.kind === 'wheel' && /_(00|08)$/.test(entry.name),
    )) {
      const wheelMatrix = matrix
        .clone()
        .multiply(new T.Matrix4().makeTranslation(...anchor.position))
        .multiply(
          new T.Matrix4().makeScale(1, 1, carrier.scale.x / carrier.scale.z),
        );
      triangles.push(
        ...indexedTriangles(
          wheel.positions,
          wheel.indices,
          {
            id: `${carrier.id}/${anchor.name}`,
            kind: 'structure',
            motionGroup: carrier.id,
          },
          wheelMatrix,
        ),
      );
    }
  }
  const height = track.saltPlane.height,
    grade = track.saltPlane.grade;
  const salt = [
    new T.Vector3(-18000, height + 400 * grade, -400),
    new T.Vector3(-18000, height - 24000 * grade, 24000),
    new T.Vector3(18000, height + 400 * grade, -400),
    new T.Vector3(18000, height - 24000 * grade, 24000),
  ];
  for (const ids of [
    [0, 1, 2],
    [2, 1, 3],
  ])
    triangles.push({
      id: 'nomad-salt-basin',
      kind: 'terrain',
      points: ids.map((index) => salt[index].toArray()),
    });
  return createCollisionWorld({
    id: 'nomad-physical-convoy',
    version: 1,
    geometryId: `${track.geometryVersion}:exact-road-and-blender-members-v1:${kitManifest.hashes['carrier-collision.json']}:${supportManifest.hashes['route-supports-collision.json']}`,
    triangles,
  });
}
