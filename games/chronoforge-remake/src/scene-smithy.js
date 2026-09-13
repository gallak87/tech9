// Wayfarer Smithy. Authored at room resolution; the renderer caches this scene.
// Furniture stays inside the existing navigation footprints in world.js.
const P={void:'#171b25',joint:'#292b31',stone:['#535054','#5c5656','#625b59','#69605b','#71655c'],iron:'#292e38',steel:'#778c9b',edge:'#b9c3c0',wood:'#685044',brass:'#ae8651'};
const rect=(c,col,x,y,w,h)=>{c.fillStyle=col;c.fillRect(Math.round(x),Math.round(y),Math.round(w),Math.round(h));};
function random(seed){return()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};}
function blend(a,b,t){const aa=parseInt(a.slice(1),16),bb=parseInt(b.slice(1),16);return '#'+[16,8,0].map(s=>Math.round(((aa>>s)&255)*(1-t)+((bb>>s)&255)*t).toString(16).padStart(2,'0')).join('');}
// Scan conversion keeps all authored edges on the same one-pixel grid as art.
function shape(c,col,points){
  c.fillStyle=col;const low=Math.floor(Math.min(...points.map(p=>p[1]))),high=Math.ceil(Math.max(...points.map(p=>p[1])));
  for(let y=low;y<high;y++){const xs=[];for(let i=0,j=points.length-1;i<points.length;j=i++){
    const a=points[j],b=points[i];if((a[1]<=y+.5&&b[1]>y+.5)||(b[1]<=y+.5&&a[1]>y+.5))xs.push(a[0]+(y+.5-a[1])*(b[0]-a[0])/(b[1]-a[1]));
  }xs.sort((a,b)=>a-b);for(let i=0;i+1<xs.length;i+=2)c.fillRect(Math.round(xs[i]),y,Math.max(0,Math.round(xs[i+1])-Math.round(xs[i])),1);}
}
function stroke(c,col,x0,y0,x1,y1,width=1){
  x0=Math.round(x0);y0=Math.round(y0);x1=Math.round(x1);y1=Math.round(y1);const dx=Math.abs(x1-x0),sx=x0<x1?1:-1,dy=-Math.abs(y1-y0),sy=y0<y1?1:-1;let error=dx+dy;
  for(;;){rect(c,col,x0,y0,width,width);if(x0===x1&&y0===y1)break;const twice=2*error;if(twice>=dy){error+=dy;x0+=sx;}if(twice<=dx){error+=dx;y0+=sy;}}
}
function ellipse(c,col,x,y,rx,ry){for(let yy=-ry;yy<=ry;yy++){const half=Math.floor(rx*Math.sqrt(Math.max(0,1-yy*yy/(ry*ry))));rect(c,col,x-half,y+yy,half*2+1,1);}}
function rivet(c,x,y,warm=false){rect(c,'#242934',x,y,3,3);rect(c,warm?'#c1a06c':'#9da9aa',x,y,2,1);rect(c,warm?'#786244':'#5b6874',x+1,y+1,1,1);}

