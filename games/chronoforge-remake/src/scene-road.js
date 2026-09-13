// Authored battle scenery, rendered once at the game's native pixel resolution.
// The clearing is one ground plane from y=155 onward: all formation lanes and
// attack paths belong to the same space. The foreground stays below the actors.
let panorama;
const W=960,H=600;
const clamp=(n,a=0,b=1)=>Math.max(a,Math.min(b,n));
const lerp=(a,b,t)=>a+(b-a)*t;
const rgb=h=>[1,3,5].map(i=>parseInt(h.slice(i,i+2),16));
const blend=(a,b,t)=>a.map((v,i)=>Math.round(lerp(v,b[i],clamp(t))));
const hex=a=>'#'+a.map(v=>Math.round(clamp(v,0,255)).toString(16).padStart(2,'0')).join('');
const random=seed=>()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
function hash(x,y,s=0){let n=Math.imul(x,374761393)+Math.imul(y,668265263)+s*1274126177;n=Math.imul(n^(n>>>13),1274126177);return ((n^(n>>>16))>>>0)/4294967295;}
function field(x,y,s=0){const ix=Math.floor(x),iy=Math.floor(y),fx=x-ix,fy=y-iy,u=fx*fx*(3-2*fx),v=fy*fy*(3-2*fy);return lerp(lerp(hash(ix,iy,s),hash(ix+1,iy,s),u),lerp(hash(ix,iy+1,s),hash(ix+1,iy+1,s),u),v);}
function pixel(c,col,x,y,w=1,h=1){c.fillStyle=col;c.fillRect(Math.round(x),Math.round(y),Math.max(1,Math.round(w)),Math.max(1,Math.round(h)));}
// Integer scan conversion avoids the softened fringes of antialiased polygons.
function shape(c,col,p){
  c.fillStyle=col;
  const lo=Math.max(0,Math.floor(Math.min(...p.map(v=>v[1])))),hi=Math.min(H,Math.ceil(Math.max(...p.map(v=>v[1]))));
  for(let y=lo;y<hi;y++){
    const cut=[];
    for(let i=0,j=p.length-1;i<p.length;j=i++){
      const a=p[j],b=p[i];if((a[1]<=y+.5&&b[1]>y+.5)||(b[1]<=y+.5&&a[1]>y+.5))cut.push(a[0]+(y+.5-a[1])*(b[0]-a[0])/(b[1]-a[1]));
    }
    cut.sort((a,b)=>a-b);for(let i=0;i<cut.length-1;i+=2)c.fillRect(Math.ceil(cut[i]),y,Math.max(1,Math.floor(cut[i+1])-Math.ceil(cut[i])+1),1);
  }
}
function stroke(c,col,points,width=1){
  c.fillStyle=col;
  for(let i=1;i<points.length;i++){
    const a=points[i-1],b=points[i],steps=Math.ceil(Math.max(Math.abs(b[0]-a[0]),Math.abs(b[1]-a[1])));
    for(let k=0;k<=steps;k++){const t=steps?k/steps:0;c.fillRect(Math.round(lerp(a[0],b[0],t)-width/2),Math.round(lerp(a[1],b[1],t)-width/2),Math.max(1,Math.round(width)),Math.max(1,Math.round(width)));}
  }
}
function roadAt(y){const d=Math.max(0,y-124);return {center:790-d*1.88+Math.sin(d*.012)*32,width:24+d*1.56};}

