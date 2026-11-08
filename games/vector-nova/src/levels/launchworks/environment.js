import * as T from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { assetURL } from '../../assets/url.js';
import { finishZephyrMaterial } from '../zephyr/environment/materials.js';
import { finishZephyrLighting } from '../zephyr/environment/lighting.js';
import { createZephyrWater } from '../zephyr/environment/water.js';

const FILES = [
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
    return object;
  }
  for (const [index, jump] of track.jumps.entries()) {
    const side = index % 2 ? -1 : 1;
    place('island-grand', jump.landingStart + 170, {
      height: -110,
      scale: [1.35, 1.1, 1.5],
    });
    place('island-terrace', jump.takeoff - 180, {
      height: -94,
      lateral: side * 45,
      scale: [1.05, 0.9, 1.4],
    });
    // The abbey's masonry foot is 57m below the road. Its own broad mineral
    // terrace meets that foot, instead of leaving a detached facade in the sky.
    place('island-terrace', jump.landingStart + 260, {
      lateral: side * 320,
      height: -85,
      scale: [1.2, 1, 1.35],
      yaw: side * 0.25,
    });
    place('abbey-quarter', jump.landingStart + 260, {
      lateral: side * 320,
      height: -35,
      scale: 1.05,
      yaw: side * 0.25,
    });
    // The far water tower is rooted separately below its long source pier.
    place('island-shard', jump.landingStart + 260, {
      lateral: -side * 205,
      height: -230,
      scale: [1.6, 1.5, 1.65],
    });
    place('aqueduct-source', jump.landingStart + 260, {
      lateral: -side * 205,
      height: -25,
      scale: 1.2,
      yaw: Math.PI / 2,
    });
    place('waterfall', jump.landingStart + 240, {
      lateral: -side * 200,
      height: 55,
      scale: 1.4,
    });
    // Layered rooted landforms continue through ordinary connectors rather
    // than appearing only beside the five stunts.
    if (index < track.jumps.length - 1) {
      const next = track.jumps[index + 1];
      place('island-terrace', (jump.recovery + next.takeoff) / 2, {
        height: -125,
        lateral: side * 110,
        scale: [1.5, 1.1, 1.8],
      });
    }
  }
  const veil = track.jumps[2],
    departure = track.sample(veil.takeoff),
    curtainPosition = departure.position
      .clone()
      .addScaledVector(departure.tangent, 195)
      .addScaledVector(UP, 125);
  place('waterfall-curtain', veil.takeoff + 195, {
    position: curtainPosition,
    scale: [0.85, 1, 1],
  });
  place('aqueduct-source', veil.takeoff + 195, {
    position: curtainPosition
      .clone()
      .addScaledVector(UP, 30)
      .addScaledVector(departure.right, 95),
    scale: 0.8,
    yaw: Math.PI / 2,
  });
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
  finishZephyrLighting(group);
  let disposed = false;
  return {
    group,
    update: (frame) => water.update(frame),
    setReflection(texture) {
      borrowed.add(texture);
      water.setReflection(texture);
      owners.traverse((object) => {
        for (const material of [object.material].flat().filter(Boolean)) {
          material.envMap = texture;
          material.needsUpdate = true;
        }
      });
      bronze.envMap = texture;
      bronze.needsUpdate = true;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      water.dispose();
      release();
      stoneTexture.dispose();
    },
  };
}
