import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import * as T from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { createSaffronTrack } from '../track/model.js';
import { createSaffronEnvironment } from './index.js';
import { skullPlacement } from './fossils.js';
import { createSaffronRoad } from '../track/road.js';
import { sampleBurrower } from './effects.js';
import { createLevelPresentation } from '../../presentation.js';

// Tests live under src/levels/saffron/environment, four levels below app root.
const assetPath = new URL(
  '../../../../public/assets/levels/saffron/leviathan-kit.glb',
  import.meta.url,
);
async function loadKit() {
  const bytes = await fs.readFile(assetPath);
  return new Promise((resolve, reject) =>
    new GLTFLoader().parse(
      bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
      '',
      resolve,
      reject,
    ),
  );
}

function disposeFixture(scene) {
  const geometries = new Set(),
    materials = new Set();
  scene.traverse((object) => {
    if (object.geometry) geometries.add(object.geometry);
    for (const material of [object.material].flat().filter(Boolean))
      materials.add(material);
  });
  for (const geometry of geometries) geometry.dispose();
  for (const material of materials) material.dispose();
}

test('actual Blender skull clears the descending banked road and camera envelope', async () => {
  const track = createSaffronTrack();
  const gltf = await loadKit();
  const placement = skullPlacement(track).matrix;
  const triangles = [];
  gltf.scene.updateMatrixWorld(true);
  gltf.scene.getObjectByName('skull').traverse((object) => {
    if (!object.isMesh) return;
    const geometry = object.geometry,
      positions = geometry.attributes.position,
      indices = geometry.index;
    for (let i = 0; i < (indices?.count ?? positions.count); i += 3) {
      const vertices = [0, 1, 2].map((offset) =>
        new T.Vector3()
          .fromBufferAttribute(
            positions,
            indices ? indices.getX(i + offset) : i + offset,
          )
          .applyMatrix4(object.matrixWorld)
          .applyMatrix4(placement),
      );
      triangles.push({
        name: object.name,
        vertices,
        box: new T.Box3().setFromPoints(vertices),
      });
    }
  });
  assert.ok(
    triangles.length > 17000,
    'The production authored model must actually be checked',
  );
  const envelope = new T.Box3(
    new T.Vector3(-22, -10, -6),
    new T.Vector3(22, 26, 6),
  );
  const triangle = new T.Triangle();
  const collisions = [];
  for (
    let s = track.landmarks.skullStart - 20;
    s <= track.landmarks.skullEnd + 20;
    s += 8
  ) {
    const frame = track.sample(s);
    const roadMatrix = new T.Matrix4().compose(
      frame.position,
      frame.quaternion,
      new T.Vector3(1, 1, 1),
    );
    const inverse = roadMatrix.clone().invert();
    const worldEnvelope = envelope.clone().applyMatrix4(roadMatrix);
    for (const candidate of triangles) {
      if (!candidate.box.intersectsBox(worldEnvelope)) continue;
      triangle.set(
        ...candidate.vertices.map((vertex) =>
          vertex.clone().applyMatrix4(inverse),
        ),
      );
      if (envelope.intersectsTriangle(triangle))
        collisions.push({ s, name: candidate.name });
    }
  }
  disposeFixture(gltf.scene);
  assert.deepEqual(collisions, []);
});

