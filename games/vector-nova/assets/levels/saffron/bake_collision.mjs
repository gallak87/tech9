import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { Buffer } from 'node:buffer';
import { URL } from 'node:url';
import { log } from 'node:console';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

// Lossless positions/indices from the same exported source used in production.
// No graphics/DOM dependency is required when loading the baked CPU kit.
const source = new URL(
  '../../../public/assets/levels/saffron/leviathan-kit.glb',
  import.meta.url,
);
const bytes = await readFile(source);
const gltf = await new GLTFLoader().parseAsync(
  bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
  '',
);
gltf.scene.updateMatrixWorld(true);
const modules = {};
for (const name of [
  'vertebra',
  'vertebra_1',
  'vertebra_2',
  'rib',
  'rib_1',
  'rib_2',
]) {
  const root = gltf.scene.getObjectByName(name);
  const inverse = root.matrixWorld.clone().invert();
  const parts = [];
  root.traverse((object) => {
    if (!object.isMesh) return;
    const geometry = object.geometry
      .clone()
      .applyMatrix4(inverse.clone().multiply(object.matrixWorld));
    const positions = new Float32Array(geometry.attributes.position.array);
    const indices = new Uint32Array(
      geometry.index?.array ??
        Array.from({ length: geometry.attributes.position.count }, (_, i) => i),
    );
    parts.push({
      positions: Buffer.from(positions.buffer).toString('base64'),
      indices: Buffer.from(indices.buffer).toString('base64'),
    });
    geometry.dispose();
  });
  modules[name] = parts;
}
const kit = {
  sourceHash: createHash('sha256').update(bytes).digest('hex'),
  modules,
};
await writeFile(
  new URL('../../../src/levels/saffron/collision-kit.json', import.meta.url),
  JSON.stringify(kit) + '\n',
);
log('Baked Saffron physical fossil triangles from', kit.sourceHash);
