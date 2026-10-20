import * as THREE from 'three';
import { isCombatDevice, COMBAT_RULES } from './combat.js';
import { createCombatDeviceGeometry, COMBAT_NAMES } from './combat-geometry.js';
import { createCombatPresentation } from './combat-presentation.js';
import {
  createRoadProjector,
  createDeviceGeometry,
  createShipFeedback,
  disposeGroup,
} from './geometry.js';
import { collectRoadSurfaces, roadDeviceMountHeight } from './device-mount.js';
import { createPickupAudio } from './audio.js';
import { DEVICE_COLORS, deviceCSSColor } from './theme.js';
import { AEGIS_DURATION } from './simulation.js';
import './style.css';

const clamp = (value) => Math.max(0, Math.min(1, value));
const TOAST_DURATION = 1.1;
const ICONS = {
  vector: 'm4 16 8-7 8 7M4 9l8-7 8 7',
  aegis: 'm4 3 8-2 8 2-1 12-7 7-7-7ZM12 5v11M8 10h8',
  repulsor: 'M12 1v6m0 10v6M1 12h6m10 0h6M5 5l4 4m6 6 4 4M5 19l4-4m6-6 4-4',
  arc: 'm13 1-8 12h7l-1 10 8-14h-7Z',
  ion: 'M5 2c8 6-8 12 0 20M12 2c8 6-8 12 0 20M19 2c8 6-8 12 0 20',
};
const icon = (kind) =>
  `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${ICONS[kind]}"/></svg>`;

