import {
  CAREER_SLOTS_KEY,
  createCareerSlots,
  createMemoryStorage,
} from '../src/progression/careers.js';

// Browser checks seed a real isolated career, then use its ordinary scoped saves.
// Preserve that career on reload so persistence assertions exercise production.
const storage = createMemoryStorage();
createCareerSlots({ storage: () => storage, now: () => 1 }).create(1);
const entries = Array.from({ length: storage.length }, (_, index) => {
  const key = storage.key(index);
  return [key, storage.getItem(key)];
});
export const careerKey = (key) => `${CAREER_SLOTS_KEY}.slot.1.${key}`;

export async function seedVerificationCareer(context) {
  await context.addInitScript(
    ({ registryKey, entries }) => {
      if (localStorage.getItem(registryKey) === null)
        for (const [key, value] of entries) localStorage.setItem(key, value);
    },
    { registryKey: CAREER_SLOTS_KEY, entries },
  );
}
