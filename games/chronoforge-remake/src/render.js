import {REGIONS,TOWNS,INTERIORS,OBJECTS,SCENERY,TERRAIN_FEATURES,WORLD_W,WORLD_H,regionAt,getObjects,walkable} from './world.js';
import {drawHero,drawEnemy,drawNPC,drawProp} from './art.js';
import {drawHaventideGround,drawHaventideBuilding,drawHaventideScenery} from './scene-haventide.js';
import {drawHaventideSmithy,drawSmithyAtmosphere} from './scene-smithy.js';
import {drawHaventideBattle} from './scene-road.js';

const groundCache=new Map(),roomCache=new Map(),propCache=new Map();
const ink='#252633',paper='#f5e0b3';
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
function box(c,color,x,y,w,h){c.fillStyle=color;c.fillRect(Math.round(x),Math.round(y),Math.round(w),Math.round(h));}
function line(c,color,x1,y1,x2,y2,width=2){c.strokeStyle=color;c.lineWidth=width;c.beginPath();c.moveTo(Math.round(x1),Math.round(y1));c.lineTo(Math.round(x2),Math.round(y2));c.stroke();}
function poly(c,color,p){c.fillStyle=color;c.beginPath();p.forEach(([x,y],i)=>i?c.lineTo(x,y):c.moveTo(x,y));c.closePath();c.fill();}
function oval(c,color,x,y,rx,ry){c.fillStyle=color;c.beginPath();c.ellipse(x,y,rx,ry,0,0,Math.PI*2);c.fill();}
function text(c,str,x,y,size=12,color=paper,align='center'){c.font=`${size>=20?'bold ':''}${size}px ${size>=20?'Georgia':'"Trebuchet MS",sans-serif'}`;c.textAlign=align;c.textBaseline='middle';c.fillStyle='#242330b8';c.fillText(str,x+1,y+2);c.fillStyle=color;c.fillText(str,x,y);}
function makeCanvas(w,h){const el=document.createElement('canvas');el.width=w;el.height=h;return el;}
function noise(seed){return()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};}
function mix(a,b,t){const n=h=>parseInt(h.slice(1),16),aa=n(a),bb=n(b);return '#'+[16,8,0].map(sh=>Math.round(((aa>>sh)&255)*(1-t)+((bb>>sh)&255)*t).toString(16).padStart(2,'0')).join('');}
function pathShape(c,points){c.beginPath();points.forEach(([x,y],i)=>i?c.lineTo(x,y):c.moveTo(x,y));c.closePath();}
function steppedEllipse(c,col,x,y,rx,ry){for(let n=-ry;n<ry;n+=4){const w=Math.sqrt(Math.max(0,1-n*n/(ry*ry)))*rx;box(c,col,x-w,y+n,w*2,4);}}

function ground(r){
  if(groundCache.has(r.id))return groundCache.get(r.id);
  const canvas=makeCanvas(800,640),c=canvas.getContext('2d'),p=r.palette,rnd=noise(r.x+r.y*7+871);
  c.imageSmoothingEnabled=false;box(c,p.ground,0,0,800,640);
  // Broad terraces give each landscape readable masses before fine detail.
  for(let i=0;i<16;i++){
    const x=Math.floor(rnd()*390)*2,y=Math.floor(rnd()*310)*2,w=50+Math.floor(rnd()*85)*2,h=20+Math.floor(rnd()*45)*2;
    c.globalAlpha=.21;poly(c,i%2?p.light:p.dark,[[x,y],[x+w-18,y],[x+w-18,y+10],[x+w,y+10],[x+w,y+h-12],[x+w-30,y+h-12],[x+w-30,y+h],[x+14,y+h],[x+14,y+h-10],[x,y+h-10]]);
  }
  c.globalAlpha=1;
  for(let y=10;y<640;y+=22)for(let x=8;x<800;x+=28){
    if(rnd()<.36)continue;const dx=x+Math.floor(rnd()*14),dy=y+Math.floor(rnd()*12);
    if(['crater','emberline','orbital'].includes(r.id)){box(c,rnd()<.5?p.dark:p.light,dx,dy,4+Math.floor(rnd()*6),2);if(rnd()<.2)box(c,p.light,dx+3,dy-2,2,2);}
    else {box(c,p.light,dx,dy,2,3);box(c,p.dark,dx-2,dy+3,6,2);if(rnd()<.3)box(c,r.id==='frost'?'#e0e9d9':r.id==='crown'?'#c593b4':'#b4b784',dx+7,dy+4,2,2);}
  }
  // Pixel terraces blend neighboring soil palettes along shared edges.
  for(const [side,n] of [['left',regionAt(r.x-1,r.y+320)],['right',regionAt(r.x+800,r.y+320)],['top',regionAt(r.x+400,r.y-1)],['bottom',regionAt(r.x+400,r.y+640)]])if(n){
    const vertical=side==='left'||side==='right',length=vertical?640:800;
    for(let k=0;k<length;k+=24){const reach=24+(Math.floor(k/24)%3)*8;for(let band=0;band<reach;band+=8){const col=mix(p.ground,n.palette.ground,.48*(1-band/reach));const pos=side==='left'?band:side==='right'?792-band:side==='top'?band:632-band;box(c,col,vertical?pos:k,vertical?k:pos,vertical?8:24,vertical?24:8);}}
  }
  // A true continuous crossroad, with broad shoulders at every region seam.
  box(c,p.dark,0,272,800,96);box(c,p.dark,351,0,98,640);
  box(c,p.road,0,281,800,78);box(c,p.road,360,0,80,640);
  box(c,p.light,0,281,800,4);box(c,p.light,360,0,4,640);
  box(c,'#24253325',0,355,800,4);box(c,'#24253325',436,0,4,640);
  for(let x=0;x<800;x+=26){box(c,p.stone,x,271,20,6);box(c,p.stone,x,364,20,5);}
  for(let y=0;y<640;y+=26){box(c,p.stone,350,y,6,20);box(c,p.stone,443,y,5,20);}
  for(let x=4;x<800;x+=40)for(let row=0;row<3;row++){const y=289+row*23;box(c,'#ffffff12',x+(row%2)*16,y,28,2);box(c,'#362e3420',x+(row%2)*16,y+17,24,2);}
  for(let y=0;y<640;y+=34){box(c,'#ffffff12',368,y,56,2);box(c,'#342d3220',397,y+4,2,26);}
  for(const f of TERRAIN_FEATURES.filter(f=>f.region===r.id)){
    c.save();pathShape(c,f.points);c.strokeStyle=p.dark;c.lineWidth=17;c.stroke();c.strokeStyle=p.stone;c.lineWidth=7;c.stroke();
    c.fillStyle=f.type==='crag'?p.dark:p.water;c.fill();c.clip();
    if(f.type==='crag'){
      for(let i=0;i<12;i++){const y=i*18;box(c,i%2?p.stone:p.dark,0,y,800,10);line(c,p.light,10,y+3,780,y+3,2);}
    }else {
      for(let i=0;i<80;i++){const x=Math.floor(rnd()*400)*2,y=Math.floor(rnd()*320)*2;box(c,f.type==='lava'?(i%2?'#fca35d':'#ffc57d'):(i%3===0?p.accent:p.light),x,y,10+Math.floor(rnd()*24),2);}
      for(let y=8;y<640;y+=16)box(c,'#1a28331a',0,y,800,4);
    }
    c.restore();
  }
  if(r.town){
    box(c,p.dark,53,239,694,146);box(c,p.stone,60,245,680,132);
    for(let y=249;y<377;y+=18)for(let x=64;x<738;x+=30){box(c,(x+y)%3===0?'#ffffff10':'#17172717',x+(y%36?0:14),y,25,14);}
    box(c,p.road,0,295,800,54);box(c,p.road,374,245,52,395);
    // Brass compass rose set into each city square.
    oval(c,p.dark,400,320,41,29);oval(c,p.road,400,318,35,25);
    poly(c,p.accent,[[400,289],[407,311],[434,318],[407,325],[400,347],[393,325],[366,318],[393,311]]);
    poly(c,p.dark,[[400,298],[403,315],[423,318],[403,321],[400,338],[397,321],[380,318],[397,315]]);
    for(const x of [190,610]){box(c,p.dark,x-30,374,60,12);box(c,p.stone,x-29,370,58,9);for(let i=0;i<9;i++){box(c,p.leaf,x-25+i*6,360+(i%3)*2,5,12);box(c,i%2?p.accent:'#dda09a',x-24+i*6,358+(i%3)*2,3,3);}}
    if(r.id==='haventide'){
      box(c,'#8b8660',64,415,672,208);box(c,p.road,75,454,652,27);box(c,p.road,75,568,652,25);box(c,p.road,383,386,34,248);
      for(let x=70;x<735;x+=24){box(c,'#514d39',x,619,4,15);box(c,'#bbaa7a',x,617,4,13);}
      box(c,'#bbaa7a',70,622,663,4);box(c,'#6c7150',365,617,70,18);box(c,p.road,383,617,34,23);
      // Jetty, moored skiff and the repaired evacuation bell.
      for(let y=85;y<217;y+=12){box(c,'#57473b',20,y,46,10);box(c,'#a0875d',23,y,40,3);}
      for(const y of [85,143,208]){box(c,'#302f33',17,y,7,17);box(c,'#b2a47b',17,y-2,7,5);}
      poly(c,'#252c3b',[[72,94],[93,84],[113,92],[113,155],[94,175],[73,155]]);poly(c,'#ad785c',[[78,99],[94,89],[107,99],[107,151],[94,167],[79,150]]);box(c,'#e1c39c',84,110,18,4);box(c,'#e1c39c',84,138,18,4);box(c,'#594453',93,96,3,61);
    }
    if(r.id==='orbital')drawElevator(c,660,110,p);
    if(r.id==='crown'){for(const x of [92,206,570,708])drawDistantSpire(c,x,150,p);}
    if(r.id==='emberline'){for(const x of [94,208,582,706]){box(c,'#614b4b',x,123,4,48);poly(c,p.accent,[[x+2,125],[x+52,132],[x+2,147]]);}}
  }else {
    // Landmark platforms and branch trails make optional discoveries legible.
    for(const o of OBJECTS.filter(o=>o.region===r.id&&['anchor','npc','chest','sign'].includes(o.type))){
      const x=o.x-r.x,y=o.y-r.y;c.globalAlpha=.68;
      box(c,p.road,Math.min(x,400),y-8,Math.abs(x-400),16);box(c,p.road,392,Math.min(y,320),16,Math.abs(y-320));c.globalAlpha=1;
      if(o.type==='anchor'){steppedEllipse(c,p.dark,x,y+8,75,36);steppedEllipse(c,p.stone,x,y+3,65,30);steppedEllipse(c,p.road,x,y+1,53,23);for(let i=0;i<8;i++){const a=i*Math.PI/4;box(c,p.accent,x+Math.cos(a)*45-2,y+Math.sin(a)*18-2,4,4);}}
    }
  }
  if(r.id==='haventide')drawHaventideGround(c,r);
  groundCache.set(r.id,canvas);return canvas;
}

