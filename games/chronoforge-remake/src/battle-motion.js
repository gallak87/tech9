// Pure presentation choreography. No combat state, costs, clocks or HP are changed.
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
const mix=(a,b,t)=>a+(b-a)*t;
const smooth=t=>{t=clamp(t,0,1);return t*t*(3-2*t);};
const unitOf=(b,value)=>typeof value==='string'?[...b.heroes,...b.enemies].find(u=>u.id===value):value;
const alive=u=>u?.hp>0;

export function formationPosition(b,unitOrId){
  const unit=unitOf(b,unitOrId);if(!unit)return {x:0,y:0};
  const index=unit.index??(unit.side==='hero'?b.heroes:b.enemies).indexOf(unit);
  if(unit.side==='hero')return {x:210+(index===1?-28:index===2?22:0),y:220+index*94};
  if(b.enemies.length===1)return {x:586,y:315};
  // The three-foe front row leaves enough height for two heroes to strike on
  // separate lanes even after the other two foes fall. Slots never compact.
  return {x:618-(index%2)*55,y:b.enemies.length===2?220+index*124:220+index*72};
}

export function bodyGeometry(unit){
  if(unit.side==='hero')return {radius:21,height:78,renderHeight:82,reach:unit.id==='kaida'?43:unit.id==='rune'?31:38,handHeight:unit.id==='rune'?38:44};
  const large=['golem','gravbot','mire_hulk','magma_behemoth'].includes(unit.catalogId);
  return {radius:unit.boss?51:large?41:32,height:unit.boss?145:large?105:96,renderHeight:unit.boss?180:130,reach:unit.boss?67:large?49:42,handHeight:unit.boss?81:58};
}

function offensive(action){return action&&(action.side==='enemy'||['enemy','enemies'].includes(action.definition.target));}
function profile(unit,action){
  if(!offensive(action))return {style:'support',travel:false,arc:0};
  if(unit.side==='enemy')return action.definition.magic?{style:'ranged',travel:false,arc:0}:{style:'charge',travel:true,arc:unit.boss?8:14};
  if(unit.id==='vex')return {style:'glide',travel:true,arc:38};
  if(unit.id==='rune')return {style:'leap',travel:true,arc:64};
  return {style:action.kind==='attack'||action.definition.id==='chrono_strike'?'dash':'leap',travel:true,arc:action.kind==='attack'?24:42};
}

/** Stable world-space body sockets, including targets defeated by this impact. */
export function actionContacts(b){
  const action=b.action;if(!action)return [];
  const direction=action.side==='hero'?1:-1;
  return action.targetIds.map(id=>{
    const unit=unitOf(b,id);if(!unit)return null;
    const home=formationPosition(b,unit),body=bodyGeometry(unit);
    return {targetId:id,x:home.x-direction*body.radius,y:home.y-body.height*.51,groundY:home.y,centerX:home.x,bodyTop:home.y-body.height,radius:body.radius,height:body.height};
  }).filter(Boolean);
}

function planFor(b,unit,action){
  const home=formationPosition(b,unit),body=bodyGeometry(unit),index=Math.max(0,action.participants.indexOf(unit.id)),count=action.participants.length;
  const contacts=actionContacts(b),targetIndex=contacts.length>1?(count>1?index%contacts.length:Math.floor((contacts.length-1)/2)):0;
  const socket=contacts[targetIndex];if(!socket)return null;
  const direction=socket.centerX>=home.x?1:-1;
  const lane=count===1?0:count===2?[-16,20][index%2]:[-20,-44,24][index%3];
  // Linked blades, a hovering focus, and a punching sentinel occupy distinct lanes.
  const reach=body.reach+(count>1?(unit.id==='vex'?55:index===0?7:0):0);
  const minFoot=114+body.renderHeight,maxFoot=429;
  const targetPoint={x:socket.x+direction*Math.min(6,Math.abs(lane)*.12),y:clamp(socket.y+lane,socket.bodyTop+15,socket.groundY-8)};
  const contactY=clamp(targetPoint.y+body.handHeight,minFoot,maxFoot);
  // Lower the contact point on short/top-row opponents instead of clipping heads
  // through the HUD. The weapon socket remains exactly on their visible body.
  targetPoint.y=clamp(contactY-body.handHeight,socket.bodyTop+12,socket.groundY-5);
  const handHeight=contactY-targetPoint.y;
  const x=targetPoint.x-direction*reach;
  const groundY=clamp(Math.max(socket.groundY+lane*.45,contactY+(unit.id==='vex'?14:0)),minFoot,maxFoot);
  return {home,direction,reach,handHeight,lane,targetId:socket.targetId,targetPoint,
    contact:{x,y:contactY,groundY,lift:groundY-contactY},minFoot,contacts};
}

function actionFrame(a,t){
  if(t<a.impactAt)return clamp(Math.floor(t/a.impactAt*3),0,2);
  if(t<a.impactAt+.22)return 3;
  return 4+clamp(Math.floor((t-a.impactAt-.22)/Math.max(.01,a.total-a.impactAt-.22)*2),0,1);
}
const poseTime=(unit,state,frame)=>(frame+.01)/(unit.side==='hero'?(state==='run'?13:state==='attack'?10:8):10);

/**
 * Sample the exact rendered feet/ground position at an arbitrary action time.
 * At impactAt normal moving actors reach contact and tip === targetPoint; frame 3
 * holds that position for .22 seconds. At total they are exactly home again.
 * Reduced motion stays home and uses a brief projected strike to the same socket.
 */
