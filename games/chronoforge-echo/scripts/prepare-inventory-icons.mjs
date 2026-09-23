import fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { createServer } from 'vite';
import { INVENTORY_ICON_ASSETS } from '../src/inventory-icon-manifest.js';

const root = new URL('../', import.meta.url);
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
  await page.route('**/__prepare_icons__', (route) =>
    route.fulfill({ contentType: 'text/html', body: '<!doctype html>' }),
  );
  await page.goto(`${server.resolvedUrls.local[0]}__prepare_icons__`);
  for (const entry of INVENTORY_ICON_ASSETS) {
    const encoded = await page.evaluate(async (entry) => {
      const { loadPixelAtlas } = await import('/src/assets.js');
      const { installInventoryIcon, drawInventoryIcon } =
        await import('/src/inventory-icons.js');
      const source = { ...entry, ...entry.authoring, prepared: false };
      installInventoryIcon(await loadPixelAtlas(source), source);
      const canvas = globalThis.document.createElement('canvas');
      canvas.width = canvas.height = 256;
      drawInventoryIcon(canvas.getContext('2d'), entry.itemId, 0, 0, 256);
      return canvas.toDataURL('image/png').split(',')[1];
    }, entry);
    await fs.writeFile(
      new URL('public/' + entry.source, root),
      Buffer.from(encoded, 'base64'),
    );
  }
  console.log(`Prepared ${INVENTORY_ICON_ASSETS.length} inventory icons.`);
} finally {
  await browser?.close();
  await server.close();
}
