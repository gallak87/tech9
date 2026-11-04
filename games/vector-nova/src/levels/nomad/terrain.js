import * as T from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { assetURL } from '../../assets/url.js';
import { indexedTriangles } from '../../physics/collision-world.js';
import { createNomadCompanions } from './companions.js';
import { carrierMotionRules } from './motion.js';
import {
  NOMAD_GROUND_GROUP,
  sampleNomadGroundMotion,
} from './ground-motion.js';
import collisionKit from '../../../assets/levels/nomad/blender/salt-escarpments/salt-escarpments-collision.json' with { type: 'json' };
import manifest from '../../../assets/levels/nomad/blender/salt-escarpments/salt-escarpments-provenance.json' with { type: 'json' };

export const NOMAD_TERRAIN_GEOMETRY_VERSION = `nomad-salt-escarpments-v1:${manifest.hashes['salt-escarpments-collision.json']}`;
const UP = new T.Vector3(0, 1, 0),
  X = new T.Vector3(1, 0, 0);
const prototypes = new Map(
  manifest.prototypes.map((part) => [part.name, part]),
);
const ENCOUNTER_SPEED = 140;

/** Conservative all-phase X exclusion. Ground landmarks move only along Z/Y;
 * staying outside this corridor protects every presentation time, not just a
 * posed screenshot. Retained cranes/crowns and both larger companions count.
 */
export function nomadTerrainExclusion(track) {
  const bounds = new T.Box3();
  const sourceBody = new T.Box3(
    new T.Vector3(-180, 0, -400),
    new T.Vector3(180, 260, 400),
  );
  for (const carrier of [...track.carriers, ...createNomadCompanions(track)]) {
    const matrix = new T.Matrix4().compose(
      carrier.origin,
      carrier.quaternion,
      carrier.scale,
    );
    const body = sourceBody.clone().applyMatrix4(matrix);
    const motion = carrierMotionRules(carrier);
    body.expandByVector(
      new T.Vector3(
        2 * Math.abs(motion.lateralAmplitude),
        2 * track.saltPlane.grade * Math.abs(motion.longitudinalAmplitude),
        2 * Math.abs(motion.longitudinalAmplitude),
      ),
    );
    bounds.union(body);
  }
  const sample = (track.nominalSample ?? track.sample).bind(track);
  for (let distance = 0; distance <= track.length; distance += 24) {
    const frame = sample(distance),
      width = track.halfWidthAt?.(distance) ?? track.width / 2;
    // Include the full wide running skin plus a generous free-flight/camera
    // allowance, including the gap's nominal through-air continuation.
    bounds.expandByPoint(
      frame.position.clone().add(new T.Vector3(-width - 150, -150, -150)),
    );
    bounds.expandByPoint(
      frame.position.clone().add(new T.Vector3(width + 150, 150, 150)),
    );
  }
  return {
    bounds,
    left: Math.min(-800, bounds.min.x - 200),
    right: Math.max(1100, bounds.max.x + 200),
  };
}

function encounter(track, id, fraction) {
  const carrier = track.carriers.find((entry) => entry.id === id);
  const jump = track.jumps?.find((entry) => entry.receivingCarrierId === id);
  return jump?.landingStart ?? carrier?.start ?? track.length * fraction;
}

/** Original sparse basin composition, resolved against the current route.
 * Source forms retain their whole Y=0 contact plane under the live grade.
 */
export function createNomadTerrainPlacements({ track }) {
  const exclusion = nomadTerrainExclusion(track);
  const sample = (track.nominalSample ?? track.sample).bind(track);
  const pitch = new T.Quaternion().setFromAxisAngle(
    X,
    Math.atan(track.saltPlane.grade),
  );
  const specs = [
    {
      id: 'upper-salt-rim',
      prototype: 'nomad_salt_rim',
      side: -1,
      distance: encounter(track, 'nomad-high-balcony', 0.23),
      stretch: [1.1, 1, 1.05],
      ahead: 260,
    },
    {
      id: 'middle-salt-fan',
      prototype: 'nomad_salt_fan',
      side: 1,
      distance: encounter(track, 'nomad-passing-deck', 0.56),
      stretch: [1.2, 0.88, 1.15],
      ahead: 310,
    },
    {
      id: 'lower-broken-shelf',
      prototype: 'nomad_salt_broken_shelf',
      side: -1,
      distance: encounter(track, 'nomad-terminus', 0.9),
      stretch: [1.05, 1.04, 1.15],
      ahead: 150,
    },
  ];
  return specs.map((spec) => {
    const source = prototypes.get(spec.prototype);
    const scale = new T.Vector3(...spec.stretch);
    const quaternion = pitch
      .clone()
      .multiply(
        new T.Quaternion().setFromAxisAngle(UP, spec.side > 0 ? Math.PI : 0),
      );
    const localBox = new T.Box3(
      new T.Vector3(...source.bounds.min),
      new T.Vector3(...source.bounds.max),
    );
    const relative = localBox
      .clone()
      .applyMatrix4(
        new T.Matrix4().compose(new T.Vector3(), quaternion, scale),
      );
    const time = Math.max(0, spec.distance / ENCOUNTER_SPEED);
    const lead = sampleNomadGroundMotion(track, time).translation;
    const z = sample(spec.distance).position.z + spec.ahead - lead.z;
    const x =
      spec.side < 0
        ? exclusion.left - relative.max.x
        : exclusion.right - relative.min.x;
    const position = new T.Vector3(
      x,
      track.saltPlane.height - track.saltPlane.grade * z,
      z,
    );
    const matrix = new T.Matrix4().compose(position, quaternion, scale);
    return {
      ...spec,
      position,
      quaternion,
      scale,
      matrix,
      encounterTime: time,
      bounds: localBox.applyMatrix4(matrix),
      exclusion,
    };
  });
}

