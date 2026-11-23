import * as T from 'three';

import { createEditorWorld } from './nightweir.js';
import { editorBiome } from './biomes.js';
import { createEditorBackdrop } from './biome-backdrop.js';
import { textureMemory } from '../renderer/texture-memory.js';
import { routeCurve } from './route.js';
import { readGamepad, steeringAxis } from '../input/gamepad.js';
import { loadSettings } from '../progression/index.js';
import {
  createEditorHandles,
  projectEditorHandle,
} from './viewport-handles.js';
import { bindEditorViewportInput } from './viewport-input.js';
import { createPreviewGuides } from './preview-guides.js';
import { signedPointRoll } from './point-gestures.js';

// Road generation preferences do not rebuild resolved geometry or scenery.
export function editorWorldFingerprint(value) {
  return JSON.stringify({
    ...value,
    id: undefined,
    name: undefined,
    generator: undefined,
    jumps: value.jumps?.map((jump) => {
      const physical = { ...jump };
      delete physical.authoring;
      return physical;
    }),
  });
}

/** Interactive preview of the same world used by Test Drive. */
export function createEditorViewport(
  host,
  {
    onError,
    onReady,
    onFlyChange,
    onSelectPoint,
    onAddPoint,
    onInsertPoint,
    onDragPoint,
    onDragEnd,
    onDragCancel,
    onBankDrag,
    onBankDragEnd,
    onBankDragCancel,
    navigationRoot = host.closest('.track-editor-host'),
  } = {},
) {
  let renderer;
  let rendererLife;
  let handles,
    editingInput,
    heightLabel,
    bankLabel,
    drawLabel,
    xLabel,
    zLabel,
    issueLabel;
  let selection = {
    selectedPoint: -1,
    selectedProp: -1,
    section: null,
    drawMode: false,
    tool: 'move',
    problemPoint: null,
  };
  let builtFingerprint = null;
  let fingerprint;
  let metrics = null;
  let backdrop;
  let backdropPromise;
  let backdropKey;
  let backdropAbort;
  let skyLight, sunLight;
  let environment;
  let frames = 0;
  let gpuRenderer = null;
  let estimatedGpuBytes = 0;
  let trajectories = [];
  let trajectoryLayer;
  let trajectoryKey = '';
  let guides;
  let guideData = {};
  let renderWidth = 0;
  let renderHeight = 0;
  let scene;
  let camera;
  let world;
  let latest;
  let committedDocument;
  let showRoadEdit = false;
  let roadEditDirty = false;
  let visible = false;
  let disposed = false;
  let build = 0;
  let timer;
  let sceneryTimer;
  let raf;
  let yaw = -0.72;
  let pitch = 0.76;
  let distance = 1800;
  let flying = false;
  let flyFrame;
  let flyTime = 0;
  let flyYaw = 0;
  let flyPitch = 0;
  let padIdentity = null;
  let hadPad = false;
  let padNeedsNeutral = true;
  const blockedPadButtons = new Set();
  const heldKeys = new Set();
  const flyPosition = new T.Vector3();
  const cameraLife = new AbortController();
  const flyCodes = new Set([
    'KeyW',
    'KeyA',
    'KeyS',
    'KeyD',
    'KeyQ',
    'KeyE',
    'ArrowUp',
    'ArrowDown',
    'ArrowLeft',
    'ArrowRight',
    'ShiftLeft',
    'ShiftRight',
  ]);
  const target = new T.Vector3();
  const settings = { quality: 'low', reducedMotion: true };

  const observer = new ResizeObserver(() => draw());
  observer.observe(host);

  function init() {
    if (renderer || disposed) return;
    rendererLife = new AbortController();
    document.addEventListener('visibilitychange', draw, {
      signal: rendererLife.signal,
    });
    renderer = new T.WebGLRenderer({
      antialias: true,
      powerPreference: 'low-power',
    });
    renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.25));
    const gl = renderer.getContext();
    const debug = gl.getExtension('WEBGL_debug_renderer_info');
    gpuRenderer = debug
      ? gl.getParameter(debug.UNMASKED_RENDERER_WEBGL)
      : gl.getParameter(gl.RENDERER);
    frames = 0;
    renderWidth = 0;
    renderHeight = 0;
    renderer.outputColorSpace = T.SRGBColorSpace;
    renderer.toneMapping = T.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.15;
    renderer.domElement.setAttribute(
      'aria-label',
      'Editable three-dimensional track. Drag a point to move it, its yellow arrow to change height, or its blue Roll handle left or right to rotate the road. Shift-click selects a range. Alt makes handle drags finer. Right drag or Space and drag orbits; middle drag pans; wheel zooms. Enter starts free camera. F focuses the selection.',
    );
    renderer.domElement.setAttribute('role', 'application');
    renderer.domElement.tabIndex = 0;
    renderer.domElement.setAttribute('aria-keyshortcuts', 'Enter Escape');
    host.append(renderer.domElement);
    scene = new T.Scene();
    guides = createPreviewGuides(scene, host);
    guides.setData(guideData);
    scene.background = new T.Color('#111b20');
    scene.fog = new T.FogExp2('#657682', 0.00011);
    skyLight = new T.HemisphereLight('#a7c2d0', '#52666d', 1.4);
    scene.add(skyLight);
    sunLight = new T.DirectionalLight('#c9d8e1', 2.2);
    sunLight.position.set(-650, 420, -600);
    scene.add(sunLight);
    camera = new T.PerspectiveCamera(48, 1, 0.5, 30000);
    rebuildTrajectories();
    handles = createEditorHandles(scene);
    if (latest) handles.setDocument(latest, selection);
    heightLabel = document.createElement('span');
    heightLabel.dataset.editorHeightHandleLabel = '';
    bankLabel = document.createElement('span');
    bankLabel.dataset.editorBankHandleLabel = '';
    issueLabel = document.createElement('span');
    issueLabel.dataset.editorProblemLabel = '';
    drawLabel = document.createElement('span');
    drawLabel.dataset.editorDrawGuide = '';
    xLabel = document.createElement('span');
    zLabel = document.createElement('span');
    for (const label of [
      heightLabel,
      bankLabel,
      drawLabel,
      xLabel,
      zLabel,
      issueLabel,
    ]) {
      label.style.cssText =
        'position:absolute;z-index:4;pointer-events:none;padding:4px 7px;border-radius:4px;background:#10212be8;color:#dcf5ff;font:12px system-ui,sans-serif;white-space:nowrap;border:1px solid #76d9ff88;';
      label.hidden = true;
      host.append(label);
    }
    issueLabel.style.background = '#3c1215ee';
    issueLabel.style.color = '#ffceca';
    issueLabel.style.borderColor = '#ff7067';
    editingInput = bindEditorViewportInput(renderer.domElement, {
      getCamera: () => camera,
      getWorld: () => world,
      getDocument: () => latest,
      getHandles: () => handles,
      getSelection: () => selection,
      isFlying: () => flying,
      getCameraState: () => ({
        yaw,
        pitch,
        flyYaw,
        flyPitch,
        target: target.clone(),
        flyPosition: flyPosition.clone(),
        distance,
        units:
          (distance * 2 * Math.tan((camera.fov * Math.PI) / 360)) /
          Math.max(1, host.clientHeight),
        right: new T.Vector3(1, 0, 0).applyQuaternion(camera.quaternion),
        up: new T.Vector3(0, 1, 0).applyQuaternion(camera.quaternion),
      }),
      onOrbit(dx, dy, start, fly) {
        if (fly) {
          flyYaw = start.flyYaw - dx * 0.004;
          flyPitch = T.MathUtils.clamp(
            start.flyPitch - dy * 0.004,
            -1.48,
            1.48,
          );
        } else {
          yaw = start.yaw - dx * 0.006;
          pitch = T.MathUtils.clamp(start.pitch + dy * 0.004, -1.45, 1.45);
        }
      },
      onPan(dx, dy, start, groundPan) {
        if (groundPan) {
          const slope = Math.sin(start.pitch);
          // Bound the depth scale when the view is nearly parallel to X/Z.
          const depthScale =
            (slope < 0 ? -1 : 1) / Math.max(0.25, Math.abs(slope));
          const forward = new T.Vector3(
            -Math.sin(start.yaw),
            0,
            -Math.cos(start.yaw),
          );
          const right = start.right.clone().setY(0).normalize();
          target
            .copy(start.target)
            .addScaledVector(right, -dx * start.units)
            .addScaledVector(forward, dy * depthScale * start.units);
          return;
        }
        const move = start.right
          .clone()
          .multiplyScalar(-dx * start.units)
          .addScaledVector(start.up, dy * start.units);
        if (flying) flyPosition.copy(start.flyPosition).add(move);
        else target.copy(start.target).add(move);
      },
      onWheel(delta) {
        if (flying)
          flyPosition.addScaledVector(
            camera.getWorldDirection(new T.Vector3()),
            -delta * 0.5,
          );
        else
          distance = T.MathUtils.clamp(
            distance * Math.exp(delta * 0.0012),
            80,
            60000,
          );
        draw();
      },
      onFocus: focusSelection,
      onSelectPoint,
      onAddPoint,
      onInsertPoint,
      onDragPoint,
      onDragEnd,
      onDragCancel,
      onBankDrag,
      onBankDragEnd,
      onBankDragCancel,
      onInteractionEnd() {
        if (visible && fingerprint !== builtFingerprint) {
          clearTimeout(timer);
          timer = setTimeout(rebuild, 180);
        }
      },
      draw,
    });
    renderer.domElement.addEventListener(
      'keydown',
      (event) => {
        if (!flying && event.key === 'Enter') {
          event.preventDefault();
          event.stopPropagation();
          enterFly();
          return;
        }
        if (!flying) return;
        if (event.key === 'Escape') {
          event.preventDefault();
          event.stopPropagation();
          exitFly(true);
          return;
        }
        if (event.key === 'Tab') {
          exitFly(false);
          return;
        }
        if (flyCodes.has(event.code)) {
          heldKeys.add(event.code);
          event.preventDefault();
          event.stopPropagation();
        }
      },
      { signal: rendererLife.signal },
    );
    renderer.domElement.addEventListener(
      'blur',
      (event) => {
        heldKeys.clear();
        if (
          flying &&
          !event.relatedTarget?.matches('[data-editor-action="fly-camera"]')
        )
          exitFly(false);
      },
      { signal: rendererLife.signal },
    );
  }
  function draw() {
    if (!visible || !renderer || disposed || raf) return;
    clearTimeout(sceneryTimer);
    raf = requestAnimationFrame((now) => {
      // Consume the latest pointer sample in the frame that actually draws it.
      // Nested draw requests during this flush belong to this same frame.
      editingInput?.flushPending();
      raf = null;
      if (!visible || !renderer || disposed) return;
      const width = host.clientWidth;
      const height = host.clientHeight;
      if (!width || !height) return;
      if (width !== renderWidth || height !== renderHeight) {
        renderer.setSize(width, height, false);
        renderWidth = width;
        renderHeight = height;
      }
      if (roadEditDirty && world) {
        roadEditDirty = false;
        if (
          !showRoadEdit ||
          !world.updateRoadEdit(latest, selection.selectedPoints)
        )
          world.clearRoadEdit();
      }
      camera.aspect = width / height;
      camera.near = flying ? 0.5 : Math.max(0.5, Math.min(20, distance / 2000));
      camera.far = Math.max(200000, distance * 3);
      if (flying) {
        camera.position.copy(flyPosition);
        camera.rotation.set(flyPitch, flyYaw, 0, 'YXZ');
      } else {
        camera.position.set(
          target.x + Math.sin(yaw) * Math.cos(pitch) * distance,
          target.y + Math.sin(pitch) * distance,
          target.z + Math.cos(yaw) * Math.cos(pitch) * distance,
        );
        camera.lookAt(target);
      }
      camera.updateProjectionMatrix();
      camera.updateMatrixWorld();
      if (scene.fog)
        scene.fog.density = flying
          ? 0.000045
          : Math.min(0.00011, 0.5 / Math.max(1, distance));
      handles?.setVisible(!flying && !selection.readOnly);
      handles?.update(camera, width, height);
      guides?.update(camera, width, height, flying || selection.readOnly);
      if (trajectoryLayer) trajectoryLayer.visible = !selection.readOnly;
      const state = handles?.getState();
      const placeLabel = (label, at, text) => {
        if (!label) return;
        label.hidden = flying || selection.readOnly || !at?.visible;
        if (!label.hidden) {
          label.textContent = text;
          label.style.left = `${Math.min(width - (label === drawLabel ? 270 : label === issueLabel ? 200 : 120), Math.max(4, at.x + 12))}px`;
          label.style.top = `${Math.min(height - 28, Math.max(4, at.y - 12))}px`;
        }
      };
      placeLabel(
        heightLabel,
        guideData.candidate ? null : state?.heightHandle,
        !selection.heightDelta
          ? '↕ Height'
          : `${selection.heightDelta >= 0 ? '+' : ''}${selection.heightDelta.toFixed(1)} m · Alt for fine`,
      );
      placeLabel(
        bankLabel,
        state?.bankHandle,
        `Roll ${signedPointRoll(state?.bankHandle?.roll)}`,
      );
      if (bankLabel && !bankLabel.hidden) {
        const at = state.bankHandle;
        const toLeft = at.x >= 98;
        bankLabel.style.left = `${toLeft ? at.x - 15 : at.x + 15}px`;
        bankLabel.style.transform = toLeft ? 'translateX(-100%)' : '';
      }
      placeLabel(
        issueLabel,
        state?.problemMarker,
        `Point ${state?.problemMarker?.number} · ${selection.problemLabel ?? 'Check this point'}`,
      );
      if (issueLabel) {
        const warning = selection.problemSeverity === 'warning';
        issueLabel.dataset.severity = warning ? 'warning' : 'error';
        issueLabel.style.background = '#30291fee';
        issueLabel.style.color = '#f5dfba';
        issueLabel.style.borderColor = '#a3875b';
      }
      if (issueLabel && state?.problemMarker?.visible)
        issueLabel.style.top = `${Math.min(height - 32, Math.max(4, state.problemMarker.y + 20))}px`;
      const drawing = state?.drawing;
      placeLabel(xLabel, drawing?.xLabel, 'X +100 m');
      placeLabel(zLabel, drawing?.zLabel, 'Z +100 m');
      placeLabel(
        drawLabel,
        drawing?.cursor,
        drawing?.closing
          ? 'Click start to finish circuit'
          : `${drawing?.planeHeight ?? 52} m high · ${drawing?.joinsStart ? 'Circuit joins start' : 'Click to add point'}`,
      );
      if (drawLabel && drawing?.cursor?.visible)
        drawLabel.style.top = `${Math.min(height - 28, Math.max(4, drawing.cursor.y + 18))}px`;
      const biome = world?.group.userData.editorBiome;
      const animate =
        ((biome === 'orbital' && world.track) ||
          (biome === 'nacre' && latest?.environment?.layoutVersion >= 4)) &&
        (selection.readOnly || flying) &&
        !document.hidden &&
        !loadSettings().reducedMotion &&
        !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      settings.reducedMotion = !animate;
      const time = animate ? now / 1000 : 0;
      backdrop?.update?.({
        camera,
        time,
        settings,
        oceanWaterY: world?.track?.editorRegionPlan?.oceanWaterY,
      });
      world?.update?.({
        camera,
        settings,
        time,
        dt: 0,
        mode: animate ? 'editor' : 'paused',
        reviewing: false,
        reset: !animate,
        state: { distance: 0, lateral: 0 },
      });
      const started = performance.now();
      renderer.render(scene, camera);
      metrics = {
        preset: animate
          ? `Low / animated ${biome === 'nacre' ? 'ocean' : 'lattice'} preview`
          : 'Low / static editor preview',
        biome: world?.group.userData.editorBiome ?? null,
        environment: world?.group.userData.environment ?? null,
        incremental: world?.incremental ?? null,
        frames: ++frames,
        timing: 'CPU render submission only',
        estimatedGpuBytes: world ? estimatedGpuBytes : 0,
        worldReady: Boolean(world) && builtFingerprint === fingerprint,
        frameMs: Number((performance.now() - started).toFixed(2)),
        calls: renderer.info.render.calls,
        triangles: renderer.info.render.triangles,
        geometries: renderer.info.memory.geometries,
        textures: renderer.info.memory.textures,
        viewport: [width, height],
        renderer: gpuRenderer,
        camera: cameraState(),
      };
      // Limit idle scenery animation to 15 Hz. User input and fly navigation
      // continue to request their own immediate frames.
      if (animate) sceneryTimer = setTimeout(draw, 1000 / 15);
    });
  }
  function focusBounds(bounds) {
    exitFly(false);
    bounds.getCenter(target);
    const size = bounds.getSize(new T.Vector3());
    distance = Math.max(220, Math.max(size.x, size.y, size.z) * 2.8 + 100);
    pitch = 0.45;
    draw();
  }
  function focusSelection() {
    const bounds = handles?.selectionBounds();
    if (bounds) focusBounds(bounds);
    else reset();
  }
  function frameDocument() {
    if (latest?.points.length >= 4) {
      const curve = routeCurve(latest),
        length = curve.getLength();
      if (length > 6000) {
        const end = Math.min(1, 1500 / length);
        const bounds = new T.Box3().setFromPoints(
          Array.from({ length: 49 }, (_, i) =>
            curve.getPointAt((end * i) / 48),
          ),
        );
        bounds.getCenter(target);
        const size = bounds.getSize(new T.Vector3());
        distance = Math.max(
          650,
          Math.max(size.x, size.y, size.z) * 1.8 + latest.width * 3,
        );
        const tangent = curve.getTangentAt(end / 2);
        yaw = Math.atan2(tangent.x, tangent.z) + Math.PI / 2;
        pitch = 0.5;
        draw();
        return;
      }
    }
    reset();
  }
  function cameraState() {
    return camera
      ? {
          mode: flying ? 'fly' : 'orbit',
          position: camera.position.toArray(),
          quaternion: camera.quaternion.toArray(),
          fov: camera.fov,
          near: camera.near,
          far: camera.far,
        }
      : null;
  }
  function blockHeldPad(pad) {
    blockedPadButtons.clear();
    pad?.buttons.forEach((button, i) => {
      if (button.pressed || button.value > 0.1) blockedPadButtons.add(i);
    });
    padNeedsNeutral = true;
    padIdentity = pad ? `${pad.index}:${pad.id}` : null;
    hadPad = Boolean(pad);
  }
  function enterFly() {
    if (!world || !visible || !camera || flying || disposed) return false;
    heldKeys.clear();
    flyPosition.copy(camera.position);
    const direction = camera.getWorldDirection(new T.Vector3());
    flyYaw = Math.atan2(-direction.x, -direction.z);
    flyPitch = Math.asin(T.MathUtils.clamp(direction.y, -1, 1));
    flying = true;
    navigationRoot?.setAttribute('data-editor-fly-active', 'true');
    renderer.domElement.setAttribute('role', 'application');
    renderer.domElement.setAttribute(
      'aria-label',
      'Free camera active. WASD moves, Q/E moves down/up, arrows or drag look, Shift moves faster. Escape exits. Controller: left stick moves, right stick looks, LB/RB down/up, RT faster, B exits.',
    );
    renderer.domElement.focus({ preventScroll: true });
    blockHeldPad(readGamepad());
    flyTime = performance.now();
    flyFrame = requestAnimationFrame(pollFly);
    onFlyChange?.(true, { restoreFocus: false });
    draw();
    return true;
  }
  function exitFly(restoreFocus = false) {
    if (!flying) return;
    flying = false;
    heldKeys.clear();
    cancelAnimationFrame(flyFrame);
    flyFrame = undefined;
    navigationRoot?.removeAttribute('data-editor-fly-active');
    if (camera) {
      const direction = new T.Vector3(0, 0, -1).applyEuler(
        new T.Euler(flyPitch, flyYaw, 0, 'YXZ'),
      );
      distance = Math.min(1200, Math.max(250, distance));
      target.copy(flyPosition).addScaledVector(direction, distance);
      const offset = flyPosition.clone().sub(target);
      yaw = Math.atan2(offset.x, offset.z);
      pitch = Math.asin(T.MathUtils.clamp(offset.y / distance, -1, 1));
    }
    renderer?.domElement.setAttribute('role', 'application');
    renderer?.domElement.setAttribute(
      'aria-label',
      'Editable three-dimensional track. Drag points, their yellow height arrow or their blue Roll handle. Shift-click selects a range; right drag orbits; middle drag pans; F focuses the selection. Enter starts free camera.',
    );
    onFlyChange?.(false, { restoreFocus });
    draw();
  }
  function pollFly(now) {
    if (!flying || !visible || disposed) return;
    const activeControl = document.activeElement;
    const ownExitButton = activeControl?.matches(
      '[data-editor-action="fly-camera"]',
    );
    if (
      document.hidden ||
      (activeControl !== renderer?.domElement && !ownExitButton)
    ) {
      exitFly(false);
      return;
    }
    const dt = Math.min(0.05, Math.max(0, (now - flyTime) / 1000));
    flyTime = now;
    const pad = readGamepad();
    if (hadPad && !pad) {
      exitFly(true);
      return;
    }
    const identity = pad ? `${pad.index}:${pad.id}` : null;
    if (identity !== padIdentity) blockHeldPad(pad);
    for (const i of blockedPadButtons)
      if (!pad?.buttons[i]?.pressed && (pad?.buttons[i]?.value ?? 0) < 0.1)
        blockedPadButtons.delete(i);
    const pressed = (i) =>
      !blockedPadButtons.has(i) &&
      (pad?.buttons[i]?.pressed || (pad?.buttons[i]?.value ?? 0) > 0.5);
    if (pressed(1) || pressed(9)) {
      exitFly(true);
      return;
    }
    if (ownExitButton) {
      heldKeys.clear();
      flyFrame = requestAnimationFrame(pollFly);
      return;
    }
    if (
      padNeedsNeutral &&
      [0, 1, 2, 3].every((i) => Math.abs(pad?.axes[i] ?? 0) < 0.2)
    )
      padNeedsNeutral = false;
    const axis = (i) =>
      padNeedsNeutral ? 0 : steeringAxis(pad?.axes[i], 0.15);
    const key = (code) => Number(heldKeys.has(code));
    const strafe = key('KeyD') - key('KeyA') + axis(0);
    const forward = key('KeyW') - key('KeyS') - axis(1);
    const vertical =
      key('KeyE') - key('KeyQ') + Number(pressed(5)) - Number(pressed(4));
    const lookX = key('ArrowRight') - key('ArrowLeft') + axis(2);
    const lookY = key('ArrowUp') - key('ArrowDown') - axis(3);
    const moved =
      Math.abs(strafe) +
        Math.abs(forward) +
        Math.abs(vertical) +
        Math.abs(lookX) +
        Math.abs(lookY) >
      0.001;
    if (moved) {
      flyYaw -= lookX * dt * 1.8;
      flyPitch = T.MathUtils.clamp(flyPitch + lookY * dt * 1.4, -1.48, 1.48);
      const movement = new T.Vector3(1, 0, 0)
        .applyAxisAngle(new T.Vector3(0, 1, 0), flyYaw)
        .multiplyScalar(strafe);
      movement.addScaledVector(
        new T.Vector3(0, 0, -1).applyEuler(
          new T.Euler(flyPitch, flyYaw, 0, 'YXZ'),
        ),
        forward,
      );
      movement.y += vertical;
      if (movement.lengthSq() > 1) movement.normalize();
      const fast = key('ShiftLeft') || key('ShiftRight') || pressed(7);
      flyPosition.addScaledVector(movement, dt * (fast ? 600 : 200));
      flyPosition.x = T.MathUtils.clamp(flyPosition.x, -60000, 60000);
      flyPosition.y = T.MathUtils.clamp(flyPosition.y, -2000, 20000);
      flyPosition.z = T.MathUtils.clamp(flyPosition.z, -60000, 60000);
      draw();
    }
    if (flying) flyFrame = requestAnimationFrame(pollFly);
  }
  window.addEventListener(
    'keyup',
    (event) => {
      heldKeys.delete(event.code);
    },
    { signal: cameraLife.signal },
  );
  window.addEventListener('blur', () => exitFly(false), {
    signal: cameraLife.signal,
  });
  document.addEventListener(
    'visibilitychange',
    () => {
      if (document.hidden) exitFly(false);
    },
    { signal: cameraLife.signal },
  );
  function clearTrajectories() {
    if (!trajectoryLayer) return;
    trajectoryLayer.removeFromParent();
    trajectoryLayer.traverse((node) => {
      node.geometry?.dispose();
      node.material?.dispose();
    });
    trajectoryLayer = undefined;
  }
  function rebuildTrajectories() {
    clearTrajectories();
    if (!scene || !trajectories.length) return;
    trajectoryLayer = new T.Group();
    trajectoryLayer.name = 'Workshop / advisory flight paths';
    for (const flight of trajectories) {
      const stride = Math.max(1, Math.ceil(flight.points.length / 240));
      const points = flight.points
        .filter((p, i) => i % stride === 0 || i === flight.points.length - 1)
        .map((p) => new T.Vector3(...p));
      if (points.length < 2) continue;
      const geometry = new T.BufferGeometry().setFromPoints(points);
      const material = new T.LineBasicMaterial({
        color: flight.color,
        depthTest: false,
        transparent: true,
        opacity: 0.95,
        toneMapped: false,
      });
      const line = new T.Line(geometry, material);
      line.name = `${flight.label} flight estimate`;
      line.renderOrder = 1000;
      trajectoryLayer.add(line);
    }
    scene.add(trajectoryLayer);
    estimatedGpuBytes = estimateResources();
    draw();
  }
  function reset() {
    exitFly(false);
    const points = latest?.points ?? [];
    const bounds = new T.Box3();
    points.forEach((p) => bounds.expandByPoint(new T.Vector3(p.x, p.y, p.z)));
    if (bounds.isEmpty()) {
      target.set(0, 0, 0);
      distance = 1800;
    } else {
      bounds.getCenter(target);
      const size = bounds.getSize(new T.Vector3());
      distance = Math.max(650, Math.max(size.x, size.z, size.y) * 1.7);
    }
    yaw = -0.72;
    pitch = 0.76;
    draw();
  }
  function estimateResources() {
    const geometries = new Set(),
      textures = new Set();
    let bytes = 0;
    const addTexture = (texture) => {
      if (texture?.isTexture) textures.add(texture);
    };
    scene.traverse((node) => {
      if (node.geometry) geometries.add(node.geometry);
      if (node.instanceMatrix) bytes += node.instanceMatrix.array.byteLength;
      if (node.instanceColor) bytes += node.instanceColor.array.byteLength;
      for (const material of [node.material].flat().filter(Boolean)) {
        Object.values(material).forEach(addTexture);
        Object.values(material.uniforms ?? {}).forEach((uniform) =>
          addTexture(uniform.value),
        );
      }
    });
    for (const geometry of geometries) {
      for (const attribute of Object.values(geometry.attributes))
        bytes +=
          attribute.array?.byteLength ?? attribute.data?.array?.byteLength ?? 0;
      bytes += geometry.index?.array.byteLength ?? 0;
    }
    world?.ownedTextures?.forEach(addTexture);
    backdrop?.ownedTextures?.forEach(addTexture);
    addTexture(scene.environment);
    for (const texture of textures) bytes += textureMemory(texture).bytes;
    return Math.round(bytes);
  }
  async function rebuild() {
    if (!visible || disposed || !committedDocument) return;
    const revision = ++build;
    let next;
    try {
      init();
      const buildingScene = scene;
      const buildingRenderer = renderer;
      const buildingDocument = committedDocument,
        buildingFingerprint = fingerprint;
      const skyKey = JSON.stringify([
        buildingDocument.biome,
        buildingDocument.settings.waterLevel,
      ]);
      if (backdropKey !== skyKey || !backdropPromise) {
        backdropAbort?.abort();
        backdropAbort = new AbortController();
        const signal = backdropAbort.signal;
        backdropKey = skyKey;
        backdropPromise = (async () => {
          const nextBackdrop = await createEditorBackdrop(buildingDocument, {
            signal,
            preview: true,
          });
          if (disposed || buildingScene !== scene || signal.aborted) {
            nextBackdrop.dispose();
            return;
          }
          const generator = new T.PMREMGenerator(buildingRenderer);
          let nextEnvironment;
          try {
            const environmentScene = new T.Scene();
            environmentScene.add(nextBackdrop.group.clone(true));
            nextEnvironment = generator.fromScene(
              environmentScene,
              0.04,
              0.1,
              Math.max(80000, nextBackdrop.far ?? 0),
            );
          } catch (error) {
            nextBackdrop.dispose();
            throw error;
          } finally {
            generator.dispose();
          }
          if (disposed || buildingScene !== scene || signal.aborted) {
            nextBackdrop.dispose();
            nextEnvironment.dispose();
            return;
          }
          if (backdrop) scene.remove(backdrop.group);
          backdrop?.dispose();
          environment?.dispose();
          backdrop = nextBackdrop;
          environment = nextEnvironment;
          scene.add(backdrop.group);
          scene.environment = environment.texture;
          scene.environmentIntensity = backdrop.environmentIntensity ?? 0.8;
          world?.setReflection?.(environment.texture);
          const family = editorBiome(buildingDocument.biome);
          scene.background = new T.Color(
            family.renderer?.background ?? '#111b20',
          );
          scene.fog = family.renderer?.fog
            ? new T.FogExp2(family.renderer.fog.color, 0.00011)
            : null;
          skyLight.color.set(backdrop.ambientSky ?? '#a7c2d0');
          skyLight.groundColor.set(backdrop.ambientGround ?? '#52666d');
          skyLight.intensity = backdrop.ambientIntensity ?? 1.4;
          sunLight.color.set(backdrop.sunColor ?? '#c9d8e1');
          sunLight.intensity = backdrop.sunIntensity ?? 2.2;
          if (backdrop.sunDirection)
            sunLight.position.copy(backdrop.sunDirection).multiplyScalar(1000);
          camera.far = Math.max(30000, backdrop.far ?? 0);
        })().catch((error) => {
          if (!signal.aborted && backdropKey === skyKey) {
            backdropKey = null;
            backdropPromise = null;
          }
          throw error;
        });
      }
      await backdropPromise;
      if (disposed || revision !== build || (world && selection.previewOnly))
        return;
      next = await createEditorWorld(buildingDocument, {
        renderer,
        preview: true,
        backdropAssets: backdrop?.assets,
        previous: world,
      });
      await next.ready;
      if (
        disposed ||
        revision !== build ||
        buildingFingerprint !== fingerprint
      ) {
        next.dispose();
        return;
      }
      next.setReflection?.(environment?.texture ?? null);
      // Keep the current materials alive while the replacement acquires its
      // programs. Disposing them first evicts shared shaders from Three's
      // cache and turns every small road edit into another compilation stall.
      await buildingRenderer.compileAsync(next.group, camera, buildingScene);
      if (
        disposed ||
        revision !== build ||
        buildingFingerprint !== fingerprint ||
        buildingScene !== scene
      ) {
        next.dispose();
        return;
      }
      if (world) {
        scene.remove(world.group);
        world.dispose();
      }
      world = next;
      builtFingerprint = buildingFingerprint;
      // A drag can begin while the committed world is compiling. Reapply its
      // latest pose before the replacement is ever presented.
      showRoadEdit = selection.previewOnly;
      roadEditDirty = showRoadEdit;
      scene.add(world.group);
      estimatedGpuBytes = estimateResources();
      draw();
      onReady?.();
    } catch (error) {
      next?.dispose?.();
      if (!disposed && revision === build) onError?.(error);
    }
  }
  function release() {
    exitFly(false);
    clearTimeout(timer);
    clearTimeout(sceneryTimer);
    cancelAnimationFrame(raf);
    raf = null;
    ++build;
    editingInput?.dispose();
    editingInput = null;
    handles?.dispose();
    handles = null;
    for (const label of [
      heightLabel,
      bankLabel,
      drawLabel,
      xLabel,
      zLabel,
      issueLabel,
    ])
      label?.remove();
    heightLabel = bankLabel = drawLabel = xLabel = zLabel = issueLabel = null;
    rendererLife?.abort();
    world?.dispose();
    world = undefined;
    builtFingerprint = null;
    showRoadEdit = false;
    roadEditDirty = false;
    clearTrajectories();
    guides?.dispose();
    guides = null;
    backdrop?.dispose();
    backdrop = undefined;
    backdropPromise = undefined;
    backdropKey = undefined;
    backdropAbort?.abort();
    backdropAbort = undefined;
    skyLight = sunLight = undefined;
    environment?.dispose();
    environment = undefined;
    renderer?.dispose();
    renderer?.forceContextLoss();
    renderer?.domElement.remove();
    renderer = undefined;
    scene = undefined;
    camera = undefined;
    metrics = null;
  }
  return {
    getMetrics: () =>
      metrics
        ? {
            ...metrics,
            camera: cameraState(),
            worldReady: Boolean(world) && builtFingerprint === fingerprint,
            interaction: handles?.getState() ?? null,
            liveRoad: world?.getRoadEditState(selection.selectedPoint) ?? null,
            guideRouteBuilds: guides?.getMetrics().routeBuilds ?? 0,
          }
        : null,
    isFlying: () => flying,
    isReady: () => Boolean(world) && builtFingerprint === fingerprint,
    enterFly,
    exitFly: () => exitFly(true),
    cancelInteraction: () => editingInput?.cancel(),
    revealPoint(index) {
      const point = latest?.points[index];
      if (!point || !camera || flying || !renderWidth || !renderHeight)
        return false;
      const position = new T.Vector3(point.x, point.y, point.z);
      const at = projectEditorHandle(
        position,
        camera,
        renderWidth,
        renderHeight,
      );
      if (
        at.visible &&
        at.x >= 0 &&
        at.x <= renderWidth &&
        at.y >= 0 &&
        at.y <= renderHeight
      )
        return false;
      target.copy(position);
      draw();
      return true;
    },
    setDocument(
      document,
      {
        frame = false,
        previewOnly = false,
        previewCurve = null,
        selectedPoint = -1,
        selectedPoints = [],
        rollRateSections = [],
        selectedProp = -1,
        section = null,
        drawMode = false,
        tool = drawMode ? 'draw' : 'move',
        problemPoint = null,
        problemPosition = null,
        problemSeverity = 'error',
        problemLabel = 'Check this point',
        heightDelta = null,
        readOnly = false,
      } = {},
    ) {
      const next = previewOnly ? fingerprint : editorWorldFingerprint(document);
      const changed = next !== fingerprint;
      const wasDragging = Boolean(selection.previewOnly);
      // Keep the last posed surface on screen while its detailed world builds.
      // Cancel/Undo to the existing world can restore the buffers immediately.
      const keepEdit =
        previewOnly ||
        ((wasDragging || (showRoadEdit && !changed)) &&
          next !== builtFingerprint &&
          document.id === latest?.id);
      roadEditDirty ||=
        previewOnly || keepEdit !== showRoadEdit || (keepEdit && changed);
      showRoadEdit = keepEdit;
      latest = document;
      if (!previewOnly) committedDocument = document;
      selection = {
        previewOnly,
        previewCurve,
        selectedPoint,
        selectedPoints,
        rollRateSections,
        selectedProp,
        section,
        drawMode,
        tool,
        problemPoint,
        problemPosition,
        problemSeverity,
        problemLabel,
        heightDelta,
        readOnly,
      };
      fingerprint = next;
      handles?.setDocument(latest, selection);
      editingInput?.syncTool();
      if (frame) frameDocument();
      draw();
      if (previewOnly) {
        if (!wasDragging && world) clearTimeout(timer);
        return;
      }
      if (!changed && !wasDragging) return;
      clearTimeout(timer);
      if (visible && next !== builtFingerprint && !editingInput?.isDragging())
        timer = setTimeout(rebuild, 180);
    },
    setTrajectories(next) {
      const key = JSON.stringify(next);
      trajectories = next;
      if (key === trajectoryKey) return;
      trajectoryKey = key;
      rebuildTrajectories();
    },
    setGuides(next) {
      guideData = next;
      guides?.setData(next);
      draw();
    },
    setVisible(value) {
      if (visible === value) {
        if (value && world && builtFingerprint === fingerprint) draw();
        return;
      }
      visible = value;
      if (visible) rebuild();
      else release();
    },
    orbit(direction) {
      exitFly(false);
      yaw += direction * 0.22;
      draw();
    },
    tilt(direction) {
      exitFly(false);
      pitch = T.MathUtils.clamp(pitch + direction * 0.12, -1.45, 1.45);
      draw();
    },
    zoom(direction) {
      exitFly(false);
      distance = T.MathUtils.clamp(
        distance * (direction > 0 ? 1.22 : 0.82),
        100,
        60000,
      );
      draw();
    },
    pan(x, y) {
      exitFly(false);
      if (!camera) return;
      const step = distance * 0.12;
      target.addScaledVector(
        new T.Vector3(1, 0, 0).applyQuaternion(camera.quaternion),
        x * step,
      );
      target.addScaledVector(
        new T.Vector3(0, 1, 0).applyQuaternion(camera.quaternion),
        y * step,
      );
      draw();
    },
    focusRoute({ start = 0, end = 1 } = {}) {
      exitFly(false);
      if (!latest || latest.points.length < 4 || end <= start) return;
      const curve = routeCurve(latest);
      const bounds = new T.Box3().setFromPoints(
        Array.from({ length: 33 }, (_, i) =>
          curve.getPointAt(start + ((end - start) * i) / 32),
        ),
      );
      bounds.getCenter(target);
      const size = bounds.getSize(new T.Vector3());
      distance = Math.max(
        240,
        Math.max(size.x, size.y, size.z) * 1.8 + latest.width * 3,
      );
      const tangent = curve.getTangentAt((start + end) / 2);
      yaw = Math.atan2(tangent.x, tangent.z) + Math.PI / 2;
      pitch = 0.45;
      draw();
    },
    focusTrajectories(flights, { launch, landing } = {}) {
      exitFly(false);
      const points = flights
        .flatMap((flight) => flight.points)
        .map((p) => new T.Vector3(...p));
      if (launch) points.push(new T.Vector3(...launch));
      if (landing) points.push(new T.Vector3(...landing));
      if (!points.length) return;
      const bounds = new T.Box3().setFromPoints(points);
      bounds.getCenter(target);
      const size = bounds.getSize(new T.Vector3());
      distance = Math.max(
        300,
        Math.max(size.x, size.y, size.z) * 1.7 + (latest?.width ?? 40) * 3,
      );
      if (launch && landing)
        yaw =
          Math.atan2(landing[0] - launch[0], landing[2] - launch[2]) +
          Math.PI / 2;
      pitch = 0.32;
      draw();
    },
    reset,
    focusSelection,
    dispose() {
      disposed = true;
      cameraLife.abort();
      observer.disconnect();
      release();
    },
  };
}
