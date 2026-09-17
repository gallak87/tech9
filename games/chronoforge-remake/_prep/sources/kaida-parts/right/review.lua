-- Export each saved part in isolation, without rebuilding or editing its cels.
local s=assert(app.open(assert(app.params.source)));local out=assert(app.params.output)
local A=app.pixelColor.rgbaA;local report={parts={}}
assert(#s.frames==1)
local layers={};for _,l in ipairs(s.layers) do layers[l.name]=l end
local f=assert(io.open(assert(app.params.spec)));local spec=json.decode(f:read('*a'));f:close()
report.ownership_probes=0
for _,check in ipairs(spec.ownership_checks or {}) do
 local function alpha(name)
  local c=assert(layers[name]:cel(1));local x,y=check.point[1]-c.position.x,check.point[2]-c.position.y
  return x>=0 and y>=0 and x<c.image.width and y<c.image.height and A(c.image:getPixel(x,y)) or 0
 end
 assert(alpha(check.owner)>128,'Missing proximal thigh fabric')
 assert(alpha(check.excluded)==0,'Rigid waist still contains a stride-specific thigh')
 report.ownership_probes=report.ownership_probes+1
end
for _,l in ipairs(s.layers) do
 local c=assert(l:cel(1));local im=c.image;local todo={};local count=0
 for p in im:pixels() do if A(p())>0 then
  todo[p.y*im.width+p.x]=true;count=count+1
  local x,y=p.x+c.position.x,p.y+c.position.y
  assert(x>=0 and y>=0 and x<s.width and y<s.height,l.name..' leaves source canvas')
 end end
 local components=0
 while next(todo) do
  components=components+1;local first=next(todo);local q={first};todo[first]=nil;local i=1
  while i<=#q do local n=q[i];i=i+1;local x,y=n%im.width,n//im.width
   for dy=-1,1 do for dx=-1,1 do local xx,yy=x+dx,y+dy
    if xx>=0 and yy>=0 and xx<im.width and yy<im.height then local at=yy*im.width+xx
     if todo[at] then todo[at]=nil;q[#q+1]=at end
    end
   end end
  end
 end
 assert(components==1,l.name..' has disconnected pixels')
 im:saveAs(out..'/'..l.name..'.png')
 report.parts[#report.parts+1]={name=l.name,components=components,pixels=count}
end
local bind=Image(s.width,s.height,ColorMode.RGB);bind:drawSprite(s,1)
bind:resize(s.width//2,s.height//2);bind:saveAs(out..'/bind.png');s:close()
local f=assert(io.open(out..'/validation.json','w'));f:write(json.encode(report));f:close()