test('production asset loading, deterministic spectacle and repeated ownership disposal', async () => {
  const track = createSaffronTrack();
  const gltf = await loadKit();
  for (const name of ['vertebra', 'vertebra_1', 'vertebra_2']) {
    const cortical = gltf.scene.getObjectByName(`${name}_Saffron_pale_fossil`);
    assert.ok(
      cortical?.geometry.attributes.position.count > 0,
      `${name} must retain its actual cortical arch after erosion`,
    );
    gltf.scene.updateMatrixWorld(true);
    assert.ok(
      new T.Box3().setFromObject(cortical).max.y > 60,
      `${name} retains the overhead arch silhouette`,
    );
  }
  let sourceDisposals = 0;
  const geometries = new Set();
  gltf.scene.traverse((object) => {
    if (object.geometry) geometries.add(object.geometry);
  });
  for (const geometry of geometries)
    geometry.addEventListener('dispose', () => sourceDisposals++);
  const environment = createSaffronEnvironment(
    { track },
    { loadAsset: async () => gltf },
  );
  assert.equal(await environment.ready, true);
  assert.ok(environment.group.userData.metrics.triangleCount < 700000);
  assert.ok(environment.group.userData.metrics.meshCount < 80);
  const frame = {
    time: 32,
    settings: { quality: 'high', reducedMotion: false },
  };
  environment.update(frame);
  environment.group.traverse((o) => {
    if (o.isLight) assert.ok(Number.isFinite(o.intensity));
  });
  const first = environment.group.userData.getLeviathanPresentation();
  assert.equal(first.phase, 'breaching');
  assert.equal(first.active, true);
  environment.reset();
  environment.update(frame);
  assert.deepEqual(
    environment.group.userData.getLeviathanPresentation(),
    first,
  );
  environment.update({
    ...frame,
    settings: { quality: 'low', reducedMotion: true },
  });
  const reduced = environment.group.userData.getLeviathanPresentation();
  assert.deepEqual(
    reduced.position,
    first.position,
    'Presets do not change event position or clock',
  );
  assert.equal(reduced.age, first.age);
  environment.dispose();
  environment.dispose();
  assert.equal(sourceDisposals, geometries.size);
  assert.equal(environment.group.children.length, 0);
});

test('late asset completion after disposal releases loaded buffers without attaching children', async () => {
  const track = createSaffronTrack();
  const gltf = await loadKit();
  let sourceDisposals = 0;
  let materialDisposals = 0,
    textureDisposals = 0;
  const materials = new Set(),
    texture = new T.Texture();
  texture.addEventListener('dispose', () => textureDisposals++);
  const geometries = new Set();
  gltf.scene.traverse((object) => {
    if (object.geometry) geometries.add(object.geometry);
    for (const material of [object.material].flat().filter(Boolean))
      materials.add(material);
  });
  for (const geometry of geometries)
    geometry.addEventListener('dispose', () => sourceDisposals++);
  for (const material of materials) {
    material.map = texture;
    material.addEventListener('dispose', () => materialDisposals++);
  }
  let resolve;
  const deferred = new Promise((done) => {
    resolve = done;
  });
  const environment = createSaffronEnvironment(
    { track },
    { loadAsset: () => deferred },
  );
  environment.dispose();
  resolve(gltf);
  assert.equal(await environment.ready, false);
  assert.equal(sourceDisposals, geometries.size);
  assert.equal(materialDisposals, materials.size);
  assert.equal(textureDisposals, 1);
  assert.equal(environment.group.children.length, 0);
});

test('asset failure unwinds the environment and neutral shape remains asset-free', async () => {
  const track = createSaffronTrack();
  const environment = createSaffronEnvironment(
    { track },
    {
      loadAsset: async () => {
        throw new Error('fixture asset failure');
      },
    },
  );
  await assert.rejects(environment.ready, /fixture asset failure/);
  assert.equal(environment.group.children.length, 0);
  let loads = 0;
  const shape = createSaffronEnvironment(
    { track },
    {
      shape: true,
      loadAsset: () => {
        loads++;
      },
    },
  );
  await shape.ready;
  assert.equal(loads, 0);
  assert.ok(
    shape.group.getObjectByName(
      'Saffron / neutral skull mouth and occipital clearance',
    ),
  );
  shape.dispose();
  assert.deepEqual(sampleBurrower(32), sampleBurrower(80));
  assert.equal(sampleBurrower(18).phase, 'moving-ridge');
});

