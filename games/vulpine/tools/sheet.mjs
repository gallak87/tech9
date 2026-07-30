#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────────
// Contact sheet compositor.
//
//   node tools/sheet.mjs shots/round3
//   node tools/sheet.mjs shots/a shots/b --labels "before,after" --cols 2
//   node tools/sheet.mjs shots/a shots/b --pair          # A/B the same shot names
//
// Writes <first-dir>/sheet.png. Reviewing nine PNGs one at a time loses the
// comparison; seeing them together is the whole point of a contact sheet.
//
// Uses the Chromium already installed for the screenshot harness — the grid is
// laid out in HTML and captured, so there is no image library to install.
// ─────────────────────────────────────────────────────────────────────────────
import { chromium } from 'playwright';
import { readdir, readFile, writeFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function arg(name, def = null) {
  const i = process.argv.indexOf(`--${name}`);
  if (i === -1) return def;
  const v = process.argv[i + 1];
  return v && !v.startsWith('--') ? v : true;
}
const FLAG = (n) => process.argv.includes(`--${n}`);

const dirs = process.argv.slice(2).filter(a => !a.startsWith('--') &&
  !process.argv[process.argv.indexOf(a) - 1]?.startsWith('--'));

async function pngsIn(dir) {
  const abs = path.resolve(ROOT, dir);
  const names = (await readdir(abs)).filter(f => f.endsWith('.png') && f !== 'sheet.png');
  names.sort();
  return names.map(n => ({ name: n.replace(/\.png$/, ''), file: path.join(abs, n) }));
}

async function dataUri(file) {
  const buf = await readFile(file);
  return `data:image/png;base64,${buf.toString('base64')}`;
}

async function main() {
  if (!dirs.length) {
    console.error('usage: node tools/sheet.mjs <shots-dir> [more-dirs] [--pair] [--cols N] [--labels a,b] [--width N]');
    process.exit(2);
  }
  for (const d of dirs) {
    try { await stat(path.resolve(ROOT, d)); }
    catch { console.error(`no such directory: ${d}`); process.exit(2); }
  }

  const labels = (arg('labels') && arg('labels') !== true)
    ? String(arg('labels')).split(',') : dirs.map(d => path.basename(d));
  const tileW = parseInt(arg('width', '760'), 10);
  const pair = FLAG('pair') && dirs.length >= 2;

  const sets = await Promise.all(dirs.map(pngsIn));

  /** @type {{title:string, cells:{label:string, src:string}[]}[]} */
  let rows = [];
  if (pair) {
    // one row per shot name, one cell per directory
    const names = [...new Set(sets.flat().map(s => s.name))].sort();
    for (const n of names) {
      const cells = [];
      for (let i = 0; i < sets.length; i++) {
        const hit = sets[i].find(s => s.name === n);
        if (hit) cells.push({ label: labels[i], src: await dataUri(hit.file) });
      }
      if (cells.length) rows.push({ title: n, cells });
    }
  } else {
    for (let i = 0; i < sets.length; i++) {
      for (const s of sets[i]) {
        rows.push({ title: s.name, cells: [{ label: labels[i], src: await dataUri(s.file) }] });
      }
    }
  }

  if (!rows.length) { console.error('no PNGs found'); process.exit(2); }

  const cols = pair ? rows[0].cells.length : parseInt(arg('cols', String(Math.min(3, rows.length))), 10);
  const pageW = tileW * cols + 16 * (cols + 1);

  const html = `<!doctype html><meta charset="utf-8">
<style>
  :root { color-scheme: dark; }
  body { margin:0; background:#0d0f12; font:500 13px/1.3 ui-monospace,Menlo,monospace; color:#c9d1d9; }
  .grid { display:grid; grid-template-columns: repeat(${cols}, ${tileW}px); gap:16px; padding:16px; }
  ${pair ? `.grid { grid-template-columns: repeat(${cols}, ${tileW}px); }` : ''}
  figure { margin:0; }
  img { width:${tileW}px; display:block; border:1px solid #232830; border-radius:4px; background:#000; }
  figcaption { padding:5px 2px 0; color:#8b949e; letter-spacing:.03em; }
  figcaption b { color:#e6edf3; }
  h2 { grid-column:1/-1; margin:14px 0 0; padding:0 2px; font-size:14px; color:#58a6ff; letter-spacing:.06em; text-transform:uppercase; }
</style>
<div class="grid">
${rows.map(r => (pair ? `<h2>${r.title}</h2>` : '') + r.cells.map(c =>
    `<figure><img src="${c.src}"><figcaption>${pair ? '' : `<b>${r.title}</b> — `}${c.label}</figcaption></figure>`
  ).join('\n')).join('\n')}
</div>`;

  const tmp = path.join(path.resolve(ROOT, dirs[0]), '_sheet.html');
  await writeFile(tmp, html);

  const browser = await chromium.launch({ headless: true, args: ['--force-color-profile=srgb', '--hide-scrollbars'] });
  const page = await browser.newPage({ viewport: { width: pageW, height: 1200 }, deviceScaleFactor: 1 });
  await page.goto('file://' + tmp, { waitUntil: 'load' });
  await page.waitForFunction(() => [...document.images].every(i => i.complete));
  const out = path.join(path.resolve(ROOT, dirs[0]), 'sheet.png');
  await page.screenshot({ path: out, fullPage: true });
  await browser.close();

  console.log(path.relative(ROOT, out));
}

main().catch(e => { console.error(e); process.exit(1); });
