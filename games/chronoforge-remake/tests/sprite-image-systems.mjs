import assert from 'node:assert/strict';
import {createSpriteFrameCache} from '../src/sprite-image.js';

function fixture(limit=128){
  const canvases=[],draws=[];
  const destination={imageSmoothingEnabled:true,imageSmoothingQuality:'high',drawImage(...args){draws.push(args);}};
  const cache=createSpriteFrameCache({limit,createCanvas(){
    const canvas={width:0,height:0};
    canvas.getContext=()=>canvas.context??={
      imageSmoothingEnabled:true,
      drawImage(...args){
        canvas.copy=args;
        // A tiny synthetic raster verifies that only the requested cell is copied.
        const [image,sx,sy,sw,sh,dx,dy,dw,dh]=args;
        if(image.pixels){
          assert.equal(sw,dw);assert.equal(sh,dh);
          canvas.pixels=new Uint8Array(canvas.width*canvas.height);
          for(let y=0;y<sh;y++)for(let x=0;x<sw;x++)
            canvas.pixels[(dy+y)*canvas.width+dx+x]=image.pixels[(sy+y)*image.width+sx+x];
        }
      },
    };
    canvases.push(canvas);return canvas;
  }});
  const draw=(image,crop=[10,20,30,40],destinationRect=[5,6,15,20])=>cache.drawAtlasImage(destination,image,...crop,...destinationRect);
  return {cache,canvases,draws,destination,draw};
}

{
  const f=fixture(),image={src:'atlas.png'};
  f.draw(image);
  const [canvas]=f.canvases;
  assert.deepEqual([canvas.width,canvas.height],[34,44]);
  assert.deepEqual(canvas.copy,[image,10,20,30,40,2,2,30,40]);
  assert.equal(canvas.context.imageSmoothingEnabled,false);
  assert.deepEqual(canvas.__atlasSource,{src:'atlas.png',x:10,y:20,padding:2});
  assert.deepEqual(f.draws[0],[canvas,2,2,30,40,5,6,15,20]);
  assert.equal(f.destination.imageSmoothingEnabled,true);
  assert.equal(f.destination.imageSmoothingQuality,'high');
  f.draw(image,undefined,[20,30,150,200]);
  assert.equal(f.canvases.length,1,'Changing destination scale reuses the native frame.');
  assert.equal(f.cache.size,1);
  f.draw({src:'atlas.png'});
  assert.equal(f.canvases.length,2,'Different image objects never share stale source pixels.');
}

{
  const f=fixture(),image={src:'neighbors.png',width:8,height:6,pixels:new Uint8Array(48).fill(99)};
  for(let y=1;y<4;y++)for(let x=2;x<5;x++)image.pixels[y*8+x]=7;
  f.draw(image,[2,1,3,3]);
  const [canvas]=f.canvases;
  for(let y=0;y<7;y++)for(let x=0;x<7;x++)
    assert.equal(canvas.pixels[y*7+x],x>=2&&x<5&&y>=2&&y<5?7:0,'Cell pixels have a transparent two-pixel gutter without neighbors.');
}

{
  const f=fixture(),image={src:'portrait.png'};
  f.draw(image,[10.25,20.75,30.5,40.5],[1.5,2.5,64,64]);
  const [canvas]=f.canvases;
  assert.deepEqual([canvas.width,canvas.height],[35,46]);
  assert.deepEqual(canvas.copy,[image,10,20,31,42,2,2,31,42]);
  assert.deepEqual(f.draws[0],[canvas,2.25,2.75,30.5,40.5,1.5,2.5,64,64]);
  f.draw(image,[10.5,20.5,30.25,40.75]);
  assert.equal(f.canvases.length,1,'Fractional crops with the same containing rectangle share native pixels.');
  assert.deepEqual(f.draws[1].slice(1,5),[2.5,2.5,30.25,40.75]);
}

{
  const f=fixture(2),image={src:'animation.png'};
  const a=[0,0,8,8],b=[8,0,8,8],c=[16,0,8,8];
  f.draw(image,a);f.draw(image,b);f.draw(image,a);f.draw(image,c);
  assert.equal(f.cache.size,2);
  f.draw(image,a);
  assert.equal(f.canvases.length,3,'Reading a frame refreshes its LRU position.');
  f.draw(image,b);
  assert.equal(f.canvases.length,4,'The least recently used frame is reconstructed after eviction.');
  assert.equal(f.cache.size,2);
  f.cache.clear();assert.equal(f.cache.size,0);
  f.draw(image,b);assert.equal(f.canvases.length,5);
}

{
  assert.throws(()=>fixture(0),RangeError);
  assert.throws(()=>fixture(1.5),RangeError);
  const f=fixture(),image={src:'atlas.png'};
  assert.throws(()=>f.draw(image,[0,0,0,4]),RangeError);
  assert.throws(()=>f.draw(image,[NaN,0,4,4]),RangeError);
  f.draw(image,undefined,[0,0,0,12]);
  assert.equal(f.cache.size,0,'An empty destination needs no source allocation.');
}

console.log('Sprite frame cache verified: native crops, transparent gutters, fractional portraits, source identity and bounded LRU. No browser used.');
