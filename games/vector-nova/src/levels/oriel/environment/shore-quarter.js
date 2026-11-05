import * as T from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { assetURL } from '../../../assets/url.js';
import { createLifetime } from '../../../core/lifecycle.js';
import { finishHabitatMaterial } from './habitat.js';
import manifest from '../../../../assets/levels/oriel/blender/shore-quarter/manifest.json' with { type: 'json' };

export const ORIEL_SHORE_QUARTER_URL = assetURL(
  'assets/levels/oriel/oriel-shore-quarter.glb',
);

function finishQuarterWater(material) {
  const base = material.onBeforeCompile;
  const key = material.customProgramCacheKey();
  material.onBeforeCompile = (shader, renderer) => {
    base(shader, renderer);
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        float quarterWater = 0.;
        #ifdef USE_COLOR
          quarterWater = step(.5, vColor.r);
        #endif`,
      )
      .replace(
        '#include <roughnessmap_fragment>',
        `#include <roughnessmap_fragment>
        roughnessFactor = mix(.3, .15, quarterWater);`,
      )
      .replace(
        '#include <normal_fragment_maps>',
        `#include <normal_fragment_maps>
        float quarterAngle = atan(orielWorld.x, 1000.-orielWorld.y);
        vec2 quarterMetres = vec2(quarterAngle*1000., orielWorld.z);
        float quarterRippleX = sin(quarterMetres.x*.37+quarterMetres.y*.29)*.027
          + sin(quarterMetres.x*1.31-quarterMetres.y*.83)*.009;
        float quarterRippleZ = cos(quarterMetres.x*.23+quarterMetres.y*.41)*.025
          + cos(quarterMetres.y*1.19+quarterMetres.x*.73)*.008;
        vec3 quarterRippleWorld = vec3(cos(quarterAngle), sin(quarterAngle), 0.)*quarterRippleX
          + vec3(0., 0., quarterRippleZ);
        normal = normalize(normal + quarterWater*mat3(viewMatrix)*quarterRippleWorld);`,
      )
      .replace(
        '#include <lights_fragment_maps>',
        `#include <lights_fragment_maps>
        #if defined(USE_ENVMAP) && defined(RE_IndirectSpecular)
          radiance *= mix(1., 2., quarterWater);
        #endif`,
      );
  };
  material.customProgramCacheKey = () => key + ':oriel-quarter-water-finish-v1';
}

/** Reserve the one composed district in the road's own curved coordinate frame.
 * Generous vertical bounds cover shell seating and roof foliage while retaining
 * towns on the far side of the cylinder that share its projected coordinates.
 */
export function getShoreQuarterReservation(track) {
  const reservation = manifest.reservation;
  const frames = [];
  for (let s = reservation.start - 120; s <= reservation.end + 120; s += 8)
    frames.push({ s, ...track.sample(s) });
  return {
    id: 'oriel-waterside-shore-market-quarter',
    ...reservation,
    containsTrackPlacement(distance, lateral, padding = 0) {
      return (
        distance >= reservation.start - padding &&
        distance <= reservation.end + padding &&
        lateral >= reservation.minOffset - padding &&
        lateral <= reservation.maxOffset + padding
      );
    },
    contains(position, padding = 0) {
      for (const frame of frames) {
        if (
          frame.s < reservation.start - padding ||
          frame.s > reservation.end + padding
        )
          continue;
        const delta = new T.Vector3().subVectors(position, frame.position);
        if (Math.abs(delta.dot(frame.tangent)) > 5) continue;
        const height = delta.dot(frame.up);
        if (height < -200 - padding || height > 300 + padding) continue;
        const lateral = delta.dot(frame.right);
        if (
          lateral >= reservation.minOffset - padding &&
          lateral <= reservation.maxOffset + padding
        )
          return true;
      }
      return false;
    },
  };
}

/** The six-batch Blender export owns every loaded geometry and material. Maps
 * supplied by stoneMaps remain borrowed from the environment's existing owner.
 */
export async function createShoreQuarter({
  track,
  lifetime,
  stoneMaps,
  loadAsset = (url) => new GLTFLoader().loadAsync(url),
} = {}) {
  const resources = createLifetime();
  lifetime?.defer(() => resources.dispose());
  const group = new T.Group();
  group.name = 'Oriel / composed waterside market and garden';
  const geometries = new Set();
  const materials = new Set();
  resources.defer(() => group.clear());
  try {
    const { scene } = await loadAsset(ORIEL_SHORE_QUARTER_URL);
    scene.updateMatrixWorld(true);
    scene.traverse((mesh) => {
      if (!mesh.isMesh) return;
      geometries.add(mesh.geometry);
      for (const material of Array.isArray(mesh.material)
        ? mesh.material
        : [mesh.material])
        materials.add(material);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.userData.orielShoreQuarter = true;
    });
    for (const geometry of geometries) resources.own(geometry);
    for (const material of materials) resources.own(material);
    for (const material of materials) {
      finishHabitatMaterial(material, { bounce: 0.18 });
      if (/limestone|coping/.test(material.name)) stoneMaps?.apply(material);
      if (/glazing and channel/.test(material.name))
        finishQuarterWater(material);
    }
    scene.traverse((mesh) => {
      if (mesh.isMesh && /limestone|coping/.test(mesh.material.name))
        stoneMaps?.coordinates(mesh.geometry, track);
    });
    group.add(scene);
    const plantingAnchors = manifest.plantingAnchors.map((anchor) => {
      return {
        kind: anchor.kind,
        position: new T.Vector3(...anchor.position),
        quaternion: new T.Quaternion().setFromRotationMatrix(
          new T.Matrix4().makeBasis(
            new T.Vector3(...anchor.basisRight),
            new T.Vector3(...anchor.basisUp),
            new T.Vector3(...anchor.basisTangent),
          ),
        ),
        scale: new T.Vector3(anchor.scale, anchor.scale, anchor.scale),
      };
    });
    return {
      group,
      materials: [...materials],
      plantingAnchors,
      reservation: getShoreQuarterReservation(track),
      dispose: () => resources.dispose(),
    };
  } catch (error) {
    resources.dispose();
    throw error;
  }
}
