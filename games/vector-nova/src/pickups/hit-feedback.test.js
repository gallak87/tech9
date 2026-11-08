import test from 'node:test';
import assert from 'node:assert/strict';
import {
  AdditiveBlending,
  BoxGeometry,
  Group,
  Mesh,
  MeshBasicMaterial,
  Vector3,
} from 'three';
import { createHitFeedback } from './hit-feedback.js';
import { DEVICE_COLORS, LANCE_COLOR } from './theme.js';
import { createPickupPreview } from '../ships/pickup-preview.js';
import { PREVIEW_TARGET_DISTANCE } from '../ships/pickup-preview-sequence.js';
import { ARC_TARGET_HALF_LENGTH, LANCE_SPEED } from './rules.js';

test('Arc response follows the complete hull, with a blue halo and a soft bounded envelope', () => {
  const ship = new Group();
  const wing = new Group();
  wing.position.set(2, 0.2, -1);
  wing.rotation.y = 0.2;
  const geometry = new BoxGeometry();
  const original = new MeshBasicMaterial({ color: 0x777777 });
  const body = new Mesh(geometry, original);
  const tip = new Mesh(geometry, original);
  const plume = new Mesh(
    geometry,
    new MeshBasicMaterial({ transparent: true }),
  );
  wing.add(tip);
  ship.add(body, wing, plume);
  const color = original.color.clone();
  const feedback = createHitFeedback(ship);
  assert.equal(
    feedback.group.children.length,
    4,
    'outline + glow for both opaque hull parts',
  );
  assert.equal(feedback.group.visible, false);
  const glow = feedback.group.children.find(
    (mesh) => mesh.material.blending === AdditiveBlending,
  );
  assert.ok(glow);
  assert.ok(
    glow.material.uniforms.color.value.b > glow.material.uniforms.color.value.r,
  );
  feedback.update(0);
  assert.equal(
    glow.material.uniforms.strength.value,
    0,
    'no abrupt flash on contact',
  );
  feedback.update(0.08);
  assert.equal(glow.material.uniforms.strength.value, 1);
  feedback.update(0.08, { reducedMotion: true });
  assert.equal(glow.material.uniforms.strength.value, 0.45);
  feedback.update(0.08);
  assert.equal(
    glow.material.uniforms.strength.value,
    1,
    'paused age keeps a stable brightness',
  );
  ship.position.set(10, 4, -9);
  ship.rotation.y = 1;
  feedback.update(0.3);
  ship.updateMatrixWorld(true);
  const overlay = feedback.group.children[2];
  assert.ok(
    overlay
      .getWorldPosition(new Vector3())
      .distanceTo(tip.getWorldPosition(new Vector3())) < 1e-10,
  );
  assert.ok(glow.material.uniforms.strength.value < 0.6);
  assert.ok(
    original.color.equals(color),
    'base materials are never tinted or replaced',
  );
  feedback.update(0.55);
  assert.equal(feedback.group.visible, false);
  let geometryDisposals = 0,
    materialDisposals = 0;
  geometry.addEventListener('dispose', () => geometryDisposals++);
  for (const material of new Set(
    feedback.group.children.map((mesh) => mesh.material),
  ))
    material.addEventListener('dispose', () => materialDisposals++);
  feedback.dispose();
  feedback.dispose();
  assert.equal(
    geometryDisposals,
    0,
    'the ship still owns its borrowed geometry',
  );
  assert.equal(materialDisposals, 2);
  assert.equal(feedback.group.parent, null);
  geometry.dispose();
  original.dispose();
  plume.material.dispose();
});

