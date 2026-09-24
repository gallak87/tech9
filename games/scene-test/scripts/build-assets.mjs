import { spawn } from 'node:child_process';
import { access } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const candidates = [
  process.env.BLENDER_PATH,
  process.env.BLENDER_BIN,
  '/Applications/Blender.app/Contents/MacOS/Blender',
].filter(Boolean);
let executable = 'blender';
for (const candidate of candidates) {
  try {
    await access(candidate);
    executable = candidate;
    break;
  } catch {
    // Fall back to Blender on PATH when the application is installed elsewhere.
  }
}
const child = spawn(
  executable,
  ['--background', '--factory-startup', '--python', 'art/build_forest.py'],
  {
    cwd: root,
    stdio: 'inherit',
  },
);
child.on('error', (error) => {
  console.error(
    `Could not launch Blender: ${error.message}. Set BLENDER_PATH.`,
  );
  process.exitCode = 1;
});
child.on('exit', (code) => {
  process.exitCode = code ?? 1;
});