function drawDistantSpire(c,x,y,p){
  box(c,p.dark,x-22,y-63,46,70);poly(c,p.stone,[[x-19,y-58],[x,y-111],[x+19,y-58]]);box(c,p.stone,x-17,y-61,35,60);box(c,'#232937',x-10,y-50,22,50);box(c,p.accent,x-3,y-49,5,47);box(c,p.light,x-19,y-10,40,6);box(c,p.dark,x-30,y+7,62,8);
}
function drawElevator(c,x,y,p){
  poly(c,'#323343',[[x-73,y+45],[x-22,y-108],[x+24,y-108],[x+74,y+45]]);poly(c,p.stone,[[x-61,y+44],[x-16,y-101],[x-6,y-101],[x-42,y+44]]);poly(c,p.stone,[[x+5,y-101],[x+18,y-101],[x+61,y+44],[x+42,y+44]]);
  for(let i=0;i<5;i++){box(c,p.light,x-34-i*5,y-83+i*26,70+i*10,5);box(c,p.accent,x-4,y-77+i*24,7,12);}box(c,p.dark,x-77,y+45,154,15);box(c,p.light,x-68,y+46,136,4);
}

function scenerySprite(o,r){
  const key=`${r.id}_${o.type}_${o.variant}`;if(propCache.has(key))return propCache.get(key);
  const canvas=makeCanvas(116,136),c=canvas.getContext('2d'),p=r.palette,x=58,y=122,v=o.variant;
  c.imageSmoothingEnabled=false;
  if(o.type==='tree'||o.type==='pine'){
    steppedEllipse(c,'#1c2e303f',x+6,y+2,36,10);box(c,'#393736',x-6,y-52,13,52);box(c,'#8d7960',x+1,y-42,4,39);box(c,'#4b403a',x-11,y-14,5,17);box(c,'#ad9a71',x-3,y-3,17,4);
    if(o.type==='pine'||r.id==='frost'){
      for(let i=0;i<4;i++){const yy=y-33-i*18,ww=37-i*7;poly(c,p.dark,[[x-ww,yy+12],[x,yy-33],[x+ww,yy+12]]);poly(c,p.leaf,[[x-ww+3,yy+6],[x,yy-31],[x+ww-5,yy+6]]);poly(c,'#d2dfd3',[[x-ww+10,yy-1],[x,yy-31],[x+ww-10,yy-1],[x+2,yy-8],[x-8,yy-4]]);}
    }else {
      const leaf=r.id==='crown'?'#977298':r.id==='mire'?'#557f6c':p.leaf;
      for(const [dx,dy,rx,ry] of [[-21,-55,26,24],[20,-58,28,25],[0,-81,30,24],[-2,-60,38,30]])steppedEllipse(c,p.dark,x+dx,y+dy,rx,ry);
      for(const [dx,dy,rx,ry] of [[-22,-59,23,19],[21,-62,23,19],[0,-83,26,19],[-2,-65,34,23]])steppedEllipse(c,leaf,x+dx,y+dy,rx,ry);
      for(const [dx,dy] of [[-26,-68],[-7,-90],[16,-77],[-12,-59],[28,-62],[8,-50]]){box(c,p.light,x+dx,y+dy,10,4);box(c,p.light,x+dx+4,y+dy-4,6,4);}
      if(v%2===0)for(let i=0;i<6;i++)box(c,r.id==='crown'?'#e6b0d7':'#d8bd78',x-22+(i*13)%47,y-50-(i*17)%36,3,3);
      if(r.id==='mire'){for(const dx of [-30,-15,24,35]){box(c,'#78947d',x+dx,y-43,2,21+v*3);box(c,'#78947d',x+dx-3,y-30,3,8);}}
    }
  }else if(o.type==='rock'||o.type==='ruin'){
    steppedEllipse(c,'#22283244',x+3,y+2,31,10);
    if(o.type==='ruin'){box(c,p.dark,x-28,y-61,57,62);box(c,p.stone,x-25,y-57,48,55);for(let yy=y-53;yy<y;yy+=15){box(c,p.light,x-23,yy,45,2);box(c,p.dark,x+(yy%2?2:-8),yy,2,13);}box(c,p.ground,x-6,y-64,40,27);box(c,p.accent,x-20,y-39,5,24);}
    else {poly(c,p.dark,[[x-33,y-6],[x-27,y-33],[x-6,y-47],[x+23,y-33],[x+34,y-6],[x+19,y+2],[x-15,y+3]]);poly(c,p.stone,[[x-29,y-10],[x-24,y-31],[x-5,y-42],[x+20,y-30],[x+29,y-8],[x+14,y-2],[x-15,y-1]]);poly(c,p.light,[[x-24,y-31],[x-5,y-42],[x+20,y-30],[x+3,y-23],[x-12,y-22]]);poly(c,p.dark,[[x+4,y-21],[x+21,y-28],[x+26,y-9],[x+9,y-3]]);box(c,p.ground,x-15,y-19,13,3);}
  }else if(o.type==='crystal'||o.type==='spire'){
    steppedEllipse(c,'#22283244',x,y+2,29,9);
    for(const [dx,h,w] of [[-21,33,11],[0,72,15],[22,43,10]]){
      poly(c,p.dark,[[x+dx-w-3,y-2],[x+dx-w-3,y-h+13],[x+dx,y-h-5],[x+dx+w+3,y-h+13],[x+dx+w+3,y-2]]);
      poly(c,p.accent,[[x+dx-w,y-5],[x+dx-w,y-h+14],[x+dx,y-h],[x+dx+w,y-h+14],[x+dx+w,y-5]]);poly(c,p.stone,[[x+dx,y-5],[x+dx,y-h],[x+dx+w,y-h+14],[x+dx+w,y-5]]);box(c,'#e4e7d3',x+dx-w+3,y-h+20,2,h-27);
    }
  }else if(o.type==='cactus'){
    steppedEllipse(c,'#312e3444',x,y+1,23,8);box(c,p.dark,x-9,y-67,20,68);box(c,p.leaf,x-7,y-65,15,64);box(c,p.light,x-5,y-62,3,57);box(c,p.leaf,x-27,y-48,9,29);box(c,p.leaf,x-20,y-29,16,9);box(c,p.leaf,x+17,y-56,9,23);box(c,p.leaf,x+7,y-39,15,8);box(c,p.accent,x-5,y-69,11,5);
  }else if(o.type==='lamp'){
    steppedEllipse(c,'#2425333f',x,y+2,15,5);box(c,'#323342',x-5,y-4,12,5);box(c,'#393747',x-2,y-51,5,49);box(c,'#a99a77',x-2,y-48,2,43);box(c,'#353544',x-9,y-63,19,16);box(c,'#f5c575',x-6,y-60,13,10);box(c,'#fff0b0',x-3,y-59,6,7);poly(c,'#564957',[[x-12,y-63],[x,y-73],[x+13,y-63]]);
  }
  propCache.set(key,canvas);return canvas;
}

