import * as T from 'three';
import { createRavelMembraneMaterial } from './track/road.js';
import {
  COLLECTOR_FOLD_SIZE,
  COLLECTOR_FOLD_OFFSETS,
} from './collector-fold-data.js';

// Blender-authored interior cage; the zero perimeter preserves every load hem.
function collectorFold(u, v) {
  const last = COLLECTOR_FOLD_SIZE - 1;
  const col = T.MathUtils.clamp(u, 0, 1) * last,
    row = T.MathUtils.clamp(v, 0, 1) * last;
  const c = Math.min(last - 1, Math.floor(col)),
    r = Math.min(last - 1, Math.floor(row));
  const x = col - c,
    y = row - r,
    result = [0, 0, 0];
  for (let j = 0; j < 2; j++)
    for (let i = 0; i < 2; i++) {
      const weight = (i ? x : 1 - x) * (j ? y : 1 - y);
      const at = 3 * ((r + j) * COLLECTOR_FOLD_SIZE + c + i);
      for (let axis = 0; axis < 3; axis++)
        result[axis] += COLLECTOR_FOLD_OFFSETS[at + axis] * weight;
    }
  return result;
}

/** The upper, unmarked sails belong to the rig above the drivable membrane.
 * Sparse triangular mouths keep the race route and the star field exposed. */
