// Original synthesized score. No downloaded recordings or third-party samples.
let context, master, enabled=true, nextNote=0, step=0, mood='haven';
const scales={haven:[48,55,60,62,64,67,71,72],ember:[45,52,57,59,60,64,67,69],frost:[50,57,62,64,65,69,72,74],crown:[44,51,56,59,60,63,67,68],battle:[45,52,57,60,64,67,69,72]};
export function unlockAudio(){
 if(!context){const AC=window.AudioContext||window.webkitAudioContext;if(!AC)return;context=new AC();master=context.createGain();master.gain.value=.12;master.connect(context.destination);nextNote=context.currentTime;}
 if(context.state==='suspended')context.resume().catch(()=>{});
}
export function setAudio(value){enabled=value;if(master)master.gain.setTargetAtTime(enabled?.12:0,context.currentTime,.1);}
function note(midi,duration=.4,vol=.1,type='sine',when=0){
 if(!context||!enabled)return;const start=context.currentTime+when;
 const osc=context.createOscillator(),gain=context.createGain();osc.type=type;osc.frequency.value=440*2**((midi-69)/12);
 gain.gain.setValueAtTime(0,start);gain.gain.linearRampToValueAtTime(vol,start+.018);gain.gain.exponentialRampToValueAtTime(.0001,start+duration);osc.connect(gain);gain.connect(master);osc.start(start);osc.stop(start+duration+.02);
}
export function sound(kind){
 if(kind==='hit'){note(40,.14,.22,'triangle');note(71,.1,.06,'square');}
 else if(kind==='magic'){[72,79,84].forEach((n,i)=>note(n,.45,.12,'sine',i*.045));}
 else if(kind==='victory'){[60,64,67,72,76].forEach((n,i)=>note(n,.6,.2,'triangle',i*.13));}
 else if(kind==='error'){note(44,.12,.1,'triangle');note(42,.12,.08,'triangle',.1);}
 else if(kind==='build'){[48,55,60].forEach((n,i)=>note(n,.35,.18,'triangle',i*.08));}
 else if(kind==='heal'){[67,72,79].forEach((n,i)=>note(n,.5,.14,'sine',i*.06));}
 else note(kind==='step'?51:79,.055,kind==='step'?.025:.07,'triangle');
}
export function tickAudio(scene,region){
 if(!context||!enabled||context.state!=='running')return;
 mood=scene==='battle'?'battle':region==='frost'||region==='orbital'?'frost':region==='emberline'||region==='crater'?'ember':region==='crown'?'crown':'haven';
 if(context.currentTime<nextNote)return;
 const scale=scales[mood],pace=mood==='battle'?.25:.55;
 const melody=[0,2,4,2,1,3,5,3,0,4,6,4,2,1,3,1];
 note(scale[melody[step%16]]+12,pace*1.9,.07,'sine');
 if(step%4===0){note(scale[Math.floor(step/8)%2]-12,pace*4,.14,'triangle');note(scale[2],pace*3,.035,'sine');}
 step++;nextNote=context.currentTime+pace;
}
