import { interpolateSurfaceLateral } from '../track/surface.js';
import * as T from 'three';
import { createFleetShip } from '../ships/fleet.js';
import { createInspectionStage } from '../ships/inspection-stage.js';
import { createInspectionPipeline } from '../ships/inspection-pipeline.js';
import { RIVAL_SHIPS, createRivalPreview } from '../ships/rivals.js';
import { loadShipSelection, saveShipSelection } from '../ships/catalog.js';
import { createRenderer } from '../renderer/index.js';
import {
  createVehicleState,
  STEERING_ASSIST,
  surfaceHullClearance,
} from '../physics/index.js';
import { createRace } from '../race/index.js';
import { courseIdentity } from '../race/course.js';
import { createFinishMarker } from '../race/finish-marker.js';
import { createInput } from '../input/index.js';
import { createCameraRig } from '../camera/index.js';
import { createAudio } from '../audio/index.js';
import { createEffects } from '../effects/index.js';
import { createUI } from '../ui/index.js';
import {
  loadSettings,
  saveSettings,
  subscribeSettings,
} from '../progression/index.js';
import { createFlyCamera } from './fly-camera.js';
import { artPassURL } from './art-pass.js';
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
export async function createGame({
  host,
  parameters = new URLSearchParams(),
  signal,
  onProgress = () => {},
  onMode = () => {},
  onHome,
  onResults,
  onCircuit,
} = {}) {
  let api;
  let suspended = false;
  async function checkpoint(label) {
    signal?.throwIfAborted();
    onProgress(label);
    await new Promise((resolve) => setTimeout(resolve, 0));
    signal?.throwIfAborted();
  }
  const errors = [];
  const lifetime = createLifetime();
  const listeners = new AbortController();
  lifetime.defer(() => listeners.abort());
  function fail(error) {
    errors.push(String(error?.stack || error));
    if (onHome) {
      onHome({ error });
      return;
    }
    host.querySelector('#loading')?.remove();
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
    await checkpoint('Reading circuit');
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
    await checkpoint('Preparing route');
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
    await checkpoint('Preparing graphics');
    const view = lifetime.own(
      await createRenderer(host, settings, {
        ...definition.renderer,
        shape: blockout,
        createBackdrop: definition.createBackdrop,
      }),
    );
    const { scene, camera, renderer } = view;
    await checkpoint('Building world');
    const world = lifetime.own(
      await createLevelPresentation(definition, {
        track,
        collisionWorld,
        view,
        host,
        settings,
        checkpoint,
      }),
    );
    const { road, environment } = world;
    if (!blockout) {
      const finishMarker = lifetime.own(
        createFinishMarker(track, definition.racing?.finishMarker),
      );
      road.add(finishMarker.group);
    }
    const reviewCamera = metadata.review
      ? createReviewCamera(track, camera)
      : null;
    const signatureReview = parameters.get('review') === 'signature';
    await checkpoint('Preparing ships');
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
    const cityReflection = view.bakeCityReflection(reflectionPoint, [
      ship.group,
    ]);
    ship.group.traverse((object) => {
      for (const material of Array.isArray(object.material)
        ? object.material
        : [object.material])
        if (material?.isMeshStandardMaterial) material.envMap = cityReflection;
    });
    world.setReflection(cityReflection);
    const inspectionStage = lifetime.own(createInspectionStage(renderer));
    const inspectionScene = inspectionStage.scene;
    const inspectionPipeline = lifetime.own(
      createInspectionPipeline(renderer, inspectionScene, camera),
    );
    const inspectionPreview = {
      autoRotate: true,
      boost: false,
      driving: false,
      heat: true,
      elevation: 0.365,
    };
    let inspectionDrag = null;
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
      if (window.__VN === api) window.__VN.ready = false;
    });
    const emit = (e) => {
      const event = { ...e, tick, time: state.time };
      if (e.type === 'player-race-complete') {
        const finish = racers?.snapshot({
          playerState: state,
          playerRace: race,
        });
        event.payload = {
          ...e.payload,
          position: finish?.standings.find((entry) => entry.id === 'player')
            ?.position,
        };
      }
      events.push(event);
      if (events.length > 500) events.shift();
      try {
        if (e.type === 'lap' && competition) {
          if (race.history.length === 1) audio.event({ type: 'final-lap' });
        } else audio.event(event);
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
        const impactDistance = e.payload.distance ?? state.distance;
        const impactLateral =
          e.payload.lateral ??
          (definition.railContactSparks
            ? Number.isFinite(e.payload.railLateral)
              ? e.payload.railLateral - e.payload.side * 0.4
              : e.payload.side * (track.width / 2 - 0.4)
            : state.lateral);
        const impactSurface = track.sampleSurface?.(
          impactDistance,
          impactLateral,
        );
        effects.impact(
          impactSurface || track.sample(impactDistance),
          impactSurface ? 0 : impactLateral,
          e.payload.position && e.payload.normal ? e.payload : null,
        );
      }
      if (e.type === 'jump-transfer') prev = { ...state };
      if (e.type === 'jump-transfer')
        ui.notice(
          e.payload.outcome === 'recovered'
            ? `RECOVERED BEYOND LANDING · ${race.valid ? (track.closed === false ? 'RUN VALID' : 'LAP VALID') : 'UNTIMED SESSION'} · W TO RESUME`
            : e.payload.tractionRestored
              ? 'PLATFORM CONTACT · TRACTION RESTORED'
              : e.payload.edgeCaught
                ? 'EDGE CATCH · LANDING CONFIRMED'
                : 'LANDING CONFIRMED',
        );
      if (e.type === 'sprint-complete')
        ui.notice(
          e.payload.valid
            ? 'FINISH · DESCENT RECORDED'
            : 'FINISH · UNTIMED RUN',
        );
      if (e.type === 'lap') {
        if (competition && race.history.length >= racerModule.RACE_LAPS) return;
        const previousBest = Math.min(
          ...race.history
            .slice(0, -1)
            .filter((lap) => lap.valid)
            .map((lap) => lap.duration),
        );
        ui.lapComplete({
          finalLap: competition && race.history.length === 1,
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
    const racerModule = racingEnabled
      ? await import('../race/racers.js')
      : null;
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
                motion: (
                  definition.racing.createMotion ?? createMagneticRuntime
                )({
                  track,
                  collisionWorld,
                  dynamics,
                  settings,
                  presentation: false,
                }),
              }),
          }),
        )
      : null;
    const racerPresentation = racers
      ? lifetime.own(
          await racerModule.createRacerPresentation({ racers, scene, track }),
        )
      : null;
    let sessionActive = false,
      inspectionReturnMode = null,
      finishAt = null,
      resultsDismissed = false;
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
      if (reason !== 'manual-recover') {
        finishAt = null;
        resultsDismissed = false;
        lastResults = null;
      }
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
      if (mode === 'inspection' && inspectionReturnMode) {
        exitInspection();
        return;
      }
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
        sessionActive = true;
        ui.setFinish(null);
        ui.setResultsAvailable(false);
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
      ui.setFinish(null);
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
      if (finishAt !== null && !resultsDismissed) ui.setFinish(lastResults);
      audio.unlock().catch(() => {});
    }
    function restart(compete = competition, withCountdown = false) {
      if (shipLoading) return;
      if (track.closed === false && race?.complete) {
        const results = racers?.snapshot({
          playerState: state,
          playerRace: race,
          playerPose: runtime.pose(1),
        }).results;
        if (results) lastResults = structuredClone(results);
      }
      flyCamera?.leave();
      inspectionReturnMode = null;
      sessionActive = true;
      ui.setInspectionSession(false);
      ui.setFinish(null);
      ui.setResultsAvailable(false);
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
      if (track.closed === false && race.complete)
        return restart(competition, true);
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
      ui.notice(
        track.closed === false
          ? 'RECOVERED AT CHECKPOINT · RUN UNTIMED'
          : 'RECOVERED AT CHECKPOINT · LAP INVALID',
      );
    }
    function home() {
      if (mode === 'inspection' && inspectionReturnMode) exitInspection();
      if (mode === 'fly') leaveFly();
      if (sessionActive) {
        pause();
        input.clear();
        onHome?.();
        return;
      }
      prepareSession();
      onHome?.();
    }
    // Only an explicit Start replaces a retained run. Menu navigation never
    // resets vehicle/rival clocks, recording, or the loaded world's resources.
    function prepareSession() {
      const results = racers?.snapshot({
        playerState: state,
        playerRace: race,
        playerPose: runtime.pose(1),
      }).results;
      if (results) lastResults = structuredClone(results);
      cancelCountdown();
      flyCamera?.leave();
      inspectionReturnMode = null;
      sessionActive = false;
      ui.setInspectionSession(false);
      ui.setFinish(null);
      ui.setResultsAvailable(false);
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
    function exitInspection() {
      if (mode !== 'inspection' || !inspectionReturnMode) {
        home();
        return;
      }
      sceneShip();
      mode = inspectionReturnMode;
      inspectionReturnMode = null;
      ui.setInspectionSession(false);
      accumulator = 0;
      input.clear();
      rig.reset();
      ui.setMode(mode);
      if (mode === 'countdown') armCountdown(true);
    }
    function showResults() {
      if (!lastResults) return;
      if (mode === 'inspection' && inspectionReturnMode) exitInspection();
      if (mode === 'fly') leaveFly();
      mode = 'results';
      resultsDismissed = false;
      ui.setFinish(null);
      input.clear();
      ui.setMode(mode);
      onResults?.(lastResults);
    }
    function setCamera(preset) {
      if (preset === 'fly') {
        toggleFly();
        return;
      }
      flyCamera?.leave();
      if (preset === 'inspection') {
        if (mode === 'inspection') return;
        if (mode === 'results') return;
        inspectionReturnMode = sessionActive ? mode : null;
        if (mode === 'countdown') {
          countdown.pause();
          countdownRequest++;
        }
        ui.setInspectionSession(sessionActive);
        mode = 'inspection';
        inspectionScene.add(ship.group);
        ship.group.position.set(0, 0.1, 0);
        ship.group.quaternion.identity();
        inspectionTime = 0;
        inspectionLayout = null;
        world.reset();
        input.clear();
      } else {
        cancelCountdown();
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
      if (
        suspended ||
        !flyCamera ||
        ['inspection', 'results'].includes(mode) ||
        (finishAt !== null && !resultsDismissed)
      )
        return;
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
      if (sessionActive && mode === 'inspection') return false;
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
          ui.shipError(
            `Could not load ${craft.name}. Choose a racer to retry.`,
          );
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
          exitInspection,
          results: showResults,
          circuit: onCircuit,
          camera: setCamera,
          selectShip,
          selectInspectionTab,
          inspectRival,
          toggleInspectionPreview(key) {
            if (!['autoRotate', 'boost', 'driving', 'heat'].includes(key))
              return;
            inspectionPreview[key] = !inspectionPreview[key];
            ui.setInspectionPreview(inspectionPreview);
          },
          overview,
          leaveFly,
          artPassURL: () =>
            artPassURL(location.href, metadata.id, flyCamera.getView()),
          settings: () => {
            saveSettings(settings);
            ui.setInspectionPreview(inspectionPreview);
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
    let appliedQuality = settings.quality,
      appliedMotion = settings.reducedMotion;
    lifetime.defer(
      subscribeSettings((next) => {
        const graphicsChanged =
          next.quality !== appliedQuality ||
          next.reducedMotion !== appliedMotion;
        Object.assign(settings, next);
        if (graphicsChanged) {
          view.apply();
          appliedQuality = next.quality;
          appliedMotion = next.reducedMotion;
        }
        ui.syncSettings(settings);
      }),
    );
    const setUIMode = ui.setMode.bind(ui);
    ui.setMode = (value) => {
      setUIMode(value);
      onMode(value);
    };
    ui.setInspectionPreview(inspectionPreview);
    host.addEventListener(
      'pointerdown',
      (event) => {
        if (
          mode !== 'inspection' ||
          event.button !== 0 ||
          event.target.closest('button,input,select,a,label')
        )
          return;
        const viewport = ui.inspectionViewport();
        const panel = host
          .querySelector('#inspection-panel')
          .getBoundingClientRect();
        if (
          viewport
            ? event.clientY < viewport.top ||
              event.clientY > viewport.top + viewport.height
            : event.clientX < panel.right
        )
          return;
        inspectionDrag = {
          id: event.pointerId,
          x: event.clientX,
          y: event.clientY,
        };
        inspectionPreview.autoRotate = false;
        ui.setInspectionPreview(inspectionPreview);
        host.setPointerCapture(event.pointerId);
        event.preventDefault();
      },
      { signal: listeners.signal },
    );
    host.addEventListener(
      'pointermove',
      (event) => {
        if (
          !inspectionDrag ||
          inspectionDrag.id !== event.pointerId ||
          mode !== 'inspection'
        )
          return;
        inspectionTime += (event.clientX - inspectionDrag.x) * 0.065;
        inspectionPreview.elevation = T.MathUtils.clamp(
          inspectionPreview.elevation +
            (event.clientY - inspectionDrag.y) * 0.005,
          0.12,
          1.2,
        );
        inspectionDrag.x = event.clientX;
        inspectionDrag.y = event.clientY;
      },
      { signal: listeners.signal },
    );
    for (const type of ['pointerup', 'pointercancel', 'lostpointercapture'])
      host.addEventListener(
        type,
        () => {
          inspectionDrag = null;
        },
        { signal: listeners.signal },
      );
    const input = lifetime.own(
      createInput((command) => {
        if (suspended || mode === 'results' || mode === 'fly') return;
        if (finishAt !== null && !resultsDismissed && command !== 'pause')
          return;
        if (command === 'pause') {
          if (mode === 'inspection') exitInspection();
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
        exit: () => {
          if (!ui.closeFlySettings()) leaveFly();
        },
        settings: () => ui.toggleFlySettings(),
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
      const surface = track.sampleSurface?.(s.distance, s.lateral);
      const f = surface || track.sample(s.distance);
      ship.group.position
        .copy(f.position)
        .addScaledVector(f.right, surface ? 0 : s.lateral)
        .addScaledVector(f.up, 0.72 + surfaceHullClearance(surface, s.heading));
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
        reducedMotion: settings.reducedMotion,
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
      if (suspended) {
        last = now;
        raf = requestAnimationFrame(render);
        return;
      }
      const dt = last ? Math.min((now - last) / 1000, 0.1) : 1 / 60;
      last = now;
      time += dt;
      const finishing = finishAt !== null && !resultsDismissed;
      audio.update(state, settings.volume, mode === 'racing' && !finishing, {
        countdown: mode === 'countdown',
        results: mode === 'results' || (mode === 'racing' && finishing),
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
      if (mode === 'racing' || mode === 'results') {
        accumulator += dt;
        const control =
          mode === 'results' || finishing
            ? { throttle: 0, brake: 1, steer: 0, boost: false, airbrake: false }
            : input.sample();
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
              lateral: track.sampleSurface
                ? interpolateSurfaceLateral(track, prev, state, alpha)
                : T.MathUtils.lerp(prev.lateral, state.lateral, alpha),
              heading: T.MathUtils.lerp(prev.heading, state.heading, alpha),
            }
          : state;
      ship.group.visible =
        mode !== 'fly' && (mode !== 'inspection' || inspectionTab === 'fleet');
      if (mode === 'inspection') {
        if (inspectionPreview.autoRotate && !settings.reducedMotion)
          inspectionTime += dt;
        const subject =
          inspectionTab === 'rivals' ? rivalPreview?.group : ship.group;
        subject?.position.set(0, 0.15, 0);
        subject?.rotation.set(0, inspectionTime * 0.12, 0);
        if (inspectionTab === 'fleet')
          ship.update({
            speed: inspectionPreview.driving ? 400 / 3.6 : 0,
            boost: inspectionPreview.boost,
            steer: 0,
            time,
            energy: 1,
            reducedMotion: settings.reducedMotion,
          });
        camera.position.setFromSphericalCoords(
          17.4,
          Math.PI / 2 - inspectionPreview.elevation,
          Math.atan2(10.4, 12.5),
        );
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
            paused: mode === 'paused',
            finish: finishing
              ? T.MathUtils.smoothstep(state.time - finishAt, 0, 1.8)
              : 0,
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
      audio.setImmersion(
        definition.audio?.immersion?.({ ...frame, track }) ?? 0,
      );
      runtime.update?.(frame);
      racerPresentation?.update({
        alpha,
        mode,
      });
      view.setRacingFeedback?.({
        mode,
        speed: s.speed,
        boosting: s.boosting,
        catapulting: runtime.snapshot()?.vectorActive === true,
        enabled: racingEnabled,
      });
      effects.update(mode === 'racing' ? dt : 0, { visible: mode !== 'fly' });
      world.update(frame);
      if (mode === 'inspection')
        inspectionStage.render(() =>
          inspectionPipeline.render({
            heat: inspectionPreview.heat && !settings.reducedMotion,
            quality: settings.quality,
          }),
        );
      else view.render(now);
      ui.updateDevTools(now, renderer.info.render);
      world.afterRender(frame);
      for (const event of view.drainStormEvents()) audio.event(event);
      ui.update(state, race, runtime.snapshot(), {
        practice: definition.practiceSectionsUntimed && scenario !== 'staging',
        competition: racers?.snapshot({
          playerState: state,
          playerRace: race,
          playerPose: runtime.pose(1),
        }),
        lastResults,
      });
      const standings = racers?.snapshot({
        playerState: state,
        playerRace: race,
        playerPose: runtime.pose(1),
      });
      if (
        onResults &&
        !playtest &&
        !resultsDismissed &&
        (competition || track.closed === false) &&
        standings?.playerFinished
      ) {
        if (finishAt === null) {
          finishAt = state.time;
          lastResults = structuredClone(standings.results);
          ui.setFinish(lastResults);
        }
        if (mode === 'racing' && state.time - finishAt >= 2.4) {
          lastResults = structuredClone(standings.results);
          mode = 'results';
          ui.setFinish(null);
          input.clear();
          ui.setMode(mode);
        }
        if (mode === 'results') {
          lastResults = structuredClone(standings.results);
          onResults(lastResults);
        }
      }
      raf = requestAnimationFrame(render);
    }
    api = window.__VN = {
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
              frame(distance, lateral) {
                if (!Number.isFinite(distance))
                  throw new Error('Frame distance must be finite');
                if (lateral !== undefined && !Number.isFinite(lateral))
                  throw new Error('Frame lateral must be finite');
                const frame =
                  (lateral !== undefined &&
                    track.sampleSurface?.(distance, lateral)) ||
                  track.sample(distance);
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
                        throw new Error(
                          'Reset a playtest case before launching',
                        );
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
      setFlyView(view = {}) {
        if (mode !== 'fly') toggleFly();
        if (mode !== 'fly') return false;
        flyCamera.setView(view);
        return true;
      },
      getArtPassURL: () =>
        artPassURL(location.href, metadata.id, flyCamera.getView()),
      openDevTools() {
        if (mode === 'fly') ui.openFlySettings();
      },
      leaveFly,
      start,
      practice: () => {
        restart(false, false);
        audio.unlock().catch(() => {});
      },
      pause,
      hasSession: () => sessionActive,
      prepareSession,
      returnToSetup: home,
      resumeSession() {
        if (!sessionActive) return;
        suspended = false;
        input.setEnabled(true);
        if (mode === 'results') showResults();
        else if (mode === 'inspection') exitInspection();
        else resume();
      },
      showResults,
      continueDriving() {
        resultsDismissed = true;
        ui.setFinish(null);
        mode = 'racing';
        input.clear();
        ui.setMode(mode);
      },
      setSuspended(value) {
        suspended = value;
        ui.setSuspended(value);
        input.setEnabled(!value);
        input.clear();
        if (value) audio.update(state, 0, false);
      },
      configure(next) {
        saveSettings(next);
      },
      clearInput: () => input.clear(),
      inspect: () => setCamera('inspection'),
      restartRace() {
        restart(competition, true);
      },
      getTrack: () => track,
      getScene: () => ({ scene, camera, renderer }),
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
          ...(track.closed === false ? { course: courseIdentity(track) } : {}),
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
          (track.closed === false &&
            JSON.stringify(replay.course) !==
              JSON.stringify(courseIdentity(track))) ||
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
          sessionActive,
          inspectionReturnMode,
          finishAt,
          resultsDismissed,
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
          restoreReplayInitial(
            replay.initial,
            initial,
            state,
            runtime,
            dynamics,
          );
        } catch (error) {
          ({
            state,
            prev,
            race,
            mode,
            sessionActive,
            inspectionReturnMode,
            finishAt,
            resultsDismissed,
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
          if (mode === 'countdown')
            ui.setCountdown(retained.countdown.step ?? 3);
          if (mode === 'countdown' && !retained.countdown.running)
            armCountdown(true);
          world.reset();
          inputLog.splice(0, inputLog.length, ...retained.inputs);
          events.splice(0, events.length, ...retained.events);
          if (mode === 'inspection') inspectionScene.add(ship.group);
          else sceneShip();
          rig.reset();
          ui.setMode(mode);
          ui.setInspectionSession(mode === 'inspection' && sessionActive);
          ui.setResultsAvailable(Boolean(lastResults));
          ui.setFinish(
            mode === 'racing' && finishAt !== null && !resultsDismissed
              ? lastResults
              : null,
          );
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
        const surface = track.sampleSurface?.(state.distance, state.lateral);
        const frame = surface || track.sample(state.distance);
        return {
          version: VERSION,
          mode,
          scenario,
          sessionActive,
          seed,
          tick,
          settings: { ...settings },
          handling: {
            steeringAssist: STEERING_ASSIST,
            ...ship.selected.handling,
          },
          runtime: { ...runtimeIdentity(runtime), state: runtime.snapshot() },
          trackFrame: {
            surface: surface
              ? {
                  id: surface.id,
                  kind: surface.kind,
                  period: surface.period,
                  bounds: surface.bounds,
                }
              : null,
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
            racers?.snapshot({
              playerState: state,
              playerRace: race,
              playerPose: runtime.pose(1),
            }) ?? null,
          countdown:
            mode === 'countdown' || pausedCountdown
              ? countdown.snapshot()
              : null,
          lastResults,
          inspection: {
            preview: { ...inspectionPreview },
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
            complete: race.complete,
            course: race.course,
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
            closed: track.closed !== false,
            finishDistance: track.finishDistance,
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
                  placements:
                    environment.userData.clearanceReport.placements.map(
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
    await checkpoint('Warming graphics');
    await view.warm();
    await renderer.compileAsync(inspectionScene, camera);
    await checkpoint('Ready');
    host.querySelector('#loading')?.remove();
    api.ready = true;
    ui.setMode('title');
    raf = requestAnimationFrame(render);
    return api;
  }
  return boot().catch((error) => {
    try {
      lifetime.dispose();
    } catch (cleanupError) {
      errors.push(String(cleanupError));
    }
    throw error;
  });
}
