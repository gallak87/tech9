import { drawRasterIcon } from './raster-icons.js';

// Generated resources, consumables and accessories use detailed local raster
// art. The original 32×32 weapon/armor recipes remain unchanged.
const P = {
  ink: '#101e23', edge: '#1b3036', deep: '#29464d', steel: '#577780', blue: '#7b9ea4',
  silver: '#adbec0', ivory: '#e8e1c7', white: '#fff4d5', bone: '#b5af91',
  copperDark: '#613f31', copper: '#aa7048', gold: '#d3ad68', lightGold: '#f3d99a',
  tealDark: '#315d59', teal: '#538d82', mint: '#91c7b6', ice: '#c4e6dc',
  roseDark: '#693548', rose: '#cc5775', pink: '#ec94a8', ember: '#df7749',
  leafDark: '#354d38', leaf: '#788c50', leafLight: '#b2bc75', leather: '#785943',
};
const cache = new Map();
function painter(c) {
  const r = (x,y,w,h,color) => { c.fillStyle=color; c.fillRect(x,y,w,h); };
  const p = (points,color) => {
    const top=Math.max(0,Math.floor(Math.min(...points.map(p=>p[1]))));
    const bottom=Math.min(32,Math.ceil(Math.max(...points.map(p=>p[1]))));
    for(let y=top;y<bottom;y++){
      const yy=y+.5,cross=[];
      for(let i=0,j=points.length-1;i<points.length;j=i++){
        const [ax,ay]=points[j],[bx,by]=points[i];
        if((ay<=yy&&by>yy)||(by<=yy&&ay>yy))cross.push(ax+(yy-ay)*(bx-ax)/(by-ay));
      }
      cross.sort((a,b)=>a-b);
      for(let i=0;i+1<cross.length;i+=2){const x=Math.ceil(cross[i]-.5),end=Math.ceil(cross[i+1]-.5);if(end>x)r(x,y,end-x,1,color);}
    }
  };
  const l = (x0,y0,x1,y1,color,width=1) => {
    let dx=Math.abs(x1-x0),sx=x0<x1?1:-1,dy=-Math.abs(y1-y0),sy=y0<y1?1:-1,err=dx+dy;
    const offset=Math.floor(width/2);
    for(;;){r(x0-offset,y0-offset,width,width,color);if(x0===x1&&y0===y1)break;const e=2*err;if(e>=dy){err+=dy;x0+=sx;}if(e<=dx){err+=dx;y0+=sy;}}
  };
  const e = (x,y,rx,ry,color) => {
    for(let yy=-ry;yy<=ry;yy++){const xx=Math.floor(rx*Math.sqrt(Math.max(0,1-yy*yy/(ry*ry))));r(x-xx,y+yy,xx*2+1,1,color);}
  };
  const gem = (x,y,w,h,color=P.teal,shine=P.ice) => {
    p([[x+w/2,y],[x+w,y+h*.42],[x+w*.67,y+h],[x+w*.27,y+h],[x,y+h*.45]],P.ink);
    p([[x+w/2,y+1],[x+w-1,y+h*.43],[x+w*.63,y+h-1],[x+w*.3,y+h-1],[x+1,y+h*.44]],color);
    p([[x+w/2,y+1],[x+w*.42,y+h*.48],[x+1,y+h*.44]],shine);
    l(Math.round(x+w*.43),Math.round(y+h*.48),Math.round(x+w*.63),Math.round(y+h-2),shine);
  };
  const rivet=(x,y)=>{r(x,y,2,2,P.copperDark);r(x,y,1,1,P.lightGold);};
  const star=(x,y,color=P.white)=>{r(x,y-3,1,7,color);r(x-3,y,7,1,color);r(x-1,y-1,3,3,color);};
  const clear=(x,y,w,h)=>c.clearRect(x,y,w,h);
  return {r,p,l,e,gem,rivet,star,clear};
}

