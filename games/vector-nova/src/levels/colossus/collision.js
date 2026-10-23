import * as T from 'three';
import {
  createCollisionWorld,
  indexedTriangles,
} from '../../physics/collision-world.js';
import { createColossusRoad } from './track/road.js';
import { createColossusEnvironment } from './environment/index.js';

const worlds = new WeakMap();
const STRUCTURE_VERSION = 'jump-machinery-v1';

// Only the launch/receiving neighbourhoods need scenery contacts. These bounds
// select existing authored solids; they never become invisible collision walls.
function jumpNeighbourhoods(track) {
  return track.jumps.map((jump) => {
    const bounds = new T.Box3();
    for (let s = jump.takeoff - 100; s <= jump.landingEnd + 100; s += 8)
      bounds.expandByPoint(track.sample(s).position);
    bounds.min.add(new T.Vector3(-180, -140, -180));
    bounds.max.add(new T.Vector3(180, 160, 180));
    return { id: jump.id, bounds };
  });
}

export function createColossusCollisionWorld({ track }) {
  if (worlds.has(track)) return worlds.get(track);
  const triangles = [],
    targets = [],
    neighbourhoods = jumpNeighbourhoods(track);
  const road = createColossusRoad({
    track,
    shape: true,
    collectSolid({ name, geometry, ...info }) {
      triangles.push(
        ...indexedTriangles(
          geometry.attributes.position.array,
          geometry.index.array,
          { id: name, ...info },
          undefined,
          geometry.attributes.roadCoord,
        ),
      );
    },
  });
  road.dispose();
  const scenery = createColossusEnvironment({
    track,
    shape: true,
    collisionOnly: true,
    collectSolid({ name, geometry, matrix, boxSize }) {
      // Tiny fittings and paint do not warrant a separate broad-phase body.
      // Large shells remain exact triangle shells, retaining openings and bevels.
      geometry.computeBoundingBox();
      const local = geometry.boundingBox,
        dimensions = local
          .getSize(new T.Vector3())
          .toArray()
          .sort((a, b) => b - a);
      if (dimensions[0] < 16 || dimensions[1] < 6) return;
      const majorKit =
        /^Worldkit \/ (dieJaw|gantry|serviceTower|counterweightGuide) \/ (shell|cast|dark)$/;
      const majorStructure =
        /load bed|outer casing|carrying flange|receiver|receiving|^District \/|^Dispatch \/|production wing|payload|bearing deck|side wall|cladding|floor|crane runway|main bearing|deep bearing|powerhouse/i;
      if (name.startsWith('Worldkit /')) {
        if (!majorKit.test(name)) return;
      } else if (
        !majorStructure.test(name) &&
        !(
          name === 'machine structure' &&
          dimensions[0] >= 40 &&
          dimensions[1] >= 20
        )
      )
        return;
      const bounds = local.clone();
      if (matrix) bounds.applyMatrix4(matrix);
      const jumps = neighbourhoods.filter((area) =>
        area.bounds.intersectsBox(bounds),
      );
      if (!jumps.length) return;
      // A solid formed box uses its inset core, wholly inside the visible bevel.
      // Swept casings, cast openings and kit shells keep their authored faces.
      const inset = boxSize ? Math.min(0.8, Math.min(...boxSize) * 0.12) : 0,
        proxy = boxSize
          ? new T.BoxGeometry(...boxSize.map((size) => size - 2 * inset))
          : geometry,
        positions = proxy.attributes.position.array,
        indices =
          proxy.index?.array ??
          Array.from({ length: proxy.attributes.position.count }, (_, i) => i),
        id = 'colossus-structure-' + targets.length;
      const source = indexedTriangles(
        positions,
        indices,
        { id, kind: 'structure' },
        matrix,
      );
      if (proxy !== geometry) proxy.dispose();
      triangles.push(...source);
      targets.push(
        Object.freeze({
          id,
          name,
          kind: 'structure',
          jumps: jumps.map((jump) => jump.id),
          min: bounds.min.toArray(),
          max: bounds.max.toArray(),
          triangles: source.length,
        }),
      );
    },
  });
  scenery.dispose();
  const world = createCollisionWorld({
    id: 'colossus-machine-surfaces',
    version: 2,
    geometryId: `${track.geometryVersion}:${STRUCTURE_VERSION}`,
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
