import { createEliminatorTrack } from '../../../events/eliminator-track.js';

export function createSaffronEliminatorTrack() {
  return createEliminatorTrack({
    id: 'eliminator-saffron',
    name: 'Saffron Ossuary',
    targetLength: 5600,
    width: 48,
    bankLimit: 0.78,
    bankScale: 175,
    points: [
      [0, 175, 0],
      [30, 205, 420],
      [-200, 300, 700],
      [220, 380, 1040],
      [730, 430, 900],
      [950, 330, 560],
      [620, 210, 300],
      [1050, 120, -50],
      [830, 90, -460],
      [300, 130, -700],
      [-300, 155, -520],
      [-390, 175, -80],
    ],
    sections: [
      'Fossil-glass apron',
      'Rib gallery',
      'The crown plunge',
      'Marrow causeway',
      'Dune return',
    ],
  });
}
