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
export function prepareRecruitment(state,id,scene,source,target){
 if(!HEROES[id]||!state.heroes.some(h=>h.id===id)||state.flags[`${id}_join_presented`])return null;
 const path=route(scene,source,target,state);
 const length=path?.slice(1).reduce((sum,p,i)=>sum+distance(path[i],p),0)||0;
 state.recruitmentWalk={id,region:scene.id,path:path||[point(target)],length,elapsed:0,duration:path?Math.max(1.6,Math.min(2.6,length/75)):0,started:false,facing:state.facing};
 return state.recruitmentWalk;
}
export function recruitmentActor(state){
 const w=state.recruitmentWalk;if(!w||!HEROES[w.id]||!Array.isArray(w.path)||!w.path.length||w.region!==state.region)return null;
 let remaining=w.length*Math.min(1,w.duration>0?w.elapsed/w.duration:1),p=w.path[0],facing=w.facing;
 for(let i=1;i<w.path.length;i++){
  const next=w.path[i],d=distance(p,next);
  if(d>0){const dx=next.x-p.x,dy=next.y-p.y;facing=Math.abs(dx)>Math.abs(dy)?dx>0?'right':'left':dy>0?'down':'up';}
  if(remaining<=d&&d>0){p={x:p.x+(next.x-p.x)*remaining/d,y:p.y+(next.y-p.y)*remaining/d};break;}
  remaining-=d;p=next;
 }
 return {id:w.id,...p,facing,moving:!!w.started&&w.elapsed<w.duration,animationTime:w.elapsed};
}
export function advanceRecruitment(state,dt){
 const w=state.recruitmentWalk;if(!w)return false;
 w.started=true;w.elapsed=Math.min(w.duration,w.elapsed+dt);
 return state.settings.reducedMotion||w.region!==state.region||w.elapsed>=w.duration;
}
export function completeRecruitment(state){
 const w=state.recruitmentWalk;if(!w)return null;
 delete state.recruitmentWalk;
 if(!HEROES[w.id]||!state.heroes.some(h=>h.id===w.id)||state.flags[`${w.id}_join_presented`])return null;
 state.flags[`${w.id}_join_presented`]=true;
 return {id:w.id,kind:'recruitment',label:`${HEROES[w.id].name} joined the party`,amount:1};
}
