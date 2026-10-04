import * as T from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { SMAAPass } from 'three/addons/postprocessing/SMAAPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { createLifetime } from '../core/lifecycle.js';
import { createContactShadow } from './contact-shadow.js';

export async function createRenderer(
  host,
  settings,
  { shape = false, createBackdrop, ...options },
) {
  const lifetime = createLifetime();
  try {
    const renderer = lifetime.own(
      new T.WebGLRenderer({
        antialias: true,
        powerPreference: 'high-performance',
      }),
    );
    lifetime.defer(() => renderer.domElement.remove());
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
    const env = lifetime.own(pmrem.fromScene(environmentScene, 0.04, 0.1, far));
    scene.environment = env.texture;
    scene.environmentIntensity = backdrop?.environmentIntensity ?? 1.12;
    pmrem.dispose();
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
    const fill = new T.DirectionalLight(
      backdrop?.fillColor ?? '#a7caff',
      backdrop?.fillIntensity ?? 0.55,
    );
    fill.position.set(140, options.fillHeight ?? 110, -100);
    scene.add(fill);
    const target = new T.WebGLRenderTarget(1, 1, { type: T.HalfFloatType });
    // GTAO blended into multisampled HDR targets produced an opaque region on
    // ANGLE Metal. Use a single-sample target and postprocess edge antialiasing.
    target.samples = 0;
    const composer = lifetime.own(new EffectComposer(renderer, target));
    const beauty = lifetime.own(new RenderPass(scene, camera));
    composer.addPass(beauty);
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
    const racingBlur = lifetime.own(
      new ShaderPass({
        uniforms: { tDiffuse: { value: null }, strength: { value: 0 } },
        vertexShader: `
        varying vec2 racingUv;
        void main() {
          racingUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.);
        }`,
        fragmentShader: `
        uniform sampler2D tDiffuse;
        uniform float strength;
        varying vec2 racingUv;
        void main() {
          vec2 radial = racingUv - vec2(.5,.52);
          float edge = smoothstep(.08,.42,length(radial * vec2(1.15,1.)));
          float craft = smoothstep(.09,.20,length((racingUv-vec2(.5,.25))*vec2(1.,1.4)));
          vec2 stride = radial * strength * edge * craft;
          vec4 streak = vec4(0.);
          for (int i=0; i<32; i++) {
            float amount = float(i)/31.;
            streak += texture2D(tDiffuse,clamp(racingUv-stride*amount,vec2(0.),vec2(1.)));
          }
          gl_FragColor = streak / 32.;
        }`,
      }),
    );
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
      bloom.enabled = settings.quality === 'high' && !shape;
      renderer.shadowMap.enabled = true;
    }
    apply();
    window.addEventListener('resize', apply);
    lifetime.defer(() => window.removeEventListener('resize', apply));
    const sunOffset = backdrop.sunDirection.clone().multiplyScalar(700);
    return {
      renderer,
      assets: backdrop.assets ?? {},
      // The level owns its pass; the renderer only borrows it before tone mapping.
      attachWorldPass(pass) {
        composer.insertPass(pass, composer.passes.indexOf(output));
        worldPasses.add(pass);
        return () => {
          composer.removePass(pass);
          worldPasses.delete(pass);
        };
      },
      updatePresentation(update) {
        Object.assign(frame, update);
        backdrop.setOverview?.(Boolean(update.reviewing));
        updateBackdrop();
      },
      setRacingFeedback({
        mode,
        speed = 0,
        boosting = false,
        catapulting = false,
        enabled = false,
      }) {
        const active =
          enabled &&
          mode === 'racing' &&
          !shape &&
          !settings.reducedMotion &&
          (settings.quality === 'high' || catapulting);
        catapultBlur = active && catapulting;
        blurTarget = active
          ? catapulting
            ? 0.24
            : T.MathUtils.smoothstep(speed, 75, 150) * 0.016 +
              (boosting ? 0.012 : 0)
          : 0;
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
        const targetBlur = settings.reducedMotion || shape ? 0 : blurTarget;
        racingBlur.uniforms.strength.value +=
          (targetBlur - racingBlur.uniforms.strength.value) *
          (1 - Math.exp(-dt * (catapultBlur ? 60 : 12)));
        racingBlur.enabled =
          (settings.quality === 'high' || catapultBlur) &&
          racingBlur.uniforms.strength.value > 0.0001;
        if (
          settings.quality === 'high' ||
          racingBlur.enabled ||
          [...worldPasses].some((pass) => pass.enabled)
        )
          composer.render(dt);
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
        // Compile level passes before readiness so entering a field cannot trigger
        // their first shader compile. Owners provide an inert initial state.
        const enabled = [...worldPasses].map((pass) => [pass, pass.enabled]);
        try {
          for (const [pass] of enabled) pass.enabled = true;
          composer.render(0);
        } finally {
          for (const [pass, active] of enabled) pass.enabled = active;
        }
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
          textureBytes = 0;
        const gs = new Set(),
          ts = new Set();
        const countTexture = (texture) => {
          if (!texture?.isTexture || ts.has(texture)) return;
          ts.add(texture);
          textureBytes +=
            (texture.image?.width || 256) *
            (texture.image?.height || 256) *
            4 *
            1.34;
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
          presentation: backdrop?.getPresentation?.() ?? null,
          pipeline: {
            ambientOcclusion: ao.enabled,
            bloom: bloom.enabled,
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
    try {
      lifetime.dispose();
    } catch (cleanupError) {
      error.cause = cleanupError;
    }
    throw error;
  }
}
