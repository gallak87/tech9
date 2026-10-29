import * as T from 'three';

// Small straight members use plain boxes: their sub-metre edges do not need
// hundreds of bevel triangles at driving distance. All parts join owner batches.
export function emitServiceWalk(
  b,
  { x, y, z, length, side, steel, dark, warm },
) {
  const piece = (material, size, position) =>
    b.add(new T.BoxGeometry(...size), material, position);
  piece(steel, [7, 1.1, length], [x, y, z]);
  const edge = x - side * 3.3;
  for (const height of [0.65, 1.5])
    piece(steel, [0.2, 0.2, length - 1], [edge, y + height, z]);
  for (let station = -length / 2 + 1; station <= length / 2 - 1; station += 14)
    piece(steel, [0.25, 1.55, 0.25], [edge, y + 0.8, z + station]);
  for (const fraction of [-0.32, 0, 0.32]) {
    piece(
      dark,
      [3.8, 1, 2.5],
      [x + side * 1.2, y + 4.2, z + fraction * length],
    );
    piece(
      warm,
      [3.1, 0.18, 1.8],
      [x + side * 1.2, y + 3.62, z + fraction * length],
    );
  }
}

export function emitTerminalAccess(b, kit, warm) {
  for (const side of [-1, 1]) {
    emitServiceWalk(b, {
      x: side * 201,
      y: 159,
      z: 0,
      length: 128,
      side: -side,
      steel: kit.materials.steel,
      dark: kit.materials.dark,
      warm,
    });
    for (const z of [-47, -44.5])
      b.add(new T.BoxGeometry(0.25, 178, 0.25), kit.materials.steel, [
        side * 203,
        70,
        z,
      ]);
    for (let y = -18; y < 159; y += 1.1)
      b.add(new T.BoxGeometry(0.28, 0.18, 2.8), kit.materials.steel, [
        side * 203,
        y,
        -45.75,
      ]);
    for (const y of [18, 54, 90, 126]) {
      b.box(
        kit.materials.steel,
        [6, 0.9, 6],
        [side * 200, y, -46],
        undefined,
        0.1,
      );
      b.box(
        kit.materials.dark,
        [0.7, 3.2, 2],
        [side * 203, y + 1.8, -42.8],
        undefined,
        0.1,
      );
    }
  }
}
