import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { Quaternion, Vector3 } from 'three';
import { createProfileStore, PROFILE_KEY } from '../src/progression/profile.js';
import { createCupStore } from '../src/race/cup.js';
import { CUP_COLLECTION_KEY } from '../src/progression/cup-collection.js';
import {
  createMemoryStorage,
  createCareerSlots,
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
const careerFixtureStorage = createMemoryStorage();
const careerFixture = createCareerSlots({
  storage: () => careerFixtureStorage,
  now: () => 1,
});
careerFixture.create(1);
for (const [key, value] of Object.entries(saved.entries))
  careerFixture.storageFor(1).setItem(key, value);
const careerFixtureEntries = Object.fromEntries(
  Array.from({ length: careerFixtureStorage.length }, (_, index) => {
    const key = careerFixtureStorage.key(index);
    return [key, careerFixtureStorage.getItem(key)];
  }),
);

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
        entries: options.existingCareer
          ? careerFixtureEntries
          : options.oldProgress
            ? saved.entries
            : {},
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
async function activateCareerCard(
  page,
  id,
  touch = false,
  target = 'continue',
) {
  const row = page.locator(`[data-career-id="${id}"]`);
  await row.scrollIntoViewIfNeeded();
  const point = await row.evaluate((element, target) => {
    const visual =
      target === 'name'
        ? element.querySelector('.entry-profile-title')
        : target === 'continue'
          ? element.querySelector('.entry-profile-action')
          : element;
    const rect = visual.getBoundingClientRect();
    const x = target === 'body' ? rect.right - 8 : rect.x + rect.width / 2;
    const y = target === 'body' ? rect.bottom - 8 : rect.y + rect.height / 2;
    const button = document.elementFromPoint(x, y)?.closest('button');
    return { x, y, id: button?.dataset.careerSlot };
  }, target);
  assert.equal(
    point.id,
    String(id),
    `the visible career ${target} hits its native launch button`,
  );
  if (touch) await page.touchscreen.tap(point.x, point.y);
  else await page.mouse.click(point.x, point.y);
}
async function choose(page, id, touch = false) {
  await activateCareerCard(page, id, touch);
  await home(page, id);
}
async function renameBesideLabel(label, pencil) {
  const text = await label.boundingBox();
  const button = await pencil.boundingBox();
  const glyph = await pencil.locator('svg').boundingBox();
  assert.ok(text && button && glyph);
  assert.ok(
    button.x - (text.x + text.width) >= -1 &&
      button.x - (text.x + text.width) <= 12,
    'the pencil target sits immediately beside the name',
  );
  assert.ok(
    glyph.x - (text.x + text.width) <= 28,
    'the pencil glyph stays near the name',
  );
  assert.ok(
    Math.abs(glyph.y + glyph.height / 2 - (text.y + text.height / 2)) <= 3,
    'the pencil and name share a vertical center',
  );
}
async function renameInputWidth(input, page) {
  const box = await input.boundingBox();
  assert.ok(
    box && box.width >= 48 && box.width <= 201,
    'rename input is usable and never wider than 200px',
  );
  if (page.viewportSize().width >= 900)
    assert.ok(Math.abs(box.width - 200) <= 1, 'desktop rename input is 200px');
}
async function switchCareer(page) {
  await page.locator('.menu-top-tabs [data-action="switch-career"]').click();
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

async function careerLoading(page, activation, fail = false) {
  let release;
  const gate = new Promise((resolve) => {
    release = resolve;
  });
  let moduleRequests = 0;
  await page.route('**/src/frontend/index.js*', async (route) => {
    moduleRequests++;
    await gate;
    if (fail) await route.abort('failed');
    else await route.continue();
  });
  try {
    await page.goto(url('intro=1&music=0'));
    await page.getByRole('button', { name: 'Start', exact: true }).click();
    await profiles(page, { empty: 2 });
    const selected = page.locator('[data-career-slot="1"]');
    if (activation === 'keyboard') {
      await selected.focus();
      await page.keyboard.press('Enter');
    } else if (activation === 'controller') {
      await selected.focus();
      await pulse(page, 0, true);
      await pulse(page, 0, false);
    } else
      await activateCareerCard(
        page,
        1,
        activation.startsWith('touch'),
        activation.endsWith('-name')
          ? 'name'
          : activation.endsWith('-body')
            ? 'body'
            : 'continue',
      );
    const progress = selected.locator(
      '.entry-career-loading[role="progressbar"]',
    );
    await progress.waitFor();
    assert.equal(await selected.getAttribute('aria-busy'), 'true');
    assert.match(await progress.getAttribute('aria-label'), /opening career/i);
    assert.equal(
      await progress.getAttribute('aria-valuenow'),
      null,
      'unknown module progress stays indeterminate',
    );
    await frame(page);
    await frame(page);
    const shape = await progress.evaluate((bar) => {
      const r = bar.getBoundingClientRect();
      const button = bar.closest('button').getBoundingClientRect();
      const accent = getComputedStyle(bar, '::after');
      return {
        height: r.height,
        width: r.width,
        bottom: r.bottom - button.bottom,
        color: accent.backgroundColor,
        animation: accent.animationName,
        reduced: matchMedia('(prefers-reduced-motion: reduce)').matches,
      };
    });
    assert.ok(shape.height > 0 && shape.height <= 4, JSON.stringify(shape));
    assert.ok(shape.width > 30, JSON.stringify(shape));
    assert.ok(Math.abs(shape.bottom) <= 3, JSON.stringify(shape));
    assert.equal(shape.color, 'rgb(208, 24, 24)');
    if (shape.reduced) assert.equal(shape.animation, 'none');
    else assert.notEqual(shape.animation, 'none');
    await fits(page);
    await page.evaluate(() =>
      document.querySelector('[data-career-slot="2"]').click(),
    );
    assert.equal(
      (await slotData(page)).active,
      1,
      'repeated activation cannot switch the pending career',
    );
    assert.equal(
      await page.locator('[data-career-slot][aria-busy="true"]').count(),
      1,
    );
    assert.equal(await page.locator('.entry-career-loading').count(), 1);
    release();
    if (fail) {
      await page.waitForFunction(() => {
        const notice = document.querySelector('.entry-notice');
        return (
          notice?.textContent.trim() &&
          !document.querySelector('[data-career-slot][aria-busy="true"]')
        );
      });
      assert.equal(await page.locator('.entry-career-loading').count(), 0);
      assert.equal(
        await selected.evaluate((button) => button === document.activeElement),
        true,
        'failure restores the clicked career focus',
      );
      assert.equal(await selected.isEnabled(), true);
      await profiles(page, { empty: 2 });
    } else {
      await home(page, 1);
      assert.equal(await page.locator('.entry-career-loading').count(), 0);
    }
    assert.equal(
      moduleRequests,
      1,
      'one lazy frontend request serves the pending choice',
    );
    assert.equal(await page.locator('canvas#world').count(), 0);
  } finally {
    release();
    await page.unrouteAll({ behavior: 'wait' });
  }
}

async function careerRename(page, { touch = false } = {}) {
  const activate = (locator) => (touch ? locator.tap() : locator.click());
  const primary = () => page.locator('[data-career-slot="1"]');
  const pencil = () => page.locator('[data-career-rename="1"]');
  const name = () => page.locator('[data-career-name]');
  const save = () => page.locator('[data-career-save]');
  const cancel = () => page.locator('[data-career-cancel]');
  const title = () => page.locator('[data-career-id="1"] .entry-profile-title');
  const tapPad = async (index) => {
    await pulse(page, index, true);
    await pulse(page, index, false);
  };
  const restored = async (expected) => {
    assert.equal(await name().count(), 0);
    assert.equal(await title().textContent(), expected);
    assert.equal(
      await primary().evaluate((button) => button === document.activeElement),
      true,
      'rename returns to the career launcher',
    );
    assert.equal((await slotData(page)).slots[0].name, expected);
    assert.equal(
      await page.locator('canvas#world, #game-host').count(),
      0,
      'renaming never starts a world or opens the career',
    );
  };
  const editorFits = async () => {
    await fits(page);
    for (const selector of [
      '[data-career-name]',
      '[data-career-save]',
      '[data-career-cancel]',
    ]) {
      const box = await page.locator(selector).boundingBox();
      assert.ok(
        box && box.x >= 0 && box.x + box.width <= page.viewportSize().width + 1,
        `${selector} remains within the viewport`,
      );
      assert.ok(box.height >= 32, `${selector} remains an actionable control`);
    }
  };
  await page.goto(url('intro=1'));
  await activate(page.getByRole('button', { name: 'Start', exact: true }));
  await profiles(page, { empty: 2 });
  assert.equal(
    await page.locator('[data-career-rename]').count(),
    1,
    'only started careers offer a pencil',
  );
  assert.equal(
    await page
      .locator('[data-career-rename="2"], [data-career-rename="3"]')
      .count(),
    0,
  );
  const before = await slotData(page);
  await renameBesideLabel(title(), pencil());
  assert.equal(
    await pencil().evaluate((button) => button.closest('[data-career-slot]')),
    null,
    'the pencil is not nested in the launch button',
  );
  assert.equal(
    await primary().getAttribute('aria-labelledby'),
    'entry-career-title-1 entry-career-action-1',
  );
  assert.equal(
    await primary().getAttribute('aria-describedby'),
    'entry-career-detail-1',
  );
  assert.equal(
    await primary().locator('button, input, select').count(),
    0,
    'native launch control never contains interactive descendants',
  );
  const pickerPencil = await pencil()
    .locator('svg')
    .evaluate((svg) => svg.outerHTML);
  await activate(pencil());
  assert.equal(await name().inputValue(), 'Career 1');
  assert.equal(await name().getAttribute('maxlength'), '32');
  assert.equal(
    await name().evaluate((input) => input === document.activeElement),
    true,
  );
  assert.equal(
    await pencil().count(),
    0,
    'check/cancel replace the pencil while editing',
  );
  assert.equal(await save().getAttribute('aria-label'), 'Save career name');
  assert.equal(
    await cancel().getAttribute('aria-label'),
    'Cancel career rename',
  );
  await editorFits();
  await renameInputWidth(name(), page);
  assert.equal(
    await name().evaluate((input) => input.closest('button')),
    null,
    'the text editor is never inside a button',
  );
  assert.equal(await page.locator('button button, button input').count(), 0);
  await name().fill('   ');
  await activate(save());
  assert.equal(await name().getAttribute('aria-invalid'), 'true');
  assert.match(
    await page.locator('#entry-career-notice').textContent(),
    /name|character/i,
  );
  assert.equal((await slotData(page)).slots[0].name, 'Career 1');
  await name().fill('x'.repeat(33));
  assert.ok(
    (await name().inputValue()).length <= 32,
    'native input bounds pasted names',
  );
  const escaped = 'Night <Crew> "One"';
  await name().fill('  Night   <Crew> "One"  ');
  if (touch) await activate(save());
  else await page.keyboard.press('Enter');
  await restored(escaped);
  assert.equal(
    await page.locator('[data-career-id="1"] crew').count(),
    0,
    'custom names are rendered as text',
  );
  await activate(pencil());
  await name().fill('Discard this');
  await activate(cancel());
  await restored(escaped);
  if (!touch) {
    // Pencil is a native keyboard stop; ordinary pad navigation skips it.
    await primary().focus();
    await page.keyboard.press('Tab');
    assert.equal(
      await pencil().evaluate((button) => button === document.activeElement),
      true,
    );
    await page.keyboard.press('Enter');
    await name().fill('Keyboard discard');
    await page.keyboard.press('Escape');
    await restored(escaped);
    await tapPad(13);
    assert.equal(
      await page
        .locator('[data-career-slot="2"]')
        .evaluate((button) => button === document.activeElement),
      true,
      'D-pad skips inline pencils',
    );
    await tapPad(3);
    assert.equal(
      await name().count(),
      0,
      'Y cannot rename an unstarted career',
    );
    await primary().focus();
    await tapPad(3);
    assert.equal(
      await name().evaluate((input) => input === document.activeElement),
      true,
      'Y edits the focused started career',
    );
    await name().fill('Controller discard');
    await tapPad(1);
    await restored(escaped);
    await tapPad(3);
    await name().fill('Controller discard');
    await tapPad(13);
    assert.equal(
      await save().evaluate((button) => button === document.activeElement),
      true,
      'D-pad reaches check',
    );
    await tapPad(13);
    assert.equal(
      await cancel().evaluate((button) => button === document.activeElement),
      true,
      'D-pad reaches cancel',
    );
    await tapPad(0);
    await restored(escaped);
    await tapPad(3);
    await name().fill('Pad <One>');
    await tapPad(13);
    await tapPad(0);
    await restored('Pad <One>');
  }
  if (touch) {
    await activate(pencil());
    await name().fill('A'.repeat(32));
    await activate(save());
    await restored('A'.repeat(32));
  }
  const finalName = touch ? 'A'.repeat(32) : 'Pad <One>';
  const after = await slotData(page);
  assert.deepEqual(
    after.slots.map((slot) => slot.entries),
    before.slots.map((slot) => slot.entries),
    'renaming preserves all career progress and saved loadouts',
  );
  assert.deepEqual(
    after.slots.slice(1).map((slot) => slot.name),
    ['Career 2', 'Career 3'],
  );
  await page.goto(url('intro=1'));
  await activate(page.getByRole('button', { name: 'Start', exact: true }));
  await profiles(page, { empty: 2 });
  assert.equal(
    await title().textContent(),
    finalName,
    'custom career name survives reload',
  );
  await choose(page, 1, touch);
  assert.equal((await front(page)).careerSlot.name, finalName);
  await activate(page.locator('.menu-top-tabs [data-action="career"]'));
  assert.equal(
    await page.locator('#career-page-title').textContent(),
    finalName,
    'active Career page uses the saved name',
  );
  assert.deepEqual((await front(page)).career.state, saved.profile);
  await activeCareerRename(page, {
    touch,
    initialName: finalName,
    pickerPencil,
  });
  await fits(page);
}

async function activeCareerRename(page, { touch, initialName, pickerPencil }) {
  const activate = (locator) => (touch ? locator.tap() : locator.click());
  const pencil = () =>
    page.locator('[data-progression-career] [data-career-rename]');
  const name = () =>
    page.locator('[data-progression-career] [data-career-name]');
  const save = () =>
    page.locator('[data-progression-career] [data-career-save]');
  const cancel = () =>
    page.locator('[data-progression-career] [data-career-cancel]');
  const heading = () => page.locator('#career-page-title');
  const switcher = () =>
    page.locator('.menu-top-tabs [data-action="switch-career"]');
  const tapPad = async (index) => {
    await pulse(page, index, true);
    await pulse(page, index, false);
  };
  const sameName = async (expected) => {
    assert.equal(
      (await front(page)).screen,
      'career',
      'editing stays on the Career page',
    );
    assert.equal(await name().count(), 0);
    assert.equal(await heading().textContent(), expected);
    assert.equal(
      (await front(page)).careerSlot.name,
      expected,
      'live frontend diagnostics follow header rename',
    );
    assert.equal((await slotData(page)).slots[0].name, expected);
  };
  const navFits = async () => {
    await frame(page);
    await frame(page);
    await fits(page);
    const order = await page
      .locator('.menu-top-tabs button')
      .evaluateAll((buttons) => buttons.map((button) => button.dataset.action));
    assert.equal(
      order.indexOf('switch-career'),
      order.indexOf('tunes') + 1,
      'Switch career follows Tunes',
    );
    assert.equal(
      await switcher().getAttribute('aria-pressed'),
      null,
      'Switch career is an action rather than a page tab',
    );
    assert.equal(
      await page.locator('[data-switch-career]').count(),
      0,
      'the old body switch button is removed',
    );
    const placement = await switcher().evaluate((button) => {
      const icon = button.querySelector('svg');
      const text = [...button.childNodes].find(
        (node) => node.nodeType === Node.TEXT_NODE && node.textContent.trim(),
      );
      if (!icon || !text) return null;
      const range = document.createRange();
      range.selectNodeContents(text);
      return {
        label: text.textContent.trim(),
        text: range.getBoundingClientRect().toJSON(),
        icon: icon.getBoundingClientRect().toJSON(),
      };
    });
    assert.ok(placement, 'Switch career contains its text and arrow');
    assert.equal(placement.label, 'Switch career');
    assert.ok(
      placement.icon.left >= placement.text.right - 1,
      'back arrow sits to the right of the label',
    );
  };
  const editorFits = async () => {
    await navFits();
    for (const selector of [
      '[data-career-name]',
      '[data-career-save]',
      '[data-career-cancel]',
    ]) {
      const box = await page
        .locator(`[data-progression-career] ${selector}`)
        .boundingBox();
      assert.ok(
        box && box.x >= 0 && box.x + box.width <= page.viewportSize().width + 1,
        `header ${selector} fits the viewport`,
      );
    }
  };
  const before = await slotData(page);
  await navFits();
  assert.equal(await heading().textContent(), initialName);
  await renameBesideLabel(heading(), pencil());
  assert.equal(
    await pencil()
      .locator('svg')
      .evaluate((svg) => svg.outerHTML),
    pickerPencil,
    'Career header uses the same pencil as the picker',
  );
  await activate(pencil());
  assert.equal(await name().inputValue(), initialName);
  assert.equal(await name().getAttribute('maxlength'), '32');
  assert.equal(
    await name().evaluate((input) => input === document.activeElement),
    true,
  );
  await editorFits();
  await renameInputWidth(name(), page);
  await name().fill('  ');
  await activate(save());
  assert.equal(await name().getAttribute('aria-invalid'), 'true');
  assert.equal((await slotData(page)).slots[0].name, initialName);
  await name().fill('  Bridge   <Two>  ');
  if (touch) await activate(save());
  else await page.keyboard.press('Enter');
  await sameName('Bridge <Two>');
  assert.equal(
    await page.locator('[data-progression-career] two').count(),
    0,
    'header names stay escaped',
  );
  await activate(pencil());
  await name().fill('Do not save');
  await activate(cancel());
  await sameName('Bridge <Two>');
  if (!touch) {
    await pencil().focus();
    await page.keyboard.press('Enter');
    await name().fill('Keyboard discard');
    await page.keyboard.press('Escape');
    await sameName('Bridge <Two>');
    await switcher().focus();
    await tapPad(13);
    assert.equal(
      await pencil().evaluate((button) => button === document.activeElement),
      false,
      'normal D-pad navigation skips the header pencil',
    );
    await page.locator('[data-export]').focus();
    await tapPad(3);
    assert.equal(
      await name().evaluate((input) => input === document.activeElement),
      true,
      'Y opens header rename from the Career page',
    );
    await name().fill('Controller discard');
    await tapPad(1);
    await sameName('Bridge <Two>');
    await tapPad(3);
    await name().fill('Controller discard');
    await tapPad(13);
    assert.equal(
      await save().evaluate((button) => button === document.activeElement),
      true,
    );
    await tapPad(13);
    assert.equal(
      await cancel().evaluate((button) => button === document.activeElement),
      true,
    );
    await tapPad(0);
    await sameName('Bridge <Two>');
    await tapPad(3);
    await name().fill('Header <Pilot>');
    await tapPad(13);
    await tapPad(0);
    await sameName('Header <Pilot>');
  } else {
    await activate(pencil());
    await name().fill('B'.repeat(32));
    await activate(save());
    await sameName('B'.repeat(32));
  }
  const finalName = touch ? 'B'.repeat(32) : 'Header <Pilot>';
  assert.deepEqual(
    (await slotData(page)).slots.map((slot) => slot.entries),
    before.slots.map((slot) => slot.entries),
    'header rename preserves progress in all slots',
  );
  for (const action of ['race-tab', 'garage-tab', 'settings', 'career']) {
    await activate(page.locator(`.menu-top-tabs [data-action="${action}"]`));
    await navFits();
  }
  if (touch) await activate(switcher());
  else {
    await page.locator('.menu-top-tabs [data-action="tunes"]').focus();
    await tapPad(15);
    assert.equal(
      await switcher().evaluate((button) => button === document.activeElement),
      true,
      'D-pad reaches the top-level Switch career action',
    );
    await tapPad(0);
  }
  await profiles(page, { empty: 2 });
  assert.equal(
    await page
      .locator('[data-career-id="1"] .entry-profile-title')
      .textContent(),
    finalName,
    'picker reflects the live header rename',
  );
  assert.equal(
    await page
      .locator('[data-career-slot="1"]')
      .evaluate((button) => button === document.activeElement),
    true,
    'Switch career returns focus to the active slot',
  );
  await page.goto(url('intro=1'));
  await activate(page.getByRole('button', { name: 'Start', exact: true }));
  await profiles(page, { empty: 2 });
  assert.equal(
    await page
      .locator('[data-career-id="1"] .entry-profile-title')
      .textContent(),
    finalName,
    'header rename survives reload',
  );
  await choose(page, 1, touch);
  await activate(page.locator('.menu-top-tabs [data-action="career"]'));
  await sameName(finalName);
  await navFits();
}

async function startWordmark(
  page,
  activation,
  reduced = false,
  { withMusic = false } = {},
) {
  await page.addInitScript(() => {
    const animate = Element.prototype.animate;
    const bounds = (element) => {
      const range = document.createRange();
      range.selectNodeContents(element);
      return range.getBoundingClientRect().toJSON();
    };
    window.__startWordmarkCalls = [];
    Element.prototype.animate = function (frames, options) {
      const target = this.matches('.entry-topbar .entry-wordmark');
      const natural = target ? bounds(this) : null;
      const animation = animate.call(this, frames, options);
      if (target) {
        animation.pause();
        animation.currentTime = 0;
        window.__startWordmarkCalls.push({
          animation,
          element: this,
          natural,
          frames,
          options,
        });
      }
      return animation;
    };
  });
  await page.goto(url(withMusic ? 'intro=1' : 'intro=1&music=0'));
  await title(page);
  const origin = await page
    .locator('.entry-intro .entry-wordmark')
    .evaluate((element) => {
      const range = document.createRange();
      range.selectNodeContents(element);
      return range.getBoundingClientRect().toJSON();
    });
  if (activation === 'controller') {
    await pulse(page, 0, true);
    await frame(page);
    await frame(page);
    await pulse(page, 0, false);
  } else if (activation === 'keyboard') await page.keyboard.press('Enter');
  else if (activation === 'space') await page.keyboard.press('Space');
  else if (activation === 'touch')
    await page.getByRole('button', { name: 'Start', exact: true }).tap();
  else await page.getByRole('button', { name: 'Start', exact: true }).click();
  await stage(page, 'profiles');
  assert.equal(
    await page.locator('[data-career-slot]').count(),
    3,
    'career controls render without waiting for the fly animation',
  );
  assert.equal(
    (await slotData(page)).active,
    null,
    'Start activates exactly once without selecting a career',
  );
  assert.equal(
    await page
      .locator('[data-entry-stage="intro"], #game-host, canvas#world')
      .count(),
    0,
  );
  if (reduced) {
    assert.equal(
      await page.evaluate(() => window.__startWordmarkCalls.length),
      0,
      'Reduced motion skips the fly animation',
    );
    await profiles(page);
    return;
  }
  const animation = await page.evaluate(() => {
    const calls = window.__startWordmarkCalls;
    if (calls.length !== 1) return { count: calls.length };
    const { animation, element, natural } = calls[0];
    const glyph = () => {
      const range = document.createRange();
      range.selectNodeContents(element);
      return range.getBoundingClientRect().toJSON();
    };
    const row = document.querySelector('[data-career-slot="1"]');
    const firstRow = row.getBoundingClientRect().toJSON();
    const samples = [0, 110, 220].map((time) => {
      animation.currentTime = time;
      return {
        glyph: glyph(),
        row: row.getBoundingClientRect().toJSON(),
        horizontal: document.documentElement.scrollWidth - innerWidth,
      };
    });
    animation.currentTime = 0;
    return {
      count: calls.length,
      duration: animation.effect.getTiming().duration,
      listed: element.getAnimations().includes(animation),
      natural,
      firstRow,
      samples,
    };
  });
  assert.equal(
    animation.count,
    1,
    'one Start activation produces one wordmark fly',
  );
  assert.equal(
    animation.duration,
    220,
    'wordmark uses the existing short transition duration',
  );
  assert.equal(animation.listed, true);
  const close = (actual, expected, label) =>
    assert.ok(
      Math.abs(actual - expected) <= 3,
      `${label}: ${actual} versus ${expected}`,
    );
  for (const key of ['left', 'top', 'width', 'height']) {
    close(
      animation.samples[0].glyph[key],
      origin[key],
      `wordmark starts at title ${key}`,
    );
    close(
      animation.samples[2].glyph[key],
      animation.natural[key],
      `wordmark ends at header ${key}`,
    );
  }
  for (const { glyph, row, horizontal } of animation.samples) {
    close(
      row.top,
      animation.firstRow.top,
      'the fly does not shift career layout',
    );
    close(
      row.height,
      animation.firstRow.height,
      'the fly does not resize career rows',
    );
    assert.ok(
      glyph.left >= -3 && glyph.right <= page.viewportSize().width + 3,
      'wordmark stays inside the viewport throughout the fly',
    );
    assert.ok(horizontal <= 1, 'wordmark fly causes no horizontal overflow');
  }
  await page.evaluate(async () => {
    const { animation } = window.__startWordmarkCalls[0];
    animation.play();
    await animation.finished;
  });
  const final = await page
    .locator('.entry-topbar .entry-wordmark')
    .evaluate((element) => {
      const range = document.createRange();
      range.selectNodeContents(element);
      return range.getBoundingClientRect().toJSON();
    });
  for (const key of ['left', 'top', 'width', 'height'])
    close(
      final[key],
      animation.natural[key],
      `finished wordmark retains natural header ${key}`,
    );
  assert.equal((await slotData(page)).active, null);
  await profiles(page);
}

async function headerWordmarkContinuity(page) {
  const viewport = page.viewportSize();
  const touch = viewport.width < 760 || viewport.height < 500;
  await startWordmark(page, touch ? 'touch' : 'keyboard', false, {
    withMusic: true,
  });
  const measure = (selector) =>
    page.locator(selector).evaluate((element) => {
      const range = document.createRange();
      range.selectNodeContents(element);
      const glyph = range.getBoundingClientRect();
      const style = getComputedStyle(element);
      return {
        left: glyph.left,
        top: glyph.top,
        width: glyph.width,
        height: glyph.height,
        font: style.font,
        spacing: style.letterSpacing,
      };
    });
  const sameGlyph = (actual, expected, label) => {
    for (const key of ['left', 'top', 'width', 'height'])
      assert.ok(
        Math.abs(actual[key] - expected[key]) <= 0.1,
        `${label} ${key}: ${actual[key]} versus ${expected[key]}`,
      );
    assert.equal(actual.font, expected.font, `${label} typography`);
    assert.equal(actual.spacing, expected.spacing, `${label} letter spacing`);
  };
  const picker = await measure('.entry-topbar .entry-wordmark');
  const flight = await page.evaluate(
    () => window.__startWordmarkCalls[0].natural,
  );
  for (const key of ['left', 'top', 'width', 'height'])
    assert.ok(
      Math.abs(picker[key] - flight[key]) <= 0.1,
      `Start flight ends at the stable picker ${key}`,
    );
  await choose(page, 1, touch);
  sameGlyph(
    await measure('.menu-topbar .menu-wordmark'),
    picker,
    'career picker to Race',
  );
  await switchCareer(page);
  await profiles(page, { empty: 2 });
  sameGlyph(
    await measure('.entry-topbar .entry-wordmark'),
    picker,
    'Race back to career picker',
  );
  assert.equal(
    await page
      .locator('[data-career-slot="1"]')
      .evaluate((button) => button === document.activeElement),
    true,
    'returning retains the active career focus',
  );
  assert.equal(await page.locator('canvas#world').count(), 0);
}

try {
  for (const viewport of [
    ...(!flags.includes('--responsive')
      ? [
          { width: 1440, height: 900 },
          { width: 1920, height: 1080 },
          { width: 1024, height: 900 },
        ]
      : []),
    ...(!flags.includes('--desktop')
      ? [
          { width: 390, height: 844 },
          { width: 320, height: 700 },
          { width: 844, height: 390 },
        ]
      : []),
  ])
    await check(
      `header wordmark stays anchored through career switching ${viewport.width}×${viewport.height}`,
      headerWordmarkContinuity,
      { viewport, touch: viewport.width < 760 || viewport.height < 500 },
    );
  if (!flags.includes('--responsive')) {
    for (const activation of ['mouse', 'keyboard', 'space', 'controller'])
      await check(`Start wordmark fly through ${activation}`, (page) =>
        startWordmark(page, activation),
      );
    await check(
      'Start wordmark skips fly with Reduced motion',
      (page) => startWordmark(page, 'keyboard', true),
      { reducedMotion: true },
    );
  }
  if (!flags.includes('--desktop'))
    for (const viewport of [
      { width: 390, height: 844 },
      { width: 320, height: 700 },
      { width: 844, height: 390 },
    ])
      await check(
        `Start wordmark fly in touch ${viewport.width}×${viewport.height}`,
        (page) => startWordmark(page, 'touch'),
        { viewport, touch: true },
      );
  if (!flags.includes('--responsive'))
    await check(
      'career rename pointer, keyboard, controller and persistence',
      (page) => careerRename(page),
      { existingCareer: true },
    );
  if (!flags.includes('--desktop'))
    for (const viewport of [
      { width: 390, height: 844 },
      { width: 320, height: 700 },
      { width: 844, height: 390 },
    ])
      await check(
        `career rename touch ${viewport.width}×${viewport.height}`,
        (page) => careerRename(page, { touch: true }),
        { existingCareer: true, viewport, touch: true, reducedMotion: true },
      );
  if (!flags.includes('--responsive')) {
    await check(
      'career cache reuses parsed ships and decoder across career switches',
      async (page) => {
        const requests = [];
        let workers = 0;
        page.on('request', (request) => {
          if (/\/assets\/ships\/(?:.*\.glb|decoder\/)/.test(request.url()))
            requests.push(request.url());
        });
        page.on('worker', () => workers++);
        await page.goto(url('intro=0&music=0'));
        await home(page, 1);
        const first = await front(page);
        await page.evaluate(async () => {
          const { SHIPS } = await import('/src/ships/catalog.js');
          const { loadShipModel } = await import('/src/ships/model-cache.js');
          window.__careerCacheModels = await Promise.all(
            SHIPS.map((ship) => loadShipModel(ship.id)),
          );
          window.__careerSourceDisposals = 0;
          const resources = new Set();
          for (const model of window.__careerCacheModels)
            model.traverse((object) => {
              if (object.geometry) resources.add(object.geometry);
              for (const material of [object.material].flat()) {
                if (!material) continue;
                resources.add(material);
                for (const value of Object.values(material))
                  if (value?.isTexture) resources.add(value);
              }
            });
          for (const resource of resources)
            resource.addEventListener(
              'dispose',
              () => window.__careerSourceDisposals++,
            );
        });
        await page.locator('.menu-top-tabs [data-action="garage-tab"]').click();
        await page.waitForFunction(
          () => window.__VN_FRONTEND.getState().preview?.selected === 'bastion',
        );
        await page.locator('.ship-preview canvas').evaluate((canvas) => {
          window.__careerPreviewCanvas = canvas;
          window.__careerPreviewContext = canvas.getContext('webgl2');
        });
        const initialRequests = requests.length;
        const initialWorkers = workers;
        assert.equal(
          requests.filter((url) => /\.glb(?:\?|$)/.test(url)).length,
          4,
          'the initial fleet is loaded once',
        );
        for (const id of [2, 1]) {
          await switchCareer(page);
          assert.equal(
            await page
              .locator('.ship-preview, #game-host, canvas#world')
              .count(),
            0,
            'career selection retains no preview renderer or race world',
          );
          await page.waitForFunction(() =>
            window.__careerPreviewContext.isContextLost(),
          );
          assert.equal(
            await page.evaluate(() => window.__careerPreviewCanvas.isConnected),
            false,
          );
          const cache = await page.evaluate(async () => {
            const { SHIPS } = await import('/src/ships/catalog.js');
            const { loadShipModel, subscribeShipCache } =
              await import('/src/ships/model-cache.js');
            let status;
            const unsubscribe = subscribeShipCache((next) => {
              status = next;
            });
            unsubscribe();
            const same = (
              await Promise.all(SHIPS.map((ship) => loadShipModel(ship.id)))
            ).every(
              (model, index) => model === window.__careerCacheModels[index],
            );
            return { status, same, disposed: window.__careerSourceDisposals };
          });
          assert.equal(
            cache.status.ready,
            4,
            'all parsed sources remain ready in the career picker',
          );
          assert.equal(cache.status.loading, false);
          assert.deepEqual(cache.status.failed, []);
          assert.equal(
            cache.same,
            true,
            'the same parsed objects survive each career',
          );
          assert.equal(
            cache.disposed,
            0,
            'per-career cleanup never disposes cached source resources',
          );
          await choose(page, id);
          assert.equal(
            requests.length,
            initialRequests,
            'no ship GLB or decoder is fetched again',
          );
          assert.equal(
            workers,
            initialWorkers,
            'career switches reuse existing texture decoder workers',
          );
          const current = await front(page);
          if (id === 2) {
            assert.equal(current.career.state.claims.length, 0);
            assert.equal(current.shipId, 'shrike');
            assert.notEqual(
              current.selected,
              first.selected,
              'new career does not inherit selected route',
            );
          } else {
            assert.deepEqual(current.career.state, first.career.state);
            assert.equal(current.shipId, first.shipId);
            assert.equal(current.selected, first.selected);
          }
        }
      },
      { existingCareer: true },
    );
    for (const activation of [
      'mouse-name',
      'mouse-body',
      'mouse-continue',
      'keyboard',
      'controller',
    ])
      await check(
        `career loading feedback through ${activation}`,
        (page) => careerLoading(page, activation),
        { existingCareer: true },
      );
    await check(
      'career loading failure restores the clicked slot',
      (page) => careerLoading(page, 'keyboard', true),
      { existingCareer: true },
    );
  }
  if (!flags.includes('--desktop')) {
    for (const viewport of [
      { width: 390, height: 844 },
      { width: 320, height: 700 },
      { width: 844, height: 390 },
    ])
      await check(
        `career loading feedback in touch ${viewport.width}×${viewport.height}`,
        (page) =>
          careerLoading(
            page,
            viewport.width === 390
              ? 'touch-name'
              : viewport.width === 320
                ? 'touch-continue'
                : 'touch-body',
          ),
        { existingCareer: true, viewport, touch: true, reducedMotion: true },
      );
  }
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
          '0.01',
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
            .locator('[data-career-id="1"] [role="progressbar"]')
            .getAttribute('aria-valuenow'),
          String(saved.profile.claims.length),
        );
        assert.match(
          await page.locator('[data-career-id="1"]').textContent(),
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
