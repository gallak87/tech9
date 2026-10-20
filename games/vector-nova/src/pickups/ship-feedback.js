import { createShipFeedback, disposeGroup } from './geometry.js';
import { DEVICE_COLORS } from './theme.js';
import { createArcFeedback } from './arc-feedback.js';

const clamp = (value) => Math.max(0, Math.min(1, value));
const kinds = ['vector', 'aegis', 'repulsor', 'arc', 'ion'];
const ARC_TAIL = 0.65;

// The exact hull feedback used in races and the dev inspector. No world, HUD
// or audio owner is needed to draw an acquisition, shield or drive effect.
export function createShipFeedbackPresentation() {
  const feedback = createShipFeedback();
  const arc = createArcFeedback();
  feedback.group.add(arc);
  let arcTime = 0;
  let arcPeak = 0;
  let acquisitionTime = 0;
  let acquisitionDuration = 0.4;
  let acquisitionKind = 0;
  let hitTime = 0;
  let expiryTime = 0;
  let hitSide = 1;
  function reset() {
    acquisitionTime = hitTime = expiryTime = arcTime = 0;
    arc.visible = false;
    feedback.acquisition.visible = false;
    feedback.shield.visible = feedback.drive.visible = false;
  }
  function update({
    effects = {},
    events = [],
    racing = true,
    driving = racing,
    dt = 0,
    time: flowTime = 0,
    settings: currentSettings = {},
  } = {}) {
    feedback.group.visible = driving;
    if (racing) {
      acquisitionTime = Math.max(0, acquisitionTime - dt);
      hitTime = Math.max(0, hitTime - dt);
      expiryTime = Math.max(0, expiryTime - dt);
      arcTime = Math.max(0, arcTime - dt);
      for (const event of events) {
        const kind = event.payload?.kind;
        if (
          kind === 'arc' &&
          (event.type === 'pickup-activate' || event.type === 'combat-fire')
        ) {
          arcTime = ARC_TAIL;
          arcPeak = event.type === 'combat-fire' ? 0.72 : 0.4;
        }
        if (event.type === 'pickup-activate' && kinds.includes(kind)) {
          acquisitionKind = kinds.indexOf(kind);
          acquisitionDuration = acquisitionKind === 1 ? 0.5 : 0.3;
          acquisitionTime = acquisitionDuration;
          feedback.acquisition.material.uniforms.kind.value = acquisitionKind;
          feedback.acquisition.material.uniforms.color.value.setHex(
            DEVICE_COLORS[kind],
          );
        }
        if (event.type === 'shield-hit') {
          hitTime = 0.42;
          hitSide = event.payload?.side || 1;
          expiryTime = 0;
        }
        if (event.type === 'pickup-expire' && kind === 'aegis')
          expiryTime = 0.5;
        if (
          (event.type === 'impact' && !event.payload?.shielded) ||
          (event.type === 'pickup-cancel' && kind === 'aegis')
        )
          hitTime = expiryTime = 0;
      }
    }
    arc.visible = driving && arcTime > 0;
    const arcDecay = clamp(arcTime / ARC_TAIL);
    arc.material.uniforms.strength.value = currentSettings.reducedMotion
      ? arcDecay * 0.13
      : arcPeak *
        (0.2 * arcDecay * arcDecay +
          0.8 * Math.exp(-(ARC_TAIL - arcTime) * 26));
    const vector = effects.vectorActive === true;
    const aegis = Math.max(0, effects.aegisRemaining || 0);
    const acquisition = feedback.acquisition;
    acquisition.visible = driving && acquisitionTime > 0;
    const age = 1 - acquisitionTime / acquisitionDuration;
    acquisition.material.uniforms.age.value = age;
    acquisition.material.uniforms.reducedMotion.value =
      currentSettings.reducedMotion ? 1 : 0;
    acquisition.position.z = acquisitionKind === 4 ? -3 : 0;
    const size =
      acquisitionKind === 1 ? 2.8 + age * 0.4 : acquisitionKind === 2 ? 4 : 3.2;
    acquisition.scale.set(
      size,
      1,
      acquisitionKind === 0 || acquisitionKind === 4 ? 6 : size,
    );
    feedback.shield.visible =
      driving && (aegis > 0 || hitTime > 0 || expiryTime > 0);
    const field = feedback.shieldMaterial.uniforms;
    field.strength.value =
      aegis > 0
        ? 1
        : hitTime > 0
          ? clamp(hitTime / 0.42)
          : clamp(expiryTime / 0.5);
    field.hit.value =
      clamp(hitTime / 0.42) * (currentSettings.reducedMotion ? 0.55 : 1);
    field.hitSide.value = hitSide;
    field.release.value =
      expiryTime && !currentSettings.reducedMotion ? 1 - expiryTime / 0.5 : 0;
    if (field.flowTime) field.flowTime.value = flowTime;
    if (field.reducedMotion)
      field.reducedMotion.value = currentSettings.reducedMotion ? 1 : 0;
    feedback.drive.visible = driving && vector;
    feedback.driveMaterial.uniforms.strength.value = vector
      ? currentSettings.reducedMotion
        ? 0.85
        : 1
      : 0;
    feedback.driveMaterial.uniforms.flowTime.value =
      currentSettings.reducedMotion ? 0 : flowTime;
  }
  reset();
  return {
    group: feedback.group,
    update,
    get hitActive() {
      return hitTime > 0;
    },
    reset,
    dispose: () => disposeGroup(feedback.group),
  };
}
