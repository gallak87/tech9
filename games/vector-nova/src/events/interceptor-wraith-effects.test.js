import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import { createWraithEffects } from './interceptor-wraith-effects.js';
import { aimWraithScissors } from './interceptor-aim.js';
import { createWraithTarget } from '../ships/wraith-target.js';
import { createHelionBreachTrack } from '../levels/interceptor-helion/track/model.js';
import { createCombatSimulation } from '../pickups/combat.js';
import { createCombatPresentation } from '../pickups/combat-presentation.js';

const track = createHelionBreachTrack();
const near = (actual, expected, message) =>
  assert.ok(
    actual.distanceTo(expected) < 0.001,
    `${message}: ${actual.toArray()} / ${expected.toArray()}`,
  );
const effectivelyVisible = (object) => {
  for (let current = object; current; current = current.parent)
    if (current.visible === false) return false;
  return true;
};
function fixture() {
  const scene = new T.Scene(),
    ship = createWraithTarget({ quality: 'low' }),
    boss = ship.group;
  const station = 1900,
    road = track.sample(station);
  boss.position.copy(road.position).addScaledVector(road.up, 0.72);
  boss.quaternion
    .copy(road.quaternion)
    .multiply(
      new T.Quaternion().setFromAxisAngle(new T.Vector3(0, 1, 0), Math.PI),
    );
  scene.add(boss);
  boss.updateWorldMatrix(true, true);
  const combat = createCombatSimulation({ track });
  combat.bind('wraith', {
    state: { distance: station, lateral: 0, speed: 300 / 3.6, energy: 100 },
    team: 'quarry',
    pose: () => ({
      position: boss.position.clone(),
      quaternion: boss.quaternion.clone(),
      grounded: true,
    }),
    hit: () => false,
    notify() {},
  });
  const borrowed = { geometries: new Set(), materials: new Set() };
  boss.traverse((object) => {
    if (object.geometry) borrowed.geometries.add(object.geometry);
    for (const material of [object.material].flat())
      if (material) borrowed.materials.add(material);
  });
  const effects = createWraithEffects({
    scene,
    boss,
    track,
    combat,
    racers: {
      opponents: [
        { specification: { id: 'wraith' }, state: { speed: 300 / 3.6 } },
      ],
    },
  });
  const receiving = track.sample(station - 32),
    camera = new T.PerspectiveCamera();
  camera.position
    .copy(receiving.position)
    .addScaledVector(receiving.up, 7)
    .addScaledVector(receiving.tangent, -18);
  const frame = {
    mode: 'racing',
    state: { distance: station - 32, lateral: 0 },
    camera,
    settings: { quality: 'high', reducedMotion: false },
    interceptor: {
      elapsed: 1,
      counterattack: {
        phase: 'turning-back',
        phaseElapsed: 0.4,
        warning: true,
        locked: true,
        shots: 0,
        blasts: 2,
        charge: 1,
        aimLanes: [-2.5, 2.5],
      },
    },
  };
  const world = scene.getObjectByName('Wraith / resonance paths');
  const mount = boss.getObjectByName('Wraith / split capacitors');
  const paths = () =>
    world.children.filter(
      (child) =>
        child.isMesh &&
        child.geometry.type === 'BufferGeometry' &&
        child.material.opacity > 0.2,
    );
  return {
    scene,
    ship,
    boss,
    combat,
    effects,
    frame,
    receiving,
    borrowed,
    world,
    mount,
    paths,
    dispose() {
      effects.dispose();
      ship.dispose();
    },
  };
}

function firePhysicalScissors(h) {
  assert.equal(
    typeof h.combat.fireArc,
    'function',
    'the real signature Arc API is present',
  );
  return [-1, 1].map((side, index) => {
    const position = h.boss.localToWorld(new T.Vector3(side * 2.2, 0.48, 8.75));
    const end = h.receiving.position
      .clone()
      .addScaledVector(
        h.receiving.right,
        h.frame.interceptor.counterattack.aimLanes[index],
      )
      .addScaledVector(h.receiving.up, 1.8);
    const direction = end.sub(position).normalize();
    const quaternion = new T.Quaternion().setFromRotationMatrix(
      new T.Matrix4().lookAt(
        new T.Vector3(),
        direction.clone().negate(),
        h.receiving.up,
      ),
    );
    assert.equal(
      h.combat.fireArc('wraith', {
        pose: { position, quaternion },
        signature: 'wraith-scissor',
      }),
      true,
    );
    return { position, quaternion };
  });
}

