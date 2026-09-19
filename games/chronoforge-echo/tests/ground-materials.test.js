import test from 'node:test';
import assert from 'node:assert/strict';
import {blendRepeatEdges,shoreDistance,lavaShoreMix} from '../src/ground-materials.js';
import {readPngPixels} from './png-pixels.js';

test('all six volcanic materials repeat without border color jumps and retain their detailed centers',()=>{
 const source=readPngPixels(new URL('../public/assets/crater-ember-ground-source.png',import.meta.url));
 const width=source.width/3-4,height=source.height/2-4;
 for(let tile=0;tile<6;tile++){
  const data=new Uint8ClampedArray(width*height*4),sx=tile%3*(width+4)+2,sy=Math.floor(tile/3)*(height+4)+2;
  for(let y=0;y<height;y++)data.set(source.data.subarray(((sy+y)*source.width+sx)*4,((sy+y)*source.width+sx+width)*4),y*width*4);
  const before=data.slice();blendRepeatEdges(data,width,height);
  for(let y=0;y<height;y++)assert.deepEqual(data.subarray(y*width*4,y*width*4+4),data.subarray((y*width+width-1)*4,(y*width+width)*4));
  for(let x=0;x<width;x++)assert.deepEqual(data.subarray(x*4,x*4+4),data.subarray(((height-1)*width+x)*4,((height-1)*width+x+1)*4));
  for(let y=16;y<height-16;y++)assert.deepEqual(data.subarray((y*width+16)*4,(y*width+width-16)*4),before.subarray((y*width+16)*4,(y*width+width-16)*4));
  for(let i=3;i<data.length;i+=4)assert.equal(data[i],before[i]);
 }
});

test('shore distance covers every bank direction and road causeways in world coordinates',()=>{
 const scene={water:[[[0,0],[300,0],[300,300],[0,300]]]};
 for(const [x,y]of [[7,150],[293,150],[150,7],[150,293],[-7,150],[150,307]])assert.equal(shoreDistance(scene,x,y),7);
 assert.equal(shoreDistance(scene,150,150),150);
 assert.equal(shoreDistance(scene,150,150,41),6,'lava next to a causeway gets its own bank');
 assert.equal(shoreDistance({water:[]},100,100),Infinity);
});

test('lava grades from a dark basalt rim through cooled crust to open lava',()=>{
 const rim=lavaShoreMix(0,700,500,true),crust=lavaShoreMix(27,700,500,true),open=lavaShoreMix(60,700,500,true);
 assert.ok(rim.basalt>.85&&rim.crust>.95);
 assert.ok(crust.crust>0&&crust.basalt===0);
 assert.deepEqual(open,{crust:0,basalt:0,shade:0});
 assert.ok(lavaShoreMix(0,700,500,false).basalt>.65,'ground also has a scorched edge');
 assert.deepEqual(lavaShoreMix(60,700,500,false),{crust:0,basalt:0,shade:0});
});
