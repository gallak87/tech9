import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import * as THREE from 'three';
import { POND, shorePoint, BANK_ROCKS } from './pondDefinition.js';
import { terrainHeight, createRandom } from './terrain.js';

export function createPondWorld({
  assetBase = import.meta.env?.BASE_URL ?? '/',
} = {}) {
  const group = new THREE.Group(),
    owned = new Set();
  const random = createRandom(73311);
  let context,
    disposed = false;
  function mesh(geometry, material, x, y, z) {
    owned.add(geometry);
    owned.add(material);
    const object = new THREE.Mesh(geometry, material);
    object.position.set(x, y, z);
    object.receiveShadow = true;
    group.add(object);
    return object;
  }
  return {
    id: 'pond-shore-detail',
    stats: { authoredShore: true },
    async init(ctx) {
      if (disposed || context)
        throw new Error('Shore detail can only initialize once.');
      context = ctx;
      const reedMat = new THREE.MeshStandardMaterial({
        color: '#737341',
        roughness: 0.9,
      });
      const headMat = new THREE.MeshStandardMaterial({
        color: '#443b23',
        roughness: 1,
      });
      // Deliberate reed pockets leave the arrival beach open.
      for (const angle of [0.18, 0.44, 0.7, 2.28, 2.55, 3.6, 4.8, 5.5]) {
        for (let j = 0; j < 27; j++) {
          const [x, z] = shorePoint(
            angle + (random() - 0.5) * 0.17,
            0.994 + random() * 0.025,
          );
          const h = 0.65 + random() * 0.6,
            y = terrainHeight(x, z);
          const stem = mesh(
            new THREE.CylinderGeometry(0.009, 0.018, h, 4),
            reedMat,
            x,
            y + h / 2,
            z,
          );
          stem.rotation.z = (random() - 0.5) * 0.15;
          if (j % 3 === 0)
            mesh(
              new THREE.CapsuleGeometry(0.035, 0.17, 3, 5),
              headMat,
              x,
              y + h,
              z,
            );
          const blade = mesh(
            new THREE.ConeGeometry(0.035, h * 0.8, 3),
            reedMat,
            x + 0.07,
            y + h * 0.42,
            z,
          );
          blade.rotation.z = 0.2 + random() * 0.35;
        }
      }
      const rockMat = new THREE.MeshStandardMaterial({
        color: '#858677',
        vertexColors: false,
        roughness: 0.95,
      });
      owned.add(rockMat);
      const rockTextures = await Promise.all(
        ['diff', 'nor_gl', 'rough'].map(async (suffix) => {
          const texture = await new THREE.TextureLoader().loadAsync(
            `${assetBase}assets/textures/shore-rock-${suffix}.jpg`,
          );
          texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
          texture.repeat.set(1.3, 1.3);
          texture.anisotropy = Math.min(
            8,
            ctx.renderer.capabilities.getMaxAnisotropy(),
          );
          if (suffix === 'diff') texture.colorSpace = THREE.SRGBColorSpace;
          if (disposed) texture.dispose();
          else owned.add(texture);
          return texture;
        }),
      );
      if (disposed)
        throw new Error('Shore detail was disposed during texture loading.');
      [rockMat.map, rockMat.normalMap, rockMat.roughnessMap] = rockTextures;
      rockMat.normalScale = new THREE.Vector2(0.48, 0.48);
      rockMat.color.set('#c5c4b0');
      const rockGeo = new THREE.DodecahedronGeometry(1, 1);
      const rockPositions = rockGeo.attributes.position;
      for (let i = 0; i < rockPositions.count; i++) {
        const x = rockPositions.getX(i),
          y = rockPositions.getY(i),
          z = rockPositions.getZ(i);
        const irregular = 1 + 0.13 * Math.sin(x * 7 + y * 3 + z * 5);
        rockPositions.setXYZ(i, x * irregular, y * irregular, z * irregular);
      }
      rockGeo.computeVertexNormals();
      for (let i = 0; i < 83; i++) {
        const clusters = [0.45, 2.62, 4.45, 5.52];
        const a =
            i < 64
              ? clusters[i % 4] + (random() - 0.5) * 0.45
              : random() * Math.PI * 2,
          [x, z] = shorePoint(a, 1.028 + random() * 0.085);
        const r = i < 9 ? 0.4 + random() * 0.6 : 0.045 + random() * 0.27;
        const rock = mesh(
          rockGeo,
          rockMat,
          x,
          terrainHeight(x, z) + r * 0.08,
          z,
        );
        rock.scale.set(r * 1.4, r * 0.65, r);
        rock.rotation.set(random(), random() * 6, random());
      }
      // An asymmetric bank cluster, composed for the arrival sightline.
      for (const [x, z, sx, sy, sz, angle] of BANK_ROCKS) {
        const rock = mesh(
          rockGeo,
          rockMat,
          x,
          terrainHeight(x, z) + sy * 0.13,
          z,
        );
        rock.scale.set(sx, sy, sz);
        rock.rotation.y = angle;
      }
      for (let i = 0; i < 48; i++) {
        const x = -5.6 + (random() - 0.5) * 1.7,
          z = 15.2 + (random() - 0.5) * 1.1;
        const y = terrainHeight(x, z),
          h = 0.34 + random() * 0.58;
        const reed = mesh(
          new THREE.ConeGeometry(0.017, h, 3),
          reedMat,
          x,
          y + h * 0.5,
          z,
        );
        reed.rotation.z = (random() - 0.5) * 0.4;
        if (i % 4 === 0)
          mesh(
            new THREE.CapsuleGeometry(0.026, 0.13, 3, 5),
            headMat,
            x,
            y + h,
            z,
          );
      }
      const padMat = new THREE.MeshStandardMaterial({
        color: '#496247',
        roughness: 0.56,
        side: THREE.DoubleSide,
      });
      for (let i = 0; i < 42; i++) {
        const [x, z] = shorePoint(
          i < 23 ? 2.85 + random() * 0.25 : 0.24 + random() * 0.3,
          0.73 + random() * 0.18,
        );
        const pad = mesh(
          new THREE.CircleGeometry(
            0.17 + random() * 0.16,
            18,
            0.12,
            Math.PI * 2 - 0.24,
          ),
          padMat,
          x,
          POND.level + 0.035,
          z,
        );
        pad.rotation.set(-Math.PI / 2, 0, random() * 6);
      }
      // A few bank daisies provide scale and a quiet point of warmth.
      const flowerMat = new THREE.MeshStandardMaterial({
        color: '#ddc891',
        roughness: 1,
      });
      for (let i = 0; i < 30; i++) {
        const [x, z] = shorePoint(
          1.03 + random() * 0.08,
          1.14 + random() * 0.1,
        );
        mesh(
          new THREE.SphereGeometry(0.034, 5, 4),
          flowerMat,
          x,
          terrainHeight(x, z) + 0.3 + random() * 0.25,
          z,
        );
      }
      // Static shore detail is batched by material; reeds must not cost hundreds of draws.
      const batches = new Map();
      for (const item of [...group.children]) {
        item.updateMatrix();
        const baked = item.geometry.clone().applyMatrix4(item.matrix);
        owned.add(baked);
        if (!batches.has(item.material)) batches.set(item.material, []);
        batches.get(item.material).push(baked);
        group.remove(item);
      }
      for (const [material, geometries] of batches) {
        const merged = mergeGeometries(
          geometries.map((g) => {
            if (!g.index) return g;
            const flat = g.toNonIndexed();
            owned.add(flat);
            return flat;
          }),
        );
        owned.add(merged);
        const batch = new THREE.Mesh(merged, material);
        batch.receiveShadow = true;
        group.add(batch);
      }
      ctx.scene.add(group);
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      context?.scene.remove(group);
      owned.forEach((resource) => resource.dispose());
      owned.clear();
      group.clear();
    },
  };
}
