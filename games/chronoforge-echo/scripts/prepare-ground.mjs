import fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { createServer } from 'vite';
import { ASSET_MANIFEST } from '../src/assets.js';

const root = new URL('../', import.meta.url);
const entries = ASSET_MANIFEST.filter((entry) => entry.preparedGround);
const server = await createServer({
  root: fileURLToPath(root),
  server: { host: '127.0.0.1', port: 0, strictPort: false },
});
let browser;
try {
  await server.listen();
  browser = await chromium.launch({
    headless: true,
    channel: process.env.CHROME_CHANNEL || 'chrome',
  });
  const page = await browser.newPage();
  await page.route('**/__prepare_ground__', (route) =>
    route.fulfill({ contentType: 'text/html', body: '<!doctype html>' }),
  );
  await page.goto(`${server.resolvedUrls.local[0]}__prepare_ground__`);
  for (const entry of entries) {
    const encoded = await page.evaluate(async (entry) => {
      const { loadPixelAtlas } = await import('/src/assets.js');
      const { installGroundAtlas, groundTextureSources } =
        await import('/src/art.js');
      installGroundAtlas(
        await loadPixelAtlas({ ...entry, ...entry.authoring }),
        {
          columns: entry.columns,
          rows: entry.rows,
          biome: entry.biome,
        },
      );
      const tiles = groundTextureSources(entry.biome);
      const canvas = globalThis.document.createElement('canvas');
      canvas.width = 256 * entry.columns;
      canvas.height = 256 * entry.rows;
      const context = canvas.getContext('2d');
      tiles.forEach((tile, index) =>
        context.drawImage(
          tile,
          (index % entry.columns) * 256,
          Math.floor(index / entry.columns) * 256,
        ),
      );
      return canvas.toDataURL('image/png').split(',')[1];
    }, entry);
    await fs.writeFile(
      new URL('public/' + entry.url, root),
      Buffer.from(encoded, 'base64'),
    );
  }
  console.log(`Prepared ${entries.length} ground atlases.`);
} finally {
  await browser?.close();
  await server.close();
}
