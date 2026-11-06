import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import { createCompletionEffects } from './completion-effects.js';
import { pickupPreviewFrame } from '../ships/pickup-preview-sequence.js';

function fixture() {
  const scene = new T.Scene(),
    road = new T.Group();
  const geometry = new T.PlaneGeometry(30, 2000)
    .rotateX(-Math.PI / 2)
    .translate(0, 0, 1000);
  const coordinates = [];
  for (let i = 0; i < geometry.attributes.position.count; i++)
    coordinates.push(
      geometry.attributes.position.getZ(i),
      geometry.attributes.position.getX(i),
    );
  geometry.setAttribute(
    'roadCoord',
    new T.Float32BufferAttribute(coordinates, 2),
  );
  const deck = new T.Mesh(geometry, new T.MeshBasicMaterial());
  deck.userData.roadSurface = true;
  road.add(deck);
  scene.add(road);
  const track = {
    width: 30,
    length: 2000,
    closed: false,
    sample: (s) => ({
      position: new T.Vector3(0, 0, s),
      right: new T.Vector3(1, 0, 0),
      up: new T.Vector3(0, 1, 0),
      tangent: new T.Vector3(0, 0, 1),
      quaternion: new T.Quaternion(),
    }),
  };
  const actors = [
    { id: 'hero', combatId: 'player' },
    { id: 'rook', combatId: 'rook' },
    { id: 'manta', combatId: 'manta' },
  ];
  const models = new Map(
    actors.map(({ id }) => {
      const group = new T.Group();
      group.add(
        new T.Mesh(new T.BoxGeometry(4, 1, 7), new T.MeshBasicMaterial()),
      );
      group.userData.bounds = { min: [-2, -0.5, -3.5], max: [2, 0.5, 3.5] };
      scene.add(group);
      return [id, { group }];
    }),
  );
  const run = {
    actors,
    devices: [
      {
        id: 'breaker-arc',
        type: 'arc',
        distance: 620,
        lateral: -6,
        width: 5,
        length: 10,
      },
    ],
    events: [
      {
        time: 0.1,
        actor: 'hero',
        type: 'pickup-activate',
        payload: { kind: 'arc', deviceId: 'breaker-arc' },
      },
    ],
  };
  const frame = (time, firing = false) => {
    const combat = firing
      ? structuredClone(pickupPreviewFrame('arc', 0.36).combat)
      : { emitters: {}, shots: [], flashes: [], wakes: [], disruptions: {} };
    combat.time = time;
    combat.disruptions ??= {};
    return {
      time,
      combat,
      ...Object.fromEntries(
        actors.map(({ id }, i) => [
          id,
          {
            position: [i * 6, 0.72, 620 + i * 20],
            quaternion: [0, 0, 0, 1],
            grounded: true,
            recovering: false,
            state: { speed: 120, distance: 620 + i * 20 },
            effects: {
              vectorActive: false,
              aegisRemaining: 0,
              used: time >= 0.1 ? { 'breaker-arc': 0 } : {},
            },
          },
        ]),
      ),
    };
  };
  return { scene, road, track, models, run, frame };
}

test('recorded acquisition and native combat snapshots use production effects without repeating events', () => {
  const f = fixture();
  const effects = createCompletionEffects({
    ...f,
    settings: { quality: 'low' },
  });
  try {
    const sample = f.frame(0.1, true),
      original = JSON.stringify(sample);
    effects.update(sample, { models: f.models });
    assert.equal(
      JSON.stringify(sample),
      original,
      'presentation never mutates native recording',
    );
    const acquired = f.models
      .get('hero')
      .group.getObjectByName('Low pickup / activation');
    assert.equal(acquired.visible, true);
    assert.ok(
      f.scene.getObjectByName('Low Arc / bolts').count > 0,
      'actual recorded shots are visible',
    );
    const mark = f.scene.getObjectByName('Low pickup / symbol');
    effects.update(f.frame(0.2), { models: f.models });
    const opacity = acquired.material.opacity;
    effects.update(f.frame(0.2), { models: f.models });
    assert.equal(
      acquired.material.opacity,
      opacity,
      'held render cannot retrigger acquisition',
    );
    effects.update(f.frame(0.4), { models: f.models });
    assert.equal(
      mark.material.color.getHex(),
      0x49515b,
      'real used-device state dims the gate after its acquisition flash',
    );
    assert.equal(acquired.visible, false, 'recorded event tail expires');
    assert.equal(
      f.scene.getObjectByName('Low Arc / bolts').count,
      0,
      'expired recorded shots disappear',
    );
    effects.update(f.frame(0.1), { models: f.models });
    assert.equal(
      acquired.visible,
      true,
      'rewind resets and replays the actual event once',
    );
    effects.update(f.frame(12), { models: f.models, reducedMotion: true });
    assert.equal(
      acquired.visible,
      false,
      'skipping forward ages old events rather than firing them again',
    );
    assert.equal(
      f.scene.getObjectByName('Career finale / fixed road skid traces'),
      undefined,
    );
  } finally {
    effects.dispose();
  }
});

