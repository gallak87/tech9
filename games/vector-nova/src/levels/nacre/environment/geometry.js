import * as T from 'three';
import { createRouteClearance } from '../../../environment/placement.js';
import {
  createBasaltSpire,
  createReefRock,
  createSeaFan,
  createFanEdge,
  createReefRibbon,
} from './organic.js';

export function seededRandom(seed = 41391) {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

// Reserve extra vertical/lateral room around both actual airborne intervals.
export function createNacreClearance(track) {
  const route = createRouteClearance(track);
  const flights = (track.jumps ?? []).map((jump) => {
    const bounds = new T.Box3();
    for (let s = jump.takeoff - 35; s <= jump.recovery + 35; s += 5)
      bounds.expandByPoint(track.sample(s).position);
    bounds.min.add(new T.Vector3(-48, -65, -48));
    bounds.max.add(new T.Vector3(48, 48, 48));
    return bounds;
  });
  const candidate = new T.Box3();
  return {
    route,
    flights,
    clears(x, z, radius, minY, maxY) {
      if (
        !route.clears(
          x,
          z,
          radius * 2 + 8,
          radius * 2 + 8,
          maxY + 4,
          0,
          minY - 4,
        )
      )
        return false;
      candidate.min.set(x - radius, minY, z - radius);
      candidate.max.set(x + radius, maxY, z + radius);
      return flights.every((bounds) => !bounds.intersectsBox(candidate));
    },
  };
}

export function createBatches() {
  const group = new T.Group();
  const batches = new Map();
  const geometries = {
    basaltA: createBasaltSpire(0),
    basaltB: createBasaltSpire(1.9),
    reefRockA: createReefRock(0),
    reefRockB: createReefRock(2.6),
    fan: createSeaFan(),
    canopyFan: createSeaFan(24, 6),
    fanEdge: createFanEdge(),
    ribbon: createReefRibbon(),
    twig: new T.CylinderGeometry(0.4, 1, 1, 5),
    column: new T.CylinderGeometry(0.64, 1, 1, 7, 2),
    tube: new T.CylinderGeometry(1, 1, 1, 10),
    cone: new T.CylinderGeometry(0.1, 1, 1, 7),
    box: new T.BoxGeometry(1, 1, 1),
    rock: new T.IcosahedronGeometry(1, 1),
    orb: new T.SphereGeometry(1, 8, 4),
    lens: new T.SphereGeometry(1, 24, 12),
    shell: new T.SphereGeometry(1, 12, 4, 0, Math.PI * 2, 0, Math.PI / 2),
    dome: new T.SphereGeometry(1, 24, 10, 0, Math.PI * 2, 0, Math.PI / 2),
    ring: new T.TorusGeometry(1, 0.07, 4, 24),
  };
  const matrix = new T.Matrix4();
  const scaleVector = new T.Vector3();
  const quaternion = new T.Quaternion();
  const up = new T.Vector3(0, 1, 0);
  function add(
    shape,
    material,
    position,
    size,
    rotation = [0, 0, 0],
    color = null,
  ) {
    const key = shape + '/' + material.uuid;
    if (!batches.has(key)) batches.set(key, { shape, material, entries: [] });
    quaternion.setFromEuler(new T.Euler(...rotation));
    matrix.compose(
      new T.Vector3(...position),
      quaternion,
      scaleVector.set(...size),
    );
    batches.get(key).entries.push({ matrix: matrix.clone(), color });
  }
  function beam(material, a, b, radius = 1, color = null, shape = 'tube') {
    const start = new T.Vector3(...a),
      end = new T.Vector3(...b);
    const direction = end.clone().sub(start);
    const key = shape + '/' + material.uuid;
    if (!batches.has(key)) batches.set(key, { shape, material, entries: [] });
    matrix.compose(
      start.add(end).multiplyScalar(0.5),
      quaternion.setFromUnitVectors(up, direction.clone().normalize()),
      scaleVector.set(radius, direction.length(), radius),
    );
    batches.get(key).entries.push({ matrix: matrix.clone(), color });
  }
  function finish(name) {
    group.name = name;
    let triangles = 0;
    let primitives = 0;
    const used = new Set();
    for (const { shape, material, entries } of batches.values()) {
      const geometry = geometries[shape];
      used.add(shape);
      const mesh = new T.InstancedMesh(geometry, material, entries.length);
      mesh.name = name + ' / ' + shape + ' / ' + material.name;
      const hasColors = entries.some((entry) => entry.color);
      for (let i = 0; i < entries.length; i += 1) {
        mesh.setMatrixAt(i, entries[i].matrix);
        if (hasColors)
          mesh.setColorAt(i, new T.Color(entries[i].color ?? '#ffffff'));
      }
      mesh.receiveShadow = true;
      mesh.computeBoundingSphere();
      group.add(mesh);
      primitives += entries.length;
      triangles +=
        ((geometry.index?.count ?? geometry.attributes.position.count) / 3) *
        entries.length;
    }
    for (const [shape, geometry] of Object.entries(geometries))
      if (!used.has(shape)) geometry.dispose();
    group.userData.metrics = {
      meshCount: group.children.length,
      triangleCount: triangles,
      primitiveCount: primitives,
    };
    return group;
  }
  return { add, beam, finish };
}
