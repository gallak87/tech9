import test from 'node:test';
import assert from 'node:assert/strict';
import { Group, Quaternion, Scene, Vector3 } from 'three';
import { createMagneticRuntime } from '../core/session-runtime.js';
import { createDeviceRuntime } from '../pickups/runtime.js';
import { createVehicleState } from '../physics/index.js';
import { createRace } from './index.js';
import { createRacers, createRacerPresentation } from './racers.js';

const DT = 1 / 120;
const track = {
  id: 'field-test',
  length: 2000,
  width: 44,
  closed: true,
  checkpoints: [0, 500, 1000, 1500].map((distance) => ({ distance })),
  sample: (distance) => ({
    position: new Vector3(0, 0, distance),
    right: new Vector3(1, 0, 0),
    up: new Vector3(0, 1, 0),
    tangent: new Vector3(0, 0, 1),
    quaternion: new Quaternion(),
    curvature: 0,
    bank: 0,
  }),
};
function field() {
  return {
    id: 'pursuit-squad-v1',
    opponents: [
      {
        id: 'rook',
        name: 'Rook',
        shipId: 'kestrel',
        team: 'hunters',
        lane: -10,
        pace: 1,
        version: 1,
      },
      {
        id: 'kite',
        name: 'Kite',
        shipId: 'needle',
        team: 'hunters',
        lane: 10,
        pace: 1,
        version: 1,
      },
      {
        id: 'manta',
        name: 'Manta',
        shipId: 'shrike',
        team: 'hunters',
        lane: -6,
        pace: 1,
        version: 1,
      },
      {
        id: 'goliath',
        name: 'Goliath',
        shipId: 'bastion',
        chassisId: 'goliath',
        team: 'quarry',
        lane: 0,
        pace: 1,
        version: 2,
      },
    ],
    grid: {
      player: { distance: 0, lateral: 0 },
      goliath: { distance: 120, lateral: 0 },
      rook: { distance: -12, lateral: -10 },
      kite: { distance: -24, lateral: 10 },
      manta: { distance: -36, lateral: -6 },
    },
  };
}

test('a custom field owns its real roster, spawn/chassis/team identities, ordinary controls and exact rollback', () => {
  const configuration = field(),
    callbacks = [],
    constructions = [];
  configuration.control = ({
    opponent,
    defaultControl,
    nearby,
    track: course,
  }) => {
    callbacks.push(opponent.specification.id);
    assert.equal(nearby.length, 5);
    assert.equal(course, track);
    return { ...defaultControl, boost: false };
  };
  const racers = createRacers({
    track,
    continuous: true,
    field: configuration,
    createRuntime: (specification) => {
      constructions.push(specification.id);
      return createDeviceRuntime({
        track,
        devices: [],
        combatId: specification.id,
        team: specification.team,
        motion: createMagneticRuntime({ track }),
      });
    },
  });
  try {
    racers.reset();
    const playerState = createVehicleState(),
      playerRace = createRace(track),
      context = { playerState, playerRace };
    assert.equal(racers.opponents.length, 4);
    assert.equal(racers.identity.field.id, 'pursuit-squad-v1');
    assert.deepEqual(
      racers.identity.opponents.find((row) => row.id === 'goliath').chassis,
      { id: 'goliath', version: 2 },
    );
    assert.equal(racers.opponents.at(-1).state.chassisId, 'goliath');
    assert.equal(racers.opponents.at(-1).state.distance, 120);
    assert.equal(racers.opponents.at(-1).state.shipId, 'bastion');
    for (let i = 0; i < 20; i++) racers.advance(DT, context);
    assert.equal(callbacks.length, 80);
    const snapshot = racers.snapshot(context);
    assert.equal(snapshot.standings.length, 5);
    assert.equal(
      snapshot.standings.find((row) => row.id === 'goliath').team,
      'quarry',
    );
    assert.equal(snapshot.playerFinished, false);
    const saved = racers.serialize();
    for (let i = 0; i < 20; i++) racers.advance(DT, context);
    const expected = racers.serialize();
    racers.restore(saved);
    assert.deepEqual(
      constructions.slice(-4),
      configuration.opponents.map((row) => row.id),
      'restore validation constructs each actual NPC role, not a default player actor',
    );
    for (let i = 0; i < 20; i++) racers.advance(DT, context);
    assert.deepEqual(racers.serialize(), expected);
    racers.reset({ gridOrder: ['goliath', 'player', 'manta', 'kite', 'rook'] });
    assert.equal(
      racers.opponents.at(-1).state.distance,
      120,
      'reordered tie priority cannot teleport the quarry spawn',
    );
    assert.throws(() => racers.restore(saved), /mismatch/);
    assert.throws(
      () => racers.reset({ gridOrder: ['player', 'rook'] }),
      /every racer/,
    );
    racers.reset();
    assert.deepEqual(racers.identity.grid, configuration.grid);
  } finally {
    racers.dispose();
  }
});

test('custom presentation loads only the selected squad and delegates the large target to its supplied factory', async () => {
  const ids = [],
    groups = [];
  const racers = createRacers({
    track,
    continuous: true,
    field: field(),
    createRuntime: () => createMagneticRuntime({ track }),
  });
  const scene = new Scene();
  const presentation = await createRacerPresentation({
    racers,
    scene,
    track,
    loadRival: async (id) => {
      ids.push(id);
      const group = new Group();
      groups.push(group);
      return {
        group,
        update() {},
        dispose() {
          group.removeFromParent();
        },
      };
    },
  });
  try {
    assert.deepEqual(ids, ['rook', 'kite', 'manta', 'goliath']);
    racers.reset();
    presentation.update({ mode: 'racing' });
    assert.ok(groups.every((group) => group.visible));
    racers.setEliminated('goliath');
    presentation.update({ mode: 'racing' });
    assert.equal(groups.at(-1).visible, false);
  } finally {
    presentation.dispose();
    racers.dispose();
  }
  assert.equal(scene.children.length, 0);
});
