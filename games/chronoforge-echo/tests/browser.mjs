import { reviewRoot } from '../scripts/review-output.mjs';
/** Production-browser verification. Fixtures only seed prerequisites and positions;
 * each assertion names whether the subsequent interaction used real keys/mouse.
 * Run npm run verify, or node tests/browser.mjs --section=ux|combat|world|showcase|route.
 */
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const section =
  process.argv.find((a) => a.startsWith('--section='))?.split('=')[1] || 'all';
const filter = process.argv
  .find((a) => a.startsWith('--filter='))
  ?.slice('--filter='.length);
const evidence = path.join(reviewRoot, 'browser');
await fs.mkdir(evidence, { recursive: true });
const executableCandidates = [
  process.env.CHROMIUM_PATH,
  path.join(
    os.homedir(),
    'Library/Caches/ms-playwright/chromium_headless_shell-1234/chrome-headless-shell-mac-arm64/chrome-headless-shell',
  ),
].filter(Boolean);
let executablePath;
for (const candidate of executableCandidates) {
  try {
    await fs.access(candidate);
    executablePath = candidate;
    break;
  } catch {
    /* Try the next installed browser candidate. */
  }
}
const browser = await chromium.launch({
  headless: true,
  ...(executablePath ? { executablePath } : {}),
});
const context = await browser.newContext({
  viewport: { width: 1920, height: 1080 },
  deviceScaleFactor: 1,
  ...(section === 'showcase'
    ? { recordVideo: { dir: evidence, size: { width: 960, height: 540 } } }
    : {}),
});
const page = await context.newPage();
// Other contributors may edit source during this run. Keep the version loaded
// at navigation stable; HMR reloads are a development facility, not game input.
await page.routeWebSocket('**/*', (socket) => {
  socket.send(JSON.stringify({ type: 'connected' }));
  socket.onMessage(() => {});
});
page.setDefaultTimeout(3500);
const report = {
  startedAt: new Date().toISOString(),
  section,
  filter,
  environment: {
    platform: process.platform,
    arch: process.arch,
    release: os.release(),
    cpu: os.cpus()[0]?.model,
    browser: await browser.version(),
    viewport: [1920, 1080],
    nativeCanvas: [960, 540],
  },
  methodology:
    'New isolated browser context with HMR disconnected to keep the loaded build stable. UX cases use actual keyboard or mouse after explicit fixture setup. This is subsystem acceptance, not a claim of a clean-save manual campaign completion.',
  checks: [],
  consoleErrors: [],
  pageErrors: [],
  missingAssets: [],
  failedRequests: [],
  documentLoads: [],
  performance: {},
  sequences: {},
};
page.on('framenavigated', (frame) => {
  if (frame === page.mainFrame())
    report.documentLoads.push({
      url: frame.url(),
      time: new Date().toISOString(),
    });
});
page.on('console', (m) => {
  if (m.type() === 'error') report.consoleErrors.push(m.text());
});
page.on('pageerror', (e) => report.pageErrors.push(e.message));
page.on('response', (r) => {
  if (r.status() >= 400)
    report.missingAssets.push({ url: r.url(), status: r.status() });
});
page.on('requestfailed', (r) =>
  report.failedRequests.push({ url: r.url(), error: r.failure()?.errorText }),
);
const snapshot = () => page.evaluate(() => window.__ECHO__.snapshot());
const fixture = async (name) =>
  page.evaluate((name) => window.__ECHO__.preset(name), name);
const press = (key) => page.keyboard.press(key);
const capture = async (name) => {
  const file = path.join(evidence, `${name}.png`);
  await page.screenshot({ path: file });
  return path.relative(root, file);
};
async function check(name, method, fn) {
  if (filter && !new RegExp(filter, 'i').test(name)) return;
  const start = performance.now();
  try {
    const details = await fn();
    report.checks.push({
      name,
      method,
      pass: true,
      milliseconds: Math.round(performance.now() - start),
      details,
    });
    console.log(`PASS ${name}`);
  } catch (error) {
    const image = await capture(
      `failure-${name.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}`,
    ).catch(() => null);
    report.checks.push({
      name,
      method,
      pass: false,
      milliseconds: Math.round(performance.now() - start),
      error: error.message,
      screenshot: image,
    });
    console.error(`FAIL ${name}: ${error.message}`);
  }
}
// Navigate with the game's real Tab handling, without DOM focus/click shortcuts.
async function keyboardTo(selector) {
  const nav = await page.evaluate((selector) => {
    const g = window.__ECHO__.game,
      list = g.ui.focusables(),
      target = document.querySelector(selector);
    const index = list.indexOf(target),
      current = list.indexOf(document.activeElement);
    return { index, current, length: list.length };
  }, selector);
  assert.ok(
    nav.index >= 0,
    `Keyboard target is visible and enabled: ${selector}`,
  );
  const count = (nav.index - nav.current + nav.length) % nav.length;
  for (let i = 0; i < count; i++) await press('Tab');
  assert.ok(
    await page.evaluate(
      (selector) => document.activeElement === document.querySelector(selector),
      selector,
    ),
    `Keyboard reached ${selector}`,
  );
}
const choose = async (action) => {
  await keyboardTo(`[data-do="${action}"]`);
  await press('Enter');
};
async function ensureMenu(tab) {
  if (!(await snapshot()).paused) await press('Escape');
  if (tab) await press(String(tab));
}
async function battleActorClick(id) {
  const area = await page.evaluate(
    (id) =>
      window.__ECHO__.game.battle.hitAreas.find(
        (a) => a.kind === 'actor' && a.id === id,
      ),
    id,
  );
  assert.ok(area, `Actor ${id} has a painted hit area`);
  await canvasClick((area.x + area.w / 2) * 1.25, (area.y + area.h / 2) * 1.25);
}
async function canvasClick(x, y) {
  const box = await page.locator('#stage canvas').boundingBox();
  await page.mouse.click(
    box.x + (x / 960) * box.width,
    box.y + (y / 540) * box.height,
  );
}
async function perf(name, duration = 1500) {
  await page.evaluate(() => {
    window.__ECHO__.game.frameTimes.length = 0;
  });
  await page.waitForTimeout(duration);
  const intervals = (await snapshot()).frameTimes
    .filter((t) => t > 0)
    .sort((a, b) => a - b);
  const mean = intervals.reduce((sum, n) => sum + n, 0) / intervals.length;
  report.performance[name] = {
    samples: intervals.length,
    meanMs: mean,
    medianMs: intervals[Math.floor(intervals.length / 2)],
    p95Ms:
      intervals[
        Math.min(intervals.length - 1, Math.floor(intervals.length * 0.95))
      ],
    maxMs: intervals.at(-1),
    meanFps: 1000 / mean,
    targetP95Ms: 20,
    meetsTarget:
      intervals[
        Math.min(intervals.length - 1, Math.floor(intervals.length * 0.95))
      ] <= 20,
  };
  return report.performance[name];
}

