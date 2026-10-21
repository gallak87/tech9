import * as T from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { SMAAPass } from 'three/addons/postprocessing/SMAAPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { createLifetime } from '../core/lifecycle.js';
import { ExhaustHeatPass } from '../ships/exhaust-heat-pass.js';
import { configureShipTextures } from '../ships/texture-loader.js';
import { textureMemory } from './texture-memory.js';
import { createContactShadow } from './contact-shadow.js';
import { attachWorldPass } from './world-pass.js';
import { drawUnculledScene } from './warm-scene.js';
import { mobileGraphics } from './device.js';
import { createGraphicsContext } from './graphics-context.js';
import { racingLens, racingBlurStrength } from './racing-lens.js';

export async function createRenderer(
  host,
  settings,
  { shape = false, createBackdrop, signal, ...options },
) {
  const lifetime = createLifetime();
  let graphics;
  try {
    const renderer = lifetime.own(
      new T.WebGLRenderer({
        antialias: true,
        powerPreference: 'high-performance',
      }),
    );
    configureShipTextures(renderer);
    lifetime.defer(() => renderer.domElement.remove());
    // In-page circuit changes must release the old WebGL context as well as objects.
    lifetime.defer(() => renderer.forceContextLoss());
    graphics = lifetime.own(createGraphicsContext(renderer, signal));
    renderer.outputColorSpace = T.SRGBColorSpace;
    renderer.toneMapping = T.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.12;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.autoUpdate = false;
    renderer.shadowMap.type = T.PCFShadowMap;
    renderer.transmissionResolutionScale =
      options.transmissionResolutionScale ?? 1;
    renderer.info.autoReset = false;
    host.prepend(renderer.domElement);
    renderer.domElement.id = 'world';
    const scene = new T.Scene();
    scene.background = new T.Color(options.background ?? '#111a21');
    scene.fog = options.fog
      ? new T.FogExp2(options.fog.color, options.fog.density)
      : null;
    const backdrop = lifetime.own(await createBackdrop({ settings }));
    if (!backdrop.group?.isObject3D || !backdrop.sunDirection?.isVector3)
      throw new Error(
        'Invalid circuit backdrop: group and sunDirection are required',
      );
    await backdrop.ready;
    graphics.check();
    const far = backdrop.far ?? 14000;
    const camera = new T.PerspectiveCamera(64, 1, 0.2, far);
    const backgroundGroup = backdrop.group;
    scene.add(backgroundGroup);
    const frame = {
      camera,
      settings,
      time: 0,
      dt: 0,
      mode: 'title',
      reset: true,
    };
    const updateBackdrop = () => backdrop.update?.(frame);
    const contactShadow = lifetime.own(createContactShadow(options.contact));
    scene.add(contactShadow.mesh);
    const environmentScene = new T.Scene();
    environmentScene.background = scene.background.clone();
    const environmentSky = backgroundGroup.clone(true);
    environmentSky.visible = true;
    environmentSky.traverse((object) => {
      if (object.userData.reflectionExclude) object.visible = false;
    });
    environmentScene.add(environmentSky);
    const pmrem = new T.PMREMGenerator(renderer);
    let env;
    try {
      env = lifetime.own(pmrem.fromScene(environmentScene, 0.04, 0.1, far));
    } finally {
      pmrem.dispose();
    }
    scene.environment = env.texture;
    scene.environmentIntensity = backdrop?.environmentIntensity ?? 1.12;
    graphics.check();
    const hemi = new T.HemisphereLight(
      backdrop?.ambientSky ?? (shape ? '#e2ebf3' : '#a9c8f6'),
      backdrop?.ambientGround ?? '#243244',
      backdrop?.ambientIntensity ?? (shape ? 2.2 : 1.18),
    );
    scene.add(hemi);
    const sun = new T.DirectionalLight(
      backdrop?.sunColor ?? (shape ? '#fff2df' : '#ffc38e'),
      backdrop?.sunIntensity ?? 2.7,
    );
    sun.castShadow = true;
    sun.shadow.mapSize.set(3072, 3072);
    const sunShadowExtent = options.sunShadowExtent ?? 155;
    Object.assign(sun.shadow.camera, {
      left: -sunShadowExtent,
      right: sunShadowExtent,
      top: sunShadowExtent,
      bottom: -sunShadowExtent,
      near: 1,
      far: 1400,
    });
    sun.shadow.bias = options.sunShadowBias ?? -0.00007;
    sun.shadow.normalBias = options.sunShadowNormalBias ?? 0.025;
    scene.add(sun, sun.target);
    // Soft cool back light is a sky contribution, deliberately below the sunset key.
    const fill = new T.DirectionalLight(
      backdrop?.fillColor ?? '#a7caff',
      backdrop?.fillIntensity ?? 0.55,
    );
    fill.position.set(140, options.fillHeight ?? 110, -100);
    scene.add(fill);
    const target = new T.WebGLRenderTarget(1, 1, {
      type: T.HalfFloatType,
      depthTexture: new T.DepthTexture(1, 1, T.UnsignedIntType),
    });
    // GTAO blended into multisampled HDR targets produced an opaque region on
    // ANGLE Metal. Use a single-sample target and postprocess edge antialiasing.
    target.samples = 0;
    const composer = lifetime.own(new EffectComposer(renderer, target));
    const beauty = lifetime.own(new RenderPass(scene, camera));
    composer.addPass(beauty);
    const exhaustHeat = lifetime.own(new ExhaustHeatPass(scene, camera));
    composer.addPass(exhaustHeat);
    const ao = lifetime.own(new GTAOPass(scene, camera, 960, 540));
    lifetime.defer(() => {
      ao.gtaoMaterial.dispose();
      ao.blendMaterial.dispose();
    });
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
      const skyVisible = backgroundGroup.visible;
      const contactVisible = contactShadow.mesh.visible;
      const excluded = [];
      scene.traverse((object) => {
        if (object.userData.aoExclude) {
          excluded.push([object, object.visible]);
          object.visible = false;
        }
      });
      backgroundGroup.visible = false;
      contactShadow.mesh.visible = false;
      try {
        renderAO(...args);
      } finally {
        backgroundGroup.visible = skyVisible;
        contactShadow.mesh.visible = contactVisible;
        for (const [object, visible] of excluded) object.visible = visible;
      }
    };
    composer.addPass(ao);
    const bloom = lifetime.own(
      new UnrealBloomPass(
        new T.Vector2(960, 540),
        options.bloomStrength ?? 0.07,
        0.3,
        options.bloomThreshold ?? 3.0,
      ),
    );
    composer.addPass(bloom);
    // Radial streaks convey the catapult's launch without frame history.
    // Preserve the vanishing point and the lower-centre ship silhouette.
    const racingBlur = lifetime.own(new ShaderPass(racingLens));
    const projectedCraft = new T.Vector3();
    racingBlur.enabled = false;
    composer.addPass(racingBlur);
    let blurTarget = 0,
      catapultBlur = false;
    const worldPasses = new Set();
    const output = lifetime.own(new OutputPass());
    composer.addPass(output);
    const antialias = lifetime.own(new SMAAPass());
    composer.addPass(antialias);
    const times = [];
    let last = 0;
    let maxima = { calls: 0, triangles: 0 };
    let elapsed = 0;
    let cityReflection = null;
    lifetime.defer(() => cityReflection?.dispose());
    lifetime.defer(() => sun.shadow.map?.dispose());
    function apply() {
      const mobile = mobileGraphics() || innerWidth < 760;
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
      bloom.enabled = settings.quality === 'high' && !shape;
      exhaustHeat.enabled =
        settings.quality === 'high' && !shape && !settings.reducedMotion;
      renderer.shadowMap.enabled = true;
    }
    apply();
    window.addEventListener('resize', apply);
    lifetime.defer(() => window.removeEventListener('resize', apply));
    const sunOffset = backdrop.sunDirection.clone().multiplyScalar(700);
    return {
      renderer,
      graphics,
      assets: backdrop.assets ?? {},
      // The level owns its pass; the renderer only borrows it before tone mapping.
      attachWorldPass(pass) {
        const detach = attachWorldPass(composer, pass, { beauty, output });
        worldPasses.add(pass);
        return () => {
          detach();
          worldPasses.delete(pass);
        };
      },
      updatePresentation(update) {
        Object.assign(frame, update);
        contactShadow.mesh.visible = frame.mode !== 'fly';
        backdrop.setOverview?.(Boolean(update.reviewing));
        updateBackdrop();
      },
      setRacingFeedback({
        mode,
        speed = 0,
        cruiseSpeed,
        boosting = false,
        catapulting = false,
        enabled = false,
        feedback = {},
        subjectPosition,
        time = 0,
      }) {
        const active =
          enabled &&
          mode === 'racing' &&
          !shape &&
          !settings.reducedMotion &&
          settings.quality === 'high';
        catapultBlur = active && catapulting;
        const courseScale = T.MathUtils.clamp(
          options.catapultBlurScale ?? 1,
          0,
          1,
        );
        blurTarget =
          (active
            ? racingBlurStrength({
                speed,
                cruiseSpeed,
                boost: feedback.boost ?? (boosting ? 1 : 0),
                catapulting,
              })
            : 0) * courseScale;
        racingBlur.uniforms.pressure.value = active
          ? Math.max(feedback.boost ?? 0, catapulting ? 1 : 0) *
            Math.sqrt(courseScale)
          : 0;
        racingBlur.uniforms.time.value = time;
        if (subjectPosition) {
          camera.updateMatrixWorld();
          projectedCraft.copy(subjectPosition).project(camera);
          racingBlur.uniforms.craftCenter.value.set(
            projectedCraft.x * 0.5 + 0.5,
            projectedCraft.y * 0.5 + 0.5,
          );
        }
        if (!active) {
          racingBlur.uniforms.strength.value = 0;
          racingBlur.enabled = false;
        }
      },
      getPresentation: () => backdrop?.getPresentation?.() ?? null,
      drainStormEvents: () => backdrop?.drainStormEvents?.() ?? [],
      scene,
      camera,
      sun,
      apply,
      bakeCityReflection(position, excluded) {
        graphics.check();
        const generator = new T.PMREMGenerator(renderer);
        const shadows = renderer.shadowMap.enabled;
        const hidden = [...excluded];
        scene.traverse((object) => {
          if (object.userData.reflectionExclude) hidden.push(object);
        });
        const visible = hidden.map((object) => object.visible);
        hidden.forEach((object) => {
          object.visible = false;
        });
        contactShadow.mesh.visible = false;
        const retainedPosition = camera.position.clone();
        camera.position.copy(position);
        updateBackdrop();
        renderer.shadowMap.enabled = false;
        try {
          cityReflection?.dispose();
          cityReflection = generator.fromScene(
            scene,
            0.025,
            0.3,
            options.reflectionFar ?? far,
            {
              size: 256,
              position,
            },
          );
          graphics.check();
          return cityReflection.texture;
        } finally {
          generator.dispose();
          renderer.shadowMap.enabled = shadows;
          camera.position.copy(retainedPosition);
          updateBackdrop();
          contactShadow.mesh.visible = true;
          hidden.forEach((object, i) => {
            object.visible = visible[i];
          });
        }
      },
      updateContact(track, state, coverageAt) {
        contactShadow.update(track, state, coverageAt);
      },
      follow(position) {
        sun.target.position.copy(position);
        sun.position.copy(position).add(sunOffset);
        sun.target.updateMatrixWorld();
      },
      render(now) {
        const dt = last ? Math.min((now - last) / 1000, 0.1) : 1 / 60;
        if (last && now - last < 1000) times.push(now - last);
        last = now;
        elapsed += dt;
        if (times.length > 24000) times.shift();
        scene.userData.elapsed = elapsed;
        renderer.info.reset();
        renderer.shadowMap.needsUpdate = true;
        exhaustHeat.enabled =
          settings.quality === 'high' && !shape && !settings.reducedMotion;
        const targetBlur = settings.reducedMotion || shape ? 0 : blurTarget;
        racingBlur.uniforms.strength.value +=
          (targetBlur - racingBlur.uniforms.strength.value) *
          (1 - Math.exp(-dt * (catapultBlur ? 60 : 12)));
        racingBlur.enabled =
          settings.quality === 'high' &&
          racingBlur.uniforms.strength.value > 0.0001;
        if (
          settings.quality === 'high' ||
          racingBlur.enabled ||
          [...worldPasses].some((pass) => pass.enabled)
        ) {
          composer.render(dt);
        } else renderer.render(scene, camera);
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
        graphics.check();
        if (mobileGraphics()) {
          // Full-scene warmup forces every hidden/off-camera mesh onto the GPU
          // in one burst. On phones, warm only the actual starting view and its
          // active pipeline; let other resources upload as they enter view.
          renderer.shadowMap.needsUpdate = true;
          if (
            settings.quality === 'high' ||
            [...worldPasses].some((pass) => pass.enabled)
          )
            composer.render(0);
          else renderer.render(scene, camera);
          await new Promise((resolve) => setTimeout(resolve, 0));
          graphics.check();
          renderer.info.reset();
          return;
        }
        await graphics.compile(scene, camera);
        // Postprocessing uses linear HDR shaders, distinct from direct output.
        // Compile off-camera materials too, before a rival or district enters view.
        const retainedTarget = renderer.getRenderTarget();
        try {
          renderer.setRenderTarget(composer.readBuffer);
          await graphics.compile(scene, camera);
        } finally {
          renderer.setRenderTarget(retainedTarget);
        }
        renderer.info.reset();
        renderer.shadowMap.needsUpdate = true;
        // Compile deferred passes before readiness. The speed blur starts at
        // zero strength, but still needs its shader before the first acceleration.
        // Level pass owners likewise provide an inert initial state.
        const enabled = [racingBlur, ...worldPasses].map((pass) => [
          pass,
          pass.enabled,
        ]);
        const renderToScreen = composer.renderToScreen;
        try {
          for (const [pass] of enabled) pass.enabled = true;
          composer.renderToScreen = false;
          drawUnculledScene(scene, () => {
            // Exercise both direct (Low) and HDR (High/world-effect) draws.
            // compileAsync alone leaves some first-use driver work until racing.
            renderer.setRenderTarget(null);
            renderer.render(scene, camera);
            composer.render(0);
          });
        } finally {
          composer.renderToScreen = renderToScreen;
          renderer.setRenderTarget(retainedTarget);
          for (const [pass, active] of enabled) pass.enabled = active;
        }
        // Replace the temporary all-visible draw before loading can disappear.
        composer.render(0);
        // Startup-only synchronization: readiness follows actual first-pass work,
        // including shadow, AO and antialias programs, not just submission.
        renderer.getContext().finish();
        graphics.check();
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
          textureBytes = 0;
        const textureFormats = {};
        let compressedTextureBytes = 0;
        const gs = new Set(),
          ts = new Set();
        const countTexture = (texture) => {
          if (!texture?.isTexture || ts.has(texture)) return;
          ts.add(texture);
          const memory = textureMemory(texture);
          textureBytes += memory.bytes;
          if (memory.compressed) compressedTextureBytes += memory.bytes;
          textureFormats[memory.format] =
            (textureFormats[memory.format] || 0) + 1;
        };
        for (const texture of backdrop?.ownedTextures ?? [])
          countTexture(texture);
        scene.traverse((o) => {
          if (o.geometry && !gs.has(o.geometry)) {
            gs.add(o.geometry);
            for (const a of Object.values(o.geometry.attributes))
              geometryBytes += a.array.byteLength;
            geometryBytes += o.geometry.index?.array.byteLength || 0;
          }
          for (const m of Array.isArray(o.material) ? o.material : [o.material])
            if (m) for (const v of Object.values(m)) countTexture(v);
        });
        const ratio = renderer.getPixelRatio();
        // Sampleable depth replaces each composer's existing depth buffer;
        // only the half-resolution RGBA16F refraction field adds storage.
        const heatBytes =
          exhaustHeat.field.width * exhaustHeat.field.height * 8;
        const postBytes =
          innerWidth *
          innerHeight *
          ratio *
          ratio *
          (settings.quality === 'high' ? 92 : 16);
        return {
          frames: times.length,
          resources: performance.getEntriesByType('resource').reduce(
            (result, entry) => ({
              requests: result.requests + 1,
              transferredBytes:
                result.transferredBytes + (entry.transferSize || 0),
              encodedBytes: result.encodedBytes + (entry.encodedBodySize || 0),
              decodedBytes: result.decodedBytes + (entry.decodedBodySize || 0),
            }),
            {
              requests: 0,
              transferredBytes: 0,
              encodedBytes: 0,
              decodedBytes: 0,
            },
          ),
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
          textureMiB: textureBytes / 2 ** 20,
          compressedTextureMiB: compressedTextureBytes / 2 ** 20,
          textureFormats,
          estimatedGpuMiB:
            (geometryBytes +
              textureBytes +
              3072 * 3072 * 4 +
              postBytes +
              heatBytes +
              (cityReflection ? 12 : 8) * 1024 * 1024) /
            2 ** 20,
          gpuEstimateScope:
            'Owned geometry/maps + approximate PMREM/shadow/HDR postprocessing/framebuffers, excludes driver overhead',
          gpu: ext
            ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)
            : gl.getParameter(gl.RENDERER),
          userAgent: navigator.userAgent,
          viewport: { width: innerWidth, height: innerHeight, dpr: ratio },
          presentation: backdrop?.getPresentation?.() ?? null,
          pipeline: {
            ambientOcclusion: ao.enabled,
            bloom: bloom.enabled,
            exhaustHeat: exhaustHeat.enabled,
            worldEffects: [...worldPasses].filter((pass) => pass.enabled)
              .length,
            racingBlur: racingBlur.enabled,
            racingBlurStrength: racingBlur.uniforms.strength.value,
            tonemapping: 'ACES',
            colourSpace: 'sRGB',
            world: options.world,
          },
          timingNote:
            'RAF intervals; headless and capture runs not foreground certification',
        };
      },
      dispose: () => lifetime.dispose(),
    };
  } catch (error) {
    const failure = graphics?.normalize(error) ?? error;
    try {
      lifetime.dispose();
    } catch (cleanupError) {
      failure.cause = cleanupError;
    }
    throw failure;
  }
}
