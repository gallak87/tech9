import {reviewURL} from './review-output.mjs';
// Static image import inspection only: no server, game entry, world, save or UI.
import fs from 'node:fs/promises';
import {chromium} from 'playwright';
import {ASSET_MANIFEST} from '../src/assets.js';

const root=new URL('../',import.meta.url),out=reviewURL('town-centers/');
const source=await fs.readFile(new URL('src/assets.js',root),'utf8');
const keySource=source.slice(source.indexOf('function keyNeutralExterior('),source.indexOf('\nexport async function loadPixelAtlas'));
const entries=ASSET_MANIFEST.filter(a=>a.kind==='townCenter');
const inputs=await Promise.all(entries.map(async entry=>({entry,data:'data:image/png;base64,'+(await fs.readFile(new URL('public/'+entry.url,root))).toString('base64')})));
const browser=await chromium.launch({headless:true,channel:'chrome'});
try{
  const page=await browser.newPage();
  await page.route('**/*',r=>r.abort());
  const results=await page.evaluate(async({inputs,keySource})=>{
    const key=Function(keySource+';return keyNeutralExterior;')();
    const results=[];
    for(const {entry,data} of inputs){
      const image=new Image();image.src=data;await image.decode();
      const canvas=document.createElement('canvas');canvas.width=image.width;canvas.height=image.height;
      const c=canvas.getContext('2d',{willReadFrequently:true});c.drawImage(image,0,0);
      if(entry.key==='neutral-exterior')key(c,canvas.width,canvas.height,entry);
      const {width,height}=canvas,pixels=c.getImageData(0,0,width,height).data;
      const seen=new Uint8Array(width*height),queue=new Int32Array(width*height),components=[];
      for(let i=0;i<seen.length;i++){
        if(seen[i]||pixels[i*4+3]<80)continue;
        let head=0,tail=1,left=width,top=height,right=0,bottom=0;queue[0]=i;seen[i]=1;
        while(head<tail){
          const p=queue[head++],x=p%width,y=Math.floor(p/width);
          left=Math.min(left,x);right=Math.max(right,x);top=Math.min(top,y);bottom=Math.max(bottom,y);
          for(const n of [x?p-1:-1,x<width-1?p+1:-1,y?p-width:-1,y<height-1?p+width:-1])if(n>=0&&!seen[n]&&pixels[n*4+3]>=80){seen[n]=1;queue[tail++]=n;}
        }
        if(tail>40)components.push({x:left,y:top,w:right-left+1,h:bottom-top+1,pixels:tail});
      }
      const crops=[];
      for(const [index,frame] of (entry.metadata?.frames||[]).entries()){
        const crop=document.createElement('canvas');crop.width=frame.w;crop.height=frame.h;
        const cc=crop.getContext('2d');cc.drawImage(canvas,frame.x,frame.y,frame.w,frame.h,0,0,frame.w,frame.h);
        for(const rect of frame.clearRects||[])cc.clearRect(...rect);
        crops.push({level:index+1,frame,data:crop.toDataURL('image/png')});
      }
      const alpha=canvas.toDataURL('image/png');
      c.globalCompositeOperation='destination-over';c.fillStyle='#1c302b';c.fillRect(0,0,width,height);
      results.push({id:entry.id,width,height,components:components.sort((a,b)=>b.pixels-a.pixels),crops,alpha,review:canvas.toDataURL('image/png')});
    }
    return results;
  },{inputs,keySource});
  await fs.mkdir(out,{recursive:true});
  for(const {id,alpha,review,crops,...result} of results){
    await fs.writeFile(new URL(id+'-extracted.png',out),Buffer.from(alpha.split(',')[1],'base64'));
    await fs.writeFile(new URL(id+'-alpha-review.png',out),Buffer.from(review.split(',')[1],'base64'));
    for(const crop of crops)await fs.writeFile(new URL(id+'-level-'+crop.level+'.png',out),Buffer.from(crop.data.split(',')[1],'base64'));
    console.log(JSON.stringify({id,...result}));
  }
}finally{await browser.close();}