function building(c,o,r,level=1){
  if(r.id==='haventide'&&o.type==='door'&&drawHaventideBuilding(c,o,r))return;
  const p=r.palette,x=o.x,y=o.y,s=o.service||'hall',hall=o.type==='hall';
  if(s==='spire'){
    steppedEllipse(c,'#201d306e',x+9,y+3,95,24);box(c,'#342e49',x-66,y-140,132,131);box(c,'#777387',x-58,y-143,116,129);box(c,'#ada2af',x-61,y-147,122,8);
    for(const dx of [-53,39]){box(c,'#514462',x+dx,y-178,17,162);poly(c,'#e2b5d4',[[x+dx-5,y-178],[x+dx+9,y-223],[x+dx+23,y-178]]);box(c,'#c88ac4',x+dx+6,y-164,4,103);}
    poly(c,'#45405a',[[x-51,y-147],[x,y-192],[x+51,y-147]]);poly(c,'#b8a2b9',[[x-42,y-149],[x,y-185],[x+42,y-149]]);box(c,'#262536',x-23,y-65,46,62);box(c,'#de9ed0',x-19,y-61,5,57);box(c,'#de9ed0',x+14,y-61,5,57);box(c,'#e8d0bc',x-26,y-4,52,6);for(let i=0;i<4;i++){box(c,p.accent,x-35+i*22,y-130,9,25);box(c,'#fff0cf',x-33+i*22,y-128,2,17);}return;
  }
  steppedEllipse(c,'#22233255',x+8,y+2,67,16);
  const wall=r.id==='haventide'?'#c1ad83':r.id==='emberline'?'#b98065':r.id==='orbital'?'#9fabb0':'#b1a0b4';
  const roof=r.id==='haventide'?'#70576a':r.id==='emberline'?'#7b4b53':r.id==='orbital'?'#54657c':'#665078';
  box(c,'#342d3e',x-60,y-81,120,69);box(c,wall,x-55,y-78,110,62);box(c,'#e3c99b',x-56,y-22,112,6);box(c,'#635344',x-54,y-17,108,6);
  for(const dx of [-53,-25,25,50])box(c,r.id==='orbital'?'#667782':'#64504e',x+dx,y-74,4,56);
  for(const dx of [-37,36]){box(c,'#42384d',x+dx-9,y-67,19,22);box(c,s==='smith'?'#eeae61':'#c2d7bc',x+dx-6,y-64,13,16);box(c,'#59424d',x+dx,y-63,2,17);box(c,'#e3c99b',x+dx-11,y-44,24,4);}
  // Layered roof tiles, ridge cap, chimney and service-specific hanging sign.
  poly(c,'#322a3d',[[x-69,y-77],[x-50,y-112-(hall?9:0)],[x+48,y-112-(hall?9:0)],[x+69,y-77],[x+67,y-71],[x-68,y-71]]);
  poly(c,roof,[[x-64,y-80],[x-47,y-109-(hall?9:0)],[x+45,y-109-(hall?9:0)],[x+63,y-80]]);
  for(let row=0;row<4;row++){const yy=y-104+row*8-(hall?9:0),ww=48+row*5;line(c,row%2?'#947181':'#aa8590',x-ww,yy,x+ww,yy,2);for(let i=-4;i<5;i++)box(c,'#362d414e',x+i*14+(row%2?6:0),yy-5,2,6);}
  box(c,'#c5a894',x-49,y-114-(hall?9:0),97,5);box(c,'#4a414c',x+30,y-122,15,25);box(c,'#928985',x+31,y-121,11,24);box(c,'#c1b6a3',x+27,y-126,21,6);
  if(s==='inn'){
    // Inn: a lantern-lit sleeping loft, tiled dormer and flower boxes.
    box(c,'#413542',x-25,y-135,51,39);box(c,'#c2a585',x-21,y-131,43,35);poly(c,'#342b3c',[[x-31,y-132],[x,y-154],[x+31,y-132]]);poly(c,roof,[[x-25,y-134],[x,y-148],[x+25,y-134]]);box(c,'#c8aa8d',x-28,y-133,56,3);box(c,'#4f3e51',x-13,y-125,27,23);box(c,'#ebc185',x-10,y-122,21,17);box(c,'#664950',x,y-124,3,22);box(c,'#664950',x-12,y-114,24,2);
    for(const dx of [-38,36]){box(c,'#6f4f4b',x+dx-13,y-43,26,8);box(c,'#a47b59',x+dx-12,y-41,24,3);for(let j=0;j<5;j++){box(c,'#60724c',x+dx-10+j*5,y-49,4,7);box(c,j%2?'#efb992':'#d9849a',x+dx-10+j*5,y-51+(j%2)*2,3,3);}}
    box(c,'#4a3c47',x-71,y-28,14,27);box(c,'#8a6e52',x-69,y-26,10,23);box(c,'#ddbf91',x-71,y-22,14,3);box(c,'#ddbf91',x-71,y-8,14,3);
  }else if(s==='archive'){
    // Archive: a copper-roofed observatory and generous leaded windows.
    box(c,'#51435c',x-28,y-146,56,49);box(c,'#9c949f',x-24,y-143,48,45);poly(c,'#393246',[[x-34,y-145],[x,y-180],[x+34,y-145]]);poly(c,'#71877f',[[x-28,y-148],[x,y-173],[x+28,y-148]]);line(c,'#b8b996',x,y-172,x,y-148,2);box(c,'#dbbc8e',x-30,y-147,60,4);box(c,'#57415c',x-15,y-135,30,29);box(c,'#aab9ca',x-12,y-131,24,22);box(c,'#e3ccab',x-2,y-133,3,26);box(c,'#e3ccab',x-14,y-123,28,3);box(c,'#b69bb9',x-9,y-129,5,6);
    for(const dx of [-37,36]){box(c,'#5b465f',x+dx-9,y-67,19,28);box(c,'#a1b3bb',x+dx-6,y-64,13,20);box(c,'#c1a1c3',x+dx-5,y-63,5,8);box(c,'#e7cca6',x+dx,y-66,2,23);box(c,'#e7cca6',x+dx-8,y-54,16,2);}
    box(c,'#5f4e65',x-67,y-33,12,31);box(c,'#b3987b',x-66,y-32,10,5);box(c,'#bdcfaa',x-64,y-26,6,18);
  }else if(s==='smith'){
    // Smithy: a tall masonry flue, patched metal roof and open side furnace.
    box(c,'#433b49',x+25,y-165,24,74);box(c,'#957b70',x+28,y-161,18,67);for(let j=0;j<7;j++){box(c,'#c1a18b',x+29,y-159+j*9,16,2);box(c,'#654e54',x+34+(j%2)*5,y-157+j*9,2,6);}box(c,'#4c3f49',x+21,y-168,32,7);box(c,'#b29989',x+22,y-169,30,3);
    box(c,'#5a4d55',x-43,y-101,30,18);box(c,'#91848a',x-40,y-99,25,13);box(c,'#c0a899',x-39,y-98,23,2);for(const dx of [-35,-21])box(c,'#45434e',x+dx,y-94,3,3);
    box(c,'#44333f',x-47,y-62,22,23);box(c,'#dd754c',x-44,y-59,16,19);box(c,'#ffc97a',x-40,y-52,8,12);box(c,'#a6917a',x-49,y-41,26,5);
    box(c,'#3d3746',x+31,y-8,28,7);poly(c,'#7d7b83',[[x+33,y-7],[x+56,y-7],[x+49,y+1],[x+37,y+1]]);box(c,'#605564',x+39,y+1,11,7);box(c,'#c1b5a4',x+32,y-10,25,3);
  }
  box(c,'#403241',x-16,y-47,32,37);box(c,'#745451',x-12,y-43,24,32);box(c,'#d8a16f',x-11,y-42,2,30);box(c,'#f7d594',x+6,y-26,3,3);box(c,p.stone,x-24,y-10,48,6);box(c,'#d6c6a1',x-20,y-11,40,3);
  if(s==='shop'){
    box(c,'#9c7f76',x-56,y-79,112,5);for(const dx of [-53,52])box(c,'#d9b787',x+dx,y-43,3,33);
    for(let i=0;i<8;i++){poly(c,i%2?'#e3c899':'#936275',[[x-56+i*14,y-61],[x-42+i*14,y-61],[x-39+i*14,y-42],[x-59+i*14,y-42]]);poly(c,i%2?'#e3c899':'#936275',[[x-59+i*14,y-42],[x-49+i*14,y-36],[x-39+i*14,y-42]]);}
    for(const dx of [-49,40]){box(c,'#55423f',x+dx-10,y-10,24,16);box(c,'#b69364',x+dx-9,y-9,22,13);box(c,'#e0bd84',x+dx-9,y-8,22,2);box(c,'#765447',x+dx-6,y-5,3,9);box(c,'#765447',x+dx+5,y-5,3,9);for(let j=0;j<4;j++){box(c,dx<0?'#d7b65f':'#8eac72',x+dx-7+j*5,y-15,5,7);box(c,dx<0?'#f3d080':'#c3d298',x+dx-6+j*5,y-15,3,2);}}
    box(c,'#725752',x-38,y-126,35,14);box(c,'#b8946b',x-35,y-124,29,10);box(c,'#d9bc8c',x-32,y-121,23,2);box(c,'#7e987b',x+6,y-125,19,15);box(c,'#c5b58b',x+9,y-128,13,5);
  }
  const signColor=s==='inn'?'#edc97f':s==='shop'?'#c6d89c':s==='smith'?'#ee9866':s==='archive'?'#b6b3e4':'#dfb575';
  box(c,'#423b46',x+47,y-79,23,3);box(c,'#423b46',x+65,y-77,2,12);box(c,'#302d3b',x+53,y-66,27,24);box(c,signColor,x+56,y-63,21,18);
  serviceIcon(c,s,x+66,y-54,'#514053');
  if(hall){box(c,'#4b3d4d',x-11,y-144,22,27);poly(c,'#c9a46c',[[x-18,y-143],[x,y-161],[x+18,y-143]]);box(c,'#e5c884',x-8,y-140,16,16);box(c,'#453a49',x-1,y-138,2,7);box(c,'#453a49',x,y-132,5,2);for(let i=0;i<Math.min(level,3);i++)box(c,'#fae0a0',x-9+i*8,y-85,5,5);}
}
function serviceIcon(c,s,x,y,color){
  if(s==='inn'){box(c,color,x-7,y-1,14,5);box(c,color,x-7,y-5,3,9);box(c,color,x+5,y-2,3,6);box(c,color,x-2,y-4,7,4);}
  else if(s==='shop'){box(c,color,x-6,y-3,12,9);line(c,color,x-3,y-4,x,y-8,2);line(c,color,x,y-8,x+3,y-4,2);}
  else if(s==='smith'){box(c,color,x-7,y-5,14,4);box(c,color,x-3,y-1,6,6);box(c,color,x-6,y+5,12,2);}
  else if(s==='archive'){box(c,color,x-7,y-6,14,12);box(c,'#ede1b4',x-5,y-4,4,8);box(c,'#ede1b4',x+1,y-4,4,8);}
  else{poly(c,color,[[x-8,y-1],[x,y-8],[x+8,y-1]]);box(c,color,x-6,y-1,12,7);box(c,'#ede1b4',x-1,y+1,3,5);}
}