const liveBolts = (world) =>
  world.children.filter(
    (child) =>
      child.isGroup &&
      child.visible &&
      child.name === 'Wraith / physical ion spear',
  );

test('Wraith warnings join its real transformed prongs to both normal and edge-lane receivers without invalid or truncated geometry', () => {
  const h = fixture();
  try {
    for (const lanes of [
      [-2.5, 2.5],
      [-12, -7],
      [7, 12],
    ]) {
      h.frame.interceptor.counterattack.aimLanes = lanes;
      h.effects.update(h.frame);
      const paths = h.paths();
      assert.equal(
        paths.length,
        lanes.length,
        'both physically distinct scissors paths retain a visible warning',
      );
      paths.forEach((path, index) => {
        const positions = path.geometry.getAttribute('position');
        assert.ok([...positions.array].every(Number.isFinite));
        assert.equal(
          positions.count % 6,
          0,
          'the entire allocated ribbon contains complete triangles',
        );
        const point = (i) => new T.Vector3().fromBufferAttribute(positions, i);
        const start = point(0).add(point(2)).multiplyScalar(0.5);
        const end = point(positions.count - 5)
          .add(point(positions.count - 1))
          .multiplyScalar(0.5);
        near(
          start,
          h.boss.localToWorld(new T.Vector3(index ? 2.2 : -2.2, 0.48, 8.75)),
          'warning starts at its authored physical muzzle',
        );
        near(
          end,
          h.receiving.position
            .clone()
            .addScaledVector(h.receiving.right, lanes[index])
            .addScaledVector(h.receiving.up, 1.8),
          'the complete ribbon reaches its frozen lane on the real tilted road',
        );
        assert.ok(
          point(0).distanceTo(point(2)) > 0.05,
          'the camera-facing ribbon retains visible width',
        );
      });
    }
  } finally {
    h.dispose();
  }
});

test('Wraith signature bolts retain actual combat poses across quality/motion changes and never duplicate ordinary Arc rendering', () => {
  const h = fixture();
  const ordinary = createCombatPresentation(h.scene, h.combat, {
    quality: 'high',
  });
  try {
    const muzzles = firePhysicalScissors(h);
    const newborn = h.combat.view().shots;
    assert.equal(newborn.length, muzzles.length);
    newborn.forEach((shot, index) =>
      near(
        new T.Vector3(...shot.position),
        muzzles[index].position,
        'real Arc is born exactly at its muzzle',
      ),
    );
    h.combat.step(1 / 120);
    const ledger = structuredClone(h.combat.view());
    let fullPaths;
    for (const settings of [
      { quality: 'high', reducedMotion: false },
      { quality: 'low', reducedMotion: false },
      { quality: 'high', reducedMotion: true },
      { quality: 'low', reducedMotion: true },
    ]) {
      h.frame.settings = settings;
      h.effects.update(h.frame);
      ordinary.update({ mode: 'racing', settings });
      const bolts = liveBolts(h.world);
      const shots = h.combat
        .view()
        .shots.filter((shot) => shot.signature === 'wraith-scissor');
      assert.equal(
        bolts.length,
        shots.length,
        'every actual signature projectile has exactly one dedicated body',
      );
      shots.forEach((shot) => {
        const bolt = bolts.find(
          (group) =>
            group.position.distanceTo(new T.Vector3(...shot.position)) < 1e-10,
        );
        assert.ok(
          bolt,
          'the dedicated body uses the exact live combat position',
        );
        assert.ok(
          Math.abs(bolt.quaternion.dot(new T.Quaternion(...shot.quaternion))) >
            1 - 1e-12,
          'the dedicated body keeps the actual projectile orientation',
        );
        assert.ok(
          bolt.children.some((child) => child.visible),
          'Low retains a factual projectile body',
        );
      });
      const factualPaths = h
        .paths()
        .map((path) => [...path.geometry.attributes.position.array]);
      if (fullPaths)
        assert.deepEqual(
          factualPaths,
          fullPaths,
          'graphics settings never change the warning trajectories',
        );
      else fullPaths = factualPaths;
      const duplicates = [];
      ordinary.group.traverse((object) => {
        if (
          object.isMesh &&
          effectivelyVisible(object) &&
          object.geometry.drawRange.count !== 0 &&
          (!object.isInstancedMesh || object.count > 0)
        )
          duplicates.push(object.name);
      });
      assert.deepEqual(
        duplicates,
        [],
        'the ordinary Arc/Lance owner never redraws a signature projectile or flash',
      );
      assert.deepEqual(
        h.combat.view(),
        ledger,
        'presentation cannot change the combat trajectory or contact ledger',
      );
    }
  } finally {
    ordinary.dispose();
    h.dispose();
  }
});

