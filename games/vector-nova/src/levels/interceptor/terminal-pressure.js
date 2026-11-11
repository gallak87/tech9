import * as T from 'three';

// One complete working assembly: formed C castings carry a closed pressure
// head above the roller bed, with seated guides and a genuinely open throat.
export function emitTerminalPressureBody(b, kit, palette) {
  const { shell, cast, dark, machined, steel } = kit.materials;
  const cheek = [
    [90, -28],
    [176, -28],
    [188, -9],
    [188, 170],
    [171, 195],
    [90, 195],
    [90, 149],
    [126, 128],
    [126, 27],
    [90, 5],
  ];
  for (const side of [-1, 1]) {
    for (const z of [-110, 110]) {
      const shape = new T.Shape(
        cheek.map(([x, y]) => new T.Vector2(x * side, y)),
      );
      const geometry = new T.ExtrudeGeometry(shape, {
        depth: 46,
        bevelEnabled: true,
        bevelSize: 2.2,
        bevelThickness: 2.2,
        bevelSegments: 2,
        steps: 1,
      });
      geometry.translate(0, 0, -23);
      b.add(geometry, cast, [0, 0, z]);
      const face = Math.sign(z);
      b.box(
        dark,
        [42, 77, 2.4],
        [side * 159, 82, z + face * 25.7],
        undefined,
        0.7,
      );
      b.box(
        shell,
        [34, 65, 3],
        [side * 159, 82, z + face * 28.5],
        undefined,
        1,
      );
      for (const y of [46, 118])
        b.box(
          steel,
          [43, 5.5, 5],
          [side * 159, y, z + face * 30],
          undefined,
          0.8,
        );
      b.add(new T.CylinderGeometry(9, 9, 112, 32), machined, [
        side * 110,
        79,
        z,
      ]);
      b.box(steel, [34, 13, 40], [side * 111, 23, z], undefined, 1);
      b.box(steel, [34, 13, 40], [side * 111, 137, z], undefined, 1);
      for (const y of [30, 131])
        b.add(
          new T.TorusGeometry(12.5, 1.8, 8, 32),
          machined,
          [side * 110, y, z],
          new T.Quaternion().setFromAxisAngle(
            new T.Vector3(1, 0, 0),
            Math.PI / 2,
          ),
        );
    }
    b.box(shell, [22, 103, 143], [side * 187, 88, 0], undefined, 2);
    b.box(dark, [7, 69, 101], [side * 201, 87, 0], undefined, 1);
    b.box(shell, [3, 51, 78], [side * 206, 87, 0], undefined, 0.8);
    b.box(shell, [16, 17, 167], [side * 189, 151, 0], undefined, 1.5);
  }
  b.box(cast, [252, 42, 266], [0, 214, 0], undefined, 2.4);
  b.box(dark, [220, 43, 226], [-14, 148, 0], undefined, 2);
  for (const side of [-1, 1]) {
    b.box(shell, [97, 12, 270], [side * 74, 242, 0], undefined, 2);
    b.box(steel, [14, 22, 263], [side * 126, 230, 0], undefined, 1);
  }
  b.box(dark, [38, 16, 230], [0, 242, 0], undefined, 1.8);
  b.add(new T.CylinderGeometry(24, 24, 62, 48), machined, [-14, 199, 0]);
  b.add(new T.CylinderGeometry(34, 34, 19, 48), steel, [-14, 235, 0]);
  b.pipe(
    [
      [-14, 245, -80],
      [-14, 259, -106],
      [-71, 259, -150],
      [-161, 224, -150],
      [-174, 174, -110],
    ],
    8.5,
    palette.copper,
  );
}