function paintEarth(c){
  const im=c.createImageData(W,H),d=im.data;
  const sky=rgb('#718780'),skyDeep=rgb('#3e6464'),soil=rgb('#666552'),earth=rgb('#8a795e'),moss=rgb('#4a5b45'),shade=rgb('#253e3b'),sun=rgb('#c8b180');
  for(let y=0;y<H;y++)for(let x=0;x<W;x++){
    const large=field(x/105,y/58,5),fine=field(x/19,y/8,18),grain=(hash(x,y,41)-.5),depth=clamp((y-126)/325);
    const opening=Math.exp(-Math.pow((x-420)/240,2));
    let color=blend(skyDeep,sky,opening*.65+large*.16);
    const edge=145+Math.sin(x*.012)*10+(field(x/90,0,73)-.5)*18;
    if(y>edge-20){
      const road=roadAt(y),dist=Math.abs(x-road.center),inside=clamp((road.width-dist+(fine-.5)*25+15)/45);
      let ground=blend(moss,soil,depth*.64+large*.32);
      ground=blend(ground,earth,inside*(.57+depth*.24));
      // Broad filtered light and canopy shadow, with fine grain subordinate to form.
      const dapples=clamp((field(x/81,y/33,32)-.44)*1.7)*(.17+depth*.15);
      ground=blend(ground,sun,dapples*(.36+inside*.5));
      const cast=clamp(1-Math.abs((x+y*1.2)%205-109)/34)*clamp((230-y)/100)*.13;
      ground=blend(ground,shade,cast);
      color=blend(color,ground,clamp((y-edge+20)/30));
      const texture=grain*(2+depth*5)+(fine-.5)*(3+depth*8);
      color=color.map(v=>clamp(v+texture,0,255));
    }else color=color.map(v=>v+grain*1.6);
    const i=(y*W+x)*4;d[i]=color[0];d[i+1]=color[1];d[i+2]=color[2];d[i+3]=255;
  }
  c.putImageData(im,0,0);
}

// Tapered, crooked limbs have a shaded side, reflected cool light and an uneven
// sunward ridge. Branches are geometry; bark marks follow their growth direction.
function limb(c,points,width,p,rnd){
  for(let i=1;i<points.length;i++){
    const a=points[i-1],b=points[i],w0=width*(1-(i-1)/(points.length+1)),w1=width*(1-i/(points.length+1)),dx=b[0]-a[0],dy=b[1]-a[1],len=Math.hypot(dx,dy)||1,nx=-dy/len,ny=dx/len;
    const section=(l,r)=>[[a[0]+nx*w0*l,a[1]+ny*w0*l],[b[0]+nx*w1*l,b[1]+ny*w1*l],[b[0]+nx*w1*r,b[1]+ny*w1*r],[a[0]+nx*w0*r,a[1]+ny*w0*r]];
    shape(c,p[0],section(-.55,.55));shape(c,p[1],section(-.41,.35));shape(c,p[2],section(-.4,-.11));
    if(width>8)shape(c,p[3],section(-.35,-.28));
    for(let n=0;n<len*.8;n++){
      const t=rnd(),side=(rnd()-.5)*.65,xx=lerp(a[0],b[0],t)+nx*lerp(w0,w1,t)*side,yy=lerp(a[1],b[1],t)+ny*lerp(w0,w1,t)*side;
      const length=2+rnd()*Math.min(12,width*.5);
      stroke(c,rnd()<.6?p[0]:p[3],[[xx,yy],[xx+dx/len*length,yy+dy/len*length]],1);
    }
  }
}

function crown(c,x,y,rx,ry,p,seed,detail=1){
  const rnd=random(seed),outline=[];
  // Unequal lobes and little gaps yield a branching canopy, not a row of balls.
  for(let i=0;i<34;i++){
    const a=i/34*Math.PI*2,r=.83+rnd()*.2+Math.sin(a*5+.7)*.1;
    outline.push([x+Math.cos(a)*rx*r,y+Math.sin(a)*ry*r]);
  }
  shape(c,p[0],outline);
  shape(c,p[1],outline.map(([xx,yy])=>[x+(xx-x)*.91-2,y+(yy-y)*.79-ry*.12]));
  const count=Math.round(rx*ry*.22*detail);
  for(let i=0;i<count;i++){
    const xx=(rnd()*2-1)*rx,yy=(rnd()*2-1)*ry;
    if((xx*xx/(rx*rx)+yy*yy/(ry*ry))>.75+rnd()*.15)continue;
    const top=(-yy/ry-xx/rx*.2),pick=rnd()+top*.35,col=pick>.9?p[4]:pick>.53?p[3]:pick>.17?p[2]:p[0],size=1+rnd()*2.2;
    pixel(c,col,x+xx,y+yy,size*1.6,size*.7);
    if(rnd()<.6)pixel(c,col,x+xx+1,y+yy-1,size,1);
    if(rnd()<.14)pixel(c,p[0],x+xx+2,y+yy+2,2,2);
  }
  // Sparse hanging leaves break the lower edge into readable little sprays.
  for(let i=0;i<rx*.32;i++){
    const xx=(rnd()*2-1)*rx*.88,yy=ry*Math.sqrt(1-xx*xx/(rx*rx))*.78;
    pixel(c,p[1],x+xx,y+yy,2,3);pixel(c,p[2],x+xx-1,y+yy+3,3,1);
  }
}

