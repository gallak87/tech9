-- Extract three illustrated bind views, complete occluded seams, and save editable masters.
local function read(path) local f=assert(io.open(path));local v=json.decode(f:read('*a'));f:close();return v end
local root,out=assert(app.params.root),assert(app.params.output)
local spec=read(root..'/_prep/sources/kaida-full-set/parts.json')
local sprite=assert(app.open(root..'/'..spec.reference))
local ref=Image(sprite.width,sprite.height,ColorMode.RGB);ref:drawSprite(sprite,1);sprite:close()
local pc=app.pixelColor;local rgba,R,G,B,A=pc.rgba,pc.rgbaR,pc.rgbaG,pc.rgbaB,pc.rgbaA
local function inside(x,y,poly)
 local hit=false;local j=#poly
 for i,a in ipairs(poly) do local b=poly[j]
  if ((a[2]>y)~=(b[2]>y)) and x<(b[1]-a[1])*(y-a[2])/(b[2]-a[2])+a[1] then hit=not hit end;j=i
 end;return hit
end
local function masked(p,x,y)
 if p.min_y and y<p.min_y then return false end
 if p.polygon then return inside(x,y,p.polygon) end
 for _,poly in ipairs(p.polygons or {}) do if inside(x,y,poly) then return true end end
 return false
