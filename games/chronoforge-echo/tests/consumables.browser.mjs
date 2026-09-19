import {reviewRoot} from '../scripts/review-output.mjs';
import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {createState,useItem,stats} from '../src/progression.js';
import {consumeItem} from '../src/consumables.js';
import {createBattle,battleIntent,battleView,updateBattle} from '../src/combat.js';

// One focused check: shared spend boundary, battle execution, then real keys in
// the inventory and battle confirmation. No campaign traversal or full suite.
const state=createState(),hero=state.heroes[0],limits={maxHp:100,maxMp:100};
state.inventory={field_tonic:20,ether_cell:20,dawn_seed:4};hero.hp=100;hero.mp=100;
assert.equal(consumeItem(state,'field_tonic',hero,limits).ok,false);
assert.equal(consumeItem(state,'ether_cell',hero,limits).ok,false);
assert.equal(consumeItem(state,'dawn_seed',hero,limits).ok,false);
assert.deepEqual(state.inventory,{field_tonic:20,ether_cell:20,dawn_seed:4});
for(const [id,key,power]of [['field_tonic','hp',80],['ether_cell','mp',30]]){
 hero[key]=99;const warning=consumeItem(state,id,hero,limits);
 assert.equal(warning.needsConfirmation,true);assert.equal(warning.amount,1);assert.equal(warning.wasted,power-1);
 assert.equal(state.inventory[id],20,'Unconfirmed use spends nothing');
 assert.equal(consumeItem(state,id,hero,limits,{confirmation:warning.confirmationKey}).ok,true);
 assert.equal(hero[key],100);assert.equal(state.inventory[id],19);
 hero[key]=50;const direct=consumeItem(state,id,hero,limits);
 assert.equal(direct.ok,true);assert.equal(direct.amount,Math.min(50,power));assert.equal(state.inventory[id],18);
 hero[key]=99;const stale=consumeItem(state,id,hero,limits);hero[key]=100;
 assert.equal(consumeItem(state,id,hero,limits,{confirmation:stale.confirmationKey}).ok,false);
 assert.equal(state.inventory[id],18,'Target rechecked on confirmation');
 hero[key]=99;state.inventory[id]=0;
 assert.equal(consumeItem(state,id,hero,limits,{confirmation:stale.confirmationKey}).ok,false);
}
hero.hp=0;state.inventory.field_tonic=1;
assert.equal(consumeItem(state,'field_tonic',hero,limits).ok,false);
assert.equal(consumeItem(state,'dawn_seed',hero,limits).ok,true);assert.equal(hero.hp,35);
hero.hp=stats(hero,state).maxHp;assert.equal(useItem(state,'field_tonic',hero.id).ok,false);

function battleFixture(hp=100,mp=100){
 const s=createState();s.inventory.field_tonic=3;s.inventory.ether_cell=3;
 const b=createBattle(s,{id:'supply-check',enemies:['rust_scrapper']}),h=b.heroes[0];
 Object.assign(h,{hp,mp,maxHp:100,maxMp:100,atb:100});b.readyQueue=[h.id];b.selectedHero=h.id;
 const choose=id=>{battleIntent(b,s,{kind:'command',index:3});battleIntent(b,s,{kind:'list',index:battleView(b,s).items.findIndex(i=>i.id===id)});battleIntent(b,s,{kind:'execute'});};
 return {s,b,h,choose};
}
for(const [id,key]of [['field_tonic','hp'],['ether_cell','mp']]){
 const {s,b,h,choose}=battleFixture();choose(id);
 assert.equal(b.action,null);assert.equal(h.atb,100);assert.equal(s.inventory[id],3);
 h[key]=99;choose(id);assert.ok(b.itemConfirmation);assert.equal(b.action,null);
 battleIntent(b,s,{kind:'item-cancel'});assert.equal(b.mode,'target');assert.equal(s.inventory[id],3);
 battleIntent(b,s,{kind:'execute'});battleIntent(b,s,{kind:'item-confirm'});
 assert.ok(b.action);assert.equal(s.inventory[id],3,'No stock spent before contact');
 updateBattle(b,s,b.action.contact+.001);assert.equal(h[key],100);assert.equal(s.inventory[id],2);
 const changed=battleFixture(key==='hp'?50:100,key==='mp'?50:100);changed.choose(id);assert.ok(changed.b.action);
 changed.h[key]=100;updateBattle(changed.b,changed.s,changed.b.action.contact+.001);
 assert.equal(changed.s.inventory[id],3,'No effect at contact keeps the supply');
 const empty=battleFixture(key==='hp'?50:100,key==='mp'?50:100);empty.choose(id);empty.s.inventory[id]=0;
 updateBattle(empty.b,empty.s,empty.b.action.contact+.001);assert.equal(empty.h[key],50,'No stock means no free restoration');
}

