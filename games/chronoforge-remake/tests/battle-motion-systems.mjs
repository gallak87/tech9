// Fast checks of real action scheduling and the production presentation path.
// Fixtures skip progression; no alternative combat implementation is used.
import assert from 'node:assert/strict';
import {writeFileSync} from 'node:fs';
import {createState,rest,learn} from '../src/state.js';
import {SKILLS,LINKS,ENEMIES} from '../src/data.js';
import {startBattle,battleAction,updateBattle,battlePose,formationPosition,actionContacts} from '../src/battle.js';

const report={method:'Production action/update API and pure battle presentation invariants; synthetic readiness and progression fixtures',checks:[],passed:false};
const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
const near=(a,b,message)=>assert(distance(a,b)<.001,message);
function fixture(enemies=['architect'],reducedMotion=false){
 const g={s:createState(),time:0,refresh(){},toast(){}};
 g.s.settings.speed=1;g.s.settings.reducedMotion=reducedMotion;
 for(const hero of g.s.heroes){hero.level=6;hero.sp=50;for(const skill of Object.values(SKILLS).filter(s=>s.hero===hero.id))learn(g.s,hero.id,skill.id);}
 for(const link of Object.values(LINKS))g.s.flags[link.flag]=true;
 rest(g.s,true);startBattle(g,{id:'motion-'+enemies.join('-'),name:'Motion fixture',enemies,region:'crown',boss:enemies.length===1&&ENEMIES[enemies[0]].boss});
 return g;
}
function queue(g,hero,id,targetId){
 for(const unit of g.battle.heroes)unit.atb=100;
 updateBattle(g,.001);assert(battleAction(g,'hero',{id:hero}).ok);
 const kind=id==='attack'||id==='defend'?id:LINKS[id]?'link':'tech';
 assert(battleAction(g,'command',{id:kind}).ok);
 if(kind==='link'||kind==='tech')assert(battleAction(g,'select',{id}).ok);
 if(g.battle.view==='target')assert(battleAction(g,'target',{id:targetId||g.battle.enemies[0].id}).ok);
 assert(g.battle.action);return g.battle.action;
}
function sample(g,unit,elapsed){return battlePose(g.battle,unit,{elapsed,time:elapsed,reducedMotion:g.s.settings.reducedMotion});}
function check(name,fn){const detail=fn()||{};report.checks.push({name,passed:true,...detail});}

for(const hero of ['kaida','vex','rune'])for(const enemies of [['architect'],['scrapper','rat']])check(`${hero} reaches the selected ${enemies.length===1?'boss':'second enemy'} and returns`,()=>{
 const g=fixture(enemies),target=g.battle.enemies.at(-1),a=queue(g,hero,'attack',target.id),unit=g.battle.heroes.find(h=>h.id===hero),home=formationPosition(g.battle,unit),targetHome=formationPosition(g.battle,target);
 const before=JSON.stringify(g.battle),impact=sample(g,unit,a.impactAt);
 near(sample(g,unit,0),home,'Action starts in formation');
 assert.equal(impact.targetId,target.id,'Contact follows the chosen target, including vertical placement');
 assert(distance(impact,home)>180,'Attack traverses the arena instead of a small local hop');
 assert(distance(impact,targetHome)<distance(home,targetHome)*.5,'Attacker enters the target body area');
 assert(['attack','cast'].includes(impact.state),'Actual strike frames are used at impact');
 near(sample(g,unit,a.impactAt+.15),impact,'Strike holds through the impact beat');
 near(sample(g,unit,a.total),home,'Return ends exactly at formation');
 for(let i=0;i<=160;i++){
  const pose=sample(g,unit,a.total*i/160);assert(Number.isFinite(pose.x)&&Number.isFinite(pose.y)&&Number.isFinite(pose.groundY));
  assert(pose.x>30&&pose.x<740&&pose.groundY<440,'Actor remains in the battlefield, above the status panel');
  if(i){const previous=sample(g,unit,a.total*(i-1)/160);assert(distance(previous,pose)<45,'Choreography has no teleport between sampled frames');}
 }
 assert.equal(JSON.stringify(g.battle),before,'Rendering cannot mutate combat state');
 return {travel:Math.round(distance(impact,home)),target:target.id,style:impact.style};
});

const offensiveSkills=['rift_cleave','chrono_strike','time_sever','void_lance','null_field','entropy_surge'];
for(const id of offensiveSkills)check(`${id} reaches a foe at its real impact`,()=>{
 const g=fixture(),a=queue(g,SKILLS[id].hero,id),pose=sample(g,a.actorId,a.impactAt),home=formationPosition(g.battle,a.actorId);
 assert(pose.offensive);assert(distance(pose,home)>180);assert(a.targetIds.includes(pose.targetId));near(sample(g,a.actorId,a.total),home,'Technique returns home');
});

