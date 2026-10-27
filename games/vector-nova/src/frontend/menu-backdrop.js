// One quiet, track-independent wave surface for the menu's lifetime.
export function createMenuBackdrop(signal) {
  const element = document.createElement('div');
  element.className = 'menu-backdrop';
  element.setAttribute('aria-hidden', 'true');
  const canvas = document.createElement('canvas');
  element.append(canvas);
  const context = canvas.getContext('2d', { alpha: false });
  const motion = matchMedia('(prefers-reduced-motion: reduce)');
  let active = false,
    reducedMotion = false,
    frame = 0,
    previous = 0,
    elapsed = 0,
    painted = -Infinity,
    width = 0,
    height = 0,
    pixels = null;

  function draw() {
    if (!pixels) return;
    // A swell crosses the surface in about fifteen seconds.
    const phase = elapsed * ((Math.PI * 2) / 15000);
    const tint = Math.sin(phase * 0.18) * 0.08;
    const aspect = width / height;
    const data = pixels.data;
    let index = 0;
    // Light the slopes of a curved height field so crests have a broad sheen
    // and valleys stay shaded. Color alone doesn't describe the surface.
    for (let y = 0; y < canvas.height; y++) {
      const ny = (y / (canvas.height - 1) - 0.5) * 2;
      for (let x = 0; x < canvas.width; x++) {
        const nx = (x / (canvas.width - 1) - 0.5) * 2 * aspect;
        const bend = nx * 0.9 - ny * 1.2 + phase * 0.18;
        const flow = (nx * 2.4 + ny * 1.7 + Math.sin(bend) * 2.5) * 2 - phase;
        const crest = 0.5 + 0.5 * Math.sin(flow);
        // Keep the same shallow relief as the crests get closer together.
        const slope = 0.38 * Math.cos(flow);
        const curvature = Math.cos(bend);
        const dx = slope * (2.4 + curvature * 2.25);
        const dy = slope * (1.7 - curvature * 3);
        const normal = 1 / Math.sqrt(dx * dx + dy * dy + 1);
        const diffuse = Math.max(0, (dx * 0.45 + dy * 0.6 + 0.66) * normal);
        const highlight = Math.max(
          0,
          Math.min(1, (dx * 0.247 + dy * 0.329 + 0.911) * normal),
        );
        const body = (6 + diffuse * 15) * (0.3 + crest * 0.7);
        const sheen = Math.pow(highlight, 16) * 40 * (0.25 + crest * 0.75);
        const red = Math.max(
          0,
          Math.min(1, 0.35 + nx * 0.15 - ny * 0.12 + tint),
        );
        // Subtle fixed dithering keeps the dark gradients from banding.
        const base = 5 + ((x * 13 + y * 7) % 11) / 11 - 0.5;
        data[index++] =
          base + body * (0.8 + red * 0.55) + sheen * (0.72 + red * 0.18);
        data[index++] =
          base + body * (0.8 - red * 0.55) + sheen * (0.72 - red * 0.18);
        data[index++] =
          base + body * (0.8 - red * 0.55) + sheen * (0.72 - red * 0.18);
        data[index++] = 255;
      }
    }
    context.putImageData(pixels, 0, 0);
  }

  function resize() {
    if (!active || !context) return;
    width = innerWidth;
    height = innerHeight;
    // Broad, soft folds only need a small field, smoothly enlarged by CSS.
    const ratio = Math.min(1, 320 / Math.max(width, height));
    canvas.width = Math.max(2, Math.round(width * ratio));
    canvas.height = Math.max(2, Math.round(height * ratio));
    pixels = context.createImageData(canvas.width, canvas.height);
    draw();
  }

  function tick(now) {
    elapsed += now - previous;
    previous = now;
    if (now - painted >= 1000 / 24) {
      draw();
      painted = now;
    }
    frame = requestAnimationFrame(tick);
  }

  function sync() {
    cancelAnimationFrame(frame);
    frame = 0;
    if (
      context &&
      active &&
      !reducedMotion &&
      !motion.matches &&
      !document.hidden &&
      !signal.aborted
    ) {
      previous = performance.now();
      frame = requestAnimationFrame(tick);
    }
  }

  window.addEventListener('resize', resize, { signal });
  document.addEventListener('visibilitychange', sync, { signal });
  motion.addEventListener('change', sync, { signal });
  signal.addEventListener(
    'abort',
    () => {
      cancelAnimationFrame(frame);
      element.remove();
      canvas.width = canvas.height = 0;
      pixels = null;
    },
    { once: true },
  );
  return {
    mount(shell) {
      // Reattach the same canvas after menu renders; keep its animation phase.
      shell.prepend(element);
    },
    configure(options) {
      const entering = options.active && !active;
      active = options.active;
      reducedMotion = options.reducedMotion;
      if (entering) resize();
      sync();
    },
  };
}
