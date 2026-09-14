// Isolate atlas crops at source resolution before filtering. Transparent gutters
// keep a downsampling kernel from borrowing pixels from the next animation cell.
const PADDING=2;

export function createSpriteFrameCache({limit=128,createCanvas=()=>document.createElement('canvas')}={}){
  if(!Number.isInteger(limit)||limit<1)throw new RangeError('Sprite cache limit must be a positive integer.');
  if(typeof createCanvas!=='function')throw new TypeError('A canvas factory is required.');
  let sources=new WeakMap();
  const recent=new Map();

  function isolatedFrame(img,sx,sy,sw,sh){
    const x=Math.floor(sx),y=Math.floor(sy),w=Math.ceil(sx+sw)-x,h=Math.ceil(sy+sh)-y;
    const key=[x,y,w,h].join(',');
    let frames=sources.get(img),entry=frames?.get(key);
    if(entry){recent.delete(entry);recent.set(entry,true);return entry;}
    const canvas=createCanvas();canvas.width=w+PADDING*2;canvas.height=h+PADDING*2;
    const ctx=canvas.getContext('2d');
    if(!ctx)throw new Error('A 2D canvas is required to prepare sprite frames.');
    ctx.imageSmoothingEnabled=false;
    ctx.drawImage(img,x,y,w,h,PADDING,PADDING,w,h);
    // Read-only provenance lets dev diagnostics recover atlas coordinates.
    canvas.__atlasSource={src:img.src,x,y,padding:PADDING};
    entry={img,key,canvas,x,y};
    if(!frames){frames=new Map();sources.set(img,frames);}
    frames.set(key,entry);recent.set(entry,true);
    if(recent.size>limit){
      const oldest=recent.keys().next().value;
      recent.delete(oldest);
      const previous=sources.get(oldest.img);previous.delete(oldest.key);
      if(!previous.size)sources.delete(oldest.img);
    }
    return entry;
  }

  function drawAtlasImage(ctx,img,sx,sy,sw,sh,dx,dy,dw,dh){
    if(![sx,sy,sw,sh,dx,dy,dw,dh].every(Number.isFinite)||sw<=0||sh<=0)
      throw new RangeError('Sprite drawing requires finite coordinates and a positive source crop.');
    if(dw===0||dh===0)return;
    const frame=isolatedFrame(img,sx,sy,sw,sh);
    // Fractional portrait crops retain their exact geometry inside the containing
    // integer crop. The caller owns destination transforms and filter settings.
    ctx.drawImage(frame.canvas,sx-frame.x+PADDING,sy-frame.y+PADDING,sw,sh,dx,dy,dw,dh);
  }

  return {
    drawAtlasImage,
    clear(){recent.clear();sources=new WeakMap();},
    get size(){return recent.size;},
  };
}

const frames=createSpriteFrameCache();
export function drawAtlasImage(ctx,img,sx,sy,sw,sh,dx,dy,dw,dh){
  frames.drawAtlasImage(ctx,img,sx,sy,sw,sh,dx,dy,dw,dh);
}
