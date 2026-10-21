import { createAircraft, createAircraftControls } from '../src/Aircraft.js';
import { FollowCamera } from '../../follow-camera/src/FollowCamera.js';
import { createExampleScene } from '../../landscape/examples/scene.js';
const app = await createExampleScene();
const { landscape, camera, scene, renderer } = app;
let aircraft,
  input,
  follow,
  profile = 'trainer',
  playing = false;
const status = document.querySelector('#status');
const spawn = () => ({
  x: 0,
  z: 0,
  y: landscape.groundHeight(0, 0) + 300,
  heading: 0,
  speed: profile === 'sport' ? 48 : 40,
  throttle: 0.65,
});
function pause() {
  playing = false;
  input?.setEnabled(false);
}
function resume() {
  document.activeElement?.blur();
  playing = true;
  input.setEnabled(true);
}
function toggleCamera() {
  follow.setMode(follow.mode === 'follow' ? 'mounted' : 'follow');
  document.activeElement?.blur();
}
function select(next) {
  pause();
  app.weather.dispose();
  input?.dispose();
  follow?.dispose();
  aircraft?.dispose();
  profile = next;
  aircraft = createAircraft({
    profile,
    spawn: spawn(),
    groundHeight: landscape.groundHeight,
    obstacle: landscape.obstacle,
  });
  scene.add(aircraft.group);
  follow = new FollowCamera(camera, {
    getTarget: aircraft.snapshot,
    groundHeight: landscape.groundHeight,
    follow: { distance: 17, height: 5, lookAhead: 7 },
    mounted: { getPose: aircraft.getCockpitPose },
    onChange: (mode) => aircraft.setCockpitMode(mode === 'mounted'),
  });
  input = createAircraftControls(aircraft, {
    onPause: pause,
    actions: { KeyC: 'camera' },
    onAction: toggleCamera,
  });
  app.attachWeather(aircraft.getWeatherTargets());
  follow.update(0);
  document.activeElement?.blur();
}
select('trainer');
for (const button of document.querySelectorAll('[data-profile]'))
  button.onclick = () => select(button.dataset.profile);
document.querySelector('#resume').onclick = resume;
document.querySelector('#cockpit').onclick = toggleCamera;
document.querySelector('#reset').onclick = () => {
  aircraft.reset(spawn());
  follow.resetMotion();
  resume();
};
let last = performance.now(),
  elapsed = 0;
renderer.setAnimationLoop((now) => {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  elapsed += dt;
  const state = playing
    ? aircraft.step(dt, input.sample())
    : aircraft.snapshot();
  if (state.contact) pause();
  follow.update(dt);
  app.render(dt, elapsed);
  status.value = `${profile} · ${playing ? 'flying' : 'paused — Fly / resume'} · ${Math.round(state.speed)} m/s · ${Math.round(state.y - landscape.groundHeight(state.x, state.z))} m AGL · assistance ${state.stabilization ? 'on' : 'off'}${state.contact ? ' · contact — reset to fly' : ''}`;
});
if (new URLSearchParams(location.search).get('test') === '1')
  window.__EXAMPLE_TEST__ = {
    app,
    pause,
    select,
    reset(pose) {
      aircraft.reset(pose);
      follow.resetMotion();
      follow.update(0);
    },
    snapshot: () => ({
      profile,
      playing,
      ...aircraft.snapshot(),
      cameraMode: follow.mode,
      cockpit: aircraft.getCockpitPose(),
      ailerons: aircraft.visual.ailerons.map((a) => a.rotation.x),
      memory: { ...renderer.info.memory },
      programs: renderer.info.programs.length,
      stats: landscape.stats,
    }),
  };
addEventListener(
  'pagehide',
  () => {
    pause();
    input.dispose();
    follow.dispose();
    app.weather.dispose();
    aircraft.dispose();
    app.dispose();
  },
  { once: true },
);
