import * as T from 'three';
import {
  createCollisionWorld,
  indexedTriangles,
} from '../../physics/collision-world.js';
import collisionKit from '../../../assets/levels/nomad/blender/carrier-collision.json' with { type: 'json' };
import kitManifest from '../../../assets/levels/nomad/blender/carrier-kit-provenance.json' with { type: 'json' };
import supportKit from '../../../assets/levels/nomad/blender/route-supports-collision.json' with { type: 'json' };
import supportManifest from '../../../assets/levels/nomad/blender/route-supports-provenance.json' with { type: 'json' };
import crownKit from '../../../assets/levels/nomad/blender/receiver-crown/receiver-crown-collision.json' with { type: 'json' };
import crownManifest from '../../../assets/levels/nomad/blender/receiver-crown/receiver-crown-provenance.json' with { type: 'json' };
import interiorKit from '../../../assets/levels/nomad/blender/interior-freight/interior-freight-collision.json' with { type: 'json' };
import interiorManifest from '../../../assets/levels/nomad/blender/interior-freight/interior-freight-provenance.json' with { type: 'json' };
import saltwindKit from '../../../assets/levels/nomad/blender/saltwind-gallery/saltwind-gallery-collision.json' with { type: 'json' };
import saltwindManifest from '../../../assets/levels/nomad/blender/saltwind-gallery/saltwind-gallery-provenance.json' with { type: 'json' };
import wallrideKit from '../../../assets/levels/nomad/blender/wallride-service/wallride-service-collision.json' with { type: 'json' };
import wallrideManifest from '../../../assets/levels/nomad/blender/wallride-service/wallride-service-provenance.json' with { type: 'json' };
import { createNomadRoad } from './track/road.js';
import {
  createNomadHallMachinery,
  NOMAD_HALL_GEOMETRY_VERSION,
} from './hall-machinery.js';

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
  const hall = createNomadHallMachinery({ track });
  try {
    triangles.push(...hall.collisionTriangles);
  } finally {
    hall.dispose();
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
    const hull =
      carrier.id === 'nomad-saltwind'
        ? (saltwindKit.prototypes.find(
            (part) => part.name === 'nomad_saltwind_hull',
          ) ?? body)
        : body;
    const matrix = new T.Matrix4().compose(
      carrier.origin,
      carrier.quaternion ?? new T.Quaternion(),
      carrier.scale,
    );
    triangles.push(
      ...indexedTriangles(
        hull.positions,
        hull.indices,
        {
          id: `${carrier.id}/structural-hull`,
          kind: 'structure',
          motionGroup: carrier.id,
        },
        matrix,
      ),
    );
    if (carrier.id === 'nomad-passing-deck') {
      const crown = crownKit.prototypes[0];
      triangles.push(
        ...indexedTriangles(
          crown.positions,
          crown.indices,
          {
            id: `${carrier.id}/receiving-cargo-crown`,
            kind: 'structure',
            motionGroup: carrier.id,
          },
          matrix,
        ),
      );
    }
    if (carrier.id === 'nomad-freight-cathedral') {
      const interior = interiorKit.prototypes[0];
      triangles.push(
        ...indexedTriangles(
          interior.positions,
          interior.indices,
          {
            id: `${carrier.id}/suspended-freight-installation`,
            kind: 'structure',
            motionGroup: carrier.id,
          },
          matrix,
        ),
      );
    }
    if (carrier.id === 'nomad-saltwind') {
      const gallery = saltwindKit.prototypes.find(
        (part) => part.name === 'nomad_saltwind_gallery',
      );
      triangles.push(
        ...indexedTriangles(
          gallery.positions,
          gallery.indices,
          {
            id: `${carrier.id}/connected-service-wing`,
            kind: 'structure',
            motionGroup: carrier.id,
          },
          matrix,
        ),
      );
    }
    if (carrier.id === 'nomad-portside-dive') {
      const wall = wallrideKit.prototypes[0];
      triangles.push(
        ...indexedTriangles(
          wall.positions,
          wall.indices,
          {
            id: `${carrier.id}/formed-service-belt`,
            kind: 'structure',
            motionGroup: carrier.id,
          },
          matrix,
        ),
      );
    }
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
    geometryId: `${track.geometryVersion}:exact-road-and-blender-members-v1:${kitManifest.hashes['carrier-collision.json']}:${supportManifest.hashes['route-supports-collision.json']}:${crownManifest.hashes['receiver-crown-collision.json']}:${interiorManifest.hashes['interior-freight-collision.json']}:${saltwindManifest.hashes['saltwind-gallery-collision.json']}:${wallrideManifest.hashes['wallride-service-collision.json']}:${NOMAD_HALL_GEOMETRY_VERSION}`,
    triangles,
  });
}
