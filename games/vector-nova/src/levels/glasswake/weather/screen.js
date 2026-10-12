import { sampleGlasswakeWeather } from './state.js';
const hash = (n) => (((Math.sin(n * 71.83 + 5.4) * 41327.14) % 1) + 1) % 1;
/** Sparse snow adhesion and frost on the presentation glass. Absolute lifetimes
 * keep pause/reset/replay deterministic. Middle road/craft and telemetry stay clear.
 */
export function createGlasswakeScreen({ host, track }) {
  const canvas = document.createElement('canvas');
  canvas.dataset.glasswakeWeatherGlass = '';
  canvas.setAttribute('aria-hidden', 'true');
  Object.assign(canvas.style, {
    position: 'absolute',
    inset: '0',
    width: '100%',
    height: '100%',
    pointerEvents: 'none',
    zIndex: '4',
  });
  host.append(canvas);
  const ctx = canvas.getContext('2d');
  let disposed = false;
  let presentation = {};
  let paintKey = null;
  let paints = 0;
  const sprites = [];
  function snowSprite(i) {
    if (sprites[i]) return sprites[i];
    const sprite = document.createElement('canvas');
    sprite.width = sprite.height = 48;
    const ink = sprite.getContext('2d');
    const radius = 5 + hash(i + 38) * 10;
    ink.translate(24, 24);
    ink.rotate(hash(i + 63) * Math.PI);
    const halo = ink.createRadialGradient(0, 0, 0, 0, 0, radius * 1.35);
    halo.addColorStop(0, 'rgba(224,243,255,.24)');
    halo.addColorStop(1, 'rgba(224,243,255,0)');
    ink.fillStyle = halo;
    ink.beginPath();
    ink.arc(0, 0, radius * 1.35, 0, Math.PI * 2);
    ink.fill();
    ink.strokeStyle = 'rgba(219,241,255,.28)';
    ink.lineWidth = 0.7;
    ink.beginPath();
    for (let arm = 0; arm < 6; arm++) {
      ink.rotate(Math.PI / 3);
      ink.moveTo(0, 0);
      ink.lineTo(0, -radius);
      for (const k of [0.43, 0.7]) {
        ink.moveTo(0, -radius * k);
        ink.lineTo(radius * 0.2, -radius * (k + 0.17));
        ink.moveTo(0, -radius * k);
        ink.lineTo(-radius * 0.2, -radius * (k + 0.17));
      }
    }
    ink.stroke();
    sprites[i] = sprite;
    return sprite;
  }
  function clear() {
    ctx?.clearRect(0, 0, canvas.width, canvas.height);
  }
  return {
    update({ state = {}, settings = {}, mode, reviewing = false } = {}) {
      if (disposed || !ctx) return;
      const width = host.clientWidth || globalThis.innerWidth || 1280;
      const height = host.clientHeight || globalThis.innerHeight || 720;
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
      }
      const weather = sampleGlasswakeWeather(track, state, settings);
      let flakes = 0,
        beads = 0;
      const visible = mode === 'racing' && !reviewing;
      canvas.style.display = visible ? 'block' : 'none';
      const returning = track.sections.find((s) => s.id === 'return');
      const inReturn =
        returning &&
        state.distance >= returning.start &&
        state.distance < returning.end;
      const key = [
        width,
        height,
        visible,
        settings.quality,
        settings.reducedMotion,
        Math.floor(weather.time * 24),
        Math.round(weather.storm * 32),
        weather.sheltered,
        inReturn,
        host.querySelector('#review-toggle')?.getAttribute('aria-expanded'),
      ].join(':');
      if (key === paintKey) {
        presentation = { ...presentation, ...weather };
        return;
      }
      paintKey = key;
      // Adhesion moves slowly: repaint at 24 Hz and on exposure/layout changes.
      // Small cached sprites avoid full-canvas blur/clip surfaces every frame.
      clear();
      paints++;
      if (visible) {
        const t = weather.time;
        for (let i = 0; i < (settings.quality === 'low' ? 8 : 14); i++) {
          const phase = (t / 7.8 + hash(i)) % 1;
          if (phase > 0.62 || weather.exposure < 0.25) continue;
          const fade =
            Math.min(1, phase / 0.08) *
            Math.min(1, (0.62 - phase) / 0.18) *
            weather.storm;
          const right = i % 2 === 0;
          const x =
            width *
            (right ? 0.94 - hash(i + 8) * 0.05 : 0.025 + hash(i + 8) * 0.055);
          const y =
            height * (0.3 + hash(i + 17) * 0.29) + phase * height * 0.014;
          ctx.globalAlpha = fade;
          ctx.drawImage(snowSprite(i), x - 24, y - 24);
          flakes++;
        }
        ctx.globalAlpha = 1;
        if (inReturn) {
          for (let i = 0; i < 4; i++) {
            const phase = (t / 5.6 + hash(i + 200)) % 1;
            const fade = Math.sin(phase * Math.PI) * 0.32;
            const x = width * (i % 2 ? 0.05 : 0.94),
              y = height * (0.32 + hash(i + 40) * 0.21) + phase * height * 0.04;
            ctx.beginPath();
            ctx.ellipse(x, y, 2.5, 4.3, 0, 0, Math.PI * 2);
            ctx.strokeStyle = `rgba(232,246,255,${fade})`;
            ctx.lineWidth = 1;
            ctx.stroke();
            beads++;
          }
        }
        // Fine frost branches remain within the peripheral six percent.
        if (weather.storm > 0.45)
          for (const side of [0, 1]) {
            ctx.strokeStyle = `rgba(199,226,246,${weather.storm * 0.16})`;
            ctx.lineWidth = 1;
            for (let j = 0; j < 9; j++) {
              const x = side ? width : 0,
                y = height * (0.32 + j * 0.027);
              const direction = side ? -1 : 1;
              ctx.beginPath();
              ctx.moveTo(x, y);
              ctx.lineTo(x + direction * width * 0.016, y - 8);
              ctx.lineTo(
                x + direction * width * (0.018 + hash(j) * 0.015),
                y - 20,
              );
              ctx.stroke();
            }
          }
      }
      if (visible) {
        // Clear the union of reserved UI rectangles after compositing. Repeated
        // clearRect calls also handle overlapping regions without even-odd holes.
        const hostRect = host.getBoundingClientRect();
        for (const node of host.querySelectorAll(
          '#minimap, .top-telemetry, .telemetry, #touch, .controls, #shape-controls',
        )) {
          if (node.closest('.hidden')) continue;
          const r = node.getBoundingClientRect();
          if (r.width && r.height)
            ctx.clearRect(
              r.left - hostRect.left - 9,
              r.top - hostRect.top - 9,
              r.width + 18,
              r.height + 18,
            );
        }
      }
      presentation = {
        ...weather,
        screenFlakes: flakes,
        meltBeads: beads,
        screenVisible: visible,
        screenPaints: paints,
        cachedSprites: sprites.filter(Boolean).length,
      };
    },
    snapshot: () => ({ ...presentation }),
    reset() {
      clear();
      paintKey = null;
      paints = 0;
      presentation = {};
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      clear();
      for (const sprite of sprites)
        if (sprite) sprite.width = sprite.height = 0;
      sprites.length = 0;
      canvas.remove();
    },
  };
}
