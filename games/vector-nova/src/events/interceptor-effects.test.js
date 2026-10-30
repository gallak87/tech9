import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import { createInterceptorEffects } from './interceptor-effects.js';

test('boss white hits cover real instanced armor, expire and never own ship resources', () => {
  const scene = new T.Scene(),
    boss = new T.Group();
  scene.add(boss);
  const geometry = new T.BoxGeometry(2, 1, 3),
    material = new T.MeshStandardMaterial();
  const source = new T.InstancedMesh(geometry, material, 2);
  source.setMatrixAt(0, new T.Matrix4().makeTranslation(-3, 0, 0));
  source.setMatrixAt(1, new T.Matrix4().makeTranslation(3, 0, 0));
  boss.add(source);
  const combat = { time: 1, shots: [], flashes: [] };
  const effects = createInterceptorEffects({
    scene,
    boss,
    bossId: 'goliath',
    combat: { view: () => combat },
    racers: {
      opponents: [
        { specification: { id: 'goliath' }, state: { distance: 100 } },
      ],
    },
    track: {
      sample: (s) => ({
        position: new T.Vector3(0, 0, s),
        right: new T.Vector3(1, 0, 0),
        up: new T.Vector3(0, 1, 0),
      }),
    },
  });
  const frame = {
    mode: 'racing',
    state: { lateral: 0 },
    settings: { quality: 'high', reducedMotion: false },
    interceptor: {
      elapsed: 1,
      counterattack: { phase: 'idle', warning: false, shots: 0, blasts: 2 },
    },
  };
  const release = { geometry: 0, material: 0 };
  geometry.addEventListener('dispose', () => release.geometry++);
  material.addEventListener('dispose', () => release.material++);
  const shell = boss.getObjectByName('Boss / white armor hit');
  assert.equal(shell.children.length, 1);
  assert.equal(shell.children[0].count, 2);
  assert.notEqual(shell.children[0].instanceMatrix, source.instanceMatrix);
  assert.deepEqual(
    [...shell.children[0].instanceMatrix.array],
    [...source.instanceMatrix.array],
  );
  effects.update(frame);
  assert.equal(shell.visible, false);
  combat.flashes.push({
    id: 1,
    target: 'goliath',
    equipment: 'lance',
    kind: 'repulsor',
    age: 0.04,
  });
  effects.update(frame);
  assert.equal(shell.visible, true);
  const full = shell.children[0].material.opacity;
  assert.ok(full > 0.5, 'normal Lance hit is unmistakably visible');
  frame.settings.reducedMotion = true;
  effects.update(frame);
  assert.ok(
    shell.children[0].material.opacity < full / 3,
    'reduced motion retains restrained feedback',
  );
  combat.flashes[0].age = 0.2;
  effects.update(frame);
  assert.equal(shell.visible, false);
  effects.dispose();
  effects.dispose();
  assert.deepEqual(release, { geometry: 0, material: 0 });
  assert.equal(boss.children.length, 1);
  source.dispose();
  geometry.dispose();
  material.dispose();
});

test('two frozen firing lanes stay finite and fully fit their allocated mesh', () => {
  const scene = new T.Scene(),
    boss = new T.Group();
  scene.add(boss);
  const effects = createInterceptorEffects({
    scene,
    boss,
    bossId: 'goliath',
    combat: { view: () => ({ time: 1, shots: [], flashes: [] }) },
    racers: {
      opponents: [
        { specification: { id: 'goliath' }, state: { distance: 300 } },
      ],
    },
    track: {
      sample: (s) => ({
        position: new T.Vector3(0, 0, s),
        right: new T.Vector3(1, 0, 0),
        up: new T.Vector3(0, 1, 0),
      }),
    },
  });
  try {
    effects.update({
      mode: 'racing',
      state: { lateral: 0 },
      settings: {},
      interceptor: {
        elapsed: 1,
        counterattack: {
          phase: 'turning-back',
          warning: true,
          locked: true,
          shots: 0,
          blasts: 2,
          nextShot: 0,
          charge: 1,
          aimLanes: [-4, 4],
        },
      },
    });
    const lanes = scene.getObjectByName('Goliath / locked firing lanes');
    assert.equal(lanes.visible, true);
    assert.equal(
      lanes.geometry.drawRange.count,
      lanes.geometry.attributes.position.count,
    );
    assert.ok(
      [...lanes.geometry.attributes.position.array].every(Number.isFinite),
    );
    const color = lanes.geometry.attributes.color;
    assert.ok(
      color.getX(0) > color.getX(color.count / 2) * 4,
      'first threat is visibly stronger than its preview',
    );
  } finally {
    effects.dispose();
  }
});

