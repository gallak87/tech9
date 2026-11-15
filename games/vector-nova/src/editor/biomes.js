import { WORLD_PRESETS } from './world-presets.js';

// Data only: opening the picker never imports a campaign factory or loads assets.
const freeze = (value) => {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
};
const preset = (id, label, description, density = 0.8, waterLevel = -50) => ({
  id,
  label,
  description,
  density,
  waterLevel,
});
const road = (
  kind,
  colors,
  roughness = 0.65,
  metalness = 0.1,
  suspended = false,
) => ({
  kind,
  deck: colors[0],
  structure: colors[1],
  metal: colors[2],
  paint: colors[3],
  edge: colors[4],
  glow: colors[5],
  roughness,
  metalness,
  suspended,
});
const environment = (
  kind,
  colors,
  waterEnabled = false,
  treeDensity = 0,
  relief = 1,
) => ({
  kind,
  terrain: colors[0],
  rock: colors[1],
  water: colors[2],
  structure: colors[3],
  accent: colors[4],
  vegetation: colors[5],
  waterEnabled,
  treeDensity,
  relief,
});
const biome = (id, label, presets, roadStyle, world, background, fog = null) =>
  freeze({
    id,
    label,
    presets,
    road: roadStyle,
    environment: world,
    renderer: {
      background,
      fog: fog ? { color: fog[0], density: fog[1] } : null,
    },
  });

