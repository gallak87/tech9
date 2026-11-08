import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { launchVerificationBrowser } from './verification-browser.mjs';

const root = new URL('../', import.meta.url);
const { images: sources } = JSON.parse(
  await readFile(new URL('assets/ui/cups/provenance.json', root)),
);
const args = process.argv.slice(2);
if (args.length && (args.length !== 2 || args[0] !== '--cup'))
  throw new Error('Usage: node tools/export-cup-art.mjs [--cup <id>]');
const selected = args.length
  ? sources.filter(({ cupId }) => cupId === args[1])
  : sources;
if (!selected.length) throw new Error(`Unknown cup: ${args[1]}`);
const manifest = new URL('assets/ui/cups/runtime-exports.json', root);
const retained = args.length ? JSON.parse(await readFile(manifest)).images : [];
await mkdir(new URL('public/assets/menu/cups/', root), { recursive: true });
const browser = await launchVerificationBrowser();
const images = [];
try {
  const page = await browser.newPage();
  for (const { cupId, kind, file: sourceFile } of selected) {
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
const current = sources.map(({ file }) => {
  const source = `assets/ui/cups/${file}`;
  const image =
    images.find((entry) => entry.source === source) ??
    retained.find((entry) => entry.source === source);
  if (!image) throw new Error(`Missing runtime export for ${source}`);
  return image;
});
await writeFile(
  manifest,
  JSON.stringify(
    {
      process:
        'Chromium canvas WebP quality 0.86, high-quality scaling: 512px trophies with alpha and 960px-wide backgrounds. Original sources retained unchanged.',
      images: current,
    },
    null,
    2,
  ) + '\n',
);
console.log(
  `Exported ${images.length} cup images, ${images.reduce((sum, image) => sum + image.bytes, 0)} bytes.`,
);
