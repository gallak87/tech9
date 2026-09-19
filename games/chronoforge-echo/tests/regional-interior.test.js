import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createState} from '../src/progression.js';
import {getScene,isWalkable,nearby,safeArrival} from '../src/world.js';
import {TOWN_INTERIOR_ASSETS,townInteriorFrame} from '../src/town-interior-art.js';
import {havenInteriorBounds} from '../src/haventide-interior-renderer.js';
import {upgradePreviewStates,upgradeTourCameras,UpgradeTour} from '../src/dev-upgrade-preview.js';
import {townUpgradePlan} from '../src/upgrade-cinematic.js';
import {ArtPreview} from '../src/dev-preview.js';

const regions=['haventide','emberline','orbital_reach','last_crown'];
const parts=['provisions','forge','inn','archive','engineering','training','board','storage','floor','runner','wall','column'];

test('all four towns have four required production kits with valid measured crops',()=>{
  assert.equal(TOWN_INTERIOR_ASSETS.length,16);
  assert.equal(new Set(TOWN_INTERIOR_ASSETS.map(a=>a.source)).size,16);
  for(const region of regions)for(const level of [1,2,3,4]){
    const state=createState();state.buildings.town_center=level;
    const spec=townInteriorFrame('floor',state,region),asset=spec.asset;
    assert.equal(asset.region,region);assert.equal(asset.level,level);assert.equal(asset.required,true);
    const png=fs.readFileSync(new URL('../public/'+asset.source,import.meta.url));
    assert.equal(asset.metadata.sourceWidth,png.readUInt32BE(16));assert.equal(asset.metadata.sourceHeight,png.readUInt32BE(20));
    assert.deepEqual(asset.metadata.frames.map(f=>f.part),parts);
    for(const part of parts){
      const {frame}=townInteriorFrame(part,state,region);
      assert.ok(frame.w>0&&frame.h>0&&frame.x>=0&&frame.y>=0);
      assert.ok(frame.x+frame.w<=asset.metadata.sourceWidth&&frame.y+frame.h<=asset.metadata.sourceHeight,asset.id+' '+part);
      for(const [x,y] of frame.backgroundSeeds||[])assert.ok(x>=0&&y>=0&&x<frame.w&&y<frame.h);
    }
    assert.equal(spec.frame.key,false,'Floor extraction must remain opaque');
  }
});

for(const region of regions.slice(1))test(region+' preserves service approaches, exits, and old save recovery',()=>{
  const hall=getScene(region+'_town'),state=createState();state.tier=4;
  assert.equal(hall.restorationInterior,true);
  const origin=hall.spawn,step=16,points=[origin],seen=new Set(['0,0']),nodes=[[0,0]];
  for(let i=0;i<nodes.length;i++){
    const [gx,gy]=nodes[i];
    for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]){
      const nx=gx+dx,ny=gy+dy,key=nx+','+ny;if(seen.has(key))continue;
      const x=origin.x+nx*step,y=origin.y+ny*step;
      if(!isWalkable(hall,x,y)||!isWalkable(hall,x-dx*step/2,y-dy*step/2))continue;
      seen.add(key);nodes.push([nx,ny]);points.push({x,y});
    }
  }
  for(const object of [...hall.objects,...hall.portals].filter(o=>o.service||o.type==='npc'||o.type==='portal')){
    assert.ok(points.some(p=>nearby(hall,p.x,p.y,state).includes(object)),'Unreachable '+object.id);
    if(object.service){
      assert.equal(object.interiorRegion,region);
      assert.equal(isWalkable(hall,object.x,object.y-10),false);
      assert.equal(isWalkable(hall,object.x,object.y+28),true);
      assert.equal(isWalkable(hall,object.x-object.artWidth*.5-24,object.y+5),true,'Staff approaches');
    }
  }
  for(let y=470;y<=1050;y+=10)assert.ok(isWalkable(hall,800,y));
  for(let x=83;x<=1517;x+=32)for(let y=145;y<=1055;y+=32){
    const arrival=safeArrival(hall,x,y);assert.ok(isWalkable(hall,arrival.x,arrival.y));
    if(isWalkable(hall,x,y))assert.deepEqual(arrival,{x,y});
  }
  assert.deepEqual(hall.spawn,{x:800,y:993.75});assert.equal(hall.portals[0].y,1045);
});

test('selected regional art and all upgrade steps are detached previews at Haventide',()=>{
  const state=createState();state.region='haventide_town';state.tier=2;state.buildings.town_center=3;
  state.fog.haventide={'4,2':true};state.visited.haventide_town=true;
  const baseline=JSON.stringify(state),hall=getScene(state.region),geometry=JSON.stringify(hall);
  const preview=new ArtPreview();preview.setOpen(true);
  for(const region of regions){
    preview.selectTown(region);preview.selectTownCenter(4);
    const visual=preview.visualState(state);
    assert.equal(townInteriorFrame('board',visual,hall.townId).asset.region,region);
    for(const actual of regions.slice(1))assert.equal(townInteriorFrame('board',visual,actual).asset.region,actual,'Art substitution is confined to Haventide');
    assert.equal(visual.region,state.region);assert.equal(visual.fog,state.fog);
    for(const level of [1,2,3]){
      const plan=upgradePreviewStates(state,level,region);
      assert.equal(plan.region,region);assert.equal(plan.previewLocation,'haventide');
      for(const snapshot of [plan.before,plan.after]){
        assert.equal(snapshot.region,state.region);assert.equal(snapshot.tier,2);
        assert.deepEqual(snapshot.fog,state.fog);assert.deepEqual(snapshot.visited,state.visited);
        assert.deepEqual(snapshot.resources,state.resources);
        const spec=townInteriorFrame('board',snapshot,hall.townId);assert.equal(spec.asset.region,region);
        assert.ok(havenInteriorBounds(hall.objects.find(o=>o.service==='construction'),snapshot));
      }
      assert.notEqual(townInteriorFrame('board',plan.before).asset.source,townInteriorFrame('board',plan.after).asset.source);
      plan.after.resources.ore=0;assert.equal(JSON.stringify(state),baseline);
    }
  }
  preview.setOpen(false);assert.equal(preview.visualState(state),state);
  assert.equal(JSON.stringify(hall),geometry);assert.equal(JSON.stringify(state),baseline);
  assert.throws(()=>upgradePreviewStates(state,1,'unknown'));
});

test('real regional upgrades share the approved fixed indoor comparison and half-second restoration',()=>{
  for(const region of regions){
    const before=createState();before.region=region+'_town';before.buildings.town_center=2;
    const after=structuredClone(before);after.buildings.town_center=3;
    const plan=townUpgradePlan(before,after),inside=getScene(before.region),outside=getScene(region);
    assert.equal(plan.region,region);assert.equal(plan.previewLocation,undefined);
    const view={camera:{x:440,y:450},actors:[{id:'kaida',x:900,y:975,facing:'up'}]};
    const cameras=upgradeTourCameras(outside,inside,plan,view);
    assert.deepEqual(cameras.desk,view.camera);assert.deepEqual(cameras.actors,view.actors);assert.notEqual(cameras.actors,view.actors);
    const tour=new UpgradeTour({interiorReveal:inside.restorationInterior});tour.play();
    let observed=false;
    while(tour.phase==='playing'){
      if(tour.frame.id==='interiorUpgrade'){observed=true;assert.equal(tour.frame.duration,.5);assert.equal(tour.frame.from,'deskBefore');assert.equal(tour.frame.to,'deskAfter');}
      tour.advance(.025);
    }
    assert.equal(observed,true);
  }
});
