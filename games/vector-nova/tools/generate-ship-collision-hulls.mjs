import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { Box3, Texture, Vector3 } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { ConvexHull } from 'three/addons/math/ConvexHull.js';
import { SHIPS } from '../src/ships/catalog.js';
import { RIVAL_SHIPS } from '../src/ships/rivals.js';
import {
  contactHullDistance,
  simplifyContactHull,
} from './simplify-contact-hull.mjs';

// No rendering or texture decoding is needed. These are the unmodified static
// GLB meshes; runtime exhaust plumes/lights are deliberately absent.
const sources = [
  ...SHIPS.map(({ id, asset }) => ({ id, source: `public/${asset}` })),
  ...RIVAL_SHIPS.map(({ id }) => ({
    id,
    source: `public/assets/ships/rivals/${id}/${id}.glb`,
  })),
];
const output = new URL('../src/ships/collision-hulls.js', import.meta.url);
const hash = (value) => createHash('sha256').update(value).digest('hex');
const round = (value) => Number(value.toFixed(6)) || 0;
const compare = (a, b) => a.x - b.x || a.y - b.y || a.z - b.z;
const tolerance = 0.00001;
// Blender's evaluated bevels and exported GLB floats can differ by tens of
// micrometres. This is only a verification tolerance, never collider padding.
const assemblyTolerance = 0.0001;
export const CONTACT_PROXY_MAX_EXCESS = 0.01;

async function modelPoints(source) {
  const bytes = await readFile(new URL(`../${source}`, import.meta.url));
  const loader = new GLTFLoader();
  loader.register(() => ({
    name: 'KHR_texture_basisu',
    loadTexture: async () => new Texture(),
  }));
  const { scene } = await loader.parseAsync(
    bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
    '',
  );
  const points = new Map();
  const triangles = [];
  const geometries = new Set(),
    materials = new Set(),
    textures = new Set();
  try {
    scene.updateMatrixWorld(true);
    scene.traverse((object) => {
      if (!object.isMesh) return;
      const attribute = object.geometry.attributes.position;
      const meshPoints = [];
      for (let index = 0; index < attribute.count; index++) {
        const point = new Vector3()
          .fromBufferAttribute(attribute, index)
          .applyMatrix4(object.matrixWorld);
        assert.ok(
          point.toArray().every(Number.isFinite),
          `${source}: finite vertices`,
        );
        const key = point.toArray().join(',');
        if (!points.has(key)) points.set(key, point);
        meshPoints.push(points.get(key));
      }
      const indices = object.geometry.index;
      for (
        let index = 0;
        index < (indices?.count ?? attribute.count);
        index += 3
      )
        triangles.push(
          [0, 1, 2].map(
            (offset) =>
              meshPoints[
                indices ? indices.getX(index + offset) : index + offset
              ],
          ),
        );
      geometries.add(object.geometry);
      for (const material of Array.isArray(object.material)
        ? object.material
        : [object.material]) {
        materials.add(material);
        for (const value of Object.values(material))
          if (value?.isTexture) textures.add(value);
      }
    });
    return {
      points: [...points.values()].sort(compare),
      triangles,
      assetSha256: hash(bytes),
    };
  } finally {
    geometries.forEach((geometry) => geometry.dispose());
    materials.forEach((material) => material.dispose());
    textures.forEach((texture) => texture.dispose());
  }
}

function buildHull(points, label) {
  const hull = new ConvexHull().setFromPoints(points);
  const exterior = new Map();
  for (const face of hull.faces) {
    let edge = face.edge;
    do {
      const rounded = edge.head().point.toArray().map(round);
      exterior.set(rounded.join(','), new Vector3(...rounded));
      edge = edge.next;
    } while (edge !== face.edge);
  }
  const runtimePoints = [...exterior.values()].sort(compare);
  const vertices = runtimePoints.flatMap((point) => point.toArray());
  const runtimeHull = new ConvexHull().setFromPoints(runtimePoints);
  assert.ok(
    runtimeHull.faces.length >= 4,
    `${label}: nondegenerate convex volume`,
  );
  for (const point of points)
    for (const face of runtimeHull.faces)
      assert.ok(
        face.distanceToPoint(point) <= tolerance,
        `${label}: source vertices are enclosed`,
      );
  const sourceBounds = new Box3().setFromPoints(points);
  const runtimeBounds = new Box3().setFromPoints(runtimePoints);
  for (const side of ['min', 'max'])
    assert.ok(
      sourceBounds[side].distanceTo(runtimeBounds[side]) < tolerance,
      `${label}: tight ${side} bounds`,
    );
  return {
    vertices,
    bounds: {
      min: runtimeBounds.min.toArray(),
      max: runtimeBounds.max.toArray(),
    },
    hull: runtimeHull,
    box: runtimeBounds.clone().expandByScalar(tolerance),
  };
}

