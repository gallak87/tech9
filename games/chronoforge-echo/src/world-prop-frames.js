// Measured source rectangles. Anchors are source pixels relative to each crop.
// The three lantern frames share a fixed crop, hardware baseline and display scale.
export const WORLD_PROP_ART = {
  parts: { chest:0, salvage:1, supplies:2, console:3, foundation:7 },
  restFrames:[4,5,6],
  frames:[
    {x:45,y:81,w:367,h:324,anchorX:183,anchorY:321,nativeWidth:58},
    {x:495,y:65,w:340,h:339,anchorX:170,anchorY:335,nativeWidth:54},
    {x:895,y:77,w:407,h:334,anchorX:203,anchorY:330,nativeWidth:58},
    {x:1379,y:6,w:324,h:435,anchorX:161,anchorY:428,nativeWidth:65},
    {x:36,y:440,w:376,h:411,anchorX:188,anchorY:403},
    {x:472,y:440,w:376,h:411,anchorX:188,anchorY:403},
    {x:905,y:440,w:376,h:411,anchorX:188,anchorY:403,clearRects:[[369,80,7,190]]},
    {x:1274,y:522,w:497,h:303,anchorX:248,anchorY:292,nativeWidth:190,clearRects:[[0,185,8,118]]},
  ],
};
export const WORLD_PROP_ASSETS = [{
  id:'world_interactions',source:'assets/world-props-source.png',columns:4,rows:2,
  kind:'worldProp',metadata:WORLD_PROP_ART,
}];