export function battlePose(b,unitOrId,{elapsed=b.action?.elapsed??0,time=b.time??0,reducedMotion=false}={}){
  const unit=unitOf(b,unitOrId);if(!unit)return null;
  const home=formationPosition(b,unit),body=bodyGeometry(unit),action=b.action;
  let state=!alive(unit)?unit.side==='enemy'&&(unit.deathAge||0)<.32?'death':'down':b.result?.win&&unit.side==='hero'?'victory':unit.hurt>0?'hurt':unit.status?.guard>0?'defend':'idle';
  let artTime=time;if(state==='hurt'&&unit.side==='enemy')artTime=Math.max(0,.35-unit.hurt);if(state==='death')artTime=unit.deathAge||0;
  const base={id:unit.id,x:home.x,y:home.y,groundY:home.y,lift:0,facing:unit.side==='hero'?'right':'left',state,artTime,phase:'formation',style:'idle',home,contact:null,targetId:null,targetPoint:null,tip:null,traveling:false,offensive:false,contactMode:'none',lane:0,displacement:0};
  if(!action||!action.participants.includes(unit.id)||!alive(unit))return base;
  const t=clamp(Number.isFinite(elapsed)?elapsed:0,0,action.total),p=profile(unit,action),plan=planFor(b,unit,action),isOffensive=!!offensive(action);
  if(t>=action.total)return base;
  const strikeState=!isOffensive?(action.definition.effect==='guard'||action.definition.effect==='taunt'?'defend':'cast'):unit.side==='hero'?(unit.id==='vex'?'cast':'attack'):action.definition.magic?'cast':'attack';
  const stationary=!p.travel||reducedMotion||!plan;
  const phase=t<action.impactAt?'anticipation':t<action.impactAt+.22?'strike':'return';
  const pose={...base,state:strikeState,artTime:poseTime(unit,strikeState,actionFrame(action,t)),phase,style:p.style,offensive:isOffensive,
    ...(plan?{contact:plan.contact,targetId:plan.targetId,targetPoint:plan.targetPoint,lane:plan.lane}:{}),
    contactMode:isOffensive?(stationary?'projection':'weapon'):'support'};
  if(stationary){
    const direction=plan?.direction??(unit.side==='hero'?1:-1);pose.tip={x:home.x+direction*body.reach,y:home.y-body.handHeight};
    return pose;
  }
  const anticipationEnd=action.impactAt*.16,holdEnd=Math.min(action.total,action.impactAt+.22),returnEnd=Math.max(holdEnd+.01,action.total-.025);
  const direction=plan.direction,contact=plan.contact,backstep=6;
  let x=home.x,groundY=home.y,lift=0,travelU=0;
  if(t<anticipationEnd){x=home.x-direction*backstep*smooth(t/Math.max(.001,anticipationEnd));pose.phase='anticipation';pose.artTime=poseTime(unit,strikeState,0);}
  else if(t<action.impactAt){
    travelU=clamp((t-anticipationEnd)/Math.max(.001,action.impactAt-anticipationEnd),0,1);const u=smooth(travelU);
    x=mix(home.x-direction*backstep,contact.x,u);groundY=mix(home.y,contact.groundY,u);
    lift=mix(0,contact.lift,u)+Math.sin(travelU*Math.PI)*p.arc;pose.phase='travel';pose.traveling=true;
    if(unit.id==='vex'){pose.state='cast';pose.artTime=poseTime(unit,'cast',Math.min(2,Math.floor(travelU*3)));}
    else if(travelU<(unit.id==='rune'?.38:.68)){pose.state=unit.side==='hero'?'run':'walk';pose.artTime=poseTime(unit,pose.state,Math.floor(travelU*11)%6);}
    else{pose.state=strikeState;pose.artTime=poseTime(unit,strikeState,travelU<.88?1:2);}
  }else if(t<=holdEnd){x=contact.x;groundY=contact.groundY;lift=contact.lift;pose.phase='strike';pose.artTime=poseTime(unit,strikeState,3);}
  else if(t<returnEnd){
    travelU=clamp((t-holdEnd)/(returnEnd-holdEnd),0,1);const u=smooth(travelU);
    x=mix(contact.x,home.x,u);groundY=mix(contact.groundY,home.y,u);lift=mix(contact.lift,0,u)+Math.sin(travelU*Math.PI)*p.arc*.32;
    pose.phase='return';pose.traveling=true;
    if(travelU<.22){pose.state=strikeState;pose.artTime=poseTime(unit,strikeState,travelU<.11?4:5);}
    else{pose.state=unit.id==='vex'?'cast':unit.side==='hero'?'run':'walk';pose.artTime=poseTime(unit,pose.state,unit.id==='vex'?Math.min(2,Math.floor(travelU*3)):Math.floor(travelU*11)%6);}
  }else{pose.phase='settle';pose.state='idle';pose.artTime=0;}
  // Airborne feet never place the head above the action stage. Shadows retain the
  // interpolated ground lane, making the leap/glide altitude legible.
  lift=clamp(lift,0,Math.max(0,groundY-plan.minFoot));
  pose.x=x;pose.groundY=groundY;pose.lift=lift;pose.y=groundY-lift;
  pose.facing=pose.phase==='return'&&unit.id!=='vex'?(direction>0?'left':'right'):(direction>0?'right':'left');
  pose.tip={x:pose.x+direction*plan.reach,y:pose.y-plan.handHeight};
  pose.displacement=Math.hypot(pose.x-home.x,pose.y-home.y);
  return pose;
}
