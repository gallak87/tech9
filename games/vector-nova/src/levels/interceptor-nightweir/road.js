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
  const deck = road.group.children.find(
    (mesh) => mesh.userData.roadSurface,
  )?.material;
  if (deck?.onBeforeCompile) {
    const finish = deck.onBeforeCompile,
      key = deck.customProgramCacheKey.bind(deck);
    const oldKey = key();
    deck.onBeforeCompile = (shader, renderer) => {
      finish(shader, renderer);
      shader.fragmentShader = shader.fragmentShader.replace(
        'float laneSpacing=5.00;',
        'float laneSpacing=13.33;',
      );
    };
    deck.customProgramCacheKey = () => oldKey + '-lockdown-three-broad-lanes';
  }
  // The point emitter sits inside its glass. An unlit lens prevents the
  // near-zero light distance from turning every hood into a white bead.
  let lens;
  road.group.traverse((object) => {
    if (!object.material) return;
    const replace = (material) => {
      if (!/warm road lantern/.test(material.name)) return material;
      lens ??= new T.MeshBasicMaterial({
        name: 'Lockdown / shielded warm road lantern lens',
        color: '#b69b74',
        toneMapped: true,
      });
      return lens;
    };
    object.material = Array.isArray(object.material)
      ? object.material.map(replace)
      : replace(object.material);
  });
  const dispose = road.dispose;
  let disposed = false;
  road.dispose = () => {
    if (disposed) return;
    disposed = true;
    dispose();
    lens?.dispose();
  };
  const lightCenters = Array.from(
      { length: Math.ceil(track.length / 14) },
      (_, i) =>
        track.sample((i * track.length) / Math.ceil(track.length / 14))
          .position,
    ),
    lightOffsets = new Map();
  const update = road.update;
  road.update = (frame) => {
    update?.(frame);
    road.group.traverse((object) => {
      if (!object.isPointLight) return;
      const key = object.position
        .toArray()
        .map((v) => v.toFixed(3))
        .join(',');
      let offset = lightOffsets.get(key);
      if (!offset) {
        let nearest = lightCenters[0],
          distance = Infinity;
        for (const center of lightCenters) {
          const d =
            (center.x - object.position.x) ** 2 +
            (center.z - object.position.z) ** 2;
          if (d < distance) {
            distance = d;
            nearest = center;
          }
        }
        offset = nearest
          .clone()
          .sub(object.position)
          .setY(0)
          .normalize()
          .multiplyScalar(4.5);
        offset.y = -0.8;
        lightOffsets.set(key, offset);
      }
      object.position.add(offset);
      object.intensity *= 0.32;
    });
  };
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
