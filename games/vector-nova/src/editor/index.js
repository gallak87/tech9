import './style.css';
import {
  createDocument,
  generateDocument,
  validateDocument,
  analyzeDocument,
  DOCUMENT_LIMITS,
  DOWNHILL_RUNOUT,
  applySectionShape,
  pointRouteFractions,
  addJump,
  setCourseType,
} from './document.js';
import { createTrackLibrary } from './library.js';
import { createRouteMap } from './map.js';
import { createEditorViewport } from './viewport.js';
import {
  generatePickupLayout,
  PICKUP_PRESETS,
  PICKUP_LABELS,
} from './pickups.js';
import { deviceCSSColor } from '../pickups/theme.js';
import { createEditorTrack } from './track.js';
import { predictEditorJumpTrajectory } from './jumps.js';
import { getShip } from '../ships/catalog.js';
import { WORLD_PRESETS } from './world-presets.js';
import { findNextSuitableJump } from './jump-placement.js';
import { canSpreadRoad, spreadRoad } from './road-room.js';
import { EDITOR_TOOLS } from './tools.js';
import { smoothCorner, canSmoothCorner } from './corner-repair.js';

const clone = (value) => JSON.parse(JSON.stringify(value));
const escape = (value) =>
  String(value).replace(
    /[&<>"']/g,
    (char) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[
        char
      ],
  );
const rounded = (number, digits = 0) => Number(number.toFixed(digits));
const button = (action, text, extra = '') =>
  `<button type="button" data-editor-action="${action}" ${extra}>${text}</button>`;
const option = (value, text, selected) =>
  `<option value="${value}" ${selected ? 'selected' : ''}>${text}</option>`;
const uid = (prefix) =>
  `${prefix}-${globalThis.crypto?.randomUUID?.() ?? Date.now().toString(36) + Math.random().toString(36).slice(2, 8)}`;

/** The editor owns its draft and history across a suspended Test Drive. */
export function createTrackEditor(
  host,
  {
    onExit = () => {},
    onTestDrive = () => {},
    onTunes = null,
    shipId = 'kestrel',
    document: initial,
    library = createTrackLibrary(),
  } = {},
) {
  const previewShip = getShip(shipId);
  let doc = validateDocument(
    initial ?? createDocument({ seed: 42017, blank: true }),
  );
  let selected = doc.points.length ? 0 : -1;
  let selectedProp = -1;
  let shapeStart = Math.floor(doc.points.length * 0.2);
  let shapeEnd = Math.min(
    doc.points.length - 1,
    Math.max(shapeStart + 1, Math.floor(doc.points.length * 0.6)),
  );
  let shapePreset = '90';
  let shapeDirection = 'right';
  let jumpStart = Math.max(0, Math.floor(doc.points.length * 0.2));
  let jumpEnd = Math.min(doc.points.length - 1, jumpStart + 1);
  let jumpReceiving = 300;
  let jumpRampAssist = true;
  let selectedJumpId = doc.jumps?.[0]?.id ?? null;
  let flightPreview = null;
  let flightKey = '';
  let flightTimer;
  let flightVersion = 0;
  let undo = [];
  let redo = [];
  let saved = '';
  let records = [];
  let savedId = '';
  let busy = false;
  let disposed = false;
  let suspended = false;
  let tab = 'route';
  let view = 'world';
  let panelOpen = false;
  let panelOrigin = 'context-details';
  let tool = doc.points.length < 4 ? 'draw' : 'move';
  let rangeAnchor = selected;
  let rangeEnd = selected;
  let rangeArmed = false;
  let contextMenu = '';
  let nudgeOpen = false;
  let seedJumps = true;
  let seedPickups = true;
  let generatorDetailsOpen = false;
  let jumpManualOpen = false;
  let jumpManualChosen = false;
  let jumpSuggestion = null;
  const analysisCache = new WeakMap();
  const fractionCache = new WeakMap();
  function analysisFor(value = doc) {
    if (!analysisCache.has(value))
      analysisCache.set(value, analyzeDocument(value));
    return analysisCache.get(value);
  }
  function fractionsFor(value = doc) {
    if (!fractionCache.has(value))
      fractionCache.set(
        value,
        value.points.length >= 4
          ? pointRouteFractions(value)
          : value.points.map(() => 0),
      );
    return fractionCache.get(value);
  }
  function fractionAt(index) {
    return fractionsFor()[index] ?? 0;
  }
  let pendingFly = false;
  let preciseOpen = false;
  let jumpCreateOpen = false;
  let activeSection = null;
  let previewDocumentKey = '';
  let latestAnalysis = null;
  let step = 20;
  let dragBefore;
  let previewMessage = 'Opening your workspace…';
  let message = 'Draw your route, or generate a starting point.';
  let messageKind = '';
  const life = new AbortController();
  host.classList.add('track-editor-host');
  host.innerHTML = `<div class="track-workshop workshop-direct" aria-label="Track Workshop">
    <header class="workshop-header" data-editor-header>
      <div class="workshop-wordmark">VECTOR<span>//</span>NOVA<small data-editor-course-label>TRACK EDITOR</small></div>
      <label class="workshop-header-name"><span class="workshop-sr-only">Track name</span><input type="text" maxlength="60" data-editor-field="name" aria-label="Track name" value="${escape(doc.name)}"></label>
      <div class="workshop-header-course">${courseTypeControl()}</div>
      <div class="workshop-header-actions">${button('undo', 'Undo', 'aria-label="Undo edit"')}${button('redo', 'Redo', 'aria-label="Redo edit"')}${button('reset-track', 'Reset track', 'title="Clear the road, jumps and pickups. Undo restores your track."')}${button('save', 'Save')}${typeof onTunes === 'function' ? button('tunes', 'Tunes') : ''}${button('test', 'Test drive', 'class="workshop-primary"')}${button('exit', 'Back', 'aria-label="Back to Race setup"')}</div>
    </header>
    <div class="workshop-toolbar">
      <div class="workshop-tool-group workshop-utilities" role="group" aria-label="Track tools">${button('tab-generate', 'Generate')}${button('tab-world', 'World')}${button('tab-pickups', 'Pickups')}${button('tab-jumps', 'Jumps (0)')}${button('tab-library', 'My tracks')}</div>
      <div class="workshop-tool-group workshop-view-tools" role="group" aria-label="Viewport">${button('view-world', '3D', 'aria-pressed="true"')}${button('view-map', 'Map', 'aria-pressed="false"')}${button('focus-selection', 'Focus selection', 'title="Focus selected point or section (F)"')}${button('fit', 'Overview')}${button('fly-camera', 'Fly', 'aria-label="Enter free camera" aria-pressed="false"')}<details class="workshop-camera-menu"><summary tabindex="0" aria-label="More camera controls">Camera</summary><div>${button('orbit-left', 'Orbit left')}${button('orbit-right', 'Orbit right')}${button('tilt-up', 'Higher view')}${button('tilt-down', 'Lower view')}${button('zoom-in', 'Zoom in')}${button('zoom-out', 'Zoom out')}${button('pan-left', 'Pan left')}${button('pan-right', 'Pan right')}${button('pan-up', 'Pan up')}${button('pan-down', 'Pan down')}${button('reset-view', 'Fit world')}</div></details></div>
    </div>
    <div class="workshop-layout" data-editor-layout>
      <aside class="workshop-sidebar workshop-context-panel" data-editor-panel hidden><div class="workshop-panel-header"><h2 data-editor-panel-title>Road point</h2>${button('panel-close', '×', 'aria-label="Close tool panel"')}</div><div data-editor-tools></div></aside>
      <main class="workshop-main">
        <div class="workshop-viewbar"><span data-editor-view-hint>Drag points · Shift-drag height · Right-drag orbit · Scroll zoom</span><div class="workshop-facts" data-editor-facts></div></div>
        <div class="workshop-canvas">
          <div class="workshop-tool-palette" role="group" aria-label="Preview tools" data-editor-tool-palette><span class="workshop-palette-title">TOOLS</span><div class="workshop-palette-buttons">${EDITOR_TOOLS.map((item) => button(item.action, `<svg viewBox="0 0 24 24" aria-hidden="true"><g>${item.icon}</g></svg><span>${item.label}</span><kbd aria-hidden="true">${item.key}</kbd>`, `data-editor-tool="${item.id}" aria-label="${item.label}" aria-keyshortcuts="${item.key}" aria-pressed="${tool === item.id}" title="${item.label} (${item.key})"`)).join('')}</div>${button('finish-drawing', 'Finish drawing', 'hidden class="workshop-finish-drawing"')}</div>
          <div class="workshop-map-wrap" data-editor-map-wrap hidden><svg id="workshop-route-map" viewBox="0 0 1000 680" role="img" aria-label="Top-down road editor. Click points to select them; enable Draw road to add points."></svg></div>
          <div class="workshop-world" data-editor-world><span class="workshop-fly-badge" data-editor-fly-badge hidden>FREE CAMERA · ESC / B TO EXIT</span></div>
          <div class="workshop-preview-status" data-editor-preview-status></div>
          <div class="workshop-empty-hint" data-editor-empty><span class="workshop-eyebrow">YOUR ROAD, FROM SCRATCH</span><strong data-editor-empty-title>Click the ground to start.</strong><span data-editor-empty-copy>Draw a few points. We build the road and supports.</span></div>
          <div class="workshop-selection-ui" data-editor-selection></div>
        </div>
        <div class="workshop-camera-help" data-editor-camera-help role="status"></div>
      </main>
    </div>
    <footer class="workshop-footer"><span class="workshop-status" role="status" aria-live="polite" data-editor-status></span><section class="workshop-validation" aria-label="Track checks" data-editor-validation></section></footer>
  </div>`;
  const root = host.firstElementChild;
  const tools = root.querySelector('[data-editor-tools]');
  const svg = root.querySelector('#workshop-route-map');
  const worldHost = root.querySelector('[data-editor-world]');
  const narrowLayout = window.matchMedia('(max-width: 760px)');
  function syncOverlayAccess() {
    const selection = root.querySelector('[data-editor-selection]');
    const blocked = panelOpen && narrowLayout.matches;
    const main = root.querySelector('.workshop-main');
    const moveFocus = blocked && main.contains(document.activeElement);
    main.inert = blocked;
    selection.inert = blocked;
    selection.hidden = blocked;
    if (moveFocus)
      root.querySelector('[data-editor-action="panel-close"]')?.focus();
  }
  narrowLayout.addEventListener('change', syncOverlayAccess, {
    signal: life.signal,
  });
  function selectPoint(index, meta = {}) {
    if (busy || suspended || disposed) return;
    if (index < 0 || index >= doc.points.length) {
      selected = -1;
      selectedProp = -1;
      rangeAnchor = -1;
      rangeEnd = -1;
      rangeArmed = false;
      contextMenu = '';
      panelOpen = false;
      render();
      return;
    }
    if (meta.finishDrawing) {
      selected = index;
      action('finish-drawing');
      return;
    }
    const extend = meta.extendRange || meta.shiftKey || rangeArmed;
    if (extend && rangeAnchor >= 0) rangeEnd = index;
    else {
      rangeAnchor = index;
      rangeEnd = index;
    }
    selected = index;
    selectedProp = -1;
    rangeArmed = false;
    if (panelOpen) tab = 'route';
    render();
  }
  function dragPoint(index, position) {
    if (busy || suspended || disposed) return;
    if (!dragBefore) {
      dragBefore = clone(doc);
      status('Moving point… release to finish, Escape to cancel.');
      root.querySelector('[data-editor-validation]').innerHTML =
        '<strong>Moving point…</strong>';
    }
    // An asynchronous preview may render between pointer frames.
    analysisCache.delete(doc);
    fractionCache.delete(doc);
    latestAnalysis = null;
    Object.assign(doc.points[index], position);
    selected = index;
    selectedProp = -1;
    syncCanvas();
  }
  function endDrag() {
    if (!dragBefore) return;
    const previous = dragBefore;
    dragBefore = null;
    if (busy || suspended || disposed) {
      doc = previous;
      return;
    }
    try {
      doc = validateDocument(doc);
      if (JSON.stringify(doc) !== JSON.stringify(previous))
        pushHistory(previous);
      status('Position updated.');
      render();
    } catch (error) {
      doc = previous;
      status(error.message, 'error');
      render();
    }
  }
  function cancelDrag() {
    if (!dragBefore) return;
    doc = dragBefore;
    dragBefore = null;
    status('Move canceled.');
    render();
  }
  const viewport = createEditorViewport(worldHost, {
    navigationRoot: host,
    onSelectPoint: selectPoint,
    onAddPoint(position) {
      if (!busy && !suspended && !disposed && tool === 'draw')
        addPoint(position);
    },
    onInsertPoint(index, position) {
      insertPoint(index, position);
    },
    onDragPoint: dragPoint,
    onDragEnd: endDrag,
    onDragCancel: cancelDrag,
    onError(error) {
      previewMessage = error.message;
      syncStatus();
    },
    onReady() {
      previewMessage = '';
      syncStatus();
      syncCameraUI();
      if (pendingFly) {
        pendingFly = false;
        viewport.enterFly();
      }
    },
    onFlyChange(active, { restoreFocus = false } = {}) {
      if (disposed) return;
      syncCameraUI();
      if (!active && restoreFocus && !suspended)
        root
          .querySelector('[data-editor-action="fly-camera"]')
          ?.focus({ preventScroll: true });
    },
  });
  const map = createRouteMap(svg, {
    onSelect: selectPoint,
    onAdd(position) {
      if (!busy && !suspended && !disposed && tool === 'draw')
        addPoint(position);
    },
    onDrag: dragPoint,
    onDragEnd: endDrag,
    onDragCancel: cancelDrag,
  });

  function status(text, kind = '') {
    message = text;
    messageKind = kind;
    syncStatus();
  }
  function syncStatus() {
    if (disposed) return;
    const statusEl = root.querySelector('[data-editor-status]');
    statusEl.textContent = message;
    statusEl.dataset.kind = messageKind;
    const previewStatus = root.querySelector('[data-editor-preview-status]');
    previewStatus.hidden = view !== 'world' || !previewMessage;
    previewStatus.textContent = previewMessage;
  }
  function syncCameraUI() {
    if (disposed) return;
    const flying = viewport.isFlying();
    const control = root.querySelector('[data-editor-action="fly-camera"]');
    if (control) {
      control.textContent = flying ? 'Exit fly' : 'Fly';
      control.setAttribute(
        'aria-label',
        flying ? 'Exit free camera' : 'Enter free camera',
      );
      control.setAttribute('aria-pressed', String(flying));
      control.disabled = busy || (view === 'world' && !viewport.isReady());
    }
    root.querySelector('[data-editor-fly-badge]').hidden = !flying;
    const help = root.querySelector('[data-editor-camera-help]');
    if (help)
      help.textContent = flying
        ? 'WASD move · Q/E down/up · Drag or arrows look · Shift faster · Esc exit. Controller: left stick move, right stick look, LB/RB down/up, RT faster, B exit.'
        : 'Camera: right-drag to orbit · scroll to zoom · F to focus selection. Fly gives WASD and controller movement.';
  }
  function restoreJumpSelection() {
    if (!(doc.jumps ?? []).some((jump) => jump.id === selectedJumpId))
      selectedJumpId = doc.jumps?.[0]?.id ?? null;
  }
  function pushHistory(previous) {
    undo.push(previous);
    if (undo.length > 80) undo.shift();
    redo = [];
  }
  function commit(next, text, { frame = false } = {}) {
    try {
      next = validateDocument(next);
      if (JSON.stringify(next) === JSON.stringify(doc)) {
        status(text);
        return;
      }
      pushHistory(clone(doc));
      doc = next;
      jumpSuggestion = null;
      jumpManualChosen = false;
      restoreJumpSelection();
      selected = Math.min(selected, doc.points.length - 1);
      selectedProp = -1;
      message = text;
      messageKind = '';
      render({ frame });
    } catch (error) {
      status(error.message, 'error');
      render();
    }
  }
  function edit(change, text, options) {
    const next = clone(doc);
    change(next);
    commit(next, text, options);
  }
  function scheduleFlightPreview() {
    if (tab !== 'jumps') return;
    const jump = (doc.jumps ?? []).find((entry) => entry.id === selectedJumpId);
    const key = jump
      ? JSON.stringify({
          courseType: doc.courseType,
          points: doc.points,
          rolls: doc.rolls,
          jumps: doc.jumps,
          width: doc.width,
          selectedJumpId,
          ship: previewShip.id,
        })
      : '';
    if (key === flightKey) return;
    flightKey = key;
    clearTimeout(flightTimer);
    const version = ++flightVersion;
    if (!jump) {
      flightPreview = null;
      return;
    }
    flightPreview = { pending: true };
    const snapshot = clone(doc),
      jumpId = selectedJumpId;
    flightTimer = setTimeout(() => {
      if (disposed || version !== flightVersion) return;
      try {
        const track = createEditorTrack(snapshot);
        const compiled = track.jumps.find((entry) => entry.id === jumpId);
        if (!compiled)
          throw new Error('Choose a saved gap to preview its flight.');
        const cruise = predictEditorJumpTrajectory(track, compiled, {
          speed: previewShip.handling.cruiseSpeed,
          boost: false,
          shipId: previewShip.id,
        });
        const boost = predictEditorJumpTrajectory(track, compiled, {
          speed: previewShip.handling.boostSpeed,
          boost: true,
          shipId: previewShip.id,
        });
        if (version !== flightVersion || disposed) return;
        flightPreview = {
          cruise,
          boost,
          launch: track.sample(compiled.takeoff).position.toArray(),
          landing: track.sample(compiled.landingStart).position.toArray(),
        };
      } catch (error) {
        flightPreview = { error: error.message };
      }
      if (!disposed && version === flightVersion) render();
    }, 180);
  }
  function flightLines() {
    if (tab !== 'jumps' || !flightPreview?.cruise) return [];
    return [
      {
        id: 'cruise',
        label: 'Cruise',
        color: '#80d5ff',
        points: flightPreview.cruise.points,
      },
      {
        id: 'boost',
        label: 'Boost',
        color: '#ffd199',
        points: flightPreview.boost.points,
      },
    ];
  }
  function syncCanvas({ frame = false } = {}) {
    if (!dragBefore) {
      activeSection = null;
      const span = selectedRange();
      const selectedSpan =
        span ??
        (tab === 'shape' && shapeEnd > shapeStart
          ? { start: shapeStart, end: shapeEnd }
          : null);
      if (selectedSpan && doc.points.length >= 4) {
        try {
          activeSection = {
            start: fractionAt(selectedSpan.start),
            end: fractionAt(selectedSpan.end),
          };
        } catch {
          /* Incomplete drafts retain their editing controls. */
        }
      }
      const key = JSON.stringify({ ...doc, id: undefined, name: undefined });
      if (key !== previewDocumentKey) {
        previewDocumentKey = key;
        if (view === 'world') previewMessage = 'Updating world…';
      }
    }
    if (!dragBefore || view === 'map')
      map.setDocument(doc, selected, {
        frame,
        section: activeSection,
        trajectories: flightLines(),
        selectedJumpId: tab === 'jumps' ? selectedJumpId : null,
        problemPoint: latestAnalysis?.primaryIssue?.pointIndex ?? null,
        drawMode: tool === 'draw',
        tool,
      });
    viewport.setDocument(clone(doc), {
      frame,
      selectedPoint: selected,
      selectedProp,
      problemPoint: latestAnalysis?.primaryIssue?.pointIndex ?? null,
      problemLabel:
        latestAnalysis?.primaryIssue?.kind === 'bend'
          ? 'Tight corner'
          : 'Check this point',
      section: activeSection,
      drawMode: tool === 'draw',
      tool,
    });
    viewport.setTrajectories(flightLines());
    root.querySelector('[data-editor-empty]').hidden =
      doc.points.length >= 4 || panelOpen;
    root.querySelector('[data-editor-empty-title]').textContent =
      tool !== 'draw'
        ? 'Choose Draw road to keep building.'
        : doc.points.length
          ? `Add ${4 - doc.points.length} more road ${doc.points.length === 3 ? 'point' : 'points'}.`
          : 'Click the ground to start.';
    root.querySelector('[data-editor-empty-copy]').textContent =
      doc.courseType === 'circuit'
        ? 'Place at least four broad points. The last connects to the first automatically.'
        : 'Place at least four broad points from start to finish. We build the road and supports.';
    syncStatus();
  }
  function focusKey() {
    const active = document.activeElement;
    if (!root.contains(active)) return null;
    return active.dataset.editorField
      ? ['data-editor-field', active.dataset.editorField]
      : active.dataset.editorAction
        ? ['data-editor-action', active.dataset.editorAction]
        : null;
  }
  function restoreFocus(key) {
    if (!key) return;
    const element = [...root.querySelectorAll(`[${key[0]}]`)].find(
      (node) => node.getAttribute(key[0]) === key[1],
    );
    const target =
      element?.closest('[inert]') ||
      (!element && panelOpen && narrowLayout.matches)
        ? root.querySelector('[data-editor-action="panel-close"]')
        : element;
    target?.focus({ preventScroll: true });
  }
  function range(field, label, value, min, max, increment, unit = '') {
    return `<label class="workshop-range"><span>${label}<output>${rounded(value, 2)}${unit}</output></span><input type="range" data-editor-field="${field}" aria-label="${label}" min="${min}" max="${max}" step="${increment}" value="${value}"></label>`;
  }
  function pointLabel(index) {
    if (index === 0)
      return doc.courseType === 'downhill' ? 'Start' : 'Start / finish';
    return doc.courseType === 'downhill' && index === doc.points.length - 1
      ? 'Runout end'
      : 'Route point';
  }
  function courseTypeControl() {
    return `<label class="workshop-label"><span class="workshop-sr-only">Course type</span><select data-editor-field="course-type" aria-label="Course type">${option('circuit', 'Circuit', doc.courseType !== 'downhill')}${option('downhill', 'Downhill', doc.courseType === 'downhill')}</select></label>`;
  }
  function selectedRange() {
    if (rangeAnchor < 0 || rangeEnd < 0 || rangeAnchor === rangeEnd)
      return null;
    return {
      start: Math.min(rangeAnchor, rangeEnd),
      end: Math.max(rangeAnchor, rangeEnd),
    };
  }
  function forwardSpan(metres, forJump = false) {
    const range = selectedRange();
    const length = latestAnalysis?.length || analysisFor().length;
    const station = (index) => fractionAt(index) * length;
    const clear = (start, end) =>
      forJump ||
      !doc.jumps.some(
        (jump) =>
          station(end) > jump.start * length - 140 &&
          station(start) < jump.end * length + jump.receiving + 100,
      );
    if (range) {
      if (!clear(range.start, range.end))
        throw new Error(
          'Choose ordinary road beyond the jump and its receiving deck, or expand a clear section.',
        );
      return range;
    }
    if (doc.points.length < 4)
      throw new Error('Add four road points before shaping a section.');
    if (selected < 0) throw new Error('Click a road point first.');
    for (let end = selected + 1; end < doc.points.length; end++) {
      if (station(end) - station(selected) >= metres) {
        if (clear(selected, end)) return { start: selected, end };
        break;
      }
    }
    if (!forJump)
      for (let start = selected - 1; start >= 0; start--) {
        if (station(selected) - station(start) >= metres) {
          if (clear(start, selected)) return { start, end: selected };
          break;
        }
      }
    throw new Error(
      'Choose ordinary road with more space, or select a longer section using Extend +.',
    );
  }
  function jumpAtPoint(index = selected) {
    if (index < 0 || doc.points.length < 4) return null;
    const at = fractionAt(index),
      length = latestAnalysis?.length ?? analysisFor().length;
    return (
      doc.jumps.find(
        (jump) =>
          jump.launchPointId === doc.points[index]?.id ||
          jump.landingPointId === doc.points[index]?.id ||
          (at >= jump.start - 0.001 &&
            at <= jump.end + jump.receiving / Math.max(1, length) + 0.001),
      ) ?? null
    );
  }
  function roadAngleLabel(point) {
    const degrees =
      ((Math.round(((point.roll ?? 0) * 180) / Math.PI) % 360) + 360) % 360;
    return `${degrees}° ${degrees === 0 ? 'upright' : degrees === 180 ? 'inverted' : degrees === 90 || degrees === 270 ? 'wall' : 'tilted'}`;
  }
  function renderRoadPanel() {
    const point = doc.points[selected];
    return `<section class="workshop-section"><p class="workshop-eyebrow">${point ? `POINT ${String(selected + 1).padStart(2, '0')}` : 'ROAD CONTROLS'}</p><h2>${point ? 'Shape it directly.' : 'Choose a road point.'}</h2><p class="workshop-help">Drag the round handle to move. Drag the height arrow, or Shift-drag a point, to raise it.</p><div class="workshop-button-row">${button('context-prev', 'Previous point')}${button('context-next', 'Next point')}</div>${button('select-section', rangeArmed ? 'Click an end point…' : 'Choose a section', 'class="workshop-wide"')}<p class="workshop-help">Click another point after choosing a section, or Shift-click it. Shape buttons work on the selected section.</p></section><details class="workshop-precise" ${preciseOpen ? 'open' : ''}><summary tabindex="0">Precise position &amp; road settings</summary>${renderPreciseRoad()}</details><section class="workshop-section"><div class="workshop-button-row">${button('tab-shape', 'Bank / twist controls')}${button('tab-jumps', 'Jump controls')}</div></section>`;
  }
  function renderSelection() {
    const point = doc.points[selected],
      range = selectedRange();
    let selectedMetres = 0;
    if (range && latestAnalysis?.length) {
      try {
        selectedMetres =
          (fractionAt(range.end) - fractionAt(range.start)) *
          latestAnalysis.length;
      } catch {
        /* Draft route. */
      }
    }
    if (!point)
      return `<div class="workshop-context-bar workshop-context-instruction"><span>${tool === 'draw' ? 'Click the ground to draw. We handle the supports.' : 'Click a road point to shape it. Double-click the road to insert one.'}</span>${button('add-point', '+ Add point', doc.points.length >= DOCUMENT_LIMITS.points ? 'disabled' : '')}${button('quick-start', 'Generate a drivable track', 'class="workshop-primary"')}</div>`;
    const shapeMenu =
      contextMenu === 'shape'
        ? `<div class="workshop-context-popup"><div class="workshop-section-row"><h3>Road angle</h3>${button('context-menu-close', '×', 'aria-label="Close shape tools"')}</div><p>${range ? `Points ${range.start + 1}–${range.end + 1} · ${Math.round(selectedMetres)} m` : `Near point ${selected + 1} · choose a section for more control`}</p><p class="workshop-help">90° wall · 180° upside down · 270° opposite wall.<br>Drag points to bend the route; longer sections rotate more gently.</p><label class="workshop-label">Direction<select data-editor-field="quick-direction" aria-label="Quick shape direction">${option('right', 'Right', shapeDirection === 'right')}${option('left', 'Left', shapeDirection === 'left')}</select></label><div class="workshop-quick-presets">${button('quick-90', '90°')}${button('quick-180', '180°')}${button('quick-270', '270°')}${button('quick-straight', 'Straight')}</div><div class="workshop-button-row">${button('select-section', rangeArmed ? 'Choose end…' : 'Select section')}${button('range-expand', 'Extend +', range ? '' : 'disabled')}${button('range-shrink', 'Shorten −', range ? '' : 'disabled')}</div></div>`
        : contextMenu === 'more'
          ? `<div class="workshop-context-popup workshop-context-more">${button('context-details', 'Precise controls')}${button('add-point', 'Add point after this')}${button('tab-shape', 'Bank / twist controls')}${button('tab-jumps', 'Jump controls')}${button('delete-point', 'Delete point')}</div>`
          : '';
    const nudges = nudgeOpen
      ? `<div class="workshop-context-popup workshop-context-move"><div class="workshop-section-row"><h3>Move point</h3>${button('context-menu-close', '×', 'aria-label="Close movement tools"')}</div><label class="workshop-label">Step<select data-editor-field="context-step" aria-label="Quick movement step">${[5, 20, 100].map((value) => option(value, `${value} m`, value === step)).join('')}</select></label><div class="workshop-nudge">${button('context-north', '↑')}${button('context-west', '←')}${button('context-east', '→')}${button('context-south', '↓')}</div></div>`
      : '';
    return `${shapeMenu}${nudges}<div class="workshop-context-bar"><div class="workshop-selection-label"><strong>${range ? `Points ${range.start + 1}–${range.end + 1}` : `Point ${String(selected + 1).padStart(2, '0')}`}</strong><span>${rangeArmed ? 'Click another point to select a section' : `${Math.round(point.y)} m high · ${roadAngleLabel(point)}`}</span></div><div class="workshop-point-step">${button('context-prev', '‹', 'aria-label="Select previous road point"')}${button('context-next', '›', 'aria-label="Select next road point"')}</div>${button('context-move', 'Move')}${button('context-raise', 'Raise', 'title="Raise selected point by 10 metres"')}${button('context-lower', 'Lower', 'title="Lower selected point by 10 metres"')}${button('context-shape', 'Bank / twist', `aria-expanded="${contextMenu === 'shape'}" ${doc.points.length < 4 ? 'disabled' : ''}`)}${button('quick-jump', jumpAtPoint() ? 'Edit jump' : 'Add jump…', doc.points.length < 4 ? 'disabled' : '')}${button('context-more', '•••', 'aria-label="More point tools"')}</div>`;
  }
  function renderPreciseRoad() {
    const point = doc.points[selected];
    return `<section class="workshop-section"><label class="workshop-label">Road width<select data-editor-field="width" aria-label="Road width">${[32, 40, 48, 64].map((width) => option(width, `${width} m`, doc.width === width)).join('')}</select></label></section><section class="workshop-section"><div class="workshop-section-row"><h2>Route points</h2><span>${doc.points.length} / ${DOCUMENT_LIMITS.points}</span></div><p class="workshop-help">${doc.courseType === 'downhill' ? 'An open road follows your points through the finish and braking runout.' : 'A closed circuit follows your points in order.'} Keep turns broad and leave room to climb.</p><label class="workshop-label">Selected point<select data-editor-field="point" aria-label="Selected route point" ${doc.points.length ? '' : 'disabled'}>${doc.points.length ? doc.points.map((p, i) => option(i, `${String(i + 1).padStart(2, '0')} · ${pointLabel(i)}`, i === selected)).join('') : '<option>No points yet</option>'}</select></label><div class="workshop-button-row">${button('add-point', 'Add point', doc.points.length >= DOCUMENT_LIMITS.points ? 'disabled' : '')}${button('delete-point', 'Delete point', point ? '' : 'disabled')}</div>${point ? `<div class="workshop-coordinate-grid"><label>X / East<input type="number" data-editor-field="point-x" aria-label="Point X coordinate" min="-25000" max="25000" step="5" value="${rounded(point.x, 1)}"></label><label>Z / South<input type="number" data-editor-field="point-z" aria-label="Point Z coordinate" min="-25000" max="25000" step="5" value="${rounded(point.z, 1)}"></label></div><label class="workshop-label">Move distance<select data-editor-field="step" aria-label="Point movement distance">${[5, 20, 100].map((size) => option(size, `${size} m`, size === step)).join('')}</select></label><div class="workshop-nudge" role="group" aria-label="Move selected point">${button('north', '↑ North')}${button('west', '← West')}${button('east', 'East →')}${button('south', '↓ South')}</div>${range('point-y', 'Elevation / Y', rounded(point.y, 1), 0, 3000, 5, ' m')}${range('point-bank', 'Bank adjustment', rounded((point.bank * 180) / Math.PI, 1), -20, 20, 1, '°')}<div class="workshop-button-row">${button('earlier', 'Move earlier', selected <= 0 ? 'disabled' : '')}${button('later', 'Move later', selected >= doc.points.length - 1 ? 'disabled' : '')}</div>` : '<div class="workshop-small-empty">Add your first point to begin shaping the road.</div>'}</section><section class="workshop-section workshop-auto-note"><span class="workshop-auto-icon">↳</span><p><strong>We build the infrastructure.</strong><br>Road edges, supports and foundations follow your route automatically.</p></section>`;
  }
  function renderShape() {
    const point = doc.points[selected];
    const angle = rounded(((point?.roll ?? 0) * 180) / Math.PI);
    const quarter = ((angle % 360) + 360) % 360;
    const attitude =
      quarter === 0 ? 'upright' : quarter === 180 ? 'inverted' : 'on its side';
    const count = doc.points.length;
    shapeStart = Math.max(0, Math.min(shapeStart, count - 2));
    shapeEnd = Math.max(shapeStart + 1, Math.min(shapeEnd, count - 1));
    const pointOptions = (current) =>
      doc.points
        .map((p, i) =>
          option(
            i,
            `${String(i + 1).padStart(2, '0')} · ${pointLabel(i)}`,
            current === i,
          ),
        )
        .join('');
    let spanMetres = 0;
    if (count >= 4 && shapeEnd > shapeStart) {
      try {
        spanMetres =
          analysisFor().length *
          (fractionAt(shapeEnd) - fractionAt(shapeStart));
      } catch {
        /* The route checks below explain an incomplete draft. */
      }
    }
    return `<section class="workshop-section"><p class="workshop-eyebrow">ROAD ORIENTATION</p><h2>Build it in chunks.</h2><p class="workshop-help">Join quarter turns to create a wall ride or your own corkscrew. The road keeps its angle after each chunk.</p><label class="workshop-label">Selected point<select data-editor-field="point" aria-label="Selected route point" ${point ? '' : 'disabled'}>${point ? pointOptions(selected) : '<option>No points yet</option>'}</select></label><div class="workshop-angle-readout" aria-label="Selected road angle"><strong>${angle}°</strong><span>${point ? attitude : 'Add road points first'}</span></div><p class="workshop-help">0° upright · 90° wall · 180° inverted.<br>Another quarter turn continues from there.</p></section><section class="workshop-section"><h2>Shape road section</h2><label class="workshop-label">From point<select data-editor-field="shape-start" aria-label="Section start point" ${count >= 4 ? '' : 'disabled'}>${count ? pointOptions(shapeStart) : '<option>No points yet</option>'}</select></label><label class="workshop-label">To point<select data-editor-field="shape-end" aria-label="Section end point" ${count >= 4 ? '' : 'disabled'}>${count ? pointOptions(shapeEnd) : '<option>No points yet</option>'}</select></label><div class="workshop-section-span">${spanMetres > 0 ? `${Math.round(spanMetres)} m selected` : 'Choose a forward section of road'}</div><label class="workshop-label">Section preset<select data-editor-field="shape-preset" aria-label="Road section preset">${[
      ['90', 'Quarter turn · 90°'],
      ['180', 'Half turn · 180°'],
      ['270', 'Three-quarter turn · 270°'],
      ['straight', 'Straight · hold the current angle'],
    ]
      .map(([value, label]) => option(value, label, shapePreset === value))
      .join(
        '',
      )}</select></label><label class="workshop-label">Turn direction<select data-editor-field="shape-direction" aria-label="Section turn direction" ${shapePreset === 'straight' ? 'disabled' : ''}>${option('right', 'Right', shapeDirection === 'right')}${option('left', 'Left', shapeDirection === 'left')}</select></label>${button('apply-shape', 'Apply section', `class="workshop-primary workshop-wide" ${count >= 4 ? '' : 'disabled'}`)}${button('inspect-shape', 'Inspect section in 3D', `class="workshop-wide" ${count >= 4 ? '' : 'disabled'}`)}<p class="workshop-help">Longer sections give smoother turns. The editor will flag a section that is too short. Add the next chunk from this section’s end point. Straight connects the endpoints and keeps its starting road angle.</p></section>`;
  }
  function renderJumps() {
    const count = doc.points.length;
    jumpStart = Math.max(0, Math.min(jumpStart, count - 2));
    jumpEnd = Math.max(jumpStart + 1, Math.min(jumpEnd, count - 1));
    const gaps = doc.jumps ?? [];
    const current = gaps.find((entry) => entry.id === selectedJumpId);
    const pointOptions = (value) =>
      doc.points
        .map((p, i) =>
          option(
            i,
            `${String(i + 1).padStart(2, '0')} · ${pointLabel(i)}`,
            i === value,
          ),
        )
        .join('');
    const length = analysisFor().length;
    const gapOptions = gaps
      .map((entry, i) =>
        option(
          entry.id,
          `Gap ${i + 1} · ${Math.round((entry.end - entry.start) * length)} m`,
          entry.id === selectedJumpId,
        ),
      )
      .join('');
    const advisory = !current
      ? '<p class="workshop-help">Choose a gap to see its flight paths.</p>'
      : flightPreview?.pending
        ? '<p class="workshop-help" role="status">Calculating cruise and boost flight paths…</p>'
        : flightPreview?.error
          ? `<p class="workshop-help">${escape(flightPreview.error)}</p>`
          : flightPreview?.cruise
            ? `<div class="workshop-flight-reports">${[
                ['cruise', 'Cruise', '#80d5ff'],
                ['boost', 'Boost', '#ffd199'],
              ]
                .map(
                  ([key, label, color]) =>
                    `<div data-editor-flight="${key}" data-flight-status="${flightPreview[key].status}" style="--flight-color:${color}"><strong>Full ${label.toLowerCase()} · ${Math.round(flightPreview[key].speed * 3.6)} km/h</strong><span>${escape(flightPreview[key].summary)}</span></div>`,
                )
                .join(
                  '',
                )}</div><p class="workshop-help">${escape(previewShip.name)} estimate. Boost assumes full reserve at launch. Entry speed and steering affect the landing.</p>`
            : '<p class="workshop-help">Flight preview will appear here.</p>';
    const ready = jumpManualChosen || jumpSuggestion?.source === doc;
    const creation = `<section class="workshop-section workshop-jump-authoring"><h2>Add a jump</h2><p class="workshop-help">Find a clear launch and landing, then add the gap. Your road stays unchanged until you choose Add.</p>${button('find-jump-section', 'Use next suitable section', `class="workshop-wide" ${count >= 4 ? '' : 'disabled'}`)}<p class="workshop-jump-suggestion" data-editor-jump-suggestion>${ready ? `Points ${jumpStart + 1} → ${jumpEnd + 1} · ${Math.round((fractionAt(jumpEnd) - fractionAt(jumpStart)) * length)} m gap` : 'No section chosen yet.'}</p>${button('add-jump', 'Add jump gap', `class="workshop-primary workshop-wide" ${count >= 4 && ready ? '' : 'disabled'}`)}<details class="workshop-jump-manual" ${jumpManualOpen ? 'open' : ''}><summary tabindex="0">Choose launch and landing manually</summary><p class="workshop-help">For your own spans and huge jumps. Leave at least 160 m of approach and a clear receiving deck.</p><label class="workshop-label">Launch point<select data-editor-field="jump-start" aria-label="Jump launch point" ${count >= 4 ? '' : 'disabled'}>${count ? pointOptions(jumpStart) : '<option>No points yet</option>'}</select></label><label class="workshop-label">Landing point<select data-editor-field="jump-end" aria-label="Jump landing point" ${count >= 4 ? '' : 'disabled'}>${count ? pointOptions(jumpEnd) : '<option>No points yet</option>'}</select></label><label class="workshop-label">New gap landing runout<select data-editor-field="jump-receiving" aria-label="New jump landing runout">${[150, 300, 600, 1200].map((metres) => option(metres, `${metres} m`, jumpReceiving === metres)).join('')}${![150, 300, 600, 1200].includes(jumpReceiving) ? option(jumpReceiving, `${Math.round(jumpReceiving)} m`, true) : ''}</select></label><label class="workshop-checkbox"><input type="checkbox" data-editor-field="jump-ramp" ${jumpRampAssist ? 'checked' : ''}><span>Shape launch ramp and receiving deck</span></label><p class="workshop-help">Creates a visible ramp and broad landing. Clear this to keep existing heights. Flight paths help you judge the result; no hidden launch force is added.</p></details></section>`;
    const inspector = gaps.length
      ? `<section class="workshop-section"><div class="workshop-section-row"><h2>Your jumps</h2><span>${gaps.length} ${gaps.length === 1 ? 'gap' : 'gaps'}</span></div><label class="workshop-label">Gap to inspect<select data-editor-field="jump-selected" aria-label="Selected jump gap">${gapOptions}</select></label>${current ? `<label class="workshop-label">This gap’s landing runout<select data-editor-field="selected-jump-receiving" aria-label="Selected gap landing runout">${[150, 300, 600, 1200].map((metres) => option(metres, `${metres} m`, current.receiving === metres)).join('')}${![150, 300, 600, 1200].includes(current.receiving) ? option(current.receiving, `${Math.round(current.receiving)} m`, true) : ''}</select></label>` : ''}${button('inspect-jump', 'Focus jump in 3D', `class="workshop-wide" ${current && flightPreview?.cruise ? '' : 'disabled'}`)}${advisory}<div class="workshop-button-row">${button('remove-jump', 'Remove gap', current ? '' : 'disabled')}${button('clear-jumps', 'Clear all gaps', gaps.length ? '' : 'disabled')}</div><p class="workshop-help">Removing a gap restores its road and supports. Ramp and landing edits stay; Undo restores the whole edit.</p></section>`
      : '';
    return (
      inspector +
      (gaps.length
        ? `<details class="workshop-jump-create" ${jumpCreateOpen ? 'open' : ''}><summary tabindex="0">Add another jump</summary>${creation}</details>`
        : creation)
    );
  }
  function renderPickups() {
    const pickups = doc.pickups ?? {
      preset: 'balanced',
      density: 0.5,
      devices: [],
    };
    return `<section class="workshop-section workshop-pickup-section"><div class="workshop-section-row"><h2>Pickups</h2><span>${pickups.devices.length} placed</span></div><p class="workshop-help">Fill the course with the game’s road devices. Gates follow the road through banks and turns.</p><label class="workshop-label">Pickup pattern<select data-editor-field="pickup-preset" aria-label="Pickup pattern">${PICKUP_PRESETS.map((preset) => option(preset.id, preset.label, pickups.preset === preset.id)).join('')}</select></label><label class="workshop-label">Pickup spacing<select data-editor-field="pickup-density" aria-label="Pickup spacing">${[
      [0.2, 'Sparse'],
      [0.5, 'Normal'],
      [0.85, 'Dense'],
    ]
      .map(([value, label]) => option(value, label, pickups.density === value))
      .join(
        '',
      )}${![0.2, 0.5, 0.85].includes(pickups.density) ? option(pickups.density, 'Custom spacing', true) : ''}</select></label>${button('fill-pickups', 'Fill with pickups', `class="workshop-wide" ${doc.points.length >= 4 ? '' : 'disabled'}`)}${button('clear-pickups', 'Clear pickups', `class="workshop-wide" ${pickups.devices.length ? '' : 'disabled'}`)}<div class="workshop-pickup-legend" aria-label="Pickup map legend">${Object.entries(
      PICKUP_LABELS,
    )
      .map(
        ([type, label]) =>
          `<span><i style="background:${deviceCSSColor(type)}"></i>${escape(label)}</span>`,
      )
      .join(
        '',
      )}</div><p class="workshop-help">Fill replaces the current device layout. Refill after reshaping the road to update safe placement. Undo restores the previous layout.</p></section>`;
  }
  function renderGenerator() {
    const generator = doc.generator;
    return `<section class="workshop-section"><h2>Generate a starter</h2><label class="workshop-label">${doc.courseType === 'downhill' ? 'Length including runout' : 'Length'}<select data-editor-field="length" aria-label="Generated track length">${[3000, 5000, 10000, 15000, 20000].map((length) => option(length, `${(length / 1000).toFixed(1)} km`, length === generator.length)).join('')}${![3000, 5000, 10000, 15000, 20000].includes(generator.length) ? option(generator.length, `${(generator.length / 1000).toFixed(1)} km`, true) : ''}</select></label><label class="workshop-checkbox"><input type="checkbox" data-editor-field="seed-jumps" ${seedJumps ? 'checked' : ''}><span>Include jumps</span></label><label class="workshop-checkbox"><input type="checkbox" data-editor-field="seed-pickups" ${seedPickups ? 'checked' : ''}><span>Include pickups</span></label>${button('generate', doc.courseType === 'downhill' ? 'Generate downhill' : 'Generate circuit', 'class="workshop-primary workshop-wide"')}<p class="workshop-help">Replaces the route. Undo restores your previous design.</p><details class="workshop-generator-details" ${generatorDetailsOpen ? 'open' : ''}><summary tabindex="0">Seed &amp; variations</summary><label class="workshop-label">Seed<input type="number" data-editor-field="seed" aria-label="Generator seed" min="0" max="4294967295" step="1" value="${generator.seed}"></label>${button('new-seed', 'Try another seed')}${range('bendiness', 'Bendiness', generator.bendiness, 0, 1, 0.05)}${range('elevation', 'Elevation variety', generator.elevation, 0, 1, 0.05)}<p class="workshop-help">The same seed and options give the same starting road.</p></details></section><section class="workshop-section"><h2>Start from nothing</h2>${button('blank', 'New blank track', 'class="workshop-wide"')}</section>`;
  }
  function renderLibrary() {
    return `<section class="workshop-section"><h2>My tracks</h2><p class="workshop-help">Save a draft, return later, or share a track file.</p><label class="workshop-label">Saved track<select data-editor-field="saved" aria-label="Saved track" ${records.length ? '' : 'disabled'}>${records.length ? records.map((record) => `<option value="${escape(record.id)}" ${record.id === savedId ? 'selected' : ''}>${escape(record.name)}</option>`).join('') : '<option>No saved tracks</option>'}</select></label><div class="workshop-button-row">${button('load', 'Load track', records.length ? '' : 'disabled')}${button('remove', 'Delete saved', records.length ? '' : 'disabled')}</div>${button('save', 'Save current track', 'class="workshop-wide"')}${button('save-copy', 'Save a copy', 'class="workshop-wide"')}<div class="workshop-section-divider"></div>${button('import', 'Import track file', 'class="workshop-wide"')}${button('export', 'Export track file', 'class="workshop-wide"')}<p class="workshop-help">Track files include the route, biome settings and scenery. Your hand edits stay with the track.</p></section>`;
  }
  function renderWorld() {
    return `<section class="workshop-section"><p class="workshop-eyebrow">ONE WORLD. YOUR VERSION.</p><h2>Choose a setting.</h2><p class="workshop-help">Each preset builds a complete Nightweir world around your road. Choose a seed to make it yours.</p><div class="workshop-preset-cards">${WORLD_PRESETS.map((preset, i) => `<button type="button" class="workshop-preset-card preset-${preset.id}" data-editor-action="preset-${preset.id}" aria-pressed="${doc.settings.sceneryPreset === preset.id}"><span class="workshop-preset-number">0${i + 1} / NIGHTWEIR</span><strong>${escape(preset.label)}</strong><span>${escape(preset.description)}</span><i class="workshop-preset-swatches" aria-hidden="true"><b></b><b></b><b></b></i></button>`).join('')}</div></section><section class="workshop-section"><label class="workshop-label">World seed<input type="number" data-editor-field="world-seed" aria-label="World seed" min="0" max="4294967295" step="1" value="${doc.generator.seed}"></label>${button('new-world-seed', 'Try another world seed', 'class="workshop-wide"')}<p class="workshop-help">The world rearranges around your road. Road points and jump gaps stay where you put them.</p></section>`;
  }
  function render({ frame = false } = {}) {
    if (disposed) return;
    const focus = focusKey();
    const precise = root.querySelector('.workshop-precise');
    if (precise) preciseOpen = precise.open;
    const jumpCreate = root.querySelector('.workshop-jump-create');
    if (jumpCreate) jumpCreateOpen = jumpCreate.open;
    const jumpManual = root.querySelector('.workshop-jump-manual');
    if (jumpManual) jumpManualOpen = jumpManual.open;
    const generatorDetails = root.querySelector('.workshop-generator-details');
    if (generatorDetails) generatorDetailsOpen = generatorDetails.open;
    const analysis = analysisFor();
    latestAnalysis = analysis;
    scheduleFlightPreview();
    root.querySelector('[data-editor-panel]').hidden = !panelOpen;
    root.querySelector('[data-editor-layout]').dataset.panelOpen =
      String(panelOpen);
    root.querySelector('[data-editor-panel-title]').textContent =
      {
        route: 'Road point',
        shape: 'Bank / twist',
        jumps: 'Jumps',
        world: 'World',
        pickups: 'Pickups',
        generate: 'Generate',
        library: 'My tracks',
      }[tab] ?? 'Tools';
    tools.innerHTML = panelOpen
      ? (
          {
            route: renderRoadPanel,
            shape: renderShape,
            jumps: renderJumps,
            world: renderWorld,
            pickups: renderPickups,
            generate: renderGenerator,
            library: renderLibrary,
          }[tab] ?? renderRoadPanel
        )()
      : '';
    root.querySelector('[data-editor-selection]').innerHTML = renderSelection();
    syncOverlayAccess();
    const nameControl = root.querySelector('[data-editor-field="name"]');
    if (document.activeElement !== nameControl) nameControl.value = doc.name;
    root.querySelector('[data-editor-field="course-type"]').value =
      doc.courseType;
    root.querySelector('[data-editor-course-label]').textContent =
      `TRACK EDITOR · ${doc.courseType === 'downhill' ? 'DOWNHILL' : 'CIRCUIT'}`;
    root.querySelector('[data-editor-facts]').innerHTML =
      `<span><strong>${(analysis.length / 1000).toFixed(2)}</strong> km</span><span><strong>${doc.width}</strong> m wide</span>${doc.courseType === 'downhill' ? `<span class="workshop-runout-fact">Includes ${DOWNHILL_RUNOUT} m runout</span>` : ''}<span class="workshop-draft-state">${JSON.stringify(doc) === saved ? 'Saved' : 'Unsaved draft'}</span>`;
    const locatedIssue =
      analysis.errors.length &&
      Number.isInteger(analysis.primaryIssue?.pointIndex)
        ? analysis.primaryIssue
        : null;
    root.querySelector('[data-editor-validation]').innerHTML = locatedIssue
      ? `${button('show-issue', `Point ${locatedIssue.pointIndex + 1} · ${locatedIssue.kind === 'bend' ? 'Tight corner' : escape(locatedIssue.label)} <span aria-hidden="true">↗</span>`, `class="workshop-issue-link" title="Select and zoom to point ${locatedIssue.pointIndex + 1}"`)}<span class="workshop-issue-message">${escape(locatedIssue.message)}</span>${canSmoothCorner(doc, analysis) ? button('smooth-corner', 'Auto fix corner', 'title="Smooth this corner and nearby road. Undo restores your layout."') : ''}${canSpreadRoad(doc) ? button('spread-road', 'Spread road out', 'title="Makes the road longer to give corners more room. Undo restores your layout."') : ''}`
      : analysis.errors.length
        ? `<strong>Before you drive</strong><ul>${analysis.errors
            .slice(0, 2)
            .map((error) => `<li>${escape(error)}</li>`)
            .join('')}</ul>`
        : `<strong class="workshop-valid">✓ Ready to drive</strong><span>${analysis.warnings.length ? escape(analysis.warnings[0]) : `${doc.courseType === 'downhill' ? 'Start to finish' : 'Closed route'} · Automatic supports · Scenery clearance`}</span>`;
    root.querySelector('[data-editor-action="tab-jumps"]').textContent =
      `Jumps (${doc.jumps.length})`;
    root.querySelector('[data-editor-action="tab-pickups"]').textContent =
      `Pickups (${doc.pickups?.devices.length ?? 0})`;
    const finishing = tool === 'draw' && doc.points.length >= 4;
    root.querySelector('[data-editor-action="finish-drawing"]').hidden =
      !finishing;
    for (const node of root.querySelectorAll('[data-editor-action]')) {
      const action = node.dataset.editorAction;
      if (action === 'undo') node.disabled = busy || !undo.length;
      else if (action === 'redo') node.disabled = busy || !redo.length;
      else if (action === 'reset-track')
        node.disabled = busy || !doc.points.length;
      else if (action === 'test') node.disabled = busy || !analysis.valid;
      else if (['show-issue', 'smooth-corner', 'spread-road'].includes(action))
        node.disabled = busy;
      else if (node.dataset.editorTool) {
        node.disabled = busy;
        node.setAttribute(
          'aria-pressed',
          String(node.dataset.editorTool === tool),
        );
      } else if (
        [
          'save',
          'save-copy',
          'load',
          'remove',
          'import',
          'export',
          'exit',
        ].includes(action)
      )
        node.disabled =
          busy || (['load', 'remove'].includes(action) && !records.length);
      if (action.startsWith('tab-'))
        node.setAttribute(
          'aria-pressed',
          String(panelOpen && action === `tab-${tab}`),
        );
      if (action.startsWith('view-'))
        node.setAttribute('aria-pressed', String(action === `view-${view}`));
    }
    root.querySelector('[data-editor-map-wrap]').hidden = view !== 'map';
    worldHost.hidden = view !== 'world';
    const activeTool = EDITOR_TOOLS.find((item) => item.id === tool);
    root.querySelector('[data-editor-view-hint]').textContent =
      `${activeTool.label.toUpperCase()} · ${activeTool.hint}`;
    syncCanvas({ frame });
    syncStatus();
    syncCameraUI();
    restoreFocus(focus);
  }
  function addPoint(position) {
    if (doc.points.length >= DOCUMENT_LIMITS.points) return;
    const current = doc.points[selected] ?? doc.points.at(-1);
    const point = {
      id: uid('point'),
      x: position?.x ?? (current?.x ?? -100) + 100,
      y: position?.y ?? current?.y ?? 52,
      z: position?.z ?? (current?.z ?? 0) + 100,
      bank: current?.bank ?? 0,
      roll: current?.roll ?? 0,
    };
    const next = clone(doc);
    const index = selected < 0 ? next.points.length : selected + 1;
    next.points.splice(index, 0, point);
    selected = index;
    rangeAnchor = index;
    rangeEnd = index;
    selectedProp = -1;
    commit(next, 'Route point added.', { frame: !position });
  }
  function insertPoint(index, position) {
    if (
      busy ||
      suspended ||
      disposed ||
      doc.points.length >= DOCUMENT_LIMITS.points
    )
      return;
    const next = clone(doc),
      before = next.points[Math.max(0, index - 1)],
      after = next.points[index % Math.max(1, next.points.length)];
    next.points.splice(index, 0, {
      id: uid('point'),
      x: position.x,
      y: position.y,
      z: position.z,
      bank: ((before?.bank ?? 0) + (after?.bank ?? 0)) / 2,
      roll: ((before?.roll ?? 0) + (after?.roll ?? 0)) / 2,
    });
    selected = index;
    selectedProp = -1;
    rangeAnchor = index;
    rangeEnd = index;
    tool = 'move';
    commit(next, 'Road point inserted. Drag its handle to shape the road.');
  }
  async function refreshLibrary() {
    records = await library.list();
    if (!records.some((record) => record.id === savedId))
      savedId = records[0]?.id ?? '';
  }
  async function run(operation) {
    if (busy) return;
    const invokingFocus = focusKey();
    busy = true;
    render();
    try {
      await operation();
    } catch (error) {
      status(error.message || 'The action could not finish.', 'error');
    } finally {
      busy = false;
      if (!disposed) {
        render();
        if (!suspended && !viewport.isFlying()) restoreFocus(invokingFocus);
      }
    }
  }
  async function action(name) {
    if (disposed || busy) return;
    if (
      panelOpen &&
      narrowLayout.matches &&
      [
        'view-world',
        'view-map',
        'focus-selection',
        'fit',
        'fly-camera',
        'orbit-left',
        'orbit-right',
        'tilt-up',
        'tilt-down',
        'zoom-in',
        'zoom-out',
        'pan-left',
        'pan-right',
        'pan-up',
        'pan-down',
        'reset-view',
      ].includes(name)
    ) {
      panelOpen = false;
      contextMenu = '';
      nudgeOpen = false;
      render();
    }
    if (name.startsWith('tab-')) {
      const nextTab = name.slice(4);
      panelOpen = !panelOpen || tab !== nextTab;
      tab = nextTab;
      panelOrigin = name;
      contextMenu = '';
      nudgeOpen = false;
      if (panelOpen && nextTab === 'jumps') {
        restoreJumpSelection();
        jumpCreateOpen = false;
        root.querySelector('.workshop-jump-create')?.removeAttribute('open');
      }
      render();
      if (panelOpen) root.querySelector('[data-editor-panel]').scrollTop = 0;
      return;
    }
    if (name.startsWith('preset-')) {
      const preset = WORLD_PRESETS.find((entry) => entry.id === name.slice(7));
      if (preset)
        edit((next) => {
          next.settings.sceneryPreset = preset.id;
          next.settings.density = preset.density;
          next.settings.waterLevel = preset.waterLevel;
          next.props = [];
        }, `${preset.label} world applied. Your road is unchanged.`);
      return;
    }
    if (name === 'new-world-seed') {
      edit((next) => {
        next.generator.seed = Math.floor(Math.random() * 4294967296);
      }, 'A new world around the same road.');
      return;
    }
    if (name === 'tunes') {
      if (typeof onTunes === 'function')
        onTunes(root.querySelector('[data-editor-action="tunes"]'));
      return;
    }
    if (name === 'panel-close') {
      panelOpen = false;
      render();
      (
        root.querySelector(`[data-editor-action="${panelOrigin}"]`) ??
        root.querySelector('[data-editor-action="select-mode"]')
      )?.focus();
      return;
    }
    if (name === 'spread-road') {
      status('Giving the road more room…');
      let spread = false;
      await run(async () => {
        await new Promise((done) => requestAnimationFrame(done));
        const next = spreadRoad(doc);
        tool = 'move';
        panelOpen = false;
        contextMenu = '';
        nudgeOpen = false;
        commit(
          next,
          'Road spread out. The layout is longer; Undo restores your original road.',
          { frame: true },
        );
        if (view === 'world') viewport.reset();
        else map.fit();
        spread = true;
      });
      if (spread)
        root.querySelector('[data-editor-action="select-mode"]')?.focus();
      return;
    }
    if (name === 'show-issue') {
      const issue = analysisFor().primaryIssue;
      if (!issue || !Number.isInteger(issue.pointIndex)) return;
      selected = issue.pointIndex;
      selectedProp = -1;
      rangeAnchor = selected;
      rangeEnd = selected;
      tool = 'move';
      panelOpen = false;
      contextMenu = '';
      view = 'world';
      render();
      viewport.setVisible(!suspended);
      viewport.focusSelection();
      status(issue.label || issue.message);
      return;
    }
    if (name === 'smooth-corner') {
      const issue = analysisFor().primaryIssue;
      let repaired = false;
      status('Smoothing the corner and checking the road…');
      await run(async () => {
        await new Promise((done) => requestAnimationFrame(done));
        const next = await smoothCorner(doc, {
          analysis: analysisFor(),
          yieldControl: () =>
            new Promise((done) => requestAnimationFrame(done)),
        });
        selected = issue.pointIndex;
        selectedProp = -1;
        rangeAnchor = selected;
        rangeEnd = selected;
        panelOpen = false;
        contextMenu = '';
        tool = 'move';
        commit(
          next,
          `Corner near point ${selected + 1} smoothed. Ready to drive; Undo restores your road.`,
        );
        if (view === 'world') viewport.focusSelection();
        else map.fit();
        repaired = true;
      });
      if (repaired)
        root.querySelector('[data-editor-action="select-mode"]')?.focus();
      return;
    }
    if (name === 'finish-drawing') {
      tool = 'move';
      contextMenu = '';
      nudgeOpen = false;
      panelOpen = false;
      status(
        doc.courseType === 'circuit'
          ? 'Circuit connected. Drag any road point to shape it.'
          : 'Road drawn. Drag points to shape the descent.',
      );
      render({ frame: true });
      if (view === 'world') viewport.reset();
      else map.fit();
      root.querySelector('[data-editor-action="select-mode"]')?.focus();
      return;
    }
    const chosenTool = EDITOR_TOOLS.find((item) => item.action === name);
    if (chosenTool) {
      viewport.cancelInteraction();
      viewport.exitFly();
      tool = chosenTool.id;
      contextMenu = '';
      nudgeOpen = false;
      rangeArmed = false;
      selectedProp = -1;
      panelOpen = false;
      if (tool === 'orbit') view = 'world';
      status(`${chosenTool.label}: ${chosenTool.hint}`);
      render();
      viewport.setVisible(view === 'world' && !suspended);
      return;
    }
    if (name === 'context-prev' || name === 'context-next') {
      const index = Math.max(
        0,
        Math.min(
          doc.points.length - 1,
          (selected < 0 ? 0 : selected) + (name === 'context-prev' ? -1 : 1),
        ),
      );
      selectPoint(index);
      return;
    }
    if (name === 'select-section') {
      if (selected < 0) {
        status('Click a road point first.');
        return;
      }
      rangeAnchor = selected;
      rangeEnd = selected;
      rangeArmed = true;
      contextMenu = 'shape';
      nudgeOpen = false;
      status(
        'Click another road point to choose the section. Shift-click works too.',
      );
      render();
      return;
    }
    if (name === 'range-expand' || name === 'range-shrink') {
      const span = selectedRange();
      if (!span) return;
      rangeAnchor = span.start;
      rangeEnd = Math.max(
        span.start + 1,
        Math.min(
          doc.points.length - 1,
          span.end + (name === 'range-expand' ? 1 : -1),
        ),
      );
      selected = rangeEnd;
      render();
      return;
    }
    if (name === 'context-shape' || name === 'context-more') {
      contextMenu = contextMenu === name.slice(8) ? '' : name.slice(8);
      nudgeOpen = false;
      render();
      return;
    }
    if (name === 'context-move') {
      nudgeOpen = !nudgeOpen;
      contextMenu = '';
      render();
      return;
    }
    if (name === 'context-menu-close') {
      contextMenu = '';
      nudgeOpen = false;
      render();
      return;
    }
    if (name === 'context-details') {
      panelOpen = !panelOpen || tab !== (selectedProp >= 0 ? 'world' : 'route');
      tab = selectedProp >= 0 ? 'world' : 'route';
      panelOrigin = 'context-details';
      contextMenu = '';
      render();
      return;
    }
    if (name === 'context-raise' || name === 'context-lower') {
      if (selected < 0) return;
      edit((next) => {
        next.points[selected].y = Math.max(
          0,
          Math.min(
            3000,
            next.points[selected].y + (name === 'context-raise' ? 10 : -10),
          ),
        );
      }, 'Road height updated.');
      return;
    }
    if (
      [
        'context-north',
        'context-south',
        'context-east',
        'context-west',
      ].includes(name)
    )
      return action(name.slice(8));
    if (
      ['quick-90', 'quick-180', 'quick-270', 'quick-straight'].includes(name)
    ) {
      try {
        const preset = name.slice(6),
          metres = { 90: 220, 180: 360, 270: 500, straight: 160 }[preset];
        const span = forwardSpan(metres);
        shapeStart = span.start;
        shapeEnd = span.end;
        shapePreset = preset;
        return action('apply-shape');
      } catch (error) {
        status(error.message, 'error');
        return;
      }
    }
    if (name === 'quick-jump') {
      const existing = jumpAtPoint();
      panelOpen = true;
      tab = 'jumps';
      panelOrigin = 'quick-jump';
      contextMenu = '';
      if (existing) {
        selectedJumpId = existing.id;
        jumpCreateOpen = false;
      } else {
        jumpCreateOpen = true;
        jumpSuggestion = null;
        jumpManualChosen = false;
      }
      const creation = root.querySelector('.workshop-jump-create');
      if (creation) creation.open = !existing;
      render();
      if (!existing) {
        const control = root.querySelector(
          '[data-editor-action="find-jump-section"]',
        );
        control?.scrollIntoView({ block: 'nearest' });
        control?.focus({ preventScroll: true });
      }
      return;
    }
    if (name === 'find-jump-section') {
      status('Finding a clear launch and landing…');
      await run(async () => {
        const source = doc;
        const suggestion = await findNextSuitableJump(source, {
          fromIndex: Math.max(0, selected),
          receiving: jumpReceiving,
          rampAssist: jumpRampAssist,
          analysis: analysisFor(),
          fractions: fractionsFor(),
          yieldControl: () =>
            new Promise((done) => requestAnimationFrame(done)),
          onProgress: ({ attempt, total }) =>
            status(`Checking jump section ${attempt} of ${total}…`),
        });
        jumpSuggestion = {
          ...suggestion,
          source,
          receiving: jumpReceiving,
          rampAssist: jumpRampAssist,
        };
        jumpStart = suggestion.startIndex;
        jumpEnd = suggestion.endIndex;
        jumpManualChosen = true;
        rangeAnchor = jumpStart;
        rangeEnd = jumpEnd;
        selected = jumpStart;
        status(
          `Clear section found: points ${jumpStart + 1}–${jumpEnd + 1}. Choose Add jump gap to apply it.`,
        );
      });
      if (jumpSuggestion?.source === doc && view === 'world')
        viewport.focusRoute({
          start: fractionAt(jumpStart),
          end: fractionAt(jumpEnd),
        });
      return;
    }
    if (name.startsWith('view-')) {
      const next = name.slice(5);
      if (view !== next) {
        view = next;
        previewMessage = 'Building your world…';
        render();
        viewport.setVisible(view === 'world' && !suspended);
        if (next === 'map') map.fit();
      }
      return;
    }
    if (name === 'undo' || name === 'redo') {
      const source = name === 'undo' ? undo : redo,
        destination = name === 'undo' ? redo : undo;
      if (!source.length) return;
      destination.push(clone(doc));
      const previousPoints = new Set(doc.points.map((point) => point.id));
      doc = source.pop();
      const replacedRoute = !doc.points.some((point) =>
        previousPoints.has(point.id),
      );
      restoreJumpSelection();
      selected = Math.min(Math.max(selected, 0), doc.points.length - 1);
      selectedProp = -1;
      rangeAnchor = selected;
      rangeEnd = selected;
      status(name === 'undo' ? 'Edit undone.' : 'Edit restored.');
      jumpSuggestion = null;
      jumpManualChosen = false;
      render({ frame: replacedRoute });
      return;
    }
    if (name === 'add-point') {
      addPoint();
      return;
    }
    if (name === 'delete-point' && selected >= 0) {
      edit((next) => next.points.splice(selected, 1), 'Route point deleted.');
      return;
    }
    if (['north', 'south', 'east', 'west'].includes(name) && selected >= 0) {
      edit((next) => {
        const p = next.points[selected];
        if (name === 'north') p.z -= step;
        if (name === 'south') p.z += step;
        if (name === 'east') p.x += step;
        if (name === 'west') p.x -= step;
      }, 'Route point moved.');
      return;
    }
    if ((name === 'earlier' || name === 'later') && selected >= 0) {
      const target = selected + (name === 'earlier' ? -1 : 1);
      if (target < 0 || target >= doc.points.length) return;
      const next = clone(doc);
      [next.points[selected], next.points[target]] = [
        next.points[target],
        next.points[selected],
      ];
      selected = target;
      commit(next, 'Point order changed.');
      return;
    }
    if (name === 'add-jump') {
      try {
        const startId = doc.points[jumpStart]?.id,
          endId = doc.points[jumpEnd]?.id;
        const next =
          jumpSuggestion?.source === doc &&
          jumpSuggestion.startIndex === jumpStart &&
          jumpSuggestion.endIndex === jumpEnd &&
          jumpSuggestion.receiving === jumpReceiving &&
          jumpSuggestion.rampAssist === jumpRampAssist
            ? jumpSuggestion.document
            : addJump(doc, {
                startIndex: jumpStart,
                endIndex: jumpEnd,
                receiving: jumpReceiving,
                rampAssist: jumpRampAssist,
              });
        selectedJumpId = next.jumps.at(-1).id;
        jumpStart = next.points.findIndex((point) => point.id === startId);
        jumpEnd = next.points.findIndex((point) => point.id === endId);
        selected = jumpEnd;
        rangeAnchor = jumpStart;
        rangeEnd = jumpEnd;
        jumpCreateOpen = false;
        root.querySelector('.workshop-jump-create')?.removeAttribute('open');
        commit(
          next,
          'Jump gap added. Compare cruise and boost paths, then test the landing.',
        );
      } catch (error) {
        status(error.message, 'error');
      }
      return;
    }
    if (name === 'remove-jump') {
      edit((next) => {
        next.jumps = next.jumps.filter((entry) => entry.id !== selectedJumpId);
      }, 'Gap removed. The road is restored; point heights are retained.');
      return;
    }
    if (name === 'clear-jumps') {
      edit((next) => {
        next.jumps = [];
      }, 'All gaps removed. Point heights are retained.');
      return;
    }
    if (name === 'inspect-jump' && flightPreview?.cruise) {
      if (view !== 'world') {
        view = 'world';
        previewMessage = 'Building your world…';
        render();
        viewport.setVisible(!suspended);
      }
      viewport.focusTrajectories(flightLines(), {
        launch: flightPreview.launch,
        landing: flightPreview.landing,
      });
      return;
    }
    if (name === 'apply-shape') {
      try {
        const startId = doc.points[shapeStart]?.id;
        const endId = doc.points[shapeEnd]?.id;
        const next = applySectionShape(doc, {
          startIndex: shapeStart,
          endIndex: shapeEnd,
          type: shapePreset === 'straight' ? 'straight' : 'roll',
          angle:
            shapePreset === 'straight'
              ? 0
              : ((Number(shapePreset) * Math.PI) / 180) *
                (shapeDirection === 'left' ? -1 : 1),
        });
        shapeStart = next.points.findIndex((point) => point.id === startId);
        shapeEnd = next.points.findIndex((point) => point.id === endId);
        selected = shapeEnd;
        rangeAnchor = shapeStart;
        rangeEnd = shapeEnd;
        contextMenu = '';
        commit(
          next,
          shapePreset === 'straight'
            ? 'Section holds its starting road angle.'
            : `${shapePreset}° ${shapeDirection} roll added. Continue from its end point.`,
        );
      } catch (error) {
        status(error.message, 'error');
        render();
      }
      return;
    }
    if (name === 'inspect-shape') {
      try {
        const start = fractionAt(shapeStart),
          end = fractionAt(shapeEnd);
        if (view !== 'world') {
          view = 'world';
          previewMessage = 'Building your world…';
          render();
          viewport.setVisible(!suspended);
        }
        viewport.focusRoute({ start, end });
      } catch (error) {
        status(error.message, 'error');
      }
      return;
    }
    if (name === 'fill-pickups') {
      try {
        const layout = generatePickupLayout(doc, {
          preset: doc.pickups?.preset ?? 'balanced',
          density: doc.pickups?.density ?? 0.5,
        });
        edit((next) => {
          next.pickups = layout;
        }, `${layout.devices.length} pickups placed along the course.`);
      } catch (error) {
        status(error.message, 'error');
      }
      return;
    }
    if (name === 'clear-pickups') {
      edit((next) => {
        next.pickups.devices = [];
      }, 'Pickups cleared. Undo restores the layout.');
      return;
    }
    if (name === 'generate' || name === 'quick-start') {
      status('Generating your track and world…');
      await run(async () => {
        await new Promise((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(resolve)),
        );
        const starter = name === 'quick-start';
        const next = generateDocument({
          ...(starter
            ? { seed: 42017, length: 3000, bendiness: 0.45, elevation: 0.35 }
            : doc.generator),
          seedJumps: starter || seedJumps,
          courseType: doc.courseType,
          width: starter ? 40 : doc.width,
          ...doc.settings,
        });
        next.id = doc.id;
        next.name = doc.name;
        next.props = [];
        next.rolls = [];
        const pickupOptions = {
          preset: doc.pickups?.preset ?? 'balanced',
          density: doc.pickups?.density ?? 0.5,
        };
        next.pickups =
          starter || seedPickups
            ? generatePickupLayout(next, pickupOptions)
            : { version: 1, ...pickupOptions, devices: [] };
        selected = 0;
        selectedProp = -1;
        rangeAnchor = 0;
        rangeEnd = 0;
        tool = 'move';
        panelOpen = false;
        contextMenu = '';
        view = 'world';
        jumpStart = Math.floor(next.points.length * 0.2);
        jumpEnd = Math.min(next.points.length - 2, jumpStart + 2);
        commit(
          next,
          `${doc.courseType === 'downhill' ? 'Downhill course' : 'Circuit'} generated from seed ${next.generator.seed}: ${next.jumps.length} ${next.jumps.length === 1 ? 'jump' : 'jumps'}, ${next.pickups.devices.length} pickups. Drag road points to make it yours.`,
          {
            frame: true,
          },
        );
        viewport.setVisible(!suspended);
      });
      root.querySelector('[data-editor-action="select-mode"]')?.focus();
      return;
    }
    if (name === 'blank' || name === 'reset-track') {
      viewport.cancelInteraction();
      selected = -1;
      selectedProp = -1;
      tab = 'route';
      panelOpen = false;
      tool = 'draw';
      rangeAnchor = -1;
      rangeEnd = -1;
      contextMenu = '';
      view = 'world';
      const next = createDocument({
        seed: doc.generator.seed,
        blank: true,
        courseType: doc.courseType,
      });
      if (name === 'reset-track') {
        next.id = doc.id;
        next.name = doc.name;
        next.width = doc.width;
        next.generator = clone(doc.generator);
        next.settings = clone(doc.settings);
      }
      commit(
        next,
        name === 'reset-track'
          ? 'Track reset. Undo restores your road, jumps and pickups.'
          : 'Blank track created. Undo can restore your previous draft.',
        { frame: true },
      );
      viewport.setVisible(!suspended);
      root.querySelector('[data-editor-action="draw-mode"]')?.focus();
      return;
    }
    if (name === 'new-seed') {
      edit((next) => {
        next.generator.seed = Math.floor(Math.random() * 4294967296);
      }, 'New seed selected. Choose Generate circuit to use it.');
      return;
    }
    if (name === 'fly-camera') {
      if (viewport.isFlying()) viewport.exitFly();
      else if (!viewport.enterFly())
        status('Wait for the world preview to finish loading.');
      return;
    }
    if (name === 'focus-selection') {
      if (view === 'world') viewport.focusSelection();
      else map.fit();
      return;
    }
    if (name === 'fit') {
      if (view === 'world') viewport.reset();
      else map.fit();
      return;
    }
    if (name === 'orbit-left' || name === 'orbit-right') {
      viewport.orbit(name === 'orbit-left' ? -1 : 1);
      return;
    }
    if (name === 'tilt-up' || name === 'tilt-down') {
      viewport.tilt(name === 'tilt-up' ? 1 : -1);
      return;
    }
    if (name === 'zoom-in' || name === 'zoom-out') {
      viewport.zoom(name === 'zoom-in' ? -1 : 1);
      return;
    }
    if (['pan-left', 'pan-right', 'pan-up', 'pan-down'].includes(name)) {
      const x = name === 'pan-left' ? -1 : name === 'pan-right' ? 1 : 0;
      const y = name === 'pan-up' ? 1 : name === 'pan-down' ? -1 : 0;
      if (view === 'map') map.pan(x, y);
      else viewport.pan(x, y);
      return;
    }
    if (name === 'reset-view') {
      viewport.reset();
      return;
    }
    if (name === 'exit') {
      onExit(clone(doc));
      return;
    }
    if (name === 'test') {
      if (!analysisFor().valid) return;
      await run(async () => {
        status('Preparing Test Drive…');
        await onTestDrive(clone(doc));
      });
      return;
    }
    if (name === 'save' || name === 'save-copy') {
      await run(async () => {
        const next = clone(doc);
        if (name === 'save-copy') {
          next.id = uid('track');
          next.name = `${next.name.slice(0, 55)} copy`;
        }
        const current = doc;
        doc = validateDocument(await library.save(next));
        if (analysisCache.has(current))
          analysisCache.set(doc, analysisCache.get(current));
        if (fractionCache.has(current))
          fractionCache.set(doc, fractionCache.get(current));
        saved = JSON.stringify(doc);
        savedId = doc.id;
        await refreshLibrary();
        status('Track saved to My tracks.');
      });
      return;
    }
    if (name === 'load') {
      await run(async () => {
        const next = await library.read(savedId);
        if (!next) throw new Error('This saved track is no longer available.');
        tool = next.points.length < 4 ? 'draw' : 'move';
        selected = next.points.length ? 0 : -1;
        rangeAnchor = selected;
        rangeEnd = selected;
        commit(next, 'Track loaded.', { frame: true });
        restoreJumpSelection();
        saved = JSON.stringify(doc);
        selected = doc.points.length ? 0 : -1;
        selectedProp = -1;
      });
      return;
    }
    if (name === 'remove') {
      await run(async () => {
        const record = records.find((item) => item.id === savedId);
        await library.remove(savedId);
        if (savedId === doc.id) saved = '';
        await refreshLibrary();
        status(
          `${record?.name ?? 'Track'} removed from My tracks. The current draft is still open.`,
        );
      });
      return;
    }
    if (name === 'import') {
      await run(async () => {
        const next = await library.import();
        if (!next) {
          status('Import canceled.');
          return;
        }
        const imported = validateDocument(next);
        tool = imported.points.length < 4 ? 'draw' : 'move';
        selected = imported.points.length ? 0 : -1;
        rangeAnchor = selected;
        rangeEnd = selected;
        commit(imported, 'Track imported. Save it to keep it in My tracks.', {
          frame: true,
        });
        selected = doc.points.length ? 0 : -1;
        selectedProp = -1;
        restoreJumpSelection();
      });
      return;
    }
    if (name === 'export') {
      await run(async () => {
        const result = await library.export(clone(doc));
        status(result ? 'Track file exported.' : 'Export canceled.');
      });
    }
  }
  root.addEventListener(
    'click',
    (event) => {
      const target = event.target.closest('[data-editor-action]');
      if (target && !target.disabled) action(target.dataset.editorAction);
    },
    { signal: life.signal },
  );
  function fieldChange(event) {
    const field = event.target.dataset.editorField;
    if (!field || busy) return;
    const value = event.target.value;
    const number = Number(value);
    if (field === 'course-type') {
      try {
        commit(
          setCourseType(doc, value),
          `${value === 'downhill' ? 'Downhill' : 'Circuit'} selected. Road points kept; gap and pickup layouts cleared. Undo restores them.`,
          { frame: true },
        );
      } catch (error) {
        status(error.message, 'error');
      }
      return;
    }
    if (
      [
        'jump-start',
        'jump-end',
        'jump-receiving',
        'jump-ramp',
        'jump-selected',
      ].includes(field)
    ) {
      if (
        ['jump-start', 'jump-end', 'jump-receiving', 'jump-ramp'].includes(
          field,
        )
      ) {
        jumpSuggestion = null;
        jumpManualChosen = true;
      }
      if (field === 'jump-start') {
        jumpStart = number;
      }
      if (field === 'jump-end') {
        jumpEnd = number;
      }
      if (field === 'jump-ramp') jumpRampAssist = event.target.checked;
      if (field === 'jump-receiving') jumpReceiving = number;
      if (field === 'jump-selected') {
        selectedJumpId = value || null;
        const gap = (doc.jumps ?? []).find((entry) => entry.id === value);
        if (gap) {
          jumpReceiving = gap.receiving;
          const fractions = fractionsFor();
          const nearest = (at) =>
            fractions.reduce(
              (best, fraction, i) =>
                Math.abs(fraction - at) < Math.abs(fractions[best] - at)
                  ? i
                  : best,
              0,
            );
          jumpStart = nearest(gap.start);
          jumpEnd = nearest(gap.end);
          selected = jumpEnd;
        }
      }
      render();
      return;
    }
    if (field === 'selected-jump-receiving') {
      if ((doc.jumps ?? []).some((entry) => entry.id === selectedJumpId))
        edit((next) => {
          next.jumps.find((entry) => entry.id === selectedJumpId).receiving =
            number;
        }, 'Selected gap landing runout updated.');
      return;
    }
    if (field === 'point') {
      selectPoint(number);
      return;
    }

    if (field === 'quick-direction') {
      shapeDirection = value;
      render();
      return;
    }
    if (field === 'context-step') {
      step = number;
      return;
    }
    if (field === 'seed-pickups') {
      seedPickups = event.target.checked;
      return;
    }
    if (field === 'seed-jumps') {
      seedJumps = event.target.checked;
      return;
    }
    if (
      ['shape-start', 'shape-end', 'shape-preset', 'shape-direction'].includes(
        field,
      )
    ) {
      if (field === 'shape-start') shapeStart = number;
      if (field === 'shape-end') shapeEnd = number;
      if (field === 'shape-preset') shapePreset = value;
      if (field === 'shape-direction') shapeDirection = value;
      render();
      return;
    }
    if (field === 'saved') {
      savedId = value;
      return;
    }
    if (field === 'step') {
      step = number;
      return;
    }
    edit(
      (next) => {
        if (field === 'name') next.name = value;
        else if (field === 'world-seed') next.generator.seed = number;
        else if (field === 'width') next.width = number;
        else if (field === 'pickup-preset') next.pickups.preset = value;
        else if (field === 'pickup-density') next.pickups.density = number;
        else if (['seed', 'length', 'bendiness', 'elevation'].includes(field))
          next.generator[field] = number;
        else if (['density', 'waterLevel'].includes(field))
          next.settings[field] = number;
        else if (field.startsWith('point-') && selected >= 0)
          next.points[selected][field.slice(6)] =
            field === 'point-bank' ? (number * Math.PI) / 180 : number;
        else if (field.startsWith('prop-') && selectedProp >= 0) {
          const key = field.slice(5);
          next.props[selectedProp][key] =
            key === 'type'
              ? value
              : key === 'distance'
                ? number / 100
                : key === 'rotation'
                  ? (number * Math.PI) / 180
                  : number;
        }
      },
      field.startsWith('point-')
        ? 'Route point updated.'
        : field.startsWith('prop-')
          ? 'Scenery updated.'
          : 'Track settings updated.',
    );
  }
  root.addEventListener('change', fieldChange, { signal: life.signal });
  root.addEventListener(
    'toggle',
    (event) => {
      if (!event.target.isConnected) return;
      if (event.target.matches('.workshop-precise'))
        preciseOpen = event.target.open;
      if (event.target.matches('.workshop-jump-create'))
        jumpCreateOpen = event.target.open;
      if (event.target.matches('.workshop-jump-manual'))
        jumpManualOpen = event.target.open;
      if (event.target.matches('.workshop-generator-details'))
        generatorDetailsOpen = event.target.open;
    },
    { capture: true, signal: life.signal },
  );
  root.addEventListener(
    'input',
    (event) => {
      if (event.target.type !== 'range') return;
      const output =
        event.target.previousElementSibling?.querySelector('output');
      if (output)
        output.textContent =
          event.target.value +
          (output.textContent.endsWith(' m')
            ? ' m'
            : output.textContent.endsWith('°')
              ? '°'
              : output.textContent.endsWith('%')
                ? '%'
                : '');
    },
    { signal: life.signal },
  );
  root.addEventListener(
    'keydown',
    (event) => {
      if (event.key === 'Escape') {
        if (viewport.isFlying()) {
          event.preventDefault();
          event.stopPropagation();
          viewport.exitFly();
          return;
        }
        const cameraMenu = root.querySelector('.workshop-camera-menu');
        if (cameraMenu.open) {
          event.preventDefault();
          event.stopPropagation();
          cameraMenu.open = false;
          cameraMenu.querySelector('summary').focus();
          return;
        }
        if (contextMenu || nudgeOpen) {
          event.preventDefault();
          event.stopPropagation();
          contextMenu = '';
          nudgeOpen = false;
          render();
          return;
        }
        if (panelOpen) {
          event.preventDefault();
          event.stopPropagation();
          action('panel-close');
          return;
        }
        event.preventDefault();
        event.stopPropagation();
        if (!busy) onExit(clone(doc));
        return;
      }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
        event.preventDefault();
        if (
          event.target.matches('input[type="text"], input[type="number"]') &&
          event.target.dataset.editorField
        ) {
          fieldChange({ target: event.target });
          if (messageKind === 'error') return;
        }
        action('save');
      }
      if (
        (event.ctrlKey || event.metaKey) &&
        event.key.toLowerCase() === 'z' &&
        !event.target.matches('input[type="text"],input[type="number"]')
      ) {
        event.preventDefault();
        action(event.shiftKey ? 'redo' : 'undo');
      }
      if (
        !event.ctrlKey &&
        !event.metaKey &&
        !event.altKey &&
        !event.shiftKey &&
        !event.repeat &&
        !viewport.isFlying() &&
        !event.target.closest(
          'input, select, textarea, [contenteditable="true"]',
        )
      ) {
        const chosen = EDITOR_TOOLS.find(
          (item) => item.key === event.key.toUpperCase(),
        );
        if (chosen) {
          event.preventDefault();
          event.stopPropagation();
          action(chosen.action);
        }
      }
    },
    { signal: life.signal },
  );
  render({ frame: true });
  viewport.setVisible(true);
  root
    .querySelector(
      `[data-editor-action="${!doc.points.length ? 'quick-start' : tool === 'draw' ? 'draw-mode' : 'select-mode'}"]`,
    )
    .focus({ preventScroll: true });
  refreshLibrary()
    .then(() => {
      if (!disposed && tab === 'library') render();
    })
    .catch((error) => status(error.message, 'error'));
  return {
    getDocument: () => clone(doc),
    getState: () => ({
      selectedPoint: selected,
      selectedProp,
      drawMode: tool === 'draw',
      tool,
      panelOpen,
      selectionRange: selectedRange(),
      shapeStart,
      shapeEnd,
      pickupCount: doc.pickups?.devices.length ?? 0,
      courseType: doc.courseType,
      jumpCount: doc.jumps?.length ?? 0,
      jumpPreview: flightPreview?.cruise
        ? {
            cruise: flightPreview.cruise.status,
            boost: flightPreview.boost.status,
          }
        : null,
      primaryIssue: latestAnalysis?.primaryIssue ?? null,
      dirty: JSON.stringify(doc) !== saved,
      view,
      tab,
      busy,
      suspended,
      points: doc.points.length,
      preview: viewport.getMetrics(),
      flyActive: viewport.isFlying(),
    }),
    suspend() {
      suspended = true;
      host.hidden = true;
      viewport.setVisible(false);
    },
    resume() {
      if (disposed) return;
      suspended = false;
      host.hidden = false;
      status('Back in Workshop. Your draft is ready.');
      render();
      viewport.setVisible(view === 'world');
      root
        .querySelector('[data-editor-action="test"]')
        .focus({ preventScroll: true });
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      life.abort();
      clearTimeout(flightTimer);
      ++flightVersion;
      map.dispose();
      viewport.dispose();
      root.remove();
      host.classList.remove('track-editor-host');
    },
  };
}
