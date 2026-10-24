// Save identities span editions; availability never deletes earned progress.
export const IS_DEMO = import.meta.env?.VN_EDITION === 'demo';
export const CAREER_SHIPS = Object.freeze([
  'kestrel',
  'shrike',
  'bastion',
  'needle',
]);
export const FULL_CUPS = Object.freeze([
  'founders',
  'frontier',
  'horizon',
  'apex',
]);
export const DEMO_REQUIREMENTS = Object.freeze({
  'speed-1': { finishes: 1 },
  'equipment-jump': { finishes: 3 },
  'equipment-deflector': { cup: 'demo' },
  'boost-1': { trials: 1 },
});
export const fullCupWins = (profile) =>
  profile.cups.filter((id) => FULL_CUPS.includes(id)).length;