function fern(c,x,y,size,p,seed){
  const rnd=random(seed);
  for(let frond=0;frond<7;frond++){
    const angle=-Math.PI+.2+frond/6*(Math.PI-.4),len=size*(.7+rnd()*.38),end=[x+Math.cos(angle)*len,y+Math.sin(angle)*len*.74];
    stroke(c,p[0],[[x,y],[lerp(x,end[0],.6),lerp(y,end[1],.72)],[end[0],end[1]]],1);
    for(let n=1;n<7;n++){
      const t=n/7,xx=lerp(x,end[0],t),yy=lerp(y,end[1],t),leaf=(1-t)*size*.18;
      stroke(c,p[n%2+1],[[xx-leaf,yy-2],[xx,yy],[xx+leaf*.75,yy-3]],1);
      if(size>20)pixel(c,p[3],xx-leaf,yy-2,2,1);
    }
  }
}

function stone(c,x,y,w,h,seed,mossy=true){
  const rnd=random(seed),col=['#383e3b','#555b4e','#747566','#94917a','#b1a489'];
  const points=[[x-w*.48,y-h*.16],[x-w*.42,y-h*.77],[x-w*.2,y-h],[x+w*.25,y-h*.91],[x+w*.47,y-h*.49],[x+w*.5,y-h*.1],[x+w*.23,y+1],[x-w*.24,y+2]];
  shape(c,col[0],points);
  shape(c,col[1],points.map(([xx,yy])=>[x+(xx-x)*.94,y+(yy-y)*.94-1]));
  shape(c,col[2],[[x-w*.41,y-h*.71],[x-w*.18,y-h*.94],[x+w*.23,y-h*.84],[x+w*.42,y-h*.47],[x+w*.08,y-h*.3],[x-w*.37,y-h*.31]]);
  shape(c,col[3],[[x-w*.4,y-h*.72],[x-w*.18,y-h*.94],[x+w*.24,y-h*.84],[x+w*.07,y-h*.63],[x-w*.19,y-h*.58]]);
  for(let i=0;i<w*h*.065;i++){
    const xx=(rnd()-.5)*w*.77,yy=-h*(.2+rnd()*.6),bright=yy<-h*.63;
    pixel(c,bright?(rnd()<.7?col[3]:col[4]):(rnd()<.6?col[1]:col[2]),x+xx,y+yy,1+rnd()*3,1);
  }
  stroke(c,col[0],[[x-w*.07,y-h*.91],[x-w*.14,y-h*.66],[x+w*.03,y-h*.51],[x-w*.04,y-h*.26]],1);
  if(mossy){
    for(let i=0;i<w*.45;i++){
      const xx=x+(rnd()-.5)*w*.7,yy=y-h*(.81+rnd()*.14);
      pixel(c,rnd()<.45?'#7f8650':'#536445',xx,yy,2+rnd()*4,1+rnd()*2);
      if(rnd()<.25)pixel(c,'#a5a166',xx,yy-1,2,1);
    }
  }
}

function oldWall(c,side){
  const rnd=random(side<0?983:2384),start=side<0?-22:802;
  // The two surviving parapets belong to an older road, mostly reclaimed by roots.
  for(let row=0;row<3;row++)for(let k=0;k<6;k++){
    const x=start+k*28+(row%2)*12,y=202-row*13+(side<0?k*.8:-k*1.9),w=25+rnd()*12,h=15+rnd()*6;
    if((side<0&&k>3&&row>0)||(side>0&&k<2&&row>0)||rnd()<.08)continue;
    stone(c,x,y,w,h,784+row*53+k*13+(side+1)*31,true);
  }
  for(let i=0;i<10;i++){
    const x=start+rnd()*165,y=206+rnd()*24;
    stone(c,x,y,8+rnd()*13,4+rnd()*5,230+i+side*9,true);
    if(i%2===0)fern(c,x+6,y+2,12+rnd()*10,['#30483b','#4c6543','#7b8650','#a8a064'],983+i);
  }
}

