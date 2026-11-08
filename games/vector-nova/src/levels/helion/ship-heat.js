import { sampleHelionHeatFeedback } from './thermal.js';
import {
  createShipHeatEffects as createEffects,
  withShipHeatEffects as withEffects,
} from '../../effects/ship-heat.js';

export function readHelionHeatFeedback(
  telemetry,
  { time = telemetry.heatTime ?? 0, settings = {} } = {},
) {
  const feedback = sampleHelionHeatFeedback(telemetry, {
    time,
    reducedMotion: settings.reducedMotion,
  });
  Object.assign(telemetry, {
    heatStatus: feedback.status,
    heatPulse: feedback.pulse,
    heatEnvelope: feedback.envelope,
    shipSmoke: feedback.smoke,
    shipFlame: feedback.flame,
  });
  return {
    ...feedback,
    contact: Number(feedback.contact),
    contactAge: telemetry.contactAge ?? 5,
    contactDuration: telemetry.contactDuration ?? 0,
  };
}
const options = (telemetry) => ({
  label: 'Helion',
  resetFeedback: () =>
    Object.assign(telemetry, { heatStatus: '', shipSmoke: 0, shipFlame: 0 }),
});
export function createShipHeatEffects(telemetry) {
  return createEffects(
    (frame) => readHelionHeatFeedback(telemetry, frame),
    options(telemetry),
  );
}
export function withShipHeatEffects(environment, telemetry) {
  return withEffects(
    environment,
    (frame) => readHelionHeatFeedback(telemetry, frame),
    options(telemetry),
  );
}
