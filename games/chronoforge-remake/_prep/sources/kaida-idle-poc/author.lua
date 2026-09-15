-- Build an editable cutout from the approved reference through Aseprite's Lua API.
-- All masks/pivots are authored in source-image coordinates in parts.json.
local function read(path)
  local f=assert(io.open(path,'r'));local result=json.decode(f:read('*a'));f:close();return result
end
local root=assert(app.params.root)
local dir=assert(app.params.output)
local spec=read(root..'/_prep/sources/kaida-idle-poc/parts.json')
local source=assert(app.open(root..'/'..spec.reference))
local ref=Image(source.width,source.height,ColorMode.RGB);ref:drawSprite(source,1);source:close()
local rgba=app.pixelColor.rgba
local red,green,blue=app.pixelColor.rgbaR,app.pixelColor.rgbaG,app.pixelColor.rgbaB
local crop=spec.crop
local W,H=crop.width,crop.height
local function index(x,y) return y*W+x+1 end
local function pixel(x,y) return ref:getPixel(crop.x+x,crop.y+y) end
local function backdrop(c,x,y)
  local r,g,b=red(c),green(c),blue(c)
  local sx,sy=x+crop.x,y+crop.y
  -- The baked checker is pink-tinted along the energy blade. Its dark outline
  -- separates the blade from this brighter matte; allow a local flood there.
  if sx>1200 and sy>550 and sx-sy>615 and sx-sy<695 then
    return math.min(r,g,b)>145 and math.max(r,g,b)-math.min(r,g,b)<70
  end
  return math.min(r,g,b)>164 and math.max(r,g,b)-math.min(r,g,b)<18
