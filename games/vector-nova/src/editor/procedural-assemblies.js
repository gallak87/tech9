import * as T from 'three';

const UP = new T.Vector3(0, 1, 0);
const faceCount = (geometry) =>
  (geometry.index?.count ?? geometry.attributes.position.count) / 3;
function visualOnly(node) {
  const material = node.material,
    role = material.name.split('/').at(-1).trim();
  return Boolean(
    node.userData.editorVisualOnly ||
    material.userData.editorVisualOnly ||
    material.transparent ||
    material.alphaTest > 0 ||
    /^(glass|amber|solar|room(?:Dark|Warm|Cool)?|warm|red|vegetation)$/i.test(
      role,
    ),
  );
}

/** Adapt canonical local assemblies without retaining a campaign scene or
 * substituting filled collision boxes for their actual open structure. */
export function createProceduralAssemblies(context, source) {
  const { owner, placement, collectSolid, plan } = context;
  const geometries = new Map(),
    materials = new Map(),
    collisionGeometries = new Map();
  let remainingContactFaces = source.maxContactFaces ?? Infinity;
  let disposed = false;
  const boundsFor = (prototype) => {
    prototype.traverse((node) => {
      if (node.isInstancedMesh)
        throw new Error(
          'Flatten canonical source instances with their colors before adapting an assembly',
        );
      const proxy = node.userData.editorCollisionGeometry;
      if (proxy !== undefined && proxy !== false && !proxy?.isBufferGeometry)
        throw new Error(
          'An assembly collision override must be a BufferGeometry or false',
        );
    });
    prototype.updateMatrixWorld(true);
    return new T.Box3().setFromObject(prototype);
  };
  const localBounds = Object.fromEntries(
    Object.entries(source.prototypes).map(([id, prototype]) => [
      id,
      boundsFor(prototype),
    ]),
  );
  const contactFaces = Object.fromEntries(
    Object.entries(source.prototypes).map(([id, prototype]) => {
      let faces = 0;
      prototype.traverse((node) => {
        if (
          !node.isMesh ||
          visualOnly(node) ||
          node.userData.editorCollisionGeometry === false
        )
          return;
        faces += faceCount(
          node.userData.editorCollisionGeometry ?? node.geometry,
        );
      });
      return [id, faces];
    }),
  );
  function emit(
    asset,
    {
      id,
      x,
      z,
      y = null,
      scale = 1,
      yaw = 0,
      embed = 0.04,
      overlap = false,
    } = {},
  ) {
    const prototype = source.prototypes[asset],
      local = localBounds[asset];
    if (!prototype || local.isEmpty())
      throw new Error('Unknown canonical assembly: ' + asset);
    const size = local.getSize(new T.Vector3());
    const radius = (Math.max(size.x, size.z) * scale) / 2;
    const ground =
      y ??
      Math.min(
        plan.surfaceHeight(x, z),
        plan.surfaceHeight(x - radius * 0.45, z),
        plan.surfaceHeight(x + radius * 0.45, z),
        plan.surfaceHeight(x, z - radius * 0.45),
        plan.surfaceHeight(x, z + radius * 0.45),
      );
    const matrix = new T.Matrix4()
      .compose(
        new T.Vector3(x, ground - size.y * scale * embed, z),
        new T.Quaternion().setFromAxisAngle(UP, yaw),
        new T.Vector3().setScalar(scale),
      )
      .multiply(
        new T.Matrix4().makeTranslation(
          -(local.min.x + local.max.x) / 2,
          -local.min.y,
          -(local.min.z + local.max.z) / 2,
        ),
      );
    const bounds = local.clone().applyMatrix4(matrix);
    const solid = contactFaces[asset] <= remainingContactFaces;
    if (
      !placement.acceptBounds(bounds, {
        id,
        asset,
        overlap,
        ...(source.maxContactFaces !== undefined
          ? { solid, contactFaces: solid ? contactFaces[asset] : 0 }
          : {}),
      })
    )
      return false;
    if (solid) remainingContactFaces -= contactFaces[asset];
    prototype.traverse((node) => {
      if (!node.isMesh) return;
      if (Array.isArray(node.material))
        throw new Error('Canonical assembly parts need a single material');
      if (!geometries.has(node.geometry)) {
        const geometry = node.geometry.clone();
        geometries.set(node.geometry, geometry);
        owner.addGeometry(geometry);
      }
      if (!materials.has(node.material)) {
        const material = node.material.clone();
        material.name =
          node.material.name ||
          context.doc.biome + ' / production ' + materials.size;
        material.onBeforeCompile = node.material.onBeforeCompile;
        material.customProgramCacheKey = node.material.customProgramCacheKey;
        // A source is private to this editor owner. Sharing its uniform
        // containers preserves the owned simulation clock and avoids creating
        // untracked Texture.clone objects inside ShaderMaterial uniforms.
        if (node.material.isShaderMaterial)
          material.uniforms = { ...node.material.uniforms };
        material.userData.editorVisualOnly = visualOnly(node);
        owner.materials.add(material);
        materials.set(node.material, material);
      }
      const transform = matrix.clone().multiply(node.matrixWorld);
      const position = new T.Vector3(),
        rotation = new T.Quaternion(),
        stretch = new T.Vector3();
      transform.decompose(position, rotation, stretch);
      const material = materials.get(node.material);
      const name = id + ' / ' + node.name,
        proxy = node.userData.editorCollisionGeometry;
      owner.instance(
        name,
        geometries.get(node.geometry),
        material,
        position,
        stretch,
        rotation,
        !solid || material.userData.editorVisualOnly || proxy !== undefined
          ? null
          : collectSolid,
      );
      if (
        solid &&
        collectSolid &&
        !material.userData.editorVisualOnly &&
        proxy?.isBufferGeometry
      ) {
        // Proxy topology shares the source part's exact anchor and placement.
        // Keep these non-rendered clones with this borrowed part: the parent
        // owner releases geometries absent from its rendered batches at finish.
        if (!collisionGeometries.has(proxy))
          collisionGeometries.set(proxy, proxy.clone());
        collectSolid({
          name,
          geometry: collisionGeometries.get(proxy),
          matrix: transform,
          kind: 'structure',
        });
      }
    });
    return true;
  }
  const ready = Promise.resolve(source.ready).then(() => {
    if (disposed || owner.isDisposed()) return;
    // Production surface loaders can assign maps after the geometry is built.
    // Both source and clone belong solely to this owner, including High/Low.
    for (const [original, material] of materials) {
      material.onBeforeCompile = original.onBeforeCompile;
      material.customProgramCacheKey = original.customProgramCacheKey;
      material.needsUpdate = true;
      for (const [key, value] of Object.entries(original))
        if (value?.isTexture) {
          material[key] = value;
        }
    }
    owner.group.traverse((mesh) => {
      if (mesh.material?.userData.editorVisualOnly) mesh.castShadow = false;
    });
  });
  return {
    emit,
    localBounds,
    ready,
    get ownedTextures() {
      const textures = new Set(source.ownedTextures ?? []);
      for (const material of materials.values()) {
        for (const value of Object.values(material))
          if (value?.isTexture) textures.add(value);
        for (const uniform of Object.values(material.uniforms ?? {}))
          if (uniform?.value?.isTexture) textures.add(uniform.value);
      }
      return textures;
    },
    update: (frame) => source.update?.(frame),
    dispose() {
      if (disposed) return;
      disposed = true;
      collisionGeometries.forEach((geometry) => geometry.dispose());
      collisionGeometries.clear();
      source.dispose();
    },
  };
}

