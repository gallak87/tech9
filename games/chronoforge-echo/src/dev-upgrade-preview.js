import {townCenterBounds} from './town-center-art.js';
import {VIEW_WIDTH,VIEW_HEIGHT} from './rendering.js';

// A presentation rehearsal, deliberately independent of progression and travel.
// Both pictures are detached snapshots. Town-center level is NOT civilization
// tier: this first pass must not invent service unlocks or charge upgrade costs.
export function upgradePreviewStates(state,fromLevel) {
  if(!Number.isInteger(fromLevel)||fromLevel<1||fromLevel>3)throw Error('Choose an upgrade from level 1, 2 or 3.');
  const before=structuredClone(state),after=structuredClone(state);
  before.buildings.town_center=fromLevel;
  after.buildings.town_center=fromLevel+1;
  before.townCenterArtRegion=after.townCenterArtRegion='haventide';
  return {before,after,fromLevel,toLevel:fromLevel+1};
}

const shots=[
  {id:'departure',duration:1,from:'deskBefore'},
  {id:'outside',duration:.18,transition:'fade',from:'deskBefore',to:'outsideBefore'},
  {id:'before',duration:1.15,from:'outsideBefore'},
  {id:'upgrade',duration:.85,from:'outsideBefore',to:'outsideAfter'},
  {id:'exterior',duration:.95,from:'outsideAfter'},
  // Return to the exact opening composition. Future interior variants can
  // change the art here without moving the desk, crew, or comparison camera.
  {id:'inside',duration:.18,transition:'fade',from:'outsideAfter',to:'deskAfter'},
  {id:'interior',duration:1.1,from:'deskAfter'},
];
const smooth=value=>{const t=Math.max(0,Math.min(1,value));return t*t*(3-2*t);};

export function upgradeShotScale(shot,frame,reducedMotion=false) {
  if(reducedMotion)return 1;
  // A short held breath, then a 2% push toward the exterior only. Keep the
  // exterior scale locked through the change so zoom never fakes tier growth.
  if(frame.startsWith('outside'))return shot.id==='before'?1+.02*smooth((shot.progress-.2)/.8):shot.id==='outside'?1:1.02;
  return 1;
}

export function upgradeSparkles(elapsed) {
  const particles=[];
  for(let i=0;i<36;i++){
    const age=elapsed-(i%6)*.03,life=.46+(i%5)*.04;
    if(age<=0||age>=life)continue;
    // Each particle launches once and travels upward. No modulo wrap can pop
    // a sparkle back down to its starting point during the reveal.
    particles.push({
      x:Math.sin(i*7.13)*170+Math.sin(i*3.71)*age*22,
      y:-20-(i%7)*18-age*(330+i%4*55),
      alpha:Math.min(1,age/.045)*Math.min(1,(life-age)/.2),
      size:1.1+i%3*.55,trail:5+i%4*2,color:i%3?'#f5dab0':'#b4f5ee',
    });
  }
  return particles;
}

export const UPGRADE_TOUR_DURATION=shots.reduce((sum,shot)=>sum+shot.duration,0);
export function upgradeTourFrame(elapsed) {
  let start=0;
  for(const shot of shots){
    if(elapsed<start+shot.duration){
      const progress=Math.max(0,(elapsed-start)/shot.duration);
      return {...shot,progress,blend:shot.to?smooth(progress):0};
    }
    start+=shot.duration;
  }
  return {id:'complete',from:'deskAfter',progress:1,blend:0};
}

export class UpgradeTour {
  phase='ready';
  elapsed=0;
  play(){this.phase='playing';this.elapsed=0;}
  advance(seconds){
    if(this.phase!=='playing'||!Number.isFinite(seconds)||seconds<0)return;
    this.elapsed=Math.min(UPGRADE_TOUR_DURATION,this.elapsed+seconds);
    if(this.elapsed>=UPGRADE_TOUR_DURATION)this.phase='complete';
  }
  skip(){if(this.phase==='playing'){this.elapsed=UPGRADE_TOUR_DURATION;this.phase='complete';}}
  get frame(){return this.phase==='ready'?{id:'ready',from:'deskBefore',progress:0,blend:0}:upgradeTourFrame(this.elapsed);}
}

const clamp=(n,min,max)=>Math.max(min,Math.min(Math.max(min,max),n));
function cameraAt(scene,x,y){return {x:clamp(x,0,scene.width-VIEW_WIDTH),y:clamp(y,0,scene.height-VIEW_HEIGHT)};}
export function upgradeTourCameras(outside,inside,plan) {
  const entrance=outside.objects.find(o=>o.id==='haventide_entrance');
  const board=inside.objects.find(o=>o.service==='construction');
  const bounds=[townCenterBounds(entrance,plan.before),townCenterBounds(entrance,plan.after)];
  const left=Math.min(...bounds.map(b=>b.left)),top=Math.min(...bounds.map(b=>b.top));
  const right=Math.max(...bounds.map(b=>b.left+b.width));
  return {
    // One camera for both exteriors: growth remains measurable, doorway fixed.
    outside:cameraAt(outside,(left+right)/2-VIEW_WIDTH/2,top-65),
    desk:cameraAt(inside,board.x-VIEW_WIDTH*.53,board.y-VIEW_HEIGHT*.58),
    actors:plan.before.heroes.map((hero,i)=>({id:hero.id,x:board.x-65+i*70,y:board.y+65+i*17,facing:'up'})),
  };
}