function distantWoods(c){
  const rnd=random(35927);
  // The far trees become cooler, narrower and lower in contrast with distance.
  for(let i=0;i<48;i++){
    const x=i*22+rnd()*21-15,base=133+rnd()*29,h=135+rnd()*55,w=2+rnd()*5;
    const p=['#486664','#56736d','#638078','#789085'];
    limb(c,[[x,base],[x-4+rnd()*8,base-h*.4],[x+8-rnd()*16,base-h]],w,p,rnd);
    if(i%2===0)limb(c,[[x,base-h*.45],[x-8,base-h*.61],[x-25-rnd()*16,base-h*.7]],w*.55,p,rnd);
  }
  for(let i=0;i<24;i++){
    const x=i*47-12,y=47+(i%4)*15;
    crown(c,x,y,38+rnd()*19,26+rnd()*16,['#3d5c56','#45695b','#537461','#647d65','#7c8e71'],9873+i,.25);
  }
  // Low woodland floor forms a broken boundary with the clearing, never a stripe.
  for(let i=0;i<30;i++){
    const x=i*34-8,y=149+Math.sin(i*.6)*10;
    crown(c,x,y,21+rnd()*16,8+rnd()*8,['#39574a','#46634e','#587255','#718362','#8e9470'],5480+i,.45);
  }
  for(const tree of [{x:73,y:187,w:23,h:192},{x:285,y:164,w:11,h:180},{x:338,y:160,w:13,h:201},{x:535,y:163,w:15,h:205},{x:702,y:176,w:20,h:222},{x:829,y:184,w:25,h:218}]){
    const {x,y,w,h}=tree,p=['#2e4941','#3e5146','#69725a','#949274'];
    limb(c,[[x-w*.5,y],[x-4,y-27],[x+2,y-h*.48],[x-11,y-h]],w,p,rnd);
    limb(c,[[x-2,y-h*.34],[x-22,y-h*.51],[x-50,y-h*.68],[x-68,y-h*.76]],w*.52,p,rnd);
    limb(c,[[x,y-h*.52],[x+22,y-h*.65],[x+38,y-h*.82]],w*.41,p,rnd);
    stroke(c,'#354c3e',[[x,y-9],[x-w,y+2],[x-w-15,y+4]],3);
    stroke(c,'#71815a',[[x-w*.2,y-16],[x-w*.6,y],[x-w-10,y+1]],1);
  }
}

function canopyAndRoots(c){
  const rnd=random(58381),bark=['#202f2f','#3f4338','#68634b','#968768'];
  // Old oaks frame the view with asymmetric trunks and long sinuous limbs.
  limb(c,[[34,252],[49,227],[52,181],[33,136],[39,88],[18,34],[25,-28]],43,bark,rnd);
  limb(c,[[48,176],[26,135],[-8,112],[-31,65]],28,bark,rnd);
  limb(c,[[36,119],[74,81],[117,65],[175,22],[244,-2]],21,bark,rnd);
  limb(c,[[75,81],[84,40],[71,9],[85,-19]],13,bark,rnd);
  limb(c,[[136,53],[168,59],[208,43],[245,35]],9,bark,rnd);
  limb(c,[[937,265],[914,231],[919,176],[903,126],[916,61],[900,-26]],51,bark,rnd);
  limb(c,[[916,148],[873,104],[835,90],[796,48],[759,22]],25,bark,rnd);
  limb(c,[[872,104],[858,65],[874,35],[864,-13]],14,bark,rnd);
  limb(c,[[916,89],[950,58],[977,21]],22,bark,rnd);
  for(const [x,y,dir] of [[45,240,1],[42,231,-1],[47,229,1],[923,247,-1],[922,229,-1],[919,230,1]]){
    const end=x+dir*(35+rnd()*40),mid=lerp(x,end,.57);
    limb(c,[[x,y-24],[x+dir*7,y-4],[mid,y+4],[end,y+8+rnd()*8]],9,bark,rnd);
  }
  // Thin ivy threads climb the cool side, catching light where leaves turn.
  for(const [x,y,h] of [[39,215,153],[921,218,172]]){
    const points=[];for(let i=0;i<13;i++)points.push([x+Math.sin(i*.9)*7,y-i*h/12]);
    stroke(c,'#526340',points,1);
    for(let i=0;i<23;i++){const yy=y-i*h/23,xx=x+Math.sin(i*.52)*7;pixel(c,i%3?'#70804a':'#9b9b59',xx+(i%2?2:-4),yy,3,2);pixel(c,'#3d543b',xx-2,yy+2,2,2);}
  }
  const foliage=['#1c3835','#284b3d','#3d6045','#607951','#899568'];
  // Deliberately composed canopy breaks: the soft center opening admits daylight.
  const clumps=[[-18,6,103,56],[65,-10,94,58],[154,1,86,43],[231,-12,71,42],[318,-20,67,40],[-20,81,72,49],[55,56,52,31],[135,30,56,32],[211,17,49,22],[-17,129,47,29],[734,-20,77,48],[817,-8,86,57],[928,5,117,69],[986,85,83,58],[875,44,72,40],[782,28,52,25],[964,155,53,44]];
  clumps.forEach(([x,y,rx,ry],i)=>crown(c,x,y,rx,ry,foliage,5739+i*28,1.08));
  // Small detached leaf sprays make the arch feel branch-grown rather than cut out.
  for(const [x,y] of [[264,19],[283,7],[185,56],[227,45],[720,14],[748,48],[812,71],[79,107],[901,108]])crown(c,x,y,10+rnd()*10,6+rnd()*5,foliage,8390+x,.8);
}

