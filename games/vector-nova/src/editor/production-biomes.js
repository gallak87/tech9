import { staticBiomeDescriptor } from './static-biomes.js';
import { proceduralBiomeDescriptor } from './procedural-biomes.js';
import { livingBiomeDescriptor } from './living-biomes.js';

/** Registry of static production scenery, independent of campaign routes and
 * active mechanics. Shatterline retains its version-3 adapter. */
export function productionBiomeDescriptor(id) {
  const descriptor =
    staticBiomeDescriptor(id) ??
    proceduralBiomeDescriptor(id) ??
    livingBiomeDescriptor(id);
  if (!descriptor) throw new Error('Missing production scenery for ' + id);
  return descriptor;
}
