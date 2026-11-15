import * as T from 'three';
import { routeCurve } from './route.js';
import {
  constrainEditorPoint,
  projectEditorHandle,
} from './viewport-handles.js';

/** Pointer editing owns one cancellable transaction; orbit never edits a draft. */
export function bindEditorViewportInput(
  canvas,
  {
    getCamera,
    getWorld,
    getDocument,
    getHandles,
    getSelection,
    isFlying,
    getCameraState,
    onOrbit,
    onPan,
    onWheel,
    onFocus,
    onSelectPoint,
    onAddPoint,
    onInsertPoint,
    onDragPoint,
    onDragEnd,
    onDragCancel,
    onInteractionEnd,
    draw,
  },
) {
  const life = new AbortController();
  const raycaster = new T.Raycaster();
  const tools = new Set(['select', 'draw', 'move', 'height', 'orbit', 'pan']);
  const currentTool = () => {
    const selection = getSelection();
    return tools.has(selection?.tool)
      ? selection.tool
      : selection?.drawMode
        ? 'draw'
        : 'move';
  };
  const selectPoint = (index, meta = {}) =>
    onSelectPoint?.(index, { preserveTool: true, ...meta });
  let lastTool = currentTool();
  let gesture = null,
    space = false,
    pending = null,
    pendingFrame = null;
  const rayAt = (event) => {
    const bounds = canvas.getBoundingClientRect(),
      camera = getCamera();
    if (!camera || !bounds.width || !bounds.height) return null;
    camera.updateMatrixWorld();
    raycaster.setFromCamera(
      new T.Vector2(
        ((event.clientX - bounds.left) / bounds.width) * 2 - 1,
        1 - ((event.clientY - bounds.top) / bounds.height) * 2,
      ),
      camera,
    );
    return raycaster;
  };
  const roadAt = (ray) => {
    const world = getWorld();
    if (!world) return null;
    const surfaces = [];
    world.group.updateMatrixWorld(true);
    world.group.traverse((node) => {
      if (node.userData.roadSurface) surfaces.push(node);
    });
    return ray.intersectObjects(surfaces, false)[0] ?? null;
  };
  const planeAt = (ray, point) => {
    const normal =
      Math.abs(ray.direction.y) > 0.08
        ? new T.Vector3(0, 1, 0)
        : getCamera().getWorldDirection(new T.Vector3());
    return new T.Plane().setFromNormalAndCoplanarPoint(normal, point);
  };
  function flush() {
    cancelAnimationFrame(pendingFrame);
    pendingFrame = null;
    if (!pending || !gesture) return;
    const move = pending;
    pending = null;
    if (gesture.deferredSelect) {
      selectPoint(gesture.index, { extendRange: false, shiftKey: false });
      gesture.deferredSelect = false;
    }
    gesture.moved = true;
    onDragPoint?.(gesture.index, move);
    draw();
  }
  function finish(cancel = false) {
    if (!gesture) return;
    if (cancel) {
      cancelAnimationFrame(pendingFrame);
      pendingFrame = null;
      pending = null;
    } else flush();
    const ended = gesture;
    gesture = null;
    if (canvas.hasPointerCapture(ended.pointerId))
      canvas.releasePointerCapture(ended.pointerId);
    if (['point', 'height'].includes(ended.kind))
      getHandles()?.setDragging(false);
    if (['point', 'height'].includes(ended.kind) && ended.moved) {
      if (cancel) onDragCancel?.();
      else onDragEnd?.();
    }
    canvas.style.cursor = '';
    onInteractionEnd?.();
    draw();
  }
  function syncTool() {
    const next = currentTool();
    if (next === lastTool) return false;
    lastTool = next;
    finish(true);
    getHandles()?.setHover(null);
    getHandles()?.setDrawCursor(null);
    canvas.style.cursor = '';
    draw();
    return true;
  }
  canvas.addEventListener('contextmenu', (event) => event.preventDefault(), {
    signal: life.signal,
  });
  canvas.addEventListener(
    'pointerdown',
    (event) => {
      if (![0, 1, 2].includes(event.button)) return;
      syncTool();
      if (gesture) finish(true);
      getHandles()?.setDrawCursor(null);
      canvas.focus({ preventScroll: true });
      const ray = rayAt(event);
      if (!ray) return;
      const common = {
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        moved: false,
      };
      const tool = currentTool();
      if (
        event.button === 1 ||
        (event.button === 2 && event.shiftKey) ||
        (event.button === 0 && !space && !isFlying() && tool === 'pan')
      ) {
        gesture = { ...common, kind: 'pan', camera: getCameraState() };
        canvas.style.cursor = 'grabbing';
      } else if (
        event.button === 2 ||
        space ||
        isFlying() ||
        tool === 'orbit'
      ) {
        gesture = {
          ...common,
          kind: 'orbit',
          camera: getCameraState(),
          flying: isFlying(),
        };
        canvas.style.cursor = 'grabbing';
      } else {
        const handles = getHandles(),
          hit = handles?.pick(ray);
        if (hit?.kind === 'point' || hit?.kind === 'height') {
          const position = handles.point(hit.index);
          const canDrag = ['move', 'height', 'draw'].includes(tool);
          const vertical =
            tool === 'height' || hit.kind === 'height' || event.shiftKey;
          gesture = {
            ...common,
            kind: canDrag ? (vertical ? 'height' : 'point') : 'select',
            index: hit.index,
            position,
            plane: planeAt(ray.ray, position),
            units: projectEditorHandle(
              position,
              getCamera(),
              canvas.clientWidth,
              canvas.clientHeight,
            ).units,
          };
          gesture.startHit = ray.ray.intersectPlane(
            gesture.plane,
            new T.Vector3(),
          );
          gesture.rangeExtend =
            hit.kind === 'point' && event.shiftKey && tool !== 'height';
          gesture.finishDrawing =
            hit.kind === 'point' &&
            hit.index === 0 &&
            !vertical &&
            tool === 'draw' &&
            getDocument()?.courseType !== 'downhill' &&
            getDocument()?.points.length >= 4;
          gesture.deferredSelect = gesture.rangeExtend || gesture.finishDrawing;
          if (!gesture.deferredSelect)
            selectPoint(hit.index, { extendRange: false, shiftKey: false });
          if (canDrag) handles.setDragging(true);
          canvas.style.cursor = canDrag
            ? vertical
              ? 'ns-resize'
              : 'grabbing'
            : 'pointer';
        } else {
          const road = roadAt(ray);
          const doc = getDocument();
          const selected =
            doc?.points[getSelection()?.selectedPoint] ?? doc?.points.at(-1);
          const plane = new T.Plane(
            new T.Vector3(0, 1, 0),
            -(selected?.y ?? 52),
          );
          const position = ray.ray.intersectPlane(plane, new T.Vector3());
          gesture = {
            ...common,
            kind: road ? 'road' : 'ground',
            road,
            position,
          };
        }
      }
      canvas.setPointerCapture(event.pointerId);
      event.preventDefault();
    },
    { signal: life.signal },
  );
  canvas.addEventListener(
    'pointermove',
    (event) => {
      syncTool();
      const ray = rayAt(event);
      if (!ray) return;
      if (!gesture) {
        const hover = isFlying() ? null : getHandles()?.pick(ray);
        const handles = getHandles();
        let changed = handles?.setHover(hover);
        const tool = currentTool();
        if (!isFlying() && tool === 'draw') {
          const doc = getDocument();
          const closing =
            hover?.kind === 'point' &&
            hover.index === 0 &&
            doc.courseType !== 'downhill' &&
            doc.points.length >= 4;
          const selected =
            doc.points[getSelection()?.selectedPoint] ?? doc.points.at(-1);
          const position = closing
            ? handles.point(0)
            : hover
              ? null
              : ray.ray.intersectPlane(
                  new T.Plane(new T.Vector3(0, 1, 0), -(selected?.y ?? 52)),
                  new T.Vector3(),
                );
          changed =
            handles?.setDrawCursor(
              position ? constrainEditorPoint(position) : null,
              { closing },
            ) || changed;
        } else changed = handles?.setDrawCursor(null) || changed;
        if (changed) draw();
        canvas.style.cursor =
          tool === 'orbit' || tool === 'pan'
            ? 'grab'
            : hover
              ? tool === 'select'
                ? 'pointer'
                : tool === 'height' || hover.kind === 'height' || event.shiftKey
                  ? 'ns-resize'
                  : tool === 'move' || tool === 'draw'
                    ? 'grab'
                    : 'pointer'
              : tool === 'draw'
                ? 'crosshair'
                : '';
        return;
      }
      if (gesture.pointerId !== event.pointerId) return;
      const dx = event.clientX - gesture.startX,
        dy = event.clientY - gesture.startY;
      if (gesture.kind === 'orbit') {
        onOrbit?.(dx, dy, gesture.camera, gesture.flying);
        draw();
        return;
      }
      if (gesture.kind === 'pan') {
        onPan?.(dx, dy, gesture.camera);
        draw();
        return;
      }
      if (!['point', 'height'].includes(gesture.kind) || Math.hypot(dx, dy) < 3)
        return;
      if (gesture.kind === 'height')
        pending = constrainEditorPoint({
          ...gesture.position,
          y: gesture.position.y - dy * gesture.units * (event.altKey ? 0.2 : 1),
        });
      else {
        const hit = ray.ray.intersectPlane(gesture.plane, new T.Vector3());
        if (!hit || !gesture.startHit) return;
        const position = gesture.position
          .clone()
          .add(hit.sub(gesture.startHit));
        position.y = gesture.position.y;
        pending = constrainEditorPoint(position);
      }
      if (pending && !pendingFrame) pendingFrame = requestAnimationFrame(flush);
    },
    { signal: life.signal },
  );
  canvas.addEventListener(
    'pointerleave',
    () => {
      if (!gesture) {
        const changed = getHandles()?.setHover(null);
        if (getHandles()?.setDrawCursor(null) || changed) draw();
        canvas.style.cursor = '';
      }
    },
    { signal: life.signal },
  );
  canvas.addEventListener(
    'pointerup',
    (event) => {
      syncTool();
      if (!gesture || gesture.pointerId !== event.pointerId) return;
      const ended = gesture;
      const click =
        Math.hypot(event.clientX - ended.startX, event.clientY - ended.startY) <
        4;
      finish(false);
      if (click && ended.finishDrawing && !ended.moved)
        selectPoint(ended.index, { finishDrawing: true });
      else if (click && ended.rangeExtend && !ended.moved)
        selectPoint(ended.index, { extendRange: true, shiftKey: true });
      if (
        click &&
        ['ground', 'road'].includes(ended.kind) &&
        currentTool() === 'draw' &&
        ended.position
      )
        onAddPoint?.(constrainEditorPoint(ended.position));
      if (
        click &&
        ended.kind === 'road' &&
        ['select', 'move', 'height'].includes(currentTool())
      ) {
        const points = getDocument()?.points ?? [];
        let best = Infinity,
          index = -1;
        for (let i = 0; i < points.length; i++) {
          const distance = ended.road.point.distanceToSquared(
            new T.Vector3(points[i].x, points[i].y, points[i].z),
          );
          if (distance < best) {
            best = distance;
            index = i;
          }
        }
        if (index >= 0)
          selectPoint(index, {
            extendRange: event.shiftKey,
            shiftKey: event.shiftKey,
          });
      }
      if (canvas.hasPointerCapture(event.pointerId))
        canvas.releasePointerCapture(event.pointerId);
    },
    { signal: life.signal },
  );
  for (const name of ['pointercancel', 'lostpointercapture'])
    canvas.addEventListener(
      name,
      (event) => {
        if (gesture?.pointerId === event.pointerId) finish(true);
      },
      { signal: life.signal },
    );
  canvas.addEventListener(
    'dblclick',
    (event) => {
      syncTool();
      if (isFlying() || !['select', 'move'].includes(currentTool())) return;
      const ray = rayAt(event);
      if (!ray || getHandles()?.pick(ray)) return;
      const hit = roadAt(ray),
        doc = getDocument();
      if (!hit || !doc || doc.points.length < 3 || !onInsertPoint) return;
      const coordinates = hit.object.geometry.getAttribute('roadCoord');
      const positions = hit.object.geometry.getAttribute('position');
      const { a, b, c } = hit.face;
      const local = hit.object.worldToLocal(hit.point.clone());
      const weights = new T.Triangle(
        new T.Vector3().fromBufferAttribute(positions, a),
        new T.Vector3().fromBufferAttribute(positions, b),
        new T.Vector3().fromBufferAttribute(positions, c),
      ).getBarycoord(local, new T.Vector3());
      const distance =
        coordinates.getX(a) * weights.x +
        coordinates.getX(b) * weights.y +
        coordinates.getX(c) * weights.z;
      const curve = routeCurve(doc),
        u = T.MathUtils.clamp(distance / curve.getLength(), 0, 1);
      const point = curve.getPointAt(u),
        parameter = curve.getUtoTmapping(u);
      const index = Math.min(
        doc.points.length,
        Math.floor(
          parameter *
            (doc.courseType === 'downhill'
              ? doc.points.length - 1
              : doc.points.length),
        ) + 1,
      );
      onInsertPoint(index, constrainEditorPoint(point));
      event.preventDefault();
    },
    { signal: life.signal },
  );
  canvas.addEventListener(
    'wheel',
    (event) => {
      event.preventDefault();
      onWheel?.(event.deltaY);
    },
    { passive: false, signal: life.signal },
  );
  canvas.addEventListener(
    'keydown',
    (event) => {
      if (isFlying()) return;
      if (event.code === 'Space') {
        space = true;
        event.preventDefault();
        event.stopPropagation();
      }
      if (event.code === 'KeyF') {
        onFocus?.();
        event.preventDefault();
        event.stopPropagation();
      }
      if (event.key === 'Escape' && gesture) {
        finish(true);
        event.preventDefault();
        event.stopPropagation();
      }
    },
    { signal: life.signal },
  );
  window.addEventListener(
    'keyup',
    (event) => {
      if (event.code === 'Space') space = false;
    },
    { signal: life.signal },
  );
  window.addEventListener(
    'blur',
    () => {
      space = false;
      finish(true);
    },
    { signal: life.signal },
  );
  document.addEventListener(
    'visibilitychange',
    () => {
      if (document.hidden) {
        space = false;
        finish(true);
      }
    },
    { signal: life.signal },
  );
  return {
    syncTool,
    isDragging: () =>
      Boolean(gesture && ['point', 'height'].includes(gesture.kind)),
    cancel: () => finish(true),
    dispose() {
      finish(true);
      life.abort();
      cancelAnimationFrame(pendingFrame);
    },
  };
}