for(const id of ['tidal_rift','sunrise_aegis','unwritten_hour'])check(`${id} stages each participant at distinct contact positions`,()=>{
 const g=fixture(['scrapper','rat']),a=queue(g,LINKS[id].heroes[0],id),poses=a.participants.map(unit=>sample(g,unit,a.impactAt));
 for(const pose of poses){assert(pose.offensive);assert(distance(pose,pose.home)>180);assert(a.targetIds.includes(pose.targetId));}
 for(let i=0;i<poses.length;i++)for(let j=i+1;j<poses.length;j++)assert(distance(poses[i],poses[j])>26,'Linked actors remain visually distinct at contact');
 assert(actionContacts(g.battle).length>=a.targetIds.length,'Every affected foe has an impact contact');
 for(const unit of a.participants)near(sample(g,unit,a.total),formationPosition(g.battle,unit),'Every participant returns');
});

for(const [hero,id,target]of [['kaida','defend'],['kaida','second_wind'],['vex','mend','kaida'],['rune','aegis_field'],['rune','bulwark'],['rune','temporal_wall'],['rune','rekindle','kaida'],['vex','winter_mercy']])check(`${id} keeps support actions in formation`,()=>{
 const g=fixture(),a=queue(g,hero,id,target);
 for(const participant of a.participants)for(const t of [0,a.impactAt*.5,a.impactAt,a.total])near(sample(g,participant,t),formationPosition(g.battle,participant),'Support does not charge the enemy');
});

for(const id of ['sunrise_aegis','unwritten_hour'])check(`${id} keeps linked actors distinct against the lone top survivor`,()=>{
 const g=fixture(['scrapper','rat','hound']);g.battle.enemies[1].hp=0;g.battle.enemies[2].hp=0;
 const a=queue(g,'kaida',id),poses=a.participants.map(unit=>sample(g,unit,a.impactAt));
 assert.deepEqual(a.targetIds,['scrapper-0']);let minimum=Infinity;
 for(let i=0;i<poses.length;i++)for(let j=i+1;j<poses.length;j++)minimum=Math.min(minimum,distance(poses[i],poses[j]));
 assert(minimum>=34,'Top-row clamping cannot stack linked attackers');
 for(const pose of poses)near(pose.tip,pose.targetPoint,'Spacing must preserve actual weapon contact');
 for(const unit of g.battle.enemies)assert(formationPosition(g.battle,unit).y+47<440,'Every name and meter stays above the HUD');
 return {minimumSeparation:Math.round(minimum*100)/100};
});

for(const id of ['scrapper','hound','gravbot','emberlord'])check(`${id} physically reaches its selected ally`,()=>{
 const g=fixture([id]);for(const hero of g.battle.heroes)hero.atb=0;g.battle.enemies[0].atb=100;updateBattle(g,.001);
 const a=g.battle.action;assert.equal(a.side,'enemy');assert(!a.definition.magic);const pose=sample(g,a.actorId,a.impactAt),home=formationPosition(g.battle,a.actorId);
 assert(distance(pose,home)>180);assert(a.targetIds.includes(pose.targetId));near(sample(g,a.actorId,a.total),home,'Enemy returns home');
});

check('Lethal damage cannot move the contact point or apply twice',()=>{
 const g=fixture(['scrapper']),target=g.battle.enemies[0];target.hp=1;const a=queue(g,'kaida','attack',target.id),contact=sample(g,'kaida',a.impactAt),cost=g.battle.heroes[0].mp;
 for(let i=0;i<100&&!g.battle.action?.impacted;i++)updateBattle(g,.01);
 assert.equal(target.hp,0);assert.equal(g.battle.lastAction.impacts,1);near(sample(g,'kaida',a.impactAt),contact,'Lethal hit retains the original landing');
 for(let i=0;i<180&&g.battle.action;i++)updateBattle(g,.01);
 assert.equal(g.battle.action,null);assert.equal(g.battle.lastAction.impacts,1);assert.equal(g.battle.heroes[0].mp,Math.min(g.battle.heroes[0].maxMp,cost+5),'Only the existing capped victory MP recovery applies');
 near(battlePose(g.battle,'kaida'),formationPosition(g.battle,'kaida'),'No snap remains after action cleanup');
});

check('Reduced motion suppresses aerial movement while retaining one real hit',()=>{
 const g=fixture(['architect'],true),a=queue(g,'rune','attack'),home=formationPosition(g.battle,'rune');
 for(const t of [0,a.impactAt*.5,a.impactAt,a.total]){const pose=sample(g,'rune',t);assert.equal(pose.lift,0);assert(Number.isFinite(pose.x));}
 const hp=g.battle.enemies[0].hp;for(let i=0;i<200&&g.battle.action;i++)updateBattle(g,.01);
 assert(g.battle.enemies[0].hp<hp);assert.equal(g.battle.lastAction.impacts,1);near(battlePose(g.battle,'rune'),home,'Reduced motion also returns to formation');
});

report.passed=true;writeFileSync(new URL('../evidence/battle-motion-systems-report.json',import.meta.url),JSON.stringify(report,null,2));
console.log(`PASS: ${report.checks.length} battle movement and impact invariants.`);
