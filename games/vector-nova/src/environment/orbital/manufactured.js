import * as THREE from 'three';

const pi = Math.PI;

function machinedPlate(width, height, depth, bevel = 0.11) {
  // A metre-sized part has centimetre-sized edge breaks. Scaling the generic
  // kit block gave large structures metre-wide toy bevels and featureless faces.
  const x = width / 2 - bevel,
    y = height / 2 - bevel;
  const shape = new THREE.Shape();
  shape.moveTo(-x, -y);
  shape.lineTo(x, -y);
  shape.lineTo(x, y);
  shape.lineTo(-x, y);
  shape.closePath();
  return new THREE.ExtrudeGeometry(shape, {
    depth: depth - bevel * 2,
    steps: 1,
    bevelEnabled: true,
    bevelSegments: 1,
    bevelSize: bevel,
    bevelThickness: bevel,
    curveSegments: 1,
  }).translate(0, 0, -depth / 2 + bevel);
}

function annularSegment(inner, outer, start, end, thickness) {
  const shape = new THREE.Shape();
  shape.absarc(0, 0, outer, start, end, false);
  shape.lineTo(Math.cos(end) * inner, Math.sin(end) * inner);
  shape.absarc(0, 0, inner, end, start, true);
  shape.closePath();
  return new THREE.ExtrudeGeometry(shape, {
    depth: thickness,
    steps: 1,
    bevelEnabled: true,
    bevelSegments: 1,
    bevelSize: 0.055,
    bevelThickness: 0.055,
    curveSegments: 4,
  });
}

function jointFastener(parts, x, y, z, axis = 'y', size = 0.55) {
  const rotation =
    axis === 'x' ? [0, 0, pi / 2] : axis === 'z' ? [pi / 2, 0, 0] : [0, 0, 0];
  parts.add('tube', 'titanium', [x, y, z], [size, 0.22, size], rotation, true);
}

export function fabricatedCrossGirder(parts, z, scale = 1) {
  const add = (
    shape,
    material,
    point,
    size = [1, 1, 1],
    rotation = [0, 0, 0],
    detail = false,
  ) =>
    parts.add(
      shape,
      material,
      point.map((v) => v * scale),
      size.map((v) => v * scale),
      rotation,
      detail,
    );
  // Welded box girder with a recessed web and milled flange edges. The assembly
  // keeps the original 146 x 6 x 6 m envelope, including its open sky around it.
  add('box', 'enamel', [0, -37, z], [146, 5.6, 5.6]);
  const flange = machinedPlate(24.1, 0.38, 6, 0.08);
  const machinedEdge = machinedPlate(146, 0.18, 0.17, 0.04);
  for (const vertical of [-1, 1]) {
    const y = -37 + vertical * 2.81;
    for (let bay = 0; bay < 6; bay += 1)
      add(flange, 'enamel', [(bay - 2.5) * (146 / 6), y, z]);
    // Only the narrow finished edge is bare metal; the broad six-metre flange
    // remains coated so a reflected sun cannot turn it into a white billboard.
    for (const side of [-1, 1])
      add(machinedEdge, 'edgeAlloy', [0, y, z + side * 2.9]);
  }
  const panelWidth = 24.1;
  const web = machinedPlate(panelWidth, 4.88, 0.3, 0.105);
  const splice = machinedPlate(1.7, 4.95, 0.36, 0.07);
  for (const side of [-1, 1]) {
    for (let bay = 0; bay < 6; bay += 1) {
      const x = (bay - 2.5) * (146 / 6);
      add(web, 'enamel', [x, -37, z + side * 2.82]);
      // Each web cassette meets at a bolted shear splice, not a noise/dirt map.
      if (bay < 5) {
        const seam = x + 146 / 12;
        add(splice, 'structure', [seam, -37, z + side * 2.8]);
        for (const y of [-38.65, -35.35])
          for (const dx of [-0.46, 0.46])
            add(
              'tube',
              'edgeAlloy',
              [seam + dx, y, z + side * 2.96],
              [0.32, 0.08, 0.32],
              [pi / 2, 0, 0],
              true,
            );
      }
      if (bay === 0 || bay === 5) {
        add(
          'box',
          'vermilion',
          [x, -35.5, z + side * 2.98],
          [9.2, 0.34, 0.035],
        );
        add(
          'box',
          'ivory',
          [x - 4.15, -37, z + side * 2.98],
          [0.7, 1.65, 0.035],
        );
      }
    }
    // Two load shoes sit directly under the dock's longitudinal rail lines.
    add(machinedPlate(4.2, 5.6, 0.28, 0.07), 'structure', [
      side * 70,
      -37,
      z + 2.85,
    ]);
  }
}

