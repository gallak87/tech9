-- Bake a small deformable cutout rig into native, independently editable Aseprite cels.
-- Mesh triangles share vertices at knees/elbows; inverse sampling keeps the bind details.
local function read(path) local f=assert(io.open(path));local v=json.decode(f:read('*a'));f:close();return v end
local dir,out=assert(app.params.source),assert(app.params.output)
local rig=read(dir..'/rig.json');local W,H=rig.canvas.width,rig.canvas.height
local pc=app.pixelColor;local A=pc.rgbaA
local function round(v)return math.floor(v+.5)end
local function rotate(x,y,a) local c,s=math.cos(a),math.sin(a);return c*x-s*y,s*x+c*y end
local function transform(p,pivot,position,angle)
 local x,y=rotate(p[1]-pivot[1],p[2]-pivot[2],math.rad(angle));return {x+position[1],y+position[2]}
end
local function bounds(im)
 local x0,y0,x1,y1=W,H,-1,-1
 for p in im:pixels() do if A(p())>0 then x0=math.min(x0,p.x);y0=math.min(y0,p.y);x1=math.max(x1,p.x);y1=math.max(y1,p.y) end end
 assert(x1>=x0,'Empty source part');return {x0,y0,x1+1,y1+1}
end
local sources={}
for _,name in ipairs({'right','down','up'}) do
 local master=assert(app.open(dir..'/'..rig.views[name].master));sources[name]={}
 for _,layer in ipairs(master.layers) do
  local im=Image(W,H,ColorMode.RGB);local cel=assert(layer:cel(1));im:drawImage(cel.image,cel.position)
  sources[name][layer.name]={image=im,bounds=bounds(im)}
 end
 master:close()
end
local s=Sprite(W,H,ColorMode.RGB);s:deleteLayer(s.layers[1])
local order={'coat.back','weapon.far','arm.far','leg.far','leg.near','pelvis','torso','head','weapon','arm.near'}
local layers={};for _,name in ipairs(order) do local l=s:newLayer();l.name=name;layers[name]=l end
local function put(im,x,y,color,context)
 if A(color)==0 then return end
 assert(x>=2 and y>=2 and x<W-2 and y<H-2,'Clipped opaque pixel: '..context..' at '..x..','..y)
 im:drawPixel(x,y,color)
end
local function rigid(source,bind,key,mirror,context)
 local im=Image(W,H,ColorMode.RGB);local b=source.bounds
 local x0,y0,x1,y1=W,H,-W,-H
 for _,p in ipairs({{b[1],b[2]},{b[3],b[2]},{b[3],b[4]},{b[1],b[4]}}) do
  local t=transform(p,bind.pivot,key.position,key.angle)
  x0=math.min(x0,t[1]);y0=math.min(y0,t[2]);x1=math.max(x1,t[1]);y1=math.max(y1,t[2])
 end
 local a=math.rad(-key.angle);local c,sn=math.cos(a),math.sin(a)
 for y=math.floor(y0)-1,math.ceil(y1)+1 do for x=math.floor(x0)-1,math.ceil(x1)+1 do
  local dx,dy=x-key.position[1],y-key.position[2]
  local sx,sy=round(c*dx-sn*dy+bind.pivot[1]),round(sn*dx+c*dy+bind.pivot[2])
  if sx>=0 and sy>=0 and sx<W and sy<H then put(im,mirror and 2*rig.origin[1]-x or x,y,source.image:getPixel(sx,sy),context) end
 end end
 return im
