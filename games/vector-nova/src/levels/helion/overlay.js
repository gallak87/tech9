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
    padding: '10px 12px',
    borderRadius: '3px',
    border: '1px solid #897766',
    background: 'rgba(12,24,32,.9)',
    color: '#f5ede0',
    font: '600 11px/1.5 system-ui',
    letterSpacing: '.07em',
    pointerEvents: 'none',
    zIndex: '6',
    display: 'none',
  });
  const signal = document.createElement('div');
  signal.dataset.helionHeatStatus = '';
  Object.assign(signal.style, {
    fontWeight: '800',
    letterSpacing: '.08em',
    color: '#ffd6ac',
    marginBottom: '4px',
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
  const detail = document.createElement('div');
  Object.assign(detail.style, {
    fontSize: '10px',
    letterSpacing: '.025em',
    fontWeight: '500',
  });
  element.append(signal, readout, rail, detail);
  const visor = document.createElement('div');
  visor.dataset.helionVisor = '';
  Object.assign(visor.style, {
    position: 'absolute',
    inset: '0',
    pointerEvents: 'none',
    zIndex: '0',
    background:
      'radial-gradient(ellipse at 50% 54%, transparent 54%, rgba(244,66,13,.22) 78%, rgba(255,105,29,.66) 100%)',
    opacity: '0',
  });
  const destination = document.createElement('div');
  destination.dataset.helionRecovery = '';
  Object.assign(destination.style, {
    position: 'absolute',
    width: '150px',
    textAlign: 'center',
    color: '#ffdaa0',
    font: '600 10px/1.5 system-ui',
    letterSpacing: '.04em',
    textShadow: '0 1px 4px #000',
    pointerEvents: 'none',
    zIndex: '5',
    display: 'none',
  });
  const direction = document.createElement('div');
  direction.textContent = '▲';
  direction.style.fontSize = '22px';
  const targetLabel = document.createElement('div');
  destination.append(direction, targetLabel);
  host.append(visor, element, destination);
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
        '.lap,.timing,.section-name,#minimap,#shape-controls,#notice,.energy,.speed,#touch,#legend,header,[data-helion-recovery]',
      ),
    ]
      .filter((node) => getComputedStyle(node).display !== 'none')
      .map((node) => node.getBoundingClientRect())
      .filter((rect) => rect.width && rect.height);
    if (hull) obstacles.push(hull);
    // Shared HUD text and the projected recovery marker can change after this
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
      const feedback = sampleHelionHeatFeedback(telemetry);
      const thermalCue =
        visible && !telemetry.sheltered && telemetry.label !== 'COOLING STRIP'
          ? Math.max(
              0,
              Math.min(
                1,
                Math.max(
                  feedback.contact ? 44 : 0,
                  (telemetry.heat ?? 0) - 12,
                ) / 72,
              ),
            )
          : 0;
      visor.style.opacity = `${thermalCue * (settings.reducedMotion ? 0.68 : 0.72 + Math.sin(time * 1.7) * 0.08)}`;
      destination.style.display =
        visible && telemetry.recoveryTarget ? 'block' : 'none';
      if (!visible) {
        currentLayout = null;
        return;
      }
      const width = host.clientWidth || globalThis.innerWidth;
      const height = host.clientHeight || globalThis.innerHeight;
      const portrait = width < 600 && height > width;
      const short = height < 560 && width >= height;
      if (telemetry.recoveryTarget && camera) {
        const point = new T.Vector3()
          .fromArray(telemetry.recoveryTarget)
          .project(camera);
        const x = T.MathUtils.clamp(
          (point.x + 1) * width * 0.5,
          width * 0.3,
          width * 0.7,
        );
        const y = T.MathUtils.clamp(
          (1 - point.y) * height * 0.5,
          height * 0.3,
          height * 0.6,
        );
        destination.style.left = `${x - 75}px`;
        destination.style.top = `${y - 22}px`;
        direction.style.transform = `rotate(${(Math.atan2(point.x, point.y) * 180) / Math.PI}deg)`;
        targetLabel.textContent = `AUTO RECOVERY · SHELF ${Math.round(telemetry.recoveryDistance)} m`;
      }
      element.style.width = short ? '194px' : portrait ? '210px' : '236px';

      element.style.padding = short ? '5px 8px' : '10px 12px';
      element.style.fontSize = short ? '10px' : '11px';
      element.style.letterSpacing = short ? '.025em' : '.07em';
      const heat = telemetry.heat ?? 0;
      const power = telemetry.thrustScale ?? 1;
      const flight = telemetry.flightMode ?? 'magnetic';
      readout.textContent = `HEAT ${Math.round(heat)} / 100 · THRUST ${Math.round(power * 100)}%`;
      fill.style.width = `${heat}%`;
      const burning = feedback.contact,
        hot = heat >= 62,
        cooling = feedback.status === 'COOLING';
      signal.style.display = feedback.status ? 'block' : 'none';
      const action = burning
        ? telemetry.label?.startsWith('FURNACE')
          ? 'KEEP MOVING'
          : 'EVADE'
        : hot && !cooling && !short
          ? 'THRUST LOSS'
          : '';
      signal.textContent = feedback.status
        ? `${cooling ? '↓' : '▲'} ${feedback.status}${action ? ' · ' + action : ''}`
        : '';
      signal.style.fontSize = short ? '10px' : '13px';
      signal.style.lineHeight = short ? '1.3' : '1.5';
      signal.style.marginBottom = short ? '2px' : '4px';
      signal.style.color = cooling ? '#a5ece1' : '#ffe0b6';
      fill.style.background = burning || hot ? '#ff8542' : '#83d6ce';
      element.style.borderColor = burning
        ? '#ff9d59'
        : hot
          ? '#e39461'
          : cooling
            ? '#83d6ce'
            : '#897766';
      element.style.background =
        burning || hot ? 'rgba(49,19,14,.94)' : 'rgba(12,24,32,.9)';
      element.style.boxShadow = burning
        ? 'inset 4px 0 #ff8542, 0 0 22px rgba(255,87,21,.22)'
        : hot
          ? 'inset 3px 0 #e39461'
          : 'none';
      detail.textContent =
        flight === 'recovery'
          ? short
            ? 'JUMP MISSED · RECOVERY'
            : 'MISSED JUMP · RECOVERING TO SHELF'
          : flight === 'flight'
            ? 'SHELTERED FLIGHT · LIMITED AIR STEER'
            : telemetry.warning || telemetry.label || 'CLEAR DECK';
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
        text: detail.textContent,
      };
    },
    reset() {
      presentation = {};
      layoutKey = '';
      currentLayout = null;
    },
    getPresentation: () => ({ helion: { ...presentation } }),
    dispose() {
      hudObserver.disconnect();
      currentLayout = null;
      element.remove();
      visor.remove();
      destination.remove();
    },
  };
}
