import * as T from 'three';

// Canonical pale strata are separate fractured wedges. Erosion of the mineral
// body can leave a few wholly outside it. Skywell fits those outcrops back into
// its private source without changing the shared Zephyr GLB or attached ledges.
export function seatSkywellStrata(root, { contactTolerance = 1.5 } = {}) {
  const replacedGeometries = new Set(),
    details = [];
  let movedComponents = 0,
    preservedComponents = 0;
  const bodies = [],
    strata = [];
  root.updateWorldMatrix(true, true);
  const worldToRoot = root.matrixWorld.clone().invert();
  root.traverse((mesh) => {
    if (!mesh.isMesh) return;
    if (/^island-.*__rock$/.test(mesh.name)) bodies.push(mesh);
    if (/^island-.*__rock_light$/.test(mesh.name)) strata.push(mesh);
  });
  const bodyBounds = new T.Box3();
  for (const body of bodies) {
    body.geometry.computeBoundingBox();
    const relative = worldToRoot.clone().multiply(body.matrixWorld);
    bodyBounds.union(body.geometry.boundingBox.clone().applyMatrix4(relative));
  }
  if (bodyBounds.isEmpty())
    return {
      replacedGeometries,
      movedComponents,
      preservedComponents,
      details,
    };
  const reach = bodyBounds.getSize(new T.Vector3()).length() + 100;
  const ray = new T.Raycaster();
  function supportGap(point) {
    const inward = new T.Vector3(-point.x, 0, -point.z);
    if (inward.lengthSq() < 0.001) return null;
    inward.normalize();
    const origin = point.clone().addScaledVector(inward, -reach);
    const worldOrigin = origin.clone().applyMatrix4(root.matrixWorld);
    const worldEnd = point
      .clone()
      .addScaledVector(inward, reach)
      .applyMatrix4(root.matrixWorld);
    ray.set(worldOrigin, worldEnd.clone().sub(worldOrigin).normalize());
    ray.far = worldOrigin.distanceTo(worldEnd);
    const hit = ray.intersectObjects(bodies, false)[0];
    if (!hit) return null;
    const contact = hit.point.clone().applyMatrix4(worldToRoot);
    return contact.sub(point).dot(inward);
  }

  for (const mesh of strata) {
    const original = mesh.geometry,
      position = original.attributes.position;
    const index = original.index,
      count = position.count;
    const parent = Array.from({ length: count }, (_, i) => i);
    function find(i) {
      while (parent[i] !== i) {
        parent[i] = parent[parent[i]];
        i = parent[i];
      }
      return i;
    }
    function join(a, b) {
      a = find(a);
      b = find(b);
      if (a !== b) parent[a] = b;
    }
    // glTF splits positions at hard normals. Weld only the topology keys;
    // retain the original normals, vertices and faces of the actual geometry.
    const welded = new Map();
    for (let i = 0; i < count; i++) {
      const key = [position.getX(i), position.getY(i), position.getZ(i)]
        .map((value) => Math.round(value * 10000))
        .join(',');
      if (welded.has(key)) join(i, welded.get(key));
      else welded.set(key, i);
    }
    for (let n = 0; n < (index?.count ?? count); n += 3) {
      const a = index ? index.getX(n) : n;
      join(a, index ? index.getX(n + 1) : n + 1);
      join(a, index ? index.getX(n + 2) : n + 2);
    }
    const components = new Map();
    for (let i = 0; i < count; i++) {
      const key = find(i);
      if (!components.has(key)) components.set(key, []);
      components.get(key).push(i);
    }
    const toRoot = worldToRoot.clone().multiply(mesh.matrixWorld);
    const toMesh = toRoot.clone().invert();
    let replacement;
    for (const vertices of components.values()) {
      const points = vertices.map((i) =>
        new T.Vector3().fromBufferAttribute(position, i).applyMatrix4(toRoot),
      );
      const bounds = new T.Box3().setFromPoints(points);
      const center = bounds.getCenter(new T.Vector3());
      const gap = supportGap(center);
      const samples = [
        ...new Map(
          points.map((point) => [
            point
              .toArray()
              .map((value) => Math.round(value * 10000))
              .join(','),
            point,
          ]),
        ).values(),
      ];
      const vertexGaps = samples
        .map(supportGap)
        .filter((value) => value != null);
      const nearest = vertexGaps.length ? Math.min(...vertexGaps) : null;
      const detail = {
        source: mesh.name,
        center: center.toArray(),
        gapBefore: gap,
        nearestVertexGap: nearest,
        moved: false,
      };
      details.push(detail);
      // Any contact at the wedge's actual height preserves its established
      // shape. A centre outside the body alone does not prove a loose block.
      if (gap == null || nearest == null || nearest <= contactTolerance) {
        preservedComponents++;
        continue;
      }
      const inward = new T.Vector3(-center.x, 0, -center.z).normalize();
      const halfDepth = Math.max(
        ...points.map((point) =>
          Math.abs(point.clone().sub(center).dot(inward)),
        ),
      );
      // Bury most of the detached wedge, leaving an irregular exposed stratum
      // rather than balancing the original cuboid on one newly touching corner.
      const distance = gap + halfDepth * 0.65;
      const delta = inward.multiplyScalar(distance);
      replacement ??= original.clone();
      const fitted = replacement.attributes.position;
      for (const [n, i] of vertices.entries()) {
        const point = points[n].clone().add(delta).applyMatrix4(toMesh);
        fitted.setXYZ(i, point.x, point.y, point.z);
      }
      detail.moved = true;
      detail.translation = delta.toArray();
      detail.gapAfter = supportGap(center.clone().add(delta));
      movedComponents++;
    }
    if (replacement) {
      replacement.attributes.position.needsUpdate = true;
      replacement.computeBoundingBox();
      replacement.computeBoundingSphere();
      mesh.geometry = replacement;
      replacedGeometries.add(original);
    }
  }
  // The caller owns these replaced private originals and releases them once.
  // Attached replacements belong to its ordinary source-resource collector.
  return { replacedGeometries, movedComponents, preservedComponents, details };
}
