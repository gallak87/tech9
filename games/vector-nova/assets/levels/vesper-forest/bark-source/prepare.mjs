import { chromium } from 'playwright';
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { Buffer } from 'node:buffer';
import { URL } from 'node:url';
import { log } from 'node:console';

// Encode the retained generated albedo and derive scalar bump data. This stage
// does not synthesize artwork or modify the source image.
const root = new URL('../', import.meta.url);
const source = await readFile(
  new URL('ancient-oak-bark-v1.png', import.meta.url),
);
const browser = await chromium.launch({
  channel: 'chrome',
  headless: true,
  args: ['--mute-audio'],
});
try {
  const page = await browser.newPage();
  const encoded = await page.evaluate(
    async (data) => {
      const image = new globalThis.Image();
      image.src = data;
      await image.decode();
      const color = globalThis.document.createElement('canvas');
      color.width = color.height = 1024;
      const colorContext = color.getContext('2d');
      colorContext.drawImage(image, 0, 0, 1024, 1024);
      const height = globalThis.document.createElement('canvas');
      height.width = height.height = 512;
      const context = height.getContext('2d');
      context.drawImage(image, 0, 0, 512, 512);
      const pixels = context.getImageData(0, 0, 512, 512);
      const scalar = new Float32Array(512 * 512);
      for (let i = 0; i < scalar.length; i++) {
        const j = i * 4;
        scalar[i] =
          pixels.data[j] * 0.2126 +
          pixels.data[j + 1] * 0.7152 +
          pixels.data[j + 2] * 0.0722;
      }
      // Wrapped low-pass filter suppresses albedo micrograin in the bump field.
      for (let y = 0; y < 512; y++)
        for (let x = 0; x < 512; x++) {
          let sum = 0;
          for (let dy = -1; dy <= 1; dy++)
            for (let dx = -1; dx <= 1; dx++)
              sum +=
                scalar[((y + dy + 512) % 512) * 512 + ((x + dx + 512) % 512)];
          const i = (y * 512 + x) * 4;
          pixels.data[i] =
            pixels.data[i + 1] =
            pixels.data[i + 2] =
              Math.round(sum / 9);
          pixels.data[i + 3] = 255;
        }
      context.putImageData(pixels, 0, 0);
      return {
        color: color.toDataURL('image/jpeg', 0.92),
        height: height.toDataURL('image/png'),
      };
    },
    `data:image/png;base64,${source.toString('base64')}`,
  );
  const files = [
    ['ancient-oak-bark-v1.jpg', encoded.color, [1024, 1024]],
    ['ancient-oak-bark-height-v1.png', encoded.height, [512, 512]],
  ];
  const outputs = [];
  for (const [file, data, dimensions] of files) {
    const bytes = Buffer.from(data.split(',')[1], 'base64');
    await writeFile(new URL(file, root), bytes);
    outputs.push({
      file,
      dimensions,
      bytes: bytes.length,
      sha256: createHash('sha256').update(bytes).digest('hex'),
    });
  }
  await writeFile(
    new URL('asset.json', import.meta.url),
    JSON.stringify(
      {
        source: 'ancient-oak-bark-v1.png',
        sourceSHA256: createHash('sha256').update(source).digest('hex'),
        generator: 'Built-in imagegen',
        prompt: 'prompt.txt',
        tileMetres: 52,
        height:
          'Approximate scalar relief from source luminance, 512px with a wrapped 3x3 low-pass filter; not measured displacement.',
        outputs,
      },
      null,
      2,
    ) + '\n',
  );
  log(outputs.map(({ file, bytes }) => `${file}: ${bytes} bytes`).join('\n'));
} finally {
  await browser.close();
}
