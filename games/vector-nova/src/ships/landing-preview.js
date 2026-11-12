import { Quaternion, Vector3 } from 'three';
import { createAudio } from '../audio/index.js';
import { createFreestyleAudio } from '../freestyle/audio.js';
import { createFreestyleCatchVfx } from '../freestyle/catch-vfx.js';
import { createLandingVfx } from '../presentation/landing-vfx.js';
import { effectsVolume } from '../progression/index.js';
import { landingDemonstration } from './landing-demonstration.js';

// This surface is the existing inspection plinth, expressed through the
// rotating studio frame. The gameplay VFX owner still projects every vertex.
function studioSurface(frame) {
  return {
    sample(distance = 0) {
      frame.updateWorldMatrix(true, false);
      const quaternion = frame.getWorldQuaternion(new Quaternion());
      return {
        position: frame.localToWorld(new Vector3(0, -0.65, distance)),
        quaternion,
        right: new Vector3(1, 0, 0).applyQuaternion(quaternion),
        up: new Vector3(0, 1, 0).applyQuaternion(quaternion),
        tangent: new Vector3(0, 0, 1).applyQuaternion(quaternion),
      };
    },
  };
}

export function createLandingPreview({
  ship,
  frame,
  getSettings,
  createRaceAudio = createAudio,
  createGradedAudio = createFreestyleAudio,
}) {
  const track = studioSurface(frame);
  let common,
    graded,
    audio,
    active = false,
    paused = false,
    disposed = false;
  let demo = null,
    tail = 0;

  function stop() {
    active = false;
    paused = false;
    demo = null;
    tail = 0;
    audio?.resetEnvironment();
    audio?.update({}, effectsVolume(getSettings()), false);
    common?.reset();
    graded?.reset();
    ship?.position.set(0, 0, 0);
    ship?.quaternion.identity();
  }

  return {
    async prepare(kind) {
      if (disposed) throw new Error('Landing preview unavailable');
      common ??= createLandingVfx({ track, namePrefix: 'Inspector landing' });
      graded ??= createFreestyleCatchVfx({ track });
      const scene = frame.parent ?? frame;
      if (!common.group.parent) scene.add(common.group);
      if (!graded.group.parent) scene.add(graded.group);
      audio ??= createRaceAudio({
        engine: false,
        samples: {},
        environment: createGradedAudio,
      });
      if (!(await audio.unlock())) throw new Error('Audio unavailable');
      if (audio.getStatus().landing?.loaded === false)
        throw new Error('Sample unavailable: landing-catch');
      if (
        kind.startsWith('freestyle-') &&
        audio.getPresentation()?.loaded === false
      )
        throw new Error('Samples unavailable: Freestyle rewards');
      return 0;
    },
    update(kind, time, isPaused = false, previous = -1) {
      if (disposed) return null;
      active = true;
      paused = isPaused;
      const settings = getSettings();
      demo = landingDemonstration(kind, time, previous, settings.reducedMotion);
      ship?.position.fromArray(demo.position);
      ship?.rotation.set(...demo.rotation);
      frame.updateWorldMatrix(true, true);
      const renderFrame = {
        ship: ship ? { group: ship } : null,
        state: { distance: 0, lateral: 0 },
        mode: paused ? 'paused' : 'racing',
        settings,
        motion: { freestyle: demo.freestyle },
      };
      if (kind.startsWith('freestyle-')) {
        common?.reset();
        graded?.update(renderFrame);
      } else {
        graded?.reset();
        common?.update(renderFrame, demo.landing);
      }
      audio?.update({}, effectsVolume(settings), !paused);
      if (!paused)
        for (const event of demo.events) {
          audio?.event(event);
          tail = Math.max(tail, time + (audio?.duration(event) ?? 0));
        }
      return { ...demo, end: Math.max(demo.end, tail) };
    },
    configure() {
      audio?.update({}, effectsVolume(getSettings()), active && !paused);
    },
    setShip(next) {
      stop();
      ship = next;
    },
    stop,
    getSnapshot() {
      return {
        active,
        paused,
        grade: demo?.grade ?? null,
        airborne: demo?.airborne ?? false,
        contactAt: demo?.landing.contact?.at ?? null,
        bankAt: demo?.freestyle.legs.at(-1)?.at ?? null,
        vfx: demo?.kind.startsWith('freestyle-')
          ? (graded?.getPresentation() ?? null)
          : (common?.getPresentation() ?? null),
        audio: audio?.getPresentation() ?? null,
        touchdownAudio: audio?.getStatus().landing ?? null,
      };
    },
    dispose() {
      if (disposed) return;
      stop();
      disposed = true;
      for (const owner of [common, graded]) {
        owner?.group.removeFromParent();
        owner?.dispose();
      }
      void Promise.resolve(audio?.dispose()).catch(() => {});
    },
  };
}
