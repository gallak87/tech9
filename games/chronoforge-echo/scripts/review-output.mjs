import {createHash} from 'node:crypto';
import {mkdirSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';

// A checkout-specific temporary directory lets campaign checks share fresh
// fixtures without storing screenshots, reports or save snapshots in the repo.
const checkout = fileURLToPath(new URL('../', import.meta.url));
const id = createHash('sha256').update(checkout).digest('hex').slice(0, 12);
export const reviewRoot = path.join(tmpdir(), `chronoforge-echo-review-${id}`) + path.sep;
export const reviewURL = (relative = '') => new URL(relative, pathToFileURL(reviewRoot));

const invoked = process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;
if (invoked && process.argv.includes('--clean')) {
  rmSync(reviewRoot, {recursive: true, force: true});
  console.log('Removed temporary Echo review output.');
} else {
  mkdirSync(reviewRoot, {recursive: true});
  if (invoked) console.log(reviewRoot);
}
