const MAX_STEP = 0.05;
const WAITING = new Set(['title', 'countdown']);
const FROZEN = new Set(['paused', 'fly', 'inspection', 'overview']);
const boundedStep = (dt) =>
  Number.isFinite(dt) ? Math.max(0, Math.min(dt, MAX_STEP)) : 0;

/**
 * One decorative clock for Worldkit weather and river transport. The simulation
 * clock can seek/reset during recovery, so only its supplied delta advances us.
 * Before green, simulation dt is zero and consecutive waiting frames use wall
 * time. Every frozen frame refreshes that baseline without accumulating debt.
 */
export function createVesperPresentationClock() {
  let time = 0;
  let previous = null;
  return (frame = {}, nowSeconds = performance.now() / 1000) => {
    const mode = frame.mode ?? 'racing';
    const waiting = WAITING.has(mode);
    const running = mode === 'racing' || mode === 'results';
    const paused = Boolean(
      FROZEN.has(mode) ||
      frame.paused ||
      frame.suspended ||
      frame.reviewing ||
      frame.reducedMotion ||
      frame.settings?.reducedMotion ||
      (!waiting && !running),
    );
    let dt = 0;
    if (!paused) {
      if (waiting && previous?.waiting && !previous.paused) {
        dt = boundedStep(nowSeconds - previous.now);
      } else if (running) {
        dt = boundedStep(
          mode === 'results' ? (frame.presentationDt ?? frame.dt) : frame.dt,
        );
      }
    }
    time += dt;
    previous = {
      now: Number.isFinite(nowSeconds) ? nowSeconds : (previous?.now ?? 0),
      waiting,
      paused,
    };
    return { dt, time, paused };
  };
}
