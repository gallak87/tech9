import test from 'node:test';
import assert from 'node:assert/strict';
import {createState,build,advanceTier,tierEligibility} from '../src/progression.js';
import {onEvent,interactStory} from '../src/narrative.js';

const stages=[
 {tier:1,name:'Reclaimer',buildings:{town_center:2},flags:['beacon_restored'],cost:{food:35,ore:35,energy:15,renown:12}},
 {tier:2,name:'Ascendant',buildings:{town_center:3,research_lab:1},flags:['rune_recruited'],cost:{food:70,ore:85,energy:60,renown:65}},
 {tier:3,name:'Transcendent',buildings:{town_center:4,research_lab:2,forge:2,walls:2},flags:['forest_seal','mire_seal','crater_seal','frost_seal'],cost:{food:130,ore:150,energy:130,renown:180}}
];
const ready=stage=>{const s=createState();s.tier=stage.tier;s.buildings={...stage.buildings};s.flags=Object.fromEntries(stage.flags.map(id=>[id,true]));s.resources={...stage.cost};return s;};

for(const stage of stages)test(`${stage.name}: each building, story and cost blocks advancement with its own instruction`,()=>{
 const cases=[
  ...Object.keys(stage.buildings).map(id=>({id,type:'building',remove:s=>s.buildings[id]--})),
  ...stage.flags.map(id=>({id,type:'story',remove:s=>delete s.flags[id]})),
  ...Object.keys(stage.cost).map(id=>({id,type:'resource',remove:s=>s.resources[id]--}))
 ];
 for(const missing of cases){
  const s=ready(stage);missing.remove(s);const before=JSON.stringify(s),status=tierEligibility(s);
  assert.equal(status.eligible,false,missing.id);
  assert.equal(status.complete,false);
  assert.equal(status.missing.length,1);
  assert.equal(status.missing[0].id,missing.id);
  assert.equal(status.missing[0].type,missing.type);
  assert.ok(status.missing[0].instruction.length>10);
  assert.ok(status.reason.includes(status.missing[0].instruction));
  assert.equal(status.requirements.filter(r=>r.met).length,status.requirements.length-1);
  const result=advanceTier(s);
  assert.equal(result.ok,false);
  assert.equal(result.message,status.reason);
  assert.equal(JSON.stringify(s),before,'A blocked attempt must not change resources, tier or flags');
 }
 // Exact costs remain sufficient, with no hidden story or regional requirement.
 const s=ready(stage),before=JSON.stringify(s),status=tierEligibility(s);
 assert.equal(status.eligible,true);
 assert.equal(status.name,stage.name);
 assert.deepEqual(status.cost,stage.cost);
 assert.equal(JSON.stringify(s),before,'Reading eligibility must not change a save');
 assert.equal(advanceTier(s).ok,true);
 assert.equal(s.tier,stage.tier+1);
 assert.deepEqual(s.resources,{food:0,ore:0,energy:0,renown:0});
});

test('advancement lists every unmet requirement and precise resource shortfalls together',()=>{
 const s=createState();s.resources={food:34.5,ore:35,energy:0,renown:0};
 const status=tierEligibility(s);
 assert.deepEqual(status.missing.map(r=>r.id),['town_center','beacon_restored','food','energy','renown']);
 assert.match(status.reason,/Town Center to level 2 \(currently 1\)/);
 assert.match(status.reason,/listening buoy west of Haventide/);
 assert.match(status.reason,/Gather 1 more food \(34 \/ 35\)/);
 assert.equal(status.requirements.find(r=>r.id==='ore').met,true);
 assert.equal(status.reason.includes('Gather 0 more ore'),false);
 assert.deepEqual(tierEligibility(JSON.parse(JSON.stringify(s))),status,'Old saves need no new field');
});

test('legitimate Town Center upgrade and beacon restoration immediately unlock Reclaimer',()=>{
 const s=createState();Object.assign(s.resources,{food:500,ore:500,energy:500,renown:500});
 onEvent(s,'victory','hav_guard');
 assert.equal(tierEligibility(s).eligible,false);
 assert.equal(build(s,'town_center').ok,true);
 assert.deepEqual(tierEligibility(s).missing.map(r=>r.id),['beacon_restored']);
 interactStory(s,'hav_beacon');
 assert.equal(tierEligibility(s).eligible,true);
 const before={...s.resources};
 const result=advanceTier(s);
 assert.equal(result.ok,true);
 assert.match(result.message,/become Reclaimer/);
 for(const [id,n] of Object.entries(stages[0].cost))assert.equal(s.resources[id],before[id]-n);
 assert.equal(s.tier,2);
 assert.equal(tierEligibility(s).name,'Ascendant');
 assert.equal(tierEligibility(s).eligible,false);
});

test('Transcendent has no next purchase, cost or impossible unlock instruction',()=>{
 const s=ready(stages[2]);advanceTier(s);const before=JSON.stringify(s),status=tierEligibility(s);
 assert.equal(status.complete,true);
 assert.equal(status.eligible,false);
 assert.equal(status.nextTier,null);
 assert.deepEqual(status.missing,[]);
 assert.deepEqual(status.cost,{});
 assert.equal(advanceTier(s).ok,false);
 assert.equal(JSON.stringify(s),before);
});
