#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────────
// In-game capture for the probe loop. Playwright.
//
//   npm run retry:shot -- --forge kaida
//   npm run retry:shot -- --forge kaida --port 5190 --out shots/x --clip run
//
// tools/shot.mjs is the look-dev harness and it runs its own camera presets.
// This one exists for one job: load a forged character, WAIT until it actually
// swaps in, and say plainly whether it did. The forge branch is asynchronous and
// falls back to the code-built body on any failure, so a capture taken too early
// — or after a silent failure — looks identical to success. That ambiguity is
// what this removes: every [forge] console line is echoed, and the exit code
// says whether the glb reached the screen.
// ─────────────────────────────────────────────────────────────────────────────

import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const argv = process.argv.slice(2);
const arg = (k, d) => { const i = argv.indexOf(`--${k}`); return i === -1 ? d : argv[i + 1]; };

const CFG = {
  forge: arg('forge', 'kaida'),
  port: Number(arg('port', 5190)),
  out: arg('out', 'shots/ingame'),
  clip: arg('clip', null),
  wait: Number(arg('wait', 12000)),
  w: Number(arg('w', 1280)),
  h: Number(arg('h', 900)),
  hour: arg('t', '6.4'),
  moves: argv.includes('--moves'),
};

const url = `http://127.0.0.1:${CFG.port}/?play=1&dev=2&quality=high&hour=${CFG.hour}`
  + `&forge=${CFG.forge}${CFG.clip ? `&pose=${CFG.clip}` : ''}`;

fs.mkdirSync(CFG.out, { recursive: true });
const browser = await chromium.launch({ args: ['--use-gl=angle', '--enable-webgl'] });
const page = await browser.newPage({ viewport: { width: CFG.w, height: CFG.h } });

/* Every [forge] line, plus anything that failed. The loader is deliberately
   forgiving — it keeps the code-built character rather than leaving a hole — so
   its console output is the only place a failure is stated. */
const forgeLog = [];
page.on('console', (m) => {
  const t = m.text();
  if (t.includes('[forge]')) forgeLog.push(`${m.type()}: ${t}`);
});
page.on('pageerror', (e) => forgeLog.push(`pageerror: ${e.message}`));

console.log(`→ ${url}`);
await page.goto(url, { waitUntil: 'load', timeout: 60000 });
await page.waitForFunction(() => window.__DAWN__?.ready === true, { timeout: 60000 }).catch(() => {});

/* Poll for the swap rather than sleeping a guessed interval. applyGltfActor
   hangs `_forge` on the actor, so its presence is the unambiguous signal that
   the glb is on screen and not merely fetched. */
const swapped = await page.waitForFunction(() => {
  const seen = performance.getEntriesByType('resource').some(e => /\.glb($|\?)/.test(e.name));
  return seen && (window.__forgeSeen ||= true);
}, { timeout: CFG.wait }).then(() => true).catch(() => false);

await page.waitForTimeout(2500);   // let one clip settle after the swap

/* Movement shots are driven by the game's own input, not by posing bones from
   outside. src/traversal/index.js maps W/A/S/D + Shift to locomotion and
   Space/C/V/H to the action clips, so holding a key exercises the real path:
   Animator → retarget → skin → screen. Posing the rig directly would skip the
   very layers the render defect lived in. */
// `hold` is how long the input runs BEFORE the shot, with the key still down.
//
// The camera follows on a spring, so a short hold catches the character mid-lag
// — small, off to one edge, half the frame empty sand. The fix is to hold
// longer, NOT to release and let things settle: releasing first decelerates her
// to a stop, and `walk` and `sprint` come back showing a character standing
// still, seen from behind. The shot has to be taken while the key is down.
const MOVES = [
  { name: 'idle', keys: [], hold: 1200 },
  // The faster the state, the further the camera trails, so the harder ones get
  // a longer hold rather than a different crop. A turn trails worst: the spring
  // is chasing a yaw as well as a position, and a short hold puts her at the
  // frame edge with her head clipped.
  { name: 'walk', keys: ['KeyW'], hold: 3200 },
  { name: 'sprint', keys: ['KeyW', 'ShiftLeft'], hold: 5000 },
  { name: 'turn-left', keys: ['KeyW', 'KeyA'], hold: 6000 },
  { name: 'strafe-right', keys: ['KeyD'], hold: 2800 },
  { name: 'attack', keys: [], tap: 'Space', hold: 420 },
  { name: 'cast', keys: [], tap: 'KeyC', hold: 520 },
  { name: 'victory', keys: [], tap: 'KeyV', hold: 700 },
  { name: 'hurt', keys: [], tap: 'KeyH', hold: 380 },
];

const written = [];
if (CFG.moves) {
  await page.locator('canvas').first().click({ position: { x: 20, y: 20 } }).catch(() => {});
  // Half of every cell was empty sand at the default 18 m. The subject of these
  // shots is the character, not the terrain.
  await page.evaluate((z) => window.__DAWN__?.rig && (window.__DAWN__.rig.frameHeight = z), 2.6)
    .catch(() => {});
  for (const m of MOVES) {
    for (const k of m.keys) await page.keyboard.down(k);
    if (m.tap) await page.keyboard.press(m.tap);
    await page.waitForTimeout(m.hold);
    const f = path.join(CFG.out, `${CFG.forge}-${m.name}.png`);
    await page.screenshot({ path: f });      // while the key is still down
    written.push(f);
    for (const k of m.keys) await page.keyboard.up(k);
    await page.waitForTimeout(400);          // come to rest before the next state
  }
}

