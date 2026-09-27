import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import {
  mergeGeometries,
  toCreasedNormals,
} from 'three/addons/utils/BufferGeometryUtils.js';

const Y = new THREE.Vector3(0, 1, 0);

export function mesh(
  parent,
  geometry,
  material,
  position = [0, 0, 0],
  rotation = [0, 0, 0],
) {
  const result = new THREE.Mesh(geometry, material);
  result.position.set(...position);
  result.rotation.set(...rotation);
  result.castShadow = true;
  result.receiveShadow = true;
  parent.add(result);
  return result;
}

export function box(
  parent,
  mat,
  size,
  position = [0, 0, 0],
  radius = 0,
  rotation,
) {
  return mesh(
    parent,
    radius
      ? new RoundedBoxGeometry(...size, 1, radius)
      : new THREE.BoxGeometry(...size),
    mat,
    position,
    rotation,
  );
}

export function cylinder(
  parent,
  mat,
  radius,
  length,
  position,
  rotation,
  segments = 24,
  topRadius = radius,
) {
  return mesh(
    parent,
    new THREE.CylinderGeometry(topRadius, radius, length, segments),
    mat,
    position,
    rotation,
  );
}

export function ball(parent, mat, radius, position, scale) {
  const result = mesh(
    parent,
    new THREE.SphereGeometry(radius, 24, 16),
    mat,
    position,
  );
  if (scale) result.scale.set(...scale);
  return result;
}

export function setBeam(object, start, end) {
  const a = new THREE.Vector3(...start),
    b = new THREE.Vector3(...end);
  const d = b.sub(a);
  object.position.copy(a).addScaledVector(d, 0.5);
  object.scale.y = d.length();
  object.quaternion.setFromUnitVectors(Y, d.normalize());
}

export function beam(parent, mat, start, end, radius = 0.025, segments = 12) {
  const object = cylinder(
    parent,
    mat,
    radius,
    1,
    undefined,
    undefined,
    segments,
  );
  setBeam(object, start, end);
  return object;
}

export function tube(
  parent,
  mat,
  points,
  radius = 0.02,
  segments = 24,
  closed = false,
) {
  const curve = new THREE.CatmullRomCurve3(
    points.map((p) => new THREE.Vector3(...p)),
    closed,
    'centripetal',
  );
  return mesh(
    parent,
    new THREE.TubeGeometry(curve, segments, radius, 8, closed),
    mat,
  );
}

export function ring(
  parent,
  mat,
  radius,
  thickness,
  position,
  rotation,
  radial = 10,
  tubular = 40,
) {
  return mesh(
    parent,
    new THREE.TorusGeometry(radius, thickness, radial, tubular),
    mat,
    position,
    rotation,
  );
}

// An authored closed cross-section swept through longitudinal stations. Each
// station is [z, halfWidth, bottomY, topY]; chamfered sections make formed panels
// with broad highlights, distinct shoulder creases, and a controlled silhouette.
export function loft(parent, mat, stations, { x = 0, bevel = 0.18 } = {}) {
  const vertices = [],
    uvs = [],
    indices = [];
  stations.forEach(([z, width, bottom, top], i) => {
    const h = top - bottom;
    const cross = [
      [-1 + bevel, bottom],
      [1 - bevel, bottom],
      [1, bottom + h * bevel],
      [1, top - h * bevel],
      [1 - bevel, top],
      [-1 + bevel, top],
      [-1, top - h * bevel],
      [-1, bottom + h * bevel],
    ];
    cross.forEach(([cx, y], j) => {
      vertices.push(x + cx * width, y, z);
      uvs.push(j / 7, i / (stations.length - 1));
    });
  });
  for (let i = 0; i < stations.length - 1; i++)
    for (let j = 0; j < 8; j++) {
      const a = i * 8 + j,
        b = i * 8 + ((j + 1) % 8),
        c = a + 8,
        d = b + 8;
      indices.push(a, b, c, b, d, c);
    }
  for (let j = 1; j < 7; j++) {
    indices.push(0, j + 1, j);
    const e = (stations.length - 1) * 8;
    indices.push(e, e + j, e + j + 1);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    'position',
    new THREE.Float32BufferAttribute(vertices, 3),
  );
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  const creased = toCreasedNormals(geometry, Math.PI / 5);
  geometry.dispose();
  return mesh(parent, creased, mat);
}

// Extruded sheet with bevelled stamped edges. Polygon coordinates are the local
// XY face; orient it for a side panel or an angled nose using an ordinary group.
export function panel(
  parent,
  mat,
  outline,
  depth,
  position,
  rotation,
  bevel = 0.015,
) {
  const shape = new THREE.Shape();
  shape.moveTo(...outline[0]);
  for (const point of outline.slice(1)) shape.lineTo(...point);
  shape.closePath();
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth,
    bevelEnabled: bevel > 0,
    bevelSegments: 2,
    steps: 1,
    bevelSize: bevel,
    bevelThickness: bevel,
    curveSegments: 4,
  });
  geometry.translate(0, 0, -depth / 2);
  return mesh(parent, geometry, mat, position, rotation);
}

