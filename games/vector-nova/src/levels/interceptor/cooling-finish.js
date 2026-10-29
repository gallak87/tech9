import * as T from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

export function emitCoolingThroatFinish(b, kit, position, scale) {
  const axis = new T.Vector3(0, 0, 1);
  for (const side of [-1, 1]) {
    // A thin closed rolled liner seats just inside the existing cast throat.
    // Its continuous curved return catches light without hiding the rotor.
    const sleeve = new T.LatheGeometry(
      [
        [23.9, -12.8],
        [30.9, 12.8],
        [30.4, 12.8],
        [23.4, -12.8],
        [23.9, -12.8],
      ].map((p) => new T.Vector2(...p)),
      64,
    );
    sleeve.rotateX((side * Math.PI) / 2);
    sleeve.translate(0, 31, side * 48);
    b.add(sleeve, kit.materials.steel, position, undefined, scale);
    for (const angle of [0.55, 2.55, 4.6]) {
      const x = Math.cos(angle) * 35,
        y = 31 + Math.sin(angle) * 35;
      const lug = new RoundedBoxGeometry(5, 7, 5, 1, 0.35);
      lug.applyQuaternion(
        new T.Quaternion().setFromAxisAngle(axis, angle - Math.PI / 2),
      );
      lug.translate(x, y, side * 63);
      b.add(lug, kit.materials.cast, position, undefined, scale);
      const head = new T.CylinderGeometry(1.2, 1.2, 2, 6);
      head.setAttribute('industrialCoord', head.attributes.position.clone());
      head.rotateX(Math.PI / 2);
      head.translate(x, y, side * 67.3);
      b.add(head, kit.materials.machined, position, undefined, scale);
    }
  }
}

export function foldedExchangerFin() {
  const shape = new T.Shape(
    [
      [-7.5, -2.25],
      [-1, -2.25],
      [7.5, 0],
      [7.5, 2.25],
      [1, 2.25],
      [-7.5, 0],
    ].map((p) => new T.Vector2(...p)),
  );
  const geometry = new T.ExtrudeGeometry(shape, {
    depth: 24,
    bevelEnabled: true,
    bevelThickness: 0.25,
    bevelSize: 0.25,
    bevelSegments: 1,
    steps: 1,
  });
  geometry.translate(0, 0, -12);
  geometry.rotateY(Math.PI / 2);
  return geometry;
}

function curvedBlade(side) {
  const positions = [],
    indices = [],
    rows = 7,
    columns = 5;
  for (let layer = 0; layer < 2; layer++)
    for (let row = 0; row < rows; row++)
      for (let column = 0; column < columns; column++) {
        const radius = 6.8 + (row / (rows - 1)) * 17.2;
        const chord = (column / (columns - 1)) * 2 - 1;
        const angle = -0.16 + Math.pow(radius / 24, 1.15) * 0.55 + chord * 0.22;
        positions.push(
          Math.cos(angle) * radius,
          Math.sin(angle) * radius,
          side *
            (1.3 +
              chord * 3.6 +
              (radius - 6.8) * 0.12 +
              (layer ? 0.65 : -0.65)),
        );
      }
  const count = rows * columns;
  for (let layer = 0; layer < 2; layer++)
    for (let row = 0; row < rows - 1; row++)
      for (let column = 0; column < columns - 1; column++) {
        const a = layer * count + row * columns + column,
          b = a + columns;
        const face = [a, b, a + 1, a + 1, b, b + 1];
        if ((layer === 0) === side > 0) face.reverse();
        indices.push(...face);
      }
  const edge = [
    ...Array(columns).keys(),
    ...Array.from(
      { length: rows - 1 },
      (_, i) => (i + 1) * columns + columns - 1,
    ),
    ...Array.from({ length: columns - 1 }, (_, i) => count - 2 - i),
    ...Array.from({ length: rows - 2 }, (_, i) => (rows - 2 - i) * columns),
  ];
  for (let i = 0; i < edge.length; i++) {
    const a = edge[i],
      b = edge[(i + 1) % edge.length];
    const face = [a, a + count, b, b, a + count, b + count];
    if (side < 0) face.reverse();
    indices.push(...face);
  }
  const geometry = new T.BufferGeometry();
  geometry.setAttribute('position', new T.Float32BufferAttribute(positions, 3));
  geometry.setAttribute(
    'uv',
    new T.Float32BufferAttribute(Array((positions.length / 3) * 2).fill(0), 2),
  );
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.setAttribute(
    'industrialCoord',
    geometry.attributes.position.clone(),
  );
  return geometry;
}

export function emitFinishedCoolingBank(
  b,
  kit,
  position,
  scale,
  rotorMetal = kit.materials.steel,
) {
  for (const part of kit.prototypes.coolingBank) {
    let geometry = part.geometry.clone();
    if (part.material === kit.materials.machined) {
      // Replace only the original flat rotor blades in this owned clone.
      // Castings, shafts and outer rings remain the proven production asset.
      const source = geometry.index ? geometry.toNonIndexed() : geometry;
      if (source !== geometry) geometry.dispose();
      const keep = [],
        p = source.attributes.position;
      for (let i = 0; i < p.count; i += 3) {
        const blade = [i, i + 1, i + 2].every(
          (vertex) =>
            Math.abs(p.getZ(vertex)) > 39 &&
            Math.abs(p.getZ(vertex)) < 46 &&
            Math.hypot(p.getX(vertex), p.getY(vertex) - 31) < 27,
        );
        if (!blade) keep.push(i, i + 1, i + 2);
      }
      geometry = new T.BufferGeometry();
      for (const [name, attribute] of Object.entries(source.attributes)) {
        const array = [];
        for (const vertex of keep)
          for (let axis = 0; axis < attribute.itemSize; axis++)
            array.push(attribute.array[vertex * attribute.itemSize + axis]);
        geometry.setAttribute(
          name,
          new T.Float32BufferAttribute(array, attribute.itemSize),
        );
      }
      source.dispose();
    }
    b.add(geometry, part.material, position, undefined, scale);
  }
  for (const side of [-1, 1]) {
    for (let blade = 0; blade < 6; blade++) {
      const geometry = curvedBlade(side);
      geometry.rotateZ((blade / 6) * Math.PI * 2);
      geometry.translate(0, 31, side * 43);
      b.add(geometry, rotorMetal, position, undefined, scale);
    }
    const hub = new T.LatheGeometry(
      [
        [0, -4],
        [10, -4],
        [10, 1],
        [7, 4],
        [0, 4],
      ].map((p) => new T.Vector2(...p)),
      48,
    );
    hub.setAttribute('industrialCoord', hub.attributes.position.clone());
    hub.rotateX((side * Math.PI) / 2);
    hub.translate(0, 31, side * 48);
    b.add(hub, rotorMetal, position, undefined, scale);
  }
  emitCoolingThroatFinish(b, kit, position, scale);
}
