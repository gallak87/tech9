import * as T from 'three';
import { createFleetShip } from '../ships/fleet.js';
import { RIVAL_SHIPS, createRivalPreview } from '../ships/rivals.js';
import { loadShipSelection, saveShipSelection } from '../ships/catalog.js';
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
import { createStartCountdown } from './start-countdown.js';
import { discoverLevels } from '../levels/catalog.js';
import {
  validateTrack,
  validateCollisionWorld,
  circuitURL,
} from '../levels/contract.js';
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
  } = await levelCatalog.load(
    parameters.get('level') ||
      (parameters.get('test') === 'jump' ? 'saffron' : undefined),
    {
      review: parameters.get('review'),
    },
  );
  const VERSION = definition.version;
  const settings = loadSettings();
  const track = validateTrack(await definition.createTrack());
  const collisionWorld = definition.createCollisionWorld
    ? lifetime.own(
        validateCollisionWorld(
          await definition.createCollisionWorld({ track }),
        ),
      )
    : null;
  const dynamics = definition.createDynamics
    ? lifetime.own(await definition.createDynamics({ track, collisionWorld }))
    : null;
  const playtestName = parameters.get('test');
  const playtest = Object.hasOwn(definition.playtests ?? {}, playtestName)
    ? definition.playtests[playtestName]
    : null;
  let testLaunch = null;
  const playtestCases = playtest
    ? (playtest.cases ?? [
        { id: 'default', label: playtest.label, scenario: playtest.scenario },
      ])
    : [];
  let selectedPlaytestCase = parameters.has('case')
    ? playtestCases.find((entry) => entry.id === parameters.get('case'))
    : playtestCases.find((entry) => entry.scenario === playtest?.scenario);
  if (playtest && !selectedPlaytestCase)
    throw new Error('Unknown playtest case');
  const view = lifetime.own(
    await createRenderer(host, settings, {
      ...definition.renderer,
      shape: blockout,
      createBackdrop: definition.createBackdrop,
    }),
  );
  const { scene, camera, renderer } = view;
  const world = lifetime.own(
    await createLevelPresentation(definition, {
      track,
      collisionWorld,
      view,
      host,
      settings,
    }),
  );
  const { road, environment } = world;
  const reviewCamera = metadata.review
    ? createReviewCamera(track, camera)
    : null;
  const signatureReview = parameters.get('review') === 'signature';
  const ship = lifetime.own(
    await createFleetShip({
      ...definition.ship,
      id: loadShipSelection().id,
    }),
  );
  let shipLoading = false;
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
  let state = createVehicleState(ship.selected.id),
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
    effects = lifetime.own(createEffects(scene, definition.effects));
  let rig = createCameraRig(camera, definition.camera, inspectionBounds);
  let inspectionTab = 'fleet',
    inspectedRival = RIVAL_SHIPS[0],
    rivalPreview = null,
    rivalLoading = false,
    rivalRequest = 0;
  lifetime.defer(() => {
    rivalRequest++;
    rivalPreview?.dispose();
  });
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
      // Shared devices already own shield/unprotected hit feedback. Keep the
      // circuit-specific receiving-edge notice, and avoid two hit toasts.
      if (!racingEnabled || e.payload.source === 'nacre-edge-catch')
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
        e.payload.position && e.payload.normal ? e.payload : null,
      );
    }
    if (e.type === 'jump-transfer') prev = { ...state };
    if (e.type === 'jump-transfer')
      ui.notice(
        e.payload.outcome === 'recovered'
          ? `RECOVERED BEYOND LANDING · ${race.valid ? 'LAP VALID' : 'UNTIMED SESSION'} · W TO RESUME`
          : e.payload.tractionRestored
            ? 'PLATFORM CONTACT · TRACTION RESTORED'
            : e.payload.edgeCaught
              ? 'EDGE CATCH · LANDING CONFIRMED'
              : 'LANDING CONFIRMED',
      );
    if (e.type === 'lap') {
      const previousBest = Math.min(
        ...race.history
          .slice(0, -1)
          .filter((lap) => lap.valid)
          .map((lap) => lap.duration),
      );
      ui.lapComplete({
        lap: race.lap - 1,
        duration: e.payload.duration,
        valid: e.payload.valid,
        delta: Number.isFinite(previousBest)
          ? e.payload.duration - previousBest
          : null,
      });
    }
  };
  const racingEnabled = Boolean(definition.racing) && !blockout;
  const runtimeContext = {
    track,
    collisionWorld,
    dynamics,
    playtest,
    scene,
    ship,
    host,
    settings,
    emit,
    audioImmersion: definition.audio?.immersion,
  };
  const motion = await (definition.createRuntime ?? createMagneticRuntime)(
    runtimeContext,
  );
  const devices = racingEnabled ? definition.racing.createDevices(track) : [];
  const runtime = lifetime.own(
    racingEnabled
      ? (await import('../pickups/index.js')).createCircuitDeviceRuntime(
          runtimeContext,
          { motion, devices, ...definition.racing },
        )
      : motion,
  );
  const racerModule = racingEnabled ? await import('../race/racers.js') : null;
  const { createDeviceRuntime } = racingEnabled
    ? await import('../pickups/runtime.js')
    : {};
  const racers = racerModule
    ? lifetime.own(
        racerModule.createRacers({
          track,
          devices,
          dynamics,
          createRuntime: () =>
            createDeviceRuntime({
              track,
              devices,
              identity: definition.racing.identity,
              motion: (definition.racing.createMotion ?? createMagneticRuntime)(
                {
                  track,
                  collisionWorld,
                  dynamics,
                  settings,
                  presentation: false,
                },
              ),
            }),
        }),
      )
    : null;
  const racerPresentation = racers
    ? lifetime.own(
        await racerModule.createRacerPresentation({ racers, scene, track }),
      )
    : null;
  let competition = false,
    lastResults = null,
    raceDifficulty = settings.difficulty,
    countdownRequest = 0,
    pausedCountdown = false,
    goUntil = 0;
  const countdown = createStartCountdown();
  const makeRace = () =>
    createRace(track, {
      rulesId: `${runtime.rulesId}:ship-${ship.selected.id}-v${ship.selected.version}${competition ? `:difficulty-${raceDifficulty}` : ''}`,
      untimed: Boolean(playtest),
    });
  const resetRuntime = (reason) => {
    runtime.reset({ reason, state, scenario, seed });
    audio.resetEnvironment();
    effects.reset();
    world.reset();
  };
  const advance = (control) => {
    const result = advanceSession({
      state,
      input: control,
      dt: 1 / 120,
      runtime,
      race,
      emit,
      dynamics,
      racers,
    });
    return result;
  };
  function advanceTick(control) {
    prev = { ...state };
    inputLog.push({ tick, input: { ...control } });
    if (inputLog.length > 36000) inputLog.shift();
    advance(control);
    tick++;
  }
  function resetRacers(enabled = competition) {
    dynamics?.reset();
    racers?.reset({
      playerState: state,
      playerRace: race,
      enabled,
      difficulty: raceDifficulty,
    });
  }
  race = makeRace();
  resetRacers(false);
  resetRuntime('initialize');
  let initial = captureInitial(state, runtime, dynamics);
  function fitInspection(group) {
    inspectionBounds.min.fromArray(group.userData.bounds.min);
    inspectionBounds.max.fromArray(group.userData.bounds.max);
    inspectionExtent.radial = Math.hypot(
      Math.max(
        Math.abs(inspectionBounds.min.x),
        Math.abs(inspectionBounds.max.x),
      ),
      Math.max(
        Math.abs(inspectionBounds.min.z),
        Math.abs(inspectionBounds.max.z),
      ),
    );
    inspectionExtent.vertical = Math.max(
      Math.abs(inspectionBounds.min.y - 0.55),
      Math.abs(inspectionBounds.max.y - 0.55),
    );
    inspectionTime = 0;
    inspectionLayout = null;
  }
  function restoreFleetInspection() {
    rivalRequest++;
    rivalPreview?.dispose();
    rivalPreview = null;
    rivalLoading = false;
    inspectionTab = 'fleet';
    ship.group.visible = true;
    fitInspection(ship.group);
    ui.setInspectionTab('fleet');
    ui.setRivalLoading(false);
    ui.shipError('');
  }
  function sceneShip() {
    if (inspectionTab !== 'fleet') restoreFleetInspection();
    if (ship.group.parent !== scene) scene.add(ship.group);
  }
  function armCountdown(resuming = false) {
    const request = ++countdownRequest;
    mode = 'countdown';
    pausedCountdown = false;
    accumulator = 0;
    if (!resuming) countdown.begin();
    countdown.pause();
    ui.setMode(mode);
    ui.setCountdown(countdown.snapshot().step ?? 3);
    audio
      .unlock()
      .catch(() => {})
      .finally(() => {
        if (!active || request !== countdownRequest || mode !== 'countdown')
          return;
        countdown.resume();
      });
  }
  function cancelCountdown() {
    countdownRequest++;
    countdown.cancel();
    pausedCountdown = false;
    goUntil = 0;
    ui.setCountdown(null);
  }
  function start() {
    if (shipLoading || (mode === 'inspection' && inspectionTab === 'rivals'))
      return;
    if (mode === 'countdown') return;
    if (mode === 'paused') {
      resume();
      return;
    }
    if (mode === 'fly') {
      leaveFly();
      return;
    }
    sceneShip();
    const newRun =
      mode === 'title' || mode === 'inspection' || mode === 'overview';
    if (newRun && playtest) {
      audio.unlock().catch(() => {});
      repeatPlaytest();
      return;
    }
    if (newRun) {
      raceDifficulty = settings.difficulty;
      competition = racingEnabled;
      scenario = 'staging';
      state = createVehicleState(ship.selected.id);
      if (competition) Object.assign(state, racerModule.RACE_GRID.player);
      prev = { ...state };
      race = makeRace();
      resetRacers();
      resetRuntime('fresh-lap');
      initial = captureInitial(state, runtime, dynamics);
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
    if (newRun) armCountdown();
    // Review links still enter through the real start button/audio gesture.
    // Normal launch and fresh-lap actions retain the complete circuit.
    if (newRun && signatureReview && track.scenarios['signature-entry']) {
      window.__VN.loadScenario('signature-entry', 47219);
      ui.notice('SIGNATURE PLAYTEST · LAP UNTIMED');
    }
  }
  function pause() {
    if (!['racing', 'countdown'].includes(mode)) return;
    pausedCountdown = mode === 'countdown';
    if (pausedCountdown) {
      countdown.pause();
      countdownRequest++;
    }
    mode = 'paused';
    accumulator = 0;
    input.clear();
    ui.setMode(mode);
  }
  function resume() {
    flyCamera?.leave();
    if (pausedCountdown) {
      armCountdown(true);
      input.clear();
      return;
    }
    mode = 'racing';
    accumulator = 0;
    input.clear();
    ui.setMode(mode);
    audio.unlock().catch(() => {});
  }
  function restart(compete = competition, withCountdown = false) {
    if (shipLoading) return;
    flyCamera?.leave();
    cancelCountdown();
    scenario = 'staging';
    testLaunch = null;
    sceneShip();
    competition = racingEnabled && compete;
    if (withCountdown) raceDifficulty = settings.difficulty;
    state = createVehicleState(ship.selected.id);
    if (competition) Object.assign(state, racerModule.RACE_GRID.player);
    prev = { ...state };
    race = makeRace();
    resetRacers();
    resetRuntime('fresh-lap');
    initial = captureInitial(state, runtime, dynamics);
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
    if (withCountdown) armCountdown();
  }
  function repeatPlaytest() {
    window.__VN.loadScenario(selectedPlaytestCase.scenario, 7);
    ui.notice(
      `${selectedPlaytestCase.label.toUpperCase()} · UNTIMED · R TO REPEAT`,
    );
  }
  function selectPlaytestCase(id) {
    const selected = playtestCases.find((entry) => entry.id === id);
    if (
      !selected ||
      !(
        Object.hasOwn(runtime.scenarios ?? {}, selected.scenario) ||
        Object.hasOwn(track.scenarios ?? {}, selected.scenario)
      )
    )
      throw new Error('Unknown playtest case');
    selectedPlaytestCase = selected;
    const url = new URL(location.href);
    url.searchParams.set('case', id);
    history.replaceState(history.state, '', url);
    ui.setPlaytestCase(id);
  }
  function resetPlaytestCase(id = selectedPlaytestCase.id) {
    if (!active || !window.__VN.ready || shipLoading)
      throw new Error('Wait for the playtest to be ready');
    selectPlaytestCase(id);
    repeatPlaytest();
    pause();
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
    const results = racers?.snapshot({
      playerState: state,
      playerRace: race,
    }).results;
    if (results) lastResults = structuredClone(results);
    cancelCountdown();
    flyCamera?.leave();
    sceneShip();
    mode = 'title';
    scenario = 'staging';
    state = createVehicleState(ship.selected.id);
    competition = false;
    race = makeRace();
    resetRacers(false);
    resetRuntime('home');
    initial = captureInitial(state, runtime, dynamics);
    tick = 0;
    accumulator = 0;
    inputLog.length = 0;
    events.length = 0;
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
    cancelCountdown();
    flyCamera?.leave();
    if (preset === 'inspection') {
      if (mode === 'inspection') return;
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
    if (mode === 'countdown') {
      countdown.pause();
      countdownRequest++;
    }
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
    if (mode === 'countdown') armCountdown(true);
  }
  async function selectShip(id) {
    if (shipLoading || !['title', 'overview', 'inspection'].includes(mode))
      return false;
    if (inspectionTab !== 'fleet') return false;
    shipLoading = true;
    input.clear();
    ui.setShipLoading(true);
    try {
      if (!(await ship.select(id)) || !active) return false;
      fitInspection(ship.group);
      rig = createCameraRig(camera, definition.camera, inspectionBounds);
      ship.group.traverse((object) => {
        for (const material of Array.isArray(object.material)
          ? object.material
          : [object.material])
          if (material?.isMeshStandardMaterial)
            material.envMap = cityReflection;
      });
      scenario = 'staging';
      state = createVehicleState(ship.selected.id);
      prev = { ...state };
      competition = false;
      race = makeRace();
      resetRacers(false);
      resetRuntime('ship-change');
      initial = captureInitial(state, runtime, dynamics);
      tick = 0;
      accumulator = 0;
      inputLog.length = 0;
      events.length = 0;
      inspectionTime = 0;
      inspectionLayout = null;
      ui.setShip(ship.selected);
      saveShipSelection(ship.selected.id);
      await renderer.compileAsync(ship.group.parent ?? scene, camera);
      return true;
    } catch (error) {
      ui.shipError(`Could not load ship. ${error.message}`);
      return false;
    } finally {
      shipLoading = false;
      if (active) ui.setShipLoading(false);
    }
  }
  async function inspectRival(id) {
    const craft = RIVAL_SHIPS.find((entry) => entry.id === id);
    if (!craft || mode !== 'inspection' || inspectionTab !== 'rivals')
      return false;
    const request = ++rivalRequest;
    rivalLoading = true;
    input.clear();
    ui.shipError('');
    ui.setRivalLoading(true);
    let loaded;
    try {
      loaded = await createRivalPreview(id);
      if (!active || request !== rivalRequest || mode !== 'inspection') {
        loaded.dispose();
        return false;
      }
      // Warm the candidate while hidden; keep the previous preview on failure.
      await renderer.compileAsync(loaded.group, camera, inspectionScene);
      if (!active || request !== rivalRequest || mode !== 'inspection') {
        loaded.dispose();
        return false;
      }
      rivalPreview?.dispose();
      rivalPreview = loaded;
      inspectedRival = craft;
      inspectionScene.add(loaded.group);
      fitInspection(loaded.group);
      ui.setInspectedRival(craft);
      return true;
    } catch {
      loaded?.dispose();
      if (active && request === rivalRequest)
        ui.shipError(`Could not load ${craft.name}. Choose a racer to retry.`);
      return false;
    } finally {
      if (active && request === rivalRequest) {
        rivalLoading = false;
        ui.setRivalLoading(false);
      }
    }
  }
  function selectInspectionTab(tab) {
    if (
      mode !== 'inspection' ||
      shipLoading ||
      !['fleet', 'rivals'].includes(tab)
    )
      return;
    if (tab === inspectionTab) return;
    if (tab === 'fleet') {
      restoreFleetInspection();
      return;
    }
    inspectionTab = 'rivals';
    ship.group.visible = false;
    ui.setInspectionTab(tab);
    ui.setInspectedRival(inspectedRival);
    inspectionLayout = null;
    return inspectRival(inspectedRival.id);
  }
  const ui = lifetime.own(
    createUI(
      host,
      {
        start,
        practice() {
          if (shipLoading) return;
          if (playtest) repeatPlaytest();
          else restart(false, true);
          audio.unlock().catch(() => {});
        },
        pause,
        resume,
        restart: () =>
          playtest ? repeatPlaytest() : restart(competition, true),
        repeatPlaytest: () => repeatPlaytest(),
        selectPlaytestCase(id) {
          if (mode === 'paused') resetPlaytestCase(id);
          else selectPlaytestCase(id);
        },
        home,
        camera: setCamera,
        selectShip,
        selectInspectionTab,
        inspectRival,
        overview,
        leaveFly,
        settings: () => {
          view.apply();
          saveSettings(settings);
        },
        difficulty(value) {
          if (
            !['title', 'overview'].includes(mode) ||
            !['easy', 'medium', 'hard'].includes(value)
          )
            return;
          settings.difficulty = value;
          saveSettings(settings);
        },
      },
      settings,
      track,
      {
        metadata,
        circuits: levelCatalog.list,
        shape: blockout,
        selectedShip: ship.selected,
        racing: racingEnabled,
        playtest,
        playtestCase: selectedPlaytestCase?.id,
      },
    ),
  );
  const input = lifetime.own(
    createInput((command) => {
      if (command === 'pause') {
        if (
          ['racing', 'paused'].includes(mode) &&
          racers?.snapshot({ playerState: state, playerRace: race })
            .playerFinished
        )
          home();
        else if (mode === 'paused') resume();
        else if (mode === 'racing' || mode === 'countdown') pause();
        else home();
      }
      if (command === 'restart') {
        if (playtest && ['racing', 'paused', 'countdown'].includes(mode))
          repeatPlaytest();
        else recover();
      }
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
  if (parameters.get('music') === '1') {
    const { createMusicPlayer } = await import('../audio/player.js');
    lifetime.own(createMusicPlayer(host, { clearInput: () => input.clear() }));
  }
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
      if (worldPose.steeringBank) ship.group.quaternion.multiply(localRoll);
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
    audio.update(state, settings.volume, mode === 'racing', {
      countdown: mode === 'countdown',
    });
    if (mode === 'countdown') {
      const step = countdown.advance();
      if (step !== null) {
        ui.setCountdown(step);
        audio.event({
          type: step === 0 ? 'countdown-go' : 'countdown-beep',
          payload: { step },
        });
        if (step === 0) {
          mode = 'racing';
          accumulator = 0;
          goUntil = now + 700;
          ui.setMode(mode);
        }
      }
    }
    if (goUntil && now >= goUntil) {
      ui.setCountdown(null);
      goUntil = 0;
    }
    if (mode === 'racing') {
      accumulator += dt;
      const control = input.sample();
      while (accumulator >= 1 / 120) {
        advanceTick(control);
        accumulator -= 1 / 120;
      }
    }
    const alpha = mode === 'racing' ? accumulator * 120 : 1;
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
      const subject =
        inspectionTab === 'rivals' ? rivalPreview?.group : ship.group;
      subject?.position.set(0, 0.15, 0);
      subject?.rotation.set(0, inspectionTime * 0.12, 0);
      if (inspectionTab === 'fleet')
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
      motion: runtime.snapshot(),
      reviewing: mode === 'overview' || (blockout && mode === 'title'),
    };
    audio.setImmersion(definition.audio?.immersion?.({ ...frame, track }) ?? 0);
    runtime.update?.(frame);
    racerPresentation?.update({
      alpha,
      mode: mode === 'fly' ? flyReturnMode : mode,
    });
    view.setRacingFeedback?.({
      mode,
      speed: s.speed,
      boosting: s.boosting,
      catapulting: runtime.snapshot()?.vectorActive === true,
      enabled: racingEnabled,
    });
    world.update(frame);
    if (mode === 'inspection') view.renderInspection(inspectionScene);
    else view.render(now);
    world.afterRender(frame);
    effects.update(mode === 'racing' ? dt : 0);
    for (const event of view.drainStormEvents()) audio.event(event);
    ui.update(state, race, runtime.snapshot(), {
      practice: definition.practiceSectionsUntimed && scenario !== 'staging',
      competition: racers?.snapshot({ playerState: state, playerRace: race }),
      lastResults,
    });
    raf = requestAnimationFrame(render);
  }
  window.__VN = {
    ready: false,
    version: VERSION,
    ...(playtest
      ? {
          test: {
            cases: playtestCases.map((entry) => ({ ...entry })),
            targets: structuredClone(collisionWorld?.targets ?? []),
            jumps: structuredClone(track.jumps ?? []),
            solids() {
              const solids = [];
              for (const [owner, group] of [
                ['road', road],
                ['environment', environment],
              ]) {
                group.updateWorldMatrix(true, true);
                group.traverse((object) => {
                  if (!object.isMesh || !object.geometry?.attributes.position)
                    return;
                  object.geometry.computeBoundingBox();
                  const local = object.geometry.boundingBox;
                  for (
                    let index = 0;
                    index < (object.isInstancedMesh ? object.count : 1);
                    index++
                  ) {
                    const matrix = object.matrixWorld.clone();
                    if (object.isInstancedMesh) {
                      const instance = new T.Matrix4();
                      object.getMatrixAt(index, instance);
                      matrix.multiply(instance);
                    }
                    const bounds = local.clone().applyMatrix4(matrix);
                    const size = bounds.getSize(new T.Vector3());
                    if (Math.max(...size.toArray()) < 3) continue;
                    solids.push({
                      owner,
                      name: object.name || object.parent?.name || '',
                      index,
                      drivingSurface: !!object.userData.drivingSurface,
                      min: bounds.min.toArray(),
                      max: bounds.max.toArray(),
                    });
                  }
                });
              }
              return solids;
            },
            frame(distance) {
              if (!Number.isFinite(distance))
                throw new Error('Frame distance must be finite');
              const frame = track.sample(distance);
              return Object.fromEntries(
                ['position', 'right', 'up', 'tangent', 'quaternion'].map(
                  (key) => [key, frame[key].toArray()],
                ),
              );
            },
            ...(runtime.launch
              ? {
                  launch(setup) {
                    if (
                      !active ||
                      !window.__VN.ready ||
                      shipLoading ||
                      mode !== 'paused' ||
                      pausedCountdown ||
                      tick !== 0
                    )
                      throw new Error('Reset a playtest case before launching');
                    runtime.launch(state, setup);
                    testLaunch = structuredClone(setup);
                    initial = captureInitial(state, runtime, dynamics);
                    prev = { ...state };
                    rig.reset();
                    pose(state, 1);
                    return this.getState();
                  },
                }
              : {}),
            reset(id) {
              resetPlaytestCase(id);
              return this.getState();
            },
            step(ticks, controls = {}) {
              if (
                !active ||
                !window.__VN.ready ||
                shipLoading ||
                mode !== 'paused' ||
                pausedCountdown
              )
                throw new Error('Reset a playtest case before stepping');
              if (!Number.isInteger(ticks) || ticks < 1 || ticks > 600)
                throw new Error('Step requires 1–600 fixed ticks');
              if (
                !controls ||
                typeof controls !== 'object' ||
                Array.isArray(controls)
              )
                throw new Error('Invalid playtest controls');
              const control = {
                throttle: controls.throttle ?? 0,
                brake: controls.brake ?? 0,
                steer: controls.steer ?? 0,
                boost: controls.boost ?? false,
                airbrake: controls.airbrake ?? false,
              };
              if (
                !['throttle', 'brake'].every(
                  (key) =>
                    Number.isFinite(control[key]) &&
                    control[key] >= 0 &&
                    control[key] <= 1,
                ) ||
                !Number.isFinite(control.steer) ||
                Math.abs(control.steer) > 1 ||
                typeof control.boost !== 'boolean' ||
                typeof control.airbrake !== 'boolean'
              )
                throw new Error('Invalid playtest controls');
              for (let i = 0; i < ticks; i++) advanceTick(control);
              prev = { ...state };
              pose(state, 1);
              return this.getState();
            },
            getState() {
              return {
                version: VERSION,
                runtime: runtimeIdentity(runtime),
                case: selectedPlaytestCase.id,
                scenario,
                mode,
                tick,
                vehicle: { ...state },
                motion: runtime.snapshot(),
                events: structuredClone(events),
                errors: [...errors],
              };
            },
          },
        }
      : {}),
    /**
     * Load a deterministic internal verification scenario.
     * @deprecated Remove after all levels are merged. Keep using this API while
     * level development or its verification depends on scenario loading.
     */
    loadScenario(name = 'staging', newSeed = 7) {
      if (shipLoading) throw new Error('Wait for ship loading to finish');
      restart(false);
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
      initial = captureInitial(state, runtime, dynamics);
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
    restart: () => (playtest ? repeatPlaytest() : restart()),
    resume,
    selectShip,
    selectInspectionTab,
    inspectRival,
    home,
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
        ship: { id: ship.selected.id, version: ship.selected.version },
        runtime: runtimeIdentity(runtime),
        initial: JSON.parse(JSON.stringify(initial)),
        seed,
        scenario,
        competition,
        untimed: Boolean(playtest),
        ...(testLaunch ? { testLaunch: structuredClone(testLaunch) } : {}),
        difficulty: raceDifficulty,
        inputs: inputLog.map((e) => ({ ...e, input: { ...e.input } })),
      };
    },
    playReplay(replay) {
      if (
        replay.version !== VERSION ||
        replay.trackId !== track.id ||
        replay.physicsVersion !== 3 ||
        Boolean(replay.untimed) !== Boolean(playtest) ||
        replay.ship?.id !== ship.selected.id ||
        replay.ship?.version !== ship.selected.version ||
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
        testLaunch,
        runtime: runtime.snapshot(),
        dynamics: dynamics?.snapshot(),
        racers: racers?.serialize(),
        competition,
        lastResults,
        raceDifficulty,
        countdown: countdown.snapshot(),
        pausedCountdown,
        goUntil,
        inputs: [...inputLog],
        events: [...events],
      };
      try {
        if (
          replay.competition &&
          !['easy', 'medium', 'hard'].includes(replay.difficulty)
        )
          throw new Error('Replay difficulty mismatch');
        raceDifficulty = replay.difficulty ?? 'easy';
        this.loadScenario(replay.scenario || 'staging', replay.seed);
        if (replay.competition) {
          if (!racingEnabled || replay.scenario !== 'staging')
            throw new Error('Replay competition mismatch');
          restart(true);
        }
        if (replay.testLaunch) {
          if (!playtest || !runtime.launch || replay.competition)
            throw new Error('Replay contact launch mismatch');
          runtime.launch(state, replay.testLaunch);
          testLaunch = structuredClone(replay.testLaunch);
          initial = captureInitial(state, runtime, dynamics);
        }
        restoreReplayInitial(replay.initial, initial, state, runtime, dynamics);
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
          testLaunch,
          competition,
          lastResults,
          raceDifficulty,
          pausedCountdown,
          goUntil,
        } = retained);
        runtime.restore(retained.runtime);
        if (racers) racers.restore(retained.racers);
        if (dynamics) dynamics.restore(retained.dynamics);
        countdown.restore(retained.countdown);
        if (mode === 'countdown') ui.setCountdown(retained.countdown.step ?? 3);
        if (mode === 'countdown' && !retained.countdown.running)
          armCountdown(true);
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
        advanceTick(entry.input);
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
        handling: {
          steeringAssist: STEERING_ASSIST,
          ...ship.selected.handling,
        },
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
        competition:
          racers?.snapshot({ playerState: state, playerRace: race }) ?? null,
        countdown:
          mode === 'countdown' || pausedCountdown ? countdown.snapshot() : null,
        lastResults,
        inspection: {
          tab: inspectionTab,
          rivalId: rivalPreview?.specification.id ?? null,
          loading: rivalLoading,
          bounds: rivalPreview?.group.userData.bounds ?? null,
        },
        ship: {
          id: ship.selected.id,
          loading: shipLoading,
          version: ship.selected.version,
          position: ship.group.position.toArray(),
          quaternion: ship.group.quaternion.toArray(),
        },
        camera: {
          position: camera.position.toArray(),
          quaternion: camera.quaternion.toArray(),
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
          audio: audio.getStatus(),
          devices: runtime.getPresentation?.() ?? null,
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
