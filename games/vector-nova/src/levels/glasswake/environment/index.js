import * as T from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { sampleCalvingState, sampleCaveBlend } from './event.js';
import { finishIceMaterial } from './materials.js';
import { consolidateIceParts } from './consolidate.js';
import { createGlasswakeWeather } from '../weather/index.js';
import { createCalvingPowder } from '../weather/calving-powder.js';
import { glasswakeFlightState } from '../runtime.js';
import { FIRST_SHELF_RULES, sampleFirstShelf } from './first-shelf.js';

const ASSET_URL = '/assets/levels/glasswake/glasswake-environment-v5.glb';
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
  road,
} = {}) {
  const group = new T.Group();
  group.name = 'Glasswake / layered comet geology';
  const weather = createGlasswakeWeather({ track, shape });
  group.add(weather.group);
  let iceTexture = null;
  const apertureLights = [];
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
  let inclusionLight = null;
  let calvingPowder = null;
  let openingShelf = null;
  let openingPivot = null;
  let openingCentre = null;
  let openingPowder = null;
  const openingCracks = [];
  let firstShelf = sampleFirstShelf();
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
    assetBytes: 2953172,
    sourceTriangles: 65092,
    instances: 0,
    meshes: 0,
    triangles: 0,
    textures: 0,
    localLights: 9,
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
        point.y + 45 >= box.min.y &&
        point.y - 45 <= box.max.y,
    );
  }
  function addInstance(
    name,
    matrix,
    { clear = true, label = name, opening = false } = {},
  ) {
    const template = templates.get(name);
    if (!template)
      throw new Error(`Missing Glasswake Blender template ${name}`);
    const bounds = template.bounds.clone().applyMatrix4(matrix);
    if (clear && !routeClear(bounds)) return false;
    if (opening) {
      openingShelf = new T.Group();
      openingShelf.name = 'Glasswake / opening ice sheet';
      openingShelf.applyMatrix4(matrix);
      group.add(openingShelf);
      openingCentre = template.bounds.getCenter(new T.Vector3());
      openingPivot = new T.Group();
      openingPivot.position.copy(openingCentre);
      openingShelf.add(openingPivot);
      const sheet = unique(name, openingPivot);
      sheet.position.copy(openingCentre).negate();
      // Seams follow the actual authored underside. No floating decals or
      // extra texture/render pass; one small, bounded mesh per seam.
      const probe = unique(name, new T.Group());
      probe.updateMatrixWorld(true);
      const ray = new T.Raycaster();
      const seamMaterial = new T.MeshStandardMaterial({
        color: '#c9edff',
        emissive: '#7bbad0',
        emissiveIntensity: 0.5,
        roughness: 0.5,
      });
      materials.add(seamMaterial);
      for (const x of [-65, 64]) {
        const points = [];
        for (let i = 0; i < 20; i++) {
          const z = -65 + i * 6.5;
          ray.set(
            new T.Vector3(
              x + Math.sin(i * 2.1) * 3,
              template.bounds.min.y - 5,
              z,
            ),
            UP,
          );
          const hit = ray.intersectObject(probe, true)[0];
          if (hit)
            points.push(hit.point.addScaledVector(hit.face.normal, 0.25));
        }
        if (points.length < 2) continue;
        const geometry = new T.TubeGeometry(
          new T.CatmullRomCurve3(points),
          30,
          0.5,
          3,
          false,
        );
        geometries.add(geometry);
        const seam = new T.Mesh(geometry, seamMaterial);
        seam.name = 'Glasswake / opening sheet fracture';
        seam.position.copy(openingCentre).negate();
        openingPivot.add(seam);
        openingCracks.push(seam);
      }
      openingPowder = createCalvingPowder({ count: 80, lowCount: 36 });
      openingPowder.mesh.name = 'Glasswake / opening sheet powder';
      openingPowder.mesh.position.set(72, -65, 0);
      openingPowder.mesh.scale.z = 0.35;
      openingShelf.add(openingPowder.mesh);
      placements.push({
        name: 'opening-sheet',
        bounds: [bounds.min.toArray(), bounds.max.toArray()],
        checked: true,
      });
      metrics.instances += 1;
      return true;
    }
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
      const matrix = transform(s, offset, height, scale, yaw);
      if (addInstance(name, matrix, options)) return matrix;
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
      mesh.receiveShadow = true;
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
        mesh.receiveShadow = true;
        mesh.computeBoundingSphere();
        group.add(mesh);
      }
    }
  }
  function buildWorld() {
    const gallery = track.sections.find(({ id }) => id === 'gallery');
    const inclusionS = gallery.showcase + 105;
    const inclusionWindow = (s, side) =>
      side === -1 && Math.abs(s - inclusionS) < 195;
    // Ordinary stretches carry three scales: cut rim, deeper wall, distant mass.
    for (let s = 24, i = 0; s < track.length; s += 84, i += 1) {
      const inBridge = s > track.bridge.start - 50 && s < track.bridge.end + 65;
      for (const side of [-1, 1]) {
        const n = noise(i * 17 + side * 11);
        const nearOffset = inBridge ? 117 : 79;
        const calvingWindow =
          side === 1 &&
          s > track.bridge.start - 200 &&
          s < track.bridge.end + 260;
        let nearCliff;
        if (!inclusionWindow(s, side) && !calvingWindow)
          nearCliff = place(
            `cliff_${i % 3}`,
            s,
            side * (nearOffset + n * 18),
            -14 - n * 23 + (i % 5 === 2 ? 34 : 0),
            [0.8 + n * 0.44, 0.94 + n * 0.52, 1.35 + noise(i + side) * 0.5],
            side * (n - 0.5) * 0.42,
          );
        // Rubble ledges belong to the placed massif. Never independently push
        // them outward: that left detached pads which could catch support rays.
        if (i % 2 === 0 && nearCliff) {
          const ledge = nearCliff
            .clone()
            .multiply(new T.Matrix4().makeTranslation(-side * 24, -30, 28))
            .multiply(new T.Matrix4().makeScale(0.72, 0.72, 0.72));
          addInstance('rubble_shelf', ledge);
        }
        if (i % 3 === 0 && !calvingWindow)
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
            12 + noise(i * 5) * 9,
            [
              1.12 + 0.16 * noise(i),
              0.96 + 0.12 * noise(i + 2),
              0.82 + 0.26 * noise(i + 7),
            ],
            Math.sin(i * 2.3) * 0.08,
            {
              opening:
                section.id === 'mouth' && i === FIRST_SHELF_RULES.roofIndex,
            },
          );
        for (const side of [-1, 1]) {
          if (!(section.id === 'gallery' && inclusionWindow(s + 18, side)))
            place(
              'cave_pier',
              s + 18,
              side * (87 + 10 * noise(i + side)),
              -9 + 8 * noise(i),
              [0.87 + noise(i + side) * 0.28, 1.15 + noise(i * 7) * 0.3, 1.18],
              side * (0.06 + noise(i) * 0.22),
            );
          if (
            (i % 2 === 0 || section.id === 'gallery') &&
            !(section.id === 'gallery' && inclusionWindow(s + 28, side))
          )
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
    // Solid recessed walls join the foreground curtains into chambers. Keep one
    // high aperture toward the exterior, and a more open inner side in Chasm.
    for (const section of track.sections.filter(({ id }) =>
      ['mouth', 'gallery', 'chasm'].includes(id),
    )) {
      for (
        let s = section.start + 95, i = 0;
        s < section.end;
        s += 190, i += 1
      ) {
        for (const side of [-1, 1]) {
          if (section.id === 'chasm' && side === -1 && i % 2 === 0) continue;
          place(
            'recess_wall',
            s,
            side * 139,
            0,
            [1, section.id === 'chasm' ? 0.72 : 1, 0.95],
            side === -1 ? Math.PI : 0,
          );
        }
      }
    }
    for (
      let s = track.crevice.entry - 85, i = 0;
      s < track.crevice.exit + 70;
      s += 134, i++
    ) {
      const frame = track.sample(s);
      for (const side of [-1, 1]) {
        place(
          'crevice_wall',
          s,
          side * (97 + noise(i + side) * 14),
          242 - frame.position.y - 245,
          [1, 1, 1.12],
          side === -1 ? Math.PI : 0,
        );
      }
    }
    // Real aperture shafts pick out the road and surrounding ice, with a gentle
    // near-white key rather than following the craft with another blue wash.
    for (const section of track.sections.filter(({ id }) =>
      ['mouth', 'gallery', 'chasm'].includes(id),
    )) {
      const frame = track.sample(section.showcase + 54);
      const light = new T.SpotLight('#e2efff', 65000, 320, 0.63, 0.72, 2);
      light.name = `Glasswake / ${section.id} daylight aperture`;
      light.position.copy(frame.position).add(new T.Vector3(-25, 116, 14));
      light.target.position.copy(frame.position).add(new T.Vector3(96, 38, 5));
      group.add(light, light.target);
      apertureLights.push(light);
    }
    const floor = track.sample(track.crevice.floor);
    const floorLight = new T.SpotLight('#afdef0', 125000, 380, 0.72, 0.82, 2);
    floorLight.name = 'Glasswake / crevice rim aperture';
    floorLight.position.copy(floor.position).add(new T.Vector3(55, 160, -35));
    floorLight.target.position
      .copy(floor.position)
      .add(new T.Vector3(-55, 80, 80));
    group.add(floorLight, floorLight.target);
    apertureLights.push(floorLight);
    const inclusionMatrix = place(
      'dark_inclusion',
      inclusionS,
      -84,
      6,
      [1.08, 1.14, 1.08],
      0.16,
    );
    if (inclusionMatrix) {
      // Fixed aperture light grazes the embedded meteor and its pale ice bands.
      // It owns its target, has no shadow map, and does not follow the craft.
      inclusionLight = new T.SpotLight('#f0f4ff', 65000, 300, 0.64, 0.8, 2);
      inclusionLight.name = 'Glasswake / inclusion aperture light';
      inclusionLight.position.copy(
        new T.Vector3(52, 115, -30).applyMatrix4(inclusionMatrix),
      );
      inclusionLight.target.position.copy(
        new T.Vector3(10, 30, -8).applyMatrix4(inclusionMatrix),
      );
      group.add(inclusionLight, inclusionLight.target);
    }
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
    calving.applyMatrix4(transform(centerS, 235, -32));
    // Stage the far shelf ahead of the span: the opened cavity remains in the
    // forward sight line through departure, rather than falling behind chase.
    calving.position.addScaledVector(track.sample(centerS).tangent, 820);
    group.add(calving);
    calvingPowder = createCalvingPowder();
    calving.add(calvingPowder.mesh);
    for (const name of templates.keys()) {
      if (/^(calving_(back|roof|floor|ledge)|cavity_)/.test(name))
        unique(name, calving);
      if (/^calving_(chunk|chip)_/.test(name)) {
        const object = unique(name, calving);
        const index = Number(name.slice(-2));
        if (!name.includes('chip')) object.scale.y = 1.45;
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
      mesh.scale.y = 1.45;
      cracks.push(mesh);
    }
    flushBatches();
    group.updateMatrixWorld(true);
    const terrain = [];
    group.traverse((mesh) => {
      if (
        mesh.isInstancedMesh &&
        /\/ (?:cliff_\d|basal_strata|rubble_shelf|landing_shelf|cave_roof|cave_pier|recess_wall|crevice_wall) \//.test(
          mesh.name,
        )
      )
        terrain.push(mesh);
    });
    road?.anchorToTerrain(terrain);
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
      cameraHeight: 45,
      cameraDepth: 45,
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
    const iceMaterial = new T.MeshStandardMaterial({
      name: 'Glasswake composite ice',
      color: '#ffffff',
      vertexColors: true,
      side: T.DoubleSide,
      envMapIntensity: 0.35,
    });
    finishIceMaterial(iceMaterial, iceTexture, { composite: true });
    if (referenceTexture) iceMaterial.envMap = referenceTexture;
    materials.add(iceMaterial);
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
          finishIceMaterial(material, iceTexture);
          material.envMapIntensity = 0.35;
          if (referenceTexture) material.envMap = referenceTexture;
          materials.add(material);
        }
        parts.push({ geometry, material: node.material });
      });
      if (parts.length) {
        const consolidated = consolidateIceParts(parts, iceMaterial);
        if (consolidated.geometry) geometries.add(consolidated.geometry);
        templates.set(root.name, { parts: consolidated.parts, bounds });
      }
    }
    buildWorld();
    return true;
  }
  let ready = Promise.resolve(false);
  if (!shape && (loadAsset || typeof document !== 'undefined')) {
    ready = Promise.resolve()
      .then(async () => {
        if (disposed) return null;
        // Injected CPU asset tests intentionally do not need DOM image loading.
        if (!loadAsset) {
          iceTexture = await new T.TextureLoader()
            .loadAsync('/assets/levels/glasswake/ice-surface-v1.png')
            .catch((reason) => {
              throw new Error(
                'Glasswake ice material failed to load: image request failed',
                { cause: reason },
              );
            });
          if (disposed) {
            iceTexture.dispose();
            iceTexture = null;
            return null;
          }
          iceTexture.colorSpace = T.SRGBColorSpace;
          iceTexture.wrapS = iceTexture.wrapT = T.RepeatWrapping;
          iceTexture.anisotropy = 4;
          metrics.textures = 1;
        }
        return (loadAsset ?? ((url) => new GLTFLoader().loadAsync(url)))(
          ASSET_URL,
        );
      })
      .then((gltf) => (gltf ? accept(gltf) : false))
      .catch((reason) => {
        error = reason instanceof Error ? reason.message : String(reason);
        weather.dispose();
        iceTexture?.dispose();
        iceTexture = null;
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
    ship,
    settings: nextSettings = currentSettings,
    reviewing = false,
    camera,
  } = {}) {
    if (disposed) return;
    currentSettings = nextSettings;
    weather.update({ state, camera, settings: nextSettings, reviewing });
    const conditions = weather.snapshot();
    event = sampleCalvingState(track, state, ship?.group?.position);
    firstShelf = sampleFirstShelf(glasswakeFlightState(track).openingShelf);
    if (openingPivot) {
      const t = firstShelf.separation;
      openingPivot.position
        .copy(openingCentre)
        .add(new T.Vector3(-170 * t, -420 * t * t, 0));
      openingPivot.rotation.set(0.1 * t, -0.08 * t, 0.18 * t);
      openingPivot.visible = firstShelf.phase !== 'fallen';
      for (const seam of openingCracks) {
        const full = seam.geometry.index.count;
        seam.geometry.setDrawRange(
          0,
          Math.floor((full * firstShelf.crack) / 18) * 18,
        );
        seam.visible = firstShelf.crack > 0 && t < 0.65;
      }
      openingPowder.update(firstShelf, nextSettings);
    }
    calvingPowder?.update(event, nextSettings);
    if (cavityLight) cavityLight.intensity = 38000 * event.reveal;
    if (inclusionLight) inclusionLight.intensity = reviewing ? 0 : 65000;
    for (const light of apertureLights)
      light.intensity = reviewing
        ? 0
        : light.name.includes('rim aperture')
          ? 125000
          : 65000;
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
      const delay = index * (chip ? 0.025 : 0.055);
      const t = Math.max(0, (event.separation - delay) / (1 - delay));
      object.position.set(
        -t * (chip ? 69 + index * 4 : 20 + index * 2),
        -t * t * (chip ? 150 : 248 + index * 7),
        t * Math.sin(index * 4.1) * 10,
      );
      object.rotation.z = t * (chip ? -0.22 : -0.15 - index * 0.032);
      object.rotation.x = t * Math.sin(index) * 0.15;
      object.rotation.y = t * Math.sin(index * 2.7) * 0.18;
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
          intensity * (1 - caveBlend * (light.isHemisphereLight ? 0.4 : 0.55));
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
        originalEnvironmentIntensity * (1 - caveBlend * 0.36);
      localFog.density = reviewing
        ? 0.00004
        : 0.00016 + caveBlend * 0.0003 + (conditions.storm ?? 0) * 0.0021;
      localFog.color.set(caveBlend > 0.5 ? '#25435e' : '#7897ad');
      scene.fog = localFog;
    }
    lights.forEach((light, i) => {
      const frame = track.sample((state.distance ?? 0) + (i - 1) * 50 + 40);
      light.position
        .copy(frame.position)
        .addScaledVector(frame.right, (i % 2 ? -1 : 1) * 39);
      light.position.y += 16;
      light.intensity = reviewing
        ? 0
        : (i === 2 ? 175 : i === 0 ? 900 : 650) * caveBlend;
    });
    group.userData.calving = event;
    group.userData.firstShelf = firstShelf;
    group.userData.caveBlend = caveBlend;
    group.userData.returnBlend = returnBlend;
    group.userData.weather = conditions;
  }
  group.userData.metrics = metrics;
  group.userData.getEnvironmentPresentation = () => ({
    loaded,
    error,
    caveBlend,
    returnBlend,
    calving: event,
    firstShelf,
    metrics,
    weather: weather.snapshot(),
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
      weather.dispose();
      iceTexture?.dispose();
      iceTexture = null;
      disposeResources(group, geometries, materials);
      templates.clear();
      batches.clear();
      moving.length = 0;
    },
  };
}
