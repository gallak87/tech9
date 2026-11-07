import { assetURL } from '../../../assets/url.js';
import { createQuarter, createQuarterReservation } from './quarter.js';
import manifest from '../../../../assets/levels/oriel/blender/shore-quarter/manifest.json' with { type: 'json' };

export const ORIEL_SHORE_QUARTER_URL = assetURL(
  'assets/levels/oriel/oriel-shore-quarter.glb',
);

const configuration = {
  url: ORIEL_SHORE_QUARTER_URL,
  manifest,
  name: 'Oriel / composed waterside market and garden',
  marker: 'orielShoreQuarter',
  reservationId: 'oriel-waterside-shore-market-quarter',
};

export function getShoreQuarterReservation(track) {
  return createQuarterReservation(track, configuration);
}

export function createShoreQuarter(options = {}) {
  return createQuarter(configuration, options);
}
