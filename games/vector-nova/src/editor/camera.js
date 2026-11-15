// Custom gaps use the same continuous road/flight handoff as production levels.
// Keep the incoming composition instead of switching to the default flight rig
// at the lip and transporting its different frame back onto the receiving road.
export const EDITOR_CAMERA = Object.freeze({
  preserveFlightView: true,
  chaseHeight: 7.5,
  chaseDistance: 17,
  lookAhead: 60,
  safeFrame: Object.freeze({
    left: -0.86,
    right: 0.86,
    bottom: -0.6,
    top: 0.8,
  }),
});
