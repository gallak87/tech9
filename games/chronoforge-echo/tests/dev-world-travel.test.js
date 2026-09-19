import test from 'node:test';
import assert from 'node:assert/strict';
import {WorldTravelPreview} from '../src/dev-world-travel.js';
import {createState} from '../src/progression.js';
import {REGIONS,safeArrival,isWalkable} from '../src/world.js';
import {mapRegionVisible,mapPointVisible,mapTravelAction} from '../src/expedition-map-model.js';
import {saveState,loadState,exportSave} from '../src/persistence.js';

function fixture() {
  const game={state:createState(),mode:'world',battle:null,transition:null,
    ui:{blocked:false,panel:null},upgradeTour:{open:false},
    travel(id,spawn){this.transition={to:id,spawn:safeArrival(REGIONS[id],spawn.x,spawn.y)};},
  };
  return {game,preview:new WorldTravelPreview(game)};
}

test('world preview isolates gameplay without revealing or changing the original survey',()=>{
  const {game,preview}=fixture(),original=game.state,baseline=structuredClone(original);
  assert.equal(preview.enable(),true);
  assert.equal(preview.enable(),false,'Repeated activation must not replace the real expedition');
  assert.equal(preview.active,true);
  assert.notEqual(game.state,original);
  assert.deepEqual(game.state.visited,original.visited);
  assert.deepEqual(game.state.fog,original.fog);
  assert.deepEqual(game.state.flags,original.flags);
  assert.equal(game.state.tier,original.tier);
  game.state.resources.ore+=100;
  game.state.flags.beacon_restored=true;
  game.state.heroes[0].level=99;
  assert.deepEqual(original,baseline,'Gameplay in the preview must remain isolated');
  assert.equal(preview.restore(),true);
  assert.equal(game.state,original);
  assert.deepEqual(game.state,baseline);
  assert.equal(preview.active,false);
  assert.equal(preview.original,null);
  assert.equal(preview.preview,null);
});

test('all eight region jumps use safe arrivals while story gates remain untouched',()=>{
  const {game,preview}=fixture(),flags=structuredClone(game.state.flags);
  game.devTools={mapExplored:false};
  assert.equal(preview.active,false);
  for(const region of Object.values(REGIONS)) {
    assert.equal(preview.jump(region.id),true);
    assert.equal(preview.active,true,'The first jump starts the detached expedition automatically');
    assert.equal(game.transition.to,region.id);
    assert.equal(isWalkable(region,game.transition.spawn.x,game.transition.spawn.y),true);
    assert.equal(preview.jump('haventide'),false,'Cannot jump during an existing transition');
    game.transition=null;
  }
  for(const invalid of ['missing','haventide_town','__proto__','constructor'])assert.equal(preview.jump(invalid),false);
  assert.deepEqual(game.state.flags,flags);
  assert.equal(game.state.tier,1);
});

test('map reveal is independent of temporary travel and never writes survey or save data',()=>{
  const {game,preview}=fixture(),original=game.state,baseline=structuredClone(original);
  game.devTools={mapExplored:true};
  for(const region of Object.values(REGIONS)) {
    assert.equal(mapRegionVisible(game,region.id),true);
    assert.equal(mapPointVisible(game,region.id,region.width-1,region.height-1),true);
  }
  assert.equal(preview.active,false,'Revealing the menu map does not start a trip');
  assert.equal(preview.saveSource().state,original);
  assert.deepEqual(original,baseline);
  game.devTools.mapExplored=false;
  assert.equal(preview.jump('last_crown'),true,'Quick jump needs no map reveal');
  game.transition=null;
  game.state.region='last_crown';game.state.x=4000;game.state.y=400;
  const detached=game.state,before=structuredClone(detached);
  game.devTools.mapExplored=true;
  assert.equal(mapTravelAction(game,'mire_bog').action,'dev-world:mire_bog');
  game.devTools.mapExplored=false;
  assert.equal(mapRegionVisible(game,'mire_bog'),false);
  assert.equal(mapPointVisible(game,'mire_bog',100,100),false);
  assert.equal(game.state,detached,'Turning reveal off must not end a trip');
  assert.deepEqual(game.state,before,'Toggling cannot move the party or change its survey');
  assert.equal(preview.saveSource().state,original);
  assert.deepEqual(original,baseline);
  assert.equal(preview.jump('mire_bog'),true,'Quick jumps remain available after turning reveal off');
  assert.equal(preview.restore(),true);
  assert.equal(game.state,original);
});

