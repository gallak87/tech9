import * as T from 'three';
import { vesperTerrainHeight } from './terrain.js';

/** Each tree keeps a parent-connected mesh; only its basal flare follows terrain. */
export function createGroundedTree(template, placement, ground = -100) {
  const tree = template.clone(true);
  tree.position.fromArray(placement.position);
  // Far forest roots must remain on the existing rendered floor footprint.
  tree.position.x = T.MathUtils.clamp(tree.position.x, -1660, 2260);
  tree.position.z = T.MathUtils.clamp(tree.position.z, -1710, 1710);
  tree.position.y =
    vesperTerrainHeight(tree.position.x, tree.position.z, ground) - 0.8;
  tree.scale.multiply(new T.Vector3(...(placement.scale ?? [1, 1, 1])));
  tree.rotation.y = placement.yaw ?? 0;
  tree.userData.connectedTree = true;
  tree.updateMatrixWorld(true);
  const centerHeight = vesperTerrainHeight(
    tree.position.x,
    tree.position.z,
    ground,
  );
  tree.traverse((mesh) => {
    if (!mesh.isMesh) return;
    mesh.receiveShadow = true;
    mesh.castShadow = mesh.name.endsWith('_wood');
    if (!mesh.name.endsWith('_wood')) return;
    mesh.geometry = mesh.geometry.clone();
    mesh.geometry.userData.terrainFitted = true;
    const positions = mesh.geometry.attributes.position;
    const point = new T.Vector3();
    const inverse = mesh.matrixWorld.clone().invert();
    for (let v = 0; v < positions.count; v++) {
      point.fromBufferAttribute(positions, v).applyMatrix4(mesh.matrixWorld);
      const height = point.y - tree.position.y;
      if (height >= 16) continue;
      const weight = 1 - T.MathUtils.smoothstep(height, 0, 16);
      point.y +=
        (vesperTerrainHeight(point.x, point.z, ground) - centerHeight) * weight;
      point.applyMatrix4(inverse);
      positions.setXYZ(v, point.x, point.y, point.z);
    }
    mesh.geometry.computeVertexNormals();
    mesh.geometry.computeBoundingBox();
    mesh.geometry.computeBoundingSphere();
  });
  return tree;
}
