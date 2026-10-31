import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { Quaternion, Vector3 } from 'three';
import { createProfileStore, PROFILE_KEY } from '../src/progression/profile.js';
import { createCupStore } from '../src/race/cup.js';
import { CUP_COLLECTION_KEY } from '../src/progression/cup-collection.js';
import {
  createMemoryStorage,
  CAREER_SLOTS_KEY,
} from '../src/progression/careers.js';
import {
  createSaveTransfer,
  SAVE_BACKUP_KEY,
} from '../src/progression/save-transfer.js';
import { createRace } from '../src/race/index.js';
import { createTimeTrial, trialIdentity } from '../src/race/time-trial.js';

// Production UI and real slot lifecycle checks. No captures or exported files.
const base = process.env.VN_URL;
if (!base) throw new Error('Set VN_URL to an existing dev server.');
const flags = process.argv.slice(2);
assert.ok(
  flags.length <= 1 &&
    flags.every((flag) => ['--desktop', '--responsive'].includes(flag)),
  'Use --desktop or --responsive, or neither for both.',
);
const browser = await chromium.launch({
  headless: true,
  args: ['--mute-audio', '--autoplay-policy=no-user-gesture-required'],
  ...(process.env.VN_BROWSER_PATH
    ? { executablePath: process.env.VN_BROWSER_PATH }
    : { channel: process.env.VN_BROWSER_CHANNEL ?? 'chrome' }),
});
const url = (query = 'intro=1') => new URL(`?${query}`, base).href;
const front = (page) => page.evaluate(() => window.__VN_FRONTEND.getState());
const stage = (page, value) =>
  page.locator(`[data-entry-stage="${value}"]`).waitFor();
const frame = (page) =>
  page.evaluate(() => new Promise((resolve) => requestAnimationFrame(resolve)));

function fixture() {
  const storage = createMemoryStorage();
  const profile = createProfileStore(() => storage);
  profile.recordRace({ id: 'first', won: true });
  profile.recordRace({ id: 'second', won: true });
  profile.recordCup('founders');
  storage.setItem(
    CUP_COLLECTION_KEY,
    JSON.stringify({
      version: 1,
      cups: {
        founders: { earnedAt: 1793390000000, difficulty: 'easy', points: 75 },
      },
    }),
  );
  const cup = createCupStore(() => storage);
  cup.start('frontier', 'bastion', 'easy');
  const track = {
    id: 'entry-save-fixture',
    length: 90,
    checkpoints: [0, 30, 60].map((distance) => ({ distance })),
  };
  const identity = trialIdentity({
    track,
    ship: { id: 'shrike', version: 1 },
    version: 1,
    runtime: { id: 'entry-fixture', version: 1, rulesId: 'entry-fixture' },
  });
  const race = createRace(track, { continuous: true });
  const trial = createTimeTrial({ identity, race, store: storage });
  const pose = (distance) => ({
    position: new Vector3(distance, 0, 0),
    quaternion: new Quaternion(),
  });
  trial.capture(pose(0));
  for (let distance = 0; race.lap === 1; distance++) {
    race.step(distance, distance + 1, 0.01);
    trial.capture(pose(distance + 1), 0.01);
  }
  const transfer = createSaveTransfer({
    profileStore: profile,
    cupStore: cup,
    storage: () => storage,
  });
  const text = transfer.export();
  storage.setItem(SAVE_BACKUP_KEY, text);
  storage.setItem('vector-nova.ship', 'bastion');
  storage.setItem('vector-nova.circuit', 'glasswake');
  const entries = Object.fromEntries(
    Array.from({ length: storage.length }, (_, i) => {
      const key = storage.key(i);
      return [key, storage.getItem(key)];
    }),
  );
  assert.ok(
    Object.keys(entries).some((key) => key.startsWith('vector-nova.trial.v1.')),
  );
  return { text, entries, profile: profile.snapshot().state };
}
const saved = fixture();

