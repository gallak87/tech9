// Heroes, non-settlement actors, enemies, items and salvage use imagegen atlases.
// Sprite sheets are sampled as discrete frames; no static sprite rotations.
const heroes={},bounds={},sheets=new Map();
let manifest;
let loading;
const ROW={idle:0,walk:1,run:2,attack:3,cast:4,hurt:5,defend:4,victory:4,down:5};
export function loadArt(){return loading??=loadAllArt();}
async function loadAllArt(){
 await Promise.all(['kaida','vex','rune'].map(async id=>{
  const img=new Image();img.src=new URL(`../assets/${id}.png`,import.meta.url).href;await img.decode();heroes[id]=img;
  const c=document.createElement('canvas');c.width=img.width;c.height=img.height;const ctx=c.getContext('2d',{willReadFrequently:true});ctx.drawImage(img,0,0);
  const pixels=ctx.getImageData(0,0,img.width,img.height).data,cw=img.width/6,ch=img.height/8;
  bounds[id]=Array.from({length:8},(_,row)=>Array.from({length:6},(_,col)=>{
   let max=0;for(let y=Math.floor(row*ch);y<Math.floor((row+1)*ch);y++)for(let x=Math.floor(col*cw);x<Math.floor((col+1)*cw);x++){if(pixels[(y*img.width+x)*4+3]>100)max=Math.max(max,y-row*ch);}
   return max;
  }));
 }));
 await loadSpriteSheets();
}
export function drawHero(ctx,id,state,x,y,scale=1,face='right',time=0){
 const img=heroes[id];if(!img)return;
 let row=ROW[state]??0,frame=Math.floor(time*(state==='idle'?4:state==='run'?13:state==='attack'?10:8))%6;
 if((state==='walk'||state==='run')&&face==='up')row=6;
 if((state==='walk'||state==='run')&&face==='down')row=7;
 if(state==='idle'&&face==='up'){row=6;frame=0;}if(state==='idle'&&face==='down'){row=7;frame=0;}
 if(state==='down')frame=5;
 const cw=img.width/6,ch=img.height/8,size=82*scale,base=bounds[id]?.[row]?.[frame]??ch*.94;
 ctx.save();ctx.imageSmoothingEnabled=false;ctx.translate(Math.round(x),Math.round(y));if(face==='left')ctx.scale(-1,1);
 ctx.drawImage(img,Math.round(frame*cw),Math.round(row*ch),Math.floor(cw),Math.floor(ch),-size*.5,-size*base/ch,size,size);
 ctx.restore();
}
export function drawPortrait(ctx,id,x,y,size=64){
 const img=heroes[id];if(!img){drawNPCPortrait(ctx,id,x,y,size);return;}const cw=img.width/6,ch=img.height/8;
 ctx.save();ctx.imageSmoothingEnabled=false;ctx.drawImage(img,cw*.2,ch*.05,cw*.6,ch*.55,x,y,size,size);ctx.restore();
}

