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

// Use the strongest fighter for the overworld sprite, badge and danger color.
// Keep authored order on ties and leave the actual battle formation untouched.
export function encounterLeader(encounter) {
  return encounter.enemies?.reduce((leader,enemy)=>leader===undefined||(enemyLevel(enemy)??0)>(enemyLevel(leader)??0)?enemy:leader,undefined);
}

export function encounterLevelLabel(encounter) {
  return enemyLevelLabel(encounterLeader(encounter));
}

export function encounterBadgeLabel(encounter) {
  const leader=encounterLeader(encounter),actor=typeof leader==='string'?ENEMIES[leader]:leader;
  return `${enemyLevelLabel(leader)} · ${actor?.name||'Enemy'}`;
}

export const ENEMY_DANGER_STYLES=Object.freeze({
  lower:{text:'#b8b8b8',border:'#757c7d',background:'#1b1b1bef'},
  even:{text:'#eeece9',border:'#aeaaa0',background:'#1b1b1bef'},
  raised:{text:'#ebbc78',border:'#b7884d',background:'#30251cf5'},
  high:{text:'#f09586',border:'#b9554e',background:'#35201ff5'},
  severe:{text:'#ffdad4',border:'#d66b70',background:'#64272ff5'},
});

export function encounterDanger(encounter,state){
  const kaida=state.heroes?.find(hero=>hero.id==='kaida'),level=enemyLevel(encounterLeader(encounter));
  if(!kaida||!Number.isInteger(kaida.level)||level===null)return 'even';
  const difference=level-kaida.level;
  return difference>=7?'severe':difference>=4?'high':difference>=2?'raised':difference<=-2?'lower':'even';
}

export function encounterInteractionLabel(encounter, cleared = false) {
  const level = encounterLevelLabel(encounter);
  if (cleared) return `Revisit patrol · ${level} · reduced spoils`;
  const leader=encounterLeader(encounter),name=typeof leader==='string'?ENEMIES[leader]?.name:leader?.name;
  return `${encounter.guard || encounter.boss ? 'Confront' : 'Engage'} ${name || 'patrol'} · ${level}${encounter.guard ? ' · gate sentry' : ''}`;
}