test('Repulsor uses the same borrowed hull with a broader rose halo, and switching back restores Arc', () => {
  const ship = new Group();
  const geometry = new BoxGeometry();
  const original = new MeshBasicMaterial();
  ship.add(new Mesh(geometry, original));
  const feedback = createHitFeedback(ship);
  const [body, halo] = feedback.group.children;
  feedback.update(0.08, {}, 'repulsor');
  assert.equal(feedback.group.visible, true);
  assert.equal(
    body.material.uniforms.color.value.getHex(),
    DEVICE_COLORS.repulsor,
  );
  assert.equal(body.material.uniforms.strength.value, 1);
  const expanded = halo.material.uniforms.expansion.value;
  feedback.update(0.08, {}, 'ion');
  assert.equal(feedback.group.visible, true);
  assert.equal(body.material.uniforms.color.value.getHex(), DEVICE_COLORS.ion);
  feedback.update(0.08, { reducedMotion: true }, 'repulsor');
  assert.equal(body.material.uniforms.strength.value, 0.45);
  feedback.update(0.08, {}, 'arc');
  assert.equal(body.material.uniforms.color.value.getHex(), DEVICE_COLORS.arc);
  assert.ok(halo.material.uniforms.expansion.value < expanded);
  feedback.update(0.08, {}, 'aegis');
  assert.equal(feedback.group.visible, false);
  assert.equal(body.material.uniforms.strength.value, 0);
  feedback.dispose();
  geometry.dispose();
  original.dispose();
});

test('ongoing Ion contact rolls softly over the hull and yields to the first strong hit', () => {
  const ship = new Group();
  const geometry = new BoxGeometry();
  const original = new MeshBasicMaterial();
  ship.add(new Mesh(geometry, original));
  ship.position.set(20, 4, -12);
  ship.rotation.y = 0.6;
  const feedback = createHitFeedback(ship);
  const uniforms = feedback.group.children[0].material.uniforms;
  const exposure = { ionContact: 1, time: 2 };
  feedback.update(undefined, {}, 'ion', exposure);
  assert.equal(feedback.group.visible, true);
  assert.equal(uniforms.interference.value, 1);
  assert.equal(uniforms.strength.value, 0.38);
  assert.equal(uniforms.time.value, 2);
  assert.equal(uniforms.color.value.getHex(), DEVICE_COLORS.ion);
  assert.ok(
    ship
      .getWorldPosition(new Vector3())
      .applyMatrix4(uniforms.worldToHull.value)
      .length() < 1e-10,
    'flow is anchored to the hull rather than the track',
  );
  feedback.update(0.08, {}, 'ion', exposure);
  assert.equal(uniforms.strength.value, 1);
  assert.equal(uniforms.interference.value, 0);
  feedback.update(0.55, {}, 'ion', exposure);
  assert.equal(uniforms.strength.value, 0.38);
  feedback.update(undefined, { reducedMotion: true }, 'ion', exposure);
  assert.equal(uniforms.time.value, 0);
  assert.equal(uniforms.strength.value, 0.18);
  feedback.update();
  assert.equal(
    feedback.group.visible,
    false,
    'leaving the wake or resetting clears the wash',
  );
  feedback.dispose();
  geometry.dispose();
  original.dispose();
});

test('High and Low retain the incoming weapon identity until drive recovery ends', () => {
  for (const quality of ['high', 'low']) {
    const ship = new Group();
    const geometry = new BoxGeometry();
    const material = new MeshBasicMaterial();
    ship.add(new Mesh(geometry, material));
    const feedback = createHitFeedback(ship, { quality });
    feedback.update(undefined, { quality }, 'repulsor', {
      disruption: 1,
      time: 2,
    });
    assert.equal(feedback.group.visible, true);
    const response = feedback.group.children[0].material;
    assert.equal(
      (response.uniforms?.color.value ?? response.color).getHex(),
      DEVICE_COLORS.repulsor,
    );
    feedback.update(undefined, { quality }, 'repulsor', { disruption: 0 });
    assert.equal(feedback.group.visible, false);
    feedback.dispose();
    geometry.dispose();
    material.dispose();
  }
});

