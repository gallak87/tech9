import * as T from 'three';
import {
  sampleNacreWater,
  NACRE_SKY_YAW,
  NACRE_HORIZON_COLOR,
} from '../environment/atmosphere.js';
import { createNacreBackdrop as createShapeBackdrop } from './shape.js';

import { NACRE_STORM_RULES, sampleNacreLightning } from './storm.js';
export { NACRE_STORM_RULES, sampleNacreLightning } from './storm.js';

export function createNacreBackdrop({
  waterY = 0,
  blockout = false,
  settings = {},
  skyTexture = null,
} = {}) {
  if (blockout) return createShapeBackdrop({ waterY });
  const group = new T.Group();
  group.name = 'Nacre / towering ocean storm and open eye';
  group.userData.aoExclude = true;
  const sunDirection = new T.Vector3(-0.55, 0.72, 0.42).normalize();
  if (skyTexture) {
    skyTexture.colorSpace = T.SRGBColorSpace;
    skyTexture.wrapS = T.RepeatWrapping;
    skyTexture.wrapT = T.ClampToEdgeWrapping;
    skyTexture.anisotropy = 4;
  }
  const skyYaw = NACRE_SKY_YAW;
  const material = new T.ShaderMaterial({
    name: skyTexture
      ? 'Nacre / authored storm panorama and live lightning'
      : 'Nacre / source-native storm fallback',
    defines: skyTexture ? { NACRE_SKY_MAP: 1 } : {},
    side: T.BackSide,
    depthWrite: false,
    uniforms: {
      sunDirection: { value: sunDirection },
      stormSky: { value: skyTexture },
      skyYaw: { value: skyYaw },
      seaHaze: { value: NACRE_HORIZON_COLOR },
      wetness: { value: 0 },
      time: { value: 0 },
      lightning: { value: 0 },
      boltAzimuth: { value: -2 },
    },
    vertexShader: `
      varying vec3 skyRay;
      void main() {
        skyRay=position;
        vec4 p=projectionMatrix*modelViewMatrix*vec4(position,1.);
        gl_Position=p.xyww;
      }
    `,
    fragmentShader: `
      varying vec3 skyRay;
      uniform vec3 sunDirection;
      uniform sampler2D stormSky;
      uniform float skyYaw;
      uniform vec3 seaHaze;
      uniform float wetness;
      uniform float time;
      uniform float lightning;
      uniform float boltAzimuth;
      float hash(vec3 p) {return fract(sin(dot(p,vec3(127.1,311.7,74.7)))*43758.5453);}
      float noise(vec3 p) {
        vec3 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);
        return mix(mix(mix(hash(i),hash(i+vec3(1,0,0)),f.x),mix(hash(i+vec3(0,1,0)),hash(i+vec3(1,1,0)),f.x),f.y),mix(mix(hash(i+vec3(0,0,1)),hash(i+vec3(1,0,1)),f.x),mix(hash(i+vec3(0,1,1)),hash(i+vec3(1,1,1)),f.x),f.y),f.z);
      }
      float boltSegment(vec2 p,vec2 a,vec2 b) {
        vec2 ab=b-a;
        return length(p-a-ab*clamp(dot(p-a,ab)/dot(ab,ab),0.,1.));
      }
      float branchedBolt(vec2 p) {
        float d=boltSegment(p,vec2(-.015,.51),vec2(.013,.42));
        d=min(d,boltSegment(p,vec2(.013,.42),vec2(-.008,.36)));
        d=min(d,boltSegment(p,vec2(-.008,.36),vec2(.029,.29)));
        d=min(d,boltSegment(p,vec2(.029,.29),vec2(.009,.245)));
        d=min(d,boltSegment(p,vec2(.009,.245),vec2(.034,.19)));
        d=min(d,boltSegment(p,vec2(.034,.19),vec2(.011,.135)));
        d=min(d,boltSegment(p,vec2(.011,.135),vec2(.025,.055)));
        d=min(d,boltSegment(p,vec2(-.008,.36),vec2(-.068,.305)));
        d=min(d,boltSegment(p,vec2(-.068,.305),vec2(-.054,.25)));
        d=min(d,boltSegment(p,vec2(-.054,.25),vec2(-.10,.205)));
        d=min(d,boltSegment(p,vec2(.034,.19),vec2(.10,.16)));
        d=min(d,boltSegment(p,vec2(.10,.16),vec2(.085,.105)));
        return d;
      }
      void main() {
        vec3 ray=normalize(skyRay);
        float azimuth=atan(ray.z,ray.x);
        #ifdef NACRE_SKY_MAP
          vec2 skyUv=vec2(fract(azimuth/6.28318530718+skyYaw),asin(clamp(ray.y,-1.,1.))/3.14159265359+.5);
          // SRGBColorSpace is decoded by the WebGL sRGB texture format;
          // ACES and output conversion happen once at the end of this shader.
          vec3 sky=texture2D(stormSky,skyUv).rgb*.92;
          sky+=vec3(.05,.044,.033)*pow(max(dot(ray,sunDirection),0.),64.);
        #else
        float up=smoothstep(-.12,.85,ray.y);
        float alignment=max(dot(ray,sunDirection),0.);
        float opening=smoothstep(.75,.97,alignment);
        vec3 sky=mix(vec3(.16,.25,.29),vec3(.024,.053,.077),up);
        sky=mix(sky,vec3(.47,.55,.51),opening*.85);
        vec3 p=ray*4.5+vec3(time*.0011,0.,0.);
        p.y*=.67;
        float broad=noise(p+8.1);
        vec3 warped=p+vec3(broad*.7,noise(p+32.)*.5,broad*.5);
        float detail=noise(warped*2.03+3.6)*.53+noise(warped*4.17)*.28+noise(warped*8.31)*.13;
        float density=broad*.48+detail*.72;
        float tower=smoothstep(.24,.69,density);
        float wall=(1.-opening*.91)*smoothstep(-.08,.10,ray.y)*tower;
        float lightEdge=clamp((broad-noise(p+8.1+sunDirection*.37))*2.6+.44,0.,1.);
        vec3 cloud=mix(vec3(.033,.062,.081),vec3(.21,.29,.30),lightEdge);
        cloud*=.72+detail*.62;
        cloud+=vec3(.11,.12,.09)*pow(alignment,6.)*lightEdge;
        sky=mix(sky,cloud,wall*.95);
        sky+=vec3(.21,.20,.15)*pow(alignment,64.)*(1.-wall*.75);
        // Authored opposing storm wall and bright eye establish a large-scale
        // lighting hierarchy; the noise only breaks their silhouettes.
        float stormAngle=atan(sin(azimuth-.35),cos(azimuth-.35));
        float stormArc=1.-smoothstep(.85,1.95,abs(stormAngle));
        float crest=.12+.22*exp(-pow((stormAngle+.55)/.31,2.))
          +.34*exp(-pow((stormAngle-.08)/.30,2.))
          +.18*exp(-pow((stormAngle-.78)/.26,2.));
        crest+=(broad-.5)*.055+(detail-.35)*.035;
        float stormHeight=1.-smoothstep(crest-.025,crest+.035,ray.y);
        float stormMask=stormArc*stormHeight*smoothstep(-.065,.025,ray.y);
        vec3 stormColor=mix(vec3(.018,.038,.055),vec3(.074,.116,.139),lightEdge*.7+detail*.3);
        float silverEdge=exp(-pow((ray.y-crest)/.023,2.))*stormArc;
        sky=mix(sky,stormColor,stormMask*.94);
        sky+=vec3(.056,.069,.066)*silverEdge*(.25+alignment*.75);

        #endif
        // Low salt haze joins the finite ocean to the distant panorama, hiding
        // its hard photographed horizon without obscuring the towering clouds.
        sky=mix(sky,seaHaze,(1.-smoothstep(-.025,.075,ray.y))*.82);
        float delta=atan(sin(azimuth-boltAzimuth),cos(azimuth-boltAzimuth));
        float boltDistance=branchedBolt(vec2(delta,ray.y));
        float boltCore=1.-smoothstep(.0014,.0038,boltDistance);
        float boltGlow=exp(-boltDistance/.014);
        float cloudFlash=exp(-pow(delta/.39,2.))*exp(-pow((ray.y-.33)/.27,2.));
        sky+=vec3(.72,.86,1.)*lightning*(cloudFlash*1.5+boltGlow*4.+boltCore*24.);
        sky+=vec3(.29,.39,.48)*lightning*.16*smoothstep(-.04,.18,ray.y);
        vec3 underwater=mix(vec3(.007,.038,.052),vec3(.028,.095,.115),smoothstep(-.5,1.,ray.y));
        gl_FragColor=vec4(mix(sky,underwater,wetness),1.);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
  });
  const sky = new T.Mesh(new T.SphereGeometry(7000, 32, 16), material);
  sky.name = 'Nacre / layered storm wall, silver eye and distant lightning';
  sky.frustumCulled = false;
  sky.renderOrder = -1000;
  group.add(sky);
  let overview = false;
  let disposed = false;
  let presentationElapsed = 0;
  let presentationReducedMotion = Boolean(settings.reducedMotion);
  let previousTime;
  let anchoredCycle = -1;
  let anchoredAzimuth = 0.35;
  let consumedCycle = -1;
  let eventCount = 0;
  let lastEventId = null;
  let screenFlash = 0;
  let stormEnabled = false;
  let currentSample = sampleNacreLightning(0);
  const stormEvents = [];
  return {
    group,
    sunDirection,
    sunColor: '#e4eadd',
    sunIntensity: 2.25,
    ambientSky: '#b7d9dc',
    ambientGround: '#527e86',
    ambientIntensity: 1.12,
    fillColor: '#99c8d3',
    fillIntensity: 0.4,
    environmentIntensity: 0.58,
    far: 14000,
    ownedTextures: skyTexture ? [skyTexture] : [],
    metrics: {
      meshCount: 1,
      triangleCount: 960,
      textures: skyTexture ? 1 : 0,
      skyMapEstimatedBytes: skyTexture
        ? Math.ceil(
            ((skyTexture.image?.width ?? 0) *
              (skyTexture.image?.height ?? 0) *
              4 *
              4) /
              3,
          )
        : 0,
      skyMapYaw: skyYaw,
      additionalRenderPasses: 0,
      lightningPeriodSeconds: NACRE_STORM_RULES.periodSeconds,
      lightningDurationSeconds: NACRE_STORM_RULES.durationSeconds,
      maxLightningRadiance: NACRE_STORM_RULES.maxLightningIntensity * 30,
      maxScreenFlash: NACRE_STORM_RULES.maxScreenFlash,
      lightningBranches: 2,
      stormRenderPasses: 0,
      stormLights: 0,
      stage: 'production',
    },
    setOverview(active) {
      overview = Boolean(active);
    },
    update(
      cameraPosition,
      time = 0,
      currentSettings = settings,
      presentation = {},
    ) {
      if (disposed) return;
      const safeTime = Number.isFinite(time) ? Math.max(0, time) : 0;
      const dt = safeTime - previousTime;
      const discontinuity = presentation.reset || dt < 0 || dt > 0.25;
      presentationElapsed = safeTime;
      presentationReducedMotion = Boolean(currentSettings.reducedMotion);
      stormEnabled = presentation.enabled !== false && !overview;
      sky.position.copy(cameraPosition);
      const wetness = overview
        ? 0
        : sampleNacreWater(cameraPosition.y, waterY).submerged;
      currentSample = sampleNacreLightning(safeTime, presentationReducedMotion);
      if (discontinuity || !stormEnabled) {
        stormEvents.length = 0;
        consumedCycle =
          currentSample.age >= NACRE_STORM_RULES.thunderDelaySeconds
            ? currentSample.cycle
            : currentSample.cycle - 1;
        anchoredCycle = -1;
        if (presentation.reset || dt < 0) {
          eventCount = 0;
          lastEventId = null;
        }
      }
      if (anchoredCycle !== currentSample.cycle && currentSample.age >= 0) {
        const direction = presentation.direction;
        const facing =
          direction && Math.hypot(direction.x, direction.z) > 0.01
            ? Math.atan2(direction.z, direction.x)
            : currentSample.azimuth;
        anchoredAzimuth = facing + currentSample.azimuthOffset;
        anchoredCycle = currentSample.cycle;
      }
      // Seek/reset/title frames cannot produce a catch-up thunder. A paused
      // simulation repeats the same time, so it cannot retrigger a cue.
      const previousSample = sampleNacreLightning(previousTime);
      if (
        stormEnabled &&
        !presentationReducedMotion &&
        !discontinuity &&
        dt > 0 &&
        dt <= 0.25 &&
        currentSample.cycle !== consumedCycle &&
        currentSample.age >= NACRE_STORM_RULES.thunderDelaySeconds &&
        (previousSample.cycle !== currentSample.cycle ||
          previousSample.age < NACRE_STORM_RULES.thunderDelaySeconds)
      ) {
        consumedCycle = currentSample.cycle;
        eventCount += 1;
        lastEventId = `nacre-storm-${currentSample.cycle}`;
        stormEvents.push({
          type: 'nacre-thunder',
          id: lastEventId,
          seed: currentSample.seed,
          pan: currentSample.pan,
          submerged: wetness,
          simulationTime: safeTime,
        });
      }
      previousTime = safeTime;
      const intensity = stormEnabled
        ? currentSample.intensity * (1 - wetness)
        : 0;
      screenFlash = stormEnabled ? currentSample.flash * (1 - wetness) : 0;
      material.uniforms.wetness.value = wetness;
      material.uniforms.time.value = currentSettings.reducedMotion
        ? 0
        : safeTime;
      material.uniforms.lightning.value = intensity;
      material.uniforms.boltAzimuth.value = anchoredAzimuth;
    },
    drainStormEvents() {
      return stormEvents.splice(0);
    },
    getPresentation() {
      return {
        elapsed: presentationElapsed,
        lightningIntensity: material.uniforms.lightning.value,
        lightningAzimuth: material.uniforms.boltAzimuth.value,
        reducedMotion: presentationReducedMotion,
        wetness: material.uniforms.wetness.value,
        lightningFlash: screenFlash,
        lightningCycle: currentSample.cycle,
        lightningAge: currentSample.age,
        lightningEventId: lastEventId,
        lightningEventCount: eventCount,
        lightningPan: currentSample.pan,
        stormEnabled,
        lightningPeriodSeconds: NACRE_STORM_RULES.periodSeconds,
        lightningDurationSeconds: NACRE_STORM_RULES.durationSeconds,
      };
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      stormEvents.length = 0;
      skyTexture?.dispose();
      sky.geometry.dispose();
      material.dispose();
      group.clear();
    },
  };
}
