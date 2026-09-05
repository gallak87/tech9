#!/usr/bin/env node
// Validate any .glb against the contract. Instant, no Blender.
//   npm run retry:check -- <file.glb>
import { validateFile } from '../contract.mjs';
const f = process.argv[2];
if (!f) { console.error('usage: npm run retry:check -- <file.glb>'); process.exit(2); }
const r = validateFile(f);
console.log(`${f}\n  ${JSON.stringify(r.report)}`);
r.errors.forEach(e => console.log('  ✗', e));
console.log(r.ok ? '  ✓ satisfies the contract' : `  ✗ ${r.errors.length} violation(s)`);
process.exit(r.ok ? 0 : 1);
