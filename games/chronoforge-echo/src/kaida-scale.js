// Calibration for the two immutable Kaida sources. Hair crown to planted sole
// was exported at different sizes in each direction, including standing views.
// A fixed scale per direction preserves gait bob; never fit each animation frame.
const BODY_HEIGHT = 336;
const WALK_ROW_HEIGHTS = [352, 339, 346];
export const kaidaWalkScale = (direction) =>
  (0.23 * BODY_HEIGHT) / WALK_ROW_HEIGHTS[direction];
export const kaidaPoseScale = (index) =>
  (0.23 * BODY_HEIGHT) /
  (index === 10 ? 315 : index === 11 ? 322 : BODY_HEIGHT);
