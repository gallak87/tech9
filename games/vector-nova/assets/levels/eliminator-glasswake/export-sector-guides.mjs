import { readFile, writeFile, mkdir, rename } from 'node:fs/promises';
import { resolve, dirname, relative } from 'node:path';
import { fileURLToPath, URL } from 'node:url';
import process from 'node:process';
import console from 'node:console';
import { createHash } from 'node:crypto';
import * as T from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { createGlasswakeEliminatorTrack } from '../../../src/levels/eliminator-glasswake/track/model.js';
import { createEliminatorRoad } from '../../../src/events/eliminator-road.js';
import {
  createGlasswakePlacementPlan,
  createGlasswakeArchGeometry,
} from '../../../src/levels/eliminator-glasswake/scenery.js';

// Exact editor inputs from the production owners. The large output belongs at
// an explicit temporary path, never in the runtime bundle or source control.
const root = fileURLToPath(new URL('../../../', import.meta.url));
if (process.argv.length !== 3)
  throw new Error(
    'Usage: node assets/levels/eliminator-glasswake/export-sector-guides.mjs <temporary-output.json>',
  );
const output = resolve(process.argv[2]);
const sourceFiles = [
  'src/levels/eliminator-glasswake/track/model.js',
  'src/events/eliminator-track.js',
  'src/events/eliminator-road.js',
  'src/levels/eliminator-glasswake/scenery.js',
  'src/levels/eliminator-glasswake/massif.js',
  'public/assets/levels/glasswake/glasswake-environment-v5.glb',
  'public/assets/levels/eliminator-glasswake/fault-massif.glb',
  'assets/levels/eliminator-glasswake/authoring-views.json',
  'assets/levels/glasswake/scene-reference.png',
  'assets/levels/glasswake/scene-prompt.txt',
  'assets/levels/eliminator-glasswake/export-sector-guides.mjs',
];
const inputs = await Promise.all(
  sourceFiles.map(async (file) => ({
    file,
    sha256: createHash('sha256')
      .update(await readFile(resolve(root, file)))
      .digest('hex'),
  })),
);
const track = createGlasswakeEliminatorTrack();
const road = createEliminatorRoad({ track, shape: true });
const scenes = [],
  owned = new Set(),
  templates = new Map();
