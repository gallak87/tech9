import { cp, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// Preserve package-relative links and original metadata, without shipping source
// code, editable Blender projects, or another copy of the runtime art.
const WORLDKIT_NOTICES = [
  'NOTICE.md',
  'modules/living-forest/assets/provenance.json',
  'modules/opaline/assets/provenance.json',
  'modules/landscape/THREE-LICENSE.txt',
  'modules/landscape/assets/runtime/ASSETS.md',
  'modules/landscape/assets/runtime/textures/SOURCES.md',
  'modules/landscape/assets/art/sources/manifest.json',
  'modules/landscape/assets/art/asset-report.json',
  'modules/pond-water/THREE-LICENSE.txt',
  'modules/pond-water/assets/LICENSE.md',
  'modules/weather/NOTICE.md',
];

export async function copyWorldkitNotices(notices, { levels }) {
  if (!levels.some((id) => ['vesper-forest', 'opaline'].includes(id)))
    return [];
  const packageRoot = dirname(
    fileURLToPath(import.meta.resolve('@worldkit/environment/package.json')),
  );
  for (const path of WORLDKIT_NOTICES) {
    const target = resolve(notices, 'worldkit', path);
    await mkdir(dirname(target), { recursive: true });
    await cp(resolve(packageRoot, path), target);
  }
  return WORLDKIT_NOTICES.map((path) => `worldkit/${path}`);
}
