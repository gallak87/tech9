import * as T from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import {
  loadForestKit,
  prepareForestParts,
  disposeForestKit,
} from '@worldkit/environment/forest/kit';
import { groundFrame } from '../../../environment/placement.js';
import { createSceneryClearance, seededRandom } from './geometry.js';

const UP = new T.Vector3(0, 1, 0);

/** Route-owned districts; metres along the unchanged racing line, not world tiles. */
export function forestDressingRegions(track) {
  const { entry, exit } = track.landmarks.hollow;
  const landing = track.jumps[0].landingEnd;
  return [
    { id: 'approach', start: entry - 220, end: entry, seed: 7193 },
    { id: 'hollow', start: entry, end: exit, seed: 18413 },
    { id: 'landing', start: landing, end: landing + 220, seed: 61547 },
  ];
}

/** Tapered, slightly fluted wood, with metre-scaled UVs and a continuous surface. */
export function boughGeometry(points, radii, seed = 0) {
  const curve = new T.CatmullRomCurve3(points);
  const length = curve.getLength();
  const segments = Math.max(10, Math.ceil(length / 4));
  const sides = radii[0] > 3 ? 12 : 7;
  const frames = curve.computeFrenetFrames(segments, false);
  const positions = [],
    uvs = [],
    indices = [];
  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    const point = curve.getPointAt(t);
    const slot = t * (radii.length - 1);
    const lower = Math.min(radii.length - 2, Math.floor(slot));
    const radius = T.MathUtils.lerp(
      radii[lower],
      radii[lower + 1],
      slot - lower,
    );
    for (let j = 0; j <= sides; j++) {
      const angle = (j / sides) * Math.PI * 2;
      const flute =
        1 +
        0.1 * Math.sin(angle * 5 + t * 2 + seed) +
        0.045 * Math.sin(angle * 9 - t * 4 + seed * 0.7);
      const p = point
        .clone()
        .addScaledVector(frames.normals[i], Math.cos(angle) * radius * flute)
        .addScaledVector(frames.binormals[i], Math.sin(angle) * radius * flute);
      positions.push(p.x, p.y, p.z);
      uvs.push(((j / sides) * Math.PI * 2 * radii[0]) / 7, (t * length) / 7);
      if (i < segments && j < sides) {
        const a = i * (sides + 1) + j,
          b = a + sides + 1;
        indices.push(a, a + 1, b, a + 1, b + 1, b);
      }
    }
  }
  const geometry = new T.BufferGeometry();
  geometry.setAttribute('position', new T.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new T.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return { geometry, curve };
}

/** Nonuniform tree and instance scales require the inverse-transpose normal. */
export function surfaceAnchorNormal(hit) {
  const matrix = hit.object.matrixWorld.clone();
  if (hit.instanceId !== undefined) {
    const instance = new T.Matrix4();
    hit.object.getMatrixAt(hit.instanceId, instance);
    matrix.multiply(instance);
  }
  return hit.face.normal
    .clone()
    .applyMatrix3(new T.Matrix3().getNormalMatrix(matrix))
    .normalize();
}

/** Accept actual woody surfaces; never use a leaf plane as a branch foundation. */
function woodSurfaces(scene) {
  const result = [];
  scene.updateMatrixWorld(true);
  scene.traverse((object) => {
    if (!object.isMesh) return;
    const materials = [object.material].flat().filter(Boolean);
    if (
      !materials.some((m) => /bark|wood|living root|root stock/i.test(m.name))
    )
      return;
    if (materials.some((m) => /leaf|leaves|fung/i.test(m.name))) return;
    // Hidden LOD duplicates produce the same hit; using the active surface is enough.
    for (let p = object; p && p !== scene; p = p.parent) if (!p.visible) return;
    result.push(object);
  });
  return result;
}

