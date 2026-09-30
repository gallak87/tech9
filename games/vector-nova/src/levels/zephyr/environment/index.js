import * as T from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import {
  groundFrame,
  createRouteClearance,
} from '../../../environment/placement.js';
import { interiorAt, wetnessForFrame, sampleTowerEvent } from './atmosphere.js';

const FILES = [
  'cathedral-facade',
  'nave-bay',
  'chapel',
  'island-grand',
  'island-terrace',
  'island-shard',
  'falling-tower',
  'waterfall',
  'waterfall-curtain',
  'cloudspire-needle',
  'broken-halo',
];
function release(group) {
  const geometries = new Set(),
    materials = new Set(),
    textures = new Set();
  group.traverse((o) => {
    if (o.geometry) geometries.add(o.geometry);
    for (const m of [o.material].flat().filter(Boolean)) {
      materials.add(m);
      for (const v of Object.values(m)) if (v?.isTexture) textures.add(v);
    }
  });
  geometries.forEach((g) => g.dispose());
  materials.forEach((m) => m.dispose());
  textures.forEach((t) => t.dispose());
  group.clear();
}
const stonePoint = (track, s, lateral = 0, height = 0) => {
  const f = groundFrame(track, s);
  return f.position
    .addScaledVector(f.right, lateral)
    .addScaledVector(f.up, height);
};
export async function createZephyrEnvironment({ track, view, shape = false }) {
  const group = new T.Group();
  group.name = 'Zephyr / suspended sacred archipelago';
  if (shape)
    return {
      group,
      dispose() {
        group.clear();
      },
    };
  const loader = new GLTFLoader();
  const loaded = await Promise.allSettled(
    FILES.map((name) => loader.loadAsync(`/assets/levels/zephyr/${name}.glb`)),
  );
  if (loaded.some((r) => r.status === 'rejected')) {
    for (const r of loaded)
      if (r.status === 'fulfilled') release(r.value.scene);
    throw loaded.find((r) => r.status === 'rejected').reason;
  }
  const library = Object.fromEntries(
    FILES.map((name, i) => [name, loaded[i].value.scene]),
  );
  const owners = new T.Group();
  Object.values(library).forEach((o) => owners.add(o));
  const waterMaterials = new Set();
  owners.traverse((o) => {
    if (!o.isMesh) return;
    o.castShadow = true;
    o.receiveShadow = true;
    const materials = [o.material].flat();
    for (const m of materials) {
      if (/water|foam|silver/i.test(m.name)) {
        m.transparent = true;
        m.opacity = /foam/i.test(m.name) ? 0.6 : 0.35;
        m.depthWrite = false;
        m.side = T.DoubleSide;
        m.userData.time = { value: 0 };
        m.onBeforeCompile = (shader) => {
          shader.uniforms.zephyrTime = m.userData.time;
          shader.vertexShader =
            'uniform float zephyrTime; varying vec3 zephyrLocal;\n' +
            shader.vertexShader.replace(
              '#include <begin_vertex>',
              '#include <begin_vertex>\n zephyrLocal=position; transformed.x+=sin(position.y*.075+position.x*.35+zephyrTime*1.1)*.65; transformed.z+=sin(position.y*.12+zephyrTime*1.6)*.55;',
            );
          shader.fragmentShader =
            'uniform float zephyrTime; varying vec3 zephyrLocal;\n' +
            shader.fragmentShader.replace(
              '#include <color_fragment>',
              '#include <color_fragment>\n float ribbon=.5+.5*sin(zephyrLocal.y*.14+zephyrLocal.x*.7+zephyrTime*6.); diffuseColor.rgb*=.8+ribbon*.35; diffuseColor.a*=.56+ribbon*.44;',
            );
        };
        m.customProgramCacheKey = () => 'zephyr-flow-v1';
        waterMaterials.add(m);
        o.castShadow = false;
        o.userData.aoExclude = true;
      }
    }
  });
  const placed = [];
  function place(
    name,
    s,
    { lateral = 0, height = 0, scale = 1, yaw = 0, position = null } = {},
  ) {
    const object = library[name].clone(true);
    const f = groundFrame(track, s);
    object.position.copy(
      position
        ? new T.Vector3(...position)
        : stonePoint(track, s, lateral, height),
    );
    object.rotation.y = Math.atan2(f.tangent.x, f.tangent.z) + yaw;
    object.scale.setScalar(scale);
    object.name = `Zephyr / ${name} / ${Math.round(s)}`;
    group.add(object);
    placed.push({ name, s, lateral, height, scale });
    return object;
  }
  // The physical apertures are authored around a generous road and camera tube.
  const rose = track.landmarks.roseWindow.s,
    chapel = track.landmarks.chapelLanding.s;
  place('cathedral-facade', rose);
  for (let s = rose + 44; s < track.jumps[1].takeoff - 36; s += 58)
    place('nave-bay', s);
  place('chapel', chapel + 94);
  place('cathedral-facade', track.landmarks.mooring.s - 65, {
    scale: 0.72,
    height: -3,
  });
  place('island-shard', 55, { height: -62, scale: 1.2 });
  place('island-grand', rose + 85, { height: -74, scale: 1.5 });
  place('island-terrace', chapel + 105, { height: -62, scale: 1.1 });
  place('island-terrace', track.landmarks.halo.s, { height: -68, scale: 1.25 });
  const towerS = track.landmarks.fallingTower.s;
  const towerPivot = new T.Group();
  towerPivot.position.copy(stonePoint(track, towerS, 280, -32));
  towerPivot.rotation.y = Math.atan2(
    groundFrame(track, towerS).tangent.x,
    groundFrame(track, towerS).tangent.z,
  );
  group.add(towerPivot);
  const tower = library['falling-tower'].clone(true);
  towerPivot.add(tower);
  const towerIsland = place('island-shard', towerS, {
    lateral: 280,
    height: -32,
    scale: 0.9,
  });
  const towerWater = library.waterfall.clone(true);
  towerWater.position.set(28, 175, 4);
  towerWater.scale.set(0.45, 1.6, 0.6);
  towerPivot.add(towerWater);
  const trailingMeshes = [];
  towerWater.traverse((object) => {
    if (!object.isMesh) return;
    object.geometry = object.geometry.clone();
    trailingMeshes.push({
      object,
      rest: object.geometry.attributes.position.array.slice(),
    });
  });

  place('cloudspire-needle', track.landmarks.cloudspire.s, {
    position: [
      track.landmarks.cloudspire.position[0],
      75,
      track.landmarks.cloudspire.position[2],
    ],
  });
  place('island-shard', track.landmarks.cloudspire.s, {
    position: [
      track.landmarks.cloudspire.position[0],
      60,
      track.landmarks.cloudspire.position[2],
    ],
    scale: 1.1,
  });
  place('broken-halo', track.landmarks.halo.s, {
    height: 130,
    lateral: -140,
    yaw: 0.4,
  });
  // A finite family of terraces supports sources, churches and inward views.
  const clearance = createRouteClearance(track, {
    sidePadding: 18,
    localVertical: [-25, 42],
  });
  for (let i = 0; i < 30; i++) {
    const s = ((i + 0.37) * track.length) / 30;
    const side = i % 2 === 0 ? 1 : -1;
    const lateral = side * (165 + ((i * 71) % 140)),
      height = -65 - ((i * 43) % 115),
      scale = 0.4 + ((i * 17) % 60) / 100;
    const p = stonePoint(track, s, lateral, height);
    if (
      !clearance.clears(
        p.x,
        p.z,
        270 * scale,
        245 * scale,
        p.y + 31 * scale,
        0,
        p.y - 240 * scale,
      )
    )
      continue;
    place(`island-${['grand', 'terrace', 'shard'][i % 3]}`, s, {
      lateral,
      height,
      scale,
      yaw: i * 0.72,
    });
    if (i % 5 === 0) {
      place('chapel', s, {
        lateral,
        height: height - 12,
        scale: 0.43,
        yaw: i * 0.72,
      });
      place('waterfall', s, {
        lateral: lateral + 30,
        height: height - 15,
        scale: 0.55,
      });
    }
  }
  const basinMaterial = new T.MeshStandardMaterial({
    color: '#a69b88',
    roughness: 0.86,
  });
  const basinGeometry = new T.BoxGeometry(1, 1, 1);
  function basin(s, height, lateral = 0) {
    const assembly = new T.Group();
    const f = groundFrame(track, s);
    assembly.position.copy(stonePoint(track, s, lateral, height));
    assembly.rotation.y = Math.atan2(f.tangent.x, f.tangent.z);
    for (const [x, y, z, w, h, d] of [
      [0, 2, -9, 96, 5, 18],
      [-46, 6, -9, 4, 9, 18],
      [46, 6, -9, 4, 9, 18],
      [-45, -33, -10, 6, 64, 10],
      [45, -33, -10, 6, 64, 10],
    ]) {
      const m = new T.Mesh(basinGeometry, basinMaterial);
      m.position.set(x, y, z);
      m.scale.set(w, h, d);
      m.castShadow = true;
      m.receiveShadow = true;
      assembly.add(m);
    }
    group.add(assembly);
  }
  const curtains = [];
  for (const curtain of track.curtains) {
    const water = place('waterfall-curtain', curtain.s, {
      height: 62,
      scale: 1,
    });
    curtains.push(water);
    basin(curtain.s, 62);
    basin(curtain.s - 55, 165, 135);
    place('island-terrace', curtain.s, {
      lateral: -124,
      height: 62,
      scale: 0.72,
    });
    place('waterfall', curtain.s - 55, {
      lateral: 135,
      height: 165,
      scale: 1.2,
    });
  }
  // Light shafts and rose pools are narrow local volumes; they never obscure a landing.
  const shafts = new T.Group();
  group.add(shafts);
  const shaftMaterial = new T.MeshBasicMaterial({
    color: '#f7d8bc',
    transparent: true,
    opacity: 0.075,
    depthWrite: false,
    side: T.DoubleSide,
  });
  const shaftGeometry = new T.CylinderGeometry(3, 11, 88, 12, 1, true);
  for (let s = rose + 28; s < track.jumps[1].takeoff - 25; s += 61) {
    const m = new T.Mesh(shaftGeometry, shaftMaterial);
    m.position.copy(stonePoint(track, s, 21, 40));
    m.rotation.z = -0.2;
    m.userData.aoExclude = true;
    shafts.add(m);
    const light = new T.PointLight(
      s % 2 > 1 ? '#e7b8e6' : '#ffe0ab',
      85,
      85,
      1.7,
    );
    light.position.copy(stonePoint(track, s, 23, 25));
    group.add(light);
  }
  const roseLight = new T.PointLight('#b6d8ff', 180, 100, 1.8);
  roseLight.position.copy(stonePoint(track, rose + 15, 0, 34));
  group.add(roseLight);
  // Cloud shelves form a low, finite second scale system below the actual route.
  const cloudGeometry = new T.IcosahedronGeometry(1, 3);
  const cloudMaterial = new T.MeshStandardMaterial({
    color: '#b8afc1',
    roughness: 1,
    metalness: 0,
    flatShading: false,
  });
  const clouds = new T.InstancedMesh(cloudGeometry, cloudMaterial, 80);
  clouds.name = 'Zephyr / low stratified cloud shelves';
  const dummy = new T.Object3D();
  for (let i = 0; i < 80; i++) {
    const angle = i * 2.39996,
      r = 460 + (i % 13) * 80;
    dummy.position.set(
      Math.cos(angle) * r,
      -210 - (i % 7) * 23,
      320 + Math.sin(angle) * r,
    );
    dummy.scale.set(75 + (i % 7) * 22, 18 + (i % 4) * 8, 46 + (i % 9) * 11);
    dummy.rotation.y = angle;
    dummy.updateMatrix();
    clouds.setMatrixAt(i, dummy.matrix);
  }
  clouds.instanceMatrix.needsUpdate = true;
  group.add(clouds);
  const dropletGeometry = new T.BufferGeometry();
  const drops = new Float32Array(36 * 3);
  for (let i = 0; i < 36; i++) {
    drops[i * 3] = Math.sin(i * 8.2) * 3.1;
    drops[i * 3 + 1] = 0.7 + (i % 5) * 0.22;
    drops[i * 3 + 2] = -1 - (i % 9) * 0.5;
  }
  dropletGeometry.setAttribute('position', new T.BufferAttribute(drops, 3));
  const dropletMaterial = new T.PointsMaterial({
    color: '#d5f5ff',
    size: 0.13,
    transparent: true,
    opacity: 0.5,
    depthWrite: false,
  });
  const shipSpray = new T.Points(dropletGeometry, dropletMaterial);
  shipSpray.name = 'Zephyr / water streaming from Kestrel';
  shipSpray.frustumCulled = false;
  group.add(shipSpray);
  const sceneLights = [];
  view.scene.traverse((o) => {
    if (o.isLight && !group.getObjectById(o.id))
      sceneLights.push({ light: o, intensity: o.intensity });
  });
  const initialEnvironment = view.scene.environmentIntensity;
  let disposed = false,
    event = { fall: 0 },
    wetness = 0,
    interior = 0;
  group.userData.metrics = {
    ownedAssets: FILES.length,
    placements: placed.length,
    majorAssetWorkflow: 'scene-imagegen-to-Blender',
  };
  group.userData.clearanceReport = {
    tested:
      'ordinary island AABBs; hero apertures authored and separately tested',
    placements: placed,
  };
  group.userData.getWaterPresentation = () => ({
    wetness,
    interior,
    towerFall: event.fall,
  });
  return {
    group,
    update(frame) {
      if (disposed) return;
      interior = frame.reviewing ? 0 : interiorAt(track, frame.state.distance);
      for (const entry of sceneLights)
        entry.light.intensity =
          entry.intensity *
          (1 - interior * (entry.light.isDirectionalLight ? 0.91 : 0.7));
      view.scene.environmentIntensity =
        initialEnvironment * (1 - interior * 0.78);
      wetness = wetnessForFrame(track, frame.state.distance, frame.time);
      for (const material of waterMaterials)
        material.userData.time.value = frame.time;
      const start = track.zephyrPresentation?.towerStart;
      event = sampleTowerEvent(start == null ? -1 : frame.time - start);
      towerPivot.rotation.z = -event.tilt;
      towerPivot.position.y =
        stonePoint(track, towerS, 280, -32).y - event.drop;
      towerIsland.rotation.z = -event.fall * 0.08;
      towerWater.rotation.z = event.trail * 0.65;
      towerWater.scale.y = 1.6 + event.trail * 0.9;
      for (const { object, rest } of trailingMeshes) {
        const positions = object.geometry.attributes.position;
        for (let i = 0; i < positions.count; i++) {
          const q = Math.max(0, Math.min(1, -rest[i * 3 + 1] / 360));
          positions.setXYZ(
            i,
            rest[i * 3] + q * q * 160 * event.trail,
            rest[i * 3 + 1],
            rest[i * 3 + 2] + q * q * 70 * event.trail,
          );
        }
        positions.needsUpdate = true;
        object.geometry.computeBoundingSphere();
      }
      shipSpray.visible = wetness > 0.02 && !frame.reviewing;
      const droplets = shipSpray.geometry.attributes.position;
      for (let i = 0; i < droplets.count; i++) {
        const phase = (frame.time * 5 + i * 0.73) % 5;
        droplets.setY(i, 0.6 + (i % 5) * 0.22 - phase * 0.12);
        droplets.setZ(i, -1 - phase);
      }
      droplets.needsUpdate = true;
      shipSpray.position.copy(frame.ship.group.position);
      shipSpray.quaternion.copy(frame.ship.group.quaternion);
      dropletMaterial.opacity =
        wetness * (frame.settings.reducedMotion ? 0.2 : 0.55);
      shafts.visible = !frame.reviewing;
      clouds.position.x = frame.settings.reducedMotion
        ? 0
        : Math.sin(frame.time * 0.012) * 7;
    },

    dispose() {
      if (disposed) return;
      disposed = true;
      for (const e of sceneLights) e.light.intensity = e.intensity;
      view.scene.environmentIntensity = initialEnvironment;
      group.add(owners);
      release(group);
    },
  };
}
