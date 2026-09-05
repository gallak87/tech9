#!/usr/bin/env node
// ref-gen.mjs — generate 3D-reconstruction reference images via Ollama, then
// key the chroma background to a real alpha channel.
//
//   node docs/phase2/ref-gen.mjs docs/phase2/reference-manifest.json
//   node docs/phase2/ref-gen.mjs docs/phase2/reference-manifest.json --only kaida
//
// WHY THE KEY STEP EXISTS
// TRELLIS (and every other image-to-3D) masks the subject before it reconstructs.
// Its rule: "If the image has alpha channel, it will be used as the mask.
// Otherwise, we use rembg." Flux emits RGB with no alpha, so rembg runs — and
// rembg cannot separate navy leggings and black boots from a black background.
// The first run of this project returned a mesh of the sword alone.
//
// So: generate on chroma green (no part of any hero is green), key it here,
// hand the model a silhouette it cannot get wrong.
//
// No dependencies. PNG codec is inline — 8-bit, non-interlaced, colourType 2/6,
// which is everything flux emits.

import fs   from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

const argv    = process.argv.slice(2);
const onlyIdx  = argv.indexOf('--only');
const only     = onlyIdx !== -1 ? argv[onlyIdx + 1] : null;
// Drop flags and their values, so the manifest can sit anywhere in the line.
const manifestPath = argv.filter((a, i) => !a.startsWith('--') && i !== onlyIdx + 1)[0];
if (!manifestPath) {
  console.error('usage: node ref-gen.mjs <manifest.json> [--only <name>]');
  process.exit(1);
}

const manifest    = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
const manifestDir = path.dirname(path.resolve(manifestPath));
const host        = manifest.host  || 'http://localhost:11434';
const model       = manifest.model || 'x/flux2-klein:latest';

// ── PNG ──────────────────────────────────────────────────────────────────────
const CRC = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();

function crc32(buf) {
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = CRC[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);            len.writeUInt32BE(data.length, 0);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);            crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([len, body, crc]);
}

const paeth = (a, b, c) => {
  const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
  return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
};

/** → { width, height, channels, pixels } with filters undone. */
function decodePNG(buf) {
  if (buf.readUInt32BE(0) !== 0x89504e47) throw new Error('not a PNG');
  let pos = 8, ihdr = null;
  const idat = [];
  while (pos < buf.length) {
    const len  = buf.readUInt32BE(pos);
    const type = buf.toString('ascii', pos + 4, pos + 8);
    const data = buf.subarray(pos + 8, pos + 8 + len);
    if      (type === 'IHDR') ihdr = { width: data.readUInt32BE(0), height: data.readUInt32BE(4), depth: data[8], colorType: data[9], interlace: data[12] };
    else if (type === 'IDAT') idat.push(data);
    else if (type === 'IEND') break;
    pos += 12 + len;
  }
  if (!ihdr) throw new Error('no IHDR');
  if (ihdr.depth !== 8)   throw new Error(`bit depth ${ihdr.depth} unsupported (need 8)`);
  if (ihdr.interlace)     throw new Error('interlaced PNG unsupported');

  const channels = { 0: 1, 2: 3, 4: 2, 6: 4 }[ihdr.colorType];
  if (!channels) throw new Error(`colourType ${ihdr.colorType} unsupported`);

  const raw    = zlib.inflateSync(Buffer.concat(idat));
  const stride = ihdr.width * channels;
  const out    = Buffer.alloc(ihdr.height * stride);

  let p = 0;
  for (let y = 0; y < ihdr.height; y++) {
    const ft   = raw[p++];
    const line = raw.subarray(p, p + stride); p += stride;
    const cur  = out.subarray(y * stride, (y + 1) * stride);
    const prev = y > 0 ? out.subarray((y - 1) * stride, y * stride) : null;
    for (let x = 0; x < stride; x++) {
      const a = x >= channels ? cur[x - channels] : 0;
      const b = prev ? prev[x] : 0;
      const c = prev && x >= channels ? prev[x - channels] : 0;
      let v = line[x];
      if      (ft === 1) v = (v + a) & 255;
      else if (ft === 2) v = (v + b) & 255;
      else if (ft === 3) v = (v + ((a + b) >> 1)) & 255;
      else if (ft === 4) v = (v + paeth(a, b, c)) & 255;
      else if (ft !== 0) throw new Error(`bad filter type ${ft} on row ${y}`);
      cur[x] = v;
    }
  }
  return { width: ihdr.width, height: ihdr.height, channels, pixels: out };
}