function makeBatches(
  parts,
  placements,
  name,
  parent,
  ownedGeometry,
  fine = false,
) {
  if (!placements.length) return [];
  const object = new T.Object3D();
  return parts.map(({ geometry, material }) => {
    const mesh = new T.InstancedMesh(geometry, material, placements.length);
    mesh.name = name;
    mesh.castShadow = false;
    mesh.receiveShadow = true;
    mesh.userData.forestFineDetail = fine;
    placements.forEach((p, index) => {
      object.position.copy(p.position);
      object.quaternion.copy(p.quaternion ?? new T.Quaternion());
      object.rotateY(p.yaw ?? 0);
      object.scale.setScalar(p.scale);
      object.updateMatrix();
      mesh.setMatrixAt(index, object.matrix);
      if (p.tint) mesh.setColorAt(index, p.tint);
    });
    mesh.computeBoundingBox();
    mesh.computeBoundingSphere();
    parent.add(mesh);
    // Only the instance buffer belongs to this mesh. Prototype geometry is shared.
    ownedGeometry.add(mesh);
    return mesh;
  });
}

/** Clip the lower root stock while preserving interpolated normals/UVs at the cut. */
function upperCrownGeometry(source, cutY) {
  const attributes = Object.entries(source.attributes);
  const arrays = Object.fromEntries(attributes.map(([name]) => [name, []]));
  const cuts = [];
  const count = source.index?.count ?? source.attributes.position.count;
  const read = (vertex) =>
    Object.fromEntries(
      attributes.map(([name, attribute]) => [
        name,
        Array.from({ length: attribute.itemSize }, (_, component) =>
          attribute.getComponent(vertex, component),
        ),
      ]),
    );
  const interpolate = (a, b) => {
    const t = (cutY - a.position[1]) / (b.position[1] - a.position[1]);
    const result = Object.fromEntries(
      attributes.map(([name]) => [
        name,
        a[name].map((v, i) => T.MathUtils.lerp(v, b[name][i], t)),
      ]),
    );
    cuts.push(new T.Vector3(...result.position));
    return result;
  };
  for (let i = 0; i < count; i += 3) {
    const input = [0, 1, 2].map((offset) =>
      read(source.index ? source.index.getX(i + offset) : i + offset),
    );
    const polygon = [];
    for (let j = 0; j < 3; j++) {
      const a = input[j],
        b = input[(j + 1) % 3];
      const insideA = a.position[1] >= cutY,
        insideB = b.position[1] >= cutY;
      if (insideA) polygon.push(a);
      if (insideA !== insideB) polygon.push(interpolate(a, b));
    }
    for (let j = 1; j < polygon.length - 1; j++)
      for (const vertex of [polygon[0], polygon[j], polygon[j + 1]])
        for (const [name] of attributes) arrays[name].push(...vertex[name]);
  }
  const geometry = new T.BufferGeometry();
  for (const [name, attribute] of attributes)
    geometry.setAttribute(
      name,
      new T.Float32BufferAttribute(arrays[name], attribute.itemSize),
    );
  geometry.normalizeNormals();
  return { geometry, cuts };
}

