import * as T from 'three';
import { assetURL } from '../assets/url.js';
import { appendShaderPatch, replaceShader } from '../renderer/shader-patch.js';
import { assetKitBounds, createAssetKit } from './asset-kit.js';
import { editorRandom } from './document.js';
import { createFarGroundGeometry } from './far-ground.js';
import {
  createOrielShoulders,
  finishOrielShoulders,
} from './oriel-shoulders.js';
import meadowAssets from './kits/oriel-meadow-assets.json' with { type: 'json' };

const outerGardens = {
  offsets: [260, 650, 1450, 2750, 4900],
  heightAt(x, z, offset, plan) {
    const seed = (plan.seed % 997) * 0.037;
    const fold = 0.5 + 0.5 * Math.sin(x * 0.0021 + z * 0.00135 + seed);
    const fromRidge = (offset - 1450) / 1860;
    const height = 90 * Math.exp(-(fromRidge ** 2));
    return 30 + height * fold;
  },
};

export function buildOrielExterior(context) {
  const { owner, plan, materials, track, collectSolid } = context;
  if (collectSolid) return;
  const rim = owner.solid(
    'Oriel / garden foothills beyond the surveyed region',
    createFarGroundGeometry(plan, { relief: outerGardens }),
    materials.soil,
  );
  rim.castShadow = rim.receiveShadow = false;
  rim.userData.regionFarGround = true;
  if (track) {
    const soil = owner.material('Oriel / curved turf', {
      roughness: materials.soil.roughness,
      transparent: true,
      depthWrite: false,
    });
    finishOrielTerrain({ soil });
    finishOrielShoulders(soil);
    const shoulders = owner.solid(
      'Oriel / curving orchard banks',
      createOrielShoulders(track, plan),
      soil,
    );
    shoulders.castShadow = shoulders.receiveShadow = false;
  }
  return buildMeadow(context);
}

function buildMeadow({ track, plan, placement, renderer, doc }) {
  if (!track || !renderer || doc.settings.density === 0) return;
  const random = editorRandom(plan.seed ^ 0x4d454144);
  const length = track.finishDistance ?? track.length;
  const stations = Math.min(48, Math.ceil(length / 145));
  const quota = Math.round(650 * doc.settings.density);
  const occupied = placement.placements.map((record) => record.bounds);
  const position = new T.Vector3();
  const scale = new T.Vector3();
  const rotation = new T.Quaternion();
  const up = new T.Vector3(0, 1, 0);
  const placements = [];
  for (let i = 0; i < stations && placements.length < quota; i++) {
    const station = ((i + 0.35 + random() * 0.3) / stations) * length;
    if (track.isJumpProtected(station)) continue;
    const frame = track.sample(station);
    for (const side of [-1, 1]) {
      const setback = side * (track.width * 0.5 + 38 + random() * 112);
      const centerX = frame.position.x + frame.right.x * setback;
      const centerZ = frame.position.z + frame.right.z * setback;
      for (let n = 0; n < 8 && placements.length < quota; n++) {
        const x = centerX + (random() - 0.5) * 41;
        const z = centerZ + (random() - 0.5) * 35;
        const ground = plan.surfaceHeight(x, z);
        const waterGap = ground - plan.waterHeight(x, z);
        if (waterGap < 1.7 || frame.position.y - ground > 210) continue;
        const asset = waterGap < 9 || n % 4 === 0 ? 'shore' : 'meadow';
        const width = 3.2 + random() * 4.3;
        position.set(x, ground - 0.15, z);
        scale.set(width, 3.8 + random() * 5.5, width);
        rotation.setFromAxisAngle(up, random() * Math.PI * 2);
        const matrix = new T.Matrix4().compose(position, rotation, scale);
        const bounds = assetKitBounds(meadowAssets[asset], matrix);
        if (
          !placement.clears(bounds) ||
          occupied.some((district) => district.intersectsBox(bounds))
        )
          continue;
        placements.push({
          id: `tuft-${i}-${side}-${n}`,
          asset,
          matrix,
          solid: false,
        });
      }
    }
  }
  if (!placements.length) return;
  return createAssetKit({
    name: 'Oriel / Worldkit meadow grasses',
    assets: Object.fromEntries(
      Object.entries(meadowAssets).map(([id, asset]) => [
        id,
        { ...asset, url: assetURL(asset.url) },
      ]),
    ),
    placements,
    tileSize: 1400,
    tileOffset: 700,
    finishMaterial(material, asset) {
      material.color.set(asset === 'shore' ? '#a0b77b' : '#b1c796');
      material.alphaToCoverage = true;
      material.roughness = 0.92;
      material.envMapIntensity = 0.25;
      material.normalScale.setScalar(0.5);
    },
  });
}

