import * as T from 'three';
import {
  createLivingForestKit,
  livingForestBarkURL,
  livingForestLeafURL,
} from '@worldkit/environment/living-forest';

const UP = new T.Vector3(0, 1, 0);
const DOWN = new T.Vector3(0, -1, 0);
const CLUMPS = [
  [-0.34, 0.08],
  [0.12, 0.35],
  [0.29, -0.3],
];
const naturalTerrace = (material) =>
  /ancient.*strata|topsoil|grass|turf/i.test(material?.name ?? '');

function randomSource(seed) {
  let value = seed >>> 0;
  return () => {
    value = (Math.imul(value, 1664525) + 1013904223) >>> 0;
    return value / 4294967296;
  };
}

// The canonical kit supplies geometry/materials/images. Skywell owns its small
// cultivated groves, seated on the actual top triangles of authored islands.
export async function createSkywellGardens({
  terraces,
  loadTexture = (url) => new T.TextureLoader().loadAsync(url),
}) {
  const group = new T.Group();
  group.name = 'Skywell / cultivated Worldkit terrace gardens';
  group.userData.usesWorldkit = '@worldkit/environment/living-forest';
  group.userData.treeCount = 0;
  group.userData.shrubCount = 0;
  group.userData.targetTreeCount = 0;
  group.userData.targetShrubCount = 0;
  const textures = new Set(),
    instances = new Set(),
    groves = [],
    cameraPosition = new T.Vector3(),
    lastCameraPosition = new T.Vector3(Infinity, Infinity, Infinity);
  let kit,
    disposed = false;
  function dispose() {
    if (disposed) return;
    disposed = true;
    instances.forEach((mesh) => mesh.dispose());
    instances.clear();
    groves.length = 0;
    group.clear();
    kit?.dispose();
    textures.forEach((texture) => texture.dispose());
    textures.clear();
  }
  function update(camera) {
    if (disposed || !camera) return;
    if (camera.getWorldPosition) camera.getWorldPosition(cameraPosition);
    else cameraPosition.copy(camera.position ?? camera);
    if (cameraPosition.distanceToSquared(lastCameraPosition) < 16 ** 2) return;
    lastCameraPosition.copy(cameraPosition);
    for (const { grove, bounds } of groves)
      grove.visible = bounds.distanceToPoint(cameraPosition) <= 1950;
  }
  if (!terraces.length) return { group, update, dispose };
  const loaded = await Promise.allSettled(
    [livingForestBarkURL, livingForestLeafURL].map((url) =>
      Promise.resolve().then(() => loadTexture(url)),
    ),
  );
  for (const result of loaded)
    if (result.status === 'fulfilled') textures.add(result.value);
  const failure = loaded.find((result) => result.status === 'rejected');
  if (failure) {
    dispose();
    throw failure.reason;
  }
  try {
    const [bark, leaves] = loaded.map((result) => result.value);
    bark.colorSpace = leaves.colorSpace = T.SRGBColorSpace;
    bark.wrapS = bark.wrapT = T.RepeatWrapping;
    leaves.wrapS = leaves.wrapT = T.ClampToEdgeWrapping;
    bark.anisotropy = leaves.anisotropy = 4;
    kit = createLivingForestKit({
      detail: 'low',
      seed: 7319,
      textures: { wood: { map: bark }, leaf: { map: leaves } },
    });
    kit.materials.wood.color.set('#bfb6a3');
    kit.materials.leaf.color.set('#c4ceb7');
    const ray = new T.Raycaster(),
      inverse = new T.Matrix4(),
      normalMatrix = new T.Matrix3(),
      normal = new T.Vector3(),
      matrix = new T.Matrix4(),
      rotation = new T.Quaternion(),
      local = new T.Vector3();
    const totalWeight = terraces.reduce(
      (sum, terrace) => sum + (terrace.garden?.weight ?? 1),
      0,
    );
    for (const [index, terrace] of terraces.entries()) {
      const { object, seed = index + 1, blockers = [], garden = {} } = terrace,
        random = randomSource(seed),
        surfaces = [],
        localBounds = new T.Box3(),
        relative = new T.Matrix4();
      object.updateWorldMatrix(true, true);
      inverse.copy(object.matrixWorld).invert();
      object.traverse((mesh) => {
        if (!mesh.isMesh || !mesh.visible) return;
        surfaces.push(mesh);
        if (![mesh.material].flat().some(naturalTerrace)) return;
        mesh.geometry.computeBoundingBox();
        relative.multiplyMatrices(inverse, mesh.matrixWorld);
        localBounds.union(
          mesh.geometry.boundingBox.clone().applyMatrix4(relative),
        );
      });
      if (localBounds.isEmpty()) continue;
      const worldBounds = new T.Box3().setFromObject(object),
        nearbyBounds = worldBounds
          .clone()
          .expandByVector(new T.Vector3(0, 400, 0)),
        structures = [],
        center = localBounds.getCenter(new T.Vector3()),
        half = localBounds.getSize(new T.Vector3()).multiplyScalar(0.5),
        grove = new T.Group(),
        trees = [],
        shrubs = [],
        roots = [];
      for (const blocker of blockers) {
        blocker.updateWorldMatrix(true, true);
        const bounds = new T.Box3().setFromObject(blocker);
        if (!nearbyBounds.intersectsBox(bounds)) continue;
        const meshes = [];
        blocker.traverse((mesh) => {
          if (mesh.isMesh && mesh.visible) meshes.push(mesh);
        });
        structures.push({ bounds, meshes });
      }
      grove.name = `Skywell / rooted grove ${index + 1}`;
      const turn = garden.rotation ?? random() * Math.PI * 2,
        cosine = Math.cos(turn),
        sine = Math.sin(turn);
      function rootFor(clump, shrub) {
        // Three broad planting courts leave the centre and mineral edge open.
        const angle = random() * Math.PI * 2,
          radius = Math.sqrt(random()),
          x =
            clump[0] +
            Math.cos(angle) *
              radius *
              (shrub
                ? (garden.shrubRadius ?? 0.22)
                : (garden.treeRadius ?? 0.2)),
          z =
            clump[1] +
            Math.sin(angle) *
              radius *
              (shrub
                ? (garden.shrubRadius ?? 0.22)
                : (garden.treeRadius ?? 0.2));
        local.set(
          center.x + (x * cosine - z * sine) * half.x,
          0,
          center.z + (x * sine + z * cosine) * half.z,
        );
        const origin = object.localToWorld(local.clone());
        // Architecture can stand higher than the mineral rim. Cast from above
        // its roof so a tree cannot originate inside a neighboring abbey.
        const overhead = structures.filter(
          ({ bounds }) =>
            origin.x >= bounds.min.x &&
            origin.x <= bounds.max.x &&
            origin.z >= bounds.min.z &&
            origin.z <= bounds.max.z,
        );
        origin.y =
          Math.max(
            worldBounds.max.y,
            ...overhead.map(({ bounds }) => bounds.max.y),
          ) + 12;
        ray.set(origin, DOWN);
        ray.far = origin.y - worldBounds.min.y + 12;
        const hit = ray.intersectObjects(
          [...surfaces, ...overhead.flatMap(({ meshes }) => meshes)],
          false,
        )[0];
        if (!hit?.face) return null;
        const material = Array.isArray(hit.object.material)
          ? hit.object.material[hit.face.materialIndex]
          : hit.object.material;
        if (!naturalTerrace(material)) return null;
        normalMatrix.getNormalMatrix(hit.object.matrixWorld);
        normal.copy(hit.face.normal).applyMatrix3(normalMatrix).normalize();
        if (normal.dot(UP) < 0.85) return null;
        const at = hit.point.clone().applyMatrix4(inverse);
        // The island library's cultivated bed is y=0; lower ledges/undersides
        // share its rock material and must never become planting surfaces.
        if (Math.abs(at.y) > 2.5) return null;
        const spacing = shrub
          ? (garden.shrubSpacing ?? 4.5)
          : (garden.treeSpacing ?? 13);
        if (
          roots.some(
            (point) => point.distanceToSquared(hit.point) < spacing ** 2,
          )
        )
          return null;
        return hit.point;
      }
      const weight = garden.weight ?? 1,
        treeLimit = Math.min(
          garden.trees ?? 16,
          Math.floor((300 * weight) / totalWeight),
        ),
        shrubLimit = Math.min(
          garden.shrubs ?? 24,
          Math.floor((400 * weight) / totalWeight),
        ),
        targetTrees = Math.min(
          treeLimit,
          garden.trees ?? 12 + Math.floor(random() * 5),
        ),
        targetShrubs = Math.min(
          shrubLimit,
          garden.shrubs ?? 16 + Math.floor(random() * 9),
        );
      group.userData.targetTreeCount += targetTrees;
      group.userData.targetShrubCount += targetShrubs;
      const prototype = kit.prototypes[(seed >>> 0) % kit.prototypes.length];
      const plantBounds = (parts) => {
        const result = new T.Box3();
        for (const part of parts) {
          part.geometry.computeBoundingBox();
          result.union(part.geometry.boundingBox);
        }
        return result;
      };
      const treeBounds = garden.clearance
          ? plantBounds(prototype.treeParts)
          : null,
        shrubBounds = garden.clearance ? plantBounds(kit.shrubParts) : null;
      function plant(target, shrub, placements) {
        for (
          let attempt = 0;
          placements.length < target && attempt < target * 9;
          attempt++
        ) {
          const clumps = garden.clumps ?? CLUMPS;
          const point = rootFor(clumps[attempt % clumps.length], shrub);
          if (!point) continue;
          const range = shrub
            ? (garden.shrubScale ?? [0.7, 1.25])
            : (garden.treeScale ?? [0.12, 0.24]);
          const scale = T.MathUtils.lerp(range[0], range[1], random());
          rotation.setFromAxisAngle(UP, random() * Math.PI * 2);
          matrix.compose(
            point,
            rotation,
            new T.Vector3(scale * (0.92 + random() * 0.16), scale, scale),
          );
          if (garden.clearance) {
            const bounds = (shrub ? shrubBounds : treeBounds)
              .clone()
              .applyMatrix4(matrix);
            const centre = bounds.getCenter(new T.Vector3()),
              size = bounds.getSize(new T.Vector3());
            if (
              !garden.clearance.clears(
                centre.x,
                centre.z,
                size.x,
                size.z,
                bounds.max.y,
                0,
                bounds.min.y,
              )
            )
              continue;
          }
          placements.push(matrix.clone());
          roots.push(point);
        }
      }
      plant(targetTrees, false, trees);
      plant(targetShrubs, true, shrubs);
      function batch(parts, placements, category) {
        if (!placements.length) return;
        for (const part of parts) {
          const mesh = new T.InstancedMesh(
            part.geometry,
            part.material,
            placements.length,
          );
          instances.add(mesh);
          placements.forEach((placement, i) => mesh.setMatrixAt(i, placement));
          mesh.name = `Skywell / ${category} ${part.kind} / terrace ${index + 1}`;
          mesh.instanceMatrix.needsUpdate = true;
          mesh.computeBoundingBox();
          mesh.computeBoundingSphere();
          mesh.castShadow = false;
          mesh.receiveShadow = true;
          grove.add(mesh);
        }
      }
      batch(prototype.treeParts, trees, 'garden trees');
      batch(kit.shrubParts, shrubs, 'garden shrubs');
      if (grove.children.length) {
        group.add(grove);
        grove.updateWorldMatrix(true, true);
        groves.push({ grove, bounds: new T.Box3().setFromObject(grove) });
      }
      group.userData.treeCount += trees.length;
      group.userData.shrubCount += shrubs.length;
    }
    return { group, update, dispose };
  } catch (error) {
    dispose();
    throw error;
  }
}