test('Wraith capacitor shutters open only for the real exposed state and reseal after the opportunity', () => {
  const h = fixture();
  try {
    const fins = h.mount.children.filter(
      (child) => child.isGroup && child.position.z < -7,
    );
    assert.ok(
      fins.length >= 2,
      'the split capacitor has opposed physical shutters',
    );
    const closed = fins.map((fin) => ({
      x: fin.position.x,
      roll: fin.rotation.z || 0,
    }));
    for (const phase of [
      { phase: 'idle', warning: false },
      { phase: 'telegraph', warning: true, locked: true },
      { phase: 'firing', warning: true, countered: true },
    ]) {
      h.frame.interceptor.counterattack = {
        ...phase,
        phaseElapsed: 0.5,
        exposed: false,
        shots: 0,
        blasts: 2,
      };
      h.effects.update(h.frame);
      assert.deepEqual(
        fins.map((fin) => ({ x: fin.position.x, roll: fin.rotation.z || 0 })),
        closed,
        'a lock/counter cue cannot falsely expose the physical capacitor',
      );
    }
    h.frame.interceptor.counterattack = {
      phase: 'breach',
      phaseElapsed: 0.4,
      exposed: true,
      shots: 2,
      blasts: 2,
    };
    h.effects.update(h.frame);
    fins.forEach((fin, index) => {
      assert.ok(Math.abs(fin.position.x) > Math.abs(closed[index].x));
      assert.ok(
        Math.abs(fin.rotation.z) > 0.5,
        'the exposed opportunity visibly separates and turns both shutters',
      );
    });
    h.frame.interceptor.counterattack.exposed = false;
    h.effects.update(h.frame);
    assert.deepEqual(
      fins.map((fin) => ({ x: fin.position.x, roll: fin.rotation.z || 0 })),
      closed,
    );
  } finally {
    h.dispose();
  }
});

test('Wraith results retain static hardware, reset hides energy, and disposal releases only owned resources', () => {
  const h = fixture();
  const borrowedRelease = { geometry: 0, material: 0 };
  h.borrowed.geometries.forEach((resource) =>
    resource.addEventListener('dispose', () => borrowedRelease.geometry++),
  );
  h.borrowed.materials.forEach((resource) =>
    resource.addEventListener('dispose', () => borrowedRelease.material++),
  );
  const owned = new Set(),
    releases = new Map();
  for (const root of [h.world, h.mount])
    root.traverse((object) => {
      if (object.geometry) owned.add(object.geometry);
      for (const material of [object.material].flat())
        if (material) owned.add(material);
    });
  for (const resource of owned) {
    releases.set(resource, 0);
    resource.addEventListener('dispose', () =>
      releases.set(resource, releases.get(resource) + 1),
    );
  }
  try {
    h.effects.update(h.frame);
    assert.equal(h.world.visible, true);
    assert.equal(h.mount.visible, true);
    for (const won of [false, true]) {
      h.frame.mode = 'results';
      h.frame.interceptor.result = { won };
      h.frame.interceptor.health = won ? 0 : 30;
      h.effects.update(h.frame);
      assert.equal(
        h.mount.visible,
        true,
        'result composition retains the seated metal hardware',
      );
      assert.ok(
        h.paths().every((path) => path.visible === false),
        'results never freeze the live lock ribbons',
      );
      assert.equal(
        liveBolts(h.world).length,
        0,
        'live signature bolts stop immediately at results',
      );
      assert.equal(
        h.world.getObjectByName('Wraith / accepted ignition rupture').visible,
        false,
      );
      assert.equal(
        effectivelyVisible(
          h.mount.getObjectByName('Wraith / keel-mounted capacitor carrier'),
        ),
        true,
      );
    }
    h.frame.mode = 'racing';
    h.frame.interceptor.result = null;
    h.effects.update(h.frame);
    h.effects.reset();
    assert.equal(h.world.visible, false);
    assert.equal(h.mount.visible, false);
    h.effects.update(h.frame);
    assert.equal(
      h.world.visible,
      true,
      'reset keeps the owner reusable for the next encounter',
    );
    h.effects.dispose();
    h.effects.dispose();
    assert.deepEqual(borrowedRelease, { geometry: 0, material: 0 });
    assert.ok(
      [...releases.values()].every((count) => count === 1),
      'shared owned geometry/material references are released exactly once',
    );
    assert.equal(h.world.parent, null);
    assert.equal(h.mount.parent, null);
    h.effects.update(h.frame);
    assert.equal(
      h.world.parent,
      null,
      'disposed updates cannot reattach GPU resources',
    );
  } finally {
    h.dispose();
  }
});

