// Approved poses are sampled directly from one sheet; no pose is warped or
// independently registered. All timing is in seconds and samples absolutely.
export const HERO_IDLE = Object.freeze({
  columns:3, rows:1, frames:3,
  beatDuration:.3, duration:1.2, sequence:Object.freeze([0,1,2,1]),
});
const KAIDA_FRESH_IDLE = Object.freeze({
  columns:4, rows:2, frames:8,
  boundsAlpha:32, // Ignore faint alpha fringe when measuring feet, not when drawing.
  beatDuration:1/6, duration:8/6, sequence:Object.freeze([0,1,2,3,4,5,6,7]),
});
export const HERO_IDLE_SHEETS = Object.freeze({
  kaida:{file:'kaida-idle-fresh.png',layout:KAIDA_FRESH_IDLE},
  vex:{file:'vex-idle.png',layout:HERO_IDLE},
  rune:{file:'rune-idle.png',layout:HERO_IDLE},
});

export function heroIdleFrame(time=0,{staticIdle=false,reducedMotion=false}={},layout=HERO_IDLE){
  if(staticIdle||reducedMotion||!Number.isFinite(time))return 0;
  const t=((time%layout.duration)+layout.duration)%layout.duration;
  return layout.sequence[Math.min(layout.sequence.length-1,Math.floor(t/layout.beatDuration+1e-10))];
}

function hasTransparency(pixels){
  for(let i=3;i<pixels.length;i+=4)if(pixels[i]<255)return true;
  return false;
}

function alphaBounds(pixels,width,height,threshold=0){
  let x=width,y=height,right=0,bottom=0;
  for(let py=0;py<height;py++)for(let px=0;px<width;px++){
    if(pixels[(py*width+px)*4+3]<=threshold)continue;
    x=Math.min(x,px);y=Math.min(y,py);right=Math.max(right,px+1);bottom=Math.max(bottom,py+1);
  }
  return right ? {x,y,width:right-x,height:bottom-y,right,bottom} : null;
}

// The modal border color is more stable than one corner in a generated image.
function borderColor(pixels,width,height){
  const colors=new Map();let best=0,count=0;
  const add=(x,y)=>{
    const offset=(y*width+x)*4,key=(pixels[offset]<<16)|(pixels[offset+1]<<8)|pixels[offset+2];
    const next=(colors.get(key)||0)+1;colors.set(key,next);
    if(next>count){best=key;count=next;}
  };
  for(let x=0;x<width;x++){add(x,0);if(height>1)add(x,height-1);}
  for(let y=1;y<height-1;y++){add(0,y);if(width>1)add(width-1,y);}
  return [best>>16,(best>>8)&255,best&255];
}

/**
 * Pure one-time compositing mask. RGB values and source positions are untouched.
 * Only near-matte pixels reachable from a cell edge become transparent; enclosed
 * dark costume pixels cannot be selected by the flood. Existing alpha wins.
 * Bounds use inclusive x/y and exclusive right/bottom, or null for an empty cell.
 */
export function maskHeroIdleMatte(pixels,width,height,{tolerance=10,matte,preserveAlpha=false}={}){
  if(!Number.isInteger(width)||!Number.isInteger(height)||width<1||height<1||pixels.length!==width*height*4)
    throw new Error('Idle matte masking requires complete RGBA cell pixels.');
  if(!Number.isFinite(tolerance)||tolerance<0)throw new Error('Matte tolerance must be finite and non-negative.');
  const data=new Uint8ClampedArray(pixels);
  if(preserveAlpha||hasTransparency(data))return {data,bounds:alphaBounds(data,width,height),removedPixels:0,matte:null,preservedAlpha:true};
  const background=matte||borderColor(data,width,height);
  if(background.length!==3||!background.every(value=>Number.isFinite(value)&&value>=0&&value<=255))
    throw new Error('Matte color must contain three RGB channels.');
  const limit=tolerance*tolerance,seen=new Uint8Array(width*height),queue=new Uint32Array(width*height);
  let head=0,tail=0;
  const add=index=>{
    if(seen[index])return;seen[index]=1;
    const offset=index*4,dr=data[offset]-background[0],dg=data[offset+1]-background[1],db=data[offset+2]-background[2];
    if(dr*dr+dg*dg+db*db<=limit)queue[tail++]=index;
  };
  for(let x=0;x<width;x++){add(x);add((height-1)*width+x);}
  for(let y=1;y<height-1;y++){add(y*width);add(y*width+width-1);}
  while(head<tail){
    const index=queue[head++],x=index%width;data[index*4+3]=0;
    if(x>0)add(index-1);if(x<width-1)add(index+1);
    if(index>=width)add(index-width);if(index<width*(height-1))add(index+width);
  }
  return {data,bounds:alphaBounds(data,width,height),removedPixels:tail,matte:[...background],preservedAlpha:false};
}

export function createHeroIdleFrames(img,createCanvas=()=>document.createElement('canvas'),layout=HERO_IDLE){
  const sourceWidth=img.naturalWidth||img.width,sourceHeight=img.naturalHeight||img.height;
  const {columns,rows,frames}=layout;
  if(!Number.isInteger(columns)||columns<1||!Number.isInteger(rows)||rows<1||frames!==columns*rows)
    throw new Error('Hero idle layout must describe a complete grid.');
  if(!Number.isInteger(sourceWidth)||!Number.isInteger(sourceHeight)||sourceWidth<columns||sourceHeight<rows||sourceWidth%columns||sourceHeight%rows)
    throw new Error('Hero idle sheet must contain equal cells matching its layout.');
  const width=sourceWidth/columns,height=sourceHeight/rows;
  const cells=Array.from({length:frames},(_,index)=>{
    const canvas=createCanvas();canvas.width=width;canvas.height=height;
    const ctx=canvas.getContext('2d',{willReadFrequently:true});
    if(!ctx)throw new Error('A 2D canvas is required to prepare idle poses.');
    ctx.imageSmoothingEnabled=false;ctx.drawImage(img,(index%columns)*width,Math.floor(index/columns)*height,width,height,0,0,width,height);
    return {canvas,ctx,pixels:ctx.getImageData(0,0,width,height)};
  });
  // A transparent source sheet must not have its opaque cells color-keyed.
  const preserveAlpha=cells.some(cell=>hasTransparency(cell.pixels.data));
  let union=null;
  for(const cell of cells){
    const result=maskHeroIdleMatte(cell.pixels.data,width,height,{preserveAlpha});
    const b=layout.boundsAlpha?alphaBounds(result.data,width,height,layout.boundsAlpha):result.bounds;
    if(!b)throw new Error('Hero idle sheet contains an empty pose.');
    cell.pixels.data.set(result.data);cell.ctx.putImageData(cell.pixels,0,0);
    if(b){
      if(!union)union={...b};
      else{
        union.x=Math.min(union.x,b.x);union.y=Math.min(union.y,b.y);
        union.right=Math.max(union.right,b.right);union.bottom=Math.max(union.bottom,b.bottom);
        union.width=union.right-union.x;union.height=union.bottom-union.y;
      }
    }
  }
  return {frames:cells.map(cell=>cell.canvas),bounds:union};
}