function borrowedCrownParts(library, barkMaterial) {
  const source = library.getObjectByName('connected_tree_lod_0');
  if (!source)
    throw new Error(
      'Vesper Forest needs its authored connected_tree_lod_0 assembly',
    );
  source.updateWorldMatrix(true, true);
  const inverse = source.matrixWorld.clone().invert();
  const parts = [];
  const sourceBounds = new T.Box3();
  source.traverse((mesh) => {
    if (!mesh.isMesh) return;
    const matrix = new T.Matrix4().multiplyMatrices(inverse, mesh.matrixWorld);
    const geometry = mesh.geometry.clone().applyMatrix4(matrix);
    geometry.computeBoundingBox();
    sourceBounds.union(geometry.boundingBox);
    const wood = /wood|bark/i.test(mesh.material.name);
    parts.push({
      geometry,
      material: wood ? barkMaterial : mesh.material,
      wood,
    });
  });
  // The first major leader begins at about 59 source metres. Cutting just below
  // it removes the flared terrestrial roots and bare lower trunk while retaining
  // one connected crotch rather than several floating cut branch ends.
  const cutY = sourceBounds.max.y * 0.24;
  const cuts = [];
  for (const part of parts) {
    if (!part.wood) continue;
    const clipped = upperCrownGeometry(part.geometry, cutY);
    part.geometry.dispose();
    part.geometry = clipped.geometry;
    cuts.push(...clipped.cuts);
  }
  const cutCenter = cuts.length
    ? new T.Box3().setFromPoints(cuts).getCenter(new T.Vector3())
    : new T.Vector3(0, cutY, 0);
  const bounds = new T.Box3();
  let radius = 0;
  for (const part of parts) {
    part.geometry.translate(-cutCenter.x, -cutCenter.y, -cutCenter.z);
    part.geometry.computeBoundingBox();
    part.geometry.userData.branchCrown = true;
    bounds.union(part.geometry.boundingBox);
    const positions = part.geometry.attributes.position;
    for (let i = 0; i < positions.count; i++)
      radius = Math.max(
        radius,
        Math.hypot(positions.getX(i), positions.getZ(i)),
      );
  }
  return {
    parts,
    height: bounds.max.y,
    radius,
  };
}

/**
 * Build one surface-attached recipe in three route regions. Borrowed scene and
 * materials remain owned by the level. Only Worldkit kit resources and generated
 * geometry are released here. A supplied forestKit is borrowed (CPU fixtures).
 */
