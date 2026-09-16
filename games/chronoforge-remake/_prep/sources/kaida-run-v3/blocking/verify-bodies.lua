-- Inspect saved cels, not just the guide JSON. Deliberately excludes hidden guides.
local function read(path) local f=assert(io.open(path));local v=json.decode(f:read('*a'));f:close();return v end
local d=read(assert(app.params.design));local poses=read(assert(app.params.poses))
local s=assert(app.open(assert(app.params.source)));local layers={};local pc=app.pixelColor
for _,l in ipairs(s.layers) do layers[l.name]=l end
assert(#s.layers==#d.layer_order and #s.frames==#poses.frames)
assert(not layers['guides.joints'].isVisible,'Joint construction layer must be hidden in body review')
local palette={}
for _,hex in pairs(d.palette) do palette[pc.rgba(tonumber(hex:sub(1,2),16),tonumber(hex:sub(3,4),16),tonumber(hex:sub(5,6),16),255)]=true end
local function connected(im,label)
 local occupied={};local count,seed,bottom=0,nil,-1
 for px in im:pixels() do
  local c=px();local a=pc.rgbaA(c)
  assert(a==0 or a==255,label..' alpha fringe')
  if a>0 then
   assert(palette[c],label..' unexpected color')
   local index=px.y*im.width+px.x;occupied[index]=true;seed=index;count=count+1;bottom=math.max(bottom,px.y)
  end
 end
 assert(seed,label..' empty')
 local queue={seed};local head=1;occupied[seed]=nil
 while head<=#queue do
  local index=queue[head];head=head+1;local x=index%im.width;local y=math.floor(index/im.width)
  for dy=-1,1 do for dx=-1,1 do
   local xx,yy=x+dx,y+dy
   if xx>=0 and xx<im.width and yy>=0 and yy<im.height then
    local next=yy*im.width+xx
    if occupied[next] then occupied[next]=nil;queue[#queue+1]=next end
   end
  end end
 end
 assert(#queue==count,label..' detached pixels ('..(count-#queue)..')')
 return bottom,count
end
local function opaque(cel,x,y)
 x=math.floor(x+.5)-cel.position.x;y=math.floor(y+.5)-cel.position.y
 return x>=0 and y>=0 and x<cel.image.width and y<cel.image.height and pc.rgbaA(cel.image:getPixel(x,y))==255
end
local sampled=0
for fi,p in ipairs(poses.frames) do
 assert(math.abs(s.frames[fi].duration-p.duration_ms/1000)<.000001)
 for _,name in ipairs(d.layer_order) do
  local cel=assert(layers[name]:cel(fi),'Missing '..name..' cel')
  if name~='guides.joints' then
   local bottom=connected(cel.image,name..' frame '..fi)
   if name=='leg.left' or name=='leg.right' then
    local side=name:sub(5);local ground=bottom+cel.position.y
    assert(ground<=d.origin[2]+1,'Rendered leg penetrates ground')
    if p.contacts[side].planted then
     assert(math.abs(ground-d.origin[2])<=1.1,'Rendered planted boot/ground disagreement')
    end
    -- During recovery the knee can be below the lifted boot, so inspect the
    -- boot's own support vertex rather than the whole leg's bounding box.
    local leg=p.legs[side];local ankle=leg.joints[3];local a=math.rad(leg.foot_angle)
    local lowest={0,-math.huge}
    for _,v in ipairs(d.foot_shape) do
     local x=ankle[1]+v[1]*math.cos(a)-v[2]*math.sin(a)
     local y=ankle[2]+v[1]*math.sin(a)+v[2]*math.cos(a)
     if y>lowest[2] then lowest={x,y} end
    end
    assert(opaque(cel,lowest[1],lowest[2]),'Missing rendered boot support pixel')
   end
  end
 end
 for _,side in ipairs({'left','right'}) do
  for _,kind in ipairs({'leg','arm'}) do
   local j=(kind=='leg' and p.legs or p.arms)[side].joints
   local cel=layers[kind..'.'..side]:cel(fi)
   for i=1,2 do for step=0,32 do
    local t=step/32;local x=j[i][1]+(j[i+1][1]-j[i][1])*t;local y=j[i][2]+(j[i+1][2]-j[i][2])*t
    assert(opaque(cel,x,y),'Hole along '..side..' '..kind);sampled=sampled+1
   end end
  end
 end
 for _,name in ipairs({'arm.right','weapon.right'}) do
  assert(opaque(layers[name]:cel(fi),p.weapon.hand[1],p.weapon.hand[2]),'Grip pixels detached')
 end
 local composite=Image(s.width,s.height,ColorMode.RGB);composite:drawSprite(s,fi)
 connected(composite,'composite frame '..fi)
 for x=0,s.width-1 do
  assert(pc.rgbaA(composite:getPixel(x,0))==0 and pc.rgbaA(composite:getPixel(x,s.height-1))==0,'Canvas clipping')
 end
 for y=0,s.height-1 do
  assert(pc.rgbaA(composite:getPixel(0,y))==0 and pc.rgbaA(composite:getPixel(s.width-1,y))==0,'Canvas clipping')
 end
end
s:close()
local f=assert(io.open(assert(app.params.output),'w'))
f:write(json.encode({result='passed',frames=#poses.frames,body_parts=10,bone_path_pixel_samples=sampled,
 all_parts_connected=true,all_composites_connected=true,rendered_feet_match_ground=true,opaque_joint_paths=true,grip_pixels_overlap=true,no_alpha_fringe=true}));f:close()
