import * as T from 'three';

const PROFILE = [0, 0.15, 0.5, 0.85, 1];
const keyFor = (p) =>
  `${Math.round(Math.atan2(p.z, p.x) * 100000)},${Math.round(p.y * 1000)}`;
const pointKey = (p) =>
  `${Math.round(p.x * 1000)},${Math.round(p.y * 1000)},${Math.round(p.z * 1000)}`;

function closestRoutePoint(point, route) {
  const best = new T.Vector3();
  let distance = Infinity;
  for (let i = 0; i < route.length - 1; i++) {
    const a = route[i],
      b = route[i + 1];
    const dx = b.x - a.x,
      dy = b.y - a.y,
      dz = b.z - a.z;
    const t = T.MathUtils.clamp(
      ((point.x - a.x) * dx + (point.y - a.y) * dy + (point.z - a.z) * dz) /
        (dx * dx + dy * dy + dz * dz),
      0,
      1,
    );
    const x = a.x + t * dx,
      y = a.y + t * dy,
      z = a.z + t * dz;
    const squared =
      (point.x - x) ** 2 + (point.y - y) ** 2 + (point.z - z) ** 2;
    if (squared < distance) {
      distance = squared;
      best.set(x, y, z);
    }
  }
  return { point: best, distance: Math.sqrt(distance) };
}

function normalAtBoundaries(hollow, source) {
  const normals = new Map();
  const inverse = source.matrixWorld.clone().invert();
  hollow.traverse((object) => {
    if (
      !object.isMesh ||
      object === source ||
      !/bark|cambium/.test(object.material?.name ?? '')
    )
      return;
    const transform = new T.Matrix4().multiplyMatrices(
      inverse,
      object.matrixWorld,
    );
    const normalTransform = new T.Matrix3().getNormalMatrix(transform);
    const positions = object.geometry.attributes.position,
      values = object.geometry.attributes.normal;
    if (!values) return;
    const p = new T.Vector3(),
      n = new T.Vector3();
    for (let i = 0; i < positions.count; i++) {
      p.fromBufferAttribute(positions, i).applyMatrix4(transform);
      n.fromBufferAttribute(values, i)
        .applyMatrix3(normalTransform)
        .normalize();
      const key = pointKey(p);
      if (normals.has(key)) normals.get(key).add(n);
      else normals.set(key, n.clone());
    }
  });
  for (const n of normals.values()) n.normalize();
  return normals;
}

/**
 * Replace only the entry aperture's flat radial quads with a recessed rounded
 * wound. Both existing wall edges remain exact, and the profile only retreats
 * from the route. The source GLB and all unrelated sapwood faces stay untouched.
 * New geometry/material ownership transfers to the environment's normal teardown.
 */
