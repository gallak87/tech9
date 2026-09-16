// Immutable-source crop metadata. Coordinates are source pixels; right/bottom
// are exclusive. Ground anchors remain outside the crop for airborne poses.
// Keep the original PNG alpha. Do not stretch each crop to a uniform box.
export const DRONE_SENTINEL_ART = Object.freeze({
  id: 'drone_sentinel',
  source: 'assets/drone-sentinel-source.png',
  sourceWidth: 1536,
  sourceHeight: 1024,
  columns: 3,
  rows: 2,
  nativeSourceScale: .23,
  facing: 'left',
  shadow: { radiusX: 23, radiusY: 5 },
  poseIndex: { idle: 0, anticipate: 1, attack: 2, hurt: 3, down: 4, guard: 5, cast: 5, victory: 0 },
  frames: [
    { pose: 'idle',       x: 88,   y: 92,  w: 395, h: 308, anchorX: 118, anchorY: 338 },
    { pose: 'anticipate', x: 618,  y: 68,  w: 307, h: 280, anchorX: 122, anchorY: 362 },
    { pose: 'attack',     x: 1000, y: 125, w: 523, h: 247, anchorX: 210, anchorY: 305 },
    { pose: 'hurt',       x: 75,   y: 541, w: 409, h: 351, anchorX: 145, anchorY: 409 },
    { pose: 'down',       x: 564,  y: 742, w: 407, h: 214, anchorX: 166, anchorY: 212 },
    { pose: 'guard',      x: 1151, y: 616, w: 229, h: 251, anchorX: 114, anchorY: 334 },
  ],
});

// Rows below contain source bounds (right/bottom exclusive), then the absolute
// projected ground anchor. This builder converts to the renderer's crop-relative
// contract without ever stretching an individual pose.
function enemyAtlas(id,file,nativeSourceScale,shadow,rows,extra={}){
  return Object.freeze({
    id,source:`assets/${file}`,sourceWidth:1536,sourceHeight:1024,
    columns:3,rows:2,nativeSourceScale,facing:'left',shadow,
    poseIndex:{idle:0,anticipate:1,attack:2,hurt:3,down:4,guard:5,cast:5,victory:0},
    frames:rows.map(([pose,x,y,right,bottom,groundX,groundY,clearRects])=>({
      pose,x,y,w:right-x,h:bottom-y,anchorX:groundX-x,anchorY:groundY-y,
      ...(clearRects?{clearRects}:{}),
    })),...extra,
  });
}

export const MUTANT_HOUND_ART=enemyAtlas('mutant_hound','mutant-hound-source.png',.23,{radiusX:36,radiusY:7},[
  ['idle',33,145,507,444,272,442],
  ['anticipate',526,183,1008,449,776,447],
  ['attack',1024,128,1513,429,1280,447],
  ['hurt',87,547,493,932,283,930],
  ['down',526,760,1009,931,769,929],
  ['guard',1031,648,1520,933,1280,931],
]);

export const GRAVBOT_ART=enemyAtlas('gravbot','gravbot-source.png',.20,{radiusX:32,radiusY:7},[
  ['idle',36,17,456,465,260,485],
  ['anticipate',614,7,932,494,775,512],
  ['attack',950,74,1513,491,1260,489],
  ['hurt',63,509,523,994,286,1012,[[442,331,18,154]]],
  ['down',508,656,1118,976,801,974,[[0,0,17,184]]],
  ['guard',1134,513,1484,978,1300,992],
]);

export const NEON_CULTIST_ART=enemyAtlas('neon_cultist','neon-cultist-source.png',.185,{radiusX:23,radiusY:5},[
  ['idle',67,12,392,502,226,522],
  ['anticipate',551,7,962,513,770,537,[[399,173,12,120]]],
  ['attack',954,24,1520,505,1285,530,[[0,276,14,181]]],
  ['hurt',104,534,402,1011,226,1027],
  ['down',503,734,1028,976,770,974],
  ['guard',1169,503,1449,1003,1289,1027],
]);

export const SANDWORM_ART=enemyAtlas('sandworm','sandworm-source.png',.22,{radiusX:40,radiusY:7},[
  ['idle',12,139,493,490,287,488],
  ['anticipate',555,77,903,490,774,488],
  ['attack',922,235,1510,467,1260,488],
  ['hurt',73,537,454,942,275,940],
  ['down',523,715,1058,942,800,940],
  ['guard',1115,612,1477,940,1297,938],
]);

export const BOG_STALKER_ART=enemyAtlas('bog_stalker','bog-stalker-source.png',.205,{radiusX:23,radiusY:5},[
  ['idle',85,23,400,488,258,486],
  ['anticipate',522,100,935,485,744,483],
  ['attack',941,60,1524,489,1320,487],
  ['hurt',116,535,428,985,268,983],
  ['down',526,654,1021,981,774,979],
  ['guard',1111,535,1445,972,1273,970],
],{key:'neutral-exterior'});

export const SLAG_RAT_ART=enemyAtlas('slag_rat','slag-rat-source.png',.195,{radiusX:29,radiusY:5},[
  ['idle',43,168,468,486,271,484],
  ['anticipate',510,142,963,485,760,483],
  ['attack',1007,165,1511,466,1283,486],
  ['hurt',43,581,468,929,285,927],
  ['down',500,713,1008,924,760,922],
  ['guard',1067,644,1494,924,1281,922],
],{
  key:'neutral-exterior',keyMin:120,
  backgroundSeeds:[[392,210],[886,184],[1412,211],[390,663],[960,879],[1418,688]],
});
