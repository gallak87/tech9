import * as T from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import {
  createRouteClearance,
  groundFrame,
} from '../../../environment/placement.js';
import { sampleCindercoilEvent } from '../mechanics.js';
import { createCindercoilAtmosphere } from '../atmosphere.js';
import {
  createCindercoilMaterials,
  applyCindercoilAssetMaterials,
} from './materials.js';
import {
  createCalderaTerrain,
  createCalderaHeight,
  createLavaPool,
  disposeOwned,
  seededRandom,
} from './geometry.js';

const ASSET = '/assets/levels/cindercoil/cindercoil-hero-kit-v6.glb';
const UP = new T.Vector3(0, 1, 0);

function instantiateModule(template, placements, name) {
  const group = new T.Group();
  group.name = name;
  const matrix = new T.Matrix4(),
    transform = new T.Matrix4();
  group.userData.batches = [];
  template.updateMatrixWorld(true);
  template.traverse((node) => {
    if (!node.isMesh) return;
    const instances = new T.InstancedMesh(
      node.geometry,
      node.material,
      placements.length,
    );
    instances.name = `${name} / ${node.name}`;
    instances.receiveShadow = true;
    for (let i = 0; i < placements.length; i += 1) {
      const p = placements[i];
      transform.compose(p.position, p.quaternion, p.scale);
      matrix.multiplyMatrices(transform, node.matrixWorld);
      instances.setMatrixAt(i, matrix);
    }
    instances.computeBoundingSphere();
    group.add(instances);
    group.userData.batches.push({
      mesh: instances,
      sourceMatrix: node.matrixWorld.clone(),
    });
  });
  return group;
}

