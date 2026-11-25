import * as T from 'three';

// Cache only explicitly immutable scenery. The live sun render still resolves
// ordinary Three.js PCF against a single depth texture, including moving casters.
export function createStaticSunShadows(renderer, scene, sun) {
  const shadow = sun.shadow;
  const shadowCamera = shadow.camera;
  const gl = renderer.getContext();
  const casters = new Set();
  const layout = new T.Matrix4();
  const right = new T.Vector3(),
    up = new T.Vector3(),
    depth = new T.Vector3();
  const lightWorld = new T.Vector3(),
    targetWorld = new T.Vector3(),
    sunOffset = new T.Vector3(),
    displacement = new T.Vector3(),
    targetAtCenter = new T.Vector3();
  let cache;
  let liveTarget, liveFramebuffer;
  let rejectedWidth, rejectedHeight;
  let cachedFrames = 0,
    refreshes = 0;

  function register(root) {
    root.traverse((object) => {
      if (object.castShadow) casters.add(object);
    });
    if (cache) cache.valid = false;
  }

  function releaseCache() {
    cache?.map.dispose();
    cache = undefined;
  }

  function releaseLiveFramebuffer() {
    liveTarget?.removeEventListener('dispose', releaseLiveFramebuffer);
    liveTarget = liveFramebuffer = undefined;
  }

  function onContextRestored() {
    releaseCache();
    releaseLiveFramebuffer();
    rejectedWidth = rejectedHeight = undefined;
  }
  renderer.domElement.addEventListener(
    'webglcontextrestored',
    onContextRestored,
  );

  function captureFramebuffer(target, requireComplete = false) {
    const previous = renderer.getRenderTarget();
    const face = renderer.getActiveCubeFace();
    const mip = renderer.getActiveMipmapLevel();
    try {
      renderer.setRenderTarget(target);
      if (
        requireComplete &&
        gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE
      )
        return null;
      return gl.getParameter(gl.DRAW_FRAMEBUFFER_BINDING);
    } finally {
      renderer.setRenderTarget(previous, face, mip);
    }
  }

  function captureLiveFramebuffer(target) {
    if (target !== liveTarget) {
      releaseLiveFramebuffer();
      liveTarget = target;
      liveTarget.addEventListener('dispose', releaseLiveFramebuffer);
      liveFramebuffer = captureFramebuffer(liveTarget);
    }
    return liveFramebuffer;
  }

  function createCache(width, height) {
    // Keep the baked texel density identical to the live shadow. Only the
    // guard area is larger, so moving the live rectangle can reuse its depth.
    const margin = Math.min(
      Math.ceil(Math.min(width, height) / 8),
      Math.floor(
        (renderer.capabilities.maxTextureSize - Math.max(width, height)) / 2,
      ),
    );
    if (margin < 2) return null;
    const w = width + margin * 2,
      h = height + margin * 2;
    const map = new T.WebGLRenderTarget(w, h, {
      format: T.RedFormat,
      minFilter: T.NearestFilter,
      magFilter: T.NearestFilter,
      depthTexture: new T.DepthTexture(w, h, T.UnsignedIntType),
    });
    const framebuffer = captureFramebuffer(map, true);
    if (!framebuffer) {
      map.dispose();
      return null;
    }
    return {
      width,
      height,
      margin,
      valid: false,
      camera: new T.OrthographicCamera(),
      map,
      framebuffer,
      anchor: new T.Vector3(),
      right: new T.Vector3(),
      up: new T.Vector3(),
    };
  }

  function renderAt(center, draw) {
    sun.matrixWorld.setPosition(center);
    sun.target.matrixWorld.setPosition(
      targetAtCenter.copy(center).sub(sunOffset),
    );
    try {
      draw();
    } finally {
      sun.matrixWorld.setPosition(lightWorld);
      sun.target.matrixWorld.setPosition(targetWorld);
    }
  }

  function bake(camera, render, stepX, stepY) {
    const liveMap = shadow.map;
    const liveCasters = [];
    scene.traverseVisible((object) => {
      if (object.castShadow && !casters.has(object)) liveCasters.push(object);
    });
    for (const caster of liveCasters) caster.castShadow = false;
    shadow.map = cache.map;
    shadow.mapSize.set(cache.map.width, cache.map.height);
    // Three caches projection uniforms by camera identity. Use a distinct
    // camera so the live draw immediately after a bake uploads its projection.
    shadow.camera = cache.camera.copy(shadowCamera);
    cache.camera.left -= stepX * cache.margin;
    cache.camera.right += stepX * cache.margin;
    cache.camera.bottom -= stepY * cache.margin;
    cache.camera.top += stepY * cache.margin;
    cache.camera.updateProjectionMatrix();
    try {
      render([sun], scene, camera);
    } finally {
      shadow.map = liveMap;
      shadow.mapSize.set(cache.width, cache.height);
      shadow.camera = shadowCamera;
      renderer.shadowMap.needsUpdate = true;
      for (const caster of liveCasters) caster.castShadow = true;
    }
  }

  function renderLive(lights, camera, render, x, y) {
    const clear = renderer.clear;
    renderer.clear = (...args) => {
      const live = renderer.getRenderTarget();
      if (!live || live !== shadow.map) return clear.apply(renderer, args);
      // Three's texture copy helper does not express offset depth rectangles in
      // this release. The native bindings were captured at target setup.
      gl.bindFramebuffer(gl.READ_FRAMEBUFFER, cache.framebuffer);
      try {
        gl.blitFramebuffer(
          x,
          y,
          x + cache.width,
          y + cache.height,
          0,
          0,
          cache.width,
          cache.height,
          gl.DEPTH_BUFFER_BIT,
          gl.NEAREST,
        );
      } finally {
        // The shadow pass has just bound the live map before this clear.
        // Restore its read binding as well as preserving the draw binding.
        gl.bindFramebuffer(gl.READ_FRAMEBUFFER, liveFramebuffer);
      }
    };
    for (const caster of casters) caster.castShadow = false;
    try {
      render(lights, scene, camera);
    } finally {
      renderer.clear = clear;
      for (const caster of casters) caster.castShadow = true;
    }
  }

  function draw(enabled, renderWorld) {
    if (!enabled) {
      releaseCache();
      releaseLiveFramebuffer();
      return renderWorld();
    }
    if (!casters.size || renderer.shadowMap.type !== T.PCFShadowMap)
      return renderWorld();
    const shadowMap = renderer.shadowMap;
    const renderUnbound = shadowMap.render;
    const render = renderUnbound.bind(shadowMap);
    shadowMap.render = (lights, source, camera) => {
      if (
        !shadowMap.enabled ||
        !shadowMap.needsUpdate ||
        source !== scene ||
        lights.length !== 1 ||
        lights[0] !== sun
      )
        return render(lights, source, camera);
      const { x: w, y: h } = shadow.mapSize;
      if (rejectedWidth === w && rejectedHeight === h)
        return render(lights, source, camera);
      const liveMap = shadow.map;
      // Let Three create or resize its map before capturing its binding.
      if (!liveMap || liveMap.width !== w || liveMap.height !== h)
        return render(lights, source, camera);
      if (!captureLiveFramebuffer(liveMap)) {
        releaseCache();
        return render(lights, source, camera);
      }
      if (cache?.width !== w || cache?.height !== h) {
        releaseCache();
        cache = createCache(w, h);
      }
      if (!cache) {
        rejectedWidth = w;
        rejectedHeight = h;
        return render(lights, source, camera);
      }
      lightWorld.setFromMatrixPosition(sun.matrixWorld);
      targetWorld.setFromMatrixPosition(sun.target.matrixWorld);
      sunOffset.subVectors(lightWorld, targetWorld);
      layout.lookAt(lightWorld, targetWorld, shadowCamera.up);
      layout.extractBasis(right, up, depth);
      displacement.subVectors(lightWorld, cache.anchor);
      const stepX = (shadowCamera.right - shadowCamera.left) / w;
      const stepY = (shadowCamera.top - shadowCamera.bottom) / h;
      const depthRange = shadowCamera.far - shadowCamera.near;
      let x = Math.round(displacement.dot(right) / stepX);
      let y = Math.round(displacement.dot(up) / stepY);
      if (
        !cache.valid ||
        cache.layers !== camera.layers.mask ||
        cache.stepX !== stepX ||
        cache.stepY !== stepY ||
        cache.near !== shadowCamera.near ||
        cache.far !== shadowCamera.far ||
        cache.right.dot(right) < 1 - 1e-12 ||
        cache.up.dot(up) < 1 - 1e-12 ||
        Math.abs(x) >= cache.margin ||
        Math.abs(y) >= cache.margin ||
        Math.abs(displacement.dot(depth)) > depthRange / 40
      ) {
        cache.anchor.copy(lightWorld);
        cache.right.copy(right);
        cache.up.copy(up);
        cache.layers = camera.layers.mask;
        cache.stepX = stepX;
        cache.stepY = stepY;
        cache.near = shadowCamera.near;
        cache.far = shadowCamera.far;
        bake(camera, render, stepX, stepY);
        cache.valid = true;
        x = y = 0;
        refreshes++;
      }
      // Move by whole shadow texels in the light plane and retain the cached
      // light-axis origin. The same orthographic offset applies to both
      // stored caster depth and receiver depth. Only near/far clipping changes
      // as the real light advances along that axis, bounded by the rebase above.
      displacement
        .copy(cache.anchor)
        .addScaledVector(cache.right, x * stepX)
        .addScaledVector(cache.up, y * stepY);
      renderAt(displacement, () =>
        renderLive(lights, camera, render, x + cache.margin, y + cache.margin),
      );
      cachedFrames++;
    };
    try {
      return renderWorld();
    } finally {
      shadowMap.render = renderUnbound;
    }
  }

  return {
    draw,
    register,
    get available() {
      return casters.size > 0;
    },
    get metrics() {
      return {
        cachedFrames,
        refreshes,
        bytes: cache ? cache.map.width * cache.map.height * 5 : 0,
      };
    },
    dispose() {
      renderer.domElement.removeEventListener(
        'webglcontextrestored',
        onContextRestored,
      );
      releaseCache();
      releaseLiveFramebuffer();
      casters.clear();
    },
  };
}
