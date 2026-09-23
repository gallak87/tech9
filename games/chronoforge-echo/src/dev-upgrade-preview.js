import { TOWN_CENTERS } from './town-center-art.js';

export {
  upgradeTourCameras,
  upgradeShotScale,
  upgradeSparkles,
  UpgradeTour,
  UPGRADE_TOUR_DURATION,
} from './upgrade-cinematic.js';

// A presentation rehearsal, deliberately independent of progression and travel.
// Both pictures are detached snapshots. Town-center level is NOT civilization
// tier: this first pass must not invent service unlocks or charge upgrade costs.
export function upgradePreviewStates(state, fromLevel, region = 'haventide') {
  if (!Number.isInteger(fromLevel) || fromLevel < 1 || fromLevel > 3)
    throw Error('Choose an upgrade from level 1, 2 or 3.');
  if (!TOWN_CENTERS.some((town) => town.region === region))
    throw Error('Unknown preview town.');
  const before = structuredClone(state),
    after = structuredClone(state);
  before.buildings.town_center = fromLevel;
  after.buildings.town_center = fromLevel + 1;
  before.townCenterArtRegion = after.townCenterArtRegion = region;
  before.townInteriorArtRegion = after.townInteriorArtRegion = region;
  return {
    region,
    previewLocation: 'haventide',
    before,
    after,
    fromLevel,
    toLevel: fromLevel + 1,
  };
}
