import { createCrucibleTrack } from '../../crucible/track/model.js';

// New objective and replay identity on the already authored Foundry course.
// Geometry, checkpoints and shared world kit remain exactly the same.
export function createInterceptorTrack() {
  const track = createCrucibleTrack();
  return {
    ...track,
    id: 'crucible-dispatch-pursuit-v1',
    name: 'Crucible Dispatch',
  };
}