test('cranial shelter attenuates borrowed daylight, preserves warm local bounce and restores on exit/disposal', async () => {
  const track = createSaffronTrack();
  const scene = new T.Scene();
  const sun = new T.DirectionalLight('#fff0d0', 2.6);
  sun.castShadow = true;
  const sky = new T.HemisphereLight('#d5c4e4', '#b48b58', 0.54);
  scene.add(sun, sky);
  scene.environmentIntensity = 0.68;
  const environment = createSaffronEnvironment(
    { track, view: { scene } },
    { loadAsset: loadKit },
  );
  await environment.ready;
  const inside = {
    state: { distance: track.landmarks.skullCenter },
    time: 32,
    settings: { quality: 'high' },
  };
  environment.update(inside);
  assert.ok(sun.intensity < 0.8);
  assert.ok(sky.intensity < 0.2);
  assert.ok(scene.environmentIntensity < 0.4);
  const bounce = [];
  environment.group.traverse((o) => {
    if (o.isPointLight) bounce.push(o.intensity);
  });
  assert.ok(bounce.every((v) => Number.isFinite(v) && v > 1000));
  environment.update({
    state: { distance: 0 },
    time: 32,
    settings: { quality: 'low', reducedMotion: true },
  });
  assert.equal(sun.intensity, 2.6);
  assert.equal(sky.intensity, 0.54);
  assert.equal(scene.environmentIntensity, 0.68);
  environment.update(inside);
  environment.dispose();
  environment.dispose();
  assert.equal(sun.intensity, 2.6);
  assert.equal(sky.intensity, 0.54);
  assert.equal(scene.environmentIntensity, 0.68);
});

test('visible road supports clamp onto actual fossil floors before terrain fallback', async () => {
  const track = createSaffronTrack();
  const road = createSaffronRoad({ track });
  const env = createSaffronEnvironment({ track, road }, { loadAsset: loadKit });
  try {
    await env.ready;
    const contacts = road.group.userData.fossilSupportContacts;
    assert.ok(
      contacts.length >= 4,
      'skull and spine supports use actual authored fossil surfaces',
    );
    assert.equal(
      contacts.filter(
        (c) =>
          c.s > track.landmarks.skullStart && c.s < track.landmarks.skullEnd,
      ).length,
      8,
      'both forks at every interior support seat above the receiving bone floor',
    );
    const shoes = road.group.getObjectByName('Broad fossil shelf shoes'),
      matrix = new T.Matrix4();
    for (const contact of contacts) {
      assert.match(contact.source, /authored (skull|vertebra)/);
      shoes.getMatrixAt(contact.index, matrix);
      const shoe = new T.Vector3().setFromMatrixPosition(matrix),
        point = new T.Vector3().fromArray(contact.point),
        normal = new T.Vector3().fromArray(contact.normal);
      assert.ok(
        shoe.distanceTo(point) < 1.31,
        'shoe intersects the receiving bone instead of hovering',
      );
      assert.ok(Math.abs(normal.length() - 1) < 1e-8);
    }
  } finally {
    env.dispose();
    road.dispose();
  }
});

test('the real presentation loader connects Saffron road anchoring after the fossil asset is ready', async () => {
  const track = createSaffronTrack(),
    scene = new T.Scene();
  const world = await createLevelPresentation(
    {
      createRoad: createSaffronRoad,
      createEnvironment: (context) =>
        createSaffronEnvironment(context, { loadAsset: loadKit }),
    },
    { track, view: { scene, updatePresentation() {} } },
  );
  try {
    const contacts = world.road.userData.fossilSupportContacts;
    assert.equal(
      contacts.filter(
        (c) =>
          c.s > track.landmarks.skullStart && c.s < track.landmarks.skullEnd,
      ).length,
      8,
    );
    assert.ok(contacts.some((c) => c.source.includes('vertebra')));
  } finally {
    world.dispose();
  }
  assert.equal(scene.children.length, 0);
});
