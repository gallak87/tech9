#!/usr/bin/env node
// sprite-gen.js — generate sprites via Ollama image gen
//
// Usage:
//   node tools/sprite-gen.js <manifest.json>
//   node tools/sprite-gen.js <manifest.json> --sprite player
//
// Defaults: http://localhost:11434, model x/flux2-klein

const fs            = require('fs');
const path          = require('path');
const http          = require('http');
const { execSync }  = require('child_process');

const manifestPath = process.argv[2];
if (!manifestPath) {
  console.error('Usage: node tools/sprite-gen.js <manifest.json> [--sprite <name>] [--tags <tag1,tag2,...>]');
  process.exit(1);
}

const filterIdx  = process.argv.indexOf('--sprite');
const filterName = filterIdx !== -1 ? process.argv[filterIdx + 1] : null;

const tagsArg = process.argv.find(a => a === '--tags' || a.startsWith('--tags='));
const filterTags = tagsArg
  ? (tagsArg.includes('=') ? tagsArg.split('=')[1] : process.argv[process.argv.indexOf('--tags') + 1])
      .split(',').map(t => t.trim()).filter(Boolean)
  : null;

const manifest    = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
const host        = manifest.host  || 'http://localhost:11434';
const model       = manifest.model || 'x/flux2-klein';
const manifestDir = path.dirname(path.resolve(manifestPath));

function post(url, body) {
  return new Promise((resolve, reject) => {
    const u    = new URL(url);
    const data = JSON.stringify(body);
    const req  = http.request({
      hostname: u.hostname,
      port:     u.port || 80,
      path:     u.pathname,
      method:   'POST',
      headers:  { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) },
    }, res => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => {
        try   { resolve(JSON.parse(Buffer.concat(chunks).toString())); }
        catch (e) { reject(new Error('Bad JSON from Ollama')); }
      });
    });
    req.on('error', err => reject(new Error(`Cannot reach Ollama at ${host}: ${err.message}`)));
    req.write(data);
    req.end();
  });
}

async function generate(sprite) {
  process.stdout.write(`  ${sprite.name} ... `);
  const genOpts = sprite.w && sprite.h ? { width: sprite.w, height: sprite.h } : {};
  const res = await post(`${host}/api/generate`, { model, prompt: sprite.prompt, stream: false, options: genOpts });
  if (!res.image) throw new Error(`No image in response for "${sprite.name}"`);
  const outPath = path.resolve(manifestDir, sprite.out);
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  const buf = Buffer.from(res.image, 'base64');
  fs.writeFileSync(outPath, buf);
  const originalKb = Math.round(buf.length / 1024);

  // Optional center-crop to strip flux's baked dark edge/vignette.
  // sprite.bleed is the fraction trimmed off each side before resize (e.g. 0.08 = 8%).
  if (sprite.bleed && sprite.bleed > 0) {
    const info = execSync(`sips -g pixelWidth -g pixelHeight "${outPath}"`).toString();
    const srcW = parseInt(info.match(/pixelWidth:\s*(\d+)/)[1], 10);
    const srcH = parseInt(info.match(/pixelHeight:\s*(\d+)/)[1], 10);
    const cropW = Math.round(srcW * (1 - 2 * sprite.bleed));
    const cropH = Math.round(srcH * (1 - 2 * sprite.bleed));
    execSync(`sips -c ${cropH} ${cropW} "${outPath}" --out "${outPath}"`, { stdio: 'ignore' });
  }

  if (sprite.w && sprite.h) {
    // Aspect-fill: crop to target ratio first so the resize is a clean scale, not a squish.
    const info = execSync(`sips -g pixelWidth -g pixelHeight "${outPath}"`).toString();
    const srcW = parseInt(info.match(/pixelWidth:\s*(\d+)/)[1], 10);
    const srcH = parseInt(info.match(/pixelHeight:\s*(\d+)/)[1], 10);
    const targetRatio = sprite.w / sprite.h;
    const srcRatio    = srcW / srcH;
    if (Math.abs(srcRatio - targetRatio) > 0.01) {
      const cropW = srcRatio > targetRatio ? Math.round(srcH * targetRatio) : srcW;
      const cropH = srcRatio > targetRatio ? srcH : Math.round(srcW / targetRatio);
      execSync(`sips -c ${cropH} ${cropW} "${outPath}" --out "${outPath}"`, { stdio: 'ignore' });
    }
    // sips -z <height> <width> (sips takes rows then cols)
    execSync(`sips -z ${sprite.h} ${sprite.w} "${outPath}" --out "${outPath}"`, { stdio: 'ignore' });
    const finalKb = Math.round(fs.statSync(outPath).size / 1024);
    const bleedTag = sprite.bleed ? ` bleed=${sprite.bleed}` : '';
    console.log(`saved → ${sprite.out}  (${sprite.w}×${sprite.h}px, ${originalKb}kb → ${finalKb}kb${bleedTag})`);
  } else {
    console.log(`saved → ${sprite.out}  (${originalKb}kb, no resize — add w/h to manifest)`);
  }
}

async function main() {
  let sprites = manifest.sprites;

  if (filterName) {
    sprites = sprites.filter(s => s.name === filterName);
  } else if (filterTags) {
    // OR filter: sprite must have at least one listed tag
    sprites = sprites.filter(s => {
      const st = s.tags || [];
      return filterTags.some(t => st.includes(t));
    });
  }

  if (!sprites.length) {
    const hint = filterName ? `matching name "${filterName}"`
      : filterTags ? `matching tags [${filterTags.join(', ')}]` : '';
    console.error(`No sprites found${hint ? ' ' + hint : ''}`);
    if (filterTags) {
      // Show available tags as a hint
      const all = new Set(manifest.sprites.flatMap(s => s.tags || []));
      console.error(`Available tags: ${[...all].sort().join(', ')}`);
    }
    process.exit(1);
  }

  console.log(`Generating ${sprites.length} sprite(s)  host=${host}  model=${model}\n`);
  for (const sprite of sprites) {
    await generate(sprite);
  }
  console.log('\nDone.');
}

main().catch(err => { console.error('\nError:', err.message); process.exit(1); });
