import { withShipHeatEffects } from '../../effects/ship-heat.js';
import { CINDERCOIL_CONTACT_RELEASE } from './runtime.js';

const clamp = (value) => Math.max(0, Math.min(1, value));
export function readCindercoilHeatFeedback({
  motion,
  time = 0,
  settings = {},
} = {}) {
  const local = motion?.motion ?? motion ?? {};
  const contact = Number(typeof local.contactId === 'string');
  const contactAge = contact
    ? 0
    : (local.contactAge ?? CINDERCOIL_CONTACT_RELEASE);
  const envelope = Math.pow(
    1 - clamp(contactAge / CINDERCOIL_CONTACT_RELEASE),
    0.75,
  );
  const pulse = settings.reducedMotion
    ? 0.85
    : 0.65 + 0.35 * (0.5 + 0.5 * Math.cos((time * Math.PI * 2) / 1.2));
  return {
    contact,
    contactAge,
    contactDuration: local.contactDuration ?? 0,
    envelope,
    pulse,
    smoke: 0.96 * envelope * pulse,
    flame: 0.37 * Math.pow(envelope, 1.6) * pulse,
  };
}
export function withCindercoilShipHeatEffects(environment) {
  return withShipHeatEffects(environment, readCindercoilHeatFeedback, {
    label: 'Cindercoil',
  });
}
