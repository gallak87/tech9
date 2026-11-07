import { Quaternion, Vector3 } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { createShip } from '../ships/index.js';
import { createRivalPreview } from '../ships/rivals.js';
import { createRenderer } from '../renderer/index.js';
import createShatterlineLevel from '../levels/shatterline/index.js';
import { createFinishMarker } from '../race/finish-marker.js';
import { createLevelPresentation } from '../levels/presentation.js';
import { createLifetime } from '../core/lifecycle.js';
import { createCompletionEffects } from './completion-effects.js';
import { loadCompletionRun, sampleCompletionRun } from './completion-run.js';
import { createCompletionDirector } from './completion-timeline.js';

// Record production physics first, then play its poses and events at 1× in the
// production Shatterline world. The director controls only the camera.
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
  const lifetime = createLifetime(),
    loading = new AbortController(),
    models = new Map();
  const localRoll = new Quaternion(),
    forward = new Vector3(0, 0, 1);
  let disposed = false,
    prepared = false,
    view,
    world,
    effects,
    track,
    run,
    director;
  let previousTime = 0,
    requestedTime = 0,
    lastSample = null;
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
  function positionScene(sample, reducedMotion = false) {
    const next = readSettings();
    if (next.quality !== appliedQuality || reducedMotion !== appliedMotion) {
      Object.assign(renderSettings, next, { reducedMotion });
      appliedQuality = renderSettings.quality;
      appliedMotion = reducedMotion;
      view.apply();
    }
    for (const [id, model] of models) {
      const actor = sample[id];
      model.group.position.fromArray(actor.position);
      model.group.quaternion.fromArray(actor.quaternion);
      if (actor.steeringBank) {
        localRoll.setFromAxisAngle(forward, actor.state.steer * 0.08);
        model.group.quaternion.multiply(localRoll);
      }
      model.update({
        speed: actor.state.speed,
        boost: actor.state.boosting,
        catapulting: actor.effects.vectorActive,
        steer: actor.state.steer,
        time: sample.time,
        energy: actor.state.energy / 100,
        quality: renderSettings.quality,
        reducedMotion,
      });
    }
    const directed = director.sample(sample.time, sample, view.camera.aspect);
    Object.assign(sample, { shot: directed.shot, title: directed.title });
    view.camera.position.copy(directed.position);
    view.camera.up.copy(directed.up);
    view.camera.fov = directed.fov;
    view.camera.lookAt(directed.target);
    view.camera.updateProjectionMatrix();
    effects.update(sample, { models, reducedMotion, camera: view.camera });
    const hero = models.get('hero');
    const frame = {
      state: sample.hero.state,
      dt: reducedMotion
        ? 0
        : Math.max(0, Math.min(0.1, sample.time - previousTime)),
      time: sample.hero.state.time,
      mode: 'racing',
      camera: view.camera,
      settings: { ...readSettings(), reducedMotion },
      ship: hero,
      motion: sample.hero.motion,
      reviewing: false,
    };
    world.update(frame);
    view.follow(hero.group.position);
    view.updateContact(
      track,
      frame.state,
      sample.hero.grounded ? world.road.userData.surfaceCoverage : () => 0,
    );
    return frame;
  }
  function draw(time, reducedMotion = false) {
    requestedTime = time;
    if (!prepared || disposed) return lastSample;
    check();
    const sample = sampleCompletionRun(run, time),
      frame = positionScene(sample, reducedMotion);
    view.render(performance.now());
    world.afterRender(frame);
    previousTime = sample.time;
    lastSample = sample;
    return sample;
  }
  function dispose() {
    if (disposed) return;
    disposed = true;
    loading.abort();
    signal?.removeEventListener('abort', abort);
    lifetime.dispose();
    models.clear();
    run = null;
  }
  const renderSettings = { ...readSettings() };
  const ready = (async () => {
    try {
      check();
      const definition = createShatterlineLevel();
      track = definition.createTrack();
      onProgress?.(0.03);
      run = await loadCompletionRun({
        track,
        shipId,
        signal: loading.signal,
        onProgress: (progress) => onProgress?.(0.03 + progress * 0.32),
      });
      check();
      director = createCompletionDirector({ track, run });
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
      onProgress?.(0.4);
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
      const finish = own(
        createFinishMarker(track, definition.racing?.finishMarker),
      );
      world.road.add(finish.group);
      onProgress?.(0.62);
      effects = own(
        createCompletionEffects({
          scene: view.scene,
          track,
          road: world.road,
          run,
          settings: readSettings,
        }),
      );
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
        onProgress?.(0.62 + models.size * 0.06);
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
      const reflectionFrame = track.sample(run.landmarks.startDistance);
      const reflectionPoint = reflectionFrame.position.addScaledVector(
        reflectionFrame.up,
        8,
      );
      view.follow(reflectionPoint);
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
      lastSample = sampleCompletionRun(run, requestedTime);
      positionScene(lastSample, Boolean(readSettings().reducedMotion));
      onProgress?.(0.86);
      await view.warm();
      check();
      prepared = true;
      draw(requestedTime, Boolean(readSettings().reducedMotion));
      onProgress?.(1);
      return { world: 'shatterline', source: 'native-replay' };
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
      world: 'shatterline',
      source: 'native-replay',
      ...(run
        ? {
            replay: {
              identity: run.identity,
              duration: run.duration,
              landmarks: run.landmarks,
              outcome: run.outcome,
              time: lastSample?.time ?? 0,
              shot: lastSample?.shot,
              speed: lastSample?.hero.state.speed,
              distance: lastSample?.hero.state.distance,
              grounded: lastSample?.hero.grounded,
              race: lastSample?.hero.race,
              slide: lastSample?.hero.effects.slide,
            },
          }
        : {}),
      ...(view && !disposed ? view.getMetrics() : {}),
    }),
  };
}
