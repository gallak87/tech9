// The base game's registration boundary. Content owns stable namespaced keys;
// the current world has only the 'present' variant. No expansion is registered.
export function createContentRegistry(namespace, groups) {
  if (!/^[a-z][a-z0-9_]*$/.test(namespace)) throw new Error('Invalid content namespace');
  const entries = new Map();
  for (const [kind, catalog] of Object.entries(groups)) {
    for (const [id, value] of Object.entries(catalog)) {
      if (!/^[a-z][a-z0-9_]*$/.test(id)) throw new Error(`Invalid ${kind} ID: ${id}`);
      const key = `${namespace}:${kind}:${id}`;
      if (entries.has(key)) throw new Error(`Duplicate content: ${key}`);
      entries.set(key, value);
    }
  }
  return Object.freeze({
    namespace, variant: 'present', keys: Object.freeze([...entries.keys()]),
    get(kind, id) {
      const key = `${namespace}:${kind}:${id}`;
      if (!entries.has(key)) throw new Error(`Required content is missing: ${key}`);
      return entries.get(key);
    }
  });
}

export function validateWorld(registry) {
  for (const key of registry.keys.filter(k => k.includes(':scenes:'))) {
    const scene = registry.get('scenes', key.split(':')[2]);
    for (const object of [...scene.objects, ...scene.portals]) {
      if (object.to) registry.get('scenes', object.to);
      for (const id of object.enemies || []) registry.get('enemies', id);
      if (object.item && !['food','ore','energy','renown'].includes(object.item)) registry.get('items', object.item);
    }
  }
}
