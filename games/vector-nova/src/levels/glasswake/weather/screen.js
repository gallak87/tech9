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
      clear();
      const weather = sampleGlasswakeWeather(track, state, settings);
      let flakes = 0,
        beads = 0;
      const visible = mode === 'racing' && !reviewing;
      canvas.style.display = visible ? 'block' : 'none';
      if (visible) {
        ctx.save();
        const hostRect = host.getBoundingClientRect();
        for (const node of host.querySelectorAll(
          '#minimap, .top-telemetry, .telemetry, #touch, .controls',
        )) {
          if (node.closest('.hidden')) continue;
          const r = node.getBoundingClientRect();
          if (!r.width || !r.height) continue;
          ctx.beginPath();
          ctx.rect(0, 0, width, height);
          ctx.rect(
            r.left - hostRect.left - 9,
            r.top - hostRect.top - 9,
            r.width + 18,
            r.height + 18,
          );
          ctx.clip('evenodd');
        }
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
          const radius = 5 + hash(i + 38) * 10;
          ctx.save();
          ctx.translate(x, y);
          ctx.rotate(hash(i + 63) * Math.PI);
          ctx.strokeStyle = `rgba(219,241,255,${fade * 0.58})`;
          ctx.lineWidth = 0.7;
          for (let arm = 0; arm < 6; arm++) {
            ctx.rotate(Math.PI / 3);
            ctx.beginPath();
            ctx.moveTo(0, 0);
            ctx.lineTo(0, -radius);
            for (const k of [0.43, 0.7]) {
              ctx.moveTo(0, -radius * k);
              ctx.lineTo(radius * 0.2, -radius * (k + 0.17));
              ctx.moveTo(0, -radius * k);
              ctx.lineTo(-radius * 0.2, -radius * (k + 0.17));
            }
            ctx.stroke();
          }
          ctx.restore();
          flakes++;
        }
        const returning = track.sections.find((s) => s.id === 'return');
        if (
          returning &&
          state.distance >= returning.start &&
          state.distance < returning.end
        ) {
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
      if (visible) ctx.restore();
      presentation = {
        ...weather,
        screenFlakes: flakes,
        meltBeads: beads,
        screenVisible: visible,
      };
    },
    snapshot: () => ({ ...presentation }),
    reset() {
      clear();
      presentation = {};
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      clear();
      canvas.remove();
    },
  };
}
