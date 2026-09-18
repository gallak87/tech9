import {HEROES,ITEMS,TECHS,BUILDINGS,TIERS,SERVICES,EXPANSION_CONTRACT,ENEMIES} from './content.js';
import {assessItemUse,consumeItem} from './consumables.js';
const ok=(message,rewards=[])=>({ok:true,message,rewards});
const no=message=>({ok:false,message,rewards:[]});
const whole=n=>Number.isInteger(n)&&n>0;
export const xpForLevel=level=>80+20*level;
export function stats(hero,state) {
 const def=HEROES[hero.id];
 if(!def) throw new Error(`Unknown hero: ${hero.id}`);
 const result={};
 for(const key of ['maxHp','maxMp','str','int','tec','def','spd','crit']) result[key]=Math.floor(def[key]+(hero.level-1)*def.growth[key]);
 for(const itemId of Object.values(hero.equip||{})) if(itemId) for(const [key,value] of Object.entries(ITEMS[itemId]?.stats||{})) { const k=key==='hp'?'maxHp':key==='mp'?'maxMp':key; result[k]=(result[k]||0)+value; }
 result.str+=(state.buildings?.barracks||0)*2;result.tec+=(state.buildings?.barracks||0)*2;
 result.def+=(state.buildings?.walls||0)*3+(state.buildings?.forge||0);
 result.maxMp+=(state.buildings?.research_lab||0)*5;
 if(state.flags?.rune_living_oath)result.maxHp+=25;
 if(state.flags?.research_concord) {result.int+=6;result.tec+=6;}
 for(const key of Object.keys(result))result[key]=Math.max(key==='crit'?0:1,result[key]);
 return result;
}
function makeHero(id,level,state){
 const def=HEROES[id],h={id,name:def.name,level,xp:0,skillPoints:Math.max(0,level-1),hp:1,mp:1,equip:{weapon:def.weapon,armor:id==='kaida'?'scrap_vest':null,accessory:null},skills:[...def.starters]};
 const s=stats(h,state);h.hp=s.maxHp;h.mp=s.maxMp;return h;
}
export function createState(){
 const state={version:1,seed:9127,rng:9127,playTime:0,region:'haventide',x:525,y:1325,facing:'right',heroes:[],resources:{food:38,ore:45,energy:18,renown:0},inventory:{field_tonic:5,ether_cell:3},buildings:{town_center:1},tier:1,flags:{},quests:{},cleared:{},pickups:{},visited:{haventide:true},fog:{},settings:{music:.4,sfx:.6,timingAssist:false,reducedMotion:false,minimap:true},campaignComplete:false,productionClock:0};
 state.heroes.push(makeHero('kaida',1,state));return state;
}
export function awardXp(state,amount){
 if(!Number.isFinite(amount)||amount<0)return no('Experience must be a positive amount.');
 const rewards=[];for(const hero of state.heroes){hero.xp+=Math.floor(amount);let gained=0;
 while(hero.level<60&&hero.xp>=xpForLevel(hero.level)){hero.xp-=xpForLevel(hero.level);hero.level++;hero.skillPoints++;gained++;}
 if(hero.level===60)hero.xp=Math.min(hero.xp,xpForLevel(60)-1);
 if(gained){const s=stats(hero,state);hero.hp=s.maxHp;hero.mp=s.maxMp;rewards.push({id:hero.id,label:`${hero.name} · Level ${hero.level}`,amount:gained});}
 }
 recomputeUnlocks(state);return ok(`The crew gained ${Math.floor(amount)} experience.`,[{id:'xp',label:'Experience',amount:Math.floor(amount)},...rewards]);
}
export function recruit(state,id){
 if(!HEROES[id])return no('That traveler is unknown.');
 if(state.heroes.some(h=>h.id===id))return no(`${HEROES[id].name} is already with you.`);
 const level=Math.max(1,...state.heroes.map(h=>h.level));state.heroes.push(makeHero(id,level,state));state.flags[`${id}_recruited`]=true;
 recomputeUnlocks(state);return ok(`${HEROES[id].name} joins the crew.`,[{id,label:`${HEROES[id].name} joined`,amount:1}]);
}
export function applyRewards(state,reward={},ledgerId){
 state.flags.rewardLedger??={};if(ledgerId&&state.flags.rewardLedger[ledgerId])return no('These rewards have already been claimed.');
 if(ledgerId)state.flags.rewardLedger[ledgerId]=true;
 const rewards=[];for(const id of ['food','ore','energy','renown'])if(reward[id]){state.resources[id]+=reward[id];rewards.push({id,label:id[0].toUpperCase()+id.slice(1),amount:reward[id]});}
 for(const [id,amount] of Object.entries(reward.items||{})){if(!ITEMS[id])throw new Error(`Unknown reward ${id}`);state.inventory[id]=(state.inventory[id]||0)+amount;rewards.push({id,label:ITEMS[id].name,amount});}
 if(reward.xp)rewards.push(...awardXp(state,reward.xp).rewards);
 return ok('Rewards received.',rewards);
}
export function equip(state,heroId,itemId){
 const hero=state.heroes.find(h=>h.id===heroId),item=ITEMS[itemId];
 if(!hero||!item||!['weapon','armor','accessory'].includes(item.slot))return no('Choose equipment and a member of the crew.');
 if((state.inventory[itemId]||0)<1)return no('That item is not in your pack.');
 const old=hero.equip[item.slot];state.inventory[itemId]--;if(old)state.inventory[old]=(state.inventory[old]||0)+1;hero.equip[item.slot]=itemId;
 clampHero(hero,state);return ok(`${hero.name} equipped ${item.name}.`);
}
export function unequip(state,heroId,slot){
 const hero=state.heroes.find(h=>h.id===heroId),id=hero?.equip[slot];if(!id)return no('That slot is empty.');
 state.inventory[id]=(state.inventory[id]||0)+1;hero.equip[slot]=null;clampHero(hero,state);return ok(`${ITEMS[id].name} returned to the pack.`);
}
function clampHero(hero,state){const s=stats(hero,state);hero.hp=Math.min(hero.hp,s.maxHp);hero.mp=Math.min(hero.mp,s.maxMp);}
export function learn(state,heroId,techId){
 const hero=state.heroes.find(h=>h.id===heroId),tech=TECHS[techId];if(!hero||!tech||!tech.heroes.includes(heroId))return no('This technique belongs to another hero.');
 if(state.heroes.some(h=>h.skills.includes(techId)))return no('The crew already knows that technique.');
 if(tech.heroes.some(id=>!state.heroes.some(h=>h.id===id)))return no('Recruit every participant first.');
 if(tech.level&&hero.level<tech.level)return no(`Requires hero level ${tech.level}.`);
 if(tech.tier&&state.tier<tech.tier)return no(`Requires ${TIERS[tech.tier-1]} civilization.`);
 if(tech.flag&&!state.flags[tech.flag])return no('Complete the related personal story first.');
 const required=Array.isArray(tech.requires)?tech.requires:tech.requires?[tech.requires]:[];
 if(required.some(id=>!state.heroes.some(h=>h.skills.includes(id))))return no(`First learn ${required.filter(id=>!state.heroes.some(h=>h.skills.includes(id))).map(id=>TECHS[id].name).join(' and ')}.`);
 if(hero.skillPoints<tech.cost)return no(`Requires ${tech.cost} skill points.`);
 const before=hero.skillPoints;hero.skillPoints-=tech.cost;hero.skills.push(techId);return ok(`${hero.name} learned ${tech.name}. ${tech.cost} SP spent · ${before} → ${hero.skillPoints} SP.`);
}
export function buildingCost(state,id){const b=BUILDINGS[id];if(!b)return {};const level=state.buildings[id]||0;return Object.fromEntries(Object.entries(b.cost).map(([k,v])=>[k,Math.round(v*(1+level*.65))]));}
const affordable=(state,cost)=>Object.entries(cost).every(([id,n])=>state.resources[id]>=n);
const pay=(state,cost)=>{for(const [id,n]of Object.entries(cost))state.resources[id]-=n;};
export function build(state,id){
 const b=BUILDINGS[id];if(!b)return no('Unknown building.');
 if(!state.flags.haventide_liberated&&!state.cleared.hav_guard)return no('Liberate Haventide before building.');
 if(state.tier<b.tier)return no(`Requires ${TIERS[b.tier-1]}.`);
 const level=state.buildings[id]||0,max=id==='town_center'?Math.min(4,state.tier+1):state.tier;
 if(level>=max)return no(level===4?'This building is fully developed.':'Advance civilization to upgrade further.');
 const cost=buildingCost(state,id);if(!affordable(state,cost))return no(`Needs ${Object.entries(cost).map(([k,n])=>`${n} ${k}`).join(', ')}.`);
 pay(state,cost);state.buildings[id]=level+1;recomputeUnlocks(state);return ok(`${b.name} is now level ${level+1}.`,[{id,label:`${b.name} · ${level+1}`,amount:1}]);
}
export const TIER_REQUIREMENTS={
 2:{buildings:{town_center:2},flags:['beacon_restored'],cost:{food:35,ore:35,energy:15,renown:12}},
 3:{buildings:{town_center:3,research_lab:1},flags:['rune_recruited'],cost:{food:70,ore:85,energy:60,renown:65}},
 4:{buildings:{town_center:4,research_lab:2,forge:2,walls:2},flags:['forest_seal','mire_seal','crater_seal','frost_seal'],cost:{food:130,ore:150,energy:130,renown:180}}
};
const TIER_STORY_REQUIREMENTS={
 beacon_restored:{label:'Haventide beacon restored',instruction:'Restore the listening beacon west of Haventide'},
 rune_recruited:{label:'Rune recruited',instruction:'Recruit Rune at Anchor Nine in Orbital Reach after defeating its entrance blockade'},
 forest_seal:{label:'Forest Veil restored',instruction:'Restore Forest Veil’s Heartwood Relay beyond its guardian'},
 mire_seal:{label:'Mire Bog restored',instruction:'Open Mire Bog’s submerged archive after defeating its keeper'},
 crater_seal:{label:'Crater Ember restored',instruction:'Restore Crater Ember’s sun-forge after defeating its sovereign'},
 frost_seal:{label:'Frost Canyon restored',instruction:'Relight Frost Canyon’s midnight beacon beyond the Colossus'}
};
// The board and the purchase share this decision, including every unpaid cost.
export function tierEligibility(state){
 const nextTier=state.tier+1,req=TIER_REQUIREMENTS[nextTier];
 if(!req)return {eligible:false,complete:true,nextTier:null,name:null,cost:{},requirements:[],missing:[],reason:'The settlements are already Transcendent.'};
 const requirements=[
  ...Object.entries(req.buildings).map(([id,required])=>{const current=state.buildings[id]||0;return {type:'building',id,required,current,met:current>=required,label:`${BUILDINGS[id].name} level ${required}`,instruction:`${current?'Upgrade':'Build'} ${BUILDINGS[id].name} to level ${required} (currently ${current})`};}),
  ...req.flags.map(id=>({type:'story',id,met:!!state.flags[id],...TIER_STORY_REQUIREMENTS[id]})),
  ...Object.entries(req.cost).map(([id,required])=>{const current=state.resources[id]||0;return {type:'resource',id,required,current,met:current>=required,label:`${required} ${id}`,instruction:`Gather ${Math.ceil(required-current)} more ${id} (${Math.floor(current)} / ${required})`};})
 ];
 const missing=requirements.filter(r=>!r.met),name=TIERS[nextTier-1];
 return {eligible:missing.length===0,complete:false,nextTier,name,cost:{...req.cost},requirements,missing,reason:missing.length?`To unlock ${name}: ${missing.map(r=>r.instruction).join('; ')}.`:`Ready to advance to ${name}.`};
}
export function tierRequirements(state){
 const status=tierEligibility(state);return status.complete?'Civilization has reached Transcendent.':status.requirements.map(r=>`${r.label}${r.met?' ✓':''}`).join(' · ');
}
export function advanceTier(state){
 const status=tierEligibility(state);if(!status.eligible)return no(status.reason);
 pay(state,status.cost);state.tier=status.nextTier;recomputeUnlocks(state);return ok(`The settlements become ${TIERS[state.tier-1]}.`,[{id:'tier',label:TIERS[state.tier-1],amount:1}]);
}
export function production(state,dt){
 if(!Number.isFinite(dt)||dt<=0)return no('No time elapsed.');
 for(const [id,b]of Object.entries(BUILDINGS))if(b.produces&&state.buildings[id])state.resources[b.produces]=Math.min(9999,state.resources[b.produces]+b.rate*state.buildings[id]*dt*(1+(state.buildings.town_center||1)*.12));
 // Every survivor can salvage safely: prevents an empty economy from trapping a save.
 if(state.flags.haventide_liberated){state.resources.food=Math.min(9999,state.resources.food+.06*dt);state.resources.ore=Math.min(9999,state.resources.ore+.06*dt);}
 return ok('Settlement production advanced.');
}
export function serviceAvailable(state,id){const s=SERVICES[id];return Boolean(s&&state.tier>=s.tier&&(state.heroes.find(h=>h.id==='kaida')?.level||1)>=s.level&&(!s.requires||state.buildings[s.requires]));}
export function serviceStock(state,service='smith',region=state.region){
 const tier=Math.min(state.tier,region.startsWith('haventide')?Math.max(1,state.tier-1):state.tier);
 return Object.values(ITEMS).filter(i=>!i.unique&&i.price>0&&i.tier<=tier&&(service==='provisions'?i.slot==='consumable':service==='smith'?i.slot!=='consumable'&&i.tier<=2:service==='archivist'?i.stats.int||i.stats.maxMp:service==='artificer'?i.slot!=='consumable':false)).map(i=>i.id);
}
export function buy(state,itemId,quantity=1){
 const item=ITEMS[itemId];if(!item||item.price<=0||!whole(quantity)||quantity>99)return no('Choose an available item and quantity.');
 if(state.tier<item.tier)return no(`Requires ${TIERS[item.tier-1]} civilization.`);
 const price=item.price*quantity*(state.flags.mara_trade_route ? .85 : 1),cost=Math.ceil(price);
 if(state.resources.ore<cost)return no(`Requires ${cost} ore.`);
 state.resources.ore-=cost;state.inventory[itemId]=(state.inventory[itemId]||0)+quantity;return ok(`Bought ${quantity} ${item.name}.`,[{id:itemId,label:item.name,amount:quantity}]);
}
export function sell(state,itemId,quantity=1){
 const item=ITEMS[itemId];if(!item||!whole(quantity)||quantity>(state.inventory[itemId]||0))return no('Only unequipped items in your pack can be sold.');
 if(item.unique||item.price<=0)return no('This keepsake cannot be sold.');
 const price=Math.max(1,Math.floor(item.price*.45))*quantity;state.inventory[itemId]-=quantity;state.resources.ore+=price;return ok(`Sold ${quantity} ${item.name} for ${price} ore.`,[{id:'ore',label:'Ore',amount:price}]);
}
export function rest(state){
 const cost=state.flags.mara_shelter?0:Math.max(0,8-(state.buildings.walls||0)*2);
 if(state.resources.food>=cost)state.resources.food-=cost; // Hospitality remains available if stores run dry.
 for(const h of state.heroes){const s=stats(h,state);h.hp=s.maxHp;h.mp=s.maxMp;}
 return ok(cost?`The crew rests. Up to ${cost} food shared with the house.`:'The lantern houses welcome the crew freely.');
}
export function previewItemUse(state,itemId,heroId){
 const h=state.heroes.find(h=>h.id===heroId);return assessItemUse(state,itemId,h,h?stats(h,state):null);
}
export function useItem(state,itemId,heroId,options={}){
 const h=state.heroes.find(h=>h.id===heroId);return consumeItem(state,itemId,h,h?stats(h,state):null,options);
}
export function train(state){
 if(!serviceAvailable(state,'trainer'))return no('Build a Barracks and reach hero level 10 to train.');
 if(!affordable(state,{food:30,energy:20}))return no('Field training costs 30 food and 20 energy.');
 pay(state,{food:30,energy:20});return awardXp(state,300+state.tier*100);
}
export function research(state){
 if(!serviceAvailable(state,'archivist'))return no('An archivist needs a Research Lab and hero level 6.');
 if(state.flags.research_concord)return no('Concord research is already shared by every settlement.');
 if(!affordable(state,{ore:80,energy:70}))return no('Concord research requires 80 ore and 70 energy.');
 pay(state,{ore:80,energy:70});state.flags.research_concord=true;return ok('Concord research: the crew gains +6 intelligence and technique.');
}
export function recomputeUnlocks(state){
 state.flags.final_ready=Boolean(state.tier===4&&state.heroes.length===3&&['forest_seal','mire_seal','crater_seal','frost_seal','crown_memory'].every(f=>state.flags[f]));
 return state.flags.final_ready;
}
export function futureEligibility(state){return {eligible:Boolean(state.campaignComplete&&(state.heroes.find(h=>h.id==='kaida')?.level||0)>=40),available:EXPANSION_CONTRACT.available,developmentAuthorized:EXPANSION_CONTRACT.developmentAuthorized,reason:'Time travel is a future, unapproved expansion. The base game remains in the present.'};}

/** Shared battle economy; renderer and campaign verification consume one rule. */
export function battleReward(encounter,firstClear=true,random=()=>1){
 const enemies=encounter.enemies.map(id=>{if(!ENEMIES[id])throw new Error(`Unknown reward enemy: ${id}`);return ENEMIES[id];});
 const reward={xp:Math.floor(enemies.reduce((n,e)=>n+e.xp,0)*(firstClear?1:.35)),ore:Math.floor(enemies.reduce((n,e)=>n+8*e.tier,0)*(firstClear?1:.5)),food:6+enemies.length*3,energy:enemies.reduce((n,e)=>n+3*e.tier,0),renown:enemies.reduce((n,e)=>n+3*e.tier,0),items:{}};
 for(const e of enemies)if(e.drop&&ITEMS[e.drop]&&(firstClear||random()<.3))reward.items[e.drop]=(reward.items[e.drop]||0)+1;
 return reward;
}
