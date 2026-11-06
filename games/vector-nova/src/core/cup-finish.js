import { CUP_FINISH_GRACE } from '../race/cup.js';

// Classification observes the ordinary simulation clock. It never steps or
// accelerates the field, so finishers remain visible behind the results.
export function createCupFinish({ simulationTime, allFinished }) {
  const deadline = simulationTime() + CUP_FINISH_GRACE;
  let elapsed = 0;
  let complete = false;
  return {
    advance(dt) {
      elapsed += dt;
      complete ||= allFinished() || simulationTime() >= deadline - 1e-8;
      return { complete, ready: elapsed >= 2.4 };
    },
  };
}
