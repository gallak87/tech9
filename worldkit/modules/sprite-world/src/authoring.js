/** Echo's connected neutral exterior extraction. Use only on retained originals. */
export function keyNeutralExterior(
  context,
  width,
  height,
  { keyMin = 175, backgroundSeeds = [] } = {},
) {
  const image = context.getImageData(0, 0, width, height),
    data = image.data,
    seen = new Uint8Array(width * height),
    queue = new Int32Array(width * height);
  let head = 0,
    tail = 0;
  const seed = (i) => {
    const k = i * 4,
      hi = Math.max(data[k], data[k + 1], data[k + 2]),
      lo = Math.min(data[k], data[k + 1], data[k + 2]);
    if (!seen[i] && lo >= keyMin && hi - lo < 16) {
      seen[i] = 1;
      queue[tail++] = i;
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
    if (x >= 0 && x < width && y >= 0 && y < height)
      seed(Math.floor(y) * width + Math.floor(x));
  while (head < tail) {
    const i = queue[head++],
      x = i % width;
    data[i * 4 + 3] = 0;
    if (x > 0) seed(i - 1);
    if (x < width - 1) seed(i + 1);
    if (i >= width) seed(i - width);
    if (i < width * (height - 1)) seed(i + width);
  }
  context.putImageData(image, 0, 0);
}
export const COASTAL_PREPARATION = {
  'kaida-walk': { keyMin: 175, backgroundSeeds: [] },
  'kaida-idle': { keyMin: 175, backgroundSeeds: [] },
  'coast-details': {
    keyMin: 175,
    backgroundSeeds: [
      [997, 856],
      [467, 228],
      [281, 334],
      [423, 210],
      [1036, 494],
      [961, 840],
      [230, 306],
      [874, 483],
      [983, 842],
      [138, 952],
      [938, 885],
      [918, 487],
    ],
  },
};
/** Original six-tile coastal source -> selected opaque 768×512 runtime layout. */
export function prepareCoastalGround(image, canvas) {
  canvas.width = 768;
  canvas.height = 512;
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  for (let i = 0; i < 6; i++) {
    const x = (i % 3) * 256,
      y = Math.floor(i / 3) * 256;
    ctx.drawImage(
      image,
      ((i % 3) * image.width) / 3 + 2,
      (Math.floor(i / 3) * image.height) / 2 + 2,
      image.width / 3 - 4,
      image.height / 2 - 4,
      x,
      y,
      256,
      256,
    );
    if (i >= 4) {
      ctx.globalAlpha = i === 5 ? 0.17 : 0.1;
      ctx.fillStyle = i === 5 ? '#245861' : '#417876';
      ctx.fillRect(x, y, 256, 256);
      ctx.globalAlpha = 1;
    }
  }
  return canvas;
}
