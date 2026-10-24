import test from 'node:test';
import assert from 'node:assert/strict';
import { Group } from 'three';
import { COMBAT_RULES } from '../pickups/combat.js';
import {
  AEGIS_DURATION,
  AEGIS_BREAK_DURATION,
  ARC_TARGET_HALF_LENGTH,
  LANCE_SPEED,
} from '../pickups/rules.js';
import { createShipFeedbackPresentation } from '../pickups/ship-feedback.js';
import { createPickupPreview } from './pickup-preview.js';
import { createPickupPreviewAudio } from './pickup-preview-audio.js';
import { EQUIPMENT, equipmentById } from '../progression/catalog.js';
import {
  PICKUP_PREVIEWS,
  DEVICE_PREVIEWS,
  PREVIEW_TARGET_DISTANCE,
  pickupPreviewFrame,
} from './pickup-preview-sequence.js';

test('equipment auditions cover the live catalogue and retain active lifetimes and shield outcomes', () => {
  for (const item of EQUIPMENT) {
    assert.ok(DEVICE_PREVIEWS.some(({ id }) => id === item.id));
    const start = pickupPreviewFrame(item.id, 0);
    assert.equal(start.events[0].type, 'equipment-activate');
    assert.equal(start.equipment.slots[0].remaining, item.cooldown);
    assert.equal(start.equipment.slots[0].active, item.duration);
    if (!item.duration) continue;
    const finish = pickupPreviewFrame(
      item.id,
      item.duration,
      item.duration - 0.01,
    );
    assert.equal(finish.equipment.slots[0].active, 0);
    assert.equal(finish.events[0].type, 'equipment-expire');
  }
  const deflector = equipmentById('deflector');
  assert.equal(
    pickupPreviewFrame('deflector', deflector.duration - 0.01).equipment.shield,
    true,
  );
  assert.equal(
    pickupPreviewFrame('deflector', deflector.duration).equipment.shield,
    false,
  );
  const block = pickupPreviewFrame('deflector-hit', 1.5, 1.49);
  assert.equal(block.equipment.shield, false);
  assert.equal(block.equipment.slots[0].active, 0);
  assert.deepEqual(block.events, [
    {
      type: 'equipment-block',
      payload: { kind: 'deflector', direction: [0, 0, 1] },
    },
  ]);
});

test('utility demonstrations show launch, correction, reserve restoration and a closing rival gap', () => {
  const jump = pickupPreviewFrame('jump', 0.8);
  assert.ok(jump.demo.position[1] > 9);
  assert.equal(jump.demo.airborne, true);
  assert.deepEqual(jump.demo.target, [0, 0, PREVIEW_TARGET_DISTANCE]);
  const landed = pickupPreviewFrame('jump', 2.1, 1.6);
  assert.equal(landed.demo.airborne, false);
  assert.equal(landed.demo.position[1], 0);
  assert.equal(
    landed.events.filter(({ type }) => type === 'jump-transfer').length,
    1,
  );
  assert.equal(pickupPreviewFrame('jump', 2.11, 2.1).events.length, 0);

  const drifting = pickupPreviewFrame('stabilizer', 0.4).demo;
  const corrected = pickupPreviewFrame('stabilizer', 2.4).demo;
  assert.ok(Math.abs(drifting.position[0]) > 3);
  assert.ok(drifting.rotation[2] > 0.3);
  assert.equal(Math.abs(corrected.position[0]), 0);
  assert.equal(corrected.rotation[2], 0);
  assert.equal(corrected.airborne, true);
  assert.equal(pickupPreviewFrame('stabilizer', 3.8).demo.position[1], 0);
  assert.deepEqual(
    pickupPreviewFrame('stabilizer', 0.4, 0, false, false, true).demo.rotation,
    [0, 0, 0],
  );

  assert.equal(pickupPreviewFrame('injector', 0).demo.reserve.value, 25);
  assert.equal(pickupPreviewFrame('injector', 0.7).demo.reserve.value, 70);
  const surge = pickupPreviewFrame('slipstream', 3).demo;
  assert.ok(surge.target[2] < PREVIEW_TARGET_DISTANCE - 10);
  assert.ok(surge.target[2] > 13);
});

