// Prepared stride phase, measured in world pixels. The renderer does not yet
// consume this phase; distance tracking alone does not fix the source artwork.
export const LOCOMOTION_STRIDE = Object.freeze({walk:84,run:104});

const wrapPhase = phase => Number.isFinite(phase)?((phase%1)+1)%1:0;

export function advanceLocomotionPhase(phase,travel,running=false){
  const distance=Number.isFinite(travel)?Math.max(0,travel):0;
  return wrapPhase(wrapPhase(phase)+distance/LOCOMOTION_STRIDE[running?'run':'walk']);
}

export function locomotionFrame(phase,frames=6){
  return Math.floor(wrapPhase(phase)*frames);
}
