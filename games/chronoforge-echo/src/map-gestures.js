// Pointer ownership prevents a pinch, canceled contact, or drag becoming travel.
export class MapGesture {
  constructor() {
    this.pointers = new Map();
    this.consumed = false;
  }
  start(id, x, y) {
    if (!this.pointers.size) this.consumed = false;
    if (this.pointers.size >= 2) {
      this.consumed = true;
      return false;
    }
    this.pointers.set(id, { x, y, startX: x, startY: y });
    if (this.pointers.size > 1) this.consumed = true;
    return true;
  }
  move(id, x, y) {
    const point = this.pointers.get(id);
    if (!point) return null;
    const before = [...this.pointers.values()].map((p) => ({ ...p }));
    const previousX = point.x,
      previousY = point.y;
    point.x = x;
    point.y = y;
    if (this.pointers.size === 1) {
      if (!this.consumed && Math.hypot(x - point.startX, y - point.startY) < 6)
        return null;
      const first = !this.consumed;
      this.consumed = true;
      return {
        dx: x - (first ? point.startX : previousX),
        dy: y - (first ? point.startY : previousY),
        factor: 1,
        x,
        y,
      };
    }
    const after = [...this.pointers.values()];
    const distance = (p) => Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y);
    const oldDistance = distance(before);
    return {
      dx: (after[0].x + after[1].x - before[0].x - before[1].x) / 2,
      dy: (after[0].y + after[1].y - before[0].y - before[1].y) / 2,
      factor: oldDistance > 2 ? distance(after) / oldDistance : 1,
      x: (after[0].x + after[1].x) / 2,
      y: (after[0].y + after[1].y) / 2,
    };
  }
  end(id, canceled = false) {
    if (!this.pointers.has(id)) return false;
    const tap = !canceled && !this.consumed && this.pointers.size === 1;
    this.pointers.delete(id);
    if (canceled) this.consumed = true;
    return tap;
  }
  clear() {
    this.pointers.clear();
    this.consumed = true;
  }
}

export function bindMapGestures(
  element,
  { change, tap, hover, exclude = 'button:not([data-map-region])' },
) {
  const gesture = new MapGesture(),
    starts = new Map(),
    handlers = {};
  const point = (event) => {
    const rect = element.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  };
  handlers.pointerdown = (event) => {
    if (event.button !== 0 || event.target.closest(exclude)) return;
    const p = point(event);
    if (gesture.start(event.pointerId, p.x, p.y)) {
      starts.set(event.pointerId, event.target);
      element.setPointerCapture(event.pointerId);
    }
  };
  handlers.pointermove = (event) => {
    const p = point(event),
      result = gesture.move(event.pointerId, p.x, p.y);
    if (result) change(result);
    else if (!gesture.pointers.size && event.pointerType === 'mouse')
      hover?.(event.target);
  };
  handlers.pointerup = (event) => {
    if (gesture.end(event.pointerId)) tap?.(starts.get(event.pointerId));
    starts.delete(event.pointerId);
  };
  handlers.pointercancel = handlers.lostpointercapture = (event) => {
    gesture.end(event.pointerId, true);
    starts.delete(event.pointerId);
  };
  handlers.click = (event) => {
    if (event.target.closest(exclude)) return;
    if (event.detail === 0) tap?.(event.target);
    event.preventDefault();
    event.stopPropagation();
  };
  for (const [type, fn] of Object.entries(handlers))
    element.addEventListener(type, fn);
  const cancel = () => {
    gesture.clear();
    starts.clear();
  };
  for (const type of ['blur', 'resize', 'pagehide'])
    globalThis.addEventListener?.(type, cancel);
  return () => {
    cancel();
    for (const [type, fn] of Object.entries(handlers))
      element.removeEventListener(type, fn);
    for (const type of ['blur', 'resize', 'pagehide'])
      globalThis.removeEventListener?.(type, cancel);
  };
}
