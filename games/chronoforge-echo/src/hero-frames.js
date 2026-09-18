// Immutable generated-source metadata, measured in each descriptor's source PNG.
// Anchors are crop-relative SOURCE PIXELS, not normalized fractions.
// Apply one pixelScale to every pose; crouching/down poses keep their true size.
// Optional exclude rectangles use ABSOLUTE SOURCE coordinates. Clear them only
// in an imported frame canvas, after cropping; never alter the source image.
const poseIndex = Object.freeze({
  idle:0, move:1, anticipate:3, attack:4, cast:5, heal:5,
  hurt:6, guard:7, down:8, victory:9, front:10, back:11,
});

export const VEX_ART = Object.freeze({
  id:'vex', source:'assets/vex/faceless-vex-hood-v2-source.png', sourceWidth:1447, sourceHeight:1087,
  columns:4, rows:3, preserveSourceAlpha:true,
  pixelScale:.24, nativeSourceScale:.24, facing:'right', poseIndex,
  portrait:{x:883,y:752,w:141,h:150},
  frames:[
    {pose:'idle',       x:81,  y:35,  w:235,h:345,anchorX:144,anchorY:337},
    {pose:'move_1',     x:400, y:35,  w:293,h:338,anchorX:191,anchorY:330},
    {pose:'move_2',     x:791, y:36,  w:270,h:341,anchorX:191,anchorY:333},
    {pose:'anticipate', x:1125,y:25,  w:308,h:353,anchorX:170,anchorY:345},
    {pose:'attack',     x:21,  y:451, w:439,h:284,anchorX:182,anchorY:276},
    {pose:'cast',       x:457, y:393, w:284,h:339,anchorX:141,anchorY:331},
    {pose:'hurt',       x:789, y:458, w:318,h:274,anchorX:169,anchorY:266},
    {pose:'guard',      x:1146,y:435, w:288,h:297,anchorX:159,anchorY:289},
    {pose:'down',       x:47,  y:973, w:353,h:101,anchorX:174,anchorY:93},
    {pose:'victory',    x:477, y:737, w:227,h:337,anchorX:107,anchorY:329},
    // Fixed authoring corrections: these front/back drawings were generated
    // shorter than the side drawing. Match the 80px directional gait stature.
    {pose:'front',      x:858, y:754, w:184,h:319,anchorX:89,anchorY:311,pixelScale:.259},
    {pose:'back',       x:1182,y:747, w:195,h:327,anchorX:101,anchorY:319,pixelScale:.253},
  ],
});

export const RUNE_ART = Object.freeze({
  id:'rune', source:'assets/rune-source.png', sourceWidth:2172, sourceHeight:724,
  pixelScale:.25, nativeSourceScale:.25, facing:'right', poseIndex,
  // Enclosed checkerboard in the front pose's arm gap; not the ivory plates.
  backgroundSeeds:[[1569,518]],
  portrait:{x:1558,y:374,w:149,h:151},
  frames:[
    {pose:'idle',       x:43,   y:19,  w:234,h:340,anchorX:111,anchorY:338},
    {pose:'move_1',     x:416,  y:21,  w:237,h:337,anchorX:109,anchorY:335},
    {pose:'move_2',     x:768,  y:21,  w:225,h:337,anchorX:114,anchorY:335},
    {pose:'anticipate', x:1099, y:89,  w:322,h:265,anchorX:142,anchorY:263},
    // Includes the shield's forward edge and sparks beyond the 1810px gridline.
    {pose:'attack',     x:1444, y:78,  w:449,h:277,anchorX:142,anchorY:275},
    {pose:'cast',       x:1896, y:13,  w:266,h:345,anchorX:101,anchorY:343},
    {pose:'hurt',       x:25,   y:388, w:271,h:321,anchorX:139,anchorY:319},
    {pose:'guard',      x:393,  y:431, w:259,h:273,anchorX:117,anchorY:271},
    {pose:'down',       x:753,  y:509, w:315,h:188,anchorX:147,anchorY:186},
    {pose:'victory',    x:1145, y:369, w:238,h:344,anchorX:110,anchorY:342},
    {pose:'front',      x:1524, y:374, w:215,h:336,anchorX:103,anchorY:334},
    {pose:'back',       x:1903, y:374, w:206,h:335,anchorX:106,anchorY:333},
  ],
});
