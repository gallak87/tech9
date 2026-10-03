import { writeFile } from 'node:fs/promises';
import { URL } from 'node:url';
import { log } from 'node:console';

// Bake the former shader hash at each lattice corner. Hardware interpolation
// and mipmaps replace its repeated per-pixel hashes without changing mapping.
const size = 64;
const fract = (value) => value - Math.floor(value);
const data = new Uint8Array(size ** 3);
for (let z = 0; z < size; z++) {
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let a = fract(x * 0.1031),
        b = fract(y * 0.1031),
        c = fract(z * 0.1031);
      const dot = a * (b + 33.33) + b * (c + 33.33) + c * (a + 33.33);
      a += dot;
      b += dot;
      c += dot;
      data[x + size * (y + size * z)] = Math.round(fract((a + b) * c) * 255);
    }
  }
}
const output = new URL(
  '../../../public/assets/levels/saffron/weathering-noise-v1.r8',
  import.meta.url,
);
await writeFile(output, data);
log(`Baked ${size}³ R8 weathering volume (${data.byteLength} bytes)`);