function plot(c,o,r,time){
  const x=o.x,y=o.y,b=o.building,p=r.palette,tier=b?.tier||b?.level||1;
  steppedEllipse(c,'#37393644',x+4,y+1,55,13);
  box(c,'#494a35',x-51,y-57,102,61);box(c,'#a49164',x-48,y-54,96,55);
  for(const dx of [-51,47])for(const dy of [-57,-2]){box(c,'#494036',x+dx,y+dy,5,15);box(c,'#dec49a',x+dx,y+dy-1,5,3);}
  if(!b){
    for(let yy=-46;yy<-1;yy+=14)for(let xx=-39;xx<44;xx+=17)box(c,'#8e8057',x+xx,y+yy,12,9);
    box(c,'#5e6349',x-10,y-35,21,21);box(c,'#e6cb8c',x-1,y-31,3,13);box(c,'#e6cb8c',x-6,y-26,13,3);
    return;
  }
  if(b.type==='farm'){
    for(let i=0;i<3;i++){box(c,'#664936',x-43,y-46+i*14,55,11);for(let j=0;j<7;j++){const xx=x-40+j*8,yy=y-42+i*14;box(c,'#364e37',xx,yy,3,7);box(c,tier>1?'#d9be69':'#a5b65d',xx-2,yy-5,7,7);box(c,'#d9d48b',xx,yy-7,2,5);}}
    box(c,'#735252',x+18,y-48,24,44);poly(c,'#414154',[[x+12,y-46],[x+30,y-65],[x+48,y-46]]);poly(c,'#ad7b70',[[x+16,y-47],[x+30,y-60],[x+44,y-47]]);box(c,'#40313e',x+26,y-23,10,18);box(c,'#cfb580',x+21,y-37,6,8);
    if(tier>1){box(c,'#726951',x+35,y-67,3,35);line(c,'#e0c596',x+37,y-63,x+17,y-82,5);line(c,'#e0c596',x+37,y-63,x+57,y-43,5);line(c,'#e0c596',x+37,y-63,x+55,y-82,5);line(c,'#e0c596',x+37,y-63,x+17,y-44,5);}
  }else if(b.type==='mine'){
    poly(c,'#4c4d53',[[x-42,y-6],[x-40,y-34],[x-20,y-61],[x+19,y-58],[x+43,y-31],[x+43,y-5]]);poly(c,'#8d8982',[[x-38,y-30],[x-18,y-58],[x+17,y-54],[x+35,y-32],[x+15,y-36],[x-8,y-26]]);box(c,'#282b38',x-16,y-31,34,28);box(c,'#b9986d',x-21,y-37,43,7);box(c,'#b9986d',x-21,y-34,6,31);box(c,'#b9986d',x+16,y-34,6,31);for(const dx of [-33,28]){box(c,'#84cbca',x+dx,y-27,6,9);box(c,'#d3ebe0',x+dx,y-27,3,4);}line(c,'#434452',x-11,y-5,x-22,y+9,3);line(c,'#434452',x+12,y-5,x+23,y+9,3);if(tier>1){box(c,'#5c5756',x+24,y-3,19,11);box(c,'#bfc3b6',x+28,y-10,10,8);}
  }else if(b.type==='extractor'){
    box(c,'#4a4b55',x-26,y-16,52,19);box(c,'#a69079',x-21,y-21,42,17);box(c,'#544c60',x-13,y-73,26,52);box(c,'#d3b781',x-15,y-69,30,7);box(c,'#79c9c9',x-8,y-61,16,29);box(c,'#e9f0c5',x-5,y-59,4,23);box(c,'#d3b781',x-15,y-33,30,7);poly(c,'#b28abf',[[x-9,y-76],[x,y-95],[x+9,y-76]]);for(const dx of [-32,27]){box(c,'#645861',x+dx,y-39,6,39);box(c,'#b3a187',x+dx-4,y-42,14,5);}if(tier>1)for(const dx of [-25,25]){box(c,'#85d7d3',x+dx-2,y-48,5,24);box(c,'#e5e8b1',x+dx-1,y-46,2,20);}
  }else if(b.type==='walls'){
    for(const dx of [-43,-10,24]){box(c,'#646375',x+dx,y-37,25,41);box(c,'#a29d93',x+dx+2,y-35,20,36);box(c,'#c9b99b',x+dx-2,y-42,29,8);for(let i=0;i<3;i++)box(c,'#d0bea0',x+dx-2+i*11,y-50,7,9);box(c,'#51475a',x+dx+8,y-24,6,11);}box(c,'#766b6d',x-21,y-22,14,25);box(c,'#766b6d',x+14,y-22,13,25);
  }else {
    const col=b.type==='barracks'?'#876579':b.type==='archive'?'#736588':'#9c715d';
    box(c,'#433b49',x-39,y-46,78,48);box(c,'#b8a286',x-35,y-42,70,41);poly(c,'#383448',[[x-45,y-43],[x-25,y-67],[x+23,y-67],[x+45,y-43]]);poly(c,col,[[x-40,y-46],[x-22,y-63],[x+21,y-63],[x+40,y-46]]);box(c,'#d1b792',x-23,y-67,45,4);box(c,'#403543',x-10,y-29,20,29);
    if(b.type==='forge'){box(c,'#e88848',x-7,y-24,14,23);box(c,'#f3c26b',x-4,y-15,8,13);box(c,'#726968',x+22,y-81,13,24);box(c,'#c1ab8f',x+20,y-83,17,5);box(c,'#3e3a4a',x-34,y-9,20,5);box(c,'#645861',x-28,y-4,8,10);}
    else if(b.type==='archive'){for(const dx of [-25,21]){box(c,'#484052',x+dx-6,y-33,13,23);for(let j=0;j<3;j++){box(c,['#c2968f','#bdad77','#8cb7b1'][j],x+dx-4,y-30+j*7,9,5);}}box(c,'#dbc998',x-5,y-55,10,8);}
    else {for(const dx of [-26,27]){box(c,'#504257',x+dx,y-80,3,54);poly(c,'#d0a562',[[x+dx+2,y-79],[x+dx+20,y-75],[x+dx+2,y-65]]);}box(c,'#7d8291',x-28,y-27,11,17);box(c,'#d6c898',x-24,y-24,3,10);}
    if(tier>1){box(c,'#b4aa97',x-33,y-42,4,40);box(c,'#b4aa97',x+30,y-42,4,40);}
  }
  for(let i=0;i<tier;i++){box(c,'#4f453d',x-12+i*9,y+6,7,5);box(c,'#efce81',x-11+i*9,y+6,5,3);}
}

