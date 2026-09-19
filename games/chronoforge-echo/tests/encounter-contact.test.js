import test from 'node:test';
import assert from 'node:assert/strict';
import {createState} from '../src/progression.js';
import {ENCOUNTER_RING,ENCOUNTER_CONTACT_PADDING,hasContactBoundary,contactEncounter} from '../src/encounter-contact.js';
import {drawEncounterRings} from '../src/enemy-labels.js';
import {ALL_SCENES,nearby} from '../src/world.js';

const enemy=(extra={})=>({id:'enemy',type:'encounter',x:100,y:100,enemies:['bog_stalker'],...extra});

test('the ground oval has a forgiving contact margin in every approach direction',()=>{
  const encounter=enemy(),scene={objects:[encounter]},state=createState(),ellipses=[];
  const ctx={save(){},restore(){},beginPath(){},fill(){},stroke(){},ellipse(...args){ellipses.push(args);}};
  drawEncounterRings(ctx,scene,{x:25.3,y:30.2},state);
  const {radiusX, radiusY}=ENCOUNTER_RING,rx=radiusX+ENCOUNTER_CONTACT_PADDING,ry=radiusY+ENCOUNTER_CONTACT_PADDING;
  assert.ok(radiusX>radiusY,'The ground cue is wider than it is tall');
  assert.deepEqual(ellipses,[[75,70,radiusX,radiusY,0,0,Math.PI*2]]);
  for(const [dx,dy]of [[1,0],[-1,0],[0,1],[0,-1],[.6,.8],[-.6,-.8]]){
    Object.assign(state,{x:encounter.x+dx*(rx+.01),y:encounter.y+dy*(ry+.01)});
    assert.equal(contactEncounter(scene,state),null,'Outside the padding is safe');
    Object.assign(state,{x:encounter.x+dx*(rx-.01),y:encounter.y+dy*(ry-.01)});
    assert.equal(contactEncounter(scene,state),encounter,'Reaching the padded oval starts combat');
    Object.assign(state,{x:encounter.x+dx*radiusX,y:encounter.y+dy*radiusY});
    assert.equal(contactEncounter(scene,state),encounter,'The entire visible edge is covered');
  }
  state.x=encounter.x+rx;state.y=encounter.y;
  assert.equal(contactEncounter(scene,state),encounter,'Touching the padded boundary counts');
  state.x=encounter.x-45;
  assert.equal(contactEncounter(scene,state),encounter,'The former prompt-only horizontal approach now starts combat');
});

test('fast movement cannot skip the ring, and the first crossed boundary wins',()=>{
  const first=enemy({id:'first',x:70}),second=enemy({id:'second',x:140}),scene={objects:[second,first]},state=createState();
  Object.assign(state,{x:200,y:100});
  assert.equal(contactEncounter(scene,state,{x:0,y:100}),first);
  state.y=136;
  assert.equal(contactEncounter(scene,state,{x:0,y:136}),null,'A path outside the padded oval does not count');
  state.x=0;state.y=100;
  assert.equal(contactEncounter(scene,state,{x:200,y:100}),second);
});

test('sentries use contact while story-locked and cleared encounters remain protected',()=>{
  const state=createState();Object.assign(state,{x:100,y:100});
  for(const encounter of [enemy({type:'tree'}),enemy({requires:'final_ready'}),enemy({requires:{tier:4}}),enemy({requires:{tier:1,flag:'beacon_restored'}})]){
    assert.equal(hasContactBoundary(encounter,state),false);
    assert.equal(contactEncounter({objects:[encounter]},state),null);
  }
  state.flags.final_ready=true;state.flags.beacon_restored=true;state.tier=4;
  for(const requires of ['final_ready',{tier:4},{tier:4,flag:'beacon_restored'}])assert.equal(hasContactBoundary(enemy({requires}),state),true);
  assert.equal(hasContactBoundary(enemy({boss:true}),state),true,'Available bosses retain existing contact behavior');
  assert.equal(hasContactBoundary(enemy({guard:'haventide'}),state),true,'A sentry no longer needs an F prompt');
  state.cleared.enemy=true;
  assert.equal(hasContactBoundary(enemy(),state),false,'Repeat fights remain opt-in');
  assert.equal(hasContactBoundary(enemy({boss:true}),state),false);
});

test('rings only render for active nearby encounters, stay quiet during grace periods, and never change state',()=>{
  const state=createState(),ellipses=[];
  state.cleared.repeat=true;
  const scene={objects:[enemy(),enemy({id:'repeat'}),enemy({id:'guard',guard:true}),enemy({id:'locked',requires:'final_ready'}),enemy({id:'far',x:4000})]};
  const before=structuredClone({scene,state});
  const ctx={save(){},restore(){},beginPath(){},fill(){},stroke(){},ellipse(...args){ellipses.push(args);}};
  drawEncounterRings(ctx,scene,{x:0,y:0},state,{contactReady:false});
  assert.equal(ellipses.length,0);
  drawEncounterRings(ctx,scene,{x:0,y:0},state);
  assert.equal(ellipses.length,2,'Both ordinary enemies and undefeated sentries have a ring');
  assert.deepEqual({scene,state},before);
  // Only Kaida's position participates, never a companion standing in a ring.
  state.x=0;state.y=0;state.heroes.push({id:'rune',x:100,y:100});
  assert.equal(contactEncounter(scene,state),null);
});

test('only replayable cleared encounters expose an interaction prompt',()=>{
  const state=createState();Object.assign(state,{x:100,y:100});
  for(const extra of [{},{guard:'haventide'},{boss:true},{flag:'quest_done'},{requires:'final_ready'}]){
    const encounter=enemy(extra),scene={objects:[encounter],portals:[]};
    assert.deepEqual(nearby(scene,100,100,state),[],'Undefeated enemies do not enter the F/Space interaction list');
    state.cleared.enemy=true;
    assert.equal(nearby(scene,100,100,state).length,extra.guard||extra.boss||extra.flag?0:1);
    assert.equal(contactEncounter(scene,state),null,'Replays never start by contact');
    delete state.cleared.enemy;
  }
  const sign={id:'sign',type:'sign',x:100,y:100},scene={objects:[enemy(),sign],portals:[]};
  assert.deepEqual(nearby(scene,100,100,state),[sign],'An undefeated enemy must not mask another interaction');
});

test('ring eligibility and contact agree for every authored encounter without unlocking story gates',()=>{
  for(const unlocked of [false,true]){
    const state=createState();state.tier=unlocked?4:1;
    if(unlocked)for(const scene of Object.values(ALL_SCENES))for(const o of scene.objects){
      const flag=typeof o.requires==='string'?o.requires:o.requires?.flag;if(flag)state.flags[flag]=true;
    }
    const flags=structuredClone(state.flags);
    for(const scene of Object.values(ALL_SCENES))for(const encounter of scene.objects.filter(o=>o.type==='encounter')){
      state.x=encounter.x;state.y=encounter.y;
      assert.equal(contactEncounter({objects:[encounter]},state)===encounter,hasContactBoundary(encounter,state),encounter.id);
    }
    assert.deepEqual(state.flags,flags);
  }
});
