import * as T from 'three';
import { createLifetime } from '../../../core/lifecycle.js';
import { createHabitatTerrain } from './habitat.js';
import { createHabitatStructure } from './structure.js';
import { createHabitatDistricts } from './districts.js';
import { createHabitatQuays } from './quays.js';
import { createOrielStoneMaps } from './stone-maps.js';
import { createPromenadeTerraces } from './promenades.js';
import { loadOrielGround } from './ground-loader.js';
import { createDistrictPaths } from './paths.js';
import { createGardenQuarter } from './garden-quarter.js';
import { createShoreQuarter } from './shore-quarter.js';
import { createGardenSector } from './garden-sector.js';

export async function createOrielEnvironment({
  track,
  road,
  view,
  shape = false,
} = {}) {
  const lifetime = createLifetime();
  const group = new T.Group();
  group.name = 'Oriel / the inhabited inward world';
  lifetime.defer(() => group.clear());
  try {
    if (!shape) {
      const own = (resource) => lifetime.own(resource);
      const ground = lifetime.own(await loadOrielGround());
      const terrain = createHabitatTerrain(own, ground.geometries);
      const structure = createHabitatStructure(own, track);
      const quays = createHabitatQuays(own);
      const stoneMaps = view?.renderer
        ? await createOrielStoneMaps(view.renderer, lifetime)
        : null;
      const quarter = await createGardenQuarter({ track, lifetime, stoneMaps });
      const shore = await createShoreQuarter({ track, lifetime, stoneMaps });
      const sector = await createGardenSector({
        track,
        lifetime,
        stoneMaps,
        terrainMaterial: terrain.materials[0],
      });
      const authoredDistrict = {
        reservations: [
          quarter.reservation,
          shore.reservation,
          sector.reservation,
        ],
        plantingAnchors: [
          ...quarter.plantingAnchors,
          ...shore.plantingAnchors,
          ...sector.plantingAnchors,
        ],
        civicPlacements: sector.civicPlacements,
      };
      const promenades = createPromenadeTerraces(
        track,
        own,
        stoneMaps,
        authoredDistrict,
      );
      const districts = await createHabitatDistricts(
        track,
        lifetime,
        stoneMaps,
        promenades.fronts,
        promenades.trees,
        authoredDistrict,
      );
      const paths = createDistrictPaths(districts.parcels, {
        track,
        own,
        reservations: authoredDistrict.reservations,
      });
      road?.group.traverse((object) => {
        if (
          object.isMesh &&
          object.material.name ===
            'Oriel / satin mineral-composite running slab'
        ) {
          stoneMaps?.apply(object.material);
          stoneMaps?.coordinates(object.geometry);
          const material = object.material,
            base = material.onBeforeCompile,
            key = material.customProgramCacheKey();
          material.onBeforeCompile = (shader, renderer) => {
            base(shader, renderer);
            shader.fragmentShader = shader.fragmentShader.replace(
              '#include <roughnessmap_fragment>',
              '#include <roughnessmap_fragment>\nroughnessFactor=max(roughnessFactor,.62);',
            );
          };
          material.customProgramCacheKey = () =>
            key + ':oriel-road-satin-minimum-v1';
        }
      });
      group.add(
        terrain.group,
        structure.group,
        quays.group,
        promenades.group,
        districts.group,
        paths.group,
        quarter.group,
        shore.group,
        sector.group,
      );
      return {
        group,
        update({ state, ship, camera, mode }) {
          if (!view?.sun) return;
          const target =
            mode === 'fly'
              ? camera.position
              : (ship?.group.position ?? track.sample(state.distance).position);
          // A fixed world-space sun would light the ceiling from below. This
          // level's real axial luminaire supplies the same raking key around
          // the entire inward-facing habitat, including the shadow camera.
          view.sun.position.set(0, 1000, target.z - 480);
          view.sun.target.position.copy(target);
          view.sun.shadow.camera.up.set(0, 0, 1);
          view.sun.target.updateMatrixWorld();
        },
        setReflection(texture) {
          for (const m of [
            ...terrain.materials,
            ...structure.materials,
            ...quays.materials,
            ...promenades.materials,
            ...districts.materials,
            ...paths.materials,
            ...quarter.materials,
            ...shore.materials,
            ...sector.materials,
          ]) {
            m.envMap = texture;
            m.envMapIntensity = 0.18;
            m.needsUpdate = true;
            if (m.userData.orielRadialBounce)
              m.userData.orielRadialBounce.value = 0.2;
          }
          terrain.water.envMapIntensity = 0.24;
        },
        dispose: () => lifetime.dispose(),
      };
    }
    return { group, dispose: () => lifetime.dispose() };
  } catch (error) {
    lifetime.dispose();
    throw error;
  }
}
