import { access, readdir, readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
const appRoot = resolve(import.meta.dirname, '..');
export const previewPreset = 'route-overview-v1';
export const previewSize = { width: 640, height: 400 };

export function webpSize(bytes) {
  if (
    bytes.toString('ascii', 0, 4) !== 'RIFF' ||
    bytes.toString('ascii', 8, 12) !== 'WEBP'
  )
    throw new Error('Invalid WebP header');
  for (let offset = 12; offset + 8 <= bytes.length;) {
    const kind = bytes.toString('ascii', offset, offset + 4);
    const length = bytes.readUInt32LE(offset + 4);
    const data = offset + 8;
    if (data + length > bytes.length) break;
    if (kind === 'VP8X' && length >= 10)
      return {
        width: bytes.readUIntLE(data + 4, 3) + 1,
        height: bytes.readUIntLE(data + 7, 3) + 1,
      };
    if (
      kind === 'VP8 ' &&
      length >= 10 &&
      bytes.toString('hex', data + 3, data + 6) === '9d012a'
    )
      return {
        width: bytes.readUInt16LE(data + 6) & 0x3fff,
        height: bytes.readUInt16LE(data + 8) & 0x3fff,
      };
    if (kind === 'VP8L' && length >= 5 && bytes[data] === 0x2f) {
      const bits = bytes.readUInt32LE(data + 1);
      return {
        width: (bits & 0x3fff) + 1,
        height: ((bits >>> 14) & 0x3fff) + 1,
      };
    }
    offset = data + length + (length % 2);
  }
  throw new Error('Missing WebP dimensions');
}

export async function readPreviewManifest(directory) {
  let text;
  try {
    text = await readFile(resolve(directory, 'previews.json'), 'utf8');
  } catch (error) {
    if (error.code === 'ENOENT') return { version: 1, images: {} };
    throw error;
  }
  const manifest = JSON.parse(text);
  if (
    manifest.version !== 1 ||
    !manifest.images ||
    typeof manifest.images !== 'object' ||
    Array.isArray(manifest.images)
  )
    throw new Error('Invalid menu preview manifest');
  return manifest;
}
// Generated from CPU route models at dev/build time. The menu never imports worlds.
export async function menuCatalog({
  root = appRoot,
  loadModule = (path) => import(pathToFileURL(path)),
  warn = console.warn,
} = {}) {
  const directory = resolve(root, 'public/assets/menu');
  const manifest = await readPreviewManifest(directory);
  const entries = [];
  for (const folder of await readdir(resolve(root, 'src/levels'), {
    withFileTypes: true,
  })) {
    if (!folder.isDirectory()) continue;
    const dir = resolve(root, 'src/levels', folder.name);
    if (
      !(await access(resolve(dir, 'metadata.js')).then(
        () => true,
        () => false,
      ))
    )
      continue;
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
    const routeSignature = createHash('sha256')
      .update(
        JSON.stringify({
          length: track.finishDistance ?? track.length,
          closed: track.closed !== false,
          xy,
        }),
      )
      .digest('hex')
      .slice(0, 16);
    const file = `${meta.id}.webp`;
    const record = manifest.images[meta.id];
    if (
      record &&
      (record.file !== file ||
        record.width !== previewSize.width ||
        record.height !== previewSize.height)
    )
      throw new Error(`Invalid menu preview record: ${meta.id}`);
    let bytes;
    try {
      bytes = await readFile(resolve(directory, file));
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
    if (bytes) {
      const size = webpSize(bytes);
      if (
        size.width !== previewSize.width ||
        size.height !== previewSize.height
      )
        throw new Error(
          `Menu preview ${file} must be 640×400; got ${size.width}×${size.height}`,
        );
      if (
        !record ||
        record.preset !== previewPreset ||
        (record.routeSignature && record.routeSignature !== routeSignature)
      )
        warn(
          `Menu preview ${meta.id} may be outdated. Refresh with npm run previews -- ${meta.id}; keeping the saved image.`,
        );
    } else if (record) {
      warn(`Missing menu preview ${file}; using its route outline.`);
    }
    entries.push({
      id: meta.id,
      name: meta.name,
      length: track.finishDistance ?? track.length,
      closed: track.closed !== false,
      path:
        xy.map((p, i) => `${i ? 'L' : 'M'}${p.join(',')}`).join(' ') +
        (track.closed === false ? '' : ' Z'),
      start: xy[0],
      routeSignature,
      preview: bytes ? `assets/menu/${file}` : null,
    });
  }
  return entries;
}