function clearingDetail(c){
  const rnd=random(285914),earthColors=['#555947','#6c6a50','#82765a','#9d8865','#b6a079'];
  // Weathered remnants of the road, laid as isolated broken patches. No tile grid.
  const slabs=[[580,195,17,5],[617,199,22,7],[532,212,30,8],[660,230,32,9],[577,234,19,5],[469,267,36,9],[420,279,24,7],[701,302,37,10],[665,317,25,8],[295,348,41,10],[336,361,25,7],[410,388,40,12],[480,409,28,9],[147,412,32,10],[732,391,39,11],[541,283,19,6]];
  for(let i=0;i<slabs.length;i++){
    const [x,y,w,h]=slabs[i],p=[[x-w*.5,y],[x-w*.45,y-h],[x+w*.29,y-h-2],[x+w*.5,y-h*.4],[x+w*.4,y+1],[x-w*.22,y+2]];
    shape(c,'#656551',p);shape(c,'#918267',p.map(([xx,yy])=>[xx,yy-1]));
    stroke(c,'#aea081',[[x-w*.42,y-h],[x+w*.26,y-h-2]],1);
    stroke(c,'#6e6d53',[[x-w*.15,y-h],[x-w*.01,y-h*.55],[x-w*.13,y+1]],1);
    for(let n=0;n<6;n++)pixel(c,n%2?'#a18e6e':'#7c765a',x+(rnd()-.5)*w*.7,y-rnd()*h,1+rnd()*4,1);
  }
  for(let i=0;i<2150;i++){
    const x=rnd()*W,y=165+rnd()*325,depth=clamp((y-165)/300),road=roadAt(y),distance=Math.abs(x-road.center),grassy=distance>road.width-20;
    if(!grassy&&rnd()<.7)continue;
    const quiet=x>140&&x<740&&y<420;
    if(quiet&&rnd()<.5)continue;
    const w=1+rnd()*(1+depth*4);
    if(grassy&&rnd()<.64){
      const base=rnd()<.5?'#415a3f':'#596b46',light=rnd()<.5?'#829056':'#707e4f',h=2+rnd()*6*depth;
      stroke(c,base,[[x-2,y],[x,y-h],[x+1,y]],1);
      stroke(c,light,[[x,y],[x+2,y-h*.7]],1);
    }else if(rnd()<.28){
      pixel(c,'#65634c',x,y,w+2,2);pixel(c,earthColors[2+Math.floor(rnd()*3)],x,y-1,w,1);
    }else {
      const col=grassy?['#4b5d3f','#777b49','#939257','#a19457'][Math.floor(rnd()*4)]:earthColors[Math.floor(rnd()*4)];
      pixel(c,col,x,y,w,1);if(rnd()<.23)pixel(c,col,x+1,y-1,Math.max(1,w-1),1);
    }
  }
  for(const [x,y,size] of [[15,273,28],[84,246,23],[99,197,15],[778,201,14],[873,264,24],[943,315,38],[47,362,32],[837,375,27]])fern(c,x,y,size,['#253f34','#44613e','#6b804c','#929a60'],x*17+y);
  for(const [x,y,w,h] of [[9,316,50,23],[71,307,25,13],[949,350,65,32],[875,304,27,15],[98,247,18,9],[814,235,20,10]])stone(c,x,y,w,h,x+y);
  // Small field mushrooms and spent seed heads reward a closer look at the edges.
  for(const [x,y] of [[81,274],[87,278],[878,315],[884,318]]){
    pixel(c,'#c2b391',x,y-5,1,5);shape(c,'#986949',[[x-4,y-4],[x-2,y-7],[x+2,y-7],[x+4,y-4]]);pixel(c,'#d0a26a',x-2,y-7,3,1);
  }
}

