import * as T from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { shatterlineGroundHeight } from './terrain.js';
import { shatterlineRouteSpace } from './route-space.js';

/** Open accelerator frames and outboard loads keep the rolling ribbon exposed. */
export function createShatterlineDescentInfrastructure(
  track,
  { collision = false } = {},
) {
  const group = new T.Group();
  group.name = 'Shatterline / plunge district infrastructure';
  const materials = {
    ceramic: new T.MeshStandardMaterial({
      name: 'Shatterline / descent ceramic',
      color: '#b7ac91',
      roughness: 0.72,
    }),
    metal: new T.MeshStandardMaterial({
      name: 'Shatterline / descent titanium',
      color: '#58636a',
      roughness: 0.43,
      metalness: 0.64,
    }),
    graphite: new T.MeshStandardMaterial({
      name: 'Shatterline / descent graphite',
      color: '#263239',
      roughness: 0.67,
      metalness: 0.3,
    }),
    edge: new T.MeshStandardMaterial({
      name: 'Shatterline / ivory cassette edges',
      color: '#d0c8b3',
      roughness: 0.58,
      metalness: 0.12,
    }),
    coil: new T.MeshStandardMaterial({
      name: 'Shatterline / titanium heat-stained coils',
      color: '#86654b',
      roughness: 0.48,
      metalness: 0.73,
    }),
    oxide: new T.MeshStandardMaterial({
      name: 'Shatterline / ceramic service plates',
      color: '#85432e',
      roughness: 0.71,
      metalness: 0.18,
    }),
    signal: new T.MeshStandardMaterial({
      name: 'Shatterline / descent induction markers',
      color: '#71bdcf',
      emissive: '#4c9dad',
      emissiveIntensity: 0.58,
      roughness: 0.5,
    }),
  };
  const boxSource = new T.BoxGeometry(1, 1, 1),
    beamSource = new T.CylinderGeometry(1, 1, 1, 8),
    worldUp = new T.Vector3(0, 1, 0),
    identity = new T.Quaternion();
  const routeSpace = shatterlineRouteSpace(track);
  for (const section of [
    ...(track.descents ?? []),
    ...(track.variations ?? []),
  ]) {
    const parts = Object.fromEntries(
      Object.keys(materials).map((k) => [k, []]),
    );
    const box = (key, p, size, q = identity) => {
      if (collision && ['coil', 'edge', 'oxide'].includes(key)) return;
      const g = boxSource.clone();
      g.applyMatrix4(new T.Matrix4().compose(p, q, new T.Vector3(...size)));
      parts[key].push(g);
    };
    const beam = (key, a, b, r) => {
      const d = b.clone().sub(a),
        q = new T.Quaternion().setFromUnitVectors(
          worldUp,
          d.clone().normalize(),
        ),
        g = beamSource.clone();
      g.applyMatrix4(
        new T.Matrix4().compose(
          a.clone().add(b).multiplyScalar(0.5),
          q,
          new T.Vector3(r, d.length(), r),
        ),
      );
      parts[key].push(g);
    };
    const step =
      section.kind === 'corkscrew'
        ? 220
        : section.kind === 'inversion'
          ? 260
          : 180;
    for (let s = section.start + 85; s < section.end - 55; s += step) {
      if (track.tubes.some((tube) => s > tube.start - 40 && s < tube.end + 40))
        continue;
      if (
        track.jumps.some((j) => s > j.takeoff - 85 && s < j.landingStart + 85)
      )
        continue;
      const f = track.sample(s),
        right = new T.Vector3().crossVectors(worldUp, f.tangent).normalize(),
        up = f.tangent.clone().cross(right).normalize();
      const upright = new T.Quaternion().setFromRotationMatrix(
        new T.Matrix4().makeBasis(right, up, f.tangent),
      );
      const yaw = new T.Quaternion().setFromAxisAngle(
        worldUp,
        Math.atan2(f.tangent.x, f.tangent.z),
      );
      const local = (x, y, z = 0) =>
        f.position
          .clone()
          .addScaledVector(right, x)
          .addScaledVector(up, y)
          .addScaledVector(f.tangent, z);
      const arc = (key, r, thickness, depth, a, b, z = 0, solid = false) => {
        if (collision && !solid) return;
        const positions = [],
          indices = [],
          steps = Math.max(2, Math.ceil((b - a) / 0.055));
        for (let k = 0; k <= steps; k++) {
          const angle = T.MathUtils.lerp(a, b, k / steps);
          for (const [rr, zz] of [
            [r, z - depth / 2],
            [r + thickness, z - depth / 2],
            [r, z + depth / 2],
            [r + thickness, z + depth / 2],
          ])
            positions.push(
              ...local(
                Math.cos(angle) * rr,
                Math.sin(angle) * rr,
                zz,
              ).toArray(),
            );
        }
        for (let k = 0; k < steps; k++) {
          const n = k * 4;
          indices.push(
            n,
            n + 4,
            n + 5,
            n,
            n + 5,
            n + 1,
            n + 2,
            n + 3,
            n + 7,
            n + 2,
            n + 7,
            n + 6,
            n,
            n + 2,
            n + 6,
            n,
            n + 6,
            n + 4,
            n + 1,
            n + 5,
            n + 7,
            n + 1,
            n + 7,
            n + 3,
          );
        }
        indices.push(
          0,
          1,
          3,
          0,
          3,
          2,
          steps * 4,
          steps * 4 + 2,
          steps * 4 + 3,
          steps * 4,
          steps * 4 + 3,
          steps * 4 + 1,
        );
        const g = new T.BufferGeometry();
        g.setAttribute('position', new T.Float32BufferAttribute(positions, 3));
        g.setIndex(indices);
        g.computeVertexNormals();
        g.setAttribute(
          'uv',
          new T.Float32BufferAttribute(
            new Float32Array((positions.length / 3) * 2),
            2,
          ),
        );
        parts[key].push(g);
      };
      const columns = new Map();
      // All gravity-owned foundations stay175m outside the route's physical axis.
      for (const side of [-1, 1]) {
        const top = f.position.y + (section.kind === 'inversion' ? 145 : -80);
        let p, floor;
        // Test against every actual road branch. At the underpass a gravity
        // column moves farther out instead of cutting through the lower deck.
        for (const offset of [175, 245, 315, 405]) {
          const candidate = f.position
            .clone()
            .addScaledVector(right, side * offset);
          const base =
            shatterlineGroundHeight(track, candidate.x, candidate.z) - 15;
          if (top <= base) continue;
          if (
            !routeSpace.clearsColumn(
              candidate.x,
              candidate.z,
              58,
              64,
              base,
              top + 5,
              Math.atan2(f.tangent.x, f.tangent.z),
            )
          )
            continue;
          p = candidate;
          floor = base;
          break;
        }
        if (!p) continue;
        const height = top - floor;
        const base = p.clone().setY(floor + 7);
        box('ceramic', base, [54, 14, 60], yaw);
        for (const dx of [-12, 12])
          box(
            'metal',
            p
              .clone()
              .addScaledVector(right, dx)
              .setY((top + floor) / 2),
            [7, height, 18],
            yaw,
          );
        box('ceramic', p.clone().setY(top - 10), [46, 23, 42], yaw);
        // Layered bolted shoes, inset maintenance skins and flange bands make
        // the tall gravity frames read as engineered accelerator structure.
        box('graphite', p.clone().setY(floor + 16), [49, 7, 53], yaw);
        box('edge', p.clone().setY(top + 2), [48, 3, 44], yaw);
        for (let y = floor + 35; y < top - 40; y += 150) {
          box('graphite', p.clone().setY(y), [35, 9, 27], yaw);
          for (const dx of [-12, 12]) {
            box(
              'edge',
              p.clone().addScaledVector(right, dx).setY(y),
              [9, 15, 24],
              yaw,
            );
            box(
              'ceramic',
              p
                .clone()
                .addScaledVector(right, dx)
                .setY(y + 43)
                .addScaledVector(f.tangent, -11),
              [9, 55, 5],
              yaw,
            );
            box(
              'metal',
              p
                .clone()
                .addScaledVector(right, dx)
                .setY(y + 43)
                .addScaledVector(f.tangent, -14),
              [3, 43, 2],
              yaw,
            );
          }
          if (Math.floor(y / 150) % 2 === 0)
            box(
              'oxide',
              p
                .clone()
                .setY(y + 3)
                .addScaledVector(f.tangent, -15),
              [18, 6, 2],
              yaw,
            );
        }
        for (let y = floor + 20; y < top - 25; y += 75) {
          const a = p.clone().addScaledVector(right, -12).setY(y),
            b = p
              .clone()
              .addScaledVector(right, 12)
              .setY(Math.min(top - 12, y + 68));
          beam('metal', a, b, 2.5);
          beam('metal', a.clone().setY(b.y), b.clone().setY(a.y), 2.5);
        }
        columns.set(side, p);
      }
      // Short frame-owned arms attach below the deck at its OUTSIDE edges. Their
      // extension remains below the active surface as the road rolls through360°.
      for (const side of [-1, 1]) {
        const root = f.position
          .clone()
          .addScaledVector(f.right, side * (track.width / 2 + 4))
          .addScaledVector(f.up, -9.5);
        const outer = f.position
          .clone()
          .addScaledVector(f.right, side * 98)
          .addScaledVector(f.up, -28);
        beam('metal', root, outer, 2.5);
        box('graphite', root, [9, 5, 13], f.quaternion);
        const worldSide =
            Math.sign(outer.clone().sub(f.position).dot(right)) || side,
          p = columns.get(worldSide);
        if (p) {
          const y = section.kind === 'inversion' ? outer.y : f.position.y - 88,
            target = p.clone().setY(y);
          beam('metal', outer, target, 3.5);
          box('ceramic', target, [25, 12, 25], yaw);
        }
      }
      if (section.kind === 'corkscrew') {
        // Three-dimensional induction hoops provide a fixed gravity reference
        // while the visible road makes a real physical helix through their middle.
        const radius = 138,
          count = 36;
        for (let i = 0; i < count; i++) {
          const a = (i / count) * Math.PI * 2,
            b = ((i + 1) / count) * Math.PI * 2;
          for (const z of [-6, 6])
            beam(
              'metal',
              local(Math.cos(a) * radius, Math.sin(a) * radius, z),
              local(Math.cos(b) * radius, Math.sin(b) * radius, z),
              3.1,
            );
          if (i % 3 === 0) {
            const mid = (a + b) / 2,
              q = upright
                .clone()
                .multiply(
                  new T.Quaternion().setFromAxisAngle(
                    new T.Vector3(0, 0, 1),
                    mid,
                  ),
                );
            const lo = mid - 0.19,
              hi = mid + 0.19,
              ordinal = i / 3;
            arc('graphite', 127, 29, 35, lo, hi, 0, true);
            for (const z of [-19, 19]) {
              arc('metal', 127, 4, 3, lo, hi, z);
              arc('edge', 152, 5, 3, lo, hi, z);
            }
            // Recessed copper laminations sit behind split ceramic skins.
            for (let layer = 0; layer < 5; layer++)
              arc(
                'coil',
                133 + layer * 3,
                1.35,
                2,
                lo + 0.016,
                hi - 0.016,
                -18.5,
              );
            if (ordinal % 5 !== 2) {
              arc('ceramic', 139, 12, 10, lo + 0.016, mid - 0.013, -22, true);
              arc('ceramic', 139, 12, 10, mid + 0.013, hi - 0.016, -22, true);
              arc('edge', 149, 2, 1.2, lo + 0.022, hi - 0.022, -27.8);
            }
            for (const theta of [lo + 0.017, hi - 0.017]) {
              const joint = upright
                .clone()
                .multiply(
                  new T.Quaternion().setFromAxisAngle(
                    new T.Vector3(0, 0, 1),
                    theta,
                  ),
                );
              box(
                'metal',
                local(Math.cos(theta) * 141, Math.sin(theta) * 141, -20),
                [30, 2.5, 8],
                joint,
              );
            }
            box(
              'graphite',
              local(Math.cos(mid) * 130, Math.sin(mid) * 130, -22),
              [6, 19, 9],
              q,
            );
            box(
              'signal',
              local(Math.cos(mid) * 129, Math.sin(mid) * 129, -27),
              [2, 12, 1],
              q,
            );
            if (ordinal % 4 === 1) {
              box(
                'oxide',
                local(Math.cos(mid) * 157, Math.sin(mid) * 157, -1),
                [7, 20, 26],
                q,
              );
              box(
                'metal',
                local(Math.cos(mid) * 161, Math.sin(mid) * 161, -1),
                [2, 14, 19],
                q,
              );
            }
          }
        }
        for (const side of [-1, 1]) {
          const p = columns.get(side);
          if (p)
            beam(
              'metal',
              local(side * 138, 0),
              p.clone().setY(f.position.y - 82),
              6,
            );
        }
      } else if (section.kind === 'inversion') {
        const a = f.position
            .clone()
            .addScaledVector(right, -175)
            .addScaledVector(worldUp, 145),
          b = f.position
            .clone()
            .addScaledVector(right, 175)
            .addScaledVector(worldUp, 145);
        beam('graphite', a, b, 8);
        const centre = f.position.clone().addScaledVector(worldUp, 145);
        box('graphite', centre, [350, 21, 25], yaw);
        for (const h of [-11, 11])
          box(
            'metal',
            centre.clone().addScaledVector(worldUp, h),
            [354, 3, 31],
            yaw,
          );
        for (let x = -144; x <= 145; x += 48) {
          const p = centre.clone().addScaledVector(right, x);
          box('ceramic', p, [39, 25, 32], yaw);
          box(
            'graphite',
            p.clone().addScaledVector(f.tangent, -19),
            [29, 18, 5],
            yaw,
          );
          for (const h of [-5, 0, 5])
            box(
              'coil',
              p
                .clone()
                .addScaledVector(worldUp, h)
                .addScaledVector(f.tangent, -22),
              [25, 1.7, 3],
              yaw,
            );
          for (const dx of [-18, 18])
            box('edge', p.clone().addScaledVector(right, dx), [3, 29, 37], yaw);
        }
        for (const side of [-1, 1]) {
          const cap = f.position
            .clone()
            .addScaledVector(right, side * 134)
            .addScaledVector(worldUp, 145);
          box('ceramic', cap, [48, 26, 29], yaw);
          box(
            'signal',
            cap.clone().addScaledVector(new T.Vector3(0, 0, -1), 17),
            [27, 3, 3],
            yaw,
          );
        }
      }
    }
    for (const [key, list] of Object.entries(parts))
      if (list.length) {
        const geometry = mergeGeometries(list, false);
        list.forEach((g) => g.dispose());
        const mesh = new T.Mesh(geometry, materials[key]);
        mesh.name = `Shatterline / ${section.id} / ${key}`;
        mesh.userData.collisionId = `shatterline-${section.id}-${key}`;
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        group.add(mesh);
      }
  }
  const usedMaterials = new Set(group.children.map((mesh) => mesh.material));
  for (const material of Object.values(materials))
    if (!usedMaterials.has(material)) material.dispose();
  boxSource.dispose();
  beamSource.dispose();
  return group;
}
export function createShatterlineDescentTriangles(track) {
  const group = createShatterlineDescentInfrastructure(track, {
      collision: true,
    }),
    triangles = [],
    materials = new Set();
  group.traverse((o) => {
    if (!o.isMesh) return;
    const p = o.geometry.attributes.position,
      ix = o.geometry.index.array;
    for (let i = 0; i < ix.length; i += 3)
      triangles.push({
        id: o.userData.collisionId,
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
