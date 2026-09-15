-- Reopen the authored timeline and validate actual cels, not only pose metadata.
local function read(path) local f=assert(io.open(path));local v=json.decode(f:read('*a'));f:close();return v end
local dir=assert(app.params.source);local rig=read(dir..'/rig.json')
local s=assert(app.open(dir..'/animation.aseprite'));local A=app.pixelColor.rgbaA
assert(s.width==rig.canvas.width and s.height==rig.canvas.height)
assert(#s.layers==10 and #s.tags==#rig.clips)
local expected=0;for _,clip in ipairs(rig.clips) do expected=expected+#clip.frames end
assert(#s.frames==expected)
local layers={};for _,l in ipairs(s.layers) do layers[l.name]=l end
local origin
for _,slice in ipairs(s.slices) do if slice.name=='origin' then origin=slice end end
assert(origin and origin.pivot.x==rig.origin[1] and origin.pivot.y==rig.origin[2])
local palettes={}
for _,view in ipairs({'right','down','up'}) do
 palettes[view]={};local master=assert(app.open(dir..'/master-'..view..'.aseprite'))
 for _,layer in ipairs(master.layers) do
  local colors={};for pixel in layer:cel(1).image:pixels() do if A(pixel())>0 then colors[pixel()]=true end end
  palettes[view][layer.name]=colors
 end
 master:close()
end
local fi=0;local inspected=0;local runs={}
for ti,clip in ipairs(rig.clips) do
 local tag=s.tags[ti];assert(tag.name==clip.name and tag.fromFrame.frameNumber==fi+1)
 local sourceView=clip.view=='left' and 'right' or clip.view
 local first,previous={},{};local movement={near=0,far=0};local flight=0
 for index,frame in ipairs(clip.frames) do
  fi=fi+1;assert(math.abs(s.frames[fi].duration*1000-frame.duration_ms)<.1)
  local count=0
  for _,layer in ipairs(s.layers) do
   local cel=layer:cel(fi);local unused=(layer.name=='weapon.far' and clip.view~='left') or (layer.name=='weapon' and clip.view=='left')
   if not unused then
    assert(cel and not cel.image:isEmpty(),clip.name..': missing '..layer.name)
    local sourceName=layer.name=='weapon.far' and 'weapon' or layer.name
    local colors=assert(palettes[sourceView][sourceName])
    for pixel in cel.image:pixels() do
     local c=pixel()
     if A(c)>0 then
      local x,y=pixel.x+cel.position.x,pixel.y+cel.position.y
      assert(x>=2 and y>=2 and x<s.width-2 and y<s.height-2,'Canvas clipping after reopen')
      assert(colors[c],'Texture/color drift in '..clip.name..':'..layer.name)
      inspected=inspected+1;count=count+1
     end
    end
   end
  end
  assert(count>5000,'Empty/partial character frame')
  if clip.name:match('^run%.') then
   local bothAir=true
   for _,side in ipairs({'near','far'}) do
    local cel=assert(layers['leg.'..side]:cel(fi));local im=Image(s.width,s.height,ColorMode.RGB);im:drawImage(cel.image,cel.position)
    if previous[side] and not im:isEqual(previous[side]) then movement[side]=movement[side]+1 end
    previous[side]=im
    local contact=frame.contacts[side]
    if contact.planted then bothAir=false end
   end
   if bothAir then flight=flight+1 end
  end
 end
 assert(tag.toFrame.frameNumber==fi)
 if clip.name:match('^run%.') then
  assert(movement.near>=10 and movement.far>=10,'A leg is stuck/repeated')
  assert(flight>=2,'Run must contain two flight poses')
  runs[clip.name]={changedNear=movement.near,changedFar=movement.far,flightFrames=flight}
 end
end
local result={result='passed',frames=#s.frames,tags=#s.tags,layers=#s.layers,opaquePixelsChecked=inspected,runs=runs,
 checks={'all runtime states in four directions','save/reopen','frame durations and tags','fixed origin','opaque canvas margin','reference texture colors retained','both run legs change every step','two flight poses per run'}}
local f=assert(io.open(assert(app.params.output),'w'));f:write(json.encode(result));f:close();s:close()