function npc(c,o,time){
  // The two commons stewards retain their existing settlement artwork.
  if(o.id!=='mayor'&&o.id!=='worker'){drawNPC(c,o.id,o.x,o.y,1,time);return;}
  const x=o.x,y=o.y,n=[...o.id].reduce((v,s)=>v+s.charCodeAt(0),0),v=n%4,frame=Math.floor(time*2+n)%6,bob=[0,0,-1,-1,0,0][frame],hand=[0,0,1,2,1,0][frame];
  const coats=['#927795','#8e9b72','#6d9299','#b88769'],lights=['#c6a0b4','#bac58c','#a9c9c3','#dbb382'];
  let coat=coats[v],light=lights[v],hair=['#5b4147','#ae815e','#c2b5a0','#453746'][v];
  if(o.id==='lio'){coat='#b58258';light='#e1b67a';hair='#62423e';}if(o.id==='worker'){coat='#607d89';light='#9db8b6';hair='#5b4446';}if(o.id==='mayor'){coat='#746b92';light='#bba9c9';hair='#d1c7b7';}
  const skin=v===2?'#bd9173':'#dbb497',skinShade=v===2?'#956b59':'#b8866d';
  steppedEllipse(c,'#24253355',x,y+1,15,5);
  // Boots, split trousers and coat tails have a strong silhouette at 1×.
  poly(c,'#2c2b3b',[[x-10,y-19],[x+10,y-19],[x+10,y-2],[x+13,y-2],[x+13,y+2],[x+2,y+2],[x+1,y-13],[x-2,y-13],[x-3,y+2],[x-14,y+2],[x-14,y-2],[x-11,y-3]]);
  box(c,'#65515c',x-9,y-18,7,15);box(c,'#796570',x+3,y-18,6,15);box(c,'#b39c82',x-11,y-3,9,2);box(c,'#b39c82',x+4,y-3,8,2);
  poly(c,'#352d40',[[x-8,y-36+bob],[x+7,y-36+bob],[x+15,y-30+bob],[x+13,y-14+bob],[x+10,y-14],[x+12,y-9],[x-12,y-9],[x-10,y-16],[x-15,y-16+bob],[x-16,y-29+bob]]);
  poly(c,coat,[[x-7,y-34+bob],[x+6,y-34+bob],[x+12,y-29+bob],[x+10,y-18],[x+9,y-11],[x-9,y-11],[x-8,y-20],[x-13,y-21+bob],[x-13,y-28+bob]]);
  box(c,light,x-10,y-29+bob,4,10);box(c,light,x-7,y-33+bob,13,3);box(c,'#4e4456',x+7,y-28+bob,3,14);box(c,'#edc894',x-1,y-30+bob,2,13);box(c,'#cbb089',x-9,y-17,18,3);box(c,'#65506a',x-1,y-17,4,4);
  // Hands use discrete idle positions; the head stays upright and readable.
  box(c,'#352c3b',x-15,y-22+bob,6,9);box(c,skinShade,x-14,y-22+bob,4,7);box(c,skin,x-14,y-22+bob,2,5);
  box(c,'#352c3b',x+9,y-22+bob-hand,6,9);box(c,skinShade,x+10,y-21+bob-hand,4,6);box(c,skin,x+10,y-21+bob-hand,2,4);
  box(c,'#3b3040',x-9,y-51+bob,18,20);poly(c,hair,[[x-11,y-49+bob],[x-7,y-56+bob],[x+5,y-56+bob],[x+10,y-50+bob],[x+10,y-36+bob],[x-10,y-36+bob]]);
  box(c,skinShade,x-7,y-47+bob,15,14);box(c,skin,x-6,y-48+bob,12,12);box(c,skin,x-9,y-43+bob,3,6);box(c,hair,x-9,y-51+bob,17,7);box(c,hair,x-9,y-46+bob,4,7);box(c,'#e3c7a2',x-5,y-54+bob,7,2);
  box(c,'#3c3440',x-3,y-43+bob,2,2);box(c,'#3c3440',x+4,y-43+bob,2,2);box(c,'#9f6b60',x,y-38+bob,4,1);box(c,'#ecc6a4',x+1,y-41+bob,2,2);
  if(o.id==='lio'||o.service==='smith'){
    box(c,'#48313c',x-9,y-55+bob,19,7);box(c,'#b17b58',x-8,y-56+bob,16,5);box(c,'#d4ba85',x-10,y-50+bob,22,3);box(c,'#5f5962',x-5,y-53+bob,5,5);box(c,'#5f5962',x+3,y-53+bob,5,5);box(c,'#acd3cd',x-4,y-52+bob,3,2);box(c,'#acd3cd',x+4,y-52+bob,3,2);
    box(c,'#715147',x-6,y-29+bob,13,15);box(c,'#a27b58',x-4,y-27+bob,9,10);box(c,'#d7bd86',x-1,y-21+bob,3,5);box(c,'#686b7b',x+12,y-23-hand,8,6);box(c,'#c5c5b5',x+13,y-23-hand,6,2);box(c,'#725248',x+14,y-17-hand,3,10);
  }else if(o.service==='archive'||o.id==='mayor'){
    poly(c,light,[[x-10,y-33+bob],[x-2,y-28+bob],[x+8,y-34+bob],[x+9,y-24+bob],[x-10,y-23+bob]]);box(c,'#dac8a5',x-6,y-44+bob,13,3);box(c,'#433849',x-5,y-44+bob,4,3);box(c,'#433849',x+3,y-44+bob,4,3);box(c,'#4c375d',x+9,y-26-hand,10,15);box(c,'#b694ba',x+11,y-25-hand,6,13);box(c,'#ebd4aa',x+10,y-13-hand,8,2);
  }else if(o.service==='inn'||o.service==='shop'){
    box(c,'#e0c7a6',x-7,y-28+bob,14,16);box(c,'#bda185',x-7,y-18+bob,14,2);box(c,'#ac7580',x-1,y-51+bob,10,5);box(c,'#ddaaaa',x+4,y-50+bob,3,2);
  }else if(o.id==='worker'){
    poly(c,'#b47683',[[x-10,y-50+bob],[x-7,y-57+bob],[x+7,y-57+bob],[x+11,y-49+bob]]);box(c,'#edb6aa',x-5,y-55+bob,10,2);box(c,'#4f596f',x-5,y-31+bob,12,18);box(c,'#a9c1c2',x-4,y-30+bob,2,8);box(c,'#a9c1c2',x+4,y-30+bob,2,8);box(c,'#d5b17c',x-2,y-19+bob,6,4);
  }
}
function anchor(c,o,r,g){
  const x=o.x,y=o.y,active=!!g.s.flags[o.flag],p=r.palette,t=g.s.settings?.reducedMotion?0:g.time;
  c.save();c.globalAlpha=active?.25:.13;oval(c,active?'#edda94':p.accent,x,y-22,39+Math.sin(t*2)*3,58);c.restore();
  box(c,'#333745',x-25,y-6,50,11);box(c,p.stone,x-20,y-15,40,10);box(c,p.light,x-14,y-22,28,9);
  for(const dx of [-23,19]){box(c,'#424456',x+dx,y-57,7,42);box(c,p.stone,x+dx+1,y-55,5,36);}
  poly(c,'#303247',[[x-14,y-40],[x,y-76],[x+14,y-40],[x,y-22]]);poly(c,active?'#ebcd8b':p.accent,[[x-10,y-40],[x,y-69],[x+10,y-40],[x,y-27]]);poly(c,'#f7edc5',[[x-7,y-41],[x,y-65],[x,y-32]]);
  for(let i=0;i<4;i++){const a=t*.5+i*Math.PI/2,xx=x+Math.cos(a)*31,yy=y-41+Math.sin(a)*13;box(c,active?'#f7e4a7':p.accent,xx,yy,3,3);}
}
function chest(c,o,opened){steppedEllipse(c,'#252a3844',o.x,o.y+2,19,6);drawProp(c,opened?'cache_open':'cache_closed',o.x,o.y,40);}
function sign(c,o){const x=o.x,y=o.y;box(c,'#463e3d',x-3,y-21,7,24);box(c,'#40353f',x-22,y-39,44,24);box(c,'#b39a70',x-20,y-37,40,19);for(let i=0;i<3;i++)box(c,'#695844',x-14,y-32+i*5,25-i*4,2);}

