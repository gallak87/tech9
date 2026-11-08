import { assetURL } from '../../../assets/url.js';
import { createQuarter, createQuarterReservation } from './quarter.js';
import manifest from '../../../../assets/levels/oriel/blender/garden-quarter/manifest.json' with { type: 'json' };

export const ORIEL_GARDEN_QUARTER_URL = assetURL(
  'assets/levels/oriel/oriel-garden-quarter.glb',
);

const configuration = {
  url: ORIEL_GARDEN_QUARTER_URL,
  manifest,
  name: 'Oriel / composed lakeside water-garden quarter',
  marker: 'orielGardenQuarter',
  reservationId: 'oriel-lakeside-water-garden-quarter',
};

export function getGardenQuarterReservation(track) {
  return createQuarterReservation(track, configuration);
}

export function createGardenQuarter(options = {}) {
  return createQuarter(configuration, options);
}
