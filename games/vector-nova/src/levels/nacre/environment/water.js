import * as T from 'three';
import { NACRE_SKY_YAW, NACRE_HORIZON_COLOR } from './atmosphere.js';
import { createNacreOceanNormals } from './ocean-normals.js';
import { createNacreOceanReflection } from './ocean-reflection.js';
import {
  createNacreOceanGeometry,
  NACRE_WAVE_GLSL,
  NACRE_WAVE_HEIGHT_BOUND,
  NACRE_OCEAN_PROFILE,
} from './ocean-waves.js';

export function createNacreWater(
  size,
  waterY,
  { skyTexture = null, track = null } = {},
) {
  const rippleTexture = createNacreOceanNormals();
  const material = new T.ShaderMaterial({
    name: 'Nacre / living two-sided ocean',
    defines: skyTexture ? { NACRE_SKY_REFLECTION: 1 } : {},
    transparent: true,
    side: T.DoubleSide,
    forceSinglePass: true,
    depthWrite: true,
    uniforms: {
      rippleTexture: { value: rippleTexture },
      time: { value: 0 },
      wetness: { value: 0 },
      nearSurface: { value: 1 },
      stormSky: { value: skyTexture },
      skyYaw: { value: NACRE_SKY_YAW },
      seaHaze: { value: NACRE_HORIZON_COLOR },
    },
    vertexShader: `
      uniform float time;
      uniform mat4 reflectionMatrix;
      attribute vec3 waveShelter;
      attribute vec3 waveResolution;
      varying vec3 worldPosition;
      varying vec2 oceanCoordinate;
      varying vec3 oceanNormal;
      varying vec3 waveData;
      varying vec4 reflectionCoordinate;
      ${NACRE_WAVE_GLSL}
      void main() {
        vec4 world=modelMatrix*vec4(position,1.);
        oceanCoordinate=world.xz;
        NacreOcean wave=nacreOcean(world.xz,time,waveShelter,waveResolution);
        reflectionCoordinate=reflectionMatrix*world;
        world.xyz+=wave.displacement;
        oceanNormal=wave.normal;
        waveData=vec3(wave.displacement.y,wave.crest,wave.compression);
        worldPosition=world.xyz;
        gl_Position=projectionMatrix*viewMatrix*world;
      }
    `,
    fragmentShader: `
      varying vec3 worldPosition;
      varying vec2 oceanCoordinate;
      varying vec3 oceanNormal;
      varying vec3 waveData;
      varying vec4 reflectionCoordinate;
      uniform sampler2D rippleTexture;
      uniform sampler2D sceneReflection;
      uniform float reflectionReady;
      uniform float time;
      uniform float wetness;
      uniform float nearSurface;
      uniform sampler2D stormSky;
      uniform float skyYaw;
      uniform vec3 seaHaze;
      float hash(vec2 p) {
        vec3 q=fract(vec3(p.xyx)*.1031);q+=dot(q,q.yzx+33.33);
        return fract((q.x+q.y)*q.z);
      }
      vec3 noiseGradient(vec2 p) {
        vec2 i=floor(p),f=fract(p),u=f*f*f*(f*(f*6.-15.)+10.),du=30.*f*f*(f-1.)*(f-1.);
        float a=hash(i),b=hash(i+vec2(1,0)),c=hash(i+vec2(0,1)),d=hash(i+vec2(1,1));
        return vec3(mix(mix(a,b,u.x),mix(c,d,u.x),u.y),du.x*mix(b-a,d-c,u.y),du.y*mix(c-a,d-b,u.x));
      }
      vec3 skyRadiance(vec3 ray) {
        #ifdef NACRE_SKY_REFLECTION
          vec2 uv=vec2(fract(atan(ray.z,ray.x)/6.28318530718+skyYaw),asin(clamp(ray.y,-1.,1.))/3.14159265359+.5);
          // Reuse the backdrop's sRGB texture. A modest mip bias softens reflected
          // cloud detail without a reflection camera, render target, or new map.
          vec3 radiance=texture2D(stormSky,uv,3.5).rgb*.85;
          return mix(radiance,seaHaze,(1.-smoothstep(-.025,.075,ray.y))*.82);
        #else
          return mix(vec3(.040,.087,.110),vec3(.20,.29,.30),smoothstep(.05,.8,ray.y));
        #endif
      }
      vec2 windChop(vec2 p,vec2 direction,float wavelength,float height,float speed,float phase,float footprint) {
        float k=6.2831853/wavelength;
        float fade=1.-smoothstep(.65,2.6,k*footprint);
        vec2 crosswind=vec2(-direction.y,direction.x);
        float bend=dot(crosswind,p)*.024+phase;
        float angle=k*(dot(direction,p)-time*speed)+sin(bend)*.8+phase;
        return height*cos(angle)*(k*direction+.0192*cos(bend)*crosswind)*fade;
      }
      void main() {
        vec2 p=oceanCoordinate;
        vec3 view=normalize(cameraPosition-worldPosition);
        float surfaceDistance=length(cameraPosition-worldPosition);
        float footprint=max(length(dFdx(p)),length(dFdy(p)));
        vec2 wind=vec2(.94,.342);
        vec2 across=vec2(-wind.y,wind.x);
        vec2 windUV=vec2(dot(p,wind),dot(p,across));
        float detailVisibility=1.-smoothstep(5.,20.,footprint);
        // Mipmapped wind ripples carry small highlights, independently of the
        // long geometric swell. Unequal scales/drifts avoid a scrolling tile.
        vec2 rippleA=texture2D(rippleTexture,windUV/vec2(115.,185.)-vec2(time*.013,0.)).rg*2.-1.;
        vec2 rippleB=texture2D(rippleTexture,(windUV.yx+vec2(39.,71.))/vec2(61.,94.)+vec2(time*.008,-time*.004)).rg*2.-1.;
        vec2 ripples=(rippleA*.24+rippleB*.11)*detailVisibility;
        vec2 chop=windChop(p,vec2(.94,.342),39.,.95,7.6,.7,footprint)
          +windChop(p,vec2(.99,-.141),27.,.61,6.3,2.3,footprint)
          +windChop(p,vec2(.766,.643),19.,.37,5.1,4.7,footprint)
          +windChop(p,vec2(.866,.5),14.,.19,4.4,1.1,footprint);
        vec3 baseNormal=normalize(oceanNormal);
        vec3 normal=normalize(baseNormal+vec3(wind.x*ripples.x+across.x*ripples.y-chop.x,0.,wind.y*ripples.x+across.y*ripples.y-chop.y));
        float facing=clamp(dot(normal,view),0.,1.);
        float grazing=pow(1.-facing,5.);
        float fresnel=.02+.98*grazing;
        vec3 reflected=skyRadiance(reflect(-view,normal));
        // A small, throttled mean-plane reflection grounds nearby architecture.
        // Fade its projection edges and distance before it can dominate swells.
        vec2 reflectionUV=reflectionCoordinate.xy/max(.001,reflectionCoordinate.w)+normal.xz*.009;
        float reflectionValid=smoothstep(.025,.14,reflectionUV.x)*smoothstep(.025,.14,reflectionUV.y)
          *(1.-smoothstep(.86,.975,reflectionUV.x))*(1.-smoothstep(.86,.975,reflectionUV.y));
        float localReflection=reflectionReady*reflectionValid*(1.-smoothstep(240.,900.,surfaceDistance))*(1.-wetness);
        vec2 mirrorUV=clamp(reflectionUV,.008,.992);
        vec2 spread=vec2(.0035,.005);
        vec3 mirror=texture2D(sceneReflection,mirrorUV).rgb*.4;
        mirror+=texture2D(sceneReflection,mirrorUV+spread).rgb*.15;
        mirror+=texture2D(sceneReflection,mirrorUV-spread).rgb*.15;
        mirror+=texture2D(sceneReflection,mirrorUV+vec2(spread.x,-spread.y)).rgb*.15;
        mirror+=texture2D(sceneReflection,mirrorUV+vec2(-spread.x,spread.y)).rgb*.15;
        reflected=mix(reflected,mirror,localReflection*.22);
        vec3 deep=vec3(.013,.043,.054);
        vec3 surface=mix(deep,reflected*vec3(.77,.91,.94),.16+fresnel*.77);
        float broad=noiseGradient(p*.006-wind*time*.009).x;
        float patchLight=smoothstep(.22,.8,broad);
        surface+=vec3(.004,.012,.013)*(patchLight-.5)*detailVisibility;
        float backlight=pow(max(0.,dot(view,-normalize(vec3(-.55,.15,.42)))),2.);
        surface+=vec3(.012,.076,.057)*smoothstep(-2.,21.,waveData.x)*(.35+backlight*.85);
        vec3 halfLight=normalize(view+normalize(vec3(-.55,.72,.42)));
        float glint=pow(max(dot(normal,halfLight),0.),140.);
        surface+=vec3(.10,.13,.12)*glint*detailVisibility;
        // Compression selects breaking groups. Long gaps and torn cellular
        // edges leave most crest faces clear, instead of outlining each wave.
        vec2 foamUV=windUV/vec2(42.,19.)-vec2(time*.085,0.);
        float foamPatch=noiseGradient(foamUV*.52+vec2(17.,31.)).x;
        float laceVisibility=1.-smoothstep(.45,1.8,footprint*3.3/19.);
        float foamLace=mix(.5,noiseGradient(foamUV*3.3+vec2(5.,11.)).x,laceVisibility);
        float grainVisibility=1.-smoothstep(.6,2.8,footprint*.43);
        float foamGrain=mix(.5,noiseGradient(windUV*.43-wind*time*.4).x,grainVisibility);
        float breaking=smoothstep(.065,.15,waveData.z)*smoothstep(.24,.44,waveData.y);
        float ragged=smoothstep(.47,.72,foamPatch+foamLace*.16);
        float cells=smoothstep(.22,.54,foamLace+foamGrain*.25);
        float crestFoam=breaking*ragged*cells;
        float residue=smoothstep(.045,.11,waveData.z)*(1.-smoothstep(.11,.20,waveData.z));
        residue*=smoothstep(.63,.83,foamPatch)*smoothstep(.45,.78,foamLace)*.14;
        float foamFade=(1.-smoothstep(3800.,6500.,surfaceDistance))*(1.-smoothstep(.8,2.2,footprint/19.));
        float foam=clamp((crestFoam+residue)*foamFade,0.,.86);
        surface=mix(surface,vec3(.53,.64,.61),foam);
        // From below, broad warped transmission patches describe moving water
        // without the previous normal-driven Fresnel bands. Only the upward
        // Snell window admits filtered sky radiance; the horizon stays quiet.
        vec3 ceiling=mix(vec3(.026,.079,.101),vec3(.054,.145,.163),patchLight*detailVisibility);
        ceiling=mix(ceiling,vec3(.036,.108,.130),grazing*.45);
        vec3 transmitted=refract(-view,-normal,1.333);
        float windowWeight=smoothstep(.68,.85,abs(view.y))*detailVisibility;
        vec3 transmittedSky=skyRadiance(normalize(transmitted+vec3(0.,.0001,0.)));
        ceiling=mix(ceiling,transmittedSky*vec3(.30,.57,.62)+vec3(.010,.033,.044),windowWeight*.72);
        vec3 color=mix(surface,ceiling,wetness);
        float distanceFade=1.-exp(-pow(surfaceDistance*.00020,1.35));
        color=mix(color,mix(seaHaze,vec3(.018,.077,.102),wetness),distanceFade*.8);
        // A local transparency window protects craft/road while the camera crosses.
        // Deep underwater and high above the sea keep the complete far surface.
        float crossingFade=mix(smoothstep(35.,110.,distance(cameraPosition.xz,p)),1.,nearSurface);
        float opacity=mix(.975,.90,wetness)*crossingFade;
        // Discard the crossing window before writing depth. Offshore crests
        // occlude their own far slopes rather than blending through each other.
        if(opacity<.01) discard;
        gl_FragColor=vec4(color,opacity);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
  });
  const geometries = {
    high: createNacreOceanGeometry(size, track, 'high'),
    low: createNacreOceanGeometry(size, track, 'low'),
  };
  const mesh = new T.Mesh(geometries.high, material);
  mesh.name = 'Nacre / ocean surface at y = ' + waterY;
  mesh.position.y = waterY;
  mesh.renderOrder = 2;
  mesh.userData.aoExclude = true;
  mesh.userData.geometries = Object.values(geometries);
  const reflection = createNacreOceanReflection(mesh, waterY);
  let disposed = false;
  mesh.userData.dispose = () => {
    if (disposed) return;
    disposed = true;
    reflection.dispose();
    rippleTexture.dispose();
  };
  let quality = 'high';
  mesh.userData.setQuality = (value) => {
    quality = value === 'low' ? 'low' : 'high';
    reflection.configure(quality);
    mesh.geometry = geometries[quality];
  };
  mesh.userData.getPresentation = () => ({
    version: NACRE_OCEAN_PROFILE.version,
    quality,
    time: material.uniforms.time.value,
    displaced: true,
    waveCount: NACRE_OCEAN_PROFILE.waves.length,
    heightBound: NACRE_WAVE_HEIGHT_BOUND,
    triangles: mesh.geometry.index.count / 3,
    highTriangles: geometries.high.index.count / 3,
    lowTriangles: geometries.low.index.count / 3,
    draws: 1,
    newTextures: 1,
    newRenderPasses: quality === 'high' ? 1 : 0,
    reflection: reflection.getPresentation(),
  });
  return mesh;
}

export function createNacreParticles(track, random) {
  const count = 1600;
  const positions = new Float32Array(count * 3);
  const phases = new Float32Array(count);
  for (let i = 0; i < count; i += 1) {
    const p = track.sample(random() * track.length).position;
    positions.set(
      [
        p.x + (random() - 0.5) * 280,
        Math.min(-5, p.y + (random() - 0.5) * 120),
        p.z + (random() - 0.5) * 280,
      ],
      i * 3,
    );
    phases[i] = random();
  }
  const geometry = new T.BufferGeometry();
  geometry.setAttribute('position', new T.BufferAttribute(positions, 3));
  geometry.setAttribute('phase', new T.BufferAttribute(phases, 1));
  const material = new T.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    uniforms: { time: { value: 0 }, wetness: { value: 0 } },
    vertexShader: `
      attribute float phase;
      uniform float time;
      varying float alpha;
      void main() {
        vec3 p=position+vec3(sin(time*.07+phase*12.)*2.,sin(time*.11+phase*9.)*1.7,cos(time*.08+phase*8.)*2.);
        vec4 view=modelViewMatrix*vec4(p,1.);
        alpha=(.2+phase*.45)*(1.-smoothstep(80.,300.,-view.z));
        gl_PointSize=clamp((90.+phase*85.)/max(1.,-view.z),.5,2.2);
        gl_Position=projectionMatrix*view;
      }
    `,
    fragmentShader: `
      uniform float wetness;
      varying float alpha;
      void main() {
        float shape=1.-smoothstep(.15,.5,length(gl_PointCoord-.5));
        gl_FragColor=vec4(.43,.72,.68,alpha*shape*wetness);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
  });
  const points = new T.Points(geometry, material);
  points.name = 'Nacre / drifting marine snow';
  points.userData.aoExclude = true;
  return points;
}
