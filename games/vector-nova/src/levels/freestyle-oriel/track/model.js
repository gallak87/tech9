import { createTransferCourse } from '../../../freestyle/course-track.js';

export function createOrielFreestyleTrack() {
  return createTransferCourse({
    id: 'freestyle-oriel',
    name: 'Oriel Sunvault',
    labels: [
      'Garden Vault',
      'Reservoir Dive',
      'Sunline Bore',
      'Civic Reverse',
      'Canal Throat',
    ],
    turns: [0.4, 0.05, -0.6, -0.9, -0.2],
    pipeLandings: [0, 2, 4],
    width: 52,
    offset: [0, -2300, 0],
  });
}