end
local function mesh(source,bind,key,mirror,context)
 local im=Image(W,H,ColorMode.RGB);local b=source.bounds
 local transforms={}
 for i=1,2 do
  local a,c=bind.chain[i],bind.chain[i+1];local d,e=key.joints[i],key.joints[i+1]
  local angle=math.atan(e[2]-d[2],e[1]-d[1])-math.atan(c[2]-a[2],c[1]-a[1])
  local sx,sy=c[1]-a[1],c[2]-a[2];local dx,dy=e[1]-d[1],e[2]-d[2]
  local sl,dl=math.sqrt(sx*sx+sy*sy),math.sqrt(dx*dx+dy*dy)
  transforms[i]={pivot=a,position=d,c=math.cos(angle),s=math.sin(angle),scale=dl/sl,ux=dx/dl,uy=dy/dl}
 end
 transforms[3]={pivot=bind.chain[3],position=key.joints[3],c=math.cos(math.rad(key.tip_angle)),s=math.sin(math.rad(key.tip_angle))}
 local function tform(p,t)
  local x,y=p[1]-t.pivot[1],p[2]-t.pivot[2]
  local rx,ry=t.c*x-t.s*y,t.s*x+t.c*y
  if t.scale then
   local extra=(rx*t.ux+ry*t.uy)*(t.scale-1);rx,ry=rx+extra*t.ux,ry+extra*t.uy
  end
  return {t.position[1]+rx,t.position[2]+ry}
 end
 local function vertex(x,y)
  local p={x,y};local blend=bind.joint_blend;local k1,k2=bind.chain[2][2],bind.chain[3][2]
  local t
  if y<k1-blend then t=tform(p,transforms[1])
  elseif y<=k1+blend then
   local a,c=tform(p,transforms[1]),tform(p,transforms[2]);local u=(y-k1+blend)/(2*blend)
   t={a[1]+(c[1]-a[1])*u,a[2]+(c[2]-a[2])*u}
  elseif y<k2-blend then t=tform(p,transforms[2])
  elseif y<=k2+blend then
   local a,c=tform(p,transforms[2]),tform(p,transforms[3]);local u=(y-k2+blend)/(2*blend)
   t={a[1]+(c[1]-a[1])*u,a[2]+(c[2]-a[2])*u}
  else t=tform(p,transforms[3]) end
  if mirror then t[1]=2*rig.origin[1]-t[1] end
  return {x=x,y=y,dx=t[1],dy=t[2]}
 end
 local function triangle(a,b,c)
  local den=(b.dy-c.dy)*(a.dx-c.dx)+(c.dx-b.dx)*(a.dy-c.dy)
  if math.abs(den)<.00001 then return end
  for y=math.floor(math.min(a.dy,b.dy,c.dy)),math.ceil(math.max(a.dy,b.dy,c.dy)) do
   for x=math.floor(math.min(a.dx,b.dx,c.dx)),math.ceil(math.max(a.dx,b.dx,c.dx)) do
    local u=((b.dy-c.dy)*(x-c.dx)+(c.dx-b.dx)*(y-c.dy))/den
    local v=((c.dy-a.dy)*(x-c.dx)+(a.dx-c.dx)*(y-c.dy))/den
    local w=1-u-v
    if u>=-.00001 and v>=-.00001 and w>=-.00001 then
     local sx,sy=round(a.x*u+b.x*v+c.x*w),round(a.y*u+b.y*v+c.y*w)
     if sx>=0 and sy>=0 and sx<W and sy<H then put(im,x,y,source.image:getPixel(sx,sy),context) end
    end
   end
  end
 end
 local step=4
 local xs,ys={},{}
 for x=b[1]-1,b[3]+step,step do xs[#xs+1]=x end
 for y=b[2]-1,b[4]+step,step do ys[#ys+1]=y end
 -- Exact joint rows prevent a grid square straddling an entire blend region.
 for _,j in ipairs({bind.chain[2][2],bind.chain[3][2]}) do
  for _,off in ipairs({-bind.joint_blend,0,bind.joint_blend}) do if j+off>ys[1] and j+off<ys[#ys] then ys[#ys+1]=j+off end end
 end
 table.sort(ys)
 local grid={}
 for iy,y in ipairs(ys) do grid[iy]={};for ix,x in ipairs(xs) do grid[iy][ix]=vertex(x,y) end end
 for iy=1,#ys-1 do for ix=1,#xs-1 do
  local a,b,c,d=grid[iy][ix],grid[iy][ix+1],grid[iy+1][ix+1],grid[iy+1][ix]
  triangle(a,b,c);triangle(a,c,d)
 end end
 return im
end
local ranges,frameNumber={},0
local audit={schema=1,checks={'opaque canvas margin','named part cels','fixed origin','explicit durations'},frames={},tags={}}
for _,clip in ipairs(rig.clips) do
 if not app.params.only or clip.name==app.params.only then
  local first=frameNumber+1;local sourceView=clip.view=='left' and 'right' or clip.view
  local source,bind=sources[sourceView],rig.views[sourceView].bind
  for index,key in ipairs(clip.frames) do
   frameNumber=frameNumber+1;if frameNumber>1 then s:newEmptyFrame() end
   s.frames[frameNumber].duration=key.duration_ms/1000
   local record={clip=clip.name,index=index,parts={}}
   for _,name in ipairs(order) do
    local im
    if name=='weapon.far' then
     if clip.view=='left' then im=rigid(source.weapon,bind.weapon,key.parts.weapon,true,clip.name..':'..index..':weapon.far') end
    elseif not (name=='weapon' and clip.view=='left') then
     local context=clip.name..':'..index..':'..name
     im=bind[name].type=='mesh' and mesh(source[name],bind[name],key.parts[name],clip.mirror,context) or rigid(source[name],bind[name],key.parts[name],clip.mirror,context)
    end
    im=im or Image(W,H,ColorMode.RGB)
    s:newCel(layers[name],frameNumber,im,Point(0,0))
   end
   local flat=Image(W,H,ColorMode.RGB);flat:drawSprite(s,frameNumber)
   local b=bounds(flat);record.bounds=b;audit.frames[#audit.frames+1]=record
  end
  ranges[#ranges+1]={name=clip.name,first=first,last=frameNumber,loop=clip.loop}
  print('Baked '..clip.name..' ('..#clip.frames..' frames)')
 end
end
for _,range in ipairs(ranges) do local tag=s:newTag(range.first,range.last);tag.name=range.name;tag.aniDir=AniDir.FORWARD;audit.tags[#audit.tags+1]=range end
local origin=s:newSlice(Rectangle(0,0,W,H));origin.name='origin';origin.pivot=Point(table.unpack(rig.origin))
assert(s:saveAs(out..'/animation.aseprite'))
local f=assert(io.open(out..'/bake-report.json','w'));f:write(json.encode(audit));f:close();s:close()
