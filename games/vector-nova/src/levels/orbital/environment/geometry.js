import { transformedPartBounds } from '../../../environment/bounds.js';
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const Y = new THREE.Vector3(0, 1, 0);

// A low-sided, flattened pressure shell. Cross-sections taper independently,
// unlike scaled cylinders: bow, shoulders and exposed rib sections stay legible.
export function hullSection(z0, z1, width0, width1, height0, height1) {
  const outline = [
    [-0.3, 1],
    [0.3, 1],
    [0.85, 0.65],
    [1, 0.1],
    [0.78, -0.65],
    [0.36, -1],
    [-0.36, -1],
    [-0.78, -0.65],
    [-1, 0.1],
    [-0.85, 0.65],
  ];
  const vertices = [];
  for (const [z, width, height] of [
    [z0, width0, height0],
    [z1, width1, height1],
  ])
    for (const [x, y] of outline) vertices.push(x * width, y * height, z);
  const indices = [];
  for (let i = 0; i < outline.length; i += 1) {
    const j = (i + 1) % outline.length;
    indices.push(i, i + 10, j, j, i + 10, j + 10);
  }
  for (let i = 1; i < 9; i += 1) {
    indices.push(0, i, i + 1, 10, i + 11, i + 10);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    'position',
    new THREE.Float32BufferAttribute(vertices, 3),
  );
  geometry.setIndex(indices);
  return geometry.toNonIndexed();
}

function beveledBlock() {
  const shape = new THREE.Shape();
  shape.moveTo(-0.42, -0.5);
  shape.lineTo(0.42, -0.5);
  shape.lineTo(0.5, -0.42);
  shape.lineTo(0.5, 0.42);
  shape.lineTo(0.42, 0.5);
  shape.lineTo(-0.42, 0.5);
  shape.lineTo(-0.5, 0.42);
  shape.lineTo(-0.5, -0.42);
  shape.closePath();
  return new THREE.ExtrudeGeometry(shape, {
    depth: 0.88,
    steps: 1,
    bevelEnabled: true,
    bevelSegments: 1,
    bevelSize: 0.04,
    bevelThickness: 0.06,
    curveSegments: 1,
  })
    .translate(0, 0, -0.44)
    .scale(1 / 1.08, 1 / 1.08, 1);
}

export function createParts() {
  const primitives = {
    box: new THREE.BoxGeometry(1, 1, 1),
    panel: beveledBlock(),
    tube: new THREE.CylinderGeometry(0.5, 0.5, 1, 16),
    taper: new THREE.CylinderGeometry(0.35, 0.5, 1, 16),
    ring: new THREE.TorusGeometry(0.5, 0.075, 8, 40),
    dish: new THREE.SphereGeometry(0.5, 20, 8, 0, Math.PI * 2, 0, Math.PI / 3),
    sphere: new THREE.SphereGeometry(0.5, 20, 12),
  };
  const owned = new Set(Object.values(primitives));
  const entries = [];
  const matrix = new THREE.Matrix4();
  const position = new THREE.Vector3();
  const scale = new THREE.Vector3();
  const rotation = new THREE.Quaternion();

  function add(
    shape,
    material,
    point,
    size = [1, 1, 1],
    euler = [0, 0, 0],
    detail = false,
  ) {
    const geometry = typeof shape === 'string' ? primitives[shape] : shape;
    owned.add(geometry);
    position.fromArray(point);
    scale.fromArray(size);
    rotation.setFromEuler(new THREE.Euler(...euler));
    matrix.compose(position, rotation, scale);
    if (!geometry.boundingBox) geometry.computeBoundingBox();
    entries.push({ geometry, material, matrix: matrix.clone(), detail });
  }

  function beam(material, from, to, width = 1.8, detail = false) {
    const a = new THREE.Vector3(...from);
    const b = new THREE.Vector3(...to);
    const delta = b.clone().sub(a);
    const midpoint = a.add(b).multiplyScalar(0.5);
    rotation.setFromUnitVectors(Y, delta.clone().normalize());
    matrix.compose(
      midpoint,
      rotation,
      new THREE.Vector3(width, delta.length(), width),
    );
    const geometry = primitives.box;
    if (!geometry.boundingBox) geometry.computeBoundingBox();
    entries.push({
      geometry,
      material: material === 'titanium' ? 'structure' : material,
      matrix: matrix.clone(),
      detail,
    });
  }

  return {
    entries,
    add,
    beam,
    dispose: () => {
      for (const geometry of owned) geometry.dispose();
    },
  };
}

export function partBounds(parts, matrix) {
  return transformedPartBounds(parts.entries, matrix);
}

export function compileSite(parts, materials, matrix, name) {
  const buckets = new Map();
  const transform = new THREE.Matrix4();
  for (const entry of parts.entries) {
    const key = `${entry.material}:${entry.detail ? 'detail' : 'structure'}`;
    const bucket = buckets.get(key) ?? {
      material: entry.material,
      detail: entry.detail,
      geometries: [],
    };
    let geometry = entry.geometry.clone();
    if (geometry.index) {
      const original = geometry;
      geometry = geometry.toNonIndexed();
      original.dispose();
    }
    if (!geometry.attributes.normal) geometry.computeVertexNormals();
    for (const attribute of Object.keys(geometry.attributes))
      if (!['position', 'normal'].includes(attribute))
        geometry.deleteAttribute(attribute);
    transform.multiplyMatrices(matrix, entry.matrix);
    geometry.applyMatrix4(transform);
    const points = geometry.attributes.position;
    const normals = geometry.attributes.normal;
    const uv = new Float32Array(points.count * 2);
    for (let i = 0; i < points.count; i += 1) {
      const nx = Math.abs(normals.getX(i));
      const ny = Math.abs(normals.getY(i));
      const nz = Math.abs(normals.getZ(i));
      // World metre-scaled microfinish; no stretched texture on long girders.
      uv[i * 2] = (nx > ny && nx > nz ? points.getZ(i) : points.getX(i)) / 8;
      uv[i * 2 + 1] =
        (ny > nx && ny > nz ? points.getZ(i) : points.getY(i)) / 8;
    }
    geometry.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    bucket.geometries.push(geometry);
    buckets.set(key, bucket);
  }
  const group = new THREE.Group();
  group.name = name;
  const details = [];
  let triangles = 0;
  for (const [key, bucket] of buckets) {
    const geometry = mergeGeometries(bucket.geometries, false);
    for (const part of bucket.geometries) part.dispose();
    geometry.computeBoundingSphere();
    const mesh = new THREE.Mesh(geometry, materials[bucket.material]);
    mesh.name = `${name} / ${key}`;
    mesh.castShadow = !['glass', 'amber', 'solar'].includes(bucket.material);
    mesh.receiveShadow = true;
    mesh.matrixAutoUpdate = false;
    group.add(mesh);
    if (bucket.detail) details.push(mesh);
    triangles += geometry.attributes.position.count / 3;
  }
  return { group, details, triangles, meshes: buckets.size };
}