function fallenTimber(c){
  const rnd=random(9014),p=['#273b32','#444936','#797452','#a69a69'];
  // A decaying trunk and forked roots sit in the extreme lower margin.
  limb(c,[[-30,447],[22,427],[65,426],[109,438]],17,p,rnd);
  limb(c,[[28,428],[50,412],[80,406]],7,p,rnd);
  for(let i=0;i<80;i++){
    const x=rnd()*111-12,y=425+Math.sin(x*.028)*6+(rnd()-.5)*8;
    pixel(c,i%3?'#506a42':'#809354',x,y,2+rnd()*4,1+rnd()*2);
  }
  for(const [x,y,s] of [[10,454,42],[56,460,32],[107,468,40],[842,459,32],[898,452,43],[949,454,49]])fern(c,x,y,s,['#193b30','#345a3c','#587b47','#879658'],x*43);
  for(const [x,y,rx,ry] of [[-10,478,87,25],[956,468,58,27]])crown(c,x,y,rx,ry,['#19392f','#274b33','#3c633b','#638047','#8c9558'],x+2004,.8);
}

function lightAndAir(c){
  // One lighting direction throughout, from the gap over the upper-left shoulder.
  c.save();
  c.globalAlpha=.035;
  shape(c,'#eee1b2',[[245,0],[276,0],[434,251],[361,240]]);
  shape(c,'#eee1b2',[[296,0],[307,0],[529,299],[491,299]]);
  shape(c,'#eee1b2',[[359,0],[375,0],[575,270],[524,266]]);
  c.restore();
  // A gentle edge falloff, baked once, keeps sprites readable without dimming them.
  const v=c.createRadialGradient(456,271,206,456,270,636);v.addColorStop(0,'#172c3100');v.addColorStop(.7,'#14282b0d');v.addColorStop(1,'#15272c73');c.fillStyle=v;c.fillRect(0,0,W,H);
}

function makePanorama(){
  const canvas=document.createElement('canvas');canvas.width=W;canvas.height=H;
  const c=canvas.getContext('2d');c.imageSmoothingEnabled=false;
  paintEarth(c);distantWoods(c);oldWall(c,-1);oldWall(c,1);clearingDetail(c);canopyAndRoots(c);fallenTimber(c);lightAndAir(c);
  return canvas;
}

/** Haventide's first battle: native-resolution woodland, cached after first draw. */
export function drawHaventideBattle(ctx,g){
  if(!panorama)panorama=makePanorama();
  ctx.save();ctx.imageSmoothingEnabled=false;ctx.drawImage(panorama,0,0);
  if(!g.s?.settings?.reducedMotion){
    const t=g.time||0;
    for(let i=0;i<8;i++){
      const x=312+i*47+Math.sin(t*.17+i*2.3)*13,y=92+(i*31+t*(1.8+i*.07))%204;
      ctx.globalAlpha=.1+Math.max(0,Math.sin(t*.7+i*2.7))*.19;
      pixel(ctx,'#e6d8a2',x,y,1,i%3?1:2);
    }
  }
  ctx.restore();
}