function roomBackground(room){
  if(roomCache.has(room.id))return roomCache.get(room.id);
  const canvas=makeCanvas(720,480),c=canvas.getContext('2d'),r=REGIONS.find(r=>r.id===room.region),p=r.palette,s=room.service;
  if(room.id==='haventide_smith'){drawHaventideSmithy(c);roomCache.set(room.id,canvas);return canvas;}
  box(c,'#211e2b',0,0,720,480);box(c,'#403443',28,63,664,389);box(c,'#715965',36,71,648,374);box(c,'#362f3d',44,121,632,316);
  for(let yy=125;yy<438;yy+=21)for(let xx=48;xx<671;xx+=47){const ww=Math.min(45,671-xx);box(c,s==='spire'?'#716575':s==='smith'?'#78695f':'#a18768',xx,yy,ww,19);box(c,'#ffffff12',xx+2,yy+1,Math.max(0,ww-5),2);box(c,'#34293424',xx+6,yy+14,Math.max(0,ww-16),2);}
  // Double-height back wall with stone footings and a long picture rail.
  box(c,s==='spire'?'#5e4d69':'#ad947f',45,75,630,49);box(c,'#d8ba92',45,77,630,4);box(c,'#574250',45,118,630,10);box(c,'#dfbf96',45,116,630,3);
  for(const x of [49,219,493,660]){box(c,'#54434d',x,72,10,53);box(c,'#bf9b7b',x+2,76,3,39);}
  for(const x of [125,578]){box(c,'#403444',x-28,79,56,35);box(c,s==='spire'?'#c5a1cc':'#7d98a3',x-24,83,48,27);box(c,'#d4b38c',x-1,81,3,31);box(c,'#d4b38c',x-25,96,50,3);}
  box(c,'#3c303f',327,428,66,19);box(c,'#c3a27c',330,428,60,5);box(c,'#76615b',335,434,50,10);
  // Plum woven central runner keeps the route to the counter unmistakable.
  box(c,'#453544',315,165,90,255);box(c,'#795064',319,169,82,247);box(c,'#c39d7a',323,169,3,247);box(c,'#c39d7a',394,169,3,247);for(let yy=181;yy<410;yy+=24)poly(c,'#b08a75',[[360,yy-5],[367,yy],[360,yy+5],[353,yy]]);
  if(s==='inn'){
    for(const x of [76,530]){box(c,'#51404b',x,150,112,91);box(c,'#d4b9a0',x+4,153,104,80);box(c,'#f1dbc0',x+11,157,88,19);box(c,'#926675',x+6,181,100,48);box(c,'#c79799',x+9,185,94,4);for(let i=0;i<4;i++)box(c,'#ad7e8a',x+11+i*23,190,5,34);box(c,'#694d4e',x,228,112,10);box(c,'#694d4e',x+4,238,8,11);box(c,'#694d4e',x+100,238,8,11);}
    table(c,88,315,100,48);for(const x of [112,163]){box(c,'#b9b599',x,326,15,12);box(c,'#eee0b3',x+2,326,11,8);}box(c,'#c9a575',463,140,25,62);box(c,'#66566a',467,143,17,15);box(c,'#e8c778',470,148,11,6);
    text(c,'A room, a meal, another morning.',360,104,15,'#4c3b47');
  }else if(s==='shop'){
    shelf(c,78,141,122,111);shelf(c,518,141,120,111);table(c,230,212,80,42);table(c,413,212,78,42);
    for(const x of [248,276,432,461]){box(c,'#4d6063',x,218,13,24);box(c,'#95bdba',x+2,220,9,19);box(c,'#d7bd84',x+3,215,7,6);}text(c,'Good tools. Fair prices.',360,104,16,'#4c3b47');
  }else if(s==='smith'){
    box(c,'#3a3540',74,128,120,113);box(c,'#847574',80,132,108,104);for(let yy=136;yy<234;yy+=15){box(c,'#b2a08c',83,yy,99,3);box(c,'#554b53',yy%2?120:144,yy+3,3,11);}box(c,'#352c3d',99,173,70,63);box(c,'#d86d49',105,184,58,47);poly(c,'#f0ad58',[[110,229],[121,193],[130,212],[139,185],[158,229]]);poly(c,'#f8d38a',[[123,230],[133,207],[142,229]]);
    table(c,506,145,115,78);for(const x of [523,550,580]){box(c,'#c3c5bc',x,151,4,48);box(c,'#665264',x-5,185,15,4);box(c,'#d7b783',x-1,190,3,15);}box(c,'#3e3d4b',223,277,79,15);poly(c,'#747681',[[227,291],[298,291],[284,304],[249,304]]);box(c,'#64616f',253,302,29,21);box(c,'#aeb0ae',228,278,70,4);text(c,'Nothing worth saving is beyond repair.',360,104,15,'#4c3b47');
  }else if(s==='archive'){
    shelf(c,76,137,121,122,true);shelf(c,531,137,117,122,true);table(c,244,283,230,54);box(c,'#59495c',272,291,53,34);box(c,'#ddcba7',275,288,47,32);box(c,'#8f796b',298,288,2,31);for(let i=0;i<4;i++){box(c,'#9e8d75',278,293+i*5,16,1);box(c,'#9e8d75',304,293+i*5,14,1);}box(c,'#4b3a4e',421,291,20,28);box(c,p.accent,425,288,12,19);box(c,'#ede4be',429,284,4,14);text(c,'Every memory has more than one witness.',360,104,14,'#4c3b47');
  }else if(s==='spire'){
    box(c,'#342d45',90,153,120,184);box(c,'#342d45',510,153,120,184);
    for(const x of [115,171,535,591]){box(c,'#635773',x,169,22,153);box(c,'#aa85ad',x+7,180,8,126);box(c,'#e3bce0',x+9,185,3,118);}
    steppedEllipse(c,'#25273c',360,193,118,56);steppedEllipse(c,'#9187a2',360,186,107,48);steppedEllipse(c,'#41364e',360,182,92,41);
    for(let i=0;i<12;i++){const a=i*Math.PI/6;box(c,'#dbc5ad',360+Math.cos(a)*84-2,181+Math.sin(a)*32-2,4,4);}text(c,'THE LIVING REFERENCE CLOCK',360,104,17,'#f4d9b7');
  }
  roomCache.set(room.id,canvas);return canvas;
}
function table(c,x,y,w,h){box(c,'#493948',x+2,y+4,w,h);box(c,'#715250',x,y,w,h-7);box(c,'#bc956d',x+2,y+2,w-4,h-14);box(c,'#ddbd90',x+3,y+3,w-6,3);box(c,'#563e42',x+7,y+h-5,6,11);box(c,'#563e42',x+w-13,y+h-5,6,11);}
function shelf(c,x,y,w,h,books=false){box(c,'#433546',x,y,w,h);box(c,'#8f6b57',x+3,y+3,w-6,h-6);for(let row=0;row<3;row++){const yy=y+12+row*(h-12)/3;box(c,'#513d44',x+7,yy,w-14,(h-17)/3-6);for(let i=0;i<7;i++){const xx=x+10+i*(w-20)/7,col=['#b98382','#b8a776','#819b9a','#9b82a3'][i%4];box(c,col,xx,yy+4,books?9:10,(h-17)/3-10);box(c,'#e0c69c',xx+1,yy+7,books?7:8,2);}box(c,'#d0aa7d',x+4,yy+(h-17)/3-4,w-8,4);}}

