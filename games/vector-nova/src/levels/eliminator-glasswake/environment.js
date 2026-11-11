import * as T from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { assetURL } from '../../assets/url.js';
import { createLifetime } from '../../core/lifecycle.js';
import { sweepGeometry, boxProfile } from '../../track/geometry.js';
import { finishIceMaterial } from '../glasswake/environment/materials.js';
import { consolidateIceParts } from '../glasswake/environment/consolidate.js';
import {
  createGlasswakePlacementPlan,
  createGlasswakeArchGeometry,
} from './scenery.js';
import { finishFracturePane, finishFractureStrata } from './finish.js';
import { createFractureSpatialIce } from './spatial-ice.js';

/** A new supported crystal circuit, independently composing the canonical ice
 * kit. It never constructs the original course's calving, weather or runtime. */
export async function createGlasswakeEliminatorEnvironment({
  track,
  road,
  view,
}) {
  const group = new T.Group(),
    lifetime = createLifetime();
  group.name = 'Glasswake Fracture / founded crystal canyon';
  const geometries = new Set(),
    materials = new Set(),
    hidden = [];
  let ice = null;
  lifetime.defer(() => ice?.dispose());
  lifetime.defer(() => {
    for (const geometry of geometries) geometry.dispose();
  });
  lifetime.defer(() => {
    for (const material of materials) material.dispose();
  });
  function dispose() {
    group.clear();
    for (const [object, visible] of hidden) object.visible = visible;
    lifetime.dispose();
  }
  try {
    const loaded = await Promise.allSettled([
      new GLTFLoader().loadAsync(
        assetURL('assets/levels/glasswake/glasswake-environment-v5.glb'),
      ),
      new T.TextureLoader().loadAsync(
        assetURL('assets/levels/glasswake/ice-surface-v1.png'),
      ),
      new GLTFLoader().loadAsync(
        assetURL('assets/levels/eliminator-glasswake/fault-massif.glb'),
      ),
      new GLTFLoader().loadAsync(
        assetURL('assets/levels/eliminator-glasswake/glacier-sector.glb'),
      ),
    ]);
    for (const index of [0, 2, 3])
      if (loaded[index].status === 'fulfilled') {
        const source = loaded[index].value.scene;
        source.traverse((object) => {
          if (!object.isMesh) return;
          geometries.add(object.geometry);
          for (const material of [object.material].flat())
            materials.add(material);
        });
        lifetime.defer(() => source.clear());
      }
    if (loaded[1].status === 'fulfilled') ice = loaded[1].value;
    const failed = loaded.find((result) => result.status === 'rejected');
    if (failed) throw failed.reason;
    if (!loaded[3].value.scene.getObjectByName('fracture_glacier_sector'))
      throw new Error(
        'Glasswake Fracture is missing its glacier-sector prototype',
      );
    ice.colorSpace = T.SRGBColorSpace;
    ice.wrapS = ice.wrapT = T.RepeatWrapping;
    ice.anisotropy = Math.min(
      4,
      view?.renderer?.capabilities.getMaxAnisotropy() ?? 4,
    );
    const sources = [
      loaded[0].value.scene,
      loaded[2].value.scene,
      loaded[3].value.scene,
    ];
    for (const source of sources) source.updateMatrixWorld(true);
    const composite = new T.MeshStandardMaterial({
      name: 'Glasswake Fracture / canonical layered glacial ice',
      color: '#ffffff',
      vertexColors: true,
      side: T.DoubleSide,
      envMapIntensity: 0.35,
    });
    materials.add(composite);
    finishFractureStrata(composite, ice);
    const clones = new Map(),
      templates = new Map();
    function materialFor(original) {
      if (!clones.has(original)) {
        const material = original.clone();
        material.side = T.DoubleSide;
        material.envMapIntensity = 0.35;
        finishIceMaterial(material, ice);
        materials.add(material);
        clones.set(original, material);
      }
      return clones.get(original);
    }
    for (const source of sources)
      for (const root of source.children) {
        const parts = [],
          bounds = new T.Box3();
        root.traverse((object) => {
          if (!object.isMesh) return;
          const geometry = object.geometry
            .clone()
            .applyMatrix4(object.matrixWorld);
          geometry.computeBoundingBox();
          geometries.add(geometry);
          bounds.union(geometry.boundingBox);
          parts.push({
            geometry,
            material: Array.isArray(object.material)
              ? object.material.map(materialFor)
              : materialFor(object.material),
          });
        });
        const consolidated = consolidateIceParts(parts, composite);
        if (consolidated.geometry) geometries.add(consolidated.geometry);
        templates.set(root.name, { parts: consolidated.parts, bounds });
      }
    const plan = createGlasswakePlacementPlan(track, templates);
    const archPieces = [];
    let spatial;
    try {
      for (const placement of plan.placements.filter(
        (item) => item.prototype === 'bridge_arch',
      ))
        for (const part of templates.get('bridge_arch').parts)
          archPieces.push({
            geometry: createGlasswakeArchGeometry(
              track,
              part.geometry,
              placement.distance,
            ),
            material: part.material,
          });
      // Four coarse world sectors cost less here than many small draws;
      // the authored world lies well inside one 16km cell on either axis.
      spatial = lifetime.own(
        createFractureSpatialIce(plan.placements, templates, archPieces, {
          cellSize: 16000,
        }),
      );
    } finally {
      for (const piece of archPieces) piece.geometry.dispose();
    }
    group.add(...spatial.meshes);
    const surface = road.materials.surface;
    const previousSurface = {
      name: surface.name,
      transparent: surface.transparent,
      opacity: surface.opacity,
      depthWrite: surface.depthWrite,
      roughness: surface.roughness,
      metalness: surface.metalness,
      onBeforeCompile: surface.onBeforeCompile,
      customProgramCacheKey: surface.customProgramCacheKey,
    };
    const previousColor = surface.color.clone();
    lifetime.defer(() => {
      Object.assign(surface, previousSurface);
      surface.color.copy(previousColor);
      surface.needsUpdate = true;
    });
    surface.name = 'Glasswake Fracture / clear cloudy crystal panes';
    surface.transparent = true;
    surface.opacity = 0.11;
    surface.depthWrite = false;
    surface.roughness = 0.36;
    surface.metalness = 0.035;
    surface.color.set('#b9d9e2');
    finishFracturePane(surface, ice, track.width);
    surface.needsUpdate = true;
    for (const material of [road.materials.edge, road.materials.guide].filter(
      Boolean,
    )) {
      const previous = {
        roughness: material.roughness,
        metalness: material.metalness,
      };
      const color = material.color.clone();
      lifetime.defer(() => {
        Object.assign(material, previous);
        material.color.copy(color);
      });
      material.roughness = 0.68;
      material.metalness = 0.1;
      material.color.multiplyScalar(0.84);
    }
    // Replace this private road's visible backing with open load ribs. The
    // supported driving triangles, sampler, width and containment rails stay.
    road.group.traverse((object) => {
      if (object.name === 'Closed underside carrier') {
        hidden.push([object, object.visible]);
        object.visible = false;
      }
    });
    for (const lateral of [-track.width * 0.36, 0, track.width * 0.36]) {
      const geometry = lifetime.own(
        sweepGeometry(track, boxProfile(lateral, -1.8, 1.1, 3.2), {
          start: 0,
          end: track.length,
          step: 4,
          uvScale: 4,
        }),
      );
      const mesh = new T.Mesh(geometry, road.materials.structure);
      mesh.name = 'Fracture / continuous cobalt load rib beneath clear panes';
      mesh.receiveShadow = true;
      group.add(mesh);
    }
    const sillMaterial = new T.MeshStandardMaterial({
      name: 'Glasswake Fracture / compact cobalt transverse load sills',
      color: '#35647f',
      envMapIntensity: 0.35,
    });
    finishIceMaterial(sillMaterial, ice);
    materials.add(sillMaterial);
    const sillGeometry = lifetime.own(
      new T.BoxGeometry(track.width + 1, 1.2, 1.8),
    );
    const sillCount = Math.ceil(track.length / 18);
    const sills = lifetime.own(
      new T.InstancedMesh(sillGeometry, sillMaterial, sillCount),
    );
    sills.name = 'Fracture / seated transverse crystal sills';
    for (let i = 0; i < sillCount; i++) {
      const frame = track.sample((track.length * i) / sillCount);
      sills.setMatrixAt(
        i,
        new T.Matrix4().compose(
          frame.position.clone().addScaledVector(frame.up, -3.4),
          frame.quaternion,
          new T.Vector3(1, 1, 1),
        ),
      );
    }
    sills.computeBoundingSphere();
    group.add(sills);
    group.userData.fracture = {
      assets: [
        'assets/levels/glasswake/glasswake-environment-v5.glb',
        'assets/levels/eliminator-glasswake/fault-massif.glb',
        'assets/levels/eliminator-glasswake/glacier-sector.glb',
      ],
      placements: plan.placements.map(
        ({ prototype, matrix, kind, distance }) => ({
          prototype,
          matrix: matrix.toArray(),
          kind,
          distance,
        }),
      ),
      routeClearance: 58,
      omitted: plan.omitted,
      supportIntervals: 116,
      staticWorld: true,
      spatial: spatial.report,
      massifs: plan.massif.stations.map((site) => ({
        id: site.id,
        matrix: site.placement.matrix.toArray(),
        shoulder: site.shoulder.matrix.toArray(),
      })),
    };
    return {
      group,
      setReflection(texture) {
        for (const material of materials) {
          material.envMap = texture;
          material.needsUpdate = true;
        }
      },
      dispose,
    };
  } catch (error) {
    dispose();
    throw error;
  }
}
