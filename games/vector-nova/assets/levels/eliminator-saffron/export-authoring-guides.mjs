import { readFile, writeFile, mkdir, rename } from 'node:fs/promises';
import { resolve, dirname, relative } from 'node:path';
import { fileURLToPath, URL } from 'node:url';
import process from 'node:process';
import console from 'node:console';
import { createHash } from 'node:crypto';
import * as T from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { createSaffronEliminatorTrack } from '../../../src/levels/eliminator-saffron/track/model.js';
import { createEliminatorRoad } from '../../../src/events/eliminator-road.js';
import {
  createOssuaryDunes,
  createOssuaryPassageGeometry,
  OSSUARY_PASSAGES,
} from '../../../src/levels/eliminator-saffron/scenery.js';
import { createOssuarySceneryPlan } from '../../../src/levels/eliminator-saffron/scenery.js';
import {
  createOssuaryBuriedBeds,
  createOssuaryGalleryScarpGeometry,
} from '../../../src/levels/eliminator-saffron/gallery.js';

// Rebuild exact editor references from their source owners. The large mesh
// dump is temporary input to Blender; it is never shipped or checked in.
const root = fileURLToPath(new URL('../../../', import.meta.url));
const output = process.argv[2];
if (!output || process.argv.length !== 3)
  throw new Error(
    'Usage: node assets/levels/eliminator-saffron/export-authoring-guides.mjs <temporary-output.json>',
  );
