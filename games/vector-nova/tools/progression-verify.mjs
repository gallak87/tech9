import { CAREER_VERSION } from '../src/progression/profile.js';
import { DEVICE_PREVIEWS } from '../src/ships/pickup-preview-sequence.js';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
const base = process.env.VN_URL;
if (!base) throw new Error('Set VN_URL to a running browser build.');
const responsive = process.argv.includes('--responsive');
const browser = await chromium.launch({
  args: ['--mute-audio'],
  channel: process.env.VN_BROWSER_CHANNEL ?? 'chrome',
  headless: true,
});
async function check(name, fn) {
  if (responsive !== name.startsWith('responsive ')) return;
  if (process.env.VN_CHECK && !new RegExp(process.env.VN_CHECK).test(name))
    return;
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    hasTouch: responsive,
  });
  try {
    await context.addInitScript(() => {
      localStorage.setItem(
        'vector-nova.settings',
        JSON.stringify({ quality: 'low', volume: 0, reducedMotion: true }),
      );
      window.testPad = {
        id: 'verification',
        index: 0,
        mapping: 'standard',
        connected: true,
        axes: [0, 0, 0, 0],
        buttons: Array.from({ length: 17 }, () => ({
          value: 0,
          pressed: false,
        })),
      };
      Object.defineProperty(navigator, 'getGamepads', {
        value: () => [window.testPad],
      });
    });
    const page = await context.newPage(),
      errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await fn(page);
    assert.deepEqual(errors, [], 'no browser exceptions');
    console.log(`PASS ${name}`);
  } finally {
    await context.close();
  }
}
const open = async (page, query) => {
  await page.goto(new URL(`?${query}`, base).href);
  await page.waitForFunction(() => window.__VN_FRONTEND);
};
const action = (page, name) =>
  page.locator(`[data-action="${name}"]`).first().click();
const state = (page) => page.evaluate(() => window.__VN_FRONTEND.getState());
async function launch(page) {
  await action(page, 'launch');
  await page.waitForFunction(
    () =>
      window.__VN?.ready && window.__VN_FRONTEND.getState().screen === 'race',
    null,
    { timeout: 90000 },
  );
}
async function key(page, code) {
  await page.keyboard.down(code);
  await page.waitForTimeout(100);
  await page.keyboard.up(code);
}
async function pad(page, index) {
  for (const pressed of [true, false]) {
    await page.evaluate(
      ({ index, pressed }) => {
        window.testPad.buttons[index] = { pressed, value: Number(pressed) };
        return new Promise((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(resolve)),
        );
      },
      { index, pressed },
    );
  }
}

