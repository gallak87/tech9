import * as T from 'three';
import { createTrack, buildTrackVisual } from '../track/index.js';
import { createShip } from '../ships/index.js';
import { createRenderer } from '../renderer/index.js';
import { createEnvironment } from '../environment/index.js';
import {
  createVehicleState,
  stepVehicle,
  STEERING_ASSIST,
} from '../physics/index.js';
import { createRace } from '../race/index.js';
import { createInput } from '../input/index.js';
import { createCameraRig } from '../camera/index.js';
import { createAudio } from '../audio/index.js';
import { createEffects } from '../effects/index.js';
import { createUI } from '../ui/index.js';
import { loadSettings, saveSettings } from '../progression/index.js';
import { createReviewCamera } from './review-camera.js';
const parameters = new URLSearchParams(location.search);
const orbital = parameters.get('level') === 'orbital';
const blockout = orbital && parameters.get('review') === 'shape';
const VERSION = orbital
  ? blockout
    ? '0.3.0-level2-blockout'
    : '0.3.0-gate3-orbital'
  : '0.2.2-gate2-pacing';
const host = document.querySelector('#app');
const errors = [];
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
  panel.append(h, p, b);
  host.append(panel);
}
window.addEventListener('error', (e) => errors.push(e.message));
window.addEventListener('unhandledrejection', (e) =>
  errors.push(String(e.reason)),
);
async function boot() {
  const settings = loadSettings(),
    view = await createRenderer(host, settings, { orbital, blockout }),
    { scene, camera, renderer } = view;
  const candidate = orbital ? await import('../track/level2/index.js') : null;
  const track = candidate ? candidate.createLevel2Track() : createTrack();
  if (orbital && !blockout) {
    track.id = 'asterion-orbital-1';
    track.review = {
      ...track.review,
      kind: 'orbital-production',
      phase: 'gate-3',
    };
  }
  const road = candidate
    ? blockout
      ? candidate.buildLevel2Blockout(track)
      : candidate.buildOrbitalTrack(track)
    : buildTrackVisual(track);
  const reviewCamera = orbital ? createReviewCamera(track, camera) : null;
  const signatureReview = parameters.get('review') === 'signature';
  const environment = orbital
    ? blockout
      ? new T.Group()
      : (
          await import('../environment/orbital/index.js')
        ).createOrbitalEnvironment(track)
    : createEnvironment(track);
  scene.add(road, environment);
  const ship = createShip({ plumeExposure: orbital && !blockout ? 1.65 : 1 });
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
  if (orbital && !blockout)
    environment.userData.setReflection?.(cityReflection);
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
  let state = createVehicleState(),
    prev = { ...state },
    race = createRace(track),
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
    audio = createAudio(),
    rig = createCameraRig(camera),
    effects = createEffects(scene, { refinedSparks: orbital && !blockout });
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
      ui.notice('BARRIER CONTACT · RESERVE LOST');
      effects.impact(
        track.sample(state.distance),
        orbital && !blockout
          ? e.payload.side * (track.width / 2 - 0.4)
          : state.lateral,
      );
    }
    if (e.type === 'lap')
      ui.notice(
        `${e.payload.valid ? 'LAP COMPLETE' : 'INVALID LAP'} · ${e.payload.duration.toFixed(3)}s`,
      );
  };
  function sceneShip() {
    if (ship.group.parent !== scene) scene.add(ship.group);
  }
  function start() {
    sceneShip();
    const newRun =
      mode === 'title' || mode === 'inspection' || mode === 'overview';
    if (newRun) {
      scenario = 'staging';
      state = createVehicleState();
      prev = { ...state };
      race = createRace(track);
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
    mode = 'racing';
    accumulator = 0;
    input.clear();
    ui.setMode(mode);
    audio.unlock().catch(() => {});
  }
  function restart() {
    scenario = 'staging';
    sceneShip();
    state = createVehicleState();
    prev = { ...state };
    race = createRace(track);
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
    prev = { ...state };
    rig.reset();
    emit({ type: 'recover', payload: { penalty: 'current lap invalid' } });
    ui.notice('RECOVERED AT CHECKPOINT · LAP INVALID');
  }
  function home() {
    sceneShip();
    mode = 'title';
    state = createVehicleState();
    prev = { ...state };
    cameraMode = 'chase';
    input.clear();
    rig.reset();
    ui.setMode(mode);
  }
  function setCamera(preset) {
    if (preset === 'inspection') {
      mode = 'inspection';
      inspectionScene.add(ship.group);
      ship.group.position.set(0, 0.1, 0);
      ship.group.quaternion.identity();
      inspectionTime = 0;
      inspectionLayout = null;
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
    sceneShip();
    reviewCamera.select(preset);
    mode = 'overview';
    accumulator = 0;
    input.clear();
    rig.reset();
    ui.setMode(mode);
  }
  const ui = createUI(
    host,
    {
      start,
      pause,
      resume,
      restart,
      home,
      camera: setCamera,
      overview,
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
  );
  const input = createInput((command) => {
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
  }, pause);
  input.bindTouch(ui.root);
  renderer.domElement.addEventListener('webglcontextlost', (e) => {
    e.preventDefault();
    pause();
    fail(
      new Error(
        'The graphics context was lost. Reload to restart the proving session.',
      ),
    );
  });
  const localYaw = new T.Quaternion(),
    localRoll = new T.Quaternion();
  const upAxis = new T.Vector3(0, 1, 0),
    forwardAxis = new T.Vector3(0, 0, 1);
  function pose(s) {
    const f = track.sample(s.distance);
    ship.group.position
      .copy(f.position)
      .addScaledVector(f.right, s.lateral)
      .addScaledVector(f.up, 0.72);
    ship.group.quaternion.copy(f.quaternion);
    localYaw.setFromAxisAngle(upAxis, s.heading);
    localRoll.setFromAxisAngle(forwardAxis, s.steer * 0.08);
    ship.group.quaternion.multiply(localYaw).multiply(localRoll);
    ship.update({
      speed: s.speed,
      boost: s.boosting,
      steer: s.steer,
      time: s.time,
      energy: s.energy / 100,
    });
    view.follow(ship.group.position);
    view.updateContact(track, s);
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
        const old = state.distance;
        stepVehicle(state, control, track, 1 / 120).forEach(emit);
        race.step(old, state.distance, 1 / 120).forEach(emit);
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
      view.renderInspection(inspectionScene);
    } else {
      camera.clearViewOffset();
      pose(s);
      if (
        reviewCamera &&
        (mode === 'overview' || (blockout && mode === 'title'))
      ) {
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
        });
      road.userData.update?.(s.distance);
      environment.userData.update?.(camera.position, time);
      view.render(now);
    }
    effects.update(mode === 'racing' ? dt : 0);
    audio.update(state, settings.volume, mode === 'racing');
    ui.update(state, race);
    raf = requestAnimationFrame(render);
  }
  window.__VN = {
    ready: false,
    version: VERSION,
    loadScenario(name = 'staging', newSeed = 7) {
      restart();
      scenario = name;
      seed = newSeed;
      const source = track.scenarios?.[name] || {};
      Object.assign(state, source);
      if (name === 'inspection') setCamera('inspection');
      if (name === 'impact') {
        state.lateral = -track.width / 2 + 2.3;
        state.speed = 85;
      }
      prev = { ...state };
      race.checkpoint = Math.floor(
        (state.distance % track.length) /
          (track.length / (track.checkpoints?.length || 12)),
      );
      race.startDistance =
        Math.floor(
          state.distance / (track.length / (track.checkpoints?.length || 12)),
        ) *
        (track.length / (track.checkpoints?.length || 12));
      race.valid = state.distance === 0;
      rig.reset();
      view.resetMetrics();
      return this.getSnapshot();
    },
    setCamera,
    overview,
    start,
    pause,
    restart,
    resume,
    getReplay() {
      if (state.resetCount)
        throw new Error(
          'Recovery session cannot be replayed; restart for a clean recording',
        );
      return {
        version: VERSION,
        trackId: track.id,
        physicsVersion: 3,
        seed,
        scenario,
        inputs: inputLog.map((e) => ({ ...e, input: { ...e.input } })),
      };
    },
    playReplay(replay) {
      if (
        replay.version !== VERSION ||
        replay.trackId !== track.id ||
        replay.physicsVersion !== 3
      )
        throw new Error('Replay version mismatch');
      this.loadScenario(replay.scenario || 'staging', replay.seed);
      for (const entry of replay.inputs) {
        const old = state.distance;
        prev = { ...state };
        stepVehicle(state, entry.input, track, 1 / 120).forEach(emit);
        race.step(old, state.distance, 1 / 120).forEach(emit);
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
        },
        track: {
          id: track.id,
          name: track.name,
          review: track.review,
          length: track.length,
          width: track.width,
          sections: track.sections,
          signature: track.signature,
          featureZones: track.featureZones,
          scenarios: Object.keys(track.scenarios || {}),
        },
        environment: {
          metrics: environment.userData.metrics,
          clearance: environment.userData.clearanceReport
            ? {
                ...environment.userData.clearanceReport,
                placements: environment.userData.clearanceReport.placements.map(
                  ({ bounds, ...placement }) => ({
                    ...placement,
                    partCount: bounds.length,
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
    dispose() {
      active = false;
      cancelAnimationFrame(raf);
      input.dispose();
      audio.dispose();
      effects.dispose();
      ui.dispose();
      ship.dispose();
      road.userData.dispose?.();
      environment.userData.dispose?.();
      ship.group.removeFromParent();
      road.removeFromParent();
      environment.removeFromParent();
      const geometries = new Set(),
        materials = new Set(),
        textures = new Set();
      for (const world of [inspectionScene])
        world.traverse((o) => {
          if (o.geometry) geometries.add(o.geometry);
          for (const m of Array.isArray(o.material) ? o.material : [o.material])
            if (m) {
              materials.add(m);
              for (const v of Object.values(m))
                if (v?.isTexture) textures.add(v);
            }
        });
      geometries.forEach((g) => g.dispose());
      materials.forEach((m) => m.dispose());
      textures.forEach((t) => t.dispose());
      view.dispose();
    },
  };
  pose(state);
  rig.update(track, state, 1, { mode: 'chase' });
  await view.warm();
  await renderer.compileAsync(inspectionScene, camera);
  document.querySelector('#loading')?.remove();
  window.__VN.ready = true;
  ui.setMode('title');
  raf = requestAnimationFrame(render);
}
boot().catch(fail);
