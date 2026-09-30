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
  element.append(readout, rail, detail);
  host.append(element);
  let presentation = {};
  let layoutKey = '';
  function place(width, height, short, portrait) {
    const notice = host.querySelector('#notice');
    const key = `${width}:${height}:${notice?.textContent}:${host.querySelector('#review-toggle')?.getAttribute('aria-expanded')}`;
    if (key === layoutKey) return;
    layoutKey = key;
    const own = element.getBoundingClientRect();
    const w = own.width,
      h = own.height;
    const obstacles = [
      ...host.querySelectorAll(
        '.lap,.timing,.section-name,#minimap,#shape-controls,#notice,.energy,.speed,#touch,#legend,header',
      ),
    ]
      .filter((node) => getComputedStyle(node).display !== 'none')
      .map((node) => node.getBoundingClientRect())
      .filter((rect) => rect.width && rect.height);
    const candidates = [width - w - 18, 18, (width - w) / 2];
    let best = null;
    for (const x of candidates)
      for (let y = 110; y < height - h - 85; y += 12) {
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
    update({ mode, reviewing }) {
      const visible = ['racing', 'paused'].includes(mode) && !reviewing;
      element.style.display = visible ? 'block' : 'none';
      if (!visible) return;
      const width = host.clientWidth || globalThis.innerWidth;
      const height = host.clientHeight || globalThis.innerHeight;
      const portrait = width < 600 && height > width;
      const short = height < 560 && width >= height;
      element.style.width = short ? '194px' : portrait ? '210px' : '236px';

      element.style.padding = short ? '5px 8px' : '10px 12px';
      const heat = telemetry.heat ?? 0;
      const power = telemetry.thrustScale ?? 1;
      const flight = telemetry.flightMode ?? 'magnetic';
      readout.textContent = `HEAT ${Math.round(heat)} / 100 · THRUST ${Math.round(power * 100)}%`;
      fill.style.width = `${heat}%`;
      fill.style.background = heat >= 62 ? '#f09564' : '#83d6ce';
      element.style.borderColor = heat >= 62 ? '#d98c5f' : '#897766';
      detail.textContent =
        flight === 'recovery'
          ? 'MISSED JUMP · RECOVERING TO SHELF'
          : flight === 'flight'
            ? 'SHELTERED FLIGHT · LIMITED AIR STEER'
            : telemetry.warning || telemetry.label || 'CLEAR DECK';
      place(width, height, short, portrait);
      presentation = { ...telemetry, text: detail.textContent };
    },
    reset() {
      presentation = {};
      layoutKey = '';
    },
    getPresentation: () => ({ helion: { ...presentation } }),
    dispose() {
      element.remove();
    },
  };
}
