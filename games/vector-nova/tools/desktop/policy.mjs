import { DEMO_REQUIREMENTS } from '../../src/progression/edition.js';

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
export function includePublic(path, edition) {
  const policy = editionPolicy(edition);
  if (/\.(?:map|blend|py|md|wav)$/.test(path) || path.endsWith('previews.json'))
    return false;
  if (
    /^assets\/rewards\/icons-v2\/(?:(?:speed|acceleration|handling|braking|boost|toughness)-[123]|equipment-(?:jump|injector|slipstream|deflector|stabilizer|lance)|ship-(?:bastion|needle|kestrel)|exotic-slot)\.png$/.test(
      path,
    )
  )
    return (
      edition === 'full' ||
      Object.hasOwn(DEMO_REQUIREMENTS, path.split('/').at(-1).slice(0, -4))
    );
  if (policy.levels.some((id) => path.startsWith(`assets/levels/${id}/`)))
    return true;
  if (policy.levels.some((id) => path === `assets/menu/${id}.webp`))
    return true;
  if (policy.ships.some((id) => path === `assets/menu/ships/${id}.jpg`))
    return true;
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
  /\/src\/(?:core\/(?:fly-camera|review-camera)\.js|ui\/dev-tools\.js|audio\/sound-panel\.js|ships\/pickup-inspector\.js|progression\/developer(?:-runtime)?\.js)/;
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