const path = resolve(output);
const sources = [
  'src/levels/eliminator-saffron/track/model.js',
  'src/events/eliminator-track.js',
  'src/events/eliminator-road.js',
  'src/levels/eliminator-saffron/scenery.js',
  'src/levels/eliminator-saffron/gallery.js',
  'public/assets/levels/saffron/leviathan-kit.glb',
  'assets/levels/eliminator-saffron/authoring-views.json',
  'assets/levels/saffron/scene-reference.png',
  'assets/levels/saffron/PROVENANCE.md',
];
const inputHashes = await Promise.all(
  sources.map(async (file) => ({
    file,
    sha256: createHash('sha256')
      .update(await readFile(resolve(root, file)))
      .digest('hex'),
  })),
);
const track = createSaffronEliminatorTrack();
const dunes = createOssuaryDunes(track);
const road = createEliminatorRoad({ track, shape: true });
const scenes = [];
const owned = new Set();
function meshData(name, geometry, material = '') {
  const positions = geometry.attributes.position;
  return {
    name,
    material,
    positions: Array.from(positions.array),
    indices: geometry.index
      ? Array.from(geometry.index.array)
      : Array.from({ length: positions.count }, (_, i) => i),
    ...(geometry.attributes.color
      ? {
          colors: Array.from(geometry.attributes.color.array),
          colorSize: geometry.attributes.color.itemSize,
        }
      : {}),
  };
}
try {
  const fossils = [];
  for (const [file, name] of [
    ['public/assets/levels/saffron/leviathan-kit.glb', 'skull'],
  ]) {
    const bytes = await readFile(resolve(root, file));
    const { scene } = await new GLTFLoader().parseAsync(
      bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
      '',
    );
    scenes.push(scene);
    scene.updateMatrixWorld(true);
    const source = scene.getObjectByName(name);
    if (!source) throw new Error(`Missing authoring reference: ${name}`);
    const inverse = source.matrixWorld.clone().invert();
    const passage = OSSUARY_PASSAGES.find((item) => item.prototype === name);
    source.traverse((object) => {
      if (!object.isMesh) return;
      const local = object.geometry
        .clone()
        .applyMatrix4(inverse.clone().multiply(object.matrixWorld));
      const fitted = createOssuaryPassageGeometry(
        track,
        local,
        passage.fraction * track.length,
        passage.scale,
        dunes,
      );
      owned.add(local);
      owned.add(fitted);
      fossils.push(
        meshData(`${name}/${object.name}`, fitted, object.material?.name),
      );
    });
  }
  const roadMeshes = [];
  road.group.updateMatrixWorld(true);
  road.group.traverse((object) => {
    if (!object.isMesh || !object.userData.drivingSurface) return;
    const geometry = object.geometry.clone().applyMatrix4(object.matrixWorld);
    owned.add(geometry);
    roadMeshes.push(meshData(object.name, geometry));
  });
  const templates = new Map();
  function template(name) {
    if (templates.has(name)) return templates.get(name);
    const source = scenes
      .map((scene) => scene.getObjectByName(name))
      .find(Boolean);
    if (!source) throw new Error(`Missing contextual fossil: ${name}`);
    const inverse = source.matrixWorld.clone().invert(),
      parts = [],
      bounds = new T.Box3();
    source.traverse((object) => {
      if (!object.isMesh) return;
      const geometry = object.geometry
        .clone()
        .applyMatrix4(inverse.clone().multiply(object.matrixWorld));
      geometry.computeBoundingBox();
      owned.add(geometry);
      bounds.union(geometry.boundingBox);
      parts.push({ geometry, material: object.material });
    });
    const result = { parts, bounds };
    templates.set(name, result);
    return result;
  }
  for (const name of [
    'scapula',
    'outcrop',
    'outcrop_1',
    'rib',
    'rib_1',
    'rib_2',
    'vertebra',
    'vertebra_1',
    'vertebra_2',
  ])
    template(name);
  const context = [];
  const plan = createOssuarySceneryPlan(track, templates, dunes);
  const beds = createOssuaryBuriedBeds(track, templates, dunes);
  for (const item of [
    ...plan.placements,
    ...beds.flatMap((bed) => bed.anatomy),
  ]) {
    if (item.fraction < 0.25 || item.fraction > 0.45) continue;
    for (const [index, part] of template(item.prototype).parts.entries()) {
      const geometry = part.geometry.clone().applyMatrix4(item.matrix);
      owned.add(geometry);
      context.push({
        ...meshData(
          `${item.prototype}/${index}`,
          geometry,
          part.material?.name,
        ),
        fraction: item.fraction,
      });
    }
  }
  for (const passage of OSSUARY_PASSAGES) {
    if (
      passage.prototype === 'skull' ||
      passage.fraction < 0.22 ||
      passage.fraction > 0.46
    )
      continue;
    for (const [index, part] of template(passage.prototype).parts.entries()) {
      const geometry = createOssuaryPassageGeometry(
        track,
        part.geometry,
        passage.fraction * track.length,
        passage.scale,
        dunes,
      );
      owned.add(geometry);
      context.push({
        ...meshData(
          `${passage.prototype}/fitted/${index}`,
          geometry,
          part.material?.name,
        ),
        fraction: passage.fraction,
      });
    }
  }
  for (const bed of beds) {
    if (
      !bed.anatomy.some(
        (part) => part.fraction >= 0.25 && part.fraction <= 0.45,
      )
    )
      continue;
    const geometry = createOssuaryGalleryScarpGeometry(
      bed.sediment.family,
    ).applyMatrix4(bed.sediment.matrix);
    owned.add(geometry);
    context.push(meshData(`sediment/${bed.name}`, geometry));
  }
  const step = 2;
  const frames = Array.from(
    { length: Math.ceil(track.length / step) + 1 },
    (_, i) => {
      const s = Math.min(i * step, track.length),
        frame = track.sample(s);
      return {
        s,
        position: frame.position.toArray(),
        right: frame.right.toArray(),
        up: frame.up.toArray(),
        tangent: frame.tangent.toArray(),
        quaternion: frame.quaternion.toArray(),
      };
    },
  );
  const cameras = JSON.parse(
    await readFile(new URL('./authoring-views.json', import.meta.url), 'utf8'),
  );
  const guide = {
    version: 1,
    purpose:
      'Temporary exact source references for the course-private cranio-thoracic Blender assembly. These meshes are editor-only; none are additional runtime driving geometry.',
    coordinates: 'Game metres, +Y up, +Z forward; quaternion [x,y,z,w].',
    inputs: inputHashes,
    track: {
      id: track.id,
      length: track.length,
      width: track.width,
      closed: track.closed,
      frames,
    },
    protectedEnvelope: {
      min: [-29, 1, -8],
      max: [29, 40, 8],
      frame:
        'Each sampled road quaternion/position; verify all-route actual triangle clearance separately.',
    },
    target: { start: track.length * 0.29, end: track.length * 0.39 },
    cameras,
    road: roadMeshes,
    terrain: {
      ...meshData('Exact rendered Ossuary dune mantle', dunes.geometry),
      sampling:
        'Row-major +Z then +X; exact rendered triangles (a,c,b)/(b,c,d), selected by u+v<=1. For contact use these actual triangles, not a bilinear height approximation.',
    },
    fossils,
    context,
  };
  await mkdir(dirname(path), { recursive: true });
  const temporary = `${path}.tmp-${process.pid}`;
  await writeFile(temporary, JSON.stringify(guide));
  await rename(temporary, path);
  console.log(
    `Wrote ${relative(root, path)}: ${frames.length} native road frames, ${fossils.length} fitted skull parts, ${roadMeshes.length} real running meshes and exact dune triangles.`,
  );
} finally {
  road.dispose();
  dunes.geometry.dispose();
  for (const scene of scenes)
    scene.traverse((object) => {
      if (object.geometry) owned.add(object.geometry);
      for (const material of [object.material].flat().filter(Boolean))
        owned.add(material);
    });
  for (const resource of owned) resource.dispose();
}
