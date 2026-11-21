import assert from 'node:assert/strict';
import {
  launchVerificationBrowser,
  collectPageErrors,
} from './verification-browser.mjs';
import { seedVerificationCareer } from './verification-career.mjs';
import {
  revealEditorAction,
  revealEditorField,
  openEditorSection,
} from './editor-controls.mjs';

const base = process.env.VN_URL;
if (!base) throw new Error('Set VN_URL to the isolated Workshop server.');
const compact = process.argv.includes('--compact');
const browser = await launchVerificationBrowser();
try {
  const ctx = await browser.newContext({
    viewport: { width: 1536, height: 960 },
    hasTouch: compact,
  });
  await ctx.routeWebSocket('**/*', () => {});
  await seedVerificationCareer(ctx);
  await ctx.addInitScript(() => {
    localStorage.setItem('startUpMusicOn', 'false');
    localStorage.setItem(
      'vector-nova.settings',
      JSON.stringify({ quality: 'low', volume: 0, reducedMotion: true }),
    );
    window.testPad = {
      id: 'Workshop verification',
      mapping: 'standard',
      index: 0,
      connected: true,
      axes: [0, 0, 0, 0],
      buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0 })),
    };
    Object.defineProperty(navigator, 'getGamepads', {
      value: () => [window.testPad],
    });
  });
  const page = await ctx.newPage(),
    errors = collectPageErrors(page);
  const click = async (id) => (await revealEditorAction(page, id)).click();
  const ready = () =>
    page.waitForFunction(
      () => {
        const e = window.__VN_FRONTEND?.getState().editor;
        return e && !e.busy && e.preview?.worldReady;
      },
      null,
      { timeout: 90000 },
    );
  await page.goto(new URL('?editor=1&intro=0&music=0', base).href);
  await ready();
  await page
    .getByRole('button', { name: /Harbor braid/ })
    .first()
    .click();
  await ready();
  const address = page.getByRole('spinbutton', { name: 'Go to point' }),
    ruler = page.getByRole('slider', { name: 'Route point navigator' });
  const n = Number(await address.getAttribute('max'));
  assert(n > 90);
  await ruler.press('Home');
  await ruler.hover();
  await page.mouse.wheel(0, -100);
  await page.waitForFunction(
    (n) => Number(document.querySelector('[data-point-address]').value) === n,
    n,
  );
  await page.mouse.wheel(0, 100);
  await page.waitForFunction(
    () => document.querySelector('[data-point-address]').value === '1',
  );
  await ruler.press('ArrowLeft');
  assert.equal(await address.inputValue(), String(n));
  await ruler.press('ArrowRight');
  await ruler.press('Shift+ArrowLeft');
  assert.equal(await address.inputValue(), String(n));
  assert.equal(
    await page.locator('[data-point-count]').textContent(),
    '2 selected',
    'extend across the seam by one',
  );
  await ruler.press('Shift+ArrowRight');
  assert.equal(await address.inputValue(), '1');
  assert.equal(await page.locator('[data-point-count]').textContent(), '');
  await ruler.press('Shift+ArrowRight');
  assert.equal(
    await page.locator('[data-point-count]').textContent(),
    '2 selected',
  );
  const bounds = await ruler.boundingBox();
  await page.mouse.move(bounds.x + bounds.width - 1, bounds.y + 10);
  await page.mouse.down();
  await page.mouse.move(
    bounds.x + bounds.width + bounds.width / (n - 1),
    bounds.y + 10,
  );
  await page.mouse.up();
  assert.equal(await address.inputValue(), '1', 'scrub past the end wraps');
  await address.fill('34');
  await address.press('Enter');
  assert.equal(await address.inputValue(), '34');
  async function pad(index) {
    await page.evaluate(async (i) => {
      const frames = () =>
        new Promise((r) =>
          requestAnimationFrame(() => requestAnimationFrame(r)),
        );
      window.testPad.buttons[i] = { pressed: true, value: 1 };
      await frames();
      window.testPad.buttons[i] = { pressed: false, value: 0 };
      await frames();
    }, index);
  }
  await ruler.focus();
  await pad(15);
  assert.equal(await address.inputValue(), '35', 'D-pad advances a point');
  await click('view-map');
  await ruler.press('ArrowLeft');
  assert(await page.getByRole('dialog', { name: '2D route map' }).isVisible());
  const roll = page.getByRole('slider', { name: 'Scrub selected roll' }),
    degrees = page.getByRole('spinbutton', { name: 'Selected roll' });
  await roll.focus();
  const before = Number(await degrees.inputValue());
  await pad(15);
  assert(
    Math.abs(Number(await degrees.inputValue()) - Math.round(before) - 1) <
      0.11,
    'D-pad changes roll on the map',
  );
  await click('undo');
  await openEditorSection(page, 'generate');
  for (const name of [
    'Curviness',
    'Vertical variation',
    'Banking',
    'Section frequency',
    'Crossovers',
  ])
    assert(
      await page.getByRole('slider', { name, exact: true }).isVisible(),
      name,
    );
  for (const name of ['Jump frequency', 'Jump size'])
    assert(
      await page.getByRole('combobox', { name, exact: true }).isVisible(),
      name,
    );
  await (await revealEditorField(page, 'banking')).fill('0.37');
  await (await revealEditorField(page, 'rhythm')).fill('0.84');
  await click('generate');
  await ready();
  await click('save');
  const saved = await page.evaluate(() =>
    Object.entries(localStorage)
      .filter(([k]) => k.startsWith('vector-nova.tracks.v1.'))
      .map(([, v]) => JSON.parse(v).document)
      .find((d) => d.name === 'Harbor braid'),
  );
  assert.equal(saved.generator.banking, 0.37);
  assert.equal(saved.generator.rhythm, 0.84);
  assert.equal(saved.generator.version, 6);
  if (compact) {
    await click('view-map');
    for (const size of [
      { width: 390, height: 844 },
      { width: 844, height: 390 },
    ]) {
      await page.setViewportSize(size);
      const previous = await address.inputValue();
      await page.getByRole('button', { name: 'Next route point' }).tap();
      assert.notEqual(await address.inputValue(), previous);
      assert(
        await page.getByRole('dialog', { name: '2D route map' }).isVisible(),
      );
      const strip = await page
        .locator('[data-point-workspace]')
        .evaluate((el) => ({ width: el.clientWidth, content: el.scrollWidth }));
      assert(strip.content <= strip.width + 1, 'all transform controls fit');
      assert(
        (await page.locator('.workshop-canvas').boundingBox()).height >= 140,
        'there is room to manipulate the road in both orientations',
      );
    }
  }
  assert.deepEqual(errors, []);
  console.log(
    'PASS point wheel, edge scrub, keyboard and controller wrap, map focus, controller roll and persisted generation knobs.',
  );
} finally {
  await browser.close();
}
