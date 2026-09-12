import {HEROES,ITEMS,SKILLS,BUILDINGS} from './data.js';

const SAVE_PREFIX='chronoforge-remake-v1';
const SLOTS=new Set(['auto','1','2','3','manual1','manual2','manual3']);
const clone=value=>JSON.parse(JSON.stringify(value));
const result=(ok,message)=>({ok,message});
const finite=(value,fallback,min=0,max=1e7)=>Number.isFinite(value)?Math.max(min,Math.min(max,value)):fallback;
const heroOf=(s,id)=>typeof id==='object'?s.heroes.find(h=>h.id===id.id):s.heroes.find(h=>h.id===id);
const occupied=(s,uid)=>s.heroes.find(h=>Object.values(h.equip).includes(uid));
const tidyHero=(s,h)=>{const t=stats(s,h);h.hp=Math.min(t.maxHp,Math.max(0,h.hp));h.mp=Math.min(t.maxMp,Math.max(0,h.mp));};
function pay(s,cost){for(const [id,n] of Object.entries(cost))if((s.resources[id]||0)<n)return false;for(const [id,n] of Object.entries(cost))s.resources[id]-=n;return true;}
const costText=cost=>Object.entries(cost).filter(([,v])=>v).map(([k,v])=>`${v} ${k}`).join(', ');
const slotName=slot=>String(slot).replace('manual','');

