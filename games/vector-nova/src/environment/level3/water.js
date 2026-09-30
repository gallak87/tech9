import * as T from 'three';
import { NACRE_SKY_YAW } from './atmosphere.js';
import {
  createNacreOceanGeometry,
  NACRE_WAVE_GLSL,
  NACRE_WAVE_HEIGHT_BOUND,
} from './ocean-waves.js';

export function createNacreWater(
  size,
  waterY,
  { skyTexture = null, track = null } = {},
) {
  const material = new T.ShaderMaterial({
    name: 'Nacre / living two-sided ocean',
    defines: skyTexture ? { NACRE_SKY_REFLECTION: 1 } : {},
    transparent: true,
    side: T.DoubleSide,
    forceSinglePass: true,
    depthWrite: true,
    uniforms: {
      time: { value: 0 },
      wetness: { value: 0 },
      nearSurface: { value: 1 },
      stormSky: { value: skyTexture },
      skyYaw: { value: NACRE_SKY_YAW },
    },
    vertexShader: `
      uniform float time;
      attribute vec3 waveShelter;
      varying vec3 worldPosition;
      varying vec3 shelterData;
      ${NACRE_WAVE_GLSL}
      void main() {
        vec4 world=modelMatrix*vec4(position,1.);
        vec4 swell=nacreSwell(world.xz,time);
        world.y+=swell.x*waveShelter.x;
        shelterData=waveShelter;
        worldPosition=world.xyz;
        gl_Position=projectionMatrix*viewMatrix*world;
      }
    `,
    fragmentShader: `
      varying vec3 worldPosition;
      varying vec3 shelterData;
      ${NACRE_WAVE_GLSL}
      uniform float time;
      uniform float wetness;
      uniform float nearSurface;
      uniform sampler2D stormSky;
      uniform float skyYaw;
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
          return texture2D(stormSky,uv,2.).rgb*.92;
        #else
          return mix(vec3(.040,.087,.110),vec3(.20,.29,.30),smoothstep(.05,.8,ray.y));
        #endif
      }
      void main() {
        vec2 p=worldPosition.xz;
        vec3 view=normalize(cameraPosition-worldPosition);
        float surfaceDistance=length(cameraPosition-worldPosition);
        float footprint=max(length(dFdx(p)),length(dFdy(p)));
        vec2 drift=vec2(time*.9,-time*.48);
        vec2 warp=vec2(noiseGradient(p*.0031+vec2(23.,11.)+time*.006).x,noiseGradient(p*.0037+vec2(-7.,53.)-time*.005).x)-.5;
        vec2 advected=p+drift+warp*65.;
        mat2 turn=mat2(.8,-.6,.6,.8);
        vec3 broad=noiseGradient(advected*.011);
        vec3 middle=noiseGradient(turn*(p-drift*.7+warp*24.)*.038+vec2(12.,37.));
        vec3 fine=noiseGradient(turn*turn*(p+drift*1.1)*.105+vec2(73.,-11.));
        float broadFade=1.-smoothstep(.2,.8,footprint*.011);
        float midFade=1.-smoothstep(.2,.8,footprint*.038);
        float fineFade=1.-smoothstep(.2,.8,footprint*.105);
        // The derivative and grazing fades remove subpixel horizon ripples,
        // while coherent world-space swells remain visible through the midground.
        float detailVisibility=(1.-smoothstep(850.,1900.,surfaceDistance))*smoothstep(.025,.15,abs(view.y));
        vec2 slope=(broad.yz*.085*broadFade+turn*middle.yz*.060*midFade+turn*turn*fine.yz*.020*fineFade)*detailVisibility;
        vec4 wave=nacreSwell(p,time);
        vec2 waveSlope=wave.yz*shelterData.x+wave.x*shelterData.yz;
        vec3 normal=normalize(vec3(-waveSlope.x+slope.x,1.,-waveSlope.y+slope.y));
        float grazing=pow(1.-max(0.,dot(normal,view)),4.);
        vec3 reflected=skyRadiance(reflect(-view,normal));
        vec3 surface=mix(vec3(.020,.067,.083),reflected*vec3(.71,.88,.93),.44+grazing*.44);
        float swell=.5+(broad.x-.5)*broadFade*.86+(middle.x-.5)*midFade*.27+(fine.x-.5)*fineFade*.06;
        float patchLight=smoothstep(.24,.76,swell);
        surface+=vec3(.012,.029,.033)*(patchLight-.5)*detailVisibility;
        float glint=pow(max(dot(reflect(-normalize(vec3(-.55,.72,.42)),normal),view),0.),40.);
        surface+=vec3(.12,.16,.16)*glint*midFade*detailVisibility;
        // Lifted windward crests carry blue-green light; white foam breaks into
        // moving patches instead of drawing continuous contour stripes.
        float backlight=pow(max(0.,dot(view,-normalize(vec3(-.55,.15,.42)))),2.);
        surface+=vec3(.012,.072,.061)*smoothstep(2.,17.,wave.x)*shelterData.x*(.4+backlight);
        float foamNoise=noiseGradient(p*.095+vec2(time*.38,-time*.17)).x;
        float foamLace=noiseGradient(p*.31-vec2(time*.57,time*.21)).x;
        float crestFoam=smoothstep(.46,.76,wave.w)*shelterData.x;
        crestFoam*=smoothstep(.22,.65,foamNoise+foamLace*.22);
        float wakeFoam=smoothstep(.67,.88,foamNoise)*smoothstep(.2,.48,wave.w)*.24*shelterData.x;
        float foam=clamp(crestFoam+wakeFoam,0.,.9)*(1.-smoothstep(1600.,3900.,surfaceDistance));
        surface=mix(surface,vec3(.48,.64,.63),foam);
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
        float distanceFade=1.-exp(-surfaceDistance*.00012);
        color=mix(color,mix(vec3(.12,.20,.235),vec3(.018,.077,.102),wetness),distanceFade*.6);
        // A local transparency window protects craft/road while the camera crosses.
        // Deep underwater and high above the sea keep the complete far surface.
        float crossingFade=mix(smoothstep(160.,600.,distance(cameraPosition.xz,p)),1.,nearSurface);
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
  let quality = 'high';
  mesh.userData.setQuality = (value) => {
    quality = value === 'low' ? 'low' : 'high';
    mesh.geometry = geometries[quality];
  };
  mesh.userData.getPresentation = () => ({
    version: 'nacre-storm-swells-v1',
    quality,
    time: material.uniforms.time.value,
    displaced: true,
    heightBound: NACRE_WAVE_HEIGHT_BOUND,
    triangles: mesh.geometry.index.count / 3,
    highTriangles: geometries.high.index.count / 3,
    lowTriangles: geometries.low.index.count / 3,
    draws: 1,
    newTextures: 0,
    newRenderPasses: 0,
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
