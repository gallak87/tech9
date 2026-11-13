export const FREESTYLE_RULES = Object.freeze({
  version: 8,
  rotationPointsPerSecond: 800,
  landingWindow: 0.3,
  stableWindow: 0.1,
  landingTiltTolerance: 0.48,
  landingHeadingTolerance: 0.58,
  perfectToleranceScale: 0.5,
  points: Object.freeze({ landed: 1000, clean: 2000, perfect: 2500 }),
  angularSpeed: [2.8, 2.6, 3.1],
  acceleration: 4.8,
  releaseDamping: 3.5,
  medals: { bronze: 12500, silver: 39000, gold: 75000 },
});
export const TRICKS = Object.freeze({
  roll: { name: 'Barrel roll', points: 1000 },
  flip: { name: 'Flip', points: 1500 },
  spin: { name: 'Flat spin', points: 1250 },
  corkscrew: { name: 'Corkscrew', points: 1750 },
});
