import { mkdir, writeFile } from 'node:fs/promises';
import { Buffer } from 'node:buffer';
import { log } from 'node:console';
import { URL, fileURLToPath } from 'node:url';
import { score } from './score.mjs';
import { synthesize } from './synthesize.mjs';

const output = new URL(
  '../../../../public/assets/levels/halcyon/audio/',
  import.meta.url,
);
const result = synthesize(score);
const pcm = Buffer.from(result.pcm);
const header = Buffer.alloc(44);
header.write('RIFF', 0);
header.writeUInt32LE(36 + pcm.length, 4);
header.write('WAVEfmt ', 8);
header.writeUInt32LE(16, 16);
header.writeUInt16LE(1, 20);
header.writeUInt16LE(2, 22);
header.writeUInt32LE(score.sampleRate, 24);
header.writeUInt32LE(score.sampleRate * 4, 28);
header.writeUInt16LE(4, 32);
header.writeUInt16LE(16, 34);
header.write('data', 36);
header.writeUInt32LE(pcm.length, 40);
await mkdir(output, { recursive: true });
const target = new URL('blue-hour-preview.wav', output);
await writeFile(target, Buffer.concat([header, pcm]));
log(
  JSON.stringify({ output: fileURLToPath(target), ...result.stats }, null, 2),
);