export function pickupEventLabel(event) {
  const kind = event.payload?.kind;
  if (isCombatDevice(kind)) {
    const name = COMBAT_NAMES[kind];
    if (event.type === 'pickup-activate') return name + ' · AUTOMATIC';
    if (event.type === 'combat-fire') return name + ' · FIRED';
    if (event.type === 'combat-hit')
      return event.payload.shielded
        ? 'AEGIS · ATTACK BLOCKED'
        : name + ' · HIT';
    if (event.type === 'combat-confirm')
      return event.payload.shielded
        ? 'RIVAL SHIELD BLOCKED HIT'
        : name + ' · HIT CONFIRMED';
    if (event.type === 'pickup-unavailable') return name + ' · RECHARGING';
    return '';
  }
  const name = event.payload?.kind === 'vector' ? 'VECTOR' : 'AEGIS';
  if (event.type === 'pickup-activate')
    return name === 'VECTOR'
      ? 'BOOST STRIP · CATAPULT'
      : 'AEGIS · ONE IMPACT PROTECTED';
  if (event.type === 'pickup-exit' && event.payload?.kind === 'vector')
    return 'BOOST STRIP · SPEED CARRIED';
  if (event.type === 'shield-hit')
    return event.payload?.combat
      ? 'AEGIS · ATTACK BLOCKED'
      : 'AEGIS HIT · RESERVE PROTECTED';
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
  combat = null,
}) {
  const surfaces = collectRoadSurfaces(road);
  const root = new THREE.Group();
  root.name = 'Circuit / immediate road devices';
  scene.add(root);
  const projector = createRoadProjector(track);
  const hardware = devices.map((device) => {
    const mountHeight = roadDeviceMountHeight(surfaces, device, projector);
    const createGeometry = isCombatDevice(device.type)
      ? createCombatDeviceGeometry
      : createDeviceGeometry;
    const visual = createGeometry(track, device, projector, {
      mountHeight,
    });
    root.add(visual.group);
    return { ...visual, device };
  });
  projector.dispose();
  const combatVisual = combat ? createCombatPresentation(scene, combat) : null;
  const feedback = createShipFeedback();
  (ship.group || ship).add(feedback.group);
  const audio = createPickupAudio({ immersion: Boolean(audioImmersion) });
  const hud = document.createElement('aside');
  hud.className = 'race-devices';
  hud.setAttribute('aria-label', 'Automatic road devices');
  hud.hidden = true;
  hud.innerHTML = `<div class="race-device-states">
    <div class="race-device-state" data-kind="vector" hidden>${icon('vector')}<div><b>VECTOR <span data-value></span></b><i aria-hidden="true"><em></em></i><small data-toast hidden></small></div></div>
    <div class="race-device-state" data-kind="aegis" hidden>${icon('aegis')}<div><b>AEGIS <span data-value></span></b><i aria-hidden="true"><em></em></i><small data-toast hidden></small></div></div>
    <div class="race-device-state" data-kind="combat" hidden><div data-combat-icon></div><div><b><strong data-combat-name></strong><span data-combat-value></span></b><i aria-hidden="true"><em></em></i></div></div>
    </div><p class="race-device-message" role="status" aria-live="polite" aria-atomic="true"></p>`;
  host.append(hud);
  const message = hud.querySelector('.race-device-message');
  const nodes = Object.fromEntries(
    ['vector', 'aegis'].map((kind) => {
      const row = hud.querySelector(`[data-kind="${kind}"]`);
      row.style.setProperty('--device-color', deviceCSSColor(kind));
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
  const combatRow = hud.querySelector('[data-kind="combat"]');
  const combatName = combatRow.querySelector('[data-combat-name]');
  const combatValue = combatRow.querySelector('[data-combat-value]');
  const combatFill = combatRow.querySelector('em');
  const combatIcon = combatRow.querySelector('[data-combat-icon]');
  const anchor = new THREE.Vector3();
  let lastCombatIcon = null;
  let acquisitionTime = 0;
  let acquisitionDuration = 0.4;
  let acquisitionKind = 0;
  let combatNotice = null;
  let combatNoticeValue = '';
  let combatNoticeTime = 0;
  let combatNoticePriority = 0;
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
    noticeTime = hitTime = expiryTime = flowTime = acquisitionTime = 0;
    feedback.acquisition.visible = false;
    hud.hidden = true;
    for (const visual of hardware) visual.reset?.();
    combatNotice = null;
    combatNoticeTime = combatNoticePriority = 0;
    combatRow.hidden = true;
    message.textContent = '';
    feedback.shield.visible = feedback.drive.visible = false;
    for (const node of Object.values(nodes)) {
      node.toastTime = 0;
      node.row.hidden = true;
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
      enabled = true,
      vehicle = state,
      effects = {},
      events = [],
      mode,
      camera,
      dt = 0,
      settings: nextSettings = currentSettings,
    }) {
      if (disposed) return;
      combatVisual?.update({ mode, enabled, settings: nextSettings });
      if (!enabled) {
        root.visible = feedback.group.visible = false;
        hud.hidden = true;
        silence();
        return;
      }
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
        combatNoticeTime = Math.max(0, combatNoticeTime - dt);
        hitTime = Math.max(0, hitTime - dt);
        expiryTime = Math.max(0, expiryTime - dt);
        for (const node of Object.values(nodes))
          node.toastTime = Math.max(0, node.toastTime - dt);
        acquisitionTime = Math.max(0, acquisitionTime - dt);
        flowTime += dt;
      }
      if (!noticeTime) message.textContent = '';
      for (const event of events) {
        const label = pickupEventLabel(event);
        if (!label || !racing) continue;
        message.textContent = label;
        if (event.type === 'pickup-activate') {
          acquisitionKind = [
            'vector',
            'aegis',
            'repulsor',
            'arc',
            'ion',
          ].indexOf(event.payload.kind);
          acquisitionDuration = acquisitionKind === 1 ? 0.5 : 0.3;
          acquisitionTime = acquisitionDuration;
          feedback.acquisition.material.uniforms.kind.value = acquisitionKind;
          feedback.acquisition.material.uniforms.color.value.setHex(
            DEVICE_COLORS[event.payload.kind],
          );
          hardware
            .find((visual) => visual.device.id === event.payload.deviceId)
            ?.activate?.(flowTime);
        }
        const priority = /hit|confirm/.test(event.type)
          ? 3
          : event.type === 'pickup-unavailable'
            ? 1
            : 2;
        if (
          isCombatDevice(event.payload?.kind) &&
          (!combatNoticeTime || priority >= combatNoticePriority)
        ) {
          combatNoticePriority = priority;
          combatNotice = event.payload.kind;
          combatNoticeValue =
            event.type === 'combat-confirm'
              ? event.payload.shielded
                ? 'BLOCKED'
                : 'HIT CONFIRMED'
              : event.type === 'combat-hit'
                ? event.payload.shielded
                  ? 'BLOCKED'
                  : 'HIT'
                : event.type === 'pickup-unavailable'
                  ? 'RECHARGING'
                  : 'FIRED';
          combatNoticeTime = 1.3;
        }
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
          nodes.aegis.toast.textContent = 'BLOCKED';
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
        node.row.hidden = !active && node.toastTime <= 0;
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
      updateState('vector', vector, vector ? 'CATAPULT' : 'CARRY');
      updateState(
        'aegis',
        aegis > 0,
        aegis > 0 ? `${aegis.toFixed(1)}s` : hitTime ? 'BLOCKED' : 'CLEAR',
        aegis / AEGIS_DURATION,
      );
      const emitter = combat?.view().emitters.player;
      audio.setEffects({ vector, ion: emitter?.kind === 'ion' });
      const displayedEmitter =
        combatNoticeTime > 0 && combatNoticePriority >= 3 ? null : emitter;
      const combatKind =
        displayedEmitter?.kind ?? (combatNoticeTime > 0 ? combatNotice : null);
      combatRow.hidden = !combatKind;
      hud.classList.toggle('has-combat', !!combatKind);
      if (combatKind) {
        combatRow.dataset.effect = combatKind;
        combatRow.style.setProperty(
          '--device-color',
          deviceCSSColor(combatKind),
        );
        if (lastCombatIcon !== combatKind) {
          combatIcon.innerHTML = icon(combatKind);
          lastCombatIcon = combatKind;
        }
        combatRow.classList.toggle('is-active', !!displayedEmitter);
        combatName.textContent = COMBAT_NAMES[combatKind];
        const duration =
          combatKind === 'repulsor'
            ? COMBAT_RULES.pulseDelay
            : combatKind === 'ion'
              ? COMBAT_RULES.wakeDuration
              : 0.75;
        const remaining = displayedEmitter
          ? Math.max(0, duration - displayedEmitter.elapsed)
          : 0;
        combatValue.textContent = displayedEmitter
          ? combatKind === 'arc'
            ? 3 - displayedEmitter.shots + '/3'
            : remaining.toFixed(1) + 's'
          : combatNoticeValue;
        const fraction = !displayedEmitter
          ? 0
          : combatKind === 'repulsor'
            ? displayedEmitter.elapsed / duration
            : combatKind === 'arc'
              ? (3 - displayedEmitter.shots) / 3
              : remaining / duration;
        combatFill.style.transform = 'scaleX(' + clamp(fraction) + ')';
      }
      // Anchor above the rendered hull, including banking and flight. Only
      // active effects occupy space; idle driving has no device HUD at all.
      const hasReadout =
        !nodes.vector.row.hidden ||
        !nodes.aegis.row.hidden ||
        !combatRow.hidden;
      hud.hidden = !racing;
      if (camera && racing && hasReadout) {
        (ship.group || ship).updateWorldMatrix(true, false);
        anchor.set(0, 1.6, 0);
        (ship.group || ship).localToWorld(anchor);
        anchor.project(camera);
        const width = window.innerWidth;
        const height = window.innerHeight;
        const x = (anchor.x * 0.5 + 0.5) * width;
        const y = (-anchor.y * 0.5 + 0.5) * height - 12;
        let left = Math.max(88, Math.min(width - 88, x));
        // Portrait timing occupies the right side of the hull's projected path.
        // Slide only overlapping readouts into the adjacent clear space.
        if (width < 600 && height > width) {
          const roster = host
            .querySelector?.('#race-roster')
            ?.getBoundingClientRect?.();
          if (
            roster?.width > 0 &&
            left + 71 > roster.left - 8 &&
            y > roster.top &&
            y - hud.offsetHeight < roster.bottom
          )
            left = Math.max(80, roster.left - 79);
        }
        hud.style.left = left + 'px';
        hud.style.top = Math.max(110, Math.min(height - 70, y)) + 'px';
        hud.hidden = anchor.z < -1 || anchor.z > 1;
      }
      const acquisition = feedback.acquisition;
      acquisition.visible = driving && acquisitionTime > 0;
      const age = 1 - acquisitionTime / acquisitionDuration;
      acquisition.material.uniforms.age.value = age;
      acquisition.material.uniforms.reducedMotion.value =
        currentSettings.reducedMotion ? 1 : 0;
      acquisition.position.z = acquisitionKind === 4 ? -3 : 0;
      const size =
        acquisitionKind === 1
          ? 2.8 + age * 0.4
          : acquisitionKind === 2
            ? 4
            : 3.2;
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
      for (const visual of hardware) {
        visual.updateCamera(camera, (ship.group || ship).position);
        const lap = Math.floor((vehicle?.distance || 0) / track.length);
        visual.setAvailable(
          (isCombatDevice(visual.device.type)
            ? combat?.available(visual.device.id) !== false
            : true) &&
            ((effects.used?.[visual.device.id] ?? -Infinity) < lap ||
              (visual.device.type === 'vector' &&
                vector &&
                effects.vectorDevice === visual.device.id)),
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
      combatVisual?.dispose();
      disposeGroup(root);
      disposeGroup(feedback.group);
      void audio.dispose();
    },
  };
}
