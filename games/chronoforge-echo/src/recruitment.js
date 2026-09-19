import {isWalkable} from './world.js';
import {HEROES} from './content.js';

const distance=(a,b)=>Math.hypot(b.x-a.x,b.y-a.y);
const point=p=>({x:p.x,y:p.y});
function clear(scene,a,b){
 const steps=Math.max(1,Math.ceil(distance(a,b)/4));
 for(let i=0;i<=steps;i++)if(!isWalkable(scene,a.x+(b.x-a.x)*i/steps,a.y+(b.y-a.y)*i/steps))return false;
 return true;
}
// Recruitment is local, but furniture can stand between a companion and their
// place in the line. Save the actual floor route, rather than lerping through it.
function route(scene,start,end,via){
 for(const path of [[start,end],[start,via,end],[start,{x:start.x,y:end.y},end],[start,{x:end.x,y:start.y},end]]){
  if(path.every((p,i)=>!i||clear(scene,path[i-1],p)))return path.map(point);
 }
 const step=12,key=p=>`${p.x},${p.y}`,queue=[start],seen=new Map([[key(start),null]]);let found=null;
 for(let i=0;i<queue.length&&i<5000;i++){
  const p=queue[i];if(distance(p,end)<step*2&&clear(scene,p,end)){found=p;break;}
  for(const [dx,dy]of[[step,0],[-step,0],[0,step],[0,-step]]){
   const n={x:p.x+dx,y:p.y+dy},k=key(n);
   if(seen.has(k)||!clear(scene,p,n))continue;
   seen.set(k,p);queue.push(n);
  }
 }
 if(!found)return null;
 const path=[point(end)];for(let p=found;p;p=seen.get(key(p)))path.push(point(p));
 return path.reverse();
}
const pathLength=path=>path.slice(1).reduce((sum,p,i)=>sum+distance(path[i],p),0);
function positionAlong(path,length,progress,facing){
 let remaining=length*Math.max(0,Math.min(1,progress)),p=path[0];
 for(let i=1;i<path.length;i++){
  const next=path[i],d=distance(p,next);
  if(d>0){const dx=next.x-p.x,dy=next.y-p.y;facing=Math.abs(dx)>Math.abs(dy)?dx>0?'right':'left':dy>0?'down':'up';}
  if(remaining<=d&&d>0)return {x:p.x+(next.x-p.x)*remaining/d,y:p.y+(next.y-p.y)*remaining/d,facing};
  remaining-=d;p=next;
 }
 return {...p,facing};
}
function observatoryStaging(state,scene){
 const lens=scene.objects.find(o=>o.id==='ember_lens');if(!lens)return null;
 // Both actors stand below the pedestal's foreground layer. Kaida takes a
 // walkable route down first; Vex then materializes on the open ground beside her.
 for(const offset of [124,148,176]){
  const leader={x:lens.x,y:lens.y+offset},target={x:leader.x-72,y:leader.y},source={x:target.x-84,y:target.y};
  if(![leader,target,source].every(p=>isWalkable(scene,p.x,p.y))||!clear(scene,source,target))continue;
  const leaderPath=route(scene,point(state),leader,{x:leader.x+96,y:leader.y});if(!leaderPath)continue;
  const leaderLength=pathLength(leaderPath),leaderDuration=Math.max(.45,Math.min(1.7,leaderLength/130));
  return {leaderPath,leaderLength,leaderDuration,revealDuration:.24,walkDuration:1.12,finalFacing:'right',source,target};
 }
 return null;
}
export function prepareRecruitment(state,id,scene,source,target,options={}){
 if(!HEROES[id]||!state.heroes.some(h=>h.id===id)||state.flags[`${id}_join_presented`])return null;
 const staging=id==='vex'&&options.sourceId==='ember_observatory'?observatoryStaging(state,scene):null;
 if(staging){source=staging.source;target=staging.target;}
 const path=route(scene,source,target,state);
 const length=path?pathLength(path):0;
 state.recruitmentWalk={id,region:scene.id,path:path||[point(target)],length,elapsed:0,duration:path?Math.max(1.6,Math.min(2.6,length/75)):0,started:false,facing:state.facing};
 if(staging){const timing={...staging};delete timing.source;delete timing.target;Object.assign(state.recruitmentWalk,timing,{duration:staging.leaderDuration+staging.revealDuration+staging.walkDuration});}
 return state.recruitmentWalk;
}
export function recruitmentActor(state){
 const w=state.recruitmentWalk;if(!w||!HEROES[w.id]||!Array.isArray(w.path)||!w.path.length||w.region!==state.region)return null;
 const start=(w.leaderDuration||0)+(w.revealDuration||0),elapsed=Math.max(0,w.elapsed-start),duration=w.walkDuration??w.duration;
 const p=positionAlong(w.path,w.length,duration>0?elapsed/duration:1,w.facing),opacity=w.leaderPath?Math.max(0,Math.min(1,(w.elapsed-w.leaderDuration)/w.revealDuration)):1;
 return {id:w.id,...p,opacity,moving:!!w.started&&w.elapsed>start&&w.elapsed<w.duration,animationTime:elapsed};
}
export function advanceRecruitment(state,dt){
 const w=state.recruitmentWalk;if(!w)return false;
 w.started=true;w.elapsed=Math.min(w.duration,w.elapsed+dt);
 if(w.leaderPath&&w.region===state.region){const p=positionAlong(w.leaderPath,w.leaderLength,w.elapsed/w.leaderDuration,state.facing);Object.assign(state,p);if(w.elapsed>=w.leaderDuration)state.facing=w.finalFacing;}
 return state.settings.reducedMotion||w.region!==state.region||w.elapsed>=w.duration;
}
export function completeRecruitment(state){
 const w=state.recruitmentWalk;if(!w)return null;
 if(w.leaderPath&&w.region===state.region)Object.assign(state,point(w.leaderPath.at(-1)),{facing:w.finalFacing});
 delete state.recruitmentWalk;
 if(!HEROES[w.id]||!state.heroes.some(h=>h.id===w.id)||state.flags[`${w.id}_join_presented`])return null;
 state.flags[`${w.id}_join_presented`]=true;
 return {id:w.id,kind:'recruitment',label:`${HEROES[w.id].name} joined the party`,amount:1};
}
