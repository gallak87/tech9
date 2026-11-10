import { createNomadTrack } from '../../nomad/track/model.js';
import { installNomadMotion } from '../../nomad/motion.js';

export function createNomadEliminatorTrack() {
  const track = installNomadMotion(createNomadTrack());
  track.id = 'nomad-last-convoy';
  track.name = 'Nomad Last Convoy';
  track.deviceProjection = 'rendered-surface';
  return track;
}
