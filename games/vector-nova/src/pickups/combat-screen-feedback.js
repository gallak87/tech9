import { deviceCSSColor } from './theme.js';

export function sampleCombatScreen(disruption, reducedMotion = false) {
  if (!disruption) return { flash: 0, pulse: 0, tunnel: 0 };
  const { kind, age, strength } = disruption;
  // Low-frequency instrument pulse; one short white arrival flash, never a strobe.
  const pulse =
    strength *
    (reducedMotion
      ? 0.18
      : kind === 'arc'
        ? 0.5 + 0.5 * Math.cos(age * Math.PI * 4)
        : 0.6);
  return {
    flash: reducedMotion ? 0 : Math.max(0, 1 - age / 0.16) * 0.22,
    pulse,
    tunnel: kind === 'repulsor' ? strength * (reducedMotion ? 0.18 : 0.72) : 0,
  };
}

export function createCombatScreenFeedback(host) {
  const root = document.createElement('div');
  root.className = 'race-hit-screen';
  root.setAttribute('aria-hidden', 'true');
  root.hidden = true;
  root.innerHTML =
    '<i class="race-hit-flash"></i><i class="race-hit-pressure"></i><i class="race-hit-edge"></i>';
  host.append(root);
  function reset() {
    root.hidden = true;
    delete host.dataset.combatHit;
    host.style.removeProperty('--combat-hud-pulse');
  }
  return {
    update(disruption, settings = {}, visible = true) {
      if (!visible || !disruption) {
        reset();
        return;
      }
      root.hidden = false;
      root.dataset.kind = host.dataset.combatHit = disruption.kind;
      const { flash, pulse, tunnel } = sampleCombatScreen(
        disruption,
        settings.reducedMotion,
      );
      root.style.setProperty('--hit-flash', flash.toFixed(3));
      root.style.setProperty('--hit-pulse', pulse.toFixed(3));
      root.style.setProperty('--hit-tunnel', tunnel.toFixed(3));
      root.style.setProperty('--hit-color', deviceCSSColor(disruption.kind));
      host.style.setProperty('--combat-hud-pulse', pulse.toFixed(3));
    },
    reset,
    dispose() {
      reset();
      root.remove();
    },
  };
}
