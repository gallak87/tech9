import test from 'node:test';
import assert from 'node:assert/strict';
import { Group, Scene, Texture } from 'three';
import { assertLevelContract } from './level-checks/level-contract.mjs';
import { assertTrackContract } from './level-checks/track-contract.mjs';
import { loop } from './level-checks/fixtures.mjs';
import {
  validateMetadata,
  validateDefinition,
  createCatalog,
} from '../src/levels/contract.js';
import { createLevelPresentation } from '../src/levels/presentation.js';

const metadata = {
  id: 'test-route',
  name: 'Arbitrary loop',
  order: 22,
  review: true,
  shape: true,
  ui: {
    edition: '',
    subtitle: '',
    eyebrow: '',
    heading: ['Loop', 'Test'],
    intro: '',
    detail: '',
    start: '',
    tag: '',
    tagDetail: '',
  },
};
const component = () => ({ group: new Group(), dispose() {} });
const createLevel = () => ({
  version: 'test-v1',
  racing: {
    createDevices: () => [
      {
        id: 'launch',
        type: 'vector',
        distance: 70,
        lateral: 0,
        width: 14,
        length: 54,
        label: 'Launch',
      },
      {
        id: 'shield',
        type: 'aegis',
        distance: 360,
        lateral: 3,
        width: 8,
        length: 8,
        label: 'Shield',
      },
    ],
  },
  createTrack: loop,
  createRoad: component,
  createEnvironment: component,
  createBackdrop: component,
});

test('named playtest cases require distinct IDs and an available default case', () => {
  const entry = { id: 'approach', label: 'Approach', scenario: 'jump' };
  const definition = (cases) => ({
    ...createLevel(),
    playtests: {
      jump: {
        scenario: 'jump',
        label: 'Jump',
        description: 'Contact test',
        cases,
      },
    },
  });
  assert.doesNotThrow(() => validateDefinition(definition([entry])));
  for (const cases of [
    [],
    [entry, entry],
    [{ ...entry, scenario: 'missing-default' }],
  ])
    assert.throws(
      () => validateDefinition(definition(cases)),
      /playtests.jump.cases/,
    );
});

test('a self-contained async module needs no registry, ground height, special scenario or world preset', async () => {
  const report = await assertLevelContract({
    metadata,
    createLevel: async () => ({
      ...createLevel(),
      createTrack: async () => loop(),
    }),
  });
  assert.equal(report.id, 'test-route');
  assert.equal(report.production.samples, report.shape.samples);
  const track = loop();
  track.checkpoints = [{ s: 0 }];
  track.scenarios = { arbitrary: {}, partial: { distance: 12 } };
  assertTrackContract(track);
  track.checkpoints = [{ distance: 0 }];
  assertTrackContract(track);
});

test('shape mismatches and malformed optional metadata are rejected by reusable checks', async () => {
  await assert.rejects(
    assertLevelContract({
      metadata,
      createLevel: () => ({ ...createLevel(), audio: { immersion: true } }),
    }),
    /audio.immersion/,
  );
  await assert.rejects(
    assertLevelContract({
      metadata,
      createLevel: () => ({ ...createLevel(), racing: undefined }),
    }),
    /require shared racing/,
  );
  await assert.rejects(
    assertLevelContract({
      metadata,
      createLevel: ({ shape }) => ({
        ...createLevel(),
        createTrack() {
          const track = loop();
          if (shape) track.width += 1;
          return track;
        },
      }),
    }),
    /share route width/,
  );
  for (const ui of [
    { ...metadata.ui, compact: 'yes' },
    { ...metadata.ui, portraitCompactHud: 'yes' },
    { ...metadata.ui, shape: { intro: 4 } },
    { ...metadata.ui, shape: { heading: ['one'] } },
  ])
    assert.throws(
      () => validateMetadata({ ...metadata, ui }),
      /Invalid circuit/,
    );
  const defaultMetadata = { ...metadata, id: 'halcyon' };
  assert.throws(
    () => createCatalog({ './bad/path/metadata.js': defaultMetadata }, {}),
    /Invalid circuit metadata/,
  );
});

test('presentation failure releases malformed owners and preserves the originating error', async () => {
  for (const failure of ['group', 'factory', 'ready', 'overlay']) {
    const released = [],
      scene = new Scene();
    const road = { group: new Group(), dispose: () => released.push('road') };
    const environment = {
      group: new Group(),
      dispose: () => released.push('environment'),
    };
    if (failure === 'group') environment.group = null;
    if (failure === 'ready')
      environment.ready = Promise.reject(new Error('ready failed'));
    await assert.rejects(
      createLevelPresentation(
        {
          createRoad: () => road,
          createEnvironment: () => {
            if (failure === 'factory') throw new Error('factory failed');
            return environment;
          },
          createOverlay: () => {
            if (failure === 'overlay') throw new Error('overlay failed');
            return null;
          },
        },
        { view: { scene } },
      ),
      failure === 'group' ? /group is required/ : /failed/,
    );
    assert.deepEqual(
      released,
      failure === 'factory' ? ['road'] : ['environment', 'road'],
    );
    assert.equal(scene.children.length, 0);
  }
});

test('overlay and borrowed reflection obey reset/update/disposal and cannot revive disposed owners', async () => {
  const calls = [],
    scene = new Scene(),
    texture = new Texture();
  let textureDisposals = 0;
  texture.addEventListener('dispose', () => textureDisposals++);
  const part = (name) => ({
    group: new Group(),
    reset: () => calls.push(`${name}:reset`),
    setReflection: () => calls.push(`${name}:reflection`),
    update: (frame) => calls.push([name, frame.dt, frame.reset]),
    dispose: () => calls.push(`${name}:dispose`),
  });
  const overlay = {
    reset: () => calls.push('overlay:reset'),
    update: (frame) => calls.push(['overlay', frame.dt, frame.reset]),
    afterRender: () => calls.push('overlay:after'),
    dispose: () => calls.push('overlay:dispose'),
  };
  const world = await createLevelPresentation(
    {
      createRoad: () => part('road'),
      createEnvironment: () => part('environment'),
      createOverlay: () => overlay,
    },
    { view: { scene, updatePresentation() {} } },
  );
  world.setReflection(texture);
  world.reset();
  world.update(Object.freeze({ mode: 'paused', dt: 99 }));
  world.afterRender({});
  assert.deepEqual(calls.filter(Array.isArray), [
    ['road', 0, true],
    ['environment', 0, true],
    ['overlay', 0, true],
  ]);
  world.dispose();
  const count = calls.length;
  world.dispose();
  world.reset();
  world.update({});
  world.afterRender({});
  world.setReflection(texture);
  assert.equal(calls.length, count);
  assert.deepEqual(calls.slice(-3), [
    'overlay:dispose',
    'environment:dispose',
    'road:dispose',
  ]);
  assert.equal(scene.children.length, 0);
  assert.equal(textureDisposals, 0);
  texture.dispose();
});