function sword(d,kind){
  const {r,p,l,rivet}=d;
  l(6,26,12,19,P.ink,5);l(6,25,12,19,P.leather,3);
  l(5,27,7,25,P.gold,3);r(5,25,1,2,P.lightGold);
  l(7,23,9,25,P.copperDark);l(9,21,11,23,P.copperDark);
  p([[10,18],[22,4],[29,2],[27,9],[15,23]],P.ink);
  if(kind==='magma'){
    p([[11,18],[23,5],[28,3],[25,10],[15,22]],P.deep);
    l(13,18,25,5,P.rose);l(15,19,18,14,P.ember);l(18,14,22,12,P.ember);r(22,8,1,3,P.lightGold);
  }else if(kind==='horizon'){
    p([[11,18],[22,5],[28,3],[26,8],[15,22]],P.gold);
    l(12,18,26,4,P.ivory,2);l(14,20,26,7,P.teal);l(15,19,24,9,P.rose);
    p([[6,16],[11,16],[16,21],[16,27],[12,23],[9,20]],P.ink);
    l(7,17,15,25,P.gold,2);r(10,18,2,2,P.rose);r(13,22,2,1,P.mint);
  }else{
    p([[11,18],[23,5],[28,3],[26,8],[15,22]],kind==='signal'?P.tealDark:P.steel);
    p([[11,18],[23,5],[27,4],[14,20]],P.ivory);
    l(14,19,25,7,kind==='signal'?P.mint:P.silver);
    if(kind==='signal'){l(16,16,25,6,P.teal);r(20,11,1,2,P.white);}
  }
  if(kind!=='horizon'){l(7,16,17,25,P.ink,4);l(7,16,17,25,P.copper,2);l(8,16,16,23,P.gold);rivet(11,19);}
}
function vest(d,kind){
  const {r,p,l,rivet}=d;
  p([[9,3],[13,2],[15,6],[18,6],[20,2],[24,3],[29,10],[25,15],[23,28],[9,28],[7,15],[3,10]],P.ink);
  if(kind==='scrap'){
    p([[9,4],[13,4],[14,8],[19,8],[21,4],[24,5],[27,10],[23,14],[22,26],[10,26],[9,13],[5,10]],P.leather);
    p([[9,9],[16,10],[16,18],[10,19]],P.steel);p([[17,9],[24,8],[23,16],[17,17]],P.silver);
    p([[10,20],[16,19],[17,26],[10,26]],P.bone);p([[18,18],[23,17],[22,26],[18,26]],P.deep);
    l(10,10,14,11,P.ivory);l(18,10,22,9,P.white);rivet(11,16);rivet(20,14);rivet(20,23);r(7,9,2,2,P.copper);
  }else if(kind==='bio'){
    p([[9,5],[12,4],[14,9],[19,9],[21,4],[24,5],[27,10],[23,13],[22,26],[10,26],[9,13],[5,10]],P.tealDark);
    l(16,10,16,26,P.gold);for(let y=11;y<25;y+=4){p([[15,y],[10,y-2],[11,y+2],[15,y+3]],P.leaf);p([[17,y+2],[22,y],[21,y+4],[17,y+5]],P.mint);}
    l(11,8,13,10,P.leafLight);l(21,8,19,10,P.leafLight);r(15,8,3,3,P.rose);r(16,8,1,1,P.pink);
  }else{
    p([[9,4],[13,3],[14,8],[19,8],[21,3],[24,4],[27,10],[23,13],[22,25],[16,29],[10,25],[9,13],[5,10]],P.steel);
    p([[10,8],[15,10],[16,26],[11,23]],P.ice);p([[17,10],[23,8],[21,23],[17,27]],P.blue);
    p([[4,9],[8,4],[11,5],[10,11],[7,13]],P.silver);p([[21,5],[24,4],[28,9],[25,13],[22,11]],P.ice);
    l(11,9,14,10,P.white);l(18,11,20,10,P.white);l(11,18,14,20,P.blue);l(18,20,21,17,P.ice);r(15,12,2,4,P.tealDark);
  }
}
function prism(d,quiet){
  const {p,l,r,e}=d;
  e(16,6,4,4,P.ink);e(16,6,2,2,P.gold);e(16,6,1,1,P.ink);
  p([[15,8],[25,14],[22,25],[16,30],[7,24],[6,15]],P.ink);
  p([[15,9],[24,15],[21,24],[16,28],[8,23],[7,15]],quiet?P.deep:P.teal);
  p([[15,10],[15,20],[8,15]],quiet?P.blue:P.ice);
  p([[16,10],[23,15],[17,20]],quiet?P.tealDark:P.gold);
  p([[8,17],[14,21],[16,27],[9,23]],quiet?P.steel:P.mint);
  l(16,12,16,27,quiet?P.silver:P.ivory);
  if(quiet){e(19,20,3,4,P.ice);e(20,18,3,3,P.deep);r(11,18,1,1,P.white);}
  else{r(10,17,2,3,P.white);r(18,16,2,3,P.white);r(18,23,2,2,P.pink);l(11,22,13,23,P.gold);}
}
const recipes={
  iron_blade:d=>sword(d,'iron'),
  signal_saber:d=>sword(d,'signal'),
  magma_blade:d=>sword(d,'magma'),
  horizon_edge:d=>sword(d,'horizon'),
  scrap_vest:d=>vest(d,'scrap'),
  bio_weave:d=>vest(d,'bio'),
  frost_plate:d=>vest(d,'frost'),
  witness_prism:d=>prism(d,false),
  quiet_prism:d=>prism(d,true),
  void_shard({r,p,l,gem}){
    p([[8,2],[13,4],[12,15],[16,19],[20,14],[21,2],[26,4],[24,18],[19,24],[19,30],[13,30],[13,25],[7,19]],P.ink);
    p([[9,4],[11,5],[10,16],[16,22],[22,16],[23,4],[25,5],[23,18],[18,24],[17,28],[15,28],[14,24],[9,18]],P.steel);
    l(9,5,9,16,P.ice);l(23,5,22,16,P.mint);l(11,18,15,22,P.silver);
    gem(13,7,7,12,P.teal,P.ice);r(14,26,4,2,P.copper);r(16,27,1,2,P.gold);
  },
  rune_gauntlet({r,p,l,rivet}){
    p([[8,3],[22,3],[26,8],[25,15],[28,18],[24,25],[23,30],[9,29],[7,22],[3,17],[4,11],[8,10]],P.ink);
    p([[9,4],[21,4],[24,9],[23,17],[26,19],[22,24],[21,28],[11,27],[10,21],[5,17],[6,12],[10,13]],P.bone);
    r(10,5,3,9,P.ivory);r(14,5,3,9,P.silver);r(18,5,3,9,P.ivory);l(6,13,10,18,P.white,2);
    p([[11,16],[22,16],[21,24],[12,24]],P.steel);r(14,17,6,5,P.tealDark);l(17,17,15,20,P.mint);l(15,20,18,21,P.mint);
    r(10,25,12,3,P.copper);r(11,25,10,1,P.gold);rivet(10,15);rivet(21,15);r(23,19,1,3,P.white);
  },
  data_chip({r,l}){
    for(let i=7;i<27;i+=4){r(i,2,2,4,P.gold);r(i,26,2,4,P.copper);r(2,i,4,2,P.gold);r(26,i,4,2,P.copper);}
    r(5,5,22,22,P.ink);r(6,6,20,20,P.tealDark);r(7,7,17,1,P.mint);r(7,8,1,16,P.teal);
    r(11,11,11,11,P.edge);r(12,12,9,9,P.steel);r(13,13,7,1,P.silver);r(13,14,1,5,P.blue);
    l(8,10,15,10,P.gold);l(9,12,9,18,P.mint);l(9,18,10,18,P.mint);l(23,10,23,17,P.gold);l(19,23,23,23,P.mint);r(8,23,2,2,P.rose);r(16,15,3,3,P.teal);r(17,15,1,1,P.ice);
  },
  crit_lens({r,l,e}){
    l(21,22,28,29,P.ink,5);l(21,22,28,29,P.copper,3);l(23,25,27,29,P.gold);
    e(14,13,11,11,P.ink);e(14,13,9,9,P.copper);e(14,13,8,8,P.gold);e(14,13,6,6,P.tealDark);e(13,12,5,5,P.teal);
    l(7,8,10,5,P.lightGold);l(9,9,13,7,P.ice,2);r(18,13,2,4,P.deep);l(14,9,14,17,P.ivory);l(10,13,18,13,P.ivory);r(14,13,1,1,P.rose);
  },
  bog_fang({r,p,l}){
    p([[4,27],[8,20],[13,18],[20,12],[24,5],[22,2],[28,4],[29,10],[24,20],[16,25],[9,25],[7,30]],P.ink);
    p([[11,21],[19,14],[25,6],[25,4],[27,6],[27,10],[22,19],[15,23]],P.bone);
    p([[12,20],[20,13],[25,5],[24,11],[19,18]],P.white);l(20,16,25,10,P.gold);
    l(6,27,11,21,P.leather,3);l(7,23,10,26,P.copper);r(5,27,2,2,P.gold);r(13,23,2,1,P.leaf);
  },
  swamp_coil({r,p,l,e}){
    e(16,17,12,12,P.ink);e(16,17,10,10,P.copperDark);e(16,17,8,8,P.copper);e(16,17,5,5,P.ink);
    l(9,9,15,6,P.lightGold,2);l(6,15,7,11,P.gold,2);l(22,21,20,25,P.gold,2);
    p([[4,5],[8,6],[15,23],[13,28],[10,23]],P.leafDark);p([[5,5],[7,7],[13,23],[12,24]],P.leafLight);
    p([[23,3],[25,5],[20,15],[18,18],[19,10]],P.leaf);l(23,5,20,13,P.mint);r(9,20,3,2,P.teal);r(17,7,2,2,P.rose);r(21,9,2,1,P.lightGold);
  },
  glacial_claw({p,l,rivet}){
    p([[4,23],[8,15],[9,3],[13,1],[14,15],[19,2],[23,1],[21,18],[27,6],[30,5],[26,24],[20,29],[8,29]],P.ink);
    p([[8,22],[10,5],[12,3],[12,20]],P.ice);p([[13,24],[20,5],[22,3],[19,23]],P.blue);l(15,20,21,5,P.white);
    p([[20,25],[28,9],[29,7],[25,24]],P.mint);l(23,21,27,12,P.ice);
    p([[6,23],[22,23],[23,27],[18,30],[8,28]],P.steel);l(8,24,20,24,P.silver);rivet(10,26);rivet(19,26);
  },
  moss_ward({r,p,l,e}){
    e(16,5,4,4,P.ink);e(16,5,2,2,P.copper);e(16,5,1,1,P.ink);
    p([[10,8],[21,8],[27,15],[25,25],[16,30],[6,24],[5,15]],P.ink);
    p([[11,9],[21,10],[25,16],[23,24],[16,28],[8,23],[7,16]],P.leather);
    e(16,19,6,7,P.tealDark);e(16,18,4,5,P.teal);r(14,15,2,3,P.mint);
    l(9,23,10,11,P.leaf);l(22,25,22,12,P.leaf);for(let y=12;y<24;y+=4){p([[10,y],[6,y-1],[7,y+2],[10,y+3]],P.leafLight);p([[22,y],[26,y-2],[25,y+2],[22,y+3]],P.leaf);}
    r(18,11,2,2,P.pink);r(21,14,1,2,P.gold);
  },
  ember_core({r,p,l,e,rivet}){
    e(16,17,12,12,P.ink);e(16,17,10,10,P.copperDark);e(16,17,8,8,P.ember);e(15,15,5,6,P.gold);
    p([[12,19],[15,10],[18,14],[18,19],[15,23]],P.white);
    l(8,9,9,25,P.copper,3);l(23,9,22,25,P.copper,3);l(16,5,16,8,P.gold,3);r(12,3,8,3,P.ink);r(13,3,5,2,P.silver);
    p([[7,11],[11,6],[20,6],[25,11],[22,13],[10,13]],P.copper);l(10,8,20,8,P.lightGold);r(10,24,12,4,P.copper);r(12,27,8,3,P.ink);rivet(9,11);rivet(22,11);rivet(11,25);rivet(20,25);
  },
  void_scepter({r,p,l,e,gem,clear}){
    l(7,28,20,12,P.ink,5);l(7,28,20,12,P.copper,3);l(8,26,18,14,P.gold);l(7,24,10,27,P.tealDark,2);
    e(22,9,8,8,P.ink);e(22,9,6,6,P.bone);e(22,9,4,4,P.ink);clear(25,12,6,5);
    p([[23,1],[28,3],[30,7],[27,6]],P.ivory);gem(18,4,7,10,P.teal,P.ice);r(6,28,3,2,P.rose);
  },
  titan_shard({r,p,l,rivet}){
    p([[7,4],[14,2],[18,6],[26,3],[29,12],[25,22],[16,31],[6,23],[3,13]],P.ink);
    p([[8,5],[13,4],[17,9],[24,6],[27,12],[23,22],[16,28],[8,22],[5,13]],P.bone);
    p([[8,6],[12,5],[15,10],[14,25],[8,20],[6,13]],P.ivory);p([[18,10],[24,7],[25,13],[21,20],[16,27]],P.silver);
    l(16,10,16,24,P.gold,2);l(8,14,13,15,P.deep);l(20,14,24,12,P.deep);r(10,18,3,2,P.tealDark);r(20,17,2,2,P.teal);rivet(9,9);rivet(23,10);r(15,6,2,2,P.white);
  },
  ember_crown({r,p,l,e,gem}){
    e(16,24,12,5,P.ink);p([[3,8],[9,12],[12,3],[17,11],[24,2],[24,13],[30,8],[27,25],[7,27]],P.ink);
    p([[5,10],[10,15],[12,6],[17,15],[23,5],[23,16],[28,11],[25,24],[8,25]],P.copper);
    l(6,12,9,23,P.gold,2);l(12,8,16,18,P.lightGold);l(23,7,21,21,P.gold,2);l(27,14,24,23,P.lightGold);
    r(8,23,17,4,P.gold);r(9,24,15,1,P.lightGold);gem(13,18,6,9,P.rose,P.ember);r(9,21,2,2,P.mint);r(23,19,2,2,P.ember);
  },
  anchor_hammer({p,l,rivet}){
    l(7,28,22,10,P.ink,6);l(7,28,22,10,P.leather,4);l(8,26,19,13,P.gold);l(8,22,11,25,P.copperDark,2);
    p([[10,4],[16,1],[29,12],[29,18],[23,22],[8,10]],P.ink);p([[11,5],[16,3],[27,13],[27,17],[23,19],[10,9]],P.steel);
    p([[11,5],[16,3],[27,13],[23,15]],P.silver);p([[23,15],[27,13],[27,17],[23,19]],P.deep);
    l(15,5,12,8,P.gold,3);l(24,11,21,15,P.copper,3);rivet(15,9);l(19,9,21,11,P.ivory);l(19,9,18,12,P.ivory);l(18,12,21,14,P.ivory);
  },
  glass_needle({r,p,l}){
    l(5,29,11,23,P.ink,5);l(5,28,11,22,P.tealDark,3);l(5,27,9,23,P.mint);
    p([[9,20],[29,1],[24,14],[14,25]],P.ink);p([[11,20],[28,3],[22,14],[14,23]],P.teal);p([[11,20],[28,3],[15,21]],P.ice);l(16,19,24,10,P.mint);
    l(8,18,17,26,P.ink,3);l(8,18,17,26,P.gold);r(5,27,2,2,P.gold);r(17,12,1,3,P.white);
  },
  concord_staff({r,p,l,e,gem}){
    l(7,29,21,11,P.ink,5);l(7,29,21,11,P.bone,3);l(7,27,17,14,P.gold);r(7,25,3,2,P.teal);
    e(22,9,8,8,P.ink);e(22,9,6,6,P.gold);e(22,9,4,4,P.ink);
    p([[14,7],[15,3],[19,1],[18,5],[17,10]],P.ivory);p([[25,2],[29,5],[31,10],[27,9]],P.silver);
    gem(18,5,5,7,P.rose,P.pink);gem(24,7,5,7,P.teal,P.ice);gem(19,12,4,5,P.gold,P.white);r(5,28,3,2,P.rose);
  },
  harbor_aegis({r,p,l,rivet}){
    p([[5,5],[16,1],[28,5],[27,21],[22,27],[16,31],[9,27],[4,21]],P.ink);
    p([[6,6],[16,3],[26,6],[25,20],[21,25],[16,28],[10,25],[6,20]],P.copper);
    p([[8,7],[16,5],[24,7],[23,20],[20,24],[16,26],[11,23],[8,19]],P.ivory);
    p([[16,6],[23,8],[22,19],[19,22],[16,25]],P.bone);r(14,6,4,18,P.tealDark);r(15,7,2,16,P.teal);
    l(9,15,22,15,P.deep,3);l(10,14,21,14,P.gold);r(17,17,2,2,P.gold);rivet(6,8);rivet(24,8);rivet(10,23);rivet(21,23);
  },
  voyager_coat({r,p,l}){
    p([[10,2],[15,5],[19,2],[24,5],[29,14],[25,18],[23,29],[17,27],[15,22],[13,28],[7,30],[7,18],[3,15],[7,6]],P.ink);
    p([[10,4],[15,8],[19,4],[23,6],[27,13],[24,15],[21,27],[17,25],[15,18],[12,26],[9,27],[9,15],[5,14],[8,7]],P.deep);
    p([[10,5],[14,9],[12,16],[9,12]],P.teal);p([[19,5],[22,7],[18,16],[16,10]],P.blue);
    l(10,18,9,25,P.steel);l(21,16,19,24,P.teal);l(10,17,21,15,P.leather,2);r(14,15,3,3,P.gold);r(15,15,1,1,P.white);l(24,11,25,13,P.silver);
  },
  namekeeper({r,p,l,e}){
    e(16,6,6,5,P.ink);e(16,6,4,3,P.copper);e(16,6,3,2,P.ink);
    l(10,9,8,15,P.gold);l(16,10,16,18,P.gold);l(21,9,24,15,P.gold);
    p([[3,15],[9,13],[13,16],[11,26],[6,29],[2,25]],P.ink);p([[4,16],[8,15],[11,17],[10,25],[6,27],[4,24]],P.bone);
    p([[12,18],[18,15],[22,18],[22,27],[17,31],[12,27]],P.ink);p([[14,19],[18,17],[20,19],[20,26],[17,28],[14,26]],P.ivory);
    p([[22,13],[28,15],[30,23],[27,27],[22,24],[20,18]],P.ink);p([[23,15],[27,16],[28,22],[26,24],[23,22],[22,18]],P.silver);
    r(6,18,2,1,P.deep);r(5,21,4,1,P.deep);r(16,21,3,1,P.tealDark);r(16,24,2,1,P.tealDark);l(24,18,26,19,P.deep);r(24,21,2,1,P.deep);
  },
  open_gate({r,p,l,e,rivet}){
    e(16,4,3,3,P.ink);e(16,4,1,1,P.gold);
    p([[5,29],[5,13],[9,7],[16,5],[24,7],[28,13],[28,29],[23,29],[23,14],[20,11],[13,11],[10,14],[10,29]],P.ink);
    p([[6,28],[6,13],[10,8],[16,7],[23,9],[26,13],[26,28],[24,28],[24,13],[21,10],[12,10],[8,13],[8,28]],P.ivory);
    p([[9,14],[14,17],[14,29],[9,26]],P.teal);p([[23,14],[18,17],[18,29],[23,26]],P.copper);
    l(10,16,10,25,P.mint);l(22,16,22,25,P.gold);r(12,21,1,2,P.gold);r(19,21,1,2,P.ivory);r(15,10,3,1,P.gold);rivet(6,15);rivet(24,15);
  },
  mara_compass({r,p,l,e}){
    e(16,4,4,3,P.ink);e(16,4,2,1,P.gold);e(16,18,12,12,P.ink);e(16,18,10,10,P.copper);e(16,18,9,9,P.gold);e(16,18,7,7,P.ink);e(16,18,6,6,P.ivory);
    l(8,11,11,9,P.lightGold);r(15,11,2,2,P.deep);r(15,24,2,2,P.deep);r(9,17,2,2,P.deep);r(22,17,2,2,P.deep);
    p([[19,12],[17,20],[12,24],[14,16]],P.deep);p([[19,12],[17,19],[14,17]],P.rose);p([[14,18],[17,20],[12,24]],P.teal);r(15,17,2,2,P.gold);
  },
  field_tonic({r,p}){
    r(12,2,8,5,P.ink);r(13,2,6,3,P.leather);r(13,2,5,1,P.gold);r(11,7,10,4,P.ink);r(12,7,8,3,P.silver);
    p([[11,10],[21,10],[26,16],[26,26],[22,30],[10,30],[6,26],[6,16]],P.ink);
    p([[12,11],[20,11],[24,17],[24,25],[21,28],[11,28],[8,25],[8,17]],P.deep);
    p([[9,18],[23,18],[23,25],[20,27],[11,27],[9,24]],P.roseDark);r(10,19,12,5,P.rose);r(10,16,2,7,P.ice);r(12,13,2,2,P.silver);r(13,20,7,6,P.ivory);r(16,20,1,6,P.rose);r(14,22,5,2,P.rose);r(19,26,3,1,P.pink);
  },
  ether_cell({r,p}){
    r(11,1,10,4,P.ink);r(12,1,8,2,P.gold);r(9,4,14,25,P.ink);r(10,5,12,23,P.steel);r(11,6,2,19,P.silver);r(19,6,2,20,P.deep);
    r(13,8,6,16,P.ink);r(14,9,4,14,P.teal);p([[16,10],[14,17],[17,16],[15,22],[19,14],[16,15]],P.ice);
    r(10,5,12,2,P.copper);r(10,25,12,3,P.copper);r(11,25,10,1,P.gold);r(15,29,3,1,P.gold);
  },
  dawn_seed({r,p,l}){
    p([[15,4],[21,7],[24,14],[22,23],[16,30],[9,25],[6,17],[8,10]],P.ink);
    p([[15,6],[20,9],[22,15],[20,22],[16,27],[11,24],[8,17],[10,11]],P.copper);p([[15,7],[18,11],[16,24],[11,22],[9,16],[11,11]],P.gold);
    l(16,12,16,25,P.roseDark);p([[14,14],[5,12],[2,7],[8,7],[13,10]],P.leafDark);p([[13,12],[5,10],[4,8],[9,9]],P.mint);
    p([[17,11],[21,5],[29,3],[27,10],[22,14]],P.leafDark);p([[19,10],[23,6],[27,5],[24,10],[20,12]],P.leafLight);
    l(12,15,13,19,P.white);r(18,18,2,2,P.rose);r(18,22,1,2,P.pink);
  },
  tide_elixir({r,p,l,e}){
    r(12,1,8,4,P.ink);r(13,1,6,2,P.gold);r(12,5,8,6,P.ink);r(14,5,4,5,P.silver);
    e(9,16,5,6,P.ink);e(9,16,3,4,P.copper);e(9,16,2,3,P.ink);e(23,16,5,6,P.ink);e(23,16,3,4,P.copper);e(23,16,2,3,P.ink);
    p([[12,9],[20,9],[24,16],[23,25],[20,30],[12,30],[9,25],[8,16]],P.ink);p([[13,10],[19,10],[22,17],[21,24],[19,28],[13,28],[11,24],[10,17]],P.tealDark);
    r(11,17,10,7,P.teal);l(11,20,14,18,P.mint);l(14,18,18,20,P.mint);l(18,20,21,18,P.mint);l(13,12,12,17,P.ice);r(13,25,6,2,P.gold);r(18,7,3,4,P.rose);r(19,8,1,2,P.pink);
  },
  star_cell({r,p,l,star}){
    p([[11,2],[21,2],[28,10],[27,24],[21,30],[10,30],[4,23],[4,10]],P.ink);
    p([[12,4],[20,4],[26,11],[25,23],[20,28],[11,28],[6,22],[6,11]],P.copper);
    p([[12,6],[20,6],[24,11],[23,22],[19,26],[12,26],[8,21],[8,12]],P.deep);
    p([[12,7],[15,7],[11,13],[10,21],[8,19],[9,12]],P.teal);p([[18,9],[22,12],[22,21],[19,24],[18,20]],P.tealDark);
    star(16,16,P.mint);p([[16,10],[18,15],[22,16],[18,18],[16,23],[14,18],[11,16],[14,14]],P.ice);r(15,15,2,3,P.white);l(11,4,20,4,P.lightGold);l(11,28,20,28,P.gold);r(6,13,1,5,P.lightGold);
  },
};

export function drawItemIcon(ctx,id,x,y,size=32){
  if(drawRasterIcon(ctx,id,x,y,size))return true;
  const recipe=Object.hasOwn(recipes,id)?recipes[id]:null;
  if(!recipe)return false;
  if(!(size>0))return true;
  let sprite=cache.get(id);
  if(!sprite){
    sprite=typeof OffscreenCanvas!=='undefined'?new OffscreenCanvas(32,32):document.createElement('canvas');
    sprite.width=32;sprite.height=32;
    recipe(painter(sprite.getContext('2d')));
    cache.set(id,sprite);
  }
  ctx.save();ctx.imageSmoothingEnabled=false;
  ctx.drawImage(sprite,Math.round(x),Math.round(y),Math.round(size),Math.round(size));
  ctx.restore();return true;
}
