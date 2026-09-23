/** Optional regional restoration; Haventide keeps its own settlement economy. */
export const COMMUNITY_DEFINITIONS = [
  {
    id: 'emberline',
    name: 'The Lantern Exchange',
    description: 'Help Emberline restore its waterworks and shared workshops.',
    guard: 'ember_guard',
    heroId: 'kaida',
    weaponId: 'duneglass_blade',
    projects: [
      {
        id: 'waterworks',
        name: 'Repair the waterworks',
        result:
          'Clean water returns; the local training and archive services can open.',
        cost: { food: 30, ore: 45, energy: 15 },
      },
      {
        id: 'workshop',
        name: 'Restore the shared workshop',
        result: 'The shared workshop and its outdoor worksite are restored.',
        cost: { food: 40, ore: 65, energy: 25 },
      },
      {
        id: 'community_kiln',
        name: 'Light the community kiln',
        result: 'Emberline presents Kaida with the Duneglass Blade.',
        cost: { food: 50, ore: 85, energy: 40 },
      },
    ],
  },
  {
    id: 'orbital_reach',
    name: 'Anchor Nine',
    description:
      'Help Anchor Nine restore equipment and shelter for its rescue crews.',
    guard: 'orbital_guard',
    heroId: 'rune',
    weaponId: 'rescue_gauntlets',
    projects: [
      {
        id: 'rescue_depot',
        name: 'Repair the rescue depot',
        result:
          'The rescue depot reopens; local training and archive services can open.',
        cost: { food: 40, ore: 55, energy: 25 },
      },
      {
        id: 'signal_workshop',
        name: 'Restore the signal workshop',
        result: 'The signal workshop and its outdoor worksite are restored.',
        cost: { food: 50, ore: 75, energy: 40 },
      },
      {
        id: 'communal_forge',
        name: 'Reopen the communal forge',
        result: 'Anchor Nine presents Rune with the Rescue Gauntlets.',
        cost: { food: 60, ore: 95, energy: 55 },
      },
    ],
  },
  {
    id: 'last_crown',
    name: 'The Open Hand',
    description:
      'Help the Open Hand turn abandoned grounds into a public garden.',
    guard: 'crown_guard',
    heroId: 'vex',
    weaponId: 'orchard_staff',
    projects: [
      {
        id: 'public_garden',
        name: 'Restore the public garden',
        result:
          'The garden reopens; local training and archive services can open.',
        cost: { food: 50, ore: 65, energy: 35 },
      },
      {
        id: 'seedhouse',
        name: 'Rebuild the seedhouse',
        result: 'The seedhouse and its outdoor garden are restored.',
        cost: { food: 60, ore: 85, energy: 55 },
      },
      {
        id: 'learning_pavilion',
        name: 'Open the learning pavilion',
        result: 'The Open Hand presents Vex with the Orchard Staff.',
        cost: { food: 70, ore: 105, energy: 70 },
      },
    ],
  },
].map((community) => ({
  ...community,
  projects: community.projects.map((project, index) => ({
    ...project,
    level: index + 2,
  })),
}));

const weapons = [
  {
    id: 'duneglass_blade',
    name: 'Duneglass Blade',
    community: 'emberline',
    weaponFamily: 'sword',
    description:
      'Desert glass in kiln-fired steel; a gift from Emberline’s restored workshops.',
    stats: [
      { str: 4, spd: 2, crit: 2 },
      { str: 10, spd: 3, crit: 4 },
      { str: 19, spd: 4, crit: 7 },
      { str: 28, tec: 6, spd: 5, crit: 9 },
      { str: 36, tec: 8, spd: 6, crit: 11 },
    ],
  },
  {
    id: 'rescue_gauntlets',
    name: 'Rescue Gauntlets',
    community: 'orbital_reach',
    weaponFamily: 'gauntlet',
    description:
      'Rescue-forged sentinel gauntlets; Anchor Nine’s promise to bring everyone home.',
    stats: [
      { str: 6, tec: 2, def: 4, maxHp: 10 },
      { str: 12, tec: 4, def: 6, maxHp: 20 },
      { str: 19, tec: 6, def: 9, maxHp: 30 },
      { str: 28, tec: 9, def: 12, maxHp: 45 },
      { str: 36, tec: 12, def: 16, maxHp: 60 },
    ],
  },
  {
    id: 'orchard_staff',
    name: 'Orchard Staff',
    community: 'last_crown',
    weaponFamily: 'staff',
    description:
      'Living crystal and pale branches; the Open Hand’s stories carried into the world.',
    stats: [
      { int: 6, maxMp: 8, spd: 1, tec: 2 },
      { int: 12, maxMp: 16, spd: 2, tec: 4 },
      { int: 19, maxMp: 24, spd: 3, tec: 6 },
      { int: 29, maxMp: 34, spd: 4, tec: 9 },
      { int: 38, maxMp: 44, spd: 5, tec: 12 },
    ],
  },
];

export const EXOTIC_ITEMS = weapons.flatMap((weapon) =>
  weapon.stats.map((stats, index) => ({
    id: `${weapon.id}_${index + 1}`,
    name: weapon.name,
    slot: 'weapon',
    weaponFamily: weapon.weaponFamily,
    stats,
    price: 0,
    tier: index + 1,
    description: weapon.description,
    exotic: true, // Permanent rarity; tier records this weapon's forge strength.
    unique: true,
    iconId: weapon.id,
    community: weapon.community,
  })),
);