function flagstones(c){
  const rnd=random(84011);rect(c,P.joint,45,120,630,318);
  let row=0;
  for(let y=123;y<438;row++){
    const h=Math.min(438-y,14+Math.floor((y-123)*.025)+Math.floor(rnd()*6));let x=45-Math.floor(rnd()*35);
    while(x<675){
      const w=29+Math.floor(rnd()*34)+(y>260?6:0),l=Math.max(x+1,46),r=Math.min(x+w-1,674),top=y+1,bottom=y+h-1;
      if(r-l>5){
        const warmth=Math.max(0,1-Math.hypot((l+r)/2-135,(top+bottom)/2-211)/200)*.28;
        let base=blend(P.stone[Math.floor(rnd()*P.stone.length)],'#b18b5b',warmth);
        if((l+r)/2>480)base=blend(base,'#475964',.18);
        const chip=2+Math.floor(rnd()*3),pts=[[l+chip,top],[r-2,top],[r,top+3],[r-1,bottom-2],[r-5,bottom],[l+2,bottom],[l,bottom-3],[l,top+3]];
        shape(c,base,pts);
        stroke(c,blend(base,'#c3b397',.21),l+chip,top,r-5,top);
        stroke(c,blend(base,'#978f7e',.14),l+1,top+3,l+1,bottom-4);
        stroke(c,blend(base,'#202631',.28),l+4,bottom-1,r-5,bottom-1);
        const scratchX=l+5+Math.floor(rnd()*Math.max(1,r-l-17)),scratchY=top+4+Math.floor(rnd()*Math.max(1,h-8));
        stroke(c,blend(base,'#b5aaa0',.13),scratchX,scratchY,Math.min(scratchX+10+Math.floor(rnd()*9),r-3),scratchY-1);
        for(let n=0;n<3;n++){const xx=l+3+Math.floor(rnd()*Math.max(1,r-l-6)),yy=top+3+Math.floor(rnd()*Math.max(1,h-6));rect(c,n%2?blend(base,'#272b32',.18):blend(base,'#aba392',.16),xx,yy,n===1?2:1,1);}
        if(rnd()<.19){const q=l+Math.floor((r-l)*.6);stroke(c,'#39383b',q,top+1,q-3,top+5);stroke(c,'#434043',q-3,top+5,q+2,top+9);}
      }x+=w;
    }y+=h;
  }
  // Cool daylight falls across the floor from the deep window reveals.
  shape(c,'#9bbbc009',[[100,119],[142,119],[252,301],[183,309]]);
  shape(c,'#8db1c110',[[561,118],[594,118],[667,272],[616,283]]);
  stroke(c,'#97b4bd0e',118,123,224,302,2);
  // Scuffed hearth apron and a trail of cold scale around the anvil.
  for(let i=0;i<170;i++){
    const x=81+Math.floor(rnd()*208),y=221+Math.floor(rnd()*114);
    if(Math.hypot((x-156)/1.4,y-240)<65||Math.hypot(x-266,y-303)<31)rect(c,i%5?'#252b343c':'#ac957c33',x,y,1+Math.floor(rnd()*3),1);
  }
  // Contact darkness along the wall is narrow, so the walking floor stays clear.
  for(let i=0;i<7;i++){rect(c,`rgba(14,19,27,${.17-i*.019})`,46,123+i,628,1);rect(c,`rgba(14,19,27,${.20-i*.022})`,46+i,129,1,307);rect(c,`rgba(14,19,27,${.21-i*.023})`,673-i,129,1,307);}
}

function beam(c,x,y,w,h,vertical=false){
  rect(c,'#211f28',x-1,y+2,w+3,h+3);rect(c,'#473a36',x,y,w,h);rect(c,'#75604b',x,y,vertical?2:w,vertical?h:2);rect(c,'#8a7256',x+1,y+1,vertical?1:w-2,vertical?h-2:1);
  if(vertical){for(let n=3;n<w-1;n+=3)stroke(c,n%2?'#302d2d':'#5b493c',x+n,y+5,x+n-1,y+h-4);}
  else for(let n=4;n<h-1;n+=3)stroke(c,n%2?'#352e2c':'#58463b',x+4,y+n,x+w-4,y+n-1);
  if(vertical){for(const yy of [y+7,y+h-12]){rect(c,'#30333a',x,yy,w,5);rivet(c,x+Math.floor(w/2)-1,yy+1);}}
  else for(const xx of [x+9,x+w-14]){rect(c,'#30333a',xx,y,5,h);rivet(c,xx+1,y+3);}
}

