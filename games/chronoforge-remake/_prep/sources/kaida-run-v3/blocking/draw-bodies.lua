-- Flat, editable body volumes over the proven joint paths; not painted Kaida art.
local root=assert(app.params.root)
local function read(path) local f=assert(io.open(path));local v=json.decode(f:read('*a'));f:close();return v end
local d=read(root..'/design.json');local poses=read(assert(app.params.poses))
local R=dofile(assert(app.params.raster));local C={};local pc=app.pixelColor
for name,hex in pairs(d.palette) do C[name]=R.color(hex) end
local s=Sprite(d.canvas[1],d.canvas[2],ColorMode.RGB);local first=s.layers[1];local layers={}
for _,name in ipairs(d.layer_order) do local l=s:newLayer();l.name=name;layers[name]=l end;s:deleteLayer(first)
layers['guides.joints'].isVisible=false
local pal=Palette(14);pal:setColor(0,Color{r=0,g=0,b=0,a=0});local index=1
for _,name in ipairs({'outline','near','near_light','far','far_light','body','body_shadow','hair','tail','sword','sword_light','guide'}) do
 local c=C[name];pal:setColor(index,Color{r=pc.rgbaR(c),g=pc.rgbaG(c),b=pc.rgbaB(c),a=255});index=index+1
end;s:setPalette(pal)
local function poly(im,points,col,edge) R.poly(im,points,col,edge or C.outline) end
local function ring(im,p,r,col) R.disc(im,p,r+1,r+1,C.outline);R.disc(im,p,r,r,col) end
local function limb(im,j,widths,col,light)
 R.limb(im,j,widths,col,C.outline)
 for i=1,#j-1 do
  local B=R.basis(j[i],j[i+1]);local w1,w2=widths[i],widths[i+1]
  R.poly(im,{B(.06,-w1*.65),B(.87,-w2*.65),B(.92,0),B(.10,w1*.05)},light)
 end
 for i=2,#j-1 do ring(im,j[i],5,col) end
end
local function leg(im,p,side)
 local near=side=='right';local j=p.legs[side].joints
 local col,light=near and C.near or C.far,near and C.near_light or C.far_light
 limb(im,j,{24,18,12},col,light)
 local F=R.localTo(j[3],p.legs[side].foot_angle)
 poly(im,R.map(d.foot_shape,F),col)
 R.poly(im,R.map({{-12,24},{40,24},{47,22},{47,27},{39,31},{-17,31}},F),C.outline)
 R.poly(im,R.map({{12,8},{39,15},{44,20},{16,20},{5,12}},F),light)
 -- Two bands identify the same right thigh in every pose; one identifies left.
 local B=R.basis(j[1],j[2])
 for _,t in ipairs(near and {.28,.40} or {.34}) do
  R.poly(im,{B(t,-23),B(t+.045,-22),B(t+.045,22),B(t,23)},C.outline)
 end
end
local function arm(im,p,side)
 local near=side=='right';local j=p.arms[side].joints
 local col,light=near and C.near or C.far,near and C.near_light or C.far_light
 limb(im,j,{18,13,10},col,light)
 -- The fist is oriented with the wrist and visibly wraps the same grip socket
 -- used by the weapon. A neutral circular cap hid the earlier rotation error.
 local F=R.localTo(j[3],p.arms[side].hand_angle)
 poly(im,R.map({{-6,-8},{5,-12},{17,-11},{23,-5},{21,8},{4,11},{-6,6}},F),col)
 R.poly(im,R.map({{3,-8},{16,-8},{19,-3},{3,-3}},F),light)
 R.line(im,F({7,0}),F({7,7}),C.outline)
 R.line(im,F({13,0}),F({13,7}),C.outline)
 local sh=j[1];R.disc(im,R.add(sh,{-2,-3}),16,12,light)
end
local function torso(im,p)
 local B=R.basis(p.root,p.neck)
 local path={B(-.03,-29),B(.22,-24),B(.55,-35),B(.78,-45),B(.90,-32),B(1,-15),
             B(1,15),B(.86,43),B(.62,44),B(.42,31),B(.19,25),B(-.03,30)}
 poly(im,path,C.body)
 -- Explicit shoulder underlaps maintain attachment through torso counterrotation.
 for _,side in ipairs({'left','right'}) do
  local sh=p.arms[side].joints[1]
  R.limb(im,{B(.77,0),sh},{28,19},C.body,C.outline)
 end
 R.poly(im,{B(.02,-24),B(.35,-25),B(.58,-29),B(.77,-34),B(.79,-16),B(.5,-7),B(.15,-9)},C.body_shadow)
 R.limb(im,{p.neck,R.add(p.head,{-4,20})},{13,19},C.body,C.outline)
 -- Chest and waist contour cues; these are construction volumes, not costume shading.
 R.line(im,B(.62,-25),B(.62,31),C.body_shadow)
 R.line(im,B(.22,-19),B(.22,20),C.body_shadow)