export async function generateCollisionHulls() {
  const assemblies = JSON.parse(
    await readFile(
      new URL('../assets/ships/collision-assemblies.json', import.meta.url),
      'utf8',
    ),
  );
  const catalogue = {};
  for (const { id, source } of sources) {
    const { points, triangles, assetSha256 } = await modelPoints(source);
    const { vertices, bounds } = buildHull(points, id);
    const assembly = assemblies.ships[id];
    assert.equal(
      assembly.assetSha256,
      assetSha256,
      `${id}: re-extract assemblies after updating GLB`,
    );
    const sourceSha256 = hash(
      await readFile(new URL(`../${assembly.source}`, import.meta.url)),
    );
    assert.equal(
      assembly.sourceSha256,
      sourceSha256,
      `${id}: re-extract assemblies after updating Blender source`,
    );
    assert.ok(
      assembly.parts.length > 1 && assembly.parts.length < 20,
      `${id}: bounded compound part count`,
    );
    const workingParts = assembly.parts.map((part) => {
      const partPoints = [];
      for (let index = 0; index < part.vertices.length; index += 3)
        partPoints.push(new Vector3(...part.vertices.slice(index, index + 3)));
      const label = `${id}/${part.id}`;
      const reduced = simplifyContactHull(
        partPoints,
        CONTACT_PROXY_MAX_EXCESS - 0.0005,
      );
      let hull = buildHull(reduced.points, label);
      if (hull.vertices.length >= part.vertices.length)
        hull = buildHull(partPoints, label);
      // Check the final rounded runtime shape against the unchanged source,
      // including metric excess and tight outer bounds, not just samples of
      // the exported surface. Supporting planes always enclose the source.
      for (const point of partPoints)
        assert.ok(
          hull.hull.faces.every(
            (face) => face.distanceToPoint(point) <= tolerance,
          ),
          `${label}: simplified part encloses complete source`,
        );
      const distance = contactHullDistance(partPoints);
      for (let index = 0; index < hull.vertices.length; index += 3)
        assert.ok(
          distance(new Vector3(...hull.vertices.slice(index, index + 3)))
            .distance <= CONTACT_PROXY_MAX_EXCESS,
          `${label}: maximum 10 mm geometric excess`,
        );
      const sourceBounds = new Box3().setFromPoints(partPoints);
      for (const side of ['min', 'max'])
        assert.ok(
          sourceBounds[side].distanceTo(new Vector3(...hull.bounds[side])) <
            tolerance,
          `${label}: exact assembly outer bounds are retained`,
        );
      hull.box.expandByScalar(assemblyTolerance);
      return { id: part.id, name: part.name, ...hull };
    });
    const memberships = new Map();
    for (const point of points) {
      let mask = 0;
      for (const [index, part] of workingParts.entries())
        if (
          part.box.containsPoint(point) &&
          part.hull.faces.every(
            (face) => face.distanceToPoint(point) <= assemblyTolerance,
          )
        )
          mask |= 1 << index;
      assert.ok(
        mask,
        `${id}: compound encloses rendered vertex ${point.toArray()}`,
      );
      memberships.set(point, mask);
    }
    // A shared convex part for a triangle's three vertices also encloses its
    // complete surface. Merely enclosing vertex samples is not sufficient.
    for (const triangle of triangles)
      assert.ok(
        triangle.reduce((mask, point) => mask & memberships.get(point), -1),
        `${id}: complete rendered triangle is enclosed`,
      );
    const parts = workingParts.map(({ id, name, vertices, bounds }) => ({
      id,
      name,
      bounds,
      vertices,
    }));
    catalogue[id] = {
      id,
      version: 2,
      source,
      assetSha256,
      sourceBlend: assembly.source,
      sourceSha256,
      hullSha256: hash(JSON.stringify({ vertices, parts })),
      bounds,
      vertices,
      parts,
    };
  }
  return catalogue;
}

