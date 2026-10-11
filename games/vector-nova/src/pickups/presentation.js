import * as THREE from 'three';
import {
  createRoadProjector,
  createDeviceGeometry,
  createShipFeedback,
  disposeGroup,
} from './geometry.js';
import { collectRoadSurfaces, roadDeviceMountHeight } from './device-mount.js';
import { createPickupAudio } from './audio.js';
import { AEGIS_DURATION } from './simulation.js';
import './style.css';

const clamp = (value) => Math.max(0, Math.min(1, value));
const TOAST_DURATION = 1.1;
const icon = (type) =>
  type === 'vector'
    ? '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m4 16 8-7 8 7M4 9l8-7 8 7"/></svg>'
    : '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m4 3 8-2 8 2-1 12-7 7-7-7Z"/><path d="M12 5v11M8 10h8"/></svg>';

export function pickupEventLabel(event) {
  const name = event.payload?.kind === 'vector' ? 'VECTOR' : 'AEGIS';
  if (event.type === 'pickup-activate')
    return name === 'VECTOR'
      ? 'BOOST STRIP · CATAPULT'
      : 'AEGIS · ONE IMPACT PROTECTED';
  if (event.type === 'pickup-exit' && event.payload?.kind === 'vector')
    return 'BOOST STRIP · SPEED CARRIED';
  if (event.type === 'shield-hit') return 'AEGIS HIT · RESERVE PROTECTED';
  if (event.type === 'impact' && !event.payload?.shielded)
    return 'UNPROTECTED HIT · RESERVE LOST';
  if (event.type === 'pickup-expire' && name === 'AEGIS')
    return 'AEGIS EXPIRED';
  if (event.type === 'pickup-cancel')
    return name === 'VECTOR'
      ? event.payload?.reason === 'brake'
        ? 'BOOST STRIP · BRAKING'
        : 'BOOST STRIP · CONTACT ENDED'
      : 'AEGIS CLEARED';
  if (event.type === 'pickup-unavailable')
    return name === 'VECTOR'
      ? event.payload?.reason === 'braking'
        ? 'BOOST STRIP · BRAKING'
        : 'BOOST STRIP · PASSED'
      : 'AEGIS ALREADY ACTIVE';
  return '';
}