test('moving auditions keep their rival independent and restore the hull on Stop, retrigger and chassis changes', async () => {
  const target = new Group();
  const h = previewHarness(target);
  await h.preview.trigger('jump');
  h.preview.update(0.8);
  assert.ok(h.ship.position.y > 9);
  assert.equal(target.position.y, 0);
  assert.equal(target.position.z, PREVIEW_TARGET_DISTANCE);
  const height = h.ship.position.y;
  h.preview.update(0);
  assert.equal(
    h.ship.position.y,
    height,
    'presentation offsets never accumulate',
  );
  h.preview.stop();
  assert.deepEqual(h.ship.position.toArray(), [0, 0, 0]);
  assert.deepEqual(h.ship.quaternion.toArray(), [0, 0, 0, 1]);
  await h.preview.trigger('stabilizer');
  h.preview.update(0.5);
  assert.ok(h.ship.position.x < -3);
  await h.preview.trigger('arc');
  assert.deepEqual(h.ship.position.toArray(), [0, 0, 0]);
  await h.preview.trigger('jump');
  h.preview.update(0.4);
  const replacement = new Group();
  h.preview.setShip(replacement);
  assert.deepEqual(h.ship.position.toArray(), [0, 0, 0]);
  assert.equal(target.visible, false);
  assert.equal(h.preview.getSnapshot().kind, null);
  h.preview.dispose();
  assert.deepEqual(replacement.position.toArray(), [0, 0, 0]);
});

test('a paused authoring sample holds its pose without replaying activation or landing audio', async () => {
  const h = previewHarness(new Group());
  await h.preview.trigger('jump', { time: 0.8, paused: true });
  const position = h.ship.position.toArray();
  const events = h.events.length;
  h.preview.update(10);
  assert.deepEqual(h.ship.position.toArray(), position);
  assert.equal(h.preview.getSnapshot().time, 0.8);
  assert.equal(h.events.length, events);
  h.preview.stop();
  assert.deepEqual(h.ship.position.toArray(), [0, 0, 0]);
  h.preview.dispose();
});

test('Lance auditions fire one heavy bolt and preserve its sound identity through a shielded or bare impact', () => {
  const hitAt =
    (PREVIEW_TARGET_DISTANCE - ARC_TARGET_HALF_LENGTH) / LANCE_SPEED;
  const flight = pickupPreviewFrame('lance', hitAt / 2, 0, true);
  assert.equal(flight.combat.shots.length, 1);
  assert.equal(flight.combat.shots[0].heavy, true);
  assert.equal(flight.combat.shots[0].position[2], (LANCE_SPEED * hitAt) / 2);
  for (const shielded of [false, true]) {
    const hit = pickupPreviewFrame('lance', hitAt + 0.001, -1, true, shielded);
    assert.equal(hit.combat.shots.length, 0);
    const fire = hit.events.filter(({ type }) => type === 'combat-fire');
    assert.deepEqual(fire, [
      { type: 'combat-fire', payload: { kind: 'arc', equipment: 'lance' } },
    ]);
    const contact = hit.events.find(({ type }) => type === 'combat-confirm');
    assert.equal(contact.payload.kind, 'repulsor');
    assert.equal(contact.payload.equipment, 'lance');
    assert.equal(contact.payload.shielded, shielded);
    assert.equal(
      hit.combat.flashes.at(-1).kind,
      shielded ? 'aegis' : 'repulsor',
    );
  }
});