function window(c,x){
  // Arched, deeply recessed leaded glass: narrow lit edges, a dark lower sill.
  shape(c,'#202633',[[x-25,111],[x-25,86],[x-20,78],[x-11,74],[x+12,74],[x+21,79],[x+26,87],[x+26,111]]);
  shape(c,'#8c816b',[[x-27,111],[x-27,86],[x-21,77],[x-12,72],[x+12,72],[x+23,78],[x+28,87],[x+28,112],[x+25,110],[x+24,88],[x+19,81],[x+10,77],[x-10,77],[x-19,81],[x-23,88],[x-23,111]]);
  shape(c,'#5a7a8a',[[x-20,108],[x-20,87],[x-16,81],[x-8,78],[x+9,78],[x+17,83],[x+21,88],[x+21,108]]);
  shape(c,'#78999e',[[x-18,87],[x-14,82],[x-7,80],[x+8,80],[x+16,85],[x+19,89],[x+19,97],[x-18,100]]);
  for(const [dx,yy,hh]of [[-17,99,9],[-10,94,14],[-3,102,6],[5,96,12],[13,100,8]])rect(c,'#3c5365',x+dx,yy,4,hh);
  stroke(c,'#abc5bb',x-17,88,x-17,98);stroke(c,'#a6beba',x+8,82,x+16,91);
  for(const d of [-21,-9,3,15]){stroke(c,'#344754',x+d,87,x+d+15,106);stroke(c,'#394b57',x+d,107,x+d+15,88);}
  rect(c,'#b3a284',x-1,79,2,31);rect(c,'#756854',x+1,80,1,30);rect(c,'#b4a68b',x-21,95,43,2);
  rect(c,'#312d32',x-28,111,57,6);rect(c,'#9b8b72',x-28,110,57,2);rect(c,'#65564b',x-25,113,52,2);
}

function walls(c){
  const rnd=random(338);rect(c,'#242430',29,64,662,386);rect(c,'#403b3d',35,68,650,376);
  rect(c,'#33343a',43,72,634,54);
  for(let row=0;row<4;row++)for(let x=44-(row%2)*20;x<677;x+=39+row%2*4){
    const y=75+row*12,w=Math.min(37,676-Math.max(44,x));if(w<1)continue;const xx=Math.max(44,x),base=P.stone[Math.floor(rnd()*3)];
    shape(c,base,[[xx+1,y],[xx+w-1,y],[xx+w,y+2],[xx+w-1,y+10],[xx+2,y+11],[xx,y+9],[xx,y+2]]);
    stroke(c,'#91816b66',xx+3,y+1,xx+w-3,y+1);rect(c,'#22273355',xx+4,y+9,Math.max(1,w-7),1);
    if(rnd()<.5){rect(c,'#82756555',xx+5,y+4,3,1);rect(c,'#2d303655',xx+w-9,y+6,4,1);}
  }
  beam(c,39,66,642,7);beam(c,40,119,640,8);
  for(const x of [43,209,495,664])beam(c,x,71,11,54,true);
  window(c,125);window(c,578);
  // Small maker's plaque, inset into the stone rather than printed across it.
  shape(c,'#292b31',[[243,87],[472,87],[478,93],[478,112],[240,112],[240,92]]);
  rect(c,'#74634b',243,88,229,1);rect(c,'#181f29',244,108,229,2);
  c.save();c.font='8px Georgia, serif';c.textAlign='center';c.textBaseline='middle';c.fillStyle='#bcaa87';c.fillText('NOTHING WORTH SAVING IS BEYOND REPAIR',359,99);c.restore();
  for(const x of [245,469])rivet(c,x,93,true);
  // Steel maker's mark above the plaque: a hammer crossed with forging tongs.
  stroke(c,'#202631',352,76,365,87,3);stroke(c,'#9a9f95',352,76,365,87);rect(c,'#8d9c9d',348,74,8,3);rect(c,'#bbc2ad',349,74,6,1);
  stroke(c,'#606f7b',364,75,352,87);stroke(c,'#a6aa97',366,76,354,88);
  // Masonry side cutaways are above the floor bounds, never new obstacles.
  for(const x of [36,677])for(let y=127;y<438;y+=19){rect(c,'#595252',x,y,7,18);rect(c,'#897762',x,y,1,16);rect(c,'#282d35',x+6,y,1,19);rect(c,'#776650',x+1,y,5,1);}
  beam(c,34,438,293,9);beam(c,394,438,292,9);
  rect(c,'#1d2530',326,428,68,20);shape(c,'#8e897a',[[329,428],[391,428],[395,434],[326,434]]);rect(c,'#b6aa8b',330,428,60,1);rect(c,'#625f5a',331,435,60,8);rect(c,'#929080',335,436,51,1);rect(c,'#3c4147',334,441,53,2);
}

