import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import { createSkywellTerraceArt } from './terrace-art.js';

function island() {
  const root = new T.Group();
  root.name = 'Selected cultivated island';
  for (const role of [
    'rock',
    'rock_light',
    'rock_dark',
    'bronze',
    'copper',
    'limestone',
    'moss',
    'pale',
  ]) {
    const mesh = new T.Mesh(new T.BoxGeometry(), new T.MeshStandardMaterial());
    mesh.name = `island-grand__${role}`;
    root.add(mesh);
  }
  return root;
}

test('fitted boundary copies actual island transform and restores only decoration visibility', async () => {
  const selected = island(),
    untouched = island(),
    parent = new T.Group();
  parent.position.set(110, -24, 45);
  parent.rotation.y = -0.42;
  selected.position.set(32, 21, -19);
  selected.rotation.y = 0.17;
  selected.scale.set(1.3, 0.8, 1.1);
  selected.getObjectByName('island-grand__pale').visible = false;
  parent.add(selected, untouched);
  parent.updateWorldMatrix(true, true);
  const expected = selected.matrixWorld.clone();
  const source = new T.Group();
  source.add(
    new T.Mesh(new T.BoxGeometry(20, 2, 30), new T.MeshStandardMaterial()),
  );
  let loads = 0;
  const art = await createSkywellTerraceArt({
    islands: [selected, selected],
    loadAsset: async () => {
      loads++;
      return { scene: source };
    },
  });
  assert.equal(loads, 1);
  assert.equal(art.group.children.length, 1);
  assert.deepEqual(art.group.children[0].matrix.elements, expected.elements);
  for (const role of ['rock', 'rock_light', 'rock_dark'])
    assert.equal(
      selected.getObjectByName(`island-grand__${role}`).visible,
      true,
    );
  for (const role of ['bronze', 'copper', 'limestone', 'moss', 'pale'])
    assert.equal(
      selected.getObjectByName(`island-grand__${role}`).visible,
      false,
    );
  assert.equal(untouched.getObjectByName('island-grand__bronze').visible, true);
  assert.deepEqual(art.blockers, [art.group]);
  art.dispose();
  assert.equal(selected.getObjectByName('island-grand__bronze').visible, true);
  assert.equal(selected.getObjectByName('island-grand__pale').visible, false);
});

test('private source releases once while borrowed stone and reflection remain owned by ENV', async () => {
  const stone = new T.Texture(),
    reflection = new T.Texture(),
    privateTexture = new T.Texture();
  const geometry = new T.BoxGeometry();
  const limestone = new T.MeshStandardMaterial();
  limestone.name = 'garden-terrace-grand / limestone';
  const bronze = new T.MeshStandardMaterial({ map: privateTexture });
  bronze.name = 'garden-terrace-grand / bronze';
  const source = new T.Group();
  source.add(new T.Mesh(geometry, limestone), new T.Mesh(geometry, bronze));
  const counts = new Map();
  for (const [name, value] of Object.entries({
    geometry,
    limestone,
    bronze,
    stone,
    reflection,
    privateTexture,
  }))
    value.addEventListener('dispose', () =>
      counts.set(name, (counts.get(name) ?? 0) + 1),
    );
  const art = await createSkywellTerraceArt({
    islands: [island(), island()],
    stoneTexture: stone,
    loadAsset: async () => ({ scene: source }),
  });
  assert.equal(limestone.map, stone);
  art.setReflection(reflection);
  art.dispose();
  art.dispose();
  assert.equal(counts.get('geometry'), 1);
  assert.equal(counts.get('limestone'), 1);
  assert.equal(counts.get('bronze'), 1);
  assert.equal(counts.get('privateTexture'), 1);
  assert.equal(counts.get('stone') ?? 0, 0);
  assert.equal(counts.get('reflection') ?? 0, 0);
});

test('empty selection skips loading and a failed load preserves canonical visibility', async () => {
  let loads = 0;
  const selected = island(),
    failure = new Error('asset unavailable');
  const loadAsset = async () => {
    loads++;
    throw failure;
  };
  const empty = await createSkywellTerraceArt({ loadAsset });
  assert.equal(loads, 0);
  empty.dispose();
  await assert.rejects(
    createSkywellTerraceArt({ islands: [selected], loadAsset }),
    failure,
  );
  assert.equal(loads, 1);
  assert.equal(selected.getObjectByName('island-grand__bronze').visible, true);
});
