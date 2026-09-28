import * as THREE from 'three';
import { framePoint } from './model.js';

// Sweep individual profile faces so precast corners retain hard normal edges.
export function sweepGeometry(
  track,
  profile,
  { start = 0, end = track.length, step = 6, uvScale = 16 } = {},
) {
  const count = Math.ceil((end - start) / step);
  const positions = [];
  const uv = [];
  const indices = [];
  const frames = Array.from({ length: count + 1 }, (_, index) =>
    track.sample(start + ((end - start) * index) / count),
  );
  for (let face = 0; face < profile.length - 1; face += 1) {
    const vertexStart = positions.length / 3;
    const [ax, ay] = profile[face];
    const [bx, by] = profile[face + 1];
    for (let index = 0; index <= count; index += 1) {
      for (const [x, y, u] of [
        [ax, ay, 0],
        [bx, by, 1],
      ]) {
        const point = framePoint(frames[index], x, y);
        positions.push(point.x, point.y, point.z);
        uv.push(u, (start + ((end - start) * index) / count) / uvScale);
      }
      if (index < count) {
        const n = vertexStart + index * 2;
        indices.push(n, n + 2, n + 1, n + 1, n + 2, n + 3);
      }
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    'position',
    new THREE.Float32BufferAttribute(positions, 3),
  );
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
}

export function boxProfile(x, y, width, height) {
  return [
    [x - width / 2, y + height / 2],
    [x + width / 2, y + height / 2],
    [x + width / 2, y - height / 2],
    [x - width / 2, y - height / 2],
    [x - width / 2, y + height / 2],
  ];
}

export function beamTransform(start, end, thickness = 1, depth = thickness) {
  const direction = end.clone().sub(start);
  return {
    position: start.clone().add(end).multiplyScalar(0.5),
    quaternion: new THREE.Quaternion().setFromUnitVectors(
      new THREE.Vector3(0, 1, 0),
      direction.clone().normalize(),
    ),
    scale: new THREE.Vector3(thickness, direction.length(), depth),
  };
}

export function seededRandom(seed) {
  let state = seed >>> 0;
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return (state >>> 0) / 4294967296;
  };
}

export function surfaceTexture(kind) {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const context = canvas.getContext('2d');
  const data = context.createImageData(512, 512);
  const random = seededRandom(kind === 'road' ? 1089 : 2719);
  const base = kind === 'road' ? 96 : 198;
  for (let pixel = 0; pixel < 512 * 512; pixel += 1) {
    const grit = Math.floor((random() - 0.5) * (kind === 'road' ? 12 : 10));
    const x = pixel % 512;
    const y = Math.floor(pixel / 512);
    const fineVariation =
      kind === 'road'
        ? Math.sin(y * 0.015) * 2 + Math.cos(x * 0.05) * 2
        : Math.sin(x * 0.03) * 4;
    const value = base + grit + fineVariation;
    data.data[pixel * 4] = value;
    data.data[pixel * 4 + 1] = value + (kind === 'road' ? 4 : 1);
    data.data[pixel * 4 + 2] = value + (kind === 'road' ? 5 : -5);
    data.data[pixel * 4 + 3] = 255;
  }
  context.putImageData(data, 0, 0);
  if (kind === 'road') {
    context.fillStyle = 'rgba(17,27,34,.28)';
    for (const x of [7, 170, 341, 503]) context.fillRect(x, 0, 1.1, 512);
    context.fillRect(0, 0, 512, 1);
    for (const x of [112, 175, 334, 398]) {
      const wear = context.createLinearGradient(x - 22, 0, x + 22, 0);
      wear.addColorStop(0, 'rgba(28,33,37,0)');
      wear.addColorStop(0.5, 'rgba(28,33,37,.12)');
      wear.addColorStop(1, 'rgba(28,33,37,0)');
      context.fillStyle = wear;
      context.fillRect(x - 22, 0, 44, 512);
    }
    context.strokeStyle = 'rgba(180,192,196,.08)';
    context.lineWidth = 0.5;
    for (let i = 0; i < 100; i += 1) {
      const x = random() * 512;
      const y = random() * 512;
      context.beginPath();
      context.moveTo(x, y);
      context.lineTo(x + random() * 2, y + 5 + random() * 25);
      context.stroke();
    }
  } else {
    context.fillStyle = 'rgba(74,77,69,.2)';
    context.fillRect(0, 0, 512, 2);
    context.fillRect(0, 0, 1, 512);
    for (const x of [22, 488])
      for (const y of [24, 487]) {
        context.beginPath();
        context.arc(x, y, 2.2, 0, Math.PI * 2);
        context.fill();
      }
    for (let i = 0; i < 24; i += 1) {
      context.fillStyle = `rgba(68,80,79,${0.015 + random() * 0.022})`;
      context.fillRect(random() * 512, 0, 3 + random() * 14, 512);
    }
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  return texture;
}

export function roadRoughnessTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const context = canvas.getContext('2d');
  const data = context.createImageData(512, 512);
  const random = seededRandom(8031);
  for (let pixel = 0; pixel < 512 * 512; pixel += 1) {
    const x = pixel % 512;
    const y = Math.floor(pixel / 512);
    let value = 221 + (random() - 0.5) * 12;
    for (const line of [113, 176, 334, 398]) {
      value -=
        Math.exp(-((x - line) ** 2) / 360) * (21 + Math.sin(y * 0.013) * 4);
    }
    for (let channel = 0; channel < 3; channel += 1)
      data.data[pixel * 4 + channel] = value;
    data.data[pixel * 4 + 3] = 255;
  }
  context.putImageData(data, 0, 0);
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.anisotropy = 8;
  return texture;
}

