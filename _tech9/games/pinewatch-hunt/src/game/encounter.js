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
  const hoof = new THREE.SphereGeometry(1, 7, 4);
  for (let i = 0; i < 40; i++) {
    const z = 20 - i * 0.9,
      x = pathCenter(z) + Math.sin(i * 2.2) * 0.25;
    for (const foot of [-1, 1])
      for (const toe of [-1, 1]) {
        const mark = new THREE.Mesh(hoof, material);
        const px = x + foot * 0.2 + toe * 0.045,
          pz = z + foot * 0.17;
        mark.position.set(px, terrainHeight(px, pz) + 0.014, pz);
        mark.scale.set(0.042, 0.012, 0.105);
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