test('recorded target hits use the actual hull response and quality changes preserve source resources', () => {
  const f = fixture(),
    settings = { quality: 'low' };
  const effects = createCompletionEffects({ ...f, settings });
  const originalResources = new Set();
  f.road.traverse((o) => {
    if (o.geometry) originalResources.add(o.geometry);
    if (o.material) originalResources.add(o.material);
  });
  for (const { group } of f.models.values())
    group.traverse((o) => {
      if (o.geometry) originalResources.add(o.geometry);
      if (o.material) originalResources.add(o.material);
    });
  let sourceDisposals = 0;
  for (const resource of originalResources)
    resource.addEventListener('dispose', () => sourceDisposals++);
  const sample = f.frame(0.1);
  sample.combat.flashes.push({
    id: 'native-hit',
    type: 'impact',
    kind: 'arc',
    target: 'rook',
    source: 'player',
    age: 0.1,
    radius: 2,
    position: sample.rook.position,
    quaternion: sample.rook.quaternion,
  });
  effects.update(sample, { models: f.models });
  assert.equal(
    f.models.get('rook').group.getObjectByName('Low combat / hull response')
      .visible,
    true,
  );
  settings.quality = 'high';
  effects.update(sample, { models: f.models });
  assert.ok(
    f.scene.getObjectByName('Automatic combat / pulses, bolts and wakes'),
  );
  settings.quality = 'low';
  effects.update(sample, { models: f.models, reducedMotion: true });
  const owned = new Set();
  f.scene.traverse((o) => {
    if (o.geometry && !originalResources.has(o.geometry)) owned.add(o.geometry);
    for (const m of Array.isArray(o.material) ? o.material : [o.material])
      if (m && !originalResources.has(m)) owned.add(m);
  });
  const freed = new Map();
  for (const resource of owned)
    resource.addEventListener('dispose', () =>
      freed.set(resource, (freed.get(resource) ?? 0) + 1),
    );
  effects.dispose();
  effects.dispose();
  assert.equal(
    sourceDisposals,
    0,
    'borrowed track and chassis assets stay owned by the stage',
  );
  assert.equal(freed.size, owned.size);
  assert.ok(
    [...freed.values()].every((count) => count === 1),
    'owned effects release once',
  );
  assert.equal(
    f.scene.children.length,
    4,
    'only the borrowed road and three racers remain',
  );
});

test('recorded Repulsor pressure stays on the real road and fades in both graphics presets', () => {
  for (const quality of ['low', 'high']) {
    const f = fixture();
    f.run.devices[0] = {
      ...f.run.devices[0],
      id: 'horizon-approach-repulsor',
      type: 'repulsor',
      lateral: 6,
    };
    f.run.events[0].payload = {
      kind: 'repulsor',
      deviceId: 'horizon-approach-repulsor',
    };
    const effects = createCompletionEffects({ ...f, settings: { quality } });
    try {
      const sample = f.frame(0.25);
      sample.combat.flashes.push({
        id: 'recorded-pressure',
        kind: 'repulsor',
        source: 'player',
        type: 'pulse',
        radius: 24,
        age: 0.12,
        distance: 620,
        lateral: 6,
        position: [6, 0.72, 620],
        quaternion: [0, 0, 0, 1],
      });
      effects.update(sample, { models: f.models });
      const pulse = f.scene.getObjectByName(
        'Repulsor / road-conforming pressure wave',
      );
      assert.ok(pulse, quality);
      const points = pulse.geometry.attributes.position;
      assert.ok(points.count > 0);
      for (let index = 0; index < points.count; index++) {
        assert.ok(
          Number.isFinite(points.getX(index)) &&
            Number.isFinite(points.getY(index)) &&
            Number.isFinite(points.getZ(index)),
        );
        assert.ok(
          Math.abs(points.getX(index)) <= 15.001,
          'pressure clips at the authored road edge',
        );
        assert.ok(
          Math.abs(points.getY(index) - 0.16) < 1e-5,
          'pressure follows the borrowed road skin',
        );
      }
      effects.update(f.frame(1), { models: f.models });
      assert.equal(
        f.scene.getObjectByName('Repulsor / road-conforming pressure wave'),
        undefined,
      );
    } finally {
      effects.dispose();
    }
  }
});