/** Exact nominal world faces, moved by the same physical ground group as art. */
export function createNomadTerrainTriangles({ track }) {
  const triangles = [];
  for (const placement of createNomadTerrainPlacements({ track })) {
    const source = collisionKit.prototypes.find(
      (part) => part.name === placement.prototype,
    );
    triangles.push(
      ...indexedTriangles(
        source.positions,
        source.indices,
        {
          id: `nomad-terrain/${placement.id}`,
          kind: 'terrain',
          motionGroup: NOMAD_GROUND_GROUP,
        },
        placement.matrix,
      ),
    );
  }
  return triangles;
}

/** Static relative to the ground, translating through the convoy frame.
 * One owned GLB supplies all three forms; placed roots borrow its geometry and
 * materials. High/Low and shape mode retain the same physical large forms.
 */
export function createNomadTerrain({
  track,
  shape = false,
  loadAsset = (url) => new GLTFLoader().loadAsync(url),
}) {
  const group = new T.Group();
  group.name = 'Nomad / white salt escarpments';
  group.userData.motionGroup = NOMAD_GROUND_GROUP;
  group.userData.nomadTerrain = {
    geometryVersion: NOMAD_TERRAIN_GEOMETRY_VERSION,
    shape,
  };
  const placements = createNomadTerrainPlacements({ track });
  const geometries = new Set(),
    materials = new Set(),
    textures = new Set();
  let disposed = false;
  const release = () => {
    for (const geometry of geometries) geometry.dispose();
    for (const material of materials) material.dispose();
    for (const texture of textures) texture.dispose();
    geometries.clear();
    materials.clear();
    textures.clear();
  };
  const collect = (source) =>
    source.traverse((mesh) => {
      if (mesh.geometry) geometries.add(mesh.geometry);
      for (const material of Array.isArray(mesh.material)
        ? mesh.material
        : [mesh.material]) {
        if (!material) continue;
        materials.add(material);
        for (const value of Object.values(material))
          if (value?.isTexture) textures.add(value);
      }
    });
  const ready = Promise.resolve()
    .then(() => loadAsset(assetURL('assets/levels/nomad/salt-escarpments.glb')))
    .then(({ scene }) => {
      collect(scene);
      if (disposed) {
        release();
        return;
      }
      for (const placement of placements) {
        const source = scene.getObjectByName(placement.prototype);
        if (!source)
          throw new Error(
            `Nomad salt terrain prototype is missing: ${placement.prototype}`,
          );
        const root = source.clone(true);
        root.name = `Nomad / ${placement.id}`;
        root.position.copy(placement.position);
        root.quaternion.copy(placement.quaternion);
        root.scale.copy(placement.scale);
        root.userData.motionGroup = NOMAD_GROUND_GROUP;
        root.traverse((mesh) => {
          if (mesh.isMesh) {
            mesh.castShadow = true;
            mesh.receiveShadow = true;
          }
        });
        group.add(root);
      }
    })
    .catch((cause) => {
      group.clear();
      release();
      throw new Error(
        'The Nomad salt escarpments could not load. Reload to try again.',
        { cause },
      );
    });
  const update = () => {
    if (!disposed)
      group.position.copy(
        sampleNomadGroundMotion(track, track.presentationTime ?? 0).translation,
      );
  };
  update();
  return {
    group,
    placements,
    geometryVersion: NOMAD_TERRAIN_GEOMETRY_VERSION,
    ready,
    update,
    dispose() {
      if (disposed) return;
      disposed = true;
      group.removeFromParent();
      group.clear();
      release();
    },
  };
}