/** Local world ownership: no cached GLB, shared scene edits or wall-clock animation. */
export function createCindercoilEnvironment({
  track,
  shape = false,
  settings = {},
  loadAsset,
  loadTexture,
} = {}) {
  const group = new T.Group();
  group.name = shape
    ? 'Cindercoil / neutral shape floor'
    : 'Cindercoil / natural caldera';
  if (shape) {
    const floor = new T.Mesh(
      new T.CircleGeometry(1600, 64).rotateX(-Math.PI / 2),
      new T.MeshStandardMaterial({ color: '#37414c', roughness: 1 }),
    );
    floor.position.y = track.groundY - 5;
    group.add(floor);
    return {
      group,
      dispose() {
        disposeOwned(group);
      },
    };
  }
  const fallbackRock = new T.DataTexture(
    new Uint8Array([115, 115, 115, 255]),
    1,
    1,
  );
  fallbackRock.colorSpace = T.SRGBColorSpace;
  fallbackRock.needsUpdate = true;
  const rockTexture = { value: fallbackRock };
  const materials = createCindercoilMaterials({ rockTexture });
  const random = seededRandom();
  const clearance = createRouteClearance(track, {
    spacing: 6,
    sidePadding: 17,
    localVertical: [-22, 34],
  });
  const heightAt = createCalderaHeight(track);
  const terrain = createCalderaTerrain(track, materials.basalt, heightAt);
  group.add(terrain);
  const basin = track.landmarks.basin;
  const lake = createLavaPool(
    basin.radius * 1.4,
    basin.radius * 1.03,
    materials.lava,
  );
  lake.position.set(...basin.center);
  group.add(lake);
  const ruptureLocation = track.landmarks.rupture;
  const wall = new T.Group();
  wall.name = 'Cindercoil / rupture and volumetric channels';
  wall.position.set(
    ruptureLocation.position[0],
    basin.lakeY,
    ruptureLocation.position[2],
  );
  wall.rotation.y = Math.atan2(
    ruptureLocation.direction[0],
    ruptureLocation.direction[2],
  );
  group.add(wall);
  const plungePool = createLavaPool(340, 230, materials.lava, 16);
  plungePool.position.set(0, 1, 100);
  wall.add(plungePool);
  const launch = track.landmarks.launch;
  const ventPosition = new T.Vector3()
    .fromArray(launch.takeoff)
    .lerp(new T.Vector3().fromArray(launch.landing), 0.52);
  ventPosition.y = track.groundY + 5;
  const ventPool = createLavaPool(43, 32, materials.lava, 31);
  ventPool.position.copy(ventPosition);
  group.add(ventPool);
  const fountain = new T.Group();
  fountain.name = 'Cindercoil / active vent molten tongues';
  fountain.position.copy(ventPosition);
  const ventMaterial = new T.MeshStandardMaterial({
    name: 'Lava / fragmented eruption cores',
    color: '#e45116',
    emissive: '#ff6215',
    emissiveIntensity: 1.8,
    roughness: 0.65,
  });
  const ventRimMaterial = new T.MeshStandardMaterial({
    color: '#262c32',
    roughness: 0.93,
  });
  for (let i = 0; i < 5; i += 1) {
    const angle = (i * Math.PI * 2) / 5;
    const height = 95 + i * 10;
    const path = new T.CatmullRomCurve3([
      new T.Vector3(Math.cos(angle) * 7, 0, Math.sin(angle) * 7),
      new T.Vector3(Math.cos(angle) * 9, height * 0.36, Math.sin(angle) * 9),
      new T.Vector3(Math.cos(angle) * 17, height * 0.83, Math.sin(angle) * 17),
      new T.Vector3(Math.cos(angle) * 25, height, Math.sin(angle) * 25),
      new T.Vector3(Math.cos(angle) * 33, height * 0.88, Math.sin(angle) * 33),
    ]);
    const tongue = new T.Mesh(
      new T.TubeGeometry(path, 28, 1.8 - i * 0.18, 9, false),
      ventMaterial,
    );
    tongue.name = 'Cindercoil / volumetric volcanic tongue';
    fountain.add(tongue);
  }
  const ventRim = new T.Mesh(
    new T.TorusGeometry(37, 6, 6, 32).rotateX(Math.PI / 2),
    ventRimMaterial,
  );
  ventRim.position.copy(ventPosition);
  ventRim.position.y -= 1;
  applyCindercoilAssetMaterials(fountain, materials.lava.uniforms.time);
  group.add(fountain, ventRim);
  const spatterGeometry = new T.IcosahedronGeometry(1, 1);
  const spatterVertices = spatterGeometry.attributes.position;
  for (let i = 0; i < spatterVertices.count; i++) {
    const p = new T.Vector3().fromBufferAttribute(spatterVertices, i);
    const radius =
      0.78 + 0.22 * Math.sin(p.x * 11 + p.z * 17) * Math.cos(p.y * 13);
    spatterVertices.setXYZ(i, p.x * radius, p.y * radius, p.z * radius);
  }
  spatterGeometry.computeVertexNormals();
  ventMaterial.flatShading = true;
  const spatter = new T.InstancedMesh(spatterGeometry, ventMaterial, 48);
  spatter.name = 'Cindercoil / broken ballistic molten spray';
  spatter.frustumCulled = false;
  group.add(spatter);
  const spatterMatrix = new T.Matrix4();
  const spatterPosition = new T.Vector3(),
    spatterScale = new T.Vector3();
  const spatterRotation = new T.Quaternion();
  const atmosphere = createCindercoilAtmosphere(track, ventPosition);
  group.add(atmosphere.group);
  const lights = Array.from({ length: 3 }, () => {
    const light = new T.PointLight('#ff772b', 0, 270, 2);
    light.name = 'Cindercoil / motivated molten bounce';
    group.add(light);
    return light;
  });
  const lightAnchors = [
    new T.Vector3(...basin.center).add(new T.Vector3(0, 35, 0)),
    new T.Vector3(
      ruptureLocation.position[0] + ruptureLocation.direction[0] * 85,
      108,
      ruptureLocation.position[2] + ruptureLocation.direction[2] * 85,
    ),
    ventPosition.clone().add(new T.Vector3(0, 72, 0)),
  ];
  const poses = [],
    raftPlacements = [],
    animated = [];
  let rafts = null,
    fallingCrust = null;
  const fallingPlacements = [];
  const raftMatrix = new T.Matrix4(),
    raftTransform = new T.Matrix4(),
    raftPosition = new T.Vector3();
  let assetScene = null,
    disposed = false,
    loaded = false,
    overview = false;
  let leftPanel = null,
    rightPanel = null;
  const metrics = {
    assetBytes: 3221068,
    sourceTriangles: 82980,
    textures: 0,
    additionalRenderPasses: 0,
    localLights: 3,
  };
  group.userData.metrics = metrics;
  const placements = [];
  group.userData.clearanceReport = {
    sampleCount: clearance.sampleCount,
    halfWidth: clearance.halfWidth,
    localVertical: clearance.localVertical,
    placements,
  };
  group.userData.setOverview = (active) => {
    overview = Boolean(active);
    group.visible = !overview;
  };

  function accept(gltf) {
    if (disposed) {
      disposeOwned(gltf.scene);
      return;
    }
    assetScene = gltf.scene;
    applyCindercoilAssetMaterials(
      assetScene,
      materials.lava.uniforms.time,
      rockTexture,
    );
    const template = (name) => {
      const node = assetScene.getObjectByName(name);
      if (!node) throw new Error(`Cindercoil hero kit is missing ${name}`);
      return node;
    };
    for (const name of [
      'rupture_wall',
      'rupture_left',
      'rupture_right',
      'cascade_0',
      'cascade_1',
      'cascade_2',
    ]) {
      const object = template(name).clone(true);
      wall.add(object);
      if (name === 'rupture_left') leftPanel = object;
      if (name === 'rupture_right') rightPanel = object;
      if (name.startsWith('cascade_')) animated.push(object);
    }
    // A separate, permanently flowing rim feeds the Ember basin. The northern
    // fault remains the active rupture, ahead of normal Curtain Reach views.
    const curtains = new T.Group();
    curtains.name = 'Cindercoil / southern layered lava curtains';
    curtains.position.set(-610, basin.lakeY, -150);
    curtains.rotation.y = Math.PI / 2;
    curtains.scale.set(0.78, 0.9, 0.82);
    for (const name of ['rupture_wall', 'cascade_0', 'cascade_1', 'cascade_2'])
      curtains.add(template(name).clone(true));
    const southernPool = createLavaPool(160, 90, materials.lava, 23);
    southernPool.position.set(0, 1, 92);
    curtains.add(southernPool);
    group.add(curtains);
    const coil = track.landmarks.coil;
    const tower = template('hollow_tower').clone(true);
    const towerBounds = new T.Box3().setFromObject(template('hollow_tower'));
    const towerBase = Math.min(coil.baseY, track.groundY - 40);
    const sy =
      (coil.topY - towerBase) / (towerBounds.max.y - towerBounds.min.y);
    tower.position.set(
      coil.center[0],
      towerBase - towerBounds.min.y * sy,
      coil.center[2],
    );
    let towerRadius = 0;
    const towerVertex = new T.Vector3();
    template('hollow_tower').traverse((node) => {
      if (!node.isMesh) return;
      for (let i = 0; i < node.geometry.attributes.position.count; i += 1) {
        towerVertex.fromBufferAttribute(node.geometry.attributes.position, i);
        towerRadius = Math.max(
          towerRadius,
          Math.hypot(towerVertex.x, towerVertex.z),
        );
      }
    });
    tower.scale.set(
      (coil.towerRadius - 1) / towerRadius,
      sy,
      (coil.towerRadius - 1) / towerRadius,
    );
    group.add(tower);
    // Real launch geometry belongs to the road. These broken external braces
    // stay beyond the entire flight/camera corridor and root into basalt feet.
    const jumpFrame = track.sample(track.jumps[0].takeoff);
    const yaw = Math.atan2(jumpFrame.tangent.x, jumpFrame.tangent.z);
    for (const side of [-1, 1]) {
      const pylon = template('broken_launch_pylon').clone(true);
      pylon.position
        .fromArray(launch.takeoff)
        .addScaledVector(jumpFrame.right, side * 60);
      pylon.position.y -= 31;
      pylon.scale.set(0.75, (pylon.position.y - track.groundY + 35) / 70, 0.95);
      pylon.rotation.y = yaw;
      group.add(pylon);
    }
    // Basalt clusters are composed along every district, with conservative
    // route-space rejection that also protects the fully inverted climb.
    const rockFamilies = [
      'basalt_cluster',
      'fractured_ridge',
      'broken_lava_tube',
    ];
    const familyBounds = rockFamilies.map((name) =>
      new T.Box3().setFromObject(template(name)),
    );
    const familyPlacements = rockFamilies.map(() => []);
    const clusterWidth = Math.max(
      ...familyBounds.map(
        (bounds) =>
          Math.hypot(
            Math.max(Math.abs(bounds.min.x), Math.abs(bounds.max.x)),
            Math.max(Math.abs(bounds.min.z), Math.abs(bounds.max.z)),
          ) * 2,
      ),
    );
    for (let s = 15; s < track.length; s += 72) {
      const frame = groundFrame(track, s);
      for (const side of [-1, 1]) {
        const family =
          (Math.floor(s / 72) + (side > 0 ? 1 : 0)) % rockFamilies.length;
        const clusterBounds = familyBounds[family];
        const scale = 1.05 + random() * 1.65;
        const heightScale =
          scale *
          (1.3 + random() * 1.05) *
          (family === 1 ? 0.55 : family === 2 ? 0.7 : 1);
        let position,
          accepted = false;
        for (let attempt = 0; attempt < 7; attempt += 1) {
          position = frame.position
            .clone()
            .addScaledVector(
              frame.right,
              side * (98 + attempt * 22 + random() * 12),
            );
          position.y = heightAt(position.x, position.z) - 12;
          const top = position.y + clusterBounds.max.y * heightScale;
          if (
            clearance.clears(
              position.x,
              position.z,
              clusterWidth * scale,
              clusterWidth * scale,
              top,
              0,
              position.y + clusterBounds.min.y * heightScale,
            )
          ) {
            accepted = true;
            break;
          }
        }
        if (!accepted) continue;
        const faultDelta = position
          .clone()
          .sub(new T.Vector3(...ruptureLocation.position));
        const faultAcross =
          faultDelta.x * ruptureLocation.direction[2] -
          faultDelta.z * ruptureLocation.direction[0];
        const faultForward =
          faultDelta.x * ruptureLocation.direction[0] +
          faultDelta.z * ruptureLocation.direction[2];
        // Keep the active fault and its plunge basin open to Curtain Reach.
        if (
          Math.abs(faultAcross) < 185 &&
          faultForward > 0 &&
          faultForward < 310
        )
          continue;
        poses.push({
          position,
          quaternion: new T.Quaternion().setFromAxisAngle(
            UP,
            random() * Math.PI * 2,
          ),
          scale: new T.Vector3(scale, heightScale, scale),
        });
        familyPlacements[family].push(poses.at(-1));
        placements.push({
          type: rockFamilies[family],
          s,
          position: position.toArray(),
          scale,
          heightScale,
          width: clusterWidth * scale,
          top: position.y + clusterBounds.max.y * heightScale,
          bottom: position.y + clusterBounds.min.y * heightScale,
        });
      }
    }
    for (let family = 0; family < rockFamilies.length; family++) {
      group.add(
        instantiateModule(
          template(rockFamilies[family]),
          familyPlacements[family],
          `Cindercoil / ordinary ${rockFamilies[family]}`,
        ),
      );
    }
    const aprons = [];
    const apronBounds = new T.Box3().setFromObject(template('talus_apron'));
    for (let s = 35; s < track.length; s += 185) {
      const frame = groundFrame(track, s);
      const side = Math.floor(s / 185) % 2 ? -1 : 1;
      const scale = 0.65 + random() * 0.75;
      const position = frame.position
        .clone()
        .addScaledVector(frame.right, side * (72 + random() * 24));
      position.y = heightAt(position.x, position.z) - 2;
      const width = 85 * scale;
      const top = position.y + apronBounds.max.y * scale;
      if (
        !clearance.clears(
          position.x,
          position.z,
          width,
          width,
          top,
          0,
          position.y - 12,
        )
      )
        continue;
      aprons.push({
        position,
        quaternion: new T.Quaternion().setFromAxisAngle(
          UP,
          random() * Math.PI * 2,
        ),
        scale: new T.Vector3(scale, scale, scale),
      });
      placements.push({
        type: 'cooled-apron',
        s,
        position: position.toArray(),
        width,
        top,
        bottom: position.y - 12,
        scale,
      });
    }
    group.add(
      instantiateModule(
        template('talus_apron'),
        aprons.filter((_, i) => i % 3),
        'Cindercoil / cooled flow shelves and talus',
      ),
    );
    group.add(
      instantiateModule(
        template('ash_pocket'),
        aprons.filter((_, i) => i % 3 === 0),
        'Cindercoil / sheltered ash and broken cooling slabs',
      ),
    );
    // Thick plates sit above both main lake and cascade plunge basin.
    for (let i = 0; i < 96; i += 1) {
      const onRupture = i >= 60;
      const angle = random() * Math.PI * 2,
        radius = Math.sqrt(random()) * 0.89;
      const position = new T.Vector3(
        Math.cos(angle) * radius * (onRupture ? 173 : basin.radius * 1.3),
        1.5 + random() * 1.4,
        Math.sin(angle) * radius * (onRupture ? 85 : basin.radius * 0.95),
      );
      if (onRupture) {
        position.z += 102;
        position.applyAxisAngle(UP, wall.rotation.y).add(wall.position);
      } else position.add(new T.Vector3(...basin.center));
      const scale = 0.64 + random() * 0.74;
      raftPlacements.push({
        position,
        quaternion: new T.Quaternion().setFromAxisAngle(
          UP,
          random() * Math.PI * 2,
        ),
        scale: new T.Vector3(
          scale,
          0.5 + random() * 0.7,
          scale * (0.55 + random() * 0.7),
        ),
      });
    }
    rafts = instantiateModule(
      template('crust_raft'),
      raftPlacements,
      'Cindercoil / fractured cooling crust rafts',
    );
    group.add(rafts);
    for (let i = 0; i < 16; i++) {
      fallingPlacements.push({
        position: new T.Vector3(),
        quaternion: new T.Quaternion().setFromAxisAngle(UP, i * 2.4),
        scale: new T.Vector3(
          0.11 + (i % 4) * 0.025,
          0.1,
          0.11 + (i % 4) * 0.025,
        ),
      });
    }
    fallingCrust = instantiateModule(
      template('crust_raft'),
      fallingPlacements,
      'Cindercoil / breaking and falling fault crust',
    );
    fallingCrust.position.copy(wall.position);
    fallingCrust.rotation.copy(wall.rotation);
    group.add(fallingCrust);
    let meshes = 0,
      triangles = 0;
    group.traverse((node) => {
      if (!node.isMesh) return;
      meshes += 1;
      triangles +=
        ((node.geometry.index?.count ??
          node.geometry.attributes.position.count) /
          3) *
        (node.isInstancedMesh ? node.count : 1);
    });
    Object.assign(metrics, {
      meshCount: meshes,
      triangleCount: triangles,
      basaltClusters: poses.length,
      crustRafts: raftPlacements.length,
    });
    loaded = true;
  }
  let ready = Promise.resolve(false);
  if (
    loadAsset ||
    (typeof document !== 'undefined' && typeof location !== 'undefined')
  ) {
    ready = Promise.resolve()
      .then(() =>
        (loadAsset ?? ((url) => new GLTFLoader().loadAsync(url)))(ASSET),
      )
      .then(async (gltf) => {
        accept(gltf);
        if (
          !disposed &&
          (loadTexture ||
            (typeof document !== 'undefined' &&
              typeof location !== 'undefined'))
        ) {
          const texture = await Promise.resolve()
            .then(() =>
              (loadTexture ?? ((url) => new T.TextureLoader().loadAsync(url)))(
                '/assets/levels/cindercoil/basalt-albedo-v1.png',
              ),
            )
            .catch((cause) => {
              throw new Error(
                'The Cindercoil basalt surface could not load. Reload to try again.',
                { cause },
              );
            });
          if (disposed) {
            texture.dispose();
            return false;
          }
          texture.colorSpace = T.SRGBColorSpace;
          texture.wrapS = texture.wrapT = T.RepeatWrapping;
          texture.anisotropy = 8;
          rockTexture.value = texture;
          const bind = (material) => {
            if (material.map === fallbackRock) {
              material.map = texture;
              material.needsUpdate = true;
            }
          };
          bind(materials.basalt);
          assetScene.traverse((node) => {
            for (const material of [node.material].flat().filter(Boolean))
              bind(material);
          });
          fallbackRock.dispose();
          metrics.textures = 1;
        }
        return !disposed;
      })
      .catch((error) => {
        if (!disposed)
          disposeOwned(group, [assetScene], Object.values(materials));
        disposed = true;
        throw error;
      });
  }
  function update({
    time = 0,
    state,
    camera,
    settings: currentSettings = settings,
  } = {}) {
    if (disposed) return;
    const event = sampleCindercoilEvent(time);
    const motionTime = currentSettings.reducedMotion ? 0 : time;
    materials.lava.uniforms.time.value = motionTime;
    materials.lava.uniforms.pulse.value = event.rupture;
    fountain.scale.y =
      0.025 + event.vent * 0.975 + (event.ventWarning ? 0.055 : 0);
    fountain.rotation.y = currentSettings.reducedMotion
      ? 0
      : Math.sin(motionTime * 0.35) * 0.06;
    ventMaterial.emissiveIntensity = 0.7 + event.vent * 0.45;
    spatter.visible = event.vent > 0.02;
    spatter.count = currentSettings.reducedMotion ? 12 : 48;
    for (let i = 0; i < spatter.count; i++) {
      const age = (motionTime * 0.42 + i * 0.61803398875) % 1;
      const angle = i * 2.399;
      const height = Math.sin(age * Math.PI) * (250 + (i % 6) * 17);
      const radius = 3 + age * (22 + (i % 18));
      spatterPosition
        .copy(ventPosition)
        .add(
          new T.Vector3(
            Math.cos(angle) * radius,
            height * event.vent,
            Math.sin(angle) * radius,
          ),
        );
      spatterScale.setScalar(0.32 + (i % 7) * 0.08);
      spatterScale.y *= 1.6;
      spatterRotation.setFromAxisAngle(UP, age * 4 + i);
      spatterMatrix.compose(spatterPosition, spatterRotation, spatterScale);
      spatter.setMatrixAt(i, spatterMatrix);
    }
    spatter.instanceMatrix.needsUpdate = true;
    if (rafts) {
      for (const { mesh, sourceMatrix } of rafts.userData.batches) {
        for (let i = 0; i < raftPlacements.length; i += 1) {
          const p = raftPlacements[i];
          raftPosition.copy(p.position);
          const expansion = event.rupture * (i >= 60 ? 5.2 : 1.8);
          raftPosition.x += Math.sin(i * 2.4) * expansion;
          raftPosition.z += Math.cos(i * 2.4) * expansion;
          if (!currentSettings.reducedMotion)
            raftPosition.y += Math.sin(motionTime * 0.38 + i) * 0.38;
          raftTransform.compose(raftPosition, p.quaternion, p.scale);
          raftMatrix.multiplyMatrices(raftTransform, sourceMatrix);
          mesh.setMatrixAt(i, raftMatrix);
        }
        mesh.instanceMatrix.needsUpdate = true;
      }
    }
    if (fallingCrust) {
      fallingCrust.visible = event.rupture > 0.02;
      for (const { mesh, sourceMatrix } of fallingCrust.userData.batches) {
        mesh.count = currentSettings.quality === 'low' ? 8 : 16;
        for (let i = 0; i < mesh.count; i++) {
          const p = fallingPlacements[i];
          const age = (motionTime * 0.13 + i * 0.61803398875) % 1;
          const lane = ((i % 3) - 1) * 103;
          raftPosition.set(
            lane + Math.sin(i * 2.3) * 7,
            258 - age * 250,
            48 + age * age * 63,
          );
          raftTransform.compose(
            raftPosition,
            p.quaternion,
            p.scale.clone().multiplyScalar(Math.max(0.001, event.rupture)),
          );
          raftMatrix.multiplyMatrices(raftTransform, sourceMatrix);
          mesh.setMatrixAt(i, raftMatrix);
        }
        mesh.instanceMatrix.needsUpdate = true;
      }
    }
    atmosphere.update({ state, time, camera, settings: currentSettings });
    if (leftPanel) leftPanel.position.x = -event.rupture * 32;
    if (rightPanel) rightPanel.position.x = event.rupture * 32;
    for (const [index, channel] of animated.entries()) {
      channel.scale.z =
        index === 1 ? 0.08 + event.rupture * 1.12 : 0.85 + event.rupture * 0.26;
      channel.position.y = currentSettings.reducedMotion
        ? 0
        : Math.sin(motionTime * 0.47 + index) * 0.55;
    }
    if (camera?.position) {
      const anchors = lightAnchors
        .map((position, index) => ({
          position,
          index,
          distance: position.distanceTo(camera.position),
        }))
        .sort((a, b) => a.distance - b.distance);
      for (const [index, light] of lights.entries()) {
        const anchor = anchors[index];
        light.position.copy(anchor.position);
        const strength =
          anchor.index === 1
            ? 1 + event.rupture * 0.5
            : anchor.index === 2
              ? 1 + event.vent * 0.35
              : 1;
        if (anchor.index === 2)
          light.position.y = ventPosition.y + 72 + event.vent * 170;
        light.intensity = overview
          ? 0
          : 10500 *
            strength *
            (anchor.index === 1
              ? 1
              : 1 - T.MathUtils.smoothstep(anchor.distance, 260, 560));
      }
    }
    group.userData.presentation = {
      loaded,
      rupture: event.rupture,
      vent: event.vent,
      time,
      reducedMotion: Boolean(currentSettings.reducedMotion),
      quality: currentSettings.quality ?? 'high',
    };
  }
  return {
    group,
    ready,
    update,
    reset() {
      update({ time: 0, settings });
    },
    setReflection(texture) {
      for (const material of Object.values(materials))
        if (material.isMeshStandardMaterial) {
          material.envMap = texture;
          material.needsUpdate = true;
        }
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      loaded = false;
      disposeOwned(group, [assetScene], Object.values(materials));
      poses.length = 0;
      raftPlacements.length = 0;
      animated.length = 0;
    },
  };
}