function runner(c){
  const rnd=random(61);
  shape(c,'#21273055',[[317,182],[399,182],[405,417],[315,420]]);
  shape(c,'#584348',[[321,181],[397,181],[400,412],[396,416],[321,416],[319,407]]);
  for(let y=183;y<416;y+=2){rect(c,(y-183)%4?'#67504d':'#61484b',323,y,72,1);if(y%6===1)rect(c,'#443b43',324,y,69,1);}
  for(const x of [323,390]){rect(c,'#9c8060',x,183,3,230);rect(c,'#413a40',x+3,184,1,229);for(let y=186;y<413;y+=8){rect(c,'#c0a47b',x,y,2,2);rect(c,'#6e574a',x+1,y+3,2,3);}}
  for(let y=202;y<405;y+=35){shape(c,'#3e3740',[[359,y-10],[369,y],[359,y+10],[349,y]]);shape(c,'#8e7057',[[359,y-8],[367,y],[359,y+8],[351,y]]);shape(c,'#60494a',[[359,y-5],[364,y],[359,y+5],[354,y]]);rect(c,'#b18f64',359,y-1,1,2);}
  // Frayed hem and worn weave break the repeated ornament into a used object.
  for(let x=322;x<398;x+=3){const h=2+Math.floor(rnd()*4);rect(c,x%2?'#9f876b':'#66564e',x,416,1,h);}
  for(let i=0;i<135;i++){const x=329+Math.floor(rnd()*57),y=190+Math.floor(rnd()*218);rect(c,i%3?'#b39a7724':'#2b30352b',x,y,1+Math.floor(rnd()*3),1);}
}

