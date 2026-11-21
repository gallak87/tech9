import * as T from 'three';
import {
  dragPointRoll,
  pointSelectionModifiers,
  signedPointRoll,
} from './point-gestures.js';
import { deviceCSSColor } from '../pickups/theme.js';
import { routeCurve } from './route.js';
import { DOWNHILL_RUNOUT } from './document.js';

const W = 1000;
const H = 680;
const number = (value) => Number(value.toFixed(2));
export function createRouteMap(
  svg,
  {
    onSelect,
    onAdd,
    onDrag,
    onDragEnd,
    onDragCancel = () => {},
    onBankDrag,
    onBankDragEnd,
    onBankDragCancel,
  },
) {
  let document;
  let selection = -1;
  let selectedIndices = new Set();
  let rollRateSections = [];
  let curveKey;
  let curve;
  let previewCurve = null;
  let usingPreviewCurve = false;
  let problem = null;
  let problemSeverity = 'error';
  let selectedSection = null;
  let trajectories = [];
  let inspectedJump = null;
  let tool = 'move';
  let bounds;
  let drag;
  let suppressClick = false;
  let visible = true;
  let hovered = -1;
  let projectedPoints = [];
  let layoutKey = '';
  let sceneryKey = '';
  let scenery;
  const life = new AbortController();
  // Transforming one point leaves most SVG markup unchanged. Keep the road,
  // selection, hit targets, and grips mounted independently during a scrubbing gesture.
  function layer() {
    const group = svg.ownerDocument.createElementNS(
      'http://www.w3.org/2000/svg',
      'g',
    );
    svg.append(group);
    let previous = '';
    return (markup) => {
      if (markup === previous) return;
      group.innerHTML = markup;
      previous = markup;
    };
  }
  const roadLayer = layer();
  const sectionLayer = layer();
  const warningLayer = layer();
  const markerLayer = layer();
  const gripLayer = layer();
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
  function screenScale() {
    return Math.max(0.001, Math.abs(svg.getScreenCTM()?.a || 1));
  }
  function renderHandles(point) {
    if (!point || !['draw', 'move', 'height'].includes(tool)) return '';
    const [x, y] = project(point);
    if (x < 0 || x > W || y < 0 || y > H) return '';
    const gold = '#ffcf79',
      blue = '#82e5ff';
    // Keep the same physical hit target and text size at each map dialog size.
    const viewScale = Math.min(3, Math.max(1, 1 / screenScale()));
    const side = x > W - 150 * viewScale ? -1 : 1;
    const vertical = y < 90 * viewScale ? 1 : -1;
    const height = [side * 26, vertical * 52];
    const bank = [x < 150 * viewScale ? 38 : -38, vertical * 19];
    const label = ([x, y], text, color, side) => {
      const offset = side > 0 ? 15 : -91;
      return `<g transform="translate(${x + offset} ${y})" pointer-events="none"><rect x="0" y="-10" width="76" height="20" rx="3" fill="#12202b" stroke="${color}"/><text x="38" y="0" text-anchor="middle" dominant-baseline="central" fill="${color}" font-size="12" font-family="system-ui,sans-serif">${text}</text></g>`;
    };
    const hit = (kind, offset, cursor, graphic, description) =>
      `<g data-map-handle="${kind}" transform="translate(${offset[0]} ${offset[1]})" style="cursor:${cursor}"><circle r="15" fill="transparent"/>${graphic}<title>${description}</title></g>`;
    return `<g transform="translate(${x} ${y}) scale(${viewScale})" data-map-gizmos>
      <path d="M0,0L${height.join(',')}" stroke="${gold}" stroke-width="1.5" pointer-events="none"/>
      <path d="M0,0L${bank.join(',')}" stroke="${blue}" stroke-width="1.5" pointer-events="none"/>
      ${hit('height', height, 'ns-resize', `<path d="M0,-10 L-7,6 H7 Z" fill="${gold}"/>`, 'Drag up or down to change height. Hold Alt for finer control.')}
      ${hit('bank', bank, 'ew-resize', `<path d="M6,-7 A9,9 0 1 0 8,4" fill="none" stroke="${blue}" stroke-width="3.5"/><circle cx="6" cy="-7" r="3" fill="${blue}"/>`, 'Drag left or right to roll. Hold Alt for finer control.')}
      ${label(height, `Height ${Math.round(point.y)} m`, gold, side)}
      ${label(bank, `Roll ${signedPointRoll(point.roll)}`, blue, Math.sign(bank[0]))}
    </g>`;
  }
  const lineFor = (
    start,
    end,
    samples = Math.max(2, Math.ceil((end - start) * 300)),
  ) =>
    Array.from(
      { length: samples + 1 },
      (_, i) =>
        `${i ? 'L' : 'M'}${project(curve.getPointAt(start + ((end - start) * i) / samples)).join(',')}`,
    ).join(' ');

  function renderScenery(closed) {
    const points = document.points;
    const key = JSON.stringify([
      curveKey,
      bounds,
      points.map(({ roll }) => Math.abs(roll ?? 0) >= 0.001),
      document.width,
      document.jumps,
      document.pickups,
      document.props,
      inspectedJump,
      trajectories,
    ]);
    if (key === sceneryKey) return scenery;
    sceneryKey = key;
    const gaps = [...(document.jumps ?? [])].sort((a, b) => a.start - b.start);
    let cursor = 0;
    const runs = [];
    for (const gap of gaps) {
      if (gap.start > cursor) runs.push([cursor, gap.start]);
      cursor = Math.max(cursor, gap.end);
    }
    if (cursor < 1) runs.push([cursor, 1]);
    const path = curve
      ? runs.map(([start, end]) => lineFor(start, end)).join(' ')
      : points
          .map((p, i) => `${i ? 'L' : 'M'}${project(p).join(',')}`)
          .join(' ');
    const ghost =
      curve && gaps.length
        ? gaps
            .map(
              (gap) =>
                `<path d="${lineFor(gap.start, gap.end)}" class="workshop-map-gap-guide"/>`,
            )
            .join('')
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
    const markup = `<defs><pattern id="${gridId}" x="${gridX}" y="${gridY}" width="${spacing}" height="${spacing}" patternUnits="userSpaceOnUse"><path d="M ${spacing} 0 L 0 0 0 ${spacing}" fill="none" stroke="#34414a" stroke-width="1"/></pattern></defs><rect width="${W}" height="${H}" fill="#10191f"/><rect width="${W}" height="${H}" fill="url(#${gridId})"/>${ghost}<path d="${path}" fill="none" stroke="#71858b" stroke-width="${Math.max(5, document.width * bounds.scale)}" stroke-linejoin="round"/><path d="${path}" fill="none" stroke="#b2cbd0" stroke-width="1.5" stroke-dasharray="7 8"/>${rollSections}${props}${pickups}${gapMarkers}${flightPaths}${finishMarker}<text x="24" y="647" class="workshop-map-scale">GRID 100 m · NORTH ↑</text>${trajectories.length ? '<text x="24" y="605" class="workshop-map-cruise-key">CYAN / CRUISE</text><text x="24" y="625" class="workshop-map-boost-key">AMBER / BOOST</text>' : points.some((p) => Math.abs(p.roll ?? 0) > 0.001) ? '<text x="24" y="625" class="workshop-map-roll-key">VIOLET / ROLLED ROAD</text>' : ''}`;
    scenery = { markup, runs };
    return scenery;
  }

  function updateMarkerLayout(scale) {
    const key = JSON.stringify([curveKey, bounds, scale]);
    if (key === layoutKey) return;
    layoutKey = key;
    const points = document.points.map(project);
    projectedPoints = points.map(([x, y], index) => {
      let clearance = Infinity;
      for (let i = 0; i < points.length; i++) {
        if (i === index) continue;
        const [otherX, otherY] = points[i];
        clearance = Math.min(clearance, (x - otherX) ** 2 + (y - otherY) ** 2);
      }
      return { x, y, index, clearance: Math.sqrt(clearance) * scale };
    });
  }

  function renderMarkers(closed, scale) {
    const points = projectedPoints;
    const active = points[selection];
    const over = points[hovered];
    const numbered = new Set();
    const reserved = [
      active,
      over,
      points[0],
      !closed ? points.at(-1) : null,
    ].filter(Boolean);
    const spacing = 36 / scale;
    const stride = Math.max(1, Math.ceil(points.length / 12));
    for (const point of points) {
      const { index, x, y, clearance } = point;
      if (
        index === selection ||
        index === hovered ||
        index === 0 ||
        (!closed && index === points.length - 1)
      )
        continue;
      if (x < 0 || x > W || y < 0 || y > H) continue;
      if (clearance < 28 && index % stride !== 0) continue;
      if (
        reserved.some(
          ({ x: otherX, y: otherY }) =>
            Math.hypot(x - otherX, y - otherY) < spacing,
        )
      )
        continue;
      numbered.add(index);
      reserved.push(point);
    }
    const marker = ({ x, y, index, clearance }) => {
      const current = index === selection;
      const hover = index === hovered;
      const picked = selectedIndices.has(index);
      const issue = index === problem;
      const tag =
        index === 0
          ? closed
            ? 'START / FINISH'
            : 'START'
          : !closed && index === points.length - 1
            ? 'RUNOUT END'
            : '';
      const badge = current || hover || numbered.has(index);
      const radius =
        (current
          ? 11
          : hover
            ? 10
            : badge
              ? 7.5
              : picked || tag || issue
                ? 4.5
                : clearance < 15
                  ? 2.15
                  : 3.1) / scale;
      const variant = badge ? 'badge' : 'dot';
      const label = badge
        ? `<text text-anchor="middle" dominant-baseline="central" style="font-size:${(current || hover ? 11 : 9) / scale}px">${index + 1}</text>`
        : '';
      const tagInward = x > W - 100 / scale;
      const landmark = tag
        ? `<text class="workshop-map-start" x="${(tagInward ? -15 : 15) / scale}" y="${-14 / scale}" style="font-size:${9 / scale}px;text-anchor:${tagInward ? 'end' : 'start'}">${tag}</text>`
        : '';
      return `<g data-map-point="${index}" class="workshop-map-point ${picked ? 'selected' : ''} ${issue ? (problemSeverity === 'warning' ? 'problem problem-warning' : 'problem') : ''}" data-map-marker="${variant}" transform="translate(${x} ${y})"><circle r="${radius}"/>${label}${landmark}<title>Point ${index + 1}</title></g>`;
    };
    return points
      .filter(({ index }) => index !== hovered && index !== selection)
      .concat(over && over !== active ? [over] : [], active ? [active] : [])
      .map(marker)
      .join('');
  }

  function render() {
    if (!document || !visible) return;
    if (!bounds) fit();
    const points = document.points;
    const closed = document.courseType !== 'downhill';
    const key = JSON.stringify([
      closed,
      points.map(({ x, y, z }) => [x, y, z]),
    ]);
    if (key !== curveKey || usingPreviewCurve !== Boolean(previewCurve)) {
      curveKey = key;
      curve =
        previewCurve ?? (points.length >= 3 ? routeCurve(document) : null);
      usingPreviewCurve = Boolean(previewCurve);
      sceneryKey = '';
    }
    const scale = screenScale();
    updateMarkerLayout(scale);
    const twistSegments = curve
      ? rollRateSections
          .map(
            ({ start, end }) =>
              `<path d="${lineFor(start, end)}" fill="none" stroke="#ff6864" stroke-width="5" stroke-linecap="round" pointer-events="none"><title>Fast twist</title></path>`,
          )
          .join('')
      : '';
    const { markup, runs } = renderScenery(closed);
    const sectionPath =
      curve && selectedSection
        ? runs
            .map(([start, end]) => {
              const from = Math.max(start, selectedSection.start);
              const to = Math.min(end, selectedSection.end);
              return from < to ? lineFor(from, to) : '';
            })
            .join(' ')
        : '';
    const selectedRoad = sectionPath
      ? `<path d="${sectionPath}" class="workshop-map-section" stroke-width="${5 / scale}"/>`
      : '';
    roadLayer(markup);
    sectionLayer(selectedRoad);
    warningLayer(twistSegments);
    markerLayer(renderMarkers(closed, scale));
    gripLayer(renderHandles(points[selection]));
  }

  function nearestPoint(position, pointerType) {
    const radius = (pointerType === 'touch' ? 20 : 10) / screenScale();
    let nearest = -1;
    let best = radius ** 2;
    for (const { index, x, y } of projectedPoints) {
      const distance = (position.x - x) ** 2 + (position.y - y) ** 2;
      if (distance < best || (distance === best && index === selection)) {
        nearest = index;
        best = distance;
      }
    }
    return nearest;
  }
  const selectionMeta = (event) => ({
    preserveTool: true,
    ...pointSelectionModifiers(event),
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
    } else if (gesture.moved && gesture.kind === 'bank') {
      if (cancel) onBankDragCancel?.();
      else onBankDragEnd?.();
    } else if (gesture.moved && ['move', 'height'].includes(gesture.kind)) {
      if (cancel) onDragCancel();
      else onDragEnd();
    } else if (!cancel && !gesture.moved) {
      if (gesture.finishDrawing)
        onSelect(gesture.index, { ...gesture.meta, finishDrawing: true });
      else if (gesture.kind === 'draw' && document.points.length < 256) {
        const point = screenPoint(event ?? gesture.event);
        if (point) onAdd(point, { preserveTool: true });
      } else if (gesture.selectsOnClick || gesture.kind === 'empty')
        onSelect(gesture.index, gesture.meta);
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
      const handle =
        event.target.closest('[data-map-handle]')?.dataset.mapHandle;
      const node = event.target.closest('[data-map-point]');
      const nearest = nearestPoint(origin, event.pointerType);
      const index = handle
        ? selection
        : nearest >= 0
          ? nearest
          : node
            ? Number(node.dataset.mapPoint)
            : -1;
      const point = document.points[index];
      const meta = selectionMeta(event);
      const kind =
        tool === 'pan'
          ? 'pan'
          : (handle ??
            (index >= 0
              ? tool === 'select'
                ? 'select'
                : tool === 'height' || event.shiftKey
                  ? 'height'
                  : 'move'
              : tool === 'draw'
                ? 'draw'
                : 'empty'));
      drag = {
        kind,
        index,
        meta,
        selectsOnClick: !handle && index >= 0 && kind !== 'pan',
        pointerId: event.pointerId,
        moved: false,
        x: event.clientX,
        y: event.clientY,
        origin,
        event,
        bounds: { ...bounds },
        point: { ...point },
        roll: point?.roll ?? 0,
        lastX: event.clientX,
        finishDrawing:
          !handle &&
          tool === 'draw' &&
          index === 0 &&
          document.points.length >= 4 &&
          document.courseType !== 'downhill' &&
          !event.shiftKey &&
          !event.metaKey &&
          !event.ctrlKey,
      };
      svg.setPointerCapture(event.pointerId);
      event.preventDefault();
    },
    { signal: life.signal },
  );
  svg.addEventListener(
    'pointermove',
    (event) => {
      if (!drag) {
        if (event.pointerType === 'touch' || tool === 'pan' || tool === 'orbit')
          return;
        const p = mapPosition(event);
        const next = p ? nearestPoint(p, event.pointerType) : -1;
        if (next !== hovered) {
          hovered = next;
          render();
        }
        return;
      }
      if (event.pointerId !== drag.pointerId) return;
      if (
        !drag.moved &&
        Math.hypot(event.clientX - drag.x, event.clientY - drag.y) < 4
      )
        return;
      const p = mapPosition(event);
      if (!p) return;
      if (drag.kind === 'bank' && event.clientX === drag.lastX) return;
      const firstMove = !drag.moved;
      drag.moved = true;
      if (firstMove && ['move', 'height'].includes(drag.kind))
        onSelect(drag.index, { preserveTool: true, preserveSelection: true });
      event.preventDefault();
      if (drag.kind === 'pan') {
        bounds = {
          ...drag.bounds,
          minX: drag.bounds.minX - (p.x - drag.origin.x) / drag.bounds.scale,
          minZ: drag.bounds.minZ - (p.y - drag.origin.y) / drag.bounds.scale,
        };
        render();
      } else if (drag.kind === 'bank') {
        drag.roll = dragPointRoll(
          drag.roll,
          event.clientX - drag.lastX,
          event.altKey,
        );
        drag.lastX = event.clientX;
        onBankDrag?.(drag.index, drag.roll);
      } else if (drag.kind === 'height') {
        const dy = (p.y - drag.origin.y) / drag.bounds.scale;
        onDrag(
          drag.index,
          { y: drag.point.y - dy * (event.altKey ? 0.2 : 1) },
          { preserveTool: true },
        );
      } else if (drag.kind === 'move') {
        onDrag(
          drag.index,
          {
            x:
              Math.round(
                (drag.point.x + (p.x - drag.origin.x) / drag.bounds.scale) / 5,
              ) * 5,
            z:
              Math.round(
                (drag.point.z + (p.y - drag.origin.y) / drag.bounds.scale) / 5,
              ) * 5,
          },
          { preserveTool: true },
        );
      }
    },
    { signal: life.signal },
  );
  svg.addEventListener(
    'pointerleave',
    () => {
      if (hovered >= 0 && !drag) {
        hovered = -1;
        render();
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
    revealPoint(index) {
      const point = document?.points[index];
      if (!bounds || !point) return false;
      const [x, y] = project(point);
      if (x >= 0 && x <= W && y >= 0 && y <= H) return false;
      bounds.minX = point.x - W / (2 * bounds.scale);
      bounds.minZ = point.z - H / (2 * bounds.scale);
      render();
      return true;
    },
    setDocument(
      next,
      selected,
      {
        frame = false,
        visible: shown = true,
        previewCurve: liveCurve = null,
        section = null,
        selectedPoints = [],
        rollRateSections: measured = [],
        trajectories: flights = [],
        selectedJumpId = null,
        problemPoint = null,
        problemSeverity: severity = 'error',
        drawMode: drawing = false,
        tool: requestedTool,
      } = {},
    ) {
      document = next;
      previewCurve = liveCurve;
      visible = shown;
      if (!visible) hovered = -1;
      selection = selected;
      selectedIndices = new Set(selectedPoints);
      if (selection >= 0) selectedIndices.add(selection);
      rollRateSections = measured;
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