export function drawWorld(ctx,g){
  const s=g.s,p=s.party,room=p.interior?INTERIORS[p.interior]:null,time=g.time||0;
  g.camera={x:room?(room.w-960)/2:clamp(p.x-480,0,WORLD_W-960),y:room?(room.h-600)/2:clamp(p.y-286,0,WORLD_H-600)};
  const cam=g.camera;
  ctx.save();ctx.imageSmoothingEnabled=false;box(ctx,'#292d3e',0,0,960,600);
  // Water under the continent's stepped outer silhouette.
  for(let y=0;y<600;y+=24)for(let x=0;x<960;x+=80){const xx=x+(Math.floor(y/24)%2)*31;box(ctx,'#3b425419',xx,y,28,2);}
  ctx.translate(-Math.round(cam.x),-Math.round(cam.y));
  if(room){ctx.drawImage(roomBackground(room),0,0);if(room.id==='haventide_smith')drawSmithyAtmosphere(ctx,time,!!s.settings?.reducedMotion);}
  else for(const r of REGIONS)if(r.x<cam.x+960&&r.x+800>cam.x&&r.y<cam.y+600&&r.y+640>cam.y)ctx.drawImage(ground(r),r.x,r.y);
  if(g.path?.length&&!g.overlay){ctx.save();ctx.strokeStyle='#f2dbab77';ctx.lineWidth=2;ctx.setLineDash([3,9]);ctx.beginPath();ctx.moveTo(p.x,p.y);for(const q of g.path)ctx.lineTo(q.x,q.y);ctx.stroke();ctx.setLineDash([]);const end=g.path.at(-1);line(ctx,'#f6d8a4',end.x-5,end.y,end.x+5,end.y);line(ctx,'#f6d8a4',end.x,end.y-5,end.x,end.y+5);ctx.restore();}
  const visible=o=>o.x>cam.x-130&&o.x<cam.x+1090&&o.y>cam.y-40&&o.y<cam.y+790;
  const objects=getObjects(s).filter(visible),draws=[];
  if(!room)for(const o of SCENERY.filter(visible)){const r=REGIONS.find(r=>r.id===o.region);draws.push({y:o.y,draw:()=>{if(r.id==='haventide'&&drawHaventideScenery(ctx,o,r))return;const spr=scenerySprite(o,r);ctx.drawImage(spr,Math.round(o.x-58*o.size),Math.round(o.y-122*o.size),Math.round(116*o.size),Math.round(136*o.size));}});}
  for(const o of objects){
    const r=REGIONS.find(r=>r.id===o.region)||REGIONS[0];
    if(o.type==='door'&&!o.exit)draws.push({y:o.y-8,draw:()=>building(ctx,o,r)});
    else if(o.type==='hall')draws.push({y:o.y-8,draw:()=>building(ctx,o,r,s.settlement.hall)});
    else if(o.type==='plot')draws.push({y:o.y,draw:()=>plot(ctx,o,r,time)});
    else if(o.type==='npc')draws.push({y:o.y,draw:()=>npc(ctx,o,time)});
    else if(o.type==='chest')draws.push({y:o.y,draw:()=>chest(ctx,o,s.chests.includes(o.id))});
    else if(o.type==='sign')draws.push({y:o.y,draw:()=>sign(ctx,o)});
    else if(o.type==='anchor')draws.push({y:o.y,draw:()=>anchor(ctx,o,r,g)});
    else if(o.type==='encounter')draws.push({y:o.y,draw:()=>{
      const cleared=!!s.cleared[o.id];ctx.save();ctx.globalAlpha=cleared?.48:1;
      steppedEllipse(ctx,cleared?'#69645955':o.boss?'#c5817155':'#a4767a55',o.x,o.y+3,o.boss?36:27,10);
      drawEnemy(ctx,o.enemies[0],'idle',o.x,o.y,o.boss?.78:.62,time);
      if(!cleared){poly(ctx,o.boss?'#f3b66e':'#e2afa3',[[o.x,o.y-74],[o.x+5,o.y-69],[o.x,o.y-64],[o.x-5,o.y-69]]);}
      ctx.restore();
    }});
  }
  const face=g.facing||'right',moving=g.moving,run=g.running,heroState=moving?(run?'run':'walk'):'idle';
  let dx=face==='left'?1:face==='right'?-1:0,dy=face==='up'?1:face==='down'?-1:0;
  if(!dx&&!dy)dx=-1;
  const trail=g.trail||[];
  const party=s.heroes||[{id:'kaida'},{id:'vex'},{id:'rune'}];
  party.forEach((h,i)=>{
    let pos={x:p.x+dx*i*30+(dy?(i%2?-27:27):0),y:p.y+dy*(i===1?29:35)+(dx?(i%2?17:-15):0),facing:face};
    if(i===0)pos={...p,facing:face};else if(trail.length){let distance=0,last=p;for(const q of trail){distance+=Math.hypot(q.x-last.x,q.y-last.y);last=q;if(distance>=i*28){pos=q;break;}}}
    if(i&&!walkable(s,pos.x,pos.y)){for(const [xx,yy]of [[(i===1?-1:1)*34,16],[(i===1?-1:1)*34,-16],[-30,0],[30,0],[0,25],[0,-25]])if(walkable(s,p.x+xx,p.y+yy)){pos={x:p.x+xx,y:p.y+yy,facing:face};break;}}
    const tx=pos.x,ty=pos.y;
    draws.push({y:ty+.5,draw:()=>{steppedEllipse(ctx,'#25263855',tx,ty+2,12,5);drawHero(ctx,h.id,heroState,tx,ty,.75,pos.facing||face,time+i*.12,{reducedMotion:!!s.settings?.reducedMotion});}});
  });
  draws.sort((a,b)=>a.y-b.y).forEach(o=>o.draw());
  if(!g.overlay){
    const near=objects.filter(o=>!(o.type==='chest'&&s.chests.includes(o.id))).map(o=>({o,d:Math.hypot(o.x-p.x,o.y-p.y)})).filter(v=>v.d<62).sort((a,b)=>a.d-b.d)[0];
    // The HUD owns the full interaction name. A small world pin identifies the
    // target without covering the party or duplicating its long prompt.
    if(near){const o=near.o,structure=o.type==='hall'||(o.type==='door'&&!o.exit),xx=o.x+(structure?-52:0),yy=o.y-(structure?63:o.exit?18:o.type==='anchor'||o.type==='encounter'||o.type==='plot'?86:o.type==='sign'?54:72);box(ctx,'#292536ed',xx-10,yy-10,21,21);box(ctx,'#d3ad77',xx-10,yy-10,21,2);text(ctx,'C',xx,yy+1,12,paper);}
  }
  // Sparse ambient motes drift over the world, never over the interface.
  if(!room&&!s.settings?.reducedMotion){const r=regionAt(p.x,p.y)||REGIONS[0];if(['forest','mire','crater','frost','crown'].includes(r.id)){ctx.save();ctx.globalAlpha=.55;for(let i=0;i<17;i++){const xx=cam.x+(i*73+Math.sin(time*.2+i)*17)%960,yy=cam.y+(i*89+time*(r.id==='frost'?11:-5)+1200)%600;box(ctx,r.palette.accent,xx,yy,r.id==='frost'?3:2,r.id==='frost'?2:3);}ctx.restore();}}
  ctx.restore();
  const shade=ctx.createLinearGradient(0,0,0,600);shade.addColorStop(0,'#14132326');shade.addColorStop(.25,'#14132300');shade.addColorStop(.8,'#14132300');shade.addColorStop(1,'#14132344');ctx.fillStyle=shade;ctx.fillRect(0,0,960,600);
}

