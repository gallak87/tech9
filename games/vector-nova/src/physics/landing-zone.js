// Extra receiving road for boosted overshoots. This changes landing acceptance,
// not geometry, gravity or steering. Never bridge another jump or the finish.
export const LANDING_RUNOUT = 150;

export function landingZoneEnd(track, jump) {
  const nextTakeoff = track.jumps.find(
    (entry) => entry.takeoff > jump.landingEnd,
  )?.takeoff;
  return Math.min(
    jump.landingEnd + LANDING_RUNOUT,
    nextTakeoff ?? Infinity,
    track.closed !== false && jump.id === 'equipment-jump'
      ? Infinity
      : (track.finishDistance ?? track.length),
  );
}
