// Four gait phases, rows side / toward camera / away from camera.
// Source export dimensions differ by one pixel from the requested grid;
// explicit measured crops and one fixed source scale are authoritative.
const frames = (bounds,anchors) => bounds.map(([x,y,r,b],i)=>({x,y,w:r-x,h:b-y,anchorX:anchors[i][0]-x,anchorY:anchors[i][1]-y}));
export const HERO_WALK_ART = [
  {id:'vex',source:'assets/vex-walk-source.png',columns:4,rows:3,sourceWidth:1447,sourceHeight:1087,pixelScale:.232,key:'neutral-exterior',backgroundSeeds:[[135,475],[490,484],[865,487],[1260,477],[135,554],[503,550],[860,562],[1256,550],[598,836],[946,829],[1334,809],[228,901],[593,905],[962,903],[1338,893],[852,267],[551,292]],frames:frames(
    [[48,17,288,363],[425,16,630,360],[777,16,1033,362],[1179,17,1388,360],[63,372,278,714],[443,371,646,716],[794,371,1008,716],[1201,372,1396,714],[64,723,288,1069],[444,728,649,1070],[806,726,1012,1070],[1201,723,1400,1069]],
    [[170,359],[548,355],[919,358],[1310,355],[170,712],[551,712],[914,712],[1316,712],[173,1065],[548,1066],[914,1066],[1306,1065]])},
  {id:'rune',source:'assets/rune-walk-source.png',columns:4,rows:3,sourceWidth:1447,sourceHeight:1087,pixelScale:.25,key:'neutral-exterior',backgroundSeeds:[[121,518],[487,507],[844,516],[1210,510]],frames:frames(
    [[37,18,316,353],[411,18,679,353],[756,18,1051,353],[1129,18,1394,353],[43,371,317,715],[415,371,671,718],[762,371,1035,716],[1133,370,1391,715],[57,731,304,1069],[423,731,684,1066],[779,731,1020,1069],[1146,731,1409,1066]],
    [[176,349],[549,349],[916,349],[1290,349],[168,711],[552,714],[914,712],[1287,711],[167,1065],[546,1062],[904,1065],[1272,1062]])},
];
