import * as T from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { applyFossilWeathering } from './materials.js';
import {
  horizontalFrame,
  instanced,
  matrixAt,
  randomSequence,
  sectionRange,
  UP,
} from './geometry.js';

export const SAFFRON_KIT_URL = '/assets/levels/saffron/leviathan-kit.glb';

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

function buildPlacements(track, survey) {
  const random = randomSequence(0x5aff32);
  const placements = {
    skull: [skullPlacement(track).matrix],
    rib: [],
    vertebra: [],
    dune: [],
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
    placements.rib.push(
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
      placements.vertebra.push(matrixAt(position, scale, frame.quaternion));
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
  for (let s = 60; s < track.length; s += 135) {
    const frame = horizontalFrame(track, s);
    for (const side of [-1, 1]) {
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
      placements.dune.push(
        matrixAt(
          position,
          new T.Vector3(scale, scale * (0.8 + random() * 0.6), scale),
          rotation,
        ),
      );
    }
  }
  for (const [s, side, height] of [
    [track.landmarks.sandfall - 40, -1, 60],
    [track.landmarks.sandfall + 80, -1, 73],
    [track.landmarks.skullStart + 60, 1, 72],
    [track.landmarks.skullEnd - 80, -1, 76],
  ]) {
    const frame = horizontalFrame(track, s);
    const position = frame.position
      .clone()
      .addScaledVector(frame.right, side * 58)
      .addScaledVector(UP, height);
    placements.sandfall.push(
      matrixAt(position, new T.Vector3(0.58, 0.96, 0.45), frame.quaternion),
    );
  }
  return placements;
}

/** The GLB owns material/geometry families; all repetitions share those buffers. */
export function createFossils(
  track,
  survey,
  resources,
  { loadAsset, shape = false } = {},
) {
  const group = new T.Group();
  group.name = 'Saffron / authored fossil anatomy and displaced dune families';
  const burrower = new T.Group();
  burrower.name = 'Saffron / one living armored burrower';
  group.add(burrower);
  const placements = buildPlacements(track, survey);
  const poseUniforms = { time: { value: 0 }, strength: { value: 0 } };
  burrower.userData.setPose = (time, strength) => {
    poseUniforms.time.value = time;
    poseUniforms.strength.value = strength;
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
      placements.vertebra.slice(0, 6),
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
      'vertebra',
      'dune',
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
        const materials = [object.material].flat();
        for (const material of materials) {
          if (!materialSet.has(material)) {
            materialSet.add(material);
            if (['skull', 'rib', 'vertebra'].includes(name))
              applyFossilWeathering(material);
            if (name === 'burrower') {
              material.onBeforeCompile = (shader) => {
                shader.uniforms.saffronBurrowerTime = poseUniforms.time;
                shader.uniforms.saffronBurrowerStrength = poseUniforms.strength;
                shader.vertexShader =
                  `uniform float saffronBurrowerTime; uniform float saffronBurrowerStrength;\n${shader.vertexShader}`.replace(
                    '#include <begin_vertex>',
                    `#include <begin_vertex>\nfloat flex = clamp((position.z + 40.) / 250., 0., 1.); transformed.x += sin(flex*5.-saffronBurrowerTime*.8)*flex*12.*saffronBurrowerStrength; transformed.y += sin(flex*3.8+saffronBurrowerTime*.35)*flex*8.*saffronBurrowerStrength;`,
                  );
              };
              material.customProgramCacheKey = () => 'saffron-burrower-flex-v1';
            }
            material.side = T.DoubleSide;
          }
        }
        if (name === 'burrower') {
          const mesh = new T.Mesh(geometry, object.material);
          mesh.name = `Saffron / living ${object.name}`;
          mesh.receiveShadow = true;
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
            mesh.castShadow = ['skull', 'rib', 'vertebra'].includes(name);
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
