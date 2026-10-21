// Names identify packages, not game slugs (web-2.5d-world includes a dot).
export const STARTING_POINTS = Object.freeze({
  'web-3d-world': {
    path: 'baselines/web-3d-world',
    kind: 'baseline',
    runtime: 'web',
    renderer: 'three',
  },
  'web-2.5d-world': {
    path: 'baselines/web-2.5d-world',
    kind: 'baseline',
    runtime: 'web',
    renderer: 'pixi',
  },
  'web-canvas2d': {
    path: 'scaffolds/web-canvas2d',
    kind: 'scaffold',
    runtime: 'web',
    renderer: 'canvas2d',
  },
  'web-pixi': {
    path: 'scaffolds/web-pixi',
    kind: 'scaffold',
    runtime: 'web',
    renderer: 'pixi',
  },
  'web-three': {
    path: 'scaffolds/web-three',
    kind: 'scaffold',
    runtime: 'web',
    renderer: 'three',
  },
});

export function startingPoint(name = 'web-3d-world') {
  if (typeof name !== 'string' || !Object.hasOwn(STARTING_POINTS, name))
    throw new Error(
      `Unknown starting point: ${name}. Choose ${Object.keys(STARTING_POINTS).join(', ')}. Native engines are not supported by this CLI.`,
    );
  return { name, ...STARTING_POINTS[name] };
}

export function moduleRequirements(module, packageJson, selected) {
  const requirements = module.requires;
  if (!requirements) return;
  for (const key of ['runtime', 'renderer']) {
    if (requirements[key] && requirements[key] !== packageJson.tech9?.[key])
      throw new Error(
        `Module ${module.id} requires ${key} ${requirements[key]}`,
      );
  }
  for (const id of requirements.modules ?? [])
    if (!selected.includes(id))
      throw new Error(`Module ${module.id} requires sibling module ${id}`);
  for (const [name, version] of Object.entries(requirements.dependencies ?? {}))
    if (packageJson.dependencies?.[name] !== version)
      throw new Error(
        `Module ${module.id} requires dependency ${name}@${version} in the owning package`,
      );
}

/** Check the owning package contract before copying any module bytes. */
export function packageModules(packageJson, registry, label = 'Package') {
  const config = packageJson.tech9;
  if (
    config?.runtime !== 'web' ||
    !['canvas2d', 'pixi', 'three'].includes(config?.renderer)
  )
    throw new Error(
      `${label} must declare tech9.runtime web and a supported tech9.renderer`,
    );
  const selected = config.modules;
  if (
    !Array.isArray(selected) ||
    selected.some((id) => typeof id !== 'string') ||
    new Set(selected).size !== selected.length
  )
    throw new Error(`${label} needs a unique tech9.modules list`);
  for (const id of selected) {
    const module = registry.modules.find((entry) => entry.id === id);
    if (!module) throw new Error(`Unknown module ${id} in ${label}`);
    moduleRequirements(module, packageJson, selected);
  }
  return selected;
}
