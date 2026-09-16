// Immutable generated-source metadata, measured in the original 2172×724 PNGs.
// Anchors are crop-relative SOURCE PIXELS, not normalized fractions.
// Apply one pixelScale to every pose; crouching/down poses keep their true size.
// Optional exclude rectangles use ABSOLUTE SOURCE coordinates. Clear them only
// in an imported frame canvas, after cropping; never alter the source image.
const poseIndex = Object.freeze({
  idle:0, move:1, anticipate:3, attack:4, cast:5, heal:5,
  hurt:6, guard:7, down:8, victory:9, front:10, back:11,
});

export const VEX_ART = Object.freeze({
  id:'vex', source:'assets/vex-source.png', sourceWidth:2172, sourceHeight:724,
  pixelScale:.232, nativeSourceScale:.232, facing:'right', poseIndex,
  // Enclosed checkerboard between the front pose's staff and shoulder.
  backgroundSeeds:[[1565,471],[1232,459],[520,545],[2067,555]],
  portrait:{x:1565,y:372,w:142,h:157},
  frames:[
    {pose:'idle',       x:37,   y:22,  w:229,h:340,anchorX:126,anchorY:338},
    {pose:'move_1',     x:414,  y:27,  w:239,h:334,anchorX:133,anchorY:332},
    {pose:'move_2',     x:768,  y:23,  w:238,h:339,anchorX:128,anchorY:337},
    {pose:'anticipate', x:1102, y:16,  w:306,h:346,anchorX:150,anchorY:344},
    // The extended staff and amber glyph cross the nominal fifth-cell edge.
    // The small cast-coat sliver farther down belongs to frame 5, not this pose.
    {pose:'attack',     x:1435, y:72,  w:513,h:291,anchorX:152,anchorY:289,
      exclude:[{x:1932,y:262,w:16,h:102}]},
    // Conversely, remove the previous pose's glyph tail, preserving this hat,
    // raised staff, palm glyphs and low coat edge.
    {pose:'cast',       x:1932, y:3,   w:229,h:361,anchorX:114,anchorY:359,
      exclude:[{x:1932,y:70,w:16,h:180}]},
    {pose:'hurt',       x:47,   y:392, w:247,h:316,anchorX:125,anchorY:314},
    {pose:'guard',      x:362,  y:374, w:296,h:325,anchorX:141,anchorY:323},
    {pose:'down',       x:723,  y:490, w:351,h:221,anchorX:177,anchorY:219},
    {pose:'victory',    x:1165, y:363, w:185,h:346,anchorX:108,anchorY:344},
    {pose:'front',      x:1517, y:372, w:192,h:337,anchorX:101,anchorY:335},
    {pose:'back',       x:1931, y:372, w:207,h:341,anchorX:91, anchorY:339},
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
