-- Bake parented cutout parts from one bind frame into editable Aseprite cels.
-- Transform positions are in canvas pixels; positive angles turn clockwise.
local function readJson(path)
  local f = assert(io.open(path, 'r'))
  local text = f:read('*a'); f:close()
  return json.decode(text)
end
local rig = readJson(assert(app.params.rig))
local s = assert(app.open(assert(app.params.source)))
assert(#s.frames == 1, 'Rig input must have exactly one bind-pose frame')
assert(s.width == rig.canvas.width and s.height == rig.canvas.height, 'Canvas differs from rig')
assert(s.colorMode == ColorMode.RGB, 'Rig input must use RGB color mode')
local layers = {}
for _, layer in ipairs(s.layers) do
  assert(not layer.isGroup, 'Use flat, named part layers for the bind document')
  assert(not layers[layer.name], 'Duplicate layer name: ' .. layer.name)
  layers[layer.name] = layer
end
local parts, order, bind = {}, {}, {}
for _, part in ipairs(rig.parts) do
  assert(not parts[part.layer], 'Duplicate rig part: ' .. part.layer)
  assert(layers[part.layer], 'Missing layer: ' .. part.layer)
  assert(not part.parent or parts[part.parent], 'Parents must precede children: ' .. part.layer)
  parts[part.layer] = part
  order[#order + 1] = part.layer
  local cel = layers[part.layer]:cel(1)
  if cel then
    bind[part.layer] = {image=Image(cel.image), x=cel.position.x, y=cel.position.y, opacity=cel.opacity}
  end
end
local function rotate(x, y, angle)
  local c, sn = math.cos(angle), math.sin(angle)
  return c*x - sn*y, sn*x + c*y
end
local function round(x) return math.floor(x + 0.5) end
local frameIndex = 0
local tagRanges = {}
local static = {}
for name, layer in pairs(layers) do
  if not parts[name] then
    local cel = layer:cel(1)
    if cel then static[name] = {image=Image(cel.image), position=cel.position, opacity=cel.opacity} end
  end
end
for _, clip in ipairs(rig.clips) do
  local first = frameIndex + 1
  for _, pose in ipairs(clip.frames) do
    frameIndex = frameIndex + 1
    if frameIndex > 1 then s:newEmptyFrame() end
    local frame = s.frames[frameIndex]
    frame.duration = pose.duration_ms / 1000
    if frameIndex > 1 then
      for name, cel in pairs(static) do
        local added = s:newCel(layers[name], frameIndex, cel.image, cel.position)
        added.opacity = cel.opacity
      end
    end
    local world = {}
    for _, name in ipairs(order) do
      local part, key = parts[name], (pose.parts or {})[name] or {}
      local x, y = part.pivot[1], part.pivot[2]
      local angle = math.rad(key.angle or 0)
      if part.parent then
        local parent, rest = world[part.parent], parts[part.parent].pivot
        local rx, ry = rotate(x-rest[1]+(key.x or 0), y-rest[2]+(key.y or 0), parent.angle)
        x, y, angle = parent.x + rx, parent.y + ry, parent.angle + angle
      else
        x, y = x+(key.x or 0), y+(key.y or 0)
      end
      world[name] = {x=x, y=y, angle=angle}
      local original = bind[name]
      if original then
        -- Fail on clipping before baking instead of silently losing a weapon/limb.
        for pixel in original.image:pixels() do
          if app.pixelColor.rgbaA(pixel()) > 0 then
            local tx, ty = rotate(pixel.x+original.x-part.pivot[1], pixel.y+original.y-part.pivot[2], angle)
            tx, ty = round(tx+x), round(ty+y)
            assert(tx >= 0 and ty >= 0 and tx < s.width and ty < s.height,
                   'Part leaves canvas: ' .. name .. ', frame ' .. frameIndex)
          end
        end
        local img = Image(s.width, s.height, ColorMode.RGB)
        -- Inverse nearest-neighbor sampling avoids holes from forward splatting.
        for dy=0,s.height-1 do
          for dx=0,s.width-1 do
            local rx, ry = rotate(dx-x, dy-y, -angle)
            local sx = round(rx + part.pivot[1] - original.x)
            local sy = round(ry + part.pivot[2] - original.y)
            if sx >= 0 and sy >= 0 and sx < original.image.width and sy < original.image.height then
              img:drawPixel(dx, dy, original.image:getPixel(sx, sy))
            end
          end
        end
        local old = layers[name]:cel(frameIndex)
        if old then s:deleteCel(old) end
        local cel = s:newCel(layers[name], frameIndex, img, Point(0,0))
        cel.opacity = original.opacity
      end
    end
  end
  tagRanges[#tagRanges+1] = {name=clip.name, first=first, last=frameIndex}
end
-- Add tags only after all frames exist: inserting at a tag boundary extends it.
for _, range in ipairs(tagRanges) do
  local tag = s:newTag(range.first, range.last)
  tag.name = range.name
  tag.aniDir = AniDir.FORWARD
end
-- Pivot slices survive both .aseprite saving and JSON export.
for _, part in ipairs(rig.parts) do
  local slice = s:newSlice(Rectangle(0,0,s.width,s.height))
  slice.name = 'pivot.' .. part.layer
  slice.pivot = Point(part.pivot[1], part.pivot[2])
  slice.data = 'Bind-pose pivot; parent=' .. (part.parent or '')
end
assert(s:saveAs(assert(app.params.output)), 'Could not save baked timeline')
s:close()
