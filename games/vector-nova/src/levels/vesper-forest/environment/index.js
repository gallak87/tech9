import * as T from 'three';
import {
  createLivingForestKit,
  createWoodGeometry,
  livingForestBarkURL,
  livingForestLeafURL,
} from '@worldkit/environment/living-forest';
import { loadSaplingForestKit } from '@worldkit/environment/living-forest/sapling';
import { loadAncientTree } from '@worldkit/environment/living-forest/ancient-tree';
import { createRiverWaterLayer } from '@worldkit/environment/water';
import {
  createWeather,
  createFoliageWind,
} from '@worldkit/environment/weather';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { createForestTerrain, randomSource } from './terrain.js';
import { createForestRouteClearance } from './clearance.js';
import { createLifetime } from '../../../core/lifecycle.js';
import { createVesperPresentationClock } from './presentation-clock.js';
import { createAncientOakBark } from './ancient-oak-material.js';

const UP = new T.Vector3(0, 1, 0);
const DETAIL_DISTANCE = { high: 330, low: 130 };
const DRAW_DISTANCE = 1550;
const DETAIL_REFRESH_DISTANCE = 30;
const FOLIAGE_MOTION_MARGIN = 2.4;
const ANCIENT_OAK_URL = new URL(
  '../../../../assets/levels/vesper-forest/ancient-oak-v1.glb',
  import.meta.url,
).href;

function createBatches(parts, placements, name, group, lifetime) {
  const meshes = parts.map(({ geometry, material }) => {
    const mesh = lifetime.own(
      new T.InstancedMesh(geometry, material, Math.max(1, placements.length)),
    );
    mesh.name = name;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    placements.forEach((p, i) => mesh.setMatrixAt(i, p.matrix));
    mesh.count = placements.length;
    mesh.computeBoundingBox();
    mesh.computeBoundingSphere();
    group.add(mesh);
    return mesh;
  });
  return meshes;
}
function placement(position, scale, yaw = 0) {
  return {
    position,
    scale,
    matrix: new T.Matrix4().compose(
      position,
      new T.Quaternion().setFromAxisAngle(UP, yaw),
      new T.Vector3(scale, scale, scale),
    ),
  };
}

/** Build one owned world; a failed build releases every acquired resource. */
export async function createVesperEnvironment(context = {}) {
  const lifetime = createLifetime();
  try {
    const textures = await loadTextures(lifetime);
    const forestKit = lifetime.own(
      await loadSaplingForestKit({ textures, includeCrown: false }),
    );
    forestKit.materials.wood.bumpScale = 0.75;
    return await buildEnvironment(
      { ...context, forestKit },
      textures,
      lifetime,
    );
  } catch (error) {
    const failures = [error];
    try {
      lifetime.dispose();
    } catch (cleanupError) {
      failures.push(cleanupError);
    }
    if (failures.length > 1) {
      throw new AggregateError(
        failures,
        'Living Forest construction and cleanup failed',
        { cause: error },
      );
    }
    throw error;
  }
}

async function loadTextures(lifetime) {
  const loader = new T.TextureLoader();
  let bark, foliage;
  try {
    bark = lifetime.own(await loader.loadAsync(livingForestBarkURL));
    foliage = lifetime.own(await loader.loadAsync(livingForestLeafURL));
  } catch (cause) {
    throw new Error('Living Forest art could not load. Reload to try again.', {
      cause,
    });
  }
  bark.colorSpace = foliage.colorSpace = T.SRGBColorSpace;
  bark.anisotropy = foliage.anisotropy = 8;
  bark.wrapS = bark.wrapT = T.RepeatWrapping;
  const relief = lifetime.own(bark.clone());
  relief.colorSpace = T.NoColorSpace;
  relief.needsUpdate = true;
  return { wood: { map: bark, bumpMap: relief }, leaf: { map: foliage } };
}

