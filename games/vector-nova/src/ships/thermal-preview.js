import { createShipHeatEffects } from '../effects/ship-heat.js';
import { createAudio } from '../audio/index.js';
import { createHazardContactAudio } from '../audio/hazard-contact.js';
import { effectsVolume } from '../progression/index.js';

export const THERMAL_PREVIEW_CONTACT = 4;
export const THERMAL_PREVIEW_DURATION = THERMAL_PREVIEW_CONTACT + 5;

// An authored studio contact, not a map or vehicle simulation. The same hull,
// smoke, flame and sound owners used in gameplay consume this bounded frame.
export function thermalPreviewFeedback(time = 0) {
  const contact = Number(time < THERMAL_PREVIEW_CONTACT);
  const contactAge = contact ? 0 : Math.min(5, time - THERMAL_PREVIEW_CONTACT);
  const envelope = Math.pow(1 - contactAge / 5, 0.75);
  return {
    contact,
    contactAge,
    contactDuration: contact ? time : 0,
    envelope,
    smoke: 0.96 * envelope,
    flame: 0.37 * Math.pow(envelope, 1.6),
  };
}

export function createThermalPreview({
  ship,
  scene,
  camera,
  getSettings,
  createRaceAudio = createAudio,
  createContactAudio = createHazardContactAudio,
}) {
  let effects,
    audio,
    active = false,
    paused = false,
    time = 0,
    disposed = false;

  function render() {
    const settings = getSettings();
    const feedback = active ? thermalPreviewFeedback(time) : {};
    effects?.update({
      ship: ship ? { group: ship } : null,
      camera,
      time,
      mode: active ? (paused ? 'paused' : 'racing') : 'title',
      settings,
      feedback,
    });
    if (!audio) return;
    audio.update({}, effectsVolume(settings), active && !paused);
    audio.setEnvironment({
      mode: active && !paused ? 'racing' : 'paused',
      feedback,
    });
  }
  function stop() {
    active = false;
    paused = false;
    time = 0;
    audio?.update({}, effectsVolume(getSettings()), false);
    audio?.resetEnvironment();
    effects?.reset();
  }

  return {
    async prepare() {
      if (disposed) throw new Error('Fire preview unavailable');
      if (!effects) {
        effects = createShipHeatEffects((frame) => frame.feedback ?? {}, {
          label: 'Inspector fire',
        });
        // Shared plumes already use world-space hull/camera poses. They must
        // not inherit the studio frame's rotation a second time.
        scene.add(effects.group);
      }
      audio ??= createRaceAudio({
        engine: false,
        samples: {},
        environment: (context, bus) =>
          createContactAudio(context, bus, {
            readFeedback: (frame) => frame.feedback,
          }),
      });
      if (!(await audio.unlock())) throw new Error('Audio unavailable');
      if (audio.getPresentation()?.loaded !== true)
        throw new Error('Sample unavailable: fire-contact');
      return 0;
    },
    update(nextTime, isPaused = false) {
      if (disposed) return;
      active = true;
      time = Math.max(0, nextTime);
      paused = isPaused;
      render();
    },
    configure() {
      if (!disposed) render();
    },
    setShip(next) {
      stop();
      effects?.dispose();
      effects = null;
      ship = next;
    },
    stop,
    getSnapshot() {
      const outline = ship?.getObjectByName(
        'Thermal contact / lava-red hull envelope',
      );
      const fire = effects?.group.getObjectByName(
        'Inspector fire / small aft hull flames',
      );
      const heat = effects?.heatSource.userData.exhaustHeat;
      return {
        active,
        paused,
        ...(active
          ? thermalPreviewFeedback(time)
          : {
              contact: 0,
              contactAge: 5,
              contactDuration: 0,
              envelope: 0,
              smoke: 0,
              flame: 0,
            }),
        outlineVisible: !!outline?.visible,
        outlineStrength:
          outline?.children[0]?.material.uniforms.strength.value ?? 0,
        smokeVisible: !!effects?.group.visible,
        flameVisible: !!effects?.group.visible && !!fire?.visible,
        heatwaveEnabled: !!heat?.enabled,
        heatwaveAmount: heat?.strength ?? 0,
        heatwaveDrawSuppressed: !heat?.enabled,
        audio: audio?.getPresentation() ?? null,
      };
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      effects?.dispose();
      void Promise.resolve(audio?.dispose()).catch(() => {});
    },
  };
}
