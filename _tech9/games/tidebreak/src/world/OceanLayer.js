import * as THREE from 'three';
import { Water } from '../capabilities/pond-water/src/WaterSurface.js';
import { coastRadius } from './islandDefinition.js';

// Open water keeps the promoted reflection/lifecycle contract, but replaces the
// pond's filled ellipse and inward shallows with an island hole and outward shelf.
export function createOceanLayer() {
  let water,
    geometry,
    normals,
    context,
    disposed = false;
  return {
    id: 'tidebreak-ocean',
    stats: {},
    init(ctx) {
      context = ctx;
      const shape = new THREE.Shape();
      shape.moveTo(-1000, -1000);
      shape.lineTo(1000, -1000);
      shape.lineTo(1000, 1000);
      shape.lineTo(-1000, 1000);
      shape.closePath();
      const hole = new THREE.Path();
      for (let i = 0; i <= 256; i++) {
        const a = (i / 256) * Math.PI * 2,
          r = coastRadius(a) - 0.5;
        if (i === 0) hole.moveTo(Math.cos(a) * r, -Math.sin(a) * r);
        else hole.lineTo(Math.cos(a) * r, -Math.sin(a) * r);
      }
      shape.holes.push(hole);
      geometry = new THREE.ShapeGeometry(shape);
      const size = 256,
        data = new Uint8Array(size * size * 4);
      for (let y = 0; y < size; y++)
        for (let x = 0; x < size; x++) {
          const u = (x / size) * Math.PI * 2,
            v = (y / size) * Math.PI * 2,
            i = (y * size + x) * 4;
          data[i] =
            128 + 42 * Math.cos(u * 7 + v * 3) + 16 * Math.sin(u * 19 - v * 11);
          data[i + 1] =
            128 + 32 * Math.sin(v * 8 + u * 2) + 21 * Math.cos(v * 21 - u * 13);
          data[i + 2] = 240;
          data[i + 3] = 255;
        }
      normals = new THREE.DataTexture(data, size, size);
      normals.wrapS = normals.wrapT = THREE.RepeatWrapping;
      normals.magFilter = normals.minFilter = THREE.LinearFilter;
      normals.needsUpdate = true;
      water = new Water(geometry, {
        waterNormals: normals,
        quality: 'balanced',
        waterColor: '#12606b',
        sunColor: '#ffe3bb',
        sunDirection: new THREE.Vector3(
          ...ctx.definition.environment.sun.position,
        ).normalize(),
        distortionScale: 1.3,
        fog: true,
      });
      water.rotation.x = -Math.PI / 2;
      water.position.y = 0.02;
      water.material.uniforms.size.value = 3.8;
      water.material.fragmentShader = water.material.fragmentShader.replace(
        /vec2 pond = [\s\S]*?vec3 outgoingLight = albedo;/,
        `
        float angle=atan(worldPosition.z,worldPosition.x);
        float coast=77.0+4.0*sin(angle*3.0+0.5)+3.0*cos(angle*5.0-0.7)+1.4*sin(angle*9.0);
        float shore=length(worldPosition.xz)-coast;
        float shelf=1.0-smoothstep(0.0,15.0,shore);
        albedo=mix(albedo,vec3(0.045,0.32,0.29),shelf*0.46);
        float wave=sin(shore*2.1-time*2.8+sin(angle*31.0)*0.4);
        float foam=smoothstep(0.78,1.0,wave)*(1.0-smoothstep(0.8,4.0,shore));
        albedo=mix(albedo,vec3(0.64,0.75,0.67),foam*0.48);
        vec3 outgoingLight=albedo;`,
      );
      ctx.scene.add(water);
      this.configure({ quality: 'balanced' });
    },
    configure(settings) {
      if (!water || disposed) return;
      water.setQuality(settings.quality);
      Object.assign(this.stats, {
        quality: water.quality,
        reflectionSize: water.renderTarget.width,
        reflectionStride: water.reflectionStride,
        geometry: 'finite ocean with island hole',
      });
    },
    update(dt) {
      if (water && !disposed) water.material.uniforms.time.value += dt * 0.5;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      context?.scene.remove(water);
      water?.dispose();
      geometry?.dispose();
      normals?.dispose();
    },
  };
}
