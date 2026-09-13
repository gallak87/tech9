// Development fixtures derive their catalog from the actual world encounters.
import * as State from './state.js';
import {ITEMS,SKILLS} from './data.js';
import {OBJECTS,INTERIORS,REGIONS} from './world.js';

export const PREVIEW_ENCOUNTERS=Object.freeze([
  ...OBJECTS,
  ...Object.values(INTERIORS).flatMap(room=>room.objects.map(object=>({...object,inRoom:room.id}))),
].filter(object=>object.type==='encounter'));

export function previewEncounter(id){
  const encounter=PREVIEW_ENCOUNTERS.find(object=>object.id===id);
  if(!encounter)throw new Error('Unknown preview encounter: '+id);
  return encounter;
}

export function createBattlePreviewState(encounter){
  const s=State.createState(),region=REGIONS.find(r=>r.id===encounter.region);
  const level=encounter.id==='road_scrappers'?1:region?.tier===1?2:({2:4,3:5,4:7}[region?.tier]||1);
  while(s.heroes[0].level<level)State.gainXp(s,State.nextXp(s.heroes[0].level)-s.heroes[0].xp);
  if(level>1)for(const hero of s.heroes){
    for(const skill of Object.values(SKILLS).filter(skill=>skill.hero===hero.id&&skill.level<=level&&!hero.skills.includes(skill.id))){
      hero.sp=Math.max(hero.sp,skill.cost);State.learn(s,hero.id,skill.id);
    }
    for(const slot of ['weapon','armor','accessory']){
      const best=Object.entries(ITEMS).filter(([,item])=>item.slot===slot&&item.level<=level&&(!item.heroes||item.heroes.includes(hero.id)))
        .sort((a,b)=>b[1].tier-a[1].tier||b[1].price-a[1].price)[0];
      if(best)State.equip(s,hero.id,State.addItem(s,best[0]).uid);
    }
  }
  s.flags.intro=true;
  if(level>=4)for(const flag of ['anchor_mire','anchor_ember','anchor_frost'])s.flags[flag]=true;
  if(level>=7)s.flags.truth=true;
  s.settings={...s.settings,sound:false,speed:1,reducedMotion:false};
  const door=encounter.inRoom&&OBJECTS.find(object=>object.interior===encounter.inRoom);
  s.party={x:encounter.x,y:encounter.y,interior:encounter.inRoom||null,
    returnPoint:door?{x:door.x,y:door.y+35}:null};
  s.discovered=[...new Set([...s.discovered,encounter.region])];
  State.rest(s,true);
  return s;
}
