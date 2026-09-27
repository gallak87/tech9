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
function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd: root, stdio: 'inherit' });
    child.on('error', reject);
    child.on('exit', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${command} exited with code ${code}`));
    });
  });
}

try {
  await run(process.env.PYTHON_BIN || 'python3', [
    'src/modules/landscape/assets/art/generate_needles.py',
  ]);
  await run(executable, [
    '--background',
    '--factory-startup',
    '--python',
    'src/modules/landscape/assets/art/build_forest.py',
  ]);
} catch (error) {
  console.error(
    `Asset build failed: ${error.message}. Requires Python with Pillow and Blender; override PYTHON_BIN or BLENDER_PATH if needed.`,
  );
  process.exitCode = 1;
}