async function check(name, fn, options = {}) {
  if (process.env.VN_CHECK && !new RegExp(process.env.VN_CHECK).test(name))
    return;
  const viewport = options.viewport ?? { width: 1440, height: 1000 };
  const context = await browser.newContext({
    viewport,
    hasTouch: options.touch ?? false,
    ...(options.reducedMotion ? { reducedMotion: 'reduce' } : {}),
  });
  try {
    await context.addInitScript(
      ({ entries, reducedMotion, blocked }) => {
        if (!localStorage.getItem('entry-check-seeded')) {
          for (const [key, value] of Object.entries(entries))
            localStorage.setItem(key, value);
          localStorage.setItem(
            'vector-nova.settings',
            JSON.stringify({
              quality: 'low',
              volume: 0,
              reducedMotion,
              difficulty: 'easy',
            }),
          );
          localStorage.setItem(
            'vector-nova.music',
            JSON.stringify({
              song: 'phase-shift',
              volume: 0.25,
              repeat: false,
              shuffle: false,
              collapsed: true,
            }),
          );
          localStorage.setItem('entry-check-seeded', 'true');
        }
        window.__careerReads = [];
        const get = Storage.prototype.getItem;
        Storage.prototype.getItem = function (key) {
          window.__careerReads.push(String(key));
          return get.call(this, key);
        };
        window.__entryPad = {
          id: 'Synthetic entry controller',
          index: 0,
          connected: true,
          mapping: 'standard',
          axes: [0, 0],
          buttons: Array.from({ length: 17 }, () => ({
            pressed: false,
            value: 0,
          })),
        };
        Object.defineProperty(navigator, 'getGamepads', {
          configurable: true,
          value: () => [window.__entryPad],
        });
        if (blocked)
          Object.defineProperty(window, 'localStorage', {
            configurable: true,
            get() {
              throw new DOMException('Blocked test storage', 'SecurityError');
            },
          });
      },
      {
        entries: options.oldProgress ? saved.entries : {},
        reducedMotion: options.reducedMotion === true,
        blocked: options.blocked === true,
      },
    );
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await fn(page);
    assert.deepEqual(errors, [], 'uncaught browser errors');
    console.log(`PASS ${name}`);
  } catch (error) {
    throw new Error(`${name}: ${error.message}`, { cause: error });
  } finally {
    await context.close();
  }
}
async function fits(page) {
  assert.equal(
    await page.evaluate(() => {
      const shell = document.querySelector('#front-shell');
      return (
        document.documentElement.scrollWidth <= innerWidth &&
        shell.scrollWidth <= shell.clientWidth + 1
      );
    }),
    true,
    'no horizontal clipping',
  );
  const nav = page.locator(
    '.entry-topbar button:visible, .menu-topbar .menu-top-tabs button:visible',
  );
  const targets = await nav.evaluateAll((buttons) =>
    buttons.map((button) => {
      const r = button.getBoundingClientRect();
      return (
        r.x >= 0 &&
        r.right <= innerWidth + 1 &&
        r.y >= 0 &&
        r.bottom <= innerHeight + 1 &&
        button.contains(
          document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2),
        )
      );
    }),
  );
  if (await page.locator('[data-entry-stage="intro"]').count()) {
    assert.equal(targets.length, 0, 'no tabs before Start');
    const start = page.getByRole('button', { name: 'Start', exact: true });
    assert.equal(await start.count(), 1);
    const centered = await start.evaluate((button) => {
      const rect = button.getBoundingClientRect();
      return (
        Math.abs(rect.x + rect.width / 2 - innerWidth / 2) <= 1 &&
        rect.y >= 0 &&
        rect.bottom <= innerHeight &&
        button.contains(
          document.elementFromPoint(
            rect.x + rect.width / 2,
            rect.y + rect.height / 2,
          ),
        )
      );
    });
    assert.ok(centered, 'Start is centered, visible and unobstructed');
    return;
  }
  assert.ok(
    targets.length > 0 && targets.every(Boolean),
    'top navigation fits and remains unobstructed',
  );
}
async function title(page, { focused = true } = {}) {
  await stage(page, 'intro');
  await fits(page);
  assert.equal(await page.locator('.entry-shell button:visible').count(), 1);
  if (focused)
    assert.equal(
      await page
        .getByRole('button', { name: 'Start', exact: true })
        .evaluate((button) => button === document.activeElement),
      true,
      'Start owns initial keyboard/controller focus',
    );
}
async function openTunes(page, { touch = false, current = 'settings' } = {}) {
  const opener = page.locator('.entry-topbar [data-entry-action="tunes"]');
  if (touch) await opener.tap();
  else await opener.click();
  await stage(page, current);
  assert.equal(
    await page.locator('[data-music-player][data-menu-active]').count(),
    1,
  );
  assert.ok(await page.locator('#music-controls').isVisible());
  assert.equal(
    await page
      .locator('.entry-topbar [aria-pressed="true"]')
      .getAttribute('data-entry-action'),
    current,
    'Tunes retains the selected page tab',
  );
  assert.ok((await page.locator('.music-song option').count()) > 1);
  const viewport = page.viewportSize();
  for (const selector of [
    '.music-play',
    '.music-song',
    '[aria-label="Music volume"]',
    '.music-expand',
  ]) {
    const rect = await page.locator(selector).boundingBox();
    assert.ok(
      rect &&
        rect.x >= 0 &&
        rect.x + rect.width <= viewport.width + 1 &&
        rect.y >= 0 &&
        rect.y + rect.height <= viewport.height + 1,
      `${selector} remains reachable in floating Tunes`,
    );
  }
}
async function closeTunes(page, current = 'settings') {
  await page.keyboard.press('Escape');
  await stage(page, current);
  assert.equal(
    await page.locator('[data-music-player][data-menu-active]').count(),
    0,
  );
  assert.ok(
    await page
      .locator('.entry-topbar [data-entry-action="tunes"]')
      .evaluate((button) => button === document.activeElement),
    'closing Tunes restores its opener',
  );
}
async function profiles(page, { empty = 3 } = {}) {
  await stage(page, 'profiles');
  assert.equal(await page.locator('[data-career-slot]').count(), 3);
  assert.equal(await page.locator('[data-career-slot]:disabled').count(), 0);
  assert.equal(await page.locator('.entry-profile-empty').count(), empty);
  assert.equal(
    await page.getByText('Replay intro', { exact: false }).count(),
    0,
  );
  const rows = await page.locator('[data-career-slot]').evaluateAll((cards) =>
    cards.map((card) => {
      const r = card.getBoundingClientRect();
      return { top: r.top, bottom: r.bottom, height: r.height };
    }),
  );
  assert.ok(
    rows.every((row) => row.height < 165),
    'career rows remain compact',
  );
  assert.ok(
    rows.every((row) => row.height >= 44),
    'career rows retain accessible touch targets',
  );
  assert.ok(
    rows[1].top >= rows[0].bottom && rows[2].top >= rows[1].bottom,
    'careers are vertically stacked',
  );
  if (page.viewportSize().height >= 700)
    assert.ok(
      rows.every(
        (row) => row.top >= 0 && row.bottom <= page.viewportSize().height,
      ),
      'all three compact careers fit without scrolling in portrait and desktop views',
    );
  await fits(page);
}
async function home(page, id) {
  await page.waitForFunction(
    (id) =>
      window.__VN_FRONTEND?.getState().screen === 'home' &&
      window.__VN_FRONTEND.getState().careerSlot?.id === id,
    id,
    { timeout: 60000 },
  );
  await page.waitForFunction(
    () => window.__VN_FRONTEND.getState().preload.ready === 4,
    null,
    { timeout: 60000 },
  );
  assert.equal(
    await page.locator('canvas#world').count(),
    0,
    'selection must not start a race',
  );
  await fits(page);
}
async function choose(page, id, touch = false) {
  const slot = page.locator(`[data-career-slot="${id}"]`);
  if (touch) await slot.tap();
  else await slot.click();
  await home(page, id);
}
async function switchCareer(page) {
  await page.locator('.menu-top-tabs [data-action="career"]').click();
  await page.locator('[data-switch-career]').click();
  await stage(page, 'profiles');
}
async function slotData(page) {
  return page.evaluate(async () => {
    const { createCareerSlots } = await import('/src/progression/careers.js');
    const careers = createCareerSlots();
    const slots = careers.list().map((slot) => {
      const store = careers.storageFor(slot.id);
      const entries = Object.fromEntries(
        Array.from({ length: store.length }, (_, i) => {
          const key = store.key(i);
          return [key, store.getItem(key)];
        }),
      );
      return { ...slot, entries };
    });
    return { active: careers.active()?.id ?? null, slots };
  });
}
async function pulse(page, index, pressed) {
  await page.evaluate(
    ({ index, pressed }) =>
      (window.__entryPad.buttons[index] = { pressed, value: Number(pressed) }),
    { index, pressed },
  );
  await frame(page);
  await frame(page);
}
async function importCareer(page) {
  await page.locator('.menu-top-tabs [data-action="career"]').click();
  await page.locator('[data-save-file]').setInputFiles({
    name: 'career.json',
    mimeType: 'application/json',
    buffer: Buffer.from(saved.text),
  });
  await page.locator('[data-confirm-import]').click();
  await page.waitForFunction(
    (claims) =>
      window.__VN_FRONTEND.getState().career.state.claims.length === claims,
    saved.profile.claims.length,
  );
  assert.deepEqual((await front(page)).career.state, saved.profile);
}
async function setCircuit(page, id) {
  await page.locator('.menu-top-tabs [data-action="race-tab"]').click();
  if ((await page.locator(`[data-level="${id}"]`).count()) === 0)
    await page.locator('.menu-selection[data-action="circuits"]').click();
  await page.locator(`[data-level="${id}"]`).click();
  assert.equal((await front(page)).selected, id);
}

