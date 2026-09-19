// Source pixels are immutable. Per-tier widths and door anchors control world
// size independently of the sheet layout and keep the entrance in one place.
export const HAVENTIDE_TOWN_CENTER = {
  id: 'haventide_town_center',
  region: 'haventide', name: 'Haventide',
  source: 'assets/town-centers/haventide-town-center-tiers-v1-source.png',
  kind: 'townCenter', columns: 2, rows: 2, required: true,
  key: 'neutral-exterior',
  // Air enclosed by the bell supports, awning ropes, survey ring and crests.
  // Colored outlines protect the pale stone from the connected flood fill.
  backgroundSeeds: [[436,211],[150,361],[510,379],[359,687],[415,708],[440,770],[983,610],[916,145],[920,55],[400,654],[960,607]],
  keyZones: [{x:922,y:624,w:89,h:190,min:170,chroma:145}],
  metadata: {
    sourceWidth: 1254, sourceHeight: 1254,
    frames: [
      {x:72,y:169,w:494,h:389,anchorX:200,anchorY:299,nativeWidth:240},
      {x:631,y:17,w:574,h:560,anchorX:228,anchorY:467,nativeWidth:280},
      {x:14,y:620,w:609,h:593,anchorX:252,anchorY:500,nativeWidth:325},
      {x:625,y:580,w:620,h:665,anchorX:252,anchorY:561,nativeWidth:370},
    ],
  },
};

export const EMBERLINE_TOWN_CENTER = {
  id:'emberline_town_center',region:'emberline',name:'Emberline',
  source:'assets/town-centers/emberline-town-center-tiers-v1-source.png',
  kind:'townCenter',columns:2,rows:2,required:true,key:'neutral-exterior',
  // Open air enclosed by awning supports, wind vanes and solar instruments.
  backgroundSeeds:[[194,358],[185,368],[471,346],[490,364],[809,224],[844,194],[885,223],[1086,278],[1142,290],[683,389],[1198,405],[972,67],[47,998],[79,1009],[103,1017],[172,835],[283,803],[306,803],[211,851],[269,804],[444,681],[429,654],[389,708],[593,1008],[594,1064],[908,663],[650,1069]],
  metadata:{sourceWidth:1254,sourceHeight:1254,frames:[
    {x:105,y:139,w:451,h:409,anchorX:145,anchorY:320,nativeWidth:230},
    {x:624,y:27,w:609,h:532,anchorX:225,anchorY:437,nativeWidth:275},
    {x:6,y:611,w:615,h:603,anchorX:259,anchorY:485,nativeWidth:320},
    {x:629,y:565,w:621,h:683,anchorX:203,anchorY:585,nativeWidth:370},
  ]},
};

export const ORBITAL_REACH_TOWN_CENTER = {
  id:'orbital_reach_town_center',region:'orbital_reach',name:'Orbital Reach',
  source:'assets/town-centers/orbital-reach-town-center-tiers-v1-source.png',
  kind:'townCenter',columns:2,rows:2,required:true,key:'neutral-exterior',
  // Cable loops only. Snow and pale structural panels remain opaque.
  backgroundSeeds:[[412,186],[1004,187],[1016,202],[426,797],[434,802]],
  metadata:{sourceWidth:1254,sourceHeight:1254,frames:[
    {x:92,y:116,w:454,h:440,anchorX:168,anchorY:345,nativeWidth:235},
    {x:623,y:5,w:601,h:559,anchorX:207,anchorY:461,nativeWidth:280},
    {x:24,y:595,w:586,h:597,anchorX:241,anchorY:502,nativeWidth:325},
    {x:621,y:562,w:628,h:664,anchorX:257,anchorY:554,nativeWidth:375},
  ]},
};

export const LAST_CROWN_TOWN_CENTER = {
  id:'last_crown_town_center',region:'last_crown',name:'Last Crown',
  source:'assets/town-centers/last-crown-town-center-tiers-v1-source.png',
  kind:'townCenter',columns:2,rows:2,required:true,key:'neutral-exterior',keyMin:130,
  // Darker checker flecks need a lower connected key; enclosed branch/awning
  // air has measured seeds, protecting the ivory architecture from broad keys.
  backgroundSeeds:[[478,349],[458,344],[949,117],[372,705],[784,780],[1045,813]],
  metadata:{sourceWidth:1254,sourceHeight:1254,frames:[
    {x:98,y:200,w:451,h:362,anchorX:177,anchorY:285,nativeWidth:230},
    {x:639,y:50,w:579,h:507,anchorX:161,anchorY:425,nativeWidth:275,clearRects:[[301,499,12,8]]},
    {x:17,y:606,w:607,h:604,anchorX:235,anchorY:514,nativeWidth:325},
    {x:626,y:547,w:622,h:686,anchorX:241,anchorY:612,nativeWidth:375,clearRects:[[0,0,315,9],[327,0,295,9]]},
  ]},
};

export const TOWN_CENTERS=[HAVENTIDE_TOWN_CENTER,EMBERLINE_TOWN_CENTER,ORBITAL_REACH_TOWN_CENTER,LAST_CROWN_TOWN_CENTER];
const centersByRegion=new Map(TOWN_CENTERS.map(center=>[center.region,center]));

export function townCenterBounds(object,state) {
  const actualRegion=object.id?.replace(/_entrance$/,'');
  if(object.id!==actualRegion+'_entrance'||!centersByRegion.has(actualRegion))return null;
  // The development preview substitutes artwork only at Haventide's anchor.
  // This field exists on a render-only shallow copy, never on expedition state.
  const previewRegion=actualRegion==='haventide'?state?.townCenterArtRegion:null;
  const center=centersByRegion.get(previewRegion)||centersByRegion.get(actualRegion);
  const level=Math.max(1,Math.min(4,state?.buildings?.town_center||1));
  const frame=center.metadata.frames[level-1];
  const scale=frame.nativeWidth/frame.w;
  return {center,frame,frameIndex:level-1,scale,left:object.x-frame.anchorX*scale,top:object.y-frame.anchorY*scale,width:frame.nativeWidth,height:frame.h*scale};
}

export function townCenterPreviewBounds(entrance) {
  const bounds=TOWN_CENTERS.flatMap(center=>center.metadata.frames.map((_,i)=>townCenterBounds(entrance,{buildings:{town_center:i+1},townCenterArtRegion:center.region})));
  const left=Math.min(...bounds.map(b=>b.left)),top=Math.min(...bounds.map(b=>b.top));
  return {left,top,width:Math.max(...bounds.map(b=>b.left+b.width))-left,height:Math.max(...bounds.map(b=>b.top+b.height))-top};
}