test('first jumps work from the menu but invalid destinations never create a preview',()=>{
  const {game,preview}=fixture(),original=game.state;
  for(const invalid of ['missing','haventide_town','__proto__','constructor']) {
    assert.equal(preview.jump(invalid),false);
    assert.equal(preview.active,false);
    assert.equal(game.state,original);
  }
  game.ui={blocked:true,menu:true,panel:null};
  assert.equal(preview.jump('last_crown'),true);
  assert.equal(preview.active,true);
  assert.equal(preview.saveSource().state,original);
});

test('autosave, manual save and export use the original expedition even during a preview battle',()=>{
  const {game,preview}=fixture(),baseline=structuredClone(game.state);
  const slots=new Map(),storage={getItem:key=>slots.get(key)??null,setItem:(key,value)=>slots.set(key,value)};
  preview.enable();
  game.state.region='last_crown';game.state.x=4000;game.state.y=400;
  game.state.flags.final_ready=true;game.state.resources.ore=9999;
  game.state.heroes[0].hp=1;game.state.playTime=9000;
  game.battle={id:'preview-only-battle'};game.mode='battle';
  const source=preview.saveSource();
  assert.equal(source.battle,null);
  assert.deepEqual(source.state,baseline);
  for(const slot of ['checkpoint',1]) {
    saveState(source.state,slot,storage);
    const saved=loadState(slot,storage);
    for(const key of ['region','x','y','fog','visited','flags','resources','heroes','playTime'])
      assert.deepEqual(saved[key],baseline[key],`Save ${slot}: ${key}`);
    assert.equal(saved.suspendedBattle,undefined);
    assert.equal(JSON.parse(exportSave(slot,storage)).state.flags.final_ready,undefined);
  }
  preview.restore();
  assert.deepEqual(game.state,baseline);
  // In ordinary play, the save seam still supplies real suspended battles.
  assert.equal(preview.saveSource().battle,game.battle);
});

test('loading or starting another expedition discards preview references without restoring the old state',()=>{
  const {game,preview}=fixture();preview.enable();
  const loaded=createState();loaded.resources.ore=42;game.state=loaded;
  assert.equal(preview.active,false);
  assert.equal(preview.saveSource().state,loaded);
  assert.equal(preview.restore(),false);
  assert.equal(game.state,loaded);
  assert.equal(preview.original,null);
  assert.equal(preview.preview,null);
  assert.equal(preview.enable(),true);
  game.state.resources.ore=999;
  preview.restore();assert.equal(game.state.resources.ore,42);
});

test('activation waits for exploration and jumps cannot interrupt encounters, dialogue or recruitment',()=>{
  for(const patch of [
    {mode:'title'},{mode:'battle',battle:{}},{transition:{}},
    {ui:{blocked:true,panel:{}}},{upgradeTour:{open:true}},{state:{...createState(),recruitmentWalk:{}}},
  ]) {
    const {game,preview}=fixture();Object.assign(game,patch);
    assert.equal(preview.enable(),false);
  }
  for(const patch of [
    {mode:'battle',battle:{}},{transition:{}},{ui:{panel:{}}},{upgradeTour:{open:true}},
    {state:{...createState(),recruitmentWalk:{}}},
  ]) {
    const {game,preview}=fixture();preview.enable();
    if(patch.state)Object.assign(game.state,patch.state);else Object.assign(game,patch);
    assert.equal(preview.jump('last_crown'),false);
  }
});
