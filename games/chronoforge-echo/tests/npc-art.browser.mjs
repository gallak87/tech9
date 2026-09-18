// Focused art-import fixture: all36 bodies and portraits, plus runtime alpha checks.
import {chromium} from 'playwright';
import fs from 'node:fs/promises';
const output=new URL('../evidence/npc-art/',import.meta.url);
const browser=await chromium.launch({headless:true,channel:'chrome'});
try{
 const page=await browser.newPage({viewport:{width:1920,height:1380}});
 await page.goto(process.env.ECHO_NPC_ART_URL||'http://127.0.0.1:4335/');
 await page.waitForFunction(()=>window.__ECHO_READY__);
 const report=await page.evaluate(async()=>{
  const art=await import('/src/art.js'),{NPC_ASSETS}=await import('/src/npc-art.js'),{loadPixelAtlas}=await import('/src/assets.js'),{NPC_IDENTITIES}=await import('/src/npc-identities.js'),{ALL_SCENES}=await import('/src/world.js'),{createState}=await import('/src/progression.js');
  const checked=[];
  for(const asset of NPC_ASSETS){
   const image=await loadPixelAtlas({...asset,url:asset.source});
   const pixels=image.getContext('2d').getImageData(0,0,image.width,image.height).data;
   let transparent=0;for(let i=3;i<pixels.length;i+=4)if(!pixels[i])transparent++;
   if(transparent/(image.width*image.height)<.5)throw Error(asset.id+' background was not removed');
   art.installNpcAtlas(image,asset.metadata);
   checked.push({id:asset.id,frames:asset.metadata.frames.length,transparentFraction:Math.round(transparent/(image.width*image.height)*1000)/1000});
  }
  document.body.innerHTML='';document.body.style.cssText='margin:0;background:#12251f;overflow:auto';
  const c=document.createElement('canvas');c.width=1920;c.height=1380;document.body.append(c);const ctx=c.getContext('2d');ctx.fillStyle='#12251f';ctx.fillRect(0,0,c.width,c.height);
  const ids=NPC_ASSETS.flatMap(a=>a.metadata.frames.map(f=>f.id)),state=createState();state.tier=4;
  const scene={...ALL_SCENES.haventide,id:'npc_cast',water:[],roads:[],objects:ids.map((id,i)=>({id,npcIdentity:id,type:'npc',x:60+i%8*116,y:94+Math.floor(i/8)*98}))};
  ctx.save();ctx.scale(2,2);art.drawWorld(ctx,scene,{x:0,y:0},0,state);ctx.restore();
  ctx.fillStyle='#12251f';ctx.fillRect(0,1010,1920,370);
  ids.forEach((id,i)=>{const col=i%12,row=Math.floor(i/12),x=8+col*160,y=1018+row*118;art.drawPortrait(ctx,id,x,y,82);ctx.fillStyle='#fff';ctx.font='12px sans-serif';ctx.fillText(NPC_IDENTITIES[id].name.split(' •')[0].split(',')[0].slice(0,22),x,y+97);});
  return {atlases:checked,people:ids.length};
 });
 await fs.mkdir(output,{recursive:true});
 await page.screenshot({path:new URL('cast.png',output).pathname,fullPage:true});
 await fs.writeFile(new URL('report.json',output),JSON.stringify(report,null,2)+'\n');
 console.log(JSON.stringify(report));
}finally{await browser.close();}
