import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const up = new THREE.Vector3(0, 1, 0);

export function facadeGeometry(width, depth, height, taper = 1, bevel = 0.1) {
  const x = width / 2;
  const z = depth / 2;
  const bx = width * bevel;
  const bz = depth * bevel;
  const outline = [
    [-x + bx, -z],
    [x - bx, -z],
    [x, -z + bz],
    [x, z - bz],
    [x - bx, z],
    [-x + bx, z],
    [-x, z - bz],
    [-x, -z + bz],
  ];
  const positions = [];
  const uv = [];
  const indices = [];
  let perimeter = 0;
  outline.forEach(([ax, az], i) => {
    const [bx, bz] = outline[(i + 1) % outline.length];
    const edge = Math.hypot(bx - ax, bz - az);
    const n = positions.length / 3;
    positions.push(
      ax,
      0,
      az,
      bx,
      0,
      bz,
      ax * taper,
      height,
      az * taper,
      bx * taper,
      height,
      bz * taper,
    );
    uv.push(
      perimeter / 51.2,
      0,
      (perimeter + edge) / 51.2,
      0,
      perimeter / 51.2,
      height / 134.4,
      (perimeter + edge) / 51.2,
      height / 134.4,
    );
    indices.push(n, n + 2, n + 1, n + 1, n + 2, n + 3);
    perimeter += edge;
  });
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

export function roofGeometry(width, depth, bevel = 0.1) {
  const x = width / 2;
  const z = depth / 2;
  const bx = width * bevel;
  const bz = depth * bevel;
  const shape = new THREE.Shape();
  shape.moveTo(-x + bx, -z);
  shape.lineTo(x - bx, -z);
  shape.lineTo(x, -z + bz);
  shape.lineTo(x, z - bz);
  shape.lineTo(x - bx, z);
  shape.lineTo(-x + bx, z);
  shape.lineTo(-x, z - bz);
  shape.lineTo(-x, -z + bz);
  shape.closePath();
  const geometry = new THREE.ShapeGeometry(shape);
  geometry.rotateX(-Math.PI / 2);
  geometry.computeVertexNormals();
  return geometry;
}

export function createBatches(group, surfaces) {
  const buckets = new Map();
  const owned = new Set();
  const primitives = {
    box: new THREE.BoxGeometry(1, 1, 1),
    plane: new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2),
    cylinder: new THREE.CylinderGeometry(0.5, 0.5, 1, 12),
    cone: new THREE.CylinderGeometry(0.3, 0.5, 1, 8),
    shrub: new THREE.IcosahedronGeometry(0.5, 0),
  };
  const matrix = new THREE.Matrix4();
  const quaternion = new THREE.Quaternion();
  const position = new THREE.Vector3();
  const scale = new THREE.Vector3();
  const color = new THREE.Color();
  let triangleCount = 0;

  function add(
    geometry,
    material,
    x,
    y,
    z,
    w = 1,
    h = 1,
    d = 1,
    yaw = 0,
    detail = false,
    tint = '#ffffff',
    horizon = false,
  ) {
    const cellSize = detail ? 450 : 900;
    const cx = horizon ? 0 : Math.floor(x / cellSize);
    const cz = horizon ? 0 : Math.floor(z / cellSize);
    const key = `${detail ? 'detail' : horizon ? 'horizon' : 'city'}:${cx}:${cz}:${material}`;
    const entry = buckets.get(key) ?? {
      material,
      geometries: [],
      cx,
      cz,
      cellSize,
      detail,
      horizon,
    };
    const transformed = geometry.clone();
    matrix.compose(
      position.set(x, y, z),
      quaternion.setFromAxisAngle(up, yaw),
      scale.set(w, h, d),
    );
    transformed.applyMatrix4(matrix);
    if (!transformed.index)
      transformed.setIndex(
        Array.from(
          { length: transformed.attributes.position.count },
          (_, index) => index,
        ),
      );
    color.set(tint);
    const colors = new Float32Array(transformed.attributes.position.count * 3);
    for (let i = 0; i < colors.length; i += 3) {
      colors[i] = color.r;
      colors[i + 1] = color.g;
      colors[i + 2] = color.b;
    }
    transformed.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    entry.geometries.push(transformed);
    buckets.set(key, entry);
  }

  function primitive(
    shape,
    material,
    x,
    y,
    z,
    w,
    h,
    d,
    yaw = 0,
    detail = false,
    tint = '#ffffff',
    horizon = false,
  ) {
    add(
      primitives[shape],
      material,
      x,
      y,
      z,
      w,
      h,
      d,
      yaw,
      detail,
      tint,
      horizon,
    );
  }

  function finish() {
    let meshCount = 0;
    for (const [key, bucket] of buckets) {
      const geometry = mergeGeometries(bucket.geometries, false);
      for (const part of bucket.geometries) part.dispose();
      geometry.computeBoundingSphere();
      owned.add(geometry);
      triangleCount += geometry.index.count / 3;
      const mesh = new THREE.Mesh(geometry, surfaces[bucket.material]);
      mesh.name = `Halcyon / ${key}`;
      mesh.castShadow =
        ![
          'warm',
          'red',
          'water',
          'vegetation',
          'paint',
          'road',
          'ground',
          'heroGlass',
        ].includes(bucket.material) && !bucket.horizon;
      mesh.receiveShadow = !bucket.horizon;
      mesh.matrixAutoUpdate = false;
      if (bucket.detail) {
        // Detail is grouped spatially; the complete architectural silhouette never disappears.
        const lod = new THREE.LOD();
        lod.position.set(
          (bucket.cx + 0.5) * bucket.cellSize,
          70,
          (bucket.cz + 0.5) * bucket.cellSize,
        );
        mesh.position.copy(lod.position).multiplyScalar(-1);
        mesh.updateMatrix();
        lod.addLevel(mesh, 0);
        lod.addLevel(new THREE.Object3D(), 850, 0.12);
        group.add(lod);
      } else group.add(mesh);
      meshCount += 1;
    }
    buckets.clear();
    for (const geometry of Object.values(primitives)) geometry.dispose();
    return {
      triangleCount,
      meshCount,
      dispose: () => {
        for (const geometry of owned) geometry.dispose();
      },
    };
  }
  return { add, primitive, finish };
}

