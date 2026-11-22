import { stat } from 'node:fs/promises';
import { resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { captureShipArt } from './ship-art-studio.mjs';

const appRoot = resolve(import.meta.dirname, '..');
const shipIds = ['kestrel', 'shrike', 'bastion', 'needle'];
const viewIds = ['front', 'aft', 'detail', 'bow'];
const { values } = parseArgs({
  options: {
    ships: { type: 'string', default: 'kestrel' },
    views: { type: 'string', default: 'front,aft,detail' },
    quality: { type: 'string', default: 'high' },
    size: { type: 'string', default: '1100x800' },
    label: { type: 'string' },
    baseline: { type: 'string' },
    candidate: { type: 'string' },
    preview: { type: 'boolean' },
    'detail-center': { type: 'string' },
    'detail-span': { type: 'string' },
    help: { type: 'boolean' },
  },
});

if (values.help) {
  console.log(`Usage: VN_URL=<dev-server> node tools/ship-art-capture.mjs [options]
  --ships ${shipIds.join(',')}  Default: kestrel
  --views ${viewIds.join(',')}           Default: front,aft,detail
  --quality high|low|both                 Default: high
  --size WIDTHxHEIGHT                     Default: 1100x800
  --label NAME                             Output under .experiments/ship-art/NAME/
  --baseline PATH                         Use a saved GLB instead of the production asset
  --candidate PATH                        Capture a local GLB beside the baseline
  --preview                               Use the selected ship's Blender --preview export
  --detail-center=X,Y,Z --detail-span N    Override close-up framing in model metres

GLB and close-up overrides require one ship. VN_URL defaults to http://127.0.0.1:5179.`);
  process.exit(0);
}

function select(value, options, label) {
  const ids = [...new Set(value.split(',').map((id) => id.trim()))];
  if (ids.some((id) => !options.includes(id)))
    throw new Error(`Choose ${label} from ${options.join(', ')}.`);
  return ids;
}

async function glbPath(path) {
  if (!path) return;
  const file = resolve(path);
  const info = await stat(file).catch((error) => {
    if (error.code !== 'ENOENT') throw error;
  });
  if (!/\.glb$/i.test(file) || !info?.isFile())
    throw new Error(`Expected an existing GLB file at ${file}.`);
  return file;
}

const ships = select(values.ships, shipIds, 'ships');
const views = select(values.views, viewIds, 'views');
const qualities =
  values.quality === 'both' ? ['high', 'low'] : [values.quality];
if (qualities.some((quality) => !['high', 'low'].includes(quality)))
  throw new Error('Choose quality high, low or both.');

const size = /^(\d+)x(\d+)$/.exec(values.size);
const width = Number(size?.[1]);
const height = Number(size?.[2]);
if (
  !Number.isSafeInteger(width) ||
  !Number.isSafeInteger(height) ||
  width < 320 ||
  height < 240
)
  throw new Error('Choose a viewport of at least 320x240.');

const center = values['detail-center'];
const span = values['detail-span'];
let detail;
if (center !== undefined || span !== undefined) {
  const fields = center?.split(',');
  const coordinates = fields?.map(Number);
  if (
    !fields ||
    fields.length !== 3 ||
    !fields.every((field) => field.trim()) ||
    !coordinates.every(Number.isFinite) ||
    !Number.isFinite(Number(span)) ||
    Number(span) <= 0
  )
    throw new Error(
      'Supply a three-coordinate --detail-center and a positive --detail-span.',
    );
  if (!views.some((view) => view === 'detail' || view === 'bow'))
    throw new Error(
      'Select a detail or bow view to use custom close-up framing.',
    );
  detail = { center: coordinates, span: Number(span) };
}
if (
  ships.length !== 1 &&
  (values.baseline || values.candidate || values.preview || detail)
)
  throw new Error(
    'Choose one ship when supplying a GLB or custom close-up framing.',
  );
if (values.preview && values.candidate)
  throw new Error('Choose either --preview or --candidate.');

const [ship] = ships;
const previewPath =
  ship === 'kestrel'
    ? '.experiments/kestrel-material-preview/kestrel.glb'
    : `.experiments/fleet-material-preview/${ship}/${ship}.glb`;
const [baseline, candidate] = await Promise.all([
  glbPath(values.baseline),
  glbPath(values.preview ? resolve(appRoot, previewPath) : values.candidate),
]);
const label = values.label ?? (candidate ? 'comparison' : 'baseline');
if (!/^[a-zA-Z0-9][a-zA-Z0-9_-]*$/.test(label))
  throw new Error('Use letters, numbers, hyphens or underscores in --label.');
const output = resolve(appRoot, '.experiments/ship-art', label);
const variants = [{ name: 'baseline', file: baseline }];
if (candidate) variants.push({ name: 'candidate', file: candidate });
const captures = ships.flatMap((id) =>
  qualities.flatMap((quality) =>
    variants.map(({ name, file }) => ({
      id,
      quality,
      output: resolve(output, name),
      file,
      detail,
    })),
  ),
);

await captureShipArt({
  base: process.env.VN_URL ?? 'http://127.0.0.1:5179',
  width,
  height,
  views,
  captures,
});