export function collisionHullModule(catalogue) {
  const identity = `compound-v2-${hash(JSON.stringify(Object.values(catalogue).map(({ id, assetSha256, hullSha256 }) => [id, assetSha256, hullSha256])))}`;
  const vertexSource = (vertices, indent) => {
    const triples = [];
    for (let index = 0; index < vertices.length; index += 3)
      triples.push(
        `${indent}  ${vertices.slice(index, index + 3).join(', ')},`,
      );
    return `${indent}// prettier-ignore\n${indent}vertices: [\n${triples.join('\n')}\n${indent}],`;
  };
  const entries = Object.values(catalogue).map(
    ({ vertices, parts, ...metadata }) => {
      const fields = Object.entries(metadata)
        .map(([name, value]) => `    ${name}: ${JSON.stringify(value)},`)
        .join('\n');
      const partSource = parts
        .map(
          ({ vertices, ...part }) =>
            `      {\n        id: ${JSON.stringify(part.id)},\n        name: ${JSON.stringify(part.name)},\n        bounds: ${JSON.stringify(part.bounds)},\n${vertexSource(vertices, '        ')}\n      },`,
        )
        .join('\n');
      return `  ${metadata.id}: {\n${fields}\n${vertexSource(vertices, '    ')}\n    parts: [\n${partSource}\n    ],\n  },`;
    },
  );
  return `// Generated by tools/generate-ship-collision-hulls.mjs from static GLBs and
// Blender structural assemblies; see tools/extract-ship-collision-assemblies.py.
// Metres, +Z forward / +Y up, in the rendered chassis root's local frame.
// No padding or exhaust effects. Use parts for contacts; aggregate vertices are
// an outer envelope for support queries, not a collider over open-frame gaps.
// Structural parts enclose the complete source with at most 10 mm geometric
// excess, retaining their exact outer bounds; dense bevels are not simulated.
export const COLLISION_HULLS_ID = '${identity}';

const freezeHull = (hull) => Object.freeze({
  ...hull,
  bounds: Object.freeze({
    min: Object.freeze(hull.bounds.min),
    max: Object.freeze(hull.bounds.max),
  }),
  vertices: Object.freeze(hull.vertices),
  ...(hull.parts ? { parts: Object.freeze(hull.parts.map(freezeHull)) } : {}),
});

export const COLLISION_HULLS = Object.freeze(Object.fromEntries(
  Object.entries({
${entries.join('\n')}
  }).map(([id, hull]) => [id, freezeHull(hull)]),
));

export function getCollisionHull(id) {
  if (!Object.hasOwn(COLLISION_HULLS, id))
    throw new Error(\`Unknown collision chassis: \${id}\`);
  return COLLISION_HULLS[id];
}
`;
}

if (
  process.argv[1] &&
  pathToFileURL(process.argv[1]).href === import.meta.url
) {
  const args = process.argv.slice(2);
  assert.ok(
    args.length === 0 || (args.length === 1 && args[0] === '--check'),
    'Use --check or no arguments.',
  );
  const catalogue = await generateCollisionHulls();
  const { format } = await import('prettier');
  const source = await format(collisionHullModule(catalogue), {
    parser: 'babel',
    singleQuote: true,
  });
  if (args[0] === '--check')
    assert.equal(
      await readFile(output, 'utf8'),
      source,
      'Collision hulls are stale; regenerate from current GLBs.',
    );
  else await writeFile(output, source);
  console.log(
    Object.values(catalogue)
      .map(
        ({ id, parts }) =>
          `${id}: ${parts.length} parts, ${parts.reduce((sum, part) => sum + part.vertices.length / 3, 0)} vertices`,
      )
      .join('\n'),
  );
  console.log(
    `${args[0] === '--check' ? 'Checked' : 'Wrote'} 13 compound chassis contact proxies.`,
  );
}
