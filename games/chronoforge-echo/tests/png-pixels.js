import fs from 'node:fs';
import { inflateSync } from 'node:zlib';

// Read production pixels without a browser, image editor, or generated artifact.
export function readPngPixels(path) {
  const png = fs.readFileSync(path),
    width = png.readUInt32BE(16),
    height = png.readUInt32BE(20);
  if (png[24] !== 8 || ![2, 6].includes(png[25]) || png[28] !== 0)
    throw Error('Expected non-interlaced RGB/RGBA PNG');
  const channels = png[25] === 6 ? 4 : 3,
    chunks = [];
  for (let offset = 8; offset < png.length;) {
    const size = png.readUInt32BE(offset),
      kind = png.subarray(offset + 4, offset + 8).toString();
    if (kind === 'IDAT')
      chunks.push(png.subarray(offset + 8, offset + 8 + size));
    offset += size + 12;
  }
  const raw = inflateSync(Buffer.concat(chunks)),
    stride = width * channels,
    decoded = new Uint8Array(stride * height);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)],
      start = y * stride;
    for (let x = 0; x < stride; x++) {
      const a = x >= channels ? decoded[start + x - channels] : 0,
        b = y ? decoded[start + x - stride] : 0,
        c = y && x >= channels ? decoded[start + x - stride - channels] : 0;
      let predictor = 0;
      if (filter === 1) predictor = a;
      else if (filter === 2) predictor = b;
      else if (filter === 3) predictor = Math.floor((a + b) / 2);
      else if (filter === 4) {
        const p = a + b - c,
          pa = Math.abs(p - a),
          pb = Math.abs(p - b),
          pc = Math.abs(p - c);
        predictor = pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      } else if (filter !== 0) throw Error('Unknown PNG filter');
      decoded[start + x] = (raw[y * (stride + 1) + 1 + x] + predictor) & 255;
    }
  }
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    data[i * 4] = decoded[i * channels];
    data[i * 4 + 1] = decoded[i * channels + 1];
    data[i * 4 + 2] = decoded[i * channels + 2];
    data[i * 4 + 3] = channels === 4 ? decoded[i * channels + 3] : 255;
  }
  return { width, height, data };
}
