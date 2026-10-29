import { createInterceptorTarget } from './interceptor-target.js';
import { createWraithTarget } from './wraith-target.js';
import { createBulwarkTarget } from './bulwark-target.js';

export function createBossTarget(bossId, settings = {}) {
  if (bossId === 'goliath') return createInterceptorTarget(settings);
  if (bossId === 'wraith') return createWraithTarget(settings);
  if (bossId === 'bulwark') return createBulwarkTarget(settings);
  throw new Error(`Unknown boss target: ${bossId}`);
}
