import * as T from 'three';
import { routeCurve } from './route.js';
import { createEditorDrawGuide } from './viewport-draw.js';

const white = new T.Color('#e7f2f4');
const gold = new T.Color('#ffcf79');
const blue = new T.Color('#76d9ff');
const red = new T.Color('#ff5a55');

export function projectEditorHandle(position, camera, width, height) {
  camera.updateMatrixWorld();
  const view = position.clone().applyMatrix4(camera.matrixWorldInverse);
  const ndc = position.clone().project(camera);
  const visible =
    view.z < -camera.near &&
    view.z > -camera.far &&
    Math.abs(ndc.x) <= 1.08 &&
    Math.abs(ndc.y) <= 1.08 &&
    ndc.z >= -1 &&
    ndc.z <= 1;
  return {
    visible,
    x: ((ndc.x + 1) * width) / 2,
    y: ((1 - ndc.y) * height) / 2,
    units: Math.max(
      0.001,
      (-view.z * 2 * Math.tan((camera.fov * Math.PI) / 360)) /
        Math.max(1, height),
    ),
  };
}

export function constrainEditorPoint(point) {
  return {
    x: Math.round(T.MathUtils.clamp(point.x, -25000, 25000) / 5) * 5,
    y: Math.round(T.MathUtils.clamp(point.y, 0, 3000)),
    z: Math.round(T.MathUtils.clamp(point.z, -25000, 25000) / 5) * 5,
  };
}

