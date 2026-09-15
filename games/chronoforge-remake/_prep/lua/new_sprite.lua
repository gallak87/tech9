-- Create an editable bind-pose document. No generated sprite-sheet input.
local output = assert(app.params.output, 'output parameter required')
local width = tonumber(app.params.width) or 64
local height = tonumber(app.params.height) or 80
local s = Sprite(width, height, ColorMode.RGB)
s:deleteLayer(s.layers[1])
local names = {'leg.back', 'arm.back', 'torso', 'leg.front', 'head', 'arm.front', 'weapon', 'fx'}
local layers = {}
for _, name in ipairs(names) do
  local layer = s:newLayer()
  layer.name = name
  layers[name] = layer
end
local origin = s:newSlice(Rectangle(0, 0, width, height))
origin.name = 'origin'
origin.pivot = Point(math.floor(width / 2), height - 8)
origin.data = 'Fixed feet anchor in canvas coordinates. Keep identical across all frames.'
s.frames[1].duration = 0.125

-- Only the smoke fixture draws a deliberately simple diagnostic puppet.
-- Normal new documents start empty, ready for actual character design.
if app.params.fixture == 'true' then
  local function block(name, x, y, w, h, color)
    local img = Image(w, h, ColorMode.RGB)
    img:clear(color)
    s:newCel(layers[name], 1, img, Point(x, y))
  end
  block('leg.back', 26, 48, 6, 24, Color{r=83,g=91,b=142,a=255})
  block('arm.back', 22, 33, 5, 17, Color{r=139,g=102,b=176,a=255})
  block('torso', 26, 30, 13, 22, Color{r=181,g=72,b=138,a=255})
  block('leg.front', 34, 48, 6, 24, Color{r=114,g=138,b=185,a=255})
  block('head', 27, 18, 12, 13, Color{r=246,g=195,b=146,a=255})
  block('arm.front', 38, 33, 5, 17, Color{r=239,g=167,b=140,a=255})
  block('weapon', 44, 26, 3, 23, Color{r=110,g=232,b=235,a=255})
end
assert(s:saveAs(output), 'Could not save source')
s:close()
