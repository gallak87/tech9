import { bindMapGestures } from './map-gestures.js';
import { mapPosition } from './maps.js';
import { REGIONS, terrainAt } from './world.js';
import {
  MAP_REGIONS,
  mapLayout,
  adjacentMapRegion,
  mapTravelAction,
  mapRegionVisible,
  mapPointVisible,
} from './expedition-map-model.js';

// One layout aligns the live survey with accessible travel buttons, including
// after mouse pan/zoom and resizing. Arrow keys select places, never pan.
export class ExpeditionMap {
  constructor(game) {
    this.game = game;
    this.zoom = 1;
    this.panX = 0;
    this.panY = 0;
    this.selected = null;
  }
  focusSelected() {
    this.select(
      this.selected || mapPosition(this.game.state)?.region || 'haventide',
      true,
    );
  }
  select(id, focus = false) {
    if (!Object.hasOwn(MAP_REGIONS, id)) return;
    this.selected = id;
    if (focus) {
      const box = this.layout?.[id],
        w = this.canvas?.clientWidth,
        h = this.canvas?.clientHeight;
      if (box && w && h) {
        this.panX +=
          box.x < 12
            ? 12 - box.x
            : box.x + box.width > w - 12
              ? w - 12 - box.x - box.width
              : 0;
        this.panY +=
          box.y < 50
            ? 50 - box.y
            : box.y + box.height > h - 40
              ? h - 40 - box.y - box.height
              : 0;
      }
      this.frame
        ?.querySelector('[data-map-region="' + id + '"]')
        ?.focus({ preventScroll: true });
    }
    this.draw();
  }
  activate(id = this.selected) {
    const route = mapTravelAction(this.game, id);
    if (route.action) this.game.ui.action(route.action);
  }
  key(key) {
    if (!this.canvas?.isConnected) return false;
    const active = document.activeElement;
    if (key.startsWith('Arrow')) {
      const next = adjacentMapRegion(this.selected, key);
      if (next === this.selected && key === 'ArrowUp')
        this.frame
          .closest('.expedition')
          ?.querySelector('.tabs [aria-selected="true"]')
          ?.focus({ preventScroll: true });
      else this.select(next, true);
      return true;
    }
    if (
      (key === ' ' || key === 'Enter') &&
      this.frame.contains(active) &&
      !active.closest('.map-tools')
    ) {
      this.activate();
      return true;
    }
    if (['+', '=', '-', '_'].includes(key)) {
      this.zoom = Math.max(
        0.55,
        Math.min(4, this.zoom * (key === '-' || key === '_' ? 0.85 : 1.15)),
      );
      return true;
    }
    if (key === 'r') {
      this.zoom = 1;
      this.panX = this.panY = 0;
      return true;
    }
    return false;
  }
  mount(canvas) {
    this.unmount();
    this.canvas = canvas;
    this.frame = canvas.closest('.map-frame');
    const position = mapPosition(this.game.state)?.region;
    if (this.location !== position) {
      this.selected = position || 'haventide';
      this.zoom = 1;
      this.panX = this.panY = 0;
      this.location = position;
    }
    this.frame.onwheel = (event) => {
      event.preventDefault();
      this.zoom = Math.max(
        0.55,
        Math.min(4, this.zoom * (event.deltaY > 0 ? 0.9 : 1.1)),
      );
      this.draw();
    };
    this.disposeGestures = bindMapGestures(this.frame, {
      exclude: '.map-tools',
      change: ({ dx, dy, factor, x, y }) => {
        const zoom = Math.max(0.55, Math.min(4, this.zoom * factor));
        const scale = zoom / this.zoom;
        const cx = this.canvas.clientWidth / 2,
          cy = this.canvas.clientHeight / 2 + 4;
        this.panX = x - cx - (x - cx - this.panX - dx) * scale;
        this.panY = y - cy - (y - cy - this.panY - dy) * scale;
        this.zoom = zoom;
        this.draw();
      },
      tap: (target) => {
        const id = target?.closest('[data-map-region]')?.dataset.mapRegion;
        if (id) {
          this.select(id);
          this.activate(id);
        }
      },
      hover: (target) => {
        const id = target?.closest('[data-map-region]')?.dataset.mapRegion;
        if (id && id !== this.selected) this.select(id);
      },
    });
    this.frame.onfocusin = (event) => {
      const id = event.target.dataset.mapRegion;
      if (id && id !== this.selected) this.select(id);
    };
    this.observer = new ResizeObserver(() => this.draw());
    this.observer.observe(this.frame);
    this.draw();
  }
  unmount() {
    this.disposeGestures?.();
    this.disposeGestures = null;
    this.observer?.disconnect();
    this.observer = null;
    this.canvas = null;
    this.frame = null;
  }
  draw() {
    const canvas = this.canvas;
    if (!canvas?.isConnected) return;
    const w = canvas.clientWidth,
      h = canvas.clientHeight;
    if (!w || !h) return;
    const c = canvas.getContext('2d'),
      s = this.game.state,
      position = mapPosition(s);
    canvas.width = Math.round(w * 2);
    canvas.height = Math.round(h * 2);
    c.scale(2, 2);
    c.fillStyle = '#deca9f';
    c.fillRect(0, 0, w, h);
    c.strokeStyle = '#76634417';
    c.lineWidth = 0.6;
    for (let x = 16; x < w; x += 24) {
      c.beginPath();
      c.moveTo(x, 0);
      c.lineTo(x, h);
      c.stroke();
    }
    for (let y = 16; y < h; y += 24) {
      c.beginPath();
      c.moveTo(0, y);
      c.lineTo(w, y);
      c.stroke();
    }
    this.layout = mapLayout(w, h, this.zoom, this.panX, this.panY);
    const edges = new Set();
    for (const region of Object.values(REGIONS)) {
      if (!mapRegionVisible(this.game, region.id)) continue;
      for (const portal of region.portals) {
        if (!mapRegionVisible(this.game, portal.to) || !this.layout[portal.to])
          continue;
        const edge = [region.id, portal.to].sort().join(':');
        if (edges.has(edge)) continue;
        edges.add(edge);
        c.strokeStyle = '#6a563c';
        c.setLineDash([2, 4]);
        c.beginPath();
        for (const [i, id] of [region.id, portal.to].entries()) {
          const b = this.layout[id];
          c[i ? 'lineTo' : 'moveTo'](b.x + b.width / 2, b.y + b.height / 2);
        }
        c.stroke();
        c.setLineDash([]);
      }
    }
    for (const [id, b] of Object.entries(this.layout)) {
      const region = REGIONS[id],
        { x, y, width, height } = b,
        visited = mapRegionVisible(this.game, id);
      c.fillStyle = visited ? '#bdac86' : '#d3bd91';
      c.fillRect(x, y, width, height);
      if (visited) {
        c.save();
        c.translate(x, y);
        c.scale(width / 126, height / 74);
        for (let cy = 0; cy < 74; cy += 2)
          for (let cx = 0; cx < 126; cx += 2) {
            const wx = ((cx + 0.5) / 126) * region.width,
              wy = ((cy + 0.5) / 74) * region.height;
            if (!mapPointVisible(this.game, id, wx, wy)) continue;
            const t = terrainAt(region, wx, wy);
            c.fillStyle =
              t === 'water' ? '#979b8b' : t === 'path' ? '#ebdcb5' : '#b4b18c';
            c.fillRect(cx, cy, 2, 2);
          }
        for (const o of [...region.objects, ...region.portals]) {
          if (
            !['town', 'house', 'cave', 'portal', 'landmark'].includes(o.type) ||
            !mapPointVisible(this.game, id, o.x, o.y)
          )
            continue;
          const px = (o.x / region.width) * 126,
            py = (o.y / region.height) * 74;
          c.fillStyle = '#574832';
          if (o.type === 'town') {
            c.strokeStyle = '#574832';
            c.lineWidth = 0.8;
            c.strokeRect(px - 2, py - 2, 4, 4);
          } else {
            c.beginPath();
            c.arc(px, py, 1.2, 0, Math.PI * 2);
            c.fill();
          }
        }
        if (position?.region === id) {
          const px = (position.x / region.width) * 126,
            py = (position.y / region.height) * 74;
          c.strokeStyle = '#ae4829';
          c.lineWidth = 1.4;
          c.beginPath();
          c.moveTo(px - 4, py);
          c.lineTo(px + 4, py);
          c.moveTo(px, py - 4);
          c.lineTo(px, py + 4);
          c.stroke();
        }
        c.restore();
      }
      const button = this.frame.querySelector('[data-map-region="' + id + '"]'),
        route = mapTravelAction(this.game, id);
      Object.assign(button.style, {
        left: x + 'px',
        top: y + 'px',
        width: width + 'px',
        height: height + 'px',
      });
      button.classList.toggle('current', position?.region === id);
      button.setAttribute('aria-pressed', String(this.selected === id));
      button.setAttribute('aria-disabled', String(!route.action));
      button.setAttribute(
        'aria-label',
        (visited ? region.name : 'Uncharted region') +
          ' · ' +
          (route.action ? route.label : route.reason),
      );
      button.querySelector('.map-region-name').textContent = visited
        ? region.name
        : 'Uncharted';
      const hint = button.querySelector('.map-region-action');
      hint.innerHTML = route.action
        ? '<kbd>Space</kbd> / <kbd>Enter</kbd> ' + route.label
        : '';
      if (!route.action) hint.textContent = route.reason;
    }
  }
}
