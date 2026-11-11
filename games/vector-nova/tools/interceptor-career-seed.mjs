import {
  CAREER_SLOTS_KEY,
  createCareerSlots,
  createMemoryStorage,
} from '../src/progression/careers.js';
import { createProfileStore } from '../src/progression/profile.js';
import { modeUnlockRequirement } from '../src/levels/access.js';

// Seed only the real prerequisites. The course under test must still earn its
// own result, progression and next-course unlock through the live session.
export async function seedInterceptorCareer(page, levelId = 'interceptor') {
  const unlock = modeUnlockRequirement('interceptor');
  const index = unlock.levelIds.indexOf(levelId);
  if (index < 0) throw new Error(`Unknown Interceptor course: ${levelId}`);
  const storage = createMemoryStorage();
  const careers = createCareerSlots({ storage: () => storage, now: () => 1 });
  careers.create(1);
  const profile = createProfileStore(() => careers.storageFor(1));
  profile.recordCup(unlock.cupId);
  for (const previous of unlock.levelIds.slice(0, index))
    if (!profile.recordCourseFinish(previous))
      throw new Error(`Cannot seed Interceptor prerequisite: ${previous}`);
  const values = Array.from({ length: storage.length }, (_, i) => {
    const key = storage.key(i);
    return [key, storage.getItem(key)];
  });
  await page.addInitScript(
    ({ values, registryKey }) => {
      if (localStorage.getItem(registryKey) !== null) return;
      for (const [key, value] of values) localStorage.setItem(key, value);
    },
    { values, registryKey: CAREER_SLOTS_KEY },
  );
}
