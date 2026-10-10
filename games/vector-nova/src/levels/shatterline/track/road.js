import * as T from 'three';
import { sweepGeometry, boxProfile } from '../../../track/geometry.js';
import { framePoint } from '../../../track/frames.js';

export function roadIntervals(track) {
  const result = [];
  let start = -50;
  for (const jump of track.jumps) {
    result.push({ start, end: jump.takeoff });
    start = jump.landingStart;
  }
  result.push({ start, end: track.length });
  return result;
}

/** The first visible turn ahead, measured in the driver's current road frame. */
export function shatterlineTurnCue(track, distance, lookAhead = 240) {
  if (track.isGap(distance)) return null;
  const frame = track.sample(distance);
  for (let ahead = 24; ahead <= lookAhead; ahead += 12) {
    const targetDistance = distance + ahead;
    if (targetDistance >= track.finishDistance || track.isGap(targetDistance)) break;
    const target = track.sample(targetDistance);
    const yaw = Math.atan2(target.tangent.dot(frame.right), target.tangent.dot(frame.tangent));
    if (Math.abs(yaw) > 0.045)
      return { distance, turnDistance: targetDistance, direction: Math.sign(yaw), yaw };
  }
  return null;
}
function surfaceMaps() {
  const w = 1024,
    h = 512,
    albedo = new Uint8Array(w * h * 4),
    relief = new Uint8Array(w * h * 4),
    rough = new Uint8Array(w * h * 4);
  const hash = (x, y) => {
    let v = Math.imul(x + 811, 374761393) + Math.imul(y + 913, 668265263);
    v = Math.imul(v ^ (v >>> 13), 1274126177);
    return ((v ^ (v >>> 16)) >>> 0) / 4294967295;
  };
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const u = x / w,
        v = y / h,
        col = Math.floor(u * 5),
        row = Math.floor(v * 4),
        lx = (u * 5) % 1,
        ly = (v * 4) % 1;
      const edge = Math.min(lx, 1 - lx, ly, 1 - ly),
        seal = edge < 0.007 ? 0.36 : edge < 0.018 ? 0.81 : 1;
      const grain = hash(x, y),
        brushed = Math.sin(x * 0.41 + y * 0.009) * 1.2;
      const panel = hash(col, row) * 15,
        wear = Math.sin(lx * 9 + ly * 3) * 2;
      const stud =
        (Math.abs(lx - 0.035) < 0.008 || Math.abs(lx - 0.965) < 0.008) &&
        (Math.abs(ly - 0.065) < 0.013 || Math.abs(ly - 0.935) < 0.013);
      const stripe = (u > 0.08 && u < 0.087) || (u > 0.913 && u < 0.92);
      const scratch = grain > 0.997 ? 17 : 0;
      let base =
        (75 + panel + (grain - 0.5) * 7 + brushed + wear + scratch) * seal;
      let c = [base * 0.97, base, base * 1.06];
      if (stud) c = [120, 125, 130];
      if (stripe) c = [177, 152, 104].map((q) => q * (0.87 + grain * 0.13));
      const i = (y * w + x) * 4;
      albedo.set([...c.map((q) => Math.round(q)), 255], i);
      const b = seal < 1 ? 40 : 145 + grain * 6;
      relief.set([b, b, b, 255], i);
      const r = 160 + hash(col, row) * 25 + grain * 10;
      rough.set([r, r, r, 255], i);
    }
  return [albedo, relief, rough].map((data, i) => {
    const t = new T.DataTexture(data, w, h);
    t.wrapS = t.wrapT = T.RepeatWrapping;
    t.magFilter = T.LinearFilter;
    t.minFilter = T.LinearMipmapLinearFilter;
    t.generateMipmaps = true;
    t.anisotropy = 8;
    t.needsUpdate = true;
    if (i === 0) t.colorSpace = T.SRGBColorSpace;
    return t;
  });
}
export function createShatterlineRoad({
  track,
  shape = false,
  collectSolid = null,
}) {
  const halfWidth = track.width / 2;
  const group = new T.Group();
  group.name = 'Shatterline / reinforced induction raceway';
  const geometries = new Set(),
    materials = new Set();
  const textures = !shape && !collectSolid ? surfaceMaps() : [];
  const material = (name, options) => {
    const m = new T.MeshStandardMaterial({ name, ...options });
    materials.add(m);
    return m;
  };
  const graphite = material('Graphite induction cassettes', {
    color: shape ? '#8e979d' : '#f1efea',
    roughness: 0.76,
    metalness: 0.3,
    ...(textures.length
      ? {
          map: textures[0],
          bumpMap: textures[1],
          bumpScale: 0.045,
          roughnessMap: textures[2],
        }
      : {}),
  });
  const keel = material('Deep graphite structural spine', {
    color: '#252c32',
    roughness: 0.82,
    metalness: 0.52,
  });
  const ceramic = material('Weathered warm ceramic containment', {
    color: '#b6afa0',
    roughness: 0.78,
    metalness: 0.06,
  });
  const titanium = material('Machined titanium laminations', {
    color: '#687177',
    roughness: 0.43,
    metalness: 0.78,
  });
  const red = material('Oxide maintenance plates', {
    color: '#743e32',
    roughness: 0.82,
    metalness: 0.18,
  });
  const amber = material('Recessed amber guidance', {
    color: '#d8bd82',
    emissive: '#f5b856',
    emissiveIntensity: 0.65,
    roughness: 0.58,
  });
  const blue = material('Induction strip housing blue glass', {
    color: '#88b9d1',
    emissive: '#79b6e0',
    emissiveIntensity: 0.55,
    roughness: 0.4,
  });
  const mesh = (name, g, m, info) => {
    geometries.add(g);
    const o = new T.Mesh(g, m);
    o.name = name;
    o.userData.drivingSurface = info?.kind === 'deck';
    o.receiveShadow = true;
    o.castShadow = m !== graphite;
    group.add(o);
    if (collectSolid && info) collectSolid({ name, geometry: g, ...info });
    return o;
  };
  const intervals = roadIntervals(track);
  for (const [index, { start, end }] of intervals.entries()) {
    const route = { start: Math.max(0, start), end };
    mesh(
      `Deck ${index}`,
      sweepGeometry(
        track,
        [
          [-halfWidth, 0],
          [halfWidth, 0],
        ],
        { start, end, step: 3, uvScale: 32 },
      ),
      graphite,
      { kind: 'deck', ...route },
    );
    mesh(
      `Spine ${index}`,
      sweepGeometry(
        track,
        [
          [halfWidth, 0],
          [halfWidth + 2, -2],
          [halfWidth - 3, -6],
          [3 - halfWidth, -6],
          [-halfWidth - 2, -2],
          [-halfWidth, 0],
        ],
        { start, end, step: 6 },
      ),
      keel,
      { kind: 'structure', ...route },
    );
    for (const side of [-1, 1]) {
      mesh(
        `Containment ${side} ${index}`,
        sweepGeometry(track, boxProfile(side * (halfWidth + 0.8), 0.6, 1.6, 1.2), {
          start,
          end,
          step: 4,
        }),
        ceramic,
        { kind: 'rail', roadBoundary: true, ...route },
      );
      mesh(
        `Outboard lamination ${side} ${index}`,
        sweepGeometry(track, boxProfile(side * (halfWidth + 2.6), -1.6, 1.2, 1.2), {
          start,
          end,
          step: 6,
        }),
        titanium,
        { kind: 'structure', ...route },
      );
      mesh(
        `Underside tension spine ${side} ${index}`,
        sweepGeometry(track, boxProfile(side * (halfWidth - 7), -6.5, 1.5, 2), {
          start,
          end,
          step: 6,
        }),
        titanium,
        { kind: 'structure', ...route },
      );
    }
    // End faces are solid; open jump apertures have no invisible connecting road.
    for (const s of [start, end]) {
      const frame = track.sample(s),
        g = new T.PlaneGeometry(track.width, 6);
      const matrix = new T.Matrix4().compose(
        framePoint(frame, 0, -3),
        frame.quaternion,
        new T.Vector3(1, 1, 1),
      );
      g.applyMatrix4(matrix);
      const o = mesh(`Deck end ${index} ${s}`, g, keel, { kind: 'structure' });
      o.material.side = T.DoubleSide;
    }
  }
  const boxes = new Map();
  const addBox = (name, mat, s, x, y, w, h, d, solid = false) => {
    const key = `${name}|${mat.name}`;
    if (!boxes.has(key)) boxes.set(key, { name, mat, items: [] });
    const f = track.sample(s),
      matrix = new T.Matrix4().compose(
        framePoint(f, x, y),
        f.quaternion,
        new T.Vector3(w, h, d),
      );
    boxes.get(key).items.push({ matrix, s, solid });
  };
  for (const { start, end } of intervals) {
    for (let s = start + 6; s < end - 5; s += 12) {
      for (const side of [-1, 1]) {
        addBox(
          'Segmented ceramic shoulder',
          Math.floor(s / 12) % 13 === 0 ? red : ceramic,
          s,
          side * (halfWidth + 2.25),
          0.4,
          2.6,
          0.9,
          10.2,
        );
        addBox(
          'Shoulder open cooling slots',
          keel,
          s,
          side * (halfWidth + 2.3),
          0.91,
          1.65,
          0.08,
          3.8,
        );
        addBox(
          'Shoulder load clamp',
          titanium,
          s,
          side * (halfWidth + 1.2),
          1.05,
          3,
          0.35,
          1.2,
        );
      }
    }
    for (let s = start + 12; s < end - 6; s += 30) {
      for (const side of [-1, 1]) {
        addBox('Lane light', amber, s, side * (halfWidth - 0.25), 0.22, 0.22, 0.12, 7);
        addBox(
          'Recessed coil window',
          blue,
          s,
          side * (halfWidth + 3),
          -0.45,
          0.35,
          0.6,
          4.5,
        );
      }
      if (s < track.finishDistance - 50)
        addBox('Central guide dash', ceramic, s, 0, 0.035, 0.14, 0.018, 5);
    }
    for (let s = start + 22; s < end - 12; s += 55) {
      addBox(
        'Transverse load diaphragm',
        titanium,
        s,
        0,
        -5.8,
        track.width + 4,
        1.3,
        1.8,
        true,
      );
      for (const side of [-1, 1])
        addBox(
          'Recessed bearing capitals',
          keel,
          s,
          side * (halfWidth - 5),
          -8,
          4,
          4,
          5,
          true,
        );
    }
  }
  for (const jump of track.jumps) {
    for (const side of [-1, 1]) {
      // Upright landing beacons stand outside the actual road and air envelope.
      for (const [s, scale] of [
        [jump.takeoff - 8, 1],
        [jump.landingStart + 10, 1.35],
      ]) {
        addBox('Jump marker foot', keel, s, side * (halfWidth + 4), 1, 3, 2, 5, true);
        addBox(
          'Jump marker blade',
          ceramic,
          s,
          side * (halfWidth + 4),
          5 * scale,
          1.4,
          8 * scale,
          2,
          true,
        );
        addBox(
          'Jump marker inset',
          amber,
          s,
          side * (halfWidth + 3.95),
          5.3 * scale,
          1.6,
          5.5 * scale,
          0.3,
        );
      }
    }
    for (let i = 0; i < 4; i++) {
      const s = jump.takeoff - 14 - i * 16;
      for (const side of [-1, 1]) {
        for (let k = 0; k < 4; k++)
          addBox(
            'Launch fan markings',
            i % 2 ? ceramic : amber,
            s - k * 0.7,
            side * (0.25 + k * 0.1) * halfWidth,
            0.048,
            2.3,
            0.018,
            0.55,
          );
      }
    }
    for (let row = 0; row < 3; row++)
      for (let col = 0; col < 10; col++)
        if ((row + col) % 2 === 0)
          addBox(
            'Receiving deck checkers',
            ceramic,
            jump.landingStart + 8 + row * 3.5,
            -halfWidth + (col + 0.5) * track.width / 10,
            0.042,
            track.width / 10 - 0.4,
            0.018,
            3.2,
          );
  }
  // Mark the approaching bend rather than a later endpoint's world-X offset.
  // Geometric +right is driver-left; all cue geometry uses that same road frame.
  const turnPaint = [];
  const cueDistances = [];
  for (let i = 0; i < track.jumps.length - 1; i++) {
    for (const before of [125, 80, 35])
      cueDistances.push(track.jumps[i].landingEnd - before);
  }
  for (const variation of track.variations ?? [])
    for (let distance = variation.start + 30; distance < variation.end - 80; distance += 180)
      if (!cueDistances.some(candidate => Math.abs(candidate - distance) < 35)) cueDistances.push(distance);
  for (const distance of cueDistances) {
    const cue = shatterlineTurnCue(track, distance);
    if (!cue) continue;
    const outline = [
      [-6, -1.3],
      [1, -1.3],
      [1, -4.5],
      [6, 0],
      [1, 4.5],
      [1, 1.3],
      [-6, 1.3],
    ].map(([x, z]) => new T.Vector2(x * cue.direction, z));
    const faces = T.ShapeUtils.triangulateShape(outline, []);
    const frame = track.sample(distance);
    for (const face of faces) {
      const points = face.map((n) =>
        framePoint(frame, outline[n].x, 0.065, outline[n].y),
      );
      // Both turn directions retain the same upward-facing winding.
      const normal = points[1]
        .clone()
        .sub(points[0])
        .cross(points[2].clone().sub(points[0]));
      if (normal.dot(frame.up) < 0)
        [points[1], points[2]] = [points[2], points[1]];
      for (const point of points) turnPaint.push(...point.toArray());
    }
  }
  const turnGeometry = new T.BufferGeometry();
  turnGeometry.setAttribute(
    'position',
    new T.Float32BufferAttribute(turnPaint, 3),
  );
  turnGeometry.computeVertexNormals();
  mesh('Advance direction arrows', turnGeometry, amber);
  for (const distance of [0, track.finishDistance])
    for (let row = 0; row < 3; row++)
      for (let col = 0; col < 16; col++)
        if ((row + col) % 2 === 0)
          addBox(
            'Timing line',
            ceramic,
            distance + row * 2.4,
            -halfWidth + (col + 0.5) * track.width / 16,
            0.05,
            track.width / 16 - 0.1,
            0.025,
            2.3,
          );
  const box = new T.BoxGeometry(1, 1, 1);
  geometries.add(box);
  for (const { name, mat, items } of boxes.values()) {
    const o = new T.InstancedMesh(box, mat, items.length);
    o.name = name;
    o.castShadow = true;
    o.receiveShadow = true;
    items.forEach(({ matrix, s, solid }, i) => {
      o.setMatrixAt(i, matrix);
      if (collectSolid && solid)
        collectSolid({
          name: `${name}-${i}`,
          geometry: box,
          matrix,
          kind: 'structure',
          distance: s,
        });
    });
    o.computeBoundingSphere();
    group.add(o);
  }
  return {
    group,
    setReflection(texture) {
      for (const m of materials) {
        m.envMap = texture;
        m.envMapIntensity = 0.45;
        m.needsUpdate = true;
      }
    },
    dispose() {
      for (const g of geometries) g.dispose();
      for (const m of materials) m.dispose();
      for (const t of textures) t.dispose();
      group.clear();
    },
  };
}
