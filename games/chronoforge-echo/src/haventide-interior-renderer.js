import {
  townInteriorLevel,
  townInteriorFrame,
  townInteriorRegion,
} from './town-interior-art.js';
import { HAVENTIDE_HALL } from './haventide-interior-layout.js';
import { artSurface, artPattern } from './rendering.js';

const sheets = new Map();
const plinthColors = {
  haventide: ['#514736', '#86765a', '#b4b5a3', '#b7cec9'],
  emberline: ['#664532', '#956346', '#be936d', '#d3a476'],
  orbital_reach: ['#343c52', '#515e7a', '#8794b6', '#a7b7d1'],
  last_crown: ['#3f3048', '#57405f', '#736480', '#a799b3'],
};
const heightLimits = {
  provisions: 230,
  forge: 240,
  inn: 255,
  archive: 225,
  engineering: 225,
  training: 180,
  board: 195,
  storage: 145,
};

// Extract each isolated piece independently. The opaque floor sample bypasses
// background removal, and pale stone is protected by connected flood selection.
export function keyInteriorFrame(
  data,
  width,
  height,
  { keyMin = 145, backgroundSeeds = [] } = {},
) {
  const seen = new Uint8Array(width * height),
    queue = new Int32Array(width * height);
  let head = 0,
    tail = 0;
  const seed = (i) => {
    if (seen[i]) return;
    seen[i] = 1;
    const k = i * 4,
      hi = Math.max(data[k], data[k + 1], data[k + 2]),
      lo = Math.min(data[k], data[k + 1], data[k + 2]);
    if (data[k + 3] === 0 || (lo >= keyMin && hi - lo < 18)) {
      queue[tail++] = i;
      data[k + 3] = 0;
    }
  };
  for (let x = 0; x < width; x++) {
    seed(x);
    seed((height - 1) * width + x);
  }
  for (let y = 0; y < height; y++) {
    seed(y * width);
    seed(y * width + width - 1);
  }
  for (const [x, y] of backgroundSeeds)
    if (x >= 0 && y >= 0 && x < width && y < height)
      seed(Math.floor(y) * width + Math.floor(x));
  while (head < tail) {
    const i = queue[head++],
      x = i % width;
    if (x) seed(i - 1);
    if (x + 1 < width) seed(i + 1);
    if (i >= width) seed(i - width);
    if (i + width < height * width) seed(i + width);
  }
}

export function installHaventideInterior(image, entry) {
  const frames = new Map();
  for (const frame of entry.metadata.frames) {
    const crop = document.createElement('canvas');
    crop.width = frame.w;
    crop.height = frame.h;
    const context = crop.getContext('2d', { willReadFrequently: true });
    context.drawImage(
      image,
      frame.x,
      frame.y,
      frame.w,
      frame.h,
      0,
      0,
      frame.w,
      frame.h,
    );
    if (frame.key !== false) {
      const pixels = context.getImageData(0, 0, frame.w, frame.h);
      keyInteriorFrame(pixels.data, frame.w, frame.h, frame);
      context.putImageData(pixels, 0, 0);
    }
    for (const rect of frame.clearRects || []) context.clearRect(...rect);
    frames.set(frame.part, crop);
  }
  const tile = artSurface(160, 160),
    floor = frames.get('floor');
  tile.getContext('2d').drawImage(floor, 0, 0, 160, 160);
  sheets.set((entry.region ?? 'haventide') + ':' + entry.level, {
    image,
    frames,
    tile,
  });
}

function selectedPart(object, state) {
  return object.unlockTier && state.tier < object.unlockTier
    ? 'storage'
    : object.havenPart;
}
export function havenInteriorBounds(object, state) {
  if (!object.havenPart) return null;
  const spec = townInteriorFrame(
    selectedPart(object, state),
    state,
    object.interiorRegion,
  );
  if (!spec) return null;
  const { frame } = spec,
    scale = Math.min(
      object.artWidth / frame.w,
      (heightLimits[selectedPart(object, state)] ?? Infinity) / frame.h,
    );
  const width = frame.w * scale,
    height = frame.h * scale;
  return {
    left: object.x - width * frame.anchorX,
    top: object.y - height * frame.anchorY,
    width,
    height,
  };
}
export function drawHaventidePiece(context, object, state) {
  const bounds = havenInteriorBounds(object, state),
    sheet = sheets.get(
      townInteriorRegion(object.interiorRegion, state) +
        ':' +
        townInteriorLevel(state),
    );
  if (!bounds || !sheet) return false;
  context.drawImage(
    sheet.frames.get(selectedPart(object, state)),
    bounds.left,
    bounds.top,
    bounds.width,
    bounds.height,
  );
  return true;
}
export function drawHaventideFloor(context, scene, camera, state) {
  const sheet = sheets.get(
    townInteriorRegion(scene.townId, state) + ':' + townInteriorLevel(state),
  );
  if (!sheet) return false;
  const c = context;
  c.save();
  c.fillStyle = '#16282c';
  c.fillRect(0, 0, 960, 540);
  c.translate(-camera.x, -camera.y);
  // The surrounding stone plinth joins the generated back wall and columns.
  c.fillStyle =
    plinthColors[townInteriorRegion(scene.townId, state)][
      townInteriorLevel(state) - 1
    ];
  for (const area of scene.walkAreas)
    c.fillRect(area.x - 20, area.y - 12, area.w + 40, area.h + 24);
  c.fillStyle = artPattern(c, sheet.tile);
  for (const area of scene.walkAreas)
    c.fillRect(area.x, area.y, area.w, area.h);
  const runner = sheet.frames.get('runner'),
    width = HAVENTIDE_HALL.runner.width;
  const height = Math.min(660, (width * runner.height) / runner.width),
    x = HAVENTIDE_HALL.runner.x - width / 2,
    y = HAVENTIDE_HALL.runner.y - height;
  c.drawImage(runner, x, y, width, height);
  c.restore();
  return true;
}
export function haventideInteriorMetrics() {
  return {
    sources: [...sheets.values()].map((s) => s.image),
    frames: [...sheets.values()].flatMap((s) => [...s.frames.values(), s.tile]),
  };
}
