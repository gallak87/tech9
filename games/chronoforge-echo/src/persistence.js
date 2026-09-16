import {HEROES,ITEMS,TECHS,BUILDINGS} from './content.js';
import {ALL_SCENES} from './world.js';
export const SAVE_PREFIX='chronforge_echo_v1';
const copy=v=>JSON.parse(JSON.stringify(v));
export function migrate(input){
 if(!input||typeof input!=='object')throw Error('Save contains no expedition.');
 const s=copy(input);if(!s.version)s.version=1;
 if(s.version!==1)throw Error('This save needs a newer version of Chronforge Echo.');
 if(!Array.isArray(s.heroes)||!s.heroes.some(h=>h.id==='kaida'))throw Error('The save is missing Kaida.');
 const unique=new Set();
 for(const h of s.heroes){
  if(!HEROES[h.id]||unique.has(h.id)||!Number.isInteger(h.level)||h.level<1||h.level>60)throw Error('Invalid hero identity or level in save.');
  unique.add(h.id);
  for(const k of ['hp','mp','xp','skillPoints'])if(!Number.isFinite(h[k])||h[k]<0)throw Error('Invalid hero values in save.');
  if(!Array.isArray(h.skills)||h.skills.some(id=>!TECHS[id]))throw Error('Unknown technique in save.');
  for(const [slot,id] of Object.entries(h.equip||{}))if(id&&(!ITEMS[id]||ITEMS[id].slot!==slot))throw Error('Invalid equipped item in save.');
 }
 if(!s.resources||!ALL_SCENES[s.region]||!Number.isFinite(s.x)||!Number.isFinite(s.y))throw Error('Save location or supplies are invalid.');
 if(s.x<0||s.y<0||s.x>ALL_SCENES[s.region].width||s.y>ALL_SCENES[s.region].height)throw Error('Saved position is outside the world.');
 for(const k of ['food','ore','energy','renown'])if(!Number.isFinite(s.resources[k])||s.resources[k]<0)throw Error('Invalid resource data in save.');
 for(const [id,n] of Object.entries(s.inventory||{}))if(!ITEMS[id]||!Number.isInteger(n)||n<0)throw Error('Invalid inventory ownership in save.');
 for(const [id,n] of Object.entries(s.buildings||{}))if(!BUILDINGS[id]||!Number.isInteger(n)||n<0||n>4)throw Error('Invalid settlement in save.');
 if(!Number.isInteger(s.tier)||s.tier<1||s.tier>4)throw Error('Invalid civilization tier in save.');
 s.flags??={};s.cleared??={};s.pickups??={};s.fog??={};s.visited??={[s.region]:true};s.settings??={music:.4,sfx:.6,minimap:true};return s;
}
export function saveState(state,slot='checkpoint',storage=localStorage){const s=migrate(state),payload={version:1,savedAt:new Date().toISOString(),state:s};storage.setItem(`${SAVE_PREFIX}:${slot}`,JSON.stringify(payload));return payload;}
export function loadState(slot='checkpoint',storage=localStorage){const data=storage.getItem(`${SAVE_PREFIX}:${slot}`);if(!data)throw Error('This save slot is empty.');const p=JSON.parse(data);return migrate(p.state||p);}
export function saveMeta(slot,storage=localStorage){try{const p=JSON.parse(storage.getItem(`${SAVE_PREFIX}:${slot}`));if(!p)return null;const s=p.state;return {savedAt:p.savedAt,level:s.heroes[0].level,region:s.region,playTime:s.playTime,complete:s.campaignComplete,party:s.heroes.map(h=>h.name).join(' · ')};}catch{return {corrupt:true};}}
export function deleteSave(slot,storage=localStorage){storage.removeItem(`${SAVE_PREFIX}:${slot}`);}
export function latestSave(storage=localStorage){const slots=['checkpoint',1,2,3].map(slot=>({slot,meta:saveMeta(slot,storage)})).filter(x=>x.meta&&!x.meta.corrupt).sort((a,b)=>Date.parse(b.meta.savedAt)-Date.parse(a.meta.savedAt));return slots[0]?.slot??null;}
