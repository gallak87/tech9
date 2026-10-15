export function createStartCountdown({ now = () => performance.now() } = {}) {
  let remaining = 0,
    until = 0,
    running = false,
    active = false,
    step = null;
  return {
    begin() {
      remaining = 3;
      active = true;
      running = true;
      until = now() + 3000;
      step = null;
    },
    advance() {
      if (!active || !running) return null;
      const time = now();
      remaining = Math.max(0, (until - time) / 1000);
      // The first observable beat owns its full second, even if graphics or
      // audio readiness delayed this call. Later stalls never skip a light.
      const next = step === null ? 3 : Math.max(step - 1, Math.ceil(remaining));
      if (next === step) return null;
      step = next;
      remaining = next;
      until = time + remaining * 1000;
      if (next === 0) {
        active = false;
        running = false;
      }
      return next;
    },
    pause() {
      if (running && step !== null)
        remaining = Math.max(0, (until - now()) / 1000);
      running = false;
    },
    resume() {
      if (!active) return;
      until = now() + remaining * 1000;
      running = true;
    },
    cancel() {
      active = running = false;
      remaining = 0;
      step = null;
    },
    snapshot() {
      return { active, running, remaining, step };
    },
    restore(saved) {
      ({ active, running, remaining, step } = saved);
      until = now() + remaining * 1000;
    },
  };
}