test('each audition emits one acquisition; Arc retains the real three-shot timing and speed', () => {
  for (const { id } of PICKUP_PREVIEWS) {
    assert.deepEqual(pickupPreviewFrame(id, 0).events, [
      {
        type: 'pickup-activate',
        payload: { kind: id === 'aegis-hit' ? 'aegis' : id },
      },
    ]);
    assert.equal(pickupPreviewFrame(id, 0.01, 0).events.length, 0);
  }
  const events = [];
  for (let index = 1; index <= 200; index++)
    events.push(
      ...pickupPreviewFrame('arc', index / 100, (index - 1) / 100).events,
    );
  assert.equal(
    events.filter((event) => event.type === 'combat-fire').length,
    3,
  );
  assert.equal(
    events.filter((event) => event.type === 'pickup-expire').length,
    1,
  );
  const frame = pickupPreviewFrame('arc', COMBAT_RULES.arcDelay + 0.05, 0);
  assert.ok(
    Math.abs(frame.combat.shots[0].position[2] - COMBAT_RULES.arcSpeed * 0.05) <
      1e-9,
  );
  assert.equal(frame.combat.flashes[0].type, 'muzzle');
});

test('Aegis, Repulsor and Ion follow their authored lifetime and retain visible tails', () => {
  const aegis = pickupPreviewFrame(
    'aegis',
    AEGIS_DURATION,
    AEGIS_DURATION - 0.01,
  );
  assert.equal(aegis.effects.aegisRemaining, 0);
  assert.equal(aegis.events[0].type, 'pickup-expire');
  assert.equal(aegis.end, AEGIS_DURATION + 0.5);
  const pulse = pickupPreviewFrame('repulsor', COMBAT_RULES.pulseDelay, 0);
  assert.equal(pulse.combat.emitters.player, undefined);
  assert.equal(pulse.combat.flashes[0].radius, COMBAT_RULES.pulseRadius);
  const ion = pickupPreviewFrame('ion', COMBAT_RULES.wakeDuration + 0.01, 0);
  assert.equal(ion.beds.ion, false);
  assert.ok(ion.combat.wakes.length > 0);
  assert.ok(ion.combat.wakes.every((wake) => wake.a[2] < wake.b[2]));
  const ended = pickupPreviewFrame('ion', ion.end, ion.end - 0.01);
  assert.equal(ended.combat.wakes.length, 0);
});

test('incoming Ion emits from Rook and consumes the player shield only once per burst', () => {
  for (const shielded of [false, true]) {
    const start = pickupPreviewFrame('ion', 0, -1, true, shielded);
    assert.equal(start.combat.emitters.player, undefined);
    assert.equal(start.combat.emitters.rook.kind, 'ion');
    assert.equal(start.beds.ion, true);
    assert.equal(start.ionContact, 0);
    assert.equal(start.effects.aegisRemaining > 0, shielded);
    const events = [];
    for (let time = 0.01; time < 8; time += 0.01) {
      const frame = pickupPreviewFrame(
        'ion',
        time,
        time - 0.01,
        true,
        shielded,
      );
      events.push(...frame.events);
      const hit = frame.events.find((event) => event.type === 'combat-hit');
      if (hit) {
        assert.equal(hit.payload.source, 'rook');
        assert.equal(hit.payload.target, 'player');
        assert.equal(hit.payload.shielded, shielded);
        assert.equal(frame.effects.aegisRemaining, 0);
        assert.equal(frame.combat.flashes[0].kind, shielded ? 'aegis' : 'ion');
        assert.ok(
          frame.combat.wakes.some(
            (wake) =>
              wake.a[2] <= ARC_TARGET_HALF_LENGTH &&
              wake.b[2] >= ARC_TARGET_HALF_LENGTH,
          ),
          'contact follows the arriving wake',
        );
      }
    }
    assert.equal(
      events.filter((event) => event.type === 'combat-hit').length,
      1,
    );
    assert.equal(
      events.filter((event) => event.type === 'shield-hit').length,
      shielded ? 1 : 0,
    );
    const ongoing = pickupPreviewFrame('ion', 1.5, 1.49, true, shielded);
    assert.ok(
      ongoing.ionContact > 0,
      'the passing wake still produces visual exposure',
    );
    assert.deepEqual(
      ongoing.events,
      [],
      'continued contact has no extra hit or audio events',
    );
    assert.equal(
      pickupPreviewFrame('ion', 7.7, 7.69, true, shielded).ionContact,
      0,
    );
  }
});