function forge(c){
  shape(c,'#101b293c',[[78,232],[189,228],[238,258],[224,269],[102,253]]);
  // Buttressed firebrick body with a stepped chimney hood and a heavy plinth.
  shape(c,'#282932',[[78,137],[88,129],[174,129],[187,140],[193,225],[194,236],[185,242],[78,242],[73,235]]);
  shape(c,'#5f5854',[[79,139],[88,131],[172,131],[184,140],[187,229],[178,235],[80,235]]);
  shape(c,'#443f41',[[176,134],[187,143],[191,228],[180,235],[179,159]]);
  const rnd=random(506);
  for(let row=0;row<8;row++){
    const y=136+row*12;
    for(let j=0;j<4;j++){
      const x=80+j*26-(row%2?8:0),l=Math.max(80,x),r=Math.min(179,x+24);if(r<=l)continue;
      const col=blend(['#736657','#645b52','#80705a','#5c5550'][(j+row)%4],'#302f34',Math.max(0,1-Math.abs((l+r)/2-133)/50)*.30);
      shape(c,col,[[l+1,y],[r-1,y],[r,y+3],[r-1,y+10],[l+2,y+10],[l,y+8],[l,y+2]]);stroke(c,'#b09a7455',l+2,y,r-2,y);rect(c,'#30323988',l+3,y+9,Math.max(1,r-l-5),1);
      rect(c,'#ba977144',l+2+Math.floor(rnd()*Math.max(1,r-l-5)),y+4,2,1);
    }
  }
  // The hood carries tapered soot, individual seams and a forged iron lintel.
  shape(c,'#36363a99',[[106,133],[157,133],[165,177],[102,177]]);
  for(let i=0;i<19;i++){const x=104+(i*13)%59;stroke(c,'#252a3277',x,140+(i%4)*3,x-2,174-(i%3)*4);}
  rect(c,'#2b3038',79,162,102,4);rect(c,'#777467',80,162,101,1);
  for(const x of [84,108,151,175])rivet(c,x,163);
  // Vaulted opening, solid voussoirs and a central wedge-shaped keystone.
  const arch=[[95,229],[95,194],[98,184],[105,175],[118,169],[139,168],[153,174],[163,183],[168,194],[168,229]];
  shape(c,'#b08b61',arch);
  shape(c,'#55443c',[[100,229],[100,195],[104,184],[116,176],[130,173],[144,177],[157,188],[162,200],[162,229]]);
  for(const [x0,y0,x1,y1]of [[97,190,105,193],[103,178,111,184],[116,171,120,179],[139,171,136,179],[153,180,146,186],[163,193,154,197]])stroke(c,'#332e32',x0,y0,x1,y1,2);
  shape(c,'#bba17c',[[122,170],[135,169],[133,181],[125,182]]);stroke(c,'#dbbd89',123,170,134,170);
  shape(c,'#1c222a',[[105,227],[105,200],[108,191],[115,185],[127,181],[137,182],[148,188],[154,198],[158,226]]);
  shape(c,'#542f2a',[[107,226],[108,203],[119,194],[142,195],[154,206],[155,226]]);
  shape(c,'#9b422a',[[108,225],[111,211],[115,207],[114,198],[123,204],[130,191],[134,204],[142,199],[147,211],[153,218],[153,227]]);
  shape(c,'#d66532',[[111,225],[116,218],[114,211],[121,214],[125,198],[127,208],[132,214],[138,204],[139,215],[147,219],[151,225]]);
  shape(c,'#e99043',[[116,225],[120,219],[122,208],[127,218],[133,220],[137,210],[139,220],[147,226]]);
  shape(c,'#f8c76f',[[122,226],[123,217],[127,222],[130,213],[133,224],[138,220],[141,226]]);
  rect(c,'#ffdfa0',126,225,10,2);rect(c,'#ffd391',130,220,2,4);
  // Black coals retain separate planes and small incandescences.
  for(let i=0;i<17;i++){const x=106+(i*17)%50,y=225+(i*7)%6;shape(c,i%3?'#332c2d':'#492f29',[[x,y],[x+4,y-2],[x+8,y+1],[x+6,y+4],[x,y+3]]);rect(c,i%4?'#b9572e':'#f2b660',x+2,y,3,1);}
  rect(c,'#241f25',100,232,64,3);rect(c,'#a58a66',77,234,107,3);rect(c,'#c6a078',79,234,95,1);rect(c,'#51443d',76,238,111,3);
  // Compact leather bellows, brass nozzle and a coal basket share the hearth.
  shape(c,'#302d30',[[176,204],[184,204],[192,215],[190,228],[180,229],[172,221]]);
  shape(c,'#765045',[[178,205],[183,206],[188,215],[187,225],[180,224],[175,218]]);
  for(let y=211;y<224;y+=3)stroke(c,'#a47554',177,y,187,y+2);
  stroke(c,'#b18b58',174,218,165,222,2);stroke(c,'#665448',183,204,183,201,2);rect(c,'#af8a5b',179,202,9,2);
  shape(c,'#272b32',[[169,228],[191,228],[188,238],[173,238]]);rect(c,'#736858',170,228,20,2);for(let x=174;x<189;x+=4){rect(c,'#514f48',x,230,2,6);rect(c,'#1c2631',x-1,226,4,3);}
}