try {
  await page.goto(process.env.ECHO_URL || 'http://127.0.0.1:4321/?test=1');
  await page.waitForFunction(() => window.__ECHO_READY__ === true);
  report.readyAt = new Date().toISOString();
  report.startupDocumentLoads = report.documentLoads.length;
  report.assets = (await snapshot()).assets;
  if (filter) await fixture('world');

  if (section === 'all' || section === 'ux') {
    await check(
      'clean opening and all seven atlas tabs',
      'Actual keyboard from title; no progress fixture.',
      async () => {
        await press('Enter');
        assert.equal((await snapshot()).state.heroes.length, 1);
        for (let i = 0; i < 10 && (await snapshot()).panel === 'dialogue'; i++)
          await press('Enter');
        assert.equal((await snapshot()).mode, 'world');
        const opening = await capture('opening');
        await press('Escape');
        const titles = [
          'Map',
          'Party',
          'Inventory',
          'Skills',
          'Quests',
          'Save',
          'Settings',
        ];
        const screens = [];
        for (let i = 0; i < titles.length; i++) {
          await press(String(i + 1));
          assert.ok(
            (await page.locator('.tabs .active').innerText()).includes(
              titles[i],
            ),
          );
          screens.push(
            await capture(`atlas-${i + 1}-${titles[i].toLowerCase()}`),
          );
        }
        await press('q');
        assert.ok(
          (await page.locator('.tabs .active').innerText()).includes('Save'),
        );
        await press('e');
        assert.ok(
          (await page.locator('.tabs .active').innerText()).includes(
            'Settings',
          ),
        );
        return { opening, screens, tabs: titles };
      },
    );

    await check(
      'settings volume toggles and key binding',
      'Actual Tab/arrow/Enter navigation.',
      async () => {
        await ensureMenu(7);
        const before = (await snapshot()).state.settings.music;
        await keyboardTo('[data-setting="music"]');
        await press('ArrowRight');
        assert.equal(
          (await snapshot()).state.settings.music,
          Math.min(1, before + 0.1),
        );
        const oldAssist = (await snapshot()).state.settings.timingAssist;
        await choose('setting:timingAssist');
        assert.equal(
          (await snapshot()).state.settings.timingAssist,
          !oldAssist,
        );
        const oldMap = (await snapshot()).state.settings.minimap;
        await choose('setting:minimap');
        assert.equal((await snapshot()).state.settings.minimap, !oldMap);
        await choose('setting:minimap');
        await choose('rebind:up');
        await press('i');
        assert.equal((await snapshot()).state.settings.keys.up, 'i');
        await choose('rebind:up');
        await press('w');
        assert.equal((await snapshot()).state.settings.keys.up, 'w');
      },
    );

    await check(
      'map keyboard pan zoom recenter and pickup secrecy',
      'Actual map keys. A temporary fixture relocates pickups onto revealed ground; production map pixels must remain identical.',
      async () => {
        await ensureMenu(1);
        const before = await page.evaluate(() => ({
          zoom: window.__ECHO__.game.ui.map.zoom,
          panX: window.__ECHO__.game.ui.map.panX,
          x: window.__ECHO__.game.state.x,
        }));
        await press('ArrowRight');
        await press('+');
        const changed = await page.evaluate(() => ({
          zoom: window.__ECHO__.game.ui.map.zoom,
          panX: window.__ECHO__.game.ui.map.panX,
          x: window.__ECHO__.game.state.x,
        }));
        assert.ok(changed.zoom > before.zoom);
        assert.ok(changed.panX < before.panX);
        assert.equal(changed.x, before.x);
        await press('r');
        const compared = await page.evaluate(async () => {
          const g = window.__ECHO__.game,
            map = g.ui.map,
            canvas = document.querySelector('#atlas-map');
          const before = canvas.toDataURL();
          const pickups = g.scene.objects.filter((o) => o.type === 'pickup'),
            originals = pickups.map((o) => ({ o, x: o.x, y: o.y }));
          const { drawMinimap } = await import('/src/maps.js');
          const mini = document.createElement('canvas');
          drawMinimap(mini, g.scene, g.state);
          const miniBefore = mini.toDataURL();
          for (const o of pickups) {
            o.x = g.state.x;
            o.y = g.state.y;
          }
          map.draw();
          drawMinimap(mini, g.scene, g.state);
          const result = {
            atlasUnchanged: before === canvas.toDataURL(),
            minimapUnchanged: miniBefore === mini.toDataURL(),
            pickupCount: pickups.length,
            zoom: map.zoom,
            panX: map.panX,
            panY: map.panY,
          };
          for (const { o, x, y } of originals) {
            o.x = x;
            o.y = y;
          }
          map.draw();
          return result;
        });
        assert.ok(compared.pickupCount > 0);
        assert.ok(compared.atlasUnchanged && compared.minimapUnchanged);
        assert.equal(compared.zoom, 1);
        assert.equal(compared.panX, 0);
        assert.equal(compared.panY, 0);
        return compared;
      },
    );

    await check(
      'inventory equipment comparisons use unequip and skill learning',
      'Fixture adds one weapon, wounds Kaida, grants 5 skill points; all actions use keyboard.',
      async () => {
        await page.evaluate(() => {
          const g = window.__ECHO__.game;
          g.state.inventory.glacial_claw = 1;
          g.state.heroes[0].hp = 10;
          g.state.heroes[0].skillPoints = 5;
        });
        await ensureMenu(3);
        await keyboardTo('[data-do="item:glacial_claw"]');
        assert.match(
          await page
            .locator('[data-pack-item="glacial_claw"] .exp-inventory-deltas')
            .getAttribute('aria-label'),
          /Compared with Iron Blade/,
        );
        await press('Enter');
        let s = (await snapshot()).state;
        assert.equal(s.heroes[0].equip.weapon, 'glacial_claw');
        assert.equal(s.inventory.iron_blade, 1);
        await choose('unequip:weapon');
        assert.equal((await snapshot()).state.inventory.glacial_claw, 1);
        await choose('item:glacial_claw');
        const beforeTonic = (await snapshot()).state.inventory.field_tonic;
        await choose('item:field_tonic');
        await page.locator('.purchase-confirm').waitFor();
        await press('Enter');
        s = (await snapshot()).state;
        assert.equal(s.heroes[0].hp, 90);
        assert.equal(s.inventory.field_tonic, beforeTonic - 1);
        await press('4');
        await choose('learn:chrono_strike');
        s = (await snapshot()).state;
        assert.ok(s.heroes[0].skills.includes('chrono_strike'));
        assert.equal(s.heroes[0].skillPoints, 4);
        await choose('learn:chrono_strike');
        assert.equal((await snapshot()).state.heroes[0].skillPoints, 4);
      },
    );

    await check(
      'save load delete confirmation and corrupt record recovery',
      'Actual keyboard save/load/delete; fixtures change unsaved HP and create one malformed record.',
      async () => {
        await ensureMenu(6);
        await choose('save:1');
        const hp = (await snapshot()).state.heroes[0].hp;
        await page.evaluate(() => {
          window.__ECHO__.game.state.heroes[0].hp = 13;
        });
        await choose('load:1');
        assert.equal((await snapshot()).panel, 'confirm');
        await choose('confirm-no');
        assert.equal((await snapshot()).state.heroes[0].hp, 13);
        await choose('load:1');
        await choose('confirm-yes');
        assert.equal((await snapshot()).state.heroes[0].hp, hp);
        await ensureMenu(6);
        await choose('delete:1');
        await choose('confirm-no');
        assert.ok(
          await page.evaluate(() =>
            localStorage.getItem('chronforge_echo_v1:1'),
          ),
        );
        await choose('delete:1');
        await choose('confirm-yes');
        assert.equal(
          await page.evaluate(() =>
            localStorage.getItem('chronforge_echo_v1:1'),
          ),
          null,
        );
        await choose('save:2');
        await page.evaluate(() =>
          localStorage.setItem('chronforge_echo_v1:3', '{broken'),
        );
        await press('5');
        await press('6');
        assert.match(
          await page.locator('.atlas-body').innerText(),
          /Unreadable record/,
        );
        await choose('load:2');
        await choose('confirm-yes');
        assert.equal((await snapshot()).state.heroes[0].hp, hp);
        return { corruptionReported: true, healthySlotRecovered: true };
      },
    );

    await check(
      'ending dialogue and final panel survive save load',
      'A victory fixture resolves the real final-boss reward event. Actual keyboard advances dialogue, saves and loads at both stages, and chooses Return; this does not claim a manually fought final boss.',
      async () => {
        await fixture('final');
        await page.evaluate(() => {
          const g = window.__ECHO__.game;
          g.battle.encounter.id = 'void_architect';
          g.battle.result = 'victory';
          g.finishBattle();
        });
        let current = await snapshot();
        assert.equal(current.panel, 'dialogue');
        assert.ok(current.state.flags.pendingEnding);
        assert.ok(!current.state.campaignComplete);
        assert.equal(current.state.flags.ending_seen, false);
        for (let i = 0; i < 7; i++) await press('Enter');
        const dialogue = await page.evaluate(() => ({
          index: window.__ECHO__.game.ui.panel.index,
          line: window.__ECHO__.game.ui.panel.lines[
            window.__ECHO__.game.ui.panel.index
          ],
          progress: window.__ECHO__.game.state.endingProgress,
        }));
        assert.equal(dialogue.index, 7);
        assert.deepEqual(dialogue.progress, { index: 7, panel: 'dialogue' });
        await ensureMenu(6);
        await choose('save:3');
        await press('Escape');
        for (let i = 0; i < 3; i++) await press('Enter');
        assert.equal((await snapshot()).state.endingProgress.index, 10);
        await ensureMenu(6);
        await choose('load:3');
        await choose('confirm-yes');
        current = await snapshot();
        assert.equal(current.panel, 'dialogue');
        assert.ok(!current.paused);
        assert.equal(current.state.endingProgress.index, 7);
        assert.ok(!current.state.campaignComplete);
        assert.deepEqual(
          await page.evaluate(
            () =>
              window.__ECHO__.game.ui.panel.lines[
                window.__ECHO__.game.ui.panel.index
              ],
          ),
          dialogue.line,
        );
        const midway = await capture('ending-dialogue-restored');
        for (let i = 0; i < 20 && (await snapshot()).panel === 'dialogue'; i++)
          await press('Enter');
        current = await snapshot();
        assert.equal(current.panel, 'ending');
        assert.equal(current.state.endingProgress.panel, 'ending');
        assert.ok(current.state.flags.pendingEnding);
        assert.ok(!current.state.campaignComplete);
        await press('Backspace');
        assert.equal((await snapshot()).panel, 'ending');
        await ensureMenu(6);
        await choose('save:2');
        await fixture('world');
        await ensureMenu(6);
        await choose('load:2');
        await choose('confirm-yes');
        current = await snapshot();
        assert.equal(current.panel, 'ending');
        assert.equal(current.state.endingProgress.panel, 'ending');
        assert.ok(current.state.flags.pendingEnding);
        assert.ok(!current.state.campaignComplete);
        assert.ok(!current.state.flags.ending_seen);
        const finalPanel = await capture('ending-panel-restored');
        await choose('ending-continue');
        await page.waitForFunction(() => !window.__ECHO__.game.transition);
        current = await snapshot();
        assert.equal(current.state.campaignComplete, true);
        assert.equal(current.state.flags.ending_seen, true);
        assert.equal(current.state.flags.pendingEnding, false);
        assert.equal(current.state.endingProgress, undefined);
        assert.equal(current.panel, undefined);
        assert.equal(current.mode, 'world');
        assert.match(current.scene, /^haventide/);
        const checkpoint = await page.evaluate(async () =>
          (await import('/src/persistence.js')).loadState('checkpoint'),
        );
        assert.ok(checkpoint.campaignComplete);
        assert.ok(checkpoint.flags.ending_seen);
        assert.equal(checkpoint.flags.pendingEnding, false);
        return {
          dialogueIndexRestored: dialogue.index,
          dialogueLine: dialogue.line,
          completionDeferredUntilReturn: true,
          completedScene: current.scene,
          screenshots: [
            midway,
            finalPanel,
            await capture('ending-return-world'),
          ],
        };
      },
    );

    await check(
      'vendor quantity buying selling and affordability',
      'Liberated-settlement fixture; open actual provisions NPC; trade actions use keyboard.',
      async () => {
        await fixture('settlement');
        await page.evaluate(() => {
          const g = window.__ECHO__.game,
            npc = g.scene.objects.find((o) => o.service === 'provisions');
          if (!npc) throw Error('Provisions vendor missing.');
          window.__ECHO__.interact(npc.id);
        });
        assert.equal((await snapshot()).panel, 'vendor');
        await choose('qty:up');
        await choose('qty:up');
        let before = (await snapshot()).state;
        await choose('buy:field_tonic');
        await choose('confirm-yes');
        let after = (await snapshot()).state;
        assert.equal(
          after.inventory.field_tonic,
          before.inventory.field_tonic + 3,
        );
        assert.equal(after.resources.ore, before.resources.ore - 24);
        await choose('trade-mode');
        before = after;
        await choose('sell:field_tonic');
        after = (await snapshot()).state;
        assert.equal(
          after.inventory.field_tonic,
          before.inventory.field_tonic - 3,
        );
        assert.equal(after.resources.ore, before.resources.ore + 9);
        await choose('qty:down');
        assert.match(
          await page.locator('.atlas-body').innerText(),
          /Quantity 2/,
        );
        const screen = await capture('vendor-sell-quantity');
        await choose('trade-mode');
        await page.evaluate(() => {
          window.__ECHO__.game.state.resources.ore = 0;
        });
        before = (await snapshot()).state;
        await choose('buy:field_tonic');
        await choose('confirm-yes');
        after = (await snapshot()).state;
        assert.equal(after.inventory.field_tonic, before.inventory.field_tonic);
        assert.match(
          await page.locator('.notice').innerText(),
          /ore|afford|enough/i,
        );
        await press('Backspace');
        assert.equal((await snapshot()).panel, undefined);
        return { screen, bought: 3, sold: 3, insufficientFundsBlocked: true };
      },
    );

    await check(
      'construction spending production and civilization advancement',
      'Fixture supplies and beacon prerequisite; actual construction NPC and keyboard build/tier actions.',
      async () => {
        await fixture('settlement');
        await page.evaluate(() => {
          const g = window.__ECHO__.game;
          g.state.flags.beacon_restored = true;
          const npc = g.scene.objects.find((o) => o.service === 'construction');
          if (!npc) throw Error('Construction NPC missing.');
          window.__ECHO__.interact(npc.id);
        });
        const before = (await snapshot()).state.resources.ore;
        await choose('build:farm');
        let s = (await snapshot()).state;
        assert.equal(s.buildings.farm, 1);
        assert.equal(s.resources.ore, before - 18);
        await choose('build:town_center');
        assert.equal((await snapshot()).state.buildings.town_center, 2);
        await choose('tier');
        s = (await snapshot()).state;
        assert.equal(s.tier, 2);
        const screen = await capture('construction-reclaimer');
        const food = s.resources.food;
        await press('Backspace');
        await page.waitForTimeout(150);
        assert.ok((await snapshot()).state.resources.food > food);
        return { screen, tier: 2, productionObserved: true };
      },
    );
  }

  if (section === 'all' || section === 'combat') {
    await check(
      'battle keyboard targeting held-key protection and exact global pause',
      'Solo battle fixture. Actual keys through readiness, commands, target, timing window, and Esc.',
      async () => {
        await fixture('battle');
        await page.waitForFunction(
          () => window.__ECHO__.snapshot().battle?.selectedHero === 'kaida',
        );
        await press('Enter');
        assert.equal((await snapshot()).battle.mode, 'command');
        await page.keyboard.down('Enter');
        await page.keyboard.down('Enter');
        assert.equal((await snapshot()).battle.mode, 'target');
        await page.keyboard.up('Enter');
        const targetFrame = await capture('battle-target');
        await press('Escape');
        const frozen = (await snapshot()).battle;
        await page.waitForTimeout(140);
        assert.deepEqual((await snapshot()).battle, frozen);
        await press('Escape');
        assert.equal((await snapshot()).battle.mode, 'target');
        await press('Space');
        await page.waitForFunction(
          () => {
            const a = window.__ECHO__.snapshot().battle?.action;
            return a?.elapsed >= 0.49 && a.elapsed < 0.62;
          },
          null,
          { polling: 'raf' },
        );
        await press('Escape');
        const paused = (await snapshot()).battle;
        assert.ok(paused.action.elapsed < paused.action.windowEnd);
        await page.waitForTimeout(180);
        assert.deepEqual((await snapshot()).battle, paused);
        await press('Escape');
        await press('Space');
        const timing = (await snapshot()).battle.action;
        assert.equal(timing.timingAttempted, true);
        assert.equal(timing.timingSuccess, true);
        const timingFrame = await capture('battle-timing-caught');
        await page.waitForFunction(
          () => window.__ECHO__.snapshot().battle?.action?.resolved,
        );
        const resolved = (await snapshot()).battle;
        assert.ok(resolved.enemies[0].hp < resolved.enemies[0].maxHp);
        return {
          targetFrame,
          timingFrame,
          pausedElapsed: paused.action.elapsed,
          critical: resolved.action.critical,
          criticalChance: resolved.action.criticalChance,
        };
      },
    );

    await check(
      'battle mouse atlas command target and execute parity',
      'Fresh solo fixture; production accordion clicks, painted actor targeting, explicit Execute and global pause.',
      async () => {
        await fixture('battle');
        await page.waitForFunction(
          () => window.__ECHO__.snapshot().battle?.selectedHero === 'kaida',
        );
        await page.locator('[data-battle-intent=hero][data-id=kaida]').click();
        await page
          .locator('[data-battle-intent=command][data-index="0"]')
          .click();
        assert.equal((await snapshot()).battle.mode, 'target');
        assert.equal((await snapshot()).battle.action, null);
        await battleActorClick('enemy_0');
        assert.equal((await snapshot()).battle.target, 0);
        const targetFrame = await capture('battle-mouse-target-bounds');
        await page.locator('[data-battle-intent=execute]').click();
        assert.equal((await snapshot()).battle.mode, 'action');
        await page.locator('[data-battle-intent=pause]').click();
        assert.equal((await snapshot()).paused, true);
        const frozen = (await snapshot()).battle;
        await page.waitForTimeout(100);
        assert.deepEqual((await snapshot()).battle, frozen);
        await page.locator('[data-do="menu-close"]').click();
        assert.equal((await snapshot()).paused, false);
        return { targetFrame };
      },
    );

    await check(
      'four-enemy render and steady combat performance',
      'Four-enemy fixture with actual production renderer. Waiting ATB runs normally.',
      async () => {
        await fixture('battle-four');
        assert.equal((await snapshot()).battle.enemies.length, 4);
        const screen = await capture('battle-four');
        const perfResult = await perf('fourEnemyBattle');
        assert.ok(perfResult.samples >= 30);
        await page.waitForFunction(
          () => window.__ECHO__.snapshot().battle?.selectedHero,
        );
        await page.locator('[data-battle-intent=hero][data-id=kaida]').click();
        await page
          .locator('[data-battle-intent=command][data-index="0"]')
          .click();
        assert.equal((await snapshot()).battle.mode, 'target');
        await battleActorClick('enemy_3');
        assert.equal((await snapshot()).battle.target, 3);
        await battleActorClick('enemy_0');
        assert.equal((await snapshot()).battle.target, 0);
        return {
          screen,
          targetScreen: await capture('battle-four-target-bounds'),
          ...perfResult,
        };
      },
    );
  }

  if (section === 'all' || section === 'world') {
    await check(
      'party traversal followers camera and collision',
      'Party fixture; encounters marked cleared to isolate navigation. Actual held movement keys, no simulation teleport between frames.',
      async () => {
        await fixture('party');
        await page.evaluate(() => {
          const g = window.__ECHO__.game;
          for (const o of g.scene.objects)
            if (o.type === 'encounter') g.state.cleared[o.id] = true;
        });
        const frames = [];
        const frame = async (label) => {
          frames.push({
            label,
            screenshot: await capture(`followers-${label}`),
            state: await page.evaluate(async () => {
              const { isWalkable } = await import('/src/world.js'),
                g = window.__ECHO__.game;
              return {
                x: g.state.x,
                y: g.state.y,
                camera: { ...g.camera },
                followers: g.followers.map((h) => ({
                  ...h,
                  walkable: isWalkable(g.scene, h.x, h.y),
                })),
                region: g.state.region,
                native: [960, 540],
                world: [g.scene.width, g.scene.height],
              };
            }),
          });
        };
        await frame('start');
        await page.keyboard.down('Shift');
        await page.keyboard.down('ArrowRight');
        await page.waitForTimeout(700);
        await frame('stride-1');
        await page.waitForTimeout(700);
        await frame('stride-2');
        await page.waitForTimeout(700);
        await page.keyboard.up('ArrowRight');
        await page.keyboard.up('Shift');
        await frame('end');
        const first = frames[0].state,
          last = frames.at(-1).state;
        assert.ok(last.x - first.x > 300);
        assert.ok(last.camera.x - first.camera.x > 200);
        assert.equal(last.followers.length, 2);
        assert.ok(last.followers.every((h) => h.walkable));
        assert.ok(
          last.followers[0].x < last.x &&
            last.followers[1].x < last.followers[0].x,
        );
        assert.ok(last.world[0] >= 960 * 6 && last.world[1] >= 540 * 4);
        report.sequences.followers = frames;
        return {
          distance: last.x - first.x,
          cameraPan: last.camera.x - first.camera.x,
          world: last.world,
          frames: frames.map((f) => f.screenshot),
        };
      },
    );

    await check(
      'physical gateway keeps facing and places the whole party safely',
      'Fixture places crew 45 pixels before the real Haventide→Emberline gate and sets its prerequisite. Actual held key crosses threshold.',
      async () => {
        await fixture('party');
        const before = await page.evaluate(() => {
          const g = window.__ECHO__.game,
            p = g.scene.portals.find((p) => p.to === 'emberline');
          if (!p) throw Error('Regional gate missing.');
          g.state.flags.beacon_restored = true;
          g.state.x = p.x - 45;
          g.state.y = p.y;
          g.state.facing = 'right';
          g.resetFollowers();
          g.updateCamera(true);
          return {
            from: g.scene.id,
            gate: { ...p },
            start: { x: g.state.x, y: g.state.y },
          };
        });
        const frames = [
          { label: 'approach', screenshot: await capture('gateway-approach') },
        ];
        const started = performance.now();
        await page.keyboard.down('ArrowRight');
        await page.waitForFunction(
          () => window.__ECHO__.game.transition !== null,
        );
        await page.keyboard.up('ArrowRight');
        frames.push({
          label: 'threshold',
          screenshot: await capture('gateway-threshold'),
        });
        await page.waitForFunction(
          () =>
            window.__ECHO__.snapshot().scene === 'emberline' &&
            !window.__ECHO__.game.transition,
        );
        const after = await page.evaluate(async () => {
          const { isWalkable } = await import('/src/world.js'),
            g = window.__ECHO__.game;
          return {
            scene: g.scene.id,
            facing: g.state.facing,
            heroWalkable: isWalkable(g.scene, g.state.x, g.state.y),
            followers: g.followers.map((h) => ({
              ...h,
              walkable: isWalkable(g.scene, h.x, h.y),
            })),
            x: g.state.x,
            y: g.state.y,
          };
        });
        assert.equal(after.facing, 'right');
        assert.ok(
          after.heroWalkable && after.followers.every((h) => h.walkable),
        );
        frames.push({
          label: 'arrival',
          screenshot: await capture('gateway-arrival'),
        });
        report.sequences.gateway = {
          before,
          after,
          elapsedIncludingAuthoredFadeMs: Math.round(
            performance.now() - started,
          ),
          frames,
        };
        return report.sequences.gateway;
      },
    );

    await check(
      'steady world performance and measured art cache',
      'Haventide party fixture, production animation and renderer at 1080p.',
      async () => {
        await fixture('party');
        const performance = await perf('world');
        const cache = await page.evaluate(
          () =>
            window.__ECHO__.snapshot().artMetrics ||
            (typeof window.__ECHO__.artMetrics === 'function'
              ? window.__ECHO__.artMetrics()
              : {
                  available: false,
                  reason:
                    'The active renderer has not exposed cache byte counts; a second dynamic module instance would not measure its cache.',
                }),
        );
        report.performance.cache = cache;
        return { ...performance, cache };
      },
    );
  }

  if (section === 'showcase') {
    await check(
      'latest production attack choreography frame sequence',
      'Deterministic frame inspection: root renderer remains live; the authoritative battle timeline is stepped to exact poses. This section pauses between samples, then a separate real-time loop follows in the video.',
      async () => {
        await fixture('battle');
        await page.evaluate(async () => {
          window.showcaseCombat = await import('/src/combat.js');
          const g = window.__ECHO__.game;
          window.showcaseUpdate = g.update;
          g.update = () => {};
          window.showcaseCombat.updateBattle(g.battle, g.state, 1.3);
          for (let i = 0; i < 3; i++)
            window.showcaseCombat.battleKey(g.battle, g.state, 'Enter');
        });
        const frames = [];
        let last = 0;
        for (const [index, elapsed] of [
          0, 0.2, 0.42, 0.57, 0.7, 0.77, 0.9, 1.12, 1.4, 1.54,
        ].entries()) {
          await page.evaluate(
            ({ elapsed, last }) => {
              const g = window.__ECHO__.game;
              window.showcaseCombat.updateBattle(
                g.battle,
                g.state,
                elapsed - last,
              );
              if (elapsed === 0.57)
                window.showcaseCombat.battleKey(g.battle, g.state, ' ');
            },
            { elapsed, last },
          );
          last = elapsed;
          frames.push({
            elapsed,
            screenshot: await capture(
              `latest-attack-${String(index).padStart(2, '0')}`,
            ),
            state: (await snapshot()).battle,
          });
        }
        await page.evaluate(() => {
          window.__ECHO__.game.update = window.showcaseUpdate;
          delete window.showcaseUpdate;
        });
        assert.equal(frames[3].state.action.timingSuccess, true);
        assert.equal(frames[5].state.action.resolved, true);
        assert.ok(
          frames[5].state.enemies[0].hp < frames[4].state.enemies[0].hp,
        );
        report.sequences.latestAttack = frames;
        return {
          frames: frames.map((f) => ({
            elapsed: f.elapsed,
            screenshot: f.screenshot,
          })),
          normalVsCritical: frames[5].state.action.critical,
        };
      },
    );

    await check(
      'real-time solo attack showcase',
      'Actual keys with normal RAF clock and no stepped time; captured in the final portion of the video.',
      async () => {
        await fixture('battle');
        await page.waitForFunction(
          () => window.__ECHO__.snapshot().battle?.selectedHero === 'kaida',
        );
        await press('Enter');
        await press('Enter');
        await press('Enter');
        await page.waitForFunction(() => {
          const a = window.__ECHO__.snapshot().battle?.action;
          return a?.elapsed > 0.5 && a.elapsed < 0.62;
        });
        await press('Space');
        assert.equal((await snapshot()).battle.action.timingSuccess, true);
        await page.waitForTimeout(1000);
        await page.waitForFunction(
          () => !window.__ECHO__.snapshot().battle?.action,
        );
        return {
          screenshot: await capture('latest-realtime-recovery'),
          battle: (await snapshot()).battle,
        };
      },
    );
  }

  if (section === 'route') {
    await check(
      'ordinary Haventide road across multiple viewports',
      'Only prerequisites/cleared encounters are seeded. Production walkTo and Game.update run at fixed 1/60-second steps, normal Shift speed 245 pixels/second. Wall time is accelerated between rendered samples; world coordinates are never teleported along the route.',
      async () => {
        await fixture('party');
        const route = await page.evaluate(async () => {
          const g = window.__ECHO__.game;
          window.routeWorld = await import('/src/world.js');
          g.state.flags.beacon_restored = true;
          for (const o of g.scene.objects)
            if (o.type === 'encounter') g.state.cleared[o.id] = true;
          Object.assign(g.state, g.scene.spawn);
          g.resetFollowers();
          g.updateCamera(true);
          window.routeUpdate = g.update;
          g.update = () => {};
          g.keys.add('Shift');
          window.routeStats = {
            simulatedSeconds: 0,
            walkedPixels: 0,
            maximumSpeed: 0,
            steps: 0,
            collisions: [],
            transitions: [],
          };
          const gate = g.scene.portals.find((p) => p.to === 'emberline');
          return {
            start: { x: g.state.x, y: g.state.y },
            region: g.scene.id,
            dimensions: [g.scene.width, g.scene.height],
            viewport: [960, 540],
            waypoints: [
              ...g.scene.roads[0].slice(1).map((p) => ({ x: p.x, y: p.y })),
              { x: gate.x, y: gate.y },
            ],
            gate: { ...gate },
          };
        });
        const frames = [];
        const captureRoute = async (label) => {
          const state = await page.evaluate(() => {
            const g = window.__ECHO__.game;
            return {
              ...window.routeStats,
              collisions: [...window.routeStats.collisions],
              transitions: [...window.routeStats.transitions],
              region: g.scene.id,
              x: g.state.x,
              y: g.state.y,
              camera: { ...g.camera },
              facing: g.state.facing,
              followers: g.followers.map((h) => ({
                ...h,
                walkable: window.routeWorld.isWalkable(g.scene, h.x, h.y),
              })),
              remainingPathPoints: g.movePath.length,
              transition: g.transition && { ...g.transition },
            };
          });
          const screenshot = await capture(
            `route-${String(frames.length).padStart(2, '0')}-${label}`,
          );
          frames.push({ label, screenshot, ...state });
          return state;
        };
        await captureRoute('arrival');
        for (let segment = 0; segment < route.waypoints.length; segment++) {
          const target = route.waypoints[segment];
          if ((await snapshot()).scene !== 'haventide') break;
          await page.evaluate(
            (target) => window.__ECHO__.game.walkTo(target.x, target.y),
            target,
          );
          for (let batch = 0; batch < 12; batch++) {
            const result = await page.evaluate(
              ({ target }) => {
                const g = window.__ECHO__.game;
                for (let i = 0; i < 120; i++) {
                  if (g.state.region !== 'haventide' && !g.transition) break;
                  if (!g.movePath.length && !g.transition) {
                    break;
                  }
                  const x = g.state.x,
                    y = g.state.y,
                    from = g.state.region;
                  window.routeUpdate.call(g, 1 / 60);
                  window.routeStats.steps++;
                  window.routeStats.simulatedSeconds += 1 / 60;
                  if (g.state.region === from) {
                    const distance = Math.hypot(g.state.x - x, g.state.y - y);
                    window.routeStats.walkedPixels += distance;
                    window.routeStats.maximumSpeed = Math.max(
                      window.routeStats.maximumSpeed,
                      distance * 60,
                    );
                  } else
                    window.routeStats.transitions.push({
                      from,
                      to: g.state.region,
                      time: window.routeStats.simulatedSeconds,
                    });
                  if (
                    !window.routeWorld.isWalkable(g.scene, g.state.x, g.state.y)
                  )
                    window.routeStats.collisions.push({
                      who: 'kaida',
                      x: g.state.x,
                      y: g.state.y,
                      region: g.scene.id,
                    });
                  for (const h of g.followers)
                    if (!window.routeWorld.isWalkable(g.scene, h.x, h.y))
                      window.routeStats.collisions.push({
                        who: h.id,
                        x: h.x,
                        y: h.y,
                        region: g.scene.id,
                      });
                }
                return {
                  scene: g.scene.id,
                  transition: Boolean(g.transition),
                  remaining: g.movePath.length,
                  distance: Math.hypot(
                    g.state.x - target.x,
                    g.state.y - target.y,
                  ),
                  x: g.state.x,
                  y: g.state.y,
                  panel: g.ui.panel?.type,
                  mode: g.mode,
                  near: g.near?.id,
                };
              },
              { target, finalSegment: segment === route.waypoints.length - 1 },
            );
            await captureRoute(`leg-${segment + 1}-${batch + 1}`);
            if (result.scene !== 'haventide' && !result.transition) break;
            if (
              !result.remaining &&
              !result.transition &&
              result.distance < 45 &&
              segment < route.waypoints.length - 1
            )
              break;
            if (
              !result.remaining &&
              !result.transition &&
              segment === route.waypoints.length - 1 &&
              result.distance < 62
            ) {
              assert.equal(
                result.near,
                route.gate.id,
                'The final road walk reaches the real gateway interaction radius',
              );
              await press('Enter');
              continue;
            }
            assert.equal(
              result.mode,
              'world',
              `Navigation fixture unexpectedly entered ${result.mode}`,
            );
            assert.equal(
              result.panel,
              undefined,
              `Navigation fixture blocked by ${result.panel}`,
            );
            if (
              !result.remaining &&
              !result.transition &&
              result.distance >= 45
            )
              throw Error(
                `Path blocked on road leg ${segment + 1} at ${result.x},${result.y}; ${result.distance}px from waypoint.`,
              );
          }
        }
        const last = await captureRoute('emberline-arrival');
        await page.evaluate(() => {
          const g = window.__ECHO__.game;
          g.keys.clear();
          g.update = window.routeUpdate;
          delete window.routeUpdate;
        });
        const coastFrames = frames.filter((f) => f.region === 'haventide');
        const pan =
          Math.max(...coastFrames.map((f) => f.camera.x)) -
          Math.min(...coastFrames.map((f) => f.camera.x));
        report.sequences.regionalRoute = {
          route,
          frames,
          cameraPanPixels: pan,
          cameraPanViewports: pan / 960,
        };
        assert.equal(last.region, 'emberline');
        assert.ok(last.walkedPixels >= 5000);
        assert.ok(last.maximumSpeed <= 245.01);
        assert.equal(last.collisions.length, 0);
        assert.ok(pan >= 960 * 4);
        return {
          steps: last.steps,
          simulatedSeconds: last.simulatedSeconds,
          walkedPixels: last.walkedPixels,
          maximumSpeed: last.maximumSpeed,
          cameraPanPixels: pan,
          cameraPanViewports: pan / 960,
          screenshotCount: frames.length,
          transitions: last.transitions,
          collisionViolations: last.collisions.length,
        };
      },
    );
  }

  report.finalRuntimeErrors = (await snapshot()).errors;
} catch (error) {
  report.fatal = error.stack || error.message;
  console.error(report.fatal);
} finally {
  report.finishedAt = new Date().toISOString();
  report.developmentReloadDetected =
    report.documentLoads.length > (report.startupDocumentLoads || 1);
  report.passed = report.checks.filter((c) => c.pass).length;
  report.failed = report.checks.filter((c) => !c.pass).length;
  const output = path.join(
    reviewRoot,
    `browser-results-${section}${filter ? '-filtered' : ''}.json`,
  );
  const video = page.video();
  await context.close();
  if (video) report.video = path.relative(root, await video.path());
  await fs.writeFile(output, JSON.stringify(report, null, 2));
  await browser.close();
  console.log(
    JSON.stringify({
      results: path.relative(root, output),
      passed: report.passed,
      failed: report.failed,
      consoleErrors: report.consoleErrors.length,
      pageErrors: report.pageErrors.length,
      missingAssets: report.missingAssets.length,
      fatal: Boolean(report.fatal),
    }),
  );
  if (
    report.failed ||
    report.fatal ||
    report.pageErrors.length ||
    report.missingAssets.length ||
    report.consoleErrors.length
  )
    process.exitCode = 1;
}
