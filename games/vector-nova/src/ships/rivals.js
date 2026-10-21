import { assetURL } from '../assets/url.js';
import { Box3 } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { resourcesFor } from './index.js';
import { createRivalPropulsion } from './rival-propulsion.js';

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
  Object.freeze({
    id: 'pike',
    name: 'Pike',
    role: 'Interceptor',
    description:
      'A slender spearhead with a rear cockpit, swept stabilisers and one recessed turbine.',
    design: 'Long spearhead / swept aft wing',
    propulsion: 'Single round ion turbine',
  }),
  Object.freeze({
    id: 'tern',
    name: 'Tern',
    role: 'Twin boom',
    description:
      'An ivory cockpit capsule suspended between two long booms, with open cross members and orange inlays.',
    design: 'Separated twin booms / cranked transom wing',
    propulsion: 'Paired rectangular ion outlets',
  }),
  Object.freeze({
    id: 'manta',
    name: 'Manta',
    role: 'Flying wing',
    description:
      'A low teal body blends into a broad swept wing with seated outer skins and sheltered exhausts.',
    design: 'Broad continuous swept wing',
    propulsion: 'Paired rectangular ion outlets',
  }),
  Object.freeze({
    id: 'vise',
    name: 'Vise',
    role: 'Hammerhead',
    description:
      'A broad rust-red forward canard leads a narrow cockpit tub and two outboard turbine carriers.',
    design: 'Hammerhead bow / separate aft engines',
    propulsion: 'Paired round ion turbines',
  }),
  Object.freeze({
    id: 'kite',
    name: 'Kite',
    role: 'Diamond',
    description:
      'A compact indigo diamond body with inset shoulder panels, canted fins and one central exhaust.',
    design: 'Diamond monocoque / canted aft vanes',
    propulsion: 'Single rectangular ion outlet',
  }),
  Object.freeze({
    id: 'gannet',
    name: 'Gannet',
    role: 'Gull wing',
    description:
      'A raised grey cockpit descends through formed gull wings to low engine outriggers with ochre markings.',
    design: 'Raised fuselage / descending gull wings',
    propulsion: 'Paired rectangular ion outlets',
  }),
]);

export async function createRivalPreview(
  id,
  { loadAsset = (url) => new GLTFLoader().loadAsync(url), settings = {} } = {},
) {
  const specification = RIVAL_SHIPS.find((craft) => craft.id === id);
  if (!specification) throw new Error(`Unknown rival: ${id}`);
  const { scene: group } = await loadAsset(
    assetURL(`assets/ships/rivals/${id}/${id}.glb`),
  );
  const resources = resourcesFor(group);
  const releaseResources = () => {
    resources.geometries.forEach((resource) => resource.dispose());
    resources.materials.forEach((resource) => resource.dispose());
    resources.textures.forEach((resource) => resource.dispose());
  };
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
  let propulsion;
  try {
    propulsion = createRivalPropulsion(group, settings);
  } catch (error) {
    releaseResources();
    throw error;
  }
  let disposed = false;
  return {
    group,
    specification,
    update: propulsion.update,
    dispose() {
      if (disposed) return;
      disposed = true;
      propulsion.dispose();
      group.removeFromParent();
      releaseResources();
    },
  };
}