export const EDITOR_BIOMES = freeze([
  biome(
    'nightweir',
    'Nightweir',
    WORLD_PRESETS,
    road(
      'asphalt',
      ['#4d5a60', '#8f9997', '#735142', '#d5d8c4', '#293b42', '#f6ae63'],
      0.72,
      0.02,
    ),
    environment(
      'nightweir',
      ['#687568', '#7b8580', '#254d5a', '#987e68', '#b17d49', '#4a6751'],
      true,
      0.45,
    ),
    '#243a4a',
    ['#657682', 0.00038],
  ),
  biome(
    'halcyon',
    'Halcyon',
    [
      preset(
        'civic-v1',
        'Civic waterfront',
        'Pale civic districts, broad waterways and working promenades.',
        0.82,
        -28,
      ),
      preset(
        'garden-v1',
        'Garden districts',
        'Planted courts, parks and quieter canal neighborhoods.',
        0.78,
        -36,
      ),
    ],
    road(
      'asphalt',
      ['#657079', '#b4bec0', '#9caeb5', '#d8d6cc', '#30424c', '#ffdbac'],
      0.72,
      0.02,
    ),
    environment(
      'halcyon',
      ['#81917d', '#a1a89f', '#678b9c', '#d1d3c7', '#b78254', '#5c8060'],
      true,
      0.6,
      0.7,
    ),
    '#77899d',
    ['#8195af', 0.00025],
  ),
  biome(
    'orbital',
    'Asterion Orbital',
    [
      preset(
        'shipyard-v1',
        'Orbital shipyard',
        'Suspended service platforms, antenna fields and docking frames.',
        0.72,
      ),
      preset(
        'observatory-v1',
        'Deep-space observatory',
        'Sparse telescope arrays and monumental orbital structures.',
        0.58,
      ),
    ],
    road(
      'alloy',
      ['#546773', '#b6c5cb', '#748e9b', '#d9e7dc', '#263c4b', '#7bd9f2'],
      0.43,
      0.72,
      true,
    ),
    environment(
      'orbital',
      ['#1c2c3a', '#394e62', '#061522', '#abbac4', '#6dbed0', '#667b75'],
      false,
      0,
      0.5,
    ),
    '#03070d',
  ),
  biome(
    'nacre',
    'Nacre Tempest',
    [
      preset(
        'storm-archipelago-v1',
        'Storm archipelago',
        'Ocean platforms, pale islands and sheltered sea courts.',
        0.84,
        -8,
      ),
      preset(
        'open-water-v1',
        'Open-water stations',
        'Widely spaced marine structures across broad sea passages.',
        0.64,
        -12,
      ),
    ],
    road(
      'pearl',
      ['#d6d9cb', '#9ba5a1', '#195861', '#e5e6d4', '#438e95', '#e7ad67'],
      0.38,
      0.18,
    ),
    environment(
      'nacre',
      ['#657f7a', '#a9b6ad', '#2b6c7d', '#d0d5c6', '#bd9a64', '#668c75'],
      true,
      0.25,
      0.8,
    ),
    '#77899d',
    ['#8195af', 0.00025],
  ),
  biome(
    'vesper-forest',
    'Vesper Forest',
    [
      preset(
        'old-growth-v1',
        'Old-growth valleys',
        'Deep forest, rooted ridges and broad mossy clearings.',
        0.92,
        -28,
      ),
      preset(
        'river-groves-v1',
        'River groves',
        'Fern-rich groves, connected rivers and quieter woodland courts.',
        0.84,
        -20,
      ),
    ],
    road(
      'resin',
      ['#cb781e', '#ad8048', '#673715', '#efc675', '#71451b', '#ffc173'],
      0.3,
      0.08,
    ),
    environment(
      'vesper-forest',
      ['#3f6044', '#637465', '#365f65', '#a78c59', '#c38d3e', '#355e3d'],
      true,
      1,
      1.05,
    ),
    '#081722',
    ['#587b7b', 0.0006],
  ),
  biome(
    'glasswake',
    'Glasswake Comet',
    [
      preset(
        'glacier-v1',
        'Glacier fields',
        'Layered blue glaciers, snow terraces and crystal outcrops.',
        0.84,
        -36,
      ),
      preset(
        'frozen-shelf-v1',
        'Frozen shelves',
        'Broad ice shelves, narrow melt channels and sparse ice towers.',
        0.7,
        -28,
      ),
    ],
    road(
      'crystal',
      ['#a5c8dc', '#829399', '#436a87', '#e0f5ed', '#9dc2d8', '#acdfff'],
      0.24,
      0.12,
    ),
    environment(
      'glasswake',
      ['#b8ced5', '#7fa9bd', '#3b718c', '#c2dce1', '#7eb5d8', '#d5e6e5'],
      true,
      0,
      0.9,
    ),
    '#050b1c',
    ['#102347', 0.00014],
  ),
  biome(
    'cindercoil',
    'Cindercoil',
    [
      preset(
        'ash-caldera-v1',
        'Ash caldera',
        'Muted ash slopes, ceramic works and cooled volcanic terraces.',
        0.8,
      ),
      preset(
        'furnace-district-v1',
        'Furnace district',
        'Dense kiln structures and oxide-stained industrial basins.',
        0.88,
      ),
    ],
    road(
      'ceramic',
      ['#d9ceb7', '#60696b', '#343b3e', '#dbd0b8', '#975748', '#edaa66'],
      0.86,
      0.05,
    ),
    environment(
      'cindercoil',
      ['#5c5952', '#42494c', '#9c5438', '#a39176', '#b96940', '#6e6959'],
      false,
      0,
      1.25,
    ),
    '#303c49',
    ['#3c4854', 0.0004],
  ),
  biome(
    'saffron',
    'Saffron Leviathan',
    [
      preset(
        'dune-sea-v1',
        'Dune sea',
        'Long sand ridges and widely spaced desert settlements.',
        0.68,
      ),
      preset(
        'fossil-fields-v1',
        'Fossil fields',
        'Pale fossil arches, mineral terraces and desert workyards.',
        0.82,
      ),
    ],
    road(
      'ceramic',
      ['#d3b47b', '#ac8b61', '#745e47', '#ead5a4', '#8c7251', '#ffca78'],
      0.45,
      0.06,
    ),
    environment(
      'saffron',
      ['#b39867', '#a58e6c', '#6b8e92', '#c8b68e', '#c58446', '#7d8955'],
      false,
      0.08,
      0.8,
    ),
    '#b7a4a2',
    ['#b8a5a3', 0.00017],
  ),
  biome(
    'zephyr',
    'Zephyr Basilica',
    [
      preset(
        'basilica-isles-v1',
        'Basilica isles',
        'Floating limestone islands, monumental halls and connected aqueducts.',
        0.86,
        -36,
      ),
      preset(
        'garden-isles-v1',
        'Garden isles',
        'Planted island courts, slender towers and stepped water gardens.',
        0.78,
        -28,
      ),
    ],
    road(
      'weave',
      ['#859198', '#d2c9b3', '#9a7250', '#d6e5d9', '#667d81', '#e3d5a8'],
      0.5,
      0.12,
      true,
    ),
    environment(
      'zephyr',
      ['#9caa86', '#b6b2a0', '#77aeb4', '#d1c8ae', '#a47e4d', '#6b8757'],
      true,
      0.65,
      1.1,
    ),
    '#a18eac',
    ['#a9b0c6', 0.00046],
  ),
  biome(
    'helion',
    'Helion Flare',
    [
      preset(
        'solar-array-v1',
        'Solar arrays',
        'Suspended ceramic arrays, cooling fields and stellar collectors.',
        0.76,
      ),
      preset(
        'observatory-v1',
        'Stellar observatory',
        'Large observation structures and sparse orbital service courts.',
        0.66,
      ),
    ],
    road(
      'ceramic',
      ['#ded8c8', '#777d80', '#a17a53', '#f1e5c4', '#323f52', '#f3ba75'],
      0.59,
      0.12,
      true,
    ),
    environment(
      'helion',
      ['#333c4c', '#59606a', '#e0a164', '#d5cbbc', '#bd8250', '#727d70'],
      false,
      0,
      0.6,
    ),
    '#090e19',
  ),
  biome(
    'umbra',
    'Umbra Fold',
    [
      preset(
        'accretion-v1',
        'Accretion monuments',
        'Dark masonry platforms, tilted monoliths and bronze instruments.',
        0.74,
      ),
      preset(
        'quiet-vaults-v1',
        'Quiet vaults',
        'Sparse monumental vaults and layered mineral courts.',
        0.62,
      ),
    ],
    road(
      'masonry',
      ['#b7b8ac', '#737c80', '#9d7954', '#ded9c3', '#303b49', '#e0ad78'],
      0.64,
      0.14,
      true,
    ),
    environment(
      'umbra',
      ['#38424b', '#555f69', '#ad7548', '#979b92', '#ad8251', '#5f7270'],
      false,
      0,
      1,
    ),
    '#050912',
  ),
  biome(
    'shatterline',
    'Shatterline',
    [
      preset(
        'limestone-canyon-v1',
        'Limestone canyon',
        'Layered canyon walls, receiving terraces and framed service routes.',
        0.78,
      ),
      preset(
        'receiving-campus-v1',
        'Receiving campus',
        'Pale industrial campuses, broad quarries and connected workyards.',
        0.88,
      ),
    ],
    road(
      'asphalt',
      ['#50565b', '#b6afa0', '#687177', '#dfd9bd', '#252c32', '#d8bd82'],
      0.76,
      0.02,
    ),
    environment(
      'shatterline',
      ['#9a9983', '#b4b09b', '#70969b', '#bab9a8', '#a67a51', '#798362'],
      false,
      0.18,
      1.2,
    ),
    '#b5c5cb',
    ['#c3c1b6', 0.000085],
  ),
  biome(
    'worldspire',
    'Worldspire',
    [
      preset(
        'mineral-spires-v1',
        'Mineral spires',
        'Rooted mineral towers, folded ridges and high pale terraces.',
        0.8,
      ),
      preset(
        'cloud-ridges-v1',
        'Cloud ridges',
        'Widely spaced spires and quiet elevated mineral plateaus.',
        0.66,
      ),
    ],
    road(
      'ceramic',
      ['#dedfd5', '#b5baac', '#ac8057', '#f0ebd6', '#24222b', '#9be0d4'],
      0.68,
      0.08,
    ),
    environment(
      'worldspire',
      ['#858e82', '#a5aaa0', '#82aea0', '#c3c4b6', '#a88264', '#7d8e70'],
      false,
      0.12,
      1.5,
    ),
    '#b4c5cf',
    ['#bac5c9', 0.00005],
  ),
  biome(
    'colossus',
    'Colossus Works',
    [
      preset(
        'quarry-v1',
        'Mountain quarry',
        'Benched rock faces, grounded work platforms and large processing halls.',
        0.82,
      ),
      preset(
        'factory-v1',
        'Factory districts',
        'Dense working-steel districts, service gantries and broad freight courts.',
        0.9,
      ),
    ],
    road(
      'steel',
      ['#7c898c', '#747e7c', '#9aa7a9', '#d7ccaa', '#344449', '#e7b97b'],
      0.57,
      0.74,
    ),
    environment(
      'colossus',
      ['#747b6d', '#8b9389', '#617f7b', '#8a9797', '#b18a55', '#65765a'],
      false,
      0.12,
      1.35,
    ),
    '#a7b3b9',
    ['#acb4b6', 0.00022],
  ),
  biome(
    'ravel',
    'Ravel',
    [
      preset(
        'sail-fields-v1',
        'Sail fields',
        'Suspended foil canopies, carbon masts and connected anchor frames.',
        0.74,
      ),
      preset(
        'folded-canopies-v1',
        'Folded canopies',
        'Large folded structures and sparse sail-lined platforms.',
        0.64,
      ),
    ],
    road(
      'membrane',
      ['#b1a9a0', '#4c545c', '#8a7865', '#e5d9b4', '#343d4b', '#e7bb88'],
      0.38,
      0.42,
      true,
    ),
    environment(
      'ravel',
      ['#333b49', '#66717b', '#526b83', '#a69e91', '#b58b6c', '#697d73'],
      false,
      0,
      0.6,
    ),
    '#070d18',
    ['#111522', 0.000025],
  ),
  biome(
    'nomad',
    'Nomad Procession',
    [
      preset(
        'salt-works-v1',
        'Salt works',
        'Wide salt shelves, grounded freight structures and working-steel courts.',
        0.8,
      ),
      preset(
        'freight-yards-v1',
        'Freight yards',
        'Dense cargo districts, large service towers and broad salt clearings.',
        0.9,
      ),
    ],
    road(
      'steel',
      ['#75796f', '#a99c83', '#7d8987', '#e2d3af', '#1a2830', '#ffda9b'],
      0.56,
      0.62,
    ),
    environment(
      'nomad',
      ['#c1beb0', '#a8a797', '#7b9293', '#8d9185', '#bd8e4e', '#8b9170'],
      false,
      0.03,
      0.55,
    ),
    '#d8d9d3',
    ['#d4d5cc', 0.000055],
  ),
  biome(
    'oriel',
    'Oriel',
    [
      preset(
        'civic-gardens-v1',
        'Civic gardens',
        'Planted civic terraces, bright courts and connected public walkways.',
        0.84,
      ),
      preset(
        'habitat-districts-v1',
        'Habitat districts',
        'Layered habitat blocks, utility pavilions and sheltered garden squares.',
        0.9,
      ),
    ],
    road(
      'promenade',
      ['#c7c4ad', '#e0d6ba', '#90734c', '#f2ead4', '#3b5558', '#e0a653'],
      0.64,
      0.1,
    ),
    environment(
      'oriel',
      ['#829578', '#96a18d', '#6d9b9e', '#c9c8b0', '#ae8d5a', '#557b50'],
      false,
      0.75,
      0.65,
    ),
    '#b5c7bc',
    ['#a5c6cf', 0.00026],
  ),
]);

export function isEditorBiome(id) {
  return EDITOR_BIOMES.some((value) => value.id === id);
}
export function editorBiome(id = 'nightweir') {
  const value = EDITOR_BIOMES.find((entry) => entry.id === id);
  if (!value) throw new Error('Choose a supported editor biome.');
  return value;
}
export function editorWorldPreset(biomeId, presetId) {
  const selected = editorBiome(biomeId);
  const value = selected.presets.find((entry) => entry.id === presetId);
  if (!value)
    throw new Error('Choose a supported scenery preset for this biome.');
  return value;
}
