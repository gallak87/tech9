import { createEliminatorTrack } from '../../../events/eliminator-track.js';

export function createGlasswakeEliminatorTrack() {
  return createEliminatorTrack({
    id: 'eliminator-glasswake',
    name: 'Glasswake Fracture',
    targetLength: 4900,
    width: 50,
    bankLimit: 0.44,
    bankScale: 105,
    points: [
      [0, 210, 0],
      [40, 235, 390],
      [380, 325, 740],
      [850, 300, 710],
      [1100, 180, 330],
      [950, 80, -230],
      [510, 105, -650],
      [100, 155, -600],
      [-300, 210, -240],
    ],
    sections: [
      'Bluewater apron',
      'The crystal crown',
      'Cavern descent',
      'Under the fracture',
      'Aurora return',
    ],
  });
}
