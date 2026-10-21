import { createForestDressing } from './forest-dressing.js';
import { loadForestLook } from './forest-look.js';
import { refineHollow } from './hero-finish.js';
import { assetURL } from '../../../assets/url.js';
import * as T from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import {
  createRouteClearance,
  groundFrame,
} from '../../../environment/placement.js';
import {
  seededRandom,
  disposeResources,
  instanceTemplate,
  tube,
  createSceneryClearance,
  consolidateStaticInstances,
} from './geometry.js';
import {
  finishVesperMaterial,
  setVesperSurfaceDetail,
  shareForestMaterials,
} from './materials.js';
import {
  vesperGroundHeight,
  vesperTerrainHeight,
  VESPER_TERRAIN_X,
  VESPER_TERRAIN_Z,
  VESPER_TERRAIN_SEGMENTS,
} from './terrain.js';
import { createGroundedTree } from './trees.js';

const ASSET_URL = assetURL('assets/levels/vesper/vesper-canopy.glb');
const FOREST_ASSET_URL = assetURL(
  'assets/levels/vesper/vesper-connected-forest-v1.glb',
);
const ENVIRONMENT_LIGHT_UPLIFT = 1.1;

export function createVesperEnvironment({
  track,
  settings = {},
  loadAsset,
} = {}) {
  const group = new T.Group();
  group.name = 'Vesper / layered living canopy and amber transport habitat';
  const details = new T.Group();
  details.name = 'Vesper / optional fine foliage';
  group.add(details);
  const highTrees = new T.Group();
  const lowTrees = new T.Group();
  highTrees.name = 'Vesper / close foliage geometry high';
  lowTrees.name = 'Vesper / close foliage geometry low';
  group.add(highTrees, lowTrees);
  const random = seededRandom();
  const clearance = createRouteClearance(track, {
    sidePadding: 14,
    localVertical: [-16, 30],
  });
  const ground = track.groundY ?? -100;
  const dawnSection = track.sections.find(
    (section) => section.id === 'dawnscar',
  );
  const dawnFrame = groundFrame(track, dawnSection.showcase - 15);
  const dawnDirection = track
    .sample(dawnSection.showcase + 115)
    .position.sub(dawnFrame.position)
    .setY(0)
    .normalize();
  const inCanopyClearing = (position) =>
    position.x > 440 &&
    position.x < 1140 &&
    position.z > -235 &&
    position.z < 170;
  const inDawnOpening = (position, radius = 0) => {
    const d = position.clone().sub(dawnFrame.position);
    const along = d.dot(dawnDirection);
    const across = Math.abs(d.x * dawnDirection.z - d.z * dawnDirection.x);
    return along > 60 && along < 2200 && across < 55 + along * 0.28 + radius;
  };
  const ownedMaterials = [];
  let forestLook;
  let forestDressing;
  const surfaceMaterials = new Set();
  const material = (name, options) => {
    const value = new T.MeshStandardMaterial({ name, ...options });
    if (value.emissive.getHex() !== 0)
      value.emissiveIntensity *= ENVIRONMENT_LIGHT_UPLIFT;
    finishVesperMaterial(value);
    surfaceMaterials.add(value);
    ownedMaterials.push(value);
    return value;
  };
  const bark = material('Vesper / structural living root', {
    color: '#25352f',
    roughness: 0.88,
  });
  const sapwood = material('Vesper / root collar cut face', {
    color: '#88714a',
    roughness: 0.76,
  });
  const poolMaterial = material('Vesper / still black fungal pools', {
    color: '#091f26',
    roughness: 0.15,
    metalness: 0.5,
  });
  const floorMaterial = material('Vesper / forest floor terraces', {
    color: '#4b5a50',
    roughness: 0.96,
  });
  let disposed = false;
  const loading = new AbortController();
  let assetScene;
  const treeLods = [];
  const qualityFoliage = [];
  const metrics = {
    assetUrl: ASSET_URL,
    authoredTemplates: 24,
    forestAssetUrl: FOREST_ASSET_URL,
    connectedTrees: 0,
    rootedUnderstory: 0,
    connectedTreePilots: 0,
    closeTrees: 0,
    distantTrees: 0,
    foliageClusters: 0,
    fungusClusters: 0,
    supportAnchors: 0,
    shellAnchors: 0,
    omittedAnchors: 0,
    gateTrunks: 0,
    heroLandmarks: 3,
    activeCreatures: 0,
    activeCreatureEvents: 0,
    bendingCrowns: 0,
    staticClearingTrees: 0,
    renderedTriangles: null,
    loadState: 'pending',
    clearanceRejected: 0,
  };
  group.userData.metrics = metrics;
  group.userData.anchorClearance = {
    omitted: [],
    radius: 4,
    routeSpacing: 6,
    curveSpacing: 3,
  };

  // Uneven three-dimensional floor remains well below the lowest usable deck.
  const floorGeometry = new T.PlaneGeometry(
    4200,
    3700,
    ...VESPER_TERRAIN_SEGMENTS,
  ).rotateX(-Math.PI / 2);
  const vertices = floorGeometry.attributes.position;
  const floorColors = new Float32Array(vertices.count * 3);
  const earth = new T.Color();
  for (let i = 0; i < vertices.count; i++) {
    const x = VESPER_TERRAIN_X[i % VESPER_TERRAIN_X.length] - 300,
      z = VESPER_TERRAIN_Z[Math.floor(i / VESPER_TERRAIN_X.length)];
    vertices.setXYZ(i, x, vesperGroundHeight(x + 300, z, ground), z);
    floorGeometry.attributes.uv.setXY(i, (x + 300) / 36, z / 36);
    const mottling =
      0.5 +
      0.5 *
        Math.sin(x * 0.018 + Math.cos(z * 0.011) * 2) *
        Math.sin(z * 0.024 + x * 0.008);
    earth
      .setRGB(
        0.55 + 0.35 * mottling,
        0.62 + 0.32 * mottling,
        0.49 + 0.27 * mottling,
      )
      .toArray(floorColors, i * 3);
  }
  floorGeometry.setAttribute('color', new T.BufferAttribute(floorColors, 3));
  floorGeometry.computeVertexNormals();
  const floor = new T.Mesh(floorGeometry, floorMaterial);
  floor.position.set(300, 0, 0);
  floor.receiveShadow = true;
  floor.name = 'Vesper / continuous ravine floor and root terraces';
  group.add(floor);

  // Match the raceway builder's paired root sockets; each terminates in a grounded collar.
  const anchorParts = [];
  const clearsSupport = createSceneryClearance(track);
  // Keep the defining enclosed trunk outside the internal road spiral.
  const hollowData = {
    ...track.landmarks.hollow,
    radius: track.landmarks.hollow.radius + 46,
  };
  const hollowCenter = new T.Vector3(...hollowData.center);
  const collars = [];
  for (let s = 18; s < track.length; s += 76) {
    if (track.isGap?.(s)) continue;
    const f = track.sample(s);
    for (const side of [-1, 1]) {
      if (side === 1 && s >= 1460 && s <= 1540) continue;
      const depth = Math.min(48, Math.max(24, (f.position.y + 80) * 0.55));
      const socket = f.position
        .clone()
        .addScaledVector(f.right, side * 25)
        .addScaledVector(f.up, -depth)
        .addScaledVector(f.tangent, -17);
      let accepted = null;
      let grounded = true;
      // Interior loads enter the enclosing living trunk without crossing the lower spiral.
      const radial = socket.clone().sub(hollowCenter).setY(0);
      if (
        radial.length() < hollowData.radius + 22 &&
        socket.y > hollowData.base + 18 &&
        socket.y < hollowData.top - 12
      ) {
        const baseAngle = Math.atan2(radial.z, radial.x);
        for (const offset of [0, 0.18, -0.18, 0.38, -0.38, 0.65, -0.65]) {
          const a = baseAngle + offset,
            t =
              (socket.y - 10 - hollowData.base) /
              (hollowData.top - hollowData.base);
          const radius =
            hollowData.radius * (1 - 0.08 * t) +
            5.5 * Math.sin(a * 19 + t * 3) +
            2.2 * Math.sin(a * 37 - t * 4) -
            4;
          const end = new T.Vector3(
            hollowCenter.x + Math.cos(a) * radius,
            socket.y - 10,
            hollowCenter.z + Math.sin(a) * radius,
          );
          const knee = socket
            .clone()
            .lerp(end, 0.55)
            .add(new T.Vector3(0, -5, 0));
          if (clearsSupport([socket, knee, end])) {
            accepted = [socket, knee, end];
            grounded = false;
            break;
          }
        }
      }
      if (!accepted && radial.length() < hollowData.radius + 22) {
        const a0 = Math.atan2(radial.z, radial.x);
        search: for (const heightOffset of [15, 30, -30, -45, 45]) {
          for (const offset of [
            0, 0.4, -0.4, 0.8, -0.8, 1.2, -1.2, 1.6, -1.6,
          ]) {
            const y = socket.y + heightOffset;
            if (y < hollowData.base + 12 || y > hollowData.top - 20) continue;
            const a = a0 + offset,
              t = (y - hollowData.base) / (hollowData.top - hollowData.base);
            const radius =
              hollowData.radius * (1 - 0.08 * t) +
              5.5 * Math.sin(a * 19 + t * 3) +
              2.2 * Math.sin(a * 37 - t * 4) -
              4;
            const end = new T.Vector3(
              hollowCenter.x + Math.cos(a) * radius,
              y,
              hollowCenter.z + Math.sin(a) * radius,
            );
            const knee = socket.clone().lerp(end, 0.48);
            if (clearsSupport([socket, knee, end])) {
              accepted = [socket, knee, end];
              grounded = false;
              break search;
            }
          }
        }
      }
      // During the deliberate inversion, the local "down" socket can sit
      // above the road. Grow out around its world-space side before descending
      // to earth; a local-right search at quarter-roll points straight down
      // through the driving corridor and leaves the socket unconnected.
      if (track.inversions?.some(({ start, end }) => s >= start && s <= end)) {
        const outward = socket.clone().sub(f.position).setY(0).normalize();
        for (const offset of [40, 65, 100]) {
          const foot = socket.clone().addScaledVector(outward, offset);
          foot.y = vesperTerrainHeight(foot.x, foot.z, ground) - 4;
          const knee = socket
            .clone()
            .lerp(foot, 0.44)
            .addScaledVector(outward, 20);
          if (clearsSupport([socket, knee, foot])) {
            accepted = [socket, knee, foot];
            grounded = true;
            break;
          }
        }
      }
      if (!accepted)
        for (const offset of [10, 35, 65, 100, -35, -65]) {
          const foot = socket.clone().addScaledVector(f.right, side * offset);
          foot.y = vesperTerrainHeight(foot.x, foot.z, ground) - 4;
          const knee = socket
            .clone()
            .lerp(foot, 0.44)
            .addScaledVector(f.right, side * 5);
          if (clearsSupport([socket, knee, foot])) {
            accepted = [socket, knee, foot];
            break;
          }
        }
      if (!accepted) {
        metrics.omittedAnchors++;
        group.userData.anchorClearance.omitted.push({ s, side });
        continue;
      }
      anchorParts.push(
        tube(accepted, grounded ? [3.6, 4.2, 7] : [3.6, 4.2, 5], 18, 9),
      );
      if (grounded)
        collars.push({
          position: accepted[2].clone().add(new T.Vector3(0, 3, 0)),
          scale: [12, 6, 11],
        });
      else metrics.shellAnchors++;
      metrics.supportAnchors++;
    }
  }
  if (anchorParts.length) {
    const geometry = mergeGeometries(anchorParts);
    for (const part of anchorParts) part.dispose();
    const mesh = new T.Mesh(geometry, bark);
    mesh.name = 'Vesper / load sockets carried into grounded root columns';
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
  }
  const collarMesh = new T.InstancedMesh(
    new T.IcosahedronGeometry(1, 1),
    sapwood,
    collars.length,
  );
  const dummy = new T.Object3D();
  collars.forEach((collar, i) => {
    dummy.position.copy(collar.position);
    dummy.scale.fromArray(collar.scale);
    dummy.updateMatrix();
    collarMesh.setMatrixAt(i, dummy.matrix);
  });
  collarMesh.name = 'Vesper / rooted load-transfer collars';
  collarMesh.receiveShadow = true;
  group.add(collarMesh);

  // Pooled warm fill carries amber resin light along the circuit.
  const resinLightSites = [];
  for (let s = 4; s < track.length; s += 42) {
    const f = track.sample(s);
    const side = Math.floor(s / 42) % 2 ? 1 : -1;
    const p = f.position
      .clone()
      .addScaledVector(f.right, side * 23)
      .addScaledVector(f.up, 8);
    resinLightSites.push({ s, position: p });
  }
  const practicalLights = Array.from({ length: 7 }, () => {
    const light = new T.PointLight(
      '#ffc878',
      850 * ENVIRONMENT_LIGHT_UPLIFT,
      115,
      2,
    );
    group.add(light);
    return light;
  });

  // Rootfall uses open ribs with a wide camera aperture, alternating dark pockets and exits.
  const rootfall = track.sections.find((section) => section.id === 'rootfall');
  const vault = track.sections.find((section) => section.id === 'vault');
  if (rootfall) {
    const ribs = [];
    for (let s = rootfall.start + 24, k = 0; s < rootfall.end; s += 52, k++) {
      const f = track.sample(s);
      const points = [];
      const sweep = 8 * Math.sin(k * 2.4);
      for (let j = 0; j <= 16; j++) {
        const a = (j / 16) * Math.PI;
        const p = f.position
          .clone()
          .addScaledVector(f.right, Math.cos(a) * (54 + 5 * Math.sin(k)))
          .addScaledVector(
            f.up,
            Math.sin(a) * (57 + 5 * Math.cos(k * 1.7)) - 12,
          )
          .addScaledVector(f.tangent, sweep + Math.sin(a * 2) * 13);
        if (j === 0 || j === 16)
          p.y = vesperTerrainHeight(p.x, p.z, ground) - 3;
        points.push(p);
      }
      if (!clearsSupport(points, 6.5)) continue;
      ribs.push(tube(points, [7, 5.4, 3.8, 5.2, 8], 42, 9));
      for (const side of [-1, 1]) {
        const base = points[side < 0 ? 0 : 16];
        const reach = base
          .clone()
          .addScaledVector(f.tangent, 33 + 9 * Math.sin(k));
        reach.y = vesperTerrainHeight(reach.x, reach.z, ground) - 1;
        const knee = base
          .clone()
          .lerp(reach, 0.35)
          .add(new T.Vector3(0, 10, 0));
        if (clearsSupport([base, knee, reach], 6))
          ribs.push(tube([base, knee, reach], [7, 4, 0.6], 15, 8));
      }
    }
    if (ribs.length) {
      const geometry = mergeGeometries(ribs);
      ribs.forEach((rib) => rib.dispose());
      const mesh = new T.Mesh(geometry, bark);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.name = 'Vesper / open exposed-root descent ribs';
      group.add(mesh);
    }
  }
  if (vault) {
    for (let s = vault.start + 26; s < vault.end; s += 76) {
      const f = groundFrame(track, s);
      for (const side of [-1, 1]) {
        const pool = new T.Mesh(
          new T.CircleGeometry(36, 32).rotateX(-Math.PI / 2),
          poolMaterial,
        );
        pool.position.copy(f.position).addScaledVector(f.right, side * 64);
        pool.position.y =
          vesperTerrainHeight(pool.position.x, pool.position.z, ground) - 2;
        pool.scale.set(1, 1, 0.63);
        pool.name = 'Vesper / shallow mycelium pool';
        group.add(pool);
      }
    }
  }

  if (vault) {
    const vaultRoots = [];
    for (let s = vault.start + 30; s < vault.end; s += 103) {
      const f = groundFrame(track, s);
      for (const side of [-1, 1]) {
        const a = f.position
          .clone()
          .addScaledVector(f.right, side * 44)
          .add(new T.Vector3(0, -26, 0));
        const b = a
          .clone()
          .addScaledVector(f.right, side * 22)
          .addScaledVector(f.tangent, 31)
          .add(new T.Vector3(0, 16, 0));
        const c = b
          .clone()
          .addScaledVector(f.tangent, 36)
          .add(new T.Vector3(0, -12, 0));
        if (clearsSupport([a, b, c], 5))
          vaultRoots.push(tube([a, b, c], 4.5, 13, 7));
      }
    }
    if (vaultRoots.length) {
      const g = mergeGeometries(vaultRoots);
      vaultRoots.forEach((x) => x.dispose());
      const roots = new T.Mesh(g, bark);
      roots.name = 'Vesper / low fungal root shelves';
      roots.receiveShadow = true;
      group.add(roots);
    }
    const cool = new T.PointLight(
      '#6ac9c0',
      580 * ENVIRONMENT_LIGHT_UPLIFT,
      145,
      2,
    );
    cool.position
      .copy(track.sample(vault.showcase + 45).position)
      .add(new T.Vector3(25, 25, 0));
    group.add(cool);
  }
  // Torn boughs frame an intentional pale horizon opening on the return.
  const scarRibs = [];
  for (const side of [-1, 1]) {
    const f = groundFrame(track, dawnSection.showcase + 50);
    const a = f.position
      .clone()
      .addScaledVector(f.right, side * 65)
      .add(new T.Vector3(0, -50, 0));
    const b = a
      .clone()
      .addScaledVector(f.right, side * 9)
      .add(new T.Vector3(0, 89, 0));
    const c = b
      .clone()
      .addScaledVector(f.right, -side * 35)
      .addScaledVector(f.tangent, 17)
      .add(new T.Vector3(0, 31, 0));
    if (clearsSupport([a, b, c], 8)) scarRibs.push(tube([a, b, c], 7, 22, 9));
  }
  if (scarRibs.length) {
    const g = mergeGeometries(scarRibs);
    scarRibs.forEach((x) => x.dispose());
    const crown = new T.Mesh(g, bark);
    crown.name = 'Vesper / torn crown framing Dawnscar';
    crown.castShadow = true;
    crown.receiveShadow = true;
    group.add(crown);
  }

  async function accept(gltf) {
    assetScene = gltf.scene;
    if (disposed) {
      disposeResources([assetScene]);
      assetScene.clear();
      return;
    }
    assetScene.updateMatrixWorld(true);
    const get = (name) => {
      const value = assetScene.getObjectByName(name);
      if (!value) throw new Error(`Vesper asset is missing ${name}`);
      return value;
    };
    const finishedMaterials = new Set();
    assetScene.traverse((object) => {
      if (!object.isMesh) return;
      for (const m of [object.material].flat()) {
        if (finishedMaterials.has(m)) continue;
        finishedMaterials.add(m);
        if (m.emissive && m.emissive.getHex() !== 0)
          m.emissiveIntensity *= ENVIRONMENT_LIGHT_UPLIFT;
        m.side = T.DoubleSide;
        m.envMapIntensity = 0.32;
        finishVesperMaterial(m);
        surfaceMaterials.add(m);
      }
    });
    const livingBark = [...finishedMaterials].find((m) =>
      /ridged indigo bark/.test(m.name),
    );
    if (livingBark) {
      for (const key of ['map', 'normalMap', 'roughnessMap'])
        bark[key] = livingBark[key];
      bark.color.set('#a2afa4');
      bark.normalScale.copy(livingBark.normalScale);
      finishVesperMaterial(bark);
      if (forestLook) {
        forestLook.apply(bark);
        finishVesperMaterial(bark);
      }
      bark.needsUpdate = true;
      sapwood.map = livingBark.map;
      sapwood.normalMap = livingBark.normalMap;
      sapwood.normalScale.copy(livingBark.normalScale);
      sapwood.color.set('#65715d');
      if (forestLook) {
        forestLook.apply(sapwood, 'sapwood');
        finishVesperMaterial(sapwood);
      }
      sapwood.needsUpdate = true;
    }
    const groundSurface = assetScene.getObjectByName('forest_floor_surface');
    if (groundSurface?.material) {
      floor.material = groundSurface.material;
      floor.material.vertexColors = true;
      floor.material.envMapIntensity = 0.3;
      for (const map of [
        floor.material.map,
        floor.material.normalMap,
        floor.material.roughnessMap,
      ])
        if (map) map.anisotropy = 8;
      floor.material.needsUpdate = true;
    }
    const hollow = get('hero_hollow').clone(true);
    hollow.position.set(
      track.landmarks.hollow.center[0],
      track.landmarks.hollow.base,
      track.landmarks.hollow.center[2],
    );
    hollow.name =
      'Vesper / colossal living hollow with route-cut entry and crown';
    const hollowBarkMaterials = new Map();
    hollow.traverse((object) => {
      if (object.isMesh) {
        const source = object.material;
        if (source?.normalMap && /bark|cambium|sapwood/.test(source.name)) {
          if (!hollowBarkMaterials.has(source)) {
            const material = source.clone();
            if (/ridged indigo bark/.test(source.name)) {
              // Keep the landmark's authored broad plates and UV grain;
              // Worldkit finishes the exposed wood and new growth around it.
              material.userData.vesperBarkProjection = true;
              material.normalScale.set(0.12, 0.12);
            } else if (forestLook)
              forestLook.apply(
                material,
                /cambium/.test(source.name)
                  ? 'cambium'
                  : /sapwood/.test(source.name)
                    ? 'sapwood'
                    : 'bark',
              );
            else material.normalScale.set(0.45, 0.45);
            finishVesperMaterial(material);
            surfaceMaterials.add(material);
            hollowBarkMaterials.set(source, material);
          }
          object.material = hollowBarkMaterials.get(source);
        }
        object.castShadow = !/leaves/.test(object.material?.name ?? '');
        object.receiveShadow = true;
      }
    });
    const heroFinish = refineHollow(hollow, track);
    for (const material of heroFinish.materials) {
      finishVesperMaterial(material);
      surfaceMaterials.add(material);
    }
    metrics.heroFinish = heroFinish.stats;
    group.add(hollow);
    hollow.traverse((object) => {
      if (object.userData.foliageQuality) qualityFoliage.push(object);
    });
    const flowerFrame = groundFrame(track, track.landmarks.flower.s);
    const flower = get('hero_flower').clone(true);
    flower.position
      .copy(flowerFrame.position)
      .addScaledVector(flowerFrame.right, 21);
    flower.position.y += 137;
    flower.rotation.y = -0.3;
    flower.name = 'Vesper / enormous hanging layered flower';
    flower.traverse((object) => {
      if (object.isMesh) {
        object.castShadow = true;
        object.receiveShadow = true;
      }
    });
    group.add(flower);
    const flowerLight = new T.PointLight(
      '#ffe2ba',
      1250 * ENVIRONMENT_LIGHT_UPLIFT,
      160,
      2,
    );
    flowerLight.position.copy(flower.position).add(new T.Vector3(0, -35, 0));
    group.add(flowerLight);
    const stationFrame = groundFrame(track, track.landmarks.station.s + 20);
    const station = get('seedpod_station').clone(true);
    station.position
      .copy(stationFrame.position)
      .addScaledVector(stationFrame.right, 53);
    station.position.y -= 7;
    station.rotation.y = Math.atan2(
      stationFrame.tangent.x,
      stationFrame.tangent.z,
    );
    station.name = 'Vesper / split seedpod station';
    group.add(station);
    const stationLight = new T.PointLight(
      '#ffc77c',
      1000 * ENVIRONMENT_LIGHT_UPLIFT,
      95,
      2,
    );
    stationLight.position.copy(station.position).add(new T.Vector3(0, 20, 0));
    group.add(stationLight);
    const branchFrame = groundFrame(track, track.jumps[0].landingStart + 95);
    const branch = get('landing_branch').clone(true);
    branch.position.copy(branchFrame.position).add(new T.Vector3(0, -6, 0));
    branch.rotation.y = Math.atan2(
      branchFrame.tangent.x,
      branchFrame.tangent.z,
    );
    group.add(branch);

    const templateBounds = [0, 1, 2].map((i) =>
      new T.Vector3().fromArray(
        get(`connected_tree_${i}`).userData.clearanceSize,
      ),
    );
    // Near/mid/far layers are authored geometry instances with clearance in every district.
    const near = [[], [], []],
      distant = [[], [], []],
      foliage = [[], [], []],
      roots = [[], []],
      fans = [];
    for (let s = 35; s < track.length; s += 101) {
      const f = groundFrame(track, s);
      for (const side of [-1, 1]) {
        const variant = Math.floor(random() * 3),
          scale = 0.75 + random() * 0.48;
        const p = f.position
          .clone()
          .addScaledVector(f.right, side * (114 + random() * 76))
          .addScaledVector(f.tangent, (random() - 0.5) * 60);
        p.y = ground;
        const height = templateBounds[variant].y * scale;
        const footprint =
          Math.max(templateBounds[variant].x, templateBounds[variant].z) *
            scale +
          8;
        if (
          !clearance.clears(
            p.x,
            p.z,
            footprint,
            footprint,
            ground + height,
            0,
            ground - 5,
          ) ||
          p.distanceTo(new T.Vector3(...track.landmarks.hollow.center)) < 245
        ) {
          metrics.clearanceRejected++;
          continue;
        }
        if (inDawnOpening(p, footprint * 0.5) || inCanopyClearing(p)) continue;
        const place = {
          position: p.toArray(),
          scale: [scale, scale, scale],
          yaw: random() * Math.PI * 2,
        };
        if (near.flat().length < 34) near[variant].push(place);
        else distant[variant].push(place);
      }
      for (const side of [-1, 1]) {
        const p = f.position
          .clone()
          .addScaledVector(f.right, side * (82 + random() * 20));
        p.y -= 18 + random() * 26;
        if (clearance.clears(p.x, p.z, 65, 65, p.y + 26, 0, p.y - 6)) {
          const variant = Math.floor(random() * 3);
          foliage[variant].push({
            position: p.toArray(),
            scale: [0.8, 0.8, 0.8],
            yaw: random() * Math.PI * 2,
          });
        }
        const rp = f.position
          .clone()
          .addScaledVector(f.right, side * 52)
          .add(new T.Vector3(0, -28, 0));
        if (
          clearance.clears(
            rp.x,
            rp.z,
            28,
            85,
            rp.y + 8,
            Math.atan2(f.tangent.x, f.tangent.z),
            rp.y - 25,
          )
        )
          roots[Math.floor(random() * 2)].push({
            position: rp.toArray(),
            yaw: Math.atan2(f.tangent.x, f.tangent.z),
          });
      }
    }
    const center = new T.Vector3(290, ground, -10);
    for (let i = 0; i < 138; i++) {
      const a = random() * Math.PI * 2,
        radius = 600 + random() * 1450;
      const p = center
        .clone()
        .add(new T.Vector3(Math.cos(a) * radius, 0, Math.sin(a) * radius));
      const variant = i % 3,
        scale = 1.0 + random() * 1.7;
      if (
        !clearance.clears(
          p.x,
          p.z,
          Math.max(templateBounds[variant].x, templateBounds[variant].z) *
            scale,
          Math.max(templateBounds[variant].x, templateBounds[variant].z) *
            scale,
          ground + 240 * scale,
          0,
          ground,
        )
      )
        continue;
      if (inDawnOpening(p, 65 * scale) || inCanopyClearing(p)) continue;
      distant[variant].push({
        position: p.toArray(),
        scale: [scale, scale, scale],
        yaw: random() * Math.PI * 2,
      });
    }
    if (vault) {
      // Unequal colonies share a rooted bank; open stretches separate them.
      // Young shelves sit below the larger stocks rather than repeating a row.
      for (const [fraction, side, juveniles] of [
        [0.08, -1, 1],
        [0.27, 1, 0],
        [0.45, -1, 2],
        [0.69, 1, 1],
        [0.91, -1, 0],
      ]) {
        const s = vault.start + (vault.end - vault.start) * fraction;
        const f = groundFrame(track, s);
        for (let age = 0; age <= juveniles; age++) {
          const focal = fraction === 0.45;
          const scale = focal
            ? age
              ? 0.44 + age * 0.18
              : 1.15
            : age
              ? 0.38 + age * 0.14
              : 0.82 + fraction * 0.14;
          const p = f.position
            .clone()
            .addScaledVector(f.right, side * ((focal ? 84 : 72) + age * 12))
            .addScaledVector(f.tangent, age * 16 - (focal ? 0 : juveniles * 5));
          p.y += focal ? 12 - age * 6 : -25 - age * 10;
          if (
            !clearance.clears(
              p.x,
              p.z,
              51 * scale,
              51 * scale,
              p.y + 50 * scale,
              0,
              p.y,
            )
          )
            continue;
          fans.push({
            position: p.toArray(),
            yaw: s * 0.027 + side,
            scale: [scale, scale, scale],
          });
        }
      }
    }
    const addTree = (template, placement, target) => {
      const tree = createGroundedTree(template, placement, ground);
      target.add(tree);
      return tree;
    };
    const addTreeLod = (
      variant,
      placement,
      target,
      range = 300,
      family = 'connected_tree',
    ) => {
      const detailed = addTree(get(`${family}_${variant}`), placement, target);
      const simple = addTree(
        get(`connected_tree_lod_${variant}`),
        placement,
        target,
      );
      treeLods.push({
        detailed,
        simple,
        center: detailed.position.clone().add(new T.Vector3(0, 100, 0)),
        range,
      });
      metrics.connectedTrees++;
      return detailed;
    };
    const understoryLayers = new Map(
      ['high', 'low'].map((quality) => {
        const layer = new T.Group();
        layer.userData.foliageQuality = quality;
        layer.userData.forestCellSize = 250;
        return [quality, layer];
      }),
    );
    const inMatureGrove = (placement) => {
      const [x, , z] = placement.position;
      return ((x - 500) / 175) ** 2 + ((z + 265) / 200) ** 2 < 1;
    };
    for (let i = 0; i < 3; i++) {
      near[i] = near[i].filter((placement) => !inMatureGrove(placement));
      distant[i] = distant[i].filter((placement) => !inMatureGrove(placement));
      foliage[i] = foliage[i].filter((placement) => !inMatureGrove(placement));
      for (const placement of near[i]) addTreeLod(i, placement, highTrees);
      for (const placement of distant[i]) {
        const tree = addTree(get(`connected_tree_lod_${i}`), placement, group);
        tree.userData.batchForest = true;
        metrics.connectedTrees++;
      }
      for (const placement of foliage[i]) {
        // Former floating leaf islands become small rooted understory trees.
        const [x, , z] = placement.position;
        const y = vesperTerrainHeight(x, z, ground);
        const size =
          Math.max(templateBounds[i].x, templateBounds[i].z) * 0.46 + 8;
        if (
          !clearance.clears(
            x,
            z,
            size,
            size,
            y + templateBounds[i].y * 0.72,
            0,
            y - 8,
          )
        )
          continue;
        for (const [quality, layer] of understoryLayers) {
          const tree = addTree(
            get(`connected_tree_${quality === 'high' ? 'mid' : 'lod'}_${i}`),
            { ...placement, scale: [0.46, 0.72, 0.46] },
            layer,
          );
          tree.userData.batchForest = true;
          tree.userData.batchForestShadows = true;
        }
        metrics.connectedTrees++;
        metrics.rootedUnderstory++;
      }
      metrics.closeTrees += near[i].length;
      metrics.distantTrees += distant[i].length;
      metrics.foliageClusters += foliage[i].length;
    }
    for (const layer of understoryLayers.values()) {
      consolidateStaticInstances(layer);
      group.add(layer);
      qualityFoliage.push(layer);
    }
    // A composed grove frames Rootfall's bank with unequal mature crowns.
    // Narrow lower trunks keep the driving corridor open; the connected crown
    // lives above it. Both presets preserve the same leaf placements.
    if (rootfall) {
      const frame = groundFrame(track, rootfall.showcase);
      for (const quality of ['high', 'low']) {
        const grove = new T.Group();
        grove.name = `Vesper / Rootfall mature grove ${quality}`;
        grove.userData.foliageQuality = quality;
        for (const [forward, side, scale, yaw] of [
          [170, -125, 0.7, 0.7],
          [300, -150, 0.77, 2.9],
          [85, -140, 0.48, 4.5],
        ]) {
          const position = frame.position
            .clone()
            .addScaledVector(frame.tangent, forward)
            .addScaledVector(frame.right, side);
          const tree = addTree(
            get(`mature_grove_${quality}`),
            {
              position: position.toArray(),
              scale: [scale, scale, scale],
              yaw,
            },
            grove,
          );
          tree.name = `Vesper / rooted mature grove tree ${forward}`;
        }
        group.add(grove);
        qualityFoliage.push(grove);
      }
    }
    const rosette = assetScene.getObjectByName('ground_broadleaf_rosette_high');
    if (rosette) {
      const cover = [];
      for (const district of [...near.flat(), ...foliage.flat()]) {
        const patchAngle = random() * Math.PI * 2;
        for (let k = 0; k < 6; k++) {
          const angle = patchAngle + Math.floor(k / 3) * 2.1,
            radius = 20 + Math.floor(k / 3) * 23;
          const x =
            district.position[0] +
            Math.cos(angle) * radius +
            (random() - 0.5) * 18;
          const z =
            district.position[2] +
            Math.sin(angle) * radius +
            (random() - 0.5) * 18;
          const y = vesperTerrainHeight(x, z, ground) - 0.5;
          if (!clearance.clears(x, z, 25, 25, y + 12, 0, y - 2)) continue;
          const scale = 0.7 + random() * 1.1;
          cover.push({
            position: [x, y, z],
            yaw: angle,
            scale: [scale, scale, scale],
          });
        }
      }
      // Broad ground growth follows the raised grove shoulder, with open soil
      // at the roots and a few overlapping masses instead of an even scatter.
      for (const [x, z, scale, yaw] of [
        [421, -190, 2.6, 0.2],
        [444, -209, 1.9, 1.5],
        [474, -224, 2.3, 3.2],
        [512, -283, 2.4, 0.8],
        [532, -315, 2.0, 2.4],
        [573, -368, 2.2, 4.4],
        [466, -160, 2.7, 1.2],
        [535, -192, 2.5, 5.1],
      ]) {
        const y = vesperTerrainHeight(x, z, ground) - 0.8;
        if (
          clearance.clears(
            x,
            z,
            scale * 28,
            scale * 28,
            y + scale * 12,
            0,
            y - 3,
          )
        )
          cover.push({
            position: [x, y, z],
            scale: [scale, scale, scale],
            yaw,
          });
      }
      for (const quality of ['high', 'low']) {
        const layer = new T.Group();
        layer.userData.foliageQuality = quality;
        instanceTemplate(
          get(`ground_broadleaf_rosette_${quality}`),
          cover,
          layer,
        );
        consolidateStaticInstances(layer);
        group.add(layer);
        qualityFoliage.push(layer);
      }
    }
    for (let i = 0; i < 2; i++)
      instanceTemplate(get(`root_${i}`), roots[i], group, { shadow: true });
    instanceTemplate(get('fungal_fan'), fans, group);
    // The elevated fungal shelves grow from old root stocks connected to the
    // ravine floor; their stems no longer terminate in empty air.
    const fungalRoots = [];
    for (const placement of fans) {
      const crown = new T.Vector3(...placement.position);
      crown.y -= 1;
      const axis = new T.Vector3(
        Math.cos(placement.yaw),
        0,
        Math.sin(placement.yaw),
      );
      for (const side of [-1, 1]) {
        const foot = crown.clone().addScaledVector(axis, side * 28);
        foot.y = vesperTerrainHeight(foot.x, foot.z, ground) - 4;
        const knee = foot
          .clone()
          .lerp(crown, 0.55)
          .addScaledVector(axis, side * 4);
        const points = [foot, knee, crown];
        if (clearsSupport(points, 14))
          fungalRoots.push(tube(points, [14, 10, 8], 14, 9));
      }
    }
    if (fungalRoots.length) {
      const rootStock = new T.Mesh(mergeGeometries(fungalRoots), bark);
      fungalRoots.forEach((geometry) => geometry.dispose());
      rootStock.name = 'Vesper / terrain-rooted fungal nursery';
      rootStock.castShadow = true;
      rootStock.receiveShadow = true;
      group.add(rootStock);
    }
    metrics.fungusClusters = fans.length;

    // Large roots continue from existing mature tree bases down the exposed
    // Rootfall/Vault banks. Compose the visible slope as connected growth,
    // rather than isolated saplings scattered across an empty ground plane.
    const bankFrames = [];
    for (const section of [rootfall, vault].filter(Boolean))
      for (let s = section.start; s < section.end; s += 40)
        bankFrames.push(groundFrame(track, s));
    const bankRoots = [];
    for (const placement of [...near.flat(), ...distant.flat()]) {
      const origin = new T.Vector3(...placement.position);
      const frame = bankFrames.reduce((best, f) => {
        const d =
          (f.position.x - origin.x) ** 2 + (f.position.z - origin.z) ** 2;
        return !best || d < best.distance ? { frame: f, distance: d } : best;
      }, null);
      if (!frame || frame.distance > 250 ** 2 || frame.distance < 70 ** 2)
        continue;
      const f = frame.frame;
      const side = Math.sign(origin.clone().sub(f.position).dot(f.right)) || 1;
      origin.y = vesperTerrainHeight(origin.x, origin.z, ground) + 24;
      for (const fan of [-1, 0, 1]) {
        const end = f.position
          .clone()
          .addScaledVector(f.right, side * (46 + Math.abs(fan) * 15))
          .addScaledVector(f.tangent, fan * 52);
        end.y = vesperTerrainHeight(end.x, end.z, ground) - 4;
        const shoulder = origin
          .clone()
          .lerp(end, 0.35)
          .addScaledVector(f.tangent, fan * 10);
        shoulder.y = vesperTerrainHeight(shoulder.x, shoulder.z, ground) + 24;
        const knee = origin.clone().lerp(end, 0.73);
        knee.y = vesperTerrainHeight(knee.x, knee.z, ground) + 12;
        const points = [origin, shoulder, knee, end];
        if (!clearsSupport(points, 20)) continue;
        bankRoots.push(tube(points, [13, 18, 9, 0.7], 26, 10));
        const fork = knee
          .clone()
          .addScaledVector(f.tangent, 26 + fan * 9)
          .addScaledVector(f.right, side * 13);
        fork.y = vesperTerrainHeight(fork.x, fork.z, ground) - 2;
        const elbow = knee.clone().lerp(fork, 0.5);
        elbow.y += 4;
        if (clearsSupport([knee, elbow, fork], 6))
          bankRoots.push(tube([knee, elbow, fork], [6, 4, 0.5], 12, 7));
      }
    }
    if (bankRoots.length) {
      const mesh = new T.Mesh(mergeGeometries(bankRoots), bark);
      bankRoots.forEach((geometry) => geometry.dispose());
      mesh.name = 'Vesper / mature roots across exposed forest banks';
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      group.add(mesh);
    }

    // Exposed old roots break the empty banks into connected growth. Their
    // centres follow the same terrain triangles as the living tree feet.
    const fallen = [];
    for (const section of track.sections.filter((s) =>
      ['rootfall', 'vault', 'dawnscar'].includes(s.id),
    )) {
      for (let s = section.start + 25; s < section.end; s += 127) {
        const f = groundFrame(track, s);
        for (const side of [-1, 1]) {
          const origin = f.position
            .clone()
            .addScaledVector(f.right, side * (56 + random() * 40));
          const points = [0, 0.25, 0.62, 1].map((u, i) => {
            const p = origin
              .clone()
              .addScaledVector(f.tangent, u * (125 + 25 * Math.sin(s)))
              .addScaledVector(f.right, side * Math.sin(u * 3.5) * 20);
            p.y = vesperTerrainHeight(p.x, p.z, ground) + [-5, 25, 12, -4][i];
            return p;
          });
          if (!clearsSupport(points, 12)) continue;
          fallen.push(tube(points, [11, 12, 6, 0.5], 24, 10));
          const end = points[2]
            .clone()
            .addScaledVector(f.right, side * 30)
            .addScaledVector(f.tangent, 12);
          end.y = vesperTerrainHeight(end.x, end.z, ground) - 3;
          const mid = points[2].clone().lerp(end, 0.5);
          mid.y = vesperTerrainHeight(mid.x, mid.z, ground) + 2;
          fallen.push(tube([points[2], mid, end], [4, 2, 0.3], 9, 6));
        }
      }
    }
    if (fallen.length) {
      const mesh = new T.Mesh(mergeGeometries(fallen), bark);
      fallen.forEach((g) => g.dispose());
      mesh.name = 'Vesper / terrain-rooted old-growth deadfall';
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      group.add(mesh);
    }

    // Three connected gateway trees retain distinct heights and branching.
    const pillar = track.sections.find((section) => section.id === 'pillar');
    if (pillar)
      for (let i = 0; i < 3; i++) {
        const f = groundFrame(track, pillar.start - 100 + i * 55);
        for (const offset of [
          126, 170, 214, 258, 302, 358, 420, -170, -258, -350,
        ]) {
          const p = f.position
            .clone()
            .addScaledVector(f.right, (i % 2 ? -1 : 1) * offset);
          p.y = ground;
          if (!clearance.clears(p.x, p.z, 212, 212, ground + 295, 0, ground))
            continue;
          // Give the cupped third gateway crown room beside the camera corridor.
          if (i === 2) p.z += 12;
          const placement = {
            position: p.toArray(),
            scale: [1.25, 1.25, 1.25],
            yaw: i * 1.9,
          };
          const pilot = i === 1;
          const tree = pilot
            ? addTree(get('pilot_connected_elder'), placement, group)
            : addTreeLod(i, placement, group, 850);
          tree.name = `Vesper / three-trunk gate ${i + 1}`;
          if (pilot) {
            tree.userData.pilot = true;
            const simple = addTree(
              get('connected_tree_lod_1'),
              placement,
              group,
            );
            treeLods.push({
              detailed: tree,
              simple,
              center: tree.position.clone().add(new T.Vector3(0, 100, 0)),
              range: 850,
            });
            metrics.connectedTreePilots = 1;
            metrics.connectedTrees++;
          }
          metrics.gateTrunks++;
          break;
        }
      }
    for (const [i, site] of [
      [0, [1060, ground, -160]],
      [1, [815, ground, -122]],
      [2, [610, ground, -138]],
    ]) {
      const p = new T.Vector3(...site);
      if (!clearance.clears(p.x, p.z, 196, 196, ground + 260, 0, ground))
        continue;
      const tree = addTreeLod(
        i,
        { position: p.toArray(), scale: [1.15, 1.15, 1.15] },
        group,
        450,
      );
      tree.name = 'Vesper / static tree at canopy clearing';
      metrics.staticClearingTrees++;
    }
    consolidateStaticInstances(group);
    // Presentation intentionally omits the creature and all linked effects.
    // creature.js and the GLB's hero_walker remain intact for possible reuse;
    // do not instantiate its mesh, lights, moving crowns, leaf shower or spores.
    if (!loadAsset) {
      forestDressing = await createForestDressing({
        track,
        library: assetScene,
        barkMaterial: bark,
        woodMaterial: sapwood,
        groundHeight: (x, z) => vesperTerrainHeight(x, z, ground),
        attachmentScene: group,
        hollow,
        signal: loading.signal,
      });
      if (disposed) {
        forestDressing.dispose();
        return;
      }
      group.add(forestDressing.group);
      metrics.worldkit = forestDressing.stats;
    }
    metrics.loadState = 'ready';
    setQuality(settings);
  }
  function setQuality(next, camera) {
    for (const material of surfaceMaterials)
      setVesperSurfaceDetail(material, next.vesperSurfaceDetail !== false);
    const low = next.quality === 'low';
    for (const mesh of qualityFoliage)
      mesh.visible = mesh.userData.foliageQuality === (low ? 'low' : 'high');
    highTrees.visible = true;
    lowTrees.visible = true;
    for (const { detailed, simple, center, range } of treeLods) {
      const close =
        Boolean(camera) && center.distanceTo(camera.position) < range;
      detailed.visible = !low && close;
      simple.visible = !detailed.visible;
    }
    details.visible = !low;
  }
  const ready =
    loadAsset ||
    (typeof document !== 'undefined' && typeof location !== 'undefined')
      ? Promise.resolve()
          .then(async () => {
            if (disposed) return;
            const load =
              loadAsset ?? ((url) => new GLTFLoader().loadAsync(url));
            if (!loadAsset) {
              forestLook = await loadForestLook({ signal: loading.signal });
              if (disposed) {
                forestLook?.dispose();
                return;
              }
            }
            const library = await load(ASSET_URL);
            if (disposed) {
              disposeResources([library.scene]);
              library.scene.clear();
              return;
            }
            let forest;
            try {
              forest = await load(FOREST_ASSET_URL);
              if (disposed) {
                disposeResources([library.scene, forest.scene]);
                library.scene.clear();
                forest.scene.clear();
                return;
              }
              shareForestMaterials(library.scene, forest.scene);
              library.scene.add(forest.scene);
              return library;
            } catch (error) {
              disposeResources([library.scene, forest?.scene]);
              library.scene.clear();
              forest?.scene.clear();
              throw new Error(
                'Vesper connected forest could not load. Reload to retry.',
                { cause: error },
              );
            }
          })
          .then((library) => library && accept(library))
          .catch((error) => {
            if (disposed) return;
            metrics.loadState = 'failed';
            throw error;
          })
      : Promise.resolve();
  return {
    group,
    ready,
    update(frame = {}) {
      if (disposed) return;
      // Production overview preserves the living world; shape review owns a bare scene.
      group.visible = true;
      const next = frame.settings ?? settings;
      setQuality(next, frame.camera);
      forestDressing?.update(frame);
      let s = frame.state?.distance ?? 0;
      if (frame.mode === 'fly' && frame.camera) {
        let closest = Infinity;
        for (const site of resinLightSites) {
          const distance = site.position.distanceToSquared(
            frame.camera.position,
          );
          if (distance < closest) {
            closest = distance;
            s = site.s;
          }
        }
      }
      const nearest = Math.round(s / 42);
      practicalLights.forEach((light, i) => {
        const index =
          (((nearest + i - 2) % resinLightSites.length) +
            resinLightSites.length) %
          resinLightSites.length;
        light.position.copy(resinLightSites[index].position);
        light.intensity =
          next.quality === 'low' && i > 3 ? 0 : 850 * ENVIRONMENT_LIGHT_UPLIFT;
      });
    },
    reset() {},
    dispose() {
      if (disposed) return;
      disposed = true;
      metrics.loadState = 'disposed';
      loading.abort();
      forestDressing?.group.removeFromParent();
      forestDressing?.dispose();
      disposeResources([group, assetScene], ownedMaterials);
      forestLook?.dispose();
      group.clear();
      assetScene?.clear();
    },
  };
}