export function planManufacturedSites(
  context,
  kit,
  { floating = false, families, limit = 40, spacing = 300 } = {},
) {
  const { track, plan, placement, doc } = context;
  const random = placement.random;
  let count = 0;
  if (track) {
    const stations = Math.min(
      floating ? 26 : 36,
      Math.ceil(track.length / spacing),
    );
    for (let i = 0; i < stations && count < limit; i++) {
      const distance = ((i + 0.45) / stations) * track.length;
      if (track.isJumpProtected?.(distance)) continue;
      const frame = track.sample(distance),
        side = i % 2 ? -1 : 1;
      const right = new T.Vector3(frame.right.x, 0, frame.right.z).normalize();
      const asset = families[i % families.length],
        local = kit.localBounds[asset];
      const size = local.getSize(new T.Vector3());
      const scale = floating ? 0.8 + random() * 0.45 : 0.85 + random() * 0.3;
      const half = (Math.hypot(size.x, size.z) * scale) / 2;
      for (const extra of [0, 90, 190]) {
        const position = frame.position
          .clone()
          .addScaledVector(right, side * (half + 90 + extra));
        const y = floating
          ? frame.position.y - size.y * scale * (0.4 + random() * 0.2)
          : null;
        if (
          kit.emit(asset, {
            id: 'route-' + i,
            x: position.x,
            z: position.z,
            y,
            scale,
            yaw:
              Math.atan2(frame.tangent.x, frame.tangent.z) +
              (floating ? (random() - 0.5) * 0.35 : 0),
          })
        ) {
          count++;
          break;
        }
      }
    }
  }
  for (const [i, district] of plan.districts.entries()) {
    if (count >= limit) break;
    if (random() > 0.32 + doc.settings.density * 0.65) continue;
    const asset = families[(i + 1) % families.length];
    const size = kit.localBounds[asset].getSize(new T.Vector3());
    const y = floating ? district.y + 80 - size.y * 0.5 : null;
    if (
      kit.emit(asset, {
        id: 'precinct-' + i,
        x: district.x,
        z: district.z,
        y,
        yaw: district.yaw,
        scale: 0.9 + random() * 0.35,
      })
    )
      count++;
  }
  return count;
}
