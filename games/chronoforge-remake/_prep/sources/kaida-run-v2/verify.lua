-- Inspect the saved, reopened pixels, not just the pose recipe.
local function read(path) local f=assert(io.open(path));local s=f:read('*a');f:close();return json.decode(s) end
local s=assert(app.open(assert(app.params.source)))
local d=read(assert(app.params.design));local poses=read(assert(app.params.poses))
local out=assert(app.params.output);local A=app.pixelColor.rgbaA;local pc=app.pixelColor
local W,H=s.width,s.height
assert(W==d.canvas[1] and H==d.canvas[2],'Wrong canvas')
assert(#s.frames==d.frames and #s.frames==#poses.frames,'Wrong frame count')
assert(#s.layers==#d.layer_order,'Wrong layer count')
local colors={}
for _,hex in pairs(d.palette) do colors[pc.rgba(tonumber(hex:sub(1,2),16),tonumber(hex:sub(3,4),16),tonumber(hex:sub(5,6),16),255)]=true end
local palette=assert(s.palettes[1]);assert(#palette==#d.palette_order+1,'Saved palette lost drawing swatches')
for i,name in ipairs(d.palette_order) do
 local c=palette:getColor(i);local hex=d.palette[name]
 assert(c.red==tonumber(hex:sub(1,2),16) and c.green==tonumber(hex:sub(3,4),16) and c.blue==tonumber(hex:sub(5,6),16),'Saved palette changed')
end
local layers={}
for i,l in ipairs(s.layers) do
 assert(l.name==d.layer_order[i],'Changed occlusion order');assert(l.isVisible and l.opacity==255,'Hidden/translucent art layer')
 layers[l.name]=l
end
local function layerPixels(layer,fi)
 local cel=assert(layer:cel(fi),'Missing cel '..layer.name..' '..fi);local im=Image(W,H,ColorMode.RGB)
 im:drawImage(cel.image,cel.position);return im
end
local function components(im)
 local live={};local count=0
 for p in im:pixels() do
  local color=p();local a=A(color)
  assert(a==0 or a==255,'Unexpected alpha fringe')
  if a>0 then
   assert(colors[color],'Color outside design palette')
   assert(p.x>0 and p.x<W-1 and p.y>0 and p.y<H-1,'Art touches canvas boundary')
   live[p.y*W+p.x]=true;count=count+1
  end
 end
 local result={}
 while next(live) do
  local seed=next(live);live[seed]=nil;local queue={seed};local n=1;local minx,miny,maxx,maxy=W,H,0,0
  while n<=#queue do
   local key=queue[n];n=n+1;local x,y=key%W,math.floor(key/W)
   minx,miny,maxx,maxy=math.min(minx,x),math.min(miny,y),math.max(maxx,x),math.max(maxy,y)
   for dy=-1,1 do for dx=-1,1 do if dx~=0 or dy~=0 then
    local xx,yy=x+dx,y+dy
    if xx>=0 and xx<W and yy>=0 and yy<H then local k=yy*W+xx;if live[k] then live[k]=nil;queue[#queue+1]=k end end
   end end end
  end
  result[#result+1]={pixels=#queue,bounds={minx,miny,maxx,maxy}}
 end
 table.sort(result,function(a,b)return a.pixels>b.pixels end)
 return result,count
end
local report={result='passed',frames=#s.frames,layers=#s.layers,canvas={W,H},checks={}}
for fi,p in ipairs(poses.frames) do
 assert(math.abs(s.frames[fi].duration*1000-p.duration_ms)<.01,'Changed timing')
 local composite=Image(W,H,ColorMode.RGB);composite:drawSprite(s,fi)
 local comps,count=components(composite)
 -- A coherent body/weapon silhouette leaves no detached hair or background particles.
 assert(#comps==1,'Detached pixels in frame '..fi..': '..json.encode(comps))
 local row={frame=fi,opaque=count,components=#comps,feet={},layer_components={}}
 for _,name in ipairs(d.layer_order) do
  local im=layerPixels(layers[name],fi);local cc,pixels=components(im)
  assert(pixels>0,'Empty body part');assert(#cc==1,'Disconnected layer '..name..' frame '..fi..': '..json.encode(cc))
  row.layer_components[name]=#cc
 end
 for _,side in ipairs({'near','far'}) do
  local im=layerPixels(layers['leg.'..side],fi);local bottom=-1;local bottomXs={}
  for px in im:pixels() do if A(px())>0 then
   if px.y>bottom then bottom=px.y;bottomXs={px.x} elseif px.y==bottom then bottomXs[#bottomXs+1]=px.x end
  end end
  local expected=math.floor(p.contacts[side].ground_y+.5)
  assert(math.abs(bottom-expected)<=1,'Rendered boot misses its support height: '..fi..' '..side..' '..bottom..' / '..expected)
  if p.contacts[side].planted then assert(math.abs(bottom-d.origin[2])<=1,'Foot penetrates ground') end
  local exposed=0;for _,x in ipairs(bottomXs) do if A(composite:getPixel(x,bottom))>0 then exposed=exposed+1 end end
  assert(exposed>0,'No rendered support pixel')
  row.feet[side]={bottom=bottom,expected=expected,planted=p.contacts[side].planted}
 end
 -- Validate actual arm/torso overlap and compositing order, avoiding the former floating arm.
 local arm=layerPixels(layers['arm.far'],fi);local torso=layerPixels(layers.torso,fi);local hidden=0
 for px in arm:pixels() do if A(px())>0 and A(torso:getPixel(px.x,px.y))>0 then hidden=hidden+1 end end
 assert(hidden>=12,'Far shoulder does not tuck under torso');row.far_arm_pixels_under_torso=hidden
 local head=layerPixels(layers.head,fi);local faceOverlap=0
 for px in arm:pixels() do if A(px())>0 and A(head:getPixel(px.x,px.y))>0 then faceOverlap=faceOverlap+1 end end
 assert(faceOverlap==0,'Free arm intersects head');row.free_arm_pixels_over_head=faceOverlap
 report.checks[#report.checks+1]=row
end
s:close();local f=assert(io.open(out,'w'));f:write(json.encode(report));f:close()