test('shared hull effects preserve paused timers, impact clearing and reduced-motion feedback', () => {
  const feedback = createShipFeedbackPresentation();
  const shield = feedback.group.children.find(
    (mesh) => mesh.material?.uniforms.hit,
  );
  const drive = feedback.group.children.find((mesh) =>
    mesh.name.startsWith('Vector'),
  );
  const acquisition = feedback.group.children.find(
    (mesh) => mesh.material?.uniforms.kind,
  );
  feedback.update({
    events: [{ type: 'pickup-activate', payload: { kind: 'arc' } }],
  });
  assert.equal(acquisition.visible, true);
  assert.equal(acquisition.material.uniforms.kind.value, 3);
  feedback.update({ racing: false, driving: true, dt: 5 });
  assert.equal(acquisition.material.uniforms.age.value, 0);
  feedback.update({ dt: 0.31 });
  assert.equal(acquisition.visible, false);
  feedback.update({
    events: [{ type: 'shield-hit', payload: { side: -1 } }],
    settings: { reducedMotion: true },
  });
  assert.equal(feedback.hitActive, true);
  assert.equal(shield.material.uniforms.hit.value, 0.55);
  assert.equal(shield.material.uniforms.hitSide.value, -1);
  feedback.update({
    events: [{ type: 'impact', payload: { shielded: false } }],
  });
  assert.equal(feedback.hitActive, false);
  assert.equal(shield.visible, false);
  feedback.update({
    effects: { vectorActive: true },
    time: 3,
    settings: { reducedMotion: true },
  });
  assert.equal(drive.visible, true);
  assert.equal(drive.material.uniforms.flowTime.value, 0);
  feedback.reset();
  assert.equal(drive.visible, false);
  feedback.dispose();
});

test('Aegis auditions distinguish a consumed shield from natural expiry', () => {
  const before = pickupPreviewFrame('aegis-hit', 1.49, 1.48);
  assert.ok(before.effects.aegisRemaining > 0);
  const hit = pickupPreviewFrame('aegis-hit', 1.5, 1.49);
  assert.deepEqual(hit.events, [
    { type: 'shield-hit', payload: { kind: 'aegis' } },
  ]);
  assert.equal(hit.effects.aegisRemaining, 0);
  assert.equal(
    'aegis' in hit.beds,
    false,
    'Aegis has no sustained audio layer',
  );
  assert.equal(hit.end, 1.5 + AEGIS_BREAK_DURATION);
  assert.deepEqual(pickupPreviewFrame('aegis-hit', 6, 1.5).events, []);
  const expired = pickupPreviewFrame(
    'aegis',
    AEGIS_DURATION,
    AEGIS_DURATION - 0.01,
  );
  assert.equal(expired.events[0].type, 'pickup-expire');
});

test('Aegis trails only while protected and moving; fracture freezes on pause and releases cleanly', () => {
  const feedback = createShipFeedbackPresentation();
  const shield = feedback.group.getObjectByName(
    'Aegis / hull field and outward pulses',
  );
  const trail = feedback.group.getObjectByName('Aegis / dim driving trail');
  feedback.update({ effects: { aegisRemaining: 5 } });
  assert.equal(shield.visible, true);
  assert.equal(trail.visible, false);
  feedback.update({ effects: { aegisRemaining: 4 }, speed: 110, time: 1 });
  assert.equal(trail.visible, true);
  feedback.update({ events: [{ type: 'shield-hit' }], speed: 110, time: 1.1 });
  assert.equal(
    trail.visible,
    false,
    'consumption stops the moving field immediately',
  );
  feedback.update({ dt: 0.2, time: 1.3 });
  const age = shield.material.uniforms.breakAge.value;
  assert.ok(Math.abs(age - 0.2) < 1e-9);
  feedback.update({ racing: false, driving: true, dt: 10, time: 1.3 });
  assert.equal(shield.material.uniforms.breakAge.value, age);
  feedback.update({ dt: AEGIS_BREAK_DURATION });
  assert.equal(shield.visible, false);
  feedback.update({
    events: [{ type: 'pickup-expire', payload: { kind: 'aegis' } }],
  });
  assert.equal(shield.visible, true);
  assert.equal(
    shield.material.uniforms.hit.value,
    0,
    'natural expiry never cracks',
  );
  feedback.reset();
  assert.equal(shield.visible, false);
  assert.equal(trail.visible, false);
  feedback.dispose();
});

