-- Inspect the saved cels, not just the intended pose metadata.
local function read(path)local f=assert(io.open(path));local v=json.decode(f:read('*a'));f:close();return v end
local poses=read(assert(app.params.poses));local motion=read(assert(app.params.motion))
local s=assert(app.open(assert(app.params.source)));local A=app.pixelColor.rgbaA
local layers={};for _,l in ipairs(s.layers) do layers[l.name]=l;assert(l.isVisible,'Hidden production part: '..l.name) end
local function pixel(c,x,y)
 x=x-c.position.x;y=y-c.position.y
 return x>=0 and y>=0 and x<c.image.width and y<c.image.height and A(c.image:getPixel(x,y)) or 0
end
local function islands(im)
 local todo={};for p in im:pixels() do if A(p())>0 then todo[p.y*im.width+p.x]=true end end
 local count,pixels=0,0
 while next(todo) do
  count=count+1;local first=next(todo);local queue={first};todo[first]=nil;local k=1
  while k<=#queue do local n=queue[k];k=k+1;local x,y=n%im.width,n//im.width
   for dy=-1,1 do for dx=-1,1 do local xx,yy=x+dx,y+dy
    if xx>=0 and yy>=0 and xx<im.width and yy<im.height then local q=yy*im.width+xx
     if todo[q] then todo[q]=nil;queue[#queue+1]=q end
    end
   end end
  end
  pixels=pixels+#queue
 end
 return count,pixels
end
local checks={frames=#s.frames,layers=#s.layers,overlap_checks=0,cel_components={},composite_components={},foot_bottoms={}}
assert(#s.frames==16 and #s.layers==20)
for fi,pose in ipairs(poses.frames) do
 local function cel(n)return assert(layers[n]:cel(fi),n..' missing cel') end
 local function overlap(a,b,point,radius)
  local ca,cb=cel(a),cel(b);local n=0
  for y=math.floor(point[2]-radius),math.ceil(point[2]+radius) do for x=math.floor(point[1]-radius),math.ceil(point[1]+radius) do
   if pixel(ca,x,y)>128 and pixel(cb,x,y)>128 then n=n+1 end
  end end
  assert(n>=4,string.format('Frame %d: %s / %s joint gap (%d overlap pixels)',fi,a,b,n))
  checks.overlap_checks=checks.overlap_checks+1
 end
 for name,l in pairs(layers) do
  local c=cel(name);local n,pixels=islands(c.image)
  checks.cel_components[#checks.cel_components+1]={frame=fi,layer=name,components=n,pixels=pixels}
  assert(n==1,string.format('Frame %d: %s has %d pixel islands',fi,name,n))
  for p in c.image:pixels() do if A(p())>0 then
   local x,y=p.x+c.position.x,p.y+c.position.y
   assert(x>0 and x<s.width-1 and y>0 and y<s.height-1,name..' clipped at frame '..fi)
  end end
 end
 for _,side in ipairs({'left','right'}) do
  local leg=pose.legs[side];local arm=motion.frames[fi].arms[side].joints
  overlap('pelvis','leg.'..side..'.thigh',leg[1],30)
  overlap('leg.'..side..'.thigh','leg.'..side..'.shin',leg[2],24)
  overlap('leg.'..side..'.thigh','knee.'..side,leg[2],24)
  overlap('leg.'..side..'.shin','foot.'..side,leg[3],22)
  overlap('torso','arm.'..side..'.upper',arm[1],30)
  overlap('arm.'..side..'.upper','arm.'..side..'.fore',arm[2],22)
  overlap('arm.'..side..'.fore','hand.'..side,arm[3],22)
  local foot=cel('foot.'..side);local bottom=-1
  for p in foot.image:pixels() do if A(p())>0 then bottom=math.max(bottom,p.y+foot.position.y) end end
  assert(bottom==pose.foot_bottom[side],'Boot contact changed')
  assert(bottom==math.floor(pose.contacts[side].lowest_y+.5),'Boot floor differs from motion')
  assert(not pose.contacts[side].planted or bottom==590,'Planted boot floats')
  checks.foot_bottoms[#checks.foot_bottoms+1]={frame=fi,side=side,bottom=bottom,planted=pose.contacts[side].planted}
 end
 overlap('head','torso',motion.frames[fi].neck,25)
 overlap('weapon','hand.right',pose.grip,14)
 local composite=Image(s.width,s.height,ColorMode.RGB);composite:drawSprite(s,fi)
 local n=islands(composite);checks.composite_components[#checks.composite_components+1]=n
 assert(n==1,'Detached composite artwork at frame '..fi..': '..n..' islands')
end
s:close();local f=assert(io.open(assert(app.params.output),'w'));f:write(json.encode(checks));f:close()
