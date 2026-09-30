const slugPattern = /^[a-z][a-z0-9-]*$/;

export function createCatalog(metadataModules, loaders) {
  const entries = new Map();
  for (const [path, metadata] of Object.entries(metadataModules)) {
    const slug = /^\.\/([^/]+)\/metadata\.js$/.exec(path)?.[1];
    if (
      !slugPattern.test(slug || '') ||
      metadata?.id !== slug ||
      typeof metadata.name !== 'string' ||
      !metadata.name.trim() ||
      !Number.isFinite(metadata.order) ||
      typeof metadata.review !== 'boolean' ||
      typeof metadata.shape !== 'boolean' ||
      !metadata.ui ||
      !Array.isArray(metadata.ui.heading) ||
      metadata.ui.heading.length !== 2 ||
      !metadata.ui.heading.every(
        (line) => typeof line === 'string' && line.trim(),
      )
    )
      throw new Error(`Invalid circuit metadata: ${path}`);
    for (const field of [
      'edition',
      'subtitle',
      'eyebrow',
      'intro',
      'detail',
      'start',
      'tag',
      'tagDetail',
    ])
      if (typeof metadata.ui[field] !== 'string')
        throw new Error(`Invalid circuit text: ${slug}.${field}`);
    if (entries.has(metadata.id))
      throw new Error(`Duplicate circuit: ${metadata.id}`);
    const load = loaders[`./${slug}/index.js`];
    if (typeof load !== 'function')
      throw new Error(`Missing circuit implementation: ${slug}`);
    entries.set(slug, { metadata, load });
  }
  for (const path of Object.keys(loaders)) {
    const slug = /^\.\/([^/]+)\/index\.js$/.exec(path)?.[1];
    if (!entries.has(slug))
      throw new Error(`Missing circuit metadata: ${path}`);
  }
  if (!entries.has('halcyon'))
    throw new Error('Missing default circuit: halcyon');
  return {
    list: [...entries.values()]
      .map((entry) => entry.metadata)
      .sort((a, b) => a.order - b.order || a.id.localeCompare(b.id)),
    async load(requested, { review, features } = {}) {
      const id = requested || 'halcyon';
      const entry = entries.get(id);
      if (!entry)
        throw new Error(
          `Unknown circuit: ${id}. Choose a circuit from the paddock.`,
        );
      const shape = review === 'shape';
      if (shape && !entry.metadata.shape)
        throw new Error(`${entry.metadata.name} has no shape preview.`);
      const module = await entry.load();
      if (typeof module.default !== 'function')
        throw new Error(`Invalid circuit factory: ${id}`);
      const definition = await module.default({ shape, features });
      for (const name of [
        'createTrack',
        'createRoad',
        'createEnvironment',
        'createBackdrop',
      ])
        if (typeof definition?.[name] !== 'function')
          throw new Error(`${id} is missing ${name}`);
      for (const name of ['createRuntime', 'createOverlay'])
        if (
          definition[name] !== undefined &&
          typeof definition[name] !== 'function'
        )
          throw new Error(`Invalid ${id}.${name}`);
      if (typeof definition.version !== 'string' || !definition.version)
        throw new Error(`${id} is missing a version`);
      return { metadata: entry.metadata, definition, shape };
    },
  };
}

export function validateTrack(track) {
  if (
    !track?.id ||
    !track.name ||
    !(track.length > 0) ||
    !Number.isFinite(track.length) ||
    !(track.width > 0) ||
    !Number.isFinite(track.width) ||
    typeof track.sample !== 'function' ||
    !Array.isArray(track.sections) ||
    !track.sections.length ||
    !Array.isArray(track.checkpoints) ||
    !track.checkpoints.length ||
    !track.scenarios
  )
    throw new Error(
      'Invalid circuit track: identity, dimensions, sections, checkpoints and scenarios are required',
    );
  for (const distance of [0, track.length / 2, track.length]) {
    const frame = track.sample(distance);
    for (const key of ['position', 'tangent', 'right', 'up'])
      if (
        !frame?.[key] ||
        !['x', 'y', 'z'].every((axis) => Number.isFinite(frame[key][axis]))
      )
        throw new Error(`Invalid circuit frame: ${key} at ${distance}`);
    if (
      !frame.quaternion ||
      !['x', 'y', 'z', 'w'].every((axis) =>
        Number.isFinite(frame.quaternion[axis]),
      ) ||
      !Number.isFinite(frame.curvature) ||
      !Number.isFinite(frame.bank)
    )
      throw new Error(`Invalid circuit orientation at ${distance}`);
  }
  return track;
}

export function circuitURL(currentURL, id) {
  if (!slugPattern.test(id)) throw new Error('Invalid circuit id');
  const url = new URL(currentURL);
  url.search = '';
  url.hash = '';
  if (id !== 'halcyon') url.searchParams.set('level', id);
  return url;
}