const gardenNoise = /* glsl */ `
varying vec2 gardenPosition;
float gardenHash(vec2 cell) {
  vec3 p = fract(vec3(cell.xyx)*vec3(.1031,.103,.0973));
  p += dot(p,p.yzx + 33.33);
  return fract((p.x+p.y)*p.z);
}
float gardenNoise(vec2 p) {
  vec2 i=floor(p), f=fract(p);
  f=f*f*(3.-2.*f);
  return mix(mix(gardenHash(i),gardenHash(i+vec2(1.,0.)),f.x),
    mix(gardenHash(i+vec2(0.,1.)),gardenHash(i+1.),f.x),f.y);
}
`;

export function finishOrielTerrain({ soil }) {
  soil.color.set('#ffffff');
  appendShaderPatch(soil, ':editor-oriel-meadow-v2', (shader) => {
    shader.vertexShader =
      'varying vec2 gardenPosition;\n' +
      replaceShader(
        shader.vertexShader,
        '#include <worldpos_vertex>',
        '#include <worldpos_vertex>\ngardenPosition = (modelMatrix * vec4(transformed, 1.)).xz;',
      );
    shader.fragmentShader =
      gardenNoise +
      replaceShader(
        shader.fragmentShader,
        '#include <color_fragment>',
        `#include <color_fragment>
        vec2 p = gardenPosition;
        float valley = gardenNoise(p*.0017+vec2(12.,17.));
        float meadow = gardenNoise(p*.009+valley*1.7);
        float sward = smoothstep(.19,.78,valley*.62+meadow*.38);
        vec3 pasture = mix(vec3(.09,.20,.066),vec3(.252,.374,.136),sward);

        // Curved survey margins break up the planted fields, with rows large
        // enough for a driving camera and smoothly filtered at overview scale.
        vec2 survey = p + 28.*vec2(sin(p.y*.0031),sin(p.x*.0021));
        vec2 plot = survey/vec2(210.,260.);
        vec2 edge = min(fract(plot),1.-fract(plot));
        float core = smoothstep(.02,.095,min(edge.x,edge.y));
        float crop = gardenHash(floor(plot));
        float cultivation = smoothstep(.39,.64,valley)*smoothstep(.36,.62,crop);
        float row = (survey.x+survey.y*(crop-.35))*.24;
        float rowDetail = 1.-smoothstep(.16,1.15,fwidth(row));
        vec3 planted = mix(vec3(.124,.242,.072),vec3(.28,.377,.118),crop);
        planted *= .96 + .115*cos(row)*rowDetail;
        planted = mix(vec3(.194,.272,.105),planted,core);
        vec3 terrain = mix(pasture,planted,cultivation*.72);

        float tuftContrast = 1.-smoothstep(.13,1.1,length(fwidth(p*.30)));
        float tufts = gardenNoise(p*.30)*.7+gardenNoise(p*1.8)*.3;
        float bank = smoothstep(.10,.33,1.-abs(inverseTransformDirection(normalize(vNormal),viewMatrix).y));
        terrain = mix(terrain,vec3(.21,.206,.132),bank*.48);
        diffuseColor.rgb *= terrain*(1.+(tufts-.5)*.30*tuftContrast);
        `,
      );
  });
}
