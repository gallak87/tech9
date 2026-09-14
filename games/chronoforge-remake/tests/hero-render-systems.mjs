import assert from 'node:assert/strict';
import {loadArt,drawHero} from '../src/art.js';
import {HERO_IDLE_SHEETS} from '../src/hero-idle.js';

// Exercise production selection/loading with tiny synthetic pixels, without a
// browser, real image decoding, or a game simulation.
class FakeImage {
  async decode(){
    const file=this.src.split('/').at(-1);
    const layout=Object.values(HERO_IDLE_SHEETS).find(sheet=>sheet.file===file)?.layout;
    this.width=this.naturalWidth=(layout?.columns??6)*4;
    this.height=this.naturalHeight=(layout?.rows??8)*6;
    // Rune's measured row cuts refer to this existing atlas's native size.
    if(file==='rune.png'){this.width=this.naturalWidth=1086;this.height=this.naturalHeight=1448;}
  }
}
function canvas(){
  const c={width:0,height:0};
  const ctx={
    drawImage(source,...crop){c.origin=source.src??source.origin;c.sourceCrop=crop;},
    getImageData(x,y,w,h){
      const data=new Uint8ClampedArray(w*h*4).fill(255);
      data[3]=0; // Existing alpha preserves the synthetic opaque body.
      return {data};
    },
    putImageData(){},
  };
  c.getContext=()=>ctx;return c;
}
function render(id,state='idle',face='right',time=0,options){
  const draws=[],scales=[];
  const ctx={save(){},restore(){},translate(){},scale(...args){scales.push(args);},drawImage(...args){draws.push(args);}};
  drawHero(ctx,id,state,30,50,.75,face,time,options);
  assert.equal(draws.length,1,`${id}/${state}/${face} draws exactly one sprite.`);
  return {source:draws[0][0],args:draws[0].slice(1),scales};
}

const originals=new Map(['Image','document','fetch'].map(key=>[key,Object.getOwnPropertyDescriptor(globalThis,key)]));
try{
  globalThis.Image=FakeImage;
  globalThis.document={createElement(tag){assert.equal(tag,'canvas');return canvas();}};
  globalThis.fetch=async()=>({ok:true,json:async()=>({sheets:{},enemies:{},npcs:{},items:{},props:{}})});
  await loadArt();

  for(const [id,{file,layout}] of Object.entries(HERO_IDLE_SHEETS)){
    const legacyCell=id==='rune'?181:4,legacyHeight=id==='rune'?181:6;
    const rowCuts=id==='rune'?[0,195,375,549,723,904,1076,1248,1448]:Array.from({length:9},(_,row)=>row*6);
    const samples=layout.sequence.map((_,beat)=>render(id,'idle','right',beat*layout.beatDuration+.001));
    for(const sample of samples){
      assert(sample.source.origin.endsWith('/'+file),`${id} uses its approved idle without a scene opt-in.`);
      assert.equal(sample.source.__atlasSource,undefined,`${id} does not fall back to the legacy atlas.`);
    }
    assert.equal(new Set(samples.map(sample=>sample.source)).size,layout.frames,`${id} cycles every approved pose.`);
    const resting=render(id).source,later=layout.beatDuration+.001;
    assert.equal(render(id,'idle','left').source,resting);
    assert.deepEqual(render(id,'idle','left').scales,[[-1,1]],`${id} mirrors its approved idle when facing left.`);
    assert.deepEqual(render(id).scales,[]);
    for(const options of [{staticIdle:true},{reducedMotion:true}])
      assert.equal(render(id,'idle','right',later,options).source,resting,`${id} holds its resting pose when requested.`);
    assert.equal(render(id,'idle','right',0,{battleIdle:false}).source,resting,'Legacy scene flags cannot disable shared idle selection.');

    for(const [face,row] of [['up',6],['down',7]]){
      const first=render(id,'idle',face,0),laterView=render(id,'idle',face,9.75);
      assert.equal(laterView.source,first.source,`${id}/${face} keeps a held directional pose.`);
      assert.deepEqual(first.source.__atlasSource,{src:new URL(`../assets/${id}.png`,import.meta.url).href,x:0,y:rowCuts[row],padding:2});
    }

    for(const [state,face,row,fps] of [
      ['walk','right',1,8],['run','right',2,13],['attack','right',3,10],
      ['walk','up',6,8],['walk','down',7,8],['run','up',6,13],['run','down',7,13],
    ]){
      const time=.21,result=render(id,state,face,time),frame=Math.floor(time*fps)%6;
      assert.deepEqual(result.source.__atlasSource,{src:new URL(`../assets/${id}.png`,import.meta.url).href,x:frame*legacyCell,y:rowCuts[row],padding:2},`${id}/${state}/${face} retains its directional action atlas row and timing.`);
      if(id==='rune'){
        const cropHeight=rowCuts[row+1]-rowCuts[row];
        assert.equal(result.args[3],cropHeight,'Rune samples the full measured source row.');
        assert(Math.abs(result.args[7]-cropHeight/legacyHeight*82*.75)<1e-10,'Uneven crops keep a consistent scale per source pixel.');
      }
    }
    assert.deepEqual(render(id,'walk','left',.21).scales,[[-1,1]],`${id} still mirrors leftward movement.`);
    if(id==='rune'){
      assert.equal(render(id).args[3],82*.75,'Corrected legacy rows do not resize Rune’s approved idle.');
      assert.deepEqual(HERO_IDLE_SHEETS.rune.offsets,[[0,0],[26,0],[43,2]],'Preview and game share the unchanged boot registration.');
      const k=samples[0].args[3]/samples[0].source.height;
      assert.equal(samples[1].args[0]-samples[0].args[0],26*k);
      assert.equal(samples[2].args[0]-samples[0].args[0],43*k);
      assert.equal(samples[2].args[1]-samples[0].args[1],2*k);
    }
  }
}finally{
  for(const [key,descriptor] of originals){
    if(descriptor)Object.defineProperty(globalThis,key,descriptor);else delete globalThis[key];
  }
}

console.log('Hero render selection verified: all three shared idle sheets, mirroring, resting options, directional holds and movement/action rows. No browser used.');
