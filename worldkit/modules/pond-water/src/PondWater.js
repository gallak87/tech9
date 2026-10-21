import * as THREE from 'three';
import { Water } from './WaterSurface.js';
import { createShoreline } from './shoreline.js';

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

/** Disposable reflective surface, with no world, controls, UI or extra frame loop. */
export function createPondWaterLayer({
  id = 'pond-water',
  shoreline = createShoreline(),
  quality = 'balanced',
  segments = 160,
  waterColor = '#31564c',
  distortionScale = 0.24,
} = {}) {
  if (!Number.isInteger(segments) || segments < 24 || segments > 1024)
    throw new RangeError('Water segments must be an integer from 24 to 1024.');
  let water,
    geometry,
    normals,
    context,
    disposed = false;
  return {
    id,
    stats: {
      reflectionSize: 0,
      reflectionStride: 0,
      quality: 'balanced',
      authoredShore: true,
    },
    init(ctx) {
      if (disposed || context)
        throw new Error('A water layer can only initialize once.');
      context = ctx;
      const shape = new THREE.Shape();
      for (let i = 0; i <= segments; i++) {
        const [x, z] = shoreline.point((-i / segments) * Math.PI * 2, 1.008);
        if (i === 0) shape.moveTo(x, -z);
        else shape.lineTo(x, -z);
      }
      geometry = new THREE.ShapeGeometry(shape);
      normals = waterNormals();
      const sun = ctx.definition?.environment?.sun;
      water = new Water(geometry, {
        shoreline,
        quality,
        waterNormals: normals,
        sunDirection: new THREE.Vector3(
          ...(sun?.position ?? [-32, 22, -48]),
        ).normalize(),
        sunColor: sun?.color ?? '#ffdc9c',
        waterColor,
        distortionScale,
        fog: true,
      });
      water.rotation.x = -Math.PI / 2;
      water.position.y = shoreline.definition.level + 0.018;
      water.material.uniforms.size.value = 11;
      ctx.scene.add(water);
      this.configure({ quality });
    },
    configure(settings = {}) {
      if (!water || disposed) return;
      water.setQuality(settings.quality);
      Object.assign(this.stats, {
        reflectionSize: water.renderTarget.width,
        reflectionStride: water.reflectionStride,
        quality: water.quality,
      });
    },
    invalidateReflection() {
      if (!disposed) water?.invalidateReflection();
    },
    update(dt) {
      if (water && !disposed && Number.isFinite(dt) && dt > 0)
        water.material.uniforms.time.value += dt * 0.34;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      if (water) context?.scene.remove(water);
      water?.dispose();
      geometry?.dispose();
      normals?.dispose();
    },
  };
}
