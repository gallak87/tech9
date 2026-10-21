// Shared example setup. Applications retain ownership of renderer, lighting and loop.
import * as THREE from 'three';
import { Sky } from 'three/addons/objects/Sky.js';
import {
  createLandscape,
  followLandscapeSun,
  AtmospherePass,
} from '../src/Landscape.js';
import { createWeather } from '../../weather/src/Weather.js';
export async function createExampleScene() {
  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2('#b5c9c5', 0.00031);
  const camera = new THREE.PerspectiveCamera(
    58,
    innerWidth / innerHeight,
    0.15,
    9500,
  );
  camera.position.set(0, 9, 0);
  const renderer = new THREE.WebGLRenderer({
    antialias: true,
    powerPreference: 'high-performance',
  });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.98;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.shadowMap.autoUpdate = false;
  document.body.append(renderer.domElement);
  const hemi = new THREE.HemisphereLight('#c4d3d2', '#5c6146', 1.65);
  const sun = new THREE.DirectionalLight('#ffe2af', 4.2);
  sun.position.set(100, 180, -120);
  sun.castShadow = true;
  sun.shadow.mapSize.set(3072, 3072);
  Object.assign(sun.shadow.camera, {
    left: -135,
    right: 135,
    top: 135,
    bottom: -135,
    near: 1,
    far: 650,
  });
  sun.shadow.bias = -0.000015;
  sun.shadow.normalBias = 0.3;
  sun.shadow.radius = 3;
  scene.add(hemi, sun, sun.target);
  const sky = new Sky();
  sky.scale.setScalar(10000);
  sky.material.depthWrite = false;
  const u = sky.material.uniforms;
  u.turbidity.value = 4;
  u.rayleigh.value = 1.4;
  u.mieCoefficient.value = 0.004;
  u.mieDirectionalG.value = 0.8;
  u.sunPosition.value.copy(sun.position);
  scene.add(sky);
  const landscape = createLandscape({ windMode: 'weather', manageFog: false });
  await landscape.init({ scene, camera, renderer });
  let weather;
  function attachWeather(extraTargets = []) {
    weather?.dispose();
    weather = createWeather({
      targets: [...landscape.getWeatherTargets(), ...extraTargets],
      sampleSurface: landscape.sampleSurface,
      surfaceBounds: landscape.surfaceBounds,
      fieldResolution: 256,
      features: { audio: false },
      settings: { wind: 0.2 },
    });
    weather.init({ scene, camera });
    return weather;
  }
  attachWeather();
  const atmosphere = new AtmospherePass(renderer);
  atmosphere.configure(
    { samples: 4, rays: 32 },
    { atmosphere: 1, sunlight: 1 },
  );
  const abort = new AbortController();
  const resize = () => {
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(innerWidth, innerHeight);
    atmosphere.resize(innerWidth, innerHeight, renderer.getPixelRatio());
  };
  resize();
  addEventListener('resize', resize, { signal: abort.signal });
  for (const button of document.querySelectorAll('[data-weather]'))
    button.addEventListener(
      'click',
      () => {
        weather.setPreset(button.dataset.weather);
        button.blur();
      },
      { signal: abort.signal },
    );
  const clear = new THREE.Color('#b5c9c5'),
    overcast = new THREE.Color('#aebdc7');
  let disposed = false;
  return {
    scene,
    camera,
    renderer,
    landscape,
    sun,
    attachWeather,
    get weather() {
      return weather;
    },
    render(dt, elapsed) {
      landscape.update(dt, elapsed);
      weather.update(dt);
      const c = weather.condition;
      sun.intensity = 4.2 * (1 - c.cloud * 0.78);
      hemi.intensity = 1.65 * (1 - c.cloud * 0.22);
      u.turbidity.value = 4 + c.cloud * 10;
      scene.fog.color.copy(clear).lerp(overcast, c.cloud);
      const altitude =
        camera.position.y -
        landscape.groundHeight(camera.position.x, camera.position.z);
      scene.fog.density =
        (0.00022 + 0.0025 * Math.exp(-Math.max(0, altitude) / 35)) *
        (1 + c.rain * 0.5);
      followLandscapeSun(sun, camera.position, landscape.groundHeight);
      renderer.shadowMap.needsUpdate = true;
      atmosphere.volumeMaterial.uniforms.strength.value = 1 - c.cloud * 0.8;
      atmosphere.render(
        scene,
        camera,
        sun,
        landscape.groundHeight(camera.position.x, camera.position.z),
      );
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      renderer.setAnimationLoop(null);
      abort.abort();
      weather.dispose();
      landscape.dispose();
      atmosphere.dispose();
      sky.geometry.dispose();
      sky.material.dispose();
      sun.shadow.map?.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    },
  };
}