export async function createForestDressing({
  track,
  library,
  barkMaterial,
  attachmentScene,
  hollow,
  forestKit,
  signal,
}) {
  if (!attachmentScene)
    throw new Error(
      'Forest dressing needs the placed environment for surface attachments',
    );
  const group = new T.Group();
  group.name = 'Vesper Forest / Worldkit connected bough districts';
  const regions = forestDressingRegions(track);
  const owned = new Set();
  const materials = new Set();
  const instances = new Set();
  const stats = {
    recipe: 'surface-attached-crown-v3',
    regions: [],
    assemblies: 0,
    foliageClusters: 0,
    ferns: 0,
    rejected: 0,
    addedDraws: 0,
    source: '@worldkit/environment/forest',
  };
  const kit = forestKit ?? (await loadForestKit());
  if (signal?.aborted) {
    if (!forestKit) disposeForestKit(kit);
    throw new DOMException('Forest dressing cancelled', 'AbortError');
  }
  let disposed = false;
  try {
    const fernParts = prepareForestParts(kit, 'fern_a');
    for (const part of fernParts) {
      // Keep the canonical fern's restrained metre scale and photographic texture.
      part.material.emissiveIntensity = 0;
      part.material.color.multiplyScalar(0.8);
      owned.add(part.geometry);
      materials.add(part.material);
    }
    const crown = borrowedCrownParts(library, barkMaterial);
    const leaves = crown.parts;
    leaves.forEach((p) => owned.add(p.geometry));
    const clears = createSceneryClearance(track);
    const surfaces = woodSurfaces(attachmentScene);
    const hollowSurfaces = hollow ? woodSurfaces(hollow) : surfaces;
    const ray = new T.Raycaster();
    ray.near = 27;
    ray.far = 175;
    const acceptedAnchors = [];
    const districtLayers = [];
    const tinted = ['#b4bb91', '#92a77e', '#c0c4a2'].map((c) => new T.Color(c));

    for (const region of regions) {
      const random = seededRandom(region.seed);
      const layer = new T.Group();
      layer.name = `Vesper Forest / ${region.id} / ${Math.round(region.start)}–${Math.round(region.end)} m`;
      layer.userData.routeRegion = { ...region };
      const statsRegion = {
        id: region.id,
        start: region.start,
        end: region.end,
        assemblies: 0,
        foliageClusters: 0,
        ferns: 0,
        anchorSources: [],
      };
      const wood = [],
        foliage = [],
        ferns = [];
      const stations =
        region.id === 'hollow'
          ? [
              region.start + 28,
              region.start + 125,
              region.start + 255,
              region.start + 405,
              region.start + 565,
              region.end - 85,
            ]
          : [
              region.start + 12,
              region.start + 58,
              region.start + 110,
              region.start + 166,
              region.end - 10,
            ];
      for (const [stationIndex, station] of stations.entries()) {
        const frame = groundFrame(track, station);
        const sides =
          region.id === 'hollow'
            ? [stationIndex % 2 ? 1 : -1, stationIndex % 2 ? -1 : 1]
            : [-1, 1];
        for (const side of sides) {
          if (statsRegion.assemblies >= (region.id === 'hollow' ? 6 : 8)) break;
          const candidates = [];
          for (const height of region.id === 'landing'
            ? [-30, -48, 14, -12, 38]
            : [14, -12, 38]) {
            const origin = frame.position.clone().addScaledVector(UP, height);
            for (const along of [0, 0.5, -0.5]) {
              const direction = frame.right
                .clone()
                .multiplyScalar(side)
                .addScaledVector(frame.tangent, along)
                .normalize();
              ray.set(origin, direction);
              const hits = ray.intersectObjects(
                region.id === 'hollow' ? hollowSurfaces : surfaces,
                false,
              );
              const hit = hits.find(
                (h) => h.distance >= 38 && h.distance < 170,
              );
              if (
                !hit ||
                acceptedAnchors.some(
                  (p) => p.distanceToSquared(hit.point) < 18 ** 2,
                )
              )
                continue;
              candidates.push({
                hit,
                direction,
                height,
                score:
                  Math.abs(hit.distance - 85) + Math.abs(height - 14) * 0.3,
              });
            }
          }
          candidates.sort((a, b) => a.score - b.score);
          let assembly;
          for (const candidate of candidates) {
            const { hit, direction } = candidate;
            const normal = surfaceAnchorNormal(hit);
            if (normal.dot(direction) > 0) normal.negate();
            const origin = hit.point.clone().addScaledVector(normal, -5);
            const reach = frame.position
              .clone()
              .addScaledVector(frame.right, side * (55 + random() * 8))
              .addScaledVector(frame.tangent, 10 + random() * 23)
              .addScaledVector(UP, 18 + random() * 12);
            if (origin.distanceTo(reach) < 14) continue;
            const elbow = origin
              .clone()
              .lerp(reach, 0.48)
              .addScaledVector(UP, 4 + random() * 7);
            const points = [origin, elbow, reach];
            const radius = 5.2 + random() * 2.5;
            if (!clears(points, radius * 1.18)) continue;
            assembly = { origin, reach, points, radius, hit };
            break;
          }
          if (!assembly) {
            stats.rejected++;
            continue;
          }
          const { origin, reach, points, radius, hit } = assembly;
          acceptedAnchors.push(hit.point.clone());
          const main = boughGeometry(
            points,
            [radius, radius * 0.8, 1.1],
            region.seed + station,
          );
          wood.push(main.geometry);
          const footprint = [];
          for (let c = 0; c < 2; c++) {
            const t = c === 0 ? 0.54 : 0.9;
            const position = main.curve.getPointAt(t);
            const r = T.MathUtils.lerp(
              radius * 0.8,
              1.1,
              Math.max(0, (t - 0.5) * 2),
            );
            // Bury the remaining cut stem in the carrying bough. The terrestrial
            // root flare is removed, so these read as branches rather than trees.
            position.addScaledVector(UP, r * 0.15);
            const yaw = random() * Math.PI * 2;
            const growthDirection = frame.right
              .clone()
              .multiplyScalar(side * (0.48 + random() * 0.25))
              .addScaledVector(frame.tangent, c === 0 ? -0.4 : 0.65)
              .addScaledVector(UP, 0.82)
              .normalize();
            const quaternion = new T.Quaternion().setFromUnitVectors(
              UP,
              growthDirection,
            );
            let accepted = false;
            for (const scale of [0.145, 0.125, 0.105]) {
              const crownAxis = UP.clone().applyQuaternion(quaternion);
              const top = position
                .clone()
                .addScaledVector(crownAxis, crown.height * scale);
              const middle = position.clone().lerp(top, 0.55);
              if (!clears([position, middle, top], crown.radius * scale))
                continue;
              foliage.push({
                position,
                scale,
                yaw,
                quaternion,
                tint: tinted[(stationIndex + c) % tinted.length],
              });
              footprint.push(top);
              accepted = true;
              break;
            }
            if (!accepted) stats.rejected++;
          }
          // Plants sit on the actual upper skin of this bough, not at road height
          // with an assumed terrain beneath them. Sparse ferns retain source scale.
          for (let n = 0; n < 5; n++) {
            const t = 0.24 + random() * 0.45;
            const point = main.curve.getPointAt(t);
            const r =
              t < 0.5
                ? T.MathUtils.lerp(radius, radius * 0.8, t * 2)
                : T.MathUtils.lerp(radius * 0.8, 1.1, (t - 0.5) * 2);
            point.addScaledVector(UP, r * 0.92);
            if (clears([point, point.clone().addScaledVector(UP, 0.01)], 2))
              ferns.push({
                position: point,
                scale: 1.2 + random() * 1.5,
                yaw: random() * Math.PI * 2,
              });
          }
          statsRegion.assemblies++;
          statsRegion.anchorSources.push({
            station,
            side,
            mesh: hit.object.name,
            position: hit.point.toArray(),
            reach: reach.toArray(),
            start: origin.toArray(),
            canopyTips: footprint.map((p) => p.toArray()),
          });
        }
      }
      if (wood.length) {
        const geometry = mergeGeometries(wood);
        wood.forEach((g) => g.dispose());
        owned.add(geometry);
        const mesh = new T.Mesh(geometry, barkMaterial);
        mesh.name = `Vesper Forest / ${region.id} / parent-connected fluted boughs`;
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        layer.add(mesh);
      }
      makeBatches(
        leaves,
        foliage,
        `Vesper Forest / ${region.id} / layered attached broadleaf crowns`,
        layer,
        instances,
      );
      const fine = makeBatches(
        fernParts,
        ferns,
        `Vesper Forest / ${region.id} / Worldkit epiphytic ferns`,
        layer,
        instances,
        true,
      );
      statsRegion.foliageClusters = foliage.length;
      statsRegion.ferns = ferns.length;
      statsRegion.draws = layer.children.length;
      stats.regions.push(statsRegion);
      stats.assemblies += statsRegion.assemblies;
      stats.foliageClusters += foliage.length;
      stats.ferns += ferns.length;
      stats.addedDraws += layer.children.length;
      group.add(layer);
      const bounds = new T.Box3().setFromObject(layer);
      districtLayers.push({ layer, bounds, fine });
    }
    group.userData.metrics = stats;
    let currentSettings = {};
    const configure = (settings = currentSettings, camera) => {
      currentSettings = settings;
      const high = settings.quality !== 'low';
      for (const district of districtLayers) {
        const distance = camera
          ? district.bounds.distanceToPoint(camera.position)
          : 0;
        district.layer.visible = distance < 650;
        for (const mesh of district.fine) mesh.visible = high && distance < 180;
      }
    };
    return {
      group,
      stats,
      configure,
      update(frame) {
        configure(frame.settings ?? currentSettings, frame.camera);
      },
      dispose() {
        if (disposed) return;
        disposed = true;
        instances.forEach((m) => m.dispose());
        owned.forEach((g) => g.dispose());
        materials.forEach((m) => m.dispose());
        if (!forestKit) disposeForestKit(kit);
        group.clear();
      },
    };
  } catch (error) {
    instances.forEach((m) => m.dispose());
    owned.forEach((g) => g.dispose());
    materials.forEach((m) => m.dispose());
    if (!forestKit) disposeForestKit(kit);
    throw error;
  }
}
