import * as T from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { sampleCalvingState, sampleCaveBlend } from './event.js';
import { finishIceMaterial } from './materials.js';

const ASSET_URL = '/assets/levels/glasswake/glasswake-environment-v2.glb';
const UP = new T.Vector3(0, 1, 0);
const fract = (n) => n - Math.floor(n);
const noise = (n) => fract(Math.sin(n * 172.41 + 41.7) * 4537.114);

function disposeResources(group, geometries, materials) {
  group.traverse((node) => {
    if (node.geometry) geometries.add(node.geometry);
    for (const material of [node.material].flat().filter(Boolean))
      materials.add(material);
  });
  for (const geometry of geometries) geometry.dispose();
  for (const material of materials) material.dispose();
  group.clear();
}

/** Whole-world geometry is Blender authored; instancing only distributes the
 * authored family. Rejected candidate placements move outward as whole forms.
 */
export function createGlasswakeEnvironment({
  track,
  settings = {},
  shape = false,
  view,
  loadAsset,
} = {}) {
  const group = new T.Group();
  group.name = 'Glasswake / layered comet geology';
  const geometries = new Set();
  const materials = new Set();
  const placements = [];
  const samples = [];
  for (let s = 0; s < track.length; s += 8)
    samples.push(track.sample(s).position);
  const templates = new Map();
  const batches = new Map();
  const calving = new T.Group();
  calving.name = 'Glasswake / calving shelf and revealed cavern';
  const moving = [];
  const cracks = [];
  const lights = [];
  const baseLights = [];
  let cavityLight = null;
  let disposed = false;
  let loaded = false;
  let caveBlend = 0;
  let returnBlend = 0;
  const returnSection = track.sections.find(({ id }) => id === 'return');
  const thawlight = new T.Color('#ffe5bf');
  let event = sampleCalvingState(track);
  let referenceTexture = null;
  let currentSettings = settings;
  const metrics = {
    assetBytes: 2821008,
    sourceTriangles: 41748,
    instances: 0,
    meshes: 0,
    triangles: 0,
    textures: 0,
    localLights: 4,
    rejectedPlacements: 0,
  };
  let error = null;
  let originalEnvironmentIntensity;
  let originalFog;
  const localFog = new T.FogExp2('#10243d', 0.00018);

  function transform(s, lateral = 0, height = 0, scale = [1, 1, 1], yaw = 0) {
    const frame = track.sample(s);
    const heading = Math.atan2(frame.tangent.x, frame.tangent.z);
    const position = frame.position
      .clone()
      .add(
        new T.Vector3(Math.cos(heading), 0, -Math.sin(heading)).multiplyScalar(
          lateral,
        ),
      );
    position.y += height;
    return new T.Matrix4().compose(
      position,
      new T.Quaternion().setFromAxisAngle(UP, heading + yaw),
      new T.Vector3(...scale),
    );
  }
  function routeClear(box) {
    // Conservative sampled ribbon envelope includes 15m lane, fin and chase-camera clearance.
    return !samples.some(
      (point) =>
        point.x >= box.min.x - 27 &&
        point.x <= box.max.x + 27 &&
        point.z >= box.min.z - 27 &&
        point.z <= box.max.z + 27 &&
        point.y + 34 >= box.min.y &&
        point.y - 13 <= box.max.y,
    );
  }
  function addInstance(name, matrix, { clear = true, label = name } = {}) {
    const template = templates.get(name);
    if (!template)
      throw new Error(`Missing Glasswake Blender template ${name}`);
    const bounds = template.bounds.clone().applyMatrix4(matrix);
    if (clear && !routeClear(bounds)) return false;
    const position = new T.Vector3().setFromMatrixPosition(matrix);
    const key = `${name}/${Math.floor(position.x / 420)}/${Math.floor(position.z / 420)}`;
    if (!batches.has(key)) batches.set(key, { name, matrices: [] });
    batches.get(key).matrices.push(matrix);
    placements.push({
      name: label,
      bounds: [bounds.min.toArray(), bounds.max.toArray()],
      checked: clear,
    });
    metrics.instances += 1;
    return true;
  }
  function place(
    name,
    s,
    lateral,
    height = 0,
    scale = [1, 1, 1],
    yaw = 0,
    options = {},
  ) {
    for (let attempt = 0; attempt < 12; attempt += 1) {
      const offset = lateral + Math.sign(lateral || 1) * attempt * 24;
      if (addInstance(name, transform(s, offset, height, scale, yaw), options))
        return;
      metrics.rejectedPlacements += 1;
    }
  }
  function unique(name, parent) {
    const template = templates.get(name);
    const result = new T.Group();
    result.name = name;
    for (const part of template.parts) {
      const mesh = new T.Mesh(part.geometry, part.material);
      mesh.name = name;
      mesh.castShadow = true;
      mesh.receiveShadow = false;
      result.add(mesh);
    }
    parent.add(result);
    return result;
  }
  function flushBatches() {
    for (const { name, matrices } of batches.values()) {
      for (const part of templates.get(name).parts) {
        const mesh = new T.InstancedMesh(
          part.geometry,
          part.material,
          matrices.length,
        );
        matrices.forEach((matrix, i) => mesh.setMatrixAt(i, matrix));
        mesh.name = `Glasswake / ${name} / ${matrices.length} authored forms`;
        mesh.castShadow = true;
        mesh.receiveShadow = false;
        mesh.computeBoundingSphere();
        group.add(mesh);
      }
    }
  }
  function buildWorld() {
    // Ordinary stretches carry three scales: cut rim, deeper wall, distant mass.
    for (let s = 24, i = 0; s < track.length; s += 84, i += 1) {
      const inBridge = s > track.bridge.start - 50 && s < track.bridge.end + 65;
      for (const side of [-1, 1]) {
        const n = noise(i * 17 + side * 11);
        const nearOffset = inBridge ? 117 : 79;
        place(
          `cliff_${i % 3}`,
          s,
          side * (nearOffset + n * 18),
          -22 - n * 12,
          [0.78 + n * 0.4, 1 + n * 0.4, 1.06],
          side * n * 0.16,
        );
        if (i % 2 === 0)
          place(
            'rubble_shelf',
            s + 32,
            side * (inBridge ? 90 : 54),
            -47 - n * 24,
            [0.7, 0.7, 0.72],
            n,
          );
        if (i % 3 === 0)
          place(
            `cliff_${(i + 1) % 3}`,
            s,
            side * (230 + n * 75),
            -65,
            [2.4, 1.9, 2.1],
            n * 2,
          );
      }
    }
    // Low, opaque basal strata close the chasm beneath the authored wall family.
    // Their tops lie ~280m below the local road; no geometry bridges flight gaps.
    for (let s = 0, i = 0; s < track.length; s += 165, i += 1) {
      place('basal_strata', s, 0, -280, [1.18, 1.2, 1.17], Math.sin(i) * 0.22);
    }
    // Exterior horizon fragments remain sparse, large and isolated.
    for (const [i, s] of [180, 460, 2720, 3090, 4210].entries()) {
      place(
        'far_fragment',
        s,
        i % 2 ? -820 : 970,
        -180 + i * 37,
        [1.4 + i * 0.17, 1.3, 1.2],
        i * 0.74,
      );
    }
    for (const section of track.sections.filter(({ id }) =>
      ['mouth', 'gallery', 'chasm'].includes(id),
    )) {
      for (
        let s = section.start + 34, i = 0;
        s < section.end - 50;
        s += 104, i += 1
      ) {
        if (section.id !== 'chasm' || i % 3 === 2)
          place(
            'cave_roof',
            s,
            Math.sin(i * 2.7) * 7,
            30 + noise(i * 5) * 12,
            [
              1.12 + 0.16 * noise(i),
              0.96 + 0.12 * noise(i + 2),
              0.82 + 0.26 * noise(i + 7),
            ],
            Math.sin(i * 2.3) * 0.08,
          );
        for (const side of [-1, 1]) {
          place(
            'cave_pier',
            s + 18,
            side * (87 + 10 * noise(i + side)),
            -9 + 8 * noise(i),
            [0.87 + noise(i + side) * 0.28, 1.15 + noise(i * 7) * 0.3, 1.18],
            side * (0.06 + noise(i) * 0.22),
          );
          if (i % 2 === 0 || section.id === 'gallery')
            place(
              'ice_curtain',
              s + 28,
              side * 62,
              33,
              [
                0.78 + noise(i * 9 + side) * 0.38,
                0.88 + noise(i * 3) * 0.32,
                1,
              ],
              Math.PI / 2 + Math.sin(i * 3.7 + side) * 0.12,
            );
        }
        if (section.id === 'chasm' && i % 2 === 0)
          place('bell_vault', s, 0, 62, [0.95, 0.82, 1.2], 0);
      }
    }
    const gallery = track.sections.find(({ id }) => id === 'gallery');
    place(
      'dark_inclusion',
      gallery.start + (gallery.end - gallery.start) * 0.42,
      -113,
      14,
      [1.35, 1.5, 1.7],
      -0.36,
    );
    place('dock_mast', 35, 62, -4, [1.1, 1.1, 1.1], 0.1);
    place('dock_mast', track.length - 180, 80, -14, [0.62, 0.62, 0.62], -0.18);
    // Actual three-dimensional compression arches under supported bridge runs.
    for (let s = track.bridge.start + 18; s < track.bridge.end; s += 68) {
      if (
        track.jumps.some(
          ({ takeoff, landingStart }) =>
            s + 34 > takeoff && s - 34 < landingStart,
        )
      )
        continue;
      place('bridge_arch', s, 0, -5, [1, 1, 1], 0, { clear: false });
    }
    for (const jump of track.jumps)
      place(
        'landing_shelf',
        jump.landingStart + 48,
        0,
        -14,
        [1.08, 1.9, 1.6],
        0,
      );
    const centerS = (track.bridge.start + track.bridge.end) * 0.5;
    // Front faces the raceway; the opening lies within an actual fixed rear shell.
    calving.applyMatrix4(transform(centerS, 265, -32));
    // Stage the far shelf ahead of the span: the opened cavity remains in the
    // forward sight line through departure, rather than falling behind chase.
    calving.position.addScaledVector(track.sample(centerS).tangent, 820);
    group.add(calving);
    for (const name of templates.keys()) {
      if (/^(calving_(back|roof|floor|ledge)|cavity_)/.test(name))
        unique(name, calving);
      if (/^calving_(chunk|chip)_/.test(name)) {
        const object = unique(name, calving);
        const index = Number(name.slice(-2));
        moving.push({ object, index, chip: name.includes('chip') });
      }
    }
    // A motivated non-shadow practical lights the actual revealed cavity surfaces.
    // It adds no render pass; reveal state drives illumination in all presets.
    cavityLight = new T.PointLight('#64d8ff', 0, 350, 2);
    cavityLight.name = 'Glasswake / revealed cavern practical';
    cavityLight.position.set(5, 60, 0);
    calving.add(cavityLight);
    const crackMaterial = new T.MeshStandardMaterial({
      color: '#71d7f8',
      emissive: '#32b8fa',
      emissiveIntensity: 2.1,
      roughness: 0.45,
    });
    materials.add(crackMaterial);
    // Eight branching seams run down the visible outer wall before it separates.
    for (let i = 0; i < 8; i += 1) {
      const z = -164 + i * 47;
      const points = Array.from(
        { length: 8 },
        (_, j) =>
          new T.Vector3(
            -39 - (j % 2) * 1.2,
            149 - j * 25,
            z + Math.sin(j * 2.3 + i) * 5,
          ),
      );
      const geometry = new T.TubeGeometry(
        new T.CatmullRomCurve3(points),
        21,
        0.6,
        3,
        false,
      );
      geometries.add(geometry);
      const mesh = new T.Mesh(geometry, crackMaterial);
      mesh.name = 'Propagating fracture seam';
      calving.add(mesh);
      cracks.push(mesh);
    }
    flushBatches();
    for (const color of ['#a5dfff', '#7ebafa', '#ffcfa4']) {
      const light = new T.PointLight(color, 0, 190, 2);
      group.add(light);
      lights.push(light);
    }
    group.updateMatrixWorld(true);
    group.traverse((node) => {
      if (!node.isMesh) return;
      metrics.meshes += 1;
      metrics.triangles +=
        ((node.geometry.index?.count ??
          node.geometry.attributes.position.count) /
          3) *
        (node.count ?? 1);
    });
    group.userData.clearanceReport = {
      sampleStep: 8,
      routeMargin: 27,
      cameraHeight: 34,
      placements,
      conservative: true,
    };
    loaded = true;
  }
  function accept(gltf) {
    gltf.scene.updateMatrixWorld(true);
    if (disposed) {
      disposeResources(gltf.scene, new Set(), new Set());
      return false;
    }
    for (const root of gltf.scene.children) {
      const parts = [];
      const bounds = new T.Box3();
      root.traverse((node) => {
        if (!node.isMesh) return;
        const geometry = node.geometry;
        geometry.applyMatrix4(node.matrixWorld);
        geometry.computeBoundingBox();
        bounds.union(geometry.boundingBox);
        geometries.add(geometry);
        for (const material of [node.material].flat()) {
          material.side = T.DoubleSide;
          finishIceMaterial(material);
          material.envMapIntensity = 0.35;
          if (referenceTexture) material.envMap = referenceTexture;
          materials.add(material);
        }
        parts.push({ geometry, material: node.material });
      });
      if (parts.length) templates.set(root.name, { parts, bounds });
    }
    buildWorld();
    return true;
  }
  let ready = Promise.resolve(false);
  if (!shape && (loadAsset || typeof document !== 'undefined')) {
    ready = Promise.resolve()
      .then(() =>
        (loadAsset ?? ((url) => new GLTFLoader().loadAsync(url)))(ASSET_URL),
      )
      .then(accept)
      .catch((reason) => {
        error = reason instanceof Error ? reason.message : String(reason);
        if (!disposed) disposeResources(group, geometries, materials);
        throw new Error(`Glasswake environment failed to load: ${error}`, {
          cause: reason,
        });
      });
  }
  if (shape) {
    const grid = new T.GridHelper(2600, 52, '#426779', '#203946');
    grid.position.y = -170;
    group.add(grid);
  }
  function update({
    state = {},
    settings: nextSettings = currentSettings,
    reviewing = false,
  } = {}) {
    if (disposed) return;
    currentSettings = nextSettings;
    event = sampleCalvingState(track, state);
    if (cavityLight) cavityLight.intensity = 25000 * event.reveal;
    caveBlend =
      shape || reviewing ? 0 : sampleCaveBlend(track, state.distance ?? 0);
    returnBlend =
      shape || reviewing || !returnSection
        ? 0
        : T.MathUtils.smoothstep(
            event.distance,
            returnSection.start,
            returnSection.start + 110,
          ) *
          (1 -
            T.MathUtils.smoothstep(
              event.distance,
              returnSection.end - 110,
              returnSection.end,
            ));
    for (const { object, index, chip } of moving) {
      const delay = index * 0.012;
      const t = Math.max(0, (event.separation - delay) / (1 - delay));
      object.position.set(
        -t * (chip ? 69 + index * 4 : 20 + index * 2),
        -t * t * (chip ? 150 : 248 + index * 7),
        t * Math.sin(index * 4.1) * 10,
      );
      object.rotation.z = t * (chip ? -0.22 : -0.06 - index * 0.013);
      object.rotation.x = t * Math.sin(index) * 0.055;
    }
    cracks.forEach((mesh, i) => {
      const progress = Math.max(0, Math.min(1, event.crack * 1.5 - i * 0.058));
      const full = mesh.geometry.index.count;
      mesh.geometry.setDrawRange(0, Math.floor((full * progress) / 18) * 18);
      mesh.visible = progress > 0 && event.separation < 0.68;
      mesh.position.x = -event.separation * 31;
      mesh.position.y = -(event.separation ** 2) * 235;
    });
    const scene = view?.scene;
    if (scene && !shape) {
      if (!baseLights.length) {
        scene.children
          .filter((node) => node.isDirectionalLight || node.isHemisphereLight)
          .forEach((light) =>
            baseLights.push({
              light,
              intensity: light.intensity,
              color: light.color.clone(),
            }),
          );
        originalEnvironmentIntensity = scene.environmentIntensity;
        originalFog = scene.fog;
      }
      for (const { light, intensity, color } of baseLights) {
        light.intensity =
          intensity * (1 - caveBlend * (light.isHemisphereLight ? 0.32 : 0.8));
        // Re-evaluate from the borrowed baseline, so seeking or resetting never
        // accumulates tint and cavern/exterior colors restore exactly.
        light.color.copy(color);
        if (light.isDirectionalLight)
          light.color.lerp(
            thawlight,
            returnBlend * (light.castShadow ? 0.42 : 0.24),
          );
      }
      scene.environmentIntensity =
        originalEnvironmentIntensity * (1 - caveBlend * 0.46);
      localFog.density = reviewing ? 0.00004 : 0.00018 + caveBlend * 0.00042;
      localFog.color.set(caveBlend > 0.5 ? '#102a45' : '#10243d');
      scene.fog = localFog;
    }
    lights.forEach((light, i) => {
      const frame = track.sample((state.distance ?? 0) + (i - 1) * 50 + 40);
      light.position
        .copy(frame.position)
        .addScaledVector(frame.right, (i % 2 ? -1 : 1) * 39);
      light.position.y += 16;
      light.intensity = reviewing ? 0 : (i === 2 ? 175 : 1400) * caveBlend;
    });
    group.userData.calving = event;
    group.userData.caveBlend = caveBlend;
    group.userData.returnBlend = returnBlend;
  }
  group.userData.metrics = metrics;
  group.userData.getEnvironmentPresentation = () => ({
    loaded,
    error,
    caveBlend,
    returnBlend,
    calving: event,
    metrics,
    reducedMotion: Boolean(currentSettings.reducedMotion),
    quality: currentSettings.quality ?? 'high',
  });
  return {
    group,
    ready,
    update,
    reset(state = {}) {
      update({ state });
    },
    setReflection(texture) {
      referenceTexture = texture;
      for (const material of materials) {
        if (!material.isMeshStandardMaterial) continue;
        material.envMap = texture;
        material.needsUpdate = true;
      }
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      for (const { light, intensity, color } of baseLights) {
        light.intensity = intensity;
        light.color.copy(color);
      }
      if (view?.scene && originalEnvironmentIntensity !== undefined) {
        view.scene.environmentIntensity = originalEnvironmentIntensity;
        if (view.scene.fog === localFog) view.scene.fog = originalFog;
      }
      disposeResources(group, geometries, materials);
      templates.clear();
      batches.clear();
      moving.length = 0;
    },
  };
}
