import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import { createBossTarget } from '../ships/boss-targets.js';
import { createRacerPresentation } from '../race/racer-presentation.js';
import { createInterceptorEffects } from './interceptor-effects.js';

const track = {
  sample: (distance) => ({
    position: new T.Vector3(0, 0, distance),
    right: new T.Vector3(1, 0, 0),
    up: new T.Vector3(0, 1, 0),
  }),
};
const opponent = (id, team) => ({
  specification: { id, name: id, team },
  state: { distance: 100, speed: 80, steer: 0, time: 10, energy: 100 },
  runtime: {
    snapshot: () => ({}),
    pose: () => ({
      position: new T.Vector3(0, 1, 100),
      quaternion: new T.Quaternion(),
    }),
  },
});
const visibleInScene = (object) => {
  for (let current = object; current; current = current.parent)
    if (!current.visible) return false;
  return true;
};

for (const id of ['goliath', 'wraith', 'bulwark']) {
  test(`${id} defeat retains only the winning target, powers down and restores on retry without owning its resources`, async () => {
    const scene = new T.Scene();
    const racers = {
      enabled: true,
      opponents: [opponent(id, 'quarry'), opponent('rook', 'hunters')],
    };
    const loaded = new Map();
    const presentation = await createRacerPresentation({
      scene,
      racers,
      track,
      settings: { quality: 'low' },
      loadRival: async (actorId) => {
        const ship =
          actorId === id
            ? createBossTarget(id, { quality: 'low' })
            : {
                group: new T.Group(),
                update() {},
                dispose() {
                  this.group.removeFromParent();
                },
              };
        loaded.set(actorId, ship);
        return ship;
      },
    });
    const boss = loaded.get(id).group;
    const ally = loaded.get('rook').group;
    const propulsion = boss.getObjectByName('Rival / propulsion');
    const borrowedGeometry = new Set(),
      borrowedMaterials = new Set();
    boss.traverse((object) => {
      if (object.geometry) borrowedGeometry.add(object.geometry);
      for (const material of [object.material].flat())
        if (material) borrowedMaterials.add(material);
    });
    const power = [...borrowedMaterials].filter((material) =>
      material.emissive?.getHex(),
    );
    assert.ok(
      power.length > 0,
      'the real authored ship contains powered engine materials',
    );
    const disposed = { geometry: 0, material: 0 };
    borrowedGeometry.forEach((geometry) =>
      geometry.addEventListener('dispose', () => disposed.geometry++),
    );
    borrowedMaterials.forEach((material) =>
      material.addEventListener('dispose', () => disposed.material++),
    );
    const combat = {
      time: 10,
      shots: [],
      flashes: [{ target: id, equipment: 'lance', kind: 'repulsor', age: 0 }],
    };
    const effects = createInterceptorEffects({
      scene,
      track,
      bossId: id,
      boss,
      racers,
      combat: { view: () => combat },
    });
    const mission = {
      targetId: id,
      health: 0,
      result: { won: true },
      elapsed: 10,
      counterattack: {
        phase: 'breach',
        phaseElapsed: 1,
        exposed: true,
        warning: false,
        shots: 2,
        blasts: 2,
      },
    };
    const frame = {
      mode: 'results',
      presentationDt: 0.1,
      settings: { quality: 'low' },
      state: { lateral: 0 },
      ship: { group: new T.Group() },
      interceptor: mission,
    };
    const update = () => {
      presentation.update(frame);
      effects.update(frame);
    };
    try {
      if (id === 'goliath') {
        combat.shots.push({
          signature: 'goliath-pressure',
          position: [0, 1, 70],
          quaternion: [0, 0, 0, 1],
        });
        combat.flashes.push({
          signature: 'goliath-pressure',
          type: 'muzzle',
          position: [4.8, 1.6, 118.3],
          quaternion: [0, 0, 0, 1],
          age: 0,
        });
        frame.mode = 'racing';
        mission.health = 18;
        mission.result = null;
        update();
        const signals = scene.getObjectByName(
          'Interceptor / physical attack signals',
        );
        assert.ok(
          signals.children.some((child) => visibleInScene(child)),
          'real active attack particles exist before the killing shot',
        );
        frame.mode = 'results';
        mission.health = 0;
        mission.result = { won: true };
      }
      update();
      assert.equal(
        boss.visible,
        true,
        'the defeated target remains behind the results panel',
      );
      assert.equal(
        ally.visible,
        false,
        'allies do not survive into the result tableau',
      );
      assert.equal(
        propulsion.visible,
        false,
        'propulsion is off from the first result frame',
      );
      assert.equal(
        boss.getObjectByName('Rival / pickups').children[0].visible,
        false,
      );
      const whiteHit = boss.getObjectByName('Boss / white armor hit');
      assert.equal(
        whiteHit.visible,
        true,
        'the real killing hit has one final white response',
      );
      for (let tick = 0; tick < 7; tick++) update();
      assert.ok(
        power.every((material) => material.emissiveIntensity === 0),
        'every authored powered material quenches',
      );
      assert.equal(
        whiteHit.visible,
        false,
        'frozen combat time cannot freeze a killing-hit flash',
      );
      for (let tick = 0; tick < 15; tick++) update();
      const signals = scene.getObjectByName(
        'Interceptor / physical attack signals',
      );
      assert.ok(
        signals.children.every((child) => !visibleInScene(child)),
        'transient world effects finish despite frozen physics',
      );
      mission.result = { won: false };
      mission.health = 30;
      update();
      assert.equal(
        boss.visible,
        true,
        'the escaped target remains alive behind its result panel',
      );
      assert.equal(
        ally.visible,
        false,
        'escape results still hide the allied field',
      );
      assert.equal(
        propulsion.visible,
        true,
        'the real propulsion owner stays active after escape',
      );
      assert.ok(
        power.every((material) => material.emissiveIntensity > 0),
        'escape restores powered materials before effects observe the live result',
      );
      assert.equal(
        signals.visible,
        false,
        'escape does not run a defeat quench or smoke sequence',
      );
      frame.interceptor = null;
      update();
      assert.equal(
        boss.visible,
        false,
        'ordinary race results do not retain rivals',
      );
      frame.mode = 'racing';
      mission.result = null;
      mission.health = 700;
      mission.counterattack = {
        phase: 'idle',
        warning: false,
        exposed: false,
        shots: 0,
        blasts: 2,
      };
      frame.interceptor = mission;
      combat.flashes.length = 0;
      update();
      assert.equal(boss.visible, true);
      assert.equal(ally.visible, true);
      assert.equal(
        propulsion.visible,
        true,
        'retry restores the real propulsion owner',
      );
      assert.ok(
        power.every((material) => material.emissiveIntensity > 0),
        'retry restores authored engine brightness',
      );
      effects.dispose();
      effects.dispose();
      assert.deepEqual(
        disposed,
        { geometry: 0, material: 0 },
        'effects never dispose borrowed hull, pickup or propulsion resources',
      );
      assert.equal(
        boss.getObjectByName('Interceptor / pressure machinery'),
        undefined,
      );
    } finally {
      effects.dispose();
      presentation.dispose();
    }
  });
}

