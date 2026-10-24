import { IS_DEMO, DEMO_REQUIREMENTS } from './edition.js';

// Player progression is explicit session data; rival handling never reads it.
export const ENHANCEMENTS = Object.freeze([
  { id: 'speed', name: 'Top speed', gains: [0, 0.05, 0.1, 0.2], unit: 'km/h' },
  {
    id: 'acceleration',
    name: 'Acceleration',
    gains: [0, 0.04, 0.08, 0.12],
    unit: 'm/s²',
  },
  {
    id: 'handling',
    name: 'Handling',
    gains: [0, 0.02, 0.04, 0.06],
    unit: '/10',
  },
  { id: 'braking', name: 'Braking', gains: [0, 0.03, 0.06, 0.1], unit: '/10' },
  {
    id: 'boost',
    name: 'Boost duration',
    gains: [0, 0.05, 0.12, 0.2],
    unit: 's',
  },
  { id: 'toughness', name: 'Toughness', gains: [0, 0.05, 0.1, 0.2], unit: '%' },
]);
export const RARITIES = Object.freeze([
  'Stock',
  'Uncommon',
  'Rare',
  'Epic',
  'Exotic',
]);
export const EQUIPMENT = Object.freeze([
  {
    id: 'jump',
    name: 'Jump Drive',
    rarity: 2,
    cooldown: 12,
    duration: 0,
    symbol: 'jump',
    description:
      'Launch above the road. Steer in flight, clear hazards, or rescue a falling line.',
    detail: 'Manual launch · Airborne steering · Recovery grace',
  },
  {
    id: 'injector',
    name: 'Reserve Injector',
    rarity: 1,
    cooldown: 14,
    duration: 0,
    symbol: 'boost',
    description:
      'Inject 45 reserve immediately. Keep the boost burning through the next straight.',
    detail: '+45 boost reserve · Usable in flight',
  },
  {
    id: 'slipstream',
    name: 'Slipstream Drive',
    rarity: 2,
    cooldown: 18,
    duration: 4,
    symbol: 'slipstream',
    description:
      'Catch a rival ahead and ride a four-second surge. Close the gap, then choose your pass.',
    detail: 'Requires a rival ahead · 4 s surge',
  },
  {
    id: 'deflector',
    name: 'Deflector',
    rarity: 2,
    cooldown: 16,
    duration: 2.5,
    symbol: 'shield',
    description:
      'Raise a short protective field on demand. Time it to absorb an incoming weapon.',
    detail: '2.5 s shield · One blocked weapon',
  },
  {
    id: 'stabilizer',
    name: 'Magnetic Stabilizer',
    rarity: 3,
    cooldown: 15,
    duration: 4,
    symbol: 'stabilizer',
    description:
      'Strengthen airborne steering and damp sideways drift for a controlled landing.',
    detail: '4 s air control · Keeps forward momentum',
  },
  {
    id: 'lance',
    name: 'Lance',
    rarity: 3,
    cooldown: 26,
    duration: 0,
    symbol: 'lance',
    description:
      'Fire a heavy, straight-ahead energy lance. Aim with your ship; a clean hit breaks their pace.',
    detail: 'Heavy aimed shot · Long recharge',
  },
]);
export const STANDARD_EQUIPMENT_SLOTS = 2;
export const MAX_EQUIPMENT_SLOTS = 4;
export const equipmentById = (id) => EQUIPMENT.find((item) => item.id === id);
const ranks = ['I', 'II', 'III'];
const pointMilestones = {
  speed: [null, 6, 40],
  acceleration: [8, 30, 60],
  handling: [20, 45, 80],
  braking: [25, 50, 100],
  boost: [8, null, null],
  toughness: [20, 70, 120],
};
const shipRewards = [
  ['founders', 'bastion', 'Bastion'],
  ['frontier', 'needle', 'Needle'],
  ['horizon', 'kestrel', 'Kestrel'],
];
const gearMilestones = {
  jump: { points: 8 },
  injector: { points: 25 },
  slipstream: { points: 35 },
  deflector: { cup: 'founders' },
  stabilizer: { cup: 'frontier' },
  lance: { cup: 'apex' },
};
export const ALL_REWARDS = Object.freeze([
  ...ENHANCEMENTS.flatMap((stat) =>
    ranks.map((rank, i) => ({
      id: `${stat.id}-${i + 1}`,
      kind: 'enhancement',
      stat: stat.id,
      rank: i + 1,
      rarity: i + 1,
      name: `${stat.name} ${rank}`,
      description: `${Math.round(stat.gains[i + 1] * 100)}% total ${stat.id === 'toughness' ? 'weapon and world-hazard mitigation' : 'improvement'}`,
      requirement:
        stat.id === 'speed' && i === 0
          ? { finishes: 1 }
          : stat.id === 'boost' && i > 0
            ? { trials: i, after: `boost-${i}` }
            : { points: pointMilestones[stat.id][i] },
    })),
  ),
  ...shipRewards.map(([cup, ship, name]) => ({
    id: `ship-${ship}`,
    kind: 'ship',
    ship,
    name,
    rarity: 3,
    description: 'New chassis unlocked',
    requirement: { cup },
  })),
  ...EQUIPMENT.map((item) => ({
    ...item,
    id: `equipment-${item.id}`,
    equipment: item.id,
    kind: 'equipment',
    requirement: gearMilestones[item.id],
  })),
  {
    id: 'exotic-slot',
    name: 'Quad Core',
    kind: 'exotic',
    rarity: 4,
    description:
      'Choose one ship to permanently equip four items instead of two.',
    requirement: { cups: 4 },
  },
]);
export const REWARDS = IS_DEMO
  ? Object.freeze(
      Object.entries(DEMO_REQUIREMENTS).map(([id, requirement]) => ({
        ...ALL_REWARDS.find((reward) => reward.id === id),
        requirement,
      })),
    )
  : ALL_REWARDS;
