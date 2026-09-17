-- Separate authored masks and reconstruct only their hidden joint underlaps.
local function read(p) local f=assert(io.open(p));local v=json.decode(f:read('*a'));f:close();return v end
local root=assert(app.params.root);local out=assert(app.params.output);local spec=read(root..'/parts.json')
local R=dofile(assert(app.params.raster));local pc=app.pixelColor;local A=pc.rgbaA
local input=assert(app.open(root..'/'..spec.reference));local ref=Image(input.width,input.height,ColorMode.RGB);ref:drawSprite(input,1);input:close()
local W,H=ref.width,ref.height
local function inside(x,y,poly)
 local hit=false;local j=#poly
 for i,a in ipairs(poly) do local b=poly[j]
  if (a[2]>y)~=(b[2]>y) and x<(b[1]-a[1])*(y-a[2])/(b[2]-a[2])+a[1] then hit=not hit end
  j=i
 end;return hit
end
local function backdrop(c)
 local r,g,b=pc.rgbaR(c),pc.rgbaG(c),pc.rgbaB(c)
 return r>=24 and r<=37 and g>=26 and g<=39 and b>=28 and b<=42 and b-r>=0 and b-r<=12 and math.abs(r-g)<8
end
local removed,queue={},{}
local function seed(x,y)
 if x<0 or y<0 or x>=W or y>=H then return end
 local n=y*W+x
 if not removed[n] and backdrop(ref:getPixel(x,y)) then removed[n]=true;queue[#queue+1]=n end
end
for x=0,W-1 do seed(x,0);seed(x,H-1) end;for y=0,H-1 do seed(0,y);seed(W-1,y) end
local qi=1
while qi<=#queue do local n=queue[qi];qi=qi+1;local x,y=n%W,math.floor(n/W);seed(x-1,y);seed(x+1,y);seed(x,y-1);seed(x,y+1) end
local s=Sprite(W,H,ColorMode.RGB);local initial=s.layers[1];local report={parts={}}
local function largest(im)
 local points={};for p in im:pixels() do if A(p())>0 then points[p.y*im.width+p.x]=true end end
 local islands={}
 while next(points) do
  local first=next(points);local q={first};points[first]=nil;local k=1
  while k<=#q do local n=q[k];k=k+1;local x,y=n%im.width,math.floor(n/im.width)
   for dy=-1,1 do for dx=-1,1 do local xx,yy=x+dx,y+dy
    if xx>=0 and yy>=0 and xx<im.width and yy<im.height then local at=yy*im.width+xx
     if points[at] then points[at]=nil;q[#q+1]=at end
    end
   end end
  end;islands[#islands+1]=q
 end
 table.sort(islands,function(a,b)return #a>#b end)
 local dropped=0
 for i=2,#islands do for _,n in ipairs(islands[i]) do im:drawPixel(n%im.width,math.floor(n/im.width),0);dropped=dropped+1 end end
 return dropped,islands[1] and #islands[1] or 0
end
for _,part in ipairs(spec.parts) do
 local x0,y0,x1,y1=W,H,0,0
 for _,p in ipairs(part.polygon) do x0=math.min(x0,p[1]);y0=math.min(y0,p[2]);x1=math.max(x1,p[1]);y1=math.max(y1,p[2]) end
 for _,fill in ipairs(part.fills or {}) do for _,p in ipairs(fill.polygon) do x0=math.min(x0,p[1]);y0=math.min(y0,p[2]);x1=math.max(x1,p[1]);y1=math.max(y1,p[2]) end end
 for _,c in ipairs(part.caps) do x0=math.min(x0,c[1]-c[3]);y0=math.min(y0,c[2]-c[3]);x1=math.max(x1,c[1]+c[3]);y1=math.max(y1,c[2]+c[3]) end
 if part.handle then x1=math.max(x1,535);y0=math.min(y0,345) end
 x0=math.floor(x0)-2;y0=math.floor(y0)-2;x1=math.ceil(x1)+2;y1=math.ceil(y1)+2
 local im=Image(x1-x0+1,y1-y0+1,ColorMode.RGB)
 for _,fill in ipairs(part.fills or {}) do
  local polygon={};for _,p in ipairs(fill.polygon) do polygon[#polygon+1]={p[1]-x0,p[2]-y0} end
  if fill.texture then
   -- Reconstruct neutral joint fabric from a clean cloth patch. No straps or
   -- stride-specific folds are carried into the rigid waist underlap.
   local t=fill.texture
   for y=y0,y1 do for x=x0,x1 do if inside(x+.5,y+.5,fill.polygon) then
    local sx=math.floor(t.origin[1]+(x-t.anchor[1])*t.scale+.5)
    local sy=math.floor(t.origin[2]+(y-t.anchor[2])*t.scale+.5)
    im:drawPixel(x-x0,y-y0,ref:getPixel(sx,sy))
   end end end
  else
   R.poly(im,polygon,R.color(fill.color),fill.outline and R.color(fill.outline) or nil)
  end
 end
 for y=y0,y1 do for x=x0,x1 do
  local owned=inside(x+.5,y+.5,part.polygon)
  for _,poly in ipairs(part.excludes or {}) do if inside(x+.5,y+.5,poly) then owned=false end end
  if x>=0 and y>=0 and x<W and y<H and owned and not removed[y*W+x] then
   local c=ref:getPixel(x,y);local r,g,b=pc.rgbaR(c),pc.rgbaG(c),pc.rgbaB(c)
   local hilt=part.omit_hilt_magenta and r>80 and g<r*.65 and b>g*1.5
   if not hilt then im:drawPixel(x-x0,y-y0,c) end
  end
 end end
 local visible=Image(im);local hidden=0
 for _,cap in ipairs(part.caps) do
  for y=cap[2]-cap[3],cap[2]+cap[3] do for x=cap[1]-cap[3],cap[1]+cap[3] do
   local xx,yy=x-x0,y-y0
   if (x-cap[1])^2+(y-cap[2])^2<=cap[3]^2 and A(im:getPixel(xx,yy))==0 then
    local found
    for r=1,cap[3]*2 do
     for k=0,15 do local a=k*math.pi/8;local sx=math.floor(xx+r*math.cos(a)+.5);local sy=math.floor(yy+r*math.sin(a)+.5)
      if sx>=0 and sy>=0 and sx<im.width and sy<im.height then local c=visible:getPixel(sx,sy);if A(c)>0 then found=c;break end end
     end
     if found then break end
    end
    if found then im:drawPixel(xx,yy,found);hidden=hidden+1 end
   end
  end end
 end
 if part.handle then
  local function p(v)return {v[1]-x0,v[2]-y0} end
  R.limb(im,{p({436,419}),p({509,375})},{9,8},R.color('312C37'),R.color('161B25'))
  R.band(im,p({443,414}),p({505,377}),2,2,R.color('B65AAA'))
  R.disc(im,p({510,374}),10,10,R.color('586D7D'));R.disc(im,p({512,371}),5,4,R.color('A2B5BC'))
 end
 local dropped,opaque=largest(im)
 assert(dropped<=100,part.name..': unexpected disconnected artwork; inspect the mask')
 local layer=s:newLayer();layer.name=part.name;s:newCel(layer,1,im,Point(x0,y0))
 local pivot=part.anchor or part.a;local slice=s:newSlice(Rectangle(0,0,W,H));slice.name='pivot.'..part.name;slice.pivot=Point(pivot[1],pivot[2])
 im:saveAs(out..'/'..part.name..'.png')
 report.parts[#report.parts+1]={name=part.name,offset={x0,y0},size={im.width,im.height},opaque=opaque,hidden_underlap_pixels=hidden,disconnected_pixels_removed=dropped}
end
s:deleteLayer(initial);assert(s:saveAs(out..'/parts.aseprite'))
local bind=Image(W,H,ColorMode.RGB);bind:drawSprite(s,1);bind:resize(768,512);bind:saveAs(out..'/bind.png');s:close()
local f=assert(io.open(out..'/parts-report.json','w'));f:write(json.encode(report));f:close()
