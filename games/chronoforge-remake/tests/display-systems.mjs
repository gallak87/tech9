// Display sizing and transforms only. No browser, game simulation or playthrough.
import assert from 'node:assert/strict';
import {displaySize,createGameDisplay} from '../src/display.js';

assert.deepEqual(displaySize(960,600,1),{width:960,height:600});
assert.deepEqual(displaySize(1440,900,2),{width:2880,height:1800});
assert.deepEqual(displaySize(1440,900,4),{width:2880,height:1800});
assert.deepEqual(displaySize(320,200,2),{width:640,height:400});
assert.deepEqual(displaySize(0,NaN,NaN),{width:960,height:600});

let resized,disconnected=false,allocations=0,transform;
const ctx={imageSmoothingEnabled:true,setTransform(...args){transform=args;}};
let width=960,height=600;
const canvas={
  get width(){return width;},set width(n){width=n;allocations++;},
  get height(){return height;},set height(n){height=n;allocations++;},
  getContext(){return ctx;},getBoundingClientRect(){return {width:960,height:600};},
};
globalThis.window={devicePixelRatio:1};
globalThis.ResizeObserver=class {
  constructor(callback){resized=callback;}
  observe(target){assert.equal(target,canvas);}
  disconnect(){disconnected=true;}
};
const display=createGameDisplay(canvas);
assert.equal(display.beginFrame(),false);
assert.equal(allocations,0,'Unchanged canvas must not reallocate/clear its bitmap');
window.devicePixelRatio=2;
assert.equal(display.beginFrame(),true,'DPR changes without CSS resize must update');
assert.deepEqual(transform,[2,0,0,2,0,0]);
assert.equal(ctx.imageSmoothingEnabled,false,'Frame baseline keeps scenery pixelated');
resized([{contentRect:{width:1440,height:900}}]);
display.beginFrame();assert.deepEqual([canvas.width,canvas.height],[2880,1800]);
const count=allocations;display.beginFrame();assert.equal(allocations,count);
// Input coordinates are still logical: a screen-space point and the backing
// transform must agree at fractional CSS sizes as well as Retina integer scales.
resized([{contentRect:{width:853,height:533.125}}]);display.beginFrame();
const point={x:618,y:344};
assert(Math.abs(point.x*transform[0]/canvas.width*853-point.x/960*853)<1e-9);
assert(Math.abs(point.y*transform[3]/canvas.height*533.125-point.y/600*533.125)<1e-9);
ctx.imageSmoothingEnabled=true;transform=[9,0,0,9,100,100];
display.beginFrame();assert.equal(transform[4],0);assert.equal(transform[5],0);
assert.equal(ctx.imageSmoothingEnabled,false,'Frame start restores rendering defaults');
resized([{contentRect:{width:0,height:0}}]);display.beginFrame();
assert(canvas.width>1&&canvas.height>1,'Hidden layout does not destroy the backing');
display.dispose();assert(disconnected);
console.log('PASS: display density, allocation cap, resize/DPR changes and logical coordinates. No browser run.');
