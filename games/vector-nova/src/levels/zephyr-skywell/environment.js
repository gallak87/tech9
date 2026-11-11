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
import { createSkywellArrivalArt } from './arrival-art.js';
import { populateSkywellPrecincts } from './precincts.js';
import { finishSkywellGarden } from './garden-finish.js';
import { createSkywellTerraceArt } from './terrace-art.js';
import { seatSkywellStrata } from './strata.js';

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
export async function createSkywellEnvironment({
  track,
  view,
  road,
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
  let stoneTexture;
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
    if (stoneTexture) textures.add(stoneTexture);
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
  );
  stoneTexture = loaded.at(-1).value;
  stoneTexture.colorSpace = T.SRGBColorSpace;
  stoneTexture.wrapS = stoneTexture.wrapT = T.RepeatWrapping;
  stoneTexture.anisotropy = 8;
  road?.setStoneTexture?.(stoneTexture);
  let water, waterways, gardens, arrivalArt, terraceArt, lods, batches;
  let disposed = false;
  function dispose() {
    if (disposed) return;
    disposed = true;
    // Private owners leave the environment before its shared source collector
    // runs. The same path handles a failed composition or a completed session.
    for (const owner of [terraceArt, arrivalArt, gardens, waterways, water]) {
      owner?.group.removeFromParent();
      owner?.dispose();
    }
    batches?.dispose();
    lods?.dispose();
    release();
  }
  try {
    water = createZephyrWater(track, stoneTexture);
    for (const name of ['island-grand', 'island-terrace', 'island-shard']) {
      const repair = seatSkywellStrata(library[name]);
      for (const geometry of repair.replacedGeometries) geometry.dispose();
    }
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
    for (const [name, footprint] of [
      ['island-grand', [143, 120]],
      ['island-terrace', [110, 78]],
    ])
      library[name].traverse((object) => {
        for (const material of [object.material].flat().filter(Boolean))
          finishSkywellGarden(material, { footprint });
      });
    // Leave secondary shores as natural mineral landforms. Their canonical
    // loose pads and suspension cubes belong to Zephyr's original staging;
    // Skywell's selected occupied shores use the fitted garden assembly below.
    for (const name of ['island-grand', 'island-terrace', 'island-shard'])
      library[name].traverse((object) => {
        if (
          object.isMesh &&
          /__(bronze|copper|limestone|moss|pale)$/.test(object.name)
        )
          object.visible = false;
      });
    // Skywell has its own connected water districts. The generic outboard
    // cistern/discharge duplicates the real Veil crossing; retain its private
    // owner and flow clock without drawing that unrelated hydraulic system.
    water.group.visible = false;
    group.add(water.group);
    const placements = [];
    function place(
      name,
      distance,
      { lateral = 0, height = 0, scale = 1, yaw = 0, position = null } = {},
    ) {
      const object = library[name].clone(true),
        f = track.sample(distance),
        horizontalRight = new T.Vector3(
          f.tangent.z,
          0,
          -f.tangent.x,
        ).normalize();
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
    waterways = createSkywellWaterways({
      track,
      stoneTexture,
      place,
      water,
    });
    group.add(waterways.group);
    const precincts = populateSkywellPrecincts({
      track,
      place,
      districts: architecture,
      waterways,
      placements,
      terraces,
    });
    terraces.push(...precincts.gardenTerraces);
    for (const object of precincts.objects)
      if (!architecture.includes(object)) architecture.push(object);
    const receivingShores = [0, 3, 4]
      .map(
        (index) =>
          terraces.find(({ object }) =>
            object.name.endsWith(
              ` / ${Math.round(track.jumps[index].landingStart + 190)}`,
            ),
          )?.object,
      )
      .filter(Boolean);
    terraceArt = await createSkywellTerraceArt({
      islands: receivingShores,
      stoneTexture,
      loadAsset,
    });
    group.add(terraceArt.group);
    const blockers = architecture.filter(
      (object) => !object.name.includes('foundation'),
    );
    blockers.push(waterways.group);
    blockers.push(...terraceArt.blockers);
    for (const terrace of terraces) terrace.blockers = blockers;
    const veil = track.jumps[2],
      departure = track.sample(veil.takeoff),
      veilOffset = track.curtains[0].s - veil.takeoff,
      curtainPosition = departure.position
        .clone()
        .addScaledVector(departure.tangent, veilOffset)
        .addScaledVector(UP, 125);
    const veilCurtain = place('waterfall-curtain', veil.takeoff + veilOffset, {
      position: curtainPosition,
      scale: [0.85, 1, 1],
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
    const sourcePier = new T.Mesh(
      new T.BoxGeometry(24, 176.5, 24),
      sourceStone,
    );
    sourcePier.position
      .copy(curtainPosition)
      .addScaledVector(veilRight, 310)
      .addScaledVector(UP, -84.75);
    sourcePier.name = 'Skywell / veil source rooted pier';
    const armStart = veilCurtain.localToWorld(new T.Vector3(58, 6, -12));
    const armEnd = curtainPosition
      .clone()
      .addScaledVector(veilRight, 310)
      .addScaledVector(UP, 6);
    const armDirection = armEnd.clone().sub(armStart);
    const sourceHeader = new T.Mesh(
      new T.BoxGeometry(armDirection.length() + 12, 6, 24),
      sourceStone,
    );
    sourceHeader.position.copy(armStart).add(armEnd).multiplyScalar(0.5);
    sourceHeader.quaternion.setFromUnitVectors(
      new T.Vector3(1, 0, 0),
      armDirection.normalize(),
    );
    sourceHeader.name = 'Skywell / veil source cantilever header';
    group.add(sourcePier, sourceHeader);
    arrivalArt = await createSkywellArrivalArt({
      track,
      jumpIds: track.jumps.map((jump) => jump.id),
      includeSaddles: true,
      veilSource: veilCurtain,
      stoneTexture,
      loadAsset,
    });
    group.add(arrivalArt.group);
    blockers.push(arrivalArt.group);
    gardens = await createSkywellGardens({ terraces, loadTexture });
    const geometries = new Set();
    for (const object of placements)
      object.traverse((mesh) => {
        if (mesh.isMesh && mesh.visible) geometries.add(mesh.geometry);
      });
    lods = await createSkywellSceneryLods(geometries);
    batches = batchSkywellScenery(placements, { farGeometries: lods.far });
    for (const object of placements) object.removeFromParent();
    group.add(batches.group, gardens.group);
    batches.update(view?.camera);
    gardens.update?.(view?.camera);
    finishZephyrLighting(group);
    return {
      group,
      update(frame) {
        water.update(frame);
        arrivalArt.update?.(frame);
        batches.update(frame.camera);
        gardens.update?.(frame.camera);
      },
      setReflection(texture) {
        borrowed.add(texture);
        water.setReflection(texture);
        arrivalArt.setReflection(texture);
        terraceArt.setReflection(texture);
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
      dispose,
    };
  } catch (error) {
    dispose();
    throw error;
  }
}