const file = path.join(CFG.out, `${CFG.forge}${CFG.clip ? `-${CFG.clip}` : ''}.png`);
if (!CFG.moves) await page.screenshot({ path: file });

/* Contact sheet, composed in the browser that is already open. Laying the
   captures out as an HTML grid and screenshotting it avoids adding an image
   library for the one thing Playwright can already do. */
let sheet = null;
if (CFG.moves && written.length) {
  const cells = written.map((f) => {
    const b64 = fs.readFileSync(f).toString('base64');
    const name = path.basename(f).replace(`${CFG.forge}-`, '').replace('.png', '');
    return `<figure><img src="data:image/png;base64,${b64}"><figcaption>${name}</figcaption></figure>`;
  }).join('');
  await page.setViewportSize({ width: 1240, height: 1640 });
  await page.setContent(`<style>
    body{margin:0;background:#14161a;font:20px ui-monospace,Menlo,monospace;color:#e2e6ee}
    h1{font-size:22px;margin:14px 16px 10px}
    .g{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;padding:0 12px 12px}
    figure{margin:0}
    img{width:100%;display:block;border:1px solid #343840;
        object-fit:cover;aspect-ratio:46/64;object-position:50% 42%}
    figcaption{color:#96c8eb;padding:7px 2px 0}
  </style><h1>${CFG.forge.toUpperCase()} — in-game</h1><div class="g">${cells}</div>`);
  sheet = path.join(CFG.out, `${CFG.forge}-contact-sheet.png`);
  await page.locator('body').screenshot({ path: sheet });
}

const stats = await page.evaluate(() => window.__DAWN__?.stats?.() ?? null).catch(() => null);

/* Measure the bones the renderer is actually using. The headless probe measures
   an actor it built itself in Node; this reads the live scene graph. When those
   two disagree — bones hanging at 0° in Node, arms visibly out on screen — the
   fault is in the game, not the asset, and only this side can say so. */
const live = await page.evaluate(() => {
  const T = window.__DAWN__?.THREE; if (!T) return null;
  const root = window.__DAWN__?.ctx?.scene ?? window.__DAWN__?.engine?.scene;
  if (!root) return null;
  const want = ['shoulder_L', 'upperArm_L', 'lowerArm_L', 'hand_L', 'upperLeg_L', 'lowerLeg_L', 'hips', 'head'];
  const found = {};
  root.traverse((o) => { if (o.isBone && want.includes(o.name) && !found[o.name]) found[o.name] = o; });
  if (Object.keys(found).length < want.length) return { missing: want.filter(n => !found[n]) };
  root.updateMatrixWorld(true);
  const wp = (n) => found[n].getWorldPosition(new T.Vector3());
  const ang = (a, b) => {
    const d = wp(b).sub(wp(a)).normalize();
    return +(T.MathUtils.radToDeg(Math.acos(T.MathUtils.clamp(d.dot(new T.Vector3(0, -1, 0)), -1, 1)))).toFixed(1);
  };
  // The mesh's own extents next to the skeleton's. If the skin is following the
  // bones these agree; if the mesh is still in the rigger's pose while the bones
  // hang, the mesh is far wider than the bone span and this says so in metres.
  let mesh = null;
  root.traverse((o) => { if (o.isSkinnedMesh && !mesh) mesh = o; });
  let meshBox = null;
  if (mesh) {
    const b = new T.Box3().setFromObject(mesh);
    meshBox = { w: +(b.max.x - b.min.x).toFixed(3), h: +(b.max.y - b.min.y).toFixed(3) };
  }
  const span = +wp('hand_L').distanceTo(wp('hips')).toFixed(3);

  return {
    meshWidth: meshBox?.w, meshHeight: meshBox?.h, handToHips: span,
    'upperArm_L→lowerArm_L': ang('upperArm_L', 'lowerArm_L'),
    'lowerArm_L→hand_L': ang('lowerArm_L', 'hand_L'),
    'upperLeg_L→lowerLeg_L': ang('upperLeg_L', 'lowerLeg_L'),
    heightM: +(wp('head').y - Math.min(...['hips'].map(n => wp(n).y)) ).toFixed(3),
  };
}).catch((e) => ({ error: e.message }));
await browser.close();

console.log(`\nglb fetched: ${swapped ? 'yes' : 'NO — the loader never requested it'}`);
if (forgeLog.length) { console.log('[forge] console:'); forgeLog.forEach(l => console.log(`  ${l}`)); }
else console.log('[forge] console: silent — the forge branch never ran, or never spoke');
if (stats?.tris) console.log(`tris on screen: ${stats.tris.toLocaleString()}`);
console.log('live bone angles from -Y (what the renderer is using):');
console.log(`  ${JSON.stringify(live)}`);
if (CFG.moves) {
  console.log(`\nwrote ${written.length} movement shots:`);
  written.forEach(f => console.log(`  ${path.basename(f)}`));
  if (sheet) console.log(`  ${path.basename(sheet)}   <- all nine, one image`);
}
else console.log(`\nwrote ${file}`);
process.exit(forgeLog.some(l => l.startsWith('error')) || !swapped ? 1 : 0);
