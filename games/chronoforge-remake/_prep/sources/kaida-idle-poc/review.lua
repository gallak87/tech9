-- Export lossless review plates, a GIF, part breakdown and onion-skin overlays.
local source=assert(app.params.source)
local output=assert(app.params.output)
local function read(path) local f=assert(io.open(path,'r'));local v=json.decode(f:read('*a'));f:close();return v end
local rig=read(assert(app.params.rig))
local s=assert(app.open(source))
local rgba=app.pixelColor.rgba
local bg=rgba(24,28,37,255)
local function line(image,x0,y0,x1,y1,color)
  x0,y0,x1,y1=math.floor(x0+.5),math.floor(y0+.5),math.floor(x1+.5),math.floor(y1+.5)
  local dx,dy=math.abs(x1-x0),-math.abs(y1-y0)
  local sx,sy=x0<x1 and 1 or -1,y0<y1 and 1 or -1
  local err=dx+dy
  while true do
    if x0>=0 and y0>=0 and x0<image.width and y0<image.height then image:drawPixel(x0,y0,color) end
    if x0==x1 and y0==y1 then break end
    local e=2*err
    if e>=dy then err=err+dy;x0=x0+sx end
    if e<=dx then err=err+dx;y0=y0+sy end
  end
end
local function dot(image,x,y,color)
  for dy=-3,3 do for dx=-3,3 do if dx*dx+dy*dy<=9 then
    local px,py=math.floor(x+dx+.5),math.floor(y+dy+.5)
    if px>=0 and py>=0 and px<image.width and py<image.height then image:drawPixel(px,py,color) end
  end end end
end
local frames={}
for i=1,#s.frames do local image=Image(s.width,s.height,ColorMode.RGB);image:drawSprite(s,i);frames[i]=image end
local sheet=Image(s.width*4,s.height*3,ColorMode.RGB);sheet:clear(bg)
local preview=Sprite(s.width,s.height,ColorMode.RGB)
for i,image in ipairs(frames) do
  local plate=Image(s.width,s.height,ColorMode.RGB);plate:clear(bg)
  line(plate,24,rig.origin[2]+1,s.width-24,rig.origin[2]+1,rgba(52,61,72,255))
  plate:drawImage(image)
  sheet:drawImage(plate,Point(((i-1)%4)*s.width,math.floor((i-1)/4)*s.height))
  if i>1 then preview:newEmptyFrame() end
  preview.frames[i].duration=s.frames[i].duration
  preview:newCel(preview.layers[1],i,plate,Point(0,0))
end
preview:saveAs(output..'/idle.gif');preview:close()
sheet:saveAs(output..'/contact-sheet.png')
frames[1]:saveAs(output..'/standing.png')
local pair=Image(s.width*2,s.height,ColorMode.RGB);pair:clear(bg)
pair:drawImage(frames[1]);pair:drawImage(frames[7],Point(s.width,0));pair:saveAs(output..'/rest-and-inhale.png')
local function tint(image,r,g,b)
  local result=Image(image.width,image.height,ColorMode.RGB)
  for p in image:pixels() do
    local a=app.pixelColor.rgbaA(p())
    if a>0 then result:drawPixel(p.x,p.y,rgba(r,g,b,math.floor(a*.4))) end
  end
  return result
end
local onion=Image(s.width,s.height,ColorMode.RGB);onion:clear(bg)
onion:drawImage(frames[4],Point(0,0),160)
onion:drawImage(tint(frames[1],80,200,255))
onion:drawImage(tint(frames[7],255,103,147))
line(onion,24,rig.origin[2]+1,s.width-24,rig.origin[2]+1,rgba(116,149,157,255))
onion:saveAs(output..'/onion.png')
local bones=Image(s.width,s.height,ColorMode.RGB);bones:clear(bg);bones:drawImage(frames[1],Point(0,0),150)
local pivots={}
for _,part in ipairs(rig.parts) do
  pivots[part.layer]=part.pivot
  if part.parent then local a=pivots[part.parent];line(bones,a[1],a[2],part.pivot[1],part.pivot[2],rgba(107,219,211,255)) end
  dot(bones,part.pivot[1],part.pivot[2],rgba(255,192,100,255))
end
dot(bones,rig.origin[1],rig.origin[2],rgba(115,239,169,255))
line(bones,24,rig.origin[2],s.width-24,rig.origin[2],rgba(115,239,169,255))
bones:saveAs(output..'/rig-guides.png')
local parts=Image(s.width*#s.layers,s.height,ColorMode.RGB);parts:clear(bg)
for i,layer in ipairs(s.layers) do
  local cel=layer:cel(1)
  if cel then parts:drawImage(cel.image,Point((i-1)*s.width+cel.position.x,cel.position.y)) end
end
parts:saveAs(output..'/parts.png')
-- Review both the isolated part and the hole it leaves, at rest and peak
-- inhale. A composite alone hid misassigned arm/sword pixels in the first draft.
for _,layer in ipairs(s.layers) do
  local isolated=Image(s.width*2,s.height,ColorMode.RGB)
  local omitted=Image(s.width*2,s.height,ColorMode.RGB)
  isolated:clear(bg);omitted:clear(bg)
  for column,frame in ipairs({1,7}) do
    local cel=layer:cel(frame)
    if cel then isolated:drawImage(cel.image,Point((column-1)*s.width+cel.position.x,cel.position.y)) end
    layer.isVisible=false
    local flat=Image(s.width,s.height,ColorMode.RGB);flat:drawSprite(s,frame)
    omitted:drawImage(flat,Point((column-1)*s.width,0))
    layer.isVisible=true
  end
  isolated:saveAs(output..'/isolated-'..layer.name..'.png')
  omitted:saveAs(output..'/without-'..layer.name..'.png')
end
s:close()