export function manufacturedFascia(parts) {
  // The return view sees the ±Z ends of these floor cassettes. Their previous
  // bare backing faces need the same physical construction as the side skirts.
  for (const [y, width, length] of [
    [0, 92, 102],
    [15, 76, 86],
    [30, 54, 65],
  ]) {
    const count = Math.ceil((width - 7) / 14);
    const pitch = (width - 7) / count;
    const face = machinedPlate(pitch - 0.22, 6.25, 0.56, 0.14);
    const lip = machinedPlate(pitch - 0.18, 0.3, 0.7, 0.07);
    for (const side of [-1, 1]) {
      const z = side * (length / 2 + 0.04);
      for (let bay = 0; bay < count; bay += 1) {
        const x = (bay - (count - 1) / 2) * pitch;
        parts.add(face, 'enamel', [x, y, z]);
        for (const sy of [-1, 1]) {
          parts.add(lip, 'edgeAlloy', [x, y + sy * 3.03, z]);
          for (const sx of [-1, 1])
            jointFastener(
              parts,
              x + sx * (pitch / 2 - 1),
              y + sy * 1.9,
              z + side * 0.4,
              'z',
              0.47,
            );
        }
        // A shallow removable access cover aligns with the floor service bay.
        parts.add(machinedPlate(pitch * 0.54, 2.05, 0.12, 0.04), 'structure', [
          x,
          y - 0.1,
          z + side * 0.34,
        ]);
        if (bay === 1 || bay === count - 2)
          parts.add(
            'box',
            'ivory',
            [x, y + 1.8, z + side * 0.34],
            [pitch * 0.42, 0.35, 0.045],
          );
      }
    }
  }
  // Thin ceramic roof shield over a metal sandwich. Deliberate module seams and
  // a continuous metal reveal finish the previously featureless pale cap.
  const roofWidth = 62,
    roofLength = 71;
  const tile = machinedPlate(10.3, 0.32, 12.65, 0.08);
  for (let x = -21; x <= 21; x += 10.5)
    for (let z = -26; z <= 26; z += 13) {
      parts.add(tile, 'ceramic', [x, 42.52, z]);
      parts.add(tile, 'ivory', [x, 39.48, z]);
    }
  for (const side of [-1, 1]) {
    for (const [axis, length, extent] of [
      ['z', roofWidth, roofLength / 2],
      ['x', roofLength, roofWidth / 2],
    ]) {
      const count = Math.ceil((length - 5) / 13);
      const pitch = (length - 5) / count;
      const edge = machinedPlate(pitch - 0.2, 2.1, 0.38, 0.09);
      const reveal = machinedPlate(pitch - 0.2, 0.25, 0.4, 0.05);
      for (let i = 0; i < count; i += 1) {
        const along = (i - (count - 1) / 2) * pitch;
        const point =
          axis === 'z'
            ? [along, 41, side * extent]
            : [side * extent, 41, along];
        const rotation = axis === 'z' ? [0, 0, 0] : [0, pi / 2, 0];
        parts.add(edge, 'ivory', point, [1, 1, 1], rotation);
        for (const sy of [-1, 1])
          parts.add(
            reveal,
            'edgeAlloy',
            [point[0], 41 + sy * 0.93, point[2]],
            [1, 1, 1],
            rotation,
          );
      }
    }
  }
}

export function manufacturedDecks(parts) {
  for (const [y, width, length] of [
    [0, 92, 102],
    [15, 76, 86],
    [30, 54, 65],
  ]) {
    const nx = Math.ceil((width - 7) / 12),
      nz = Math.ceil((length - 7) / 16);
    const w = (width - 7) / nx,
      d = (length - 7) / nz;
    const plate = machinedPlate(w - 0.16, 0.6, d - 0.18);
    for (let ix = 0; ix < nx; ix += 1)
      for (let iz = 0; iz < nz; iz += 1) {
        const x = (ix - (nx - 1) / 2) * w,
          z = (iz - (nz - 1) / 2) * d;
        // End cassettes are exposed alloy. Central pressure shields are coated.
        const material =
          ix === 0 || ix === nx - 1 || iz === 0 || iz === nz - 1
            ? 'ivory'
            : 'ceramic';
        parts.add(plate, material, [x, y - 5.13, z]);
        parts.add(plate, 'ceramic', [x, y + 5.13, z]);
        for (const sx of [-1, 1])
          for (const sz of [-1, 1])
            jointFastener(
              parts,
              x + sx * (w / 2 - 0.9),
              y - 5.52,
              z + sz * (d / 2 - 1.05),
            );
        if ((ix + iz * 3) % 5 === 0) {
          parts.add(
            'box',
            'dark',
            [x, y - 5.49, z],
            [w * 0.35, 0.13, 0.5],
            [0, 0, 0],
            true,
          );
          parts.add(
            'box',
            'amber',
            [x + w * 0.29, y - 5.49, z],
            [0.8, 0.14, 0.5],
            [0, 0, 0],
            true,
          );
        }
      }
    // Thin lower edge extrusion, divided by hard expansion joints.
    for (const side of [-1, 1]) {
      const strip = machinedPlate(0.7, 6.5, d - 0.2);
      for (let iz = 0; iz < nz; iz += 1) {
        const z = (iz - (nz - 1) / 2) * d;
        parts.add(strip, 'ceramic', [side * (width / 2 - 0.3), y, z]);
        parts.add(
          'box',
          'dark',
          [side * (width / 2 + 0.16), y - 1.7, z],
          [0.22, 0.35, d - 0.5],
        );
        jointFastener(
          parts,
          side * (width / 2 + 0.25),
          y + 1.5,
          z - d / 2 + 1.5,
          'x',
        );
        jointFastener(
          parts,
          side * (width / 2 + 0.25),
          y + 1.5,
          z + d / 2 - 1.5,
          'x',
        );
      }
    }
  }
}