export const nextXp=level=>65+(level-1)*45;
export function addItem(s,id,rank=0){
  if(!Object.hasOwn(ITEMS,id))return null;
  s.nextUid=Math.max(1,s.nextUid||1);
  const used=new Set(s.inventory.map(i=>i.uid));
  let uid;do{uid=`item-${s.nextUid++}`;}while(used.has(uid));
  const item={uid,id,rank:ITEMS[id].slot==='consumable'?0:Math.max(0,Math.min(3,Math.floor(rank)))};
  s.inventory.push(item);return item;
}
export function createState(){
  const s={version:1,party:{x:400,y:960,interior:null,returnPoint:null},heroes:[],inventory:[],nextUid:1,
    resources:{coins:360,ore:90,food:12,energy:20,renown:0},flags:{},cleared:{},chests:[],discovered:['haventide'],
    settlement:{hall:1,plots:Array(7).fill(null),stock:{food:0,ore:0,energy:0},timer:0},
    settings:{speed:1,wait:true,sound:true,reducedMotion:false},elapsed:0,lastTown:{x:400,y:960},journal:[],choices:{},sideQuests:{}};
  for(const id of Object.keys(HEROES)){
    const def=HEROES[id];const h={id,name:def.name,level:1,xp:0,sp:0,hp:def.base.maxHp,mp:def.base.maxMp,
      skills:Object.values(SKILLS).filter(k=>k.hero===id&&k.cost===0).map(k=>k.id),equip:{weapon:null,armor:null,accessory:null}};
    s.heroes.push(h);
    h.equip.weapon=addItem(s,{kaida:'iron_blade',vex:'void_shard',rune:'rune_gauntlet'}[id]).uid;
    h.equip.armor=addItem(s,'scrap_vest').uid;
    h.hp=stats(s,h).maxHp;h.mp=stats(s,h).maxMp;
  }
  addItem(s,'data_chip');
  for(let n=0;n<5;n++)addItem(s,'potion');
  for(let n=0;n<3;n++)addItem(s,'ether');
  for(let n=0;n<2;n++)addItem(s,'phoenix');
  return s;
}
export function itemName(instance){const d=ITEMS[instance?.id];return d?`${d.name}${instance.rank>0?' +'+instance.rank:''}`:'Unknown item';}
export function itemStats(instance){
  const d=ITEMS[instance?.id];if(!d)return {};
  const rank=finite(instance.rank,0,0,3);return Object.fromEntries(Object.entries(d.stats).map(([key,value])=>[key,Math.round(value*(1+rank*0.28))]));
}
export function settlementInfo(s){
  const out={rates:{food:0,ore:0,energy:0},caps:{food:0,ore:0,energy:0},stock:s.settlement.stock,bonuses:{maxHp:0,mag:0,def:0},forgeDiscount:0,
    anchorCount:['anchor_mire','anchor_ember','anchor_frost'].filter(id=>s.flags[id]).length};
  for(const p of s.settlement.plots){if(!p||!BUILDINGS[p.type])continue;const d=BUILDINGS[p.type],tier=p.tier||p.level||1;
    if(d.production){out.rates[d.production]+=d.rate*tier;out.caps[d.production]+=d.capacity*tier*s.settlement.hall;}
    for(const [k,v]of Object.entries(d.bonus||{})){if(k==='forgeDiscount')out.forgeDiscount+=v*tier;else out.bonuses[k]=(out.bonuses[k]||0)+v*tier;}
  }
  out.forgeDiscount=Math.min(0.5,out.forgeDiscount);return out;
}
export function stats(s,heroOrId){
  const h=heroOf(s,heroOrId);if(!h)return {...HEROES.kaida.base};
  const d=HEROES[h.id],out={};for(const [k,v]of Object.entries(d.base))out[k]=v+(d.growth[k]||0)*(h.level-1);
  for(const uid of Object.values(h.equip)){const item=s.inventory.find(i=>i.uid===uid);if(item)for(const [k,v]of Object.entries(itemStats(item)))out[k]=(out[k]||0)+v;}
  for(const [k,v] of Object.entries(settlementInfo(s).bonuses))out[k]+=v;
  for(const key of Object.keys(out))out[key]=Math.round(out[key]);out.crit=Math.min(55,out.crit);return out;
}
export function gainXp(s,amount){
  const messages=[];amount=Math.floor(finite(amount,0));
  for(const h of s.heroes){h.xp+=amount;while(h.level<30&&h.xp>=nextXp(h.level)){
    h.xp-=nextXp(h.level);h.level++;h.sp+=2;const st=stats(s,h);h.hp=st.maxHp;h.mp=st.maxMp;messages.push(`${h.name} reached level ${h.level} · +2 skill points · fully restored.`);
  }}return messages;
}
export function equip(s,heroId,uid){
  const h=heroOf(s,heroId),i=s.inventory.find(x=>x.uid===uid),d=ITEMS[i?.id];
  if(!h||!i||!d||d.slot==='consumable')return result(false,'Choose a piece of equipment.');
  if(d.heroes&&!d.heroes.includes(h.id))return result(false,`${d.name} cannot be equipped by ${h.name}.`);
  if(h.level<d.level)return result(false,`${d.name} requires level ${d.level}.`);
  const owner=occupied(s,uid);if(owner&&owner.id!==h.id)return result(false,`${d.name} is equipped by ${owner.name}. Unequip it first.`);
  h.equip[d.slot]=uid;tidyHero(s,h);return result(true,`${h.name} equipped ${itemName(i)}.`);
}
export function unequip(s,heroId,slot){const h=heroOf(s,heroId);if(!h||!Object.hasOwn(h.equip,slot)||!h.equip[slot])return result(false,'That slot is empty.');h.equip[slot]=null;tidyHero(s,h);return result(true,`${h.name} removed their ${slot}.`);}
export function learn(s,heroId,skillId){
  const h=heroOf(s,heroId),d=SKILLS[skillId];if(!h||!d||d.hero!==h.id)return result(false,'That technique belongs to another hero.');
  if(h.skills.includes(skillId))return result(false,'That technique is already learned.');
  if(h.level<d.level)return result(false,`Reach level ${d.level} to learn ${d.name}.`);
  if(d.requires&&!h.skills.includes(d.requires))return result(false,`Learn ${SKILLS[d.requires].name} first.`);
  if(h.sp<d.cost)return result(false,`You need ${d.cost} skill points.`);
  h.sp-=d.cost;h.skills.push(skillId);return result(true,`${h.name} learned ${d.name}.`);
}
export function buy(s,itemId){const d=Object.hasOwn(ITEMS,itemId)?ITEMS[itemId]:null;if(!d)return result(false,'That item is unavailable.');if(s.inventory.length>=250)return result(false,'Your pack is full. Sell an unused item first.');if(!pay(s,{coins:d.price}))return result(false,`You need ${d.price} coins.`);addItem(s,itemId);return result(true,`Purchased ${d.name}.`);}
export function sell(s,uid){const i=s.inventory.find(x=>x.uid===uid);if(!i)return result(false,'That item is no longer in your pack.');if(occupied(s,uid))return result(false,'Unequip this item before selling it.');const value=Math.max(1,Math.floor(ITEMS[i.id].price*(0.45+0.12*i.rank)));s.inventory.splice(s.inventory.indexOf(i),1);s.resources.coins+=value;return result(true,`Sold ${itemName(i)} for ${value} coins.`);}
export function upgradeCost(s,instance){
  const i=typeof instance==='string'?s.inventory.find(x=>x.uid===instance):instance,d=ITEMS[i?.id];if(!d||d.slot==='consumable'||i.rank>=3)return null;
  const r=i.rank+1,f=1-settlementInfo(s).forgeDiscount;return {coins:Math.ceil((25+d.tier*12)*r*f),ore:Math.ceil((5+d.tier*2)*r*f),energy:r===3?d.tier*2:0};
}
export function upgradeItem(s,uid){const i=s.inventory.find(x=>x.uid===uid),cost=upgradeCost(s,i);if(!cost)return result(false,'Only equipment below +3 can be upgraded.');const owner=occupied(s,uid);if(owner&&owner.level<i.rank+1)return result(false,`The wielder needs level ${i.rank+1} for this rank.`);if(!pay(s,cost))return result(false,`Upgrade requires ${costText(cost)}.`);i.rank++;return result(true,`${itemName(i)} forged. Its bonuses have increased.`);}
export function useItem(s,uid,heroId){
  const i=s.inventory.find(x=>x.uid===uid),d=ITEMS[i?.id],h=heroOf(s,heroId);if(!h||!d||d.slot!=='consumable')return result(false,'Choose a supply and an ally.');const t=stats(s,h);
  if(d.effect==='revive'){if(h.hp>0)return result(false,'Wakeflower is for fallen allies.');h.hp=Math.ceil(t.maxHp*d.power);}
  else {if(h.hp<=0)return result(false,'Revive this ally before using a tonic or ether.');if(d.effect==='heal'){if(h.hp>=t.maxHp)return result(false,'This ally is already at full HP.');h.hp=Math.min(t.maxHp,h.hp+d.power);}if(d.effect==='mp'){if(h.mp>=t.maxMp)return result(false,'This ally is already at full MP.');h.mp=Math.min(t.maxMp,h.mp+d.power);}}
  s.inventory.splice(s.inventory.indexOf(i),1);return result(true,`${d.name} used on ${h.name}.`);
}
export function rest(s,free=false){
  const need=s.heroes.some(h=>h.hp<stats(s,h).maxHp||h.mp<stats(s,h).maxMp);if(!need)return result(true,'Everyone is already fully rested.');
  const cost=20+Math.max(...s.heroes.map(h=>h.level))*3;
  let payment='';if(!free){if(s.resources.food>=6){s.resources.food-=6;payment=' for 6 food';}else if(pay(s,{coins:cost}))payment=` for ${cost} coins`;else return result(false,`Rest needs 6 food or ${cost} coins. Haventide’s inn is always free.`);}
  for(const h of s.heroes){const t=stats(s,h);h.hp=t.maxHp;h.mp=t.maxMp;}return result(true,`The party is fully restored${payment}.`);
}
export function buildingCost(s,plot,type){
  if(plot===-1){const next=s.settlement.hall+1;return next<=3?{coins:next===2?140:240,ore:next===2?30:50,energy:next===2?10:20}:null;}
  if(!Number.isInteger(plot)||plot<0||plot>=7)return null;
  const current=s.settlement.plots[plot],d=BUILDINGS[current?.type||type];if(!d)return null;const next=current?(current.tier||current.level)+1:1;if(next>3)return null;
  return Object.fromEntries(Object.entries(d.cost).map(([k,v])=>[k,Math.ceil(v*(next===1?1:next===2?1.6:2.3))]));
}
export function build(s,plot,type){
  if(!Number.isInteger(plot)||plot<0||plot>=7||!Object.hasOwn(BUILDINGS,type))return result(false,'Choose an empty settlement plot and a building.');
  if(s.settlement.plots[plot])return result(false,'This plot already has a building.');const cost=buildingCost(s,plot,type);
  if(!pay(s,cost))return result(false,`Construction requires ${costText(cost)}.`);
  s.settlement.plots[plot]={type,tier:1,level:1};s.resources.renown+=2;
  if(BUILDINGS[type].bonus?.maxHp)for(const h of s.heroes)if(h.hp>0)h.hp+=BUILDINGS[type].bonus.maxHp;
  return result(true,`${BUILDINGS[type].name} built. Haventide is growing.`);
}
export function upgradeBuilding(s,plot){
  if(plot===-1){const current=s.settlement.hall,anchors=settlementInfo(s).anchorCount;if(current>=3)return result(false,'The town hall is fully restored.');const needed=current===1?1:3;if(anchors<needed)return result(false,`Restore ${needed} ${needed===1?'anchor':'anchors'} before upgrading the town hall.`);const cost=buildingCost(s,-1);if(!pay(s,cost))return result(false,`Town hall upgrade requires ${costText(cost)}.`);s.settlement.hall++;s.resources.renown+=5;return result(true,`Town hall reached tier ${s.settlement.hall}. Storage and building capacity improved.`);}
  const p=s.settlement.plots[plot];if(!p)return result(false,'Build on this plot first.');const tier=p.tier||p.level;if(tier>=3)return result(false,'This building is fully upgraded.');if(tier>=s.settlement.hall)return result(false,`Upgrade the town hall to tier ${tier+1} first.`);const cost=buildingCost(s,plot);if(!pay(s,cost))return result(false,`Upgrade requires ${costText(cost)}.`);p.tier=tier+1;p.level=p.tier;s.resources.renown+=2;if(BUILDINGS[p.type].bonus?.maxHp)for(const h of s.heroes)if(h.hp>0)h.hp+=BUILDINGS[p.type].bonus.maxHp;return result(true,`${BUILDINGS[p.type].name} reached tier ${p.tier}.`);
}
export function tickSettlement(s,dtSeconds){
  const dt=finite(dtSeconds,0,0,3600);if(!dt)return;const info=settlementInfo(s);s.settlement.timer+=dt;
  for(const r of ['food','ore','energy'])s.settlement.stock[r]=Math.min(info.caps[r],s.settlement.stock[r]+info.rates[r]*dt/60);
}
export function collect(s){const earned={};for(const id of ['food','ore','energy']){const n=Math.floor(s.settlement.stock[id]);if(n){s.resources[id]+=n;s.settlement.stock[id]-=n;earned[id]=n;}}return result(Object.keys(earned).length>0,Object.keys(earned).length?`Collected ${costText(earned)}.`:'The stores are still filling. Production continues while you explore and battle.');}