try {
  await check(
    'developer inspector shortcut restores AI racers and sound/effect auditions in both modes',
    async (page) => {
      await page.addInitScript(() => {
        const settings = JSON.parse(
          localStorage.getItem('vector-nova.settings'),
        );
        localStorage.setItem(
          'vector-nova.settings',
          JSON.stringify({ ...settings, volume: 0.35 }),
        );
      });
      for (const query of ['', 'dev=0', 'dev=true']) {
        await open(page, query);
        assert.equal(await page.locator('[data-action="inspect"]').count(), 0);
      }
      for (const mode of ['1', '2']) {
        await open(page, `dev=${mode}`);
        assert.equal(
          await page
            .locator('.menu-extras [data-action="inspect"]')
            .innerText(),
          'Ship inspector',
        );
        await page.locator('[data-action="records"]').focus();
        if (mode === '1') await key(page, 'ArrowDown');
        else await pad(page, 13);
        assert.equal(
          await page.evaluate(() => document.activeElement.dataset.action),
          'inspect',
        );
        if (mode === '1') await key(page, 'Enter');
        else await pad(page, 0);
        await page.waitForFunction(() => window.__VN_INSPECTOR?.ready, null, {
          timeout: 90000,
        });
        assert.equal(await page.locator('#inspector-equipment').count(), 0);
        assert.equal(
          await page.locator('.inspection-pickups:visible').count(),
          1,
        );
        assert.equal(
          await page.locator('#inspection-pickup option').count(),
          DEVICE_PREVIEWS.length,
        );
        await page.locator('#inspection-fleet-tab').focus();
        await key(page, 'ArrowRight');
        await page.waitForFunction(
          () =>
            window.__VN_INSPECTOR.getSnapshot().inspection.tab === 'rivals' &&
            !window.__VN_INSPECTOR.getSnapshot().inspection.rivalLoading,
        );
        assert.equal(await page.locator('[data-rival]').count(), 9);
        await page.locator('[data-rival="rook"]').focus();
        await key(page, 'End');
        await page.waitForFunction(
          () =>
            window.__VN_INSPECTOR.getSnapshot().inspection.rivalId ===
              'gannet' &&
            !window.__VN_INSPECTOR.getSnapshot().inspection.rivalLoading,
        );
        await page.locator('#inspection-rivals-tab').focus();
        await pad(page, 14);
        assert.equal(
          await page.evaluate(
            () => window.__VN_INSPECTOR.getSnapshot().inspection.tab,
          ),
          'fleet',
        );
        await page.locator('input[data-engine]').check();
        await page.locator('[data-preview="boost"]').focus();
        await key(page, 'Enter');
        assert.equal(
          await page.evaluate(
            () => window.__VN_INSPECTOR.getSnapshot().inspection.preview.boost,
          ),
          true,
        );
        const status = page.locator('.inspection-pickups [role="status"]');
        for (const { id: kind } of DEVICE_PREVIEWS) {
          await page.locator('#inspection-pickup').selectOption(kind);
          await page.locator('[data-trigger]').click();
          await page.waitForFunction(() =>
            document
              .querySelector('.inspection-pickups [role="status"]')
              .textContent.match(/^(Playing|Demo)/),
          );
          await page.waitForTimeout(
            kind === 'arc' || kind === 'repulsor' ? 1800 : 300,
          );
          const demonstration = await page.evaluate(
            () => window.__VN_INSPECTOR.getSnapshot().inspection.demonstration,
          );
          if (kind === 'jump' || kind === 'stabilizer')
            assert.ok(demonstration.position[1] > 2, `${kind} lifts the hull`);
          if (kind === 'slipstream')
            assert.ok(demonstration.target[2] < 27.5, 'the gap visibly closes');
          if (kind === 'injector') {
            await page.waitForFunction(
              () => document.querySelector('[data-reserve] meter').value === 70,
            );
            assert.equal(
              await page.locator('[data-reserve]:visible').count(),
              1,
            );
          }
          await page.locator('[data-stop]').click();
          assert.equal(await status.innerText(), 'Ready');
          assert.deepEqual(
            await page.evaluate(
              () =>
                window.__VN_INSPECTOR.getSnapshot().inspection.demonstration
                  .position,
            ),
            [0, 0, 0],
          );
        }
        await page.locator('#inspection-pickup').selectOption('arc');
        await page.locator('[data-shield]').check();
        await page.locator('[data-trigger]').focus();
        await key(page, 'Enter');
        await page.waitForFunction(() =>
          document
            .querySelector('.inspection-pickups [role="status"]')
            .textContent.includes('shielded'),
        );
        await page.locator('[data-stop]').focus();
        await pad(page, 0);
        assert.equal(await status.innerText(), 'Ready');
        await page.locator('#inspection-pickup').selectOption('lance');
        await page.locator('[data-trigger]').focus();
        await pad(page, 0);
        await page.waitForFunction(() =>
          document
            .querySelector('.inspection-pickups [role="status"]')
            .textContent.includes('shielded'),
        );
        await page.locator('[data-stop]').focus();
        await key(page, 'Enter');
        const sounds = page.locator('[data-sound-panel]');
        assert.equal(
          await page.locator('#inspection-tools [data-sound-panel]').count(),
          1,
        );
        assert.equal(
          await sounds.count(),
          1,
          'Sounds is available in both developer modes',
        );
        for (const cue of [
          'jump-activate',
          'jump-land',
          'injector-activate',
          'slipstream-activate',
          'deflector-activate',
          'stabilizer-activate',
          'lance-fire',
          'lance-hit',
        ]) {
          await page.locator('#sound-picker').selectOption(cue);
          await page.locator('#sound-picker').focus();
          await key(page, 'Tab');
          if (mode === '1') await key(page, 'Enter');
          else await pad(page, 0);
          await page.waitForFunction(
            () =>
              document.querySelector('[data-sound-panel] [role="status"]')
                .textContent === 'Playing',
          );
        }
        await page.locator('#sound-picker').focus();
        const selectedSound = await page.locator('#sound-picker').inputValue();
        await pad(page, 14);
        assert.notEqual(
          await page.locator('#sound-picker').inputValue(),
          selectedSound,
        );
        assert.equal(
          await sounds.locator('[role="status"]').innerText(),
          'Ready',
        );
        await page.locator('input[data-engine]').uncheck();
        assert.equal(
          await page.evaluate(() => !!window.__VN),
          false,
          'the inspector never starts a race',
        );
        if (mode === '1') {
          await page.locator('#sound-picker').focus();
          await key(page, 'Escape');
        } else await pad(page, 1);
        assert.equal((await state(page)).screen, 'home');
        assert.equal(
          await page.evaluate(() => document.activeElement.dataset.action),
          'inspect',
        );
        assert.equal(await page.locator('#inspector-host').count(), 0);
        await page.locator('[data-action="garage-tab"]').focus();
        if (mode === '1') await key(page, 'Enter');
        else await pad(page, 0);
        assert.equal(
          await page.locator('.dedicated-garage:visible').count(),
          1,
        );
        await page.locator('[data-action="race-tab"]').focus();
        if (mode === '1') await key(page, 'Enter');
        else await pad(page, 0);
        assert.equal((await state(page)).screen, 'home');
      }
    },
  );
  await check(
    'mode and records navigation preserve the original menu frame',
    async (page) => {
      await open(page, 'dev=2');
      const bounds = () => page.locator('.mode-picker').boundingBox();
      const original = await bounds();
      for (const mode of [
        'cup-hub',
        'time-trial',
        'practice',
        'quick-race',
        'records',
      ]) {
        await action(page, mode);
        const current = await bounds();
        assert.deepEqual(
          current,
          original,
          `${mode} keeps mode navigation fixed`,
        );
        assert.ok(await page.locator('.menu-backdrop canvas:visible').count());
      }
    },
  );
  await check(
    'responsive loading and reward results keep actions reachable',
    async (page) => {
      await page.setViewportSize({ width: 390, height: 844 });
      await open(page, 'dev=1&finish=1&place=4');
      await action(page, 'launch');
      await page.waitForSelector('.loading-rewards');
      assert.equal(
        await page.locator('.loading-rewards .reward-badge').count(),
        2,
      );
      assert.equal(
        await page.evaluate(
          () => document.documentElement.scrollWidth > innerWidth,
        ),
        false,
      );
      await page.waitForFunction(
        () => window.__VN_FRONTEND.getState().screen === 'results',
        null,
        { timeout: 90000 },
      );
      for (const [width, height] of [
        [390, 844],
        [844, 390],
        [320, 740],
      ]) {
        await page.setViewportSize({ width, height });
        const bounds = await page.evaluate(() => {
          const panel = document
            .querySelector('.result-panel')
            .getBoundingClientRect();
          const cards = [
            ...document.querySelectorAll(
              '.result-panel .reward-badge, .result-panel .earned-reward',
            ),
          ];
          return {
            overflow: document.documentElement.scrollWidth > innerWidth,
            contained: cards.every((card) => {
              const b = card.getBoundingClientRect();
              return b.left >= panel.left && b.right <= panel.right;
            }),
          };
        });
        assert.equal(
          bounds.overflow,
          false,
          `${width}: results fit horizontally`,
        );
        assert.equal(
          bounds.contained,
          true,
          `${width}: reward cards remain inside results`,
        );
        await page.locator('[data-action="change"]').scrollIntoViewIfNeeded();
        const button = await page
          .locator('[data-action="change"]')
          .boundingBox();
        assert.ok(
          button.y >= 0 && button.y + button.height <= height,
          `${width}: race actions can be reached`,
        );
      }
      await action(page, 'change');
      assert.equal((await state(page)).career.state.points, 2);
    },
  );
  await check(
    'responsive reward badges fit the hero and keep navigation reachable',
    async (page) => {
      for (const [width, height] of [
        [390, 844],
        [844, 390],
        [320, 740],
      ]) {
        await page.setViewportSize({ width, height });
        for (const mode of ['quick-race', 'cup-hub', 'time-trial']) {
          await open(page, 'dev=1');
          await action(page, mode);
          await action(page, 'circuits');
          const geometry = await page.evaluate(() => {
            const hero = document.querySelector('.cup-art-hero, .detail-image');
            const image = hero.getBoundingClientRect();
            const badges = hero
              .querySelector('.reward-badges')
              .getBoundingClientRect();
            const title = hero.querySelector('h2').getBoundingClientRect();
            const cards = [...hero.querySelectorAll('.reward-badge')];
            return {
              contained:
                badges.left >= image.left &&
                badges.right <= image.right &&
                (badges.bottom < title.top - 6 ||
                  badges.top > title.bottom + 6) &&
                badges.top >= image.top &&
                badges.bottom <= image.bottom,
              overflow: document.documentElement.scrollWidth > innerWidth,
              textClipped: cards.some((c) => c.scrollWidth > c.clientWidth + 1),
            };
          });
          assert.equal(
            geometry.contained,
            true,
            `${width} ${mode}: badges remain inside the artwork without covering its title`,
          );
          assert.equal(geometry.overflow, false);
          assert.equal(geometry.textClipped, false);
          await key(page, 'Escape');
          assert.ok(
            await page.locator('[data-action="garage-tab"]').isVisible(),
          );
        }
      }
    },
  );
  await check(
    'compact reward icons expose details through keyboard and controller',
    async (page) => {
      await open(page, 'dev=1');
      assert.equal(
        await page.locator('.reward-tooltip:not([hidden])').count(),
        0,
      );
      const chips = page.locator('.detail-image .reward-chip');
      assert.ok(
        await chips.evaluateAll((items) =>
          items.every(
            (item) => item.clientHeight <= 40 && item.clientWidth < 190,
          ),
        ),
      );
      await page.waitForFunction(() =>
        [...document.querySelectorAll('.reward-chip img')].every(
          (img) => img.complete && img.naturalWidth === 128,
        ),
      );
      for (const controller of [false, true]) {
        await page.locator('[data-level="halcyon"]').focus();
        if (controller) await pad(page, 12);
        else await key(page, 'ArrowUp');
        assert.equal(
          await page.evaluate(() => document.activeElement.dataset.rewardInfo),
          'speed-1',
        );
        if (controller) await pad(page, 0);
        else await key(page, 'Enter');
        assert.match(
          await page.locator('.reward-tooltip:not([hidden])').innerText(),
          /Complete your first valid race/,
        );
        const screen = (await state(page)).screen;
        if (controller) await pad(page, 1);
        else await key(page, 'Escape');
        assert.equal(
          await page.locator('.reward-tooltip:not([hidden])').count(),
          0,
        );
        assert.equal((await state(page)).screen, screen);
        assert.equal(
          await page.evaluate(() => document.activeElement.dataset.rewardInfo),
          'speed-1',
        );
        if (controller) await pad(page, 15);
        else await key(page, 'ArrowRight');
        assert.equal(
          await page.evaluate(() => document.activeElement.dataset.rewardInfo),
          'speed-2',
        );
        if (controller) await pad(page, 13);
        else await key(page, 'ArrowDown');
        assert.equal(
          await page.evaluate(() => document.activeElement.dataset.level),
          'halcyon',
        );
      }
      await chips.first().hover();
      assert.equal(
        await page.locator('.reward-tooltip:not([hidden])').count(),
        1,
      );
      await page.mouse.move(10, 10);
      assert.equal(
        await page.locator('.reward-tooltip:not([hidden])').count(),
        0,
      );
      await action(page, 'cup-hub');
      for (const controller of [false, true]) {
        await page.locator('[data-cup="founders"]').focus();
        if (controller) await pad(page, 12);
        else await key(page, 'ArrowUp');
        assert.equal(
          await page.evaluate(() => document.activeElement.dataset.rewardInfo),
          'cup-founders',
        );
        if (controller) await pad(page, 13);
        else await key(page, 'ArrowDown');
        assert.equal(
          await page.evaluate(() => document.activeElement.dataset.cup),
          'founders',
        );
      }
      const art = await page.evaluate(async () => {
        const { REWARDS } = await import('/src/progression/catalog.js');
        const { rewardIcon } = await import('/src/progression/view.js');
        return Promise.all(
          REWARDS.map(async (reward) => {
            const box = document.createElement('div');
            box.innerHTML = rewardIcon(reward.id);
            const img = box.firstChild;
            try {
              await img.decode();
              return { id: reward.id, width: img.naturalWidth, src: img.src };
            } catch {
              return { id: reward.id, width: 0 };
            }
          }),
        );
      });
      assert.equal(art.length, 28);
      assert.equal(new Set(art.map((item) => item.src)).size, 28);
      assert.ok(
        art.every((item) => item.width === 128),
        JSON.stringify(art.filter((item) => item.width !== 128)),
      );
      await open(page, 'dev=2');
      await action(page, 'garage-tab');
      await page.waitForFunction(() =>
        [...document.querySelectorAll('.garage-equipment-card img')].every(
          (img) => img.complete && img.naturalWidth === 128,
        ),
      );
      assert.equal(await page.locator('.garage-equipment-card img').count(), 6);
      await action(page, 'race-tab');
      await action(page, 'cup-hub');
      for (const controller of [false, true]) {
        await page.locator('[data-cup="founders"]').focus();
        if (controller) await pad(page, 12);
        else await key(page, 'ArrowUp');
        assert.equal(
          await page.evaluate(() => document.activeElement.dataset.action),
          'race-tab',
        );
      }
    },
  );
  await check(
    'reward hero badges follow mode and fourth-place finishes advance rewards',
    async (page) => {
      await open(page, 'dev=1&finish=1&place=4');
      assert.equal(
        await page.locator('.detail-image .reward-badge').count(),
        2,
      );
      assert.match(
        await page.locator('.detail-image .reward-badges').innerText(),
        /Stat: Speed I/,
      );
      await page.locator('[data-action="cup-hub"]').focus();
      await key(page, 'Enter');
      assert.match(
        await page.locator('.cup-hero .reward-badges').innerText(),
        /Cup: Ship \+ equipment/,
      );
      assert.ok(
        !/Bastion|Deflector/.test(
          await page.locator('.cup-hero .reward-badges').innerText(),
        ),
      );
      await page.locator('[data-action="time-trial"]').focus();
      await pad(page, 0);
      await page.locator('.detail-image .reward-chip').first().focus();
      assert.match(
        await page
          .locator('.detail-image .reward-tooltip:not([hidden])')
          .innerText(),
        /Set a clean record here/,
      );
      await action(page, 'practice');
      assert.equal(
        await page.locator('.detail-image .reward-badges').count(),
        0,
      );
      await action(page, 'quick-race');
      await page.locator('[data-action="launch"]').focus();
      await pad(page, 0);
      await page.waitForFunction(
        () => window.__VN_FRONTEND.getState().screen === 'loading',
      );
      assert.match(
        await page.locator('.loading-rewards').textContent(),
        /Complete your first valid race/,
      );
      await page.waitForFunction(
        () => window.__VN_FRONTEND.getState().screen === 'results',
        null,
        { timeout: 90000 },
      );
      let career = (await state(page)).career.state;
      assert.equal(career.points, 2);
      assert.equal(career.wins, 0);
      assert.equal(career.finishes, 1);
      assert.deepEqual(career.claims, ['speed-1']);
      assert.match(
        await page.locator('.race-reward-progress').innerText(),
        /\+2 race progress/,
      );
      await page.evaluate(() => window.__VN.showResults());
      assert.equal((await state(page)).career.state.points, 2);
      for (let i = 2; i <= 4; i++) {
        await action(page, 'retry-race');
        await page.waitForFunction(
          (finishes) =>
            window.__VN_FRONTEND.getState().career.state.finishes === finishes,
          i,
          { timeout: 15000 },
        );
      }
      career = (await state(page)).career.state;
      assert.equal(career.points, 8);
      assert.ok(career.claims.includes('equipment-jump'));
      await page.locator('[data-action="change"]').focus();
      await pad(page, 0);
      await page.locator('[data-action="garage-tab"]').focus();
      await key(page, 'Enter');
      assert.equal(await page.locator('[data-equip="jump"]').count(), 1);
      await page.locator('[data-equip="jump"]').focus();
      await pad(page, 0);
      assert.equal((await state(page)).career.state.loadouts.shrike[0], 'jump');
      await page.locator('[data-action="race-tab"]').focus();
      await key(page, 'Enter');
      assert.equal(
        await page.locator('.detail-image .reward-badge').count(),
        2,
      );
      assert.equal(
        await page.evaluate(() =>
          localStorage.getItem('vector-nova.career.v1'),
        ),
        null,
      );
    },
  );
  await check('quick win and retry rewards stay idempotent', async (page) => {
    await open(page, 'dev=1&finish=1');
    await launch(page);
    await page.keyboard.down('ArrowUp');
    await page.waitForFunction(
      () => window.__VN_FRONTEND.getState().screen === 'results',
      null,
      { timeout: 15000 },
    );
    await page.keyboard.up('ArrowUp');
    assert.deepEqual((await state(page)).career.state.claims, ['speed-1']);
    await page.evaluate(() => window.__VN.showResults());
    assert.equal((await state(page)).career.state.wins, 1);
    await action(page, 'retry-race');
    await page.waitForFunction(
      () => window.__VN_FRONTEND.getState().career.state.wins === 2,
      null,
      { timeout: 15000 },
    );
    assert.deepEqual((await state(page)).career.state.claims, [
      'speed-1',
      'speed-2',
      'acceleration-1',
      'boost-1',
      'equipment-jump',
    ]);
    assert.equal(
      await page.evaluate(() => localStorage.getItem('vector-nova.career.v1')),
      null,
      'developer wins stay isolated',
    );
  });
  await check(
    'final cup event awards ship and equipment through normal results',
    async (page) => {
      await open(page, 'dev=1&cup=founders&event=final&finish=1');
      await action(page, 'cup-hub');
      await page.locator('.race-actions .primary').click();
      await page.waitForFunction(
        () => window.__VN_FRONTEND.getState().screen === 'results',
        null,
        { timeout: 90000 },
      );
      const saved = (await state(page)).career.state;
      assert.ok(saved.claims.includes('ship-bastion'));
      assert.ok(saved.claims.includes('equipment-deflector'));
      assert.equal(saved.cups.length, 1);
      assert.ok((await state(page)).cupCollection.cups.founders);
      assert.equal(await page.locator('.cup-victory').count(), 1);
      assert.equal(
        await page.evaluate(() => document.activeElement.dataset.action),
        'cup-standings',
      );
      await pad(page, 0);
      assert.equal(await page.locator('.cup-victory').count(), 0);
      assert.ok(await page.locator('.earned-rewards').count());
      await page.locator('[data-action="equipment"]').focus();
      await pad(page, 0);
      assert.equal(
        (await state(page)).screen,
        'setup',
        'controller opens the between-race garage',
      );
      await page.locator('[data-equip="deflector"]').focus();
      await pad(page, 0);
      assert.equal(
        (await state(page)).career.state.loadouts.shrike[0],
        'deflector',
      );
    },
  );
  await check(
    'stock Time Trial record grants a distinct-map milestone',
    async (page) => {
      await open(page, 'dev=1&ship=shrike&upgrades=1&finish=1');
      await action(page, 'time-trial');
      await launch(page);
      assert.equal(
        await page.evaluate(
          () => window.__VN.getSnapshot().vehicle.enhancements,
        ),
        undefined,
      );
      assert.equal(await page.locator('.equipment-hud:visible').count(), 0);
      await page.waitForFunction(
        () =>
          window.__VN_FRONTEND.getState().career.state.trialTracks.length === 1,
        null,
        { timeout: 15000 },
      );
      assert.ok((await state(page)).career.state.claims.includes('boost-2'));
      await key(page, 'Escape');
      await page.locator('#home').click();
      await action(page, 'circuits');
      await page.locator('[data-level="orbital"]').click();
      await launch(page);
      await page.waitForFunction(
        () =>
          window.__VN_FRONTEND.getState().career.state.trialTracks.length === 2,
        null,
        { timeout: 15000 },
      );
      assert.ok((await state(page)).career.state.claims.includes('boost-3'));
      await key(page, 'Escape');
      await page.locator('#home').click();
      await action(page, 'records');
      assert.equal(await page.locator('.records-list > li').count(), 2);
    },
  );
  await check(
    'all six abilities use real controls and keep road devices active',
    async (page) => {
      await open(page, 'dev=2&ship=shrike&equipment=jump,injector');
      await launch(page);
      await page.evaluate(() =>
        window.__VN.devSetup({ distance: 20, speed: 80, energy: 20 }),
      );
      await key(page, 'q');
      assert.equal(
        await page.evaluate(() => window.__VN.getSnapshot().runtime.state.mode),
        'flight',
      );
      await pad(page, 3);
      assert.ok(
        await page.evaluate(
          () =>
            window.__VN.getSnapshot().runtime.state.equipment.slots[1]
              .remaining > 0,
        ),
      );
      await page.waitForFunction(
        () => window.__VN.getSnapshot().runtime.state.mode === 'magnetic',
        null,
        { timeout: 7000 },
      );
      assert.ok(
        await page.evaluate(() =>
          window.__VN
            .getSnapshot()
            .events.some(
              (e) =>
                e.type === 'jump-transfer' && e.payload.outcome === 'landed',
            ),
        ),
      );
      for (const pair of ['slipstream,lance', 'deflector,stabilizer']) {
        await open(page, `dev=2&ship=shrike&equipment=${pair}`);
        await launch(page);
        await page.evaluate(() =>
          window.__VN.devSetup({ distance: 20, speed: 80, rivalAhead: true }),
        );
        await page.waitForTimeout(150);
        await pad(page, 2);
        await key(page, 'e');
        assert.ok(
          await page.evaluate(() =>
            window.__VN
              .getSnapshot()
              .runtime.state.equipment.slots.filter(Boolean)
              .every((slot) => slot.remaining > 0),
          ),
          pair,
        );
        await page.waitForTimeout(800);
        assert.ok(
          await page.evaluate(() =>
            window.__VN
              .getSnapshot()
              .events.some((e) => e.type === 'pickup-activate'),
          ),
          'road pickups remain alongside equipment',
        );
      }
    },
  );
  await check(
    'Jump and Stabilizer activate during an authored transfer',
    async (page) => {
      await open(
        page,
        'dev=2&ship=shrike&level=saffron&equipment=jump,stabilizer',
      );
      await action(page, 'practice');
      await launch(page);
      await page.evaluate(() => {
        const jump = window.__VN
          .getTrack()
          .jumps.find((entry) => !entry.optional);
        window.__VN.devSetup({ distance: jump.takeoff - 15, speed: 140 });
      });
      await page.keyboard.down('ArrowUp');
      await page.waitForFunction(
        () => window.__VN.getSnapshot().runtime.state.mode === 'flight',
        null,
        { timeout: 10000 },
      );
      await key(page, 'q');
      await key(page, 'e');
      assert.ok(
        await page.evaluate(() =>
          window.__VN
            .getSnapshot()
            .runtime.state.equipment.slots.filter(Boolean)
            .every((slot) => slot.remaining > 0),
        ),
      );
      assert.ok(
        await page.evaluate(
          () =>
            window.__VN.getSnapshot().runtime.state.flight.equipmentGraceUntil >
            0,
        ),
      );
      await page.waitForTimeout(800);
      assert.equal(
        await page.evaluate(() => window.__VN.getSnapshot().runtime.state.mode),
        'flight',
      );
    },
  );
  await check(
    'Race/Garage tabs, inline equipment, keyboard/controller and save round trip',
    async (page) => {
      await open(page, 'dev=2&ship=kestrel');
      const before = await state(page);
      const tabs = await page.locator('.menu-top-tabs').boundingBox();
      await action(page, 'ship-step');
      assert.deepEqual(
        await page.locator('.menu-top-tabs').boundingBox(),
        tabs,
      );
      assert.equal(
        await page
          .locator('[data-action="garage-back"], [data-action="use-ship"]')
          .count(),
        0,
      );
      await page.waitForFunction(
        () =>
          document.querySelector('.ship-preview')?.dataset.state === 'ready',
      );
      assert.equal(await page.locator('.garage-fleet img').count(), 4);
      assert.equal(await page.locator('.garage-equipment-card').count(), 6);
      assert.equal(await page.locator('dialog[open]').count(), 0);
      await key(page, 'ArrowUp');
      assert.equal(
        await page.evaluate(() => document.activeElement.dataset.ship),
        'needle',
      );
      assert.equal(
        (await state(page)).shipId,
        'kestrel',
        'browsing does not commit a hull',
      );
      assert.equal(
        (await state(page)).loadedId,
        before.loadedId,
        'browsing does not construct a level',
      );
      await pad(page, 15);
      assert.equal(
        await page.evaluate(() => document.activeElement.dataset.equip),
        'jump',
      );
      await page.locator('[data-equip="lance"]').focus();
      await pad(page, 0);
      assert.deepEqual((await state(page)).career.state.loadouts.needle, [
        'jump',
        'injector',
        null,
        null,
      ]);
      assert.match(
        await page.locator('.garage-notice').innerText(),
        /2 equipped/,
      );
      await page.locator('[data-equip="injector"]').focus();
      await key(page, 'Enter');
      await page.locator('[data-equip="lance"]').focus();
      await pad(page, 0);
      assert.deepEqual((await state(page)).career.state.loadouts.needle, [
        'jump',
        'lance',
        null,
        null,
      ]);
      assert.equal(
        await page.evaluate(() => document.activeElement.dataset.equip),
        'lance',
      );
      await pad(page, 1);
      assert.equal((await state(page)).screen, 'home');
      assert.equal((await state(page)).shipId, 'kestrel');
      assert.equal(
        await page.evaluate(() => document.activeElement.dataset.action),
        'ship-step',
      );
      await key(page, 'Enter');
      await page.locator('[data-ship="needle"]').focus();
      await pad(page, 0);
      await page.locator('[data-action="race-tab"]').focus();
      await pad(page, 0);
      assert.equal((await state(page)).shipId, 'needle');
      await page.locator('[data-action="race-tab"]').focus();
      await key(page, 'ArrowRight');
      await key(page, 'Enter');
      assert.equal((await state(page)).screen, 'setup');
      await pad(page, 14);
      await pad(page, 0);
      assert.equal((await state(page)).screen, 'home');
      await action(page, 'career');
      const download = page.waitForEvent('download');
      await page.locator('[data-export]').focus();
      await pad(page, 0);
      const stream = await (await download).createReadStream();
      const chunks = [];
      for await (const chunk of stream) chunks.push(chunk);
      const bytes = Buffer.concat(chunks),
        saved = JSON.parse(bytes);
      assert.equal(saved.profile.version, CAREER_VERSION);
      assert.equal(Object.keys(saved.trophies.cups).length, 4);
      assert.ok('cup' in saved && Array.isArray(saved.trials));
      await page.locator('[data-save-file]').setInputFiles({
        name: 'save.json',
        mimeType: 'application/json',
        buffer: bytes,
      });
      assert.equal(
        await page.evaluate(() =>
          document.activeElement.hasAttribute('data-cancel'),
        ),
        true,
      );
      await pad(page, 15);
      assert.equal(
        await page.evaluate(() =>
          document.activeElement.hasAttribute('data-confirm-import'),
        ),
        true,
      );
      await pad(page, 0);
      assert.deepEqual((await state(page)).career.state.loadouts.needle, [
        'jump',
        'lance',
        null,
        null,
      ]);
      await key(page, 'Escape');
      await action(page, 'inspect');
      await page.waitForFunction(() => window.__VN_INSPECTOR?.ready, null, {
        timeout: 90000,
      });
      assert.equal(
        await page
          .locator('#inspection-panel .performance-stat:visible')
          .count(),
        6,
      );
      assert.equal(
        await page.locator('#inspection-panel .stat-notch:visible').count(),
        18,
      );
      await page.locator('#inspect-back').focus();
      await key(page, 'Enter');
      await action(page, 'garage-tab');
      assert.equal(await page.locator('.dedicated-garage:visible').count(), 1);
    },
  );
  await check(
    'Quad Core controller confirmation assigns four items to exactly one hull',
    async (page) => {
      await open(page, 'dev=2');
      await page.evaluate(() => {
        const profile = window.__VN_FRONTEND.getState().career.state;
        profile.exoticShip = null;
        for (const slots of Object.values(profile.loadouts)) {
          slots[2] = null;
          slots[3] = null;
        }
        localStorage.setItem('vector-nova.career.v1', JSON.stringify(profile));
      });
      await open(page, 'dev=1&ship=shrike');
      await action(page, 'ship-step');
      await page.locator('[data-action="fit-exotic"]').focus();
      await pad(page, 0);
      assert.equal(
        await page.evaluate(() =>
          document.activeElement.hasAttribute('data-cancel'),
        ),
        true,
      );
      await pad(page, 1);
      assert.equal((await state(page)).career.state.exoticShip, null);
      assert.equal(await page.locator('dialog[open]').count(), 0);
      assert.equal(
        await page.evaluate(() => document.activeElement.dataset.action),
        'fit-exotic',
      );
      await pad(page, 0);
      await page.locator('[data-confirm-exotic]').focus();
      await pad(page, 0);
      assert.equal((await state(page)).career.state.exoticShip, 'shrike');
      assert.equal(
        await page.evaluate(() => document.activeElement.dataset.action),
        'garage-tab',
      );
      for (const id of ['deflector', 'lance']) {
        await page.locator(`[data-equip="${id}"]`).focus();
        await pad(page, 0);
      }
      assert.deepEqual((await state(page)).career.state.loadouts.shrike, [
        'jump',
        'injector',
        'deflector',
        'lance',
      ]);
      await page.locator('[data-equip="stabilizer"]').click();
      assert.match(
        await page.locator('.garage-notice').innerText(),
        /4 equipped/,
      );
      await page.locator('[data-ship="kestrel"]').click();
      assert.equal(await page.locator('[data-action="fit-exotic"]').count(), 0);
      assert.match(
        await page.locator('.garage-equipment-heading').innerText(),
        /2 \/ 2 equipped/,
      );
    },
  );
  await check(
    'four equipped abilities activate through keyboard and standard controller in a race',
    async (page) => {
      for (const input of ['keyboard', 'controller']) {
        await open(
          page,
          'dev=2&ship=kestrel&equipment=jump,injector,deflector,lance',
        );
        await launch(page);
        await page.evaluate(() =>
          window.__VN.devSetup({
            distance: 20,
            speed: 80,
            energy: 20,
            rivalAhead: true,
          }),
        );
        await page.waitForTimeout(150);
        if (input === 'keyboard')
          for (const code of ['x', 'z', 'e', 'q']) await key(page, code);
        else for (const button of [15, 14, 3, 2]) await pad(page, button);
        assert.equal(await page.locator('.equipment-hud-slot').count(), 4);
        assert.ok(
          await page.evaluate(() =>
            window.__VN
              .getSnapshot()
              .runtime.state.equipment.slots.filter(Boolean)
              .every((slot) => slot.remaining > 0),
          ),
          input,
        );
        assert.ok(
          await page.evaluate(() =>
            ['jump', 'injector', 'deflector', 'lance'].every((kind) =>
              window.__VN
                .getSnapshot()
                .events.some(
                  (event) =>
                    event.type === 'equipment-activate' &&
                    event.payload.kind === kind,
                ),
            ),
          ),
        );
      }
    },
  );
  await check(
    'stock rules and a between-event garage preserve the championship hull',
    async (page) => {
      await open(page, 'dev=2&ship=shrike');
      await action(page, 'time-trial');
      await action(page, 'ship-step');
      assert.equal(
        await page.locator('.garage-equipment-card:enabled').count(),
        0,
      );
      assert.equal(await page.locator('.stat-notch').count(), 0);
      await key(page, 'Escape');
      await action(page, 'quick-race');
      await action(page, 'ship-step');
      assert.equal(
        await page.locator('.garage-equipment-card:enabled').count(),
        6,
      );
      await open(page, 'dev=2&ship=shrike&cup=founders&event=final');
      await action(page, 'cup-hub');
      await action(page, 'ship-step');
      await page.locator('[data-ship="needle"]').click();
      assert.equal((await state(page)).shipId, 'shrike');
      assert.equal(
        await page.locator('.garage-equipment-card:enabled').count(),
        0,
      );
      await page.locator('[data-ship="shrike"]').click();
      await page.locator('[data-equip="lance"]').click();
      await page.locator('[data-equip="stabilizer"]').click();
      await action(page, 'race-tab');
      assert.equal((await state(page)).shipId, 'shrike');
      await page.locator('.race-actions .primary').click();
      await page.waitForFunction(
        () =>
          window.__VN?.ready &&
          window.__VN_FRONTEND.getState().screen === 'race',
        null,
        { timeout: 90000 },
      );
      assert.deepEqual(
        await page.evaluate(() =>
          window.__VN
            .getSnapshot()
            .runtime.state.equipment.slots.map((slot) => slot?.id),
        ),
        ['jump', 'injector', 'deflector', 'stabilizer'],
      );
    },
  );
  await check(
    'desktop picker stays composed at compact and large desktop sizes',
    async (page) => {
      for (const [width, height] of [
        [1280, 720],
        [1440, 1000],
      ]) {
        await page.setViewportSize({ width, height });
        await open(page, 'dev=2&ship=kestrel');
        await action(page, 'ship-step');
        await page.waitForFunction(
          () =>
            document.querySelector('.ship-preview')?.dataset.state === 'ready',
        );
        assert.equal(
          await page.evaluate(
            () =>
              document.querySelector('#front-shell').scrollWidth > innerWidth,
          ),
          false,
        );
        assert.equal(
          await page.evaluate(
            () =>
              getComputedStyle(
                document.querySelector('.garage-fleet'),
              ).gridTemplateColumns.split(' ').length,
          ),
          1,
        );
        for (const selector of [
          '.garage-fleet',
          '.garage-equipment-grid',
          '.garage-footer',
        ]) {
          assert.ok(
            await page
              .locator(selector)
              .evaluate((el) => el.scrollWidth <= el.clientWidth + 1),
          );
        }
        await page.locator('[data-action="race-tab"]').focus();
        assert.ok(
          await page.locator('[data-action="race-tab"]').evaluate((el) => {
            const r = el.getBoundingClientRect();
            return r.top >= 0 && r.bottom <= innerHeight;
          }),
        );
      }
    },
  );
  await check(
    'undiscovered ships and equipment stay out of the garage and inspector',
    async (page) => {
      await open(page, '');
      await action(page, 'garage-tab');
      assert.deepEqual(
        await page
          .locator('.garage-fleet [data-ship]')
          .evaluateAll((items) => items.map((item) => item.dataset.ship)),
        ['shrike'],
      );
      assert.equal(await page.locator('.garage-equipment-card').count(), 0);
      assert.equal(
        await page.locator('.garage-equipment-empty:visible').count(),
        1,
      );
      assert.equal(
        await page
          .locator(
            '.garage-ship-status:visible, .garage-equipment-hint:visible, .garage-footer:visible',
          )
          .count(),
        0,
      );
      await page.locator('.garage-fleet [data-ship="shrike"]').focus();
      await key(page, 'ArrowRight');
      assert.equal(
        await page.evaluate(() => document.activeElement.dataset.action),
        'race-tab',
      );
      await key(page, 'ArrowDown');
      await pad(page, 15);
      assert.equal(
        await page.evaluate(() => document.activeElement.dataset.action),
        'race-tab',
      );
      await pad(page, 0);
      assert.equal((await state(page)).screen, 'home');
      assert.equal(await page.locator('.menu-picker .picker-tabs').count(), 0);
      await page.locator('[data-level="halcyon"]').focus();
      await key(page, 'ArrowUp');
      assert.equal(
        await page.evaluate(() => document.activeElement.dataset.rewardInfo),
        'speed-1',
      );
      await open(page, 'inspect=1');
      await page.waitForFunction(() => window.__VN_INSPECTOR?.ready, null, {
        timeout: 90000,
      });
      assert.deepEqual(
        await page
          .locator('#inspection-panel [data-ship]')
          .evaluateAll((items) => items.map((item) => item.dataset.ship)),
        ['shrike'],
      );
      await page.locator('#inspection-panel [data-ship="shrike"]').focus();
      await key(page, 'ArrowRight');
      assert.equal(
        await page.evaluate(() => document.activeElement.dataset.ship),
        'shrike',
      );
      assert.equal(await page.locator('#inspector-equipment').count(), 0);
      await page.locator('#inspect-back').focus();
      await pad(page, 0);
      assert.equal((await state(page)).screen, 'home');
      await page.locator('[data-action="garage-tab"]').focus();
      await pad(page, 0);
      assert.equal(await page.locator('.garage-fleet [data-ship]').count(), 1);
      await open(page, 'dev=1&ship=bastion&equipment=deflector');
      await action(page, 'garage-tab');
      assert.deepEqual(
        await page
          .locator('.garage-fleet [data-ship]')
          .evaluateAll((items) => items.map((item) => item.dataset.ship)),
        ['shrike', 'bastion'],
      );
      assert.deepEqual(
        await page
          .locator('.garage-equipment-card')
          .evaluateAll((items) => items.map((item) => item.dataset.equip)),
        ['deflector'],
      );
      await page.locator('.garage-fleet [data-ship="bastion"]').focus();
      await pad(page, 15);
      assert.equal(
        await page.evaluate(() => document.activeElement.dataset.equip),
        'deflector',
      );
      await pad(page, 0);
      assert.equal((await state(page)).career.state.loadouts.bastion[0], null);
      assert.equal(await page.locator('.garage-footer:visible').count(), 0);
      await key(page, 'Enter');
      assert.equal(
        (await state(page)).career.state.loadouts.bastion[0],
        'deflector',
      );
      assert.match(
        await page.locator('.garage-equipment-count').innerText(),
        /1 \/ 2 equipped/,
      );
    },
  );
  await check('retained races keep their original loadout', async (page) => {
    await open(page, 'dev=2&ship=kestrel');
    await launch(page);
    await page.evaluate(() =>
      window.__VN.devSetup({ distance: 20, speed: 60 }),
    );
    await key(page, 'Escape');
    await page.locator('#home').click();
    await action(page, 'garage-tab');
    await page.locator('[data-equip="lance"]').click();
    await page.locator('[data-equip="stabilizer"]').click();
    await action(page, 'race-tab');
    await action(page, 'resume-session');
    assert.deepEqual(
      await page.evaluate(() =>
        window.__VN
          .getSnapshot()
          .runtime.state.equipment.slots.map((slot) => slot?.id),
      ),
      ['jump', 'injector', 'deflector', 'lance'],
    );
    assert.deepEqual((await state(page)).career.state.loadouts.kestrel, [
      'jump',
      'injector',
      'deflector',
      'stabilizer',
    ]);
  });
  for (const [width, height] of [
    [390, 844],
    [844, 390],
  ]) {
    await check(
      `responsive garage and equipment HUD ${width}x${height}`,
      async (page) => {
        await page.setViewportSize({ width, height });
        await open(page, 'dev=2&ship=shrike');
        await action(page, 'ship-step');
        await page.locator('[data-equip="lance"]').focus();
        assert.ok(
          await page.evaluate(() => {
            const r = document.activeElement.getBoundingClientRect();
            return (
              r.left >= 0 &&
              r.right <= innerWidth &&
              r.top >= 0 &&
              r.bottom <= innerHeight
            );
          }),
        );
        assert.equal(
          await page.evaluate(
            () =>
              document.querySelector('#front-shell').scrollWidth <= innerWidth,
          ),
          true,
        );
        await key(page, 'Escape');
        if (
          await page
            .locator('.picker-header [data-action="home"]:visible')
            .count()
        )
          await page
            .locator('.picker-header [data-action="home"]')
            .last()
            .click();
        await action(page, 'race-tab');
        await action(page, 'practice');
        await launch(page);
        await page.evaluate(() =>
          window.__VN.devSetup({ distance: 20, speed: 60 }),
        );
        const button = page.locator('[data-equipment-slot="0"]');
        await button.click();
        await page.waitForFunction(
          () =>
            window.__VN.getSnapshot().runtime.state.equipment.slots[0]
              .remaining > 0,
        );
        assert.ok(
          await page.evaluate(() => {
            const r = document
              .querySelector('.equipment-hud')
              .getBoundingClientRect();
            return (
              r.left >= 0 &&
              r.right <= innerWidth &&
              r.top >= 0 &&
              r.bottom <= innerHeight
            );
          }),
        );
      },
    );
  }
} finally {
  await browser.close();
}
