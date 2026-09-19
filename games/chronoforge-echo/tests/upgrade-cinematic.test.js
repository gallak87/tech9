import test from 'node:test';
import assert from 'node:assert/strict';
import {createState,recruit,buildingCost} from '../src/progression.js';
import {saveState,loadState} from '../src/persistence.js';
import {performBuild} from '../src/construction.js';
import {UpgradeTour,upgradeTourCameras,upgradeShotScale,upgradeSparkles} from '../src/upgrade-cinematic.js';
import {getScene} from '../src/world.js';
import {TOWN_CENTERS,townCenterBounds} from '../src/town-center-art.js';

function settlement(region='haventide',level=1) {
  const state=createState();recruit(state,'vex');recruit(state,'rune');
  state.region=region+'_town';state.tier=level;state.buildings.town_center=level;
  state.flags.haventide_liberated=true;
  Object.assign(state,getScene(state.region).spawn);
  state.resources={food:900,ore:900,energy:900,renown:900};
  const slots=new Map(),storage={getItem:key=>slots.get(key)??null,setItem:(key,value)=>slots.set(key,value)};
  const calls=[],game={state,mode:'world',keys:new Set(['Enter']),movePath:[{x:0,y:0}],moving:true,
    checkpoint(){calls.push('save');saveState(state,'checkpoint',storage);},
    resolveResult(result){calls.push('story');this.story=result;},
    log(type){calls.push(type);},
    ui:{panel:{type:'build'},notice:'',render(){},
      feedback(result){calls.push('feedback');this.result=result;},
      showBuild(){this.panel={type:'build'};},restoreShopRow(row){this.focus=row;},
    },
    upgradeTour:{open:false,plan:null,clock:null,
      openUpgrade(plan,done){calls.push('reveal');this.open=true;this.plan=plan;this.done=done;this.clock=new UpgradeTour();this.clock.play();},
      close(){this.open=false;},
      finish(skip=false){if(skip)this.clock.skip();else this.clock.advance(20);assert.equal(this.clock.phase,'complete');this.close();this.done();},
    },
  };
  return {game,calls,storage};
}

test('real upgrades in every town save once before playing, and skip/completion never charge again',()=>{
  for(const {region} of TOWN_CENTERS)for(const level of [1,2,3])for(const skip of [false,true]){
    const {game,calls,storage}=settlement(region,level),before=structuredClone(game.state);
    const cost=buildingCost(game.state,'town_center');
    assert.equal(performBuild(game,'town_center').ok,true);
    assert.deepEqual(calls,['save','reveal']);
    assert.equal(game.upgradeTour.open,true);
    assert.equal(game.upgradeTour.plan.region,region);
    assert.deepEqual(game.upgradeTour.plan.before,before);
    assert.equal(game.state.buildings.town_center,level+1);
    for(const key of Object.keys(before.resources))assert.equal(game.state.resources[key],before.resources[key]-(cost[key]||0));
    assert.deepEqual(loadState('checkpoint',storage),game.state,'Reload during the reveal retains the paid upgrade');
    assert.equal(game.keys.size,0);assert.deepEqual(game.movePath,[]);assert.equal(game.moving,false);
    const paid=structuredClone(game.state);
    assert.equal(performBuild(game,'town_center'),undefined,'Repeated activation during the reveal is ignored');
    game.upgradeTour.plan.before.resources.ore=0;game.upgradeTour.plan.after.heroes[0].hp=1;
    game.upgradeTour.finish(skip);
    game.upgradeTour.done(); // A stale completion cannot duplicate rewards.
    assert.deepEqual(calls,['save','reveal','feedback','story']);
    assert.deepEqual(game.state,paid);
    assert.deepEqual(loadState('checkpoint',storage),paid);
    assert.equal(game.ui.panel.type,'build');assert.equal(game.ui.focus,'build:town_center');
    for(const key of ['region','x','y','facing','tier','heroes','fog','visited'])assert.deepEqual(game.state[key],before[key],key);
  }
});