// Tire cross-section is shaped separately from tread: flat contact band,
// rounded shoulder, full sidewall and recessed bead. Lathe axis becomes X.
export function radialTire(parent, mat, radius, width, bike = false) {
  const profile = bike
    ? [
        [0.65, -0.35],
        [0.68, -0.48],
        [0.82, -0.51],
        [0.94, -0.32],
        [0.985, 0],
        [0.94, 0.32],
        [0.82, 0.51],
        [0.68, 0.48],
        [0.65, 0.35],
      ]
    : [
        [0.57, -0.33],
        [0.6, -0.46],
        [0.76, -0.54],
        [0.91, -0.52],
        [0.967, -0.38],
        [0.98, -0.22],
        [0.98, 0.22],
        [0.967, 0.38],
        [0.91, 0.52],
        [0.76, 0.54],
        [0.6, 0.46],
        [0.57, 0.33],
      ];
  const geometry = new THREE.LatheGeometry(
    profile.map(([r, w]) => new THREE.Vector2(r * radius, w * width)),
    64,
  );
  return mesh(parent, geometry, mat, undefined, [0, 0, Math.PI / 2]);
}

export function bolt(
  parent,
  mat,
  position,
  radius = 0.012,
  rotation = [0, 0, Math.PI / 2],
) {
  return cylinder(parent, mat, radius, radius * 0.65, position, rotation, 6);
}

// Deterministic fine grain. Painted metal, rubber and woven textiles have
// different maps and roughness; no random asset state leaks between replacements.
export function grainTexture(seed = 1, woven = false) {
  const size = 128,
    data = new Uint8Array(size * size * 4);
  let n = seed;
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      n = (n * 1664525 + 1013904223) >>> 0;
      const value =
        190 + (n >>> 27) + (woven ? (x % 4 < 2 !== y % 4 < 2 ? 20 : -20) : 0);
      const i = (y * size + x) * 4;
      data[i] = data[i + 1] = data[i + 2] = value;
      data[i + 3] = 255;
    }
  const texture = new THREE.DataTexture(data, size, size);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(woven ? 5 : 3, woven ? 5 : 3);
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.needsUpdate = true;
  return texture;
}

export function graphic(
  parent,
  text,
  {
    position,
    rotation = [0, 0, 0],
    width = 0.4,
    height = 0.15,
    color = '#eee8d7',
    background = null,
    font = '800',
    small = '',
    border = false,
  } = {},
) {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 192;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  if (background) {
    ctx.fillStyle = background;
    ctx.fillRect(0, 0, 512, 192);
  }
  ctx.fillStyle = color;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `${font} ${small ? 95 : 125}px sans-serif`;
  ctx.fillText(text, 256, small ? 73 : 98, 470);
  if (small) {
    ctx.font = '500 33px sans-serif';
    ctx.fillText(small, 256, 150, 450);
  }
  if (border) {
    ctx.strokeStyle = color;
    ctx.lineWidth = 3;
    ctx.strokeRect(8, 8, 496, 176);
  }
  const map = new THREE.CanvasTexture(canvas);
  map.colorSpace = THREE.SRGBColorSpace;
  map.anisotropy = 4;
  const mat = new THREE.MeshStandardMaterial({
    map,
    transparent: !background,
    roughness: 0.65,
    depthWrite: Boolean(background),
    polygonOffset: true,
    polygonOffsetFactor: -2,
  });
  const object = mesh(
    parent,
    new THREE.PlaneGeometry(width, height),
    mat,
    position,
    rotation,
  );
  object.castShadow = false;
  return object;
}

// Merge only static direct children. Independently moving/hideable subgroups,
// textured graphics and instrument surfaces retain their own resource ownership.
export function batch(group) {
  const byMaterial = new Map();
  for (const child of [...group.children]) {
    if (
      !child.isMesh ||
      child.userData.dynamic ||
      child.material.map ||
      child.material.transparent
    )
      continue;
    child.updateMatrix();
    const geo = child.geometry.index
      ? child.geometry.toNonIndexed()
      : child.geometry.clone();
    geo.applyMatrix4(child.matrix);
    if (!byMaterial.has(child.material)) byMaterial.set(child.material, []);
    byMaterial.get(child.material).push(geo);
    child.geometry.dispose();
    group.remove(child);
  }
  for (const [mat, geometries] of byMaterial) {
    const combined = mergeGeometries(geometries, false);
    geometries.forEach((geo) => geo.dispose());
    if (combined) mesh(group, combined, mat);
  }
}
