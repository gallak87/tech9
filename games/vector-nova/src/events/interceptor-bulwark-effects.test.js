import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import { createBulwarkEffects } from './interceptor-bulwark-effects.js';
import { createInterceptorEvent } from './interceptor.js';
import { aimBulwarkSlab } from './interceptor-aim.js';
import { createNightweirLockdownTrack } from '../levels/interceptor-nightweir/track/model.js';
import { createCombatSimulation } from '../pickups/combat.js';
import { createCombatPresentation } from '../pickups/combat-presentation.js';

const track = createNightweirLockdownTrack();
const visible = (object) => {
  for (let current = object; current; current = current.parent)
    if (!current.visible) return false;
  return true;
};
const resources = (roots) => {
  const geometries = new Set(),
    materials = new Set();
  for (const root of roots)
    root.traverse((object) => {
      if (object.geometry) geometries.add(object.geometry);
      for (const material of [object.material].flat())
        if (material) materials.add(material);
    });
  return { geometries, materials };
};
const energy = (root) => {
  const found = [];
  root.traverse((object) => {
    if (
      object.isMesh &&
      visible(object) &&
      object.material.transparent &&
      object.material.opacity > 0
    )
      found.push(object);
  });
  return found;
};
function fixture() {
  const scene = new T.Scene(),
    boss = new T.Group();
  scene.add(boss);
  const borrowedGeometry = new T.BoxGeometry(12, 4, 20);
  const borrowedMaterial = new T.MeshStandardMaterial({ color: 0xa38b51 });
  const borrowedTexture = new T.Texture();
  borrowedMaterial.map = borrowedTexture;
  const body = new T.Mesh(borrowedGeometry, borrowedMaterial);
  body.position.y = 1.8;
  boss.add(body);
  for (const [side, x] of [
    ['L', -4.2],
    ['C', 0],
    ['R', 4.2],
  ]) {
    const anchor = new T.Group();
    anchor.name = `Exhaust_${side}`;
    anchor.position.set(x, 1.1, -10);
    boss.add(anchor);
  }
  const distance = track.length * 0.14 + (6.2 * 300) / 3.6;
  const road = track.sample(distance);
  boss.position.copy(road.position).addScaledVector(road.up, 0.72);
  boss.quaternion
    .copy(road.quaternion)
    .multiply(
      new T.Quaternion().setFromAxisAngle(new T.Vector3(0, 1, 0), Math.PI),
    );
  boss.updateWorldMatrix(true, true);
  const state = { distance, lateral: 0, speed: 300 / 3.6, energy: 100 };
  const pose = () => ({
    position: boss.position.clone(),
    quaternion: boss.quaternion.clone(),
    grounded: true,
  });
  const combat = createCombatSimulation({ track });
  combat.bind('bulwark', {
    state,
    team: 'quarry',
    pose,
    hit() {
      return false;
    },
    notify() {},
  });
  const player = { distance: distance - 120, lateral: 5, speed: 300 / 3.6 };
  const effects = createBulwarkEffects({
    scene,
    boss,
    track,
    combat,
    racers: {
      opponents: [
        { specification: { id: 'bulwark' }, state, runtime: { pose } },
      ],
    },
  });
  const frame = {
    mode: 'racing',
    state: player,
    settings: { quality: 'high', reducedMotion: false },
    presentationDt: 0,
    interceptor: undefined,
  };
  const mount = boss.getObjectByName('Bulwark / breakwater hardware');
  const world = scene.getObjectByName('Bulwark / physical breaker signals');
  const burst = mount.getObjectByName('Bulwark / ruptured emitter');
  const shoulders = mount.children.filter((object) =>
    /wake emitter$/.test(object.name),
  );
  const owner = createInterceptorEvent({
    bossId: 'bulwark',
    allies: [],
    difficulty: 'hard',
    routeLength: 1000,
    escapeDistance: 2000,
  });
  const progress = {
    targetDistance: 140,
    playerDistance: 108,
    playerLateral: 5,
  };
  owner.step(1 / 120, progress);
  const stepOwner = (time) => {
    owner.step(time, progress);
    frame.interceptor = owner.snapshot();
    return frame.interceptor;
  };
  const slabs = () =>
    world.children.filter(
      (object) =>
        object.name === 'Bulwark / physical pressure slab' && visible(object),
    );
  const warnings = () =>
    world.children.filter(
      (object) => object.name === 'Bulwark / frozen slab path',
    );
  return {
    scene,
    boss,
    body,
    combat,
    state,
    pose,
    frame,
    effects,
    mount,
    world,
    burst,
    shoulders,
    owner,
    progress,
    stepOwner,
    slabs,
    warnings,
    borrowedGeometry,
    borrowedMaterial,
    borrowedTexture,
    dispose() {
      effects.dispose();
      borrowedGeometry.dispose();
      borrowedMaterial.dispose();
      borrowedTexture.dispose();
    },
  };
}