test('Wraith empty paused/countdown snapshots cannot revive stale warning geometry', () => {
  const h = fixture();
  try {
    h.effects.update(h.frame);
    const warningPaths = h.world.children.filter(
      (child) => child.isMesh && child.geometry.type === 'BufferGeometry',
    );
    const conductors = h.mount.children.filter(
      (child) => child.geometry?.type === 'TubeGeometry',
    );
    assert.ok(
      warningPaths.some((path) => effectivelyVisible(path)),
      'the regression starts from populated live warning ribbons',
    );
    for (const mode of ['paused', 'countdown'])
      for (const counterattack of [{}, undefined]) {
        h.frame.mode = mode;
        h.frame.interceptor.counterattack = counterattack;
        assert.doesNotThrow(
          () => h.effects.update(h.frame),
          'old snapshots may omit optional attack feedback',
        );
        assert.ok(
          warningPaths.every((path) => path.visible === false),
          'Three must receive explicit false for every stale warning ribbon',
        );
        assert.ok(
          conductors.every((rail) => rail.visible === false),
          'empty feedback cannot leave the attack conductors glowing',
        );
      }
  } finally {
    h.dispose();
  }
});

test('moving Wraith warning ribbons reach the same predicted road station as actual signature fire', () => {
  const h = fixture();
  try {
    h.frame.state.distance = 1780;
    h.frame.state.speed = 300 / 3.6;
    h.effects.update(h.frame);
    h.paths().forEach((path, index) => {
      const solution = aimWraithScissors({
        track,
        bossPose: { position: h.boss.position, quaternion: h.boss.quaternion },
        muzzle: [index ? 2.2 : -2.2, 0.48, 8.75],
        player: h.frame.state,
        aimLane: h.frame.interceptor.counterattack.aimLanes[index],
        sourceSpeed: 300 / 3.6,
      });
      assert.ok(
        solution.receiveDistance > h.frame.state.distance + 5,
        'the real moving receiver advances along supported road',
      );
      const positions = path.geometry.getAttribute('position');
      const point = (i) => new T.Vector3().fromBufferAttribute(positions, i);
      const end = point(positions.count - 5)
        .add(point(positions.count - 1))
        .multiplyScalar(0.5);
      near(
        end,
        solution.destination,
        'the full warning and actual firing helper agree on longitudinal prediction',
      );
      const oldRoad = track.sample(h.frame.state.distance);
      const oldEnd = oldRoad.position
        .clone()
        .addScaledVector(
          oldRoad.right,
          h.frame.interceptor.counterattack.aimLanes[index],
        )
        .addScaledVector(oldRoad.up, 1.8);
      assert.ok(
        end.distanceTo(oldEnd) > 5,
        'the warning does not silently retain the obsolete unpredicted endpoint',
      );
    });
  } finally {
    h.dispose();
  }
});

