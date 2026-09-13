// A small, registered battle idle made from Kaida's existing resting drawing.
// Only the jacket between the collar and belt breathes. Head, hands, sword,
// legs and feet keep their original pixels and position in every sample.
// Coordinates describe the first 181 × 181 cell in assets/kaida.png.
export const KAIDA_IDLE = Object.freeze({
  cellSize:181, collar:62, belt:99, frames:4, duration:3.6,
  maxLift:2,
});

// A held exhale, a short inhale, and a slower release. The last/first pose is
// identical; these are discrete poses, not whole-sprite scaling or swaying.
const beats = Object.freeze([
  [0,.75], [1,.25], [2,.25], [3,.45], [2,.4], [1,.5], [0,1],
]);

export function kaidaIdleFrame(time=0,{staticIdle=false,reducedMotion=false}={}){
  if(staticIdle||reducedMotion||!Number.isFinite(time))return 0;
  let t=((time%KAIDA_IDLE.duration)+KAIDA_IDLE.duration)%KAIDA_IDLE.duration;
  for(const [frame,hold] of beats){if(t<hold)return frame;t-=hold;}
  return 0;
}

// Inverse mapping keeps the two edges of the cloth fixed and avoids gaps.
// Sampling whole source rows preserves horizontal registration and palette.
export function kaidaIdleSourceRow(y,frame,height=KAIDA_IDLE.cellSize){
  const scale=height/KAIDA_IDLE.cellSize,top=KAIDA_IDLE.collar*scale,bottom=KAIDA_IDLE.belt*scale;
  if(y<=top||y>=bottom)return y;
  const u=(y-top)/(bottom-top),lift=KAIDA_IDLE.maxLift*scale*Math.max(0,Math.min(KAIDA_IDLE.frames-1,frame))/(KAIDA_IDLE.frames-1);
  return Math.min(Math.ceil(bottom)-1,Math.round(y+lift*Math.sin(u*Math.PI)**2));
}

export function createKaidaIdleFrames(img,createCanvas=()=>document.createElement('canvas')){
  const width=Math.floor(img.width/6),height=Math.floor(img.height/8);
  return Array.from({length:KAIDA_IDLE.frames},(_,frame)=>{
    const canvas=createCanvas();canvas.width=width;canvas.height=height;
    const ctx=canvas.getContext('2d');ctx.imageSmoothingEnabled=false;
    for(let y=0;y<height;y++)ctx.drawImage(img,0,kaidaIdleSourceRow(y,frame,height),width,1,0,y,width,1);
    return canvas;
  });
}