export function drawBattleBackground(ctx,g){
  const id=g.battle?.encounter?.region||g.battle?.region||regionAt(g.s.party.x,g.s.party.y)?.id||'haventide';
  if(id==='haventide'){drawHaventideBattle(ctx,g);return;}
  const r=REGIONS.find(r=>r.id===id)||REGIONS[0],p=r.palette,t=g.time||0;
  const grad=ctx.createLinearGradient(0,0,0,460);grad.addColorStop(0,p.dark);grad.addColorStop(.48,p.ground);grad.addColorStop(1,p.road);ctx.fillStyle=grad;ctx.fillRect(0,0,960,600);
  // Newly drawn stage panorama uses the same biome language at combat scale.
  if(id==='crown'||id==='orbital'){
    for(let i=0;i<11;i++){const x=i*103-25,h=70+(i*37)%110;box(ctx,'#2d2b43',x,240-h,70,h);box(ctx,p.stone,x+8,245-h,50,h);for(let j=0;j<4;j++)box(ctx,p.accent,x+18+(j%2)*21,257-h+Math.floor(j/2)*25,8,14);}if(id==='orbital')drawElevator(ctx,630,169,p);
  }else if(id==='forest'||id==='mire'||id==='haventide'){
    for(let i=0;i<17;i++){const x=i*66-25,y=225+(i%3)*12;const sp=scenerySprite({type:'tree',variant:i%4},r);ctx.save();ctx.globalAlpha=.55;ctx.drawImage(sp,x-58,y-200,151,177);ctx.restore();}
  }else {
    for(let i=0;i<8;i++){const x=i*153-20,h=80+(i*29)%91;poly(ctx,p.dark,[[x-110,235],[x,235-h],[x+140,235]]);poly(ctx,p.stone,[[x-75,235],[x,239-h],[x+104,235]]);if(id==='frost')poly(ctx,'#d3e1d5',[[x-28,263-h],[x,239-h],[x+35,270-h],[x+14,264-h],[x+2,273-h],[x-8,266-h]]);}
  }
  box(ctx,p.dark,0,247,960,12);box(ctx,p.ground,0,259,960,200);box(ctx,p.road,0,304,960,155);
  for(let y=310;y<456;y+=23){line(ctx,'#ffffff0d',0,y,960,y,2);for(let x=0;x<960;x+=72)box(ctx,'#322b3a14',x+(y%46?28:0),y+4,2,16);}
  for(let i=0;i<15;i++){const x=i*71+19;box(ctx,p.light,x,266+(i%4)*10,12,3);box(ctx,p.dark,x+4,270+(i%4)*10,22,3);}
  if(id==='crater'){for(let i=0;i<8;i++){const x=(i*143+t*8)%960,y=210-(i*31+t*21)%180;box(ctx,'#ffc77d99',x,y,3,5);}}
  if(id==='frost'){for(let i=0;i<22;i++)box(ctx,'#e5eee3aa',(i*71+t*9)%960,(i*33+t*18)%340,3,2);}
  const vignette=ctx.createRadialGradient(480,280,120,480,260,630);vignette.addColorStop(0,'#201b3000');vignette.addColorStop(1,'#201b3066');ctx.fillStyle=vignette;ctx.fillRect(0,0,960,460);
}

export function drawMinimap(ctx,g,x=786,y=66,w=154,h=92){
  ctx.save();box(ctx,'#282535e8',x-4,y-4,w+8,h+8);box(ctx,'#b99b70',x-4,y-4,w+8,2);
  const scale=Math.min(w/WORLD_W,h/WORLD_H),ox=x+(w-WORLD_W*scale)/2,oy=y+(h-WORLD_H*scale)/2;
  for(const r of REGIONS){box(ctx,g.s.discovered?.includes(r.id)?r.palette.ground:'#494651',ox+r.x*scale,oy+r.y*scale,r.w*scale-1,r.h*scale-1);box(ctx,'#c4af8c55',ox+r.x*scale,oy+(r.y+310)*scale,r.w*scale,3);}
  for(const town of TOWNS)box(ctx,'#e4bc7b',ox+town.x*scale-2,oy+town.y*scale-2,4,4);
  for(const o of OBJECTS.filter(o=>o.type==='anchor'))box(ctx,g.s.flags[o.flag]?'#f8dca1':'#b1b4c5',ox+o.x*scale-1,oy+o.y*scale-1,3,3);
  const pp=g.s.party.interior?g.s.party.returnPoint||g.s.lastTown:g.s.party;box(ctx,'#272335',ox+pp.x*scale-3,oy+pp.y*scale-3,7,7);box(ctx,'#fc89c8',ox+pp.x*scale-2,oy+pp.y*scale-2,5,5);ctx.restore();
}
export function drawMap(ctx,g,rect={x:110,y:115,w:740,h:360},zoom=1,pan={x:0,y:0}){
  ctx.save();ctx.beginPath();ctx.rect(rect.x,rect.y,rect.w,rect.h);ctx.clip();box(ctx,'#272636',rect.x,rect.y,rect.w,rect.h);
  const k=Math.min(rect.w/WORLD_W,rect.h/WORLD_H)*zoom,ox=rect.x+(rect.w-WORLD_W*k)/2+(pan.x||0),oy=rect.y+(rect.h-WORLD_H*k)/2+(pan.y||0);
  for(const r of REGIONS){box(ctx,r.palette.ground,ox+r.x*k,oy+r.y*k,r.w*k-2,r.h*k-2);box(ctx,r.palette.road,ox+r.x*k,oy+(r.y+308)*k,r.w*k,24*k);box(ctx,r.palette.road,ox+(r.x+388)*k,oy+r.y*k,24*k,r.h*k);text(ctx,r.name,ox+(r.x+400)*k,oy+(r.y+105)*k,Math.max(10,13*Math.min(zoom,1.5)),paper);}
  for(const o of OBJECTS.filter(o=>['anchor','door','chest'].includes(o.type))){const xx=ox+o.x*k,yy=oy+o.y*k;box(ctx,o.type==='anchor'?'#f3ca89':o.type==='door'?'#dec9a3':'#b6bd93',xx-2,yy-2,4,4);}
  const p=g.s.party.interior?g.s.party.returnPoint||g.s.lastTown:g.s.party;oval(ctx,'#3a2b4299',ox+p.x*k,oy+p.y*k,8,8);oval(ctx,'#fa8bc8',ox+p.x*k,oy+p.y*k,4,4);ctx.restore();
}