const atlasURL=new URL('../assets/sprites/',import.meta.url);
async function loadSpriteSheets(){
 const response=await fetch(new URL('manifest.json',atlasURL));
 if(!response.ok)throw new Error('Sprite manifest could not be loaded.');
 manifest=await response.json();
 await Promise.all(Object.entries(manifest.sheets).map(async([key,spec])=>{
  const img=new Image();img.src=new URL(spec.file,atlasURL).href;await img.decode();
  const c=document.createElement('canvas');c.width=img.width;c.height=img.height;
  const cx=c.getContext('2d',{willReadFrequently:true});cx.drawImage(img,0,0);
  const px=cx.getImageData(0,0,c.width,c.height).data,cells=[];
  for(let row=0;row<spec.rows;row++){
   cells[row]=[];
   for(let col=0;col<spec.columns;col++){
    const sx=Math.floor(col*img.width/spec.columns),sy=spec.rowCuts?.[row]??Math.floor(row*img.height/spec.rows);
    const ex=Math.floor((col+1)*img.width/spec.columns),ey=spec.rowCuts?.[row+1]??Math.floor((row+1)*img.height/spec.rows);
    let left=ex,top=ey,right=sx-1,bottom=sy-1;
    for(let y=sy;y<ey;y++)for(let x=sx;x<ex;x++)if(px[(y*img.width+x)*4+3]>32){left=Math.min(left,x);right=Math.max(right,x);top=Math.min(top,y);bottom=Math.max(bottom,y);}
    cells[row][col]=right<left?null:{x:left,y:top,w:right-left+1,h:bottom-top+1};
   }
  }
  sheets.set(key,{img,cells,spec});
 }));
 // A missing or blank mapped frame is a build/content error, never a generic icon.
 for(const [kind,entries] of Object.entries(manifest).filter(([k])=>['enemies','npcs','items','props'].includes(k))){
  for(const [id,entry] of Object.entries(entries)){
   const sheet=sheets.get(entry.sheet);if(!sheet)throw new Error('Missing sprite sheet: '+kind+'/'+id);
   const rows=kind==='enemies'?[...new Set(Object.values(entry.rows))]:[entry.row];
   for(const row of rows)for(let i=0;i<(entry.frames||1);i++)if(!sheet.cells[row]?.[entry.col??i])throw new Error('Empty sprite cell: '+kind+'/'+id+' row '+row+' frame '+i);
  }
 }
}
function frameData(entry,row,col){
 const sheet=sheets.get(entry?.sheet),cell=sheet?.cells[row]?.[col];
 return cell?{sheet,cell}:null;
}
function actor(ctx,entry,row,frame,x,y,size,heightOnly=false){
 const data=frameData(entry,row,frame);if(!data)return;
 const {sheet,cell}=data;
 // Use the standing row's scale throughout combat, so an extended weapon or
 // a collapsed pose never shrinks the body. NPCs each occupy their own row.
 const rowCells=sheet.cells[heightOnly?row:(entry.rows?.idle??row)].slice(0,entry.frames||6).filter(Boolean);
 const extent=Math.max(...rowCells.map(c=>heightOnly?c.h:Math.max(c.w,c.h)));
 const k=size/extent,w=cell.w*k,h=cell.h*k;
 ctx.save();ctx.imageSmoothingEnabled=false;
 ctx.drawImage(sheet.img,cell.x,cell.y,cell.w,cell.h,Math.round(x-w/2),Math.round(y-h),w,h);
 ctx.restore();
}
export function drawEnemy(ctx,id,state,x,y,scale=1,time=0,phase=1){
 const entry=manifest?.enemies[id];if(!entry)return;
 let row=entry.rows[state]??entry.rows.idle;
 if(entry.phases&&!['hurt','down','death'].includes(state))row=entry.phases[Math.max(0,Math.min(2,phase-1))];
 const fps=state==='idle'?5:10;
 let frame=Math.floor(Math.max(0,time)*fps)%entry.frames;
 if(state==='hurt')frame=Math.min(2,Math.floor(Math.max(0,time)*10));
 if(state==='death')frame=3+Math.min(2,Math.floor(Math.max(0,time)*10));
 if(state==='down')frame=entry.frames-1;
 actor(ctx,entry,row,frame,x,y,90*scale);
}
export function drawNPC(ctx,id,x,y,scale=1,time=0){
 const entry=manifest?.npcs[id];if(!entry)return;
 const frame=Math.floor(Math.max(0,time)*3)%entry.frames;
 actor(ctx,entry,entry.row,frame,x,y,56*scale,true);
}
function drawNPCPortrait(ctx,id,x,y,size){
 const entry=manifest?.npcs[id],data=entry&&frameData(entry,entry.row,0);if(!data)return;
 const {sheet,cell}=data,head=Math.min(cell.w,cell.h*.46);
 ctx.save();ctx.imageSmoothingEnabled=false;
 ctx.drawImage(sheet.img,cell.x+(cell.w-head)/2,cell.y,head,head,x,y,size,size);
 ctx.restore();
}
export function drawItemIcon(ctx,id,x,y,size=24){
 const entry=manifest?.items[id],data=entry&&frameData(entry,entry.row,entry.col);if(!data)return;
 const {sheet,cell}=data,k=(size-2)/Math.max(cell.w,cell.h),w=cell.w*k,h=cell.h*k;
 ctx.save();ctx.imageSmoothingEnabled=false;
 ctx.drawImage(sheet.img,cell.x,cell.y,cell.w,cell.h,x+(size-w)/2,y+(size-h)/2,w,h);
 ctx.restore();
}
export function drawProp(ctx,id,x,y,width=40){
 const entry=manifest?.props[id],data=entry&&frameData(entry,entry.row,entry.col);if(!data)return;
 const {sheet,cell}=data,h=cell.h*width/cell.w;
 ctx.save();ctx.imageSmoothingEnabled=false;
 ctx.drawImage(sheet.img,cell.x,cell.y,cell.w,cell.h,x-width/2,y-h,width,h);
 ctx.restore();
}
