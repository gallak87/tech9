-- Retarget editable character parts onto a separate motion clip in Aseprite.
local function read(p)local f=assert(io.open(p));local v=json.decode(f:read('*a'));f:close();return v end
local output=assert(app.params.output)
local parts=read(assert(app.params.parts));local motion=read(assert(app.params.poses));local d=read(assert(app.params.design))
local R=dofile(assert(app.params.raster));local pc=app.pixelColor;local A=pc.rgbaA
local master=assert(app.open(assert(app.params.master)));local textures={}
for _,l in ipairs(master.layers) do local c=l:cel(1);textures[l.name]={image=Image(c.image),offset={c.position.x,c.position.y}} end
master:close()
for _,check in ipairs(parts.ownership_checks or {}) do
 local function alpha(name)
  local t=textures[name];local x,y=check.point[1]-t.offset[1],check.point[2]-t.offset[2]
  return x>=0 and y>=0 and x<t.image.width and y<t.image.height and A(t.image:getPixel(x,y)) or 0
 end
 assert(alpha(check.owner)>128 and alpha(check.excluded)==0,'Rebuild parts: rigid pelvis still owns the proximal thigh')
end
local W,H=d.canvas[1],d.canvas[2]
local function vector(a,b)return {b[1]-a[1],b[2]-a[2]} end
local function point(p)return {p[1],p[2]} end
local function length(p)return math.sqrt(p[1]^2+p[2]^2) end
local function unit(p)local L=length(p);return {p[1]/L,p[2]/L} end
local function matrix(source,target,angle,sx,sy)
 local a=math.rad(angle);local c,s=math.cos(a),math.sin(a)
 return {a=c*sx,b=s*sx,c=-s*sy,d=c*sy,source=source,target=target}
end
local function bone(a,b,c,e,width)
 local u,v=unit(vector(a,b)),unit(vector(c,e));local along=length(vector(c,e))/length(vector(a,b))
 return {a=v[1]*along*u[1]+v[2]*width*u[2],c=v[1]*along*u[2]-v[2]*width*u[1],
         b=v[2]*along*u[1]-v[1]*width*u[2],d=v[2]*along*u[2]+v[1]*width*u[1],source=a,target=c}
end
local function apply(m,p)local x,y=p[1]-m.source[1],p[2]-m.source[2];return {m.target[1]+m.a*x+m.c*y,m.target[2]+m.b*x+m.d*y} end
local function sample(im,x,y)
 local ix,iy=math.floor(x),math.floor(y);local fx,fy=x-ix,y-iy
 local alpha,rr,gg,bb=0,0,0,0
 for dy=0,1 do for dx=0,1 do local xx,yy=ix+dx,iy+dy
  if xx>=0 and yy>=0 and xx<im.width and yy<im.height then
   local c=im:getPixel(xx,yy);local w=(dx==0 and 1-fx or fx)*(dy==0 and 1-fy or fy)*A(c)/255
   alpha=alpha+w;rr=rr+w*pc.rgbaR(c);gg=gg+w*pc.rgbaG(c);bb=bb+w*pc.rgbaB(c)
  end
 end end
 if alpha<.15 then return 0 end
 return pc.rgba(math.floor(rr/alpha+.5),math.floor(gg/alpha+.5),math.floor(bb/alpha+.5),math.floor(alpha*255+.5))
end
local function render(name,m)
 local tex=assert(textures[name]);local src=tex.image;local off=tex.offset
 local minx,miny,maxx,maxy=W,H,0,0
 for _,c in ipairs({{0,0},{src.width,0},{src.width,src.height},{0,src.height}}) do
  local p=apply(m,{c[1]+off[1],c[2]+off[2]});minx=math.min(minx,p[1]);miny=math.min(miny,p[2]);maxx=math.max(maxx,p[1]);maxy=math.max(maxy,p[2])
 end
 minx=math.floor(minx)-2;miny=math.floor(miny)-2;maxx=math.ceil(maxx)+2;maxy=math.ceil(maxy)+2
 assert(minx>-W and miny>-H and maxx<W*2 and maxy<H*2,name..' unreasonable transform bounds')
 local im=Image(maxx-minx+1,maxy-miny+1,ColorMode.RGB);local det=m.a*m.d-m.b*m.c
 local bottom=-1
 for y=miny,maxy do for x=minx,maxx do
  local dx,dy=x-m.target[1],y-m.target[2]
  local sx=(m.d*dx-m.c*dy)/det+m.source[1]-off[1]
  local sy=(-m.b*dx+m.a*dy)/det+m.source[2]-off[2]
  local c=sample(src,sx,sy);if A(c)>0 then im:drawPixel(x-minx,y-miny,c);bottom=math.max(bottom,y) end
 end end
 return {image=im,x=minx,y=miny,bottom=bottom}
end
local function ik(hip,ankle,L1,L2)
 local v=vector(hip,ankle);local D=length(v);assert(D<L1+L2 and D>math.abs(L1-L2),'Unreachable art ankle')
 local u={v[1]/D,v[2]/D};local along=(L1^2-L2^2+D^2)/(2*D);local h=math.sqrt(math.max(0,L1^2-along^2))
 return {point(hip),{hip[1]+u[1]*along+u[2]*h,hip[2]+u[2]*along-u[1]*h},ankle}
