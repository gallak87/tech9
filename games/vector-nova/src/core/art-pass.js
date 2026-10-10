// World-space camera links for repeatable art inspection, independent of race state.
export const artViewParameters = ['cam', 'look', 'fov'];
export const runtimeEntryParameters = ['review', 'test', 'capture', 'case'];

export function validateArtView({ position, target, fov } = {}) {
  if (position !== undefined || target !== undefined) {
    for (const [name, vector] of [
      ['cam', position],
      ['look', target],
    ]) {
      if (
        !Array.isArray(vector) ||
        vector.length !== 3 ||
        vector.some((n) => !Number.isFinite(n) || Math.abs(n) > 1e6)
      )
        throw new Error(
          `Art view: ${name} needs three finite world coordinates (x,y,z). Supply both cam and look.`,
        );
    }
    if (Math.hypot(...position.map((n, i) => n - target[i])) < 0.001)
      throw new Error('Art view: cam and look must be different points.');
  }
  if (fov !== undefined && (!Number.isFinite(fov) || fov < 10 || fov > 120))
    throw new Error('Art view: fov must be between 10 and 120 degrees.');
  return { position, target, fov };
}

export function readArtView(parameters) {
  const vector = (name) =>
    parameters.has(name)
      ? parameters
          .get(name)
          .split(',')
          .map((n) => (n.trim() ? Number(n) : NaN))
      : undefined;
  return validateArtView({
    position: vector('cam'),
    target: vector('look'),
    fov: parameters.has('fov') ? Number(parameters.get('fov')) : undefined,
  });
}

export function artPassURL(base, level, view) {
  const { position, target, fov } = validateArtView(view);
  const url = new URL(base);
  for (const key of [...runtimeEntryParameters, ...artViewParameters])
    url.searchParams.delete(key);
  url.searchParams.set('artPass', '1');
  url.searchParams.set('level', level);
  url.searchParams.set('music', '0');
  const tuple = (values) => values.map((n) => +n.toFixed(4)).join(',');
  if (position) {
    url.searchParams.set('cam', tuple(position));
    url.searchParams.set('look', tuple(target));
  }
  if (fov !== undefined) url.searchParams.set('fov', String(+fov.toFixed(4)));
  return url.href;
}
