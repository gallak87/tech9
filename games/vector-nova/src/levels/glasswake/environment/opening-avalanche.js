import * as T from 'three';
import { FIRST_SHELF_RULES } from './first-shelf.js';

// Absolute gravity-led poses: the driver-facing +X/-Z tip releases first.
// Successive strips are wider, so a few small breaks grow into the full fall.
export function openingFragmentPose(elapsed, fragment) {
  const delay =
    fragment.strip * 0.17 +
    (fragment.column / Math.max(1, fragment.columns - 1)) * 0.1;
  const age = Math.max(
    0,
    (elapsed ?? 0) - FIRST_SHELF_RULES.crackSeconds - delay,
  );
  const progress = Math.min(1, age / (1.65 + fragment.strip * 0.14));
  const fall = progress * progress;
  return {
    progress,
    offset: new T.Vector3(-20 * progress, -210 * fall, -40 * progress),
    quaternion: new T.Quaternion().setFromEuler(
      new T.Euler(-0.32 * progress, 0, 0),
    ),
  };
}

// Keep every authored triangle and its material attributes. Partition along the
// existing tessellation, then close only newly exposed cut loops with rough ice.
// One mutable geometry per original material keeps the original draw budget.
export function createOpeningAvalanche(parts, bounds) {
  const columns = [5, 4, 3, 2, 2],
    fragments = [],
    outputs = [];
  let index = 0;
  columns.forEach((count, strip) => {
    for (let column = 0; column < count; column++)
      fragments.push({
        index: index++,
        strip,
        column,
        columns: count,
        bounds: new T.Box3(),
      });
  });
  const key = (p) => p.map((v) => Math.round(v * 10000)).join(',');
  const extent = bounds.getSize(new T.Vector3());
  const classify = (p) => {
    const x = (p[0] - bounds.min.x) / extent.x;
    const strip = x > 0.9 ? 0 : x > 0.75 ? 1 : x > 0.55 ? 2 : x > 0.3 ? 3 : 4;
    const z = (p[2] - bounds.min.z) / extent.z + Math.sin(p[0] * 0.13) * 0.025;
    const column = Math.max(
      0,
      Math.min(columns[strip] - 1, Math.floor(z * columns[strip])),
    );
    return fragments.find((f) => f.strip === strip && f.column === column)
      .index;
  };
  for (const part of parts) {
    const source = part.geometry.index
      ? part.geometry.toNonIndexed()
      : part.geometry.clone();
    const attributes = Object.fromEntries(
      Object.entries(source.attributes).map(([name, a]) => [
        name,
        { size: a.itemSize, data: Array.from(a.array) },
      ]),
    );
    const position = attributes.position.data;
    const membership = [],
      edges = new Map();
    for (
      let vertex = 0;
      vertex < source.attributes.position.count;
      vertex += 3
    ) {
      const points = [0, 1, 2].map((i) =>
        position.slice((vertex + i) * 3, (vertex + i + 1) * 3),
      );
      const cell = classify(
        [0, 1, 2].map(
          (axis) => points.reduce((sum, p) => sum + p[axis], 0) / 3,
        ),
      );
      for (let i = 0; i < 3; i++) {
        membership[vertex + i] = cell;
        fragments[cell].bounds.expandByPoint(new T.Vector3(...points[i]));
        const a = points[i],
          b = points[(i + 1) % 3],
          ka = key(a),
          kb = key(b);
        const edgeKey = [ka, kb].sort().join('|');
        if (!edges.has(edgeKey)) edges.set(edgeKey, []);
        edges.get(edgeKey).push({ cell, a, b, ka, kb });
      }
    }
    const cuts = fragments.map(() => []);
    for (const edge of edges.values())
      if (edge.length === 2 && edge[0].cell !== edge[1].cell)
        for (const side of edge) cuts[side.cell].push(side);
    const originalVertices = source.attributes.position.count;
    function append(point, normal, cell) {
      membership.push(cell);
      for (const [name, attribute] of Object.entries(attributes)) {
        const value =
          name === 'position'
            ? point
            : name === 'normal'
              ? normal
              : name === 'color'
                ? [0.28, 0.5, 0.66]
                : name === 'iceRoughness'
                  ? [0.65]
                  : name === 'iceRole'
                    ? [3]
                    : Array(attribute.size).fill(0);
        attribute.data.push(...value);
      }
    }
    cuts.forEach((boundary, cell) => {
      const adjacent = new Map(),
        unused = new Set(boundary);
      for (const edge of boundary)
        for (const k of [edge.ka, edge.kb]) {
          if (!adjacent.has(k)) adjacent.set(k, []);
          adjacent.get(k).push(edge);
        }
      while (unused.size) {
        const first = unused.values().next().value,
          loop = [first.a];
        let current = first.kb;
        unused.delete(first);
        loop.push(first.b);
        while (current !== first.ka) {
          const edge = adjacent.get(current)?.find((e) => unused.has(e));
          if (!edge) break;
          unused.delete(edge);
          const forward = edge.ka === current;
          loop.push(forward ? edge.b : edge.a);
          current = forward ? edge.kb : edge.ka;
        }
        if (current !== first.ka || loop.length < 4) continue;
        loop.pop();
        const centre = loop
          .reduce((sum, p) => sum.add(new T.Vector3(...p)), new T.Vector3())
          .multiplyScalar(1 / loop.length);
        for (let i = 0; i < loop.length; i++) {
          const a = new T.Vector3(...loop[i]),
            b = new T.Vector3(...loop[(i + 1) % loop.length]);
          const normal = a
            .clone()
            .sub(centre)
            .cross(b.clone().sub(centre))
            .normalize()
            .toArray();
          append(centre.toArray(), normal, cell);
          append(a.toArray(), normal, cell);
          append(b.toArray(), normal, cell);
        }
      }
    });
    const geometry = new T.BufferGeometry();
    for (const [name, a] of Object.entries(attributes))
      geometry.setAttribute(name, new T.Float32BufferAttribute(a.data, a.size));
    source.dispose();
    geometry.attributes.position.setUsage(T.DynamicDrawUsage);
    geometry.attributes.normal.setUsage(T.DynamicDrawUsage);
    outputs.push({
      geometry,
      material: part.material,
      basePosition: geometry.attributes.position.array.slice(),
      baseNormal: geometry.attributes.normal.array.slice(),
      membership,
      originalVertices,
    });
  }
  for (const fragment of fragments)
    fragment.centre = fragment.bounds.getCenter(new T.Vector3());
  let lastElapsed;
  function update(elapsed = null) {
    if (elapsed === lastElapsed) return;
    lastElapsed = elapsed;
    const poses = fragments.map((f) => openingFragmentPose(elapsed, f));
    const point = new T.Vector3(),
      normal = new T.Vector3();
    for (const output of outputs) {
      const position = output.geometry.attributes.position,
        normals = output.geometry.attributes.normal;
      for (let i = 0; i < position.count; i++) {
        const cell = output.membership[i],
          fragment = fragments[cell],
          pose = poses[cell];
        if (i >= output.originalVertices && pose.progress === 0)
          point.copy(fragment.centre);
        else point.fromArray(output.basePosition, i * 3);
        point
          .sub(fragment.centre)
          .applyQuaternion(pose.quaternion)
          .add(fragment.centre)
          .add(pose.offset);
        normal
          .fromArray(output.baseNormal, i * 3)
          .applyQuaternion(pose.quaternion);
        position.setXYZ(i, point.x, point.y, point.z);
        normals.setXYZ(i, normal.x, normal.y, normal.z);
      }
      position.needsUpdate = true;
      normals.needsUpdate = true;
      output.geometry.computeBoundingBox();
      output.geometry.computeBoundingSphere();
    }
  }
  update();
  return {
    parts: outputs,
    fragments,
    update,
    dispose() {
      outputs.length = 0;
      fragments.length = 0;
    },
  };
}
