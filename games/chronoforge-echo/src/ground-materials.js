const clamp = (value) => Math.max(0, Math.min(1, value));
const smooth = (value) => {
  const t = clamp(value);
  return t * t * (3 - 2 * t);
};

// Reduce broad row/column lighting in leafy ground materials, so repeating a
// single lit corner does not turn the whole forest into a checkerboard. Local
// leaves and stones retain their contrast and color; only a gentle gain varies.
export function balanceMaterialLighting(data, width, height) {
  const columns = new Float64Array(width),
    rows = new Float64Array(height);
  let total = 0;
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4,
        luma = data[i] * 0.2126 + data[i + 1] * 0.7152 + data[i + 2] * 0.0722;
      columns[x] += luma / height;
      rows[y] += luma / width;
      total += luma;
    }
  const mean = total / (width * height);
  if (mean < 1) return;
  const soften = (values) =>
    Array.from(values, (_, i) => {
      let sum = 0;
      for (let j = -8; j <= 8; j++)
        sum += values[Math.max(0, Math.min(values.length - 1, i + j))];
      return sum / 17;
    });
  const xs = soften(columns),
    ys = soften(rows);
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const gain = Math.max(
        0.75,
        Math.min(1.33, (mean * mean) / Math.max(1, xs[x] * ys[y])),
      );
      const i = (y * width + x) * 4;
      for (let c = 0; c < 3; c++) data[i + c] = Math.round(data[i + c] * gain);
    }
}

// Generated material crops do not necessarily tile. Join opposing edges only
// within a narrow band when importing a tile; keep its detailed center intact.
// This changes cached pixels, never the immutable source PNG.
export function blendRepeatEdges(data, width, height, band = 16) {
  const blend = (a, b, amount) => {
    for (let c = 0; c < 3; c++) {
      const left = data[a + c],
        right = data[b + c],
        middle = (left + right) / 2;
      data[a + c] = Math.round(left + (middle - left) * amount);
      data[b + c] = Math.round(right + (middle - right) * amount);
    }
  };
  const bx = Math.min(band, Math.floor(width / 2)),
    by = Math.min(band, Math.floor(height / 2));
  for (let y = 0; y < height; y++)
    for (let x = 0; x < bx; x++)
      blend(
        (y * width + x) * 4,
        (y * width + width - 1 - x) * 4,
        1 - smooth(x / Math.max(1, bx - 1)),
      );
  for (let x = 0; x < width; x++)
    for (let y = 0; y < by; y++)
      blend(
        (y * width + x) * 4,
        ((height - 1 - y) * width + x) * 4,
        1 - smooth(y / Math.max(1, by - 1)),
      );
}

// World-space distances keep the bank continuous across cached terrain chunks.
// Roads through a pool are causeways: include their edges, not just the pool's
// polygon. The visual bank does not change terrain or walking permissions.
export function shoreDistance(scene, x, y, roadDistance = Infinity) {
  let distance = Infinity;
  for (const polygon of scene.water || [])
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
      const [ax, ay] = polygon[j],
        [bx, by] = polygon[i],
        dx = bx - ax,
        dy = by - ay;
      const t = clamp(
        ((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy || 1),
      );
      distance = Math.min(
        distance,
        Math.hypot(x - ax - t * dx, y - ay - t * dy),
      );
    }
  return Math.min(distance, Math.max(0, roadDistance - 35));
}

export function lavaShoreMix(distance, x, y, water) {
  const irregular =
    Math.sin(x * 0.089 + Math.sin(y * 0.061) * 1.8) * 3 +
    Math.cos(y * 0.103 - x * 0.037) * 2;
  const d = Math.max(0, distance + irregular);
  return water
    ? {
        crust: 1 - smooth((d - 14) / 28),
        basalt: 1 - smooth((d - 2) / 19),
        shade: (1 - smooth(d / 16)) * 0.24,
      }
    : {
        crust: 0,
        basalt: (1 - smooth(d / 23)) * 0.76,
        shade: (1 - smooth(d / 18)) * 0.2,
      };
}

export function forestShoreMix(distance, x, y, water) {
  const irregular =
    Math.sin(x * 0.071 + Math.cos(y * 0.053)) * 3 +
    Math.cos(y * 0.091 - x * 0.029) * 2;
  const d = Math.max(0, distance + irregular);
  return water
    ? {
        shallows: 1 - smooth((d - 10) / 34),
        roots: 1 - smooth(d / 15),
        shade: (1 - smooth(d / 20)) * 0.2,
      }
    : {
        shallows: 0,
        roots: (1 - smooth(d / 25)) * 0.74,
        shade: (1 - smooth(d / 22)) * 0.17,
      };
}
