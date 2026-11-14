// Ambient layers can run before the start while racing effects keep their
// simulation clock. Carry the pre-race phase into green smoothly.
export function createAmbientClock() {
  let previous = null;
  let offset = 0;
  let value = 0;
  return (frame, now = performance.now() / 1000) => {
    const { time = 0, mode = 'racing', reset = false } = frame;
    const waiting = mode === 'title' || mode === 'countdown';
    const resetCount = frame.state?.resetCount ?? 0;
    const recovering = reset && previous && resetCount > previous.resetCount;
    if (
      (reset && !recovering && mode !== 'inspection') ||
      (previous && time < previous.time)
    ) {
      offset = waiting && previous ? value - time : 0;
    }
    if (waiting && previous?.waiting && !reset) {
      // Bound gaps from loading/background suspension just like the renderer.
      offset += Math.max(0, Math.min(now - previous.now, 0.1));
    }
    value = time + offset;
    previous = { time, now, waiting, resetCount };
    return value;
  };
}
