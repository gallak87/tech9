-- A fixed-camera preview with one palette for the entire high-color animation.
local out=assert(app.params.output)
local s=assert(app.open(assert(app.params.source)))
local pc=app.pixelColor;local rgba=pc.rgba;local W,H=s.width,s.height
local preview=Sprite(W,H,ColorMode.RGB);local plates={}
local contact=Image(W*4,H*math.ceil(#s.frames/4),ColorMode.RGB)
for fi,frame in ipairs(s.frames) do
 local im=Image(W,H,ColorMode.RGB);im:drawSprite(s,fi)
 local plate=Image(W,H,ColorMode.RGB);plate:clear(rgba(26,29,36,255))
 for x=120,W-120 do plate:drawPixel(x,591,rgba(49,53,64,255)) end
 plate:drawImage(im)
 if fi>1 then preview:newEmptyFrame() end
 preview.frames[fi].duration=frame.duration
 preview:newCel(preview.layers[1],fi,plate,Point(0,0));plates[fi]=plate
 im:saveAs(out..'/frame-'..fi..'.png')
 contact:drawImage(plate,Point((fi-1)%4*W,math.floor((fi-1)/4)*H))
end
contact:resize(contact.width//2,contact.height//2);contact:saveAs(out..'/contact.png')
app.sprite=preview
app.command.ColorQuantization{ui=false,withAlpha=false,maxColors=256,useRange=false}
app.command.ChangePixelFormat{ui=false,format='indexed',dithering='none'}
local quantized={};local errorSum,pixels,maxError=0,0,0
for fi=1,#s.frames do
 local im=Image(W,H,ColorMode.RGB);im:drawSprite(preview,fi);quantized[fi]=im
 if fi==1 then im:saveAs(out..'/poster.png') end
 for p in im:pixels() do
  local before=plates[fi]:getPixel(p.x,p.y);local after=p()
  assert(pc.rgbaA(after)==255,'Preview acquired transparency')
  for _,ch in ipairs({pc.rgbaR,pc.rgbaG,pc.rgbaB}) do
   local delta=math.abs(ch(before)-ch(after));errorSum=errorSum+delta;maxError=math.max(maxError,delta)
  end
  pixels=pixels+1
 end
end
assert(errorSum/(pixels*3)<4,'Excessive GIF color quantization error')
assert(preview:saveAs(out..'/running.gif'));preview:close()
local gif=assert(app.open(out..'/running.gif'))
assert(gif.width==W and gif.height==H and #gif.frames==#s.frames,'GIF changed size/frame count')
for fi,frame in ipairs(gif.frames) do
 assert(math.abs(frame.duration-s.frames[fi].duration)<.00001,'GIF changed timing')
 local im=Image(W,H,ColorMode.RGB);im:drawSprite(gif,fi)
 for p in im:pixels() do assert(p()==quantized[fi]:getPixel(p.x,p.y),'GIF changed quantized preview pixels') end
end
gif:close();s:close()
local f=assert(io.open(out..'/review.json','w'))
f:write(json.encode({global_palette_colors=256,dithering='none',roundtrip_pixels_equal=true,
 mean_rgb_quantization_error=errorSum/(pixels*3),maximum_channel_error=maxError}));f:close()
