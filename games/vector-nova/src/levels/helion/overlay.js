import * as T from 'three';
import { sampleHelionHeatFeedback } from './thermal.js';
// Local presentation only. The runtime owns all heat and flight state.
export function createHelionOverlay(host, telemetry) {
  const element = document.createElement('div');
  element.dataset.helionThermal = '';
  element.setAttribute('aria-live', 'polite');
  Object.assign(element.style, {
    position: 'absolute',
    right: '18px',
    top: '118px',
    width: '236px',
    boxSizing: 'border-box',
    padding: '0',
    textShadow: '0 1px 4px #000, 0 0 8px #000',
    color: '#f5ede0',
    font: '600 11px/1.5 system-ui',
    letterSpacing: '.07em',
    pointerEvents: 'none',
    zIndex: '6',
    display: 'none',
  });
  const readout = document.createElement('div');
  const rail = document.createElement('div');
  Object.assign(rail.style, {
    height: '4px',
    background: '#34474c',
    margin: '5px 0',
  });
  const fill = document.createElement('div');
  Object.assign(fill.style, {
    height: '100%',
    background: '#77d3c8',
    width: '0%',
  });
  rail.append(fill);
  element.append(readout, rail);
  const visor = document.createElement('div');
  visor.dataset.helionVisor = '';
  Object.assign(visor.style, {
    position: 'absolute',
    inset: '0',
    pointerEvents: 'none',
    zIndex: '18',
    background:
      'radial-gradient(ellipse at 50% 54%, rgba(230,12,18,.20) 0%, rgba(236,15,20,.24) 55%, rgba(245,18,24,.42) 100%)',
    opacity: '0',
  });
  host.append(visor, element);
  let presentation = {};
  let layoutKey = '';
  let currentLayout = null;
  // Core updates the shared speed/status text after the level overlay. Measure
  // its final bounds in the same paint, including the first recovery frame.
  const hudObserver = new MutationObserver(() => {
    if (currentLayout) place(...currentLayout);
  });
  const speedHud = host.querySelector('.speed');
  if (speedHud)
    hudObserver.observe(speedHud, { childList: true, subtree: true });
  function place(width, height, short, portrait, hull) {
    const own = element.getBoundingClientRect();
    const w = own.width,
      h = own.height;
    const obstacles = [
      ...host.querySelectorAll(
        '.lap,.timing,#minimap,#shape-controls,.energy,.speed,#touch,#legend,header',
      ),
    ]
      .filter((node) => getComputedStyle(node).display !== 'none')
      .map((node) => node.getBoundingClientRect())
      .filter((rect) => rect.width && rect.height);
    if (hull) obstacles.push(hull);
    // Shared HUD text can change after this
    // overlay updates. Reflow on their next measured bounds as well as the hull.
    const key = `${width}:${height}:${w}:${h}:${obstacles.map((rect) => [rect.left, rect.top, rect.right, rect.bottom].map((v) => Math.round(v / 4)).join(',')).join(';')}`;
    if (key === layoutKey) return;
    layoutKey = key;
    const candidates = [
      ...new Set([
        width - w - 18,
        18,
        (width - w) / 2,
        ...obstacles.flatMap((rect) => [rect.left - w - 8, rect.right + 8]),
      ]),
    ].filter((x) => x >= 12 && x + w <= width - 12);
    let best = null;
    for (const x of candidates)
      for (let y = short ? 64 : 110; y < height - h - 65; y += 12) {
        let overlap = 0;
        for (const rect of obstacles)
          overlap +=
            Math.max(
              0,
              Math.min(x + w + 6, rect.right) - Math.max(x - 6, rect.left),
            ) *
            Math.max(
              0,
              Math.min(y + h + 6, rect.bottom) - Math.max(y - 6, rect.top),
            );
        const targetY = portrait ? 275 : short ? 180 : 210;
        const score =
          overlap * 100 +
          Math.abs(y - targetY) +
          (x < width / 2 - w / 2 ? 30 : 0);
        if (!best || score < best.score) best = { x, y, score };
      }
    if (best) {
      element.style.left = `${best.x}px`;
      element.style.right = 'auto';
      element.style.top = `${best.y}px`;
    }
  }
  return {
    update({ mode, reviewing, settings = {}, time = 0, camera, ship }) {
      const visible = ['racing', 'paused'].includes(mode) && !reviewing;
      element.style.display = visible ? 'block' : 'none';
      const feedback = sampleHelionHeatFeedback(telemetry, {
        time,
        reducedMotion: settings.reducedMotion,
      });
      const visorOpacity = visible ? feedback.severity : 0;
      visor.style.opacity = `${visorOpacity}`;
      if (!visible) {
        currentLayout = null;
        return;
      }
      const width = host.clientWidth || globalThis.innerWidth;
      const height = host.clientHeight || globalThis.innerHeight;
      const portrait = width < 600 && height > width;
      const short = height < 560 && width >= height;
      element.style.width = short ? '194px' : portrait ? '210px' : '236px';

      element.style.padding = '0';
      element.style.fontSize = short ? '10px' : '11px';
      element.style.letterSpacing = short ? '.025em' : '.07em';
      const heat = telemetry.heat ?? 0;
      const power = telemetry.thrustScale ?? 1;
      readout.textContent = `HEAT ${Math.round(heat)} / 100 · THRUST ${Math.round(power * 100)}%`;
      fill.style.width = `${heat}%`;
      fill.style.background = power < 1 ? '#ff8542' : '#83d6ce';
      let hull = null;
      const bounds = ship?.group?.userData.bounds;
      if (camera && bounds) {
        camera.updateMatrixWorld();
        ship.group.updateWorldMatrix(true, false);
        hull = {
          left: Infinity,
          top: Infinity,
          right: -Infinity,
          bottom: -Infinity,
        };
        const point = new T.Vector3();
        for (const x of [bounds.min[0], bounds.max[0]])
          for (const y of [bounds.min[1], bounds.max[1]])
            for (const z of [bounds.min[2], bounds.max[2]]) {
              point
                .set(x, y, z)
                .applyMatrix4(ship.group.matrixWorld)
                .project(camera);
              const sx = (point.x + 1) * width * 0.5,
                sy = (1 - point.y) * height * 0.5;
              hull.left = Math.min(hull.left, sx - 14);
              hull.right = Math.max(hull.right, sx + 14);
              hull.top = Math.min(hull.top, sy - 14);
              hull.bottom = Math.max(hull.bottom, sy + 14);
            }
      }
      currentLayout = [width, height, short, portrait, hull];
      place(...currentLayout);
      presentation = {
        ...telemetry,
        heatStatus: feedback.status,
        heatPulse: feedback.pulse,
        heatEnvelope: feedback.envelope,
        visorOpacity,
      };
    },
    reset() {
      presentation = {};
      layoutKey = '';
      currentLayout = null;
      visor.style.opacity = '0';
    },
    getPresentation: () => ({ helion: { ...presentation } }),
    dispose() {
      hudObserver.disconnect();
      currentLayout = null;
      element.remove();
      visor.remove();
    },
  };
}