try {
  if (!flags.includes('--responsive')) {
    await check(
      'old unscoped saves are ignored by the current three-career format',
      async (page) => {
        await page.goto(url('intro=0'));
        await profiles(page);
        const reads = await page.evaluate(() => window.__careerReads);
        assert.ok(
          !reads.some((key) => Object.hasOwn(saved.entries, key)),
          'no legacy career/ghost/backup is read',
        );
        const snapshot = await slotData(page);
        assert.equal(snapshot.active, null);
        assert.ok(snapshot.slots.every((slot) => slot.empty));
        assert.equal(
          await page.evaluate(
            (key) => localStorage.getItem(key),
            CAREER_SLOTS_KEY,
          ),
          null,
          'the picker does not manufacture or migrate a career',
        );
        const raw = await page.evaluate(
          (keys) =>
            Object.fromEntries(
              keys.map((key) => [key, localStorage.getItem(key)]),
            ),
          Object.keys(saved.entries),
        );
        assert.deepEqual(
          raw,
          saved.entries,
          'unsupported old saves remain unused, not silently migrated',
        );
      },
      { oldProgress: true },
    );

    await check(
      'startup Settings and Tunes work before selecting a career',
      async (page) => {
        await page.goto(url());
        await title(page);
        assert.equal(
          await page.locator('.music-song').inputValue(),
          'blue-hour',
        );
        await page.waitForFunction(() => {
          const audio = document.querySelector('[data-music-player] audio');
          return !audio.paused && audio.currentTime > 0.03;
        });
        assert.ok(await page.locator('.music-play').isVisible());
        await page.locator('.music-play').click();
        assert.ok(
          await page
            .locator('[data-music-player] audio')
            .evaluate((a) => a.paused),
          'music can be paused before Start',
        );
        await title(page, { focused: false });
        await page.locator('.music-play').click();
        await page.waitForFunction(
          () => !document.querySelector('[data-music-player] audio').paused,
        );
        assert.equal(
          await page.evaluate(() =>
            Object.hasOwn(
              JSON.parse(localStorage.getItem('vector-nova.music')),
              'song',
            ),
          ),
          false,
        );
        await page.evaluate(
          () =>
            (window.__sharedEntryAudio = document.querySelector(
              '[data-music-player] audio',
            )),
        );
        await page.getByRole('button', { name: 'Start', exact: true }).click();
        await profiles(page);
        assert.deepEqual(await page.locator('.entry-tab').allTextContents(), [
          'Careers',
          'Settings',
          'Tunes',
        ]);
        await page
          .locator('.entry-topbar [data-entry-action="settings"]')
          .click();
        await stage(page, 'settings');
        await page.locator('[data-setting="volume"]').focus();
        await page.keyboard.press('ArrowRight');
        assert.equal(
          await page.locator('[data-setting="volume"]').inputValue(),
          '0.05',
        );
        await openTunes(page);
        await page.locator('.music-song').selectOption('phase-shift');
        const before = await page.evaluate(
          () => window.__sharedEntryAudio.currentTime,
        );
        await page.waitForTimeout(150);
        assert.ok(
          await page.evaluate(
            (before) =>
              window.__sharedEntryAudio ===
                document.querySelector('[data-music-player] audio') &&
              !window.__sharedEntryAudio.paused &&
              window.__sharedEntryAudio.currentTime > before,
            before,
          ),
        );
        await closeTunes(page);
        await page
          .locator('.entry-topbar [data-entry-action="profiles"]')
          .click();
        await profiles(page);
        assert.equal((await slotData(page)).active, null);
        await choose(page, 1);
        assert.ok(
          await page.evaluate(
            () =>
              window.__sharedEntryAudio ===
              document.querySelector('[data-music-player] audio'),
          ),
        );
        assert.equal(
          await page.locator('.music-song').inputValue(),
          'phase-shift',
        );
        await switchCareer(page);
        assert.equal(
          await page.locator('.music-song').inputValue(),
          'phase-shift',
        );
        await page.goto(url('intro=0'));
        await home(page, 1);
        assert.equal(
          await page.locator('.music-song').inputValue(),
          'blue-hour',
        );
      },
    );

    await check(
      'startup controller can Pause before Start without advancing the title',
      async (page) => {
        await page.goto(url());
        await title(page);
        await page.waitForFunction(
          () => !document.querySelector('[data-music-player] audio').paused,
        );
        for (let index = 0; index < 12; index++) {
          if (
            await page
              .locator('.music-play')
              .evaluate((button) => button === document.activeElement)
          )
            break;
          await pulse(page, 13, true);
          await pulse(page, 13, false);
        }
        assert.ok(
          await page
            .locator('.music-play')
            .evaluate((button) => button === document.activeElement),
          'controller reaches the persistent startup music transport',
        );
        await pulse(page, 0, true);
        await pulse(page, 0, false);
        assert.ok(
          await page
            .locator('[data-music-player] audio')
            .evaluate((audio) => audio.paused),
        );
        await stage(page, 'intro');
        assert.equal((await slotData(page)).active, null);
        await pulse(page, 1, true);
        await pulse(page, 1, false);
        await title(page);
      },
    );

    await check(
      'three real careers isolate progress, cups, ghosts, backups and selections',
      async (page) => {
        await page.goto(url('intro=0&music=0'));
        await profiles(page);
        await choose(page, 1);
        assert.equal((await front(page)).career.state.claims.length, 0);
        await importCareer(page);
        await page.locator('.menu-top-tabs [data-action="garage-tab"]').click();
        await page.locator('[data-ship="bastion"]').click();
        assert.equal((await front(page)).shipId, 'bastion');
        await setCircuit(page, 'glasswake');
        await switchCareer(page);
        await profiles(page, { empty: 2 });
        assert.equal(
          await page
            .locator('[data-career-slot="1"] [role="progressbar"]')
            .getAttribute('aria-valuenow'),
          String(saved.profile.claims.length),
        );
        assert.match(
          await page.locator('[data-career-slot="1"]').textContent(),
          /Frontier Cup/,
        );
        const first = (await slotData(page)).slots[0].entries;
        assert.deepEqual(JSON.parse(first[PROFILE_KEY]), saved.profile);
        assert.ok(first[SAVE_BACKUP_KEY]);
        assert.deepEqual(
          JSON.parse(first[CUP_COLLECTION_KEY]).cups,
          JSON.parse(saved.text).trophies.cups,
        );
        assert.equal(
          Object.keys(first).filter((key) =>
            key.startsWith('vector-nova.trial.v1.'),
          ).length,
          1,
        );
        await choose(page, 2);
        let state = await front(page);
        assert.equal(state.career.state.claims.length, 0);
        assert.equal(state.shipId, 'shrike');
        assert.notEqual(
          state.selected,
          'glasswake',
          'new careers must not inherit the prior route URL',
        );
        assert.equal(state.cup.state, null);
        await setCircuit(page, 'nacre');
        await switchCareer(page);
        await choose(page, 1);
        state = await front(page);
        assert.deepEqual(state.career.state, saved.profile);
        assert.equal(state.shipId, 'bastion');
        assert.equal(state.selected, 'glasswake');
        await switchCareer(page);
        await choose(page, 3);
        assert.equal((await front(page)).career.state.claims.length, 0);
        await switchCareer(page);
        await profiles(page, { empty: 0 });
        await choose(page, 2);
        assert.equal((await front(page)).selected, 'nacre');
        const all = await slotData(page);
        assert.equal(all.active, 2);
        assert.deepEqual(
          all.slots[0].entries,
          first,
          'switches do not rewrite another career',
        );
        assert.equal(
          Object.hasOwn(all.slots[1].entries, SAVE_BACKUP_KEY),
          false,
        );
        assert.equal(
          Object.keys(all.slots[1].entries).filter((key) =>
            key.startsWith('vector-nova.trial.v1.'),
          ).length,
          0,
        );
        await page.goto(url('intro=0&music=0'));
        await home(page, 2);
        assert.equal((await front(page)).selected, 'nacre');
      },
    );

    await check(
      'selected career retains its left accent after focus leaves',
      async (page) => {
        await page.goto(url('intro=0&music=0'));
        await profiles(page);
        await choose(page, 1);
        await switchCareer(page);
        await page.mouse.move(0, 0);
        await page
          .locator('.entry-topbar [data-entry-action="profiles"]')
          .focus();
        const selected = page.locator('[data-career-slot="1"]');
        assert.equal(await selected.getAttribute('aria-pressed'), 'true');
        await page.waitForFunction(() => {
          const style = getComputedStyle(
            document.querySelector('[data-career-slot="1"]'),
          );
          return (
            style.borderLeftWidth === '2px' &&
            style.borderLeftColor === 'rgb(208, 24, 24)'
          );
        });
        assert.equal(
          await page
            .locator('[data-career-slot="2"]')
            .getAttribute('aria-pressed'),
          'false',
        );
      },
    );
    await check(
      'controller selection creates a career without cascading into a race',
      async (page) => {
        await page.goto(url('intro=1&music=0'));
        await title(page);
        await frame(page);
        await pulse(page, 0, true);
        await profiles(page);
        await page.waitForTimeout(120);
        assert.equal((await slotData(page)).active, null);
        await pulse(page, 0, false);
        await pulse(page, 13, true);
        await pulse(page, 13, false);
        assert.equal(
          await page.evaluate(() => document.activeElement.dataset.careerSlot),
          '2',
        );
        await pulse(page, 0, true);
        await home(page, 2);
        await pulse(page, 0, false);
        assert.equal(await page.locator('canvas#world').count(), 0);
      },
    );

    await check(
      'manual Start stays centered without automatic navigation',
      async (page) => {
        await page.goto(url('intro=0&music=0'));
        await profiles(page);
        await choose(page, 1);
        // A remembered/explicit circuit must not bypass Start for normal entry.
        await page.goto(url('level=glasswake&music=0'));
        await title(page);
        await page.waitForTimeout(5300);
        await title(page);
        await page.keyboard.press('Escape');
        await page.keyboard.press('KeyS');
        await page.mouse.click(4, 4);
        await title(page, { focused: false });
        await page.getByRole('button', { name: 'Start', exact: true }).focus();
        await page.keyboard.press('Enter');
        await profiles(page, { empty: 2 });
        assert.equal((await slotData(page)).active, 1);
        await page.keyboard.press('Escape');
        assert.equal(
          await page.locator('[data-entry-stage="intro"]').count(),
          0,
        );
      },
    );
    await check(
      'manual Start accepts native Space exactly once',
      async (page) => {
        await page.goto(url('intro=1&music=0'));
        await title(page);
        await page.keyboard.press('Space');
        await profiles(page);
        assert.equal((await slotData(page)).active, null);
      },
    );

    for (const reducedMotion of [false, true])
      await check(
        `title presentation respects Reduced motion ${reducedMotion}`,
        async (page) => {
          await page.goto(url('intro=1&music=0'));
          await title(page);
          await page.locator('.entry-ship-ready').waitFor({ timeout: 4500 });
          const canvas = page.locator('.entry-ship canvas');
          assert.equal(await canvas.getAttribute('tabindex'), '-1');
          assert.equal(await page.locator('.ship-preview-hint').count(), 0);
          assert.equal(
            await page
              .locator('.entry-ship .ship-preview')
              .getAttribute('data-ship'),
            'kestrel',
          );
          assert.equal(
            await page
              .locator('.entry-wordmark')
              .first()
              .evaluate((el) => getComputedStyle(el).animationName),
            reducedMotion ? 'none' : 'entry-wordmark-breathe',
          );
          assert.equal(
            await page
              .locator('.entry-ship-ready')
              .evaluate((el) => getComputedStyle(el).animationName),
            reducedMotion ? 'none' : 'entry-ship-reveal',
          );
          await page.keyboard.press('Enter');
          await profiles(page);
          assert.equal(await page.locator('.entry-ship canvas').count(), 0);
        },
        { reducedMotion },
      );

    await check(
      'unavailable career storage leaves Settings and Tunes reachable',
      async (page) => {
        await page.goto(url('intro=0'));
        await stage(page, 'profiles');
        assert.equal(
          await page.locator('[data-career-slot]:disabled').count(),
          3,
        );
        assert.match(
          await page.locator('.entry-notice').textContent(),
          /could not be read/,
        );
        await page
          .locator('.entry-topbar [data-entry-action="settings"]')
          .click();
        await stage(page, 'settings');
        await openTunes(page);
        await closeTunes(page);
        await fits(page);
      },
      { blocked: true },
    );
  }
  if (!flags.includes('--desktop')) {
    for (const viewport of [
      { width: 390, height: 844 },
      { width: 844, height: 390 },
      { width: 320, height: 700 },
      { width: 768, height: 1024 },
    ])
      await check(
        `touch career creation, early Settings and switching ${viewport.width}×${viewport.height}`,
        async (page) => {
          await page.goto(url());
          await title(page);
          await page.getByRole('button', { name: 'Start', exact: true }).tap();
          await profiles(page);
          await page
            .locator('.entry-topbar [data-entry-action="settings"]')
            .tap();
          await stage(page, 'settings');
          await fits(page);
          await openTunes(page, { touch: true });
          await closeTunes(page);
          await fits(page);
          await page
            .locator('.entry-topbar [data-entry-action="profiles"]')
            .tap();
          await profiles(page);
          await choose(page, 1, true);
          assert.equal((await front(page)).career.state.claims.length, 0);
          await switchCareer(page);
          await profiles(page, { empty: 2 });
          await choose(page, 2, true);
          assert.equal((await front(page)).careerSlot.id, 2);
          await switchCareer(page);
          await choose(page, 1, true);
          await fits(page);
          assert.equal(await page.locator('canvas#world').count(), 0);
        },
        { viewport, touch: true },
      );
  }
} finally {
  await browser.close();
}
