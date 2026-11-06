// Final production captures are rebuilt when this course, hull identity or
// duration changes. This module is deliberately independent of native physics.
export const COMPLETION_DURATION = 16;
export const COMPLETION_SHIPS = Object.freeze([
  'kestrel',
  'shrike',
  'bastion',
  'needle',
]);
export const COMPLETION_CAPTURE = Object.freeze({
  version: 2,
  course: 'shatterline',
  trackId: 'shatterline-mass-driver',
  geometryVersion: 'shatterline-tube-weave-v2',
  hullsId:
    'compound-v2-f5d706b44afc53a2abad7c55621e481f86007b3af71a67ccf602e35088558a49',
  step: 1 / 120,
  directory: 'assets/completion/shatterline-v1',
  maxManifestBytes: 64 * 1024,
  maxCompressedBytes: 2 * 1024 * 1024,
  maxRawBytes: 8 * 1024 * 1024,
});
