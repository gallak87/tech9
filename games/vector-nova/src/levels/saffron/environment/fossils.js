import { buildFossilPlacements } from './placements.js';
export { skullPlacement, sandfallAnchors } from './placements.js';
import { GRAZER_GROUND_SAMPLES } from './grazer-path.js';
import { assetURL } from '../../../assets/url.js';
import * as T from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import {
  applyFossilWeathering,
  applyGeologicalWeathering,
  applyCreatureWeathering,
} from './materials.js';
import { instanced } from './geometry.js';

export const SAFFRON_KIT_URL = assetURL(
  'assets/levels/saffron/leviathan-kit.glb',
);

/** The GLB owns material/geometry families; all repetitions share those buffers. */
export function createFossils(
  track,
  survey,
  resources,
  { loadAsset, shape = false, weatheringTexture } = {},
) {
  const group = new T.Group();
  group.name = 'Saffron / authored fossil anatomy and displaced dune families';
  const burrower = new T.Group();
  burrower.name = 'Saffron / one living armored burrower';
  group.add(burrower);
  const placements = buildFossilPlacements(track, survey);
  const poseUniforms = {
    time: { value: 0 },
    age: { value: -1 },
    travel: { value: 0 },
    ground: { value: Array(GRAZER_GROUND_SAMPLES).fill(0) },
    minimum: { value: -600 },
    span: { value: 1800 },
    speed: { value: 38 },
    headGround: { value: 0 },
    exposure: { value: 0 },
    motion: { value: 1 },
  };
  burrower.userData.setPose = (time, pose) => {
    poseUniforms.time.value = time;
    poseUniforms.age.value = pose.age;
    poseUniforms.travel.value = pose.travel;
    poseUniforms.ground.value = pose.path.ground;
    poseUniforms.minimum.value = pose.path.minimum;
    poseUniforms.span.value = pose.path.span;
    poseUniforms.speed.value = pose.path.length / 20;
    poseUniforms.headGround.value = pose.groundHeight;
    poseUniforms.exposure.value = pose.exposure;
    poseUniforms.motion.value = pose.motion;
  };
  if (shape) {
    const material = resources.material(
      new T.MeshStandardMaterial({
        name: 'Saffron / neutral fossil clearance massing',
        color: '#b4afa2',
        roughness: 0.9,
      }),
    );
    const points = Array.from({ length: 25 }, (_, i) => {
      const angle = (Math.PI * i) / 24;
      return new T.Vector3(
        -Math.cos(angle) * 65,
        -12 + Math.sin(angle) * 98,
        0,
      );
    });
    const geometry = resources.geometry(
      new T.TubeGeometry(new T.CatmullRomCurve3(points), 30, 3.5, 6, false),
    );
    const portals = [0, 145, 295].map((z) =>
      placements.skull[0]
        .clone()
        .multiply(new T.Matrix4().makeTranslation(0, 0, z)),
    );
    instanced(
      group,
      'Saffron / neutral skull mouth and occipital clearance',
      geometry,
      material,
      portals,
    );
    instanced(
      group,
      'Saffron / neutral receiving vertebra apertures',
      geometry,
      material,
      [
        ...placements.vertebra,
        ...placements.vertebra_1,
        ...placements.vertebra_2,
      ].slice(0, 6),
    );
  }
  let disposed = false;
  let loaded = false;
  let error = null;
  const materialSet = new Set();
  function accept(gltf) {
    resources.collect(gltf.scene);
    if (disposed) return false;
    gltf.scene.updateMatrixWorld(true);
    for (const name of [
      'skull',
      'rib',
      'rib_1',
      'rib_2',
      'outcrop',
      'outcrop_1',
      'vertebra',
      'vertebra_1',
      'vertebra_2',
      'dune',
      'dune_1',
      'sandfall',
      'burrower',
    ]) {
      const source = gltf.scene.getObjectByName(name);
      if (!source) throw new Error(`Saffron kit is missing the ${name} module`);
      const inverseRoot = source.matrixWorld.clone().invert();
      source.traverse((object) => {
        if (!object.isMesh) return;
        const geometry = resources.geometry(
          object.geometry
            .clone()
            .applyMatrix4(inverseRoot.clone().multiply(object.matrixWorld)),
        );
        if (
          name === 'sandfall' &&
          object.material.name === 'Saffron_mineral_bands'
        )
          object.material = resources.material(object.material.clone());
        const materials = [object.material].flat();
        for (const material of materials) {
          if (!materialSet.has(material)) {
            materialSet.add(material);
            if (
              [
                'skull',
                'rib',
                'rib_1',
                'rib_2',
                'vertebra',
                'vertebra_1',
                'vertebra_2',
              ].includes(name)
            )
              applyFossilWeathering(material, weatheringTexture);
            if (['dune', 'dune_1', 'outcrop', 'outcrop_1'].includes(name))
              applyGeologicalWeathering(material, weatheringTexture);
            if (
              name === 'sandfall' &&
              material.name === 'Saffron_mineral_bands'
            ) {
              material.transparent = true;
              material.opacity = 0.28;
              material.depthWrite = false;
              material.roughness = 1;
              material.color.set('#aa8b56');
              material.forceSinglePass = true;
              material.onBeforeCompile = (shader) => {
                shader.uniforms.saffronFlowTime = poseUniforms.time;
                shader.vertexShader =
                  `uniform float saffronFlowTime; varying vec3 vFall;\n${shader.vertexShader}`.replace(
                    '#include <begin_vertex>',
                    '#include <begin_vertex>\nvFall=position;transformed.z+=sin(position.y*.16+saffronFlowTime*.7)*.35;',
                  );
                shader.fragmentShader =
                  `varying vec3 vFall; uniform float saffronFlowTime; float fHash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}float fNoise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(fHash(i),fHash(i+vec2(1,0)),f.x),mix(fHash(i+vec2(0,1)),fHash(i+vec2(1,1)),f.x),f.y);}\n${shader.fragmentShader}`.replace(
                    '#include <color_fragment>',
                    '#include <color_fragment>\nfloat edge=abs(vFall.x)/(10.+17.*clamp(-vFall.y/80.,0.,1.));diffuseColor.a*=1.-smoothstep(.28,.5,edge);float flow=fNoise(vec2(vFall.x*.27,vFall.y*.13+saffronFlowTime*.8));diffuseColor.a*=smoothstep(.08,.76,flow);diffuseColor.rgb*=.8+flow*.2;',
                  );
              };
              material.customProgramCacheKey = () =>
                'saffron-irregular-sand-volume-v5';
            }
            if (name === 'burrower') {
              applyCreatureWeathering(material, weatheringTexture);
              const finish = material.onBeforeCompile;
              material.onBeforeCompile = (shader) => {
                finish(shader);
                for (const [key, uniform] of Object.entries(poseUniforms))
                  shader.uniforms[`grazer_${key}`] = uniform;
                const declarations = `
                  uniform float grazer_age, grazer_travel, grazer_minimum, grazer_span;
                  uniform float grazer_headGround, grazer_exposure, grazer_motion, grazer_speed;
                  uniform float grazer_ground[${GRAZER_GROUND_SAMPLES}];
                  float grazerHeight(float distance) {
                    float t=clamp((distance-grazer_minimum)/grazer_span,0.,1.)*${GRAZER_GROUND_SAMPLES - 1}.;
                    int i=min(${GRAZER_GROUND_SAMPLES - 2},int(floor(t)));
                    return mix(grazer_ground[i],grazer_ground[i+1],t-float(i));
                  }
                  float grazerLift(float z) {
                    float age=grazer_age-max(0.,-z)/grazer_speed;
                    return 60.*(smoothstep(2.,4.,age)*(1.-smoothstep(10.,14.,age))-grazer_exposure)
                      -64.*smoothstep(80.,300.,max(0.,-z));
                  }
                  float grazerY(float z) { return grazerHeight(grazer_travel+z)-grazer_headGround+grazerLift(z); }
                  float grazerX(float z) { float lag=max(0.,-z);return sin(lag*.007-grazer_age*.22)*smoothstep(50.,360.,lag)*3.*grazer_motion; }
                `;
                shader.vertexShader = `${declarations}\n${shader.vertexShader}`
                  .replace(
                    '#include <beginnormal_vertex>',
                    `#include <beginnormal_vertex>
                    // Inverse transpose of the continuous longitudinal deformation.
                    objectNormal.z -= objectNormal.y*(grazerY(position.z+1.)-grazerY(position.z-1.))*.5
                      +objectNormal.x*(grazerX(position.z+1.)-grazerX(position.z-1.))*.5;`,
                  )
                  .replace(
                    '#include <begin_vertex>',
                    `#include <begin_vertex>
                    transformed.y += grazerY(position.z);
                    transformed.x += grazerX(position.z);`,
                  );
              };
              material.customProgramCacheKey = () =>
                'saffron-baked-grazer-forward-breach-v4';
            }
            material.side = T.DoubleSide;
          }
        }
        if (name === 'burrower') {
          const mesh = new T.Mesh(geometry, object.material);
          mesh.name = `Saffron / living ${object.name}`;
          mesh.receiveShadow = true;
          mesh.frustumCulled = false;
          burrower.add(mesh);
        } else {
          const mesh = instanced(
            group,
            `Saffron / authored ${object.name}`,
            geometry,
            object.material,
            placements[name],
          );
          if (mesh)
            mesh.castShadow = [
              'skull',
              'rib',
              'rib_1',
              'rib_2',
              'vertebra',
              'vertebra_1',
              'vertebra_2',
            ].includes(name);
        }
      });
    }
    loaded = true;
    return true;
  }
  const canLoad =
    !shape &&
    (loadAsset ||
      (typeof document !== 'undefined' && typeof location !== 'undefined'));
  const ready = canLoad
    ? Promise.resolve()
        .then(() =>
          (loadAsset ?? ((url) => new GLTFLoader().loadAsync(url)))(
            SAFFRON_KIT_URL,
          ),
        )
        .then(accept)
        .catch((reason) => {
          error = reason instanceof Error ? reason.message : String(reason);
          if (!disposed) throw reason;
          return false;
        })
    : Promise.resolve(false);
  return {
    group,
    burrower,
    ready,
    placements,
    getPresentation: () => ({
      loaded,
      error,
      shape,
      skull: {
        start: track.landmarks.skullStart,
        end: track.landmarks.skullEnd,
        length: 300,
      },
      counts: Object.fromEntries(
        Object.entries(placements).map(([key, entries]) => [
          key,
          entries.length,
        ]),
      ),
    }),
    dispose() {
      disposed = true;
      loaded = false;
      group.clear();
    },
  };
}
