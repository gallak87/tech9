const clamp=value=>Math.max(0,Math.min(1,value));
const smooth=value=>{const t=clamp(value);return t*t*(3-2*t);};

// Generated material crops do not necessarily tile. Join opposing edges only
// within a narrow band when importing a tile; keep its detailed center intact.
// This changes cached pixels, never the immutable source PNG.
export function blendRepeatEdges(data,width,height,band=16) {
 const blend=(a,b,amount)=>{
  for(let c=0;c<3;c++){
   const left=data[a+c],right=data[b+c],middle=(left+right)/2;
   data[a+c]=Math.round(left+(middle-left)*amount);
   data[b+c]=Math.round(right+(middle-right)*amount);
  }
 };
 const bx=Math.min(band,Math.floor(width/2)),by=Math.min(band,Math.floor(height/2));
 for(let y=0;y<height;y++)for(let x=0;x<bx;x++)blend((y*width+x)*4,(y*width+width-1-x)*4,1-smooth(x/Math.max(1,bx-1)));
 for(let x=0;x<width;x++)for(let y=0;y<by;y++)blend((y*width+x)*4,((height-1-y)*width+x)*4,1-smooth(y/Math.max(1,by-1)));
}

// World-space distances keep the bank continuous across cached terrain chunks.
// Roads through a pool are causeways: include their edges, not just the pool's
// polygon. The visual bank does not change terrain or walking permissions.
export function shoreDistance(scene,x,y,roadDistance=Infinity) {
 let distance=Infinity;
 for(const polygon of scene.water||[])for(let i=0,j=polygon.length-1;i<polygon.length;j=i++){
  const [ax,ay]=polygon[j],[bx,by]=polygon[i],dx=bx-ax,dy=by-ay;
  const t=clamp(((x-ax)*dx+(y-ay)*dy)/(dx*dx+dy*dy||1));
  distance=Math.min(distance,Math.hypot(x-ax-t*dx,y-ay-t*dy));
 }
 return Math.min(distance,Math.max(0,roadDistance-35));
}

export function lavaShoreMix(distance,x,y,water) {
 const irregular=Math.sin(x*.089+Math.sin(y*.061)*1.8)*3+Math.cos(y*.103-x*.037)*2;
 const d=Math.max(0,distance+irregular);
 return water?{
  crust:1-smooth((d-14)/28),
  basalt:1-smooth((d-2)/19),
  shade:(1-smooth(d/16))*.24,
 }:{crust:0,basalt:(1-smooth(d/23))*.76,shade:(1-smooth(d/18))*.2};
}
