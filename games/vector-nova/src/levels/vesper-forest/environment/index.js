import * as T from 'three';
import {
  createLivingForestKit,
  createLivingHollow,
  createWoodGeometry,
  livingForestBarkURL,
  livingForestLeafURL,
} from '@worldkit/environment/living-forest';
import {
  createOceanLayer,
  createIslandCoast,
} from '@worldkit/environment/ocean';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { createForestTerrain, randomSource } from './terrain.js';
import { createLifetime } from '../../../core/lifecycle.js';

const UP = new T.Vector3(0, 1, 0);
const DETAIL_DISTANCE = { high: 330, low: 130 };
const DRAW_DISTANCE = 1550;
const DETAIL_REFRESH_DISTANCE = 30;

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
    return buildEnvironment(context, textures, lifetime);
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

function buildEnvironment({ track, settings = {}, view }, textures, lifetime) {
  const group = new T.Group();
  group.name = 'Vesper Forest / new Living Forest world';
  lifetime.defer(() => group.clear());
  const batches = (parts, placements, name, target) =>
    createBatches(parts, placements, name, target, lifetime);
  const terrain = lifetime.own(createForestTerrain(track));
  group.add(terrain.mesh);
  const kit = lifetime.own(createLivingForestKit({ detail: 'high', textures })),
    farKit = lifetime.own(createLivingForestKit({ detail: 'low', textures }));
  const inner = lifetime.own(kit.materials.wood.clone());
  inner.name = 'Living Forest / warm heartwood';
  inner.color.set('#8a9684');
  inner.emissive.set('#273d35');
  inner.emissiveIntensity = 0.12;
  inner.bumpScale = 0.65;
  const rim = lifetime.own(kit.materials.wood.clone());
  rim.name = 'Living Forest / pale rolled wound';
  rim.color.set('#a1a090');
  rim.bumpScale = 0.6;
  const hollowData = track.landmarks.hollow;
  const route = [];
  for (let s = 0; s < track.length; s += 6)
    route.push(track.sample(s).position.clone());
  route.push(route[0].clone());
  const hollow = lifetime.own(
    createLivingHollow({
      center: hollowData.center,
      radius: 185,
      base: -112,
      top: 410,
      routePoints: route,
      clearance: 34,
      materials: { bark: kit.materials.wood, inner, rim },
    }),
  );
  group.add(hollow.group);
  kit.materials.wood.bumpScale = 0.75;
  farKit.materials.wood.bumpScale = 0.3;
  const random = randomSource(37219),
    center = new T.Vector3(...hollowData.center);
  const stands = [[], [], []];
  // A broad open floodplain between the landing and the far grove creates depth.
  const inVista = (x, z) => x > 610 && x < 1180 && z > 65 && z < 315;
  const accepted = [];
  function addTree(x, z, targetHeight, variant) {
    const ground = terrain.height(x, z) - 2;
    if (
      inVista(x, z) ||
      ground < -113 ||
      Math.hypot(x - center.x, z - center.z) < 245
    )
      return false;
    const proto = kit.prototypes[variant],
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
            Math.floor(random() * 3),
          )
        )
          break;
      }
  }
  for (let x = -1000; x <= 1700; x += 160)
    for (let z = -1100; z <= 1000; z += 160) {
      const px = x + (random() - 0.5) * 90,
        pz = z + (random() - 0.5) * 90;
      addTree(px, pz, 190 + random() * 155, Math.floor(random() * 3));
    }
  const treeLods = [];
  for (let v = 0; v < 3; v++) {
    const near = batches(
      kit.prototypes[v].treeParts,
      stands[v],
      `Living Forest / ${kit.prototypes[v].name} near`,
      group,
    );
    const far = batches(
      farKit.prototypes[v].treeParts,
      stands[v],
      `Living Forest / ${kit.prototypes[v].name} distant`,
      group,
    );
    near.forEach((m) => (m.count = 0));
    far.forEach((m) => (m.castShadow = false));
    treeLods.push({ entries: stands[v], near, far });
  }
  // The giant crown is new foliage from the kit, carried by the hollow's crown boughs.
  const crownParts = kit.prototypes[0].treeParts.filter(
    (p) => p.kind === 'leaf',
  );
  const crownPlacements = [];
  for (let i = 0; i < 6; i++) {
    const a = (i * Math.PI) / 3;
    crownPlacements.push(
      placement(
        new T.Vector3(
          center.x + Math.cos(a) * 108,
          180 + (i % 2) * 24,
          center.z + Math.sin(a) * 108,
        ),
        2.8,
        a,
      ),
    );
  }
  batches(
    crownParts,
    crownPlacements,
    'Living Forest / cathedral canopy',
    group,
  );
  // Layer angular slate and young growth into actual banks, never empty air.
  const rocks = [[], [], []],
    shrubs = [];
  for (let i = 0; i < 620; i++) {
    const x = -650 + random() * 2200,
      z = -800 + random() * 1600,
      y = terrain.height(x, z);
    if (y < -109 || Math.hypot(x - center.x, z - center.z) < 170) continue;
    const nearest = terrain.route.reduce(
      (best, p) => Math.min(best, (p.x - x) ** 2 + (p.z - z) ** 2),
      Infinity,
    );
    if (nearest > 450 ** 2) continue;
    const isRock = i % 3 === 0,
      scale = isRock ? 1.1 + random() * 3.2 : 1.1 + random() * 1.8;
    const radius = (isRock ? 8 : 14) * scale;
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
  const innerShell = hollow.group.getObjectByName(
    'Living Forest / living inner cambium',
  );
  const raycaster = new T.Raycaster();
  for (let s = 24; s < track.length; s += 130) {
    if (track.isGap(s)) continue;
    const f = track.sample(s),
      inHollow = s > hollowData.entry && s < hollowData.exit;
    const radial = f.position.clone().sub(center).setY(0).normalize();
    for (const side of inHollow
      ? [Math.sign(f.right.dot(radial)) || 1]
      : [-1, 1]) {
      const top = f.position
        .clone()
        .addScaledVector(f.right, side * 9)
        .addScaledVector(f.up, -5);
      let foot;
      if (inHollow) {
        const origin = top.clone().addScaledVector(f.up, -27);
        raycaster.set(origin, radial);
        raycaster.far = 300;
        const hit = raycaster.intersectObject(innerShell, false)[0];
        if (!hit) continue;
        foot = hit.point.clone().addScaledVector(radial, 4);
      } else {
        foot = top
          .clone()
          .addScaledVector(f.right, side * 28)
          .addScaledVector(f.tangent, -30);
        foot.y = terrain.height(foot.x, foot.z) - 8;
        if (foot.y > top.y - 14) continue;
      }
      const mid = foot.clone().lerp(top, 0.58).addScaledVector(f.up, -10);
      const curve = new T.CatmullRomCurve3([foot, mid, top]);
      const samples = curve.getPoints(16);
      const unsafe = route.some((p, i) => {
        const difference = Math.abs(i * 6 - s),
          arc = Math.min(difference, track.length - difference);
        return (
          arc > 36 && samples.some((q) => q.distanceToSquared(p) < 29 ** 2)
        );
      });
      if (unsafe) continue;
      rootPieces.push(
        createWoodGeometry(
          [foot, mid, top],
          inHollow ? [8, 5, 2.4] : [11, 6, 2.4],
          { segments: 18, sides: 12, fluting: 0.2, seed: s },
        ),
      );
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
    roots.receiveShadow = true;
    roots.castShadow = true;
    group.add(roots);
  }
  const coast = createIslandCoast({
    x: center.x,
    z: center.z,
    radius: 215,
    level: -112,
    harmonics: [],
  });
  const water = lifetime.own(
    createOceanLayer({
      id: 'Living Forest / reflective floodplain',
      coast,
      halfSize: 2400,
      quality: 'balanced',
      waterColor: '#17464b',
      distortionScale: 0.6,
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
  // The mirror belongs to the real scene when rendered; the layer may own a group.
  if (waterMesh) waterMesh.material.uniforms.size.value = 0.3;
  const metrics = {
    recipe: 'living-forest-v1',
    trees: accepted.length,
    shrubs: shrubs.length,
    rocks: rocks.flat().length,
    hollow: hollow.metrics,
    connections: connections.length,
    oldAssetDependencies: 0,
    loadState: 'ready',
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
      waterMesh.reflectionStride = quality === 'low' ? 12 : 5;
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
      water.update(currentSettings.reducedMotion ? 0 : (frame.dt ?? 0));
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      lifetime.dispose();
    },
  };
}
