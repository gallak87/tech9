import * as T from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

/** Attach only the original world-frame extension. The caller owns its loaded
 * source/resources and the borrowed Saffron material family. Editor guides
 * never belong in this runtime asset or on the unchanged racing surface. */
export function attachOssuaryCranioThoracic(
  source,
  { group, resources, styleMaterial, sedimentMaterial },
) {
  source.updateMatrixWorld(true);
  const root = source.getObjectByName('ossuary_cranio_thoracic');
  if (!root)
    throw new Error(
      'Ossuary cranio-thoracic anatomy is missing its world root',
    );
  if (!root.matrixWorld.equals(new T.Matrix4()))
    throw new Error(
      'Ossuary cranio-thoracic anatomy must retain its authored world frame',
    );
  source.traverse((object) => {
    if (object.isCamera || object.isLight || /^GUIDE[_ /]/i.test(object.name))
      throw new Error(
        'Ossuary editor references must not enter the runtime asset',
      );
    if (object.isMesh) {
      let owner = object;
      while (owner && owner !== root) owner = owner.parent;
      if (!owner)
        throw new Error(
          'Ossuary runtime meshes must belong to the original anatomy root',
        );
    }
  });
  let meshes = 0;
  const batches = new Map(),
    identity = new T.Matrix4(),
    temporary = [];
  try {
    root.traverse((object) => {
      if (!object.isMesh) return;
      meshes++;
      let sediment = false;
      for (
        let owner = object;
        owner && owner !== root.parent;
        owner = owner.parent
      )
        if (
          owner.name === 'ossuary_sediment' ||
          owner.userData.ossuarySediment === true
        )
          sediment = true;
      if (sediment) object.material = sedimentMaterial;
      else
        for (const material of [object.material].flat())
          styleMaterial(material, 'cranio-thoracic');
      object.castShadow = object.receiveShadow = true;
      if (Array.isArray(object.material))
        throw new Error(
          'Ossuary original anatomy requires one material per GLB primitive',
        );
      const geometry = object.geometry.clone();
      temporary.push(geometry);
      // Identity world export is deliberate: avoid even normal renormalization
      // on that path so every retained attribute remains bit-for-bit identical.
      if (!object.matrixWorld.equals(identity))
        geometry.applyMatrix4(object.matrixWorld);
      if (!batches.has(object.material)) batches.set(object.material, []);
      batches.get(object.material).push(geometry);
    });
    if (!meshes)
      throw new Error('Ossuary cranio-thoracic anatomy has no rendered volume');
    root.clear();
    for (const [material, geometries] of batches) {
      const geometry = mergeGeometries(geometries, false);
      if (!geometry)
        throw new Error(
          'Ossuary static anatomy material batch could not merge',
        );
      resources.geometry(geometry);
      geometry.computeBoundingBox();
      geometry.computeBoundingSphere();
      const mesh = new T.Mesh(geometry, material);
      mesh.name = `Ossuary / connected static anatomy / ${material.name}`;
      mesh.castShadow = mesh.receiveShadow = true;
      root.add(mesh);
    }
  } finally {
    for (const geometry of temporary) geometry.dispose();
  }
  root.name = 'Ossuary / connected cranio-thoracic fossil landscape';
  group.add(root);
  return root;
}