end
local function pelvis(im,p)
 local B=R.localTo(p.root,p.hip_angle)
 poly(im,R.map({{-32,-18},{15,-20},{34,-3},{33,18},{18,36},{-7,34},{-30,15}},B),C.body_shadow)
 R.poly(im,R.map({{-29,-16},{14,-18},{32,-3},{27,5},{-26,-5}},B),C.body)
 R.line(im,B({-27,-9}),B({28,4}),C.guide)
 ring(im,p.hips.left,6,C.far);ring(im,p.hips.right,6,C.near)
end
local function head(im,p)
 local H=function(v) return R.add(p.head,v) end
 -- Neutral profile with Kaida's swept-hair outline, intentionally no detailed face.
 poly(im,R.map({{-27,-33},{1,-40},{24,-31},{31,-15},{29,-2},{39,7},{30,12},{30,25},{17,35},{2,35},{-22,17},{-31,-4}},H),C.body)
 R.poly(im,R.map({{12,-24},{26,-17},{25,-3},{34,7},{24,9},{26,24},{15,31},{8,22},{3,-4}},H),C.near_light)
 poly(im,R.map({{-29,16},{-40,12},{-53,22},{-45,4},{-64,8},{-53,-7},{-71,-4},{-55,-19},{-65,-19},{-42,-32},
  {-50,-35},{-27,-39},{-25,-51},{-13,-45},{3,-53},{18,-44},{31,-39},{36,-22},{30,-7},{24,-18},{13,-26},{-1,-16},{-12,2},{-14,18}},H),C.hair)
 R.line(im,H({19,-1}),H({29,-1}),C.outline)
end
local function coat(im,p,near)
 local B=R.localTo(p.root,p.hip_angle)
 local lag=math.sin((p.phase-.16)*math.pi*2)
 local points=near and {{-27,-7},{-6,9},{-44,31},{-92,43+8*lag},{-138,48+14*lag},{-108,30},{-155,36+11*lag},{-113,10+6*lag},{-67,10}}
  or {{-21,-5},{5,15},{-20,44},{-67,80+8*lag},{-105,104+15*lag},{-80,64},{-122,82+12*lag},{-85,38},{-55,14}}
 poly(im,R.map(points,B),near and C.tail or C.hair)
end
local function sword(im,p)
 local F=R.localTo(p.weapon.hand,p.weapon.angle)
 poly(im,R.map({{-27,-6},{2,-6},{5,-19},{16,-15},{25,-6},{190,-4},{208,0},{190,5},{25,7},{16,17},{5,19},{2,6},{-27,6}},F),C.sword)
 R.poly(im,R.map({{19,-1},{190,-2},{208,0},{190,1},{19,3}},F),C.sword_light)
 R.line(im,F({-23,-5}),F({-23,5}),C.outline)
 R.disc(im,F({12,0}),6,6,C.outline);R.disc(im,F({12,0}),4,4,C.sword_light)
end
for fi,p in ipairs(poses.frames) do
 if fi>1 then s:newEmptyFrame() end;s.frames[fi].duration=p.duration_ms/1000
 local ims={};for _,name in ipairs(d.layer_order) do ims[name]=Image(s.width,s.height,ColorMode.RGB) end
 coat(ims['coat.far'],p,false);coat(ims['coat.near'],p,true)
 torso(ims.torso,p);pelvis(ims.pelvis,p);head(ims.head,p);sword(ims['weapon.right'],p)
 for _,side in ipairs({'left','right'}) do
  leg(ims['leg.'..side],p,side);arm(ims['arm.'..side],p,side)
  for _,joints in ipairs({p.legs[side].joints,p.arms[side].joints}) do
   for i=1,#joints-1 do R.line(ims['guides.joints'],joints[i],joints[i+1],C.guide) end
   for _,point in ipairs(joints) do R.disc(ims['guides.joints'],point,3,3,C.guide) end
  end
 end
 for _,name in ipairs(d.layer_order) do s:newCel(layers[name],fi,ims[name],Point(0,0)) end
end
local tag=s:newTag(1,#poses.frames);tag.name=d.clip;tag.aniDir=AniDir.FORWARD
local origin=s:newSlice(Rectangle(0,0,s.width,s.height));origin.name='origin';origin.pivot=Point(d.origin[1],d.origin[2])
for _,side in ipairs({'left','right'}) do
 for i,name in ipairs({'hip','knee','ankle'}) do
  local v=poses.frames[1].legs[side].joints[i];local slice=s:newSlice(Rectangle(0,0,s.width,s.height))
  slice.name='pivot.'..side..'.'..name;slice.pivot=Point(R.round(v[1]),R.round(v[2]))
 end
end
assert(s:saveAs(assert(app.params.output)));s:close()