test('Wraith filaments keep finite complete UV paths and freeze decorative flow without changing their warning geometry', () => {
  const h = fixture();
  try {
    assert.doesNotThrow(
      () => h.effects.update(h.frame),
      'old attack fixtures may omit the decorative elapsed clock',
    );
    h.mount.traverse((object) => {
      if (effectivelyVisible(object))
        assert.ok(
          [
            ...object.position.toArray(),
            ...object.quaternion.toArray(),
            ...object.scale.toArray(),
          ].every(Number.isFinite),
        );
    });
    const paths = h.paths();
    const factual = paths.map((path) => [
      ...path.geometry.attributes.position.array,
    ]);
    paths.forEach((path) => {
      const uv = path.geometry.getAttribute('uv');
      assert.equal(
        uv.count,
        path.geometry.attributes.position.count,
        'every warning vertex has a feathering/flow coordinate',
      );
      assert.ok(
        [...uv.array].every(
          (value) => Number.isFinite(value) && value >= 0 && value <= 1,
        ),
      );
      assert.equal(uv.getX(0), 0);
      assert.equal(
        uv.getX(uv.count - 1),
        1,
        'the filament shading covers the complete muzzle-to-receiver path',
      );
      assert.equal(path.material.isShaderMaterial, true);
    });
    h.frame.interceptor.elapsed += 0.2;
    h.frame.interceptor.counterattack.elapsed = 0.7;
    h.effects.update(h.frame);
    paths.forEach((path, index) => {
      assert.ok(
        path.material.uniforms.time.value > 0,
        'normal flow uses the real mission clock',
      );
      assert.deepEqual(
        [...path.geometry.attributes.position.array],
        factual[index],
        'energy motion cannot wiggle the locked factual path',
      );
    });
    h.frame.settings.reducedMotion = true;
    h.effects.update(h.frame);
    paths.forEach((path) => assert.equal(path.material.uniforms.time.value, 0));
    h.frame.settings.quality = 'low';
    h.effects.update(h.frame);
    paths.forEach((path, index) => {
      assert.equal(
        path.material.isMeshBasicMaterial,
        true,
        'Low retains the factual filament with ordinary unlit geometry',
      );
      assert.deepEqual(
        [...path.geometry.attributes.position.array],
        factual[index],
      );
    });
  } finally {
    h.dispose();
  }
});

test('only a real fresh counter creates a compact pilot-anchored rupture that freezes on pause and expires in reduced motion', () => {
  const h = fixture();
  try {
    const player = new T.Group();
    player.position
      .copy(h.receiving.position)
      .addScaledVector(h.receiving.up, 0.72);
    player.quaternion.copy(h.receiving.quaternion);
    h.frame.ship = { group: player };
    const rupture = h.world.getObjectByName(
      'Wraith / accepted ignition rupture',
    );
    h.effects.update(h.frame);
    assert.equal(
      rupture.visible,
      false,
      'a warning alone cannot pretend that the pilot countered',
    );
    const attack = h.frame.interceptor.counterattack;
    attack.countered = true;
    attack.counterAt = h.frame.interceptor.elapsed - 0.05;
    h.effects.update(h.frame);
    assert.equal(rupture.visible, true);
    near(
      rupture.position,
      player.position,
      'counter slivers originate at the actual pilot',
    );
    assert.ok(Math.abs(rupture.quaternion.dot(player.quaternion)) > 1 - 1e-12);
    const bounds = new T.Box3().setFromObject(rupture).getSize(new T.Vector3());
    assert.ok(
      bounds.length() > 1 && bounds.length() < 15,
      'the accepted cue stays compact around the ship',
    );
    const transforms = rupture.children.map((child) => ({
      position: child.position.toArray(),
      scale: child.scale.toArray(),
    }));
    h.frame.mode = 'paused';
    h.effects.update(h.frame);
    assert.deepEqual(
      rupture.children.map((child) => ({
        position: child.position.toArray(),
        scale: child.scale.toArray(),
      })),
      transforms,
      'a paused combat clock freezes the accepted cue',
    );
    h.frame.mode = 'racing';
    h.frame.settings.reducedMotion = true;
    h.frame.interceptor.elapsed = attack.counterAt + 0.1;
    h.effects.update(h.frame);
    const restrained = rupture.children.map((child) =>
      child.position.toArray(),
    );
    h.frame.interceptor.elapsed = attack.counterAt + 0.2;
    h.effects.update(h.frame);
    assert.deepEqual(
      rupture.children.map((child) => child.position.toArray()),
      restrained,
      'reduced motion retains opposed slivers without flying them across the viewport',
    );
    h.frame.interceptor.elapsed = attack.counterAt + 0.4;
    h.effects.update(h.frame);
    assert.equal(
      rupture.visible,
      false,
      'reduced motion still expires the counter cue on time',
    );
    assert.ok(
      h.paths().every((path) => path.visible === false),
      'old targeting filaments finish their snap instead of lingering through overload',
    );
  } finally {
    h.dispose();
  }
});

