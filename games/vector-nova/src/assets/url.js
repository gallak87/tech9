// Public exports have one canonical URL in both root and subdirectory builds.
export function assetURL(path, base = import.meta.env?.BASE_URL ?? '/') {
  return `${base.replace(/\/?$/, '/')}${path.replace(/^\/+/, '')}`;
}
