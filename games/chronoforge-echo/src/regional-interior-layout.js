import { configureHaventideInterior } from './haventide-interior-layout.js';

// These regional halls share service footprints, so restoration never changes
// navigation, staff approaches, or saved positions between tiers.
export function configureRegionalInterior(scene) {
  const region = scene.townId;
  configureHaventideInterior(scene);
  for (const object of scene.objects) {
    if (object.havenPart) object.interiorRegion = region;
    if (object.id.startsWith('haven_')) object.id = region + object.id.slice(5);
    if (object.id === region + '_resident')
      Object.assign(object, { x: 1190, y: 955 });
  }
}