test('a charged Wraith defeat fades from actual current engine brightness and retry starts a fresh fade', async () => {
  const scene = new T.Scene();
  const racer = opponent('wraith', 'quarry');
  const racers = { enabled: true, opponents: [racer] };
  const presentation = await createRacerPresentation({
    scene,
    racers,
    track,
    settings: { quality: 'low' },
    loadRival: async (id) => createBossTarget(id, { quality: 'low' }),
  });
  const boss = presentation.getShip('wraith').group;
  const power = new Set();
  boss.traverse((object) => {
    for (const material of [object.material].flat())
      if (material?.emissive?.getHex()) power.add(material);
  });
  const effects = createInterceptorEffects({
    scene,
    boss,
    bossId: 'wraith',
    track,
    racers,
    combat: { view: () => ({ time: 10, shots: [], flashes: [] }) },
  });
  const mission = {
    targetId: 'wraith',
    health: 700,
    result: null,
    elapsed: 10,
    counterattack: {
      phase: 'overload',
      started: 6.5,
      elapsed: 3.5,
      phaseElapsed: 0.5,
      exposed: true,
      warning: false,
      shots: 2,
      blasts: 2,
    },
  };
  const frame = {
    mode: 'racing',
    presentationDt: 0.1,
    settings: { quality: 'low' },
    state: { distance: 68, lateral: 0, speed: 80 },
    ship: { group: new T.Group() },
    interceptor: mission,
  };
  const brightness = () =>
    [...power].map((material) => material.emissiveIntensity);
  const update = () => {
    presentation.update(frame);
    effects.update(frame);
  };
  try {
    for (const cruiseSpeed of [80, 30]) {
      effects.reset();
      racer.state.speed = cruiseSpeed;
      frame.mode = 'racing';
      mission.health = 700;
      mission.result = null;
      update();
      const charged = brightness();
      assert.ok(charged.every((value) => value > 0));
      frame.mode = 'results';
      mission.health = 0;
      mission.result = { won: true };
      update();
      assert.deepEqual(
        brightness(),
        charged,
        'the first disabled frame never brightens dim charged engines',
      );
      let previous = charged;
      for (let tick = 0; tick < 6; tick++) {
        update();
        const current = brightness();
        assert.ok(
          current.every((value, index) => value <= previous[index] + 1e-12),
          'results fade monotonically despite repeated propulsion updates',
        );
        previous = current;
      }
      assert.ok(brightness().every((value) => value === 0));
      assert.equal(boss.getObjectByName('Rival / propulsion').visible, false);
      effects.reset();
      frame.mode = 'countdown';
      mission.health = 700;
      mission.result = null;
      mission.counterattack = {
        phase: 'idle',
        started: null,
        elapsed: 0,
        exposed: false,
        warning: false,
      };
      update();
      assert.ok(
        brightness().every((value, index) => value > charged[index]),
        'retry restores the full authored drive response',
      );
      mission.counterattack = {
        phase: 'overload',
        started: 6.5,
        elapsed: 3.5,
        phaseElapsed: 0.5,
        exposed: true,
        warning: false,
        shots: 2,
        blasts: 2,
      };
    }
  } finally {
    effects.dispose();
    presentation.dispose();
  }
});
