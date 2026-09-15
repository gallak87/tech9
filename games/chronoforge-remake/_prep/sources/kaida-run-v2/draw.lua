-- Kaida, authored from geometric pixel clusters in Aseprite. References are never opened here.
local root=assert(app.params.root);local out=assert(app.params.output)
local function read(path) local f=assert(io.open(path));local s=f:read('*a');f:close();return json.decode(s) end
local d=read(root..'/design.json');local poses=read(assert(app.params.poses))
local R=dofile(assert(app.params.raster));local C={}
for name,hex in pairs(d.palette) do C[name]=R.color(hex) end
local W,H=d.canvas[1],d.canvas[2];local s=Sprite(W,H,ColorMode.RGB);local layers={}
-- Store the actual drawing swatches in the editable document, with transparency at index 0.
local pal=Palette(#d.palette_order+1);pal:setColor(0,Color{r=0,g=0,b=0,a=0})
for i,name in ipairs(d.palette_order) do local color=C[name];local pc=app.pixelColor
 pal:setColor(i,Color{r=pc.rgbaR(color),g=pc.rgbaG(color),b=pc.rgbaB(color),a=255})
end
s:setPalette(pal)
local initial=s.layers[1]
for _,name in ipairs(d.layer_order) do local l=s:newLayer();l.name=name;layers[name]=l end
s:deleteLayer(initial)
local O=C.outline
local function poly(im,pts,col,fn,edge) R.poly(im,fn and R.map(pts,fn) or pts,C[col],edge~=false and C[edge or 'outline'] or nil) end
local function line(im,a,b,col,fn) R.line(im,fn and fn(a) or a,fn and fn(b) or b,C[col]) end
local function dot(im,p,col,fn) p=fn and fn(p) or p;R.pixel(im,p[1],p[2],C[col]) end
local function disc(im,p,rx,ry,col,fn) R.disc(im,fn and fn(p) or p,rx,ry,C[col]) end
local function bodyFn(pose) return function(p) return R.add(pose.root,R.rot(R.sub(p,{108,90}),pose.torso_angle)) end end
local function hipFn(pose) return function(p) return R.add(pose.root,R.rot(R.sub(p,{108,90}),pose.hip_angle)) end end

local function coat(im,p,fi)
 local B=bodyFn(p);local flutter=math.sin((p.phase-.12)*math.pi*2)*2
 poly(im,{{100,79},{108,84},{102,93},{93,102+flutter},{79,109+flutter},{84,99},{83,97},{94,89}},'tealDark',B)
 poly(im,{{101,84},{104,88},{96,98},{86,104+flutter},{90,95}},'tealShadow',B,false)
 line(im,{97,90},{86,101+flutter},'teal',B)
 poly(im,{{104,86},{108,91},{99,104},{88,111+flutter},{92,102},{90,102}},'hairDark',B)
 poly(im,{{106,90},{102,99},{93,106+flutter},{96,101}},'hairShadow',B,false)
end

local function leg(im,p,side)
 local far=side=='far';local j=p.legs[side].joints;local hip,knee,ankle=j[1],j[2],j[3]
 local U=R.basis(hip,knee);local L=R.basis(knee,ankle)
 R.limb(im,j,{5.1,3.9,2.9},C[far and 'farCloth' or 'clothDark'],O)
 -- Trousers follow the thigh, including its turn into the shared knee socket.
 R.poly(im,{U(0,-3.7),U(.8,-3.2),U(1,-2),U(.82,.8),U(.15,2.6),U(0,2.8)},C[far and 'clothDark' or 'cloth'])
 R.poly(im,{U(.13,-3.8),U(.67,-3.3),U(.85,-1.5),U(.35,-1.4)},C[far and 'cloth' or 'clothLight'])
 R.line(im,U(.15,3.5),U(.78,2.9),C.clothDark)
 -- A leather thigh strap, rivets, and an attached small metal kneecap.
 R.poly(im,{U(.29,-4.7),U(.42,-4.6),U(.42,4.5),U(.29,4.6)},C.leatherDark)
 R.line(im,U(.32,-4.2),U(.32,4.2),C[far and 'leatherDark' or 'leather'])
 if not far then R.disc(im,U(.34,-3.6),1,1,C.brass) end
 R.poly(im,{L(-.10,-1),L(.01,-4.5),L(.15,-4.4),L(.22,-1),L(.15,3.6),L(.02,4)},C[far and 'farMetal' or 'metalShadow'],O)
 R.poly(im,{L(-.04,-1),L(.04,-3.2),L(.13,-2.8),L(.15,-.4),L(.06,1.6)},C[far and 'metalShadow' or 'metal'])
 if not far then R.line(im,L(.025,-2.5),L(.09,-3),C.metalLight) end
 -- Faceted steel shin. It is drawn in each pose, never rotated from a raster cutout.
 R.poly(im,{L(.25,-3.8),L(.66,-3.5),L(.89,-2.4),L(.91,1.9),L(.57,3),L(.25,3.1),L(.18,.1)},C[far and 'farMetal' or 'metalShadow'],O)
 R.poly(im,{L(.25,-2.4),L(.62,-2.2),L(.87,-1.8),L(.85,.1),L(.53,.7),L(.22,.6)},C[far and 'metalShadow' or 'metal'])
 if not far then R.line(im,L(.28,-2.3),L(.62,-2.3),C.metalLight);R.line(im,L(.31,.8),L(.68,.25),C.brass) end
 R.line(im,L(.71,-3),L(.74,2.6),C.leatherDark)
 R.line(im,L(.77,-2.6),L(.80,2.5),C[far and 'clothDark' or 'leather'])
 -- The support point is computed from this exact boot polygon in poses.py.
 local F=R.localTo(ankle,p.legs[side].foot_angle)
 poly(im,d.foot_shape,far and 'clothDark' or 'cloth',F)
 poly(im,{{-3,-3},{2,-2},{2,2},{-2,4},{-3,7},{-4,7}},far and 'farMetal' or 'metalShadow',F,false)
 poly(im,{{3,3},{8,5},{12,5},{13,7},{10,8},{3,8},{1,7}},far and 'farMetal' or 'metal',F,'metalDark')
 if not far then line(im,{6,5},{11,6},'metalLight',F) end
 poly(im,{{-4,8},{3,8},{5,9},{13,8},{12,10},{-4,10}},'clothDark',F,false)
 line(im,{-2,3},{3,4},'leather',F)
 dot(im,{-1,3},far and 'metalShadow' or 'brass',F)
end

local function pelvis(im,p)
 local B=hipFn(p)
 poly(im,{{101,81},{113,82},{120,87},{119,97},{114,102},{108,101},{103,96},{98,92},{97,87}},'cloth',B)
 poly(im,{{99,87},{105,87},{111,95},{116,96},{114,101},{108,99},{102,94},{98,93}},'clothDark',B,false)
 poly(im,{{112,86},{117,88},{118,93},{113,95},{111,93}},'clothLight',B,false)
 -- Belt is attached to the pelvis, making its alternating rotation visible.
 poly(im,{{99,80},{112,83},{119,84},{121,88},{112,88},{98,85}},'leatherDark',B)
 line(im,{100,82},{111,85},'leather',B)
 line(im,{114,85},{118,86},'brass',B)
 poly(im,{{110,83},{114,84},{114,88},{109,87}},'brass',B,'leatherDark')
 poly(im,{{110,84},{113,85},{112,87},{110,86}},'clothDark',B,false)
 poly(im,{{98,84},{103,86},{103,95},{98,98},{94,96},{95,88}},'leatherDark',B)
 poly(im,{{97,86},{101,88},{100,94},{96,95}},'leather',B,false)
 line(im,{96,89},{100,91},'leatherDark',B)
 dot(im,{99,90},'brass',B)
 line(im,{103,91},{108,95},'leather',B)
 dot(im,{106,94},'brass',B)
end

local function torso(im,p)
 local B=bodyFn(p)
 -- Neck, chest, and abdomen form one warm silhouette under the jacket/top.
 poly(im,{{119,43},{127,45},{127,50},{124,54},{128,63},{127,72},{119,78},{115,84},{106,82},{106,75},{102,69},{104,59},{116,53}},'skinShadow',B)
 poly(im,{{123,45},{126,47},{123,54},{125,60},{123,65},{120,66},{116,63},{116,57},{120,52}},'skin',B,false)
 poly(im,{{111,70},{120,72},{117,78},{114,82},{108,80},{109,75}},'skin',B,false)
 line(im,{111,79},{115,80},'skinDark',B)
 line(im,{116,73},{118,73},'skinLight',B)
 -- Fitted dark top with a coherent breast/rib silhouette.
 poly(im,{{113,58},{117,62},{123,64},{126,62},{127,67},{125,72},{120,75},{112,73},{109,69}},'clothDark',B)
 poly(im,{{116,63},{121,67},{125,66},{124,70},{120,72},{113,70},{112,68}},'cloth',B,false)
 line(im,{114,69},{118,71},'clothLight',B)
 line(im,{113,73},{120,75},'leatherDark',B)
 -- Cropped teal jacket. Its front opening keeps the torso readable at small sizes.
 poly(im,{{113,50},{119,49},{117,55},{113,59},{113,67},{110,75},{104,77},{97,70},{99,59},{106,53}},'tealShadow',B)
 poly(im,{{105,56},{112,53},{112,59},{109,63},{109,70},{106,74},{101,70},{101,62}},'teal',B,false)
 poly(im,{{112,51},{118,49},{116,55},{111,59},{110,63},{108,61}},'tealDark',B)
 line(im,{112,53},{113,56},'tealLight',B)
 line(im,{101,70},{105,73},'tealLight',B)
 poly(im,{{123,51},{127,53},{129,61},{128,68},{126,71},{126,64},{123,57},{121,55}},'tealShadow',B)
 line(im,{125,55},{127,62},'teal',B)
 -- Diagonal harness and brass jacket fasteners.
 poly(im,{{105,53},{108,54},{106,65},{102,72},{99,70},{103,63}},'leatherDark',B)
 line(im,{106,56},{104,64},'leather',B)
 poly(im,{{104,60},{107,61},{106,64},{103,63}},'brass',B,'leatherDark')
 dot(im,{104,74},'brass',B);dot(im,{111,60},'brass',B)
end

local function head(im,p)
 -- Stabilize facial pixel clusters while the neck follows the counter-rotating torso.
 local B=function(pt) return R.add(p.neck,R.sub(pt,{123,48})) end
 -- Side-facing face, not the tilted three-quarter standing cutout.
 poly(im,{{119,28},{128,25},{135,29},{138,35},{137,39},{139,42},{143,44},{139,46},{139,50},{135,53},{130,53},{123,48},{119,41}},'skinShadow',B)
 poly(im,{{128,30},{134,31},{136,36},{134,41},{138,44},{137,47},{139,48},{135,51},{131,50},{126,45},{125,39}},'skin',B,false)
 poly(im,{{131,33},{134,35},{132,39},{130,40},{128,38}},'skinLight',B,false)
 line(im,{136,48},{138,48},'skinDark',B)
 dot(im,{138,44},'skinLight',B)
 -- One clear eye, narrow dark brow, cheek, and a little visible ear.
 line(im,{131,40},{136,40},'hairDark',B)
 poly(im,{{132,41},{136,41},{135,43},{133,43}},'eyeWhite',B,false)
 line(im,{135,41},{135,43},'hairDark',B);dot(im,{134,42},'eye',B);dot(im,{136,41},'outline',B)
 line(im,{132,45},{134,46},'skinShadow',B)
 -- Magenta silhouette: every tuft joins the head; no erased-background fringe.
 poly(im,{{112,39},{105,37},{109,33},{101,31},{109,29},{105,26},{114,26},{113,21},{119,24},{124,20},{129,23},{135,23},{140,28},{142,34},{139,39},{135,41},{136,33},{132,35},{128,34},{125,40},{124,46},{119,49},{117,45},{111,47},{114,42},{108,44}},'hairDark',B)
 poly(im,{{109,31},{114,29},{113,27},{120,28},{121,24},{128,25},{134,25},{138,29},{139,34},{136,36},{134,30},{130,32},{125,30},{121,33},{118,39},{113,40},{116,35}},'hairShadow',B,false)
 poly(im,{{116,29},{122,28},{124,25},{130,26},{134,28},{130,30},{125,29},{122,32},{118,35},{113,36}},'hair',B,false)
 poly(im,{{122,26},{126,24},{130,26},{129,27},{124,28}},'hairLight',B,false)
 poly(im,{{132,28},{137,29},{139,33},{138,35},{135,31}},'hair',B,false)
 line(im,{134,28},{137,31},'hairLight',B)
 poly(im,{{129,31},{131,32},{128,37},{126,41},{124,40},{125,35}},'hair',B,false)
 line(im,{128,32},{126,36},'hairLight',B)
 poly(im,{{119,34},{123,32},{122,37},{120,40},{117,42},{115,41}},'hair',B,false)
 line(im,{120,34},{118,37},'hairLight',B)
 poly(im,{{111,33},{115,31},{114,34},{110,36},{107,36}},'hairShadow',B,false)
 line(im,{116,42},{115,44},'hairShadow',B)
 dot(im,{127,25},'hairGlint',B)
 poly(im,{{122,40},{125,40},{125,44},{122,46},{120,44},{120,42}},'skinShadow',B,'hairDark')
 line(im,{122,42},{123,41},'skinLight',B);dot(im,{123,44},'brass',B)
end

local function arm(im,p,side)
 local far=side=='far';local j=p.arms[side].joints;local sh,el,wr=j[1],j[2],j[3]
 local U,L=R.basis(sh,el),R.basis(el,wr)
 R.limb(im,j,{far and 3.3 or 4.5,3.1,2.7},C[far and 'tealDark' or 'tealShadow'],O)
 R.poly(im,{U(.08,-3),U(.79,-2.9),U(1,-1.8),U(.91,.5),U(.12,.5)},C[far and 'tealShadow' or 'teal'])
 R.line(im,U(.4,-2.6),U(.65,-2.5),C[far and 'teal' or 'tealLight'])
 R.line(im,U(.65,.7),U(.84,2.6),C.tealDark)
 R.poly(im,{L(.05,-2.8),L(.25,-3.3),L(.62,-3.2),L(.73,-1),L(.66,3),L(.18,3)},C[far and 'farMetal' or 'metalShadow'],O)
 R.poly(im,{L(.15,-2),L(.51,-2.3),L(.62,-.4),L(.25,.7)},C[far and 'metalShadow' or 'metal'])
 if not far then R.line(im,L(.22,-2.1),L(.45,-2.3),C.metalLight);R.line(im,L(.35,1),L(.49,.8),C.brass) end
 R.poly(im,{L(.72,-3),L(.9,-3),L(.95,2.8),L(.72,3)},C.clothDark,O)
 -- Articulated fist: the hand is drawn over the sword hilt on the near side.
 local F=R.localTo(wr,p.arms[side].hand_angle)
 if far then
  poly(im,{{-3,-1},{-3,-5},{-1,-7},{2,-7},{5,-4},{5,1},{3,4},{-1,4}},'cloth',F)
  poly(im,{{-2,-4},{-1,-6},{2,-6},{4,-3},{3,-1},{1,-2}},'skinShadow',F,false)
  line(im,{0,-5},{2,-3},'skinLight',F)
  line(im,{2,-5},{4,-3},'skin',F)
  line(im,{-1,1},{3,2},'clothLight',F)
 else
  poly(im,{{-3,-3},{1,-4},{4,-2},{4,2},{1,5},{-3,4},{-4,1}},'clothDark',F)
  poly(im,{{-2,-1},{1,-2},{3,-1},{2,1},{-1,2}},'clothLight',F,false)
  line(im,{-2,2},{1,3},'metalShadow',F)
  dot(im,{0,0},'metal',F)
 end
 if not far then
  -- Near pauldron remains on the shoulder socket instead of following the forearm.
  local S=R.localTo(sh,p.torso_angle)
  poly(im,{{-5,-6},{0,-8},{6,-6},{8,-2},{7,4},{2,7},{-5,4},{-7,0}},'metalDark',S)
  poly(im,{{-4,-5},{0,-7},{5,-5},{6,-1},{5,3},{1,5},{-4,3},{-5,-1}},'metalShadow',S,false)
  poly(im,{{-3,-5},{0,-6},{4,-4},{4,0},{1,2},{-3,1}},'metal',S,false)
  line(im,{-2,-5},{2,-5},'metalLight',S)
  line(im,{5,-3},{6,0},'brass',S)
  line(im,{-4,2},{1,4},'brass',S)
  dot(im,{-3,-2},'metalLight',S)
  -- Small engraved ring motif, at pixel scale.
  line(im,{-1,-1},{1,-2},'metalDark',S);line(im,{1,-2},{2,0},'metalDark',S)
  line(im,{2,0},{0,1},'metalDark',S)
 end
end

local function weapon(im,p)
 local wr=p.arms.near.joints[3];local F=R.localTo(wr,p.arms.near.hand_angle)
 -- Hand, guard, and blade share the same parent transform.
 poly(im,{{4,-7},{7,-6},{8,-3},{1,7},{-2,8},{-4,5}},'metalDark',F)
 line(im,{5,-4},{0,4},'clothLight',F)
 poly(im,{{-4,3},{-8,1},{-10,4},{-5,8},{-5,11},{-1,12},{2,8},{-1,5}},'metalDark',F)
 line(im,{-8,3},{-4,6},'metalShadow',F)
 poly(im,{{-5,8},{-8,8},{-34,24},{-44,32},{-30,26},{-3,12}},'bladeDark',F)
 poly(im,{{-7,9},{-33,24},{-41,30},{-28,24},{-5,12}},'blade',F,false)
 line(im,{-8,10},{-37,27},'bladeLight',F)
 line(im,{-10,11},{-30,23},'bladeCore',F)
 disc(im,{-3,7},3,3,'outline',F);disc(im,{-3,7},2,2,'blade',F);dot(im,{-3,6},'bladeCore',F)
end

for fi,p in ipairs(poses.frames) do
 if fi>1 then s:newEmptyFrame() end
 s.frames[fi].duration=p.duration_ms/1000
 for _,name in ipairs(d.layer_order) do
  local im=Image(W,H,ColorMode.RGB)
  if name=='coat' then coat(im,p,fi)
  elseif name=='pelvis' then pelvis(im,p)
  elseif name=='torso' then torso(im,p)
  elseif name=='head' then head(im,p)
  elseif name=='weapon' then weapon(im,p)
  elseif name:sub(1,4)=='leg.' then leg(im,p,name:sub(5))
  elseif name:sub(1,4)=='arm.' then arm(im,p,name:sub(5)) end
  s:newCel(layers[name],fi,im,Point(0,0))
 end
end
local tag=s:newTag(1,#poses.frames);tag.name=d.clip;tag.aniDir=AniDir.FORWARD
local origin=s:newSlice(Rectangle(0,0,W,H));origin.name='origin';origin.pivot=Point(d.origin[1],d.origin[2])
-- Bind-pose sockets make the anatomical registration discoverable in the editor.
for name,pos in pairs({pelvis=poses.frames[1].root,neck=poses.frames[1].neck,shoulder_near=poses.frames[1].shoulders.near,shoulder_far=poses.frames[1].shoulders.far}) do
 local slice=s:newSlice(Rectangle(0,0,W,H));slice.name='pivot.'..name;slice.pivot=Point(R.round(pos[1]),R.round(pos[2]))
end
assert(s:saveAs(out..'/animation.aseprite'));s:close()
local f=assert(io.open(out..'/drawn.json','w'));f:write(json.encode({frames=#poses.frames,layers=#d.layer_order,method=d.method}));f:close()
