import * as THREE from 'three';
import { Water } from '../../pond-water/src/WaterSurface.js';
import { createIslandCoast } from './islandCoast.js';
import { createOceanNormals } from './oceanNormals.js';

/** Finite planar ocean with a coastline-shaped hole; owns its GPU resources. */
export function createOceanLayer({
  id = 'island-ocean',
  coast = createIslandCoast(),
  halfSize = 1000,
  quality = 'balanced',
  normalSize = 256,
  waterColor = '#186276',
  distortionScale = 1.3,
} = {}) {
  if (!Number.isFinite(halfSize) || halfSize <= coast.maxRadius + 1)
    throw new RangeError('Ocean extent must enclose the island.');
  if (!Number.isFinite(distortionScale) || distortionScale < 0)
    throw new RangeError('Distortion must be finite and nonnegative.');
  let water,
    geometry,
    normals,
    context,
    disposed = false;
  return {
    id,
    stats: {
      quality: 'balanced',
      reflectionSize: 0,
      reflectionStride: 0,
      geometry: 'finite ocean with island hole',
    },
    init(ctx) {
      if (disposed || context)
        throw new Error('An ocean layer can only initialize once.');
      context = ctx;
      try {
        normals = createOceanNormals(normalSize);
        const { x, z, level, segments } = coast.definition;
        const shape = new THREE.Shape();
        shape.moveTo(x - halfSize, -z - halfSize);
        shape.lineTo(x + halfSize, -z - halfSize);
        shape.lineTo(x + halfSize, -z + halfSize);
        shape.lineTo(x - halfSize, -z + halfSize);
        shape.closePath();
        const hole = new THREE.Path();
        const inset = Math.min(0.5, coast.definition.radius * 0.01);
        for (let i = 0; i <= segments; i++) {
          const [px, pz] = coast.point((i / segments) * Math.PI * 2, inset);
          if (i === 0) hole.moveTo(px, -pz);
          else hole.lineTo(px, -pz);
        }
        shape.holes.push(hole);
        geometry = new THREE.ShapeGeometry(shape);
        const sun = ctx.definition?.environment?.sun;
        water = new Water(geometry, {
          waterNormals: normals,
          quality,
          waterColor,
          distortionScale,
          fog: true,
          sunDirection: new THREE.Vector3(
            ...(sun?.position ?? [-32, 22, -48]),
          ).normalize(),
          sunColor: sun?.color ?? '#ffe3bb',
          surface: {
            declarations: coast.glsl,
            normal:
              'float ripple = mix(0.64,0.16,smoothstep(30.0,330.0,length(eye-worldPosition.xyz))); vec3 surfaceNormal = normalize(noise.xzy * vec3(ripple,1.0,ripple));',
            shading: `
              float shore = islandDistance(worldPosition.xz);
              float angle = atan(worldPosition.z - ${coast.definition.z.toFixed(8)}, worldPosition.x - ${coast.definition.x.toFixed(8)});
              float shelf = 1.0-smoothstep(0.0,15.0,shore);
              albedo = mix(albedo,vec3(0.036,0.18,0.19),shelf*0.18);
              float wave = sin(shore*2.1-time*2.8+sin(angle*31.0)*0.4);
              float foam = smoothstep(0.78,1.0,wave)*(1.0-smoothstep(0.8,4.0,shore));
              float patches = 0.5+0.5*sin(angle*83.0+sin(angle*29.0)*2.3+time*0.3);
              albedo = mix(albedo,vec3(0.49,0.66,0.61),foam*0.16*pow(patches,4.0));`,
          },
        });
        water.name = id;
        water.rotation.x = -Math.PI / 2;
        water.position.y = level + 0.02;
        water.material.uniforms.size.value = 2.5;
        ctx.scene.add(water);
        this.configure({ quality });
      } catch (error) {
        this.dispose();
        throw error;
      }
    },
    configure(settings = {}) {
      if (!water || disposed) return;
      water.setQuality(settings.quality);
      Object.assign(this.stats, {
        quality: water.quality,
        reflectionSize: water.renderTarget.width,
        reflectionStride: water.reflectionStride,
      });
    },
    invalidateReflection() {
      if (!disposed) water?.invalidateReflection();
    },
    update(dt) {
      if (water && !disposed && Number.isFinite(dt) && dt > 0)
        water.material.uniforms.time.value += dt * 0.5;
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
