import * as T from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { assetURL } from '../../assets/url.js';
import { batchSkywellScenery } from './scenery-batches.js';
import { finishZephyrMaterial } from '../zephyr/environment/materials.js';

// Original Skywell furniture. The first receiver is deliberately the default
// proof; explicit IDs can expand the accepted treatment after visual review.
export async function createSkywellArrivalArt({
  track,
  jumpIds = [track.jumps[0]?.id],
  includeSaddles = false,
  veilSource = null,
  stoneTexture,
  loadAsset = (url) => new GLTFLoader().loadAsync(url),
}) {
  const group = new T.Group();
  group.name = 'Skywell / fitted Gothic arrival furniture';
  const selected = track.jumps.filter((jump) => jumpIds.includes(jump.id));
  const names = [
    ...new Set(
      selected.map((jump) =>
        jump === track.jumps[0]
          ? 'arrival-beacon-crown'
          : 'arrival-beacon-small',
      ),
    ),
  ];
  if (includeSaddles) names.push('terrace-saddle');
  if (veilSource) names.push('veil-spill-lip');
  const owned = [],
    borrowed = new Set(stoneTexture ? [stoneTexture] : []),
    batches = [];
  let disposed = false;
  function dispose() {
    if (disposed) return;
    disposed = true;
    // Instance owners release their buffers before the private GLB library
    // releases geometry/materials borrowed by those draws.
    for (const batch of batches) {
      batch.group.removeFromParent();
      batch.dispose();
    }
    batches.length = 0;
    const geometry = new Set(),
      materials = new Set(),
      textures = new Set();
    for (const root of owned)
      root.traverse((object) => {
        if (object.geometry) geometry.add(object.geometry);
        for (const material of [object.material].flat().filter(Boolean)) {
          materials.add(material);
          for (const value of Object.values(material))
            if (value?.isTexture && !borrowed.has(value)) textures.add(value);
        }
      });
    geometry.forEach((value) => value.dispose());
    materials.forEach((value) => value.dispose());
    textures.forEach((value) => value.dispose());
    owned.length = 0;
    group.clear();
  }
  const loaded = await Promise.allSettled(
    names.map((name) =>
      loadAsset(assetURL(`assets/levels/launchworks/${name}.glb`)),
    ),
  );
  for (const result of loaded)
    if (result.status === 'fulfilled') owned.push(result.value.scene);
  const failed = loaded.find((result) => result.status === 'rejected');
  if (failed) {
    dispose();
    throw failed.reason;
  }
  const library = Object.fromEntries(
    names.map((name, i) => [name, loaded[i].value.scene]),
  );
  library['veil-spill-lip']?.traverse((mesh) => {
    if (!mesh.isMesh || !/__stone$/.test(mesh.name)) return;
    for (const material of [mesh.material].flat().filter(Boolean))
      finishZephyrMaterial(material, { stoneTexture });
  });
  for (const root of owned)
    root.traverse((object) => {
      if (!object.isMesh) return;
      object.castShadow = false;
      object.receiveShadow = true;
      object.userData.skywellArrivalFurniture = true;
    });
  for (const jump of selected) {
    const beacons = [];
    const asset =
      jump === track.jumps[0] ? 'arrival-beacon-crown' : 'arrival-beacon-small';
    const frame = track.sample(jump.landingStart + 15);
    // Bell's steep, banked approach has a wider swept hull and chase sightline
    // than the settled road. Its furniture stays outside that native envelope.
    // Crown's boosted wide entry returns to the road after passing these
    // towers; keep their actual bronze/recess faces outside that swept hull.
    const offset =
      jump === track.jumps[0] ? 49 : jump === track.jumps[1] ? 41 : 31;
    for (const side of [-1, 1]) {
      const beacon = library[asset].clone(true);
      beacon.name = `Skywell / ${jump.label} / fitted arrival beacon ${side}`;
      beacon.position
        .copy(frame.position)
        .addScaledVector(frame.right, side * offset);
      beacon.quaternion.copy(frame.quaternion);
      beacon.userData.skywellArrivalFurniture = true;
      beacon.userData.receiverId = jump.id;
      beacon.traverse((mesh) => {
        if (mesh.isMesh) mesh.userData.receiverId = jump.id;
      });
      beacons.push(beacon);
    }
    // Keep receiver identities separate even where two folded route reaches
    // share a spatial cell; each draw still retains one truthful receiverId.
    const batch = batchSkywellScenery(beacons, { cellSize: 520 });
    batch.group.name = `Skywell / ${jump.label} / spatially batched arrival beacons`;
    batches.push(batch);
    group.add(batch.group);
  }
  const saddles = new T.Group();
  saddles.name = 'Skywell / optional fitted bronze terrace carriages';
  if (includeSaddles) {
    const objects = [];
    for (let distance = 80; distance < track.finishDistance; distance += 155) {
      if (track.isGap(distance) || track.tubeAt(distance)) continue;
      // A rigid under-keel carriage cannot follow a rapidly twisting skin.
      // Across its 16 m fit span, keep the normal turn within the 3 m recess.
      const normalTurn = track
        .sample(distance - 8)
        .up.angleTo(track.sample(distance + 8).up);
      if (normalTurn > 0.28) continue;
      const frame = track.sample(distance);
      const saddle = library['terrace-saddle'].clone(true);
      saddle.name = `Skywell / formed terrace saddle / ${Math.round(distance)}`;
      saddle.position.copy(frame.position);
      saddle.quaternion.copy(frame.quaternion);
      objects.push(saddle);
    }
    const batch = batchSkywellScenery(objects, { cellSize: 520 });
    batch.group.name = 'Skywell / spatially batched formed terrace saddles';
    batches.push(batch);
    saddles.add(batch.group);
    group.add(saddles);
  }
  if (veilSource) {
    veilSource.updateWorldMatrix(true, true);
    const source = new T.Group();
    source.name = 'Skywell / fitted Veil spill lip';
    source.matrixAutoUpdate = false;
    source.matrix.copy(veilSource.matrixWorld);
    source.add(library['veil-spill-lip'].clone(true));
    group.add(source);
  }
  return {
    group,
    saddles,
    update(frame) {
      const camera = frame?.camera ?? frame;
      for (const batch of batches) batch.update(camera);
    },
    setReflection(texture) {
      borrowed.add(texture);
      const materials = new Set();
      for (const root of owned)
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
}
