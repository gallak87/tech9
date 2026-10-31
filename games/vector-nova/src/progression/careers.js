import { PROFILE_KEY, freshProfile } from './profile.js';

export const CAREER_SLOTS_KEY = 'vector-nova.careers.v1';
const VERSION = 1;
const ids = [1, 2, 3];
const copy = (value) => structuredClone(value);
const freshRegistry = () => ({
  version: VERSION,
  active: null,
  slots: [null, null, null],
});
const validTime = (value) => Number.isSafeInteger(value) && value >= 0;
function validateRegistry(value) {
  if (
    value?.version !== VERSION ||
    !(value.active === null || ids.includes(value.active)) ||
    !Array.isArray(value.slots) ||
    value.slots.length !== ids.length ||
    value.slots.some(
      (slot) =>
        slot !== null &&
        (typeof slot !== 'object' ||
          Array.isArray(slot) ||
          typeof slot.name !== 'string' ||
          !slot.name.trim() ||
          slot.name.length > 32 ||
          !validTime(slot.createdAt) ||
          !validTime(slot.lastPlayed) ||
          slot.lastPlayed < slot.createdAt),
    ) ||
    (value.active !== null && !value.slots[value.active - 1])
  )
    return null;
  return copy(value);
}
function indexOf(id) {
  if (!ids.includes(id)) throw new Error('Choose one of the three careers.');
  return id - 1;
}

export function createMemoryStorage() {
  const values = new Map();
  return {
    isolated: true,
    get length() {
      return values.size;
    },
    key: (index) => [...values.keys()][index] ?? null,
    getItem: (key) => values.get(String(key)) ?? null,
    setItem: (key, value) => values.set(String(key), String(value)),
    removeItem: (key) => values.delete(String(key)),
  };
}

// Each adapter has its own identity and key enumeration, including trial memory.
// No unscoped career data is read or migrated into the current slot format.
export function createCareerSlots({
  storage = () => localStorage,
  now = Date.now,
} = {}) {
  let registry = freshRegistry(),
    notice = '';
  const adapters = new Map();
  function read() {
    try {
      const raw = storage().getItem(CAREER_SLOTS_KEY);
      const next =
        raw === null ? freshRegistry() : validateRegistry(JSON.parse(raw));
      if (!next) throw new Error('Invalid career registry');
      registry = next;
      notice = '';
      return true;
    } catch {
      notice =
        'Careers could not be read. Check browser storage and try again.';
      return false;
    }
  }
  function requireStorage() {
    if (!read()) throw new Error(notice);
    return storage();
  }
  function descriptor(id) {
    const slot = registry.slots[indexOf(id)];
    return {
      id,
      name: slot?.name ?? `Career ${id}`,
      createdAt: slot?.createdAt ?? null,
      lastPlayed: slot?.lastPlayed ?? null,
      empty: !slot,
      unavailable: !!notice,
    };
  }
  function timestamp() {
    const time = now();
    if (!validTime(time)) throw new Error('The career timestamp is invalid.');
    return time;
  }
  function write(next, writes = new Map()) {
    const target = storage();
    const updates = new Map(writes);
    updates.set(CAREER_SLOTS_KEY, JSON.stringify(next));
    const previous = new Map(
      [...updates.keys()].map((key) => [key, target.getItem(key)]),
    );
    try {
      for (const [key, value] of updates) target.setItem(key, value);
    } catch {
      for (const [key, value] of previous) {
        try {
          if (value === null) target.removeItem(key);
          else target.setItem(key, value);
        } catch {
          /* The failed career is never activated in memory. */
        }
      }
      notice = 'Career could not be saved. Your other careers are unchanged.';
      throw new Error(notice);
    }
    registry = next;
    notice = '';
  }
  function storageFor(id) {
    indexOf(id);
    if (adapters.has(id)) return adapters.get(id);
    const prefix = `${CAREER_SLOTS_KEY}.slot.${id}.`;
    const keys = () => {
      const source = storage(),
        result = [];
      for (let i = 0; i < source.length; i++) {
        const key = source.key(i);
        if (key?.startsWith(prefix)) result.push(key.slice(prefix.length));
      }
      return result;
    };
    const adapter = {
      isolated: true,
      get length() {
        return keys().length;
      },
      key: (index) => keys()[index] ?? null,
      getItem: (key) => storage().getItem(prefix + String(key)),
      setItem: (key, value) =>
        storage().setItem(prefix + String(key), String(value)),
      removeItem: (key) => storage().removeItem(prefix + String(key)),
    };
    adapters.set(id, adapter);
    return adapter;
  }
  read();
  return {
    list() {
      read();
      return ids.map(descriptor);
    },
    active() {
      read();
      return registry.active === null ? null : descriptor(registry.active);
    },
    storageFor,
    create(id) {
      requireStorage();
      const index = indexOf(id);
      if (registry.slots[index]) throw new Error('This career already exists.');
      const time = timestamp(),
        next = copy(registry);
      next.slots[index] = {
        name: `Career ${id}`,
        createdAt: time,
        lastPlayed: time,
      };
      next.active = id;
      write(
        next,
        new Map([
          [
            `${CAREER_SLOTS_KEY}.slot.${id}.${PROFILE_KEY}`,
            JSON.stringify(freshProfile()),
          ],
        ]),
      );
      return descriptor(id);
    },
    select(id) {
      requireStorage();
      const index = indexOf(id);
      if (!registry.slots[index])
        throw new Error('Create this career before selecting it.');
      const next = copy(registry);
      next.active = id;
      next.slots[index].lastPlayed = Math.max(
        timestamp(),
        next.slots[index].createdAt,
      );
      write(next);
      return descriptor(id);
    },
    rename(id, name) {
      requireStorage();
      const index = indexOf(id),
        clean = String(name).trim().replace(/\s+/g, ' ');
      if (!registry.slots[index])
        throw new Error('Create this career before naming it.');
      if (!clean || clean.length > 32)
        throw new Error('Use a career name between 1 and 32 characters.');
      const next = copy(registry);
      next.slots[index].name = clean;
      write(next);
      return descriptor(id);
    },
    snapshotNotice: () => notice,
  };
}
