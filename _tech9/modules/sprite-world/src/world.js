import { Application, Sprite, Texture } from 'pixi.js';
import { AssetCache } from './assets.js';
import { createViewport, followCamera, clientToWorld } from './viewport.js';
import { moveActor, isWalkable, nearestInteraction } from './exploration.js';
import {
  frameBounds,
  actorFrame,
  drawFrame,
  isOccluding,
  validateFrames,
  actorFrames,
} from './frames.js';
import { mountControls } from './controls.js';
import { validateScene, validateWorldOptions, copyActor } from './contract.js';
/** Explicitly owned Echo-style Canvas artwork surface presented through Pixi WebGL. */
export async function createSpriteWorld({
  mount,
  scene,
  assets,
  frames,
  actor: actorOptions,
  drawGround,
  createPatterns,
  controls: controlOptions = {},
  viewport: viewportOptions = {},
  budgets = {},
  onInteract = () => {},
  onState = () => {},
  onError = () => {},
  onPause = () => {},
} = {}) {
  validateWorldOptions({
    mount,
    scene,
    assets,
    frames,
    actor: actorOptions,
    drawGround,
    createPatterns,
  });
  let actor = copyActor({
    ...actorOptions,
    x: actorOptions.x ?? scene.spawn?.x ?? scene.width / 2,
    y: actorOptions.y ?? scene.spawn?.y ?? scene.height / 2,
  });
  if (!isWalkable(scene, actor.x, actor.y, actor.radius))
    throw new Error('Actor spawn must be walkable');
  const cache = new AssetCache({
    entries: assets,
    concurrency: budgets.concurrency ?? 2,
    budgetBytes: budgets.assetBytes ?? 96 * 1024 ** 2,
    warmGroups: budgets.warmGroups ?? 1,
  });
  const canvas = document.createElement('canvas'),
    ctx = canvas.getContext('2d', { alpha: false });
  const app = new Application();
  let texture,
    sprite,
    controls,
    observer,
    patternKit,
    disposed = false,
    paused = false,
    running = false,
    raf = 0,
    previous = 0,
    time = 0,
    camera = { x: 0, y: 0 },
    viewport,
    near = null,
    target = null,
    occludedProps = 0,
    frameCount = 0,
    sceneRequest = 0;
  const signal = new AbortController();
  const sceneIds = (value) => value.assetIds || assets.map((entry) => entry.id);
  const stats = () => ({
    ...cache.diagnostics(),
    surfaceCount: disposed ? 0 : 1 + (patternKit?.surfaces?.length || 0),
    surfaceBytes: disposed
      ? 0
      : canvas.width * canvas.height * 4 +
        (patternKit?.surfaces?.reduce(
          (sum, s) => sum + s.width * s.height * 4,
          0,
        ) || 0),
    textureCount: disposed ? 0 : 1,
    occludedProps,
    frameCount,
    disposed,
  });
  const snapshot = () => ({
    actor: {
      x: actor.x,
      y: actor.y,
      facing: actor.facing,
      moving: Boolean(actor.moving),
      bounds: frameBounds(
        actorFrame(actor, time),
        actor.x,
        actor.y,
        actorFrame(actor, time).height,
      ),
    },
    camera: { ...camera },
    viewport: { ...viewport },
    near: near
      ? { id: near.id, x: near.x, y: near.y, interact: { ...near.interact } }
      : null,
    paused,
    sceneId: scene.id,
    stats: stats(),
  });
  function configurePatterns() {
    patternKit?.dispose?.();
    patternKit = createPatterns?.(ctx, cache.images) || null;
  }
  function validateArt(targetScene = scene, targetActor = actor) {
    for (const [id, image] of cache.images) {
      const selected = [
        ...Object.values(frames),
        ...actorFrames(targetActor),
      ].filter((f) => f.asset === id);
      validateFrames({ id, frames: selected }, image);
    }
    for (const prop of targetScene.props || [])
      if (!cache.images.has(frames[prop.frame].asset))
        throw new Error(`Scene artwork missing: ${prop.frame}`);
    for (const frame of actorFrames(targetActor))
      if (!cache.images.has(frame.asset))
        throw new Error(`Actor artwork missing: ${frame.asset}`);
  }
  function resize() {
    if (disposed) return;
    controls?.clear();
    target = null;
    const rect = mount.getBoundingClientRect();
    viewport = createViewport({
      ...viewportOptions,
      cssWidth: Math.max(1, rect.width),
      cssHeight: Math.max(1, rect.height),
      mobile:
        viewportOptions.mobile ?? (controls?.touchVisible || rect.width < 700),
      pixelRatio: devicePixelRatio,
      scene,
    });
    canvas.width = Math.max(
      1,
      Math.round(viewport.width * viewport.renderScale),
    );
    canvas.height = Math.max(
      1,
      Math.round(viewport.height * viewport.renderScale),
    );
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    app.renderer.resolution = viewport.renderScale;
    app.renderer.resize(viewport.width, viewport.height);
    texture.source.resize(canvas.width, canvas.height);
    sprite.width = viewport.width;
    sprite.height = viewport.height;
    camera = followCamera(camera, actor, scene, viewport, 0, {
      immediate: true,
    });
    render();
  }
  function interact() {
    if (!disposed && !paused && near) onInteract(near, world);
  }
  function update(dt) {
    if (disposed) return;
    dt = Number.isFinite(dt) ? Math.min(0.1, Math.max(0, dt)) : 0;
    if (!paused) {
      time += dt;
      let input = controls.movement;
      if (target && !Math.hypot(input.x, input.y)) {
        const dx = target.x - actor.x,
          dy = target.y - actor.y,
          length = Math.hypot(dx, dy);
        if (length < 4) target = null;
        else
          input = {
            x:
              (dx / length) *
              Math.min(1, length / ((actor.speed || 230) * dt || 1)),
            y:
              (dy / length) *
              Math.min(1, length / ((actor.speed || 230) * dt || 1)),
            run: false,
          };
      }
      const before = { x: actor.x, y: actor.y };
      moveActor(actor, input, dt, scene);
      if (
        dt > 0 &&
        target &&
        Math.hypot(before.x - actor.x, before.y - actor.y) < 0.01
      )
        target = null;
      camera = followCamera(camera, actor, scene, viewport, dt);
      near = nearestInteraction(scene, actor);
      controls.setInteraction(near);
    } else actor.moving = false;
    onState(snapshot());
  }
  function render() {
    if (disposed || !viewport) return;
    ctx.setTransform(viewport.renderScale, 0, 0, viewport.renderScale, 0, 0);
    ctx.fillStyle = '#20363a';
    ctx.fillRect(0, 0, viewport.width, viewport.height);
    ctx.save();
    ctx.translate(-camera.x, -camera.y);
    drawGround(ctx, {
      scene,
      camera,
      viewport,
      images: cache.images,
      time,
      patterns: patternKit?.patterns || [],
    });
    const af = actorFrame(actor, time);
    const items = [
      ...(scene.props || []).map((prop) => ({
        prop,
        frame: frames[prop.frame],
        x: prop.x,
        y: prop.y,
        height: prop.height,
      })),
      { frame: af, x: actor.x, y: actor.y, height: af.height, actor: true },
    ].sort((a, b) => a.y - b.y || Number(a.actor) - Number(b.actor));
    occludedProps = 0;
    for (const item of items) {
      const b = frameBounds(item.frame, item.x, item.y, item.height);
      if (
        b.left > camera.x + viewport.width ||
        b.top > camera.y + viewport.height ||
        b.left + b.width < camera.x ||
        b.top + b.height < camera.y
      )
        continue;
      const image = cache.images.get(item.frame.asset);
      if (!image) continue;
      ctx.save();
      ctx.globalAlpha = 0.19;
      ctx.fillStyle = '#152b2b';
      ctx.beginPath();
      ctx.ellipse(
        item.x + 3,
        item.y + 1,
        item.actor ? 19 : Math.min(48, b.width * 0.22),
        item.actor ? 4 : Math.min(9, b.width * 0.05),
        0,
        0,
        Math.PI * 2,
      );
      ctx.fill();
      ctx.restore();
      const occluded = !item.actor && isOccluding(item.prop, b, actor);
      if (occluded) occludedProps++;
      drawFrame(ctx, image, item.frame, item.x, item.y, item.height, {
        flip: item.actor && af.flip,
        alpha: occluded ? 0.42 : 1,
      });
    }
    ctx.restore();
    texture.source.update();
    app.renderer.render(app.stage);
    frameCount++;
  }
  function frame(now) {
    if (!running || disposed) return;
    const dt = previous ? (now - previous) / 1000 : 0;
    previous = now;
    try {
      update(dt);
      render();
      raf = requestAnimationFrame(frame);
    } catch (error) {
      stop();
      onError(error);
    }
  }
  function start() {
    if (disposed) throw new Error('World is disposed');
    if (running) return;
    running = true;
    previous = 0;
    controls.focus();
    raf = requestAnimationFrame(frame);
  }
  function stop() {
    running = false;
    cancelAnimationFrame(raf);
    raf = 0;
    previous = 0;
    controls?.clear();
    target = null;
  }
  function setPaused(value) {
    paused = Boolean(value);
    controls?.setEnabled(!paused);
    target = null;
    actor.moving = false;
    onState(snapshot());
  }
  async function setScene(next) {
    if (disposed) throw new Error('World is disposed');
    validateScene(next, frames);
    const spawn = next.spawn || { x: actor.x, y: actor.y };
    if (!isWalkable(next, spawn.x, spawn.y, actor.radius))
      throw new Error('Scene spawn must be walkable');
    const ticket = ++sceneRequest;
    await cache.prepare(next.id, sceneIds(next));
    if (ticket !== sceneRequest || disposed) {
      if (!disposed) cache.discard(next.id);
      return false;
    }
    try {
      validateArt(next, actor);
    } catch (error) {
      cache.discard(next.id);
      throw error;
    }
    scene = next;
    actor = { ...actor, ...spawn, moving: false };
    cache.activate(next.id);
    configurePatterns();
    target = null;
    controls.clear();
    resize();
    return true;
  }
  function teleport(x, y) {
    if (!isWalkable(scene, x, y, actor.radius)) return false;
    actor.x = x;
    actor.y = y;
    actor.moving = false;
    target = null;
    controls.clear();
    camera = followCamera(camera, actor, scene, viewport, 0, {
      immediate: true,
    });
    near = nearestInteraction(scene, actor);
    controls.setInteraction(near);
    render();
    onState(snapshot());
    return true;
  }
  function dispose() {
    if (disposed) return;
    stop();
    disposed = true;
    sceneRequest++;
    signal.abort();
    observer?.disconnect();
    controls?.dispose();
    patternKit?.dispose?.();
    patternKit = null;
    texture?.destroy(true);
    if (app.renderer)
      app.destroy(true, {
        children: true,
        texture: false,
        textureSource: false,
      });
    else {
      app.stage?.destroy({ children: true });
      app.stage = null;
    }
    cache.dispose();
    canvas.width = canvas.height = 0;
    onState(snapshot());
  }
  const world = {
    start,
    stop,
    update,
    render,
    resize,
    setPaused,
    setScene,
    teleport,
    dispose,
    snapshot,
    get state() {
      return snapshot();
    },
    get controls() {
      return controls;
    },
    get canvas() {
      return app.canvas;
    },
  };
  try {
    await cache.prepare(scene.id, sceneIds(scene));
    cache.activate(scene.id);
    validateArt();
    await app.init({
      width: 960,
      height: 540,
      resolution: 1,
      antialias: false,
      preference: 'webgl',
      background: '#20363a',
      autoStart: false,
    });
    texture = Texture.from(canvas);
    texture.source.scaleMode = 'linear';
    texture.dynamic = true;
    sprite = new Sprite(texture);
    app.stage.addChild(sprite);
    mount.append(app.canvas);
    app.canvas.style.width = '100%';
    app.canvas.style.height = '100%';
    app.canvas.style.display = 'block';
    app.canvas.setAttribute('aria-label', 'Explorable sprite world');
    controls = mountControls({
      ...controlOptions,
      surface: app.canvas,
      canMove: () => !paused && !disposed,
      onInteract: interact,
      onPause: () => {
        setPaused(!paused);
        onPause(paused, world);
      },
      onPoint: (point) => {
        target = point
          ? clientToWorld(
              point,
              camera,
              viewport,
              app.canvas.getBoundingClientRect(),
            )
          : null;
      },
    });
    configurePatterns();
    resize();
    observer = new ResizeObserver(resize);
    observer.observe(mount);
    window.visualViewport?.addEventListener('resize', resize, {
      signal: signal.signal,
    });
    window.addEventListener(
      'blur',
      () => {
        target = null;
        controls.clear();
        actor.moving = false;
      },
      { signal: signal.signal },
    );
    document.addEventListener(
      'visibilitychange',
      () => {
        if (document.hidden) {
          setPaused(true);
          onPause(true, world);
        }
      },
      { signal: signal.signal },
    );
    app.canvas.addEventListener(
      'webglcontextlost',
      (event) => {
        event.preventDefault();
        stop();
        setPaused(true);
        onError(
          new Error(
            'Graphics context interrupted. Recreate the world to resume.',
          ),
        );
      },
      { signal: signal.signal },
    );
    update(0);
    return world;
  } catch (error) {
    try {
      dispose();
    } catch {
      /* Retain the initialization error after resource cleanup. */
    }
    throw error;
  }
}
