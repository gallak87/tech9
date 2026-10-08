import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { Buffer } from 'node:buffer';
import { URL } from 'node:url';
import { log } from 'node:console';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

// Lossless positions/indices from the same exported source used in production.
// No graphics/DOM dependency is required when loading the baked CPU kit.
const source = new URL(
  '../../../public/assets/levels/vesper/vesper-canopy.glb',
  import.meta.url,
);
const bytes = await readFile(source);
// Collision needs vertices only; omit image/material requests in this CPU bake.
const jsonLength = bytes.readUInt32LE(12);
const document = JSON.parse(bytes.subarray(20, 20 + jsonLength).toString());
for (const mesh of document.meshes)
  for (const primitive of mesh.primitives) delete primitive.material;
delete document.materials;
delete document.textures;
delete document.images;
const json = Buffer.from(JSON.stringify(document));
const padded = Buffer.concat([
  json,
  Buffer.alloc((4 - (json.length % 4)) % 4, 32),
]);
const header = Buffer.from(bytes.subarray(0, 20));
const binary = bytes.subarray(20 + jsonLength);
header.writeUInt32LE(20 + padded.length + binary.length, 8);
header.writeUInt32LE(padded.length, 12);
const geometryOnly = Buffer.concat([header, padded, binary]);
const gltf = await new GLTFLoader().parseAsync(
  geometryOnly.buffer.slice(
    geometryOnly.byteOffset,
    geometryOnly.byteOffset + geometryOnly.byteLength,
  ),
  '',
);
gltf.scene.updateMatrixWorld(true);
const modules = {};
for (const name of ['landing_branch']) {
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
  new URL('../../../src/levels/vesper/collision-kit.json', import.meta.url),
  JSON.stringify(kit) + '\n',
);
log('Baked Vesper landing bough triangles from', kit.sourceHash);
