import { MathUtils } from 'three';

// Presentation follows simulation time: pause holds still, a reset or explicit
// seek snaps to its new state, and boost pressure decays after the command ends.
export function createEngineResponse() {
  let previousTime = null;
  let pressure = 0;
  let previousBoost = false;
  let flowTime = 0;
  return ({ time, boosting, reducedMotion = false }) => {
    const dt = previousTime === null ? 0 : time - previousTime;
    if (
      previousTime === null ||
      dt < 0 ||
      dt > 0.5 ||
      (dt === 0 && boosting !== previousBoost)
    ) {
      pressure = boosting ? 1 : 0;
    } else {
      pressure = MathUtils.lerp(
        pressure,
        boosting ? 1 : 0,
        1 - Math.exp(-dt * (boosting ? 24 : 9)),
      );
    }
    if (!reducedMotion) flowTime = time;
    previousTime = time;
    previousBoost = boosting;
    return { pressure, flowTime };
  };
}
