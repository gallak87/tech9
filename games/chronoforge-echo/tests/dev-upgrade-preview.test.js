import test from 'node:test';
import assert from 'node:assert/strict';
import {createState,recruit} from '../src/progression.js';
import {saveState,loadState,exportSave} from '../src/persistence.js';
import {getScene,isWalkable} from '../src/world.js';
import {townCenterBounds} from '../src/town-center-art.js';
import {upgradePreviewStates,upgradeTourCameras,UpgradeTour,UPGRADE_TOUR_DURATION} from '../src/dev-upgrade-preview.js';

function freeze(value){if(value&&typeof value==='object'){Object.freeze(value);Object.values(value).forEach(freeze);}return value;}

test('all three indoor upgrade rehearsals preserve civilization, expedition, and real saves',()=>{
  const state=createState();recruit(state,'vex');recruit(state,'rune');
  state.region='haventide_town';state.tier=2;state.buildings.town_center=3;
  Object.assign(state,getScene('haventide_town').spawn);
  state.visited.haventide_town=true;state.fog.haventide={'4,2':true};state.playTime=532;
  const baseline=structuredClone(state);freeze(state);
  const slots=new Map(),storage={getItem:key=>slots.get(key)??null,setItem:(key,value)=>slots.set(key,value)};
  for(const level of [1,2,3]){
    const plan=upgradePreviewStates(state,level);
    assert.equal(plan.before.buildings.town_center,level);
    assert.equal(plan.after.buildings.town_center,level+1);
    for(const frame of [plan.before,plan.after]){
      assert.equal(frame.tier,2,'An art rehearsal does not advance civilization or unlock vendors');
      assert.equal(frame.region,state.region);
      assert.deepEqual(frame.resources,state.resources);
      assert.deepEqual(frame.flags,state.flags);
      assert.deepEqual(frame.fog,state.fog);
      assert.deepEqual(frame.visited,state.visited);
      assert.equal(frame.x,state.x);assert.equal(frame.y,state.y);
      assert.notEqual(frame.heroes,state.heroes);
    }
    // Even a future renderer accidentally mutating its picture cannot reach
    // either the live game or the other picture through a nested reference.
    plan.after.resources.ore=0;plan.after.heroes[0].hp=1;
    assert.deepEqual(plan.before.resources,state.resources);
    assert.deepEqual(plan.before.heroes,state.heroes);
    const tour=new UpgradeTour();tour.play();tour.advance(2);tour.skip();tour.play();tour.advance(100);
    assert.deepEqual(state,baseline);
    saveState(state,'checkpoint',storage);saveState(state,1,storage);
    assert.deepEqual(loadState('checkpoint',storage),baseline);
    assert.deepEqual(JSON.parse(exportSave(1,storage)).state,baseline);
  }
  for(const invalid of [0,4,2.5,'2',NaN])assert.throws(()=>upgradePreviewStates(state,invalid));
});

test('upgrade tour starts at the indoor desk, visits before/after outside, and returns inside',()=>{
  const tour=new UpgradeTour();
  assert.equal(tour.phase,'ready');assert.equal(tour.frame.from,'deskBefore');
  tour.advance(50);assert.equal(tour.phase,'ready');
  tour.play();
  const seen=[];
  while(tour.phase==='playing'){
    const frame=tour.frame;
    if(seen.at(-1)!==frame.id)seen.push(frame.id);
    assert.ok(frame.blend>=0&&frame.blend<=1);
    if(frame.id==='inside')assert.equal(frame.to,'deskAfter','Return directly to the opening indoor composition');
    if(frame.id==='interior')assert.equal(frame.from,'deskAfter','Hold that same composition, with no unrelated overview');
    tour.advance(.025);
  }
  assert.deepEqual(seen,['departure','outside','before','upgrade','exterior','inside','interior']);
  assert.equal(tour.frame.from,'deskAfter');assert.equal(tour.phase,'complete');
  assert.equal(tour.elapsed,UPGRADE_TOUR_DURATION);
  tour.advance(30);assert.equal(tour.elapsed,UPGRADE_TOUR_DURATION);
});

test('skip and replay work from every reveal segment and invalid time cannot poison the tour',()=>{
  for(const interiorReveal of [false,true])for(const elapsed of [0,.7,1.3,2,3.2,4.2,4.5,4.8,5,6.4]){
    const tour=new UpgradeTour({interiorReveal});tour.skip();assert.equal(tour.phase,'ready');
    tour.play();tour.advance(elapsed);tour.skip();
    assert.equal(tour.phase,'complete');assert.equal(tour.frame.from,'deskAfter');
    tour.play();assert.equal(tour.phase,'playing');assert.equal(tour.elapsed,0);
    for(const invalid of [-1,NaN,Infinity])tour.advance(invalid);
    assert.equal(tour.elapsed,0);assert.equal(tour.frame.from,'deskBefore');
  }
});

test('restoration returns to the old hall, holds for comparison, and dissolves once into the new hall',()=>{
  const tour=new UpgradeTour({interiorReveal:true});tour.play();
  const seen=[],dissolve=[];
  while(tour.phase==='playing'){
    const frame=tour.frame;
    if(seen.at(-1)!==frame.id)seen.push(frame.id);
    if(frame.id==='inside')assert.equal(frame.to,'deskBefore','The return fade must not reveal the renovated hall early');
    if(frame.id==='interiorBefore')assert.equal(frame.from,'deskBefore');
    if(frame.id==='interiorUpgrade'){
      assert.equal(frame.from,'deskBefore');assert.equal(frame.to,'deskAfter');
      assert.equal(frame.duration,.5);assert.equal(frame.transition,undefined,'Compare the room through a dissolve');
      dissolve.push(frame.blend);
    }
    if(frame.id==='interior')assert.equal(frame.from,'deskAfter');
    tour.advance(.025);
  }
  assert.deepEqual(seen,['departure','outside','before','upgrade','exterior','inside','interiorBefore','interiorUpgrade','interior']);
  assert.ok(dissolve.length>1&&dissolve[0]<.05&&dissolve.at(-1)>.95);
  assert.ok(dissolve.every((value,i)=>i===0||value>dissolve[i-1]));
  assert.equal(tour.frame.from,'deskAfter');assert.equal(tour.elapsed,tour.duration);
});

test('paired exterior shots fit one camera and the staged crew fits the indoor desk shot',()=>{
  const outside=getScene('haventide'),inside=getScene('haventide_town');
  const state=createState();recruit(state,'vex');recruit(state,'rune');
  const entrance=outside.objects.find(o=>o.id==='haventide_entrance');
  for(const fromLevel of [1,2,3]){
    const plan=upgradePreviewStates(state,fromLevel),camera=upgradeTourCameras(outside,inside,plan);
    for(const visual of [plan.before,plan.after]){
      const bounds=townCenterBounds(entrance,visual);
      assert.ok(bounds.left-camera.outside.x>0);
      assert.ok(bounds.left+bounds.width-camera.outside.x<960);
      assert.ok(bounds.top-camera.outside.y>=39,'Roof clears the header');
      assert.ok(bounds.top+bounds.height-camera.outside.y<517,'Foundation clears the letterbox');
    }
    for(const actor of camera.actors){
      assert.ok(isWalkable(inside,actor.x,actor.y),'Staged party stands on reachable floor');
      assert.ok(actor.x-camera.desk.x>340,'Party clears the preview card');
      assert.ok(actor.x-camera.desk.x<940);
      assert.ok(actor.y-camera.desk.y>160&&actor.y-camera.desk.y<517);
    }
  }
});
