import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import * as THREE from 'three';
import { Water } from './WaterSurface.js';
import { POND, shorePoint } from './pondDefinition.js';
import { terrainHeight, createRandom } from './terrain.js';

function waterNormals() {
  const size = 128,
    data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const u = (x / size) * Math.PI * 2,
        v = (y / size) * Math.PI * 2;
      const nx =
        0.12 * Math.cos(u * 7 + v * 3) + 0.09 * Math.sin(u * 13 - v * 9);
      const ny =
        0.12 * Math.sin(v * 8 + u * 2) + 0.08 * Math.cos(v * 15 - u * 8);
      const i = (y * size + x) * 4;
      data[i] = 128 + nx * 127;
      data[i + 1] = 128 + ny * 127;
      data[i + 2] = 255;
      data[i + 3] = 255;
    }
  const texture = new THREE.DataTexture(data, size, size);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.magFilter = texture.minFilter = THREE.LinearFilter;
  texture.needsUpdate = true;
  return texture;
}

export function createPondWorld() {
  const group = new THREE.Group(),
    owned = new Set();
  const random = createRandom(73311);
  let water,
    normals,
    context,
    frame = 0,
    reflectionStride = 3;
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
    id: 'stillwater-pond',
    stats: { reflectionSize: 512, authoredShore: true },
    async init(ctx) {
      context = ctx;
      const shape = new THREE.Shape();
      for (let i = 0; i <= 160; i++) {
        const [x, z] = shorePoint((-i / 160) * Math.PI * 2, 1.008);
        if (i === 0) shape.moveTo(x, -z);
        else shape.lineTo(x, -z);
      }
      const geometry = new THREE.ShapeGeometry(shape);
      normals = waterNormals();
      water = new Water(geometry, {
        textureWidth: 512,
        textureHeight: 512,
        waterNormals: normals,
        sunDirection: new THREE.Vector3(-32, 22, -48).normalize(),
        sunColor: '#ffdc9c',
        waterColor: '#31564c',
        distortionScale: 0.24,
        fog: true,
      });
      water.rotation.x = -Math.PI / 2;
      water.position.y = POND.level + 0.018;
      water.material.uniforms.size.value = 11;
      water.material.uniforms.pondFrame = {
        value: new THREE.Vector4(POND.x, POND.z, POND.radiusX, POND.radiusZ),
      };
      const reflect = water.onBeforeRender;
      water.onBeforeRender = (...args) => {
        if (frame++ % reflectionStride === 0) reflect(...args);
      };
      group.add(water);
      const reedMat = new THREE.MeshStandardMaterial({
        color: '#737341',
        roughness: 0.9,
      });
      const headMat = new THREE.MeshStandardMaterial({
        color: '#443b23',
        roughness: 1,
      });
      // Deliberate reed pockets leave the arrival beach and casting lane open.
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
      const rockTextures = await Promise.all(
        ['diff', 'nor_gl', 'rough'].map(async (suffix) => {
          const texture = await new THREE.TextureLoader().loadAsync(
            `${import.meta.env.BASE_URL}assets/textures/shore-rock-${suffix}.jpg`,
          );
          texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
          texture.repeat.set(1.3, 1.3);
          texture.anisotropy = Math.min(
            8,
            ctx.renderer.capabilities.getMaxAnisotropy(),
          );
          if (suffix === 'diff') texture.colorSpace = THREE.SRGBColorSpace;
          owned.add(texture);
          return texture;
        }),
      );
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
      // An asymmetric fishing-bank cluster, composed for the arrival sightline.
      for (const [x, z, sx, sy, sz, angle] of [
        [-5.8, 17.6, 1.35, 0.76, 0.91, 0.5],
        [-7.1, 16.8, 0.8, 0.53, 0.72, 1.2],
        [-4.7, 18.2, 0.42, 0.3, 0.61, 2.1],
        [6.9, 18.1, 0.93, 0.58, 0.72, 1.8],
      ]) {
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
        const x = -7.1 + (random() - 0.5) * 2.3,
          z = 17.3 + (random() - 0.5) * 1.6;
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
        if (item === water) continue;
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
    configure(settings) {
      if (!water) return;
      const size = { balanced: 512, high: 768, ultra: 1024 }[settings.quality];
      water.renderTarget.setSize(size, size);
      reflectionStride = settings.quality === 'balanced' ? 3 : 2;
      this.stats.reflectionSize = size;
    },
    update(dt) {
      if (water) water.material.uniforms.time.value += dt * 0.34;
    },
    dispose() {
      context?.scene.remove(group);
      water?.renderTarget.dispose();
      water?.geometry.dispose();
      water?.material.dispose();
      normals?.dispose();
      owned.forEach((resource) => resource.dispose());
      group.clear();
    },
  };
}
