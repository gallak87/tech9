-- Lossless crops of the user's two-pose screenshot, for motion reference only.
-- The polygon boundaries exclude neighboring figures without repainting Kaida.
local root=assert(app.params.root)
local out=assert(app.params.output)
local s=assert(app.open(root..'/_prep/sources/kaida-run-v2/reference-running.png'))
local im=Image(s.width,s.height,ColorMode.RGB);im:drawSprite(s,1)
local function inside(x,y,poly)
 local hit=false;local j=#poly
 for i=1,#poly do local a,b=poly[i],poly[j]
  if (a[2]>y)~=(b[2]>y) and x<(b[1]-a[1])*(y-a[2])/(b[2]-a[2])+a[1] then hit=not hit end
  j=i
 end
 return hit
end
local crops={
 {name='screenshot-stride',x=0,y=0,w=690,h=698,poly={{0,0},{690,0},{690,414},{645,451},{645,531},{690,553},{690,698},{0,698}}},
 {name='screenshot-recovery',x=650,y=0,w=650,h=698,poly={{650,0},{1300,0},{1300,698},{700,698},{700,546},{650,536}}}
}
for _,c in ipairs(crops) do
 local crop=Image(c.w,c.h,ColorMode.RGB)
 for y=0,c.h-1 do for x=0,c.w-1 do
  if inside(x+c.x,y+c.y,c.poly) then crop:drawPixel(x,y,im:getPixel(x+c.x,y+c.y)) end
 end end
 crop:saveAs(out..'/'..c.name..'.png')
end
s:close()
