import { mkdirSync, rmSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

// Disposable local output. Required source, assets and tests never live here.
export const reviewRoot = fileURLToPath(
  new URL('../.experiments/output/', import.meta.url),
);
export const reviewURL = (relative = '') =>
  new URL(relative, pathToFileURL(reviewRoot));

const invoked =
  process.argv[1] &&
  pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;
if (invoked && process.argv.includes('--clean')) {
  rmSync(reviewRoot, { recursive: true, force: true });
  console.log('Removed .experiments/output/.');
} else {
  mkdirSync(reviewRoot, { recursive: true });
  if (invoked) console.log(reviewRoot);
}
