// Static new URL paths keep Vite's asset discovery explicit in copied packages.
export const COASTAL_ASSETS = [
  {
    id: 'coast-ground',
    url: new URL('../assets/runtime/coast-ground.png', import.meta.url).href,
    width: 768,
    height: 512,
  },
  {
    id: 'coast-details',
    url: new URL('../assets/runtime/coast-details.png', import.meta.url).href,
    width: 1254,
    height: 1254,
  },
  {
    id: 'coast-props',
    url: new URL('../assets/runtime/coast-props.png', import.meta.url).href,
    width: 1774,
    height: 887,
  },
  {
    id: 'kaida-walk',
    url: new URL('../assets/runtime/kaida-walk.png', import.meta.url).href,
    width: 1448,
    height: 1086,
  },
  {
    id: 'kaida-idle',
    url: new URL('../assets/runtime/kaida-idle.png', import.meta.url).href,
    width: 2172,
    height: 724,
  },
];
const frame = (asset, x, y, w, h, anchorX, anchorY) => ({
  asset,
  x,
  y,
  w,
  h,
  anchorX,
  anchorY,
});
export const COASTAL_FRAMES = {
  tree: frame('coast-details', 16, 45, 708, 580, 326, 567),
  cypress: frame('coast-details', 768, 10, 393, 623, 197, 609),
  ring: frame('coast-details', 47, 630, 597, 603, 303, 587),
  arch: frame('coast-details', 702, 647, 526, 583, 265, 568),
  rock: frame('coast-props', 0, 486, 409, 383, 409 * 0.5, 383 * 0.94),
  cottage: frame('coast-props', 457, 465, 430, 409, 430 * 0.4, 409 * 0.81),
  fern: frame('coast-props', 913, 516, 425, 352, 425 * 0.5, 352 * 0.91),
  cliff: frame('coast-props', 1343, 476, 431, 405, 431 * 0.5, 405 * 0.92),
};
const bounds = [
  [34, 19, 315, 370],
  [416, 19, 634, 370],
  [765, 21, 1021, 374],
  [1121, 16, 1362, 370],
  [85, 377, 273, 718],
  [434, 377, 637, 715],
  [809, 376, 993, 717],
  [1155, 379, 1362, 715],
  [83, 727, 331, 1076],
  [457, 728, 684, 1067],
  [811, 726, 1053, 1076],
  [1179, 730, 1412, 1076],
];
const anchors = [190, 536, 920, 1275, 190, 542, 907, 1274, 190, 549, 913, 1281];
const sampleActor = {
  speed: 230,
  runSpeed: 360,
  radius: 8,
  facing: 'down',
  fps: 9,
  walk: bounds.map(([x, y, r, b], i) => ({
    ...frame('kaida-walk', x, y, r - x, b - y, anchors[i] - x, b - y),
    scale: (0.23 * 336) / [352, 339, 346][Math.floor(i / 4)],
  })),
  idle: [
    { ...frame('kaida-idle', 35, 22, 225, 336, 115, 336), scale: 0.23 },
    {
      ...frame('kaida-idle', 1525, 386, 177, 315, 89, 315),
      scale: (0.23 * 336) / 315,
    },
    {
      ...frame('kaida-idle', 1924, 387, 216, 322, 106, 322),
      scale: (0.23 * 336) / 322,
    },
  ],
};
export const COASTAL_ACTOR = {
  speed: sampleActor.speed,
  runSpeed: sampleActor.runSpeed,
  radius: sampleActor.radius,
  facing: sampleActor.facing,
  fps: sampleActor.fps,
  animations: {
    walk: {
      right: sampleActor.walk.slice(0, 4),
      down: sampleActor.walk.slice(4, 8),
      up: sampleActor.walk.slice(8, 12),
    },
    idle: {
      right: [sampleActor.idle[0]],
      down: [sampleActor.idle[1]],
      up: [sampleActor.idle[2]],
    },
  },
};
/** Pattern tiles retain the prepared pixels at their original 128-world-unit repeat. */
export function createCoastalPatterns(ctx, images) {
  const image = images.get('coast-ground');
  if (!image) throw new Error('Coastal sample requires its ground atlas');
  const surfaces = [],
    patterns = [];
  for (let i = 0; i < 6; i++) {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 256;
    canvas
      .getContext('2d')
      .drawImage(
        image,
        (i % 3) * 256,
        Math.floor(i / 3) * 256,
        256,
        256,
        0,
        0,
        256,
        256,
      );
    const pattern = ctx.createPattern(canvas, 'repeat');
    pattern.setTransform(new DOMMatrix().scale(0.5));
    surfaces.push(canvas);
    patterns.push(pattern);
  }
  return {
    patterns,
    surfaces,
    dispose() {
      for (const surface of surfaces) surface.width = surface.height = 0;
      surfaces.length = 0;
      patterns.length = 0;
    },
  };
}
function polygon(ctx, points) {
  ctx.beginPath();
  points.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
  ctx.closePath();
}
export function drawCoastalGround(
  ctx,
  { scene, camera, viewport, patterns, time },
) {
  ctx.fillStyle = patterns[0] || '#526c3c';
  ctx.fillRect(camera.x, camera.y, viewport.width, viewport.height);
  for (const clearing of scene.clearings || []) {
    ctx.save();
    ctx.globalAlpha = 0.55;
    ctx.fillStyle = patterns[1] || '#a5a181';
    ctx.beginPath();
    ctx.ellipse(
      clearing.x,
      clearing.y,
      clearing.radius,
      clearing.radius * (clearing.aspect || 0.6),
      0,
      0,
      Math.PI * 2,
    );
    ctx.fill();
    ctx.restore();
  }
  for (const water of scene.water || []) {
    polygon(ctx, water);
    ctx.fillStyle = patterns[5] || '#3d7278';
    ctx.fill();
    ctx.save();
    ctx.clip();
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = '#b9dbcc';
    ctx.globalAlpha = 0.11;
    for (
      let y = Math.floor(camera.y / 55) * 55;
      y < camera.y + viewport.height;
      y += 55
    ) {
      ctx.beginPath();
      for (let x = camera.x; x < camera.x + viewport.width; x += 14) {
        const py = y + Math.sin(x * 0.024 + time * 0.5) * 3;
        x === camera.x ? ctx.moveTo(x, py) : ctx.lineTo(x, py);
      }
      ctx.stroke();
    }
    ctx.restore();
  }
  for (const road of scene.roads || []) {
    const points = road.points || road;
    ctx.save();
    ctx.lineJoin = ctx.lineCap = 'round';
    for (const [extra, alpha] of [
      [18, 0.13],
      [9, 0.22],
      [0, 1],
    ]) {
      ctx.globalAlpha = alpha;
      ctx.strokeStyle = patterns[2] || '#b1a381';
      ctx.lineWidth = (road.width || 64) + extra;
      ctx.beginPath();
      points.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
      ctx.stroke();
    }
    ctx.restore();
  }
}
