#!/usr/bin/env node
// probe.js — check what capabilities are available at runtime
//
// Usage:
//   node tools/probe.js          human-readable output
//   node tools/probe.js --json   machine-readable JSON (for scaffolder)

const http = require('http');

const host     = process.env.OLLAMA_HOST || 'http://localhost:11434';
const jsonMode = process.argv.includes('--json');

function get(url, timeoutMs = 2000) {
  return new Promise(resolve => {
    const u   = new URL(url);
    const req = http.get({
      hostname: u.hostname,
      port:     u.port || 80,
      path:     u.pathname,
      timeout:  timeoutMs,
    }, res => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => {
        try   { resolve(JSON.parse(Buffer.concat(chunks).toString())); }
        catch { resolve(null); }
      });
    });
    req.on('error',   () => resolve(null));
    req.on('timeout', () => { req.destroy(); resolve(null); });
  });
}

async function probeOllama() {
  const result = await get(`${host}/api/tags`);
  if (!result) return { available: false, host };
  const models    = (result.models || []).map(m => m.name);
  const hasImageGen = models.some(m => /flux/i.test(m));
  return { available: true, host, models, hasImageGen };
}

async function main() {
  const ollama = await probeOllama();

  const capabilities = { ollama };

  if (jsonMode) {
    process.stdout.write(JSON.stringify(capabilities, null, 2) + '\n');
    return;
  }

  console.log('Capabilities:\n');
  if (ollama.available) {
    const imgTag = ollama.hasImageGen ? '  image-gen: ✓' : '  image-gen: ✗ (no flux model loaded)';
    console.log(`  ollama    ✓  ${ollama.host}`);
    console.log(`  models    ${ollama.models.join(', ') || '(none)'}`);
    console.log(imgTag);
  } else {
    console.log(`  ollama    ✗  not reachable at ${ollama.host}`);
    console.log(`  image-gen ✗`);
  }
}

main();
