import test from 'node:test';
import assert from 'node:assert/strict';
import {ALL_SCENES} from '../src/world.js';
import {VIEW_WIDTH as W,VIEW_HEIGHT as H} from '../src/rendering.js';
import {worldViewCamera,worldViewSurfaceSize,worldViewTiles} from '../src/dev-world-view-camera.js';

test('world view begins at the untouched camera and fits every map beneath its controls',()=>{
  const start={x:1700,y:980};
  for(const scene of Object.values(ALL_SCENES)){
    const before=JSON.stringify({scene,start});
    assert.deepEqual(worldViewCamera(scene,start,0),{...start,zoom:1});
    const end=worldViewCamera(scene,start,1),left=-end.x*end.zoom,top=-end.y*end.zoom;
    assert.ok(left>=24-1e-9,scene.id+' left');
    assert.ok(left+scene.width*end.zoom<=W-24+1e-9,scene.id+' right');
    assert.ok(top>=54-1e-9,scene.id+' top');
    assert.ok(top+scene.height*end.zoom<=H-28+1e-9,scene.id+' bottom');
    let previous=1;
    for(let t=0;t<=1;t+=.05){const c=worldViewCamera(scene,start,t);assert.ok(c.zoom<=previous);previous=c.zoom;}
    assert.equal(JSON.stringify({scene,start}),before);
  }
});

test('native viewport tiles cover the entire scene exactly, including partial edge tiles',()=>{
  for(const scene of Object.values(ALL_SCENES)){
    const tiles=[...worldViewTiles(scene)];
    assert.equal(tiles.reduce((area,t)=>area+t.width*t.height,0),scene.width*scene.height,scene.id);
    for(const t of tiles){
      assert.ok(t.x+t.width<=scene.width&&t.y+t.height<=scene.height);
      assert.ok(t.width>0&&t.width<=W&&t.height>0&&t.height<=H);
      assert.equal(t.x%W,0);assert.equal(t.y%H,0);
    }
    assert.equal(new Set(tiles.map(t=>`${t.x},${t.y}`)).size,tiles.length);
  }
});

test('temporary map surface stays within a fixed pixel budget without enlarging art',()=>{
  for(const scene of [...Object.values(ALL_SCENES),{width:100_000,height:50_000}]){
    const size=worldViewSurfaceSize(scene);
    assert.ok(size.width*size.height<=16_777_216);
    assert.ok(size.width<=scene.width&&size.height<=scene.height);
    assert.ok(Math.abs(size.width/size.height-scene.width/scene.height)<.01);
  }
});
