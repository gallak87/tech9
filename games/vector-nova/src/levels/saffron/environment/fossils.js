import { GRAZER_GROUND_SAMPLES } from './grazer-path.js';
import { assetURL } from '../../../assets/url.js';
import * as T from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import {
  applyFossilWeathering,
  applyGeologicalWeathering,
  applyCreatureWeathering,
} from './materials.js';
import {
  horizontalFrame,
  instanced,
  matrixAt,
  randomSequence,
  sectionRange,
  UP,
} from './geometry.js';

export const SAFFRON_KIT_URL = assetURL(
  'assets/levels/saffron/leviathan-kit.glb',
);

export function skullPlacement(track) {
  const start = track.sample(track.landmarks.skullStart).position.clone();
  const end = track.sample(track.landmarks.skullEnd).position.clone();
  const forward = end.clone().sub(start).normalize();
  const right = UP.clone().cross(forward).normalize();
  const up = forward.clone().cross(right).normalize();
  const quaternion = new T.Quaternion().setFromRotationMatrix(
    new T.Matrix4().makeBasis(right, up, forward),
  );
  const scale = new T.Vector3(1.1, 1, start.distanceTo(end) / 300);
  return {
    position: start,
    quaternion,
    scale,
    matrix: matrixAt(start, scale, quaternion),
  };
}

export function sandfallAnchors(track) {
  return [
    [track.landmarks.sandfall - 40, -70, 58],
    [track.landmarks.sandfall + 80, -70, 66],
    [track.landmarks.skullStart + 60, 85, 58],
    [track.landmarks.skullEnd - 80, -85, 62],
  ];
}

