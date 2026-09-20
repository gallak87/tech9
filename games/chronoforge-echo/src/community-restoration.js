import { HEROES, ITEMS, ITEM_TIERS } from './content.js';
import { COMMUNITY_DEFINITIONS } from './community-definitions.js';

export { COMMUNITY_DEFINITIONS } from './community-definitions.js';

const definitions = Object.fromEntries(
  COMMUNITY_DEFINITIONS.map((community) => [community.id, community]),
);
const no = (message) => ({ ok: false, message, rewards: [] });
const record = (value) =>
  value !== null && typeof value === 'object' && !Array.isArray(value);
const affordable = (state, cost) =>
  Object.entries(cost).every(([id, amount]) => state.resources[id] >= amount);
const pay = (state, cost) => {
  for (const [id, amount] of Object.entries(cost))
    state.resources[id] -= amount;
};

export function createCommunityState() {
  return Object.fromEntries(
    COMMUNITY_DEFINITIONS.map(({ id }) => [id, { level: 1, weaponTier: 0 }]),
  );
}

export function communityRegion(region) {
  if (typeof region !== 'string') return null;
  const id = region.replace(/_town$/, '');
  return Object.hasOwn(definitions, id) ? id : null;
}

export function communityLevel(state, region) {
  const id = communityRegion(region);
  return id ? (state.communities?.[id]?.level ?? 1) : 0;
}

export function communityWeaponTier(level) {
  return level >= 40
    ? 5
    : level >= 30
      ? 4
      : level >= 20
        ? 3
        : level >= 10
          ? 2
          : 1;
}

function ownedWeapons(state, definition) {
  const owned = [];
  for (let tier = 1; tier <= 5; tier++) {
    const id = `${definition.weaponId}_${tier}`;
    if (state.inventory[id])
      owned.push({ id, tier, quantity: state.inventory[id], hero: null });
    for (const hero of state.heroes)
      if (hero.equip.weapon === id) owned.push({ id, tier, quantity: 1, hero });
  }
  return owned;
}

const reforgeInvestment = [
  {},
  {},
  { ore: 15, energy: 5 },
  { ore: 35, energy: 15 },
  { ore: 60, energy: 30 },
  { ore: 100, energy: 50 },
];

function reforgeCost(fromTier, toTier) {
  return Object.fromEntries(
    Object.entries(reforgeInvestment[toTier])
      .map(([id, amount]) => [
        id,
        amount - (reforgeInvestment[fromTier][id] || 0),
      ])
      .filter(([, amount]) => amount > 0),
  );
}

export function communityStatus(state, region) {
  const id = communityRegion(region);
  if (!id) return null;
  const definition = definitions[id],
    level = communityLevel(state, id),
    weaponTier = state.communities?.[id]?.weaponTier ?? 0,
    local = communityRegion(state.region) === id,
    liberated = Boolean(
      state.flags[`${id}_liberated`] || state.cleared[definition.guard],
    ),
    owner = state.heroes.find((hero) => hero.id === definition.heroId),
    levelTier = communityWeaponTier(owner?.level || 1),
    // Even at level 40+, the gift must be claimed as Transcendent first.
    targetTier = Math.min(4, levelTier),
    itemId = `${definition.weaponId}_${weaponTier || targetTier}`,
    ownership = ownedWeapons(state, definition),
    owned = ownership.reduce((sum, entry) => sum + entry.quantity, 0) === 1,
    locationReason = !local
      ? `Visit ${definition.name} to help with its restoration.`
      : !liberated
        ? `Liberate ${definition.name} before restoring the community.`
        : '',
    projects = definition.projects.map((project) => {
      const complete = level >= project.level,
        reason = complete
          ? 'This project is already complete.'
          : locationReason ||
            (project.level !== level + 1
              ? 'Complete the earlier community project first.'
              : project.level === 4 && !owner
                ? `Bring ${HEROES[definition.heroId].name} to receive the community’s gift.`
                : project.level === 4 && ownership.length
                  ? 'The community’s gift is already owned.'
                  : !affordable(state, project.cost)
                    ? `Needs ${Object.entries(project.cost)
                        .map(([resource, amount]) => `${amount} ${resource}`)
                        .join(', ')}.`
                    : '');
      return {
        ...project,
        cost: { ...project.cost },
        complete,
        eligible: !reason,
        reason,
      };
    }),
    // Exotic is a separate reforge cycle from an already-Transcendent weapon.
    toTier = Math.max(weaponTier, weaponTier >= 4 ? levelTier : targetTier),
    nextLevel = [10, 20, 30, 40][(weaponTier || targetTier) - 1] ?? null,
    cost = weaponTier ? reforgeCost(weaponTier, toTier) : {},
    reforgeReason =
      locationReason ||
      (level < 4
        ? 'Finish the community restoration to receive its unique weapon.'
        : !owner
          ? `Bring ${HEROES[definition.heroId].name} to reforge this weapon.`
          : !owned || ownership[0].tier !== weaponTier
            ? 'The community’s original weapon must be equipped or in your pack.'
            : toTier <= weaponTier
              ? weaponTier === 5
                ? 'This Exotic weapon is fully reforged.'
                : `${owner.name} must reach level ${nextLevel} for the next reforge.`
              : !affordable(state, cost)
                ? `Needs ${Object.entries(cost)
                    .map(([resource, amount]) => `${amount} ${resource}`)
                    .join(', ')}.`
                : '');
  return {
    id,
    name: definition.name,
    description: definition.description,
    level,
    liberated,
    local,
    complete: level === 4,
    projects,
    weapon: {
      baseId: definition.weaponId,
      id: itemId,
      name: ITEMS[itemId].name,
      heroId: definition.heroId,
      heroName: HEROES[definition.heroId].name,
      tier: weaponTier,
      targetTier,
      owned,
      item: ITEMS[itemId],
      nextLevel,
    },
    reforge: {
      eligible: !reforgeReason,
      reason: reforgeReason,
      cost,
      fromTier: weaponTier,
      toTier,
      itemId: `${definition.weaponId}_${toTier}`,
      nextLevel,
    },
  };
}

