import * as THREE from 'three';
import { pathCenter, terrainHeight } from '../world/terrain.js';
export const SPAWN = { x: pathCenter(22), z: 22 };
export const DEER = { x: pathCenter(-17) + 0.35, z: -17 };
export const HUNT_BOUNDS = { minX: -22, maxX: 30, minZ: -42, maxZ: 32 };
export function createSigns() {
  const group = new THREE.Group();
  group.name = 'Fresh split-hoof trail';
  const material = new THREE.MeshStandardMaterial({
    color: '#342a1d',
    roughness: 1,
  });
  const shape = new THREE.Shape();
  shape.moveTo(0, -0.1);
  shape.bezierCurveTo(-0.042, -0.07, -0.048, 0.045, -0.018, 0.095);
  shape.bezierCurveTo(0.008, 0.12, 0.04, 0.065, 0.035, -0.055);
  shape.closePath();
  const hoof = new THREE.ShapeGeometry(shape, 10);
  hoof.rotateX(-Math.PI / 2);
  material.polygonOffset = true;
  material.polygonOffsetFactor = -1;
  material.polygonOffsetUnits = -1;
  for (let i = 0; i < 40; i++) {
    const z = 20 - i * 0.9,
      x = pathCenter(z) + Math.sin(i * 2.2) * 0.25;
    for (const foot of [-1, 1])
      for (const toe of [-1, 1]) {
        const mark = new THREE.Mesh(hoof, material);
        const px = x + foot * 0.2 + toe * 0.045,
          pz = z + foot * 0.17;
        mark.position.set(px, terrainHeight(px, pz) + 0.008, pz);
        mark.scale.set(1, 1, 1);
        mark.rotation.y = -0.13 + foot * 0.15;
        group.add(mark);
      }
  }
  // Trailhead post is both an authored landmark and a solid game prop.
  const wood = new THREE.MeshStandardMaterial({
    color: '#655441',
    roughness: 0.9,
  });
  const post = new THREE.Mesh(new THREE.BoxGeometry(0.18, 1.5, 0.18), wood);
  const postX = pathCenter(19) - 2.4;
  post.position.set(postX, terrainHeight(postX, 19) + 0.75, 19);
  post.castShadow = true;
  group.add(post);
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#23372f';
  ctx.fillRect(0, 0, 512, 256);
  ctx.strokeStyle = '#a5ab83';
  ctx.lineWidth = 5;
  ctx.strokeRect(12, 12, 488, 232);
  ctx.textAlign = 'center';
  ctx.fillStyle = '#ede5cc';
  ctx.font = '30px Georgia';
  ctx.fillText('PINEWATCH', 256, 78);
  ctx.font = '20px sans-serif';
  ctx.fillText('NORTH TRAIL', 256, 130);
  ctx.font = '42px serif';
  ctx.fillText('↑', 256, 201);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const sign = new THREE.Mesh(
    new THREE.BoxGeometry(1.05, 0.53, 0.065),
    new THREE.MeshStandardMaterial({ map: texture, roughness: 0.85 }),
  );
  sign.position.set(postX, post.position.y + 0.5, 19);
  sign.castShadow = true;
  group.add(sign);
  return {
    group,
    colliders: [
      { id: 'trail-post', kind: 'prop', x: postX, z: 19, radius: 0.48 },
    ],
    dispose() {
      const geometries = new Set(),
        materials = new Set();
      group.traverse((o) => {
        if (o.geometry) geometries.add(o.geometry);
        if (o.material) materials.add(o.material);
      });
      geometries.forEach((g) => g.dispose());
      materials.forEach((m) => m.dispose());
      texture.dispose();
      group.removeFromParent();
    },
  };
}
/** Conservative tree/rock line of sight, matching walking collision descriptors. */
export function clearSight(from, to, colliders) {
  const dx = to.x - from.x,
    dz = to.z - from.z,
    l2 = dx * dx + dz * dz;
  return !colliders.some((c) => {
    const t = ((c.x - from.x) * dx + (c.z - from.z) * dz) / l2;
    return (
      t > 0.02 &&
      t < 0.98 &&
      Math.hypot(from.x + dx * t - c.x, from.z + dz * t - c.z) < c.radius
    );
  });
}

/** Derive chain-of-circle proxies directly from the rendered deadfall instances. */
export function getDeadfallColliders(scene) {
  const circles = [],
    matrix = new THREE.Matrix4(),
    combined = new THREE.Matrix4();
  scene.updateMatrixWorld(true);
  scene.traverse((mesh) => {
    if (
      !mesh.isInstancedMesh ||
      !mesh.name.startsWith('fallen_log/fallen_log_bark')
    )
      return;
    for (let i = 0; i < mesh.count; i++) {
      mesh.getMatrixAt(i, matrix);
      combined.multiplyMatrices(mesh.matrixWorld, matrix);
      const scale = new THREE.Vector3().setFromMatrixScale(combined);
      for (let j = 0; j <= 13; j++) {
        const point = new THREE.Vector3(j * 0.4, 0, 0).applyMatrix4(combined);
        circles.push({
          id: `log-${mesh.id}-${i}-${j}`,
          kind: 'log',
          x: point.x,
          z: point.z,
          radius: 0.34 * Math.max(scale.x, scale.z),
        });
      }
    }
  });
  return circles;
}
/** Foliage cutout rectangles are not solid timber: raycasts ignore texture alpha. */
export function collectShotBlockers(scene) {
  const meshes = [];
  scene.traverse((mesh) => {
    if (!mesh.isMesh) return;
    const materials = Array.isArray(mesh.material)
      ? mesh.material
      : [mesh.material];
    if (
      materials.every(
        (m) => m && !m.isShaderMaterial && !m.transparent && !(m.alphaTest > 0),
      )
    )
      meshes.push(mesh);
  });
  return meshes;
}