function buildPlacements(track, survey) {
  const random = randomSequence(0x5aff32);
  const placements = {
    skull: [skullPlacement(track).matrix],
    rib: [],
    rib_1: [],
    rib_2: [],
    outcrop: [],
    outcrop_1: [],
    vertebra: [],
    vertebra_1: [],
    vertebra_2: [],
    dune: [],
    dune_1: [],
    sandfall: [],
  };
  const [ribStart, ribEnd] = sectionRange(track, /ribshadow/i, [0.1, 0.22]);
  for (let i = 0; i < 5; i++) {
    const s = T.MathUtils.lerp(ribStart + 20, ribEnd - 20, i / 4);
    const frame = horizontalFrame(track, s);
    const scale = new T.Vector3(
      0.72 + i * 0.061,
      0.7 + (i % 3) * 0.12,
      0.8 + (i % 2) * 0.57,
    );
    const rotation = frame.quaternion
      .clone()
      .multiply(new T.Quaternion().setFromAxisAngle(UP, (i - 2) * 0.026));
    placements[['rib', 'rib_1', 'rib_2'][i % 3]].push(
      matrixAt(
        frame.position.clone().addScaledVector(UP, -17),
        scale,
        rotation,
      ),
    );
  }
  for (const jump of track.jumps.filter((entry) => !entry.optional)) {
    for (const s of [
      jump.takeoff - 27,
      jump.landingStart + 40,
      jump.landingEnd - 26,
    ]) {
      const frame = track.sample(s);
      const position = frame.position.clone().addScaledVector(frame.up, -8.5);
      const scale = new T.Vector3(
        1 + random() * 0.15,
        0.86 + random() * 0.17,
        0.76 + random() * 0.16,
      );
      const variant = ['vertebra', 'vertebra_1', 'vertebra_2'][
        Math.floor(s) % 3
      ];
      placements[variant].push(matrixAt(position, scale, frame.quaternion));
    }
  }
  // Half-buried lateral vertebrae carry the fossil into the panorama, with
  // irregular spacing and fracture angles instead of a road-sized tube tunnel.
  for (
    let s = track.landmarks.vistaStart - 70;
    s < track.landmarks.vistaEnd - 60;
    s += 130 + random() * 50
  ) {
    const frame = horizontalFrame(track, s);
    for (const side of [-1, 1]) {
      const position = frame.position
        .clone()
        .addScaledVector(frame.right, side * (175 + random() * 90));
      if (side < 0 && s > track.landmarks.vistaStart + 230) continue;
      if (!survey.clears(position, 98)) continue;
      position.y = survey.heightAt(position.x, position.z) - 35;
      const rotation = frame.quaternion
        .clone()
        .multiply(
          new T.Quaternion().setFromEuler(
            new T.Euler(0.02, (random() - 0.5) * 0.13, side * 0.12),
          ),
        );
      placements.vertebra.push(
        matrixAt(
          position,
          new T.Vector3(1.05, 1.1 + random() * 0.24, 0.9),
          rotation,
        ),
      );
      if (side < 0)
        placements.rib.push(
          matrixAt(position, new T.Vector3(1.6, 1.8, 1.9), rotation),
        );
    }
  }
  const [returnStart] = sectionRange(track, /return/i, [0.88, 1]);
  for (let i = 0; i < 4; i++) {
    const frame = horizontalFrame(track, returnStart + 45 + i * 65);
    const position = frame.position
      .clone()
      .addScaledVector(frame.right, (i % 2 ? -1 : 1) * 120);
    if (!survey.clears(position, 76)) continue;
    position.y = survey.heightAt(position.x, position.z) - 72;
    placements.rib.push(
      matrixAt(position, new T.Vector3(0.73, 0.86, 1.3), frame.quaternion),
    );
  }
  for (let s = 60; s < track.length; s += 190) {
    const frame = horizontalFrame(track, s);
    for (const side of [-1, 1]) {
      if (
        side < 0 &&
        s > track.landmarks.vistaStart - 180 &&
        s < track.landmarks.vistaEnd + 160
      )
        continue;
      const scale = 0.55 + random() * 0.8;
      const position = frame.position
        .clone()
        .addScaledVector(
          frame.right,
          side * (190 + scale * 95 + random() * 130),
        );
      if (!survey.clears(position, scale * 185)) continue;
      position.y = survey.heightAt(position.x, position.z) - 14;
      const rotation = new T.Quaternion().setFromAxisAngle(
        UP,
        -0.65 + (random() - 0.5) * 0.55,
      );
      placements[random() > 0.5 ? 'dune' : 'dune_1'].push(
        matrixAt(
          position,
          new T.Vector3(scale, scale * (0.8 + random() * 0.6), scale),
          rotation,
        ),
      );
    }
  }
  for (let s = 10; s < track.length; s += 175) {
    const frame = horizontalFrame(track, s);
    for (const side of [-1, 1]) {
      const scale = 0.6 + random() * 0.75;
      const position = frame.position
        .clone()
        .addScaledVector(frame.right, side * (220 + random() * 175));
      if (!survey.clears(position, scale * 92)) continue;
      const inVista =
        s > track.landmarks.vistaStart - 130 &&
        s < track.landmarks.vistaEnd + 100;
      if (inVista && side < 0) continue;
      position.y = survey.heightAt(position.x, position.z) - 10;
      placements[random() > 0.46 ? 'outcrop' : 'outcrop_1'].push(
        matrixAt(
          position,
          new T.Vector3(
            scale * (1 + random() * 0.5),
            scale * (0.6 + random() * 0.8),
            scale,
          ),
          new T.Quaternion().setFromAxisAngle(UP, random() * 6.28),
        ),
      );
    }
  }
  for (const [s, lateral, height] of sandfallAnchors(track)) {
    const frame = horizontalFrame(track, s);
    const position = frame.position
      .clone()
      .addScaledVector(frame.right, lateral)
      .addScaledVector(UP, height);
    const drop = position.y - survey.heightAt(position.x, position.z) + 4;
    placements.sandfall.push(
      matrixAt(
        position,
        new T.Vector3(0.8, Math.max(0.8, drop / 80), 0.8),
        frame.quaternion,
      ),
    );
  }
  for (const [index, [s, lateral]] of sandfallAnchors(track).entries()) {
    const frame = horizontalFrame(track, s);
    const position = frame.position
      .clone()
      .addScaledVector(frame.right, lateral);
    position.y = survey.heightAt(position.x, position.z) - 4;
    placements.dune.push(
      matrixAt(
        position,
        new T.Vector3(0.18 + index * 0.012, 0.14 + index * 0.015, 0.18),
        frame.quaternion,
      ),
    );
    const spread = position
      .clone()
      .addScaledVector(frame.right, index % 2 ? -18 : 20)
      .addScaledVector(frame.forward, 12);
    spread.y = survey.heightAt(spread.x, spread.z) - 3;
    placements.dune_1.push(
      matrixAt(spread, new T.Vector3(0.15, 0.1, 0.18), frame.quaternion),
    );
  }
  return placements;
}

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
  const placements = buildPlacements(track, survey);
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