for (const settings of [
  { quality: 'high', reducedMotion: false },
  { quality: 'low', reducedMotion: true },
]) {
  test(`${settings.quality} Wraith defeat quenches at its actual exhaust anchors while its metal hardware survives`, () => {
    const h = fixture();
    try {
      h.frame.settings = settings;
      firePhysicalScissors(h);
      h.effects.update(h.frame);
      assert.ok(
        liveBolts(h.world).length > 0,
        'the result transition starts with real active signature projectiles',
      );
      const carrier = h.mount.getObjectByName(
        'Wraith / keel-mounted capacitor carrier',
      );
      const fins = h.mount.children.filter(
        (child) => child.isGroup && child.position.z < -7,
      );
      const coils = h.mount.children.filter(
        (child) => child.name === 'Wraith / residual ion coil',
      );
      const anchors = ['Exhaust_L', 'Exhaust_R'].map((name) =>
        h.boss.getObjectByName(name),
      );
      assert.equal(
        coils.length,
        anchors.length,
        'every actual drive mouth has its own residual discharge',
      );
      h.frame.mode = 'results';
      h.frame.presentationDt = 0.1;
      h.frame.interceptor.result = { won: true };
      h.frame.interceptor.health = 0;
      h.effects.update(h.frame);
      assert.equal(
        effectivelyVisible(carrier),
        true,
        'winning never removes the authored metal case',
      );
      const kickedDoors = fins.map((fin) => Math.abs(fin.position.x));
      assert.ok(
        kickedDoors.every((x) => x > 0.9),
        'the disabled capacitor kicks both opposed doors open',
      );
      assert.equal(liveBolts(h.world).length, 0);
      assert.ok(h.paths().every((path) => path.visible === false));
      coils.forEach((coil, index) => {
        assert.equal(coil.visible, true);
        near(
          coil.getWorldPosition(new T.Vector3()),
          anchors[index].getWorldPosition(new T.Vector3()),
          'the dying coil emerges from the actual authored exhaust mouth',
        );
      });
      h.frame.presentationDt = 0.3;
      h.effects.update(h.frame);
      const dim = coils.map((coil) => coil.material.opacity);
      assert.ok(
        fins.every(
          (fin, index) => Math.abs(fin.position.x) < kickedDoors[index],
        ),
        'the mechanical kick relaxes as the cell collapses',
      );
      h.frame.presentationDt = 0;
      h.effects.update(h.frame);
      assert.deepEqual(
        coils.map((coil) => coil.material.opacity),
        dim,
        'a frozen result presentation clock cannot advance the quench',
      );
      h.frame.presentationDt = 0.3;
      h.effects.update(h.frame);
      assert.equal(
        coils[0].visible,
        false,
        'the first authored mouth runs out of ion energy first',
      );
      assert.equal(
        coils[1].visible,
        true,
        'the opposite mouth retains only a short residual tail',
      );
      h.frame.presentationDt = 0.4;
      h.effects.update(h.frame);
      assert.equal(
        effectivelyVisible(carrier),
        true,
        'the result settles to permanent metal rather than disappearing hardware',
      );
      assert.ok(coils.every((coil) => coil.visible === false));
      const glowing = [];
      for (const root of [h.world, h.mount])
        root.traverse((object) => {
          if (
            object.isMesh &&
            effectivelyVisible(object) &&
            object.material.transparent &&
            object.material.opacity > 0 &&
            (object.material.uniforms?.strength?.value ?? 1) > 0
          )
            glowing.push(object.name);
          assert.ok(
            [
              ...object.position.toArray(),
              ...object.quaternion.toArray(),
              ...object.scale.toArray(),
            ].every(Number.isFinite),
          );
        });
      assert.deepEqual(
        glowing,
        [],
        'all owned energy ends after the brief defeat response',
      );
      h.effects.reset();
      h.frame.mode = 'countdown';
      h.frame.interceptor.result = null;
      h.frame.interceptor.health = 700;
      h.frame.interceptor.counterattack = undefined;
      h.effects.update(h.frame);
      assert.equal(effectivelyVisible(carrier), true);
      assert.ok(
        coils.every((coil) => coil.visible === false),
        'retry cannot inherit a stale death clock or coil',
      );
      h.frame.mode = 'results';
      h.frame.interceptor.result = { won: false };
      h.effects.update(h.frame);
      assert.equal(effectivelyVisible(carrier), true);
      assert.ok(
        coils.every((coil) => coil.visible === false),
        'an escaped boss never pretends to discharge dead engines',
      );
    } finally {
      h.dispose();
    }
  });
}
