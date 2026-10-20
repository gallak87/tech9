import { Group, Quaternion, Vector3 } from 'three';
import { createShipFeedbackPresentation } from '../pickups/ship-feedback.js';
import { createCombatPresentation } from '../pickups/combat-presentation.js';
import { createHitFeedback } from '../pickups/hit-feedback.js';
import { createPickupPreviewAudio } from './pickup-preview-audio.js';
import {
  PICKUP_PREVIEWS,
  PREVIEW_TARGET_DISTANCE,
  pickupPreviewFrame,
} from './pickup-preview-sequence.js';

export function createPickupPreview({
  ship,
  target,
  getSettings,
  getDriving = () => ({}),
  onStatus = () => {},
  createAudio = createPickupPreviewAudio,
  createFeedback = createShipFeedbackPresentation,
  createCombat = createCombatPresentation,
}) {
  const root = new Group();
  root.name = 'Inspector / isolated pickup audition';
  const feedback = createFeedback();
  root.add(feedback.group);
  const pose = { position: new Vector3(), quaternion: new Quaternion() };
  let state = pickupPreviewFrame('arc', 0).combat;
  const combat = createCombat(root, { view: () => state, pose: () => pose });
  const audio = createAudio();
  const targetFeedback = target ? createHitFeedback(target) : null;
  const targetShield = target ? createFeedback() : null;
  if (targetShield) target.add(targetShield.group);
  let current = null,
    request = 0,
    disposed = false;
  root.visible = false;
  ship?.add(root);
  if (target) {
    target.position.set(0, 0, PREVIEW_TARGET_DISTANCE);
    ship?.add(target);
  }

  function stop(status = 'Ready') {
    request++;
    current = null;
    audio.stop();
    feedback.reset();
    targetFeedback?.update();
    targetShield?.reset();
    root.visible = false;
    onStatus(status);
  }
  function render(previous, dt = 0) {
    const next = pickupPreviewFrame(
      current.kind,
      current.time,
      previous,
      !!target,
      current.shielded,
    );
    state = next.combat;
    const settings = getSettings();
    audio.update(settings, true);
    audio.setEffects(next.beds);
    for (const event of next.events) {
      audio.event(event);
      current.audioDuration = Math.max(
        current.audioDuration,
        current.time + (audio.duration?.(event) ?? 0),
      );
    }
    feedback.update({
      effects: next.effects,
      events: next.events,
      time: current.time,
      dt,
      speed: getDriving().driving ? 400 / 3.6 : 0,
      settings,
    });
    combat.update({ mode: 'racing', settings });
    const hit = state.flashes.findLast(
      (flash) =>
        flash.target === 'rook' && ['arc', 'repulsor'].includes(flash.kind),
    );
    targetFeedback?.update(hit?.age, settings, hit?.kind);
    const shieldHit = next.events.some(
      (event) => event.type === 'combat-confirm' && event.payload.shielded,
    );
    if (shieldHit) current.shieldConsumed = true;
    targetShield?.update({
      effects: {
        aegisRemaining: current.shielded && !current.shieldConsumed ? 1 : 0,
      },
      events: shieldHit ? [{ type: 'shield-hit' }] : [],
      dt,
      time: current.time,
      settings,
      speed: getDriving().driving ? 400 / 3.6 : 0,
    });
    current.end = Math.max(next.end, current.audioDuration);
  }
  return {
    async trigger(kind, { shielded = false } = {}) {
      if (disposed || !PICKUP_PREVIEWS.some((entry) => entry.id === kind))
        return false;
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
        };
        root.visible = true;
        render(-1);
        onStatus(
          `Playing${target ? ` · Rook ${shielded ? 'shielded' : 'target'}` : ''}`,
        );
        return true;
      } catch (error) {
        if (!disposed && token === request) stop(error.message);
        return false;
      }
    },
    update(dt) {
      if (disposed || !current) return;
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
      next?.add(root);
      target?.removeFromParent();
      if (target) next?.add(target);
    },
    stop,
    dispose() {
      if (disposed) return;
      stop();
      disposed = true;
      audio.dispose();
      feedback.dispose();
      combat.dispose();
      targetFeedback?.dispose();
      targetShield?.dispose();
      targetShield?.group.removeFromParent();
      root.removeFromParent();
      target?.removeFromParent();
    },
  };
}
