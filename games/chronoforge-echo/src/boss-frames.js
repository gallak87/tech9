// Generated immutable RGBA sources. All measurements are original source pixels.
// Absolute bounds and projected support point become crop-relative foot anchors.
// Fixed scale per creature preserves shorter anticipation, hurt and down poses.
const poseIndex=Object.freeze({idle:0,anticipate:1,attack:2,hurt:3,down:4,guard:5,cast:5,victory:0});
function boss(id,file,nativeSourceScale,shadow,rows){
 return Object.freeze({id,source:`assets/${file}`,sourceWidth:1536,sourceHeight:1024,
  columns:3,rows:2,nativeSourceScale,pixelScale:nativeSourceScale,facing:'left',shadow,poseIndex,
  frames:rows.map(([pose,x,y,right,bottom,groundX,groundY,exclude])=>({pose,x,y,w:right-x,h:bottom-y,
   anchorX:groundX-x,anchorY:groundY-y,...(exclude?{exclude}:{}),})),
 });
}

export const MIRE_WARDEN_ART=boss('mire_warden','mire-warden-source.png',.27,{radiusX:35,radiusY:7},[
 ['idle',51,16,427,507,202,501],
 ['anticipate',517,86,938,499,756,493,[{x:899,y:164,w:39,h:139}]],
 // Preserve the left-travelling canopy pulse; discard the preceding tail only.
 ['attack',898,50,1517,499,1310,493,[{x:898,y:303,w:42,h:196}]],
 ['hurt',59,526,426,987,215,981],
 ['down',526,696,967,949,711,942],
 ['guard',1021,513,1503,980,1268,974],
]);

export const MAGMA_BEHEMOTH_ART=boss('magma_behemoth','magma-behemoth-source.png',.34,{radiusX:64,radiusY:10},[
 ['idle',21,128,514,457,267,451],
 ['anticipate',543,148,993,457,786,451,[{x:990,y:220,w:3,h:80}]],
 ['attack',985,108,1522,449,1294,443,[{x:985,y:325,w:11,h:114}]],
 ['hurt',30,609,484,944,258,938],
 ['down',520,700,1015,941,776,935],
 ['guard',1064,618,1509,947,1292,941],
]);

export const ARCHITECT_HERALD_ART=boss('architect_herald','architect-herald-source.png',.305,{radiusX:31,radiusY:6},[
 ['idle',101,8,374,482,237,508],
 ['anticipate',519,37,961,490,768,516],
 ['attack',960,23,1512,487,1323,513],
 ['hurt',73,556,457,987,238,1008],
 ['down',515,734,1015,996,768,991],
 ['guard',1127,517,1476,980,1310,1003],
]);

export const FROST_COLOSSUS_ART=boss('frost_colossus','frost-colossus-source.png',.33,{radiusX:59,radiusY:10},[
 ['idle',39,24,451,497,247,492],
 ['anticipate',564,77,974,497,786,492],
 ['attack',975,55,1529,497,1345,492],
 ['hurt',56,578,461,985,272,979],
 ['down',524,700,1016,983,785,978],
 ['guard',1086,543,1480,987,1290,982],
]);

export const VOID_ARCHITECT_ART=boss('void_architect','void-architect-source.png',.38,{radiusX:60,radiusY:10},[
 ['idle',47,7,481,473,255,490],
 ['anticipate',573,7,900,472,737,489],
 // The lower-row crown begins at y481. Do not borrow it into this attack.
 ['attack',936,1,1522,478,1344,494],
 ['hurt',28,522,501,956,257,974],
 ['down',507,669,1041,965,775,958,[{x:1034,y:704,w:7,h:77}]],
 ['guard',1034,478,1515,989,1280,1005,[{x:1034,y:890,w:7,h:42}]],
]);