function previewHarness(target) {
  const ship = new Group();
  const frame = new Group();
  frame.add(ship);
  const settings = { volume: 0.35, muted: false };
  const events = [];
  const statuses = [];
  let prepare = () => Promise.resolve(2.34);
  const audio = {
    prepare: (...args) => prepare(...args),
    updates: [],
    stops: 0,
    disposals: 0,
    update(...args) {
      this.updates.push(args);
    },
    event(event) {
      events.push(event);
    },
    setEffects() {},
    stop() {
      this.stops++;
    },
    dispose() {
      this.disposals++;
    },
  };
  const preview = createPickupPreview({
    ship,
    target,
    frame,
    getSettings: () => settings,
    onStatus: (value) => statuses.push(value),
    createAudio: () => audio,
  });
  return {
    preview,
    ship,
    frame,
    settings,
    audio,
    events,
    statuses,
    defer() {
      let resume;
      prepare = () =>
        new Promise((resolve) => {
          resume = resolve;
        });
      return () => resume(2.34);
    },
  };
}

test('equipped fields expire, stop and clear on chassis changes using the shared race effects', async () => {
  const h = previewHarness();
  await h.preview.trigger('deflector');
  const effects = h.ship.getObjectByName('Player equipment effects');
  const shield = effects.getObjectByName(
    'Deflector / segmented conformal panels',
  );
  assert.equal(effects.visible, true);
  assert.equal(shield.visible, true);
  h.preview.update(2.5);
  assert.equal(h.preview.getSnapshot().kind, 'deflector');
  h.preview.update(0.4);
  assert.equal(shield.visible, false);
  h.preview.stop();
  assert.equal(effects.visible, false);
  await h.preview.trigger('stabilizer');
  assert.ok(effects.children.some((mesh) => mesh.visible && mesh !== shield));
  h.preview.setShip(new Group());
  assert.equal(effects.visible, false);
  h.preview.dispose();
  assert.equal(effects.parent, null);
});

test('the dev target stops Arc pellets at its hull and uses the gameplay hit grace and flash', () => {
  const distance = PREVIEW_TARGET_DISTANCE - ARC_TARGET_HALF_LENGTH;
  const impact = COMBAT_RULES.arcDelay + distance / COMBAT_RULES.arcSpeed;
  const before = pickupPreviewFrame('arc', impact - 0.001, 0, true);
  assert.equal(before.combat.shots.length, 1);
  assert.ok(before.combat.shots[0].position[2] < distance);
  const hit = pickupPreviewFrame('arc', impact + 0.001, impact - 0.001, true);
  assert.equal(hit.combat.shots.length, 0);
  assert.equal(
    hit.events.filter((event) => event.type === 'combat-confirm').length,
    1,
  );
  const flash = hit.combat.flashes.find((flash) => flash.type !== 'muzzle');
  assert.equal(flash.position[2], distance);
  assert.equal(flash.kind, 'arc');
  const all = pickupPreviewFrame('arc', 2, -1, true).events;
  assert.equal(all.filter((event) => event.type === 'combat-fire').length, 3);
  assert.equal(
    all.filter((event) => event.type === 'combat-confirm').length,
    2,
    'the third shot arrives after hit grace expires',
  );
  assert.equal(
    all.filter((event) => event.type === 'combat-contact').length,
    1,
  );
  for (let index = 0; index < 3; index++) {
    const at = impact + index * COMBAT_RULES.arcInterval + 0.001;
    const contact = pickupPreviewFrame('arc', at, at - 0.002, true);
    assert.ok(
      contact.combat.flashes.some(
        (flash) => flash.target === 'rook' && flash.age < 0.002,
      ),
    );
  }
  const repulsor = pickupPreviewFrame(
    'repulsor',
    COMBAT_RULES.pulseDelay,
    0,
    true,
  );
  assert.ok(
    repulsor.combat.flashes.some(
      (flash) => flash.position[2] === PREVIEW_TARGET_DISTANCE,
    ),
  );
  assert.equal(repulsor.events.at(-1).type, 'combat-confirm');
});

