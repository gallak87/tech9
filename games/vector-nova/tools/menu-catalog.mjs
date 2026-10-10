import { readdir, readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve, relative } from 'node:path';
import { pathToFileURL } from 'node:url';
const root = resolve(import.meta.dirname, '..');
async function files(dir) {
  const entries = await readdir(dir, { withFileTypes: true }).catch(() => []);
  return (
    await Promise.all(
      entries.map((e) =>
        e.isDirectory() ? files(resolve(dir, e.name)) : resolve(dir, e.name),
      ),
    )
  )
    .flat()
    .sort();
}
async function digest(paths) {
  const hash = createHash('sha256');
  for (const path of paths) {
    hash.update(relative(root, path));
    hash.update(await readFile(path));
  }
  return hash.digest('hex').slice(0, 16);
}
// Generated from CPU route models at dev/build time. The menu never imports worlds.
export async function menuCatalog({
  loadModule = (path) => import(pathToFileURL(path)),
} = {}) {
  // Local inspection captures are not rendered inputs and differ by checkout.
  const shared = (await files(resolve(root, 'src'))).filter(
    (p) =>
      !/\/(levels|frontend|audio|ui|evidence)\//.test(p) && !/\.test\./.test(p),
  );
  const ships = await files(resolve(root, 'public/assets/ships'));
  const sharedHash = await digest([
    ...shared,
    ...ships,
    resolve(root, 'tools/capture-menu-previews.mjs'),
  ]);
  const manifest = JSON.parse(
    await readFile(
      resolve(root, 'public/assets/menu/previews.json'),
      'utf8',
    ).catch(() => '{}'),
  );
  const previews = new Set(await files(resolve(root, 'public/assets/menu')));
  const entries = [];
  for (const folder of await readdir(resolve(root, 'src/levels'), {
    withFileTypes: true,
  })) {
    if (!folder.isDirectory()) continue;
    const dir = resolve(root, 'src/levels', folder.name);
    if (!(await files(dir)).includes(resolve(dir, 'metadata.js'))) continue;
    const { default: meta } = await loadModule(resolve(dir, 'metadata.js'));
    const model = await loadModule(resolve(dir, 'track/model.js'));
    const factory = Object.entries(model).find(([key]) =>
      /^create.*Track$/.test(key),
    )?.[1];
    if (!factory) throw new Error(`Menu route model missing: ${meta.id}`);
    const track = factory();
    const pts = Array.from({ length: 181 }, (_, i) =>
      track.sample((i * track.length) / 180).position.clone(),
    );
    const xs = pts.map((p) => p.x),
      zs = pts.map((p) => p.z);
    const minX = Math.min(...xs),
      minZ = Math.min(...zs);
    const width = Math.max(...xs) - minX,
      height = Math.max(...zs) - minZ;
    const scale = Math.min(260 / Math.max(1, width), 150 / Math.max(1, height));
    const xy = pts.map((p) => [
      +(150 + (p.x - minX - width / 2) * scale).toFixed(1),
      +(95 + (p.z - minZ - height / 2) * scale).toFixed(1),
    ]);
    const levelFiles = [
      ...(await files(dir)),
      ...(await files(resolve(root, 'public/assets/levels', meta.id))),
    ].filter((p) => !/\/audio\/|\.test\./.test(p));
    const fingerprint = `${sharedHash}-${await digest(levelFiles)}`;
    entries.push({
      id: meta.id,
      name: meta.name,
      length: track.finishDistance ?? track.length,
      closed: track.closed !== false,
      path:
        xy.map((p, i) => `${i ? 'L' : 'M'}${p.join(',')}`).join(' ') +
        (track.closed === false ? '' : ' Z'),
      start: xy[0],
      fingerprint,
      preview:
        manifest[meta.id] === fingerprint &&
        previews.has(resolve(root, 'public/assets/menu', `${meta.id}.webp`))
          ? `assets/menu/${meta.id}.webp`
          : null,
    });
  }
  return entries;
}
