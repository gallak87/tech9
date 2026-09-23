import test from 'node:test';
import assert from 'node:assert/strict';
import { ALL_SCENES, nearby } from '../src/world.js';
import { SCENES, interactStory } from '../src/narrative.js';
import { createState } from '../src/progression.js';
import {
  NPC_IDENTITIES,
  npcIdentity,
  storySpeakerId,
  dialogueLine,
  npcPresent,
} from '../src/npc-identities.js';
import { ASSET_MANIFEST } from '../src/assets.js';

const npcs = Object.values(ALL_SCENES).flatMap((scene) =>
  scene.objects
    .filter((o) => o.type === 'npc')
    .map((object) => ({ scene, object })),
);
const locals = npcs.filter(
  ({ object }) => object.service || object.id.endsWith('_resident'),
);

test('every local vendor, host and resident owns distinct world and portrait art', () => {
  assert.equal(
    locals.length,
    48,
    'Sweep includes all eight towns and all eight refuge hosts',
  );
  const art = new Set(),
    names = new Set();
  for (const { scene, object } of locals) {
    const id = npcIdentity(object),
      identity = NPC_IDENTITIES[id];
    assert.equal(
      id,
      object.id,
      `${scene.id}: local identity must be tied to this person`,
    );
    assert.ok(
      identity?.artKey,
      `${object.id}: missing portrait/world art identity`,
    );
    assert.ok(
      !art.has(identity.artKey),
      `${object.id}: another local already uses this appearance`,
    );
    assert.ok(!names.has(identity.name), `${object.id}: duplicate local name`);
    art.add(identity.artKey);
    names.add(identity.name);
  }
  for (const { object } of npcs)
    assert.ok(npcIdentity(object), `${object.id}: unidentified NPC`);
});

test('production NPC artwork maps each local to a separate body with an undistorted matching portrait', () => {
  const frames = new Map(),
    crops = new Set();
  for (const entry of ASSET_MANIFEST.filter((a) => a.kind === 'npc')) {
    assert.equal(
      entry.required,
      true,
      `${entry.id}: a missing cast sheet must not silently borrow another person`,
    );
    const { sourceWidth: width, sourceHeight: height } = entry.metadata;
    for (const frame of entry.metadata.frames) {
      assert.ok(
        !frames.has(frame.id),
        `${frame.id}: duplicate sprite registration`,
      );
      const key = JSON.stringify([
        entry.url,
        frame.x,
        frame.y,
        frame.w,
        frame.h,
      ]);
      assert.ok(
        !crops.has(key),
        `${frame.id}: another NPC uses the same body crop`,
      );
      crops.add(key);
      frames.set(frame.id, frame);
      const p = frame.portrait;
      assert.ok(
        p && p.w === p.h,
        `${frame.id}: square portraits must not stretch the character`,
      );
      assert.ok(
        p.x >= 0 && p.y >= 0 && p.x + p.w <= width && p.y + p.h <= height,
        `${frame.id}: portrait extends beyond its source`,
      );
      const overlaps = (a, b) =>
        Math.min(a.x + a.w, b.x + b.w) > Math.max(a.x, b.x) &&
        Math.min(a.y + a.h, b.y + b.h) > Math.max(a.y, b.y);
      assert.ok(
        overlaps(p, frame),
        `${frame.id}: portrait misses its own character`,
      );
      // Atlas crop rectangles can touch neighbouring silhouettes. The production
      // importer then isolates this person's component before cropping a portrait.
      for (const other of entry.metadata.frames)
        if (other !== frame && overlaps(p, other))
          assert.equal(
            frame.isolateComponent,
            true,
            `${frame.id}: overlapping portrait must isolate its own person from ${other.id}`,
          );
    }
  }
  for (const { object } of locals)
    assert.ok(
      frames.has(NPC_IDENTITIES[npcIdentity(object)].artKey),
      `${object.id}: missing production sprite`,
    );
  assert.equal(frames.size, locals.length);
});

