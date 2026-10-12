import * as T from 'three';
import { seededRandom } from './geometry.js';
import { nacreSeabedHeight } from './seabed.js';

const WIND = new T.Vector2(0.94, 0.342).normalize();
const RAIN_HIGH = 960;
const RAIN_LOW = 420;

export function sampleNacreWeather(cameraY, waterY = 0) {
  return T.MathUtils.smoothstep(cameraY - waterY, 5, 23);
}

// Match the existing splayed road stems and intersect their centreline with
// mean sea level. Spray belongs to those physical contacts, never the deck.
export function nacreSupportSprayAnchors(track) {
  const anchors = [];
  const waterY = track.waterY ?? 0;
  for (let distance = 45; distance < track.length; distance += 104) {
    if (
      track.isGap(distance) ||
      track.jumps.some(
        (jump) =>
          distance > jump.takeoff - 7 && distance < jump.landingStart + 7,
      )
    )
      continue;
    const frame = track.sample(distance);
    if (frame.position.y < waterY + 30) continue;
    for (const side of [-1, 1]) {
      const top = frame.position
        .clone()
        .addScaledVector(frame.right, side * 10)
        .addScaledVector(frame.up, -3.5);
      const root = frame.position
        .clone()
        .addScaledVector(frame.right, side * 20)
        .addScaledVector(frame.up, -28);
      root.y = nacreSeabedHeight(track, root.x, root.z) - 4;
      if (top.y <= waterY + 24) continue;
      const contact = root
        .clone()
        .lerp(top, (waterY - root.y) / (top.y - root.y));
      anchors.push({ position: contact, distance, side, deckY: top.y });
    }
  }
  return anchors;
}

const noiseGLSL = `
  float weatherHash(vec2 p) { return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453); }
  float weatherNoise(vec2 p) {
    vec2 i=floor(p),f=fract(p); f=f*f*(3.-2.*f);
    return mix(mix(weatherHash(i),weatherHash(i+vec2(1.,0.)),f.x),
      mix(weatherHash(i+vec2(0.,1.)),weatherHash(i+vec2(1.)),f.x),f.y);
  }
`;

