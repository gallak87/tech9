import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { Box3, Vector3, Texture } from 'three';
import {
  SHIPS,
  getShip,
  loadShipSelection,
  saveShipSelection,
} from './catalog.js';
import { createShip } from './index.js';
import { createVehicleState, stepVehicle } from '../physics/index.js';

const flat = {
  width: 100000,
  length: 100000,
  sample: () => ({
    curvature: 0,
    bank: 0,
    tangent: { x: 0, y: 0, z: 1 },
    right: { x: 1, y: 0, z: 0 },
  }),
};
const drive = (id, seconds, input, initial = {}) => {
  const state = Object.assign(createVehicleState(id), initial);
  for (let tick = 0; tick < seconds * 120; tick++)
    stepVehicle(state, input, flat, 1 / 120);
  return state;
};

test('the fleet has meaningful speed, acceleration, turning, braking and endurance tradeoffs', () => {
  const cruise = Object.fromEntries(
    SHIPS.map(({ id }) => [id, drive(id, 80, { throttle: 1 }).speed]),
  );
  assert.ok(cruise.needle > cruise.kestrel + 12);
  assert.ok(cruise.kestrel > cruise.shrike + 10);
  assert.ok(
    drive('shrike', 2, { throttle: 1 }).speed >
      drive('kestrel', 2, { throttle: 1 }).speed,
  );
  assert.ok(
    drive('bastion', 2, { throttle: 1 }).speed <
      drive('kestrel', 2, { throttle: 1 }).speed,
  );
  const turn = (id) =>
    Math.abs(drive(id, 0.4, { steer: 1, throttle: 1 }, { speed: 70 }).heading);
  assert.ok(turn('shrike') > turn('kestrel') * 1.15);
  assert.ok(turn('bastion') < turn('kestrel') * 0.9);
  assert.ok(
    drive('needle', 0.5, { brake: 1 }, { speed: 100 }).speed >
      drive('kestrel', 0.5, { brake: 1 }, { speed: 100 }).speed + 6,
  );
  const boost = (id) =>
    drive(id, 3, { throttle: 1, boost: true }, { speed: 90 });
  assert.ok(boost('bastion').energy > boost('kestrel').energy + 15);
  assert.ok(boost('needle').energy < boost('kestrel').energy - 10);
});

test('unknown selections and unavailable storage fall back to Kestrel', () => {
  assert.equal(getShip('missing').id, 'kestrel');
  assert.equal(loadShipSelection().id, 'kestrel');
  assert.doesNotThrow(() => saveShipSelection('needle'));
});

test('every exported chassis fits the shared collision hull and owns its correct exhaust geometry', async () => {
  for (const spec of SHIPS) {
    const bytes = await readFile(
      new URL('../../public/' + spec.asset, import.meta.url),
    );
    const loader = new GLTFLoader();
    // Geometry/ownership tests do not need a DOM image decoder. Real texture
    // decoding is exercised by the hidden-browser fleet verification.
    loader.register(() => ({
      name: 'KHR_texture_basisu',
      loadTexture: async () => new Texture(),
    }));
    const { scene, parser } = await loader.parseAsync(
      bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
      '',
    );
    {
      assert.equal(
        parser.json.images?.length,
        spec.id === 'kestrel' ? 12 : 15,
        spec.id + ' existing PBR image budget',
      );
      assert.ok(
        parser.json.images.every(
          (image) =>
            Number.isInteger(image.bufferView) &&
            !image.uri &&
            image.mimeType === 'image/ktx2',
        ),
      );
    }
    const bounds = new Box3().setFromObject(scene);
    assert.ok(
      bounds.min.x >= -2.25 && bounds.max.x <= 2.25,
      spec.id + ' width',
    );
    // Approved Kestrel's decorative prow extends slightly beyond the common
    // conservative hull; all new craft stay inside that established envelope.
    assert.ok(
      bounds.min.z >= -3.51 && bounds.max.z <= 3.7,
      spec.id + ' length',
    );
    assert.ok(
      bounds.min.y >= -0.12 && bounds.max.y <= 1.8,
      spec.id + ' vertical',
    );
    let meshes = 0;
    let triangles = 0;
    scene.traverse((object) => {
      if (!object.isMesh) return;
      meshes++;
      triangles +=
        (object.geometry.index?.count ??
          object.geometry.attributes.position.count) / 3;
      for (const attribute of Object.values(object.geometry.attributes))
        assert.ok(
          Array.from(attribute.array).every(Number.isFinite),
          spec.id + ' finite geometry',
        );
    });
    assert.ok(meshes <= (spec.id === 'kestrel' ? 13 : 12));
    const triangleBudget = {
      kestrel: 51544,
      shrike: 52324,
      bastion: 50960,
      needle: 36818,
    };
    assert.ok(
      triangles <= triangleBudget[spec.id],
      spec.id + ' existing triangle budget',
    );
    const craft = await createShip({ id: spec.id, model: scene });
    const plumes = craft.group.children.filter(
      (object) => object.name === 'Ion exhaust',
    );
    assert.equal(plumes.length, spec.id === 'needle' ? 1 : 2);
    for (let i = 0; i < plumes.length; i++) {
      const anchor = craft.group.getObjectByName(spec.exhausts[i]);
      assert.ok(
        plumes[i].position.distanceTo(anchor.getWorldPosition(new Vector3())) <
          1e-6,
      );
    }
    if (spec.id === 'needle') assert.equal(plumes[0].position.x, 0);
    craft.update({ speed: 100, boost: false, energy: 1 });
    const cruise = plumes[0].scale.z;
    craft.update({ speed: 100, boost: true, energy: 1 });
    assert.ok(plumes[0].scale.z > cruise * 2.5);
    craft.dispose();
    craft.dispose();
    scene.traverse((object) => {
      object.geometry?.dispose();
      object.material?.dispose();
    });
  }
});