function barrelPanels(parts, center, radius, length, axis) {
  const rotation = axis === 'x' ? [0, 0, pi / 2] : [pi / 2, 0, 0];
  const rows = Math.ceil(length / 18);
  for (let radial = 0; radial < 12; radial += 1)
    for (let row = 0; row < rows; row += 1) {
      const angle = (radial * pi) / 6;
      const section = new THREE.CylinderGeometry(
        radius + 0.17,
        radius + 0.17,
        length / rows - 0.23,
        4,
        1,
        true,
        angle + 0.012,
        pi / 6 - 0.024,
      );
      const offset = ((row - (rows - 1) / 2) * length) / rows;
      const position = [...center];
      position[axis === 'x' ? 0 : 2] += offset;
      parts.add(
        section,
        radial % 4 === 0 ? 'ivory' : 'ceramic',
        position,
        [1, 1, 1],
        rotation,
      );
    }
}

function pressureEnd(parts, center, radius, axis, side) {
  const rotation =
    axis === 'x' ? [0, (side * pi) / 2, 0] : [0, side === 1 ? 0 : pi, 0];
  const transform = new THREE.Matrix4().makeRotationFromEuler(
    new THREE.Euler(...rotation),
  );
  const local = (x, y, z) =>
    new THREE.Vector3(x, y, z)
      .applyMatrix4(transform)
      .add(new THREE.Vector3(...center))
      .toArray();
  for (let radial = 0; radial < 12; radial += 1) {
    const angle = (radial * pi) / 6;
    const geometry = annularSegment(
      radius * 0.3,
      radius * 0.89,
      angle + 0.018,
      angle + pi / 6 - 0.018,
      0.28,
    );
    parts.add(
      geometry,
      radial % 3 === 0 ? 'ivory' : 'ceramic',
      center,
      [1, 1, 1],
      rotation,
    );
    const bolt = local(
      Math.cos(angle + pi / 12) * radius * 0.81,
      Math.sin(angle + pi / 12) * radius * 0.81,
      0.5,
    );
    jointFastener(parts, ...bolt, axis, 0.65);
  }
  parts.add(
    'ring',
    'titanium',
    local(0, 0, 0.14),
    [radius * 1.85, radius * 1.85, radius * 0.21],
    rotation,
  );
  parts.add(
    'ring',
    'black',
    local(0, 0, 0.55),
    [radius * 0.72, radius * 0.72, radius * 0.1],
    rotation,
  );
  parts.add(
    'panel',
    'ivory',
    local(0, 0, 0.37),
    [radius * 0.49, radius * 0.53, 0.5],
    rotation,
  );
  parts.add(
    'panel',
    'black',
    local(0, 0, 0.69),
    [radius * 0.31, radius * 0.39, 0.18],
    rotation,
  );
  parts.add(
    'box',
    'amber',
    local(0, radius * 0.18, 0.86),
    [radius * 0.22, 0.35, 0.15],
    rotation,
  );
}

export function manufacturedPressureBodies(parts) {
  for (const side of [-1, 1]) {
    barrelPanels(parts, [side * 31, -26, 0], 11, 54, 'z');
    for (const end of [-1, 1])
      pressureEnd(parts, [side * 31, -26, end * 30.9], 10.8, 'z', end);
  }
  barrelPanels(parts, [0, -51, 0], 19, 43, 'x');
  for (const side of [-1, 1])
    pressureEnd(parts, [side * 26, -51, 0], 18.9, 'x', side);
}

export function inhabitedGlass(parts) {
  for (const [y, width, length] of [
    [0, 92, 102],
    [15, 76, 86],
    [30, 54, 65],
  ])
    for (const side of [-1, 1])
      for (
        let z = -length / 2 + 13, i = 0;
        z < length / 2 - 10;
        z += 7, i += 1
      ) {
        if (i % 4 === 0) continue;
        parts.add(
          'box',
          'interior',
          [side * (width / 2 - 4.7), y + 7.5, z],
          [0.45, 2.7, 4.7],
        );
        parts.add(
          'box',
          'dark',
          [side * (width / 2 - 4.42), y + 6.6, z],
          [0.4, 0.8, 4.1],
        );
        parts.add(
          'box',
          'black',
          [side * (width / 2 - 4.35), y + 7.9, z + 0.8],
          [0.3, 1.35, 1.2],
          [0, 0, 0],
          true,
        );
        parts.add(
          'box',
          'titanium',
          [side * (width / 2 - 3.75), y + 9.65, z],
          [0.75, 0.25, 5.7],
        );
      }
}