const data = (name, geometry, material = '') => ({
  name,
  material,
  positions: Array.from(geometry.attributes.position.array),
  normals: Array.from(geometry.attributes.normal.array),
  indices: geometry.index
    ? Array.from(geometry.index.array)
    : Array.from({ length: geometry.attributes.position.count }, (_, i) => i),
});
try {
  for (const file of sourceFiles.slice(5, 7)) {
    const bytes = await readFile(resolve(root, file));
    const { scene } = await new GLTFLoader().parseAsync(
      bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
      '',
    );
    scenes.push(scene);
    scene.updateMatrixWorld(true);
    for (const object of scene.children) {
      const parts = [],
        bounds = new T.Box3();
      object.traverse((mesh) => {
        if (!mesh.isMesh) return;
        const geometry = mesh.geometry.clone().applyMatrix4(mesh.matrixWorld);
        owned.add(geometry);
        geometry.computeBoundingBox();
        bounds.union(geometry.boundingBox);
        parts.push({ geometry, material: mesh.material });
      });
      if (parts.length) templates.set(object.name, { parts, bounds });
    }
  }
  const plan = createGlasswakePlacementPlan(track, templates);
  const station = plan.massif.stations.find(
    (site) => site.id === 'crown-fault',
  );
  if (!station)
    throw new Error('Missing production crown-fault authoring frame');
  const region = station.placement.bounds.clone().expandByScalar(160);
  const host = {
    id: station.id,
    prototype: station.placement.prototype,
    matrix: station.placement.matrix.toArray(),
    localBounds: {
      min: templates.get(station.placement.prototype).bounds.min.toArray(),
      max: templates.get(station.placement.prototype).bounds.max.toArray(),
    },
    worldParts: templates
      .get(station.placement.prototype)
      .parts.map((part, i) => {
        const geometry = part.geometry
          .clone()
          .applyMatrix4(station.placement.matrix);
        owned.add(geometry);
        return data(
          'crown-fault / baseline host / ' + i,
          geometry,
          part.material.name,
        );
      }),
  };
  const context = [];
  for (const item of plan.placements) {
    if (
      item === station.placement ||
      item.kind === 'cavern' ||
      !item.bounds.intersectsBox(region)
    )
      continue;
    for (const [i, part] of templates.get(item.prototype).parts.entries()) {
      let geometry;
      if (item.prototype === 'bridge_arch') {
        // Match the renderer's consolidated ice triangle topology before its
        // warp recomputes normals; special metal/emissive primitives stay separate.
        const ice =
          part.material.isMeshStandardMaterial &&
          !/Titanium|Warm navigation|Deep cavity/.test(part.material.name);
        const source =
          ice && part.geometry.index
            ? part.geometry.toNonIndexed()
            : part.geometry;
        if (source !== part.geometry) owned.add(source);
        geometry = createGlasswakeArchGeometry(track, source, item.distance);
      } else geometry = part.geometry.clone().applyMatrix4(item.matrix);
      owned.add(geometry);
      context.push(
        data(
          item.kind + ' / ' + item.prototype + ' / ' + i,
          geometry,
          part.material.name,
        ),
      );
    }
  }
  const drivingMeshes = [];
  road.group.updateMatrixWorld(true);
  road.group.traverse((mesh) => {
    if (!mesh.isMesh || !mesh.userData.drivingSurface) return;
    const geometry = mesh.geometry.clone().applyMatrix4(mesh.matrixWorld);
    owned.add(geometry);
    drivingMeshes.push(data(mesh.name, geometry));
  });
  const frames = [];
  for (let s = 0; s <= track.length; s += 4) {
    const f = track.sample(s);
    frames.push({
      distance: s,
      position: f.position.toArray(),
      right: f.right.toArray(),
      up: f.up.toArray(),
      tangent: f.tangent.toArray(),
      quaternion: f.quaternion.toArray(),
    });
  }
  const cameras = JSON.parse(
    await readFile(resolve(root, sourceFiles[7]), 'utf8'),
  );
  const geometry = { host, context, drivingMeshes, frames };
  const guide = {
    format: 'vector-nova-glacier-sector-authoring-v1',
    coordinates:
      'Actual game-world metres, +Y up, +Z forward; quaternions [x,y,z,w]; matrices column-major',
    authoring:
      'Edit the replacement in native host coordinates under the retained production parent matrix; world references and cameras are editor-only. Export only the new native prototype with identity root.',
    level: 'eliminator-glasswake',
    track: {
      id: track.id,
      length: track.length,
      width: track.width,
      geometryVersion: track.geometryVersion,
    },
    protectedVolume: {
      min: [-42, -12, -16],
      max: [42, 90, 16],
      note: 'Retained broad banked road/camera clearance, overlapping every four route metres; never relax this volume to fit artwork',
    },
    rebuildHelper:
      'assets/levels/eliminator-glasswake/export-sector-guides.mjs',
    inputs,
    geometry,
    cameras,
    semanticGeometrySha256: createHash('sha256')
      .update(JSON.stringify(geometry))
      .digest('hex'),
    semanticViewsSha256: createHash('sha256')
      .update(JSON.stringify(cameras))
      .digest('hex'),
  };
  await mkdir(dirname(output), { recursive: true });
  const temporary = output + '.tmp';
  await writeFile(temporary, JSON.stringify(guide));
  await rename(temporary, output);
  console.log(
    JSON.stringify({
      output: relative(root, output),
      bytes: (await readFile(output)).byteLength,
      frames: frames.length,
      roadMeshes: drivingMeshes.length,
      contextParts: context.length,
      parent: host.matrix,
      semanticGeometrySha256: guide.semanticGeometrySha256,
    }),
  );
} finally {
  road.dispose();
  for (const geometry of owned) geometry.dispose();
  for (const scene of scenes)
    scene.traverse((mesh) => {
      mesh.geometry?.dispose();
      for (const material of [mesh.material].flat().filter(Boolean))
        material.dispose();
    });
}
