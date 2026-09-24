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
import { terrainHeight, pathCenter } from '../world/terrain.js';

export class SceneApp {
  constructor(canvas, { testMode = false, ui = null } = {}) {
    this.canvas = canvas;
    this.ui = ui;
    this.testMode = testMode;
    this.ready = false;
    this.layers = [];
    this.pendingLayers = new Map();
    this.disposed = false;
    this.events = new EventTarget();
    this.assets = new Map();
    this.bounds = Object.freeze({ min: -76, max: 76, ceiling: 36 });
    this.settings = testMode ? { ...DEFAULT_SETTINGS } : loadSettings();
    this.metrics = { fps: 0, frameMs: 0, drawCalls: 0, triangles: 0 };
    this.scene = new Scene();
    this.scene.background = new Color('#b9c3b9');
    this.scene.fog = new FogExp2('#b9c3b9', 0.0075);
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
    this.hemisphere = new HemisphereLight('#c4d3d2', '#5c6146', 1.4);
    this.scene.add(this.hemisphere);
    this.sun = new DirectionalLight('#ffe2af', 4.7);
    this.sun.position.set(34, 28, -48);
    this.sun.castShadow = true;
    Object.assign(this.sun.shadow.camera, {
      left: -58,
      right: 58,
      top: 58,
      bottom: -58,
      near: 1,
      far: 180,
    });
    this.sun.shadow.bias = -0.00012;
    this.sun.shadow.normalBias = 0.035;
    this.sun.shadow.radius = 3;
    this.scene.add(this.sun, this.sun.target);
    this.sky = new Sky();
    this.sky.scale.setScalar(1800);
    this.sky.material.depthWrite = false;
    Object.assign(this.sky.material.uniforms.turbidity, { value: 8 });
    this.sky.material.uniforms.rayleigh.value = 0.9;
    this.sky.material.uniforms.mieCoefficient.value = 0.005;
    this.sky.material.uniforms.mieDirectionalG.value = 0.85;
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
    this.controls = new FlyCamera(this.camera, canvas, this.bounds);
    this.setView('trail');
    this.abort = new AbortController();
    window.addEventListener('resize', () => this.resize(), {
      signal: this.abort.signal,
    });
    document.addEventListener(
      'visibilitychange',
      () => {
        this.lastTime = performance.now();
        this.controls.resetMotion();
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
              'The graphics context was interrupted. Reload to resume the forest.',
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
  setView(name = 'trail') {
    const presets = {
      trail: {
        position: [
          pathCenter(23) - 0.6,
          terrainHeight(pathCenter(23), 23) + 2.25,
          23,
        ],
        target: [
          pathCenter(-18) + 0.6,
          terrainHeight(pathCenter(-18), -18) - 0.8,
          -18,
        ],
      },
      grove: {
        position: [
          pathCenter(-7) + 4,
          terrainHeight(pathCenter(-7) + 4, -7) + 2.1,
          -7,
        ],
        target: [
          pathCenter(-34) - 3,
          terrainHeight(pathCenter(-34), -34) + 0.6,
          -34,
        ],
      },
      ridge: {
        position: [-22, terrainHeight(-22, 8) + 6, 8],
        target: [10, 5, -28],
      },
      boundary: {
        position: [75.9, terrainHeight(75.9, 0) + 3, 0],
        target: [100, terrainHeight(75.9, 0) + 3, 0],
      },
    };
    const view = presets[name] || presets.trail;
    this.camera.position.fromArray(view.position);
    this.camera.lookAt(new Vector3(...view.target));
    this.controls?.resetMotion();
    this.camera.updateMatrixWorld();
    this.events.dispatchEvent(new CustomEvent('viewchange', { detail: name }));
  }
  setSettings(patch, persist = true) {
    const previous = this.settings;
    this.settings = validateSettings({ ...this.settings, ...patch });
    const settings = this.settings;
    const preset = QUALITY[settings.quality];
    this.renderer.toneMappingExposure = 0.96 * settings.exposure;
    this.sun.intensity = 4.7 * settings.sunlight;
    this.hemisphere.intensity = 1.4;
    this.scene.fog.density = 0.0075 * settings.atmosphere;
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
    if (persist) saveSettings(settings);
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
      const dt = Math.min(rawDt, 0.05);
      this.lastTime = now;
      this.controls.update(dt);
      for (const layer of this.layers) layer.update?.(dt, now / 1000);
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
      camera: {
        position: this.camera.position.toArray(),
        quaternion: this.camera.quaternion.toArray(),
      },
      settings: { ...this.settings },
      bounds: { minX: -76, maxX: 76, minZ: -76, maxZ: 76, minY: 0, maxY: 36 },
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