// Smooth elliptical curtain wall with an oblique mechanical crown. The variable
// top ring produces a genuine sloping silhouette instead of a box with a hat.
export function ellipticalTowerGeometry(width, depth, height, taper = 0.84) {
  const sides = 32;
  const positions = [],
    normals = [],
    uv = [],
    indices = [];
  const roofPositions = [0, height, 0],
    roofIndices = [];
  const circumference =
    Math.PI * Math.sqrt((width * width + depth * depth) / 2);
  for (let i = 0; i <= sides; i += 1) {
    const angle = (i / sides) * Math.PI * 2;
    const x = (Math.cos(angle) * width) / 2,
      z = (Math.sin(angle) * depth) / 2;
    const top = height + Math.cos(angle) * Math.min(16, height * 0.075);
    positions.push(x, 0, z, x * taper, top, z * taper);
    const normal = new THREE.Vector3(
      Math.cos(angle) / width,
      (1 - taper) / height,
      Math.sin(angle) / depth,
    ).normalize();
    normals.push(normal.x, normal.y, normal.z, normal.x, normal.y, normal.z);
    uv.push(
      ((i / sides) * circumference) / 51.2,
      0,
      ((i / sides) * circumference) / 51.2,
      top / 134.4,
    );
    roofPositions.push(x * taper, top, z * taper);
    if (i < sides) {
      const n = i * 2;
      indices.push(n, n + 1, n + 2, n + 2, n + 1, n + 3);
      roofIndices.push(0, i + 2, i + 1);
    }
  }
  const walls = new THREE.BufferGeometry();
  walls.setAttribute(
    'position',
    new THREE.Float32BufferAttribute(positions, 3),
  );
  walls.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  walls.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  walls.setIndex(indices);
  const roof = new THREE.BufferGeometry();
  roof.setAttribute(
    'position',
    new THREE.Float32BufferAttribute(roofPositions, 3),
  );
  roof.setAttribute(
    'uv',
    new THREE.Float32BufferAttribute(
      Array((roofPositions.length / 3) * 2).fill(0),
      2,
    ),
  );
  roof.setIndex(roofIndices);
  roof.computeVertexNormals();
  return { walls, roof };
}
