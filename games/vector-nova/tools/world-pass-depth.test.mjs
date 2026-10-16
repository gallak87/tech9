import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { Pass } from 'three/addons/postprocessing/Pass.js';
import { ExhaustHeatPass } from '../src/ships/exhaust-heat-pass.js';
import { attachWorldPass } from '../src/renderer/world-pass.js';
import { createWorldspireClouds } from '../src/levels/worldspire/environment/clouds.js';
import { createWorldspireTrack } from '../src/levels/worldspire/track/model.js';

// Execute the real composer, beauty, heat, blur and cloud passes. The renderer
// models attachment writes rather than WebGL: a fullscreen clear/depth write
// destroys the beauty sentinel, exactly the failure that late borrowing missed.
test('cloud preparation consumes beauty before buffer reuse without moving its color composite', () => {
  const scene = new T.Scene(),
    camera = new T.PerspectiveCamera(64, 1.6, 0.2, 26000);
  const clouds = createWorldspireClouds({
    track: createWorldspireTrack(),
    camera,
  });
  const heat = new ExhaustHeatPass(scene, camera);
  const trace = [],
    samples = [];
  let frame = 0,
    target = null,
    prepared = null,
    cloudDraws = 0,
    compositeDraws = 0;
  const renderer = {
    autoClear: true,
    autoClearColor: true,
    autoClearDepth: true,
    autoClearStencil: true,
    getPixelRatio: () => 1,
    getRenderTarget: () => target,
    setRenderTarget(value) {
      target = value;
    },
    getClearAlpha: () => 0,
    getClearColor: (color) => color.set(0),
    setClearColor() {},
    clear(...buffers) {
      const depth = buffers[1] ?? true;
      if (depth && target?.depthTexture)
        target.depthTexture.userData.content = 'cleared';
    },
    render(object) {
      if (this.autoClear) this.clear();
      if (object === scene) {
        target.depthTexture.userData.content = frame;
        trace.push('beauty');
      } else if (object.material === clouds.pass.volume) {
        assert.notEqual(
          target.depthTexture,
          clouds.uniforms.sceneDepth.value,
          'volume never samples its draw attachment',
        );
        prepared = clouds.uniforms.sceneDepth.value.userData.content;
        samples.push(prepared);
        cloudDraws++;
        trace.push('cloud-volume');
      } else if (object.material === clouds.pass.composite) {
        assert.equal(
          prepared,
          frame,
          "later composite uses this frame's prepared data",
        );
        assert.equal(
          object.material.uniforms.sceneDepth,
          undefined,
          'late composite does not sample mutable beauty depth',
        );
        compositeDraws++;
        trace.push('cloud-composite');
      } else if (object.material === heat.composite) {
        assert.equal(
          object.material.uniforms.sceneDepth.value.userData.content,
          frame,
          'preparation does not invalidate exhaust depth',
        );
        trace.push('heat');
      } else if (object.material?.name === 'speed-blur') {
        if (object.material.depthWrite && target?.depthTexture)
          target.depthTexture.userData.content = 'blur-quad';
        trace.push('blur');
      }
    },
  };
  const composer = new EffectComposer(
    renderer,
    new T.WebGLRenderTarget(1440, 900, {
      depthTexture: new T.DepthTexture(1440, 900, T.UnsignedIntType),
    }),
  );
  const beauty = new RenderPass(scene, camera);
  // GTAO copies color with depth writes/clears disabled, then swaps; bloom
  // blends color without a swap. Neither affects the original beauty depth.
  const ao = new Pass();
  ao.render = () => trace.push('ao');
  const bloom = new Pass();
  bloom.needsSwap = false;
  bloom.render = () => trace.push('bloom');
  const blur = new ShaderPass({
    name: 'speed-blur',
    uniforms: { tDiffuse: { value: null } },
    vertexShader: '',
    fragmentShader: '',
  });
  const output = new Pass();
  output.needsSwap = false;
  output.render = () => trace.push('output');
  for (const pass of [beauty, heat, ao, bloom, blur, output])
    composer.addPass(pass);
  const ordinary = new Pass();
  ordinary.needsSwap = false;
  ordinary.render = () => trace.push('ordinary-world');
  const detachOrdinary = attachWorldPass(composer, ordinary, {
    beauty,
    output,
  });
  const detachClouds = attachWorldPass(composer, clouds.pass, {
    beauty,
    output,
  });
  const preparation = composer.passes[1];
  try {
    assert.equal(preparation.needsSwap, false);
    assert.equal(
      composer.passes.at(-2),
      clouds.pass,
      'color composite stays before output',
    );
    assert.equal(
      composer.passes.at(-3),
      ordinary,
      'non-depth world effects retain their placement',
    );
    for (const enabled of [true, false]) {
      ao.enabled = enabled;
      for (let i = 0; i < 2; i++) {
        frame++;
        trace.length = 0;
        composer.render(1 / 60);
        assert.equal(
          samples.at(-1),
          frame,
          'each frame gets the fresh beauty target despite buffer swaps',
        );
        assert.deepEqual(trace, [
          'beauty',
          'cloud-volume',
          'heat',
          ...(enabled ? ['ao'] : []),
          'bloom',
          'blur',
          'ordinary-world',
          'cloud-composite',
          'output',
        ]);
        assert.equal(cloudDraws, frame);
        assert.equal(compositeDraws, frame);
      }
    }
    clouds.pass.enabled = false;
    trace.length = 0;
    frame++;
    composer.render(1 / 60);
    assert.ok(
      !trace.includes('cloud-volume') && !trace.includes('cloud-composite'),
    );
    assert.equal(cloudDraws, 4, 'disabled pass skips both stages');
    // Warmup temporarily enables the owning pass; its preparation must follow.
    clouds.pass.enabled = true;
    trace.length = 0;
    frame++;
    composer.render(0);
    assert.equal(samples.at(-1), frame);
    assert.equal(cloudDraws, 5);
    assert.equal(
      compositeDraws,
      5,
      'one volume draw plus one composite, including warmup',
    );
    composer.setSize(1200, 800);
    assert.deepEqual(
      [clouds.pass.target.width, clouds.pass.target.height],
      [600, 400],
    );
    detachClouds();
    detachClouds();
    assert.ok(
      !composer.passes.includes(preparation) &&
        !composer.passes.includes(clouds.pass),
    );
    assert.ok(composer.passes.includes(ordinary));
  } finally {
    detachClouds();
    detachOrdinary();
    clouds.dispose();
    heat.dispose();
    blur.dispose();
    composer.dispose();
  }
});