end
local function cleanSampling(im)
 local todo={};for p in im:pixels() do if A(p())>0 then todo[p.y*im.width+p.x]=true end end
 local components={}
 while next(todo) do
  local first=next(todo);local q={first};todo[first]=nil;local k=1
  while k<=#q do local n=q[k];k=k+1;local x,y=n%im.width,n//im.width
   for dy=-1,1 do for dx=-1,1 do local xx,yy=x+dx,y+dy
    if xx>=0 and yy>=0 and xx<im.width and yy<im.height then local at=yy*im.width+xx
     if todo[at] then todo[at]=nil;q[#q+1]=at end
    end
   end end
  end;components[#components+1]=q
 end
 table.sort(components,function(a,b)return #a>#b end)
 local removed=0
 for i=2,#components do
  assert(#components[i]<=4,'Transform detached a meaningful part; fix the source mask')
  for _,n in ipairs(components[i]) do im:drawPixel(n%im.width,n//im.width,0);removed=removed+1 end
 end
 return removed
end
local s=Sprite(W,H,ColorMode.RGB);local first=s.layers[1];local layers={}
for _,part in ipairs(parts.parts) do local l=s:newLayer();l.name=part.name;layers[part.name]=l end;s:deleteLayer(first)
local report={frames={},method='shared textured character parts, pose-specific joint underlaps; no generated animation frames'}
for fi,p in ipairs(motion.frames) do
 if fi>1 then s:newEmptyFrame() end;s.frames[fi].duration=p.duration_ms/1000
 local feet={};local artlegs={}
 for _,part in ipairs(parts.parts) do if part.kind=='foot' then
  local side=part.side;local ankle=p.legs[side].joints[3]
  local im=render(part.name,matrix(part.anchor,ankle,p.legs[side].foot_angle-part.angle,part.scale,part.scale))
  local dy=R.round(p.contacts[side].lowest_y)-im.bottom;im.y=im.y+dy;im.bottom=im.bottom+dy
  feet[part.name]=im
  artlegs[side]=ik(p.hips[side],{ankle[1],ankle[2]+dy},d.leg_lengths[1],d.leg_lengths[2])
 end end
 local frameRecord={index=fi,hips={left=point(p.hips.left),right=point(p.hips.right)},legs=artlegs,contacts={},foot_bottom={},grip=point(p.weapon.hand),hand_angle=p.weapon.angle,sampling_specks_removed={},hip_fabric={}}
 for _,side in ipairs({'left','right'}) do local c=p.contacts[side];frameRecord.contacts[side]={phase=c.phase,planted=c.planted,lift=c.lift,lowest_y=c.lowest_y} end
 for _,part in ipairs(parts.parts) do
  local m,im;local kind=part.kind
  if kind=='foot' then im=feet[part.name];frameRecord.foot_bottom[part.side]=im.bottom
  elseif kind=='bone' then local j=artlegs[part.side];m=bone(part.a,part.b,j[part.segment+1],j[part.segment+2],parts.default_width_scale)
  elseif kind=='knee' then
   local j=artlegs[part.side];local a=vector(part.thigh_start,part.anchor);local b=vector(j[1],j[2])
   local angle=math.deg(math.atan(b[2],b[1])-math.atan(a[2],a[1]))
   m=matrix(part.anchor,j[2],angle,part.scale,part.scale)
  elseif kind=='arm' then local j=p.arms[part.side].joints;m=bone(part.a,part.b,j[part.segment+1],j[part.segment+2],parts.default_width_scale)
  elseif kind=='torso' then m=bone(part.a,part.b,p.root,p.neck,.46)
  elseif kind=='pelvis' then m=matrix(part.anchor,p.root,p.hip_angle,part.scale,part.scale)
  elseif kind=='head' then m=matrix(part.anchor,p.neck,p.torso_angle*.3,part.scale,part.scale)
  elseif kind=='tail' then
   local delta={(part.anchor[1]-685)*part.scale,(part.anchor[2]-488)*part.scale}
   local at=R.add(p.root,R.rot(delta,p.hip_angle));local lag=math.sin((p.phase-.15)*math.pi*2)
   m=matrix(part.anchor,at,p.hip_angle+lag*5,part.scale,part.scale)
  elseif kind=='hand' then
   m=matrix(part.anchor,p.arms[part.side].grip,p.arms[part.side].hand_angle-part.angle,part.scale,part.scale)
  elseif kind=='weapon' then m=matrix(part.anchor,p.weapon.hand,p.weapon.angle-part.angle,part.scale,part.scale)
  end
  im=im or render(part.name,m)
  if part.fabric_axis then
   frameRecord.hip_fabric[part.side]={root=apply(m,part.fabric_axis[1]),seam=apply(m,part.fabric_axis[2])}
  end
  frameRecord.sampling_specks_removed[part.name]=cleanSampling(im.image)
  s:newCel(layers[part.name],fi,im.image,Point(im.x,im.y))
 end
 report.frames[#report.frames+1]=frameRecord
end
local tag=s:newTag(1,#s.frames);tag.name='run.right';tag.aniDir=AniDir.FORWARD
local origin=s:newSlice(Rectangle(0,0,W,H));origin.name='origin';origin.pivot=Point(d.origin[1],d.origin[2])
for _,side in ipairs({'left','right'}) do
 for i,name in ipairs({'hip','knee','ankle'}) do local v=report.frames[1].legs[side][i];local slice=s:newSlice(Rectangle(0,0,W,H));slice.name='pivot.'..side..'.'..name;slice.pivot=Point(R.round(v[1]),R.round(v[2])) end
end
assert(s:saveAs(output..'/animation.aseprite'))
for fi=1,#s.frames do local im=Image(W,H,ColorMode.RGB);im:drawSprite(s,fi);im:saveAs(output..'/frame-'..fi..'.png') end
s:close();local f=assert(io.open(output..'/art-poses.json','w'));f:write(json.encode(report));f:close()
