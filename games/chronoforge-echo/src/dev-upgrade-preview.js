export {upgradeTourCameras,upgradeShotScale,upgradeSparkles,UpgradeTour,UPGRADE_TOUR_DURATION} from './upgrade-cinematic.js';

// A presentation rehearsal, deliberately independent of progression and travel.
// Both pictures are detached snapshots. Town-center level is NOT civilization
// tier: this first pass must not invent service unlocks or charge upgrade costs.
export function upgradePreviewStates(state,fromLevel) {
  if(!Number.isInteger(fromLevel)||fromLevel<1||fromLevel>3)throw Error('Choose an upgrade from level 1, 2 or 3.');
  const before=structuredClone(state),after=structuredClone(state);
  before.buildings.town_center=fromLevel;
  after.buildings.town_center=fromLevel+1;
  before.townCenterArtRegion=after.townCenterArtRegion='haventide';
  return {region:'haventide',before,after,fromLevel,toLevel:fromLevel+1};
}
