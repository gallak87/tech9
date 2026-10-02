import { Box3 } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { resourcesFor } from './index.js';

// Rival meshes serve inspection and racing. Circuit race models assign their
// handling profiles separately from the player-selectable fleet catalog.
export const RIVAL_SHIPS = Object.freeze([
  Object.freeze({
    id: 'rook',
    name: 'Rook',
    role: 'Wedge',
    description:
      'A low production racer with replaceable armour and a compact, enclosed chassis.',
    design: 'Clipped wedge / blunt shovel nose',
    propulsion: 'Paired rectangular ion outlets',
  }),
  Object.freeze({
    id: 'latch',
    name: 'Latch',
    role: 'Open frame',
    description:
      'A narrow cockpit tub and exposed machinery. Straight spars carry two serviceable turbine pods.',
    design: 'Open frame / straight stabilisers',
    propulsion: 'Exposed twin ion turbines',
  }),
  Object.freeze({
    id: 'mule',
    name: 'Mule',
    role: 'Workhorse',
    description:
      'A rounded workhorse with a broad cockpit, wraparound bodywork and a single wide exhaust.',
    design: 'Rounded tub / raised service spine',
    propulsion: 'Single letterbox ion outlet',
  }),
]);

export async function createRivalPreview(
  id,
  { loadAsset = (url) => new GLTFLoader().loadAsync(url) } = {},
) {
  const specification = RIVAL_SHIPS.find((craft) => craft.id === id);
  if (!specification) throw new Error(`Unknown rival: ${id}`);
  const { scene: group } = await loadAsset(
    `${import.meta.env?.BASE_URL ?? '/'}assets/ships/rivals/${id}/${id}.glb`,
  );
  const resources = resourcesFor(group);
  group.name = `${specification.name} / AI racer preview`;
  group.traverse((object) => {
    if (object.isMesh) object.castShadow = object.receiveShadow = true;
  });
  const bounds = new Box3().setFromObject(group);
  group.userData = {
    ...group.userData,
    rivalId: id,
    bounds: { min: bounds.min.toArray(), max: bounds.max.toArray() },
  };
  let disposed = false;
  return {
    group,
    specification,
    dispose() {
      if (disposed) return;
      disposed = true;
      group.removeFromParent();
      resources.geometries.forEach((resource) => resource.dispose());
      resources.materials.forEach((resource) => resource.dispose());
      resources.textures.forEach((resource) => resource.dispose());
    },
  };
}
