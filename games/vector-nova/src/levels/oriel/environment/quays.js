import * as T from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import {
  LAKE_BASINS,
  lakeAt,
  shellPoint,
  finishHabitatMaterial,
  TAU,
} from './habitat.js';

export function createHabitatQuays(own) {
  const group = new T.Group();
  group.name = 'Oriel / connected reservoir promenades';
  const stone = own(
    finishHabitatMaterial(
      new T.MeshStandardMaterial({
        name: 'Oriel / warm waterfront retaining stone',
        color: '#ad9b75',
        roughness: 0.82,
      }),
      { bounce: 0.25 },
    ),
  );
  const cap = own(
    finishHabitatMaterial(
      new T.MeshStandardMaterial({
        name: 'Oriel / honed waterfront coping',
        color: '#d2c4a3',
        roughness: 0.57,
        metalness: 0.03,
      }),
      { bounce: 0.28 },
    ),
  );
  const bronze = own(
    finishHabitatMaterial(
      new T.MeshStandardMaterial({
        name: 'Oriel / reservoir inlet bronze',
        color: '#736548',
        roughness: 0.48,
        metalness: 0.64,
      }),
    ),
  );
  const geometryFor = (b, profile) => {
    const positions = [],
      uvs = [],
      indices = [];
    const n = 256;
    for (let i = 0; i <= n; i++) {
      const t = (i / n) * TAU;
      let lo = 0.8,
        hi = 1.22;
      for (let k = 0; k < 16; k++) {
        const r = (lo + hi) / 2;
        if (
          lakeAt(b[0] + Math.cos(t) * b[2] * r, b[1] + Math.sin(t) * b[3] * r) <
          1
        )
          lo = r;
        else hi = r;
      }
      const edge = (lo + hi) / 2;
      for (const [offset, height] of profile) {
        const a = b[0] + Math.cos(t) * (b[2] * edge + offset / 1000),
          z = b[1] + Math.sin(t) * (b[3] * edge + offset);
        positions.push(...shellPoint(a, z, height).toArray());
        uvs.push(i * 12, height * 0.1);
      }
    }
    const m = profile.length;
    for (let i = 0; i < n; i++)
      for (let j = 0; j < m - 1; j++) {
        const a = i * m + j,
          b = a + m;
        indices.push(a, b, a + 1, b, b + 1, a + 1);
      }
    const g = new T.BufferGeometry();
    g.setAttribute('position', new T.Float32BufferAttribute(positions, 3));
    g.setAttribute('uv', new T.Float32BufferAttribute(uvs, 2));
    g.setIndex(indices);
    g.computeVertexNormals();
    return g;
  };
  const walls = [],
    caps = [];
  for (const b of LAKE_BASINS) {
    walls.push(
      geometryFor(b, [
        [0, 0.3],
        [0, 7],
        [4, 10],
        [20, 10],
        [25, 1],
      ]),
    );
    caps.push(
      geometryFor(b, [
        [0.3, 7.1],
        [4.1, 10.3],
        [7, 10.3],
      ]),
    );
  }
  for (const [parts, material, name] of [
    [walls, stone, 'Oriel / continuous carved reservoir quays'],
    [caps, cap, 'Oriel / seated pale waterfront coping'],
  ]) {
    const geometry = own(mergeGeometries(parts, false));
    parts.forEach((g) => g.dispose());
    const mesh = new T.Mesh(geometry, material);
    mesh.name = name;
    mesh.receiveShadow = true;
    group.add(mesh);
  }
  return { group, materials: [stone, cap, bronze] };
}