const browser=await chromium.launch({channel:'chrome',headless:true});
try{
 const p=await browser.newPage({viewport:{width:1440,height:900}}),errors=[];
 p.on('pageerror',e=>errors.push(String(e)));
 await p.goto(process.env.ECHO_CONSUMABLE_URL||'http://127.0.0.1:4324/?test=1');await p.waitForFunction(()=>window.__ECHO_READY__);
 await p.evaluate(async()=>{const g=__ECHO__.game,P=await import('/src/progression.js'),{ITEMS}=await import('/src/content.js');__ECHO__.preset('party');g.ui.hero=1;const h=g.state.heroes[1];h.hp=P.stats(h,g.state).maxHp-1;for(const id of Object.keys(ITEMS))g.state.inventory[id]=3;g.ui.menu=true;g.ui.tab=2;g.ui.item='field_tonic';g.ui.render();});
 const before=await p.evaluate(()=>{const g=__ECHO__.game,pack=document.querySelector('.exp-pack-items');pack.scrollTop=60;return {stock:g.state.inventory.field_tonic,hp:g.state.heroes[1].hp,pack:pack.scrollTop};});
 await p.locator('[data-do="use:field_tonic"]').click();
 await p.locator('.purchase-confirm').waitFor();
 assert.match(await p.locator('.purchase-confirm').textContent(),/restores 1 HP.*79 HP will be wasted/);
 const savedScroll=await p.evaluate(()=>__ECHO__.game.ui.panel.returnScroll.pack);
 await p.screenshot({path:reviewRoot + 'echo-consumable-confirm.png'});
 await p.keyboard.press('Escape');
 const canceled=await p.evaluate(()=>{const g=__ECHO__.game;return {stock:g.state.inventory.field_tonic,hp:g.state.heroes[1].hp,hero:g.ui.hero,item:g.ui.item,focus:document.activeElement.dataset.do,pack:document.querySelector('.exp-pack-items').scrollTop};});
 assert.equal(canceled.stock,before.stock);assert.equal(canceled.hp,before.hp);assert.equal(canceled.hero,1);assert.equal(canceled.item,'field_tonic');assert.equal(canceled.focus,'use:field_tonic');assert.equal(canceled.pack,savedScroll);
 await p.keyboard.press('Enter');await p.locator('.purchase-confirm').waitFor();await p.keyboard.press('Enter');
 const accepted=await p.evaluate(()=>{const g=__ECHO__.game;return {stock:g.state.inventory.field_tonic,hp:g.state.heroes[1].hp,hero:g.ui.hero,item:g.ui.item};});
 assert.equal(accepted.stock,before.stock-1);assert.equal(accepted.hp,before.hp+1);assert.equal(accepted.hero,1);assert.equal(accepted.item,'field_tonic');
 await p.evaluate(async()=>{__ECHO__.preset('battle');const g=__ECHO__.game,b=g.battle,h=b.heroes[0];h.hp=h.maxHp-1;h.atb=100;b.readyQueue=[h.id];b.selectedHero=h.id;const C=await import('/src/combat.js');C.battleIntent(b,g.state,{kind:'command',index:3});C.battleIntent(b,g.state,{kind:'list',index:C.battleView(b,g.state).items.findIndex(i=>i.id==='field_tonic')});});
 await p.locator('[data-battle-intent="execute"]').click();await p.locator('.purchase-confirm').waitFor();
 await p.keyboard.press('Escape');assert.equal(await p.evaluate(()=>__ECHO__.game.battle.mode),'target');
 assert.equal(await p.evaluate(()=>__ECHO__.game.state.inventory.field_tonic),5);
 await p.keyboard.press('Enter');await p.locator('.purchase-confirm').waitFor();await p.keyboard.press('Enter');
 await p.waitForFunction(()=>__ECHO__.game.state.inventory.field_tonic===4);
 assert.equal(await p.evaluate(()=>{const h=__ECHO__.game.battle.heroes[0];return h.hp===h.maxHp;}),true);
 assert.deepEqual(errors,[]);
 console.log(JSON.stringify({sharedBoundary:'Full/no-effect blocked; 99/100 confirms with exact waste; 50/100 direct; MP equivalent; stock/target rechecked; revive preserved',battle:'Full blocks without ATB spend; cancel/accept; contact rechecks stock and effect',ui:'Actual Escape/Enter cancel/accept in inventory and battle; selected hero/item/focus/scroll retained',screenshot:reviewRoot + 'echo-consumable-confirm.png',errors},null,2));
}finally{await browser.close();}
