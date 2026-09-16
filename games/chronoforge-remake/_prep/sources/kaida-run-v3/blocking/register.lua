-- Exact reference pixels scaled once; joints are hand-identified motion guides.
local root=assert(app.params.root)
local f=assert(io.open(root..'/design.json'));local d=json.decode(f:read('*a'));f:close()
local R=dofile(assert(app.params.raster))
local s=Sprite(d.canvas[1],d.canvas[2],ColorMode.RGB)
local ref=s.layers[1];ref.name='reference.locked';ref.isEditable=false
local guide=s:newLayer();guide.name='landmarks.right-coral.left-blue'
local ground=s:newLayer();ground.name='registration';ground.isEditable=false
for i,a in ipairs(d.references) do
 if i>1 then s:newEmptyFrame() end
 local input=assert(app.open(root..'/'..a.file))
 local im=Image(input.width,input.height,ColorMode.RGB);im:drawSprite(input,1);input:close()
 im:resize(math.floor(im.width*a.scale+.5),math.floor(im.height*a.scale+.5))
 local offset={d.reference_pelvis[1]-a.pelvis[1]*a.scale,d.reference_pelvis[2]-a.pelvis[2]*a.scale}
 s:newCel(ref,i,im,Point(R.round(offset[1]),R.round(offset[2])))
 local marks=Image(s.width,s.height,ColorMode.RGB)
 local function p(v) return {offset[1]+v[1]*a.scale,offset[2]+v[2]*a.scale} end
 for _,side in ipairs({'left','right'}) do
  local c=R.color(d.palette[side=='right' and 'near' or 'far']);local limb=a[side]
  for _,chain in ipairs({{'shoulder','elbow','wrist'},{'hip','knee','ankle'}}) do
   for j=1,2 do R.band(marks,p(limb[chain[j]]),p(limb[chain[j+1]]),1.5,1.5,c) end
   for _,joint in ipairs(chain) do R.disc(marks,p(limb[joint]),4,4,c) end
  end
 end
 R.band(marks,p(a.pelvis),p(a.neck),1,1,R.color(d.palette.guide))
 s:newCel(guide,i,marks,Point(0,0))
 local registration=Image(s.width,s.height,ColorMode.RGB)
 R.line(registration,{20,d.origin[2]},{s.width-20,d.origin[2]},R.color(d.palette.guide))
 local cp=d.reference_pelvis
 R.line(registration,{cp[1]-10,cp[2]},{cp[1]+10,cp[2]},R.color(d.palette.guide))
 R.line(registration,{cp[1],cp[2]-10},{cp[1],cp[2]+10},R.color(d.palette.guide))
 s:newCel(ground,i,registration,Point(0,0));s.frames[i].duration=.5
end
for i,a in ipairs(d.references) do local tag=s:newTag(i,i);tag.name=a.name end
local origin=s:newSlice(Rectangle(0,0,s.width,s.height));origin.name='origin';origin.pivot=Point(d.origin[1],d.origin[2])
assert(s:saveAs(assert(app.params.output)));s:close()