function anvil(c){
  ellipse(c,'#14202b55',265,322,38,6);
  // Iron-bound oak stump supports a forged waist, heel and tapering horn.
  shape(c,'#382e2d',[[248,295],[278,294],[287,303],[286,320],[276,323],[247,320],[241,311],[243,303]]);
  shape(c,'#6e5140',[[246,303],[258,299],[279,301],[283,307],[283,318],[273,321],[247,318]]);
  ellipse(c,'#99734d',263,303,19,6);ellipse(c,'#796044',263,303,14,4);ellipse(c,'#ac8858',263,302,10,2);stroke(c,'#433734',258,300,262,306);stroke(c,'#4b3731',269,301,278,304);
  for(const x of [249,256,264,273,280]){stroke(c,'#402f2d',x,307,x+1,318);stroke(c,'#ad7b4a',x+2,308,x+2,315);}
  shape(c,'#30343b',[[245,310],[251,312],[282,311],[283,314],[250,315],[245,313]]);for(const x of [251,265,278])rivet(c,x,312,true);
  shape(c,'#252d38',[[229,277],[297,277],[298,285],[284,290],[281,297],[285,303],[279,307],[252,306],[247,302],[253,296],[251,289],[239,288],[224,283]]);
  shape(c,'#617686',[[230,279],[294,279],[294,283],[282,287],[273,289],[270,297],[280,302],[275,304],[254,303],[260,297],[260,287],[241,286],[229,282]]);
  shape(c,'#a7b4b4',[[232,278],[294,278],[289,281],[248,282],[230,281]]);
  shape(c,'#7f929a',[[224,282],[230,279],[248,282],[241,285],[232,284]]);
  shape(c,'#3d5060',[[269,287],[282,285],[278,296],[283,301],[273,303],[266,300]]);
  stroke(c,'#aab9b8',254,303,276,304);stroke(c,'#435360',249,283,287,282);rect(c,'#233540',285,279,3,2);rect(c,'#a3b7bc',262,290,1,6);rect(c,'#c7b992',233,280,9,1);
  // An unfinished small blade and its peen hammer rest across the face.
  shape(c,'#d5a060',[[252,278],[270,276],[276,278],[254,280]]);rect(c,'#ffcf87',256,278,12,1);stroke(c,'#674d3c',282,279,291,275,2);rect(c,'#71818a',286,273,7,3);rect(c,'#bcc5b8',287,273,5,1);
}

function bench(c){
  shape(c,'#101d2b3b',[[505,213],[622,211],[636,229],[517,231]]);
  // Backboard: weathered narrow boards, pegs, a saw, tongs and finished blades.
  rect(c,'#252a32',507,140,113,41);
  for(let x=509;x<619;x+=12){rect(c,x%3?'#624c3e':'#594538',x,142,11,36);rect(c,'#947453',x,142,1,35);stroke(c,'#3d3431',x+7,145,x+6,174);}
  rect(c,'#8a6c49',508,143,111,2);rect(c,'#3c3431',508,176,111,4);
  for(const x of [513,535,558,582,607])rivet(c,x,145,true);
  // The first two blades have distinct leaf and straight profiles.
  shape(c,'#303942',[[521,151],[524,151],[527,169],[523,174],[519,169]]);shape(c,'#adbdba',[[522,152],[523,152],[525,167],[523,171],[523,164]]);shape(c,'#657e8d',[[521,154],[523,163],[523,171],[520,167]]);rect(c,'#b48e57',518,152,10,2);rect(c,'#4d382e',522,148,2,4);rect(c,'#d0b378',521,148,4,1);
  shape(c,'#c1c9c0',[[540,152],[543,152],[543,170],[541,174],[540,170]]);rect(c,'#617f91',542,153,1,16);rect(c,'#a67d4b',537,150,10,2);rect(c,'#392f2d',541,147,2,3);
  stroke(c,'#263240',555,151,559,173,2);stroke(c,'#8294a1',555,152,559,172);stroke(c,'#455461',561,151,557,172,2);rect(c,'#a5aaa0',557,159,3,2);stroke(c,'#a6b1ad',555,151,551,150);stroke(c,'#a6b1ad',562,151,566,150);
  // Wooden saw grip and individually toothed steel edge.
  shape(c,'#788996',[[576,153],[602,156],[600,165],[573,159]]);stroke(c,'#bec5b8',577,153,601,156);for(let x=575;x<601;x+=3)rect(c,'#364553',x,159+Math.floor((x-575)*.21),2,2);rect(c,'#9a734a',572,151,5,9);rect(c,'#352d2b',573,153,2,4);
  // Bench slab: bevels, end grain, split planks, mortised frame and iron vice.
  shape(c,'#2b2b30',[[505,179],[618,177],[622,204],[619,215],[507,217]]);
  shape(c,'#896542',[[508,180],[616,179],[619,203],[509,207]]);
  for(let j=0;j<4;j++){const yy=182+j*6;stroke(c,j%2?'#c69b60':'#684a36',510,yy,617,yy-2);stroke(c,'#6c4d39',516,yy+3,610,yy+2);}
  stroke(c,'#d7ab6c',508,180,617,178);stroke(c,'#c4985d',510,205,619,202);shape(c,'#62452f',[[509,207],[619,204],[617,212],[510,215]]);stroke(c,'#9c7349',511,210,617,207);
  for(const x of [511,605]){rect(c,'#3a3030',x,211,7,11);rect(c,'#94724b',x+1,213,2,8);rivet(c,x+2,213,true);}
  stroke(c,'#312d30',518,219,606,218,3);stroke(c,'#7d5a3b',519,218,605,217);
  // Blade on the work surface with facets, a wrapped grip and a brass guard.
  shape(c,'#33414d',[[528,196],[559,182],[566,182],[562,187],[532,199]]);shape(c,'#8ea7b1',[[531,195],[559,183],[564,183],[532,197]]);stroke(c,'#d3d0b5',532,195,562,183);stroke(c,'#af8a54',528,192,532,201,2);stroke(c,'#553c31',519,201,529,197,3);for(const x of [521,525])stroke(c,'#ad8253',x,200,x+1,198);
  // A rolled plan, a coil of wire and three small chisels.
  shape(c,'#c1ae82',[[574,190],[594,188],[599,200],[578,203]]);stroke(c,'#ead8a2',575,190,593,189);stroke(c,'#7d725b',582,194,591,192);stroke(c,'#7d725b',583,197,594,196);rect(c,'#685544',577,191,2,9);
  ellipse(c,'#2d3439',603,194,7,3);ellipse(c,'#9b7847',603,193,6,2);ellipse(c,'#504139',603,193,4,1);stroke(c,'#bd995c',604,193,611,189);
  for(let i=0;i<3;i++){stroke(c,'#4a3830',554+i*5,204,558+i*5,197,2);stroke(c,'#b2b9ad',558+i*5,197,560+i*5,194);}
  shape(c,'#333b43',[[608,202],[620,201],[621,211],[616,215],[610,211]]);rect(c,'#aab4b3',610,201,10,2);rect(c,'#5c717e',612,205,6,6);stroke(c,'#a8b2ad',609,211,623,214);rect(c,'#b9b8a4',622,213,2,3);
}

