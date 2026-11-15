import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import * as T from 'three';
import { ConvexHull } from 'three/addons/math/ConvexHull.js';

// Extract trusted CPU placement bounds and authored proxies without a browser
// or a graphics loader. Convex proxies are opt-in for solid geology only.
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const defaults = [
  'geology-bedded-ridge',
  'geology-eroded-bluff',
  'geology-distant-range',
  'crown-broken',
  'crown-severed',
  'service-gallery',
  'service-shelter',
  'load-foundation',
  'fractured-cassette',
  'receiving-tower',
];
const args = process.argv.slice(2),
  biome = args[0];
if (!biome || !/^[a-z0-9-]+$/.test(biome))
  throw new Error(
    'Usage: node tools/editor-asset-metadata.mjs <biome> [asset names] [--output=path] [--convex=name,...] [--check]',
  );
const names = args.slice(1).filter((arg) => !arg.startsWith('--'));
if (!names.length && biome === 'shatterline') names.push(...defaults);
if (!names.length || names.some((name) => !/^[a-z0-9-]+$/.test(name)))
  throw new Error('Supply registered static asset names');
const output = resolve(
  root,
  args.find((arg) => arg.startsWith('--output='))?.slice(9) ??
    `src/editor/kits/${biome}-assets.json`,
);
const hullNames = new Set(
  (
    args.find((arg) => arg.startsWith('--convex='))?.slice(9) ??
    (biome === 'shatterline'
      ? defaults.filter((name) => name.startsWith('geology-')).join(',')
      : '')
  ).split(','),
);
let proxies;
try {
  proxies = JSON.parse(
    await readFile(
      resolve(root, `assets/levels/${biome}/collision-kit.json`),
      'utf8',
    ),
  );
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
  proxies = {};
}

function verticesFromGLB(buffer) {
  if (buffer.readUInt32LE(0) !== 0x46546c67 || buffer.readUInt32LE(4) !== 2)
    throw new Error('Expected a binary glTF2 asset');
  let json, binary;
  for (let offset = 12; offset < buffer.length;) {
    const length = buffer.readUInt32LE(offset),
      type = buffer.readUInt32LE(offset + 4);
    if (type === 0x4e4f534a)
      json = JSON.parse(
        buffer.toString('utf8', offset + 8, offset + 8 + length),
      );
    if (type === 0x004e4942)
      binary = buffer.subarray(offset + 8, offset + 8 + length);
    offset += length + 8;
  }
  if (!json || !binary)
    throw new Error('Expected embedded JSON and binary geometry');
  const points = [];
  function walk(index, parent) {
    const node = json.nodes[index],
      local = new T.Matrix4();
    if (node.matrix) local.fromArray(node.matrix);
    else
      local.compose(
        new T.Vector3(...(node.translation ?? [0, 0, 0])),
        new T.Quaternion(...(node.rotation ?? [0, 0, 0, 1])),
        new T.Vector3(...(node.scale ?? [1, 1, 1])),
      );
    const matrix = parent.clone().multiply(local);
    for (const primitive of json.meshes?.[node.mesh]?.primitives ?? []) {
      const accessor = json.accessors[primitive.attributes.POSITION];
      if (
        accessor.type !== 'VEC3' ||
        accessor.componentType !== 5126 ||
        accessor.sparse
      )
        throw new Error('Expected ordinary float position accessors');
      const view = json.bufferViews[accessor.bufferView];
      if (view.buffer !== 0) throw new Error('Expected embedded buffer0');
      const offset = (view.byteOffset ?? 0) + (accessor.byteOffset ?? 0),
        stride = view.byteStride ?? 12;
      for (let i = 0; i < accessor.count; i++) {
        const at = offset + i * stride;
        points.push(
          new T.Vector3(
            binary.readFloatLE(at),
            binary.readFloatLE(at + 4),
            binary.readFloatLE(at + 8),
          ).applyMatrix4(matrix),
        );
      }
    }
    for (const child of node.children ?? []) walk(child, matrix);
  }
  for (const index of json.scenes[json.scene ?? 0].nodes)
    walk(index, new T.Matrix4());
  if (!points.length) throw new Error('The asset has no static mesh positions');
  return points;
}

function enclosingGeology(points) {
  const planes = [];
  for (const x of [-1, 0, 1])
    for (const y of [-1, 0, 1])
      for (const z of [-1, 0, 1]) {
        if (!x && !y && !z) continue;
        const normal = new T.Vector3(x, y, z).normalize();
        let distance = -Infinity;
        for (const p of points) distance = Math.max(distance, normal.dot(p));
        planes.push({ normal, distance: distance + 0.02 });
      }
  const candidates = new Map();
  for (let i = 0; i < planes.length; i++)
    for (let j = i + 1; j < planes.length; j++)
      for (let k = j + 1; k < planes.length; k++) {
        const a = planes[i],
          b = planes[j],
          c = planes[k],
          bc = b.normal.clone().cross(c.normal);
        const determinant = a.normal.dot(bc);
        if (Math.abs(determinant) < 1e-9) continue;
        const p = bc
          .multiplyScalar(a.distance)
          .add(c.normal.clone().cross(a.normal).multiplyScalar(b.distance))
          .add(a.normal.clone().cross(b.normal).multiplyScalar(c.distance))
          .divideScalar(determinant);
        if (planes.some((plane) => plane.normal.dot(p) > plane.distance + 1e-6))
          continue;
        candidates.set(
          p
            .toArray()
            .map((n) => n.toFixed(5))
            .join(','),
          p,
        );
      }
  const hull = new ConvexHull().setFromPoints([...candidates.values()]);
  if (hull.faces.length > 100 || points.some((p) => !hull.containsPoint(p)))
    throw new Error(
      'Coarse geology hull must conservatively enclose every visual vertex within100 faces',
    );
  return hull.faces.map((face) => {
    const points = [];
    let edge = face.edge;
    do {
      points.push(edge.head().point.toArray());
      edge = edge.next;
    } while (edge !== face.edge);
    return points;
  });
}

const result = {};
for (const name of names) {
  const url = `assets/levels/${biome}/${name}.glb`,
    bytes = await readFile(resolve(root, 'public', url));
  const points = verticesFromGLB(bytes),
    visual = new T.Box3().setFromPoints(points);
  const convex = hullNames.has(name);
  const triangles = convex ? enclosingGeology(points) : (proxies[name] ?? []);
  const bounds = visual.clone();
  for (const face of triangles)
    for (const point of face) bounds.expandByPoint(new T.Vector3(...point));
  result[name] = {
    url,
    bounds: [bounds.min.toArray(), bounds.max.toArray()],
    visualBounds: [visual.min.toArray(), visual.max.toArray()],
    triangles,
    proxy: convex
      ? 'conservative-solid-geology-26planes'
      : triangles.length
        ? 'authored-collision-kit'
        : 'none',
    sourceHash: createHash('sha256').update(bytes).digest('hex'),
    ...(name.includes('distant') ? { castShadow: false } : {}),
  };
  console.log(
    `${name}: ${points.length} visual vertices, ${triangles.length} proxy faces`,
  );
}
const encoded =
  JSON.stringify(result, (_, value) =>
    typeof value === 'number' ? Math.round(value * 1e6) / 1e6 : value,
  ) + '\n';
if (args.includes('--check')) {
  if (
    !isDeepStrictEqual(
      JSON.parse(await readFile(output, 'utf8')),
      JSON.parse(encoded),
    )
  )
    throw new Error('Editor asset metadata is stale: ' + output);
} else {
  await mkdir(dirname(output), { recursive: true });
  await writeFile(output, encoded);
}
