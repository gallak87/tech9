export const FREESTYLE_RULES = Object.freeze({
  version: 7,
  rotationPointsPerSecond: 800,
  landingWindow: 0.3,
  stableWindow: 0.1,
  points: Object.freeze({ landed: 1000, clean: 2000, perfect: 2500 }),
  catchWindow: 0.65,
  catchLead: 0.08,
  angularSpeed: [2.8, 2.6, 3.1],
  acceleration: 4.8,
  releaseDamping: 3.5,
  medals: { bronze: 4500, silver: 14000, gold: 27000 },
});
export const TRICKS = Object.freeze({
  roll: { name: 'Barrel roll', points: 1000 },
  flip: { name: 'Flip', points: 1500 },
  spin: { name: 'Flat spin', points: 1250 },
  corkscrew: { name: 'Corkscrew', points: 1750 },
});