export const AVAILABLE_EQUIPMENT = Object.freeze(
  EQUIPMENT.filter((item) =>
    REWARDS.some((reward) => reward.equipment === item.id),
  ),
);
export function requirementText(requirement) {
  if (requirement.finishes)
    return requirement.finishes === 1
      ? 'Finish your first valid race'
      : `Complete ${requirement.finishes} valid race finishes`;
  if (requirement.points)
    return `Earn ${requirement.points} race progress · Every valid finish counts`;
  if (requirement.trials)
    return `Set clean Time Trial records on ${requirement.trials} different map${requirement.trials === 1 ? '' : 's'}${requirement.after ? ` · Requires Boost duration ${ranks[Number(requirement.after.split('-')[1]) - 1]}` : ''}`;
  if (requirement.cup)
    return `Win ${requirement.cup[0].toUpperCase() + requirement.cup.slice(1)} Cup`;
  return `Win all four cups`;
}
export function enhancementRanks(profile) {
  const claims = new Set(
    (profile?.claims ?? []).filter((id) =>
      REWARDS.some((reward) => reward.id === id),
    ),
  );
  return Object.fromEntries(
    ENHANCEMENTS.map(({ id }) => [
      id,
      [3, 2, 1].find((rank) => claims.has(`${id}-${rank}`)) ?? 0,
    ]),
  );
}
export function enhancementGain(ranks, id) {
  const stat = ENHANCEMENTS.find((entry) => entry.id === id);
  return stat?.gains[ranks?.[id]] ?? 0;
}
export function upgradedHandling(base, ranks) {
  if (!ranks || !Object.values(ranks).some(Boolean)) return base;
  const multiplier = (id) => 1 + enhancementGain(ranks, id);
  return {
    ...base,
    cruiseSpeed: base.cruiseSpeed * multiplier('speed'),
    boostSpeed: base.boostSpeed * multiplier('speed'),
    thrust: base.thrust * multiplier('acceleration'),
    boostThrust: base.boostThrust * multiplier('acceleration'),
    turn: base.turn * multiplier('handling'),
    response: base.response * multiplier('handling'),
    braking: base.braking * multiplier('braking'),
    boostDrain: base.boostDrain / multiplier('boost'),
  };
}
export const toughness = (state) =>
  enhancementGain(state?.enhancements, 'toughness');
