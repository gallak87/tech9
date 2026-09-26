import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { createBoatMaterials } from './BoatMaterials.js';
import { createShipHelm } from './ShipHelm.js';

/** Authored sailing ships in metres. Materials, rigging and canvas stay editable here. */
export function createSailingShip(profile) {
  const galleon = profile.id === 'galleon';
  const length = profile.length ?? (galleon ? 18 : 14);
  const beam = profile.beam ?? (galleon ? 5.5 : 4.2);
  const mastHeight = profile.mastHeight ?? (galleon ? 16 : 12);
  const deckY = galleon ? 1.65 : 1.28;
  const quarterY = galleon ? 3.13 : 1.78;
  const helmZ = length * (galleon ? 0.36 : 0.34);
  const helmX = galleon ? 0.78 : 0.68;
  const group = new THREE.Group();
  group.name = galleon ? 'Resolute galleon' : 'Kestrel schooner';
  const staticGroup = new THREE.Group();
  group.add(staticGroup);
  const owned = new Set();
  let disposed = false;
  const up = new THREE.Vector3(0, 1, 0);
  const own = (resource) => {
    owned.add(resource);
    return resource;
  };
  const material = (color, roughness = 0.8, metalness = 0) =>
    own(new THREE.MeshStandardMaterial({ color, roughness, metalness }));
  const mesh = (geometry, mat, x = 0, y = 0, z = 0, parent = staticGroup) => {
    const item = new THREE.Mesh(own(geometry), mat);
    item.position.set(x, y, z);
    // Moving ships receive the island's static shadow map; they never bake a ghost into it.
    item.castShadow = false;
    item.receiveShadow = true;
    parent.add(item);
    return item;
  };
  const box = (w, h, d, mat, x, y, z, parent = staticGroup) =>
    mesh(new THREE.BoxGeometry(w, h, d), mat, x, y, z, parent);
  const rounded = (w, h, d, mat, x, y, z, r = 0.03, parent = staticGroup) =>
    mesh(
      new RoundedBoxGeometry(w, h, d, 2, Math.min(r, w / 2, h / 2, d / 2)),
      mat,
      x,
      y,
      z,
      parent,
    );
  const sphere = (x, y, z, sx, sy, sz, mat, parent = staticGroup) => {
    const item = mesh(new THREE.SphereGeometry(1, 12, 9), mat, x, y, z, parent);
    item.scale.set(sx, sy, sz);
    return item;
  };
  const rod = (a, b, r, mat, parent = staticGroup, r2 = r) => {
    const av = new THREE.Vector3(...a),
      bv = new THREE.Vector3(...b),
      d = bv.clone().sub(av);
    // Triangular canvas has one shared corner, so its closing rope can be empty.
    if (d.lengthSq() < 1e-10) return null;
    const item = mesh(
      new THREE.CylinderGeometry(r2, r, d.length(), r > 0.06 ? 18 : 8),
      mat,
      0,
      0,
      0,
      parent,
    );
    item.position.copy(av.add(bv).multiplyScalar(0.5));
    item.quaternion.setFromUnitVectors(up, d.normalize());
    return item;
  };
  const materials = createBoatMaterials({ own, galleon });
  const {
    hullWood,
    deckWood,
    timber,
    darkWood,
    trim,
    paint,
    iron,
    rope,
    canvas,
    glass,
    lamp,
  } = materials;
  const sailSeam = own(canvas.clone());
  sailSeam.vertexColors = false;
  sailSeam.color.multiplyScalar(0.82);
  const sailPatch = own(canvas.clone());
  sailPatch.vertexColors = false;
  sailPatch.color.multiplyScalar(0.94);
  const ivory = materials.ivory ?? trim;

  // A fine bow, flared shoulders and a broad transom, not an enlarged motor launch.
  const stations = [
    [-0.5, 0.025],
    [-0.45, 0.19],
    [-0.37, 0.34],
    [-0.25, 0.45],
    [-0.08, 0.5],
    [0.12, 0.49],
    [0.29, 0.455],
    [0.43, galleon ? 0.405 : 0.36],
    [0.5, galleon ? 0.35 : 0.27],
  ];
  const sideCurve = new THREE.CatmullRomCurve3(
    stations.map(([z, w]) => new THREE.Vector3(w * beam, 0, z * length)),
    false,
    'centripetal',
  );
  const starboard = sideCurve
    .getPoints(40)
    .map((p) => [Math.min(beam * 0.5, p.x), p.z]);
  const outline = [
    ...starboard,
    ...[...starboard].reverse().map(([x, z]) => [-x, z]),
  ];
  const sheer = (z) => Math.pow(Math.abs(z / (length * 0.5)), 2.7) * 0.34;
  const widthAt = (z) => {
    for (let i = 1; i < starboard.length; i++)
      if (z <= starboard[i][1]) {
        const [ax, az] = starboard[i - 1],
          [bx, bz] = starboard[i];
        return THREE.MathUtils.lerp(
          ax,
          bx,
          THREE.MathUtils.clamp((z - az) / (bz - az), 0, 1),
        );
      }
    return starboard.at(-1)[0];
  };
  function hullBand(low, high, loScale, hiScale, mat) {
    const positions = [],
      uvs = [],
      indices = [];
    for (let i = 0; i <= outline.length; i++) {
      const p = outline[i % outline.length];
      for (const [scale, y] of [
        [loScale, low],
        [hiScale, high],
      ]) {
        const x = p[0] * scale,
          z = p[1] * (0.87 + scale * 0.13);
        positions.push(x, y + sheer(p[1]), z);
        uvs.push(y * 4, z * 0.32);
      }
      if (i < outline.length) {
        const a = i * 2;
        indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute(
      'position',
      new THREE.Float32BufferAttribute(positions, 3),
    );
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geo.setIndex(indices);
    geo.computeVertexNormals();
    mesh(geo, mat);
  }
  hullBand(-0.92, -0.3, 0.48, 0.75, darkWood);
  hullBand(-0.3, 0.08, 0.75, 0.88, darkWood);
  hullBand(0.08, deckY, 0.88, 1, darkWood);
  const strakes = galleon ? 8 : 6;
  for (let i = 0; i < strakes; i++) {
    const lo = 0.08 + ((deckY - 0.08) * i) / strakes,
      hi = 0.08 + ((deckY - 0.08) * (i + 1)) / strakes;
    const mat =
      (!galleon && i > 0 && i < strakes - 1) || (galleon && i >= strakes - 2)
        ? paint
        : hullWood;
    hullBand(
      lo + 0.007,
      hi - 0.006,
      0.883 + (i / strakes) * 0.12,
      0.883 + ((i + 1) / strakes) * 0.12,
      mat,
    );
  }
  hullBand(deckY - 0.115, deckY - 0.07, 1.006, 1.008, trim);
  hullBand(deckY - 0.03, deckY + 0.07, 1.008, 1.011, galleon ? timber : ivory);
  hullBand(0.17, 0.21, 0.9, 0.907, trim);
  // Clip real planks to their deck outline, including staggered butt joints.
  function clipPolygon(points, axis, bound, above) {
    const output = [];
    for (let i = 0; i < points.length; i++) {
      const a = points[i],
        b = points[(i + 1) % points.length];
      const insideA = above ? a[axis] >= bound : a[axis] <= bound,
        insideB = above ? b[axis] >= bound : b[axis] <= bound;
      if (insideA) output.push(a);
      if (insideA !== insideB) {
        const t = (bound - a[axis]) / (b[axis] - a[axis]);
        output.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
      }
    }
    return output;
  }
  function deckSurface(points, y, mat, curved = false) {
    if (points.length < 3) return;
    const shape = new THREE.Shape(
      points.map(([x, z]) => new THREE.Vector2(x, -z)),
    );
    const geo = new THREE.ShapeGeometry(shape);
    geo.rotateX(-Math.PI / 2);
    const pos = geo.attributes.position,
      uv = geo.attributes.uv;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i),
        z = pos.getZ(i);
      pos.setY(
        i,
        curved
          ? sheer(z) + 0.025 * (1 - Math.min(1, (x / (beam * 0.5)) ** 2))
          : 0,
      );
      uv.setXY(i, x * 4.8, z * 0.48);
    }
    geo.computeVertexNormals();
    mesh(geo, mat, 0, y, 0);
  }
  function deck(points, y, mat = deckWood, curved = false) {
    deckSurface(points, y - 0.006, darkWood, curved);
    const minX = Math.min(...points.map((p) => p[0])),
      maxX = Math.max(...points.map((p) => p[0]));
    const minZ = Math.min(...points.map((p) => p[1])),
      maxZ = Math.max(...points.map((p) => p[1]));
    const spacing = 0.208;
    for (
      let x = Math.floor(minX / spacing) * spacing, index = 0;
      x < maxX;
      x += spacing, index++
    ) {
      let strip = clipPolygon(points, 0, x + 0.004, true);
      strip = clipPolygon(strip, 0, x + spacing - 0.004, false);
      if (strip.length < 3) continue;
      const offset = (index % 3) * 0.84;
      for (let z = minZ - 2.52 + offset; z < maxZ; z += 2.52) {
        let plank = clipPolygon(strip, 1, z + 0.006, true);
        plank = clipPolygon(plank, 1, z + 2.512, false);
        deckSurface(plank, y, mat, curved);
      }
    }
  }
  deck(outline, deckY + 0.025, deckWood, true);
  // Bulwark rail follows the actual contour. Open tops preserve the view over the bow.
  for (let i = 0; i < outline.length; i++) {
    const a = outline[i],
      b = outline[(i + 1) % outline.length];
    const high = deckY + 0.49;
    rod(
      [a[0], high + sheer(a[1]), a[1]],
      [b[0], high + sheer(b[1]), b[1]],
      0.055,
      timber,
    );
    if (i % 4 === 0 || i === 40 || i === 41)
      rod(
        [a[0], deckY + 0.11 + sheer(a[1]), a[1]],
        [a[0], high + sheer(a[1]), a[1]],
        0.043,
        paint,
      );
  }
  // Keel, rudder and a long stayed bowsprit are characteristic silhouettes.
  box(0.18, 0.82, length * 0.74, darkWood, 0, -0.67, 0.2);
  box(0.14, 1.25, 0.64, timber, 0, -0.03, length * 0.5 + 0.08);
  const bowEnd = [0, deckY + 0.7, -length * 0.68];
  rod(
    [0, deckY + 0.35, -length * 0.31],
    bowEnd,
    0.105,
    timber,
    staticGroup,
    0.055,
  );
  rod([0, -0.2, -length * 0.43], bowEnd, 0.018, rope);
  for (const side of [-1, 1])
    rod([side * beam * 0.3, deckY, -length * 0.35], bowEnd, 0.014, rope);

  // Sterncastle or compact raised quarterdeck, each with steps and railings.
  const aftStart = length * (galleon ? 0.23 : 0.24),
    aftEnd = length * 0.485;
  const aftWidth = beam * (galleon ? 0.8 : 0.73);
  const aftOutline = [
    [-aftWidth * 0.5, aftStart],
    [-aftWidth * 0.495, aftStart + (aftEnd - aftStart) * 0.45],
    [-aftWidth * 0.44, aftEnd - 0.1],
    [-aftWidth * 0.25, aftEnd + 0.015],
    [0, aftEnd + 0.065],
    [aftWidth * 0.25, aftEnd + 0.015],
    [aftWidth * 0.44, aftEnd - 0.1],
    [aftWidth * 0.495, aftStart + (aftEnd - aftStart) * 0.45],
    [aftWidth * 0.5, aftStart],
  ];
  function raisedBody(points, low, high, mat) {
    const pos = [],
      uv = [];
    for (let i = 0; i < points.length; i++) {
      const a = points[i],
        b = points[(i + 1) % points.length];
      for (const [p, y, s] of [
        [a, low, 0.98],
        [b, low, 0.98],
        [a, high, 1],
        [a, high, 1],
        [b, low, 0.98],
        [b, high, 1],
      ]) {
        pos.push(p[0] * s, y, p[1]);
        uv.push(y * 4, p[1] * 0.32);
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    geo.computeVertexNormals();
    mesh(geo, mat);
  }
  raisedBody(aftOutline, deckY, quarterY, galleon ? paint : hullWood);
  deck(aftOutline, quarterY + 0.015);
  for (let i = 0; i < aftOutline.length - 1; i++) {
    const a = aftOutline[i],
      b = aftOutline[i + 1];
    for (const y of [deckY + 0.12, quarterY - 0.11, quarterY + 0.04])
      rod(
        [a[0], y, a[1]],
        [b[0], y, b[1]],
        y === quarterY - 0.11 ? 0.02 : 0.036,
        y === quarterY - 0.11 ? trim : timber,
      );
  }
  const steps = galleon ? 6 : 3;
  for (let i = 0; i < steps; i++)
    box(
      1.05,
      0.09,
      0.31,
      deckWood,
      -0.5,
      deckY + ((quarterY - deckY) * (i + 1)) / steps,
      aftStart - 1.5 + i * 0.26,
    );
  for (const side of [-1, 1]) {
    const x = side * aftWidth * 0.47;
    rod(
      [x, quarterY + 0.65, aftStart],
      [x * 0.92, quarterY + 0.65, aftEnd],
      0.045,
      timber,
    );
    for (let i = 0; i < 5; i++) {
      const z = aftStart + ((aftEnd - aftStart) * i) / 4;
      rod([x, quarterY, z], [x, quarterY + 0.65, z], 0.028, trim);
    }
  }
  rod(
    [-aftWidth * 0.43, quarterY + 0.65, aftEnd],
    [aftWidth * 0.43, quarterY + 0.65, aftEnd],
    0.05,
    timber,
  );
  for (let i = -3; i <= 3; i++)
    rod(
      [(i * aftWidth) / 8, quarterY, aftEnd],
      [(i * aftWidth) / 8, quarterY + 0.65, aftEnd],
      0.027,
      trim,
    );
  if (galleon) {
    function archedWindow(x, y, z, width, height, angle = 0) {
      const arch = (w, h) => {
        const shape = new THREE.Shape();
        shape.moveTo(-w / 2, -h / 2);
        shape.lineTo(w / 2, -h / 2);
        shape.lineTo(w / 2, h * 0.19);
        shape.quadraticCurveTo(w / 2, h * 0.5, 0, h * 0.5);
        shape.quadraticCurveTo(-w / 2, h * 0.5, -w / 2, h * 0.19);
        shape.closePath();
        return shape;
      };
      const outer = arch(width, height),
        hole = arch(width - 0.085, height - 0.085);
      outer.holes.push(new THREE.Path(hole.getPoints(12)));
      const frame = mesh(
        new THREE.ExtrudeGeometry(outer, {
          depth: 0.028,
          bevelEnabled: true,
          bevelSize: 0.008,
          bevelThickness: 0.008,
          bevelSegments: 1,
          steps: 1,
          curveSegments: 10,
        }),
        trim,
        x,
        y,
        z,
      );
      frame.rotation.y = angle;
      const pane = mesh(
        new THREE.ShapeGeometry(arch(width - 0.055, height - 0.055)),
        glass,
        x,
        y,
        z + 0.003,
      );
      pane.rotation.y = angle;
      const pt = (px, py) => [
        x + Math.cos(angle) * px,
        y + py,
        z - Math.sin(angle) * px + 0.039,
      ];
      rod(pt(0, -height * 0.45), pt(0, height * 0.43), 0.011, timber);
      rod(
        pt(-width * 0.43, -height * 0.03),
        pt(width * 0.43, -height * 0.03),
        0.012,
        timber,
      );
    }
    for (let i = -2; i <= 2; i++) {
      const x = i * 0.57,
        t = x / (aftWidth * 0.44),
        z = aftEnd + 0.075 - 0.13 * t * t;
      archedWindow(x, quarterY - 0.57, z, 0.46, 0.74, t * 0.12);
      rod(
        [x - 0.24, quarterY - 0.99, z],
        [x + 0.24, quarterY - 0.99, z],
        0.034,
        timber,
      );
      // Carved gallery bracket joins the projected frame to the hull below it.
      rod(
        [x, quarterY - 1.06, z - 0.08],
        [x, quarterY - 0.96, z + 0.05],
        0.055,
        trim,
      );
    }
    for (const side of [-1, 1])
      for (let i = 0; i < 2; i++) {
        const z = aftEnd - 0.7 - i * 0.72,
          x = side * (aftWidth * 0.46);
        archedWindow(x, quarterY - 0.56, z, 0.42, 0.67, (side * Math.PI) / 2);
      }
    // Projected cornice, sill and pilasters make the gallery a joined structure.
    const galleryPoint = (x, y, out = 0.13) => [
      x,
      y,
      aftEnd + 0.075 - 0.13 * (x / (aftWidth * 0.44)) ** 2 + out,
    ];
    for (const [y, r, mat, out] of [
      [quarterY + 0.008, 0.067, timber, 0.11],
      [quarterY - 0.095, 0.026, trim, 0.16],
      [quarterY - 0.995, 0.055, timber, 0.13],
      [quarterY - 1.08, 0.02, trim, 0.12],
    ]) {
      const points = Array.from(
        { length: 25 },
        (_, i) =>
          new THREE.Vector3(
            ...galleryPoint(((i / 24) * 2 - 1) * aftWidth * 0.43, y, out),
          ),
      );
      curvedLine(points, r, mat);
    }
    for (const x of [-1.43, -0.855, -0.285, 0.285, 0.855, 1.43]) {
      const at = galleryPoint(x, quarterY - 0.98, 0.1);
      const profile = [
        new THREE.Vector2(0.062, 0),
        new THREE.Vector2(0.062, 0.055),
        new THREE.Vector2(0.044, 0.1),
        new THREE.Vector2(0.039, 0.68),
        new THREE.Vector2(0.063, 0.73),
        new THREE.Vector2(0.063, 0.81),
      ];
      mesh(new THREE.LatheGeometry(profile, 12), timber, at[0], at[1], at[2]);
      rounded(0.17, 0.042, 0.15, trim, at[0], at[1] + 0.77, at[2], 0.009);
    }
    for (const x of [-1.16, -0.58, 0, 0.58, 1.16]) {
      const at = galleryPoint(x, quarterY - 1.02, 0.01);
      const shape = new THREE.Shape();
      shape.moveTo(0, 0);
      shape.lineTo(0.24, 0);
      shape.bezierCurveTo(0.25, -0.12, 0.065, -0.17, 0.045, -0.39);
      shape.lineTo(0, -0.43);
      shape.closePath();
      const support = mesh(
        new THREE.ExtrudeGeometry(shape, {
          depth: 0.115,
          bevelEnabled: true,
          bevelSize: 0.008,
          bevelThickness: 0.008,
          bevelSegments: 1,
          steps: 1,
          curveSegments: 12,
        }),
        timber,
        at[0] + 0.058,
        at[1],
        at[2],
      );
      support.rotation.y = -Math.PI / 2;
    }
    // A single small carved compass-rose crest is the stern's quiet focal point.
    const crest = galleryPoint(0, quarterY - 1.17, 0.17);
    mesh(new THREE.TorusGeometry(0.14, 0.025, 7, 28), timber, ...crest);
    for (let i = 0; i < 8; i++) {
      const a = (i * Math.PI) / 4,
        r = i % 2 === 0 ? 0.125 : 0.083;
      rod(
        [crest[0], crest[1], crest[2] + 0.02],
        [
          crest[0] + Math.cos(a) * r,
          crest[1] + Math.sin(a) * r,
          crest[2] + 0.02,
        ],
        0.012,
        trim,
      );
    }
    // Closed gunport shutters and wale bands are architectural details only.
    for (const side of [-1, 1])
      for (let i = 0; i < 5; i++) {
        const z = -4.9 + i * 2.0,
          x = side * widthAt(z) * (0.88 + (0.88 / deckY) * 0.12 + 0.009);
        box(0.055, 0.39, 0.53, paint, x, 0.88, z);
        rod(
          [x + side * 0.03, 1.1, z - 0.3],
          [x + side * 0.03, 1.1, z + 0.3],
          0.024,
          trim,
        );
      }
    // Elevated forecastle with understated carved stem scrolls.
    box(beam * 0.55, 0.45, 2.5, hullWood, 0, deckY + 0.21, -length * 0.36);
    deck(
      [
        [-beam * 0.3, -length * 0.25],
        [beam * 0.3, -length * 0.25],
        [beam * 0.17, -length * 0.45],
        [-beam * 0.17, -length * 0.45],
      ],
      deckY + 0.46,
    );
    for (const side of [-1, 1]) {
      const scroll = mesh(
        new THREE.TorusGeometry(0.24, 0.047, 7, 18, Math.PI * 1.6),
        trim,
        side * 0.15,
        deckY + 0.14,
        -length * 0.5,
      );
      scroll.rotation.y = Math.PI / 2;
    }
  } else {
    rounded(2.16, 0.72, 2.35, paint, 0, deckY + 0.36, 0.8, 0.08);
    rounded(2.34, 0.12, 2.5, deckWood, 0, deckY + 0.77, 0.8, 0.06);
    for (const side of [-1, 1]) {
      rod(
        [side * 1.08, deckY + 0.08, -0.38],
        [side * 1.08, deckY + 0.08, 1.98],
        0.024,
        ivory,
      );
      rod(
        [side * 1.08, deckY + 0.66, -0.38],
        [side * 1.08, deckY + 0.66, 1.98],
        0.026,
        ivory,
      );
      for (const z of [-0.35, 1.97])
        rod(
          [side * 1.08, deckY + 0.08, z],
          [side * 1.08, deckY + 0.67, z],
          0.023,
          timber,
        );
    }
    rounded(0.76, 0.08, 0.96, timber, 0, deckY + 0.87, 0.7, 0.03);
    rounded(0.62, 0.027, 0.82, glass, 0, deckY + 0.919, 0.7, 0.012);
    for (const z of [0.44, 0.7, 0.96])
      box(0.64, 0.031, 0.015, trim, 0, deckY + 0.937, z);
    for (const side of [-1, 1])
      for (let i = 0; i < 3; i++) {
        const port = mesh(
          new THREE.TorusGeometry(0.14, 0.026, 7, 20),
          trim,
          side * 1.09,
          deckY + 0.39,
          0.1 + i * 0.62,
        );
        port.rotation.y = Math.PI / 2;
        const pane = mesh(
          new THREE.CircleGeometry(0.126, 20),
          glass,
          side * 1.1,
          deckY + 0.39,
          0.1 + i * 0.62,
        );
        pane.rotation.y = (side * Math.PI) / 2;
      }
    box(0.64, 0.6, 0.06, darkWood, 0, deckY + 0.3, 2.0);
    for (const x of [-0.27, 0.27])
      box(0.025, 0.54, 0.075, trim, x, deckY + 0.3, 2.025);
  }

  function curvedLine(points, r, mat) {
    if (points[0].distanceToSquared(points.at(-1)) < 1e-8) return;
    mesh(
      new THREE.TubeGeometry(
        new THREE.CatmullRomCurve3(points),
        Math.max(8, points.length * 2),
        r,
        5,
        false,
      ),
      mat,
    );
  }
  function sailQuad(
    topLeft,
    topRight,
    bottomLeft,
    bottomRight,
    billow = 0.55,
    square = false,
  ) {
    const tl = new THREE.Vector3(...topLeft),
      tr = new THREE.Vector3(...topRight),
      bl = new THREE.Vector3(...bottomLeft),
      br = new THREE.Vector3(...bottomRight);
    const normal = new THREE.Vector3(square ? 0 : -1, 0, square ? 1 : 0);
    function point(u, v, offset = 0) {
      const p = tl.clone().lerp(tr, u).lerp(bl.clone().lerp(br, u), v);
      const puff = Math.sin(u * Math.PI) * Math.sin(v * Math.PI);
      const tension =
        Math.sin(u * 31 + v * 8) *
        0.022 *
        Math.sin(v * Math.PI) *
        Math.pow(Math.abs(u - 0.5) * 2, 3);
      p.addScaledVector(normal, puff * billow + tension + offset);
      if (square) p.y -= Math.sin(u * Math.PI) * v * 0.19;
      return p;
    }
    const positions = [],
      uvs = [],
      colors = [],
      indices = [],
      nx = 24,
      ny = 20;
    for (let y = 0; y <= ny; y++)
      for (let x = 0; x <= nx; x++) {
        const u = x / nx,
          v = y / ny,
          p = point(u, v);
        positions.push(...p);
        uvs.push(u * 6, v * 1.4);
        const tone =
          0.91 + Math.sin(u * Math.PI) * 0.07 - Math.pow(v, 5) * 0.035;
        colors.push(tone, tone, tone);
        if (x < nx && y < ny) {
          const i = y * (nx + 1) + x;
          indices.push(i, i + nx + 1, i + 1, i + 1, i + nx + 1, i + nx + 2);
        }
      }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute(
      'position',
      new THREE.Float32BufferAttribute(positions, 3),
    );
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    geo.setIndex(indices);
    geo.computeVertexNormals();
    mesh(geo, canvas);
    const line = (fn) => Array.from({ length: 21 }, (_, i) => fn(i / 20));
    for (const boundary of [
      (t) => point(t, 0),
      (t) => point(t, 1),
      (t) => point(0, t),
      (t) => point(1, t),
    ])
      curvedLine(line(boundary), 0.015, rope);
    for (let seam = 1; seam < 7; seam++)
      curvedLine(
        line((v) => point(seam / 7, v, 0.006)),
        0.0055,
        sailSeam,
      );
    for (const v of [0.72, 0.82]) {
      const pos = [],
        uv = [];
      for (let i = 0; i < 24; i++) {
        const u = i / 24,
          b = (i + 1) / 24;
        for (const [a, c] of [
          [u, v - 0.004],
          [b, v - 0.004],
          [u, v + 0.004],
          [u, v + 0.004],
          [b, v - 0.004],
          [b, v + 0.004],
        ]) {
          pos.push(...point(a, c, 0.009));
          uv.push(a * 6, c * 1.4);
        }
      }
      const band = new THREE.BufferGeometry();
      band.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      band.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
      band.computeVertexNormals();
      mesh(band, sailPatch);
    }
    for (let i = 1; i < 7; i++) {
      const a = point(i / 7, 0.82, 0.019),
        b = a
          .clone()
          .add(
            new THREE.Vector3(
              square ? 0.025 : -0.025,
              -0.14,
              square ? 0.05 : 0,
            ),
          );
      rod(a.toArray(), b.toArray(), 0.007, rope);
    }
    for (const [u, v, du, dv] of [
      [0, 0, 0.11, 0.12],
      [1, 0, -0.11, 0.12],
      [0, 1, 0.11, -0.12],
      [1, 1, -0.11, -0.12],
    ]) {
      const pos = [
        ...point(u, v, 0.01),
        ...point(u + du, v, 0.01),
        ...point(u, v + dv, 0.01),
      ];
      const patch = new THREE.BufferGeometry();
      patch.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      patch.setAttribute(
        'uv',
        new THREE.Float32BufferAttribute([0, 0, 1, 0, 0, 1], 2),
      );
      patch.computeVertexNormals();
      mesh(patch, sailPatch);
      const corner = point(u, v);
      sphere(corner.x, corner.y, corner.z, 0.028, 0.028, 0.028, rope);
    }
  }
  function workingBlock(point, scale = 1) {
    const [x, y, z] = point;
    for (const side of [-1, 1])
      sphere(
        x,
        y,
        z + side * 0.034 * scale,
        0.073 * scale,
        0.115 * scale,
        0.025 * scale,
        timber,
      );
    const sheave = mesh(
      new THREE.CylinderGeometry(
        0.062 * scale,
        0.062 * scale,
        0.04 * scale,
        16,
      ),
      iron,
      x,
      y,
      z,
    );
    sheave.rotation.x = Math.PI / 2;
    sphere(
      x,
      y,
      z + 0.064 * scale,
      0.014 * scale,
      0.014 * scale,
      0.012 * scale,
      trim,
    );
    const harness = Array.from({ length: 25 }, (_, i) => {
      const a = (i / 24) * Math.PI * 2;
      return new THREE.Vector3(
        x + Math.cos(a) * 0.085 * scale,
        y + Math.sin(a) * 0.13 * scale,
        z,
      );
    });
    // TubeGeometry supports closed curves here; preserve the visible rope strop.
    mesh(
      new THREE.TubeGeometry(
        new THREE.CatmullRomCurve3(harness.slice(0, -1), true),
        28,
        0.01 * scale,
        5,
        true,
      ),
      rope,
    );
  }
  function cleat(x, y, z) {
    rounded(0.22, 0.037, 0.105, iron, x, y + 0.018, z, 0.018);
    for (const side of [-1, 1])
      rod(
        [x + side * 0.058, y + 0.03, z],
        [x + side * 0.074, y + 0.115, z],
        0.023,
        iron,
      );
    rod([x - 0.17, y + 0.12, z], [x + 0.17, y + 0.12, z], 0.024, iron);
    const tie = [
      [-0.13, 0.07],
      [-0.13, -0.055],
      [0.13, 0.055],
      [0.13, -0.055],
      [-0.13, 0.055],
    ].map(([dx, dz]) => new THREE.Vector3(x + dx, y + 0.107, z + dz));
    curvedLine(tie, 0.01, rope);
  }
  const workingDeckY = (z) =>
    z > aftStart
      ? quarterY
      : deckY + sheer(z) + (galleon && z < -length * 0.25 ? 0.45 : 0);
  // Windlass/capstan and their leading lines explain how the bow ground tackle works.
  const winchZ = -length * 0.32,
    winchY = workingDeckY(winchZ);
  if (galleon) {
    mesh(
      new THREE.CylinderGeometry(0.42, 0.46, 0.09, 20),
      timber,
      0,
      winchY + 0.045,
      winchZ,
    );
    const drumProfile = [
      [0.27, 0],
      [0.31, 0.065],
      [0.21, 0.15],
      [0.18, 0.44],
      [0.26, 0.55],
      [0.29, 0.62],
    ].map(([r, y]) => new THREE.Vector2(r, y));
    mesh(
      new THREE.LatheGeometry(drumProfile, 20),
      timber,
      0,
      winchY + 0.09,
      winchZ,
    );
    for (let i = 0; i < 8; i++) {
      const a = (i * Math.PI) / 4,
        c = Math.cos(a),
        d = Math.sin(a);
      rod(
        [c * 0.27, winchY + 0.18, winchZ + d * 0.27],
        [c * 0.24, winchY + 0.62, winchZ + d * 0.24],
        0.025,
        iron,
      );
    }
    for (let i = 0; i < 4; i++) {
      const a = (i * Math.PI) / 2,
        c = Math.cos(a),
        d = Math.sin(a);
      rod(
        [c * 0.16, winchY + 0.66, winchZ + d * 0.16],
        [c * 0.92, winchY + 0.66, winchZ + d * 0.92],
        0.028,
        timber,
      );
    }
    for (let i = 0; i < 3; i++) {
      const wrap = mesh(
        new THREE.TorusGeometry(0.24, 0.018, 6, 28),
        rope,
        0,
        winchY + 0.27 + i * 0.045,
        winchZ,
      );
      wrap.rotation.x = Math.PI / 2;
    }
  } else {
    for (const x of [-0.66, 0.66])
      rounded(0.17, 0.43, 0.39, timber, x, winchY + 0.215, winchZ, 0.025);
    const roller = mesh(
      new THREE.CylinderGeometry(0.19, 0.19, 1.43, 20),
      timber,
      0,
      winchY + 0.41,
      winchZ,
    );
    roller.rotation.z = Math.PI / 2;
    for (const x of [-0.76, 0.76]) {
      const collar = mesh(
        new THREE.CylinderGeometry(0.24, 0.24, 0.064, 18),
        iron,
        x,
        winchY + 0.41,
        winchZ,
      );
      collar.rotation.z = Math.PI / 2;
      rod(
        [x, winchY + 0.41, winchZ],
        [x, winchY + 0.7, winchZ + 0.15],
        0.024,
        iron,
      );
    }
    for (let i = -2; i <= 2; i++) {
      const wrap = mesh(
        new THREE.TorusGeometry(0.202, 0.016, 6, 28),
        rope,
        i * 0.037,
        winchY + 0.41,
        winchZ,
      );
      wrap.rotation.y = Math.PI / 2;
    }
  }
  for (const side of [-1, 1]) {
    const endZ = -length * 0.43,
      endY = workingDeckY(endZ) + 0.07;
    const fairlead = mesh(
      new THREE.TorusGeometry(0.073, 0.02, 6, 16),
      iron,
      side * 0.31,
      endY,
      endZ,
    );
    fairlead.rotation.x = Math.PI / 2;
    rod(
      [side * 0.19, winchY + 0.28, winchZ],
      [side * 0.31, endY, endZ],
      0.021,
      rope,
    );
    cleat(
      side * beam * 0.3,
      workingDeckY(-length * 0.22) + 0.03,
      -length * 0.22,
    );
  }
  function mast(z, height) {
    rod([0, deckY, z], [0, height, z], 0.145, timber, staticGroup, 0.073);
    for (const y of [deckY + 0.3, height * 0.46, height * 0.74]) {
      const collar = mesh(
        new THREE.TorusGeometry(0.15, 0.021, 6, 12),
        iron,
        0,
        y,
        z,
      );
      collar.rotation.x = Math.PI / 2;
    }
    sphere(0, height + 0.014, z, 0.075, 0.035, 0.075, timber);
    mesh(
      new THREE.CylinderGeometry(0.23, 0.28, 0.13, 16),
      timber,
      0,
      deckY + 0.08,
      z,
    );
    for (const side of [-1, 1]) {
      rounded(
        0.8,
        0.065,
        0.16,
        timber,
        side * 0.68,
        deckY + 0.69,
        z + 0.47,
        0.022,
      );
      for (const end of [-0.29, 0.29])
        rod(
          [side * 0.68 + end, deckY + 0.1, z + 0.47],
          [side * 0.68 + end, deckY + 0.69, z + 0.47],
          0.028,
          timber,
        );
      for (let i = 0; i < 5; i++) {
        const x = side * 0.68 + (i - 2) * 0.13;
        rod(
          [x, deckY + 0.6, z + 0.47],
          [x, deckY + 0.83, z + 0.47],
          0.012,
          timber,
        );
        sphere(x, deckY + 0.83, z + 0.47, 0.018, 0.026, 0.018, timber);
      }
      rod(
        [0, height * 0.45, z + 0.07],
        [side * 0.68, deckY + 0.77, z + 0.47],
        0.012,
        rope,
      );
    }
    // Paired shrouds and sparse ratlines imply working rigging without a wire cage.
    for (const side of [-1, 1]) {
      const top = [side * 0.055, height * 0.79, z],
        a = [side * beam * 0.46, deckY + 0.35, z + 0.35],
        b = [side * beam * 0.43, deckY + 0.35, z + 1.35];
      for (const anchor of [a, b]) {
        const [x, y, az] = anchor;
        const deadeye = mesh(
          new THREE.CylinderGeometry(0.1, 0.1, 0.052, 14),
          timber,
          x,
          y,
          az,
        );
        deadeye.rotation.z = Math.PI / 2;
        const lower = mesh(
          new THREE.CylinderGeometry(0.088, 0.088, 0.052, 14),
          timber,
          x,
          y - 0.24,
          az,
        );
        lower.rotation.z = Math.PI / 2;
        rod([x, y - 0.31, az], [x * 0.985, deckY - 0.13, az], 0.019, iron);
        for (const d of [-0.049, 0, 0.049])
          rod(
            [x + side * 0.04, y - 0.035, az + d],
            [x + side * 0.04, y - 0.205, az + d * 0.9],
            0.01,
            rope,
          );
        for (const [oy, oz] of [
          [-0.035, -0.038],
          [-0.035, 0.038],
          [0.04, 0],
        ])
          sphere(
            x + side * 0.03,
            y + oy,
            az + oz,
            0.01,
            0.015,
            0.015,
            darkWood,
          );
      }
      rod(top, a, 0.016, rope);
      rod(top, b, 0.016, rope);
      for (let i = 1; i < 15; i++) {
        const t = i / 16;
        rod(
          top.map((v, k) => v + (a[k] - v) * t),
          top.map((v, k) => v + (b[k] - v) * t),
          0.01,
          rope,
        );
      }
    }
  }
  if (!galleon) {
    const foreZ = -3.45,
      mainZ = 0.35;
    mast(foreZ, mastHeight * 0.87);
    mast(mainZ, mastHeight);
    rod([0, mastHeight * 0.83, foreZ], bowEnd, 0.019, rope);
    rod(
      [0, mastHeight * 0.98, mainZ],
      [0, mastHeight * 0.83, foreZ],
      0.014,
      rope,
    );
    rod(
      [0, mastHeight * 0.98, mainZ],
      [0, quarterY + 0.65, length * 0.46],
      0.019,
      rope,
    );
    for (const [z, h, reach] of [
      [foreZ, mastHeight * 0.87, 3.0],
      [mainZ, mastHeight, 4.0],
    ]) {
      const bottom = 4.15;
      rod([0, bottom, z], [0, bottom, z + reach], 0.055, timber);
      rod([0, h * 0.85, z], [0, h * 0.96, z + reach * 0.79], 0.052, timber);
      sailQuad(
        [0, h * 0.84, z + 0.06],
        [0, h * 0.94, z + reach * 0.79],
        [0, bottom + 0.1, z + 0.06],
        [0, bottom + 0.1, z + reach * 0.96],
        0.92,
      );
      const upperSheet = [0, bottom - 0.2, z + reach * 0.95];
      const lowerSheet = [
        beam * 0.29,
        workingDeckY(z + reach * 0.84) + 0.2,
        z + reach * 0.84,
      ];
      workingBlock(upperSheet);
      workingBlock(lowerSheet, 0.85);
      rod([0, bottom, z + reach * 0.95], upperSheet, 0.017, rope);
      for (const shift of [-0.025, 0.025])
        rod(
          [upperSheet[0] + shift, upperSheet[1] - 0.09, upperSheet[2]],
          [lowerSheet[0] + shift, lowerSheet[1] + 0.08, lowerSheet[2]],
          0.011,
          rope,
        );
      cleat(
        lowerSheet[0],
        workingDeckY(lowerSheet[2]) + 0.035,
        lowerSheet[2] + 0.23,
      );
      rod(
        lowerSheet,
        [
          lowerSheet[0],
          workingDeckY(lowerSheet[2]) + 0.14,
          lowerSheet[2] + 0.23,
        ],
        0.012,
        rope,
      );
      rod([0, h * 0.98, z], [0, bottom, z + reach], 0.012, rope);
    }
    // High-clewed jib leaves the captain's low forward view open.
    sailQuad(
      [0, mastHeight * 0.81, foreZ],
      [-0.08, mastHeight * 0.81, foreZ],
      [-0.12, deckY + 1.08, -length * 0.64],
      [-0.12, 3.8, foreZ - 0.12],
      0.52,
    );
  } else {
    const fore = -4.6,
      main = -0.3,
      mizzen = 4.1;
    mast(fore, mastHeight * 0.89);
    mast(main, mastHeight);
    mast(mizzen, mastHeight * 0.74);
    rod([0, mastHeight * 0.87, fore], bowEnd, 0.021, rope);
    rod([0, mastHeight, main], [0, mastHeight * 0.88, fore], 0.018, rope);
    rod([0, mastHeight, main], [0, mastHeight * 0.71, mizzen], 0.018, rope);
    rod(
      [0, mastHeight * 0.72, mizzen],
      [0, quarterY + 0.64, length * 0.48],
      0.02,
      rope,
    );
    for (const [z, y, w, h] of [
      [main, 10.5, 8.5, 4.6],
      [main, 14.2, 6.2, 3.0],
      [fore, 9.8, 7.3, 4.0],
      [fore, 12.9, 5.2, 2.5],
    ]) {
      rod(
        [-w * 0.53, y, z],
        [w * 0.53, y, z],
        0.079,
        timber,
        staticGroup,
        0.065,
      );
      sailQuad(
        [-w * 0.49, y - 0.1, z],
        [w * 0.49, y - 0.1, z],
        [-w * 0.43, y - h, z + 0.05],
        [w * 0.43, y - h, z + 0.05],
        0.8,
        true,
      );
      for (const side of [-1, 1]) {
        const upper = [side * w * 0.47, y - 0.3, z + 0.1];
        const lower = [side * beam * 0.4, workingDeckY(z + 2) + 0.21, z + 2];
        workingBlock(upper, 0.9);
        workingBlock(lower, 0.8);
        rod([side * w * 0.52, y, z], upper, 0.017, rope);
        for (const shift of [-0.025, 0.025])
          rod(
            [upper[0] + shift, upper[1] - 0.07, upper[2]],
            [lower[0] + shift, lower[1] + 0.07, lower[2]],
            0.011,
            rope,
          );
        cleat(lower[0], workingDeckY(lower[2]) + 0.025, lower[2] + 0.18);
        rod(
          lower,
          [lower[0], workingDeckY(lower[2]) + 0.13, lower[2] + 0.18],
          0.012,
          rope,
        );
      }
    }
    rod([0, 11.15, 3.45], [0, 6.0, 7.3], 0.065, timber);
    sailQuad(
      [0, 11.05, 3.55],
      [0, 6.12, 7.2],
      [0, 6.08, 4.17],
      [0, 6.12, 7.2],
      0.6,
    );
    sailQuad(
      [0, mastHeight * 0.84, fore],
      [-0.08, mastHeight * 0.84, fore],
      [-0.1, deckY + 1.3, -length * 0.64],
      [-0.1, 4.5, fore - 0.2],
      0.6,
    );
    const nest = mesh(
      new THREE.CylinderGeometry(0.55, 0.42, 0.33, 12, 1, true),
      timber,
      0,
      11.0,
      main,
    );
    nest.material.side = THREE.DoubleSide;
    const nestRail = mesh(
      new THREE.TorusGeometry(0.55, 0.025, 6, 18),
      rope,
      0,
      11.2,
      main,
    );
    nestRail.rotation.x = Math.PI / 2;
  }
  // A restrained long pennant distinguishes the ship above the canvas.
  const flagMat = material(galleon ? '#873f33' : '#285e62', 0.91);
  flagMat.side = THREE.DoubleSide;
  const flagZ = galleon ? -0.3 : 0.35,
    flagY = mastHeight - 0.15;
  const flagGeo = new THREE.BufferGeometry();
  flagGeo.setAttribute(
    'position',
    new THREE.Float32BufferAttribute(
      [
        0,
        flagY,
        flagZ,
        0,
        flagY - 0.52,
        flagZ,
        -0.16,
        flagY - 0.36,
        flagZ + 1.4,
      ],
      3,
    ),
  );
  flagGeo.computeVertexNormals();
  mesh(flagGeo, flagMat);

  // Deck craft: rope coils, barrels, grated hatches and shielded brass lanterns.
  for (const [x, z] of [
    [-beam * 0.3, -length * 0.22],
    [beam * 0.28, -length * 0.2],
    [-beam * 0.3, length * 0.17],
  ]) {
    const y = deckY + 0.05;
    for (let i = 0; i < 3; i++) {
      const coil = mesh(
        new THREE.TorusGeometry(0.21 + i * 0.038, 0.019, 5, 24),
        rope,
        x,
        y + i * 0.02,
        z,
      );
      coil.rotation.x = Math.PI / 2;
    }
  }
  for (const [x, z] of [
    [-beam * 0.28, length * 0.1],
    [beam * 0.28, length * 0.11],
    [-beam * 0.25, -length * 0.12],
  ]) {
    mesh(
      new THREE.CylinderGeometry(0.27, 0.29, 0.67, 12),
      timber,
      x,
      deckY + 0.34,
      z,
    );
    for (const y of [deckY + 0.12, deckY + 0.54]) {
      const hoop = mesh(
        new THREE.TorusGeometry(0.29, 0.022, 5, 16),
        iron,
        x,
        y,
        z,
      );
      hoop.rotation.x = Math.PI / 2;
    }
    mesh(
      new THREE.CylinderGeometry(0.257, 0.257, 0.028, 12),
      deckWood,
      x,
      deckY + 0.69,
      z,
    );
  }
  for (const z of [-length * 0.15, length * 0.1]) {
    box(1.4, 0.055, 1.1, darkWood, 0, deckY + 0.055, z);
    for (let i = -3; i <= 3; i++)
      box(0.052, 0.07, 1.12, timber, i * 0.2, deckY + 0.1, z);
    for (let i = -2; i <= 2; i++)
      box(1.4, 0.045, 0.036, trim, 0, deckY + 0.14, z + i * 0.22);
  }
  for (const side of [-1, 1]) {
    const x = side * aftWidth * 0.39,
      z = aftEnd - 0.25;
    rod([x, quarterY + 0.2, z], [x, quarterY + 1.12, z], 0.034, iron);
    box(0.21, 0.29, 0.21, iron, x, quarterY + 1.04, z);
    box(0.15, 0.21, 0.15, lamp, x, quarterY + 1.04, z);
    mesh(
      new THREE.ConeGeometry(0.19, 0.16, 4),
      trim,
      x,
      quarterY + 1.26,
      z,
    ).rotation.y = Math.PI / 4;
  }

  function batch(parent) {
    const batches = new Map();
    for (const item of [...parent.children]) {
      if (!item.isMesh) continue;
      item.updateMatrix();
      const source = item.geometry.index
        ? own(item.geometry.toNonIndexed())
        : item.geometry;
      const geo = own(source.clone().applyMatrix4(item.matrix));
      const keep = ['position', 'normal'];
      if (
        item.material.map ||
        item.material.bumpMap ||
        item.material.roughnessMap ||
        item.material.normalMap
      )
        keep.push('uv');
      if (item.material.vertexColors) keep.push('color');
      for (const key of Object.keys(geo.attributes))
        if (!keep.includes(key)) geo.deleteAttribute(key);
      if (
        (item.material.map ||
          item.material.bumpMap ||
          item.material.roughnessMap ||
          item.material.normalMap) &&
        !geo.attributes.uv
      ) {
        const pos = geo.attributes.position,
          uv = [];
        for (let i = 0; i < pos.count; i++) uv.push(pos.getX(i), pos.getZ(i));
        geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
      }
      if (!batches.has(item.material)) batches.set(item.material, []);
      batches.get(item.material).push(geo);
      parent.remove(item);
    }
    for (const [mat, geometries] of batches)
      mesh(mergeGeometries(geometries), mat, 0, 0, 0, parent);
  }
  batch(staticGroup);
  const helm = createShipHelm({
    profile,
    helmX,
    helmZ,
    quarterY,
    own,
    materials,
  });
  group.add(helm.group);
  return {
    group,
    eye: helm.eye,
    target: helm.target,
    update: (dt, steer) => helm.update(dt, steer),
    setCameraMode: (mode) => helm.setCameraMode(mode),
    reset: () => helm.reset(),
    dispose() {
      if (disposed) return;
      disposed = true;
      group.removeFromParent();
      for (const resource of owned) resource.dispose();
      owned.clear();
      group.clear();
    },
  };
}
