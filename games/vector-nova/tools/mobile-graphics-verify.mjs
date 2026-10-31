import assert from 'node:assert/strict';
import { chromium, webkit, devices } from 'playwright';
import { seedVerificationCareer } from './verification-career.mjs';

// Real renderer + WebKit shader binding, with a deterministic context-loss fault.
// This emulates phone input/layout, not an iPhone's hardware memory limit.
const base = process.env.VN_URL;
if (!base) throw new Error('Set VN_URL to an existing dev/preview server.');
const chrome = process.env.VN_BROWSER === 'chrome';
const browser = await (chrome ? chromium : webkit).launch({
  headless: true,
  ...(chrome ? { args: ['--mute-audio'], channel: 'chrome' } : {}),
});
try {
  for (const scenario of [
    { name: 'fresh portrait', viewport: { width: 390, height: 844 } },
    { name: 'fresh landscape', viewport: { width: 844, height: 390 } },
    { name: 'High context loss retries Low', quality: 'high', fault: true },
    { name: 'Low context loss stays recoverable', quality: 'low', fault: true },
    { name: 'blocked audio does not hold countdown', blockAudio: true },
  ]) {
    if (
      process.env.VN_CHECK &&
      !new RegExp(process.env.VN_CHECK).test(scenario.name)
    )
      continue;
    const context = await browser.newContext({
      ...devices['iPhone 13'],
      ...(scenario.viewport ? { viewport: scenario.viewport } : {}),
    });
    try {
      await seedVerificationCareer(context);
      await context.addInitScript(({ quality, fault, blockAudio }) => {
        if (blockAudio)
          AudioContext.prototype.resume = () => new Promise(() => {});
        localStorage.setItem(
          'vector-nova.settings',
          JSON.stringify({
            ...(quality ? { quality } : {}),
            volume: 0,
            masterVolume: 0,
          }),
        );
        const create = WebGL2RenderingContext.prototype.createShader;
        const contexts = new WeakSet();
        window.__graphicsProbe = { shaders: 0, worlds: 0, lost: false };
        WebGL2RenderingContext.prototype.createShader = function (type) {
          if (this.canvas.id === 'world') {
            if (!contexts.has(this)) {
              contexts.add(this);
              window.__graphicsProbe.worlds++;
            }
            if (++window.__graphicsProbe.shaders === 100 && fault) {
              window.__graphicsProbe.lost = true;
              this.getExtension('WEBGL_lose_context').loseContext();
            }
          }
          return create.call(this, type);
        };
      }, scenario);
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', (error) => errors.push(error.message));
      await page.goto(new URL('?intro=0&level=halcyon&music=0', base).href);
      await page.locator('[data-action="launch"]').tap();
      await page.waitForFunction(
        () =>
          window.__VN_FRONTEND?.getState().screen === 'race' ||
          window.__VN_FRONTEND?.getState().error,
        null,
        { timeout: 120000 },
      );
      const result = await page.evaluate(() => ({
        front: window.__VN_FRONTEND.getState(),
        snapshot: window.__VN?.getSnapshot(),
        probe: window.__graphicsProbe,
      }));
      assert.equal(result.probe.lost, Boolean(scenario.fault));
      if (scenario.fault && scenario.quality === 'low') {
        assert.match(result.front.error, /graphics context/);
        assert.doesNotMatch(result.front.error, /shaderSource/);
        assert.equal(result.probe.worlds, 1, 'no endless retries');
        await page.locator('[data-action="cancel"]').click();
        assert.equal(
          await page.evaluate(() => window.__VN_FRONTEND.getState().screen),
          'home',
        );
      } else {
        assert.equal(result.front.error, '');
        assert.equal(result.front.screen, 'race');
        assert.equal(result.snapshot.settings.quality, 'low');
        assert.equal(result.probe.worlds, scenario.fault ? 2 : 1);
        try {
          await page.waitForFunction(
            () => window.__VN.getSnapshot().mode === 'racing',
            null,
            { timeout: 30000 },
          );
        } catch (error) {
          console.error(
            scenario.name,
            await page.evaluate(() => {
              const snapshot = window.__VN?.getSnapshot();
              return {
                front: window.__VN_FRONTEND.getState(),
                mode: snapshot?.mode,
                countdown: snapshot?.countdown,
                errors: snapshot?.errors,
              };
            }),
            errors,
          );
          throw error;
        }
        assert.ok(await page.locator('#touch').isVisible());
        const go = await page.locator('[data-power-zone="go"]').boundingBox();
        assert.ok(go);
        await page.mouse.move(go.x + go.width / 2, go.y + go.height / 2);
        await page.mouse.down();
        await page.waitForFunction(
          () => window.__VN.getSnapshot().vehicle.speed > 1,
        );
        await page.mouse.up();
        assert.equal(
          await page
            .locator('[data-touch-control="power"]')
            .getAttribute('data-power'),
          'neutral',
        );
      }
      assert.deepEqual(errors, []);
      console.log(
        `PASS ${chrome ? 'Chrome' : 'WebKit'} ${scenario.name}`,
        result.probe,
      );
    } finally {
      await context.close();
    }
  }
} finally {
  await browser.close();
}