for (const settings of [
  { quality: 'high', reducedMotion: false },
  { quality: 'low', reducedMotion: false },
  { quality: 'high', reducedMotion: true },
  { quality: 'low', reducedMotion: true },
]) {
  test(`${settings.quality} / reduced motion ${settings.reducedMotion} retains attack information while reducing decorative motion`, () => {
    const scene = new T.Scene(),
      boss = new T.Group();
    scene.add(boss);
    const shot = {
      signature: 'goliath-pressure',
      position: [3, 2, 173],
      quaternion: [0, 0, 0, 1],
    };
    const combat = { time: 1, shots: [shot], flashes: [] };
    const originalCombat = structuredClone(combat);
    const effects = createInterceptorEffects({
      scene,
      boss,
      bossId: 'goliath',
      combat: { view: () => combat },
      racers: {
        opponents: [
          { specification: { id: 'goliath' }, state: { distance: 300 } },
        ],
      },
      track: {
        sample: (s) => ({
          position: new T.Vector3(0, 0, s),
          right: new T.Vector3(1, 0, 0),
          up: new T.Vector3(0, 1, 0),
        }),
      },
    });
    const frame = {
      mode: 'racing',
      settings: { quality: 'high', reducedMotion: false },
      state: { lateral: 0 },
      interceptor: {
        elapsed: 1,
        counterattack: {
          phase: 'turning-back',
          phaseElapsed: 0.4,
          warning: true,
          locked: true,
          shots: 0,
          blasts: 2,
          nextShot: 0,
          charge: 1,
          aimLanes: [-4, 4],
        },
      },
    };
    try {
      effects.update(frame);
      const root = scene.getObjectByName(
        'Interceptor / physical attack signals',
      );
      const lanes = scene.getObjectByName('Goliath / locked firing lanes');
      const fullCount = lanes.geometry.drawRange.count;
      const fullPositions = [...lanes.geometry.attributes.position.array];
      const fullColors = [...lanes.geometry.attributes.color.array];
      const bolt = root.children.find(
        (child) =>
          child.isGroup &&
          child.position.equals(new T.Vector3(...shot.position)),
      );
      assert.ok(
        bolt?.visible,
        'the actual pressure projectile is visible before changing graphics settings',
      );
      frame.settings = settings;
      effects.update(frame);
      assert.equal(lanes.visible, true);
      assert.equal(
        lanes.geometry.drawRange.count,
        fullCount,
        'every locked danger lane survives quality and motion changes',
      );
      assert.deepEqual(
        [...lanes.geometry.attributes.position.array],
        fullPositions,
      );
      assert.deepEqual(
        [...lanes.geometry.attributes.color.array],
        fullColors,
        'active/preview lane priority remains legible',
      );
      assert.ok(fullPositions.every(Number.isFinite));
      assert.equal(bolt.visible, true);
      assert.ok(
        bolt.children.some((child) => child.visible),
        'a simplified projectile still has a visible body',
      );
      assert.deepEqual(
        bolt.position.toArray(),
        shot.position,
        'reduced decoration cannot move the gameplay projectile',
      );
      assert.deepEqual(bolt.quaternion.toArray(), shot.quaternion);
      let core;
      boss.traverse((object) => {
        if (
          object.isGroup &&
          object.children.some(
            (child) => child.geometry?.type === 'TorusGeometry',
          )
        )
          core = object;
      });
      assert.ok(core, 'the real mounted aperture assembly is present');
      frame.interceptor.counterattack = {
        phase: 'breach',
        phaseElapsed: 0.7,
        exposed: true,
        warning: false,
        shots: 2,
        blasts: 2,
      };
      frame.interceptor.elapsed = 1.1;
      effects.update(frame);
      const firstScale = core.scale.toArray();
      frame.interceptor.elapsed = 1.3;
      effects.update(frame);
      assert.equal(
        core.children.some(
          (child) => child.geometry?.type === 'CircleGeometry' && child.visible,
        ),
        true,
        'the exposed core stays readable even when its decorative pulse is frozen',
      );
      if (settings.quality === 'low' || settings.reducedMotion)
        assert.deepEqual(
          core.scale.toArray(),
          firstScale,
          'decorative aperture pulsing freezes',
        );
      else
        assert.notDeepEqual(
          core.scale.toArray(),
          firstScale,
          'the full presentation retains its living aperture pulse',
        );
      frame.mode = 'results';
      frame.presentationDt = 0.1;
      frame.interceptor.health = 0;
      frame.interceptor.result = { won: true };
      effects.update(frame);
      effects.update(frame);
      const smoke = root.children.filter(
        (child) =>
          child.geometry?.type === 'PlaneGeometry' &&
          child.material.uniforms?.motion,
      );
      assert.ok(
        smoke.length > 0 && smoke.every((sheet) => sheet.visible),
        'defeat smoke remains visible across tiers',
      );
      assert.ok(
        smoke.every(
          (sheet) =>
            sheet.material.uniforms.motion.value ===
            (settings.quality === 'low' || settings.reducedMotion ? 0 : 1),
        ),
        'smoke shader receives the requested motion policy',
      );
      assert.deepEqual(
        combat,
        originalCombat,
        'all presentation variants leave the real combat ledger untouched',
      );
    } finally {
      effects.dispose();
    }
  });
}
