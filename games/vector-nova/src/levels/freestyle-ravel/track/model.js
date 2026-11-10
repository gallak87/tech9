import { createTransferCourse } from '../../../freestyle/course-track.js';

export function createRavelFreestyleTrack() {
  return createTransferCourse({
    id: 'freestyle-ravel',
    name: 'Ravel Sailbreak',
    labels: [
      'Reelbreak',
      'Anchor Throat',
      'Silver Crown',
      'Spindle Dive',
      'Heliopause Catch',
    ],
    turns: [-0.45, 0.2, 0.85, 0.35, -0.35],
    pipeLandings: [1, 3],
    width: 56,
    offset: [1400, 500, -1000],
  });
}