export function createEditorHandles(scene) {
  const group = new T.Group();
  group.name = 'Workshop / editable route handles';
  scene.add(group);
  const material = (color) =>
    new T.MeshBasicMaterial({
      color,
      depthTest: false,
      depthWrite: false,
      toneMapped: false,
      fog: false,
    });
  const dotGeometry = new T.SphereGeometry(1, 12, 8);
  const dots = new T.InstancedMesh(dotGeometry, material('#ffffff'), 256);
  dots.frustumCulled = false;
  dots.renderOrder = 2000;
  dots.instanceMatrix.setUsage(T.DynamicDrawUsage);
  group.add(dots);
  const ring = new T.Mesh(
    new T.TorusGeometry(1, 0.12, 6, 32),
    material('#ffcf79'),
  );
  ring.renderOrder = 2001;
  group.add(ring);
  const heightHandle = new T.Mesh(
    new T.ConeGeometry(1, 2.2, 10),
    material('#ffcf79'),
  );
  heightHandle.renderOrder = 2001;
  group.add(heightHandle);
  const heightStem = new T.Line(
    new T.BufferGeometry(),
    new T.LineBasicMaterial({
      color: '#ffcf79',
      depthTest: false,
      depthWrite: false,
      toneMapped: false,
      fog: false,
    }),
  );
  heightStem.renderOrder = 2000;
  group.add(heightStem);
  const guide = new T.Line(
    new T.BufferGeometry(),
    new T.LineBasicMaterial({
      color: '#76d9ff',
      depthTest: false,
      depthWrite: false,
      transparent: true,
      opacity: 0.75,
      toneMapped: false,
      fog: false,
    }),
  );
  guide.renderOrder = 1998;
  group.add(guide);
  const span = new T.Line(
    new T.BufferGeometry(),
    new T.LineBasicMaterial({
      color: '#ffcf79',
      depthTest: false,
      depthWrite: false,
      toneMapped: false,
      fog: false,
    }),
  );
  span.renderOrder = 1999;
  group.add(span);
  // Separate from the instanced dots so overlapping ordinary points cannot
  // cover the warning, and keep its screen size independent of route length.
  const problemHalo = new T.Mesh(
    new T.RingGeometry(0.87, 1, 40),
    material('#ff5a55'),
  );
  problemHalo.name = 'Workshop / diagnosed road point';
  problemHalo.renderOrder = 2003;
  problemHalo.frustumCulled = false;
  problemHalo.visible = false;
  group.add(problemHalo);
  const drawing = createEditorDrawGuide(group, projectEditorHandle);
  let doc,
    curve,
    curveKey,
    pointKey,
    selection = {},
    hover = null;
  let projected = [],
    heightScreen = null,
    problemScreen = null,
    dragging = false,
    visible = true,
    disposed = false;
  let viewCamera,
    viewWidth = 1,
    viewHeight = 1;

  function replaceGeometry(line, points) {
    line.geometry.dispose();
    line.geometry = new T.BufferGeometry().setFromPoints(points);
    line.geometry.computeBoundingSphere();
  }
  function setDocument(next, options = {}) {
    doc = next;
    selection = {
      selectedPoint: -1,
      selectedProp: -1,
      section: null,
      drawMode: false,
      problemPoint: null,
      problemPosition: null,
      problemSeverity: 'error',
      ...options,
    };
    drawing.setDocument(doc, selection);
    const key = JSON.stringify([doc.courseType, doc.points]);
    if (key !== curveKey && !dragging) {
      curveKey = key;
      curve = doc.points.length >= 3 ? routeCurve(doc) : null;
    }
    const guideKey = JSON.stringify([doc.points, selection.section]);
    if (guideKey !== pointKey) {
      pointKey = guideKey;
      const path =
        doc.points.length >= 3
          ? new T.CatmullRomCurve3(
              doc.points.map((p) => new T.Vector3(p.x, p.y, p.z)),
              doc.courseType !== 'downhill',
              'centripetal',
            )
          : null;
      replaceGeometry(
        guide,
        path
          ? path.getPoints(Math.min(600, Math.max(64, doc.points.length * 6)))
          : doc.points.map((p) => new T.Vector3(p.x, p.y, p.z)),
      );
      if (
        selection.section &&
        curve &&
        selection.section.end > selection.section.start
      )
        replaceGeometry(
          span,
          Array.from({ length: 97 }, (_, i) =>
            curve.getPointAt(
              selection.section.start +
                ((selection.section.end - selection.section.start) * i) / 96,
            ),
          ),
        );
      else replaceGeometry(span, []);
    }
  }
  function update(camera, width, height) {
    viewCamera = camera;
    viewWidth = width;
    viewHeight = height;
    group.visible = visible;
    drawing.update(camera, width, height, visible);
    problemHalo.visible = false;
    problemScreen = null;
    if (!doc || !visible) return;
    projected = [];
    dots.count = doc.points.length;
    const matrix = new T.Matrix4();
    for (let i = 0; i < doc.points.length; i++) {
      const p = new T.Vector3(
        doc.points[i].x,
        doc.points[i].y,
        doc.points[i].z,
      );
      const screen = projectEditorHandle(p, camera, width, height);
      projected.push({ index: i, ...screen });
      const scale = screen.visible
        ? screen.units *
          (i === selection.selectedPoint
            ? 8
            : hover?.kind === 'point' && hover.index === i
              ? 8
              : 6)
        : 0;
      matrix.makeScale(scale, scale, scale).setPosition(p);
      dots.setMatrixAt(i, matrix);
      dots.setColorAt(
        i,
        i === selection.problemPoint
          ? selection.problemSeverity === 'warning'
            ? gold
            : red
          : i === selection.selectedPoint
            ? gold
            : hover?.kind === 'point' && hover.index === i
              ? blue
              : white,
      );
    }
    dots.instanceMatrix.needsUpdate = true;
    if (dots.instanceColor) dots.instanceColor.needsUpdate = true;
    dots.computeBoundingSphere();
    const problemIndex = selection.problemPoint;
    const problem = Array.isArray(selection.problemPosition)
      ? {
          x: selection.problemPosition[0],
          y: selection.problemPosition[1],
          z: selection.problemPosition[2],
        }
      : Number.isInteger(problemIndex)
        ? doc.points[problemIndex]
        : null;
    const problemProjection = problem
      ? projectEditorHandle(
          new T.Vector3(problem.x, problem.y, problem.z),
          camera,
          width,
          height,
        )
      : null;
    if (problem && problemProjection) {
      problemScreen = {
        ...problemProjection,
        index: problemIndex,
        number: problemIndex + 1,
        pointId: doc.points[problemIndex]?.id ?? null,
        severity: selection.problemSeverity,
      };
      problemHalo.material.color.copy(
        selection.problemSeverity === 'warning' ? gold : red,
      );
      problemHalo.visible = problemProjection.visible;
      if (problemHalo.visible) {
        problemHalo.position.set(problem.x, problem.y, problem.z);
        problemHalo.quaternion.copy(camera.quaternion);
        problemHalo.scale.setScalar(problemProjection.units * 18);
      }
    }
    const selected = doc.points[selection.selectedPoint];
    const screen = projected[selection.selectedPoint];
    ring.visible =
      heightHandle.visible =
      heightStem.visible =
        Boolean(selected && screen?.visible);
    heightScreen = null;
    if (ring.visible) {
      const position = new T.Vector3(selected.x, selected.y, selected.z);
      ring.position.copy(position);
      ring.quaternion.copy(camera.quaternion);
      ring.scale.setScalar(screen.units * 13);
      const up = new T.Vector3(0, 1, 0).applyQuaternion(camera.quaternion),
        right = new T.Vector3(1, 0, 0).applyQuaternion(camera.quaternion);
      heightHandle.position
        .copy(position)
        .addScaledVector(up, screen.units * 56)
        .addScaledVector(right, screen.units * 24);
      heightHandle.quaternion.copy(camera.quaternion);
      heightHandle.scale.setScalar(screen.units * 6);
      const at = heightStem.geometry.getAttribute('position');
      if (at?.count === 2) {
        at.setXYZ(0, position.x, position.y, position.z);
        at.setXYZ(
          1,
          heightHandle.position.x,
          heightHandle.position.y,
          heightHandle.position.z,
        );
        at.needsUpdate = true;
        heightStem.geometry.computeBoundingSphere();
      } else
        replaceGeometry(heightStem, [position, heightHandle.position.clone()]);
      heightScreen = projectEditorHandle(
        heightHandle.position,
        camera,
        width,
        height,
      );
    }
    group.updateMatrixWorld(true);
  }
  return {
    setDocument,
    update,
    setDrawCursor: (point, options) => drawing.setCursor(point, options),
    setDragging(value) {
      dragging = value;
      if (!value && doc) {
        curveKey = pointKey = null;
        setDocument(doc, selection);
      }
    },
    setVisible(value) {
      visible = value;
      group.visible = value;
    },
    setHover(value) {
      const changed = JSON.stringify(value) !== JSON.stringify(hover);
      hover = value;
      return changed;
    },
    pick(raycaster) {
      if (!visible || !doc) return null;
      if (
        heightHandle.visible &&
        raycaster.intersectObject(heightHandle, false).length
      )
        return { kind: 'height', index: selection.selectedPoint };
      const screen = raycaster.ray.at(100, new T.Vector3()).project(viewCamera);
      const x = ((screen.x + 1) * viewWidth) / 2,
        y = ((1 - screen.y) * viewHeight) / 2;
      const score = (hit) =>
        (projected[hit.instanceId].x - x) ** 2 +
        (projected[hit.instanceId].y - y) ** 2;
      const dot = raycaster
        .intersectObject(dots, false)
        .filter((hit) => projected[hit.instanceId]?.visible)
        .sort((a, b) => score(a) - score(b) || a.distance - b.distance)[0];
      if (dot) return { kind: 'point', index: dot.instanceId };
      return null;
    },
    point(index) {
      const p = doc?.points[index];
      return p ? new T.Vector3(p.x, p.y, p.z) : null;
    },
    selectionBounds() {
      if (
        curve &&
        selection.section &&
        selection.section.end > selection.section.start
      )
        return new T.Box3().setFromPoints(
          Array.from({ length: 33 }, (_, i) =>
            curve.getPointAt(
              selection.section.start +
                ((selection.section.end - selection.section.start) * i) / 32,
            ),
          ),
        );
      return doc?.points[selection.selectedPoint]
        ? new T.Box3().setFromCenterAndSize(
            this.point(selection.selectedPoint),
            new T.Vector3(60, 60, 60),
          )
        : null;
    },
    getState() {
      return {
        selectedPoint: selection.selectedPoint,
        selectedPointId: doc?.points[selection.selectedPoint]?.id ?? null,
        drawMode: selection.drawMode,
        problemPoint: selection.problemPoint,
        problemMarker: problemScreen,
        drawing: drawing.getState(),
        dragging,
        hover,
        points: projected,
        heightHandle: heightScreen,
        span: Boolean(selection.section),
      };
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      group.removeFromParent();
      group.traverse((node) => {
        node.geometry?.dispose();
        if (node.material) node.material.dispose();
      });
      dots.dispose();
      group.clear();
    },
  };
}
