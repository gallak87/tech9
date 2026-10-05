import * as T from 'three';
import { assetURL } from '../../../assets/url.js';
import { createZephyrDetails } from './details.js';
import { finishZephyrMaterial } from './materials.js';
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
  'aqueduct-source',
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
export async function createZephyrEnvironment({
  track,
  view,
  shape = false,
  loadTexture = (url) => new T.TextureLoader().loadAsync(url),
  loadAsset = (url) => new GLTFLoader().loadAsync(url),
}) {
  const group = new T.Group();
  group.name = 'Zephyr / suspended sacred archipelago';
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
  if (loaded.some((r) => r.status === 'rejected')) {
    for (const r of loaded)
      if (r.status === 'fulfilled') {
        if (r.value.scene) release(r.value.scene);
        else r.value.dispose();
      }
    throw loaded.find((r) => r.status === 'rejected').reason;
  }
  const library = Object.fromEntries(
    FILES.map((name, i) => [name, loaded[i].value.scene]),
  );
  const stoneTexture = loaded.at(-1).value;
  stoneTexture.colorSpace = T.SRGBColorSpace;
  stoneTexture.wrapS = stoneTexture.wrapT = T.RepeatWrapping;
  stoneTexture.anisotropy = 8;
  const owners = new T.Group();
  Object.values(library).forEach((o) => owners.add(o));
  library['waterfall-curtain'].traverse((o) => {
    for (const m of [o.material].flat().filter(Boolean))
      m.userData.crossingCurtain = true;
  });
  const waterMaterials = new Set();
  owners.traverse((o) => {
    if (!o.isMesh) return;
    o.castShadow = true;
    o.receiveShadow = true;
    const materials = [o.material].flat();
    for (const m of materials) {
      finishZephyrMaterial(m, { stoneTexture });
      if (/water|foam|silver/i.test(m.name)) {
        m.transparent = true;
        m.opacity = /foam/i.test(m.name)
          ? 0.84
          : /deep volume|depth grooves/i.test(m.name)
            ? 0.65
            : 0.6;
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
              '#include <color_fragment>\n float strand=.5+.5*sin(zephyrLocal.x*2.7+sin(zephyrLocal.y*.05-zephyrTime*3.)*.6); float froth=pow(.5+.5*sin(zephyrLocal.y*.8+zephyrLocal.x*1.3+zephyrTime*9.),6.); diffuseColor.rgb=mix(diffuseColor.rgb*(.8+strand*.25),vec3(.92,.97,.95),froth*.35); diffuseColor.a*=(.68+strand*.32)*(1.-smoothstep(260.,367.,-zephyrLocal.y));',
            );
        };
        const waterCompile = m.onBeforeCompile;
        m.onBeforeCompile = (shader) => {
          waterCompile(shader);
          if (m.userData.crossingCurtain)
            shader.fragmentShader = shader.fragmentShader.replace(
              '#include <color_fragment>',
              '#include <color_fragment>\ndiffuseColor.a*=mix(.045,1.,smoothstep(12.,29.,abs(zephyrLocal.x)));',
            );
        };
        m.customProgramCacheKey = () =>
          `zephyr-flow-v4-${m.userData.crossingCurtain ? 'crossing' : 'deep'}`;
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
    if (Array.isArray(scale)) object.scale.set(...scale);
    else object.scale.setScalar(scale);
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
  place('island-grand', track.landmarks.mooring.s - 65, {
    height: -49,
    scale: 0.85,
  });
  place('island-grand', rose + 85, { height: -74, scale: 1.5 });
  place('island-terrace', chapel + 105, { height: -62, scale: 1.1 });
  place('island-terrace', track.landmarks.halo.s, { height: -68, scale: 1.25 });
  const towerS = track.jumps[0].landingStart + 210;
  const towerPivot = new T.Group();
  const towerAnchor = new T.Vector3(550, 60, -400);
  towerPivot.position.copy(towerAnchor);
  towerPivot.rotation.y = Math.atan2(
    groundFrame(track, towerS).tangent.x,
    groundFrame(track, towerS).tangent.z,
  );
  group.add(towerPivot);
  const tower = library['falling-tower'].clone(true);
  tower.scale.setScalar(1.35);
  towerPivot.add(tower);
  const towerIsland = place('island-shard', towerS, {
    position: towerAnchor.toArray(),
    scale: 0.9,
  });
  const towerWater = library.waterfall.clone(true);
  towerWater.position.set(38, 270, 5);
  towerWater.scale.set(0.5, 1.4, 0.7);
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

  const towerMistGeometry = new T.BufferGeometry();
  towerMistGeometry.setAttribute(
    'position',
    new T.Float32BufferAttribute(new Float32Array(128 * 3), 3),
  );
  const towerMistMaterial = new T.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    vertexShader: `varying float mistSize;void main(){vec4 mv=modelViewMatrix*vec4(position,1.);mistSize=clamp(-position.y/360.,0.,1.);gl_PointSize=min(120.,(5.+mistSize*12.)*950./max(20.,-mv.z));gl_Position=projectionMatrix*mv;}`,
    fragmentShader: `varying float mistSize;void main(){float d=length(gl_PointCoord-.5)*2.;float a=(1.-smoothstep(0.,1.,d))*(.035+mistSize*.065);gl_FragColor=vec4(.75,.85,.87,a);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
    }`,
  });
  const towerMist = new T.Points(towerMistGeometry, towerMistMaterial);
  towerMist.name = 'Zephyr / depth spray along falling water';
  towerMist.userData.aoExclude = true;
  towerMist.frustumCulled = false;
  towerWater.add(towerMist);

  place('cloudspire-needle', track.landmarks.cloudspire.s, {
    scale: [1.2, 0.92, 1.2],
    position: [
      track.landmarks.cloudspire.position[0],
      5,
      track.landmarks.cloudspire.position[2],
    ],
  });
  place('island-shard', track.landmarks.cloudspire.s, {
    position: [
      track.landmarks.cloudspire.position[0],
      -10,
      track.landmarks.cloudspire.position[2],
    ],
    scale: 1.5,
  });
  const haloFrame = groundFrame(track, track.landmarks.halo.s);
  const haloCenter = haloFrame.position
    .clone()
    .addScaledVector(haloFrame.tangent, 450)
    .addScaledVector(haloFrame.right, -80)
    .addScaledVector(haloFrame.up, 90);
  const halo = place('broken-halo', track.landmarks.halo.s, {
    position: haloCenter.toArray(),
    scale: 1.3,
  });
  halo.rotation.x = 0.85;
  // A finite family of terraces supports sources, churches and inward views.
  const clearance = createRouteClearance(track, {
    sidePadding: 18,
    localVertical: [-25, 42],
  });
  for (let i = 0; i < 30; i++) {
    const s = ((i + 0.37) * track.length) / 30;
    const side = i % 2 === 0 ? 1 : -1;
    const lateral = side * (165 + ((i * 71) % 140)),
      height = -22 - ((i * 43) % 85),
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
    if (i % 3 === 0) {
      place('chapel', s, {
        lateral,
        height: height + 17,
        scale: 0.64,
        yaw: i * 0.72,
      });
      place('waterfall', s, {
        lateral: lateral + 30,
        height: height - 15,
        scale: 0.55,
      });
    }
  }
  // Taller midground groups meet their own terraces and stay outside every
  // banked route span. Their staggered elevations make the ascent legible.
  for (const [s, side, scale, height, kind] of [
    [360, -1, 0.58, 38, 'chapel'],
    [620, 1, 0.66, 45, 'cathedral-facade'],
    [2060, -1, 0.68, 15, 'falling-tower'],
    [2310, 1, 0.54, -10, 'chapel'],
    [2530, -1, 0.72, 20, 'cathedral-facade'],
    [2890, 1, 0.61, 36, 'chapel'],
    [3290, -1, 0.65, -4, 'falling-tower'],
    [3690, -1, 0.63, 12, 'chapel'],
    [4180, 1, 0.58, 28, 'cathedral-facade'],
    [4640, -1, 0.7, 15, 'chapel'],
  ]) {
    for (const offset of [165, 205, 260, 320]) {
      const lateral = side * offset,
        p = stonePoint(track, s, lateral, height);
      if (
        !clearance.clears(
          p.x,
          p.z,
          245 * scale,
          220 * scale,
          p.y + 270 * scale,
          0,
          p.y - 230 * scale,
        )
      )
        continue;
      const base = kind === 'falling-tower' ? 0 : kind === 'chapel' ? -28 : -34;
      place(kind, s, { lateral, height, scale, yaw: side * 0.34 });
      place('island-grand', s, {
        lateral,
        height: height + base * scale,
        scale: scale * 0.98,
        yaw: side * 0.34,
      });
      place('waterfall', s, {
        lateral: lateral + side * 55 * scale,
        height: height + base * scale - 3,
        scale: scale * 0.65,
      });
      break;
    }
  }
  // Four elevated outer shrines give each quarter of the cloud spiral a
  // different midground silhouette without entering its inner road envelope.
  const spire = track.landmarks.cloudspire.position;
  for (const [dx, dz, y, scale, kind] of [
    [360, 0, 172, 0.58, 'chapel'],
    [0, -360, 125, 0.48, 'cathedral-facade'],
    [-360, 0, 220, 0.62, 'chapel'],
    [0, 360, 150, 0.52, 'falling-tower'],
  ]) {
    const x = spire[0] + dx,
      z = spire[2] + dz;
    if (
      !clearance.clears(
        x,
        z,
        245 * scale,
        220 * scale,
        y + 270 * scale,
        0,
        y - 230 * scale,
      )
    )
      continue;
    const base = kind === 'falling-tower' ? 0 : kind === 'chapel' ? -28 : -34;
    const pos = [x, y, z];
    place(kind, track.landmarks.cloudspire.s, {
      position: pos,
      scale,
      yaw: Math.atan2(dx, dz),
    });
    place('island-grand', track.landmarks.cloudspire.s, {
      position: [x, y + base * scale, z],
      scale: scale * 0.95,
    });
    place('waterfall', track.landmarks.cloudspire.s, {
      position: [x + 42 * scale, y + base * scale, z],
      scale: scale * 0.8,
    });
  }
  function basin(s, height, lateral = 0) {
    place('aqueduct-source', s, { height, lateral });
    place('island-terrace', s, { height: height - 148, lateral, scale: 0.9 });
  }
  const curtains = [];
  for (const curtain of track.curtains) {
    const water = place('waterfall-curtain', curtain.s, {
      height: 62,
      scale: 1,
    });
    curtains.push(water);
    basin(curtain.s, 62);
    const sourceSide = curtain.id === 'falls-curtain' ? -210 : 135;
    basin(curtain.s - 55, 165, sourceSide);
    place('island-terrace', curtain.s, {
      lateral: -124,
      height: 62,
      scale: 0.72,
    });
    place('waterfall', curtain.s - 55, {
      lateral: sourceSide,
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
    opacity: 0.016,
    depthWrite: false,
    side: T.DoubleSide,
  });
  shaftMaterial.onBeforeCompile = (shader) => {
    shader.vertexShader =
      'varying vec2 shaftUV;\n' +
      shader.vertexShader.replace(
        '#include <begin_vertex>',
        '#include <begin_vertex>\nshaftUV=uv;',
      );
    shader.fragmentShader =
      'varying vec2 shaftUV;\n' +
      shader.fragmentShader.replace(
        '#include <color_fragment>',
        '#include <color_fragment>\ndiffuseColor.a*=pow(sin(shaftUV.x*3.14159),3.)*sin(shaftUV.y*3.14159);',
      );
  };
  const shaftGeometry = new T.CylinderGeometry(1.4, 9, 66, 24, 1, true);
  for (let s = rose + 28; s < track.jumps[1].takeoff - 25; s += 89) {
    const m = new T.Mesh(shaftGeometry, shaftMaterial);
    m.position.copy(stonePoint(track, s, 24, 30));
    m.rotation.z = -0.38;
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
  const cloudGeometry = new T.BufferGeometry();
  const cloudPositions = [];
  for (let i = 0; i < 80; i++) {
    const a = i * 2.39996,
      r = 440 + (i % 13) * 80;
    cloudPositions.push(
      Math.cos(a) * r,
      -210 - (i % 7) * 23,
      320 + Math.sin(a) * r,
    );
  }
  cloudGeometry.setAttribute(
    'position',
    new T.Float32BufferAttribute(cloudPositions, 3),
  );
  const cloudMaterial = new T.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    uniforms: { clock: { value: 0 } },
    vertexShader: `varying float seed;void main(){seed=position.x*.031;vec4 mv=modelViewMatrix*vec4(position,1.);gl_PointSize=min(460.,150000./max(50.,-mv.z));gl_Position=projectionMatrix*mv;}`,
    fragmentShader: `varying float seed;uniform float clock;
    void main(){vec2 p=gl_PointCoord*2.-1.;float r=length(p*vec2(.85,1.6));float n=.75+.25*sin(p.x*11.+seed)*sin(p.y*13.+seed);float a=(1.-smoothstep(.1,1.,r))*n*.26;gl_FragColor=vec4(mix(vec3(.45,.38,.56),vec3(.86,.72,.68),gl_PointCoord.y),a);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
    }`,
  });
  const clouds = new T.Points(cloudGeometry, cloudMaterial);
  clouds.name = 'Zephyr / translucent lower cloud shelves';
  clouds.userData.aoExclude = true;
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
  dropletMaterial.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <color_fragment>',
      '#include <color_fragment>\ndiffuseColor.a*=1.-smoothstep(.12,.5,length(gl_PointCoord-.5));',
    );
  };
  const shipSpray = new T.Points(dropletGeometry, dropletMaterial);
  shipSpray.name = 'Zephyr / water streaming from Kestrel';
  shipSpray.frustumCulled = false;
  group.add(shipSpray);
  const shipMaterials = new Map();
  const detail = createZephyrDetails({ track, stoneTexture });
  group.add(detail.group);
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
      detail.update(frame);
      interior = frame.reviewing ? 0 : interiorAt(track, frame.state.distance);
      for (const entry of sceneLights)
        entry.light.intensity =
          entry.intensity *
          (1 - interior * (entry.light.isDirectionalLight ? 0.86 : 0.58));
      view.scene.environmentIntensity =
        initialEnvironment * (1 - interior * 0.62);
      wetness = wetnessForFrame(track, frame.state.distance, frame.time);
      const activeShipMaterials = new Set();
      frame.ship.group.traverse((object) => {
        for (const m of [object.material].flat().filter(Boolean)) {
          if (!m.isMeshStandardMaterial) continue;
          activeShipMaterials.add(m);
          if (!shipMaterials.has(m)) shipMaterials.set(m, m.roughness);
          m.roughness = Math.max(
            0.16,
            shipMaterials.get(m) * (1 - wetness * 0.55),
          );
        }
      });
      for (const [m, roughness] of shipMaterials)
        if (!activeShipMaterials.has(m)) {
          m.roughness = roughness;
          shipMaterials.delete(m);
        }
      for (const material of waterMaterials)
        material.userData.time.value = frame.settings.reducedMotion
          ? 0
          : frame.time;
      const start = track.zephyrPresentation?.towerStart;
      event = sampleTowerEvent(start == null ? -1 : frame.time - start);
      towerPivot.rotation.z = event.tilt * 0.42;
      towerPivot.rotation.x = event.tilt * 0.8;
      towerPivot.position.y = towerAnchor.y - event.drop;
      towerIsland.rotation.z = -event.fall * 0.08;
      towerWater.rotation.z = -event.trail * 0.25;
      towerWater.rotation.x = -event.trail * 0.3;
      towerWater.scale.y = 1.4 + event.trail * 0.3;
      for (const { object, rest } of trailingMeshes) {
        const positions = object.geometry.attributes.position;
        for (let i = 0; i < positions.count; i++) {
          const q = Math.max(0, Math.min(1, -rest[i * 3 + 1] / 360));
          positions.setXYZ(
            i,
            rest[i * 3] + (2 * q - q * q) * 850 * event.trail,
            rest[i * 3 + 1],
            rest[i * 3 + 2] - q * q * 180 * event.trail,
          );
        }
        positions.needsUpdate = true;
        object.geometry.computeBoundingSphere();
      }
      const mist = towerMistGeometry.attributes.position;
      const mistTime = frame.settings.reducedMotion ? 0 : frame.time;
      for (let i = 0; i < mist.count; i++) {
        const q = (i * 0.61803398875 + mistTime * 0.1) % 1;
        mist.setXYZ(
          i,
          (2 * q - q * q) * 850 * event.trail + Math.sin(i * 8.71) * 24,
          -q * 360 + Math.cos(i * 11.3) * 7,
          q * q * (22 - 180 * event.trail) + Math.sin(i * 7.31) * 18,
        );
      }
      mist.needsUpdate = true;
      towerMist.visible = event.fall > 0.01;
      towerMistGeometry.setDrawRange(
        0,
        frame.settings.quality === 'low' ? 64 : 128,
      );
      shipSpray.visible = wetness > 0.02 && !frame.reviewing;
      const droplets = shipSpray.geometry.attributes.position;
      for (let i = 0; i < droplets.count; i++) {
        const phase =
          ((frame.settings.reducedMotion ? 0 : frame.time) * 5 + i * 0.73) % 5;
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
      for (const [m, roughness] of shipMaterials) m.roughness = roughness;
      shipMaterials.clear();
      for (const e of sceneLights) e.light.intensity = e.intensity;
      view.scene.environmentIntensity = initialEnvironment;
      group.add(owners);
      release(group);
    },
  };
}
