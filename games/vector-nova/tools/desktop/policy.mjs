import { DEMO_REQUIREMENTS } from '../../src/progression/edition.js';
import { COURSE_IDS } from '../../src/levels/access.js';
import { EDITOR_BIOMES } from '../../src/editor/biomes.js';
import { environmentThumbnailPath } from '../../src/editor/environment-thumbnails.js';

export const demoLevels = ['halcyon', 'nacre'];
export const fullLevels = [
  'halcyon',
  'orbital',
  'nacre',
  'vesper-forest',
  'glasswake',
  'cindercoil',
  'saffron',
  'umbra',
  'zephyr',
  'helion',
  'shatterline',
  'worldspire',
  'nightweir',
  'colossus',
  'ravel',
  'nomad',
  'oriel',
  ...COURSE_IDS,
];
export function editionPolicy(edition) {
  if (!['demo', 'full'].includes(edition))
    throw new Error('Edition must be demo or full');
  return Object.freeze({
    edition,
    name: edition === 'demo' ? 'Vector Nova Demo' : 'Vector Nova',
    executable: edition === 'demo' ? 'VectorNovaDemo' : 'VectorNova',
    id: `com.vectornova.${edition}`,
    levels: edition === 'demo' ? demoLevels : fullLevels,
    ships:
      edition === 'demo'
        ? ['kestrel']
        : ['kestrel', 'shrike', 'bastion', 'needle'],
  });
}
// Borrowed materials are individual files/directories, never complete worlds.
const demoShared = [
  'assets/levels/helion/ceramic/',
  'assets/levels/nightweir/fired-brick-v1.png',
  'assets/levels/nightweir/zinc-roof-v1.png',
];
const workshopAssets = new Set([
  ...EDITOR_BIOMES.flatMap(({ id, presets }) =>
    presets.map((preset) => environmentThumbnailPath(id, preset.id)),
  ),
  'assets/editor/glasswake/glacier-kit.glb',
  'assets/editor/nightweir/nightweir-editor-kit.glb',
  ...[
    'forest-granite-diff.jpg',
    'rock-boulder-normal-1k.jpg',
    'leaf-spray-v1.png',
    'worn-enamel-v1.png',
    'rolled-steel-v1.png',
    'silver-bark-color-v1.png',
  ].map((name) => `assets/editor/surfaces/${name}`),
]);
export function includePublic(path, edition) {
  const policy = editionPolicy(edition);
  if (/\.(?:map|blend|py|md|wav)$/.test(path) || path.endsWith('previews.json'))
    return false;
  if (path.startsWith('assets/editor/'))
    return edition === 'full' && workshopAssets.has(path);
  if (/^assets\/completion\//.test(path))
    return (
      edition === 'full' &&
      /^assets\/completion\/shatterline-v1\/(?:(?:kestrel|shrike|bastion|needle)\.json\.gz|manifest\.json)$/.test(
        path,
      )
    );
  if (
    /^assets\/rewards\/icons-v2\/(?:(?:speed|acceleration|handling|braking|boost|toughness)-[123]|equipment-(?:jump|injector|slipstream|deflector|stabilizer|lance)|ship-(?:bastion|needle|kestrel)|exotic-slot)\.png$/.test(
      path,
    )
  )
    return (
      edition === 'full' ||
      Object.hasOwn(DEMO_REQUIREMENTS, path.split('/').at(-1).slice(0, -4))
    );
  if (
    policy.levels.some((id) =>
      path.startsWith(
        `assets/levels/${id === 'zephyr-skywell' ? 'launchworks' : id}/`,
      ),
    )
  )
    return true;
  if (policy.levels.some((id) => path === `assets/menu/${id}.webp`))
    return true;
  if (policy.ships.some((id) => path === `assets/menu/ships/${id}.jpg`))
    return true;
  if (path === 'assets/menu/cups/encore-trophy.webp') return edition === 'full';
  if (
    /^assets\/menu\/cups\/(founders|frontier|horizon|apex)-(trophy|background)\.webp$/.test(
      path,
    )
  )
    return edition === 'full' || path.startsWith('assets/menu/cups/founders-');
  if (policy.ships.some((id) => path.startsWith(`assets/ships/${id}/`)))
    return true;
  if (
    path.startsWith('assets/ships/rivals/') ||
    path.startsWith('assets/ships/decoder/')
  )
    return true;
  return (
    edition === 'demo' &&
    demoShared.some((entry) =>
      entry.endsWith('/') ? path.startsWith(entry) : entry === path,
    )
  );
}
export const forbiddenModules =
  /\/(?:src\/(?:core\/(?:fly-camera|review-camera)\.js|ui\/dev-tools\.js|audio\/sound-panel\.js|ships\/pickup-inspector\.js|progression\/developer(?:-runtime)?\.js)|tools\/(?:completion-capture|capture-completion-runs)\.mjs)/;
export const forbiddenRendererText = [
  '__VN',
  'devSetup',
  'setupDeveloperRace',
  'createDeveloperSession',
  'openDevTools',
  'getArtPassURL',
  'getReplay()',
  'playReplay(',
  'COPY VIEW LINK',
  'DEV TOOLS · P',
];