export function createPickupPresentation({
  track,
  road,
  scene,
  ship,
  host,
  settings = {},
  devices = [],
  audioImmersion,
}) {
  const surfaces = collectRoadSurfaces(road);
  const root = new THREE.Group();
  root.name = 'Circuit / immediate road devices';
  scene.add(root);
  const projector = createRoadProjector(track);
  const hardware = devices.map((device) => {
    const mountHeight = roadDeviceMountHeight(surfaces, device, projector);
    const visual = createDeviceGeometry(track, device, projector, {
      mountHeight,
    });
    root.add(visual.group);
    return { ...visual, device };
  });
  projector.dispose();
  const feedback = createShipFeedback();
  (ship.group || ship).add(feedback.group);
  const audio = createPickupAudio({ immersion: Boolean(audioImmersion) });
  const hud = document.createElement('aside');
  hud.className = 'race-devices';
  hud.setAttribute('aria-label', 'Automatic road devices');
  hud.hidden = true;
  hud.innerHTML = `<div class="race-device-states">
    <div class="race-device-state" data-kind="vector">${icon('vector')}<div><b>BOOST STRIP <small data-toast aria-hidden="true"></small></b><span data-value>DRIVE OVER STRIP</span></div></div>
    <div class="race-device-state" data-kind="aegis">${icon('aegis')}<div><b>AEGIS <small data-toast aria-hidden="true"></small></b><span data-value>DRIVE THROUGH ARCH</span><i><em></em></i></div></div>
    </div><p class="race-device-message" role="status" aria-live="polite" aria-atomic="true"></p>`;
  host.append(hud);
  const message = hud.querySelector('.race-device-message');
  const nodes = Object.fromEntries(
    ['vector', 'aegis'].map((kind) => {
      const row = hud.querySelector(`[data-kind="${kind}"]`);
      return [
        kind,
        {
          row,
          value: row.querySelector('[data-value]'),
          toast: row.querySelector('[data-toast]'),
          fill: row.querySelector('em'),
          toastTime: 0,
        },
      ];
    }),
  );
  let currentSettings = settings;
  let disposed = false;
  let noticeTime = 0;
  let hitTime = 0;
  let expiryTime = 0;
  let flowTime = 0;
  let hitSide = 1;
  let lastMode = '';
  const unlock = () => {
    if (!currentSettings.muted && currentSettings.volume > 0)
      void audio.unlock();
  };
  const silence = () => audio.silence();
  const visibility = () => {
    if (document.hidden) silence();
  };
  window.addEventListener('pointerdown', unlock, { passive: true });
  window.addEventListener('keydown', unlock);
  window.addEventListener('blur', silence);
  document.addEventListener('visibilitychange', visibility);
  function reset() {
    noticeTime = hitTime = expiryTime = flowTime = 0;
    message.textContent = '';
    feedback.shield.visible = feedback.drive.visible = false;
    for (const node of Object.values(nodes)) {
      node.toastTime = 0;
      node.toast.textContent = '';
      node.row.classList.toggle('is-acquired', false);
      node.row.style.setProperty('--device-pop', 0);
    }
    audio.silence();
  }
  return {
    root,
    hud,
    update({
      state,
      vehicle = state,
      effects = {},
      events = [],
      mode,
      camera,
      dt = 0,
      settings: nextSettings = currentSettings,
    }) {
      if (disposed) return;
      currentSettings = nextSettings;
      const racing = mode === 'racing' && !document.hidden;
      const driving = racing || mode === 'paused';
      hud.hidden = !racing;
      root.visible = mode !== 'inspection';
      feedback.group.visible = driving;
      hud.classList.toggle(
        'race-reduced-motion',
        !!currentSettings.reducedMotion,
      );
      if (lastMode !== mode && !driving) reset();
      lastMode = mode;
      audio.update(
        currentSettings,
        racing,
        audioImmersion?.({ camera, track, state }) ?? 0,
      );
      if (racing) {
        noticeTime = Math.max(0, noticeTime - dt);
        hitTime = Math.max(0, hitTime - dt);
        expiryTime = Math.max(0, expiryTime - dt);
        for (const node of Object.values(nodes))
          node.toastTime = Math.max(0, node.toastTime - dt);
        if (!currentSettings.reducedMotion) flowTime += dt;
      }
      if (!noticeTime) message.textContent = '';
      for (const event of events) {
        const label = pickupEventLabel(event);
        if (!label || !racing) continue;
        message.textContent = label;
        message.dataset.kind = event.payload?.kind || 'aegis';
        noticeTime = event.type === 'shield-hit' ? 2.4 : 1.8;
        if (event.type === 'pickup-activate' && nodes[event.payload?.kind]) {
          const node = nodes[event.payload.kind];
          node.toastTime = TOAST_DURATION;
          node.toast.textContent =
            event.payload.kind === 'vector' ? 'CATAPULT' : 'SHIELD ACQUIRED';
        }
        if (event.type === 'shield-hit') {
          hitTime = 0.42;
          hitSide = event.payload?.side || 1;
          expiryTime = 0;
          nodes.aegis.toastTime = TOAST_DURATION;
          nodes.aegis.toast.textContent = 'IMPACT ABSORBED';
        }
        if (event.type === 'pickup-expire' && event.payload?.kind === 'aegis')
          expiryTime = 0.5;
        if (event.type === 'impact' && !event.payload?.shielded) {
          // A later contact is a new result, never evidence of earlier protection.
          hitTime = expiryTime = 0;
        }
        if (event.type === 'pickup-cancel' && event.payload?.kind === 'aegis')
          hitTime = expiryTime = 0;
        audio.event(event);
      }
      const vector = effects.vectorActive === true;
      const aegis = Math.max(0, effects.aegisRemaining || 0);
      hud.classList.toggle('has-vector', vector);
      hud.classList.toggle('has-aegis', aegis > 0);
      const updateState = (kind, active, value, fraction = null) => {
        const node = nodes[kind];
        node.row.classList.toggle('is-active', active);
        node.row.classList.toggle('is-acquired', node.toastTime > 0);
        node.row.style.setProperty(
          '--device-pop',
          clamp(node.toastTime / TOAST_DURATION).toFixed(3),
        );
        if (!node.toastTime) node.toast.textContent = '';
        node.value.textContent = value;
        if (node.fill && fraction !== null)
          node.fill.style.transform = `scaleX(${clamp(fraction)})`;
        node.row.setAttribute(
          'aria-label',
          `${kind.toUpperCase()}: ${node.value.textContent}`,
        );
      };
      updateState(
        'vector',
        vector,
        vector ? 'ON STRIP · ACCELERATING' : 'DRIVE OVER STRIP',
      );
      updateState(
        'aegis',
        aegis > 0,
        aegis > 0
          ? `1 HIT · ${aegis.toFixed(1)}s`
          : hitTime
            ? 'HIT ABSORBED · 0 HITS'
            : 'DRIVE THROUGH ARCH',
        aegis / AEGIS_DURATION,
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
      for (const visual of hardware) {
        visual.updateCamera(camera, (ship.group || ship).position);
        const lap = Math.floor((vehicle?.distance || 0) / track.length);
        visual.setAvailable(
          (effects.used?.[visual.device.id] ?? -Infinity) < lap ||
            (visual.device.type === 'vector' &&
              vector &&
              effects.vectorDevice === visual.device.id),
        );
        visual.update?.({
          time: flowTime,
          reducedMotion: !!currentSettings.reducedMotion,
          running: racing,
        });
      }
    },
    reset,
    getPresentation: () => ({ audio: audio.getStatus() }),
    dispose() {
      if (disposed) return;
      disposed = true;
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
      window.removeEventListener('blur', silence);
      document.removeEventListener('visibilitychange', visibility);
      hud.remove();
      disposeGroup(root);
      disposeGroup(feedback.group);
      void audio.dispose();
    },
  };
}
