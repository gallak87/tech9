-- Assertions about behavior, independently of the rig/export implementation.
local s = assert(app.open(assert(app.params.source)))
local function composite(frame)
  local image = Image(s.width, s.height, ColorMode.RGB)
  image:drawSprite(s, frame)
  return image
end
local first, second, third, last = composite(1), composite(2), composite(3), composite(8)
assert(first:isEqual(last), 'Recovery pose must return exactly to the bind pose')
assert(not first:isEqual(second), 'Pose keys did not animate the sprite')
-- Head translates with torso while keeping its own keyed horizontal offset.
assert(third:getPixel(28,17) == first:getPixel(27,18), 'Parent/child head translation is wrong')
assert(app.pixelColor.rgbaA(third:getPixel(27,17)) == 0, 'Head did not shift one pixel right')
-- Foot roots remain fixed through the entire animation.
for i=1,#s.frames do
  local image = composite(i)
  for y=55,71 do
    for x=26,39 do
      assert(image:getPixel(x,y) == first:getPixel(x,y), 'Planted feet drift on frame ' .. i)
    end
  end
end
-- The weapon follows both the arm's rotation and the torso's translation.
assert(second:getPixel(46,45) == first:getPixel(45,46), 'Weapon did not inherit parent transforms')
local expected = {200,200,200,200,160,80,100,180}
for i, duration in ipairs(expected) do
  assert(math.floor(s.frames[i].duration*1000+0.5) == duration, 'Frame duration changed')
end
assert(#s.tags == 2 and s.tags[1].fromFrame.frameNumber == 1 and s.tags[1].toFrame.frameNumber == 4,
       'Idle tag range changed')
assert(s.tags[2].fromFrame.frameNumber == 5 and s.tags[2].toFrame.frameNumber == 8,
       'Attack tag range changed')
local file = assert(io.open(assert(app.params.output), 'w'))
file:write('passed'); file:close()
s:close()
