import * as T from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { finishShatterlineMaterial } from './materials.js';
import { shatterlineGroundHeight } from './terrain.js';
/** Connected excavation, process galleries and the three physical receiving beacons. */
export function createReceivingCampus(track) {
  const group = new T.Group();
  group.name = 'Shatterline / connected receiving campus';
  const materials = {
      graphite: new T.MeshStandardMaterial({
        color: '#343b3d',
        roughness: 0.72,
        metalness: 0.32,
      }),
      concrete: new T.MeshStandardMaterial({
        color: '#89897f',
        roughness: 0.88,
      }),
      cream: new T.MeshStandardMaterial({ color: '#c4beaa', roughness: 0.72 }),
      metal: new T.MeshStandardMaterial({
        color: '#626e72',
        roughness: 0.43,
        metalness: 0.68,
      }),
      amber: new T.MeshStandardMaterial({
        color: '#eac991',
        emissive: '#ffb957',
        emissiveIntensity: 0.65,
        roughness: 0.45,
      }),
      red: new T.MeshStandardMaterial({ color: '#874c34', roughness: 0.8 }),
    },
    parts = Object.fromEntries(Object.keys(materials).map((k) => [k, []]));
  for (const [key, material] of Object.entries(materials)) {
    material.name = `Shatterline / receiver ${key === 'cream' || key === 'concrete' ? 'ceramic' : key === 'metal' ? 'titanium' : key}`;
    finishShatterlineMaterial(material);
  }
  const source = new T.BoxGeometry(1, 1, 1),
    pipeSource = new T.CylinderGeometry(1, 1, 1, 10),
    identity = new T.Quaternion(),
    worldUp = new T.Vector3(0, 1, 0);
  function box(key, position, size, q = identity) {
    const g = source.clone();
    g.applyMatrix4(
      new T.Matrix4().compose(position, q, new T.Vector3(...size)),
    );
    parts[key].push(g);
  }
  function pipe(key, a, b, r) {
    const d = b.clone().sub(a),
      q = new T.Quaternion().setFromUnitVectors(worldUp, d.clone().normalize()),
      g = pipeSource.clone();
    g.applyMatrix4(
      new T.Matrix4().compose(
        a.clone().add(b).multiplyScalar(0.5),
        q,
        new T.Vector3(r, d.length(), r),
      ),
    );
    parts[key].push(g);
  }
  const at = (z) => track.sample(track.distanceAt(z)).position;
  const point = (z, x, y) => at(z).add(new T.Vector3(x, y, 0));
  // Long infrastructure follows the same downhill axis as the race. Short
  // terraces carry plumb buildings while every connecting spine keeps falling.
  function graded(key, z0, z1, x, y, width, height) {
    const a = point(z0, x, y),
      b = point(z1, x, y),
      t = b.clone().sub(a),
      length = t.length();
    t.normalize();
    const right = new T.Vector3(1, 0, 0).addScaledVector(t, -t.x).normalize(),
      up = t.clone().cross(right);
    const q = new T.Quaternion().setFromRotationMatrix(
      new T.Matrix4().makeBasis(right, up, t),
    );
    box(key, a.add(b).multiplyScalar(0.5), [width, height, length + 0.7], q);
  }
  for (const side of [-1, 1]) {
    for (let z = 9540; z < 11050; z += 100) {
      const end = Math.min(z + 100, 11050);
      graded('concrete', z, end, side * 250, -83, 410, 26);
      graded('graphite', z, end, side * 250, -68, side > 0 ? 356 : 328, 4);
      graded('cream', z, end, side * 454, -58, 14, 22);
      graded('concrete', z, end, side * 525, -112, 130, 38);
      graded('concrete', z, end, side * 623, -150, 100, 32);
      for (const offset of [132, 148])
        graded('metal', z, end, side * offset, -39, 5, 7);
      // Articulated retaining courses and deep drainage joints keep the long
      // graded platform from reading as a single unbroken presentation tray.
      graded('graphite', z + 5, end - 5, side * 455, -69, 17, 5);
      graded('cream', z + 5, end - 5, side * 459, -82, 7, 10);
      for (const x of [202, 300, 398]) {
        graded('concrete', z + 9, end - 9, side * x, -65.8, 74, 0.9);
        graded('metal', z + 11, end - 11, side * (x + 35), -64.9, 2.2, 0.8);
      }
      box('graphite', point(z + 6, side * 300, -64.9), [276, 0.8, 3.5]);
    }
    // The receiver is downstream of the folded mountain axis. Its real basin
    // sits below the graded courts, so plinths connect those courts to bedrock.
    for (let z = 9580; z < 11050; z += 160) {
      for (const offset of [156, 288, 420]) {
        const p = point(z, side * offset, -98);
        const floor = shatterlineGroundHeight(track, p.x, p.z) - 9;
        const height = p.y - floor;
        if (height < 12) continue;
        box('concrete', p.clone().setY(floor + 6), [47, 13, 49]);
        box('concrete', p.clone().setY(floor + height / 2), [28, height, 34]);
        box(
          'graphite',
          p
            .clone()
            .setY(floor + height / 2)
            .add(new T.Vector3(side * 15, 0, 0)),
          [3, height - 12, 26],
        );
        box('cream', p.clone().add(new T.Vector3(0, -4, 0)), [44, 11, 44]);
      }
    }
    // Unequal process pads ground the hierarchy of the receiving installation.
    const pads =
      side > 0
        ? [
            [10250, 285, 340, 430, -20],
            [9810, 245, 184, 177, -48],
            [10600, 205, 170, 160, -45],
          ]
        : [
            [9910, -235, 164, 236, -41],
            [10330, -325, 136, 188, -41],
            [10480, -172, 160, 158, -43],
            [10770, -240, 250, 154, -70],
          ];
    for (const [z, x, width, depth, top] of pads) {
      box('concrete', point(z, x, top - 34), [width, 68, depth]);
      box('graphite', point(z, x, top - 1), [width - 6, 4, depth - 2]);
      for (let dz = -depth * 0.4; dz < depth * 0.45; dz += 44)
        box(
          'cream',
          point(z, x + side * (width / 2 + 4), top - 22).add(
            new T.Vector3(0, 0, dz),
          ),
          [10, 46, 7],
        );
      for (const edge of [-1, 1])
        box(
          'metal',
          point(z, x, top + 2).add(new T.Vector3(edge * (width / 2 - 4), 0, 0)),
          [3, 3, depth - 3],
        );
      for (const edge of [-1, 1]) {
        const face = point(z, x, top - 32).add(
          new T.Vector3(0, 0, edge * (depth / 2 + 0.8)),
        );
        box('graphite', face, [width - 13, 43, 2]);
        for (let xx = -width / 2 + 22; xx < width / 2 - 12; xx += 41) {
          const panel = face.clone().add(new T.Vector3(xx, 0, edge * 2));
          box('cream', panel, [34, 33, 3]);
          box(
            'metal',
            panel.clone().add(new T.Vector3(0, -13, edge * 2)),
            [27, 3, 2],
          );
        }
        box('metal', face.clone().add(new T.Vector3(0, 24, edge * 2)), [
          width - 8,
          3,
          5,
        ]);
      }
    }
    // Large court panels, trench lids and service markings break the blank trays
    // at construction scale. Every piece follows the descending utility grade.
    for (let z = 9580; z < 11020; z += 52) {
      for (const x of side > 0 ? [177, 368, 420] : [-181, -356, -412])
        graded('concrete', z, z + 47, x, -65.65, 40, 0.7);
      graded('cream', z, z + 36, side * 115, -64.9, 1.2, 0.35);
      graded('metal', z, z + 43, side * 162, -64.7, 7, 1.1);
    }
    for (const z of side > 0
      ? [9780, 9960, 10220, 10570]
      : [9860, 10320, 10720]) {
      box('metal', point(z, side * 234, -27), [194, 8, 8]);
      box('metal', point(z + 17, side * 232, -28), [190, 6, 6]);
      for (const x of [145, 237, 326])
        box('cream', point(z, side * x, -44), [9, 34, 24]);
      box('red', point(z, side * 335, -29), [5, 8, 17]);
    }
    for (const z of [9700, 9900, 10120, 10340, 10560, 10780]) {
      graded('concrete', z - 45, z + 45, side * 92, -69, 140, 24);
      graded('metal', z - 42, z + 42, side * 93, -55, 142, 4);
      box('cream', point(z, side * 93, -51), [142, 3, 3]);
      box('graphite', point(z, side * 425, -56), [42, 22, 49]);
      for (let i = 0; i < 4; i++)
        box('metal', point(z - 15 + i * 10, side * 425, -43), [43, 2, 4]);
    }
    for (let z = 9650; z < 10950; z += 70) {
      box('cream', point(z, side * 143, -42), [41, 9, 8]);
      box('red', point(z, side * 450, -43), [16, 5, 18]);
    }
    for (let z = 9780; z < 10900; z += 90)
      box('cream', point(z, side * 353, -64), [45, 0.6, 4]);
    for (const z of [9810, 10020, 10240, 10460, 10680]) {
      box('concrete', point(z, side * 388, -57), [43, 20, 42]);
      box('metal', point(z, side * 388, -44), [39, 6, 39]);
      box('cream', point(z, side * 388, -38), [33, 7, 33]);
    }
    // Unequal transformer yards sit on real pads and connect into the utility
    // trunk. Large dark housings, ceramic insulators and copper bus bars retain
    // readable construction from the long airborne approach.
    const yards =
      side > 0
        ? [
            [9615, 276, 3],
            [10100, 407, 2],
            [10870, 284, 2],
          ]
        : [
            [9635, -280, 2],
            [10520, -405, 3],
            [10915, -261, 2],
          ];
    for (const [z, x, count] of yards) {
      box('concrete', point(z, x, -58), [count * 32 + 16, 13, 64]);
      box('graphite', point(z, x, -50), [count * 32 + 9, 4, 57]);
      for (let i = 0; i < count; i++) {
        const xx = x + (i - (count - 1) / 2) * 32,
          p = point(z, xx, -36);
        box('graphite', p, [25, 28, 39]);
        box('cream', p.clone().add(new T.Vector3(0, 15, 0)), [29, 4, 43]);
        for (const edge of [-1, 1])
          for (let dz = -14; dz < 15; dz += 7)
            box(
              'metal',
              p.clone().add(new T.Vector3(edge * 13.7, 0, dz)),
              [3, 21, 3],
            );
        for (const dz of [-10, 10]) {
          const a = p.clone().add(new T.Vector3(0, 17, dz)),
            b = a.clone().add(new T.Vector3(0, 15, 0));
          pipe('metal', a, b, 2.1);
          for (const h of [3, 7, 11])
            pipe(
              'cream',
              a.clone().add(new T.Vector3(0, h, 0)),
              a.clone().add(new T.Vector3(0, h + 1.7, 0)),
              4.7,
            );
        }
        box('red', p.clone().add(new T.Vector3(0, -4, -20.5)), [15, 9, 2]);
      }
      for (const dz of [-10, 10])
        pipe(
          'metal',
          point(z + dz, x - (count - 1) * 16, -3),
          point(z + dz, x + (count - 1) * 16, -3),
          1.8,
        );
      const a = point(z + 24, x, -37),
        b = point(z + 24, side * 162, -37);
      pipe('metal', a, b, 3.6);
      box('cream', point(z + 24, side * 162, -49), [12, 24, 15]);
    }
  }
  // Receiving edges are linked across the underside of each real landing shelf.
  for (const jump of track.jumps.filter((j) => j.hero)) {
    const f = track.sample(jump.landingStart + 18),
      q = f.quaternion;
    box(
      'graphite',
      f.position.clone().addScaledVector(f.up, -7),
      [98, 10, 24],
      q,
    );
    for (const side of [-1, 1]) {
      const p = f.position.clone().addScaledVector(f.right, side * 42);
      box('cream', p.clone().addScaledVector(f.up, 13), [6, 36, 7], q);
      box(
        'graphite',
        p.clone().addScaledVector(f.up, 14).addScaledVector(f.tangent, -4),
        [3.7, 25, 1.7],
        q,
      );
      box(
        'amber',
        p.clone().addScaledVector(f.up, 22).addScaledVector(f.tangent, -5),
        [2.3, 9, 1.3],
        q,
      );
      box('metal', p.clone().addScaledVector(f.up, 32), [12, 3, 10], q);
      box('amber', p.clone().addScaledVector(f.up, 34), [8, 1.3, 7], q);
    }
  }
  for (const [key, list] of Object.entries(parts)) {
    if (!list.length) continue;
    const geometry = mergeGeometries(list, false);
    list.forEach((g) => g.dispose());
    const mesh = new T.Mesh(geometry, materials[key]);
    mesh.name = `Shatterline / receiving ${key} utility infrastructure`;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
  }
  source.dispose();
  pipeSource.dispose();
  return group;
}
export function createReceivingCampusTriangles(track) {
  const group = createReceivingCampus(track),
    triangles = [];
  const materials = new Set();
  group.traverse((o) => {
    if (!o.isMesh) return;
    const p = o.geometry.attributes.position,
      ix = o.geometry.index?.array ?? [];
    for (let i = 0; i < ix.length; i += 3)
      triangles.push({
        id: `${o.name.replaceAll(' ', '-')}-${Math.floor((p.getZ(ix[i]) + p.getZ(ix[i + 1]) + p.getZ(ix[i + 2])) / 600)}`,
        kind: 'structure',
        points: [ix[i], ix[i + 1], ix[i + 2]].map((n) => [
          p.getX(n),
          p.getY(n),
          p.getZ(n),
        ]),
      });
    o.geometry.dispose();
    materials.add(o.material);
  });
  materials.forEach((m) => m.dispose());
  group.clear();
  return triangles;
}
