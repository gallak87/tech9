import { Group, Quaternion, Vector3 } from 'three';
import { createShipFeedbackPresentation } from '../pickups/ship-feedback.js';
import { createCombatPresentation } from '../pickups/combat-presentation.js';
import { createHitFeedback } from '../pickups/hit-feedback.js';
import { createPickupPreviewAudio } from './pickup-preview-audio.js';
import { createEquipmentEffects } from '../equipment/effects.js';
import {
  DEVICE_PREVIEWS,
  PREVIEW_TARGET_DISTANCE,
  pickupPreviewFrame,
} from './pickup-preview-sequence.js';

export function createPickupPreview({
  ship,
  target,
  frame,
  getSettings,
  getDriving = () => ({}),
  onStatus = () => {},
  onDemonstration = () => {},
  createAudio = createPickupPreviewAudio,
  createFeedback = createShipFeedbackPresentation,
  createCombat = createCombatPresentation,
}) {
  const root = new Group();
  root.name = 'Inspector / isolated pickup audition';
  const combatRoot = new Group();
  combatRoot.name = 'Inspector / independent rival and combat frame';
  frame.add(combatRoot);
  const feedback = createFeedback(getSettings());
  root.add(feedback.group);
  const equipment = createEquipmentEffects(root);
  const pose = { position: new Vector3(), quaternion: new Quaternion() };
  const localPose = { position: new Vector3(), quaternion: new Quaternion() };
  const targetPose = {
    position: new Vector3(0, 0, PREVIEW_TARGET_DISTANCE),
    quaternion: new Quaternion(),
  };
  let state = pickupPreviewFrame('arc', 0).combat;
  const combat = createCombat(
    combatRoot,
    {
      view: () => state,
      pose: (id) => (id === 'rook' ? targetPose : pose),
    },
    getSettings(),
  );
  let playerFeedback;
  function attachPlayer(next) {
    playerFeedback?.dispose();
    playerFeedback = next ? createHitFeedback(next, getSettings()) : null;
    if (playerFeedback) root.add(playerFeedback.group);
  }
  attachPlayer(ship);
  const audio = createAudio();
  const targetFeedback = target
    ? createHitFeedback(target, getSettings())
    : null;
  const targetShield = target ? createFeedback(getSettings()) : null;
  if (targetShield) target.add(targetShield.group);
  let current = null,
    request = 0,
    disposed = false,
    selectedKind = 'ion';
  const showTarget = () =>
    !!ship &&
    ['ion', 'arc', 'repulsor', 'lance', 'slipstream', 'deflector-hit'].includes(
      selectedKind,
    );
  root.visible = false;
  combatRoot.visible = false;
  ship?.add(root);
  if (target) {
    target.position.set(0, 0, PREVIEW_TARGET_DISTANCE);
    frame.add(target);
  }

  function stop(status = 'Ready') {
    request++;
    current = null;
    audio.stop();
    feedback.reset();
    equipment.reset();
    targetFeedback?.update();
    playerFeedback?.update();
    targetShield?.reset();
    ship?.position.set(0, 0, 0);
    ship?.quaternion.identity();
    pose.position.set(0, 0, 0);
    pose.quaternion.identity();
    target?.position.set(0, 0, PREVIEW_TARGET_DISTANCE);
    if (target) target.visible = showTarget();
    targetPose.position.set(0, 0, PREVIEW_TARGET_DISTANCE);
    root.visible = false;
    combatRoot.visible = false;
    onDemonstration(null);
    onStatus(status);
  }
  function render(previous, dt = 0) {
    const settings = getSettings();
    const next = pickupPreviewFrame(
      current.kind,
      current.time,
      previous,
      !!target,
      current.shielded,
      settings.reducedMotion,
    );
    const demo = next.demo;
    ship?.position.fromArray(demo.position);
    ship?.rotation.set(...demo.rotation);
    if (ship) {
      pose.position.copy(ship.position);
      pose.quaternion.copy(ship.quaternion);
    }
    target?.position.fromArray(demo.target);
    targetPose.position.fromArray(demo.target);
    onDemonstration(demo);
    const status = demo.stage
      ? `Demo · ${demo.stage}`
      : `Playing${
          target && ['ion', 'arc', 'repulsor', 'lance'].includes(current.kind)
            ? current.kind === 'ion'
              ? ` · Rook → ${current.shielded ? 'your shield' : 'your ship'}`
              : ` · Rook ${current.shielded ? 'shielded' : 'target'}`
            : ' · your ship'
        }`;
    if (current.status !== status) {
      current.status = status;
      onStatus(status);
    }
    state = next.combat;
    audio.update(settings, true);
    audio.setEffects(next.beds);
    for (const event of next.events) {
      audio.event(event);
      current.audioDuration = Math.max(
        current.audioDuration,
        current.time + (audio.duration?.(event) ?? 0),
      );
    }
    const incoming = current.kind === 'ion' && !!target;
    const sourceEvents = incoming
      ? next.events.filter(
          (event) => !['pickup-activate', 'pickup-expire'].includes(event.type),
        )
      : next.events;
    feedback.update({
      effects: next.effects,
      events: sourceEvents,
      time: current.time,
      dt,
      speed: getDriving().driving ? 400 / 3.6 : 0,
      settings,
    });
    combat.update({ mode: 'racing', settings });
    equipment.update({
      equipment: next.equipment,
      pose: localPose,
      mode: 'racing',
      reducedMotion: settings.reducedMotion,
      settings,
      events: next.events,
      motion: demo,
    });
    const hit = state.flashes.findLast(
      (flash) =>
        flash.target === 'rook' && ['arc', 'repulsor'].includes(flash.kind),
    );
    targetFeedback?.update(hit?.age, settings, hit?.kind, {
      equipment: hit?.equipment,
    });
    const playerHit = state.flashes.findLast(
      (flash) => flash.target === 'player' && flash.kind === 'ion',
    );
    playerFeedback?.update(playerHit?.age, settings, 'ion', {
      ionContact: next.ionContact,
      time: current.time,
    });
    const shieldHit = next.events.some(
      (event) => event.type === 'combat-confirm' && event.payload.shielded,
    );
    if (shieldHit) current.shieldConsumed = true;
    targetShield?.update({
      effects: {
        aegisRemaining:
          !incoming && current.shielded && !current.shieldConsumed ? 1 : 0,
      },
      events: incoming
        ? next.events.filter((event) =>
            ['pickup-activate', 'pickup-expire'].includes(event.type),
          )
        : shieldHit
          ? [{ type: 'shield-hit' }]
          : [],
      dt,
      time: current.time,
      settings,
      speed: getDriving().driving ? 400 / 3.6 : 0,
    });
    current.end = Math.max(next.end, current.audioDuration);
  }
  return {
    async trigger(kind, { shielded = false, paused = false, time = 0 } = {}) {
      if (disposed || !DEVICE_PREVIEWS.some((entry) => entry.id === kind))
        return false;
      selectedKind = kind;
      stop('Preparing…');
      const token = request;
      try {
        const audioDuration = await audio.prepare(kind);
        if (disposed || token !== request) return false;
        current = {
          kind,
          time: 0,
          audioDuration,
          shielded,
          shieldConsumed: false,
          paused,
        };
        root.visible = true;
        combatRoot.visible = true;
        render(-1);
        if (time > 0) {
          current.time = Math.max(0, time);
          render(0);
        }
        return true;
      } catch (error) {
        if (!disposed && token === request) stop(error.message);
        return false;
      }
    },
    update(dt) {
      if (disposed || !current) return;
      if (current.paused) {
        render(current.time);
        return;
      }
      const previous = current.time;
      current.time += dt;
      render(previous, dt);
      if (current.time >= current.end) stop();
    },
    configure() {
      if (!disposed) audio.update(getSettings(), !!current);
    },
    setShip(next) {
      stop();
      root.removeFromParent();
      attachPlayer(next);
      ship = next;
      next?.add(root);
      if (target) target.visible = showTarget();
    },
    select(kind) {
      selectedKind = kind;
      stop();
    },
    getSnapshot: () => ({
      kind: current?.kind ?? null,
      time: current?.time ?? 0,
      stage: current?.status ?? 'Ready',
      position: pose.position.toArray(),
      quaternion: pose.quaternion.toArray(),
      target: targetPose.position.toArray(),
    }),
    stop,
    dispose() {
      if (disposed) return;
      stop();
      disposed = true;
      audio.dispose();
      feedback.dispose();
      equipment.dispose();
      combat.dispose();
      playerFeedback?.dispose();
      targetFeedback?.dispose();
      targetShield?.dispose();
      targetShield?.group.removeFromParent();
      root.removeFromParent();
      combatRoot.removeFromParent();
      target?.removeFromParent();
    },
  };
}
