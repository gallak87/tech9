import { resolve } from 'node:path';
import { captureShipArt } from './ship-art-studio.mjs';

// Actual browser factories in the production inspection stage. Images are
// temporary comparison evidence; metrics go to stdout rather than reports.
const options = {
  out: '.experiments/boss-art/baseline',
  ships: 'goliath,wraith,bulwark,kestrel',
  views: 'front,aft',
  quality: 'high',
  size: '1100x800',
  asset: '',
};
for (let index = 2; index < process.argv.length; index++) {
  const argument = process.argv[index];
  if (argument === '--help') {
    console.log(
      'node tools/boss-art-capture.mjs [--out PATH] [--ships goliath,wraith,bulwark,kestrel] [--views front,aft,detail,intake,bow] [--quality high|low|both] [--size 1100x800] [--asset /served/path.glb]',
    );
    process.exit(0);
  }
  const [flag, inline] = argument.replace(/^--/, '').split('=');
  if (!Object.hasOwn(options, flag))
    throw new Error('Unknown capture option: ' + argument);
  options[flag] = inline ?? process.argv[++index];
}
const subjects = options.ships.split(',');
const views = options.views.split(',');
const qualities =
  options.quality === 'both' ? ['high', 'low'] : [options.quality];
const [width, height] = options.size.split('x').map(Number);
if (
  !subjects.every((id) =>
    ['goliath', 'wraith', 'bulwark', 'kestrel'].includes(id),
  ) ||
  !views.every((view) =>
    ['front', 'aft', 'detail', 'intake', 'bow'].includes(view),
  ) ||
  !qualities.every((quality) => ['high', 'low'].includes(quality)) ||
  !Number.isInteger(width) ||
  !Number.isInteger(height) ||
  width < 320 ||
  height < 240
)
  throw new Error('Invalid subject, view, quality or image size. See --help.');
const output = resolve(options.out);
await captureShipArt({
  base: process.env.VN_URL ?? 'http://127.0.0.1:5213',
  width,
  height,
  views,
  captures: subjects.flatMap((id) =>
    qualities.map((quality) => ({
      id,
      quality,
      output,
      asset: options.asset,
    })),
  ),
});
