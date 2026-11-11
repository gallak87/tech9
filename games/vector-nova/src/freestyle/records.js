const memory = new Map();
const storageMemories = new WeakMap();
function memoryFor(store) {
  if (!store?.isolated) return memory;
  if (!storageMemories.has(store)) storageMemories.set(store, new Map());
  return storageMemories.get(store);
}
export function finishFreestyle(result, identity, storage) {
  let hash = 2166136261;
  for (const character of identity)
    hash = Math.imul(hash ^ character.charCodeAt(0), 16777619);
  const key = `vector-nova.freestyle.v2.${(hash >>> 0).toString(16)}`;
  try {
    storage ??= globalThis.localStorage;
  } catch {
    storage = null;
  }
  const records = memoryFor(storage);
  let previous = records.get(key) ?? null;
  try {
    const saved = JSON.parse(storage?.getItem(key) ?? 'null');
    if (
      saved &&
      Number.isSafeInteger(saved.score) &&
      saved.score >= 0 &&
      saved.score < 10000000
    )
      previous = saved.score;
  } catch {
    storage = null;
  }
  const improved =
    result.playerValid && (previous == null || result.score > previous);
  const best = improved ? result.score : previous;
  let saved = false;
  if (improved) {
    records.set(key, best);
    try {
      storage?.setItem(key, JSON.stringify({ score: best }));
      saved = !!storage;
    } catch {
      /* This session still retains the best. */
    }
  }
  return { ...result, previousBest: previous, best, improved, saved };
}