export function drawHaventideSmithy(c){
  c.save();c.imageSmoothingEnabled=false;rect(c,P.void,0,0,720,480);
  // A dim cool border lets the lighter working floor read as a sunken room.
  rect(c,'#1b202b',22,58,678,400);rect(c,'#222632',26,62,671,394);
  flagstones(c);walls(c);runner(c);
  // Static bounce light is deliberately subordinate to the characters.
  c.save();c.beginPath();c.rect(45,127,630,301);c.clip();
  ellipse(c,'#db86440a',142,227,133,71);ellipse(c,'#e59b4d0b',140,228,89,47);ellipse(c,'#f6b9680b',135,233,58,23);
  c.restore();
  forge(c);anvil(c);bench(c);
  c.restore();
}

export function drawSmithyAtmosphere(c,time=0,reducedMotion=false){
  c.save();
  // A few discrete fire pixels and drifting sparks, never a full-screen filter.
  const frame=reducedMotion?1:Math.floor(time*5)%4;
  const tongues=[[[121,210],[124,201],[126,211]],[[134,213],[137,203],[139,215]],[[115,217],[117,208],[120,218]],[[139,218],[141,208],[144,220]]];
  shape(c,'#f3b45b',tongues[frame]);rect(c,'#ffe1a0',126+frame,223-frame%2,2,2);
  if(!reducedMotion)for(let i=0;i<5;i++){
    const phase=(time*.23+i*.193)%1,x=115+i*8+Math.round(Math.sin(phase*8+i)*3),y=221-Math.round(phase*31);
    c.globalAlpha=(1-phase)*.75;rect(c,i%2?'#fcd58c':'#eaa558',x,y,1,i===1?2:1);
  }
  c.restore();
}
