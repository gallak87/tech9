import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { gunzipSync } from 'node:zlib';
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
const specPath = args.find((arg) => arg.startsWith('--spec='))?.slice(7);
const spec = specPath
  ? JSON.parse(await readFile(resolve(root, specPath), 'utf8'))
  : null;
if (spec) names.push(...Object.keys(spec));
if (!names.length && biome === 'shatterline') names.push(...defaults);
if (!names.length || names.some((name) => !/^[a-z0-9_-]+$/.test(name)))
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

function verticesFromGLB(buffer, selector = null) {
  if (buffer[0] === 0x1f && buffer[1] === 0x8b) buffer = gunzipSync(buffer);
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
  const points = [],
    positions = [],
    indices = [],
    unique = new Map();
  let visualTriangles = 0;
  let matches = 0;
  const vertex = (point) => {
    const key = point
      .toArray()
      .map((n) => n.toFixed(6))
      .join(',');
    if (!unique.has(key)) {
      unique.set(key, positions.length / 3);
      positions.push(...point.toArray());
    }
    return unique.get(key);
  };
  function walk(index, parent, inherited = false) {
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
    if (selector && node.name === selector) matches++;
    const selected = !selector || inherited || node.name === selector;
    for (const primitive of selected
      ? (json.meshes?.[node.mesh]?.primitives ?? [])
      : []) {
      if (node.skin !== undefined || primitive.targets?.length)
        throw new Error('Editor kit must use static geometry');
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
      const mapped = [];
      for (let i = 0; i < accessor.count; i++) {
        const at = offset + i * stride;
        const point = new T.Vector3(
          binary.readFloatLE(at),
          binary.readFloatLE(at + 4),
          binary.readFloatLE(at + 8),
        ).applyMatrix4(matrix);
        if (
          !Number.isFinite(point.x) ||
          !Number.isFinite(point.y) ||
          !Number.isFinite(point.z)
        )
          throw new Error('Asset positions must be finite');
        points.push(point);
        mapped.push(vertex(point));
      }
      if ((primitive.mode ?? 4) !== 4)
        throw new Error('Editor exact collision expects triangle primitives');
      const source = [];
      if (primitive.indices !== undefined) {
        const index = json.accessors[primitive.indices],
          view = json.bufferViews[index.bufferView];
        const bytes = { 5121: 1, 5123: 2, 5125: 4 }[index.componentType];
        if (!bytes || index.sparse || view.buffer !== 0)
          throw new Error('Unsupported primitive index accessor');
        const start = (view.byteOffset ?? 0) + (index.byteOffset ?? 0);
        for (let i = 0; i < index.count; i++) {
          const at = start + i * (view.byteStride ?? bytes);
          source.push(
            bytes === 1
              ? binary.readUInt8(at)
              : bytes === 2
                ? binary.readUInt16LE(at)
                : binary.readUInt32LE(at),
          );
        }
      } else for (let i = 0; i < accessor.count; i++) source.push(i);
      if (source.length % 3) throw new Error('Incomplete triangle primitive');
      visualTriangles += source.length / 3;
      for (let i = 0; i < source.length; i += 3) {
        const triangle = source.slice(i, i + 3).map((index) => mapped[index]);
        if (triangle.some((index) => index === undefined))
          throw new Error('Primitive index exceeds vertex accessor');
        if (new Set(triangle).size < 3) continue;
        if (matrix.determinant() < 0)
          [triangle[1], triangle[2]] = [triangle[2], triangle[1]];
        indices.push(...triangle);
      }
    }
    for (const child of node.children ?? []) walk(child, matrix, selected);
  }
  for (const index of json.scenes[json.scene ?? 0].nodes)
    walk(index, new T.Matrix4());
  if (!points.length) throw new Error('The asset has no static mesh positions');
  if (selector && matches !== 1)
    throw new Error('Prototype must have one exact named match: ' + selector);
  return { points, visualTriangles, collision: { positions, indices } };
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
  const entry = spec?.[name] ?? {};
  const file = entry.file ?? `${name}.glb`;
  const url = file.startsWith('assets/')
    ? file
    : `assets/levels/${biome}/${file}`;
  if (
    !/^assets\/(levels|editor)\/[a-z0-9_./ -]+\.(glb|glb\.gz)$/i.test(url) ||
    url.split('/').includes('..')
  )
    throw new Error('Expected a registered public GLB path');
  const bytes = await readFile(resolve(root, 'public', url));
  const { points, collision, visualTriangles } = verticesFromGLB(
      bytes,
      entry.node,
    ),
    visual = new T.Box3().setFromPoints(points);
  const convex =
    entry.proxy === 'convex' || (!entry.proxy && hullNames.has(name));
  const exact = entry.proxy === 'exact';
  const triangles = convex
    ? enclosingGeology(points)
    : entry.proxy === 'none' || exact
      ? []
      : (proxies[entry.proxyKey ?? name] ?? []);
  const bounds = visual.clone();
  for (const face of triangles)
    for (const point of face) bounds.expandByPoint(new T.Vector3(...point));
  let encodedCollision;
  if (exact) {
    const positions = new Float32Array(collision.positions);
    const indices =
      collision.positions.length / 3 > 65535
        ? new Uint32Array(collision.indices)
        : new Uint16Array(collision.indices);
    for (let i = 0; i < positions.length; i += 3)
      bounds.expandByPoint(
        new T.Vector3(positions[i], positions[i + 1], positions[i + 2]),
      );
    encodedCollision = {
      format: 'indexed-f32-v1',
      positions: Buffer.from(positions.buffer).toString('base64'),
      indices: Buffer.from(indices.buffer).toString('base64'),
      indexType: indices instanceof Uint16Array ? 'u16' : 'u32',
    };
  }
  result[name] = {
    url,
    bounds: [bounds.min.toArray(), bounds.max.toArray()],
    visualBounds: [visual.min.toArray(), visual.max.toArray()],
    triangles,
    ...(entry.node ? { node: entry.node } : {}),
    ...(exact ? { collision: encodedCollision } : {}),
    ...(spec ? { visualTriangles } : {}),
    proxy: exact
      ? 'exact-rendered-indexed'
      : convex
        ? 'conservative-solid-geology-26planes'
        : triangles.length
          ? 'authored-collision-kit'
          : 'none',
    sourceHash: createHash('sha256').update(bytes).digest('hex'),
    ...(entry.castShadow === false || name.includes('distant')
      ? { castShadow: false }
      : {}),
  };
  console.log(
    `${name}: ${points.length} visual vertices, ${exact ? collision.indices.length / 3 : triangles.length} proxy faces`,
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
