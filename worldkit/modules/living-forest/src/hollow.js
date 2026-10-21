import * as T from 'three';
import { createWoodGeometry, mergeParts } from './geometry.js';

const TAU = Math.PI * 2;
const clamp = (v) => Math.max(0, Math.min(1, v));
const asVector = (p) => p?.isVector3 ? p.clone() : new T.Vector3(...p);
const parameterKey = (p) => `${Math.round(((p.u % TAU + TAU) % TAU) * 1e8)},${Math.round(p.v * 1e8)}`;

// Exact shortest distance between two finite segments, including parallel pairs.
function segmentDistanceSquared(p, q, route) {
  const dx = q.x - p.x, dy = q.y - p.y, dz = q.z - p.z;
  const rx = p.x - route.x, ry = p.y - route.y, rz = p.z - route.z;
  const a = dx * dx + dy * dy + dz * dz;
  const b = dx * route.dx + dy * route.dy + dz * route.dz;
  const c = dx * rx + dy * ry + dz * rz;
  const f = route.dx * rx + route.dy * ry + route.dz * rz;
  const denominator = a * route.lengthSquared - b * b;
  let s = denominator > 1e-9 ? clamp((b * f - c * route.lengthSquared) / denominator) : 0;
  let t = (b * s + f) / route.lengthSquared;
  if (t < 0) { t = 0; s = clamp(-c / a); }
  else if (t > 1) { t = 1; s = clamp((b - c) / a); }
  return (rx + s * dx - t * route.dx) ** 2 + (ry + s * dy - t * route.dy) ** 2 + (rz + s * dz - t * route.dz) ** 2;
}

function makeRoute(points, center, radius, base, top, clearance) {
  const route = [];
  for (let i = 0; i < points.length - 1; i++) {
    const a = asVector(points[i]).sub(center), b = asVector(points[i + 1]).sub(center);
    const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z;
    const lengthSquared = dx * dx + dy * dy + dz * dz;
    if (lengthSquared < 1e-8) continue;
    const reach = radius + 140 + clearance;
    if (Math.min(a.x, b.x) > reach || Math.max(a.x, b.x) < -reach || Math.min(a.z, b.z) > reach || Math.max(a.z, b.z) < -reach || Math.min(a.y, b.y) > top + 80 + clearance || Math.max(a.y, b.y) < base - clearance) continue;
    route.push({ x: a.x, y: a.y, z: a.z, dx, dy, dz, lengthSquared });
  }
  return route;
}