end
local report={}
for _,viewName in ipairs({'right','down','up'}) do
 local view=spec.views[viewName];local X,Y,W,H=table.unpack(view.crop)
 local function idx(x,y) return y*W+x+1 end
 local function color(x,y) return ref:getPixel(X+x,Y+y) end
 local function background(c,x,y)
  local r,g,b=R(c),G(c),B(c);local sx,sy=X+x,Y+y
  local blade=false
  if viewName=='right' then blade=sx>1200 and sy>550 and sx-sy>615 and sx-sy<695
  elseif viewName=='down' then blade=sy>550 and sx-sy>-437 and sx-sy< -340
  else blade=sy>540 and math.abs(sx-(917+(sy-550)*.465))<40 end
  return math.min(r,g,b)>(blade and 145 or 164) and math.max(r,g,b)-math.min(r,g,b)<(blade and 70 or 18)
 end
 local removed,queue={},{}
 local function seed(x,y)
  if x<0 or y<0 or x>=W or y>=H then return end
  local n=idx(x,y)
  if not removed[n] and background(color(x,y),x,y) then removed[n]=true;queue[#queue+1]={x,y} end
 end
 for x=0,W-1 do seed(x,0);seed(x,H-1) end
 for y=0,H-1 do seed(0,y);seed(W-1,y) end
 for _,p in ipairs(view.seeds) do seed(p[1]-X,p[2]-Y) end
 local q=1
 while q<=#queue do local p=queue[q];q=q+1
  seed(p[1]-1,p[2]);seed(p[1]+1,p[2]);seed(p[1],p[2]-1);seed(p[1],p[2]+1)
 end
 local function split(y)
  for i=2,#view.split do local a,b=view.split[i-1],view.split[i]
   if y<=b[1] then return a[2]+(b[2]-a[2])*(y-a[1])/(b[1]-a[1]) end
  end;return view.split[#view.split][2]
 end
 local function legAt(x,y)
  local left=x<split(y)
  return ((viewName=='up' and not left) or (viewName~='up' and left)) and 'leg.near' or 'leg.far'
 end
 local owners,colors={},{}
 for y=0,H-1 do for x=0,W-1 do
  local n=idx(x,y);local sx,sy=X+x,Y+y
  if not removed[n] then
   local owner=sy<411 and 'torso' or (sy<515 and 'pelvis' or legAt(sx,sy))
   for _,name in ipairs({'arm.near','weapon','head','arm.far','coat.back'}) do
    if masked(view.masks[name],sx,sy) then owner=name;break end
   end
   owners[n]=owner;colors[n]=color(x,y)
  end
 end end
 local visited,islands={},{}
 for y=0,H-1 do for x=0,W-1 do
  local n=idx(x,y)
  if owners[n] and not visited[n] then
   local points={{x,y}};visited[n]=true;local k=1
   while k<=#points do local p=points[k];k=k+1
    for dy=-1,1 do for dx=-1,1 do
     local nx,ny=p[1]+dx,p[2]+dy
     if nx>=0 and ny>=0 and nx<W and ny<H then
      local ni=idx(nx,ny)
      if owners[ni] and not visited[ni] then visited[ni]=true;points[#points+1]={nx,ny} end
     end
    end end
   end
   islands[#islands+1]=points
  end
 end end
 local biggest=1
 for i,p in ipairs(islands) do if #p>#islands[biggest] then biggest=i end end
 for i,p in ipairs(islands) do if i~=biggest then for _,xy in ipairs(p) do owners[idx(xy[1],xy[2])]=nil end end end
 local function lookup(name,x,y)
  if x<0 or y<0 or x>=W or y>=H then return end
  local n=idx(x,y);if owners[n]==name then return colors[n] end
 end
 local extended={}
 for _,name in ipairs(spec.layer_order) do extended[name]={} end
 for y=0,H-1 do for x=0,W-1 do
  local n=idx(x,y);local owner=owners[n];local sx,sy=X+x,Y+y
  -- The upper thighs continue behind the belt/pelvis instead of detaching at a flat cut.
  if owner=='pelvis' and sy>=471 then extended[legAt(sx,sy)][n]=colors[n] end
  -- Complete the pants hidden by the blade using matching cloth on BOTH sides.
  if owner=='weapon' and sy>=485 then
   local name=legAt(sx,sy);local a,b
   for d=1,38 do
    a=a or lookup(name,x-d,y+d);b=b or lookup(name,x+d,y-d)
    if a and b then break end
   end
   if a and b then extended[name][n]=a end
  end
  local target
  if owner=='head' and sy>225 or owner=='arm.near' and sy<360 or owner=='arm.far' and sy<360 or owner=='pelvis' and sy<435 then target='torso'
  elseif owner=='torso' and sy>390 then target='pelvis' end
  if target then
   local c
   for d=1,12 do
    for _,v in ipairs({{x-d,y},{x+d,y},{x,y-d},{x,y+d}}) do c=lookup(target,v[1],v[2]);if c then break end end
    if c then break end
   end
   if c then extended[target][n]=c end
  end
 end end
 local s=Sprite(spec.canvas.width,spec.canvas.height,ColorMode.RGB);s:deleteLayer(s.layers[1])
 local factor=spec.downsample
 local ox=math.floor(spec.origin[1]+(X-view.center)/factor+.5)
 local oy=math.floor(spec.origin[2]+(Y-spec.source_ground)/factor+.5)
 local counts={}
 for _,name in ipairs(spec.layer_order) do
  local layer=s:newLayer();layer.name=name;local im=Image(s.width,s.height,ColorMode.RGB);local count=0
  for dy=0,math.ceil(H/factor)-1 do for dx=0,math.ceil(W/factor)-1 do
   local rr,gg,bb,aa=0,0,0,0
   for yy=0,factor-1 do for xx=0,factor-1 do
    local x,y=dx*factor+xx,dy*factor+yy
    if x<W and y<H then local n=idx(x,y);local c=(owners[n]==name and colors[n]) or extended[name][n]
     if c then rr=rr+R(c);gg=gg+G(c);bb=bb+B(c);aa=aa+1 end
    end
   end end
   if aa>0 then im:drawPixel(ox+dx,oy+dy,rgba(math.floor(rr/aa+.5),math.floor(gg/aa+.5),math.floor(bb/aa+.5),math.floor(255*aa/(factor*factor)+.5)));count=count+1 end
  end end
  s:newCel(layer,1,im,Point(0,0));counts[name]=count
 end
 local origin=s:newSlice(Rectangle(0,0,s.width,s.height));origin.name='origin';origin.pivot=Point(table.unpack(spec.origin))
 s.frames[1].duration=.1
 assert(s:saveAs(out..'/master-'..viewName..'.aseprite'))
 local flat=Image(s.width,s.height,ColorMode.RGB);flat:clear(rgba(24,28,37,255));flat:drawSprite(s,1);flat:saveAs(out..'/bind-'..viewName..'.png')
 report[viewName]={layers=counts,removed=#queue,components=#islands};s:close()
end
local f=assert(io.open(out..'/author-report.json','w'));f:write(json.encode(report));f:close()
