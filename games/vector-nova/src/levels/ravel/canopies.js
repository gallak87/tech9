import * as T from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { createRavelMembraneMaterial } from './track/road.js';

/** The upper, unmarked sails belong to the rig above the drivable membrane.
 * Sparse triangular mouths keep the race route and the star field exposed. */
export function createRavelCanopies({ track }) {
  const group = new T.Group();
  group.name = 'Ravel / overlapping upper sail folds';
  const foil = createRavelMembraneMaterial('#ded4bb', 100000);
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
      s: 3020,
      length: 1000,
      width: 1150,
      side: 800,
      lift: 600,
      sag: 270,
      yaw: 0.32,
      lean: -250,
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
      return frame.position
        .clone()
        .addScaledVector(right, x)
        .addScaledVector(forward, z)
        .addScaledVector(frame.up, h);
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
    const vertices = [],
      uv = [],
      coords = [],
      indices = [];
    const rows = Math.ceil(def.length / 20),
      columns = Math.ceil(def.width / 20);
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
  const hemGeometry = mergeGeometries(hems, false);
  hems.forEach((g) => g.dispose());
  geometries.push(hemGeometry);
  const hemMesh = new T.Mesh(hemGeometry, edge);
  hemMesh.name = 'Ravel / upper sail load hems';
  group.add(hemMesh);
  return {
    group,
    dispose() {
      group.clear();
      geometries.forEach((g) => g.dispose());
      foil.dispose();
      edge.dispose();
    },
  };
}
