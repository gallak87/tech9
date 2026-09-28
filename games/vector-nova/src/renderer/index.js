import * as T from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { SMAAPass } from 'three/addons/postprocessing/SMAAPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { createSky } from './sky.js';
import { createContactShadow } from './contact-shadow.js';

export async function createRenderer(host, settings) {
  const renderer = new T.WebGLRenderer({
    antialias: true,
    powerPreference: 'high-performance',
  });
  renderer.outputColorSpace = T.SRGBColorSpace;
  renderer.toneMapping = T.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.12;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.autoUpdate = false;
  renderer.shadowMap.type = T.PCFShadowMap;
  renderer.info.autoReset = false;
  host.prepend(renderer.domElement);
  renderer.domElement.id = 'world';
  const scene = new T.Scene();
  scene.background = new T.Color('#77899d');
  scene.fog = new T.FogExp2('#8195af', 0.00025);
  const camera = new T.PerspectiveCamera(64, 1, 0.2, 14000);
  const sky = await createSky();
  scene.add(sky.mesh);
  const contactShadow = createContactShadow();
  scene.add(contactShadow.mesh);
  const environmentScene = new T.Scene();
  const environmentSky = sky.mesh.clone();
  environmentScene.add(environmentSky);
  const pmrem = new T.PMREMGenerator(renderer);
  const env = pmrem.fromScene(environmentScene, 0.04, 0.1, 14000);
  scene.environment = env.texture;
  scene.environmentIntensity = 1.12;
  pmrem.dispose();
  const hemi = new T.HemisphereLight('#a9c8f6', '#243244', 1.18);
  scene.add(hemi);
  const sun = new T.DirectionalLight('#ffc38e', 2.7);
  sun.castShadow = true;
  sun.shadow.mapSize.set(3072, 3072);
  Object.assign(sun.shadow.camera, {
    left: -155,
    right: 155,
    top: 155,
    bottom: -155,
    near: 1,
    far: 1400,
  });
  sun.shadow.bias = -0.00007;
  sun.shadow.normalBias = 0.025;
  scene.add(sun, sun.target);
  // Soft cool back light is a sky contribution, deliberately below the sunset key.
  const fill = new T.DirectionalLight('#a7caff', 0.55);
  fill.position.set(140, 200, -100);
  scene.add(fill);
  const target = new T.WebGLRenderTarget(1, 1, { type: T.HalfFloatType });
  // GTAO blended into multisampled HDR targets produced an opaque region on
  // ANGLE Metal. Use a single-sample target and postprocess edge antialiasing.
  target.samples = 0;
  const composer = new EffectComposer(renderer, target);
  const beauty = new RenderPass(scene, camera);
  composer.addPass(beauty);
  const ao = new GTAOPass(scene, camera, 960, 540);
  ao.blendIntensity = 0.5;
  ao.updateGtaoMaterial({
    radius: 3.0,
    thickness: 1.1,
    distanceExponent: 2,
    distanceFallOff: 0.7,
    scale: 1,
  });
  // Background and the already-composited analytic ambient footprint must not
  // become solid geometry in the AO normal/depth override pass.
  const renderAO = ao.render.bind(ao);
  ao.render = (...args) => {
    sky.mesh.visible = false;
    contactShadow.mesh.visible = false;
    try {
      renderAO(...args);
    } finally {
      sky.mesh.visible = true;
      contactShadow.mesh.visible = true;
    }
  };
  composer.addPass(ao);
  const bloom = new UnrealBloomPass(new T.Vector2(960, 540), 0.16, 0.3, 1.8);
  composer.addPass(bloom);
  const output = new OutputPass();
  composer.addPass(output);
  const antialias = new SMAAPass();
  composer.addPass(antialias);
  const times = [];
  let last = 0;
  let maxima = { calls: 0, triangles: 0 };
  let elapsed = 0;
  let cityReflection = null;
  function apply() {
    const mobile = innerWidth < 760;
    const ratio = Math.min(
      devicePixelRatio,
      settings.quality === 'low' || mobile ? 1 : 1.25,
    );
    renderer.setPixelRatio(ratio);
    renderer.setSize(innerWidth, innerHeight);
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
    composer.setPixelRatio(ratio);
    composer.setSize(innerWidth, innerHeight);
    ao.setSize(
      Math.ceil(innerWidth * ratio * 0.6),
      Math.ceil(innerHeight * ratio * 0.6),
    );
    ao.enabled = settings.quality === 'high' && !mobile;
    bloom.enabled = settings.quality === 'high';
    renderer.shadowMap.enabled = true;
  }
  apply();
  window.addEventListener('resize', apply);
  const sunOffset = sky.sunDirection.clone().multiplyScalar(700);
  return {
    renderer,
    scene,
    camera,
    sun,
    apply,
    bakeCityReflection(position, excluded) {
      const generator = new T.PMREMGenerator(renderer);
      const priorSky = sky.mesh.position.clone();
      const shadows = renderer.shadowMap.enabled;
      const visible = excluded.map((object) => object.visible);
      excluded.forEach((object) => {
        object.visible = false;
      });
      contactShadow.mesh.visible = false;
      sky.mesh.position.copy(position);
      renderer.shadowMap.enabled = false;
      try {
        cityReflection?.dispose();
        cityReflection = generator.fromScene(scene, 0.025, 0.3, 6000, {
          size: 256,
          position,
        });
        return cityReflection.texture;
      } finally {
        generator.dispose();
        renderer.shadowMap.enabled = shadows;
        sky.mesh.position.copy(priorSky);
        contactShadow.mesh.visible = true;
        excluded.forEach((object, i) => {
          object.visible = visible[i];
        });
      }
    },
    updateContact(track, state) {
      contactShadow.update(track, state);
    },
    follow(position) {
      sun.target.position.copy(position);
      sun.position.copy(position).add(sunOffset);
      sun.target.updateMatrixWorld();
      sky.mesh.position.copy(camera.position);
    },
    render(now) {
      const dt = last ? Math.min((now - last) / 1000, 0.1) : 1 / 60;
      if (last && now - last < 1000) times.push(now - last);
      last = now;
      elapsed += dt;
      if (times.length > 24000) times.shift();
      sky.mesh.position.copy(camera.position);
      scene.userData.elapsed = elapsed;
      renderer.info.reset();
      renderer.shadowMap.needsUpdate = true;
      if (settings.quality === 'high') composer.render(dt);
      else renderer.render(scene, camera);
      maxima.calls = Math.max(maxima.calls, renderer.info.render.calls);
      maxima.triangles = Math.max(
        maxima.triangles,
        renderer.info.render.triangles,
      );
    },
    renderInspection(otherScene) {
      renderer.info.reset();
      renderer.render(otherScene, camera);
    },
    async warm() {
      await renderer.compileAsync(scene, camera);
      renderer.info.reset();
      renderer.shadowMap.needsUpdate = true;
      composer.render(0);
      // Startup-only synchronization: readiness follows actual first-pass work,
      // including shadow, AO and antialias programs, not just submission.
      renderer.getContext().finish();
      renderer.info.reset();
    },
    resetMetrics() {
      times.length = 0;
      last = 0;
      maxima = { calls: 0, triangles: 0 };
    },
    getMetrics() {
      const sort = [...times].sort((a, b) => a - b),
        q = (p) =>
          sort[Math.min(sort.length - 1, Math.floor(sort.length * p))] || 0;
      const gl = renderer.getContext(),
        ext = gl.getExtension('WEBGL_debug_renderer_info');
      let geometryBytes = 0,
        textureBytes =
          sky.texture.image.width * sky.texture.image.height * 4 * 1.34;
      const gs = new Set(),
        ts = new Set();
      scene.traverse((o) => {
        if (o.geometry && !gs.has(o.geometry)) {
          gs.add(o.geometry);
          for (const a of Object.values(o.geometry.attributes))
            geometryBytes += a.array.byteLength;
          geometryBytes += o.geometry.index?.array.byteLength || 0;
        }
        for (const m of Array.isArray(o.material) ? o.material : [o.material])
          if (m)
            for (const v of Object.values(m))
              if (v?.isTexture && !ts.has(v)) {
                ts.add(v);
                textureBytes +=
                  (v.image?.width || 256) * (v.image?.height || 256) * 4 * 1.34;
              }
      });
      const ratio = renderer.getPixelRatio();
      const postBytes =
        innerWidth *
        innerHeight *
        ratio *
        ratio *
        (settings.quality === 'high' ? 92 : 16);
      return {
        frames: times.length,
        frameMs: {
          p50: q(0.5),
          p95: q(0.95),
          p99: q(0.99),
          max: sort.at(-1) || 0,
        },
        longFrames: times.filter((t) => t > 33.3).length,
        calls: renderer.info.render.calls,
        triangles: renderer.info.render.triangles,
        maxima,
        geometries: renderer.info.memory.geometries,
        textures: renderer.info.memory.textures,
        estimatedGpuMiB:
          (geometryBytes +
            textureBytes +
            3072 * 3072 * 4 +
            postBytes +
            (cityReflection ? 12 : 8) * 1024 * 1024) /
          2 ** 20,
        gpuEstimateScope:
          'Owned geometry/maps + approximate PMREM/shadow/HDR postprocessing/framebuffers, excludes driver overhead',
        gpu: ext
          ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)
          : gl.getParameter(gl.RENDERER),
        userAgent: navigator.userAgent,
        viewport: { width: innerWidth, height: innerHeight, dpr: ratio },
        pipeline: {
          ambientOcclusion: ao.enabled,
          bloom: bloom.enabled,
          tonemapping: 'ACES',
          colourSpace: 'sRGB',
        },
        timingNote:
          'RAF intervals; headless and capture runs not foreground certification',
      };
    },
    dispose() {
      window.removeEventListener('resize', apply);
      sky.dispose();
      contactShadow.dispose();
      env.dispose();
      cityReflection?.dispose();
      for (const p of [beauty, ao, bloom, output, antialias]) p.dispose();
      ao.gtaoMaterial.dispose();
      ao.blendMaterial.dispose();
      composer.dispose();
      renderer.dispose();
    },
  };
}
