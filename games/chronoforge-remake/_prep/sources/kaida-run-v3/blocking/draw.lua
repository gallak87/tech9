-- Aseprite-native motion guide. Body-part art is intentionally a separate stage.
local root=assert(app.params.root);local out=assert(app.params.output)
local function read(path) local f=assert(io.open(path));local v=json.decode(f:read('*a'));f:close();return v end
local d=read(root..'/design.json');local poses=read(assert(app.params.poses))
local R=dofile(assert(app.params.raster));local C={}
for name,hex in pairs(d.palette) do C[name]=R.color(hex) end
local s=Sprite(d.canvas[1],d.canvas[2],ColorMode.RGB);local first=s.layers[1];local layers={}
local names={'leg.left','arm.left','spine','hips','leg.right','head','weapon.right','arm.right'}
for _,name in ipairs(names) do local l=s:newLayer();l.name=name;layers[name]=l end;s:deleteLayer(first)
local function chain(im,points,col)
 for i=1,#points-1 do R.band(im,points[i],points[i+1],2,2,col) end
 for _,v in ipairs(points) do R.disc(im,v,5,5,col) end
end
for fi,p in ipairs(poses.frames) do
 if fi>1 then s:newEmptyFrame() end;s.frames[fi].duration=p.duration_ms/1000
 local ims={};for _,name in ipairs(names) do ims[name]=Image(s.width,s.height,ColorMode.RGB) end
 for _,side in ipairs({'left','right'}) do
  local c=side=='right' and C.near or C.far
  local j=p.legs[side].joints;local im=ims['leg.'..side];chain(im,j,c)
  local foot=R.map(d.foot_shape,R.localTo(j[3],p.legs[side].foot_angle))
  for i,v in ipairs(foot) do R.line(im,v,foot[i%#foot+1],c) end
  chain(ims['arm.'..side],p.arms[side].joints,c)
 end
 chain(ims.spine,{p.root,p.neck,p.head},C.body)
 chain(ims.spine,{p.arms.left.joints[1],p.neck,p.arms.right.joints[1]},C.body_shadow)
 chain(ims.hips,{p.hips.left,p.root,p.hips.right},C.guide)
 R.disc(ims.head,p.head,30,37,C.body_shadow)
 R.line(ims.head,R.add(p.head,{15,-6}),R.add(p.head,{39,0}),C.body)
 chain(ims['weapon.right'],{p.weapon.hand,p.weapon.tip},C.sword)
 for _,name in ipairs(names) do s:newCel(layers[name],fi,ims[name],Point(0,0)) end
end
local tag=s:newTag(1,#poses.frames);tag.name=d.clip;tag.aniDir=AniDir.FORWARD
local origin=s:newSlice(Rectangle(0,0,s.width,s.height));origin.name='origin';origin.pivot=Point(d.origin[1],d.origin[2])
for _,side in ipairs({'left','right'}) do
 for i,name in ipairs({'hip','knee','ankle'}) do
  local p=poses.frames[1].legs[side].joints[i];local slice=s:newSlice(Rectangle(0,0,s.width,s.height))
  slice.name='pivot.'..side..'.'..name;slice.pivot=Point(R.round(p[1]),R.round(p[2]))
 end
end
assert(s:saveAs(out));s:close()
