const WIDTH = 170;
const HEIGHT = 102;
const CHECK_COLUMNS = 8;
const CHECK_ROWS = 4;
const SUBDIVISIONS = 4;
const SLICES = CHECK_COLUMNS * SUBDIVISIONS;
const STRIDE = SLICES + 1;
const REST_FOLD = Math.PI * 0.72;

function paintPole(ctx) {
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(17.5, 94);
  ctx.lineTo(36, 11);
  ctx.lineWidth = 4.2;
  ctx.strokeStyle = '#282d33';
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(16.4, 94);
  ctx.lineTo(34.9, 11);
  ctx.lineWidth = 1.4;
  ctx.strokeStyle = '#cbced1';
  ctx.stroke();

  const cap = ctx.createRadialGradient(34, 8, 0, 36, 10, 4.5);
  cap.addColorStop(0, '#f4f4f1');
  cap.addColorStop(0.45, '#9da6af');
  cap.addColorStop(1, '#333941');
  ctx.fillStyle = cap;
  ctx.beginPath();
  ctx.arc(36, 10, 4.4, 0, Math.PI * 2);
  ctx.fill();
}

function foldTone(u, phase, white) {
  const normal = Math.cos(u * 9.2 - phase + 0.7);
  const ripple = Math.cos(u * 17 - phase * 1.42 + 1.6);
  const sheen = Math.max(0, Math.cos(u * 9.2 - phase + 0.1)) ** 8;
  const light = Math.min(
    1,
    0.51 + normal * 0.31 + ripple * 0.11 + sheen * 0.13,
  );
  return white
    ? `rgb(${173 + 81 * light} ${179 + 75 * light} ${187 + 64 * light})`
    : `rgb(${13 + 50 * light} ${17 + 52 * light} ${21 + 56 * light})`;
}

export function createFinishFlag({ checkered = true } = {}) {
  const canvas = document.createElement('canvas');
  canvas.className = 'finish-flag';
  canvas.width = WIDTH * 2;
  canvas.height = HEIGHT * 2;
  canvas.setAttribute('aria-hidden', 'true');
  const systemMotion = matchMedia('(prefers-reduced-motion: reduce)');
  const x = new Float32Array((CHECK_ROWS + 1) * STRIDE);
  const y = new Float32Array(x.length);
  let ctx, visible, lastPaint;
  let phase = REST_FOLD;

  function paint(phase) {
    ctx.clearRect(0, 0, WIDTH, HEIGHT);
    paintPole(ctx);

    // The pole pins the first column as wind drives folds down the cloth.
    for (let row = 0; row <= CHECK_ROWS; row++) {
      const v = row / CHECK_ROWS;
      for (let slice = 0; slice <= SLICES; slice++) {
        const u = slice / SLICES;
        const wave = u * 9.2 + v * 1.3 - phase;
        const ripple = u * 17 + v * 3.4 - phase * 1.42;
        const point = row * STRIDE + slice;
        x[point] =
          34 - 11.6 * v + u * (115 + 5 * v) + u * 4.6 * Math.sin(wave + 0.9);
        y[point] =
          22 +
          52 * v -
          3.7 * u +
          u * (12.5 * Math.sin(wave) + 4 * u * Math.sin(ripple));
      }
    }

    const outline = new Path2D();
    outline.moveTo(x[0], y[0]);
    for (let slice = 1; slice <= SLICES; slice++)
      outline.lineTo(x[slice], y[slice]);
    for (let row = 1; row <= CHECK_ROWS; row++) {
      const tip = row * STRIDE + SLICES;
      outline.lineTo(x[tip], y[tip]);
    }
    for (let slice = SLICES - 1; slice >= 0; slice--) {
      const hem = CHECK_ROWS * STRIDE + slice;
      outline.lineTo(x[hem], y[hem]);
    }
    outline.closePath();

    const middle = (CHECK_ROWS / 2) * STRIDE;
    ctx.save();
    ctx.clip(outline);
    if (checkered) {
      ctx.fillStyle = '#292d33';
      ctx.fillRect(0, 0, WIDTH, HEIGHT);
      for (let column = 0; column < CHECK_COLUMNS; column++) {
        const start = column * SUBDIVISIONS;
        const end = start + SUBDIVISIONS;
        const palettes = [false, true].map((white) => {
          const gradient = ctx.createLinearGradient(
            x[middle + start],
            0,
            x[middle + end],
            0,
          );
          for (const stop of [0, 0.3, 0.65, 1])
            gradient.addColorStop(
              stop,
              foldTone((column + stop) / CHECK_COLUMNS, phase, white),
            );
          return gradient;
        });
        for (let row = 0; row < CHECK_ROWS; row++) {
          const top = row * STRIDE;
          const bottom = top + STRIDE;
          ctx.beginPath();
          ctx.moveTo(x[top + start], y[top + start]);
          for (let slice = start + 1; slice <= end; slice++)
            ctx.lineTo(x[top + slice], y[top + slice]);
          for (let slice = end; slice >= start; slice--)
            ctx.lineTo(x[bottom + slice], y[bottom + slice]);
          ctx.closePath();
          ctx.fillStyle = ctx.strokeStyle = palettes[(row + column + 1) % 2];
          ctx.fill();
          ctx.lineWidth = 0.45;
          ctx.stroke();
        }
      }
    } else {
      const gradient = ctx.createLinearGradient(
        x[middle],
        0,
        x[middle + SLICES],
        0,
      );
      for (let slice = 0; slice <= SLICES; slice += 2) {
        const stop = slice / SLICES;
        gradient.addColorStop(stop, foldTone(stop, phase, true));
      }
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, WIDTH, HEIGHT);
    }

    const falloff = ctx.createLinearGradient(0, 18, 0, 79);
    falloff.addColorStop(0, '#fff6eb24');
    falloff.addColorStop(0.36, '#fff0');
    falloff.addColorStop(1, '#080f1a38');
    ctx.fillStyle = falloff;
    ctx.fillRect(0, 0, WIDTH, HEIGHT);
    ctx.restore();

    ctx.lineWidth = 1.1;
    ctx.strokeStyle = '#111419a0';
    ctx.stroke(outline);
    ctx.setLineDash([1.4, 1.8]);
    ctx.lineWidth = 0.65;
    ctx.strokeStyle = '#f4f6f387';
    ctx.stroke(outline);
    ctx.setLineDash([]);
  }

  function warm() {
    if (ctx) return;
    ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.scale(2, 2);
    paint(phase);
    // Flush the hidden canvas's first raster while the loading screen owns the frame.
    ctx.getImageData(WIDTH, HEIGHT, 1, 1);
  }

  function update(reducedMotion) {
    if (!visible || !ctx) return;
    const now = performance.now();
    if (reducedMotion || systemMotion.matches) {
      lastPaint = now;
      return;
    }
    const elapsed = now - lastPaint;
    if (elapsed < 1000 / 30 - 1) return;
    lastPaint = now;
    phase += Math.min(elapsed, 100) * 0.0085;
    paint(phase);
  }

  return {
    canvas,
    warm,
    update,
    setVisible(next) {
      if (visible === next) return;
      visible = next;
      if (visible) lastPaint = performance.now();
    },
  };
}
