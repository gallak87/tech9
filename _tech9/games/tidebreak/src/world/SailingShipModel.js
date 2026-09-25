import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

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
  const captain = new THREE.Group();
  captain.name = 'Captain head and torso';
  const arms = new THREE.Group();
  const wheelMount = new THREE.Group();
  const wheel = new THREE.Group();
  wheel.name = 'Wooden ship wheel';
  const grips = new THREE.Group();
  grips.name = 'Captain sliding grips';
  group.add(staticGroup, captain, arms, wheelMount);
  wheelMount.add(wheel, grips);
  wheelMount.position.set(helmX, quarterY + 1.03, helmZ);
  wheelMount.rotation.x = -0.1;
  const owned = new Set();
  const armLinks = [];
  let disposed = false;
  let wheelAngle = 0;
  const up = new THREE.Vector3(0, 1, 0);
  const delta = new THREE.Vector3();
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
      new THREE.CylinderGeometry(r2, r, d.length(), 8),
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
  function texture(cloth = false) {
    const w = 128,
      h = 256,
      data = new Uint8Array(w * h * 4);
    let seed = 93;
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
        const noise = seed / 4294967296;
        const grain = cloth
          ? x % 3 === 0 || y % 3 === 0
            ? -4
            : 1
          : Math.sin(x * 1.7 + Math.sin(y * 0.026) * 1.7) * 7;
        const seam = cloth ? (x < 2 ? 14 : 0) : x < 3 ? 40 : 0;
        const shade = Math.round(237 + grain + noise * 12 - seam);
        const i = (y * w + x) * 4;
        data[i] = data[i + 1] = data[i + 2] = shade;
        data[i + 3] = 255;
      }
    const map = own(new THREE.DataTexture(data, w, h));
    map.colorSpace = THREE.SRGBColorSpace;
    map.wrapS = map.wrapT = THREE.RepeatWrapping;
    map.magFilter = THREE.LinearFilter;
    map.minFilter = THREE.LinearMipmapLinearFilter;
    map.generateMipmaps = true;
    map.anisotropy = 4;
    map.needsUpdate = true;
    return map;
  }
  const grain = texture();
  const hullWood = material(galleon ? '#674331' : '#786044', 0.81);
  hullWood.map = grain;
  const deckWood = material('#b29468', 0.87);
  deckWood.map = grain;
  const timber = material('#715035', 0.71);
  timber.map = grain;
  const darkWood = material('#392e24', 0.87);
  const wheelWood = material('#91653a', 0.55);
  const trim = material(galleon ? '#b39960' : '#bdaf87', 0.65, 0.16);
  const paint = material(galleon ? '#243b37' : '#294f4b', 0.8);
  const iron = material('#333b39', 0.77, 0.15);
  const rope = material('#6c6250', 0.95);
  const canvas = material(galleon ? '#ddd3b9' : '#e7ddc5', 0.96);
  canvas.side = THREE.DoubleSide;
  canvas.map = texture(true);
  canvas.vertexColors = true;
  const glass = material('#38575a', 0.41, 0.1);
  const lamp = material('#e6c384', 0.6);
  lamp.emissive.set('#ba7433');
  lamp.emissiveIntensity = 0.25;
  const skin = material('#b28e6b', 0.9),
    shirt = material('#bfc5b7', 0.95),
    coat = material('#2d4548', 0.91),
    hair = material('#3c3430', 0.95);

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
  const outline = [];
  for (const [z, w] of stations) outline.push([w * beam, z * length]);
  for (const [z, w] of [...stations].reverse())
    outline.push([-w * beam, z * length]);
  const sheer = (z) => Math.pow(Math.abs(z / (length * 0.5)), 3) * 0.34;
  function hullBand(low, high, loScale, hiScale, mat) {
    const positions = [],
      uvs = [];
    for (let i = 0; i < outline.length; i++) {
      const a = outline[i],
        b = outline[(i + 1) % outline.length];
      const point = (p, scale, y) => [
        p[0] * scale,
        y + sheer(p[1]),
        p[1] * (0.87 + scale * 0.13),
      ];
      const aa = point(a, loScale, low),
        ab = point(a, hiScale, high),
        ba = point(b, loScale, low),
        bb = point(b, hiScale, high);
      for (const p of [aa, ab, ba, ab, bb, ba]) {
        positions.push(...p);
        uvs.push(p[1] * 4.0, p[2] * 0.32);
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute(
      'position',
      new THREE.Float32BufferAttribute(positions, 3),
    );
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geo.computeVertexNormals();
    mesh(geo, mat);
  }
  hullBand(-0.92, 0.08, 0.48, 0.88, darkWood);
  hullBand(0.08, deckY, 0.88, 1, hullWood);
  hullBand(deckY - 0.17, deckY - 0.045, 0.993, 1.002, paint);
  hullBand(deckY - 0.03, deckY + 0.07, 1.003, 1.006, trim);
  hullBand(0.17, 0.22, 0.895, 0.907, trim);
  function deck(points, y, mat = deckWood) {
    const shape = new THREE.Shape(
      points.map(([x, z]) => new THREE.Vector2(x, -z)),
    );
    const geo = new THREE.ShapeGeometry(shape);
    geo.rotateX(-Math.PI / 2);
    const pos = geo.attributes.position,
      uv = geo.attributes.uv;
    for (let i = 0; i < pos.count; i++)
      uv.setXY(i, pos.getX(i) * 4.8, pos.getZ(i) * 0.48);
    mesh(geo, mat, 0, y, 0);
  }
  deck(outline, deckY + 0.02);
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
  rounded(
    aftWidth,
    quarterY - deckY,
    aftEnd - aftStart,
    hullWood,
    0,
    (quarterY + deckY) / 2,
    (aftStart + aftEnd) / 2,
    0.04,
  );
  deck(
    [
      [-aftWidth / 2, aftStart],
      [aftWidth / 2, aftStart],
      [aftWidth * 0.43, aftEnd],
      [-aftWidth * 0.43, aftEnd],
    ],
    quarterY + 0.015,
  );
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
    for (let i = -2; i <= 2; i++) {
      rounded(
        0.45,
        0.64,
        0.07,
        trim,
        i * 0.57,
        quarterY - 0.56,
        aftEnd + 0.025,
        0.02,
      );
      box(0.34, 0.5, 0.083, glass, i * 0.57, quarterY - 0.56, aftEnd + 0.05);
      box(0.024, 0.52, 0.09, trim, i * 0.57, quarterY - 0.56, aftEnd + 0.06);
      box(0.35, 0.023, 0.09, trim, i * 0.57, quarterY - 0.55, aftEnd + 0.06);
    }
    // Closed gunport shutters and wale bands are architectural details only.
    for (const side of [-1, 1])
      for (let i = 0; i < 5; i++) {
        const z = -4.9 + i * 2.0,
          x = side * beam * (0.42 + 0.055 * Math.sin((i / 4) * Math.PI));
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

  function sailQuad(
    topLeft,
    topRight,
    bottomLeft,
    bottomRight,
    billow = 0.55,
    square = false,
  ) {
    const positions = [],
      uvs = [],
      colors = [],
      indices = [],
      nx = 18,
      ny = 12;
    const tl = new THREE.Vector3(...topLeft),
      tr = new THREE.Vector3(...topRight),
      bl = new THREE.Vector3(...bottomLeft),
      br = new THREE.Vector3(...bottomRight);
    for (let y = 0; y <= ny; y++)
      for (let x = 0; x <= nx; x++) {
        const u = x / nx,
          v = y / ny;
        const p = tl.clone().lerp(tr, u).lerp(bl.clone().lerp(br, u), v);
        const puff = Math.sin(u * Math.PI) * Math.sin(v * Math.PI);
        if (square) {
          p.z += puff * billow;
          p.y -= Math.sin(u * Math.PI) * v * 0.19;
        } else p.x -= puff * billow;
        positions.push(...p);
        uvs.push(u * 6, v * 1.4);
        const tone =
          0.9 + Math.sin(u * Math.PI) * 0.07 - Math.pow(v, 5) * 0.035;
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
    for (const [a, b] of [
      [topLeft, topRight],
      [topLeft, bottomLeft],
      [topRight, bottomRight],
      [bottomLeft, bottomRight],
    ])
      rod(a, b, 0.014, rope);
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
    // Paired shrouds and sparse ratlines imply working rigging without a wire cage.
    for (const side of [-1, 1]) {
      const top = [side * 0.055, height * 0.79, z],
        a = [side * beam * 0.46, deckY + 0.35, z + 0.35],
        b = [side * beam * 0.43, deckY + 0.35, z + 1.35];
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
      for (const side of [-1, 1])
        rod(
          [side * w * 0.52, y, z],
          [side * beam * 0.42, deckY + 0.2, z + 2.0],
          0.014,
          rope,
        );
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

  // Full-size eight-spoke wooden wheel with projecting turned handles.
  rounded(0.54, 0.82, 0.43, timber, helmX, quarterY + 0.43, helmZ - 0.18, 0.04);
  rod(
    [helmX, quarterY + 1.03, helmZ - 0.38],
    [helmX, quarterY + 1.03, helmZ],
    0.1,
    trim,
  );
  mesh(new THREE.TorusGeometry(0.51, 0.044, 9, 48), wheelWood, 0, 0, 0, wheel);
  mesh(new THREE.TorusGeometry(0.514, 0.01, 5, 40), trim, 0, 0, 0.035, wheel);
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2,
      c = Math.cos(a),
      s = Math.sin(a);
    rod(
      [c * 0.13, s * 0.13, 0],
      [c * 0.69, s * 0.69, 0],
      0.024,
      wheelWood,
      wheel,
    );
    sphere(c * 0.675, s * 0.675, 0, 0.036, 0.036, 0.036, wheelWood, wheel);
    rod(
      [c * 0.5, s * 0.5, -0.026],
      [c * 0.5, s * 0.5, 0.027],
      0.035,
      trim,
      wheel,
    );
  }
  const hub = mesh(
    new THREE.CylinderGeometry(0.146, 0.146, 0.1, 20),
    wheelWood,
    0,
    0,
    0.014,
    wheel,
  );
  hub.rotation.x = Math.PI / 2;
  mesh(new THREE.TorusGeometry(0.11, 0.012, 6, 24), trim, 0, 0, 0.071, wheel);
  const pin = mesh(
    new THREE.CylinderGeometry(0.037, 0.037, 0.025, 12),
    trim,
    0,
    0,
    0.077,
    wheel,
  );
  pin.rotation.x = Math.PI / 2;
  // Simple gimballed compass, deliberately mechanical rather than a dashboard.
  mesh(
    new THREE.CylinderGeometry(0.18, 0.23, 0.32, 12),
    trim,
    helmX - 0.68,
    quarterY + 0.84,
    helmZ - 0.25,
  );
  const compass = mesh(
    new THREE.CircleGeometry(0.145, 24),
    glass,
    helmX - 0.68,
    quarterY + 1.012,
    helmZ - 0.25,
  );
  compass.rotation.x = -Math.PI / 2;
  rod(
    [helmX - 0.74, quarterY + 1.017, helmZ - 0.25],
    [helmX - 0.62, quarterY + 1.017, helmZ - 0.25],
    0.008,
    trim,
  );

  // Standing captain: body hidden only from its own view, hands retained in both.
  sphere(helmX, quarterY + 1.12, helmZ + 0.72, 0.23, 0.34, 0.17, coat, captain);
  sphere(helmX, quarterY + 1.4, helmZ + 0.71, 0.25, 0.1, 0.17, shirt, captain);
  rod(
    [helmX, quarterY + 1.38, helmZ + 0.72],
    [helmX, quarterY + 1.56, helmZ + 0.72],
    0.07,
    skin,
    captain,
  );
  sphere(
    helmX,
    quarterY + 1.68,
    helmZ + 0.68,
    0.128,
    0.163,
    0.139,
    skin,
    captain,
  );
  sphere(
    helmX,
    quarterY + 1.8,
    helmZ + 0.71,
    0.142,
    0.074,
    0.146,
    hair,
    captain,
  );
  for (const sign of [-1, 1]) {
    rod(
      [helmX + sign * 0.105, quarterY + 0.9, helmZ + 0.72],
      [helmX + sign * 0.13, quarterY + 0.1, helmZ + 0.78],
      0.088,
      coat,
      captain,
    );
    rounded(
      0.18,
      0.13,
      0.33,
      darkWood,
      helmX + sign * 0.13,
      quarterY + 0.07,
      helmZ + 0.69,
      0.04,
      captain,
    );
    const a = sign < 0 ? (Math.PI * 5) / 6 : Math.PI / 6;
    const gx = Math.cos(a) * 0.51,
      gy = Math.sin(a) * 0.51;
    const palm = sphere(gx, gy, 0.05, 0.041, 0.054, 0.031, skin, grips);
    palm.rotation.z = a - Math.PI / 2;
    sphere(gx, gy - 0.041, 0.058, 0.032, 0.041, 0.026, skin, grips);
    for (let finger = 0; finger < 4; finger++) {
      const offset = (finger - 1.5) * 0.022;
      const curve = new THREE.CatmullRomCurve3(
        [
          [0.044, 0.045],
          [0.024, 0.07],
          [-0.031, 0.065],
          [-0.049, 0.016],
          [-0.022, -0.044],
        ].map(
          ([r, z]) =>
            new THREE.Vector3(
              gx + Math.cos(a) * r - Math.sin(a) * offset,
              gy + Math.sin(a) * r + Math.cos(a) * offset,
              z,
            ),
        ),
      );
      mesh(
        new THREE.TubeGeometry(curve, 8, 0.01, 5, false),
        skin,
        0,
        0,
        0,
        grips,
      );
    }
    sphere(
      gx - sign * 0.029,
      gy - 0.022,
      0.064,
      0.019,
      0.032,
      0.025,
      skin,
      grips,
    );
    const upper = mesh(
      new THREE.CylinderGeometry(0.048, 0.047, 1, 10),
      shirt,
      0,
      0,
      0,
      arms,
    );
    const lower = mesh(
      new THREE.CylinderGeometry(0.029, 0.038, 1, 10),
      skin,
      0,
      0,
      0,
      arms,
    );
    const elbow = sphere(0, 0, 0, 0.049, 0.05, 0.047, shirt, arms);
    armLinks.push({
      sign,
      upper,
      lower,
      elbow,
      grip: new THREE.Vector3(gx, gy - 0.075, 0.06),
      shoulder: new THREE.Vector3(
        helmX + sign * 0.23,
        quarterY + 1.39,
        helmZ + 0.65,
      ),
      hand: new THREE.Vector3(),
      bend: new THREE.Vector3(),
    });
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
      if (item.material.map) keep.push('uv');
      if (item.material.vertexColors) keep.push('color');
      for (const key of Object.keys(geo.attributes))
        if (!keep.includes(key)) geo.deleteAttribute(key);
      if (item.material.map && !geo.attributes.uv) {
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
  batch(wheel);
  batch(grips);
  batch(captain);
  function fit(item, a, b) {
    delta.copy(b).sub(a);
    item.position.copy(a).add(b).multiplyScalar(0.5);
    item.scale.y = delta.length();
    item.quaternion.setFromUnitVectors(up, delta.normalize());
  }
  function update(dt, steer) {
    wheelAngle += (steer * 2.05 - wheelAngle) * (1 - Math.exp(-dt * 8));
    wheel.rotation.z = -wheelAngle;
    grips.rotation.z = -Math.tanh(wheelAngle * 0.6) * 0.22;
    grips.updateMatrix();
    wheelMount.updateMatrix();
    for (const arm of armLinks) {
      arm.hand
        .copy(arm.grip)
        .applyMatrix4(grips.matrix)
        .applyMatrix4(wheelMount.matrix);
      arm.bend.copy(arm.shoulder).lerp(arm.hand, 0.5);
      arm.bend.x += arm.sign * 0.09;
      arm.bend.y = quarterY + 1.02;
      arm.bend.z += 0.09;
      fit(arm.upper, arm.shoulder, arm.bend);
      fit(arm.lower, arm.bend, arm.hand);
      arm.elbow.position.copy(arm.bend);
    }
    return wheelAngle;
  }
  update(0, 0);
  return {
    group,
    eye: new THREE.Vector3(helmX, quarterY + 1.76, helmZ + 1.23),
    target: new THREE.Vector3(helmX, quarterY - 0.2, helmZ - 7.8),
    update,
    setCameraMode(mode) {
      captain.visible = mode !== 'captain';
    },
    reset() {
      wheelAngle = 0;
      update(0, 0);
    },
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