end
local removed,queue={},{}
local function seed(x,y)
  if x<0 or y<0 or x>=W or y>=H then return end
  local n=index(x,y)
  if not removed[n] and backdrop(pixel(x,y),x,y) then
    removed[n]=true;queue[#queue+1]={x,y}
  end
end
for x=0,W-1 do seed(x,0);seed(x,H-1) end
for y=0,H-1 do seed(0,y);seed(W-1,y) end
for _,p in ipairs(spec.background_seeds) do seed(p[1]-crop.x,p[2]-crop.y) end
local q=1
while q<=#queue do
  local p=queue[q];q=q+1
  seed(p[1]-1,p[2]);seed(p[1]+1,p[2]);seed(p[1],p[2]-1);seed(p[1],p[2]+1)
end
local function inside(x,y,poly)
  local hit=false
  local j=#poly
  for i=1,#poly do
    local a,b=poly[i],poly[j]
    if ((a[2]>y)~=(b[2]>y)) and x<(b[1]-a[1])*(y-a[2])/(b[2]-a[2])+a[1] then hit=not hit end
    j=i
  end
  return hit
end
local byName={}
for _,part in ipairs(spec.parts) do byName[part.layer]=part end
local function masked(part,x,y)
  if part.min_y and y<part.min_y then return false end
  if part.polygon then return inside(x,y,part.polygon) end
  for _,poly in ipairs(part.polygons or {}) do if inside(x,y,poly) then return true end end
  return false
end
-- Keep every foreground pixel once. Priority resolves occlusion in the reference.
local priority={'arm.near','weapon','head','arm.far','coat.back'}
local owners,colors={},{}
for y=0,H-1 do for x=0,W-1 do
  local n=index(x,y)
  if not removed[n] then
    local sx,sy=x+crop.x,y+crop.y
    local owner=sy<411 and 'torso' or 'legs'
    for _,name in ipairs(priority) do
      if masked(byName[name],sx,sy) then owner=name;break end
    end
    owners[n]=owner;colors[n]=pixel(x,y)
  end
end end
-- Drop any disconnected background flecks or the neighboring reference's sword.
local visited={}
local islands={}
for y=0,H-1 do for x=0,W-1 do
  local n=index(x,y)
  if owners[n] and not visited[n] then
    local points={{x,y}};visited[n]=true;local k=1
    while k<=#points do
      local p=points[k];k=k+1
      for dy=-1,1 do for dx=-1,1 do
        local nx,ny=p[1]+dx,p[2]+dy
        if nx>=0 and ny>=0 and nx<W and ny<H then
          local ni=index(nx,ny)
          if owners[ni] and not visited[ni] then visited[ni]=true;points[#points+1]={nx,ny} end
        end
      end end
    end
    islands[#islands+1]=points
  end
end end
local biggest=0
for i,points in ipairs(islands) do if biggest==0 or #points>#islands[biggest] then biggest=i end end
for i,points in ipairs(islands) do
  if i~=biggest then for _,p in ipairs(points) do owners[index(p[1],p[2])]=nil;colors[index(p[1],p[2])]=nil end end
end
local s=Sprite(spec.canvas.width,spec.canvas.height,ColorMode.RGB);s:deleteLayer(s.layers[1])
local counts={}
local function lookup(name,x,y)
  if x<0 or y<0 or x>=W or y>=H then return nil end
  local n=index(x,y)
  if owners[n]==name then return colors[n] end
  return nil
end
-- Create hidden underlap only where parts meet, using local clone colors.
-- It is covered in the bind pose and prevents transparent cracks on small motions.
local extended={}
for _,name in ipairs({'torso','legs','arm.far'}) do
  local map={};extended[name]=map
  for y=0,H-1 do for x=0,W-1 do
    local n=index(x,y);local current=owners[n]
    local eligible=(name=='torso' and (current=='head' or current=='arm.near' or current=='legs'))
      or (name=='legs' and current=='weapon')
      or (name=='arm.far' and current=='torso')
    if eligible then
      local radius=name=='legs' and 30 or 8
      local found
      if name=='legs' then
        -- Fill behind the crossing blade only when it has leg pixels on both
        -- sides. Do not invent an opaque strip across the gap between the legs.
        local a,b
        for d=1,radius do
          a=a or lookup(name,x-d,y+d)
          b=b or lookup(name,x+d,y-d)
          if a and b then break end
        end
        if a and b then found=a end
      else
      for d=1,radius do
        for _,p in ipairs({{x-d,y},{x+d,y},{x,y-d},{x,y+d},{x-d,y-d},{x+d,y+d},{x-d,y+d},{x+d,y-d}}) do
          found=lookup(name,p[1],p[2]);if found then break end
        end
        if found then break end
      end
      end
      if found then map[n]=found end
    end
  end end
end
local factor=spec.downsample
for _,part in ipairs(spec.parts) do
  local name=part.layer
  local layer=s:newLayer();layer.name=name
  local image=Image(s.width,s.height,ColorMode.RGB)
  local count=0
  for dy=0,H/factor-1 do for dx=0,W/factor-1 do
    local rr,gg,bb,aa=0,0,0,0
    for yy=0,factor-1 do for xx=0,factor-1 do
      local n=index(dx*factor+xx,dy*factor+yy)
      local c=(owners[n]==name and colors[n]) or (extended[name] and extended[name][n])
      if c then rr=rr+red(c);gg=gg+green(c);bb=bb+blue(c);aa=aa+1 end
    end end
    if aa>0 then
      image:drawPixel(dx+spec.offset[1],dy+spec.offset[2],rgba(math.floor(rr/aa+.5),math.floor(gg/aa+.5),math.floor(bb/aa+.5),math.floor(255*aa/(factor*factor)+.5)))
      count=count+1
    end
  end end
  s:newCel(layer,1,image,Point(0,0));counts[name]=count
end
local origin=s:newSlice(Rectangle(0,0,s.width,s.height));origin.name='origin';origin.pivot=Point(spec.origin[1],spec.origin[2])
s.frames[1].duration=.12
assert(s:saveAs(dir..'/master.aseprite'))
local flat=Image(s.width,s.height,ColorMode.RGB);flat:drawSprite(s,1);flat:saveAs(dir..'/standing.png')
local backdropImage=Image(s.width,s.height,ColorMode.RGB);backdropImage:clear(Color{r=27,g=30,b=39,a=255});backdropImage:drawImage(flat);backdropImage:saveAs(dir..'/standing-dark.png')
local f=assert(io.open(dir..'/author-report.json','w'));f:write(json.encode({layers=counts,removedBackgroundPixels=#queue,connectedComponents=#islands}));f:close();s:close()
