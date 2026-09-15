local s = assert(app.open(assert(app.params.source)))
local report = {width=s.width, height=s.height, frames=#s.frames, layers={}, tags={}, slices={}, emptyFrames={}}
for _, layer in ipairs(s.layers) do
  local cels = 0
  for _, cel in ipairs(layer.cels) do cels = cels + 1 end
  report.layers[#report.layers+1] = {name=layer.name, cels=cels, visible=layer.isVisible}
end
for _, tag in ipairs(s.tags) do
  report.tags[#report.tags+1] = {name=tag.name, from=tag.fromFrame.frameNumber, to=tag.toFrame.frameNumber}
end
for _, slice in ipairs(s.slices) do
  report.slices[#report.slices+1] = {name=slice.name, pivot=slice.pivot and {x=slice.pivot.x,y=slice.pivot.y} or nil}
end
for i, frame in ipairs(s.frames) do
  local img = Image(s.width,s.height,ColorMode.RGB)
  img:drawSprite(s, i)
  if img:isEmpty() then report.emptyFrames[#report.emptyFrames+1] = i end
end
local f = assert(io.open(assert(app.params.output), 'w'))
f:write(json.encode(report)); f:close()
s:close()
