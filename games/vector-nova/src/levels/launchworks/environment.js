import * as T from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { assetURL } from '../../assets/url.js';
import { finishZephyrMaterial } from '../zephyr/environment/materials.js';
import { finishZephyrLighting } from '../zephyr/environment/lighting.js';
import { createZephyrWater } from '../zephyr/environment/water.js';
import { populateSkywellLandscape } from './landscape.js';
import { batchSkywellScenery } from './scenery-batches.js';
import { createSkywellGardens } from './gardens.js';
import { populateSkywellDistricts } from './districts.js';
import { createSkywellWaterways } from './waterways.js';
import { createSkywellSceneryLods } from './scenery-lod.js';

const FILES = [
  'cathedral-facade',
  'nave-bay',
  'chapel',
  'falling-tower',
  'cloudspire-needle',
  'broken-halo',
  'island-grand',
  'island-terrace',
  'island-shard',
  'abbey-quarter',
  'aqueduct-source',
  'waterfall',
  'waterfall-curtain',
];
const UP = new T.Vector3(0, 1, 0);

// Canonical Zephyr stone, cultivated islands, hydrology and sky become a new
// transfer district. Its islands support the decks; its flight corridors stay
// open and every receiver has a silhouette above the lower cloud shelf.
export async function createLaunchworksEnvironment({
  track,
  view,
  shape = false,
  loadAsset = (url) => new GLTFLoader().loadAsync(url),
  loadTexture = (url) => new T.TextureLoader().loadAsync(url),
}) {
  const group = new T.Group();
  group.name = 'Zephyr Skywell / suspended water gardens';
  if (shape)
    return {
      group,
      dispose() {
        group.clear();
      },
    };
  const loaded = await Promise.allSettled([
    ...FILES.map((name) =>
      loadAsset(assetURL(`assets/levels/zephyr/${name}.glb`)),
    ),
    loadTexture(assetURL('assets/levels/zephyr/zephyr-limestone-v1.png')),
  ]);
  const borrowed = new Set(),
    owners = new T.Group();
  for (const result of loaded)
    if (result.status === 'fulfilled' && result.value.scene)
      owners.add(result.value.scene);
  function release() {
    const geometry = new Set(),
      materials = new Set(),
      textures = new Set();
    for (const root of [owners, group])
      root.traverse((object) => {
        if (object.isInstancedMesh) object.dispose();
        if (object.geometry) geometry.add(object.geometry);
        for (const material of [object.material].flat().filter(Boolean)) {
          if (material.userData.skywellWater) continue;
          materials.add(material);
          for (const value of Object.values(material))
            if (value?.isTexture && !borrowed.has(value)) textures.add(value);
        }
      });
    geometry.forEach((value) => value.dispose());
    materials.forEach((value) => value.dispose());
    textures.forEach((value) => value.dispose());
    owners.clear();
    group.clear();
  }
  if (loaded.some((result) => result.status === 'rejected')) {
    release();
    for (const result of loaded)
      if (result.status === 'fulfilled' && result.value.isTexture)
        result.value.dispose();
    throw loaded.find((result) => result.status === 'rejected').reason;
  }
  const library = Object.fromEntries(
      FILES.map((name, index) => [name, loaded[index].value.scene]),
    ),
    stoneTexture = loaded.at(-1).value;
  stoneTexture.colorSpace = T.SRGBColorSpace;
  stoneTexture.wrapS = stoneTexture.wrapT = T.RepeatWrapping;
  stoneTexture.anisotropy = 8;
  const water = createZephyrWater(track, stoneTexture);
  library['waterfall-curtain'].traverse((object) => {
    object.userData.skywellCrossing = true;
  });
  const replaced = new Set();
  owners.traverse((object) => {
    if (!object.isMesh) return;
    object.castShadow = true;
    object.receiveShadow = true;
    for (const material of [object.material].flat().filter(Boolean)) {
      if (/water|foam|silver/i.test(material.name)) {
        replaced.add(material);
        water.finishMesh(object, object.userData.skywellCrossing === true);
        object.material.userData.skywellWater = true;
      } else if (
        /stone|limestone|bronze|masonry|strata|underside|terrace|plaster/i.test(
          material.name,
        )
      )
        finishZephyrMaterial(material, { stoneTexture });
    }
  });
  replaced.forEach((material) => material.dispose());
  group.add(water.group);
  const placements = [];
  function place(
    name,
    distance,
    { lateral = 0, height = 0, scale = 1, yaw = 0, position = null } = {},
  ) {
    const object = library[name].clone(true),
      f = track.sample(distance),
      horizontalRight = new T.Vector3(f.tangent.z, 0, -f.tangent.x).normalize();
    object.position.copy(
      position ??
        f.position
          .clone()
          .addScaledVector(horizontalRight, lateral)
          .addScaledVector(UP, height),
    );
    object.rotation.y = Math.atan2(f.tangent.x, f.tangent.z) + yaw;
    if (Array.isArray(scale)) object.scale.set(...scale);
    else object.scale.setScalar(scale);
    object.name = `Skywell / ${name} / ${Math.round(distance)}`;
    group.add(object);
    placements.push(object);
    return object;
  }
  const terraces = populateSkywellLandscape({ track, place });
  const architecture = populateSkywellDistricts({ track, place });
  const waterways = createSkywellWaterways({
    track,
    stoneTexture,
    place,
    water,
  });
  group.add(waterways.group);
  const blockers = architecture.filter(
    (object) => !object.name.includes('foundation'),
  );
  blockers.push(waterways.group);
  for (const terrace of terraces) terrace.blockers = blockers;
  const veil = track.jumps[2],
    departure = track.sample(veil.takeoff),
    veilOffset = track.curtains[0].s - veil.takeoff,
    curtainPosition = departure.position
      .clone()
      .addScaledVector(departure.tangent, veilOffset)
      .addScaledVector(UP, 125);
  place('waterfall-curtain', veil.takeoff + veilOffset, {
    position: curtainPosition,
    scale: [0.85, 1, 1],
  });
  place('aqueduct-source', veil.takeoff + veilOffset, {
    position: curtainPosition
      .clone()
      .addScaledVector(UP, 30)
      .addScaledVector(departure.right, 95),
    scale: 0.8,
    yaw: Math.PI / 2,
  });
  // Root the veil's existing cantilevered source into an outboard mineral
  // shoulder. The header stays above the flight corridor and the fall stays
  // at its approved crossing; only its surrounding support is new.
  const veilRight = new T.Vector3(
    departure.tangent.z,
    0,
    -departure.tangent.x,
  ).normalize();
  place('island-shard', veil.takeoff + veilOffset, {
    position: curtainPosition
      .clone()
      .addScaledVector(veilRight, 310)
      .addScaledVector(UP, -155),
    scale: [1.6, 1.3, 2],
  });
  const sourceStone = new T.MeshStandardMaterial({
    name: 'Skywell veil source dressed limestone',
    color: '#99988c',
    roughness: 0.84,
  });
  finishZephyrMaterial(sourceStone, { stoneTexture });
  const sourceUnit = new T.BoxGeometry();
  const sourcePier = new T.Mesh(sourceUnit, sourceStone);
  sourcePier.position
    .copy(curtainPosition)
    .addScaledVector(veilRight, 310)
    .addScaledVector(UP, -64);
  sourcePier.scale.set(24, 218, 24);
  sourcePier.name = 'Skywell / veil source rooted pier';
  const sourceHeader = new T.Mesh(sourceUnit, sourceStone);
  sourceHeader.position
    .copy(curtainPosition)
    .addScaledVector(veilRight, 202.5)
    .addScaledVector(UP, 43);
  sourceHeader.quaternion.setFromUnitVectors(new T.Vector3(1, 0, 0), veilRight);
  sourceHeader.scale.set(239, 14, 24);
  sourceHeader.name = 'Skywell / veil source cantilever header';
  group.add(sourcePier, sourceHeader);
  // Visible deep bronze saddles tie the weaving raceway into the mineral
  // islands without placing posts or collision volumes in a landing envelope.
  const bronze = new T.MeshStandardMaterial({
    name: 'Skywell / weathered bronze suspension saddles',
    color: '#856342',
    roughness: 0.62,
    metalness: 0.65,
  });
  finishZephyrMaterial(bronze);
  const box = new T.BoxGeometry(1, 1, 1),
    beams = new T.InstancedMesh(box, bronze, 180),
    matrix = new T.Matrix4(),
    rotation = new T.Quaternion();
  let count = 0;
  for (let distance = 80; distance < track.finishDistance; distance += 155) {
    if (track.isGap(distance) || track.tubeAt(distance)) continue;
    const f = track.sample(distance);
    const p = f.position.clone().addScaledVector(f.up, -8);
    matrix.compose(p, f.quaternion, new T.Vector3(92, 7, 11));
    beams.setMatrixAt(count++, matrix);
    for (const side of [-1, 1]) {
      const a = p.clone().addScaledVector(f.right, side * 43),
        b = a
          .clone()
          .addScaledVector(UP, -55)
          .addScaledVector(f.right, side * 14),
        direction = b.clone().sub(a);
      rotation.setFromUnitVectors(UP, direction.clone().normalize());
      matrix.compose(
        a.add(b).multiplyScalar(0.5),
        rotation,
        new T.Vector3(5, direction.length(), 8),
      );
      beams.setMatrixAt(count++, matrix);
    }
  }
  beams.count = count;
  beams.instanceMatrix.needsUpdate = true;
  beams.name = 'Skywell / connected bronze terrace saddles';
  group.add(beams);
  let gardens;
  try {
    gardens = await createSkywellGardens({ terraces, loadTexture });
  } catch (error) {
    group.remove(waterways.group, water.group);
    waterways.dispose();
    water.dispose();
    release();
    throw error;
  }
  const geometries = new Set();
  for (const object of placements)
    object.traverse((mesh) => {
      if (mesh.isMesh && mesh.visible) geometries.add(mesh.geometry);
    });
  const lods = await createSkywellSceneryLods(geometries);
  const batches = batchSkywellScenery(placements, { farGeometries: lods.far });
  for (const object of placements) object.removeFromParent();
  group.add(batches.group, gardens.group);
  batches.update(view?.camera);
  gardens.update?.(view?.camera);
  finishZephyrLighting(group);
  let disposed = false;
  return {
    group,
    update(frame) {
      water.update(frame);
      batches.update(frame.camera);
      gardens.update?.(frame.camera);
    },
    setReflection(texture) {
      borrowed.add(texture);
      water.setReflection(texture);
      const materials = new Set();
      for (const root of [owners, group])
        root.traverse((object) => {
          for (const material of [object.material].flat().filter(Boolean))
            materials.add(material);
        });
      for (const material of materials) {
        material.envMap = texture;
        material.needsUpdate = true;
      }
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      gardens.group.removeFromParent();
      gardens.dispose();
      waterways.group.removeFromParent();
      waterways.dispose();
      water.group.removeFromParent();
      water.dispose();
      batches.dispose();
      lods.dispose();
      release();
    },
  };
}