const hit = (key, x = 4.9) => ({
  source: 'player',
  target: 'bulwark',
  kind: 'repulsor',
  equipment: 'lance',
  key,
  hitLocal: [x, 0.3, -10.7],
});
const transforms = (root) => {
  const result = [];
  root.traverse((object) =>
    result.push([
      object.visible,
      ...object.position.toArray(),
      ...object.quaternion.toArray(),
      ...object.scale.toArray(),
      object.material?.opacity ?? null,
    ]),
  );
  return result;
};

test('Bulwark hardware follows the one actual active shoulder and paused empty states own no borrowed state', () => {
  const h = fixture();
  try {
    assert.equal(h.mount.visible, false);
    assert.equal(h.world.visible, false);
    h.effects.update(h.frame);
    assert.equal(h.mount.visible, false);
    assert.equal(h.world.visible, false);
    h.stepOwner(1.2);
    for (const settings of [
      { quality: 'high', reducedMotion: false },
      { quality: 'low', reducedMotion: true },
    ]) {
      h.frame.settings = settings;
      const ledger = h.combat.snapshot();
      h.effects.update(h.frame);
      const illuminated = h.shoulders.map((shoulder) =>
        energy(shoulder).some((mesh) => mesh.material.opacity > 0.5),
      );
      assert.equal(
        illuminated.filter(Boolean).length,
        1,
        'exactly the owner-selected physical coil is active',
      );
      assert.ok(
        h.shoulders[illuminated.indexOf(true)].position.x *
          h.frame.interceptor.counterattack.breakwater.side >
          0,
      );
      h.frame.mode = 'paused';
      const paused = transforms(h.mount);
      h.effects.update(h.frame);
      assert.deepEqual(
        transforms(h.mount),
        paused,
        'paused observation cannot advance the hardware',
      );
      assert.deepEqual(
        h.combat.snapshot(),
        ledger,
        'presentation cannot mutate combat',
      );
    }
    h.stepOwner(7.9);
    h.progress.targetDistance = 760;
    h.progress.playerDistance = 728;
    h.owner.step(1 / 120, h.progress);
    h.stepOwner(1.2);
    h.effects.update(h.frame);
    const opposite = h.shoulders.filter((shoulder) =>
      energy(shoulder).some((mesh) => mesh.material.opacity > 0.5),
    );
    assert.equal(opposite.length, 1);
    assert.ok(
      opposite[0].position.x < 0,
      'the next actual cycle selects the opposite shoulder without stale energy',
    );
    h.frame.mode = 'countdown';
    h.frame.interceptor = { elapsed: 0, health: 950 };
    h.effects.update(h.frame);
    assert.equal(visible(h.body), true);
    assert.equal(h.burst.visible, false);
    h.frame.interceptor = null;
    h.effects.update(h.frame);
    assert.equal(h.mount.visible, false);
    assert.equal(h.world.visible, false);
  } finally {
    h.dispose();
  }
});

test('Bulwark rupture is driven by the actual accepted break record and stops on the simulation clock', () => {
  const h = fixture();
  try {
    h.stepOwner(1.2);
    h.effects.update(h.frame);
    assert.equal(h.burst.visible, false);
    h.owner.hit(hit('wrong-shoulder', -4.9));
    h.frame.interceptor = h.owner.snapshot();
    h.effects.update(h.frame);
    assert.equal(
      h.burst.visible,
      false,
      'a real wrong-side armor hit cannot invent a rupture',
    );
    const events = h.owner.hit(hit('real-shoulder'));
    assert.equal(
      events.some((event) => event.type === 'interceptor-breakwater'),
      true,
    );
    h.frame.interceptor = h.owner.snapshot();
    h.effects.update(h.frame);
    assert.equal(h.burst.visible, true);
    assert.equal(
      h.frame.interceptor.counterattacks[0].breakHit.key,
      'real-shoulder',
    );
    assert.equal(
      h.frame.interceptor.counterattack.breakwater.stoppedAt,
      h.owner.snapshot().elapsed,
    );
    assert.ok(
      h.burst
        .getWorldPosition(new T.Vector3())
        .distanceTo(
          h.boss.localToWorld(
            new T.Vector3(
              ...h.frame.interceptor.counterattack.breakwater.emitter,
            ),
          ),
        ) < 0.3,
      'the rupture emerges from the actual selected shoulder',
    );
    const paused = transforms(h.burst);
    h.frame.mode = 'paused';
    h.frame.presentationDt = 1;
    h.effects.update(h.frame);
    assert.deepEqual(
      transforms(h.burst),
      paused,
      'a frozen simulation leaves rupture age frozen',
    );
    h.stepOwner(0.4);
    h.effects.update(h.frame);
    assert.equal(h.burst.visible, false);
    h.effects.reset();
    h.owner.reset();
    h.owner.step(1 / 120, h.progress);
    h.stepOwner(1.2);
    h.frame.mode = 'racing';
    h.effects.update(h.frame);
    assert.equal(
      h.burst.visible,
      false,
      'retry starts without the previous break',
    );
    h.owner.hit(hit('new-run-shoulder'));
    h.frame.interceptor = h.owner.snapshot();
    h.effects.update(h.frame);
    assert.equal(
      h.burst.visible,
      true,
      'a new actual break receives a fresh effect clock',
    );
  } finally {
    h.dispose();
  }
});

