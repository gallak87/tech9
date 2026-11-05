import * as T from 'three';
import { groundHeight, groundSlope } from './ground-field.js';
export { groundSlope };

export const HABITAT = Object.freeze({
  radius: 1000,
  centerY: 1000,
  halfLength: 2400,
});
export const TAU = Math.PI * 2;
export const clamp = T.MathUtils.clamp;
export function hubGateDistances(track) {
  return [
    track.sections.find((s) => s.id === 'sunline').showcase + 140,
    track.jumps[1].landingStart + 250,
  ];
}
export function civicExcluded(track, distance, margin = 0) {
  return (track.civicExclusions ?? []).some(
    (range) =>
      distance >= range.start - margin && distance <= range.end + margin,
  );
}
export function randomSource(seed = 61037) {
  return () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}

export function shellPoint(angle, z, height = 0) {
  const r = HABITAT.radius - height;
  return new T.Vector3(
    Math.sin(angle) * r,
    HABITAT.centerY - Math.cos(angle) * r,
    z,
  );
}

export function shellMatrix(angle, z, height = 0, yaw = 0, scale = 1) {
  const q = new T.Quaternion().setFromAxisAngle(new T.Vector3(0, 0, 1), angle);
  q.multiply(new T.Quaternion().setFromAxisAngle(new T.Vector3(0, 1, 0), yaw));
  const size =
    typeof scale === 'number' ? new T.Vector3(scale, scale, scale) : scale;
  return new T.Matrix4().compose(shellPoint(angle, z, height), q, size);
}

export function terrainHeight(angle, z) {
  return groundHeight(angle, z);
}

export function lakeAt(angle, z) {
  const wrap = (x) => Math.atan2(Math.sin(x), Math.cos(x));
  const basins = LAKE_BASINS;
  let value = 10;
  for (const [a, axial, width, length] of basins) {
    const da = wrap(angle - a) / width;
    const dz = (z - axial) / length;
    const shore =
      1 +
      0.055 * Math.sin(dz * 15 + da * 6) +
      0.04 * Math.sin(dz * 27 - da * 9);
    value = Math.min(value, Math.sqrt(da * da + dz * dz) / shore);
  }
  return value;
}

// Separate batches can be culled while the entire inhabited shell stays present.
export function sectorAt(angle, z) {
  return `${Math.floor(((((angle % TAU) + TAU) % TAU) / TAU) * 8)}:${z < 0 ? 0 : 1}`;
}

export function routeClearance(track) {
  const cells = new Map();
  const size = 100;
  for (let s = 0; s < track.length; s += 18) {
    const p = track.sample(s).position;
    const key = `${Math.floor(p.x / size)},${Math.floor(p.y / size)},${Math.floor(p.z / size)}`;
    if (!cells.has(key)) cells.set(key, []);
    cells.get(key).push(p);
  }
  return (point, radius = 80) => {
    const n = Math.ceil(radius / size),
      r2 = radius * radius;
    const x = Math.floor(point.x / size),
      y = Math.floor(point.y / size),
      z = Math.floor(point.z / size);
    for (let i = -n; i <= n; i++)
      for (let j = -n; j <= n; j++)
        for (let k = -n; k <= n; k++) {
          for (const p of cells.get(`${x + i},${y + j},${z + k}`) ?? [])
            if (p.distanceToSquared(point) < r2) return false;
        }
    return true;
  };
}

