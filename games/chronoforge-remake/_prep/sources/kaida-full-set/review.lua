-- Fixed camera, ground line, atlas/contact sheet and GIFs. All raster work is Aseprite.
local source,out=assert(app.params.source),assert(app.params.output)
local s=assert(app.open(source));local W,H=s.width,s.height;local pc=app.pixelColor
local rgba,A=pc.rgba,pc.rgbaA
local feetY
for _,slice in ipairs(s.slices) do if slice.name=='origin' then feetY=slice.pivot.y end end
assert(feetY)
local bg=rgba(24,28,37,255);local ground=rgba(54,65,77,255)
local function line(im,x0,y0,x1,y1,color)
 x0,y0,x1,y1=math.floor(x0+.5),math.floor(y0+.5),math.floor(x1+.5),math.floor(y1+.5)
 local dx,dy=math.abs(x1-x0),-math.abs(y1-y0);local sx,sy=x0<x1 and 1 or -1,y0<y1 and 1 or -1;local e=dx+dy
 while true do
  if x0>=0 and y0>=0 and x0<im.width and y0<im.height then im:drawPixel(x0,y0,color) end
  if x0==x1 and y0==y1 then break end;local e2=e*2
  if e2>=dy then e=e+dy;x0=x0+sx end;if e2<=dx then e=e+dx;y0=y0+sy end
 end