test('actual Bulwark slab poses render exactly once across High and Low reduced presentation', () => {
  const h = fixture();
  const ordinary = createCombatPresentation(h.scene, h.combat, {
    quality: 'high',
  });
  try {
    h.stepOwner(6.2);
    for (const [index, side] of [-1, 1].entries()) {
      const aimed = aimBulwarkSlab({
        track,
        bossPose: h.pose(),
        muzzle: [side * 4.7, 2.25, 8.8],
        player: h.frame.state,
        aimLane: h.frame.interceptor.counterattack.aimLanes[index],
        sourceSpeed: h.state.speed,
      });
      assert.equal(
        h.combat.fireLance('bulwark', {
          pose: aimed,
          signature: 'bulwark-slab',
        }),
        true,
      );
    }
    h.combat.step(1 / 120);
    const ledger = h.combat.snapshot();
    for (const settings of [
      { quality: 'high', reducedMotion: false },
      { quality: 'low', reducedMotion: true },
    ]) {
      h.frame.settings = settings;
      h.effects.update(h.frame);
      ordinary.update(h.frame);
      const shots = h.combat
        .view()
        .shots.filter((shot) => shot.signature === 'bulwark-slab');
      assert.equal(h.slabs().length, shots.length);
      assert.ok(shots.length > 0);
      for (const shot of shots) {
        const slab = h
          .slabs()
          .find(
            (object) =>
              object.position.distanceTo(new T.Vector3(...shot.position)) <
              1e-10,
          );
        assert.ok(slab);
        assert.ok(
          Math.abs(slab.quaternion.dot(new T.Quaternion(...shot.quaternion))) >
            1 - 1e-12,
        );
        assert.ok(slab.children.some((child) => child.visible));
      }
      const duplicates = [];
      ordinary.group.traverse((object) => {
        if (
          object.isMesh &&
          visible(object) &&
          object.geometry.drawRange.count !== 0 &&
          (!object.isInstancedMesh || object.count > 0)
        )
          duplicates.push(object.name);
      });
      assert.deepEqual(
        duplicates,
        [],
        'ordinary combat owns no duplicate slab or signature flash',
      );
      assert.deepEqual(h.combat.snapshot(), ledger);
    }
  } finally {
    ordinary.dispose();
    h.dispose();
  }
});

test('Bulwark result tableaus retain permanent hardware while owned energy, warnings and shots end', () => {
  const h = fixture();
  try {
    h.stepOwner(6.2);
    h.effects.update(h.frame);
    assert.ok(h.warnings().some((warning) => visible(warning)));
    for (const won of [true, false]) {
      h.frame.mode = 'results';
      h.frame.interceptor.result = { won };
      h.frame.interceptor.health = won ? 0 : 100;
      h.frame.presentationDt = 0.2;
      for (let i = 0; i < 6; i++) h.effects.update(h.frame);
      assert.equal(visible(h.body), true);
      assert.equal(h.mount.visible, true);
      assert.equal(h.world.visible, false);
      assert.equal(h.slabs().length, 0);
      assert.ok(h.warnings().every((warning) => !warning.visible));
      assert.deepEqual(
        energy(h.mount),
        [],
        `${won ? 'disabled' : 'escaped'} boss keeps its metal, not active energy`,
      );
      h.effects.reset();
    }
  } finally {
    h.dispose();
  }
});

test('Bulwark effects dispose each owned resource once and never dispose the borrowed hull or texture', () => {
  const h = fixture(),
    owned = resources([h.mount, h.world]);
  const counts = new Map();
  for (const resource of [...owned.geometries, ...owned.materials]) {
    counts.set(resource, 0);
    resource.addEventListener('dispose', () =>
      counts.set(resource, counts.get(resource) + 1),
    );
  }
  const borrowed = [h.borrowedGeometry, h.borrowedMaterial, h.borrowedTexture];
  const releases = borrowed.map(() => 0);
  borrowed.forEach((resource, index) =>
    resource.addEventListener('dispose', () => releases[index]++),
  );
  h.stepOwner(1.2);
  const ledger = h.combat.snapshot();
  h.effects.dispose();
  h.effects.dispose();
  h.effects.update(h.frame);
  assert.ok([...counts.values()].every((count) => count === 1));
  assert.deepEqual(releases, [0, 0, 0]);
  assert.equal(h.body.parent, h.boss);
  assert.equal(h.mount.parent, null);
  assert.equal(h.world.parent, null);
  assert.deepEqual(h.combat.snapshot(), ledger);
  h.borrowedGeometry.dispose();
  h.borrowedMaterial.dispose();
  h.borrowedTexture.dispose();
});
