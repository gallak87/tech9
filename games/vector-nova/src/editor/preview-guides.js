import * as T from 'three';
import { createRouteSampler } from './route.js';

/** Owned, nonphysical authoring cues. Never included in a saved course. */
export function createPreviewGuides(scene, host) {
  const group = new T.Group();
  group.name = 'Workshop / route and proposed jump guides';
  scene.add(group);
  const labels = [];
  let key;
  let routeBuilds = 0;
  function clear() {
    group.traverse((node) => {
      node.geometry?.dispose();
      for (const material of [node.material].flat().filter(Boolean))
        material.dispose();
    });
    group.clear();
    labels.splice(0).forEach(({ element }) => element.remove());
  }
  function label(text, position, color = '#b8e9f1') {
    const element = document.createElement('span');
    element.className = 'workshop-route-guide';
    element.style.setProperty('--guide-color', color);
    element.textContent = text;
    element.hidden = true;
    host.append(element);
    labels.push({ element, position: new T.Vector3(...position) });
  }
  function line(points, color, ghostWidth = 0) {
    const vectors = points.map((point) => new T.Vector3(...point));
    if (vectors.length < 2) return;
    const material = new T.LineBasicMaterial({
      color,
      transparent: true,
      opacity: 0.9,
      depthTest: false,
      toneMapped: false,
    });
    const path = new T.Line(
      new T.BufferGeometry().setFromPoints(vectors),
      material,
    );
    path.renderOrder = 1100;
    group.add(path);
    if (!ghostWidth) return;
    const positions = [];
    const side = new T.Vector3();
    vectors.forEach((point, i) => {
      side
        .subVectors(
          vectors[Math.min(i + 1, vectors.length - 1)],
          vectors[Math.max(0, i - 1)],
        )
        .cross(new T.Vector3(0, 1, 0))
        .normalize()
        .multiplyScalar(ghostWidth / 2);
      positions.push(...point.clone().add(side), ...point.clone().sub(side));
    });
    const indices = [];
    for (let i = 0; i < vectors.length - 1; i++) {
      const a = i * 2;
      indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
    const geometry = new T.BufferGeometry();
    geometry.setAttribute(
      'position',
      new T.Float32BufferAttribute(positions, 3),
    );
    geometry.setIndex(indices);
    const mesh = new T.Mesh(
      geometry,
      new T.MeshBasicMaterial({
        color,
        transparent: true,
        opacity: 0.24,
        side: T.DoubleSide,
        depthTest: false,
        depthWrite: false,
        toneMapped: false,
      }),
    );
    mesh.renderOrder = 1090;
    group.add(mesh);
  }
  return {
    setData(data) {
      const nextKey = JSON.stringify(data);
      if (key === nextKey) return;
      key = nextKey;
      clear();
      const {
        document: doc,
        candidate,
        selectedJumpId,
        attempt,
        selectedPoint,
        problemPoint,
      } = data;
      const selected = doc?.points[selectedPoint];
      const currentJump = doc?.jumps?.find(
        (entry) => entry.id === selectedJumpId,
      );
      const selectedAnchor =
        selected &&
        [currentJump?.launchPointId, currentJump?.landingPointId].includes(
          selected.id,
        );
      if (doc?.points.length >= 4) {
        routeBuilds++;
        const sampler = createRouteSampler(doc);
        label('START →', sampler.positionAt(0).toArray(), '#9cdcc8');
        if (doc.courseType === 'downhill')
          label(
            'FINISH',
            sampler.positionAt(sampler.length - 600).toArray(),
            '#9cdcc8',
          );
        const jump = doc.jumps.find((entry) => entry.id === selectedJumpId);
        if (jump && !candidate) {
          label(
            selected?.id === jump.launchPointId
              ? `TAKEOFF · Point ${selectedPoint + 1}`
              : 'TAKEOFF',
            sampler.positionAt(jump.start * sampler.length).toArray(),
            '#ffd199',
          );
          label(
            selected?.id === jump.landingPointId
              ? `LANDING · Point ${selectedPoint + 1}`
              : 'LANDING',
            sampler.positionAt(jump.end * sampler.length).toArray(),
            '#a6e6c6',
          );
        }
      }
      if (
        selected &&
        !candidate &&
        !selectedAnchor &&
        selectedPoint !== problemPoint
      ) {
        const point = doc.points[selectedPoint];
        label(
          `Point ${selectedPoint + 1} · ${Math.round(point.y)} m`,
          [point.x, point.y, point.z],
          '#ffe1a2',
        );
      }
      if (candidate) {
        for (const section of candidate.sections ?? [])
          line(
            section.points,
            section.kind === 'gap' ? '#ffd199' : '#8ce4db',
            doc.width,
          );
        if (candidate.takeoff)
          label('PROPOSED TAKEOFF', candidate.takeoff, '#ffd199');
        if (candidate.landing)
          label('PROPOSED LANDING', candidate.landing, '#a6e6c6');
      }
      const miss = attempt?.lastAttempt?.miss;
      if (miss?.position)
        label(
          `LAST MISS · ${attempt.lastAttempt.reason ?? 'missed landing'}`,
          miss.position,
          '#ffaca2',
        );
    },
    getMetrics: () => ({ routeBuilds }),
    update(camera, width, height, hidden = false) {
      group.visible = !hidden;
      for (const { element, position } of labels) {
        const projected = position.clone().project(camera);
        const visible =
          !hidden &&
          projected.z >= -1 &&
          projected.z < 1 &&
          Math.abs(projected.x) < 1 &&
          Math.abs(projected.y) < 1;
        element.hidden = !visible;
        if (!visible) continue;
        element.style.left = `${Math.max(4, Math.min(width - 180, ((projected.x + 1) * width) / 2 + 9))}px`;
        element.style.top = `${Math.max(4, Math.min(height - 28, ((1 - projected.y) * height) / 2 + 12))}px`;
      }
    },
    dispose() {
      clear();
      group.removeFromParent();
    },
  };
}
