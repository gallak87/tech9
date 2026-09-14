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
      assert.deepEqual(first.source.__atlasSource,{src:new URL(`../assets/${id}.png`,import.meta.url).href,x:0,y:row*6,padding:2});
    }

    for(const [state,face,row,fps] of [
      ['walk','right',1,8],['run','right',2,13],['attack','right',3,10],
      ['walk','up',6,8],['walk','down',7,8],['run','up',6,13],['run','down',7,13],
    ]){
      const time=.21,result=render(id,state,face,time),frame=Math.floor(time*fps)%6;
      assert.deepEqual(result.source.__atlasSource,{src:new URL(`../assets/${id}.png`,import.meta.url).href,x:frame*4,y:row*6,padding:2},`${id}/${state}/${face} retains its directional action atlas row and timing.`);
    }
    assert.deepEqual(render(id,'walk','left',.21).scales,[[-1,1]],`${id} still mirrors leftward movement.`);
  }
}finally{
  for(const [key,descriptor] of originals){
    if(descriptor)Object.defineProperty(globalThis,key,descriptor);else delete globalThis[key];
  }
}

console.log('Hero render selection verified: all three shared idle sheets, mirroring, resting options, directional holds and movement/action rows. No browser used.');
