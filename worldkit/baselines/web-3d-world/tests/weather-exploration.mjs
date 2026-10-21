import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { openScene, root } from './lib/browser.mjs';
const output = path.join(root, '.artifacts/weather/exploration');
await mkdir(output, { recursive: true });
const h = await openScene({
  mode: 'preview',
  recordVideoDir: path.join(output, 'video'),
});
const { page, snapshot } = h;
const report = { environment: h.environment, checks: [], audio: [] };
async function check(name, action) {
  try {
    const detail = await action();
    report.checks.push({ name, pass: true, detail });
    console.log(`PASS ${name}`);
  } catch (error) {
    report.checks.push({ name, pass: false, error: error.message });
    console.error(`FAIL ${name}: ${error.message}`);
  }
}
async function audioClip(name) {
  await page.evaluate(() => {
    window.__WEATHER_AUDIO_RECORD__.chunks = [];
    window.__WEATHER_AUDIO_RECORD__.enabled = true;
  });
  await page.waitForTimeout(2000);
  const data = await page.evaluate(() => {
    const r = window.__WEATHER_AUDIO_RECORD__;
    r.enabled = false;
    return { samples: r.chunks.flat(), rate: r.rate };
  });
  const stride = Math.max(1, Math.round(data.rate / 16000));
  const length = Math.floor(data.samples.length / stride);
  const buffer = Buffer.alloc(44 + length * 2);
  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(buffer.length - 8, 4);
  buffer.write('WAVEfmt ', 8);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(data.rate / stride, 24);
  buffer.writeUInt32LE((data.rate / stride) * 2, 28);
  buffer.writeUInt16LE(2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write('data', 36);
  buffer.writeUInt32LE(length * 2, 40);
  let sum = 0,
    peak = 0;
  for (let i = 0; i < length; i++) {
    const v = data.samples[i * stride];
    assert.ok(Number.isFinite(v));
    sum += v * v;
    peak = Math.max(peak, Math.abs(v));
    buffer.writeInt16LE(
      Math.max(-32768, Math.min(32767, Math.round(v * 32767))),
      44 + i * 2,
    );
  }
  await writeFile(path.join(output, `${name}.wav`), buffer);
  const metrics = {
    name,
    rms: Math.sqrt(sum / length),
    peak,
    samples: length,
    rate: data.rate / stride,
  };
  report.audio.push(metrics);
  return metrics;
}
try {
  const url = new URL(page.url());
  url.searchParams.set('controller', 'walk');
  await page.goto(url.href);
  await page.waitForFunction(() => window.__SCENE_TEST__?.ready);
  await page.locator('[data-setting="quality"]').selectOption('balanced');
  await check(
    'real snowy walking preserves contact height and responds to pause',
    async () => {
      await page.locator('[data-preset="winter"]').click();
      await page.waitForTimeout(5500);
      await page.locator('#enter-world').click();
      const before = await snapshot();
      await page.keyboard.down('w');
      await page.waitForTimeout(1200);
      await page.keyboard.up('w');
      const after = await snapshot();
      assert.ok(
        Math.hypot(
          ...after.camera.position.map((v, i) => v - before.camera.position[i]),
        ) > 2,
      );
      assert.ok(
        Math.abs(
          after.camera.position[1] -
            after.walking.groundHeight -
            after.walking.eyeHeight,
        ) < 0.01,
      );
      assert.ok(after.weather.snow > 0.85);
      await page.keyboard.press('p');
      assert.equal((await snapshot()).walking.enabled, false);
      await page.screenshot({ path: path.join(output, 'snowy-walking.png') });
      return { before, after };
    },
  );
  await check('focus lifecycle suspends weather and walking', async () => {
    await page.locator('#enter-world').click();
    await page.evaluate(() => window.dispatchEvent(new Event('blur')));
    await page.waitForTimeout(200);
    const before = (await snapshot()).weather;
    await page.waitForTimeout(700);
    const suspended = (await snapshot()).weather;
    assert.equal(suspended.time, before.time);
    assert.equal(suspended.inactive, true);
    assert.equal((await snapshot()).walking.enabled, false);
    await page.evaluate(() => window.dispatchEvent(new Event('focus')));
    await page.waitForTimeout(250);
    const after = (await snapshot()).weather;
    assert.ok(after.time > before.time && after.time - before.time < 0.5);
    return {
      before: before.time,
      suspended: suspended.time,
      after: after.time,
    };
  });
  // Tap the actual Web Audio destination for evidence; production code remains unmodified.
  await page.evaluate(() => {
    const Native = window.AudioContext;
    window.AudioContext = class extends Native {
      constructor(...args) {
        super(...args);
        const tap = super.createGain();
        const processor = this.createScriptProcessor(4096, 1, 1);
        tap.connect(processor);
        processor.connect(this.destination);
        const record = (window.__WEATHER_AUDIO_RECORD__ = {
          enabled: false,
          chunks: [],
          rate: this.sampleRate,
        });
        processor.onaudioprocess = (e) => {
          const samples = e.inputBuffer.getChannelData(0);
          e.outputBuffer.getChannelData(0).set(samples);
          if (record.enabled) record.chunks.push(Array.from(samples));
        };
        const create = this.createGain.bind(this);
        this.createGain = () => {
          const node = create();
          const connect = node.connect.bind(node);
          node.connect = (destination, ...rest) =>
            connect(
              destination === this.destination ? tap : destination,
              ...rest,
            );
          return node;
        };
      }
    };
  });
  await check(
    'audible rain and shelter attenuation, then mute silence',
    async () => {
      await page.locator('[data-weather-view="trail"]').click();
      await page.locator('[data-preset="rain"]').click();
      await page.waitForTimeout(5500);
      await page.locator('#weather-sound').click();
      await page.waitForTimeout(800);
      const exposed = await audioClip('rain-exposed');
      assert.ok(exposed.rms > 0.0001);
      assert.ok(exposed.peak < 0.9);
      await page.locator('[data-weather-view="weatherShelter"]').click();
      await page.waitForTimeout(1000);
      const sheltered = await audioClip('rain-sheltered');
      assert.ok(sheltered.rms < exposed.rms * 0.8);
      await page.locator('#weather-sound').click();
      await page.waitForTimeout(1500);
      const muted = await audioClip('muted');
      assert.ok(muted.rms < 0.00001);
      return { exposed, sheltered, muted };
    },
  );
  await check('clean browser and GPU during snowy walking and audio', () =>
    assert.deepEqual(h.errors, {
      console: [],
      page: [],
      requests: [],
      webgl: [],
    }),
  );
} finally {
  await h.close();
  await writeFile(
    path.join(output, 'report.json'),
    JSON.stringify(report, null, 2),
  );
}
if (report.checks.some((c) => !c.pass)) process.exitCode = 1;
