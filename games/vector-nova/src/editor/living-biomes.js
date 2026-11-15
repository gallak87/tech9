import { nightweirBiomeDescriptor } from './nightweir-biome.js';
import { vesperBiomeDescriptor } from './vesper-biome.js';

export function livingBiomeDescriptor(id) {
  return id === 'nightweir'
    ? nightweirBiomeDescriptor
    : id === 'vesper-forest'
      ? vesperBiomeDescriptor
      : null;
}