end
local glyphs={
 A={'01110','10001','10001','11111','10001','10001','10001'},B={'11110','10001','10001','11110','10001','10001','11110'},
 C={'01111','10000','10000','10000','10000','10000','01111'},D={'11110','10001','10001','10001','10001','10001','11110'},
 E={'11111','10000','10000','11110','10000','10000','11111'},F={'11111','10000','10000','11110','10000','10000','10000'},
 G={'01111','10000','10000','10111','10001','10001','01110'},H={'10001','10001','10001','11111','10001','10001','10001'},
 I={'111','010','010','010','010','010','111'},J={'00111','00010','00010','00010','10010','10010','01100'},
 K={'10001','10010','10100','11000','10100','10010','10001'},L={'10000','10000','10000','10000','10000','10000','11111'},
 M={'10001','11011','10101','10101','10001','10001','10001'},N={'10001','11001','10101','10011','10001','10001','10001'},
 O={'01110','10001','10001','10001','10001','10001','01110'},P={'11110','10001','10001','11110','10000','10000','10000'},
 Q={'01110','10001','10001','10001','10101','10010','01101'},R={'11110','10001','10001','11110','10100','10010','10001'},
 S={'01111','10000','10000','01110','00001','00001','11110'},T={'11111','00100','00100','00100','00100','00100','00100'},
 U={'10001','10001','10001','10001','10001','10001','01110'},V={'10001','10001','10001','10001','10001','01010','00100'},
 W={'10001','10001','10001','10101','10101','10101','01010'},X={'10001','10001','01010','00100','01010','10001','10001'},
 Y={'10001','10001','01010','00100','00100','00100','00100'},Z={'11111','00001','00010','00100','01000','10000','11111'},
 ['0']={'01110','10001','10011','10101','11001','10001','01110'},['1']={'010','110','010','010','010','010','111'},
 ['2']={'01110','10001','00001','00010','00100','01000','11111'},['3']={'11110','00001','00001','01110','00001','00001','11110'},
 ['4']={'10010','10010','10010','11111','00010','00010','00010'},['5']={'11111','10000','10000','11110','00001','00001','11110'},
 ['6']={'01110','10000','10000','11110','10001','10001','01110'},['7']={'11111','00001','00010','00100','01000','01000','01000'},
 ['8']={'01110','10001','10001','01110','10001','10001','01110'},['9']={'01110','10001','10001','01111','00001','00001','01110'},
 ['.']={'0','0','0','0','0','1','1'},['-']={'000','000','000','111','000','000','000'}
}
local function label(im,str,x,y,scale,color)
 for c in str:upper():gmatch('.') do
  local glyph=glyphs[c]
  if glyph then
   for yy,row in ipairs(glyph) do for xx=1,#row do if row:sub(xx,xx)=='1' then
    for dy=0,scale-1 do for dx=0,scale-1 do im:drawPixel(x+(xx-1)*scale+dx,y+(yy-1)*scale+dy,color) end end
   end end end
   x=x+(#glyph[1]+1)*scale
  else x=x+4*scale end
 end
end
local function half(im)
 local small=Image(W/2,H/2,ColorMode.RGB)
 for y=0,H/2-1 do for x=0,W/2-1 do small:drawPixel(x,y,im:getPixel(x*2,y*2)) end end
 return small
end
local rows=#s.tags;local sheet=Image(12*(W/2),rows*(H/2+24)+40,ColorMode.RGB);sheet:clear(bg)
label(sheet,'KAIDA - ALL MOVEMENTS - REVIEW DRAFT',12,12,2,rgba(241,207,223,255))
local summary={frames=#s.frames,clips={}}
for ti,tag in ipairs(s.tags) do
 local count=tag.toFrame.frameNumber-tag.fromFrame.frameNumber+1
 local gif=Sprite(W,H,ColorMode.RGB)
 local featured=tag.name=='run.right' and Sprite(512,544,ColorMode.RGB) or nil
 local contact=Image(W*4,H*math.ceil(count/4),ColorMode.RGB);contact:clear(bg)
 local rowY=40+(ti-1)*(H/2+24)
 label(sheet,tag.name..' - '..count..' FRAMES',10,rowY+5,1,rgba(126,211,203,255))
 for i=1,count do
  local fi=tag.fromFrame.frameNumber+i-1
  local flat=Image(W,H,ColorMode.RGB);flat:drawSprite(s,fi)
  local plate=Image(W,H,ColorMode.RGB);plate:clear(bg)
  -- A very faint fixed floor makes planted versus airborne feet easy to assess.
  line(plate,44,feetY+1,W-44,feetY+1,ground)
  plate:drawImage(flat)
  if i>1 then gif:newEmptyFrame() end
  gif.frames[i].duration=s.frames[fi].duration;gif:newCel(gif.layers[1],i,plate,Point(0,0))
  contact:drawImage(plate,Point((i-1)%4*W,math.floor((i-1)/4)*H))
  sheet:drawImage(half(plate),Point((i-1)*(W/2),rowY+24))
  if featured then
   -- One fixed crop for the entire cycle, doubled with exact nearest pixels.
   -- This changes only the chat preview, never the source or exported atlas.
   local big=Image(512,544,ColorMode.RGB)
   for y=0,271 do for x=0,255 do
    local c=plate:getPixel(x+96,y+88)
    for dy=0,1 do for dx=0,1 do big:drawPixel(x*2+dx,y*2+dy,c) end end
   end end
   if i>1 then featured:newEmptyFrame() end
   featured.frames[i].duration=s.frames[fi].duration;featured:newCel(featured.layers[1],i,big,Point(0,0))
   flat:saveAs(out..'/run-frame-'..i..'.png')
  end
 end
 if not (tag.name:match('^idle') or tag.name:match('^walk') or tag.name:match('^run') or tag.name:match('^defend') or tag.name:match('^victory')) then gif.frames[count].duration=.65 end
 assert(gif:saveAs(out..'/'..tag.name..'.gif'));gif:close()
 if featured then
  assert(featured:saveAs(out..'/running.gif'));featured:close()
  local onion=Image(W,H,ColorMode.RGB);onion:clear(bg)
  for _,sample in ipairs({{1,88,210,232},{7,249,108,175}}) do
   local im=Image(W,H,ColorMode.RGB);im:drawSprite(s,tag.fromFrame.frameNumber+sample[1]-1)
   local tinted=Image(W,H,ColorMode.RGB)
   for p in im:pixels() do local a=A(p());if a>0 then tinted:drawPixel(p.x,p.y,rgba(sample[2],sample[3],sample[4],math.floor(a*.4))) end end
   onion:drawImage(tinted)
  end
  line(onion,44,feetY+1,W-44,feetY+1,ground);onion:saveAs(out..'/run-onion.png')
 end
 contact:saveAs(out..'/'..tag.name..'.png')
 summary.clips[#summary.clips+1]={name=tag.name,frames=count,gif=tag.name..'.gif'}
end
sheet:saveAs(out..'/all-movements.png')
local f=assert(io.open(out..'/review.json','w'));f:write(json.encode(summary));f:close();s:close()
