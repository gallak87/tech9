import * as T from 'three';

export function createObservatoryPier() {
  const shape = new T.Shape();
  const outer = [
    [0.78, 0],
    [1, 0],
    [0.96, 0.13],
    [0.64, 0.57],
    [0.4, 1],
    [0.2, 1],
    [0.33, 0.57],
    [0.75, 0.12],
  ];
  outer.forEach(([x, y], i) => (i ? shape.lineTo(x, y) : shape.moveTo(x, y)));
  shape.closePath();
  const port = new T.Path();
  [
    [0.72, 0.19],
    [0.82, 0.19],
    [0.5, 0.67],
    [0.41, 0.67],
  ].forEach(([x, y], i) => (i ? port.lineTo(x, y) : port.moveTo(x, y)));
  port.closePath();
  shape.holes.push(port);
  const upperPort = new T.Path();
  [
    [0.34, 0.74],
    [0.46, 0.74],
    [0.35, 0.94],
    [0.26, 0.94],
  ].forEach(([x, y], i) =>
    i ? upperPort.lineTo(x, y) : upperPort.moveTo(x, y),
  );
  upperPort.closePath();
  shape.holes.push(upperPort);
  return new T.ExtrudeGeometry(shape, {
    depth: 1,
    steps: 1,
    bevelEnabled: true,
    bevelSegments: 1,
    bevelSize: 0.008,
    bevelThickness: 0.018,
    curveSegments: 1,
  }).translate(0, 0, -0.5);
}

export function createObservatoryRoof() {
  const positions = [];
  const radii = [0.16, 0.43, 0.72, 1],
    sides = 6;
  const point = (row, side, bottom = false) => {
    const r = radii[row],
      a = -Math.PI / 6 + 0.035 + (side / sides) * (Math.PI / 3 - 0.07);
    return [
      Math.cos(a) * r,
      0.94 * (1 - r ** 1.3) - (bottom ? 0.065 : 0),
      Math.sin(a) * r,
    ];
  };
  const tri = (a, b, c) => positions.push(...a, ...b, ...c);
  for (let row = 0; row < radii.length - 1; row++)
    for (let side = 0; side < sides; side++) {
      const a = point(row, side),
        b = point(row, side + 1),
        c = point(row + 1, side),
        d = point(row + 1, side + 1);
      tri(a, b, c);
      tri(b, d, c);
      const e = point(row, side, true),
        f = point(row, side + 1, true),
        g = point(row + 1, side, true),
        h = point(row + 1, side + 1, true);
      tri(e, g, f);
      tri(f, g, h);
    }
  for (let side = 0; side < sides; side++)
    for (const row of [0, radii.length - 1]) {
      const a = point(row, side),
        b = point(row, side + 1),
        c = point(row, side, true),
        d = point(row, side + 1, true);
      if (row === 0) {
        tri(a, c, b);
        tri(b, c, d);
      } else {
        tri(a, b, c);
        tri(b, d, c);
      }
    }
  for (let row = 0; row < radii.length - 1; row++)
    for (const side of [0, sides]) {
      const a = point(row, side),
        b = point(row + 1, side),
        c = point(row, side, true),
        d = point(row + 1, side, true);
      if (side === 0) {
        tri(a, b, c);
        tri(b, d, c);
      } else {
        tri(a, c, b);
        tri(b, c, d);
      }
    }
  const geometry = new T.BufferGeometry();
  geometry.setAttribute('position', new T.Float32BufferAttribute(positions, 3));
  geometry.computeVertexNormals();
  return geometry;
}

export function addObservatory(batch, m, center, waterY, seabedY) {
  const p = (x, y, z) => [center.x + x, waterY + y, center.z + z];
  const depth = waterY - seabedY;
  batch.add('column', m.alloy, p(0, (126 - depth) / 2, 0), [
    35,
    126 + depth,
    35,
  ]);
  batch.add('tube', m.pearl, p(0, 12, 0), [72, 12, 72]);
  batch.add('tube', m.alloy, p(0, 116, 0), [84, 8, 84]);
  batch.add('tube', m.glass, p(0, 124, 0), [77, 11, 77]);
  for (let petal = 0; petal < 6; petal++)
    batch.add(
      'observatoryRoof',
      m.pearl,
      p(0, 126, 0),
      [92, 27, 92],
      [0, (-petal * Math.PI) / 3, 0],
    );
  batch.add('lens', m.glass, p(0, 169, 0), [48, 42, 48]);
  batch.add(
    'observatoryRim',
    m.pearl,
    p(0, 170, 0),
    [51, 51, 51],
    [Math.PI / 2, 0, 0],
  );
  batch.add(
    'observatoryRim',
    m.alloy,
    p(0, 119, 0),
    [85, 85, 30],
    [Math.PI / 2, 0, 0],
  );
  batch.add('ring', m.alloy, p(0, 169, 0), [54, 54, 54], [0, 0.4, 0]);
  batch.add(
    'ring',
    m.alloy,
    p(0, 169, 0),
    [54, 54, 54],
    [0, 0.4 + Math.PI / 2, 0],
  );
  batch.add('cone', m.pearl, p(0, 245, 0), [10, 94, 10]);
  batch.add('orb', m.amber, p(0, 297, 0), [4, 4, 4]);
  for (let i = 0; i < 6; i += 1) {
    const a = (i * Math.PI) / 3;
    const x = Math.cos(a),
      z = Math.sin(a);
    batch.add(
      'observatoryPier',
      m.pearl,
      p(0, -depth - 10, 0),
      [102, depth + 124, 17],
      [0, -a, 0],
    );
    batch.beam(m.alloy, p(x * 33, 65, z * 33), p(x * 76, 115, z * 76), 2.3);
    batch.add('box', m.pearl, p(x * 78, 126, z * 78), [4.5, 16, 7], [0, -a, 0]);
    batch.add('box', m.amber, p(x * 64, 20, z * 64), [3, 0.8, 4], [0, -a, 0]);
    batch.add('shell', m.pearl, p(x * 61, 11, z * 61), [14, 7, 11], [0, -a, 0]);
  }
  for (let y = -110; y < 100; y += 28) {
    batch.add(
      'observatoryRim',
      m.alloy,
      p(0, y, 0),
      [37, 37, 12],
      [Math.PI / 2, 0, 0],
    );
    batch.add(
      'ring',
      m.glow,
      p(0, y + 1.5, 0),
      [37.5, 37.5, 5],
      [Math.PI / 2, 0, 0],
    );
  }
}