export function restoreCommunity(state, region, projectId) {
  const status = communityStatus(state, region),
    project = status?.projects.find((candidate) => candidate.id === projectId);
  if (!project) return no('Choose a community restoration project.');
  if (!project.eligible) return no(project.reason);
  state.communities ??= createCommunityState();
  const community = state.communities[status.id];
  pay(state, project.cost);
  community.level = project.level;
  const rewards = [{ id: status.id, label: project.name, amount: 1 }];
  let message = `${project.name} complete. ${project.result}`;
  if (project.level === 4) {
    const tier = status.weapon.targetTier,
      itemId = `${status.weapon.baseId}_${tier}`;
    community.weaponTier = tier;
    state.inventory[itemId] = 1;
    rewards.push({ id: itemId, label: status.weapon.name, amount: 1 });
    message = `${status.name} restored. Received ${status.weapon.name} · ${ITEM_TIERS[tier - 1]}.`;
  }
  return {
    ok: true,
    message,
    rewards,
    region: status.id,
    previousLevel: status.level,
    level: project.level,
  };
}

export function reforgeCommunityWeapon(state, region) {
  const status = communityStatus(state, region);
  if (!status) return no('Choose a community restoration.');
  if (!status.reforge.eligible) return no(status.reforge.reason);
  const old = ownedWeapons(state, definitions[status.id])[0],
    { itemId, toTier, cost } = status.reforge;
  pay(state, cost);
  if (old.hero) old.hero.equip.weapon = itemId;
  else {
    delete state.inventory[old.id];
    state.inventory[itemId] = 1;
  }
  state.communities[status.id].weaponTier = toTier;
  return {
    ok: true,
    message: `${status.weapon.name} reforged to ${ITEM_TIERS[toTier - 1]}.`,
    rewards: [
      {
        id: itemId,
        label: `${status.weapon.name} · ${ITEM_TIERS[toTier - 1]}`,
        amount: 1,
      },
    ],
  };
}

/** Legacy saves gain independent untouched communities, never copied Haven levels. */
export function migrateCommunityState(state) {
  const fail = () => {
    throw new Error('Invalid community restoration in save.');
  };
  if (
    state.communityRevision === undefined &&
    state.communities === undefined
  ) {
    state.communityRevision = 1;
    state.communities = createCommunityState();
  }
  if (state.communityRevision !== 1 || !record(state.communities)) fail();
  if (
    Object.keys(state.communities).some((id) => !Object.hasOwn(definitions, id))
  )
    fail();
  for (const definition of COMMUNITY_DEFINITIONS) {
    const community = state.communities[definition.id];
    if (
      !record(community) ||
      Object.keys(community).some(
        (key) => !['level', 'weaponTier'].includes(key),
      ) ||
      !Number.isInteger(community.level) ||
      community.level < 1 ||
      community.level > 4 ||
      !Number.isInteger(community.weaponTier) ||
      community.weaponTier < 0 ||
      community.weaponTier > 5 ||
      (community.level === 4) !== community.weaponTier > 0
    )
      fail();
    const ownership = ownedWeapons(state, definition),
      quantity = ownership.reduce((sum, entry) => sum + entry.quantity, 0);
    if (community.weaponTier) {
      if (quantity !== 1 || ownership[0].tier !== community.weaponTier) fail();
      const hero = state.heroes.find(
        (member) => member.id === definition.heroId,
      );
      if (!hero || communityWeaponTier(hero.level) < community.weaponTier)
        fail();
    } else if (quantity) fail();
    for (const hero of state.suspendedBattle?.heroes || []) {
      const weapon = ITEMS[hero.equip.weapon];
      if (
        weapon?.community === definition.id &&
        weapon.tier !== community.weaponTier
      )
        fail();
    }
  }
  return state;
}
