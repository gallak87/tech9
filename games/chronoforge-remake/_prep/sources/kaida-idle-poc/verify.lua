-- Visual invariants for this idle: no foot sliding, no new detail per frame,
-- a real breathing displacement and an exact return to the resting pose.
local master=assert(app.open(assert(app.params.master)))
local animation=assert(app.open(assert(app.params.animation)))
assert(animation.width==272 and animation.height==480,'Canvas changed')
assert(#animation.frames==12 and #animation.layers==7,'Unexpected frames/layers')
assert(#animation.tags==1 and animation.tags[1].name=='idle.right','Missing idle tag')
assert(animation.tags[1].fromFrame.frameNumber==1 and animation.tags[1].toFrame.frameNumber==12,'Tag range changed')
local parts={}
for _,layer in ipairs(master.layers) do
  local cel=assert(layer:cel(1))
  local palette={}
  for p in cel.image:pixels() do palette[p()]=true end
  palette[0]=true
  parts[layer.name]={image=cel.image,palette=palette}
end
local legs,torso
local sampled=0
for _,layer in ipairs(animation.layers) do
  if layer.name=='legs' then legs=layer end
  if layer.name=='torso' then torso=layer end
  assert(#layer.cels==12,'Lost part cels: '..layer.name)
  for _,cel in ipairs(layer.cels) do
    for p in cel.image:pixels() do
      local value=p()
      if app.pixelColor.rgbaA(value)>0 then
        assert(parts[layer.name].palette[value],'A frame invented a new part color: '..layer.name)
        assert(p.x>2 and p.y>2 and p.x<animation.width-3 and p.y<animation.height-3,'Clipped part')
        sampled=sampled+1
      end
    end
  end
end
assert(legs and torso)
for i=2,12 do assert(legs:cel(i).image:isEqual(legs:cel(1).image),'Feet/hips moved on frame '..i) end
local first=Image(animation.width,animation.height,ColorMode.RGB);first:drawSprite(animation,1)
local peak=Image(animation.width,animation.height,ColorMode.RGB);peak:drawSprite(animation,7)
local last=Image(animation.width,animation.height,ColorMode.RGB);last:drawSprite(animation,12)
assert(first:isEqual(last),'The loop does not return exactly to rest')
assert(not first:isEqual(peak),'The sprite did not animate')
-- Check the rendered boots too, so another moving layer cannot fake a fixed-foot pass.
for i=2,12 do
  local image=Image(animation.width,animation.height,ColorMode.RGB);image:drawSprite(animation,i)
  for _,box in ipairs({{38,400,78,453},{140,397,209,450}}) do
    for y=box[2],box[4] do for x=box[1],box[3] do
      assert(image:getPixel(x,y)==first:getPixel(x,y),'Rendered boot pixels moved on frame '..i)
    end end
  end
end
-- Frame seven moves the complete torso up two pixels, without reshaping it.
local initial=torso:cel(1).image;local inhaled=torso:cel(7).image
for y=0,animation.height-3 do for x=0,animation.width-1 do
  assert(inhaled:getPixel(x,y)==initial:getPixel(x,y+2),'Breathing must preserve torso pixels')
end end
for i=1,12 do assert(math.floor(animation.frames[i].duration*1000+.5)==180,'Timing changed') end
local f=assert(io.open(assert(app.params.output),'w'))
f:write(json.encode({result='passed',frames=12,layers=7,loop_ms=2160,checkedOpaquePixels=sampled,
 checks={'fixed legs and feet','rendered boots unchanged','identical start/end','two-pixel breath','source colors preserved per part','full part cels','no canvas-edge clipping','tag and timing'}}));f:close()
master:close();animation:close()
