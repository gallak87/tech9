import * as T from 'three';
import { Water } from './WaterSurface.js';
import { createOceanNormals } from '../../island-ocean/src/oceanNormals.js';

/** A bounded reflective ribbon. Consumers own the banks and centreline recipe. */
export function createRiverWaterLayer({
  id = 'river-water',
  points,
  halfWidth = 30,
  level = 0,
  quality = 'balanced',
  waterColor = '#174f52',
  normalSize = 128,
  distortionScale = 0.45,
  depthAt = () => 12,
  crossSegments = 32,
  maxSegmentLength = 12,
} = {}) {
  if (
    !Array.isArray(points) ||
    points.length < 2 ||
    points.some(
      (p) => !Array.isArray(p) || p.length !== 2 || !p.every(Number.isFinite),
    )
  )
    throw new TypeError('A river requires at least two finite [x,z] points.');
  if (!Number.isFinite(halfWidth) || halfWidth <= 0 || !Number.isFinite(level))
    throw new RangeError('River width must be positive and its level finite.');
  if (!Number.isFinite(distortionScale) || distortionScale < 0)
    throw new RangeError('River distortion must be finite and nonnegative.');
  if (typeof depthAt !== 'function')
    throw new TypeError(
      'River depthAt must be a function returning signed water depth.',
    );
  if (
    !Number.isInteger(crossSegments) ||
    crossSegments < 2 ||
    crossSegments > 128 ||
    !Number.isFinite(maxSegmentLength) ||
    maxSegmentLength <= 0
  )
    throw new RangeError(
      'River subdivisions require 2–128 cross segments and a positive segment length.',
    );
  const route = [];
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i],
      b = points[i + 1],
      distance = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (distance < 0.001)
      throw new RangeError('River centreline points must be distinct.');
    const divisions = Math.ceil(distance / maxSegmentLength);
    for (let j = 0; j < divisions; j++)
      route.push([
        T.MathUtils.lerp(a[0], b[0], j / divisions),
        T.MathUtils.lerp(a[1], b[1], j / divisions),
      ]);
  }
  route.push([...points.at(-1)]);
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
      geometry: 'depth-sampled river ribbon',
    },
    init(ctx) {
      if (disposed || context)
        throw new Error('A river layer can only initialize once.');
      context = ctx;
      try {
        normals = createOceanNormals(normalSize);
        const positions = [],
          uvs = [],
          depths = [],
          flows = [],
          indices = [];
        let distance = 0;
        for (let i = 0; i < route.length; i++) {
          const p = route[i],
            before = route[Math.max(0, i - 1)],
            after = route[Math.min(route.length - 1, i + 1)];
          const dx = after[0] - before[0],
            dz = after[1] - before[1],
            length = Math.hypot(dx, dz);
          if (i)
            distance += Math.hypot(
              p[0] - route[i - 1][0],
              p[1] - route[i - 1][1],
            );
          for (let j = 0; j <= crossSegments; j++) {
            const lateral = ((j / crossSegments) * 2 - 1) * halfWidth;
            const x = p[0] - (dz / length) * lateral,
              z = p[1] + (dx / length) * lateral;
            const depth = depthAt(x, z);
            if (!Number.isFinite(depth))
              throw new RangeError(
                'River depthAt must return finite signed depths.',
              );
            positions.push(x, -z, 0);
            uvs.push(lateral, distance);
            // Keep dry-bank values signed until fragment interpolation finds the waterline.
            depths.push(depth);
            flows.push(dx / length, dz / length);
            if (i && j < crossSegments) {
              const a = (i - 1) * (crossSegments + 1) + j,
                b = a + crossSegments + 1;
              indices.push(a, a + 1, b, a + 1, b + 1, b);
            }
          }
        }
        geometry = new T.BufferGeometry();
        geometry.setAttribute(
          'position',
          new T.Float32BufferAttribute(positions, 3),
        );
        geometry.setAttribute('uv', new T.Float32BufferAttribute(uvs, 2));
        geometry.setAttribute(
          'riverWaterDepth',
          new T.Float32BufferAttribute(depths, 1),
        );
        geometry.setAttribute(
          'riverFlow',
          new T.Float32BufferAttribute(flows, 2),
        );
        geometry.setIndex(indices);
        geometry.computeVertexNormals();
        geometry.computeBoundingSphere();
        const sun = ctx.definition?.environment?.sun;
        water = new Water(geometry, {
          waterNormals: normals,
          quality,
          waterColor,
          distortionScale,
          fog: true,
          sunDirection: new T.Vector3(
            ...(sun?.position ?? [-32, 22, -48]),
          ).normalize(),
          sunColor: sun?.color ?? '#e1eee8',
          surface: {
            declarations: `varying float vRiverDepth; varying vec2 vRiverUv,vRiverFlow;
              float riverBand(float phase){return cos(phase)*(1.-smoothstep(.35,1.5,fwidth(phase)));}`,
            normal: `
              vec2 flow=normalize(vRiverFlow),crossFlow=vec2(-flow.y,flow.x);
              vec2 riverP=vec2(vRiverUv.y,vRiverUv.x);
              float broad=riverBand(riverP.x*.31+riverP.y*.17-time*1.7);
              float crossing=riverBand(riverP.x*.83-riverP.y*.59-time*2.2);
              float fine=riverBand(riverP.x*1.73+riverP.y*1.21+time*2.8);
              float farRipples=smoothstep(110.,650.,length(cameraPosition-worldPosition.xyz));
              vec2 slopes=flow*(broad*.095+crossing*.055)+crossFlow*(broad*.045-crossing*.07+fine*.035);
              slopes += noise.xy * mix(.58,.2,farRipples);
              vec3 surfaceNormal=normalize(vec3(slopes.x,1.,slopes.y));`,
            shading: `
              // Current view direction is per draw; throttled mirror matrices stay with their cached image.
              vec3 riverView=normalize(cameraPosition-worldPosition.xyz);
              float riverTheta=max(dot(riverView,surfaceNormal),0.);
              float riverFresnel=.025+.975*pow(1.-riverTheta,5.);
              float waterDepth=max(0.,vRiverDepth);
              float deep=1.-exp(-waterDepth*.075);
              float caustic=.5+.5*sin(riverP.x*.37+riverP.y*.59+crossing*.9-time*.65);
              vec3 shallows=vec3(.075,.13,.095)*(.88+caustic*.17);
              vec3 volume=mix(shallows,waterColor*.56,deep);
              volume*=mix(.62,1.,getShadowMask());
              // A five-tap reflection is softer than raw leaf pixels without losing the reflected forest.
              vec2 texel=vec2(.00135);
              vec3 mirror=reflectionSample*.4;
              mirror+=(texture2D(mirrorSampler,clamp(uv+vec2(texel.x,0.),.001,.999)).rgb
                +texture2D(mirrorSampler,clamp(uv-vec2(texel.x,0.),.001,.999)).rgb
                +texture2D(mirrorSampler,clamp(uv+vec2(0.,texel.y),.001,.999)).rgb
                +texture2D(mirrorSampler,clamp(uv-vec2(0.,texel.y),.001,.999)).rgb)*.15;
              float mirrorLuma=dot(mirror,vec3(.2126,.7152,.0722));
              mirror=mix(vec3(mirrorLuma),mirror,.78)*vec3(.87,1.,1.06);
              mirror/=1.+max(mirror.r,max(mirror.g,mirror.b))*.24;
              vec3 reflected=mix(vec3(.18,.28,.3),mirror,reflectionValid);
              albedo=mix(volume,reflected,.08+riverFresnel*.78);
              // Broad filtered glints remain visible at racing-view distances without needle sparkle.
              float sunFacing=max(0.,dot(surfaceNormal,normalize(sunDirection+riverView)));
              float glint=pow(sunFacing,48.)*.18+pow(sunFacing,110.)*.08*(1.-farRipples);
              albedo+=sunColor*glint*mix(.6,1.,getShadowMask());
              float rim=1.-smoothstep(.12,1.6,abs(vRiverDepth));
              float foamPatch=smoothstep(.55,.92,.5+.5*sin(riverP.x*.41+crossing*1.1-time*.35));
              albedo=mix(albedo,vec3(.38,.48,.42),rim*foamPatch*.25);`,
          },
        });
        // River-specific varyings extend this owned material; shared pond/ocean shaders stay unchanged.
        water.material.vertexShader =
          `attribute float riverWaterDepth; attribute vec2 riverFlow;
          varying float vRiverDepth; varying vec2 vRiverUv,vRiverFlow;\n` +
          water.material.vertexShader.replace(
            'void main() {',
            'void main() {\n vRiverDepth=riverWaterDepth;vRiverUv=uv;vRiverFlow=riverFlow;',
          );
        water.name = id;
        water.rotation.x = -Math.PI / 2;
        water.position.y = level;
        water.material.uniforms.size.value = 10;
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
