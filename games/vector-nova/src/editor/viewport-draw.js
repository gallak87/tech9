import * as T from 'three';

const vector = (point) => new T.Vector3(point.x, point.y, point.z);

/** Bounded, non-pickable guidance; pointer motion never constructs a world. */
export function createEditorDrawGuide(parent, project) {
  const group = new T.Group();
  group.name = 'Workshop / 100 metre drawing grid';
  parent.add(group);
  const grid = new T.GridHelper(3000, 30, '#c2e2eb', '#85adbd');
  grid.material.transparent = true;
  grid.material.opacity = 0.16;
  grid.material.depthTest = grid.material.depthWrite = false;
  grid.material.fog = false;
  grid.material.toneMapped = false;
  grid.renderOrder = 1800;
  group.add(grid);
  function line(name, color, dashed = false) {
    const geometry = new T.BufferGeometry();
    geometry.setAttribute(
      'position',
      new T.BufferAttribute(new Float32Array(6), 3),
    );
    geometry.setAttribute(
      'lineDistance',
      new T.BufferAttribute(new Float32Array(2), 1),
    );
    const options = {
      color,
      transparent: true,
      opacity: 0.9,
      depthTest: false,
      depthWrite: false,
      toneMapped: false,
      fog: false,
    };
    const material = dashed
      ? new T.LineDashedMaterial({ ...options, dashSize: 18, gapSize: 10 })
      : new T.LineBasicMaterial(options);
    const result = new T.Line(geometry, material);
    result.name = name;
    result.frustumCulled = false;
    result.renderOrder = 1801;
    group.add(result);
    return result;
  }
  const continuation = line('Next road segment', '#a8e6ff', true);
  const closing = line('Circuit joins its start', '#ffcf79', true);
  const widthGuide = line('Next road width', '#a8e6ff');
  const xAxis = line('Drawing grid X / 100 metres', '#ffcf79');
  const zAxis = line('Drawing grid Z / 100 metres', '#b9def0');
  const cursor = new T.Mesh(
    new T.SphereGeometry(1, 12, 8),
    new T.MeshBasicMaterial({
      color: '#a8e6ff',
      transparent: true,
      opacity: 0.68,
      depthTest: false,
      depthWrite: false,
      toneMapped: false,
      fog: false,
    }),
  );
  cursor.name = 'Next road point';
  cursor.renderOrder = 1802;
  group.add(cursor);
  let doc,
    selection = {},
    position = null,
    nearStart = false,
    state = null;
  function setLine(target, a, b) {
    const attr = target.geometry.getAttribute('position');
    attr.setXYZ(0, a.x, a.y, a.z);
    attr.setXYZ(1, b.x, b.y, b.z);
    attr.needsUpdate = true;
    const distance = target.geometry.getAttribute('lineDistance');
    distance.setX(1, a.distanceTo(b));
    distance.needsUpdate = true;
  }
  return {
    setDocument(next, options) {
      doc = next;
      selection = options;
      if (!selection.drawMode) position = null;
    },
    setCursor(next, { closing = false } = {}) {
      const changed =
        Boolean(position) !== Boolean(next) ||
        (position &&
          next &&
          (position.x !== next.x ||
            position.y !== next.y ||
            position.z !== next.z)) ||
        nearStart !== closing;
      position = next ? vector(next) : null;
      nearStart = closing;
      return Boolean(changed);
    },
    update(camera, width, height, visible) {
      group.visible = Boolean(visible && selection.drawMode && doc);
      if (!group.visible) {
        state = null;
        return;
      }
      const points = doc.points;
      const selected = points[selection.selectedPoint] ?? points.at(-1);
      const origin = selected ? vector(selected) : new T.Vector3(0, 52, 0);
      const planeHeight = origin.y;
      grid.position.set(
        Math.round(origin.x / 500) * 500,
        planeHeight + 0.04,
        Math.round(origin.z / 500) * 500,
      );
      setLine(xAxis, origin, origin.clone().add(new T.Vector3(100, 0, 0)));
      setLine(zAxis, origin, origin.clone().add(new T.Vector3(0, 0, 100)));
      const xLabel = project(
        origin.clone().add(new T.Vector3(110, 0, 0)),
        camera,
        width,
        height,
      );
      const zLabel = project(
        origin.clone().add(new T.Vector3(0, 0, 110)),
        camera,
        width,
        height,
      );
      const point = position?.clone();
      const canClose = doc.courseType !== 'downhill' && points.length >= 4;
      if (point && !(nearStart && canClose)) point.y = planeHeight;
      const at = point ? project(point, camera, width, height) : null;
      cursor.visible = Boolean(at?.visible);
      continuation.visible = Boolean(cursor.visible && selected && !nearStart);
      widthGuide.visible = Boolean(cursor.visible && !nearStart);
      closing.visible = false;
      if (cursor.visible) {
        cursor.position.copy(point);
        cursor.scale.setScalar(at.units * (nearStart ? 11 : 7));
        cursor.material.color.set(nearStart ? '#ffcf79' : '#a8e6ff');
        if (selected) setLine(continuation, origin, point);
        const next =
          points[selection.selectedPoint + 1] ??
          (doc.courseType !== 'downhill' && points.length >= 3
            ? points[0]
            : null);
        if (next && !nearStart) {
          closing.visible = true;
          setLine(closing, point, vector(next));
        }
        const tangent = point.clone().sub(origin);
        tangent.y = 0;
        if (tangent.lengthSq() < 1) tangent.set(0, 0, 1);
        const across = new T.Vector3(-tangent.z, 0, tangent.x)
          .normalize()
          .multiplyScalar((doc.width ?? 40) / 2);
        setLine(
          widthGuide,
          point.clone().add(across),
          point.clone().sub(across),
        );
      }
      state = {
        visible: true,
        spacing: 100,
        planeHeight,
        cursor: at?.visible ? { ...at, world: point.toArray() } : null,
        closing: Boolean(cursor.visible && nearStart && canClose),
        joinsStart: Boolean(
          closing.visible && !points[selection.selectedPoint + 1],
        ),
        xLabel,
        zLabel,
      };
    },
    getState: () => state,
  };
}
