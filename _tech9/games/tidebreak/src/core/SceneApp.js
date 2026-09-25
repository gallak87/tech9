import {
  ACESFilmicToneMapping,
  Color,
  DirectionalLight,
  FogExp2,
  HemisphereLight,
  PCFShadowMap,
  PerspectiveCamera,
  Scene,
  SRGBColorSpace,
  Vector3,
  WebGLRenderer,
} from 'three';
import { Sky } from 'three/addons/objects/Sky.js';
import { FlyCamera } from './FlyCamera.js';
import { AtmospherePass } from './AtmospherePass.js';
import {
  DEFAULT_SETTINGS,
  loadSettings,
  QUALITY,
  saveSettings,
  validateSettings,
} from './settings.js';
import { validateDefinition } from './sceneDefinition.js';

export class SceneApp {
  constructor(
    canvas,
    {
      definition,
      testMode = false,
      ui = null,
      storageKey,
      playbackRate = 1,
    } = {},
  ) {
    this.definition = validateDefinition(definition);
    this.groundHeight = definition.groundHeight;
    this.storageKey = storageKey ?? `${definition.id}.settings`;
    const environment = definition.environment;
    this.canvas = canvas;
    this.ui = ui;
    this.testMode = testMode;
    this.playbackRate =
      testMode && [1, 2, 5, 10].includes(playbackRate) ? playbackRate : 1;
    this.ready = false;
    this.layers = [];
    this.pendingLayers = new Map();
    this.disposed = false;
    this.events = new EventTarget();
    this.assets = new Map();
    this.bounds = Object.freeze({ ...definition.bounds });
    this.settings = testMode
      ? { ...DEFAULT_SETTINGS }
      : loadSettings(this.storageKey);
    this.metrics = { fps: 0, frameMs: 0, drawCalls: 0, triangles: 0 };
    this.scene = new Scene();
    this.scene.background = new Color(environment.fog.color);
    this.scene.fog = new FogExp2(
      environment.fog.color,
      environment.fog.density,
    );
    this.camera = new PerspectiveCamera(58, 1, 0.15, 240);
    this.renderer = new WebGLRenderer({
      canvas,
      antialias: false,
      powerPreference: 'high-performance',
    });
    this.renderer.outputColorSpace = SRGBColorSpace;
    this.renderer.toneMapping = ACESFilmicToneMapping;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = PCFShadowMap;
    this.renderer.shadowMap.autoUpdate = false;
    this.renderer.info.autoReset = false;
    this.hemisphere = new HemisphereLight(
      environment.hemisphere.sky,
      environment.hemisphere.ground,
      environment.hemisphere.intensity,
    );
    this.scene.add(this.hemisphere);
    this.sun = new DirectionalLight(
      environment.sun.color,
      environment.sun.intensity,
    );
    this.sun.position.fromArray(environment.sun.position);
    this.sun.castShadow = true;
    Object.assign(this.sun.shadow.camera, environment.sun.shadowBounds);
    this.sun.shadow.bias = -0.00012;
    this.sun.shadow.normalBias = 0.035;
    this.sun.shadow.radius = 3;
    this.scene.add(this.sun, this.sun.target);
    this.sky = new Sky();
    this.sky.scale.setScalar(1800);
    this.sky.material.depthWrite = false;
    Object.assign(this.sky.material.uniforms.turbidity, {
      value: environment.sky.turbidity,
    });
    this.sky.material.uniforms.rayleigh.value = environment.sky.rayleigh;
    this.sky.material.uniforms.mieCoefficient.value =
      environment.sky.mieCoefficient;
    this.sky.material.uniforms.mieDirectionalG.value =
      environment.sky.mieDirectionalG;
    this.sky.material.uniforms.sunPosition.value.copy(this.sun.position);
    this.sky.material.uniforms.horizonTint = { value: this.scene.fog.color };
    this.sky.material.fragmentShader = this.sky.material.fragmentShader
      .replace(
        'varying vec3 vWorldPosition;',
        'varying vec3 vWorldPosition;\nuniform vec3 horizonTint;',
      )
      .replace(
        'gl_FragColor = vec4( texColor, 1.0 );',
        'texColor = mix(horizonTint, texColor, smoothstep(-0.04, 0.28, direction.y));\ngl_FragColor = vec4(texColor, 1.0);',
      );
    this.scene.add(this.sky);
    this.atmosphere = new AtmospherePass(this.renderer);
    this.setController(
      ({ camera, canvas, bounds, groundHeight }) =>
        new FlyCamera(camera, canvas, bounds, groundHeight),
    );
    this.setView(definition.initialView);
    this.abort = new AbortController();
    window.addEventListener('resize', () => this.resize(), {
      signal: this.abort.signal,
    });
    document.addEventListener(
      'visibilitychange',
      () => {
        this.lastTime = performance.now();
        this.controls.resetMotion?.();
      },
      { signal: this.abort.signal },
    );
    canvas.addEventListener(
      'webglcontextlost',
      (event) => {
        event.preventDefault();
        this.stop();
        this.events.dispatchEvent(
          new CustomEvent('error', {
            detail:
              'The graphics context was interrupted. Reload to resume the scene.',
          }),
        );
      },
      { signal: this.abort.signal },
    );
    this.setSettings(this.settings, false);
  }
  async register(layer) {
    if (this.disposed)
      throw new Error('Cannot register a layer on a disposed app.');
    if (
      !layer.id ||
      this.layers.some((item) => item.id === layer.id) ||
      this.pendingLayers.has(layer.id)
    ) {
      throw new Error('World layers require a unique id.');
    }
    const pending = { cancelled: false };
    this.pendingLayers.set(layer.id, pending);
    try {
      await layer.init({
        scene: this.scene,
        ui: this.ui,
        camera: this.camera,
        renderer: this.renderer,
        assets: this.assets,
        events: this.events,
        bounds: this.bounds,
        groundHeight: this.groundHeight,
        definition: this.definition,
      });
      if (this.disposed || pending.cancelled)
        throw new Error(`Layer ${layer.id} was cancelled while loading.`);
      layer.configure?.(this.settings);
      this.layers.push(layer);
      this.renderer.shadowMap.needsUpdate = true;
      return layer;
    } catch (error) {
      try {
        layer.dispose?.();
      } catch (cleanupError) {
        console.error('Layer cleanup failed', cleanupError);
      }
      throw error;
    } finally {
      this.pendingLayers.delete(layer.id);
    }
  }
  unregister(id) {
    const pending = this.pendingLayers.get(id);
    if (pending) pending.cancelled = true;
    const index = this.layers.findIndex((layer) => layer.id === id);
    if (index < 0) return;
    const [layer] = this.layers.splice(index, 1);
    try {
      layer.dispose?.();
    } catch (error) {
      console.error(`Layer ${id} cleanup failed`, error);
    }
    this.renderer.shadowMap.needsUpdate = true;
  }
  setController(factoryOrController) {
    if (this.disposed)
      throw new Error('Cannot replace a controller on a disposed app.');
    const next =
      typeof factoryOrController === 'function'
        ? factoryOrController({
            camera: this.camera,
            canvas: this.canvas,
            bounds: this.bounds,
            groundHeight: this.groundHeight,
            events: this.events,
            definition: this.definition,
          })
        : factoryOrController;
    if (
      !next ||
      typeof next.update !== 'function' ||
      typeof next.dispose !== 'function'
    ) {
      next?.dispose?.();
      throw new Error(
        'Camera controllers require synchronous update and dispose methods.',
      );
    }
    if (next === this.controls) return next;
    const previous = this.controls;
    this.controls = next;
    try {
      previous?.dispose();
    } catch (error) {
      console.error('Previous camera controller cleanup failed', error);
    }
    return next;
  }
  setView(name = this.definition.initialView) {
    const views = this.definition.views;
    const selected = Object.hasOwn(views, name)
      ? name
      : this.definition.initialView;
    const view = views[selected];
    this.camera.position.fromArray(view.position);
    this.camera.lookAt(new Vector3(...view.target));
    this.controls?.resetMotion?.();
    this.camera.updateMatrixWorld();
    this.events.dispatchEvent(
      new CustomEvent('viewchange', { detail: selected }),
    );
  }
  setSettings(patch, persist = true) {
    const previous = this.settings;
    this.settings = validateSettings({ ...this.settings, ...patch });
    const settings = this.settings;
    const preset = QUALITY[settings.quality];
    const environment = this.definition.environment;
    this.renderer.toneMappingExposure =
      environment.exposure * settings.exposure;
    this.sun.intensity = environment.sun.intensity * settings.sunlight;
    this.hemisphere.intensity = environment.hemisphere.intensity;
    this.scene.fog.density = environment.fog.density * settings.atmosphere;
    if (this.sun.shadow.mapSize.x !== preset.shadowSize) {
      this.sun.shadow.mapSize.set(preset.shadowSize, preset.shadowSize);
      this.sun.shadow.map?.dispose();
      this.sun.shadow.map = null;
    }
    this.atmosphere.configure(preset, settings);
    for (const layer of this.layers) layer.configure?.(settings);
    if (
      previous.quality !== settings.quality ||
      previous.richness !== settings.richness ||
      previous.sunlight !== settings.sunlight
    )
      this.renderer.shadowMap.needsUpdate = true;
    this.resize();
    if (persist) saveSettings(settings, this.storageKey);
    this.events.dispatchEvent(
      new CustomEvent('settingschange', { detail: { ...settings } }),
    );
  }
  resize() {
    const width = this.canvas.clientWidth || window.innerWidth;
    const height = this.canvas.clientHeight || window.innerHeight;
    const ratio = Math.min(
      window.devicePixelRatio || 1,
      QUALITY[this.settings.quality].pixelRatio,
      Math.sqrt(QUALITY[this.settings.quality].maxPixels / (width * height)),
    );
    this.renderer.setPixelRatio(ratio);
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.atmosphere.resize(width, height, ratio);
  }
  start() {
    if (this.disposed) throw new Error('Cannot start a disposed app.');
    this.ready = true;
    this.lastTime = performance.now();
    this.sampleTime = 0;
    this.sampleFrames = 0;
    this.renderer.shadowMap.needsUpdate = true;
    this.renderer.setAnimationLoop((now) => {
      if (document.hidden) return;
      const rawDt = (now - this.lastTime) / 1000;
      const dt = Math.min(rawDt, 0.05) * this.playbackRate;
      this.lastTime = now;
      for (const layer of this.layers) layer.update?.(dt, now / 1000);
      this.controls.update(dt);
      this.renderer.info.reset();
      this.atmosphere.render(this.scene, this.camera, this.sun);
      this.sampleTime += rawDt;
      this.sampleFrames++;
      if (this.sampleTime >= 0.7) {
        this.metrics = {
          fps: Math.round(this.sampleFrames / this.sampleTime),
          frameMs: Number(
            ((1000 * this.sampleTime) / this.sampleFrames).toFixed(1),
          ),
          drawCalls: this.renderer.info.render.calls,
          triangles: this.renderer.info.render.triangles,
        };
        this.sampleTime = 0;
        this.sampleFrames = 0;
        this.events.dispatchEvent(
          new CustomEvent('metrics', { detail: this.metrics }),
        );
      }
    });
  }
  stop() {
    this.ready = false;
    this.renderer.setAnimationLoop(null);
  }
  snapshot() {
    return {
      ready: this.ready,
      playbackRate: this.playbackRate,
      camera: {
        position: this.camera.position.toArray(),
        quaternion: this.camera.quaternion.toArray(),
      },
      settings: { ...this.settings },
      bounds: { ...this.bounds },
      scene: { id: this.definition.id, title: this.definition.title },
      metrics: { ...this.metrics },
      world: this.layers.map((layer) => ({ id: layer.id, ...layer.stats })),
      renderer: {
        memory: {
          ...this.renderer.info.memory,
          programs: this.renderer.info.programs.length,
        },
        webgl: this.renderer.capabilities.isWebGL2 ? 'WebGL2' : 'WebGL',
        pixelRatio: this.renderer.getPixelRatio(),
        width: this.canvas.width,
        height: this.canvas.height,
      },
    };
  }
  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    for (const pending of this.pendingLayers.values()) pending.cancelled = true;
    this.stop();
    for (const layer of [...this.layers]) this.unregister(layer.id);
    this.controls.dispose();
    this.abort.abort();
    this.atmosphere.dispose();
    this.sky.geometry.dispose();
    this.sky.material.dispose();
    this.sun.shadow.map?.dispose();
    this.renderer.dispose();
  }
}
