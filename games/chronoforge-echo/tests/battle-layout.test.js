import test from 'node:test';
import assert from 'node:assert/strict';
import { ASSET_MANIFEST } from '../src/assets.js';
import { installEnemySheet } from '../src/art.js';
import { createBattle, drawBattle } from '../src/combat.js';
import { createState } from '../src/progression.js';
import { ALL_SCENES } from '../src/world.js';
import { createViewport } from '../src/viewport.js';
import { mobileBattleLayout } from '../src/battle-layout.js';

const overlaps = (a, b) =>
  a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;

test('enemy meters fit the viewport and clear neighboring enemies in every authored formation', (t) => {
  const labels = [];
  // Record real drawBattle calls against source crop metadata, without a
  // browser, decoded images, running game or animation clock.
  const ctx = new Proxy(
    {
      measureText(value) {
        return { width: value.length * (parseFloat(this.font) || 9) * 0.5 };
      },
      createLinearGradient: () => ({ addColorStop() {} }),
      createRadialGradient: () => ({ addColorStop() {} }),
      createPattern: () => null,
      fillText(value, x, y) {
        if (value.includes(' · LVL')) labels.push({ value, x, y });
      },
    },
    { get: (target, key) => (key in target ? target[key] : () => {}) },
  );
  const previousDocument = globalThis.document;
  globalThis.document = { createElement: () => ({ getContext: () => ctx }) };
  t.after(() => {
    if (previousDocument === undefined) delete globalThis.document;
    else globalThis.document = previousDocument;
  });
  for (const entry of ASSET_MANIFEST.filter(
    (asset) => asset.kind === 'enemy',
  )) {
    const metadata = entry.metadata;
    installEnemySheet(
      entry.id,
      {
        width: metadata.sourceWidth,
        height: metadata.sourceHeight,
      },
      metadata,
    );
  }
  const state = createState();
  const encounters = Object.values(ALL_SCENES).flatMap((scene) =>
    scene.objects
      .filter((object) => object.type === 'encounter')
      .map((encounter) => ({ ...encounter, biome: scene.biome })),
  );
  for (const encounter of encounters) {
    const battle = createBattle(state, encounter);
    const homes = structuredClone(battle.enemies.map((enemy) => enemy.home));
    labels.length = 0;
    drawBattle(ctx, battle, state);
    assert.equal(labels.length, battle.enemies.length, encounter.id);
    assert.deepEqual(
      battle.enemies.map((enemy) => enemy.home),
      homes,
      'rendering preserves formation',
    );
    const bodies = battle.enemies.map((enemy) => {
      const area = battle.hitAreas.find((hit) => hit.id === enemy.uid);
      // Undo targeting padding and the -50 field lift to recover art bounds.
      return { x: area.x + 5, y: area.y + 55, w: area.w - 10, h: area.h - 29 };
    });
    const panels = labels.map((label) => ({
      x: label.x - 63,
      y: label.y - 10,
      w: 126,
      h: 34,
    }));
    for (const [i, panel] of panels.entries()) {
      // Screen coordinates are (field + offset) * 1.25. Reserve the top
      // inset and stop above the command dock, allowing text pixel rounding.
      assert.ok(
        panel.y >= 59.5 && panel.y + panel.h <= 295.5,
        encounter.id + ' vertical HUD bounds',
      );
      assert.ok(
        panel.x >= 364.5 && panel.x + panel.w <= 758.5,
        encounter.id + ' horizontal HUD bounds',
      );
      for (const [j, body] of bodies.entries())
        if (i !== j)
          assert.ok(
            !overlaps(panel, body),
            `${encounter.id}: meter ${i} covers enemy ${j}`,
          );
      for (const other of panels.slice(i + 1))
        assert.ok(
          !overlaps(panel, other),
          encounter.id + ' overlapping meters',
        );
    }
    if (encounter.id === 'mire_warden') {
      assert.deepEqual(
        battle.enemies.map((enemy) => enemy.id),
        ['mire_warden', 'bog_stalker'],
      );
      assert.ok(
        bodies[0].y >= 84.5,
        'Warden crown leaves room for its health bar',
      );
      const wardenPanel = { ...labels[0] };
      battle.enemies[1].hp = 0;
      labels.length = 0;
      drawBattle(ctx, battle, state);
      assert.deepEqual(
        labels,
        [wardenPanel],
        'defeating the companion keeps the Warden meter stable',
      );
    }
    for (const [cssWidth, cssHeight, portrait] of [
      [393, 504, true],
      [320, 300, true],
      [480, 390, false],
    ]) {
      const viewport = createViewport({
        cssWidth,
        cssHeight,
        mobile: true,
        portrait,
      });
      const before = structuredClone({
        heroes: battle.heroes,
        enemies: battle.enemies,
        action: battle.action,
        clock: battle.clock,
      });
      labels.length = 0;
      drawBattle(ctx, battle, state, viewport);
      assert.deepEqual(
        {
          heroes: battle.heroes,
          enemies: battle.enemies,
          action: battle.action,
          clock: battle.clock,
        },
        before,
      );
      const width = viewport.width / 1.25,
        height = viewport.height / 1.25;
      for (const label of labels) {
        assert.ok(
          label.x >= 8 && label.x <= width - 8,
          encounter.id + ' mobile meter x',
        );
        assert.ok(
          label.y >= 28 && label.y + 24 <= height,
          encounter.id + ' mobile meter y',
        );
      }
      if (portrait && battle.enemies.length === 4) {
        const homes = mobileBattleLayout(viewport).enemies[4];
        for (let index = 0; index < 2; index++)
          assert.ok(
            Math.abs(labels[index].x - homes[index].x) < 45,
            encounter.id +
              ' rear-row mobile names remain over their own enemies',
          );
      }
      for (const actor of [...battle.heroes, ...battle.enemies].filter(
        (actor) => actor.hp > 0,
      )) {
        const hit = battle.hitAreas.find(
          (area) => area.id === (actor.uid || actor.id),
        );
        assert.ok(hit, encounter.id + ' mobile actor remains targetable');
        assert.ok(
          hit.x + hit.w > 0 &&
            hit.x < width &&
            hit.y + hit.h > 0 &&
            hit.y < height,
          encounter.id + ' mobile actor remains in the arena',
        );
      }
    }
  }
});
