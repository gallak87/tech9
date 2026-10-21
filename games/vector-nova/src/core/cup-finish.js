import { CUP_FINISH_GRACE } from '../race/cup.js';

// Keep the finish banner on a presentation clock. The full field still runs
// ordinary fixed ticks, with a bounded amount of work between browser paints.
export function createCupFinish({
  simulationTime,
  allFinished,
  step,
  now = () => performance.now(),
}) {
  const deadline = simulationTime() + CUP_FINISH_GRACE;
  let elapsed = 0;
  let complete = false;
  const classified = () => allFinished() || simulationTime() >= deadline - 1e-8;
  return {
    advance(dt) {
      elapsed += dt;
      const until = now() + 12;
      for (let ticks = 0; !complete && ticks < 240; ticks++) {
        complete = classified();
        if (complete || now() >= until) break;
        step();
      }
      complete ||= classified();
      return { complete, ready: complete && elapsed >= 2.4 };
    },
  };
}
