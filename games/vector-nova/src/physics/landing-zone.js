// Extra receiving road for boosted overshoots. This changes landing acceptance,
// not geometry, gravity or steering. Only a verified airborne finish opens
// the terminal runout, and another takeoff always ends a receiving zone.
export const LANDING_RUNOUT = 150;
export const FINISH_RUNOUT_SOURCE = Symbol('finish runout source');

export function landingZoneEnd(track, jump) {
  const nextTakeoff = track.jumps.find(
    (entry) => entry.takeoff > jump.landingEnd,
  )?.takeoff;
  if (track.closed === false && jump[FINISH_RUNOUT_SOURCE])
    return Math.min(track.length, nextTakeoff ?? Infinity);
  return Math.min(
    jump.landingEnd + LANDING_RUNOUT,
    nextTakeoff ?? Infinity,
    track.closed !== false && jump.id === 'equipment-jump'
      ? Infinity
      : (track.finishDistance ?? track.length),
  );
}