test('Orbital resident dialogue retains its source identity instead of borrowing Haventide’s face', () => {
  const orbital = ALL_SCENES.orbital_reach_town.objects.find(
    (o) => o.id === 'orbital_reach_resident',
  );
  const haven = ALL_SCENES.haventide_town.objects.find(
    (o) => o.id === 'haventide_resident',
  );
  const line = dialogueLine(
    orbital.name,
    orbital.dialogue,
    npcIdentity(orbital),
  );
  assert.equal(line.speakerId, orbital.id);
  assert.notEqual(
    NPC_IDENTITIES[line.speakerId].artKey,
    NPC_IDENTITIES[npcIdentity(haven)].artKey,
  );
  assert.equal(
    storySpeakerId('A local resident'),
    null,
    'Generic labels cannot guess a person from another scene',
  );
  assert.equal(storySpeakerId('Unknown traveler'), null);
});

test('story speakers retain explicit identities through conversations and recordings', () => {
  const people = {
    Kaida: 'kaida',
    Vex: 'vex',
    Rune: 'rune',
    Mara: 'mara',
    'Mara’s signal': 'mara',
    Keeper: 'keeper',
    'Keeper’s recording': 'keeper',
    Tavi: 'tavi',
    'Tavi’s signal': 'tavi',
    'Tavi’s note': 'tavi',
  };
  for (const [scene, lines] of Object.entries(SCENES))
    for (const line of lines) {
      assert.ok(
        Object.hasOwn(line, 'speakerId'),
        `${scene}: ${line.speaker} lacks explicit portrait intent`,
      );
      assert.equal(
        line.speakerId,
        people[line.speaker] ?? null,
        `${scene}: wrong identity for ${line.speaker}`,
      );
    }
  const smith = interactStory(createState(), 'smith_calibration');
  assert.ok(smith.lines.length);
  for (const line of smith.lines)
    assert.equal(
      line.speakerId,
      'haventide_smith',
      'Bran’s quest and shop must show the same smith',
    );
  for (const label of [
    'Field notes',
    'Heartwood relay',
    'Archive voice',
    'Sun-forge',
    'Narrator',
    'Charter',
    'Countervoice',
    'Architect’s memory',
    'Void Architect',
  ])
    assert.equal(storySpeakerId(label), null, label);
});

test('Mara travels to one quest location at a time and all required interactions remain reachable after saving', () => {
  const stages = [
    [{}, 'mara'],
    [{ mara_chart: true }, 'mara_convoy'],
    [{ mara_chart: true, mara_convoy_chosen: true }, 'mara_convoy'],
    [
      { mara_chart: true, mara_convoy_chosen: true, mara_signal: true },
      'mara_lantern',
    ],
    [
      {
        mara_chart: true,
        mara_convoy_chosen: true,
        mara_signal: true,
        mara_arc_complete: true,
      },
      'mara',
    ],
  ];
  const markers = npcs.filter(({ object }) => npcIdentity(object) === 'mara');
  const frostMara = markers.find(
    ({ object }) => object.id === 'mara_lantern',
  ).object;
  const tavi = ALL_SCENES.frost_canyon.objects.find(
    (o) => o.id === 'tavi_lantern',
  );
  assert.deepEqual(
    [tavi.x, tavi.y],
    [frostMara.x, frostMara.y],
    'Tavi inherits the scaled rescue-road location',
  );
  for (const [flags, expected] of stages) {
    const state = createState();
    Object.assign(state.flags, flags);
    for (const saved of [state, JSON.parse(JSON.stringify(state))]) {
      assert.deepEqual(
        markers
          .filter(({ object }) => npcPresent(object, saved))
          .map(({ object }) => object.id),
        [expected],
      );
      for (const { scene, object } of markers)
        assert.equal(
          nearby(scene, object.x, object.y, saved).some(
            (o) => o.id === object.id,
          ),
          object.id === expected,
          `${object.id}: hidden Mara must not remain interactable`,
        );
      assert.equal(npcPresent(tavi, saved), !!flags.mara_arc_complete);
    }
  }
});