test('a shielded target blocks the first hit, skips the second and takes the third on its hull', () => {
  for (const kind of ['arc', 'repulsor']) {
    const at =
      kind === 'arc'
        ? COMBAT_RULES.arcDelay +
          (PREVIEW_TARGET_DISTANCE - ARC_TARGET_HALF_LENGTH) /
            COMBAT_RULES.arcSpeed
        : COMBAT_RULES.pulseDelay;
    const frame = pickupPreviewFrame(kind, at + 0.001, 0, true, true);
    assert.equal(
      frame.events.find((event) => event.type === 'combat-confirm').payload
        .shielded,
      true,
    );
    assert.equal(
      frame.combat.flashes.find((flash) => flash.target === 'rook').kind,
      'aegis',
    );
  }
  const arc = pickupPreviewFrame('arc', 2, -1, true, true);
  assert.equal(
    arc.events.filter((event) => event.type === 'combat-confirm').length,
    2,
  );
  assert.equal(
    arc.events.filter((event) => event.type === 'combat-contact').length,
    1,
  );
  assert.deepEqual(
    arc.events
      .filter((event) => event.type === 'combat-confirm')
      .map((event) => event.payload.shielded),
    [true, false],
  );
});

test('the target stays in the inspection frame across chassis changes and detaches on teardown', async () => {
  const target = new Group();
  const h = previewHarness(target);
  assert.equal(target.parent, h.frame);
  assert.equal(target.position.z, PREVIEW_TARGET_DISTANCE);
  await h.preview.trigger('arc');
  h.preview.update(
    COMBAT_RULES.arcDelay +
      (PREVIEW_TARGET_DISTANCE - ARC_TARGET_HALF_LENGTH) /
        COMBAT_RULES.arcSpeed +
      0.01,
  );
  const flashes = [];
  h.frame.traverse((object) => {
    if (object.visible && object.name === 'Combat / contact or pressure pulse')
      flashes.push(object);
  });
  assert.ok(
    flashes.some(
      (object) =>
        object.position.z === PREVIEW_TARGET_DISTANCE - ARC_TARGET_HALF_LENGTH,
    ),
  );
  h.preview.stop();
  assert.equal(target.visible, true);
  assert.equal(target.parent, h.frame);
  h.preview.setShip(null);
  assert.equal(target.visible, false);
  assert.equal(h.ship.children.length, 0);
  const replacement = new Group();
  h.preview.setShip(replacement);
  assert.equal(target.parent, h.frame);
  assert.equal(target.visible, true);
  h.preview.dispose();
  assert.equal(replacement.children.length, 0);
});

test('Ion routes its shield and hit glow to the player and clears both on Stop', async () => {
  const target = new Group();
  const h = previewHarness(target);
  const fieldName = 'Aegis / hull field and outward pulses';
  await h.preview.trigger('ion', { shielded: true });
  const root = h.ship.children[0];
  const playerShield = root.getObjectByName(fieldName);
  const enemyShield = target.getObjectByName(fieldName);
  assert.equal(playerShield.visible, true);
  assert.equal(enemyShield.visible, false);
  h.preview.update(0.25);
  assert.equal(
    h.events.filter((event) => event.type === 'shield-hit').length,
    1,
  );
  const playerGlow = root.getObjectByName('Combat / hull hit outline');
  assert.equal(
    playerGlow.visible,
    false,
    'blocked hits do not tint the hull violet',
  );
  h.preview.update(0.75);
  assert.equal(
    playerGlow.visible,
    true,
    'later deposits leave light interference after the shield break',
  );
  assert.equal(
    h.events.filter((event) => event.type === 'combat-hit').length,
    1,
  );
  await h.preview.trigger('ion');
  assert.equal(playerShield.visible, false);
  h.preview.update(0.25);
  assert.equal(playerGlow.visible, true);
  assert.equal(
    target.getObjectByName('Combat / hull hit outline').visible,
    false,
  );
  h.preview.stop();
  assert.equal(playerGlow.visible, false);
  assert.equal(playerShield.visible, false);
  h.preview.dispose();
});

