import { createCatalog } from './contract.js';

// Only small, asset-free metadata is eager. Each world's implementation is lazy.
export function discoverLevels() {
  return createCatalog(
    import.meta.glob('./*/metadata.js', { eager: true, import: 'default' }),
    import.meta.glob('./*/index.js'),
  );
}
