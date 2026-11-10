import createNomadLevel from '../nomad/index.js';
import { createNomadEliminatorTrack } from './track/model.js';

// Nomad's identity is the moving convoy itself. Keep the complete deck,
// collision, carrier-clock and AI transfer stack together under this event.
export default function createLevel(options = {}) {
  const nomad = createNomadLevel(options);
  return {
    ...nomad,
    version: `2.0.0-last-convoy:${nomad.version}`,
    event: {
      type: 'eliminator',
      firstCut: 22,
      interval: 10,
      finishAtCourseEnd: true,
    },
    createTrack: createNomadEliminatorTrack,
  };
}
