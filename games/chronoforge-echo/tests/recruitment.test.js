import test from 'node:test';
import assert from 'node:assert/strict';
import {createState} from '../src/progression.js';
import {interactStory,onEvent,mainObjective,questList} from '../src/narrative.js';
import {prepareRecruitment,recruitmentActor,advanceRecruitment,completeRecruitment} from '../src/recruitment.js';
import {ALL_SCENES,isWalkable,nearby} from '../src/world.js';
import {saveState,loadState} from '../src/persistence.js';
const text=r=>r.lines.map(l=>l.text).join(' ');
const storage=()=>{const m=new Map();return {getItem:k=>m.get(k),setItem:(k,v)=>m.set(k,v)};};
function ember(){const s=createState();onEvent(s,'victory','hav_guard');interactStory(s,'hav_beacon');onEvent(s,'victory','ember_guard');s.region='emberline_town';const npc=ALL_SCENES[s.region].objects.find(o=>o.id==='vex');s.x=npc.x;s.y=npc.y+34;s.facing='right';return s;}

test('Exchange liberation and repeated introductions name the separate observatory gate without joining',()=>{
 const s=ember(),first=interactStory(s,'vex');assert.match(text(first),/Neon Cultist and a Drone Sentinel/);assert.match(text(first),/northwest of the Lantern Exchange/);
 const saved=loadState('test',(()=>{const st=storage();saveState(s,'test',st);return st;})());
 const reminder=interactStory(saved,'vex');assert.notDeepEqual(reminder.lines,first.lines);assert.match(text(reminder),/Exchange is open, but the observatory is still occupied/);
 assert.equal(saved.heroes.length,1);assert.equal(reminder.recruitment,undefined);assert.match(mainObjective(saved),/Defeat the Neon Cultist/);assert.equal(questList(saved).find(q=>q.id==='vex_recruitment').stage,'Lens guarded');
 const lens=createState();assert.match(text(interactStory(lens,'ember_observatory')),/just south/);assert.equal(lens.flags.vex_met,undefined);assert.equal(lens.heroes.length,1);
});

test('both earned Vex endpoints recruit once, without falsely replaying join or reward after save/load',()=>{
 for(const endpoint of ['vex','ember_observatory']){
  const s=ember();onEvent(s,'victory','ember_signal');assert.match(mainObjective(s),/observatory is clear/);
  const joined=interactStory(s,endpoint);assert.deepEqual(joined.recruitment,{id:'vex'});assert.equal(s.heroes.filter(h=>h.id==='vex').length,1);assert.equal(s.flags.vex_recruited,true);
  assert.equal(joined.rewards.find(r=>r.id==='xp').amount,225);assert.equal(joined.rewards.some(r=>r.id==='vex'&&/join/i.test(r.label)),false,'Join toast waits for walk completion');
  const st=storage();saveState(s,'test',st);const restored=loadState('test',st),before=JSON.stringify(restored.resources);assert.equal(interactStory(restored,endpoint).recruitment,undefined);assert.equal(interactStory(restored,endpoint).rewards.length,0);assert.equal(JSON.stringify(restored.resources),before);
  assert.equal(nearby(ALL_SCENES.emberline_town,410,705,restored).some(o=>o.id==='vex'),false);
  delete restored.flags.vex_recruited;interactStory(restored,'ember_observatory');assert.equal(restored.flags.vex_recruited,true);assert.equal(restored.heroes.length,2);
 }
});

test('earned walk progresses across multiple visible positions and save/load preserves progress and one completion',()=>{
 const s=ember();onEvent(s,'victory','ember_signal');interactStory(s,'vex');const scene=ALL_SCENES[s.region];
 const npc=scene.objects.find(o=>o.id==='vex'),target={x:s.x-72,y:s.y};const w=prepareRecruitment(s,'vex',scene,npc,target);assert.ok(w.duration>=1.6);assert.ok(w.length>70);
 const start=recruitmentActor(s);assert.equal(start.moving,false);assert.equal(advanceRecruitment(s,.4),false);const mid=recruitmentActor(s);assert.ok(mid.moving);assert.ok(Math.hypot(mid.x-start.x,mid.y-start.y)>10);
 const st=storage();saveState(s,'mid',st);const restored=loadState('mid',st);assert.deepEqual(recruitmentActor(restored),mid);
 for(let i=0;i<60&&!advanceRecruitment(restored,.05);i++){const p=recruitmentActor(restored);assert.ok(isWalkable(scene,p.x,p.y),'Cinematic stays on accessible floor');}
 const end=recruitmentActor(restored);assert.equal(end.x,target.x);assert.equal(end.y,target.y);assert.deepEqual(completeRecruitment(restored),{id:'vex',kind:'recruitment',label:'Vex joined the party',amount:1});
 saveState(restored,'done',st);const done=loadState('done',st);assert.equal(completeRecruitment(done),null);assert.equal(prepareRecruitment(done,'vex',scene,start,end),null);assert.equal(done.heroes.length,2);
});

test('reduced motion, skip and scene change settle actual party membership without duplicate grants',()=>{
 for(const mode of ['reduced','skip','travel']){
  const s=ember();onEvent(s,'victory','ember_signal');interactStory(s,'vex');prepareRecruitment(s,'vex',ALL_SCENES[s.region],{x:410,y:705},{x:338,y:739});
  if(mode==='reduced')s.settings.reducedMotion=true;if(mode==='travel')s.region='emberline';
  if(mode!=='skip')assert.equal(advanceRecruitment(s,.016),true);
  assert.equal(completeRecruitment(s).label,'Vex joined the party');assert.equal(s.recruitmentWalk,undefined);assert.equal(s.heroes.length,2);assert.equal(completeRecruitment(s),null);
 }
});

test('Rune uses the same earned, one-time recruitment presentation after Anchor Nine guard',()=>{
 const s=ember();assert.match(text(interactStory(s,'orbital_lift')),/Frost Revenant and Gravbot/);assert.equal(s.heroes.length,1);
 onEvent(s,'victory','orbital_guard');const r=interactStory(s,'rune');assert.deepEqual(r.recruitment,{id:'rune'});assert.equal(s.flags.rune_recruited,true);assert.equal(r.rewards.find(r=>r.id==='xp').amount,425);assert.equal(interactStory(s,'orbital_lift').recruitment,undefined);
});

test('quest reward chips match the next actual claim, including chosen branch items',()=>{
 const s=ember();interactStory(s,'vex');const main=questList(s).find(q=>q.id==='main');assert.deepEqual(main.rewardItems,[{id:'xp',amount:225},{id:'ore',amount:65},{id:'energy',amount:45},{id:'renown',amount:20}]);
 onEvent(s,'victory','ember_signal');interactStory(s,'vex');let q=questList(s).find(q=>q.id==='vex');assert.deepEqual(q.rewardItems,[{id:'xp',amount:250},{id:'energy',amount:25}]);
 interactStory(s,'vex_record');q=questList(s).find(q=>q.id==='vex');assert.equal(q.rewardItems.some(r=>r.id.includes('prism')),false);assert.ok(q.rewardNotes.some(n=>n.includes('Choice of')));
 s.flags.vex_keep=true;q=questList(s).find(q=>q.id==='vex');assert.ok(q.rewardItems.some(r=>r.id==='witness_prism'&&r.amount===1));assert.equal(q.rewardItems.some(r=>r.id==='quiet_prism'),false);
});
