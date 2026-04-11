#!/usr/bin/env node
// sprite-gen.js — generate sprites via Ollama image gen
//
// Usage:
//   node tools/sprite-gen.js <manifest.json>
//   node tools/sprite-gen.js <manifest.json> --sprite player
//
// Defaults: http://localhost:11434, model x/flux2-klein

const fs   = require('fs');
const path = require('path');
const http = require('http');

const manifestPath = process.argv[2];
if (!manifestPath) {
  console.error('Usage: node tools/sprite-gen.js <manifest.json> [--sprite <name>]');
  process.exit(1);
}

const filterIdx = process.argv.indexOf('--sprite');
const filterName = filterIdx !== -1 ? process.argv[filterIdx + 1] : null;

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
  const res = await post(`${host}/api/generate`, { model, prompt: sprite.prompt, stream: false });
  if (!res.image) throw new Error(`No image in response for "${sprite.name}"`);
  const outPath = path.resolve(manifestDir, sprite.out);
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, Buffer.from(res.image, 'base64'));
  console.log(`saved → ${sprite.out}`);
}

async function main() {
  const sprites = filterName
    ? manifest.sprites.filter(s => s.name === filterName)
    : manifest.sprites;

  if (!sprites.length) {
    console.error(`No sprites found${filterName ? ` matching "${filterName}"` : ''}`);
    process.exit(1);
  }

  console.log(`Generating ${sprites.length} sprite(s)  host=${host}  model=${model}\n`);
  for (const sprite of sprites) {
    await generate(sprite);
  }
  console.log('\nDone.');
}

main().catch(err => { console.error('\nError:', err.message); process.exit(1); });