function finishGeometry(positions, uvs, colors, indices) {
  const geometry = new T.BufferGeometry();
  geometry.setAttribute('position', new T.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new T.Float32BufferAttribute(uvs, 2));
  geometry.setAttribute('color', new T.Float32BufferAttribute(colors, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals(); geometry.computeBoundingBox(); geometry.computeBoundingSphere();
  return geometry;
}

/**
 * Fresh parametric landmark, independent of game assets or route implementations.
 * center and routePoints are world coordinates; base/top are heights relative to
 * center. Materials are borrowed. dispose() releases only generated geometry.
 * Radius is the main outer shell radius, not the driving spiral radius.
 */
export function createLivingHollow({
  center = [0, 0, 0], radius = 184, base = -100, top = 410,
  routePoints = [], clearance = 36, materials,
  radialSegments = 192, heightSegments = 112, seed = 19,
} = {}) {
  if (!materials?.bark || !materials?.inner || !materials?.rim) throw new Error('Living hollow requires bark, inner and rim materials');
  if (!(radius > 40) || !(top > base + 100) || !(clearance > 0)) throw new Error('Living hollow dimensions are invalid');
  radialSegments = Math.max(160, Math.floor(radialSegments));
  heightSegments = Math.max(80, Math.floor(heightSegments));
  const origin = asVector(center), height = top - base;
  const route = makeRoute(routePoints, origin, radius, base, top, clearance);
  // Grid chords are slightly inside the analytic shell. Keep an explicit margin
  // so clipped triangles and rounded edges remain outside the requested volume.
  const cutClearance = clearance + 3.5;
  const interiorRoute = route.flatMap((segment) => [0, 0.5, 1].map((t) => ({x: segment.x + segment.dx * t, y: segment.y + segment.dy * t, z: segment.z + segment.dz * t}))).filter((point) => Math.hypot(point.x, point.z) < radius - 55);
  const shell = (u, v) => {
    const twist = u + v * 0.19 + 0.09 * Math.sin(v * 3 + seed);
    const distanceAngle = (a, b) => Math.atan2(Math.sin(a - b), Math.cos(a - b));
    // Unequal root shoulders are the landmark's primary shapes. They persist up
    // into the trunk instead of collapsing to a regular cylinder above ground.
    const shoulders = [[0.18, 51, 0.17], [1.42, 34, 0.27], [2.35, 63, 0.14], [3.72, 43, 0.22], [5.10, 57, 0.18]];
    let shoulder = 0, root = 0;
    for (const [angle, strength, width] of shoulders) {
      const d = distanceAngle(twist, angle);
      shoulder += strength * Math.exp(-0.5 * (d / width) ** 2) * (1 - v * 0.43);
      root += strength * 1.65 * Math.exp(-0.5 * (d / (width * 1.27)) ** 2) * Math.exp(-v * 5.1);
    }
    const minorRib = Math.cos(twist * 15 + 0.5 * Math.sin(v * 6 + u * 2));
    const main = radius * (1 - 0.22 * v + 0.055 * Math.sin(v * Math.PI));
    const crown = 29 * Math.sin(u * 3 + 0.6) + 17 * Math.sin(u * 7 - 0.4) + 24 * Math.pow(Math.max(0, Math.cos(u * 5 + 1.2)), 5);
    const y = base + v * (height + crown);
    const leanX = 11 * Math.sin(v * 2.1) + 10 * v * v;
    const leanZ = -9 * Math.sin(v * 1.7);
    let outerRadius = main - 9 + shoulder + root + 6.5 * minorRib + 4 * Math.sin(u * 3 - v * 4);
    const fold = 16 * Math.sin(u * 5 + v * 2.8 + 0.6) + 8 * Math.sin(u * 3 - v * 4.1);
    // Two broad oblique cambium shelves grow out of the inner wall. Their height
    // and arc coverage differ; neither reads as a circular architectural tier.
    const shelfA = 17 * Math.exp(-1 * ((y - (base + height * 0.43 + Math.sin(u * 2 + 1) * 34)) / 21) ** 2) * Math.pow(Math.max(0, Math.cos(u - 0.6)), 3);
    const shelfB = 14 * Math.exp(-1 * ((y - (base + height * 0.64 + Math.cos(u * 2) * 47)) / 29) ** 2) * Math.pow(Math.max(0, Math.cos(u - 3.4)), 3);
    let innerRadius = Math.min(outerRadius - 10, Math.max(main - 39, main - 20 + fold - shelfA - shelfB + root * 0.09));
    // Fold the inner wood around the protected interior route, rather than
    // allowing protruding folds to generate extra circular safety windows.
    const reserve = cutClearance + 6, cos = Math.cos(u), sin = Math.sin(u);
    for (const point of interiorRoute) {
      const dy = point.y - y;
      if (Math.abs(dy) >= reserve) continue;
      const x = point.x - leanX, z = point.z - leanZ;
      const parallel = x * cos + z * sin;
      const perpendicularSquared = x * x + z * z - parallel * parallel + dy * dy;
      if (perpendicularSquared < reserve * reserve)
        innerRadius = Math.max(innerRadius, parallel + Math.sqrt(reserve * reserve - perpendicularSquared));
    }
    outerRadius = Math.max(outerRadius, innerRadius + 10);
    const shade = 0.45 + 0.38 * T.MathUtils.clamp(shoulder / 40, 0, 1) + 0.15 * (0.5 + minorRib * 0.5);
    return {
      outer: new T.Vector3(leanX + Math.cos(u) * outerRadius, y, leanZ + Math.sin(u) * outerRadius),
      inner: new T.Vector3(leanX + Math.cos(u) * innerRadius, y, leanZ + Math.sin(u) * innerRadius),
      shade, u, v,
    };
  };
  const field = (pair) => {
    let squared = Infinity, nearestSegment;
    for (const segment of route) {
      const value = segmentDistanceSquared(pair.outer, pair.inner, segment);
      if (value < squared) { squared = value; nearestSegment = segment; }
    }
    if (!nearestSegment) return Infinity;
    const middle = pair.outer.clone().lerp(pair.inner, 0.5);
    const segment = nearestSegment;
    const t = clamp(((middle.x - segment.x) * segment.dx + (middle.y - segment.y) * segment.dy + (middle.z - segment.z) * segment.dz) / segment.lengthSquared);
    const nearX = segment.x + segment.dx * t, nearY = segment.y + segment.dy * t, nearZ = segment.z + segment.dz * t;
    const dx = middle.x - nearX, dy = middle.y - nearY, dz = middle.z - nearZ;
    const distance = Math.max(1, Math.hypot(dx, dy, dz));
    const side = (dx * segment.dz - dz * segment.dx) / (Math.max(1, Math.hypot(segment.dx, segment.dz)) * distance);
    const above = Math.max(0, dy / distance);
    // Only actual crossings get the rising, asymmetric arch. The spiral deeper
    // inside retains the plain safety capsule, avoiding accidental side windows.
    const portalWeight = T.MathUtils.smoothstep(Math.hypot(nearX, nearZ), radius - 58, radius - 20);
    const arch = 3 + 6 * (0.5 + 0.5 * Math.sin(pair.u * 5 + pair.v * 8)) + 24 * above * (0.65 + 0.35 * Math.sin(pair.u * 3 + 0.8)) + 12 * Math.max(0, side);
    return Math.sqrt(squared) - cutClearance - portalWeight * arch;
  };
  const sample = (u, v) => {
    const pair = shell(u, v);
    return { u, v, pair, value: field(pair) };
  };
  const vertices = [];
  for (let j = 0; j <= heightSegments; j++)
    for (let i = 0; i <= radialSegments; i++) vertices.push(sample(i / radialSegments * TAU, j / heightSegments));

  const intersections = new Map(), rimEdges = new Map(), polygons = [];
  const crossing = (a, b) => {
    const keys = [parameterKey(a), parameterKey(b)].sort();
    const key = keys.join('|');
    if (intersections.has(key)) return intersections.get(key);
    let lo = 0, hi = 1, middle;
    for (let step = 0; step < 15; step++) {
      const t = (lo + hi) * 0.5;
      middle = sample(T.MathUtils.lerp(a.u, b.u, t), T.MathUtils.lerp(a.v, b.v, t));
      if ((middle.value >= 0) === (a.value >= 0)) lo = t;
      else hi = t;
    }
    middle.boundary = true;
    intersections.set(key, middle);
    return middle;
  };
  const clip = (triangle) => {
    const polygon = [];
    for (let i = 0; i < 3; i++) {
      const a = triangle[i], b = triangle[(i + 1) % 3];
      if (a.value >= 0) polygon.push(a);
      if ((a.value >= 0) !== (b.value >= 0)) polygon.push(crossing(a, b));
    }
    if (polygon.length < 3) return;
    polygons.push(polygon);
    for (let i = 0; i < polygon.length; i++) {
      const a = polygon[i], b = polygon[(i + 1) % polygon.length];
      if (!a.boundary || !b.boundary) continue;
      const key = [parameterKey(a), parameterKey(b)].sort().join('|');
      rimEdges.set(key, [a, b]);
    }
  };
  for (let j = 0; j < heightSegments; j++) for (let i = 0; i < radialSegments; i++) {
    const a = j * (radialSegments + 1) + i, b = a + radialSegments + 1;
    clip([vertices[a], vertices[b], vertices[a + 1]]);
    clip([vertices[a + 1], vertices[b], vertices[b + 1]]);
  }
  const makeSkin = (inner) => {
    const positions = [], uvs = [], colors = [], indices = [], lookup = new Map();
    const put = (vertex) => {
      const key = `${Math.round(vertex.u * 1e8)},${Math.round(vertex.v * 1e8)}`;
      if (lookup.has(key)) return lookup.get(key);
      const point = inner ? vertex.pair.inner : vertex.pair.outer;
      const index = positions.length / 3;
      positions.push(point.x, point.y, point.z); uvs.push(vertex.u * radius / 11, (point.y - base) / 11);
      const shade = inner ? 0.61 + 0.26 * vertex.pair.shade : vertex.pair.shade;
      colors.push(shade, shade, shade * 0.96); lookup.set(key, index);
      return index;
    };
    for (const polygon of polygons) {
      const first = put(polygon[0]);
      for (let i = 1; i < polygon.length - 1; i++)
        if (inner) indices.push(first, put(polygon[i + 1]), put(polygon[i]));
        else indices.push(first, put(polygon[i]), put(polygon[i + 1]));
    }
    return finishGeometry(positions, uvs, colors, indices);
  };
  const outerGeometry = makeSkin(false), innerGeometry = makeSkin(true);

  // Both cut portal boundaries and the ragged open crown get a continuous rolled
  // wall section. Portal profiles retreat into solid wood, away from the road.
  const boundaryEdges = [...rimEdges.values()];
  for (let i = 0; i < radialSegments; i++) {
    const a = vertices[heightSegments * (radialSegments + 1) + i];
    const b = vertices[heightSegments * (radialSegments + 1) + i + 1];
    if (a.value >= 0 && b.value >= 0) boundaryEdges.push([a, b]);
  }
  const profile = [0, 0.07, 0.22, 0.5, 0.78, 0.93, 1];
  const profileSamples = new Map();
  const sampleProfile = (vertex) => {
    const key = parameterKey(vertex);
    if (profileSamples.has(key)) return profileSamples.get(key);
    const pair = vertex.pair, du = 0.0007, dv = 0.0004;
    let retreat;
    if (vertex.boundary) {
      const uNext = shell(vertex.u + du, vertex.v), vNext = shell(vertex.u, Math.min(1, vertex.v + dv));
      const tangentU = uNext.outer.clone().sub(pair.outer).normalize();
      const tangentV = vNext.outer.clone().sub(pair.outer).normalize();
      const gradientU = (field(uNext) - vertex.value) / Math.max(0.001, uNext.outer.distanceTo(pair.outer));
      const gradientV = (field(vNext) - vertex.value) / Math.max(0.001, vNext.outer.distanceTo(pair.outer));
      retreat = tangentU.multiplyScalar(gradientU).addScaledVector(tangentV, gradientV).normalize();
    } else retreat = new T.Vector3(0, -1, 0);
    const thickness = pair.outer.distanceTo(pair.inner), amplitude = Math.min(22, thickness * 0.38);
    const points = profile.map((t) => pair.outer.clone().lerp(pair.inner, t).addScaledVector(retreat, Math.sin(t * Math.PI) * amplitude));
    const result = {points, retreat}; profileSamples.set(key, result); return result;
  };
  // Unwrap each closed boundary by measured arc length. Adding angle and
  // height collapses UV area where a diagonal jamb travels in opposite axes.
  const boundaryNodes = new Map();
  for (const [a, b] of boundaryEdges) {
    const ka = parameterKey(a), kb = parameterKey(b);
    if (!boundaryNodes.has(ka)) boundaryNodes.set(ka, {vertex: a, neighbors: new Set()});
    if (!boundaryNodes.has(kb)) boundaryNodes.set(kb, {vertex: b, neighbors: new Set()});
    boundaryNodes.get(ka).neighbors.add(kb); boundaryNodes.get(kb).neighbors.add(ka);
  }
  const charts = new Map(), uncharted = new Set(boundaryNodes.keys());
  const middleOf = (key) => sampleProfile(boundaryNodes.get(key).vertex).points[3];
  const distanceAlong = (a, b) => {
    const first = sampleProfile(boundaryNodes.get(a).vertex).points;
    const next = sampleProfile(boundaryNodes.get(b).vertex).points;
    // Use the longest row span so every rendered triangle gets enough texture
    // area even where the rounded wound bends more sharply than its wall edges.
    return Math.max(...first.map((point, i) => point.distanceTo(next[i])));
  };
  while (uncharted.size) {
    // Put the single unavoidable texture seam at the bottom of each opening.
    const start = [...uncharted].sort((a, b) => middleOf(a).y - middleOf(b).y)[0];
    const chart = {perimeter: 0, closed: false};
    let current = start, previous = null, distance = 0;
    while (current && uncharted.has(current)) {
      uncharted.delete(current);
      charts.set(current, {chart, distance});
      const next = [...boundaryNodes.get(current).neighbors].find((key) => key !== previous);
      if (!next) break;
      distance += distanceAlong(current, next);
      if (next === start) { chart.closed = true; break; }
      previous = current; current = next;
    }
    chart.perimeter = distance;
  }
  const positions = [], uvs = [], colors = [], indices = [], lookup = new Map();
  const retreats = new Map();
  const putProfile = (vertex, along) => {
    const key = `${parameterKey(vertex)}:${Math.round(along * 1e7)}`;
    if (lookup.has(key)) return lookup.get(key);
    const start = positions.length / 3;
    const {points, retreat} = sampleProfile(vertex);
    let acrossDistance = 0, previousPoint;
    for (let row = 0; row < profile.length; row++) {
      const point = points[row];
      positions.push(point.x, point.y, point.z);
      if (previousPoint) acrossDistance += point.distanceTo(previousPoint);
      previousPoint = point;
      uvs.push(along / 11, acrossDistance / 11);
      const shade = [0.62, 0.79, 0.94, 1, 0.93, 0.78, 0.64][row] * (0.92 + 0.08 * Math.sin(vertex.u * 7 + vertex.v * 13));
      colors.push(shade, shade, shade);
    }
    lookup.set(key, start); retreats.set(start, retreat); return start;
  };
  for (const [a, b] of boundaryEdges) {
    const ca = charts.get(parameterKey(a)), cb = charts.get(parameterKey(b));
    let alongA = ca.distance, alongB = cb.distance;
    if (ca.chart.closed && Math.abs(alongA - alongB) > ca.chart.perimeter * 0.5) {
      if (alongA < alongB) alongA += ca.chart.perimeter;
      else alongB += ca.chart.perimeter;
    }
    const first = putProfile(a, alongA), next = putProfile(b, alongB);
    const middle = new T.Vector3().fromArray(positions, (first + 3) * 3);
    const side = new T.Vector3().fromArray(positions, (next + 3) * 3).sub(middle);
    const across = new T.Vector3().fromArray(positions, (first + 4) * 3).sub(middle);
    const expected = retreats.get(first).clone().add(retreats.get(next)).negate();
    const reverse = new T.Vector3().crossVectors(side, across).dot(expected) < 0;
    for (let row = 0; row < profile.length - 1; row++) {
      const x = first + row, y = next + row;
      if (reverse) indices.push(x, x + 1, y, x + 1, y + 1, y);
      else indices.push(x, y, x + 1, x + 1, y, y + 1);
    }
  }
  const rimGeometry = finishGeometry(positions, uvs, colors, indices);
  // Match each rim attachment to the actual fluted shell normal. Retaining
  // separate material draws does not leave a hard shading ring at the seam.
  const positionKey = (x, y, z) => `${Math.round(x * 1000)},${Math.round(y * 1000)},${Math.round(z * 1000)}`;
  const shellNormals = [outerGeometry, innerGeometry].map((geometry) => {
    const map = new Map(), position = geometry.attributes.position, normal = geometry.attributes.normal;
    for (let i = 0; i < position.count; i++) {
      const key = positionKey(position.getX(i), position.getY(i), position.getZ(i));
      const value = new T.Vector3().fromBufferAttribute(normal, i);
      if (map.has(key)) map.get(key).add(value).normalize(); else map.set(key, value);
    }
    return map;
  });
  const position = rimGeometry.attributes.position, normal = rimGeometry.attributes.normal;
  // Chart seams duplicate positions only. Average their normals so the UV split
  // cannot create a new lighting seam on an otherwise continuous profile.
  const seamNormals = new Map();
  for (let i = 0; i < position.count; i++) {
    const key = positionKey(position.getX(i), position.getY(i), position.getZ(i));
    const value = new T.Vector3().fromBufferAttribute(normal, i);
    if (seamNormals.has(key)) seamNormals.get(key).add(value); else seamNormals.set(key, value);
  }
  for (const value of seamNormals.values()) value.normalize();
  for (let i = 0; i < position.count; i++) {
    const value = seamNormals.get(positionKey(position.getX(i), position.getY(i), position.getZ(i)));
    normal.setXYZ(i, value.x, value.y, value.z);
  }
  for (let i = 0; i < position.count; i++) {
    const row = i % profile.length;
    if (row !== 0 && row !== profile.length - 1) continue;
    const key = positionKey(position.getX(i), position.getY(i), position.getZ(i));
    const value = shellNormals[row === 0 ? 0 : 1].get(key);
    if (value) normal.setXYZ(i, value.x, value.y, value.z);
  }

  const group = new T.Group(); group.name = 'Living Forest / ancient hollow cathedral'; group.position.copy(origin);
  const geometries = [outerGeometry, innerGeometry, rimGeometry];
  const attach = (geometry, material, name) => {
    const mesh = new T.Mesh(geometry, material); mesh.name = name;
    mesh.castShadow = true; mesh.receiveShadow = true; group.add(mesh);
    return mesh;
  };
  attach(outerGeometry, materials.bark, 'Living Forest / continuous buttressed outer bark');
  attach(innerGeometry, materials.inner, 'Living Forest / living inner cambium');
  attach(rimGeometry, materials.rim, 'Living Forest / rolled portal wounds and broken crown');

  const branches = [];
  for (let i = 0; i < 6; i++) {
    const angle = i / 6 * TAU + 0.27, v = 0.71 + 0.08 * Math.sin(i * 2.4);
    const attachment = shell(angle, v).outer;
    const outward = new T.Vector3(Math.cos(angle), 0, Math.sin(angle));
    const lateral = new T.Vector3(-Math.sin(angle), 0, Math.cos(angle));
    const reach = 96 + 39 * (0.5 + 0.5 * Math.sin(i * 3.2));
    const points = [attachment.clone().addScaledVector(outward, -15), attachment.clone().addScaledVector(outward, 32).add(new T.Vector3(0, 8, 0)), attachment.clone().addScaledVector(outward, reach * 0.7).addScaledVector(lateral, 16).add(new T.Vector3(0, 49, 0)), attachment.clone().addScaledVector(outward, reach).addScaledVector(lateral, 29).add(new T.Vector3(0, 86, 0))];
    const candidate = createWoodGeometry(points, [22, 18, 10, 1.6], { segments: 36, sides: 24, lobes: 7, seed: seed + i, fluting: 0.13 });
    const p = candidate.attributes.position, from = new T.Vector3(), to = new T.Vector3();
    let safe = true;
    for (let index = 0; index < p.count && safe; index++) {
      from.fromBufferAttribute(p, index); to.copy(from).addScalar(0.0001);
      for (const segment of route) if (segmentDistanceSquared(from, to, segment) < (clearance + 3.5) ** 2) { safe = false; break; }
    }
    if (safe) branches.push(candidate); else candidate.dispose();
  }
  if (branches.length) {
    const geometry = mergeParts(branches); geometries.push(geometry);
    attach(geometry, materials.bark, 'Living Forest / attached ascending crown boughs');
  }
  let disposed = false;
  const portalAdjacency = new Map();
  for (const [a, b] of rimEdges.values()) {
    const ka = parameterKey(a), kb = parameterKey(b);
    if (!portalAdjacency.has(ka)) portalAdjacency.set(ka, new Set());
    if (!portalAdjacency.has(kb)) portalAdjacency.set(kb, new Set());
    portalAdjacency.get(ka).add(kb); portalAdjacency.get(kb).add(ka);
  }
  const remaining = new Set(portalAdjacency.keys());
  let portalLoops = 0;
  while (remaining.size) {
    portalLoops++;
    const stack = [remaining.values().next().value]; remaining.delete(stack[0]);
    while (stack.length) for (const next of portalAdjacency.get(stack.pop())) if (remaining.delete(next)) stack.push(next);
  }
  const metrics = {
    source: 'fresh-living-forest', radialSegments, heightSegments,
    portalEdges: rimEdges.size, portalLoops, openPortalVertices: [...portalAdjacency.values()].filter((neighbors) => neighbors.size !== 2).length, crownEdges: radialSegments,
    branches: branches.length, draws: group.children.length,
    triangles: geometries.reduce((sum, geometry) => sum + geometry.index.count / 3, 0),
    clearance, cutClearance, rimRows: profile.length,
    outerRadius: radius, base, top,
  };
  group.userData.livingHollow = metrics;
  return {
    group, metrics,
    dispose() { if (disposed) return; disposed = true; geometries.forEach((geometry) => geometry.dispose()); },
  };
}