function encodePNG(rgba, w, h) {
  const stride = w * 4;
  const raw = Buffer.alloc(h * (stride + 1));
  for (let y = 0; y < h; y++) {
    raw[y * (stride + 1)] = 0;                       // filter: none
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 6;                          // 8-bit RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// ── chroma key ───────────────────────────────────────────────────────────────
// Greenness = g - max(r, b). Chroma green scores ~255; magenta hair, cyan
// jacket, navy leggings and black boots all score at or below zero. That is the
// whole reason the background is green and not black — every other choice
// collides with something a hero is wearing.
//
// Soft ramp between `low` and `high` keeps edges antialiased instead of
// stair-stepping, which matters because the mask becomes the silhouette the
// reconstruction is built from.
function keyGreen(img, { low = 40, high = 110 } = {}) {
  const { width: w, height: h, channels: ch, pixels } = img;
  const rgba = Buffer.alloc(w * h * 4);
  let keyed = 0, partial = 0;

  for (let i = 0, o = 0; i < w * h; i++, o += 4) {
    const s = i * ch;
    let r = pixels[s], g = pixels[s + 1], b = pixels[s + 2];

    const gness = g - Math.max(r, b);
    let alpha;
    if      (gness <= low)  alpha = 255;
    else if (gness >= high) { alpha = 0; keyed++; }
    else { alpha = Math.round(255 * (1 - (gness - low) / (high - low))); partial++; }

    // Spill suppression: pull green back to the neighbouring channels so hair
    // and jacket edges don't carry a green fringe into the texture bake.
    if (gness > 0) g = Math.max(r, b);

    rgba[o] = r; rgba[o + 1] = g; rgba[o + 2] = b; rgba[o + 3] = alpha;
  }
  return { rgba, keyed, partial, total: w * h };
}

// ── ollama ───────────────────────────────────────────────────────────────────
async function generate(entry, prompt) {
  const body = {
    model, prompt, stream: false,
    options: entry.w && entry.h ? { width: entry.w, height: entry.h } : {},
  };
  const res = await fetch(`${host}/api/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`ollama ${res.status} ${res.statusText}`);
  const json = await res.json();
  if (!json.image) throw new Error('no `image` key in ollama response');
  return Buffer.from(json.image, 'base64');
}

// ── main ─────────────────────────────────────────────────────────────────────
// Every ref is rendered once per style variant. The painterly prefix is TUNED —
// it took many iterations against klein to land art worth keeping — so it is
// carried verbatim rather than rewritten. The plain variant exists to answer one
// question: does painterly styling help or hurt the reconstruction? Same seed of
// a prompt, same pose, same background, one word of medium changed.
const refs = manifest.refs.filter(e => !only || e.name === only);
if (!refs.length) {
  console.error(only ? `no ref named "${only}"` : 'manifest has no refs');
  process.exit(1);
}
const variants = manifest.variants?.length ? manifest.variants : [{ name: '', style: '' }];
const jobs = refs.flatMap(ref => variants.map(v => ({ ref, variant: v })));

console.log(`ref-gen · ${model} · ${refs.length} ref(s) × ${variants.length} variant(s) = ${jobs.length} render(s)\n`);
let failed = 0;

for (const { ref, variant } of jobs) {
  const label   = variant.name ? `${ref.name}-${variant.name}` : ref.name;
  const outPath = path.resolve(manifestDir, ref.out.replace(/\.png$/, variant.name ? `-${variant.name}.png` : '.png'));
  const prompt  = `${variant.style || ''}${ref.prompt}`;

  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  process.stdout.write(`  ${label.padEnd(20)} generating ... `);

  try {
    const t0  = Date.now();
    const png = await generate(ref, prompt);
    process.stdout.write(`${((Date.now() - t0) / 1000).toFixed(0)}s · keying ... `);

    const img = decodePNG(png);
    const { rgba, keyed, partial, total } = keyGreen(img, ref.key);
    fs.writeFileSync(outPath, encodePNG(rgba, img.width, img.height));

    const pct = (keyed / total) * 100;
    console.log(`${img.width}×${img.height}, ${pct.toFixed(0)}% keyed, ${partial} edge px`);

    // A silhouette outside this band means the key failed, and a bad mask is the
    // one input error image-to-3D cannot recover from. Keep the unkeyed render
    // ONLY here — it is the sole way to tell a bad render from a bad key, and
    // saving it every time is clutter for a case that mostly does not happen.
    if (pct < 15 || pct > 88) {
      const rawPath = outPath.replace(/\.png$/, '-raw.png');
      fs.writeFileSync(rawPath, png);
      console.log(pct < 15
        ? `     ⚠ only ${pct.toFixed(0)}% keyed — background probably isn't green.`
        : `     ⚠ ${pct.toFixed(0)}% keyed — the character may have been keyed away; raise key.low.`);
      console.log(`     unkeyed render saved → ${path.basename(rawPath)}`);
    }
  } catch (err) {
    failed++;
    console.log(`FAILED\n     ${err.message}`);
  }
}

console.log(`\n${jobs.length - failed}/${jobs.length} written → ${path.relative(process.cwd(), path.resolve(manifestDir, path.dirname(refs[0].out)))}/`);
process.exit(failed ? 1 : 0);
