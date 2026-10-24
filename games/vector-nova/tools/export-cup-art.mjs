import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { chromium } from 'playwright';

const root = new URL('../', import.meta.url);
const { images: sources } = JSON.parse(
  await readFile(new URL('assets/ui/cups/provenance.json', root)),
);
await mkdir(new URL('public/assets/menu/cups/', root), { recursive: true });
const browser = await chromium.launch({ headless: true, channel: 'chrome' });
const images = [];
try {
  const page = await browser.newPage();
  for (const { cupId, kind, file: sourceFile } of sources) {
    const source = `assets/ui/cups/${sourceFile}`;
    const width = kind === 'trophy' ? 512 : 960;
    const input = (await readFile(new URL(source, root))).toString('base64');
    const output = await page.evaluate(
      async ({ input, width }) => {
        const img = new Image();
        img.src = `data:image/png;base64,${input}`;
        await img.decode();
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = Math.round((width * img.height) / img.width);
        const context = canvas.getContext('2d');
        context.imageSmoothingQuality = 'high';
        context.drawImage(img, 0, 0, canvas.width, canvas.height);
        return canvas.toDataURL('image/webp', 0.86).split(',')[1];
      },
      { input, width },
    );
    const bytes = Buffer.from(output, 'base64');
    const file = `public/assets/menu/cups/${cupId}-${kind}.webp`;
    await writeFile(new URL(file, root), bytes);
    images.push({
      source,
      file,
      bytes: bytes.length,
      sha256: createHash('sha256').update(bytes).digest('hex'),
    });
  }
} finally {
  await browser.close();
}
await writeFile(
  new URL('assets/ui/cups/runtime-exports.json', root),
  JSON.stringify(
    {
      process:
        'Chromium canvas WebP quality 0.86, high-quality scaling: 512px trophies with alpha and 960px-wide backgrounds. Original sources retained unchanged.',
      images,
    },
    null,
    2,
  ) + '\n',
);
console.log(
  `Exported ${images.length} cup images, ${images.reduce((sum, image) => sum + image.bytes, 0)} bytes.`,
);
