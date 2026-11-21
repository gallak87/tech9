import * as T from 'three';
import { deviceCSSColor } from '../pickups/theme.js';
import { routeCurve } from './route.js';
import { DOWNHILL_RUNOUT } from './document.js';

const W = 1000;
const H = 680;
const number = (value) => Number(value.toFixed(2));
export function createRouteMap(
  svg,
  { onSelect, onAdd, onDrag, onDragEnd, onDragCancel = () => {} },
) {
  let document;
  let selection = -1;
  let problem = null;
  let problemSeverity = 'error';
  let selectedSection = null;
  let trajectories = [];
  let inspectedJump = null;
  let tool = 'move';
  let bounds;
  let drag;
  let suppressClick = false;
  const life = new AbortController();
  function fit() {
    const points = document.points;
    let minX = -400,
      maxX = 400,
      minZ = -272,
      maxZ = 272;
    if (points.length) {
      minX = Math.min(...points.map((p) => p.x));
      maxX = Math.max(...points.map((p) => p.x));
      minZ = Math.min(...points.map((p) => p.z));
      maxZ = Math.max(...points.map((p) => p.z));
      const padding = Math.max(
        160,
        Math.max(maxX - minX, ((maxZ - minZ) * W) / H) * 0.055,
      );
      minX -= padding;
      maxX += padding;
      minZ -= padding;
      maxZ += padding;
    }
    const centerX = (minX + maxX) / 2,
      centerZ = (minZ + maxZ) / 2;
    const width = Math.max(800, maxX - minX, ((maxZ - minZ) * W) / H);
    bounds = {
      minX: centerX - width / 2,
      minZ: centerZ - (width * H) / W / 2,
      scale: W / width,
    };
  }
  function project(p) {
    return [
      number((p.x - bounds.minX) * bounds.scale),
      number((p.z - bounds.minZ) * bounds.scale),
    ];
  }
  function mapPosition(event) {
    const matrix = svg.getScreenCTM();
    return matrix
      ? new DOMPoint(event.clientX, event.clientY).matrixTransform(
          matrix.inverse(),
        )
      : null;
  }
  function screenPoint(event) {
    const p = mapPosition(event);
    if (!p || !bounds) return null;
    return {
      x:
        Math.round(
          T.MathUtils.clamp(p.x / bounds.scale + bounds.minX, -25000, 25000) /
            5,
        ) * 5,
      z:
        Math.round(
          T.MathUtils.clamp(p.y / bounds.scale + bounds.minZ, -25000, 25000) /
            5,
        ) * 5,
    };
  }
  function render() {
    if (!document) return;
    if (!bounds) fit();
    const points = document.points;
    const closed = document.courseType !== 'downhill';
    const curve = points.length >= 3 ? routeCurve(document) : null;
    const gaps = [...(document.jumps ?? [])].sort((a, b) => a.start - b.start);
    const pathFor = (
      start,
      end,
      samples = Math.max(2, Math.ceil((end - start) * 300)),
    ) =>
      Array.from(
        { length: samples + 1 },
        (_, i) =>
          `${i ? 'L' : 'M'}${project(curve.getPointAt(start + ((end - start) * i) / samples)).join(',')}`,
      ).join(' ');
    let cursor = 0;
    const runs = [];
    for (const gap of gaps) {
      if (gap.start > cursor) runs.push([cursor, gap.start]);
      cursor = Math.max(cursor, gap.end);
    }
    if (cursor < 1) runs.push([cursor, 1]);
    const path = curve
      ? runs.map(([start, end]) => pathFor(start, end)).join(' ')
      : points
          .map((p, i) => `${i ? 'L' : 'M'}${project(p).join(',')}`)
          .join(' ');
    const ghost =
      curve && gaps.length
        ? gaps
            .map(
              (gap) =>
                `<path d="${pathFor(gap.start, gap.end)}" class="workshop-map-gap-guide"/>`,
            )
            .join('')
        : '';
    const sectionPath =
      curve && selectedSection
        ? pathFor(selectedSection.start, selectedSection.end)
        : '';
    const arcs = curve?.getLengths();
    const fractionAt = (t) => {
      const value = t * (arcs.length - 1),
        lower = Math.floor(value);
      return (
        T.MathUtils.lerp(
          arcs[lower],
          arcs[Math.min(lower + 1, arcs.length - 1)],
          value - lower,
        ) / arcs.at(-1)
      );
    };
    const isGap = (at) =>
      gaps.some((gap) => at > gap.start + 1e-6 && at < gap.end - 1e-6);
    const edges = closed ? points.length : points.length - 1;
    const rollSections = curve
      ? points
          .slice(0, edges)
          .map((point, i) => {
            const next = points[(i + 1) % points.length];
            if (
              Math.abs(point.roll ?? 0) < 0.001 &&
              Math.abs(next.roll ?? 0) < 0.001
            )
              return '';
            let pen = false;
            const segment = Array.from({ length: 25 }, (_, j) => {
              const t = (i + j / 24) / edges;
              if (isGap(fractionAt(t))) {
                pen = false;
                return '';
              }
              const command = `${pen ? 'L' : 'M'}${project(curve.getPoint(t)).join(',')}`;
              pen = true;
              return command;
            }).join(' ');
            return `<path d="${segment}" class="workshop-map-roll" stroke-width="${Math.max(3, document.width * bounds.scale * 0.42)}"><title>Rolled road section</title></path>`;
          })
          .join('')
      : '';
    const pickups = curve
      ? (document.pickups?.devices ?? [])
          .map((pickup) => {
            const progress = closed && pickup.at === 1 ? 0 : pickup.at;
            const at = curve.getPointAt(progress),
              tangent = curve.getTangentAt(progress);
            const side = pickup.lane * (document.width / 2 - 6);
            at.x += tangent.z * side;
            at.z -= tangent.x * side;
            const [x, y] = project(at),
              angle = (Math.atan2(tangent.x, tangent.z) * -180) / Math.PI;
            return `<g class="workshop-map-pickup" transform="translate(${x} ${y}) rotate(${number(angle)})" data-map-pickup="${pickup.type}"><rect x="-6" y="-3" width="12" height="6" fill="${deviceCSSColor(pickup.type)}"/><path d="M -3 0 L 0 -3 3 0"/><title>${pickup.type === 'vector' ? 'Vector boost' : pickup.type[0].toUpperCase() + pickup.type.slice(1)} gate</title></g>`;
          })
          .join('')
      : '';
    const spacing = bounds.scale * 100;
    const gridX =
      (((-bounds.minX * bounds.scale) % spacing) + spacing) % spacing;
    const gridY =
      (((-bounds.minZ * bounds.scale) % spacing) + spacing) % spacing;
    const gridId = svg.id + '-grid';
    const props = curve
      ? document.props
          .map((p, i) => {
            const at = curve.getPointAt(p.distance),
              tangent = curve.getTangentAt(p.distance);
            at.x += tangent.z * p.lateral;
            at.z -= tangent.x * p.lateral;
            const [x, y] = project(at);
            return `<path d="M ${x} ${y - 7} l 7 7 -7 7 -7 -7 Z" class="workshop-map-prop"><title>Scenery ${i + 1}</title></path>`;
          })
          .join('')
      : '';
    let finishMarker = '';
    if (curve && !closed && curve.getLength() > DOWNHILL_RUNOUT) {
      const finish = project(
        curve.getPointAt(
          (curve.getLength() - DOWNHILL_RUNOUT) / curve.getLength(),
        ),
      );
      finishMarker = `<g class="workshop-map-finish" data-map-finish><path d="M ${finish[0] - 11} ${finish[1] - 11} L ${finish[0] + 11} ${finish[1] + 11} M ${finish[0] - 11} ${finish[1] + 11} L ${finish[0] + 11} ${finish[1] - 11}"/><text x="${finish[0] + 18}" y="${finish[1] - 18}">FINISH</text></g>`;
    }
    const gapMarkers = curve
      ? gaps
          .map((gap, i) => {
            const launch = project(curve.getPointAt(gap.start)),
              landing = project(curve.getPointAt(gap.end));
            const mid = project(curve.getPointAt((gap.start + gap.end) / 2));
            return `<g data-map-gap="${gap.id}" class="workshop-map-gap ${gap.id === inspectedJump ? 'selected' : ''}"><circle cx="${launch[0]}" cy="${launch[1]}" r="19"/><circle cx="${landing[0]}" cy="${landing[1]}" r="19"/><text x="${mid[0] + 15}" y="${mid[1]}">GAP ${i + 1}</text></g>`;
          })
          .join('')
      : '';
    const flightPaths = trajectories
      .map((flight) => {
        const stride = Math.max(1, Math.ceil(flight.points.length / 180));
        const samples = flight.points.filter(
          (p, i) => i % stride === 0 || i === flight.points.length - 1,
        );
        const path = samples
          .map(
            (p, i) =>
              `${i ? 'L' : 'M'}${project({ x: p[0], z: p[2] }).join(',')}`,
          )
          .join(' ');
        return `<path data-map-flight="${flight.id}" d="${path}" class="workshop-map-flight" stroke="${flight.color}"/>`;
      })
      .join('');
    svg.innerHTML = `<defs><pattern id="${gridId}" x="${gridX}" y="${gridY}" width="${spacing}" height="${spacing}" patternUnits="userSpaceOnUse"><path d="M ${spacing} 0 L 0 0 0 ${spacing}" fill="none" stroke="#34414a" stroke-width="1"/></pattern></defs><rect width="${W}" height="${H}" fill="#10191f"/><rect width="${W}" height="${H}" fill="url(#${gridId})"/>${ghost}<path d="${sectionPath}" class="workshop-map-section" stroke-width="${Math.max(9, document.width * bounds.scale + 6)}"/><path d="${path}" fill="none" stroke="#71858b" stroke-width="${Math.max(5, document.width * bounds.scale)}" stroke-linejoin="round"/><path d="${path}" fill="none" stroke="#b2cbd0" stroke-width="1.5" stroke-dasharray="7 8"/>${rollSections}${props}${pickups}${gapMarkers}${flightPaths}${finishMarker}${points
      .map((p, i) => {
        const [x, y] = project(p),
          roll = Math.round(((p.roll ?? 0) * 180) / Math.PI);
        const rollLabel =
          roll && i === selection
            ? `<text class="workshop-map-angle" x="20" y="22">ROLL ${roll}°</text>`
            : '';
        const tag =
          i === 0
            ? closed
              ? 'START / FINISH'
              : 'START'
            : !closed && i === points.length - 1
              ? 'RUNOUT END'
              : '';
        return `<g data-map-point="${i}" class="workshop-map-point ${i === selection ? 'selected' : ''} ${i === problem ? (problemSeverity === 'warning' ? 'problem problem-warning' : 'problem') : ''}" transform="translate(${x} ${y})"><circle r="${i === selection ? 16 : 12}"/><text text-anchor="middle" dominant-baseline="central">${i + 1}</text>${tag ? `<text class="workshop-map-start" x="21" y="-19">${tag}</text>` : ''}${rollLabel}</g>`;
      })
      .join(
        '',
      )}<text x="24" y="647" class="workshop-map-scale">GRID 100 m · NORTH ↑</text>${trajectories.length ? '<text x="24" y="605" class="workshop-map-cruise-key">CYAN / CRUISE</text><text x="24" y="625" class="workshop-map-boost-key">AMBER / BOOST</text>' : points.some((p) => Math.abs(p.roll ?? 0) > 0.001) ? '<text x="24" y="625" class="workshop-map-roll-key">VIOLET / ROLLED ROAD</text>' : ''}`;
  }
  const selectionMeta = (event) => ({
    preserveTool: true,
    extendRange: Boolean(event.shiftKey),
    shiftKey: Boolean(event.shiftKey),
  });
  function release(pointerId) {
    if (svg.hasPointerCapture?.(pointerId))
      svg.releasePointerCapture(pointerId);
  }
  function finish(cancel = false, event = null) {
    if (!drag || (event && event.pointerId !== drag.pointerId)) return;
    const gesture = drag;
    drag = null;
    suppressClick = true;
    if (gesture.kind === 'pan') {
      if (cancel && gesture.moved) {
        bounds = gesture.bounds;
        render();
      }
    } else if (gesture.moved && ['move', 'height'].includes(gesture.kind)) {
      if (cancel) onDragCancel();
      else onDragEnd();
    } else if (!cancel && !gesture.moved) {
      if (gesture.finishDrawing)
        onSelect(gesture.index, { ...gesture.meta, finishDrawing: true });
      else if (gesture.kind === 'draw' && document.points.length < 256) {
        const point = screenPoint(event ?? gesture.event);
        if (point) onAdd(point, { preserveTool: true });
      } else if (gesture.kind === 'empty') onSelect(-1, gesture.meta);
    }
    release(gesture.pointerId);
  }
  svg.addEventListener(
    'pointerdown',
    (event) => {
      if (event.button !== 0 || !bounds || drag || tool === 'orbit') return;
      const origin = mapPosition(event);
      if (!origin) return;
      suppressClick = false;
      const node = event.target.closest('[data-map-point]');
      const index = node ? Number(node.dataset.mapPoint) : -1;
      const meta = selectionMeta(event);
      const kind =
        tool === 'pan'
          ? 'pan'
          : index >= 0
            ? tool === 'select'
              ? 'select'
              : tool === 'height' || event.shiftKey
                ? 'height'
                : 'move'
            : tool === 'draw'
              ? 'draw'
              : 'empty';
      drag = {
        kind,
        index,
        meta,
        pointerId: event.pointerId,
        moved: false,
        x: event.clientX,
        y: event.clientY,
        origin,
        event,
        bounds: { ...bounds },
        height: document.points[index]?.y ?? 52,
        finishDrawing:
          tool === 'draw' &&
          index === 0 &&
          document.points.length >= 4 &&
          document.courseType !== 'downhill' &&
          !event.shiftKey,
      };
      svg.setPointerCapture(event.pointerId);
      event.preventDefault();
      if (index >= 0 && kind !== 'pan' && !drag.finishDrawing)
        onSelect(index, meta);
    },
    { signal: life.signal },
  );
  svg.addEventListener(
    'pointermove',
    (event) => {
      if (!drag || event.pointerId !== drag.pointerId) return;
      if (
        !drag.moved &&
        Math.hypot(event.clientX - drag.x, event.clientY - drag.y) < 3
      )
        return;
      const p = mapPosition(event);
      if (!p) return;
      if (!drag.moved && drag.finishDrawing) {
        drag.finishDrawing = false;
        onSelect(drag.index, drag.meta);
      }
      drag.moved = true;
      event.preventDefault();
      if (drag.kind === 'pan') {
        bounds = {
          ...drag.bounds,
          minX: drag.bounds.minX - (p.x - drag.origin.x) / drag.bounds.scale,
          minZ: drag.bounds.minZ - (p.y - drag.origin.y) / drag.bounds.scale,
        };
        render();
      } else if (drag.kind === 'height') {
        const y =
          Math.round(
            T.MathUtils.clamp(
              drag.height - (p.y - drag.origin.y) / drag.bounds.scale,
              0,
              3000,
            ) / 5,
          ) * 5;
        onDrag(drag.index, { y }, { preserveTool: true });
      } else if (drag.kind === 'move') {
        const point = screenPoint(event);
        if (point) onDrag(drag.index, point, { preserveTool: true });
      }
    },
    { signal: life.signal },
  );
  svg.addEventListener('pointerup', (event) => finish(false, event), {
    signal: life.signal,
  });
  for (const type of ['pointercancel', 'lostpointercapture'])
    svg.addEventListener(type, (event) => finish(true, event), {
      signal: life.signal,
    });
  svg.addEventListener(
    'click',
    (event) => {
      if (suppressClick) {
        suppressClick = false;
        return;
      }
      if (
        !document ||
        event.target.closest('[data-map-point]') ||
        document.points.length >= 256 ||
        tool !== 'draw'
      )
        return;
      const point = screenPoint(event);
      if (point) onAdd(point, { preserveTool: true });
    },
    { signal: life.signal },
  );
  const view = svg.ownerDocument?.defaultView;
  view?.addEventListener(
    'keydown',
    (event) => {
      if (event.key !== 'Escape' || !drag) return;
      event.preventDefault();
      event.stopPropagation();
      finish(true);
    },
    { capture: true, signal: life.signal },
  );
  view?.addEventListener('blur', () => finish(true), { signal: life.signal });
  return {
    cancelInteraction: () => finish(true),
    setDocument(
      next,
      selected,
      {
        frame = false,
        section = null,
        trajectories: flights = [],
        selectedJumpId = null,
        problemPoint = null,
        problemSeverity: severity = 'error',
        drawMode: drawing = false,
        tool: requestedTool,
      } = {},
    ) {
      document = next;
      selection = selected;
      problem = problemPoint;
      problemSeverity = severity;
      selectedSection = section;
      trajectories = flights;
      inspectedJump = selectedJumpId;
      const nextTool = [
        'select',
        'draw',
        'move',
        'height',
        'orbit',
        'pan',
      ].includes(requestedTool)
        ? requestedTool
        : drawing
          ? 'draw'
          : 'move';
      const changedTool = nextTool !== tool;
      tool = nextTool;
      svg.dataset.editorTool = tool;
      if (changedTool && drag) finish(true);
      if (frame && !drag) bounds = null;
      render();
    },
    fit() {
      if (drag) finish(true);
      bounds = null;
      render();
    },
    pan(x, y) {
      if (drag) finish(true);
      if (!bounds) fit();
      bounds = {
        ...bounds,
        minX: bounds.minX + ((x * W) / bounds.scale) * 0.12,
        minZ: bounds.minZ - ((y * H) / bounds.scale) * 0.12,
      };
      render();
    },
    dispose() {
      if (drag) finish(true);
      life.abort();
      svg.replaceChildren();
    },
  };
}
