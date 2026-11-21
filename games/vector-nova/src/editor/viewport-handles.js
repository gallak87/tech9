import * as T from 'three';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';
import { LineSegments2 } from 'three/addons/lines/LineSegments2.js';
import { LineSegmentsGeometry } from 'three/addons/lines/LineSegmentsGeometry.js';
import { routeCurve } from './route.js';
import { createEditorDrawGuide } from './viewport-draw.js';

const white = new T.Color('#e7f2f4');
const gold = new T.Color('#ffcf79');
const blue = new T.Color('#76d9ff');
const warningAmber = new T.Color('#e4c18a');

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
  const bankHandle = new T.Group();
  bankHandle.name = 'Workshop / roll handle';
  const bankArc = new T.Mesh(
    new T.RingGeometry(0.73, 1, 28, 1, Math.PI * 0.3, Math.PI * 1.55),
    material('#82e5ff'),
  );
  const bankTip = new T.Mesh(
    new T.CircleGeometry(0.27, 14),
    material('#82e5ff'),
  );
  bankTip.position.set(
    0.86 * Math.cos(Math.PI * 0.3),
    0.86 * Math.sin(Math.PI * 0.3),
    0,
  );
  for (const piece of [bankArc, bankTip]) {
    piece.renderOrder = 2002;
    bankHandle.add(piece);
  }
  group.add(bankHandle);
  function createStem(color) {
    const stem = new T.Line(
      new T.BufferGeometry(),
      new T.LineBasicMaterial({
        color,
        depthTest: false,
        depthWrite: false,
        toneMapped: false,
        fog: false,
      }),
    );
    stem.renderOrder = 2000;
    group.add(stem);
    return stem;
  }
  const heightStem = createStem('#ffcf79');
  const bankStem = createStem('#82e5ff');
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
  function routeStroke(color, linewidth, renderOrder, name) {
    const stroke = new LineSegments2(
      new LineSegmentsGeometry(),
      new LineMaterial({
        color,
        linewidth,
        depthTest: false,
        depthWrite: false,
        toneMapped: false,
        fog: false,
        transparent: true,
        opacity: 0.86,
      }),
    );
    stroke.name = name;
    stroke.visible = false;
    stroke.renderOrder = renderOrder;
    group.add(stroke);
    return stroke;
  }
  const span = routeStroke(
    '#ffcf79',
    5,
    1999,
    'Workshop / selected road spans',
  );
  const fastTwist = routeStroke(
    '#ff6864',
    4,
    1999.25,
    'Workshop / excessive roll rate',
  );
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
    strokeKey,
    selectedIndices = new Set(),
    selection = {},
    hover = null;
  let projected = [],
    heightScreen = null,
    bankScreen = null,
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
  function updateStem(stem, from, to) {
    const points = stem.geometry.getAttribute('position');
    if (!points) {
      replaceGeometry(stem, [from, to]);
      return;
    }
    points.setXYZ(0, from.x, from.y, from.z);
    points.setXYZ(1, to.x, to.y, to.z);
    points.needsUpdate = true;
    stem.geometry.computeBoundingSphere();
  }
  function updateStroke(stroke, spans) {
    const positions = [];
    if (curve)
      for (const { start, end } of spans) {
        if (!(end > start)) continue;
        const count = Math.max(
          1,
          Math.min(384, Math.ceil(((end - start) * curve.getLength()) / 13)),
        );
        let a = curve.getPointAt(start);
        for (let i = 1; i <= count; i++) {
          const b = curve.getPointAt(start + ((end - start) * i) / count);
          positions.push(a.x, a.y, a.z, b.x, b.y, b.z);
          a = b;
        }
      }
    stroke.visible = positions.length > 0;
    if (stroke.visible) {
      stroke.geometry.dispose();
      stroke.geometry = new LineSegmentsGeometry().setPositions(positions);
    }
  }
  function setDocument(next, options = {}) {
    doc = next;
    selection = {
      selectedPoint: -1,
      selectedPoints: [],
      selectedProp: -1,
      section: null,
      rollRateSections: [],
      drawMode: false,
      problemPoint: null,
      problemPosition: null,
      problemSeverity: 'error',
      ...options,
    };
    selectedIndices = new Set(selection.selectedPoints);
    if (selection.selectedPoint >= 0)
      selectedIndices.add(selection.selectedPoint);
    drawing.setDocument(doc, selection);
    const key = JSON.stringify([
      doc.courseType,
      doc.points.map(({ x, y, z }) => [x, y, z]),
    ]);
    if (key !== curveKey && !dragging) {
      curveKey = key;
      curve = doc.points.length >= 3 ? routeCurve(doc) : null;
    }
    if (key !== pointKey) {
      pointKey = key;
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
    }
    const selections = Array.isArray(selection.section)
      ? selection.section
      : selection.section
        ? [selection.section]
        : [];
    const strokes = JSON.stringify([
      curveKey,
      selections,
      selection.rollRateSections,
    ]);
    if (strokes !== strokeKey) {
      strokeKey = strokes;
      updateStroke(span, selections);
      updateStroke(fastTwist, selection.rollRateSections);
    }
    // Don't leave a selected path at its previous location during a point move.
    if (dragging && key !== curveKey) span.visible = fastTwist.visible = false;
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
      const isSelected = selectedIndices.has(i);
      projected.push({ index: i, selected: isSelected, ...screen });
      const scale = screen.visible
        ? screen.units *
          (i === selection.selectedPoint
            ? 8
            : isSelected || (hover?.kind === 'point' && hover.index === i)
              ? 7
              : Math.max(
                  1.75,
                  Math.min(6, (doc.width ?? 40) / (5 * screen.units)),
                ))
        : 0;
      matrix.makeScale(scale, scale, scale).setPosition(p);
      dots.setMatrixAt(i, matrix);
      dots.setColorAt(
        i,
        i === selection.problemPoint
          ? warningAmber
          : isSelected
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
      problemHalo.material.color.copy(warningAmber);
      problemHalo.visible = problemProjection.visible;
      if (problemHalo.visible) {
        problemHalo.position.set(problem.x, problem.y, problem.z);
        problemHalo.quaternion.copy(camera.quaternion);
        problemHalo.scale.setScalar(problemProjection.units * 18);
      }
    }
    const selected = doc.points[selection.selectedPoint];
    const screen = projected[selection.selectedPoint];
    ring.visible = Boolean(selected && screen?.visible);
    const editable =
      ring.visible && !['pan', 'orbit', 'select'].includes(selection.tool);
    heightHandle.visible =
      heightStem.visible =
      bankHandle.visible =
      bankStem.visible =
        editable;
    heightScreen = bankScreen = null;
    if (ring.visible) {
      const position = new T.Vector3(selected.x, selected.y, selected.z);
      ring.position.copy(position);
      ring.quaternion.copy(camera.quaternion);
      ring.scale.setScalar(screen.units * 13);
    }
    if (editable) {
      const position = ring.position;
      const up = new T.Vector3(0, 1, 0).applyQuaternion(camera.quaternion),
        right = new T.Vector3(1, 0, 0).applyQuaternion(camera.quaternion);
      heightHandle.position
        .copy(position)
        .addScaledVector(up, screen.units * 56)
        .addScaledVector(right, screen.units * 24);
      heightHandle.quaternion.copy(camera.quaternion);
      heightHandle.scale.setScalar(screen.units * 6);
      updateStem(heightStem, position, heightHandle.position);
      heightScreen = projectEditorHandle(
        heightHandle.position,
        camera,
        width,
        height,
      );
      bankHandle.position
        .copy(position)
        .addScaledVector(up, screen.units * 30)
        .addScaledVector(right, -screen.units * 42);
      bankHandle.quaternion.copy(camera.quaternion);
      bankHandle.scale.setScalar(screen.units * 11);
      updateStem(bankStem, position, bankHandle.position);
      bankScreen = {
        ...projectEditorHandle(bankHandle.position, camera, width, height),
        roll: selected.roll ?? 0,
      };
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
        curveKey = pointKey = strokeKey = null;
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
      if (
        bankScreen?.visible &&
        Math.hypot(x - bankScreen.x, y - bankScreen.y) <= 13
      )
        return { kind: 'bank', index: selection.selectedPoint };
      // Keep the full pointer target when zoomed-out dots shrink to reveal the deck.
      let nearest = null;
      let best = Infinity;
      for (const point of projected) {
        if (!point.visible) continue;
        const radius = point.selected ? 8 : 6;
        const distance = (point.x - x) ** 2 + (point.y - y) ** 2;
        if (distance > radius ** 2) continue;
        if (
          distance < best ||
          (distance === best && point.units < nearest.units)
        ) {
          best = distance;
          nearest = point;
        }
      }
      if (nearest) return { kind: 'point', index: nearest.index };
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
      if (selectedIndices.size > 1) {
        const points = [...selectedIndices]
          .map((index) => this.point(index))
          .filter(Boolean);
        if (points.length)
          return new T.Box3().setFromPoints(points).expandByScalar(30);
      }
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
        bankHandle: bankScreen,
        twistSections: selection.rollRateSections,
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