export function refineHollow(hollow, track) {
  if (hollow.userData.forestHeroFinish)
    return {
      changed: false,
      materials: [],
      stats: hollow.userData.forestHeroFinish,
    };
  hollow.updateWorldMatrix(true, true);
  let source;
  hollow.traverse((object) => {
    if (
      object.isMesh &&
      /hero_hollow/.test(object.name) &&
      /exposed ivory sapwood/.test(object.material?.name ?? '')
    )
      source = object;
  });
  if (!source)
    throw new Error(
      'Vesper Forest hero finish needs the authored hollow sapwood mesh',
    );
  const original = source.geometry;
  if (!original.index)
    throw new Error(
      'Vesper Forest hero finish expects indexed authored sapwood',
    );
  const positions = original.attributes.position;
  const points = Array.from({ length: positions.count }, (_, i) =>
    new T.Vector3().fromBufferAttribute(positions, i),
  );
  const radialGroups = new Map();
  for (const [index, point] of points.entries()) {
    const key = keyFor(point);
    if (!radialGroups.has(key)) radialGroups.set(key, []);
    radialGroups.get(key).push(index);
  }
  const pairs = new Map(),
    vertexPair = new Map();
  for (const [key, vertices] of radialGroups) {
    const sorted = [...vertices].sort(
      (a, b) =>
        Math.hypot(points[a].x, points[a].z) -
        Math.hypot(points[b].x, points[b].z),
    );
    const inner = points[sorted[0]],
      outer = points[sorted.at(-1)];
    const thickness = outer.distanceTo(inner);
    if (thickness < 8 || thickness > 35) continue;
    pairs.set(key, { inner, outer, middle: inner.clone().lerp(outer, 0.5) });
    vertices.forEach((index) => vertexPair.set(index, key));
  }
  const adjacency = new Map(),
    triangles = [];
  const connect = (a, b) => {
    if (!adjacency.has(a)) adjacency.set(a, new Set());
    adjacency.get(a).add(b);
  };
  for (let index = 0; index < original.index.count; index += 3) {
    const vertices = [0, 1, 2].map((offset) =>
      original.index.getX(index + offset),
    );
    if (!vertices.every((vertex) => vertexPair.has(vertex))) continue;
    const keys = [...new Set(vertices.map((vertex) => vertexPair.get(vertex)))];
    if (keys.length !== 2) continue;
    connect(keys[0], keys[1]);
    connect(keys[1], keys[0]);
    triangles.push({ offset: index, keys });
  }
  const components = [];
  const remaining = new Set(adjacency.keys());
  while (remaining.size) {
    const first = remaining.values().next().value,
      stack = [first],
      component = [];
    remaining.delete(first);
    while (stack.length) {
      const key = stack.pop();
      component.push(key);
      for (const next of adjacency.get(key))
        if (remaining.delete(next)) stack.push(next);
    }
    if (
      component.length > 20 &&
      component.every((key) => adjacency.get(key).size === 2)
    )
      components.push(component);
  }
  const entry = track.sample(track.landmarks.hollow.entry).position.clone();
  const selected = components.sort((a, b) => {
    const distance = (component) =>
      Math.min(
        ...component.map((key) =>
          pairs
            .get(key)
            .middle.clone()
            .applyMatrix4(source.matrixWorld)
            .distanceToSquared(entry),
        ),
      );
    return distance(a) - distance(b);
  })[0];
  if (!selected)
    throw new Error(
      'Vesper Forest entry wound is not a closed authored contour',
    );
  const contour = [selected[0]];
  let previous = null,
    current = selected[0];
  do {
    const next = [...adjacency.get(current)].find((key) => key !== previous);
    if (next === contour[0]) break;
    contour.push(next);
    previous = current;
    current = next;
  } while (contour.length <= selected.length);
  if (contour.length !== selected.length)
    throw new Error('Vesper Forest entry contour traversal is inconsistent');

  const selectedSet = new Set(selected);
  const removed = new Set(
    triangles
      .filter(({ keys }) => keys.every((key) => selectedSet.has(key)))
      .map(({ offset }) => offset),
  );
  const kept = [];
  for (let offset = 0; offset < original.index.count; offset += 3)
    if (!removed.has(offset))
      kept.push(
        original.index.getX(offset),
        original.index.getX(offset + 1),
        original.index.getX(offset + 2),
      );

  const route = [];
  for (let s = 0; s < track.length; s += 4)
    route.push(track.sample(s).position.clone());
  route.push(track.sample(0).position.clone());
  const inverse = source.matrixWorld.clone().invert();
  const normals = normalAtBoundaries(hollow, source);
  const vertexPositions = [],
    uv = [],
    colors = [],
    indices = [];
  const profileNormals = [];
  let minClearanceDelta = Infinity,
    maxRetreat = 0,
    distanceAlong = 0;
  for (let i = 0; i < contour.length; i++) {
    const pair = pairs.get(contour[i]);
    const before = pairs.get(
      contour[(i + contour.length - 1) % contour.length],
    );
    const after = pairs.get(contour[(i + 1) % contour.length]);
    const tangent = after.middle.clone().sub(before.middle).normalize();
    const across = pair.outer.clone().sub(pair.inner).normalize();
    const away = new T.Vector3().crossVectors(tangent, across).normalize();
    const nearest = closestRoutePoint(
      pair.middle.clone().applyMatrix4(source.matrixWorld),
      route,
    ).point.applyMatrix4(inverse);
    if (away.dot(pair.middle.clone().sub(nearest)) < 0) away.negate();
    const angle = Math.atan2(pair.middle.z, pair.middle.x);
    const amplitude =
      3.4 +
      0.8 * Math.sin(angle * 17 + pair.middle.y * 0.071) +
      0.45 * Math.sin(angle * 31 - pair.middle.y * 0.12);
    if (i) distanceAlong += pair.middle.distanceTo(before.middle);
    for (const [row, t] of PROFILE.entries()) {
      const baseline = pair.outer.clone().lerp(pair.inner, t);
      const clearance = closestRoutePoint(
        baseline.clone().applyMatrix4(source.matrixWorld),
        route,
      ).distance;
      let retreat = amplitude * Math.sqrt(Math.max(0, 1 - (2 * t - 1) ** 2));
      let point = baseline.clone();
      for (let attempt = 0; attempt < 8; attempt++) {
        point.copy(baseline).addScaledVector(away, retreat);
        if (
          closestRoutePoint(
            point.clone().applyMatrix4(source.matrixWorld),
            route,
          ).distance >=
          clearance - 0.001
        )
          break;
        retreat *= 0.5;
      }
      if (
        closestRoutePoint(point.clone().applyMatrix4(source.matrixWorld), route)
          .distance <
        clearance - 0.001
      )
        point.copy(baseline);
      const delta =
        closestRoutePoint(point.clone().applyMatrix4(source.matrixWorld), route)
          .distance - clearance;
      minClearanceDelta = Math.min(minClearanceDelta, delta);
      maxRetreat = Math.max(maxRetreat, point.distanceTo(baseline));
      vertexPositions.push(point.x, point.y, point.z);
      uv.push(distanceAlong / 9, (t * pair.outer.distanceTo(pair.inner)) / 9);
      const profileShade = [0.29, 0.58, 1.0, 0.76, 0.47][row];
      const variation =
        0.94 + 0.06 * Math.sin(angle * 13 + pair.middle.y * 0.11);
      const value = profileShade * variation;
      colors.push(value, value, value);
      profileNormals.push(
        row === 0
          ? normals.get(pointKey(pair.outer))
          : row === PROFILE.length - 1
            ? normals.get(pointKey(pair.inner))
            : null,
      );
    }
  }
  for (let i = 0; i < contour.length; i++) {
    const next = (i + 1) % contour.length;
    for (let row = 0; row < PROFILE.length - 1; row++) {
      const a = i * PROFILE.length + row,
        b = next * PROFILE.length + row;
      indices.push(a, b, a + 1, a + 1, b, b + 1);
    }
  }
  const geometry = new T.BufferGeometry();
  geometry.setAttribute(
    'position',
    new T.Float32BufferAttribute(vertexPositions, 3),
  );
  geometry.setAttribute('uv', new T.Float32BufferAttribute(uv, 2));
  geometry.setAttribute('color', new T.Float32BufferAttribute(colors, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  // Orient the surface toward the open aperture, independent of traversal order.
  const testIndex = 2;
  const testPoint = new T.Vector3().fromBufferAttribute(
    geometry.attributes.position,
    testIndex,
  );
  const target = closestRoutePoint(
    testPoint.clone().applyMatrix4(source.matrixWorld),
    route,
  )
    .point.applyMatrix4(inverse)
    .sub(testPoint);
  const testNormal = new T.Vector3().fromBufferAttribute(
    geometry.attributes.normal,
    testIndex,
  );
  if (testNormal.dot(target) < 0) {
    for (let i = 0; i < indices.length; i += 3)
      [indices[i + 1], indices[i + 2]] = [indices[i + 2], indices[i + 1]];
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
  }
  profileNormals.forEach((normal, index) => {
    if (normal)
      geometry.attributes.normal.setXYZ(index, normal.x, normal.y, normal.z);
  });
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  geometry.userData.heroEntryProfile = {
    rows: PROFILE.length,
    stations: contour.length,
  };

  const replacement = original.clone();
  replacement.setIndex(kept);
  replacement.computeBoundingBox();
  replacement.computeBoundingSphere();
  source.geometry = replacement;
  const material = source.material.clone();
  material.name = 'Vesper Forest / healed entry sapwood';
  material.userData = {
    ...source.material.userData,
    borrowedTextures: [...(source.material.userData.borrowedTextures ?? [])],
  };
  material.woodMacroMap = source.material.woodMacroMap;
  material.vertexColors = true;
  material.needsUpdate = true;
  const rim = new T.Mesh(geometry, material);
  rim.name = 'Vesper Forest / continuous rounded entry wound';
  rim.castShadow = true;
  rim.receiveShadow = true;
  source.add(rim);
  const stats = {
    stations: contour.length,
    removedTriangles: removed.size,
    addedTriangles: indices.length / 3,
    rows: PROFILE.length,
    maxRetreat,
    minClearanceDelta,
    extraDraws: 1,
  };
  hollow.userData.forestHeroFinish = stats;
  return { changed: true, materials: [material], rim, stats };
}
