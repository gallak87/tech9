import * as T from 'three';
import { Water } from './WaterSurface.js';
import { createOceanNormals } from '../../island-ocean/src/oceanNormals.js';

const FLOW_PERIOD = 24;
const currentSpeed = (depth, speed) =>
  depth <= 0
    ? 0
    : speed * (0.25 + 0.75 * T.MathUtils.smoothstep(depth, 0.15, 12));
const flowPhases = (time, speed, distance) =>
  [0, 0.5].map((offset) => {
    const phase = (((time / FLOW_PERIOD + offset) % 1) + 1) % 1;
    return {
      phase,
      weight: 1 - Math.abs(phase * 2 - 1),
      sourceDistance: distance - speed * phase * FLOW_PERIOD,
    };
  });

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
  flowSpeed = 5,
  foamStrength = 0.65,
  reducedMotion = false,
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
  const validateFlow = (speed, foam) => {
    if (
      !Number.isFinite(speed) ||
      speed < 0 ||
      !Number.isFinite(foam) ||
      foam < 0 ||
      foam > 1
    )
      throw new RangeError(
        'River flowSpeed must be nonnegative and foamStrength must be 0–1.',
      );
  };
  validateFlow(flowSpeed, foamStrength);
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
  const stations = [0];
  for (let i = 1; i < route.length; i++)
    stations.push(
      stations[i - 1] +
        Math.hypot(
          route[i][0] - route[i - 1][0],
          route[i][1] - route[i - 1][1],
        ),
    );
  let clock = 0;
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
      geometry: 'depth-sampled advected river ribbon',
      time: 0,
      flowSpeed,
      foamStrength,
      reducedMotion: Boolean(reducedMotion),
      flowPeriod: FLOW_PERIOD,
      length: stations.at(-1),
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
        depthAt = null; // Bathymetry is retained in the ribbon; release the consumer callback.
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
            declarations: `
              varying float vRiverDepth;
              varying vec2 vRiverUv,vRiverFlow;
              uniform float riverTime,riverSpeed,riverFoamStrength;
              // Thin, broken current filaments have long downstream extent and sparse coverage.
              float riverThread(float phase,float width){
                float distance=abs(fract(phase/6.2831853+.5)-.5)*6.2831853;
                float aa=max(fwidth(phase)*.6,.004);
                return (1.-smoothstep(width-aa,width+aa,distance))*min(1.,width/aa);
              }
              float riverFilaments(vec2 p){
                float wander=sin(p.y*.065)*1.8+sin(p.y*.13-p.x*.071)*.4;
                float phase=p.x*.46+wander;
                float thread=riverThread(phase,.065);
                float arm=riverThread(phase+sin(p.y*.073)*.22+.19,.045);
                float packet=pow(max(0.,sin(p.y*.19+sin(p.x*.11)*2.4+p.x*.037)),2.);
                float tears=smoothstep(-.45,.6,sin(p.y*1.6+sin(p.x*.7)*3.));
                return (thread*.72+arm*.28)*smoothstep(.18,.72,packet)*mix(.25,1.,tears);
              }
              vec2 riverWarp(vec2 p){
                p.x+=sin(p.y*.032+p.x*.015)*2.3+sin(p.y*.081-p.x*.053)*1.1;
                return p;
              }`,
            normal: `
              vec2 flow=normalize(vRiverFlow),crossFlow=vec2(-flow.y,flow.x);
              vec2 riverP=vec2(vRiverUv.x,vRiverUv.y);
              float localSpeed=riverSpeed*(.25+.75*smoothstep(.15,12.,max(0.,vRiverDepth)))*step(.00001,vRiverDepth);
              float phase0=fract(riverTime/24.);
              float phase1=fract(riverTime/24.+.5);
              float blend0=1.-abs(phase0*2.-1.);
              float blend1=1.-abs(phase1*2.-1.);
              // Overlapping 24-second advection phases hide resets before shear can stretch the field.
              vec2 current0=riverWarp(riverP-vec2(0.,localSpeed*phase0*24.));
              vec2 current1=riverWarp(riverP-vec2(0.,localSpeed*phase1*24.));
              vec2 broad0=texture2D(normalSampler,current0/vec2(230.,380.)).rg*2.-1.;
              vec2 broad1=texture2D(normalSampler,current1/vec2(230.,380.)).rg*2.-1.;
              vec2 fine0=texture2D(normalSampler,current0/vec2(25.,50.)+vec2(.37,.61)).rg*2.-1.;
              vec2 fine1=texture2D(normalSampler,current1/vec2(25.,50.)+vec2(.37,.61)).rg*2.-1.;
              vec2 broad=broad0*blend0+broad1*blend1;
              vec2 fine=fine0*blend0+fine1*blend1;
              float farRipples=smoothstep(110.,650.,length(cameraPosition-worldPosition.xyz));
              float filterFine=1.-farRipples*.8;
              vec2 slopes=flow*(broad.y*.26+fine.y*.12*filterFine)
                +crossFlow*(broad.x*.18+fine.x*.085*filterFine);
              vec3 surfaceNormal=normalize(vec3(slopes.x,1.,slopes.y));`,
            shading: `
              // Current view direction is per draw; throttled mirror matrices stay with their cached image.
              vec3 riverView=normalize(cameraPosition-worldPosition.xyz);
              float riverTheta=max(dot(riverView,surfaceNormal),0.);
              float riverFresnel=.025+.975*pow(1.-riverTheta,5.);
              float waterDepth=max(0.,vRiverDepth);
              float deep=1.-exp(-waterDepth*.075);
              float caustic=.5+.5*(broad.x+broad.y);
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
              float carriedFoam=riverFilaments(current0)*blend0+riverFilaments(current1)*blend1;
              float currentBody=smoothstep(.35,2.8,waterDepth);
              float contactFoam=carriedFoam*rim*.22;
              // Muted aerated streaks travel along the channel; banks retain dark, wet contact.
              float foam=(carriedFoam*currentBody*.7+contactFoam)*riverFoamStrength;
              vec3 foamColor=vec3(.4,.51,.45)*mix(.72,1.,getShadowMask());
              albedo=mix(albedo,foamColor,clamp(foam,0.,.7));`,
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
        Object.assign(water.material.uniforms, {
          riverTime: { value: clock },
          riverSpeed: { value: flowSpeed },
          riverFoamStrength: { value: foamStrength },
        });
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
      const nextSpeed = settings.flowSpeed ?? flowSpeed;
      const nextFoam = settings.foamStrength ?? foamStrength;
      validateFlow(nextSpeed, nextFoam);
      flowSpeed = nextSpeed;
      foamStrength = nextFoam;
      reducedMotion = settings.reducedMotion ?? reducedMotion;
      if (settings.quality !== undefined) water.setQuality(settings.quality);
      water.material.uniforms.riverSpeed.value = flowSpeed;
      water.material.uniforms.riverFoamStrength.value = foamStrength;
      Object.assign(this.stats, {
        quality: water.quality,
        reflectionSize: water.renderTarget.width,
        reflectionStride: water.reflectionStride,
        flowSpeed,
        foamStrength,
        reducedMotion: Boolean(reducedMotion),
      });
    },
    invalidateReflection() {
      if (!disposed) water?.invalidateReflection();
    },
    update(
      dt,
      { time, paused = false, reducedMotion: freeze = reducedMotion } = {},
    ) {
      if (!water || disposed || paused || freeze) return;
      if (Number.isFinite(time) && time >= 0) clock = time;
      else if (Number.isFinite(dt) && dt > 0) clock += dt;
      water.material.uniforms.time.value = clock * 0.5;
      water.material.uniforms.riverTime.value = clock;
      this.stats.time = clock;
    },
    /** Query retained ribbon data; the consumer's terrain callback is not invoked after initialization. */
    sampleFlow(distance, lateral = 0, time = clock) {
      if (
        !water ||
        disposed ||
        ![distance, lateral, time].every(Number.isFinite)
      )
        return null;
      const s = T.MathUtils.clamp(distance, 0, stations.at(-1));
      const x = T.MathUtils.clamp(lateral, -halfWidth, halfWidth);
      let row = 0;
      while (row < stations.length - 2 && stations[row + 1] < s) row++;
      const along = (s - stations[row]) / (stations[row + 1] - stations[row]);
      const column = (x / halfWidth + 1) * 0.5 * crossSegments;
      const c = Math.min(crossSegments - 1, Math.floor(column)),
        across = column - c;
      const stride = crossSegments + 1;
      const a = row * stride + c;
      // Match the two actual ribbon triangles rather than bilinear interpolation.
      const indices =
        along + across <= 1
          ? [a, a + 1, a + stride]
          : [a + 1, a + stride + 1, a + stride];
      const weights =
        along + across <= 1
          ? [1 - along - across, across, along]
          : [1 - along, along + across - 1, 1 - across];
      const read = (attribute, component) =>
        indices.reduce(
          (sum, index, i) =>
            sum +
            attribute.array[index * attribute.itemSize + component] *
              weights[i],
          0,
        );
      const depth = read(geometry.attributes.riverWaterDepth, 0);
      const flow = geometry.attributes.riverFlow;
      const tangent = new T.Vector2(read(flow, 0), read(flow, 1)).normalize();
      const position = geometry.attributes.position;
      const speed = currentSpeed(depth, flowSpeed);
      return {
        distance: s,
        lateral: x,
        time,
        depth,
        speed,
        position: [read(position, 0), level, -read(position, 1)],
        direction: [tangent.x, tangent.y],
        velocity: [tangent.x * speed, tangent.y * speed],
        layers: flowPhases(time, speed, s),
      };
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      depthAt = null;
      if (water) context?.scene.remove(water);
      water?.dispose();
      geometry?.dispose();
      normals?.dispose();
    },
  };
}
