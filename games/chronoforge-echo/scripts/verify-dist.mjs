import assert from 'node:assert/strict';
import fs from 'node:fs';
import {ASSET_MANIFEST} from '../src/assets.js';

const dist = new URL('../dist/', import.meta.url);
const index = fs.readFileSync(new URL('index.html', dist), 'utf8');
const entryRefs = [...index.matchAll(/(?:src|href)=["']([^"']+)["']/g)].map(m => m[1]).filter(url => !url.startsWith('data:'));
assert.ok(entryRefs.some(url => url.endsWith('.js')), 'Built entry script missing');
assert.ok(entryRefs.some(url => url.endsWith('.css')), 'Built stylesheet missing');

// Resolve the actual compiled URLs under both deployment mounts. This catches
// site-root /assets or /fonts references that would escape the Pages directory.
for (const mount of ['/', '/tech9/chronoforge-echo/']) {
  const page = new URL(mount, 'https://pages.invalid');
  const checked = new Set();
  function check(ref, owner = page) {
    if (ref.startsWith('data:') || ref.startsWith('#')) return;
    const url = new URL(ref, owner);
    assert.equal(url.origin, page.origin, `Unexpected external build dependency: ${url}`);
    assert.ok(url.pathname.startsWith(mount), `Asset escapes ${mount}: ${url.pathname}`);
    const relative = decodeURIComponent(url.pathname.slice(mount.length));
    assert.ok(relative && !relative.split('/').includes('..'), `Invalid asset path: ${ref}`);
    const file = new URL(relative, dist);
    assert.ok(fs.existsSync(file) && fs.statSync(file).isFile(), `Missing built file: ${relative}`);
    if (checked.has(relative)) return;
    checked.add(relative);
    if (relative.endsWith('.css')) {
      for (const match of fs.readFileSync(file, 'utf8').matchAll(/url\(\s*["']?([^\s"')]+)["']?\s*\)/g)) check(match[1], url);
    }
  }
  entryRefs.forEach(ref => check(ref));
  ASSET_MANIFEST.forEach(asset => check(asset.url));
  console.log(`PASS ${mount}: ${checked.size} compiled entry, font and art files resolve inside the mount.`);
}
assert.ok(!fs.existsSync(new URL('experiments/', dist)), 'Experiments must not ship');
let productionScript='',productionStyles='';
for(const name of fs.readdirSync(new URL('assets/',dist)).filter(name=>/\.(js|css)$/.test(name))){
  const text=fs.readFileSync(new URL('assets/'+name,dist),'utf8');
  if(name.endsWith('.js'))productionScript+=text;else productionStyles+=text;
  assert.ok(!text.includes('Temporary art preview')&&!text.includes('.dev-tier-buttons'),'Development art preview must not ship: '+name);
  assert.ok(!text.includes('UPGRADE PREVIEW · NEVER SAVED')&&!text.includes('Rehearsal only'),'Development upgrade controls must not ship: '+name);
  assert.ok(!text.includes('dev-world-controls')&&!text.includes('dev-world-preview'),'Development world controls must not ship: '+name);
  assert.ok(!text.includes('dev-world-view')&&!text.includes('Preparing world view'),'Development world overview must not ship: '+name);
}
assert.ok(productionScript.includes('Town Center upgrade')&&productionScript.includes('Skip reveal'),'Real upgrade cinematic must ship');
assert.ok(productionStyles.includes('.upgrade-tour'),'Real upgrade cinematic styles must ship');
