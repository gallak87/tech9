import {
  HAVENTIDE_INTERIOR_ASSETS,
  havenInteriorLevel,
} from './haventide-interior-art.js';
import { EMBERLINE_INTERIOR_ASSETS } from './emberline-interior-art.js';
import { ORBITAL_REACH_INTERIOR_ASSETS } from './orbital-reach-interior-art.js';
import { LAST_CROWN_INTERIOR_ASSETS } from './last-crown-interior-art.js';

export const TOWN_INTERIOR_ASSETS = [
  ...HAVENTIDE_INTERIOR_ASSETS.map((asset) => ({
    ...asset,
    region: 'haventide',
  })),
  ...EMBERLINE_INTERIOR_ASSETS,
  ...ORBITAL_REACH_INTERIOR_ASSETS,
  ...LAST_CROWN_INTERIOR_ASSETS,
];
export const townInteriorLevel = havenInteriorLevel;
export function townInteriorRegion(region, state) {
  const actual = region ?? 'haventide';
  const selected =
    actual === 'haventide' ? (state?.townInteriorArtRegion ?? actual) : actual;
  return TOWN_INTERIOR_ASSETS.some((asset) => asset.region === selected)
    ? selected
    : 'haventide';
}
export function townInteriorFrame(part, state, region = 'haventide') {
  const selected = townInteriorRegion(region, state);
  const asset = TOWN_INTERIOR_ASSETS.find(
    (entry) =>
      entry.region === selected && entry.level === townInteriorLevel(state),
  );
  const frameIndex =
    asset?.metadata.frames.findIndex((frame) => frame.part === part) ?? -1;
  return frameIndex < 0
    ? null
    : { asset, frame: asset.metadata.frames[frameIndex], frameIndex };
}
