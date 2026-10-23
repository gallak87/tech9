import * as THREE from 'three';
import { isCombatDevice, COMBAT_RULES } from './combat.js';
import { createCombatDeviceGeometry, COMBAT_NAMES } from './combat-geometry.js';
import { createCombatPresentation } from './combat-presentation.js';
import {
  createRoadProjector,
  createDeviceGeometry,
  disposeGroup,
} from './geometry.js';
import { collectRoadSurfaces, roadDeviceMountHeight } from './device-mount.js';
import { createPickupAudio } from './audio.js';
import { deviceCSSColor } from './theme.js';
import { createShipFeedbackPresentation } from './ship-feedback.js';
import { AEGIS_DURATION } from './rules.js';
import { createHitFeedback } from './hit-feedback.js';
import { createCombatScreenFeedback } from './combat-screen-feedback.js';
import { createSurfaceProjector } from './surface-projector.js';
import { pickupQuality } from './quality.js';
import { createLowDeviceGeometry } from './low-geometry.js';
import { createReadoutAnchor } from './readout-anchor.js';
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
    if (event.type === 'pickup-unavailable') return 'WEAPON ALREADY ACTIVE';
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
  let quality = pickupQuality(settings);
  let hardware = [];
  function buildHardware() {
    for (const visual of hardware) disposeGroup(visual.group);
    const projector =
      track.deviceProjection === 'rendered-surface'
        ? createSurfaceProjector(track, surfaces)
        : createRoadProjector(track);
    hardware = devices.map((device) => {
      const mountHeight =
        track.deviceProjection === 'rendered-surface'
          ? 0
          : roadDeviceMountHeight(surfaces, device, projector);
      const createGeometry =
        quality === 'low'
          ? createLowDeviceGeometry
          : isCombatDevice(device.type)
            ? createCombatDeviceGeometry
            : createDeviceGeometry;
      const visual = createGeometry(track, device, projector, { mountHeight });
      root.add(visual.group);
      return { ...visual, device };
    });
    projector.dispose();
  }
  buildHardware();
  const combatVisual = combat
    ? createCombatPresentation(scene, combat, settings)
    : null;
  const hitFeedback = combat
    ? createHitFeedback(ship.group || ship, settings)
    : null;
  const screenFeedback = createCombatScreenFeedback(host);
  const feedback = createShipFeedbackPresentation(settings);
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
  const readoutAnchor = createReadoutAnchor();
  let lastCombatIcon = null;
  let combatNotice = null;
  let combatNoticeValue = '';
  let combatNoticeTime = 0;
  let combatNoticePriority = 0;
  let currentSettings = settings;
  let disposed = false;
  let noticeTime = 0;
  let flowTime = 0;
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
    noticeTime = flowTime = 0;
    readoutAnchor.reset();
    feedback.reset();
    hitFeedback?.update();
    screenFeedback.reset();
    hud.hidden = true;
    for (const visual of hardware) visual.reset?.();
    combatNotice = null;
    combatNoticeTime = combatNoticePriority = 0;
    combatRow.hidden = true;
    message.textContent = '';
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
      if (quality !== pickupQuality(nextSettings)) {
        quality = pickupQuality(nextSettings);
        buildHardware();
      }
      combatVisual?.update({ mode, enabled, settings: nextSettings });
      if (!enabled) {
        hitFeedback?.update(undefined, nextSettings);
        screenFeedback.reset();
        feedback.update({
          racing: false,
          driving: false,
          settings: nextSettings,
        });
        root.visible = feedback.group.visible = false;
        hud.hidden = true;
        readoutAnchor.reset();
        silence();
        return;
      }
      currentSettings = nextSettings;
      const racing = mode === 'racing' && !document.hidden;
      const driving = racing || mode === 'paused';
      const combatState = combat?.view();
      const flash = driving
        ? combatState?.flashes.findLast(
            (entry) => entry.target === 'player' && isCombatDevice(entry.kind),
          )
        : null;
      const blocking =
        effects.aegisRemaining > 0 ||
        combatState?.flashes.some(
          (entry) => entry.target === 'player' && entry.kind === 'aegis',
        );
      const disruption = driving ? combat?.disruption?.('player') : null;
      screenFeedback.update(disruption, nextSettings, driving);
      hitFeedback?.update(
        flash?.age,
        nextSettings,
        disruption?.kind ?? flash?.kind ?? 'ion',
        {
          disruption: disruption?.strength ?? 0,
          ionContact:
            driving && !blocking ? (combat?.ionContact?.('player') ?? 0) : 0,
          time: combatState?.time,
        },
      );
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
        for (const node of Object.values(nodes))
          node.toastTime = Math.max(0, node.toastTime - dt);
        flowTime += dt;
      }
      if (!noticeTime) message.textContent = '';
      for (const event of events) {
        if (racing) audio.event(event);
        const label = pickupEventLabel(event);
        if (!label || !racing) continue;
        message.textContent = label;
        if (event.type === 'pickup-activate') {
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
                  ? 'WEAPON ACTIVE'
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
          nodes.aegis.toastTime = TOAST_DURATION;
          nodes.aegis.toast.textContent = 'BLOCKED';
        }
      }
      feedback.update({
        effects,
        events,
        racing,
        driving,
        dt,
        speed: vehicle.speed,
        time: flowTime,
        settings: currentSettings,
      });
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
        aegis > 0
          ? `${aegis.toFixed(1)}s`
          : feedback.hitActive
            ? 'BLOCKED'
            : 'CLEAR',
        aegis / AEGIS_DURATION,
      );
      const emitter = combat?.view().emitters.player;
      audio.setEffects({ vector, ion: emitter?.kind === 'ion' });
      const displayedEmitter =
        combatNoticeTime > 0 && combatNoticePriority >= 3 ? null : emitter;
      const combatKind =
        disruption?.kind ??
        displayedEmitter?.kind ??
        (combatNoticeTime > 0 ? combatNotice : null);
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
        combatValue.textContent = disruption
          ? `SLOWED · ${disruption.remaining.toFixed(1)}s`
          : displayedEmitter
            ? combatKind === 'arc'
              ? 3 - displayedEmitter.shots + '/3'
              : remaining.toFixed(1) + 's'
            : combatNoticeValue;
        const fraction = disruption
          ? disruption.remaining / disruption.duration
          : !displayedEmitter
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
      const width = window.innerWidth;
      const height = window.innerHeight;
      let anchor = null;
      if (camera && racing && hasReadout) {
        anchor = readoutAnchor.update({
          ship: ship.group || ship,
          camera,
          width,
          height,
          dt,
        });
      } else readoutAnchor.reset();
      hud.hidden = !anchor;
      if (anchor) {
        const { x, y } = anchor;
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
      }
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
      combatVisual?.dispose();
      hitFeedback?.dispose();
      screenFeedback.dispose();
      disposeGroup(root);
      feedback.dispose();
      void audio.dispose();
    },
  };
}
