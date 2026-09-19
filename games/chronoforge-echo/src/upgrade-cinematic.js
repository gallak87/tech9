import {townCenterBounds,TOWN_CENTERS} from './town-center-art.js';
import {VIEW_WIDTH,VIEW_HEIGHT} from './rendering.js';

const shots=[
  {id:'departure',duration:1,from:'deskBefore'},
  {id:'outside',duration:.18,transition:'fade',from:'deskBefore',to:'outsideBefore'},
  {id:'before',duration:1.15,from:'outsideBefore'},
  {id:'upgrade',duration:.85,from:'outsideBefore',to:'outsideAfter'},
  {id:'exterior',duration:.95,from:'outsideAfter'},
  // Towns without restoration art return directly to their current hall.
  {id:'inside',duration:.18,transition:'fade',from:'outsideAfter',to:'deskAfter'},
  {id:'interior',duration:1.1,from:'deskAfter'},
];
// Restore the hall in the exact opening composition after a brief comparison
// beat. Camera and crew stay fixed while the furnishings change around them.
const restorationShots=shots.flatMap(shot=>shot.id==='inside'?[
  {...shot,to:'deskBefore'},
  {id:'interiorBefore',duration:.24,from:'deskBefore'},
  {id:'interiorUpgrade',duration:.5,from:'deskBefore',to:'deskAfter'},
]:[shot]);
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

// A lighter, shorter shimmer spread across visible furnishings. Targets are
// screen-space bounds, so the effect follows the actual indoor composition.
export function interiorUpgradeSparkles(elapsed,targets) {
  if(!targets.length)return [];
  const particles=[];
  for(let i=0;i<16;i++){
    const age=elapsed-(i%4)*.025,life=.26+(i%4)*.035;
    if(age<=0||age>=life)continue;
    const target=targets[i%targets.length];
    particles.push({
      x:target.x+target.width*(.5+Math.sin(i*7.13)*.34)+Math.sin(i*3.71)*age*10,
      y:target.y+target.height*(.6+Math.sin(i*2.39)*.24)-age*(80+i%3*18),
      alpha:.65*Math.min(1,age/.035)*Math.min(1,(life-age)/.12),
      size:.8+i%3*.3,trail:2+i%2,color:i%3?'#f5dab0':'#b4f5ee',
    });
  }
  return particles;
}

export const UPGRADE_TOUR_DURATION=shots.reduce((sum,shot)=>sum+shot.duration,0);
export function upgradeTourFrame(elapsed,interiorReveal=false) {
  let start=0;
  for(const shot of interiorReveal?restorationShots:shots){
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
  constructor({interiorReveal=false}={}){
    this.interiorReveal=interiorReveal;
    this.duration=(interiorReveal?restorationShots:shots).reduce((sum,shot)=>sum+shot.duration,0);
  }
  play(){this.phase='playing';this.elapsed=0;}
  advance(seconds){
    if(this.phase!=='playing'||!Number.isFinite(seconds)||seconds<0)return;
    this.elapsed=Math.min(this.duration,this.elapsed+seconds);
    if(this.elapsed>=this.duration)this.phase='complete';
  }
  skip(){if(this.phase==='playing'){this.elapsed=this.duration;this.phase='complete';}}
  get frame(){return this.phase==='ready'?{id:'ready',from:'deskBefore',progress:0,blend:0}:upgradeTourFrame(this.elapsed,this.interiorReveal);}
}

const clamp=(n,min,max)=>Math.max(min,Math.min(Math.max(min,max),n));
function cameraAt(scene,x,y){return {x:clamp(x,0,scene.width-VIEW_WIDTH),y:clamp(y,0,scene.height-VIEW_HEIGHT)};}
export function upgradeTourCameras(outside,inside,plan,view=null) {
  const entrance=outside.objects.find(o=>o.id===outside.id+'_entrance');
  const board=inside.objects.find(o=>o.service==='construction');
  const bounds=[townCenterBounds(entrance,plan.before),townCenterBounds(entrance,plan.after)];
  const left=Math.min(...bounds.map(b=>b.left)),top=Math.min(...bounds.map(b=>b.top));
  const right=Math.max(...bounds.map(b=>b.left+b.width));
  return {
    // One camera for both exteriors: growth remains measurable, doorway fixed.
    outside:cameraAt(outside,(left+right)/2-VIEW_WIDTH/2,top-65),
    desk:view?{...view.camera}:cameraAt(inside,board.x-VIEW_WIDTH*.53,board.y-VIEW_HEIGHT*.58),
    actors:view?structuredClone(view.actors):plan.before.heroes.map((hero,i)=>({id:hero.id,x:board.x-65+i*70,y:board.y+55+i*12,facing:'up'})),
  };
}

// Actual upgrades use their own town and detached before/after art states.
// Saving, payment and unlocks happen before the presentation is opened.
export function townUpgradePlan(before,after) {
  const center=TOWN_CENTERS.find(town=>before.region===town.region+'_town');
  const fromLevel=before.buildings.town_center,toLevel=after.buildings.town_center;
  if(!center||fromLevel<1||fromLevel>3||toLevel!==fromLevel+1)return null;
  return {region:center.region,before:structuredClone(before),after:structuredClone(after),fromLevel,toLevel};
}
