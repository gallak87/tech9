import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { ASSET_MANIFEST } from '../src/assets.js';
import { ENEMIES, HEROES } from '../src/content.js';
const publicRoot = new URL('../public/',import.meta.url);

test('every enemy, hero and biome has required production art; all crew members have directional gait sheets',()=>{
  const ids=ASSET_MANIFEST.map(a=>a.id);
  assert.equal(new Set(ids).size,ids.length,'Manifest IDs must be unique');
  for(const id of Object.keys(ENEMIES))assert.ok(ASSET_MANIFEST.some(a=>a.id===id&&a.kind==='enemy'&&a.required),'Missing enemy art: '+id);
  for(const id of Object.keys(HEROES)){
    assert.ok(ASSET_MANIFEST.some(a=>(a.id===id&&a.kind==='hero')||(id==='kaida'&&a.kind==='kaida')),'Missing hero art: '+id);
    assert.ok(ASSET_MANIFEST.some(a=>(a.heroId===id&&a.kind==='heroWalk')||(id==='kaida'&&a.kind==='kaidaWalk')),'Missing directional walk art: '+id);
  }
  for(const biome of ['coast','desert','forest','mire','volcanic','snow','ice','alien']){
    for(const kind of ['environment','ground'])assert.ok(ASSET_MANIFEST.some(a=>a.biome===biome&&a.kind===kind&&a.required),'Missing '+biome+' '+kind+' atlas');
  }
});

test('required source dimensions and measured frames agree with the immutable PNG files',()=>{
  for(const entry of ASSET_MANIFEST){
    const png=fs.readFileSync(new URL(entry.url,publicRoot));
    assert.equal(png.subarray(1,4).toString(),'PNG',entry.id);
    const width=png.readUInt32BE(16),height=png.readUInt32BE(20),m=entry.metadata;
    if(m?.sourceWidth)assert.equal(width,m.sourceWidth,entry.id);
    if(m?.sourceHeight)assert.equal(height,m.sourceHeight,entry.id);
    if(m?.frames){
      // Static structures, four-stage town centers, and animated atlases have
      // different minimum frame counts. Every crop is checked below.
      assert.ok(m.frames.length>=(['roadSign','structure'].includes(entry.kind)?1:['townCenter','environmentDetail'].includes(entry.kind)?4:6),entry.id);
      for(const f of m.frames){
        assert.ok([f.x,f.y,f.w,f.h,f.anchorX,f.anchorY].every(Number.isFinite),entry.id);
        assert.ok(f.x>=0&&f.y>=0&&f.w>0&&f.h>0&&f.x+f.w<=width&&f.y+f.h<=height,entry.id);
        for(const r of f.clearRects||[])assert.ok(r[0]>=0&&r[1]>=0&&r[2]>0&&r[3]>0&&r[0]+r[2]<=f.w&&r[1]+r[3]<=f.h,entry.id+' exclusion');
      }
      for(const n of Object.values(m.poseIndex||{}))assert.ok(Number.isInteger(n)&&n>=0&&n<m.frames.length,entry.id);
    }else assert.ok(Math.abs(width/entry.columns-height/entry.rows)<.01,entry.id+' grid');
    for(const [x,y] of entry.backgroundSeeds||[])assert.ok(x>=0&&y>=0&&x<width&&y<height,entry.id+' background seed');
  }
});

test('each town imports its own complete four-tier exterior family',()=>{
  const towns=ASSET_MANIFEST.filter(a=>a.kind==='townCenter');
  assert.deepEqual(towns.map(a=>a.region),['haventide','emberline','orbital_reach','last_crown']);
  assert.equal(new Set(towns.map(a=>a.url)).size,4);
  for(const town of towns){
    assert.ok(town.required);
    assert.equal(town.metadata.frames.length,4);
    for(const f of town.metadata.frames){
      assert.ok(f.anchorX>0&&f.anchorX<f.w&&f.anchorY>0&&f.anchorY<f.h);
      assert.ok(f.nativeWidth>0);
    }
  }
});
