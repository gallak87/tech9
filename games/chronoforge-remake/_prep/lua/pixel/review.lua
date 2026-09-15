-- Review one clip at a fixed camera. Guides stay in local files; the delivered artifact is one GIF.
local source,out=assert(app.params.source),assert(app.params.output)
local s=assert(app.open(source));local W,H=s.width,s.height;local pc=app.pixelColor;local rgba,A=pc.rgba,pc.rgbaA
local bg=rgba(26,29,36,255);local origin
for _,slice in ipairs(s.slices) do if slice.name=='origin' then origin=slice.pivot end end
assert(origin)
local scale=tonumber(app.params.scale or '3');assert(scale>=1 and scale%1==0)
local preview=Sprite(W*scale,H*scale,ColorMode.RGB)
local contact=Image(W*4,H*math.ceil(#s.frames/4),ColorMode.RGB);contact:clear(bg)
local frameList,plates={},{}
for fi,frame in ipairs(s.frames) do
 local im=Image(W,H,ColorMode.RGB);im:drawSprite(s,fi);frameList[fi]=im
 local plate=Image(W,H,ColorMode.RGB);plate:clear(bg)
 for x=16,W-16 do plate:drawPixel(x,origin.y+1,rgba(55,60,70,255)) end
 plate:drawImage(im)
 if fi>1 then preview:newEmptyFrame() end
 local big=Image(W*scale,H*scale,ColorMode.RGB)
 for p in plate:pixels() do for yy=0,scale-1 do for xx=0,scale-1 do big:drawPixel(p.x*scale+xx,p.y*scale+yy,p()) end end end
 plates[fi]=big
 preview.frames[fi].duration=frame.duration;preview:newCel(preview.layers[1],fi,big,Point(0,0))
 if fi==1 then big:saveAs(out..'/poster.png') end
 im:saveAs(out..'/frame-'..fi..'.png')
 contact:drawImage(plate,Point((fi-1)%4*W,math.floor((fi-1)/4)*H))
end
assert(preview:saveAs(out..'/running.gif'));preview:close();contact:saveAs(out..'/contact.png')
-- Check the delivered GIF after reopening, including every pixel and its actual timing.
local gif=assert(app.open(out..'/running.gif'))
assert(gif.width==W*scale and gif.height==H*scale and #gif.frames==#s.frames,'GIF changed dimensions/frames')
for fi,frame in ipairs(gif.frames) do
 assert(math.abs(frame.duration-s.frames[fi].duration)<.00001,'GIF changed timing')
 local actual=Image(gif.width,gif.height,ColorMode.RGB);actual:drawSprite(gif,fi)
 for p in actual:pixels() do assert(p()==plates[fi]:getPixel(p.x,p.y),'GIF changed rendered pixels') end
end
gif:close()
local onion=Image(W,H,ColorMode.RGB);onion:clear(bg)
for _,sample in ipairs({{1,86,210,217},{math.floor(#s.frames/2)+1,240,100,161}}) do
 local im=frameList[sample[1]];local tinted=Image(W,H,ColorMode.RGB)
 for p in im:pixels() do local a=A(p());if a>0 then tinted:drawPixel(p.x,p.y,rgba(sample[2],sample[3],sample[4],math.floor(a*.4))) end end
 onion:drawImage(tinted)
end
onion:saveAs(out..'/onion.png');s:close()
local f=assert(io.open(out..'/reviewed.json','w'));f:write('true');f:close()