test('audio preparation gates both sound and VFX; Stop and changing ship cancel late starts', async () => {
  const h = previewHarness();
  const finish = h.defer();
  const pending = h.preview.trigger('arc');
  assert.equal(h.ship.children[0].visible, false);
  assert.equal(h.events.length, 0);
  h.preview.stop();
  finish();
  assert.equal(await pending, false);
  assert.equal(h.events.length, 0);
  const finishAgain = h.defer();
  const next = h.preview.trigger('arc');
  const replacement = new Group();
  h.preview.setShip(replacement);
  finishAgain();
  assert.equal(await next, false);
  assert.equal(h.ship.children.length, 0);
  assert.equal(replacement.children[0].visible, false);
  h.preview.dispose();
  assert.equal(replacement.children.length, 0);
  assert.equal(h.audio.disposals, 1);
});

test('Arc activation plays beyond the shorter burst; retrigger, mute and disposal have one owner', async () => {
  const h = previewHarness();
  assert.equal(await h.preview.trigger('arc'), true);
  h.preview.update(1.6);
  assert.equal(h.ship.children[0].visible, true);
  assert.equal(
    h.events.filter((event) => event.type === 'combat-fire').length,
    3,
  );
  h.preview.update(0.75);
  assert.equal(h.ship.children[0].visible, false);
  assert.equal(h.statuses.at(-1), 'Ready');
  await h.preview.trigger('ion');
  await h.preview.trigger('aegis');
  assert.equal(h.ship.children.length, 1);
  h.settings.muted = true;
  h.preview.configure();
  assert.equal(h.audio.updates.at(-1)[0].muted, true);
  h.preview.dispose();
  h.preview.dispose();
  assert.equal(h.audio.disposals, 1);
  assert.equal(await h.preview.trigger('arc'), false);
});

test('Repulsor keeps its discharge tail alive after the pressure pulse finishes', async () => {
  const h = previewHarness();
  h.audio.prepare = async () => 0;
  h.audio.duration = (event) => (event.type === 'combat-fire' ? 1.42 : 0);
  await h.preview.trigger('repulsor');
  assert.equal(
    h.events.some((event) => event.type === 'combat-fire'),
    false,
  );
  h.preview.update(COMBAT_RULES.pulseDelay - 0.01);
  assert.equal(
    h.events.some((event) => event.type === 'combat-fire'),
    false,
  );
  h.preview.update(0.02);
  assert.equal(
    h.events.filter((event) => event.type === 'combat-fire').length,
    1,
  );
  h.preview.update(0.6);
  assert.equal(h.ship.children[0].visible, true);
  h.preview.update(0.81);
  assert.equal(
    h.ship.children[0].visible,
    true,
    'tail extends from the actual discharge event',
  );
  h.preview.update(0.02);
  assert.equal(h.ship.children[0].visible, false);
  assert.equal(h.statuses.at(-1), 'Ready');
  h.preview.dispose();
});

test('inspector delegates the full sound set and cleanup to the shared gameplay bus', async () => {
  const events = [];
  let stopped = 0,
    disposed = 0;
  const audio = createPickupPreviewAudio({
    createAudio: () => ({
      unlock: async () => true,
      getStatus: () => ({ missingSamples: [] }),
      event: (event) => events.push(event),
      duration: () => 1.42,
      silence: () => stopped++,
      dispose: async () => disposed++,
    }),
  });
  assert.equal(await audio.prepare('repulsor'), 0);
  const event = { type: 'combat-fire', payload: { kind: 'repulsor' } };
  audio.event(event);
  assert.deepEqual(events, [event]);
  assert.equal(audio.duration(event), 1.42);
  audio.stop();
  audio.dispose();
  assert.equal(stopped, 1);
  assert.equal(disposed, 1);
});