function stringList(value,max=300){return Array.isArray(value)?[...new Set(value.filter(x=>typeof x==='string'&&x.length<120))].slice(0,max):[];}
function simpleMap(value,kind){const out={};if(!value||typeof value!=='object'||Array.isArray(value))return out;for(const [k,v]of Object.entries(value).slice(0,500)){if(k==='__proto__'||k==='constructor'||k==='prototype'||k.length>120)continue;if(kind==='number'&&Number.isFinite(v))out[k]=Math.floor(finite(v,0));else if(kind!=='number'&&(typeof v==='boolean'||typeof v==='string'||Number.isFinite(v)))out[k]=typeof v==='string'?v.slice(0,300):v;}return out;}
export function validateState(raw){
  if(!raw||raw.version!==1||!Array.isArray(raw.heroes)||!Array.isArray(raw.inventory)||!raw.party||!raw.resources)return null;
  if(raw.heroes.length!==3||raw.heroes.some(h=>!h||typeof h!=='object'||!Object.hasOwn(HEROES,h.id))||new Set(raw.heroes.map(h=>h.id)).size!==3)return null;
  const s=createState();s.nextUid=finite(raw.nextUid,1,1);const uids=new Set();s.inventory=[];
  for(const item of raw.inventory.slice(0,500)){if(!item||!Object.hasOwn(ITEMS,item.id)||typeof item.uid!=='string'||item.uid.length>80||uids.has(item.uid))continue;uids.add(item.uid);s.inventory.push({uid:item.uid,id:item.id,rank:ITEMS[item.id].slot==='consumable'?0:Math.floor(finite(item.rank,0,0,3))});}
  s.flags=simpleMap(raw.flags);s.cleared=simpleMap(raw.cleared,'number');s.choices=simpleMap(raw.choices);s.sideQuests=simpleMap(raw.sideQuests);
  s.chests=stringList(raw.chests);s.discovered=stringList(raw.discovered);s.journal=stringList(raw.journal);
  for(const key of Object.keys(s.resources))s.resources[key]=Math.floor(finite(raw.resources[key],s.resources[key]));
  s.elapsed=finite(raw.elapsed,0,0,1e9);
  s.party.x=finite(raw.party.x,s.party.x,0,10000);s.party.y=finite(raw.party.y,s.party.y,0,10000);
  s.party.interior=typeof raw.party.interior==='string'&&raw.party.interior.length<80?raw.party.interior:null;
  if(raw.party.returnPoint&&Number.isFinite(raw.party.returnPoint.x)&&Number.isFinite(raw.party.returnPoint.y))s.party.returnPoint={x:finite(raw.party.returnPoint.x,400,0,10000),y:finite(raw.party.returnPoint.y,960,0,10000)};
  if(raw.lastTown)s.lastTown={x:finite(raw.lastTown.x,400,0,10000),y:finite(raw.lastTown.y,960,0,10000)};
  if(raw.settings){s.settings={speed:[0.75,1,1.25,1.5,2].includes(raw.settings.speed)?raw.settings.speed:1,wait:raw.settings.wait!==false,sound:raw.settings.sound!==false,reducedMotion:raw.settings.reducedMotion===true};}
  if(raw.settlement){const st=raw.settlement;s.settlement.hall=Math.floor(finite(st.hall,1,1,3));s.settlement.timer=finite(st.timer,0,0,1e9);s.settlement.plots=Array.from({length:7},(_,i)=>{const p=st.plots?.[i];if(!p||!Object.hasOwn(BUILDINGS,p.type))return null;const tier=Math.floor(finite(p.tier??p.level,1,1,s.settlement.hall));return {type:p.type,tier,level:tier};});const caps=settlementInfo(s).caps;for(const r of ['food','ore','energy'])s.settlement.stock[r]=finite(st.stock?.[r],0,0,caps[r]);}
  const equipped=new Set();s.heroes=Object.keys(HEROES).map(id=>{const source=raw.heroes.find(h=>h.id===id),d=HEROES[id];const level=Math.floor(finite(source.level,1,1,30));const h={id,name:d.name,level,xp:Math.floor(finite(source.xp,0,0,nextXp(level)-1)),sp:Math.floor(finite(source.sp,0,0,60)),hp:finite(source.hp,1),mp:finite(source.mp,0),skills:stringList(source.skills).filter(k=>SKILLS[k]?.hero===id&&SKILLS[k].level<=level),equip:{weapon:null,armor:null,accessory:null}};
    for(const skill of Object.values(SKILLS).filter(k=>k.hero===id&&k.cost===0))if(!h.skills.includes(skill.id))h.skills.push(skill.id);
    for(const slot of Object.keys(h.equip)){const uid=source.equip?.[slot],i=s.inventory.find(x=>x.uid===uid),item=ITEMS[i?.id];if(item&&item.slot===slot&&item.level<=level&&(!item.heroes||item.heroes.includes(id))&&!equipped.has(uid)){h.equip[slot]=uid;equipped.add(uid);}}return h;});
  for(const h of s.heroes)tidyHero(s,h);return s;
}
export function save(s,slot='auto'){
  slot=slotName(slot);if(!SLOTS.has(slot))return result(false,'Choose save slot 1, 2, 3, or auto.');
  try{const clean=validateState(s);if(!clean)return result(false,'This game state could not be validated.');globalThis.localStorage.setItem(`${SAVE_PREFIX}:${slot}`,JSON.stringify({version:1,savedAt:new Date().toISOString(),state:clean}));return result(true,slot==='auto'?'Autosaved.':`Saved in slot ${slot}.`);}catch{return result(false,'Save storage is unavailable or full. Your current adventure is still running.');}
}
export function load(slot='auto'){try{slot=slotName(slot);if(!SLOTS.has(slot))return null;const raw=JSON.parse(globalThis.localStorage.getItem(`${SAVE_PREFIX}:${slot}`));return raw?.version===1?validateState(raw.state):null;}catch{return null;}}
export function saveMeta(slot='auto'){try{slot=slotName(slot);const raw=JSON.parse(globalThis.localStorage.getItem(`${SAVE_PREFIX}:${slot}`));const s=raw?.version===1?validateState(raw.state):null;if(!s)return null;return {slot,savedAt:raw.savedAt,date:raw.savedAt,level:s.heroes[0].level,elapsed:s.elapsed,coins:s.resources.coins,anchors:settlementInfo(s).anchorCount,chapter:s.flags.victory?'The Unwritten Hour':s.flags.truth?'The Last Crown':'The Anchor Trail'};}catch{return null;}}
export function removeSave(slot='auto'){slot=slotName(slot);if(!SLOTS.has(slot))return result(false,'Unknown save slot.');try{globalThis.localStorage.removeItem(`${SAVE_PREFIX}:${slot}`);return result(true,`Save ${slot} deleted.`);}catch{return result(false,'Save storage is unavailable.');}}
