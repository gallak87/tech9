import { Color, MathUtils } from 'three';
import {
  createWeather,
  WEATHER_PRESETS,
  DEFAULT_WEATHER,
} from '../modules/weather/src/Weather.js';

/** This adapter alone knows about the forest's sky, lights, views and interface. */
export function createForestWeather(app, forest, surface) {
  const weather = createWeather({
    targets: forest.getWeatherTargets(),
    sampleSurface: surface.sampleSurface,
    surfaceBounds: app.bounds,
  });
  const colors = {
    fog: new Color(),
    sun: new Color(),
    sky: new Color(),
    ground: new Color(),
  };
  const base = app.definition.environment;
  const initialSky = app.sky.material.fragmentShader;
  let panel,
    abort,
    preset = 'clear';
  let active = true;
  let statusTimer = 0;
  const skyCloud = { value: 0 };
  const skyWinter = { value: 0 };
  function environment() {
    const s = weather.condition;
    const cloud = s.cloud,
      winter = s.winter;
    colors.fog
      .set(base.fog.color)
      .lerp(new Color('#7b939f'), cloud)
      .lerp(new Color('#b5c9da'), winter * (1 - cloud * 0.35));
    app.scene.fog.color.copy(colors.fog);
    app.scene.background.copy(colors.fog);
    app.scene.fog.density =
      MathUtils.lerp(base.fog.density, 0.019, cloud) * app.settings.atmosphere;
    colors.sun
      .set(base.sun.color)
      .lerp(new Color('#d0dfed'), cloud)
      .lerp(new Color('#f7eddb'), winter * (1 - cloud));
    app.sun.color.copy(colors.sun);
    app.sun.intensity =
      base.sun.intensity *
      MathUtils.lerp(1, 0.09, cloud) *
      MathUtils.lerp(1, 0.8, winter) *
      app.settings.sunlight;
    colors.sky
      .set(base.hemisphere.sky)
      .lerp(new Color('#a9bbc9'), cloud)
      .lerp(new Color('#b9cee3'), winter);
    colors.ground
      .set(base.hemisphere.ground)
      .lerp(new Color('#586775'), winter);
    app.hemisphere.color.copy(colors.sky);
    app.hemisphere.groundColor.copy(colors.ground);
    app.hemisphere.intensity = MathUtils.lerp(
      base.hemisphere.intensity,
      1.8,
      cloud,
    );
    app.atmosphere.volumeMaterial.uniforms.strength.value =
      app.settings.atmosphere *
      app.settings.sunlight *
      (1 - cloud) *
      MathUtils.lerp(1, 0.55, winter);
    app.atmosphere.volumeMaterial.uniforms.sunColor.value.copy(colors.sun);
    app.renderer.toneMappingExposure =
      base.exposure * app.settings.exposure * MathUtils.lerp(1, 0.91, winter);
    skyCloud.value = cloud;
    skyWinter.value = winter;
  }
  function syncControls() {
    if (!panel) return;
    const target = weather.stats.target;
    for (const input of panel.querySelectorAll('[data-weather]')) {
      const key = input.dataset.weather;
      input.value = target[key];
      panel.querySelector(`[data-value="${key}"]`).textContent =
        key === 'windDirection'
          ? `${Math.round(target[key])}°`
          : `${Math.round(target[key] * 100)}%`;
    }
    for (const button of panel.querySelectorAll('[data-preset]'))
      button.setAttribute(
        'aria-pressed',
        String(button.dataset.preset === preset),
      );
    panel.querySelector('#weather-sound').textContent = target.muted
      ? 'Sound off'
      : 'Sound on';
    panel
      .querySelector('#weather-sound')
      .setAttribute('aria-pressed', String(!target.muted));
    panel.querySelector('#weather-pause').textContent = target.paused
      ? 'Resume weather'
      : 'Pause weather';
    panel
      .querySelector('#weather-pause')
      .setAttribute('aria-pressed', String(target.paused));
  }
  function mount(root) {
    panel = document.createElement('section');
    panel.className = 'weather-panel';
    panel.setAttribute('aria-label', 'Weather controls');
    panel.innerHTML = `<div class="weather-heading"><span>FIELD NOTES / WEATHER</span><button id="weather-collapse" aria-expanded="true" aria-controls="weather-options" title="Toggle weather controls">−</button></div>
      <div id="weather-options"><h2>A change in the air.</h2><div class="weather-presets">${Object.entries(
        WEATHER_PRESETS,
      )
        .map(
          ([id, p]) =>
            `<button data-preset="${id}" aria-pressed="${id === 'clear'}">${p.label}</button>`,
        )
        .join('')}</div>
      <div class="weather-readout" aria-live="off"><span id="weather-condition">Clear</span><span id="weather-exposure">Open sky</span></div>
      <details id="weather-details"><summary>Shape the weather</summary><div class="weather-sliders">${[
        ['rain', 'Rain'],
        ['snowfall', 'Falling snow'],
        ['snow', 'Settled snow'],
        ['wetness', 'Surface wetness'],
        ['wind', 'Wind'],
        ['windDirection', 'Wind direction'],
        ['cloud', 'Cloud cover'],
      ]
        .map(
          ([id, label]) =>
            `<label for="weather-${id}"><span>${label}<output data-value="${id}" for="weather-${id}"></output></span><input id="weather-${id}" data-weather="${id}" type="range" min="0" max="${id === 'windDirection' ? 360 : 1}" step="${id === 'windDirection' ? 5 : 0.01}" /></label>`,
        )
        .join('')}</div></details>
      <div class="weather-actions"><button id="weather-sound" aria-pressed="false">Sound off</button><button id="weather-pause" aria-pressed="false">Pause weather</button><button id="weather-reset">Reset</button></div>
      <div class="weather-inspect"><span>Inspect</span><button data-weather-view="trail">Trail</button><button data-weather-view="weatherRock">Rock</button><button data-weather-view="weatherShelter">Shelter</button></div></div>`;
    root.append(panel);
    const options = { signal: abort.signal };
    for (const button of panel.querySelectorAll('[data-preset]'))
      button.addEventListener(
        'click',
        () => {
          preset = button.dataset.preset;
          weather.setPreset(preset);
          syncControls();
        },
        options,
      );
    for (const input of panel.querySelectorAll('[data-weather]'))
      input.addEventListener(
        'input',
        () => {
          preset = 'custom';
          weather.configure({ [input.dataset.weather]: Number(input.value) });
          syncControls();
        },
        options,
      );
    for (const button of panel.querySelectorAll('[data-weather-view]'))
      button.addEventListener(
        'click',
        () => {
          app.setView(button.dataset.weatherView);
          app.canvas.focus();
        },
        options,
      );
    panel.querySelector('#weather-sound').addEventListener(
      'click',
      async () => {
        const muted = !weather.stats.target.muted;
        if (!muted) await weather.unlockAudio();
        weather.configure({ muted });
        syncControls();
      },
      options,
    );
    panel.querySelector('#weather-pause').addEventListener(
      'click',
      () => {
        weather.configure({ paused: !weather.stats.target.paused });
        syncControls();
      },
      options,
    );
    panel.querySelector('#weather-reset').addEventListener(
      'click',
      () => {
        weather.configure(DEFAULT_WEATHER);
        preset = 'clear';
        syncControls();
      },
      options,
    );
    panel.querySelector('#weather-collapse').addEventListener(
      'click',
      () => {
        const element = panel.querySelector('#weather-options');
        element.hidden = !element.hidden;
        panel
          .querySelector('#weather-collapse')
          .setAttribute('aria-expanded', String(!element.hidden));
        panel.querySelector('#weather-collapse').textContent = element.hidden
          ? '+'
          : '−';
      },
      options,
    );
    document.addEventListener(
      'pointerlockchange',
      () => {
        if (document.pointerLockElement === app.canvas) {
          panel.querySelector('#weather-options').hidden = true;
          panel.querySelector('#weather-collapse').textContent = '+';
          panel
            .querySelector('#weather-collapse')
            .setAttribute('aria-expanded', 'false');
        }
      },
      options,
    );
    syncControls();
  }
  return {
    id: 'forest-weather',
    get stats() {
      return { ...weather.stats, preset };
    },
    get condition() {
      return weather.condition;
    },
    groundSnowDepth: (x, z) =>
      active ? surface.snowDepth(x, z, weather.condition.snow) : 0,
    init(context) {
      abort = new AbortController();
      weather.init(context);
      app.sky.material.uniforms.weatherCloud = skyCloud;
      app.sky.material.uniforms.weatherWinter = skyWinter;
      app.sky.material.fragmentShader = initialSky
        .replace(
          'uniform vec3 horizonTint;',
          'uniform vec3 horizonTint; uniform float weatherCloud; uniform float weatherWinter;',
        )
        .replace(
          'gl_FragColor = vec4(texColor, 1.0);',
          `vec3 overcast = mix(horizonTint,vec3(0.38,0.47,0.56),smoothstep(0.0,0.75,direction.y));
        texColor = mix(texColor,overcast,weatherCloud*0.96);
        texColor = mix(texColor,texColor*vec3(0.9,0.98,1.1),weatherWinter*0.3);
        gl_FragColor = vec4(texColor, 1.0);`,
        );
      app.sky.material.needsUpdate = true;
      mount(context.ui);
      environment();
    },
    configure(settings) {
      weather.configure(settings);
      environment();
    },
    update(dt, elapsed) {
      weather.update(dt, elapsed);
      environment();
      statusTimer += dt;
      if (statusTimer > 0.25 && panel) {
        statusTimer = 0;
        const s = weather.condition,
          p = app.camera.position;
        const hit = surface.sampleSurface(p.x, p.z);
        panel.querySelector('#weather-condition').textContent =
          `${WEATHER_PRESETS[preset]?.label ?? 'Custom'} · wet ${Math.round(s.wetness * 100)}%`;
        panel.querySelector('#weather-exposure').textContent =
          hit && p.y < hit.coverHeight && hit.exposure < 0.55
            ? 'Under canopy'
            : 'Open sky';
      }
    },
    configureWeather(patch) {
      preset = 'custom';
      weather.configure(patch);
      syncControls();
    },
    dispose() {
      active = false;
      abort?.abort();
      panel?.remove();
      weather.dispose();
      app.sky.material.fragmentShader = initialSky;
      delete app.sky.material.uniforms.weatherCloud;
      delete app.sky.material.uniforms.weatherWinter;
      app.sky.material.needsUpdate = true;
      app.scene.fog.color.set(base.fog.color);
      app.scene.background.set(base.fog.color);
      app.sun.color.set(base.sun.color);
      app.hemisphere.color.set(base.hemisphere.sky);
      app.hemisphere.groundColor.set(base.hemisphere.ground);
      app.atmosphere.volumeMaterial.uniforms.sunColor.value.set('#ffe2ae');
      app.scene.fog.density = base.fog.density * app.settings.atmosphere;
      app.sun.intensity = base.sun.intensity * app.settings.sunlight;
      app.hemisphere.intensity = base.hemisphere.intensity;
      app.renderer.toneMappingExposure = base.exposure * app.settings.exposure;
      app.atmosphere.volumeMaterial.uniforms.strength.value =
        app.settings.atmosphere * app.settings.sunlight;
    },
  };
}
