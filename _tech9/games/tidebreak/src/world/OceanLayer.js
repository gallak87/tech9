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
      const noise = (x, y, cells) => {
        const u = (x / size) * cells,
          v = (y / size) * cells,
          ix = Math.floor(u),
          iy = Math.floor(v);
        const hash = (a, b) => {
          const k =
            Math.sin(
              (((a % cells) + cells) % cells) * 127.1 +
                (((b % cells) + cells) % cells) * 311.7 +
                48.7,
            ) * 43758.5453;
          return k - Math.floor(k);
        };
        const ease = (t) => t * t * t * (t * (t * 6 - 15) + 10),
          fx = ease(u - ix),
          fy = ease(v - iy);
        const a = hash(ix, iy) * (1 - fx) + hash(ix + 1, iy) * fx,
          b = hash(ix, iy + 1) * (1 - fx) + hash(ix + 1, iy + 1) * fx;
        return a * (1 - fy) + b * fy;
      };
      const height = (x, y) =>
        noise(x, y, 8) +
        noise(x, y, 16) * 0.48 +
        noise(x, y, 32) * 0.21 +
        noise(x, y, 64) * 0.08;
      for (let y = 0; y < size; y++)
        for (let x = 0; x < size; x++) {
          const i = (y * size + x) * 4,
            dx = (height(x + 1, y) - height(x - 1, y)) * 3.8,
            dy = (height(x, y + 1) - height(x, y - 1)) * 3.8;
          data[i] = 128 + Math.max(-0.8, Math.min(0.8, dx)) * 127;
          data[i + 1] = 128 + Math.max(-0.8, Math.min(0.8, dy)) * 127;
          data[i + 2] = 255;
          data[i + 3] = 255;
        }
      normals = new THREE.DataTexture(data, size, size);
      normals.wrapS = normals.wrapT = THREE.RepeatWrapping;
      normals.magFilter = THREE.LinearFilter;
      normals.minFilter = THREE.LinearMipmapLinearFilter;
      normals.generateMipmaps = true;
      normals.needsUpdate = true;
      water = new Water(geometry, {
        waterNormals: normals,
        quality: 'balanced',
        waterColor: '#186276',
        sunColor: '#ffe3bb',
        sunDirection: new THREE.Vector3(
          ...ctx.definition.environment.sun.position,
        ).normalize(),
        distortionScale: 1.3,
        fog: true,
      });
      water.rotation.x = -Math.PI / 2;
      water.position.y = 0.02;
      water.material.uniforms.size.value = 2.5;
      water.material.fragmentShader = water.material.fragmentShader.replace(
        'vec3 surfaceNormal = normalize( noise.xzy * vec3( 0.6, 1.0, 0.6 ) );',
        'float ripple = mix(0.64,0.16,smoothstep(30.0,330.0,length(eye-worldPosition.xyz))); vec3 surfaceNormal = normalize(noise.xzy * vec3(ripple,1.0,ripple));',
      );
      water.material.fragmentShader = water.material.fragmentShader.replace(
        /vec2 pond = [\s\S]*?vec3 outgoingLight = albedo;/,
        `
        float angle=atan(worldPosition.z,worldPosition.x);
        float coast=77.0+4.0*sin(angle*3.0+0.5)+3.0*cos(angle*5.0-0.7)+1.4*sin(angle*9.0);
        float shore=length(worldPosition.xz)-coast;
        float shelf=1.0-smoothstep(0.0,15.0,shore);
        albedo=mix(albedo,vec3(0.036,0.18,0.19),shelf*0.18);
        float wave=sin(shore*2.1-time*2.8+sin(angle*31.0)*0.4);
        float foam=smoothstep(0.78,1.0,wave)*(1.0-smoothstep(0.8,4.0,shore));
        float patches=0.5+0.5*sin(angle*83.0+sin(angle*29.0)*2.3+time*0.3);
        albedo=mix(albedo,vec3(0.49,0.66,0.61),foam*0.16*pow(patches,4.0));
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
