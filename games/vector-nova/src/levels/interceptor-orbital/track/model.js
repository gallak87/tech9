import { createLevel2Track } from '../../orbital/track/model.js';

export function createAsterionInterceptTrack() {
  const track = createLevel2Track();
  return {
    ...track,
    id: 'asterion-intercept-pursuit-v1',
    name: 'Asterion Intercept',
    review: { ...track.review, kind: 'orbital-production', phase: 'gate-3' },
  };
}