export function signTexture(main, secondary, direction = 0) {
  const canvas = document.createElement('canvas');
  const arrowsOnly = !main && !secondary;
  canvas.width = arrowsOnly ? 512 : 1024;
  canvas.height = arrowsOnly ? 256 : 192;
  const context = canvas.getContext('2d');
  context.fillStyle = '#14222b';
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = '#d5603f';
  context.fillRect(0, 0, 14, 192);
  context.fillStyle = '#e9e5d7';
  context.font = '600 68px sans-serif';
  context.textBaseline = 'top';
  context.fillText(main, 40, 23, direction ? 720 : 942);
  context.fillStyle = '#a8b7b8';
  context.font = '500 27px monospace';
  context.fillText(secondary, 43, 128, 934);
  if (direction) {
    context.strokeStyle = '#e6b571';
    context.lineWidth = arrowsOnly ? 20 : 12;
    context.lineJoin = 'miter';
    const arrowWidth = arrowsOnly ? 67 : 31;
    for (const x of arrowsOnly ? [76, 225, 374] : [806, 873, 940]) {
      const offset = direction > 0 ? 0 : arrowWidth;
      context.beginPath();
      context.moveTo(x + offset, arrowsOnly ? 38 : 34);
      context.lineTo(x + arrowWidth - offset, arrowsOnly ? 128 : 70);
      context.lineTo(x + offset, arrowsOnly ? 218 : 106);
      context.stroke();
    }
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  return texture;
}

// Expansion seals follow the actual rendered triangle planes, rather than the
// ideal spline frame. A straight box intersects the tessellated road on banks
// and grades, producing alternating exposed/buried pixels as the camera moves.
export function roadSealGeometry(
  track,
  surface,
  { spacing = 36, breadth = 0.078, offset = 0.008 } = {},
) {
  const attribute = surface.getAttribute('position');
  const segments = attribute.count / 2 - 1;
  const step = track.length / segments;
  const positions = [];
  const normals = [];
  const edgeInset = 0.02 / track.width;
  const point = (index) =>
    new THREE.Vector3().fromBufferAttribute(attribute, index);
  const clip = (polygon, axis, limit, keepAbove) => {
    const result = [];
    for (let i = 0; i < polygon.length; i += 1) {
      const a = polygon[i];
      const b = polygon[(i + 1) % polygon.length];
      const insideA = keepAbove ? a[axis] >= limit : a[axis] <= limit;
      const insideB = keepAbove ? b[axis] >= limit : b[axis] <= limit;
      if (insideA) result.push(a);
      if (insideA !== insideB) {
        const fraction = (limit - a[axis]) / (b[axis] - a[axis]);
        result.push({
          u: THREE.MathUtils.lerp(a.u, b.u, fraction),
          v: THREE.MathUtils.lerp(a.v, b.v, fraction),
          position: a.position.clone().lerp(b.position, fraction),
        });
      }
    }
    return result;
  };
  for (let distance = 0; distance < track.length; distance += spacing) {
    const start = distance - breadth / 2;
    const end = distance + breadth / 2;
    const bands = [[Math.max(0, start), Math.min(track.length, end)]];
    if (start < 0) bands.push([track.length + start, track.length]);
    if (end > track.length) bands.push([0, end - track.length]);
    for (const [from, to] of bands) {
      const first = Math.max(0, Math.floor(from / step));
      const last = Math.min(segments - 1, Math.floor(to / step));
      for (let segment = first; segment <= last; segment += 1) {
        const vertices = [
          { u: 0, v: 0, position: point(segment * 2) },
          { u: 1, v: 0, position: point(segment * 2 + 1) },
          { u: 0, v: 1, position: point(segment * 2 + 2) },
          { u: 1, v: 1, position: point(segment * 2 + 3) },
        ];
        for (const triangle of [
          [0, 2, 1],
          [1, 2, 3],
        ]) {
          let polygon = triangle.map((index) => vertices[index]);
          const normal = new THREE.Vector3()
            .crossVectors(
              polygon[1].position.clone().sub(polygon[0].position),
              polygon[2].position.clone().sub(polygon[0].position),
            )
            .normalize();
          for (const [axis, limit, keepAbove] of [
            ['v', (from - segment * step) / step, true],
            ['v', (to - segment * step) / step, false],
            ['u', edgeInset, true],
            ['u', 1 - edgeInset, false],
          ]) {
            if (!polygon.length) break;
            polygon = clip(polygon, axis, limit, keepAbove);
          }
          for (let i = 1; i < polygon.length - 1; i += 1) {
            for (const vertex of [polygon[0], polygon[i], polygon[i + 1]]) {
              const lifted = vertex.position
                .clone()
                .addScaledVector(normal, offset);
              positions.push(lifted.x, lifted.y, lifted.z);
              normals.push(normal.x, normal.y, normal.z);
            }
          }
        }
      }
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    'position',
    new THREE.Float32BufferAttribute(positions, 3),
  );
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geometry.computeBoundingSphere();
  return geometry;
}
