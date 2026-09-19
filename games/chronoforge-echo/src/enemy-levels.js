import { ENEMIES } from './content.js';

// Enemy levels describe authored strength. They never scale with the party or
// civilization, and reading an older suspended actor does not modify its save.
export function enemyLevel(enemy) {
  const id = typeof enemy === 'string' ? enemy : enemy?.id;
  const level = ENEMIES[id]?.level ?? enemy?.level;
  return Number.isInteger(level) && level > 0 ? level : null;
}

export function enemyLevelLabel(enemy) {
  return `LVL ${enemyLevel(enemy) ?? '?'}`;
}

export function enemyNameWithLevel(enemy) {
  const actor = typeof enemy === 'string' ? ENEMIES[enemy] : enemy;
  return `${actor?.name || 'Enemy'} · ${enemyLevelLabel(enemy)}`;
}

export function encounterLevelLabel(encounter) {
  const levels = encounter.enemies?.map(enemyLevel) || [];
  if (!levels.length || levels.some(level => level === null)) return 'LVL ?';
  const min = Math.min(...levels), max = Math.max(...levels);
  return `LVL ${min === max ? min : `${min}–${max}`}`;
}

export function encounterInteractionLabel(encounter, cleared = false) {
  const level = encounterLevelLabel(encounter);
  if (cleared) return `Revisit patrol · ${level} · reduced spoils`;
  const name = encounter.guard ? ENEMIES[encounter.enemies[0]]?.name : encounter.name || ENEMIES[encounter.enemies[0]]?.name;
  return `${encounter.guard || encounter.boss ? 'Confront' : 'Engage'} ${name || 'patrol'} · ${level}${encounter.guard ? ' · gate sentry' : ''}`;
}
