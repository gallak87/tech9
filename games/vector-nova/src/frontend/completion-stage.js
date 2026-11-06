import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { createShip } from '../ships/index.js';
import { createRivalPreview } from '../ships/rivals.js';
import { createRenderer } from '../renderer/index.js';
import createHalcyonLevel from '../levels/halcyon/index.js';
import { createLevelPresentation } from '../levels/presentation.js';
import { createFinishMarker } from '../race/finish-marker.js';
import { createLifetime } from '../core/lifecycle.js';
import { createCompletionEffects } from './completion-effects.js';
import {
  COMPLETION_COURSE,
  completionCamera,
  completionPose,
} from './completion-course.js';
import { sampleCompletionTimeline } from './completion-timeline.js';

// This is the racing world's actual factory, road, skyline, sky and HDR pipeline.
// Only the ships and cameras are directed; no replacement map is constructed.
export function createCompletionStage({
  mount,
  shipId,
  settings,
  signal,
  onProgress,
  onError,
}) {
  const readSettings = () =>
    typeof settings === 'function' ? settings() : (settings ?? {});
  const lifetime = createLifetime();
  const loading = new AbortController();
  const models = new Map();
  let disposed = false,
    prepared = false,
    view,
    world,
    effects,
    track;
  let previousTime = 0,
    lastSample = sampleCompletionTimeline(0);
  let appliedQuality, appliedMotion;
  const abort = () => loading.abort(signal?.reason);
  if (signal?.aborted) abort();
  else signal?.addEventListener('abort', abort, { once: true });
  const own = (resource) => {
    if (disposed) {
      resource.dispose();
      throw new DOMException('Finale closed', 'AbortError');
    }
    return lifetime.own(resource);
  };
  const check = () => {
    loading.signal.throwIfAborted();
    view?.graphics.check();
  };
  function updateFrame(sample, reducedMotion) {
    const hero = models.get('hero');
    const placement = completionPose(track, sample.hero);
    const currentSettings = { ...readSettings(), reducedMotion };
    const frame = {
      state: {
        distance: placement.distance,
        lateral: sample.hero.x,
        speed: sample.hero.speed,
        heading: sample.hero.yaw,
        steer: sample.hero.steer ?? 0,
        lateralSpeed: 0,
        time: sample.time,
        energy: 100,
        boosting: sample.hero.boost,
      },
      dt: reducedMotion
        ? 0
        : Math.max(0, Math.min(0.1, sample.time - previousTime)),
      time: sample.time,
      mode: 'racing',
      camera: view.camera,
      settings: currentSettings,
      ship: hero,
      motion: {},
      reviewing: false,
    };
    world.update(frame);
    view.follow(hero.group.position);
    // Use the production contact treatment only while the hero is grounded.
    view.updateContact(
      track,
      frame.state,
      sample.hero.y > 1 ? () => 0 : world.road.userData.surfaceCoverage,
    );
    return frame;
  }
  function positionScene(sample, reducedMotion = false) {
    const next = readSettings();
    if (next.quality !== appliedQuality || reducedMotion !== appliedMotion) {
      Object.assign(renderSettings, next, { reducedMotion });
      appliedQuality = renderSettings.quality;
      appliedMotion = reducedMotion;
      view.apply();
    }
    for (const [id, model] of models) {
      const pose = sample[id];
      const placement = completionPose(track, pose);
      model.group.position.copy(placement.position);
      model.group.quaternion.copy(placement.quaternion);
      model.update({
        ...pose,
        steer: pose.steer ?? 0,
        time: sample.time,
        energy: 1,
        quality: renderSettings.quality,
        reducedMotion,
      });
    }
    const camera = completionCamera(track, sample, view.camera.aspect);
    view.camera.position.copy(camera.position);
    view.camera.up.copy(camera.up);
    view.camera.fov = sample.camera.fov;
    view.camera.lookAt(camera.target);
    view.camera.updateProjectionMatrix();
    effects.update(sample, { models, reducedMotion });
    return updateFrame(sample, reducedMotion);
  }
  function draw(time, reducedMotion = false) {
    const sample = sampleCompletionTimeline(time);
    lastSample = sample;
    if (!prepared || disposed) return sample;
    check();
    const frame = positionScene(sample, reducedMotion);
    view.render(performance.now());
    world.afterRender(frame);
    previousTime = sample.time;
    return sample;
  }
  function dispose() {
    if (disposed) return;
    disposed = true;
    loading.abort();
    signal?.removeEventListener('abort', abort);
    lifetime.dispose();
    models.clear();
  }
  const renderSettings = { ...readSettings() };
  const ready = (async () => {
    try {
      check();
      const definition = createHalcyonLevel();
      track = definition.createTrack();
      onProgress?.(0.08);
      view = own(
        await createRenderer(mount, renderSettings, {
          ...definition.renderer,
          createBackdrop: definition.createBackdrop,
          signal: loading.signal,
        }),
      );
      const canvas = view.renderer.domElement;
      canvas.removeAttribute('id');
      canvas.className = 'completion-cinematic-canvas';
      canvas.setAttribute('aria-hidden', 'true');
      window.addEventListener(
        'resize',
        () => {
          if (prepared && !disposed) {
            try {
              draw(lastSample.time, Boolean(readSettings().reducedMotion));
            } catch (error) {
              onError?.(error);
            }
          }
        },
        { signal: loading.signal },
      );
      canvas.addEventListener(
        'webglcontextlost',
        () => {
          if (!disposed)
            onError?.(new Error('Finale graphics context was lost.'));
        },
        { signal: loading.signal },
      );
      onProgress?.(0.22);
      world = own(
        await createLevelPresentation(definition, {
          track,
          view,
          host: mount,
          settings: renderSettings,
          checkpoint: async () => {
            check();
            await new Promise((resolve) => setTimeout(resolve, 0));
            check();
          },
        }),
      );
      check();
      const marker = own(
        createFinishMarker(track, definition.racing?.finishMarker),
      );
      world.road.add(marker.group);
      onProgress?.(0.55);
      effects = own(createCompletionEffects({ scene: view.scene, track }));
      const loader = new GLTFLoader();
      const loadAsset = async (url) => {
        const response = await fetch(url, { signal: loading.signal });
        if (!response.ok) throw new Error('Completion craft could not load.');
        return loader.parseAsync(
          await response.arrayBuffer(),
          new URL('.', new URL(url, document.baseURI)).href,
        );
      };
      async function load(id, create) {
        const model = own(await create());
        check();
        models.set(id, model);
        view.scene.add(model.group);
        lifetime.defer(() => model.group.removeFromParent());
        onProgress?.(0.55 + models.size * 0.08);
      }
      await Promise.all([
        load('hero', () => createShip({ id: shipId })),
        load('rook', () =>
          createRivalPreview('rook', { loadAsset, settings: renderSettings }),
        ),
        load('manta', () =>
          createRivalPreview('manta', { loadAsset, settings: renderSettings }),
        ),
      ]);
      check();
      const reflectionPoint = track
        .sample(100)
        .position.addScaledVector(track.sample(100).up, 8);
      const reflection = view.bakeCityReflection(
        reflectionPoint,
        [...models.values()].map((model) => model.group),
      );
      for (const model of models.values())
        model.group.traverse((object) => {
          for (const material of Array.isArray(object.material)
            ? object.material
            : [object.material])
            if (material?.isMeshStandardMaterial) material.envMap = reflection;
        });
      world.setReflection(reflection);
      positionScene(lastSample, Boolean(readSettings().reducedMotion));
      onProgress?.(0.85);
      await view.warm();
      check();
      prepared = true;
      draw(lastSample.time, Boolean(readSettings().reducedMotion));
      onProgress?.(1);
      return { world: COMPLETION_COURSE };
    } catch (error) {
      dispose();
      throw error;
    }
  })();
  return {
    ready,
    draw,
    dispose,
    metrics: () => ({
      world: COMPLETION_COURSE,
      ...(view && !disposed ? view.getMetrics() : {}),
    }),
  };
}