test('Lance briefly highlights the hull in molten orange without a sustained Repulsor recovery wash', () => {
  for (const quality of ['high', 'low']) {
    const ship = new Group();
    const geometry = new BoxGeometry();
    const material = new MeshBasicMaterial();
    const original = material.color.clone();
    ship.add(new Mesh(geometry, material));
    const feedback = createHitFeedback(ship, { quality });
    feedback.update(0.1, { quality }, 'repulsor', { equipment: 'lance' });
    assert.equal(feedback.group.visible, true);
    const response = feedback.group.children[0].material;
    assert.equal(
      (response.uniforms?.color.value ?? response.color).getHex(),
      LANCE_COLOR,
    );
    const strength = () =>
      response.uniforms?.strength.value ?? response.opacity;
    const full = strength();
    assert.ok(full > 0);
    feedback.update(0.1, { quality, reducedMotion: true }, 'repulsor', {
      equipment: 'lance',
    });
    assert.ok(strength() > 0 && strength() < full);
    feedback.update(0.55, { quality }, 'repulsor', { equipment: 'lance' });
    assert.equal(
      feedback.group.visible,
      false,
      'the short hit envelope expires',
    );
    feedback.update(0.1, { quality }, 'aegis', { equipment: 'lance' });
    assert.equal(
      feedback.group.visible,
      false,
      'a shield blocks the hull response',
    );
    feedback.update(undefined, { quality }, 'repulsor', {
      disruption: 1,
      disruptionEquipment: 'lance',
    });
    assert.equal(feedback.group.visible, false);
    feedback.update(0.1, { quality }, 'repulsor', {
      disruption: 1,
      disruptionEquipment: 'lance',
    });
    assert.equal(
      feedback.group.visible,
      true,
      'another ordinary hit retains its hull flash during Lance recovery',
    );
    assert.equal(
      (response.uniforms?.color.value ?? response.color).getHex(),
      DEVICE_COLORS.repulsor,
    );
    feedback.update(undefined, { quality }, 'repulsor', { disruption: 1 });
    assert.equal(
      feedback.group.visible,
      true,
      'ordinary Repulsor recovery retains its hull response',
    );
    feedback.update();
    assert.equal(feedback.group.visible, false);
    assert.equal(ship.children[0].material, material);
    assert.ok(
      material.color.equals(original),
      'borrowed hull materials stay intact',
    );
    feedback.dispose();
    geometry.dispose();
    material.dispose();
  }
});

test('Lance inspector impacts highlight only an unshielded target and clear on Stop across quality changes', async () => {
  const geometry = new BoxGeometry(4, 2, 8);
  const material = new MeshBasicMaterial({ color: 0x777777 });
  let hullDisposals = 0;
  geometry.addEventListener('dispose', () => hullDisposals++);
  for (const shielded of [false, true]) {
    const frame = new Group(),
      ship = new Group(),
      target = new Group();
    ship.add(new Mesh(geometry, material));
    target.add(new Mesh(geometry, material));
    frame.add(ship);
    const settings = { quality: 'high' };
    const preview = createPickupPreview({
      ship,
      target,
      frame,
      getSettings: () => settings,
      createAudio: () => ({
        prepare: async () => 0,
        event() {},
        update() {},
        setEffects() {},
        stop() {},
        dispose() {},
      }),
    });
    const impact =
      (PREVIEW_TARGET_DISTANCE - ARC_TARGET_HALF_LENGTH) / LANCE_SPEED;
    assert.equal(
      await preview.trigger('lance', {
        time: impact + 0.08,
        paused: true,
        shielded,
      }),
      true,
    );
    for (const quality of ['high', 'low', 'high']) {
      settings.quality = quality;
      settings.reducedMotion = quality === 'low';
      preview.update(10);
      const response = target.getObjectByName(
        quality === 'low'
          ? 'Low combat / hull response'
          : 'Combat / hull hit outline',
      );
      assert.equal(response.visible, !shielded);
      if (!shielded) {
        const surface = response.children[0].material;
        assert.equal(
          (surface.uniforms?.color.value ?? surface.color).getHex(),
          LANCE_COLOR,
        );
        const strength = surface.uniforms?.strength.value ?? surface.opacity;
        assert.ok(strength > 0);
        preview.update(10);
        assert.equal(
          surface.uniforms?.strength.value ?? surface.opacity,
          strength,
          'paused hit age keeps its brightness',
        );
      }
      assert.equal(
        ship.getObjectByName(
          quality === 'low'
            ? 'Low combat / hull response'
            : 'Combat / hull hit outline',
        ).visible,
        false,
        'the source ship never receives its target highlight',
      );
    }
    preview.stop();
    assert.equal(
      target.getObjectByName('Combat / hull hit outline').visible,
      false,
    );
    preview.dispose();
    preview.dispose();
    assert.equal(
      target.children.length,
      1,
      'feedback resources detach cleanly',
    );
    assert.equal(target.children[0].material, material);
  }
  assert.equal(
    hullDisposals,
    0,
    'quality switches and disposal preserve borrowed hull geometry',
  );
  assert.equal(material.color.getHex(), 0x777777);
  geometry.dispose();
  material.dispose();
});
