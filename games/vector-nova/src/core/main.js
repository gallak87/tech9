import * as T from 'three';
import { createShip } from '../ships/index.js';
import { createRenderer } from '../renderer/index.js';
import { createVehicleState, STEERING_ASSIST } from '../physics/index.js';
import { createRace } from '../race/index.js';
import { createInput } from '../input/index.js';
import { createCameraRig } from '../camera/index.js';
import { createAudio } from '../audio/index.js';
import { createEffects } from '../effects/index.js';
import { createUI } from '../ui/index.js';
import { loadSettings, saveSettings } from '../progression/index.js';
import { createFlyCamera } from './fly-camera.js';
import { createReviewCamera } from './review-camera.js';
import { discoverLevels } from '../levels/catalog.js';
import { validateTrack, circuitURL } from '../levels/contract.js';
import { createLevelPresentation } from '../levels/presentation.js';
import { createLifetime } from './lifecycle.js';
import {
  createMagneticRuntime,
  runtimeIdentity,
  compatibleRuntime,
  advanceSession,
  captureInitial,
  restoreReplayInitial,
  validateReplayInputs,
} from './session-runtime.js';
const parameters = new URLSearchParams(location.search);
const host = document.querySelector('#app');
const errors = [];
const lifetime = createLifetime();
const listeners = new AbortController();
lifetime.defer(() => listeners.abort());
function fail(error) {
  errors.push(String(error?.stack || error));
  document.querySelector('#loading')?.remove();
  const panel = document.createElement('div');
  panel.className = 'failure';
  const h = document.createElement('h1');
  h.textContent = 'PROVING GROUND OFFLINE';
  const p = document.createElement('p');
  p.textContent = error?.message || String(error);
  const b = document.createElement('button');
  b.textContent = 'RELOAD';
  b.onclick = () => location.reload();
  const home = document.createElement('button');
  home.textContent = 'RETURN TO PADDOCK';
  home.onclick = () => location.assign(circuitURL(location.href, 'halcyon'));
  panel.append(h, p, b, home);
  host.append(panel);
}
window.addEventListener('error', (e) => errors.push(e.message), {
  signal: listeners.signal,
});
window.addEventListener(
  'unhandledrejection',
  (e) => errors.push(String(e.reason)),
  { signal: listeners.signal },
);
async function boot() {
  const levelCatalog = discoverLevels();
  const {
    metadata,
    definition,
    shape: blockout,
  } = await levelCatalog.load(parameters.get('level'), {
    review: parameters.get('review'),
    features: parameters.get('features'),
  });
  const VERSION = definition.version;
  const settings = loadSettings();
  const track = validateTrack(await definition.createTrack());
  const view = lifetime.own(
    await createRenderer(host, settings, {
      ...definition.renderer,
      shape: blockout,
      createBackdrop: definition.createBackdrop,
    }),
  );
  const { scene, camera, renderer } = view;
  const world = lifetime.own(
    await createLevelPresentation(definition, { track, view, host, settings }),
  );
  const { road, environment } = world;
  const reviewCamera = metadata.review
    ? createReviewCamera(track, camera)
    : null;
  const signatureReview = parameters.get('review') === 'signature';
  const ship = lifetime.own(await createShip(definition.ship));
  lifetime.defer(() => ship.group.removeFromParent());
  const inspectionBounds = new T.Box3().setFromObject(ship.group);
  const inspectionExtent = {
    radial: Math.hypot(
      Math.max(
        Math.abs(inspectionBounds.min.x),
        Math.abs(inspectionBounds.max.x),
      ),
      Math.max(
        Math.abs(inspectionBounds.min.z),
        Math.abs(inspectionBounds.max.z),
      ),
    ),
    vertical: Math.max(
      Math.abs(inspectionBounds.min.y + 0.15 - 0.7),
      Math.abs(inspectionBounds.max.y + 0.15 - 0.7),
    ),
  };
  scene.add(ship.group);
  // One district-scale radiance probe gives the craft real nearby architecture
  // in its reflections. It is a static approximation, generated from this scene.
  const reflectionPoint = track
    .sample(100)
    .position.add(new T.Vector3(0, 8, 0));
  view.follow(reflectionPoint);
  const cityReflection = view.bakeCityReflection(reflectionPoint, [ship.group]);
  ship.group.traverse((object) => {
    for (const material of Array.isArray(object.material)
      ? object.material
      : [object.material])
      if (material?.isMeshStandardMaterial) material.envMap = cityReflection;
  });
  world.setReflection(cityReflection);
  const inspectionScene = new T.Scene();
  inspectionScene.background = new T.Color('#64747d');
  inspectionScene.environment = scene.environment;
  inspectionScene.environmentIntensity = 1.5;
  inspectionScene.add(new T.HemisphereLight('#eaf5ff', '#74818b', 3.4));
  const key = new T.DirectionalLight('#fff1d9', 5);
  key.position.set(-7, 10, 8);
  inspectionScene.add(key);
  const rim = new T.DirectionalLight('#b9daff', 4);
  rim.position.set(7, 4, -6);
  inspectionScene.add(rim);
  const floor = new T.Mesh(
    new T.CylinderGeometry(10, 10, 0.4, 96),
    new T.MeshStandardMaterial({
      color: '#667880',
      roughness: 0.65,
      metalness: 0.35,
    }),
  );
  floor.position.y = -0.9;
  inspectionScene.add(floor);
  const ring = new T.Mesh(
    new T.TorusGeometry(7.8, 0.025, 6, 128),
    new T.MeshBasicMaterial({ color: '#b6c4c4' }),
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = -0.68;
  inspectionScene.add(ring);
  lifetime.defer(() => {
    floor.geometry.dispose();
    floor.material.dispose();
    ring.geometry.dispose();
    ring.material.dispose();
    inspectionScene.clear();
  });
  let state = createVehicleState(),
    prev = { ...state },
    race,
    mode = 'title',
    cameraMode = 'chase',
    scenario = 'staging',
    seed = 7,
    tick = 0,
    accumulator = 0,
    last = 0,
    time = 0,
    raf = 0,
    active = true,
    inspectionTime = 0,
    inspectionLayout = null;
  const inputLog = [],
    events = [],
    audio = lifetime.own(createAudio(definition.audio)),
    rig = createCameraRig(camera, definition.camera, inspectionBounds),
    effects = lifetime.own(createEffects(scene, definition.effects));
  lifetime.defer(() => {
    active = false;
    cancelAnimationFrame(raf);
    if (window.__VN) window.__VN.ready = false;
  });
  const emit = (e) => {
    const event = { ...e, tick, time: state.time };
    events.push(event);
    if (events.length > 500) events.shift();
    try {
      audio.event(event);
    } catch {
      /* Decorative audio must not interrupt physics. */
    }
    if (e.type === 'impact') {
      ui.notice(
        e.payload.source === 'nacre-edge-catch'
          ? 'EDGE CATCH · SMALL SPEED LOSS'
          : e.payload.shielded
            ? 'BARRIER CONTACT · SHIELD PROTECTED RESERVE'
            : 'BARRIER CONTACT · RESERVE LOST',
      );
      effects.impact(
        track.sample(e.payload.distance ?? state.distance),
        e.payload.lateral ??
          (definition.railContactSparks
            ? Number.isFinite(e.payload.railLateral)
              ? e.payload.railLateral - e.payload.side * 0.4
              : e.payload.side * (track.width / 2 - 0.4)
            : state.lateral),
      );
    }
    if (e.type === 'jump-transfer') prev = { ...state };
    if (e.type === 'jump-transfer')
      ui.notice(
        e.payload.outcome === 'recovered'
          ? `RECOVERED BEYOND LANDING · ${race.valid ? 'LAP VALID' : 'UNTIMED SESSION'} · W TO RESUME`
          : e.payload.edgeCaught
            ? 'EDGE CATCH · LANDING CONFIRMED'
            : 'LANDING CONFIRMED',
      );
    if (e.type === 'lap')
      ui.notice(
        `${e.payload.valid ? 'LAP COMPLETE' : 'INVALID LAP'} · ${e.payload.duration.toFixed(3)}s`,
      );
  };
  const runtime = lifetime.own(
    await (definition.createRuntime ?? createMagneticRuntime)({
      track,
      scene,
      ship,
      host,
      settings,
      emit,
    }),
  );
  const makeRace = () => createRace(track, { rulesId: runtime.rulesId });
  const resetRuntime = (reason) => {
    runtime.reset({ reason, state, scenario, seed });
    audio.resetEnvironment();
    world.reset();
  };
  const advance = (control) =>
    advanceSession({ state, input: control, dt: 1 / 120, runtime, race, emit });
  race = makeRace();
  resetRuntime('initialize');
  let initial = captureInitial(state, runtime);
  function sceneShip() {
    if (ship.group.parent !== scene) scene.add(ship.group);
  }
  function start() {
    if (mode === 'fly') {
      leaveFly();
      return;
    }
    sceneShip();
    const newRun =
      mode === 'title' || mode === 'inspection' || mode === 'overview';
    if (newRun) {
      scenario = 'staging';
      state = createVehicleState();
      prev = { ...state };
      race = makeRace();
      resetRuntime('fresh-lap');
      initial = captureInitial(state, runtime);
      tick = 0;
      inputLog.length = 0;
      events.length = 0;
      view.resetMetrics();
    }
    mode = 'racing';
    cameraMode = 'chase';
    accumulator = 0;
    rig.reset();
    audio.unlock().catch(() => {});
    input.clear();
    ui.setMode(mode);
    // Review links still enter through the real start button/audio gesture.
    // Normal launch and fresh-lap actions retain the complete circuit.
    if (newRun && signatureReview && track.scenarios['signature-entry']) {
      window.__VN.loadScenario('signature-entry', 47219);
      ui.notice('SIGNATURE PLAYTEST · LAP UNTIMED');
    }
  }
  function pause() {
    if (mode !== 'racing') return;
    mode = 'paused';
    accumulator = 0;
    input.clear();
    ui.setMode(mode);
  }
  function resume() {
    flyCamera?.leave();
    mode = 'racing';
    accumulator = 0;
    input.clear();
    ui.setMode(mode);
    audio.unlock().catch(() => {});
  }
  function restart() {
    flyCamera?.leave();
    scenario = 'staging';
    sceneShip();
    state = createVehicleState();
    prev = { ...state };
    race = makeRace();
    resetRuntime('fresh-lap');
    initial = captureInitial(state, runtime);
    mode = 'racing';
    cameraMode = 'chase';
    accumulator = 0;
    tick = 0;
    input.clear();
    inputLog.length = 0;
    events.length = 0;
    rig.reset();
    view.resetMetrics();
    ui.notice('');
    ui.setMode(mode);
  }
  function recover() {
    if (mode !== 'racing') return;
    state.distance = race.recover();
    state.lateral = 0;
    state.heading = 0;
    state.steeringHeading = 0;
    state.lateralSpeed = 0;
    state.speed = 0;
    state.resetCount++;
    resetRuntime('manual-recover');
    prev = { ...state };
    rig.reset();
    emit({ type: 'recover', payload: { penalty: 'current lap invalid' } });
    ui.notice('RECOVERED AT CHECKPOINT · LAP INVALID');
  }
  function home() {
    flyCamera?.leave();
    sceneShip();
    mode = 'title';
    state = createVehicleState();
    resetRuntime('home');
    prev = { ...state };
    cameraMode = 'chase';
    input.clear();
    rig.reset();
    ui.setMode(mode);
  }
  function setCamera(preset) {
    if (preset === 'fly') {
      toggleFly();
      return;
    }
    flyCamera?.leave();
    if (preset === 'inspection') {
      mode = 'inspection';
      inspectionScene.add(ship.group);
      ship.group.position.set(0, 0.1, 0);
      ship.group.quaternion.identity();
      inspectionTime = 0;
      inspectionLayout = null;
      world.reset();
      input.clear();
    } else {
      sceneShip();
      cameraMode = preset;
      mode = 'racing';
      rig.reset();
    }
    ui.setMode(mode);
  }
  function overview(preset = 'perspective') {
    if (!reviewCamera) return;
    flyCamera?.leave();
    sceneShip();
    reviewCamera.select(preset);
    mode = 'overview';
    accumulator = 0;
    input.clear();
    rig.reset();
    ui.setMode(mode);
  }
  let flyReturnMode = 'title';
  function toggleFly() {
    if (!flyCamera || mode === 'inspection') return;
    if (mode === 'fly') {
      leaveFly();
      return;
    }
    flyReturnMode = mode;
    sceneShip();
    flyCamera.enter();
    mode = 'fly';
    accumulator = 0;
    input.clear();
    ui.setMode(mode);
  }
  function leaveFly() {
    if (mode !== 'fly') return;
    flyCamera.leave();
    mode = flyReturnMode;
    accumulator = 0;
    input.clear();
    rig.reset();
    ui.setMode(mode);
  }
  const ui = lifetime.own(
    createUI(
      host,
      {
        start,
        pause,
        resume,
        restart,
        home,
        camera: setCamera,
        overview,
        fly: toggleFly,
        leaveFly,
        reviewSection(name) {
          window.__VN.loadScenario(name, 47219);
          document.activeElement?.blur();
          ui.notice('SECTION REVIEW · LAP UNTIMED');
        },
        settings: () => {
          view.apply();
          saveSettings(settings);
        },
      },
      settings,
      track,
      {
        runtimeScenarios: runtime.scenarios,
        metadata,
        circuits: levelCatalog.list,
        shape: blockout,
      },
    ),
  );
  const input = lifetime.own(
    createInput((command) => {
      if (command === 'pause') {
        if (mode === 'paused') resume();
        else if (mode === 'racing') pause();
        else home();
      }
      if (command === 'restart') recover();
      if (command === 'inspection') setCamera('inspection');
      if (command === 'start') {
        if (mode === 'paused') resume();
        else if (mode !== 'racing') start();
      }
      if (command === 'camera') {
        cameraMode = cameraMode === 'chase' ? 'vista' : 'chase';
        rig.reset();
      }
    }, pause),
  );
  input.bindTouch(ui.root);
  const flyCamera = lifetime.own(
    createFlyCamera(camera, renderer.domElement, {
      toggle: toggleFly,
      exit: leaveFly,
    }),
  );
  flyCamera.bindControls(ui.root);
  renderer.domElement.addEventListener(
    'webglcontextlost',
    (e) => {
      e.preventDefault();
      pause();
      fail(
        new Error(
          'The graphics context was lost. Reload to restart the proving session.',
        ),
      );
    },
    { signal: listeners.signal },
  );
  const localYaw = new T.Quaternion(),
    localRoll = new T.Quaternion();
  const upAxis = new T.Vector3(0, 1, 0),
    forwardAxis = new T.Vector3(0, 0, 1);
  function pose(s, alpha = 1) {
    const worldPose = runtime.pose?.(alpha);
    const f = track.sample(s.distance);
    ship.group.position
      .copy(f.position)
      .addScaledVector(f.right, s.lateral)
      .addScaledVector(f.up, 0.72);
    ship.group.quaternion.copy(f.quaternion);
    localYaw.setFromAxisAngle(upAxis, s.heading);
    localRoll.setFromAxisAngle(forwardAxis, s.steer * 0.08);
    ship.group.quaternion.multiply(localYaw).multiply(localRoll);
    if (worldPose) {
      ship.group.position.copy(worldPose.position);
      ship.group.quaternion.copy(worldPose.quaternion);
    }
    ship.update({
      speed: s.speed,
      boost: s.boosting,
      steer: s.steer,
      time: s.time,
      energy: s.energy / 100,
    });
    view.follow(ship.group.position);
    view.updateContact(
      track,
      s,
      worldPose && !worldPose.grounded
        ? () => 0
        : road.userData.surfaceCoverage,
    );
    return worldPose;
  }
  function render(now) {
    if (!active) return;
    const dt = last ? Math.min((now - last) / 1000, 0.1) : 1 / 60;
    last = now;
    time += dt;
    if (mode === 'racing') {
      accumulator += dt;
      const control = input.sample();
      while (accumulator >= 1 / 120) {
        prev = { ...state };
        inputLog.push({ tick, input: { ...control } });
        if (inputLog.length > 36000) inputLog.shift();
        advance(control);
        tick++;
        accumulator -= 1 / 120;
      }
    }
    const alpha = accumulator * 120;
    const s =
      mode === 'racing'
        ? {
            ...state,
            distance: T.MathUtils.lerp(prev.distance, state.distance, alpha),
            lateral: T.MathUtils.lerp(prev.lateral, state.lateral, alpha),
            heading: T.MathUtils.lerp(prev.heading, state.heading, alpha),
          }
        : state;
    if (mode === 'inspection') {
      if (!settings.reducedMotion) inspectionTime += dt;
      ship.group.position.set(0, 0.15, 0);
      ship.group.rotation.set(0, inspectionTime * 0.12, 0);
      ship.update({ speed: 0, boost: false, steer: 0, time, energy: 100 });
      camera.position.set(10.4, 6.2, 12.5);
      camera.up.set(0, 1, 0);
      camera.fov = 39;
      camera.aspect = innerWidth / innerHeight;
      const size = `${innerWidth}x${innerHeight}`;
      if (inspectionLayout?.size !== size)
        inspectionLayout = { size, viewport: ui.inspectionViewport() };
      const viewport = inspectionLayout.viewport;
      const target = new T.Vector3(0, viewport ? 0.7 : 0.3, 0);
      if (viewport) {
        // Fit the craft's swept turntable envelope into the reserved stage.
        // Independent horizontal/vertical extents keep short phones useful.
        camera.position.normalize();
        const sinPitch = camera.position.y;
        const cosPitch = Math.hypot(camera.position.x, camera.position.z);
        const depth =
          inspectionExtent.radial * cosPitch +
          inspectionExtent.vertical * sinPitch;
        const height =
          inspectionExtent.radial * sinPitch +
          inspectionExtent.vertical * cosPitch;
        const projection =
          innerHeight / Math.tan(T.MathUtils.degToRad(camera.fov / 2));
        const distance =
          depth +
          1.08 *
            projection *
            Math.max(
              inspectionExtent.radial / viewport.width,
              height / viewport.height,
            );
        camera.position.multiplyScalar(distance).add(target);
      }
      camera.setViewOffset(
        innerWidth,
        innerHeight,
        viewport
          ? innerWidth / 2 - (viewport.left + viewport.width / 2)
          : -innerWidth * 0.15,
        viewport ? innerHeight / 2 - (viewport.top + viewport.height / 2) : 0,
        innerWidth,
        innerHeight,
      );
      camera.lookAt(target);
      camera.updateProjectionMatrix();
    } else {
      camera.clearViewOffset();
      const worldPose = pose(s, alpha);
      const reviewing = mode === 'overview' || (blockout && mode === 'title');
      if (mode === 'fly') {
        flyCamera.update(dt);
        view.follow(camera.position);
      } else if (reviewCamera && reviewing) {
        reviewCamera.update();
      } else if (mode === 'title') {
        const f = track.sample(0);
        camera.position
          .copy(f.position)
          .addScaledVector(f.right, -13)
          .addScaledVector(f.up, 6.1)
          .addScaledVector(f.tangent, -18);
        camera.up.copy(f.up);
        camera.fov = 55;
        camera.setViewOffset(
          innerWidth,
          innerHeight,
          -innerWidth * 0.16,
          0,
          innerWidth,
          innerHeight,
        );
        camera.lookAt(
          ship.group.position.clone().addScaledVector(f.tangent, 5),
        );
        camera.updateProjectionMatrix();
      } else
        rig.update(track, s, dt, {
          mode: cameraMode,
          reducedMotion: settings.reducedMotion,
          time,
          worldPose,
          subject: ship.group,
        });
    }
    const frame = {
      state: s,
      dt: mode === 'racing' ? dt : 0,
      time: s.time,
      mode,
      camera,
      settings,
      ship,
      reviewing: mode === 'overview' || (blockout && mode === 'title'),
    };
    runtime.update?.(frame);
    world.update(frame);
    if (mode === 'inspection') view.renderInspection(inspectionScene);
    else view.render(now);
    world.afterRender(frame);
    effects.update(mode === 'racing' ? dt : 0);
    audio.update(state, settings.volume, mode === 'racing');
    for (const event of view.drainStormEvents()) audio.event(event);
    ui.update(state, race, runtime.snapshot(), {
      practice: definition.practiceSectionsUntimed && scenario !== 'staging',
    });
    raf = requestAnimationFrame(render);
  }
  window.__VN = {
    ready: false,
    version: VERSION,
    loadScenario(name = 'staging', newSeed = 7) {
      restart();
      scenario = name;
      seed = newSeed;
      const source =
        runtime.scenarios?.[name]?.state || track.scenarios?.[name] || {};
      Object.assign(state, source);
      if (name === 'inspection') setCamera('inspection');
      if (name === 'impact') {
        state.lateral = -track.width / 2 + 2.3;
        state.speed = 85;
      }
      resetRuntime('scenario');
      initial = captureInitial(state, runtime);
      prev = { ...state };
      race.placeScenario(state.distance);
      rig.reset();
      view.resetMetrics();
      return this.getSnapshot();
    },
    setCamera,
    overview,
    fly: toggleFly,
    leaveFly,
    start,
    pause,
    restart,
    resume,
    getReplay() {
      validateReplayInputs(inputLog, tick);
      if (state.resetCount)
        throw new Error(
          'Recovery session cannot be replayed; restart for a clean recording',
        );
      return {
        version: VERSION,
        trackId: track.id,
        physicsVersion: 3,
        runtime: runtimeIdentity(runtime),
        initial: JSON.parse(JSON.stringify(initial)),
        seed,
        scenario,
        inputs: inputLog.map((e) => ({ ...e, input: { ...e.input } })),
      };
    },
    playReplay(replay) {
      if (
        replay.version !== VERSION ||
        replay.trackId !== track.id ||
        replay.physicsVersion !== 3 ||
        !compatibleRuntime(runtime, replay.runtime)
      )
        throw new Error('Replay version mismatch');
      validateReplayInputs(replay.inputs);
      if (mode === 'fly') leaveFly();
      const retained = {
        state,
        prev,
        race,
        mode,
        cameraMode,
        scenario,
        seed,
        tick,
        accumulator,
        initial,
        runtime: runtime.snapshot(),
        inputs: [...inputLog],
        events: [...events],
      };
      try {
        this.loadScenario(replay.scenario || 'staging', replay.seed);
        restoreReplayInitial(replay.initial, initial, state, runtime);
      } catch (error) {
        ({
          state,
          prev,
          race,
          mode,
          cameraMode,
          scenario,
          seed,
          tick,
          accumulator,
          initial,
        } = retained);
        runtime.restore(retained.runtime);
        world.reset();
        inputLog.splice(0, inputLog.length, ...retained.inputs);
        events.splice(0, events.length, ...retained.events);
        if (mode === 'inspection') inspectionScene.add(ship.group);
        else sceneShip();
        rig.reset();
        ui.setMode(mode);
        throw error;
      }
      prev = { ...state };
      for (const entry of replay.inputs) {
        inputLog.push({ tick: entry.tick, input: { ...entry.input } });
        prev = { ...state };
        advance(entry.input);
        tick++;
      }
      pause();
      return this.getSnapshot();
    },
    getSnapshot() {
      const frame = track.sample(state.distance);
      return {
        version: VERSION,
        mode,
        scenario,
        seed,
        tick,
        settings: { ...settings },
        handling: { steeringAssist: STEERING_ASSIST },
        runtime: { ...runtimeIdentity(runtime), state: runtime.snapshot() },
        trackFrame: {
          bank: frame.bank,
          roll: frame.roll ?? frame.bank,
          grade: frame.tangent.y,
          lateralGrade: frame.right.y,
          up: frame.up.toArray(),
          tangent: frame.tangent.toArray(),
          position: frame.position.toArray(),
        },
        vehicle: { ...state },
        ship: {
          position: ship.group.position.toArray(),
          quaternion: ship.group.quaternion.toArray(),
        },
        camera: {
          position: camera.position.toArray(),
          up: camera.up.toArray(),
          fov: camera.fov,
          playerScreenX: ship.group.position.clone().project(camera).x,
          roadScreenX: track
            .sample(state.distance)
            .position.clone()
            .addScaledVector(track.sample(state.distance).up, 0.72)
            .project(camera).x,
        },
        lap: {
          lap: race.lap,
          checkpoint: race.checkpoint,
          elapsed: race.elapsed,
          lastLap: race.lastLap,
          best: race.best,
          valid: race.valid,
          rulesId: race.rulesId,
          history: [...race.history],
        },
        track: {
          id: track.id,
          name: track.name,
          review: track.review,
          length: track.length,
          width: track.width,
          sections: track.sections,
          signature: track.signature,
          waterY: track.waterY,
          jumps: track.jumps,
          sourceBudgets: road.userData.sourceBudgets,
          featureZones: track.featureZones,
          scenarios: [
            ...new Set([
              ...Object.keys(track.scenarios || {}),
              ...Object.keys(runtime.scenarios || {}),
            ]),
          ],
        },
        environment: {
          ...world.getPresentation(),
          storm: view.getPresentation(),
          thunder: audio.getPresentation(),
          water: environment.userData.getWaterPresentation?.(),
          ocean: environment.userData.getOceanPresentation?.(),
          leviathan: environment.userData.getLeviathanPresentation?.(),
          metrics: environment.userData.metrics,
          clearance: environment.userData.clearanceReport
            ? {
                ...environment.userData.clearanceReport,
                placements: environment.userData.clearanceReport.placements.map(
                  ({ bounds, ...placement }) => ({
                    ...placement,
                    partCount: bounds?.length ?? placement.partCount ?? 1,
                  }),
                ),
              }
            : undefined,
        },
        events: [...events],
        errors: [...errors],
        gamepadPresent: input.gamepadPresent,
        input: input.sample(),
      };
    },
    getMetrics: () => view.getMetrics(),
    getInputLog: () =>
      inputLog.map((e) => ({ tick: e.tick, input: { ...e.input } })),
    dispose: () => lifetime.dispose(),
  };
  pose(state);
  rig.update(track, state, 1, { mode: 'chase' });
  world.update({
    state,
    dt: 0,
    time: state.time,
    mode: 'title',
    camera,
    settings,
    ship,
    reviewing: blockout,
  });
  await view.warm();
  await renderer.compileAsync(inspectionScene, camera);
  document.querySelector('#loading')?.remove();
  window.__VN.ready = true;
  ui.setMode('title');
  raf = requestAnimationFrame(render);
}
boot().catch((error) => {
  try {
    lifetime.dispose();
  } catch (cleanupError) {
    errors.push(String(cleanupError));
  }
  fail(error);
});
