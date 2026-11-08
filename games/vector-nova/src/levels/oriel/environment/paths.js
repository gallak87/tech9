import * as T from 'three';
import {
  HABITAT,
  TAU,
  finishHabitatMaterial,
  groundSlope,
  lakeAt,
  routeClearance,
  shellPoint,
  terrainHeight,
} from './habitat.js';

const COLUMNS = 48;
const WIDTH = 4.5;
const STEP = 8;
const LIFT = 0.3;

/** Connect the corners of actual neighboring civic parcels, leaving the broad
 * planted areas and raceway unmarked. Each accepted connection is one complete
 * terrain-following segment; rejected connections never leave isolated pieces.
 */
export function createDistrictPaths(
  parcels,
  { track, own, reservations = [] },
) {
  const group = new T.Group();
  group.name = 'Oriel / inhabited parcel pedestrian lanes';
  const byCell = new Map(
    parcels.map((parcel) => [`${parcel.row}:${parcel.col}`, parcel]),
  );
  const clear = routeClearance(track);
  const positions = [];
  const indices = [];
  let connections = 0;
  const node = (parcel) => ({
    angle: parcel.angle + TAU / 96,
    z: parcel.z + 65,
  });

  function connect(from, to) {
    const a = node(from);
    const b = node(to);
    if (Math.max(Math.abs(a.z), Math.abs(b.z)) > 2330) return;
    const angleDelta = Math.atan2(
      Math.sin(b.angle - a.angle),
      Math.cos(b.angle - a.angle),
    );
    const du = angleDelta * HABITAT.radius;
    const dz = b.z - a.z;
    const length = Math.hypot(du, dz);
    if (length < 1) return;
    const steps = Math.ceil(length / STEP);
    const lateralU = -dz / length;
    const lateralZ = du / length;
    const strip = [];
    let previous = null;
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const angle = a.angle + angleDelta * t;
      const z = a.z + dz * t;
      const centerHeight = terrainHeight(angle, z);
      const radius = HABITAT.radius - centerHeight;
      const row = [];
      for (const side of [-1, 0, 1]) {
        const sampleAngle = angle + (((side * WIDTH) / 2) * lateralU) / radius;
        const sampleZ = z + ((side * WIDTH) / 2) * lateralZ;
        if (
          Math.abs(sampleZ) > 2330 ||
          lakeAt(sampleAngle, sampleZ) < 1.11 ||
          groundSlope(sampleAngle, sampleZ) > 0.25
        )
          return;
        const height = terrainHeight(sampleAngle, sampleZ);
        const position = shellPoint(sampleAngle, sampleZ, height + LIFT);
        if (reservations.some((district) => district.contains(position, 4)))
          return;
        // The extra half-step conservatively covers proximity between samples.
        if (!clear(position, 38 + STEP / 2)) return;
        row.push({ position, height });
      }
      if (Math.abs(row[0].height - row[2].height) / WIDTH > 0.25) return;
      if (previous) {
        for (let j = 0; j < row.length; j++) {
          if (
            Math.abs(row[j].height - previous[j].height) / (length / steps) >
            0.25
          )
            return;
        }
      }
      strip.push(row[0].position, row[2].position);
      previous = row;
    }
    const offset = positions.length / 3;
    for (const point of strip) positions.push(...point.toArray());
    for (let i = 0; i < steps; i++) {
      const a = offset + i * 2;
      const b = a + 2;
      indices.push(a, a + 1, b, b, a + 1, b + 1);
    }
    connections++;
  }

  for (const parcel of parcels) {
    const angular = byCell.get(`${parcel.row}:${(parcel.col + 1) % COLUMNS}`);
    const axial = byCell.get(`${parcel.row + 1}:${parcel.col}`);
    if (angular) connect(parcel, angular);
    if (axial) connect(parcel, axial);
  }
  const materials = [];
  if (indices.length) {
    const geometry = own(new T.BufferGeometry());
    geometry.setAttribute(
      'position',
      new T.Float32BufferAttribute(positions, 3),
    );
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    geometry.computeBoundingSphere();
    const material = own(
      finishHabitatMaterial(
        new T.MeshStandardMaterial({
          name: 'Oriel / quiet honed pedestrian stone',
          color: '#aaa58f',
          roughness: 0.91,
          metalness: 0,
        }),
        { bounce: 0.075 },
      ),
    );
    const mesh = new T.Mesh(geometry, material);
    mesh.name = 'Oriel / connected four-metre civic footpaths';
    mesh.receiveShadow = true;
    group.add(mesh);
    materials.push(material);
  }
  group.userData.connections = connections;
  group.userData.pathWidth = WIDTH;
  return { group, materials };
}