export function createRavelCanopies({ track, finish = null }) {
  const group = new T.Group();
  group.name = 'Ravel / overlapping upper sail folds';
  const foil = createRavelMembraneMaterial('#d6dcd9', null, finish);
  const edge = new T.MeshStandardMaterial({
    color: '#655344',
    metalness: 0.78,
    roughness: 0.32,
  });
  const geometries = [],
    hems = [];
  const definitions = [
    {
      s: 680,
      length: 1100,
      width: 1100,
      side: -850,
      lift: 560,
      sag: 240,
      yaw: -0.3,
      lean: 310,
    },
    {
      s: 3430,
      length: 450,
      width: 600,
      side: 250,
      lift: 350,
      sag: 60,
      yaw: -0.15,
      lean: 250,
    },
    {
      s: 4920,
      length: 1050,
      width: 1100,
      side: -750,
      lift: 560,
      sag: 230,
      yaw: -0.48,
      lean: 390,
    },
    {
      s: 8560,
      length: 1800,
      width: 1500,
      side: -1100,
      lift: 700,
      sag: 300,
      yaw: -0.32,
      lean: 380,
    },
    {
      s: 9660,
      length: 1450,
      width: 1450,
      side: 1100,
      lift: 760,
      sag: 280,
      yaw: 0.42,
      lean: -400,
    },
    {
      s: 11700,
      length: 1250,
      width: 1300,
      side: 850,
      lift: 650,
      sag: 280,
      yaw: 0.5,
      lean: 380,
    },
    {
      s: 12900,
      length: 1000,
      width: 1100,
      side: -750,
      lift: 650,
      sag: 260,
      yaw: -0.4,
      lean: -300,
    },
  ];
  // Check the entire physical route, including curled walls and all three
  // branches, before retaining a sheet. Raising a scenery sail never moves
  // the supported road or changes a jump's receiving geometry.
  const route = [];
  for (let s = 0; s < track.length; s += 32) {
    route.push(track.sample(s).position);
    const bands = track.roadBands.filter((b) => s >= b.start && s <= b.end);
    for (const b of bands) {
      const low = typeof b.min === 'function' ? b.min(s) : b.min;
      const high = typeof b.max === 'function' ? b.max(s) : b.max;
      for (let x = low; x <= high + 0.01; x += Math.max(16, (high - low) / 12))
        route.push(track.branchPoint(s, x));
      route.push(track.branchPoint(s, high));
    }
  }
  for (const [i, def] of definitions.entries()) {
    const frame = track.sample(def.s);
    const right = frame.right.clone().applyAxisAngle(frame.up, def.yaw);
    const forward = frame.tangent.clone().applyAxisAngle(frame.up, def.yaw);
    const pos = (u, v, extra = 0) => {
      const x =
        def.side +
        (u - 0.5) * def.width * (0.64 + 0.36 * Math.sin(v * Math.PI));
      const z = (v - 0.5) * def.length;
      const h =
        def.lift +
        extra -
        def.sag * Math.sin(u * Math.PI) * Math.sin(v * Math.PI) +
        def.lean * (u - 0.5) +
        120 * (v - 0.5) +
        38 * Math.sin(v * Math.PI * 2) * Math.sin(u * Math.PI);
      const fold = i === 1 ? collectorFold(u, v) : [0, 0, 0];
      return frame.position
        .clone()
        .addScaledVector(right, x + fold[0])
        .addScaledVector(forward, z + fold[2])
        .addScaledVector(frame.up, h + fold[1]);
    };
    let extra = 0;
    const clearance = () => {
      for (let v = 0; v <= 1.001; v += 0.1)
        for (let u = 0; u <= 1.001; u += 0.1) {
          const p = pos(u, v, extra);
          if (route.some((q) => q.distanceToSquared(p) < 180 ** 2))
            return false;
        }
      return true;
    };
    while (!clearance() && extra < 1800) extra += 150;
    if (i === 1)
      group.userData.ravelAscentCollector = {
        station: def.s,
        hemAnchors: [
          pos(0, 0.2, extra).toArray(),
          pos(1, 0.25, extra).toArray(),
        ],
      };
    const vertices = [],
      uv = [],
      coords = [],
      indices = [];
    const rows = Math.max(
        Math.ceil(def.length / 20),
        i === 1 ? COLLECTOR_FOLD_SIZE - 1 : 0,
      ),
      columns = Math.max(
        Math.ceil(def.width / 20),
        i === 1 ? COLLECTOR_FOLD_SIZE - 1 : 0,
      );
    for (let r = 0; r <= rows; r++)
      for (let c = 0; c <= columns; c++) {
        const u = c / columns,
          v = r / rows,
          p = pos(u, v, extra);
        vertices.push(p.x, p.y, p.z);
        uv.push((v * def.length) / 24, (u * def.width) / 16);
        coords.push(v * def.length, u * def.width);
      }
    for (let r = 0; r < rows; r++)
      for (let c = 0; c < columns; c++) {
        const n = r * (columns + 1) + c,
          next = n + columns + 1;
        indices.push(n, next, n + 1, n + 1, next, next + 1);
      }
    const geo = new T.BufferGeometry();
    geo.setAttribute('position', new T.Float32BufferAttribute(vertices, 3));
    geo.setAttribute('uv', new T.Float32BufferAttribute(uv, 2));
    geo.setAttribute('roadCoord', new T.Float32BufferAttribute(coords, 2));
    geo.setIndex(indices);
    geo.computeVertexNormals();
    geometries.push(geo);
    const mesh = new T.Mesh(geo, foil);
    mesh.name = `Ravel / upper sail ${i + 1}`;
    mesh.userData.clearanceLift = extra;
    mesh.userData.aoExclude = true;
    group.add(mesh);
    for (const [axis, value] of [
      [0, 0],
      [0, 1],
      [1, 0],
      [1, 1],
    ]) {
      const pts = Array.from({ length: 41 }, (_, j) =>
        pos(axis === 0 ? value : j / 40, axis === 0 ? j / 40 : value, extra),
      );
      hems.push(
        new T.TubeGeometry(new T.CatmullRomCurve3(pts), 80, 0.9, 5, false),
      );
    }
  }
  const hemMesh = new T.BatchedMesh(
    hems.length,
    hems.reduce((n, g) => n + g.attributes.position.count, 0),
    hems.reduce((n, g) => n + (g.index?.count ?? 0), 0),
    edge,
  );
  hemMesh.name = 'Ravel / culled upper sail load hems';
  hemMesh.perObjectFrustumCulled = true;
  hemMesh.sortObjects = false;
  for (const g of hems) {
    const id = hemMesh.addGeometry(g);
    hemMesh.addInstance(id);
    g.dispose();
  }
  hemMesh.computeBoundingSphere();
  group.add(hemMesh);
  let disposed = false;
  return {
    group,
    dispose() {
      if (disposed) return;
      disposed = true;
      group.clear();
      hemMesh.dispose();
      geometries.forEach((g) => g.dispose());
      foil.dispose();
      edge.dispose();
    },
  };
}