test('unaffordable, locked and maxed upgrades show their error without a reveal or checkpoint',()=>{
  for(const change of [s=>s.resources.ore=0,s=>s.flags.haventide_liberated=false,s=>s.buildings.town_center=2,s=>s.buildings.town_center=4]){
    const {game,calls}=settlement();change(game.state);const before=structuredClone(game.state);
    assert.equal(performBuild(game,'town_center').ok,false);
    assert.deepEqual(game.state,before);assert.deepEqual(calls,['feedback']);
    assert.equal(game.upgradeTour.open,false);assert.equal(game.ui.panel.type,'build');
  }
});

test('other structures still build normally and preview/menu actions cannot spend resources',()=>{
  const {game,calls}=settlement();
  assert.equal(performBuild(game,'farm').ok,true);
  assert.equal(game.state.buildings.farm,1);assert.equal(game.upgradeTour.open,false);
  assert.deepEqual(calls,['save','feedback','story']);
  for(const mutate of [g=>g.ui.panel=null,g=>g.mode='battle',g=>g.devTools={open:true}]){
    const fixture=settlement();mutate(fixture.game);const before=structuredClone(fixture.game.state);
    assert.equal(performBuild(fixture.game,'town_center'),undefined);
    assert.deepEqual(fixture.game.state,before);assert.deepEqual(fixture.calls,[]);
  }
});

test('a failed cinematic restores settlement works while preserving the successful saved upgrade',()=>{
  const {game,calls,storage}=settlement();
  game.upgradeTour.openUpgrade=function(){this.open=true;throw Error('Canvas unavailable');};
  assert.equal(performBuild(game,'town_center').ok,true);
  assert.equal(game.upgradeTour.open,false);assert.equal(game.ui.panel.type,'build');
  assert.equal(game.state.buildings.town_center,2);
  assert.deepEqual(loadState('checkpoint',storage),game.state);
  assert.deepEqual(calls,['save','upgrade_reveal_error','feedback','story']);
});

test('all town reveals frame both exterior sizes and preserve the actual indoor camera and crew',()=>{
  for(const {region} of TOWN_CENTERS)for(const level of [1,2,3]){
    const {game}=settlement(region,level);performBuild(game,'town_center');
    const plan=game.upgradeTour.plan,outside=getScene(region),inside=getScene(region+'_town');
    const view={camera:{x:137,y:325},actors:[{id:'kaida',x:617,y:770,facing:'left'}]};
    const cameras=upgradeTourCameras(outside,inside,plan,view);
    assert.deepEqual(cameras.desk,view.camera);assert.deepEqual(cameras.actors,view.actors);
    assert.notEqual(cameras.desk,view.camera);assert.notEqual(cameras.actors,view.actors);
    const entrance=outside.objects.find(o=>o.id===region+'_entrance');
    for(const state of [plan.before,plan.after]){
      const b=townCenterBounds(entrance,state),anchor={x:entrance.x-cameras.outside.x,y:entrance.y-cameras.outside.y};
      const left=anchor.x+(b.left-cameras.outside.x-anchor.x)*1.02;
      const top=anchor.y+(b.top-cameras.outside.y-anchor.y)*1.02;
      assert.ok(left>0&&left+b.width*1.02<960,region);
      assert.ok(top>=39&&top+b.height*1.02<517,region);
    }
  }
});

test('the approved zoom stays outside, restrained motion disables it, and sparkles rise once',()=>{
  for(const id of ['departure','outside','before','upgrade','exterior','inside','interior']){
    const shot={id,progress:.8};
    for(const frame of ['deskBefore','deskAfter'])assert.equal(upgradeShotScale(shot,frame),1);
    assert.equal(upgradeShotScale(shot,'outsideAfter',true),1);
  }
  assert.equal(upgradeShotScale({id:'before',progress:0},'outsideBefore'),1);
  assert.equal(upgradeShotScale({id:'before',progress:1},'outsideBefore'),1.02);
  assert.equal(upgradeShotScale({id:'upgrade',progress:.5},'outsideAfter'),1.02);
  const early=upgradeSparkles(.2),late=upgradeSparkles(.3);
  assert.equal(early.length,36);assert.equal(late.length,36);
  assert.ok(late.every((p,i)=>p.y<early[i].y));
  assert.deepEqual(upgradeSparkles(.85),[]);
});