async function buildEnvironment(
  { track, settings = {}, view, forestKit },
  textures,
  lifetime,
) {
  const group = new T.Group();
  group.name = 'Vesper Forest / Living Forest world';
  lifetime.defer(() => group.clear());
  const batches = (parts, placements, name, target) =>
    createBatches(parts, placements, name, target, lifetime);
  const terrain = lifetime.own(createForestTerrain(track));
  group.add(terrain.mesh);
  const kit = lifetime.own(
    createLivingForestKit({
      detail: 'high',
      textures,
      includeTrees: false,
      foliageWind: true,
    }),
  );
  const inner = lifetime.own(kit.materials.wood.clone());
  inner.name = 'Living Forest / warm heartwood';
  inner.color.set('#9b866b');
  inner.emissive.set('#3d2d1d');
  inner.emissiveIntensity = 0.08;
  inner.bumpScale = 0.65;
  const hollowData = track.landmarks.hollow;
  const routeClearance = createForestRouteClearance(track);
  const foliageClearance = createForestRouteClearance(track, {
    margin: FOLIAGE_MOTION_MARGIN,
  });
  const ancientBark = await createAncientOakBark({
    lifetime,
    wood: forestKit.materials.wood,
  });
  const hollow = lifetime.own(
    await loadAncientTree({
      url: ANCIENT_OAK_URL,
      materials: {
        bark: forestKit.materials.wood,
        inner,
        leaf: forestKit.materials.leaf,
      },
    }),
  );
  // The fine Sapling twigs keep the grove-scale bark. Only the giant's
  // joined bole, primary forks and buttresses use its dedicated broad plates.
  hollow.group.getObjectByName('AncientOak_Bark').material = ancientBark;
  hollow.group.position.fromArray(hollowData.center);
  group.add(hollow.group);
  kit.materials.wood.bumpScale = 0.75;
  const random = randomSource(37219),
    center = new T.Vector3(...hollowData.center);
  const stands = forestKit.prototypes.map(() => []);
  // A broad open floodplain between the landing and the far grove creates depth.
  const inVista = (x, z) => x > 610 && x < 1180 && z > 65 && z < 315;
  const accepted = [];
  function addTree(x, z, targetHeight, variant) {
    const ground = terrain.height(x, z) - 2;
    if (
      inVista(x, z) ||
      ground < terrain.river.level + 8 ||
      Math.hypot(x - center.x, z - center.z) < 245
    )
      return false;
    const proto = forestKit.prototypes[variant],
      scale = targetHeight / proto.height;
    const crownRadius = proto.radius * scale;
    const p = new T.Vector3(x, ground, z);
    if (accepted.some((a) => a.position.distanceToSquared(p) < 85 ** 2))
      return false;
    // Conservative trunk cylinder plus canopy ellipsoid protects the fixed road.
    for (const q of terrain.route) {
      const dx = q.x - x,
        dz = q.z - z,
        d = Math.hypot(dx, dz),
        h = q.y - ground;
      if (h > -10 && h < targetHeight * 0.8 && d < targetHeight * 0.105 + 22)
        return false;
      const vertical = (h - targetHeight * 0.76) / (targetHeight * 0.29 + 24);
      if ((d / (crownRadius + 24)) ** 2 + vertical ** 2 < 1) return false;
    }
    const item = placement(p, scale, random() * Math.PI * 2);
    // Conservative cylinders do not describe leaning limbs or broad buttresses.
    // Both rendered qualities must leave the complete driver/camera corridor clear.
    if (
      [proto.treeParts, proto.farParts].some((parts) =>
        parts.some(({ geometry }) =>
          (geometry.attributes.windAnchor
            ? foliageClearance
            : routeClearance
          ).intersectsGeometry(geometry, item.matrix),
        ),
      )
    )
      return false;
    item.height = targetHeight;
    item.detailCenter = p.clone().addScaledVector(UP, targetHeight * 0.6);
    stands[variant].push(item);
    accepted.push(item);
    return true;
  }
  // Compose roadside groves at the elevation of each district before filling distance.
  for (let s = 40; s < track.length; s += 100) {
    if (s > hollowData.entry - 80 && s < hollowData.exit + 80) continue;
    const f = track.sample(s);
    for (const side of [-1, 1])
      for (const offset of [105, 155, 205]) {
        const p = f.position
          .clone()
          .addScaledVector(f.right, side * offset)
          .addScaledVector(f.tangent, random() * 45 - 22);
        const ground = terrain.height(p.x, p.z);
        const height = Math.max(185, (f.position.y + 100 - ground) / 0.8);
        if (
          addTree(
            p.x,
            p.z,
            height * (0.94 + random() * 0.12),
            Math.floor(random() * forestKit.prototypes.length),
          )
        )
          break;
      }
  }
  for (let x = -1000; x <= 1700; x += 160)
    for (let z = -1100; z <= 1000; z += 160) {
      const px = x + (random() - 0.5) * 90,
        pz = z + (random() - 0.5) * 90;
      addTree(
        px,
        pz,
        190 + random() * 155,
        Math.floor(random() * forestKit.prototypes.length),
      );
    }
  const treeLods = [];
  for (let v = 0; v < forestKit.prototypes.length; v++) {
    const prototype = forestKit.prototypes[v];
    const near = batches(
      prototype.treeParts,
      stands[v],
      `Living Forest / ${prototype.name} near`,
      group,
    );
    const far = batches(
      prototype.farParts,
      stands[v],
      `Living Forest / ${prototype.name} distant`,
      group,
    );
    near.forEach((m) => (m.count = 0));
    far.forEach((m) => (m.castShadow = false));
    treeLods.push({ entries: stands[v], near, far });
  }
  // Layer angular slate and young growth into actual banks, never empty air.
  const rocks = [[], [], []],
    shrubs = [];
  for (let i = 0; i < 620; i++) {
    const x = -650 + random() * 2200,
      z = -800 + random() * 1600,
      y = terrain.height(x, z);
    if (
      y < terrain.river.level + 5 ||
      Math.hypot(x - center.x, z - center.z) < 170
    )
      continue;
    const nearest = terrain.route.reduce(
      (best, p) => Math.min(best, (p.x - x) ** 2 + (p.z - z) ** 2),
      Infinity,
    );
    if (nearest > 450 ** 2) continue;
    const isRock = i % 3 === 0,
      scale = isRock ? 1.1 + random() * 3.2 : 1.1 + random() * 1.8;
    const radius = (isRock ? 12 : 14) * scale;
    const at = new T.Vector3(x, y + (isRock ? 2 : 8) * scale, z);
    if (terrain.route.some((p) => p.distanceToSquared(at) < (radius + 26) ** 2))
      continue;
    if (isRock)
      rocks[Math.floor(i / 3) % 3].push(
        placement(new T.Vector3(x, y - 3, z), scale, random() * 6.28),
      );
    else shrubs.push(placement(new T.Vector3(x, y, z), scale, random() * 6.28));
  }
  rocks.forEach((p, i) =>
    batches(
      [kit.rockParts[i]],
      p,
      'Living Forest / mossy slate outcrops',
      group,
    ),
  );
  const shrubMeshes = batches(
    kit.shrubParts,
    shrubs,
    'Living Forest / rooted understory',
    group,
  );
  // New-kit roots meet the real deck underside and soil or inner hollow wall.
  const rootPieces = [],
    connections = [];
  // The pieces are temporary owners until their merged geometry is acquired.
  const releaseRootPieces = () =>
    rootPieces.splice(0).forEach((g) => g.dispose());
  lifetime.defer(releaseRootPieces);
  hollow.group.updateMatrixWorld(true);
  const innerShell = hollow.group.getObjectByName('AncientOak_Heartwood');
  const raycaster = new T.Raycaster();
  let rejectedRoots = 0;
  for (let s = 24; s < track.length; s += 130) {
    if (track.isGap(s)) continue;
    const f = track.sample(s),
      inHollow = s > hollowData.entry && s < hollowData.exit;
    for (const side of [-1, 1]) {
      const top = f.position
        .clone()
        .addScaledVector(f.right, side * 11)
        .addScaledVector(f.up, -6.3);
      // Leave the deck beneath its edge before turning toward soil. A world-down
      // column alone crosses its owning lane when that lane rolls or inverts.
      const neck = top
        .clone()
        .addScaledVector(f.right, side * 12)
        .addScaledVector(f.up, -7);
      const shoulder = top
        .clone()
        .addScaledVector(f.right, side * 32)
        .addScaledVector(f.up, -18);
      let foot, geometry;
      if (inHollow) {
        // The new solid tree has a real tunnel floor beneath each turn.
        // Seat short roots there instead of reaching across an empty chamber.
        raycaster.set(
          top.clone().addScaledVector(f.up, -2),
          f.up.clone().negate(),
        );
        raycaster.far = 100;
        const hit = raycaster.intersectObject(innerShell, false)[0];
        if (!hit) continue;
        foot = hit.point.clone().addScaledVector(f.up, -3);
        geometry = createWoodGeometry(
          [
            foot,
            foot
              .clone()
              .lerp(top, 0.5)
              .addScaledVector(f.right, side * 1.5),
            top,
          ],
          [3.2, 2.6, 2.2],
          { segments: 12, sides: 10, fluting: 0.08, seed: s },
        );
      } else {
        const outward = f.up
          .clone()
          .multiplyScalar(-1)
          .setY(0)
          .add(
            f.right
              .clone()
              .multiplyScalar(side * 0.65)
              .setY(0),
          );
        if (outward.lengthSq() < 0.1)
          outward.set(f.tangent.z, 0, -f.tangent.x).multiplyScalar(side);
        outward.normalize();
        foot = f.position
          .clone()
          .addScaledVector(outward, 78)
          .addScaledVector(f.tangent, -24);
        foot.y = terrain.surfaceHeight(foot.x, foot.z) - 8;
        geometry = createWoodGeometry(
          [foot, foot.clone().lerp(shoulder, 0.55), shoulder, neck, top],
          [11, 7, 4.8, 3, 2.2],
          { segments: 30, sides: 12, fluting: 0.2, seed: s },
        );
      }
      // Test the real fluted tube triangles against all road layers, not a
      // handful of centerline samples or an exemption around this attachment.
      if (routeClearance.intersectsGeometry(geometry)) {
        rejectedRoots++;
        geometry.dispose();
        continue;
      }
      rootPieces.push(geometry);
      connections.push({ distance: s, anchor: inHollow ? 'hollow' : 'soil' });
    }
  }
  const rootsGeometry = rootPieces.length ? mergeGeometries(rootPieces) : null;
  if (rootPieces.length && !rootsGeometry)
    throw new Error('Living Forest root geometry could not merge');
  if (rootsGeometry) lifetime.own(rootsGeometry);
  releaseRootPieces();
  if (rootsGeometry) {
    const roots = new T.Mesh(rootsGeometry, kit.materials.wood);
    roots.name = 'Living Forest / rooted road foundations';
    roots.userData.attachments = connections;
    roots.receiveShadow = true;
    roots.castShadow = true;
    group.add(roots);
  }
  const water = lifetime.own(
    createRiverWaterLayer({
      id: 'Living Forest / reflective floodplain',
      ...terrain.river,
      quality: 'balanced',
      waterColor: '#174f52',
      depthAt: (x, z) => terrain.river.level - terrain.surfaceHeight(x, z),
      distortionScale: 0.6,
      flowSpeed: 7,
      foamStrength: 0.5,
      normalSize: 128,
    }),
  );
  water.init({
    scene: group,
    definition: {
      environment: {
        sun: { position: [-0.62, 0.55, -0.48], color: '#ffe1ae' },
      },
    },
  });
  const waterMesh = group.getObjectByName(
    'Living Forest / reflective floodplain',
  );
  const weather = lifetime.own(
    createWeather({
      settings: { wind: 0.65, windDirection: 35, transition: 0 },
      features: {
        rain: false,
        snowfall: false,
        wetness: false,
        snow: false,
        impacts: false,
        audio: false,
      },
      surfaceBounds: { minX: -1400, maxX: 2000, minZ: -1400, maxZ: 1400 },
      fieldResolution: 8,
    }),
  );
  weather.init({
    scene: group,
    camera: view?.camera ?? new T.PerspectiveCamera(),
  });
  const foliageWind = lifetime.own(
    createFoliageWind({ maxOffset: FOLIAGE_MOTION_MARGIN }),
  );
  group.traverse((mesh) => {
    if (mesh.isMesh && mesh.geometry.attributes.windAnchor)
      foliageWind.bind(mesh);
  });
  // Select the same static phase even when motion starts disabled, so enabling
  // it later continues from this pose instead of snapping from unbent cards.
  foliageWind.update(weather.condition);
  const advancePresentation = createVesperPresentationClock();
  // The mirror belongs to the real scene when rendered; the layer may own a group.
  // Current normals use metre-scaled ripples; the body tint stays visible at grazing angles.
  const metrics = {
    recipe: 'living-forest-carved-ancient-oak-v1',
    trees: accepted.length,
    treeForms: forestKit.prototypes.length,
    shrubs: shrubs.length,
    rocks: rocks.flat().length,
    hollow: hollow.metrics,
    connections: connections.length,
    rejectedRoots,
    oldAssetDependencies: 0,
    loadState: 'ready',
    motion: {
      time: 0,
      windMeshes: foliageWind.stats.meshes,
      maxOffset: FOLIAGE_MOTION_MARGIN,
    },
  };
  group.userData.metrics = metrics;
  let disposed = false,
    lastCamera = new T.Vector3(Infinity, Infinity, Infinity),
    lastQuality;
  function configure(camera, quality) {
    if (!camera) return;
    quality = quality === 'low' ? 'low' : 'high';
    const qualityChanged = lastQuality !== quality;
    const changed =
      lastCamera.distanceToSquared(camera.position) >
        DETAIL_REFRESH_DISTANCE ** 2 || qualityChanged;
    if (!changed) return;
    lastCamera.copy(camera.position);
    lastQuality = quality;
    for (const lod of treeLods) {
      let n = 0,
        f = 0;
      for (const item of lod.entries) {
        const distanceSquared = camera.position.distanceToSquared(
          item.detailCenter,
        );
        if (distanceSquared > DRAW_DISTANCE ** 2) continue;
        const meshes =
          distanceSquared < DETAIL_DISTANCE[quality] ** 2 ? lod.near : lod.far;
        const index = meshes === lod.near ? n++ : f++;
        meshes.forEach((m) => m.setMatrixAt(index, item.matrix));
      }
      lod.near.forEach((m) => {
        m.count = n;
        m.instanceMatrix.needsUpdate = true;
        m.computeBoundingSphere();
      });
      lod.far.forEach((m) => {
        m.count = f;
        m.instanceMatrix.needsUpdate = true;
        m.computeBoundingSphere();
      });
    }
    shrubMeshes.forEach((m) => (m.visible = quality !== 'low'));
    if (waterMesh && qualityChanged) {
      waterMesh.reflectionStride = quality === 'low' ? 8 : 3;
      waterMesh.renderTarget.setSize(
        quality === 'low' ? 512 : 768,
        quality === 'low' ? 512 : 768,
      );
    }
  }
  configure(view?.camera, settings.quality);
  return {
    group,
    ready: Promise.resolve(),
    update(frame = {}) {
      if (disposed) return;
      const currentSettings = frame.settings ?? settings;
      configure(frame.camera ?? view?.camera, currentSettings.quality);
      const presentation = advancePresentation({
        ...frame,
        settings: currentSettings,
      });
      weather.configure({ paused: presentation.paused });
      weather.update(presentation.dt);
      foliageWind.update(weather.condition, {
        reducedMotion: currentSettings.reducedMotion,
      });
      water.update(presentation.dt, {
        time: presentation.time,
        paused: presentation.paused,
        reducedMotion: currentSettings.reducedMotion,
      });
      metrics.motion.time = presentation.time;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      lifetime.dispose();
    },
  };
}