function createLayer(name, anchors, kind, uniforms) {
  const base = new T.PlaneGeometry(1, 1);
  const geometry = new T.InstancedBufferGeometry();
  geometry.setIndex(base.index.clone());
  geometry.setAttribute('position', base.attributes.position.clone());
  geometry.setAttribute('uv', base.attributes.uv.clone());
  base.dispose();
  const random = seededRandom(6172 + kind.length * 821);
  const seeds = [],
    origins = [];
  for (const anchor of anchors) {
    origins.push(...anchor);
    seeds.push(random(), random(), random(), random());
  }
  geometry.setAttribute(
    'weatherOrigin',
    new T.InstancedBufferAttribute(new Float32Array(origins), 3),
  );
  geometry.setAttribute(
    'weatherSeed',
    new T.InstancedBufferAttribute(new Float32Array(seeds), 4),
  );
  geometry.instanceCount = anchors.length;
  const rain = kind === 'rain';
  const mist = kind === 'mist';
  const material = new T.ShaderMaterial({
    name,
    uniforms,
    transparent: true,
    depthWrite: false,
    vertexShader: `
      attribute vec3 weatherOrigin;
      attribute vec4 weatherSeed;
      uniform float weatherTime, waterY, strength;
      uniform vec3 eye;
      uniform vec2 wind;
      varying vec2 vUv;
      varying float vFade;
      varying float vSeed;
      void main() {
        vec3 p=weatherOrigin;
        float life=fract(weatherTime/(8.+weatherSeed.w*5.)+weatherSeed.x);
        float envelope=1.;
        vec2 size;
        ${
          rain
            ? `
          float fall=29.+weatherSeed.w*11.;
          p=vec3(weatherSeed.x*144.,weatherSeed.y*104.,weatherSeed.z*144.);
          p.xz=mod(p.xz+wind*weatherTime*12.-eye.xz+72.,144.)-72.+eye.xz;
          p.y=mod(p.y-weatherTime*fall-eye.y+24.,104.)-24.+eye.y;
          envelope=(1.-smoothstep(52.,72.,length(p.xz-eye.xz)))
            *smoothstep(waterY+2.,waterY+8.,p.y)
            *(1.-smoothstep(60.,78.,p.y-eye.y));
          size=vec2(.032+weatherSeed.w*.022,.9+weatherSeed.w*1.1);
        `
            : mist
              ? `
          float drift=sin(weatherTime*.09+weatherSeed.x*6.2831);
          p.xz+=wind*(drift*14.+weatherSeed.y*12.);
          p.y+=8.+weatherSeed.z*5.;
          size=vec2(65.+weatherSeed.y*70.,12.+weatherSeed.w*10.);
          envelope=(.75+.25*sin(weatherTime*.16+weatherSeed.z*6.2831))
            *smoothstep(60.,160.,distance(p,eye))
            *(1.-smoothstep(950.,1900.,distance(p,eye)));
        `
              : `
          // Unequal contact bursts: short rising spindrift, long quiet gaps.
          float age=life*4.2;
          envelope=smoothstep(0.,.10,age)*(1.-smoothstep(.52,1.,age));
          p.xz+=wind*age*(10.+weatherSeed.z*10.)
            +vec2(weatherSeed.y-.5,weatherSeed.z-.5)*6.;
          p.y+=2.+sin(min(age,1.)*3.14159)*(7.+weatherSeed.w*9.);
          size=vec2(3.+age*8.,4.+age*7.);
          envelope*=smoothstep(22.,65.,distance(p,eye))
            *(1.-smoothstep(450.,820.,distance(p,eye)));
        `
        }
        vec4 mv=viewMatrix*vec4(p,1.);
        ${
          rain
            ? `
          vec3 velocity=(viewMatrix*vec4(wind.x*12.,-fall,wind.y*12.,0.)).xyz;
          vec2 along=normalize(velocity.xy+vec2(.0001));
          mv.xy+=vec2(along.y,-along.x)*position.x*size.x+along*position.y*size.y;
        `
            : 'mv.xy+=position.xy*size;'
        }
        gl_Position=projectionMatrix*mv;
        vUv=uv;
        vSeed=weatherSeed.w;
        vFade=envelope*strength*smoothstep(6.,18.,-mv.z);
      }
    `,
    fragmentShader: `
      uniform float weatherTime;
      varying vec2 vUv;
      varying float vFade;
      varying float vSeed;
      ${rain ? '' : noiseGLSL}
      void main() {
        ${
          rain
            ? `
          float shape=pow(max(0.,1.-abs(vUv.x-.5)*2.),1.6)*sin(vUv.y*3.14159);
          gl_FragColor=vec4(vec3(.46,.56,.60),shape*vFade*.19);
        `
            : `
          vec2 q=vUv*2.-1.;
          float shape=1.-smoothstep(.2,1.,dot(q,q));
          vec2 drift=vec2(weatherTime*.035+vSeed*21.,vSeed*13.);
          float cloud=weatherNoise(vUv*5.+drift)*.7+weatherNoise(vUv*11.-drift)*.3;
          shape*=smoothstep(.22,.73,cloud);
          gl_FragColor=vec4(vec3(.40,.51,.53),shape*vFade*${mist ? '.13' : '.30'});
        `
        }
        if(gl_FragColor.a<.002) discard;
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
  });
  const mesh = new T.Mesh(geometry, material);
  mesh.name = name;
  mesh.frustumCulled = false;
  mesh.renderOrder = 2;
  mesh.userData.nacreReflectionExclude = true;
  return mesh;
}

// Adapted from the framework weather's bounded, GPU-evaluated precipitation
// approach; local ownership, simulation clock and sea/road placement rules.
export function createNacreMarineWeather(track, placements) {
  const waterY = track.waterY ?? 0;
  const group = new T.Group();
  group.name = 'Nacre / sea mist, support spindrift and storm rain';
  const uniforms = {
    weatherTime: { value: 0 },
    waterY: { value: waterY },
    eye: { value: new T.Vector3() },
    wind: { value: WIND.clone() },
    strength: { value: 0 },
  };
  const sites = placements.filter(
    (site) =>
      ['basalt-spire', 'tide-observatory', 'distant-volcanic-island'].includes(
        site.kind,
      ) && site.maxY > waterY + 25,
  );
  const mistAnchors = [];
  // Interleave sites so low quality retains every landmark, with fewer patches.
  for (let layer = 0; layer < 3; layer += 1)
    for (const site of sites) {
      const angle = layer * 2.399 + site.x * 0.003;
      const radius = Math.min(site.radius * 0.8, 115);
      mistAnchors.push([
        site.x + Math.cos(angle) * radius,
        waterY,
        site.z + Math.sin(angle) * radius,
      ]);
    }
  const supportAnchors = nacreSupportSprayAnchors(track);
  const sprayAnchors = [];
  for (let layer = 0; layer < 6; layer += 1)
    for (const anchor of supportAnchors)
      sprayAnchors.push(anchor.position.toArray());
  const rain = createLayer(
    'Nacre / sparse wind-driven rain',
    Array.from({ length: RAIN_HIGH }, () => [0, 0, 0]),
    'rain',
    uniforms,
  );
  const mist = createLayer(
    'Nacre / low broken sea mist',
    mistAnchors,
    'mist',
    uniforms,
  );
  const spray = createLayer(
    'Nacre / exposed support spindrift',
    sprayAnchors,
    'spray',
    uniforms,
  );
  group.add(rain, mist, spray);
  const highQuads = RAIN_HIGH + mistAnchors.length + sprayAnchors.length;
  const lowQuads = RAIN_LOW + sites.length + supportAnchors.length * 3;
  let lastQuality = 'high',
    lastReducedMotion = false;
  return {
    group,
    metrics: {
      meshCount: 3,
      triangleCount: highQuads * 2,
      lowTriangleCount: lowQuads * 2,
    },
    update(
      cameraPosition,
      time,
      { quality = 'high', reducedMotion = false, overview = false } = {},
    ) {
      lastQuality = quality;
      lastReducedMotion = reducedMotion;
      uniforms.eye.value.copy(cameraPosition);
      uniforms.weatherTime.value = reducedMotion
        ? 0
        : Math.max(0, Number.isFinite(time) ? time : 0);
      uniforms.strength.value = sampleNacreWeather(cameraPosition.y, waterY);
      group.visible = !overview && uniforms.strength.value > 0.001;
      rain.visible = spray.visible = !reducedMotion;
      rain.geometry.instanceCount = quality === 'low' ? RAIN_LOW : RAIN_HIGH;
      mist.geometry.instanceCount =
        quality === 'low' ? sites.length : mistAnchors.length;
      spray.geometry.instanceCount =
        supportAnchors.length * (quality === 'low' ? 3 : 6);
    },
    getPresentation: () => ({
      visible: group.visible,
      time: uniforms.weatherTime.value,
      strength: uniforms.strength.value,
      quality: lastQuality,
      reducedMotion: lastReducedMotion,
      rainQuads:
        group.visible && rain.visible ? rain.geometry.instanceCount : 0,
      mistQuads: group.visible ? mist.geometry.instanceCount : 0,
      sprayQuads:
        group.visible && spray.visible ? spray.geometry.instanceCount : 0,
      supportSites: supportAnchors.length,
      mistSites: sites.length,
    }),
    clear() {
      uniforms.strength.value = 0;
      group.visible = false;
    },
  };
}