/** The habitat's axial sun adds bounded radial bounce in every orientation. */
export function finishHabitatMaterial(material, { bounce = 0.32 } = {}) {
  if (!material.isMeshStandardMaterial) return material;
  const previous = material.onBeforeCompile;
  const previousKey = material.customProgramCacheKey();
  const radialBounce = { value: bounce };
  material.userData.orielRadialBounce = radialBounce;
  material.onBeforeCompile = (shader, renderer) => {
    previous?.(shader, renderer);
    shader.uniforms.orielRadialBounce = radialBounce;
    shader.vertexShader =
      'varying vec3 orielWorld;\n' +
      shader.vertexShader.replace(
        '#include <worldpos_vertex>',
        `#include <worldpos_vertex>
      vec4 ow = vec4(transformed, 1.0);
      #ifdef USE_INSTANCING
      ow = instanceMatrix * ow;
      #endif
      orielWorld = (modelMatrix * ow).xyz;`,
      );
    shader.fragmentShader =
      'varying vec3 orielWorld;uniform float orielRadialBounce;\n' +
      shader.fragmentShader.replace(
        '#include <lights_fragment_end>',
        `#include <lights_fragment_end>
      vec3 radialSun = normalize(vec3(-orielWorld.x, 1000.0-orielWorld.y, 0.0));
      vec3 worldN = inverseTransformDirection(normal, viewMatrix);
      float axialDay = max(0.0, dot(worldN, radialSun));
      reflectedLight.indirectDiffuse += diffuseColor.rgb * vec3(1.0, .91, .73) * orielRadialBounce * (axialDay + .17);`,
      );
  };
  material.customProgramCacheKey = () => `${previousKey}:oriel-radial-day-v2`;
  return material;
}

export const LAKE_BASINS = [
  [0.03, -650, 0.34, 1080],
  [Math.PI - 0.16, 500, 0.29, 900],
  [-1.6, 1330, 0.24, 650],
  [1.8, -1600, 0.21, 540],
];
export const TOWN_CORES = [
  [0.48, -1200, 0.7, 950],
  [-0.42, 680, 0.6, 900],
  [1.45, -250, 0.64, 1100],
  [2.8, 700, 0.64, 1050],
  [3.75, -900, 0.52, 900],
  [4.68, 450, 0.7, 1000],
  [5.65, -1350, 0.45, 650],
];
export function townAt(angle, z) {
  let density = 0;
  for (const [a, az, aw, zw] of TOWN_CORES) {
    const da = Math.atan2(Math.sin(angle - a), Math.cos(angle - a)) / aw;
    density = Math.max(density, 1 - Math.hypot(da, (z - az) / zw));
  }
  return density;
}

