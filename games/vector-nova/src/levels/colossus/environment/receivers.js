import * as T from 'three';

// Different load paths distinguish the forging receiver from the open crane dock.
// Both remain outside the authored road and jump corridors.
export function buildColossusReceivingHalls({
  track,
  kit,
  uprightMatrix,
  bodyClear,
  putBox,
  staticPart,
  foundation,
}) {
  const box = (material, size, position, m, name) => {
    if (bodyClear(size, position, m)) putBox(material, size, position, m, name);
  };
  const profile = (points, depth) => {
    const geometry = new T.ExtrudeGeometry(
      new T.Shape(points.map(([x, y]) => new T.Vector2(x, y))),
      {
        depth,
        bevelEnabled: true,
        bevelThickness: 1,
        bevelSize: 1,
        bevelSegments: 1,
        steps: 1,
      },
    );
    geometry.translate(0, 0, -depth / 2);
    return geometry;
  };
  const emit = (geometry, material, m, name) => {
    geometry.computeBoundingBox();
    const size = geometry.boundingBox.getSize(new T.Vector3()),
      center = geometry.boundingBox.getCenter(new T.Vector3());
    if (!bodyClear(size.toArray(), center.toArray(), m)) {
      geometry.dispose();
      return;
    }
    geometry.applyMatrix4(m);
    staticPart(geometry, material, name);
  };
  // Real I sections make the crane's hollow structure read from both the
  // launch lip and flight, where flat side skins previously hid its function.
  const iBeam = (a, b, width, depth, material, m, name) => {
    const start = new T.Vector3(...a),
      end = new T.Vector3(...b),
      delta = end.clone().sub(start),
      w = width / 2,
      h = depth / 2,
      flange = Math.min(4, depth * 0.21),
      web = Math.min(3, width * 0.16),
      g = profile(
        [
          [-w, -h],
          [w, -h],
          [w, -h + flange],
          [web, -h + flange],
          [web, h - flange],
          [w, h - flange],
          [w, h],
          [-w, h],
          [-w, h - flange],
          [-web, h - flange],
          [-web, -h + flange],
          [-w, -h + flange],
        ],
        delta.length(),
      );
    g.applyQuaternion(
      new T.Quaternion().setFromUnitVectors(
        new T.Vector3(0, 0, 1),
        delta.normalize(),
      ),
    );
    g.translate(...start.add(end).multiplyScalar(0.5).toArray());
    emit(g, material, m, name);
  };
  for (const jump of track.jumps.filter(
    (j) => j.id === 'die-transfer' || j.hero,
  )) {
    const die = jump.id === 'die-transfer',
      length = die ? 210 : 270,
      m = uprightMatrix(jump.landingStart + (die ? 180 : 320)),
      tag = die ? 'Die / forging receiver' : 'Gantry / open transfer receiver';
    for (const side of [-1, 1]) {
      box(
        kit.materials.dark,
        [98, 54, length + 35],
        [side * 126, -53, 0],
        m,
        tag + ' carrying plinth',
      );
      box(
        kit.materials.steel,
        [106, 16, length + 45],
        [side * 126, -20, 0],
        m,
        tag + ' bearing deck',
      );
      foundation(
        new T.Vector3(side * 126, -74, 0).applyMatrix4(m),
        88,
        length * 0.72,
      );
    }
    if (die) {
      // C-shaped cast cheeks have a broad back, a true open throat and a
      // tapered crown. Two deep clamp stations replace four thin portal webs.
      const cheek = [
        [84, -12],
        [174, -12],
        [174, 34],
        [166, 48],
        [166, 116],
        [146, 137],
        [98, 137],
        [84, 114],
        [84, 96],
        [112, 96],
        [112, 42],
        [84, 42],
      ];
      for (const side of [-1, 1]) {
        for (const z of [-66, 66]) {
          const g = profile(
            cheek.map(([x, y]) => [side * x, y]),
            74,
          );
          g.translate(0, 0, z);
          emit(g, kit.materials.cast, m, tag + ' deep C clamp body');
          // Separate laminated face plates expose depth, rather than putting
          // a broad cream rectangle over the forging block's whole face.
          for (const dz of [-43, 43]) {
            const plate = profile(
              cheek.map(([x, y]) => [side * x, y]),
              7,
            );
            plate.translate(0, 0, z + dz);
            emit(plate, kit.materials.steel, m, tag + ' laminated clamp face');
          }
          box(
            kit.materials.dark,
            [20, 48, 58],
            [side * 91, 68, z],
            m,
            tag + ' fixed clamping shoe',
          );
          box(
            kit.materials.steel,
            [8, 38, 50],
            [side * 78, 68, z],
            m,
            tag + ' exposed pressure face',
          );
        }
        box(
          kit.materials.dark,
          [44, 36, 180],
          [side * 146, 66, 0],
          m,
          tag + ' continuous reaction spine',
        );
        box(
          kit.materials.shell,
          [34, 17, 202],
          [side * 146, 124, 0],
          m,
          tag + ' separate crown cover',
        );
        box(
          kit.materials.steel,
          [38, 12, 198],
          [side * 145, 4, 0],
          m,
          tag + ' lower clamp tie',
        );
      }
      const crosshead = [
        [-155, 132],
        [-70, 132],
        [-70, 138],
        [70, 138],
        [70, 132],
        [155, 132],
        [155, 150],
        [135, 165],
        [64, 165],
        [64, 154],
        [-64, 154],
        [-64, 165],
        [-135, 165],
        [-155, 150],
      ];
      for (const z of [-77, 77]) {
        const g = profile(crosshead, 54);
        g.translate(0, 0, z);
        emit(g, kit.materials.cast, m, tag + ' stepped forging crosshead');
        for (const side of [-1, 1])
          box(
            kit.materials.shell,
            [61, 8, 62],
            [side * 103, 160, z],
            m,
            tag + ' separate crosshead shoulder cover',
          );
        box(
          kit.materials.steel,
          [122, 7, 56],
          [0, 153, z],
          m,
          tag + ' recessed centre tie',
        );
      }
    } else {
      // Splayed twin portal frames and open longitudinal bracing carry the
      // crane runways. Removing the former full side skins opens the dock.
      for (const side of [-1, 1]) {
        for (const end of [-1, 1]) {
          iBeam(
            [side * 150, -12, end * 105],
            [side * 112, 172, end * 88],
            28,
            24,
            kit.materials.steel,
            m,
            tag + ' splayed I section leg',
          );
          box(
            kit.materials.cast,
            [40, 16, 48],
            [side * 149, -5, end * 105],
            m,
            tag + ' pinned leg shoe',
          );
          box(
            kit.materials.cast,
            [36, 18, 42],
            [side * 113, 170, end * 88],
            m,
            tag + ' runway saddle',
          );
        }
        iBeam(
          [side * 119, 180, -132],
          [side * 119, 180, 132],
          24,
          24,
          kit.materials.steel,
          m,
          tag + ' continuous open crane runway',
        );
        for (const end of [-1, 1])
          iBeam(
            [side * 160, 15, end * 102],
            [side * 140, 146, -end * 102],
            12,
            12,
            kit.materials.dark,
            m,
            tag + ' longitudinal diagonal brace',
          );
        box(
          kit.materials.shell,
          [30, 8, 274],
          [side * 119, 195, 0],
          m,
          tag + ' runway cap',
        );
      }
      for (const z of [-112, 112]) {
        iBeam(
          [-151, 181, z],
          [151, 181, z],
          12,
          12,
          kit.materials.dark,
          m,
          tag + ' lower truss chord',
        );
        iBeam(
          [-155, 205, z],
          [155, 205, z],
          12,
          10,
          kit.materials.steel,
          m,
          tag + ' upper truss chord',
        );
        for (let x = -150; x < 150; x += 60) {
          iBeam(
            [x, 184, z],
            [x + 30, 202, z],
            8,
            8,
            kit.materials.steel,
            m,
            tag + ' open truss diagonal',
          );
          iBeam(
            [x + 30, 202, z],
            [x + 60, 184, z],
            8,
            8,
            kit.materials.steel,
            m,
            tag + ' open truss diagonal',
          );
        }
      }
      // The parked bridge remains wholly above the previous header opening.
      // No suspended decorative mass is introduced into the flight corridor.
      iBeam(
        [-123, 187, 25],
        [123, 187, 25],
        22,
        18,
        kit.materials.steel,
        m,
        tag + ' travelling bridge girder',
      );
      box(
        kit.materials.amber,
        [38, 18, 44],
        [-45, 191, 25],
        m,
        tag + ' parked hoist trolley',
      );
      for (const x of [-114, 114])
        box(
          kit.materials.cast,
          [28, 16, 48],
          [x, 185, 25],
          m,
          tag + ' bridge end carriage',
        );
    }
  }
}