export function createHabitatTerrain(own, authoredGeometries) {
  const land = own(
    finishHabitatMaterial(
      new T.MeshStandardMaterial({
        name: 'Oriel / planted inner landscape and reflecting reservoirs',
        color: '#ffffff',
        roughness: 0.86,
        metalness: 0,
      }),
      { bounce: 0.24 },
    ),
  );
  const base = land.onBeforeCompile;
  land.onBeforeCompile = (shader, renderer) => {
    base(shader, renderer);
    shader.vertexShader =
      'varying vec2 habitatUV;\n' +
      shader.vertexShader.replace(
        '#include <uv_vertex>',
        '#include <uv_vertex>\nhabitatUV=uv;',
      );
    const functions = `
      varying vec2 habitatUV;
      float basin(vec2 p,vec4 b){float da=atan(sin(p.x-b.x),cos(p.x-b.x))/b.z;float dz=(p.y-b.y)/b.w;
        return length(vec2(da,dz))/(1.+.055*sin(dz*15.+da*6.)+.04*sin(dz*27.-da*9.));}
      float town(vec2 p,vec4 b){float da=atan(sin(p.x-b.x),cos(p.x-b.x))/b.z;return 1.-length(vec2(da,(p.y-b.y)/b.w));}
      float fieldHash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
    `;
    shader.fragmentShader =
      functions +
      shader.fragmentShader
        .replace(
          '#include <color_fragment>',
          `#include <color_fragment>
      vec2 hp=vec2(habitatUV.x*6.2831853,habitatUV.y*4800.-2400.);
      vec2 metres=vec2(hp.x*1000.,hp.y);
      float lake=10.;
      ${LAKE_BASINS.map((b) => `lake=min(lake,basin(hp,vec4(${b.map((n) => n.toFixed(5)).join(',')})));`).join('\n')}
      float orielLakeMask=1.-smoothstep(.995,1.008,lake);
      float settlement=0.;
      ${TOWN_CORES.map((b) => `settlement=max(settlement,town(hp,vec4(${b.map((n) => n.toFixed(5)).join(',')})));`).join('\n')}
      vec2 fieldCoord=vec2(metres.x+32.*sin(metres.y*.0018),metres.y+26.*sin(metres.x*.002));
      vec2 cell=floor(fieldCoord/vec2(185.,270.));
      float crop=.5+.5*sin(hp.x*5.+sin(hp.y*.0014)*1.8)*sin(hp.y*.0018+hp.x*1.5);
      vec3 planted=mix(vec3(.055,.17,.08),vec3(.18,.28,.13),crop*.78);
      vec2 within=mod(fieldCoord,vec2(185.,270.));
      float paths=min(min(within.x,185.-within.x),min(within.y,270.-within.y));
      float path=1.-smoothstep(1.5,3.8,paths);
      planted=mix(planted,vec3(.30,.29,.20),path*.14);
      float furrow=sin(metres.y*.52+cell.x*1.8)*.025;
      planted*=1.+furrow*(1.-smoothstep(.1,.45,settlement));
      planted=mix(planted,vec3(.13,.22,.14),smoothstep(.10,.32,settlement)*.15);
      #ifdef FLAT_SHADED
      vec3 faceWorld=normalize(cross(dFdx(orielWorld),dFdy(orielWorld)));
      #else
      vec3 faceWorld=inverseTransformDirection(normalize(vNormal),viewMatrix);
      #endif
      vec3 localInward=normalize(vec3(-orielWorld.x,1000.-orielWorld.y,0.));
      float scarp=smoothstep(.10,.28,1.-abs(dot(faceWorld,localInward)));
      planted=mix(planted,vec3(.34,.32,.25),scarp*.88);
      vec3 shallow=vec3(.03,.32,.39),deep=vec3(.014,.18,.30);
      vec3 waterColor=mix(deep,shallow,smoothstep(.45,1.,lake));
      vec3 surface=mix(planted,waterColor,orielLakeMask);
      float bank=(1.-smoothstep(1.02,1.055,lake))*(1.-orielLakeMask);
      surface=mix(surface,vec3(.41,.39,.29),bank*.9);
      diffuseColor.rgb*=surface;
    `,
        )
        .replace(
          '#include <roughnessmap_fragment>',
          `#include <roughnessmap_fragment>\nroughnessFactor=mix(.91,.17,orielLakeMask);`,
        )
        .replace(
          '#include <metalnessmap_fragment>',
          `#include <metalnessmap_fragment>\nmetalnessFactor=mix(.0,.3,orielLakeMask);`,
        )
        .replace(
          '#include <lights_fragment_maps>',
          `#include <lights_fragment_maps>\n#if defined(USE_ENVMAP) && defined(RE_IndirectSpecular)\nradiance*=mix(1.,3.2,orielLakeMask);\n#endif`,
        )
        .replace(
          '#include <normal_fragment_maps>',
          `#include <normal_fragment_maps>
        float waterAngle=atan(orielWorld.x,1000.-orielWorld.y);
        vec2 waterMetres=vec2(waterAngle*1000.,orielWorld.z);
        float rippleX=sin(waterMetres.x*.7+waterMetres.y*.31)*.012+sin(waterMetres.x*2.1-waterMetres.y*1.6)*.006;
        float rippleZ=cos(waterMetres.x*.41+waterMetres.y*.57)*.012+cos(waterMetres.y*2.4+waterMetres.x*.8)*.005;
        vec3 rippleWorld=vec3(cos(waterAngle),sin(waterAngle),0.)*rippleX+vec3(0.,0.,rippleZ);
        normal=normalize(normal+orielLakeMask*mat3(viewMatrix)*rippleWorld);`,
        );
  };
  land.customProgramCacheKey = () => 'oriel-planted-shell-analytic-lakes-v2';
  const group = new T.Group();
  group.name = 'Oriel / continuous planted inner shell';
  if (authoredGeometries) {
    authoredGeometries.forEach((geometry, index) => {
      const mesh = new T.Mesh(geometry, land);
      mesh.name = `Oriel / authored garden terrace sector ${index}`;
      mesh.receiveShadow = true;
      group.add(mesh);
    });
    return { group, materials: [land], water: land };
  }
  throw new Error('Oriel requires its authored ground geometry.');
}
