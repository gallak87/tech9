import './style.css';
import { environmentThumbnail } from './environment-thumbnails.js';
import {
  createDocument,
  generateDocumentAsync,
  validateDocument,
  analyzeDocument,
  DOCUMENT_LIMITS,
  DOWNHILL_RUNOUT,
  applySectionShape,
  pointRouteFractions,
  addJump,
  setCourseType,
  documentIdentity,
  ENVIRONMENT_LAYOUT_VERSION,
  GENERATOR_VERSION,
} from './document.js';
import { createTrackLibrary } from './library.js';
import { createDraftRecovery } from './draft-recovery.js';
import { createRouteMap } from './map.js';
import { createEditorViewport, editorWorldFingerprint } from './viewport.js';
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
import { ROAD_PRESETS, roadPresetOptions } from './road-presets.js';
import { PLAYABLE_STARTERS } from './playable-starters.js';
import { EDITOR_BIOMES, editorBiome } from './biomes.js';
import { findNextSuitableJump } from './jump-placement.js';
import { prepareJumpEdit } from './jump-authoring.js';
import {
  resolveEditorTestStart,
  getEditorTestStartSummary,
} from './test-drive.js';
import { canSpreadRoad, spreadRoad } from './road-room.js';
import { EDITOR_TOOLS } from './tools.js';
import { smoothCorner, canSmoothCorner } from './corner-repair.js';
import {
  applyBiomeSpan,
  clearBiomeSpan,
  ROAD_SPAN_BIOMES,
} from './biome-spans.js';

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

const AUTHOR_GROUPS = [
  ['route', 'Point'],
  ['shape', 'Road section'],
  ['jumps', 'Jumps'],
];
const GLOBAL_GROUPS = [
  ['generate', 'Create road'],
  ['world', 'Environment'],
  ['pickups', 'Fill with pickups'],
  ['library', 'File'],
];
const PANEL_SECTIONS = [...AUTHOR_GROUPS, ...GLOBAL_GROUPS];
const PREVIEW_TOOLS = EDITOR_TOOLS.filter(({ id }) =>
  ['draw', 'move', 'height'].includes(id),
);
const TEST_MENU_ACTIONS = [
  ['test-selected-point', 'From selected point', 'point'],
  ['test-selected-jump', 'This jump', 'jump'],
  ['test-retry', 'Retry last', 'retry'],
];
const TEST_ACTIONS = new Map([
  ['test', 'course'],
  ['test-point', 'point'],
  ['test-jump', 'jump'],
  ...TEST_MENU_ACTIONS.map(([action, , kind]) => [action, kind]),
]);

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
    recovery = createDraftRecovery(),
  } = {},
) {
  const previewShip = getShip(shipId);
  let doc = validateDocument(
    initial ?? createDocument({ seed: 42017, blank: true }),
  );
  if (!initial && !doc.points.length) {
    const {
      generatorVersion,
      courseType: ignoredType,
      ...preferences
    } = roadPresetOptions('flowing', {
      courseType: doc.courseType,
      length: doc.generator.length,
    });
    Object.assign(doc.generator, preferences, { version: generatorVersion });
    void ignoredType;
  }
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
  let showFlightPaths = false;
  let flightReportMarkup = '';
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
  let recoveryEntry = null;
  let recoveryError = '';
  let recoveryState = '';
  let recoveryTimer;
  let checkpointJSON = JSON.stringify(doc);
  try {
    if (!initial) recoveryEntry = recovery.read();
  } catch {
    recoveryError =
      'Draft recovery unavailable. Save or Export to keep your work.';
  }
  let tab = 'route';
  let authorGroup = '';
  let globalGroup = '';
  let context = 'road';
  const workspacePanels = { road: '', environment: 'world' };
  let roadAuthorGroup = '';
  const openDetails = new Map();
  function details(key, label, content) {
    return `<details class="workshop-advanced" data-editor-details="${key}" ${openDetails.get(key) ? 'open' : ''}><summary tabindex="0">${label}</summary>${content}</details>`;
  }
  let environmentKey = '';
  let environmentDraft;
  function syncEnvironmentDraft() {
    const key = JSON.stringify([doc.biome, doc.environment, doc.settings]);
    if (key === environmentKey) return;
    environmentKey = key;
    environmentDraft = {
      biome: doc.biome,
      seed: doc.environment?.seed ?? doc.generator.seed,
      ...clone(doc.settings),
    };
  }
  syncEnvironmentDraft();
  const groupScroll = new Map();
  let layoutKey = '';
  const view = 'world';
  let mapOpen = false;
  let tool = doc.points.length < 4 ? 'draw' : 'move';
  let rangeAnchor = selected;
  let rangeEnd = selected;
  let rangeArmed = false;
  let seedPickups = true;
  let starterPromptDismissedFor = null;
  let jumpManualChosen = false;
  let jumpSuggestion = null;
  let jumpSizePreset = 'small';
  let jumpCandidate = null;
  let jumpProposalError = '';
  let lastTestAttempt = null;
  let testReturnAction = 'test';
  let testEntrySpeed = 'cruise';
  let testReserve = 'full';
  let roadSpanBiome = ROAD_SPAN_BIOMES[1];
  const hasJumpCandidate = () =>
    jumpCandidate?.sourceKey === JSON.stringify(doc);
  const analysisCache = new WeakMap();
  const fractionCache = new WeakMap();
  function analysisFor() {
    const revision = dragBefore ?? doc;
    if (!analysisCache.has(revision))
      analysisCache.set(revision, analyzeDocument(revision));
    return analysisCache.get(revision);
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
  let activeSection = null;
  let previewDocumentKey = '';
  let latestAnalysis = null;
  let inspectedIssueKind = null;
  const visibleIssue = () =>
    latestAnalysis?.issues?.find(
      (issue) => issue.kind === inspectedIssueKind,
    ) ??
    latestAnalysis?.primaryIssue ??
    latestAnalysis?.advisories?.[0] ??
    null;
  const issueName = (issue) =>
    issue.kind === 'bend'
      ? issue.shape === 'vertical'
        ? 'Sharp crest / dip'
        : issue.severity === 'warning'
          ? 'Sharp turn'
          : issue.severity === 'warning'
            ? 'Sharp turn'
            : 'Tight corner'
      : issue.kind === 'grade'
        ? 'Steep climb'
        : issue.label;
  let step = 20;
  let dragBefore;
  let previewMessage = 'Opening your workspace…';
  let message = 'Draw your route, or generate a starting point.';
  let messageKind = '';
  const life = new AbortController();
  host.classList.add('track-editor-host');
  host.innerHTML = `<div class="track-workshop workshop-direct workshop-strip-editor" aria-label="Track Workshop">
    <header class="workshop-header" data-editor-header>
      <div class="workshop-wordmark">VECTOR<span>//</span>NOVA<small data-editor-course-label>TRACK EDITOR</small></div>
      <label class="workshop-header-name"><span class="workshop-sr-only">Track name</span><input type="text" maxlength="60" data-editor-field="name" aria-label="Track name" value="${escape(doc.name)}"></label>
      <div class="workshop-header-course">${courseTypeControl()}</div>
      <div class="workshop-header-actions">
        ${button('undo', 'Undo', 'aria-label="Undo edit"')}${button('redo', 'Redo', 'aria-label="Redo edit"')}${button('tab-library', 'File', 'aria-expanded="false" aria-controls="workshop-file-panel"')}${button('save', 'Save')}${typeof onTunes === 'function' ? button('tunes', 'Tunes') : ''}
        <div class="workshop-test-control" role="group" aria-label="Test Drive">
          ${button('test', 'Test drive', 'class="workshop-primary"')}
          ${button('test-options', '<span aria-hidden="true">▾</span>', 'aria-label="Test drive options" aria-expanded="false" aria-controls="workshop-test-menu" title="Test drive options"')}
          <div class="workshop-test-menu" id="workshop-test-menu" role="group" aria-label="Test drive options" hidden></div>
        </div>
        ${button('exit', 'Back', 'aria-label="Back to Race setup"')}
      </div>
    </header>
    <nav class="workshop-global-nav" aria-label="Track settings"><div class="workshop-context-switch" role="group" aria-label="Authoring context">${button('context-road', 'Road', 'aria-pressed="true"')}${button('context-environment', 'Environment', 'aria-pressed="false"')}</div>${button('tab-generate', 'Create road', 'class="workshop-task-action" aria-expanded="false"')}${button('tab-pickups', 'Fill pickups', 'class="workshop-task-action" aria-expanded="false"')}<div class="workshop-facts" data-editor-facts></div></nav>
    <div class="workshop-layout" data-editor-layout>
      <aside class="workshop-global-panel" data-editor-global-panel hidden aria-label="Track settings">
        <div class="workshop-panel-heading"><h2 data-editor-global-title>Track settings</h2>${button('global-close', '×', 'aria-label="Close track settings"')}</div>
        <div class="workshop-options-scroll" data-editor-global-tools></div>
      </aside>
      <main class="workshop-main">
        <div class="workshop-recovery" data-editor-recovery hidden role="status"></div>
        <div class="workshop-viewbar"><span data-editor-view-hint></span><div class="workshop-selection-summary" data-editor-selection></div></div>
        <div class="workshop-canvas">
          <div class="workshop-map-wrap workshop-map-popover" data-editor-map-wrap hidden role="dialog" aria-label="2D route map">
            <div class="workshop-map-heading"><strong>Route map</strong>${button('map-close', '×', 'aria-label="Close route map"')}</div>
            <div class="workshop-map-surface"><svg id="workshop-route-map" viewBox="0 0 1000 680" role="img" tabindex="0" aria-label="Top-down road editor. Click points to select them; Draw road adds points."></svg></div>
            <span class="workshop-map-help">Click or drag road points · Click outside to close</span>
          </div>
          <div class="workshop-world" data-editor-world><span class="workshop-fly-badge" data-editor-fly-badge hidden>FREE CAMERA · ESC / B TO EXIT</span></div>
          <div class="workshop-preview-status" data-editor-preview-status></div>
          <section class="workshop-starter-overlay" aria-label="Start a track" data-editor-starters hidden><h2>Start a track</h2>${renderStarterChoices('canvas')}</section>
          <div class="workshop-empty-hint" data-editor-empty><span class="workshop-eyebrow">YOUR ROAD, FROM SCRATCH</span><strong data-editor-empty-title>Click the ground to start.</strong><span data-editor-empty-copy>Draw a few points. We build the road and supports.</span></div>
          <div class="workshop-authoring-strip" data-editor-authoring role="group" aria-label="Preview authoring tools">
            ${renderToolModes()}
            <div class="workshop-environment-strip" data-editor-environment-strip hidden><strong>Environment</strong><span data-editor-environment-name></span>${button('open-environment', 'Choose scenery')}</div>
            <div class="workshop-strip-divider" aria-hidden="true"></div>
            ${renderCameraControls()}
            <div class="workshop-strip-divider workshop-road-divider" aria-hidden="true"></div>
            <div class="workshop-strip-groups" data-editor-tools>${AUTHOR_GROUPS.map(([id, label]) => `<div class="workshop-strip-group">${button(`tab-${id}`, `<span>${label}</span><span class="workshop-group-arrow" aria-hidden="true">⌄</span>`, `class="workshop-group-button" aria-expanded="false" aria-controls="workshop-group-${id}"`)}<section class="workshop-strip-options" id="workshop-group-${id}" data-editor-section="${id}" aria-label="${label}" hidden><div data-editor-section-body="${id}"></div></section></div>`).join('')}</div>
          </div>
        </div>
        <div class="workshop-camera-help" data-editor-camera-help role="status"></div>
        <div class="workshop-test-feedback" data-editor-test-feedback role="status"></div>
      </main>
    </div>
    <footer class="workshop-footer"><span class="workshop-status" role="status" aria-live="polite" data-editor-status></span><section class="workshop-validation" aria-label="Track checks" data-editor-validation></section></footer>
  </div>`;
  const root = host.firstElementChild;
  const tools = root.querySelector('[data-editor-tools]');
  const globalTools = root.querySelector('[data-editor-global-tools]');
  const authorStrip = root.querySelector('[data-editor-authoring]');
  const svg = root.querySelector('#workshop-route-map');
  const worldHost = root.querySelector('[data-editor-world]');
  const mapPopover = root.querySelector('[data-editor-map-wrap]');
  const testMenu = root.querySelector('#workshop-test-menu');
  const testOptions = root.querySelector('[data-editor-action="test-options"]');
  let testMenuHTML = '';
  const sectionHTML = new Map();
  function showTestMenu(open, { focus = false } = {}) {
    testMenu.hidden = !open;
    testOptions.setAttribute('aria-expanded', String(open));
    if (focus) testOptions.focus({ preventScroll: true });
  }
  function rememberGroupScroll() {
    if (authorGroup) groupScroll.set(authorGroup, tools.scrollTop);
    if (globalGroup) groupScroll.set(globalGroup, globalTools.scrollTop);
  }
  function closeAuthorGroup({ focus = true } = {}) {
    if (!authorGroup) return;
    const previous = authorGroup;
    rememberGroupScroll();
    authorGroup = '';
    if (context === 'road') roadAuthorGroup = '';
    render();
    if (focus && !viewport.isFlying())
      root
        .querySelector(`[data-editor-action="tab-${previous}"]`)
        ?.focus({ preventScroll: true });
  }
  function focusGroup(id) {
    const section = root.querySelector(`[data-editor-section="${id}"]`);
    const first = section.querySelector(
      'summary, button:not(:disabled), input:not(:disabled), select:not(:disabled)',
    );
    first?.focus({ preventScroll: true });
    first?.scrollIntoView({ block: 'nearest' });
  }
  function closeMap({ focus = false } = {}) {
    if (!mapOpen) return;
    mapOpen = false;
    map.fit(); // Cancel a captured map gesture before hiding its surface.
    render();
    if (focus)
      root
        .querySelector('[data-editor-action="view-map"]')
        ?.focus({ preventScroll: true });
  }
  function selectPoint(index, meta = {}) {
    if (busy || suspended || disposed || recoveryEntry || context !== 'road')
      return;
    if (index < 0 || index >= doc.points.length) {
      selected = -1;
      selectedProp = -1;
      rangeAnchor = -1;
      rangeEnd = -1;
      rangeArmed = false;

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
    const associatedJump = doc.jumps.find((jump) =>
      [jump.launchPointId, jump.landingPointId].includes(doc.points[index].id),
    );
    if (associatedJump) selectedJumpId = associatedJump.id;
    shapeStart = Math.min(rangeAnchor, rangeEnd);
    shapeEnd = Math.min(
      doc.points.length - 1,
      Math.max(shapeStart + 1, Math.max(rangeAnchor, rangeEnd)),
    );
    selectedProp = -1;
    rangeArmed = false;
    render();
  }
  function dragPoint(index, position) {
    if (busy || suspended || disposed || recoveryEntry || context !== 'road')
      return;
    if (!dragBefore) {
      dragBefore = doc;
      doc = clone(doc);
      status('Moving point… release to finish, Escape to cancel.');
      root.querySelector('[data-editor-validation]').dataset.severity = 'none';
      root.querySelector('[data-editor-validation]').innerHTML =
        '<strong>Moving point…</strong>';
    }
    // Point readouts may be rendered between pointer frames.
    fractionCache.delete(doc);
    latestAnalysis = null;
    Object.assign(doc.points[index], position);
    selected = index;
    selectedProp = -1;
    syncCanvas();
  }
  function endDrag() {
    if (!dragBefore) return;
    const next = doc;
    doc = dragBefore;
    dragBefore = null;
    if (!busy && !suspended && !disposed) commit(next, 'Position updated.');
  }
  function cancelDrag() {
    if (!dragBefore) return;
    doc = dragBefore;
    dragBefore = null;
    status('Move canceled.');
    render();
  }
  function cancelActiveDrag() {
    if (!dragBefore) return;
    viewport.cancelInteraction();
    map.cancelInteraction();
  }
  const viewport = createEditorViewport(worldHost, {
    navigationRoot: host,
    onSelectPoint: selectPoint,
    onAddPoint(position) {
      if (
        !busy &&
        !suspended &&
        !disposed &&
        context === 'road' &&
        tool === 'draw'
      )
        addPoint(position);
    },
    onInsertPoint(index, position) {
      if (context === 'road') insertPoint(index, position);
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
      if (
        !busy &&
        !suspended &&
        !disposed &&
        context === 'road' &&
        tool === 'draw'
      )
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
      control.disabled = busy || !viewport.isReady();
    }
    root.querySelector('[data-editor-fly-badge]').hidden = !flying;
    const help = root.querySelector('[data-editor-camera-help]');
    if (help)
      help.textContent = flying
        ? 'WASD move · Q/E down/up · Drag or arrows look · Shift faster · Esc exit. Controller: left stick move, right stick look, LB/RB down/up, RT faster, B exit.'
        : 'Camera: right-drag to orbit · middle-drag to pan · scroll to zoom · F to focus. Fly supports keyboard and controller movement.';
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
  function flushRecovery() {
    clearTimeout(recoveryTimer);
    if (recoveryEntry || recoveryState !== 'Saving draft…') return;
    try {
      recovery.write(dragBefore ?? doc);
      recoveryState = 'Draft backed up';
      recoveryError = '';
    } catch {
      recoveryError =
        'Draft recovery unavailable. Save or Export to keep your work.';
      recoveryState = '';
    }
    if (!disposed) syncRecovery();
  }
  function checkpointRecovery() {
    if (dragBefore || recoveryEntry) return;
    const next = JSON.stringify(doc);
    if (next === checkpointJSON) return;
    checkpointJSON = next;
    recoveryState = 'Saving draft…';
    clearTimeout(recoveryTimer);
    recoveryTimer = setTimeout(flushRecovery, 700);
  }
  function syncRecovery() {
    const node = root.querySelector('[data-editor-recovery]');
    node.hidden = !recoveryEntry && !recoveryError;
    node.innerHTML = recoveryEntry
      ? `<span><strong>Continue your last draft?</strong> ${escape(recoveryEntry.document.name)} · ${escape(new Date(recoveryEntry.updatedAt).toLocaleString())}</span><div>${button('recover-draft', 'Continue draft')}${button('discard-recovery', 'Start fresh')}</div>`
      : escape(recoveryError);
    root.querySelector('[data-editor-recovery-state]')?.remove();
    if (recoveryState) {
      const state = document.createElement('span');
      state.dataset.editorRecoveryState = '';
      state.className = 'workshop-recovery-state';
      state.textContent = recoveryState;
      root.querySelector('[data-editor-facts]').append(state);
    }
  }
  function commit(next, text, { frame = false } = {}) {
    try {
      next = validateDocument(next);
      if (JSON.stringify(next) !== JSON.stringify(doc)) {
        pushHistory(doc);
        doc = next;
        inspectedIssueKind = null;
        jumpCandidate = null;
        jumpSuggestion = null;
        jumpManualChosen = false;
        restoreJumpSelection();
        selected = Math.min(selected, doc.points.length - 1);
        selectedProp = -1;
      }
      message = text;
      messageKind = '';
    } catch (error) {
      status(error.message, 'error');
      render();
      return;
    }
    render({ frame });
  }
  function edit(change, text, options) {
    const next = clone(doc);
    change(next);
    commit(next, text, options);
  }
  function scheduleFlightPreview() {
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
    if (!showFlightPaths || !flightPreview?.cruise) return [];
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
    const issue = visibleIssue();
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
      const key = editorWorldFingerprint(doc);
      if (key !== previewDocumentKey) {
        previewDocumentKey = key;
        if (view === 'world') previewMessage = 'Updating world…';
      }
    }
    if (!dragBefore || mapOpen)
      map.setDocument(doc, context === 'road' ? selected : -1, {
        frame,
        section: activeSection,
        trajectories: flightLines(),
        selectedJumpId: showFlightPaths ? selectedJumpId : null,
        problemPoint: issue?.pointIndex ?? null,
        problemSeverity: issue?.severity ?? 'error',
        drawMode: context === 'road' && tool === 'draw',
        tool: context === 'road' ? tool : 'orbit',
        readOnly: context !== 'road',
      });
    viewport.setDocument(clone(doc), {
      frame,
      selectedPoint: context === 'road' ? selected : -1,
      selectedProp: context === 'road' ? selectedProp : -1,
      readOnly: context !== 'road',
      problemPoint: issue?.pointIndex ?? null,
      problemSeverity: issue?.severity ?? 'error',
      problemPosition: issue?.position ?? null,
      problemLabel: issue?.radius
        ? `${issue.radius.toFixed(1)} m radius`
        : issue?.grade
          ? `${Math.round(issue.grade * 100)}% grade`
          : issue
            ? issueName(issue)
            : 'Check this point',
      heightDelta:
        dragBefore && selected >= 0
          ? doc.points[selected].y - dragBefore.points[selected].y
          : null,
      section: activeSection,
      drawMode: context === 'road' && tool === 'draw',
      tool: context === 'road' ? tool : 'orbit',
    });
    viewport.setTrajectories(context === 'road' ? flightLines() : []);
    if (dragBefore || context !== 'road')
      viewport.setGuides({ document: null });
    else
      viewport.setGuides({
        document: doc,
        selectedPoint: selected,
        problemPoint: issue?.pointIndex ?? null,
        problemSeverity: issue?.severity ?? 'error',
        selectedJumpId,
        candidate: hasJumpCandidate() ? jumpCandidate.ghost : null,
        attempt:
          lastTestAttempt?.courseIdentity === documentIdentity(doc)
            ? lastTestAttempt
            : null,
      });
    const showStarters =
      doc.points.length === 0 &&
      starterPromptDismissedFor !== doc.id &&
      !recoveryEntry &&
      context === 'road' &&
      !mapOpen &&
      !globalGroup &&
      !authorGroup;
    root.querySelector('[data-editor-starters]').hidden = !showStarters;
    root.querySelector('[data-editor-empty]').hidden =
      showStarters ||
      doc.points.length >= 4 ||
      mapOpen ||
      context !== 'road' ||
      globalGroup === 'generate';
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
    const target = [...root.querySelectorAll(`[${key[0]}]`)].find(
      (node) => node.getAttribute(key[0]) === key[1],
    );
    if (!target || target.disabled || target.closest('[hidden]')) return;
    target.focus({ preventScroll: true });
    const scrollArea = target.closest(
      '[data-editor-tools], [data-editor-global-tools]',
    );
    if (scrollArea) {
      const box = target.getBoundingClientRect(),
        area = scrollArea.getBoundingClientRect();
      if (box.top < area.top || box.bottom > area.bottom)
        target.scrollIntoView({ block: 'nearest' });
    }
  }
  function range(
    field,
    label,
    value,
    min,
    max,
    increment,
    unit = '',
    percent = false,
    disabled = false,
  ) {
    return `<label class="workshop-range"><span>${label}<output ${percent ? 'data-editor-percent' : ''}>${percent ? Math.round(value * 100) : rounded(value, 2)}${percent ? '%' : unit}</output></span><input type="range" data-editor-field="${field}" aria-label="${label}" min="${min}" max="${max}" step="${increment}" value="${value}" ${disabled ? 'disabled' : ''}></label>`;
  }
  function pointLabel(index) {
    if (index === 0)
      return doc.courseType === 'downhill' ? 'Start' : 'Start / finish';
    return doc.courseType === 'downhill' && index === doc.points.length - 1
      ? 'Runout end'
      : 'Route point';
  }
  function courseTypeControl() {
    return `<label class="workshop-label">Course type<select data-editor-field="course-type" aria-label="Course type">${option('circuit', 'Circuit', doc.courseType !== 'downhill')}${option('downhill', 'Downhill', doc.courseType === 'downhill')}</select></label>`;
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
  function roadAngleLabel(point) {
    const degrees =
      ((Math.round(((point.roll ?? 0) * 180) / Math.PI) % 360) + 360) % 360;
    return `${degrees}° ${degrees === 0 ? 'upright' : degrees === 180 ? 'inverted' : degrees === 90 || degrees === 270 ? 'wall' : 'tilted'}`;
  }
  function renderToolModes() {
    return `<div class="workshop-tool-palette" role="group" aria-label="Preview tools" data-editor-tool-palette><div class="workshop-palette-buttons">${PREVIEW_TOOLS.map((item) => button(item.action, `<svg viewBox="0 0 24 24" aria-hidden="true"><g>${item.icon}</g></svg><span>${item.label}</span><kbd aria-hidden="true">${item.key}</kbd>`, `data-editor-tool="${item.id}" aria-label="${item.label}" aria-keyshortcuts="${item.key}" aria-pressed="${tool === item.id}"`)).join('')}</div>${button('finish-drawing', 'Finish drawing', 'class="workshop-finish-drawing"')}</div>`;
  }
  function renderCameraControls() {
    return `<div class="workshop-camera-controls" role="group" aria-label="Camera controls">${button('focus-selection', 'Focus', 'aria-label="Focus selection" title="Focus selected point or section (F)"')}${button('fit', 'Overview', 'title="Fit the entire track"')}${button('zoom-out', '−', 'aria-label="Zoom out" title="Zoom out"')}${button('zoom-in', '+', 'aria-label="Zoom in" title="Zoom in"')}${button('fly-camera', 'Fly', 'aria-label="Enter free camera" aria-pressed="false"')}${button('view-map', 'Map', 'aria-label="Open route map" aria-haspopup="dialog" aria-expanded="false" aria-controls="workshop-route-map"')}</div>`;
  }
  function renderSelection() {
    if (context === 'environment')
      return `<strong>${escape(editorBiome(doc.biome).label)}</strong><span>Environment · road editing paused</span>`;
    const point = doc.points[selected],
      span = selectedRange();
    return `<strong>${point ? `Point ${String(selected + 1).padStart(2, '0')}` : 'No point selected'}</strong><span>${PREVIEW_TOOLS.find((item) => item.id === tool).label}${point ? ` · ${Math.round(point.y)} m · ${roadAngleLabel(point)}` : ''}${span ? ` · Points ${span.start + 1}–${span.end + 1}` : ''}</span>`;
  }
  function renderRoadPanel() {
    const point = doc.points[selected],
      disabled = point ? '' : 'disabled';
    if (!point)
      return '<p class="workshop-help">Click a road point to move it, change its height or test from there.</p>';
    const precise = `<div class="workshop-coordinate-grid"><label>X / East<input type="number" data-editor-field="point-x" aria-label="Point X coordinate" min="-25000" max="25000" step="5" value="${rounded(point.x, 1)}"></label><label>Z / South<input type="number" data-editor-field="point-z" aria-label="Point Z coordinate" min="-25000" max="25000" step="5" value="${rounded(point.z, 1)}"></label></div><label class="workshop-label">Move distance<select data-editor-field="step" aria-label="Point movement distance">${[5, 20, 100].map((size) => option(size, `${size} m`, size === step)).join('')}</select></label><div class="workshop-nudge" role="group" aria-label="Move selected point">${button('north', '↑ North')}${button('west', '← West')}${button('east', 'East →')}${button('south', '↓ South')}</div>`;
    const more = `<label class="workshop-label">Choose a point<select data-editor-field="point" aria-label="Selected route point">${doc.points.map((p, i) => option(i, `${String(i + 1).padStart(2, '0')} · ${pointLabel(i)}`, i === selected)).join('')}</select></label>${range('point-bank', 'Bank trim', rounded(((point.bank ?? 0) * 180) / Math.PI, 1), -20, 20, 1, '°')}<label class="workshop-label">Whole course width<select data-editor-field="width" aria-label="Road width">${[32, 40, 48, 64].map((width) => option(width, `${width} m`, width === doc.width)).join('')}</select></label><div class="workshop-button-row">${button('earlier', 'Move earlier', selected <= 0 ? 'disabled' : '')}${button('later', 'Move later', selected >= doc.points.length - 1 ? 'disabled' : '')}</div>`;
    return `<p class="workshop-help">Drag the point to move it. Shift-drag or use Height to raise it.</p><div class="workshop-button-row">${button('context-prev', '← Previous', disabled)}${button('context-next', 'Next →', disabled)}</div>${range('point-y', 'Height', rounded(point.y, 1), 0, 3000, 5, ' m')}<div class="workshop-button-row">${button('context-raise', 'Raise 10 m')}${button('context-lower', 'Lower 10 m')}</div><div class="workshop-button-row">${button('add-point', 'Add point after', doc.points.length >= DOCUMENT_LIMITS.points ? 'disabled' : '')}${button('delete-point', 'Delete point')}</div>${renderLocalTestControls('point')}${details('point-position', 'Precise position', precise)}${details('point-more', 'More point settings', more)}`;
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
    const advanced = `<label class="workshop-label">From point<select data-editor-field="shape-start" aria-label="Section start point" ${count >= 4 ? '' : 'disabled'}>${count ? pointOptions(shapeStart) : '<option>No points yet</option>'}</select></label><label class="workshop-label">To point<select data-editor-field="shape-end" aria-label="Section end point" ${count >= 4 ? '' : 'disabled'}>${count ? pointOptions(shapeEnd) : '<option>No points yet</option>'}</select></label><label class="workshop-label">Section preset<select data-editor-field="shape-preset" aria-label="Road section preset">${[
      ['90', 'Quarter turn · 90°'],
      ['180', 'Half turn · 180°'],
      ['270', 'Three-quarter turn · 270°'],
      ['straight', 'Straight · hold the current angle'],
    ]
      .map(([value, label]) => option(value, label, shapePreset === value))
      .join(
        '',
      )}</select></label>${button('apply-shape', 'Apply section', `class="workshop-primary workshop-wide" ${count >= 4 ? '' : 'disabled'}`)}`;
    return `<section class="workshop-section"><p class="workshop-help">Choose a section, then add a twist. Join chunks to build a wall ride or corkscrew.</p><div class="workshop-section-span">${selectedRange() ? `Points ${shapeStart + 1}–${shapeEnd + 1} · ${Math.round(spanMetres)} m` : 'Starts at the selected point'}</div><div class="workshop-button-row">${button('select-section', rangeArmed ? 'Click an end point…' : 'Select end point', point ? '' : 'disabled')}${button('range-expand', 'Extend +', selectedRange() ? '' : 'disabled')}${button('range-shrink', 'Shorten −', selectedRange() ? '' : 'disabled')}</div><label class="workshop-label">Turn direction<select data-editor-field="shape-direction" aria-label="Section turn direction">${option('right', 'Right', shapeDirection === 'right')}${option('left', 'Left', shapeDirection === 'left')}</select></label><div class="workshop-quick-presets">${button('quick-90', '90°', count >= 4 ? '' : 'disabled')}${button('quick-180', '180°', count >= 4 ? '' : 'disabled')}${button('quick-270', '270°', count >= 4 ? '' : 'disabled')}${button('quick-straight', 'Straight', count >= 4 ? '' : 'disabled')}</div><div class="workshop-angle-readout" aria-label="Selected road angle"><strong>${angle}°</strong><span>${point ? attitude : 'Select a point'}</span></div><p class="workshop-help">0° upright · 90° wall · 180° inverted.</p>${button('inspect-shape', 'Focus section', `class="workshop-wide" ${count >= 4 ? '' : 'disabled'}`)}${details('section-precise', 'Precise section', advanced)}${details('section-finish', 'Road surface', renderRoadFinish())}</section>`;
  }

  function renderJumps() {
    const count = doc.points.length;
    jumpStart = Math.max(0, Math.min(jumpStart, count - 2));
    jumpEnd = Math.max(jumpStart + 1, Math.min(jumpEnd, count - 1));
    const gaps = doc.jumps ?? [];
    const current = gaps.find((entry) => entry.id === selectedJumpId);
    const focusedJump =
      current &&
      [current.launchPointId, current.landingPointId].includes(
        doc.points[selected]?.id,
      );
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
                    `<div data-editor-flight="${key}" data-flight-status="${flightPreview[key].status}" style="--flight-color:${color}"><strong>At full ${label.toLowerCase()} · ${Math.round(flightPreview[key].speed * 3.6)} km/h</strong><span>${escape(flightPreview[key].summary)}</span></div>`,
                )
                .join(
                  '',
                )}</div><p class="workshop-help">${escape(previewShip.name)} estimate. Boost assumes full reserve at launch. Entry speed and steering affect the landing.</p>`
            : '<p class="workshop-help">Flight preview will appear here.</p>';
    flightReportMarkup = advisory;
    const ready = jumpManualChosen || jumpSuggestion?.source === doc;
    const creation = `<section class="workshop-section workshop-jump-authoring"><h2>Add a jump</h2><p class="workshop-help">Find a clear launch and landing, then add the gap. Your road stays unchanged until you choose Add.</p>${button('find-jump-section', 'Use next suitable section', `class="workshop-wide" ${count >= 4 ? '' : 'disabled'}`)}<p class="workshop-jump-suggestion" data-editor-jump-suggestion>${ready ? `Points ${jumpStart + 1} → ${jumpEnd + 1} · ${Math.round((fractionAt(jumpEnd) - fractionAt(jumpStart)) * length)} m gap` : 'No section chosen yet.'}</p>${button('add-jump', 'Add jump gap', `class="workshop-primary workshop-wide" ${count >= 4 && ready ? '' : 'disabled'}`)}<div class="workshop-jump-manual"><h3>Launch and landing</h3><p class="workshop-help">For your own spans and huge jumps. Leave at least 160 m of approach and a clear receiving deck.</p><label class="workshop-label">Launch point<select data-editor-field="jump-start" aria-label="Jump launch point" ${count >= 4 ? '' : 'disabled'}>${count ? pointOptions(jumpStart) : '<option>No points yet</option>'}</select></label><label class="workshop-label">Landing point<select data-editor-field="jump-end" aria-label="Jump landing point" ${count >= 4 ? '' : 'disabled'}>${count ? pointOptions(jumpEnd) : '<option>No points yet</option>'}</select></label><label class="workshop-label">New gap landing runout<select data-editor-field="jump-receiving" aria-label="New jump landing runout">${[150, 300, 600, 1200].map((metres) => option(metres, `${metres} m`, jumpReceiving === metres)).join('')}${![150, 300, 600, 1200].includes(jumpReceiving) ? option(jumpReceiving, `${Math.round(jumpReceiving)} m`, true) : ''}</select></label><label class="workshop-checkbox"><input type="checkbox" data-editor-field="jump-ramp" ${jumpRampAssist ? 'checked' : ''}><span>Shape launch ramp and receiving deck</span></label><p class="workshop-help">Creates a visible ramp and broad landing. Clear this to keep existing heights. Flight paths help you judge the result; no hidden launch force is added.</p></div></section>`;
    const inspector = gaps.length
      ? `<section class="workshop-section"><div class="workshop-section-row"><h2>Your jumps</h2><span>${gaps.length} ${gaps.length === 1 ? 'gap' : 'gaps'}</span></div><label class="workshop-label">Gap to inspect<select data-editor-field="jump-selected" aria-label="Selected jump gap">${gapOptions}</select></label>${current ? `<label class="workshop-label">This gap’s landing runout<select data-editor-field="selected-jump-receiving" aria-label="Selected gap landing runout">${[150, 300, 600, 1200].map((metres) => option(metres, `${metres} m`, current.receiving === metres)).join('')}${![150, 300, 600, 1200].includes(current.receiving) ? option(current.receiving, `${Math.round(current.receiving)} m`, true) : ''}</select></label>` : ''}${button('inspect-jump', 'Focus jump in 3D', `class="workshop-wide" ${current ? '' : 'disabled'}`)}<label class="workshop-checkbox"><input type="checkbox" data-editor-field="show-flight-paths" ${showFlightPaths ? 'checked' : ''}><span>Show cruise and boost flight paths</span></label><div data-editor-flight-report></div><div class="workshop-button-row">${button('remove-jump', 'Remove gap', current ? '' : 'disabled')}${button('clear-jumps', 'Clear all gaps', gaps.length ? '' : 'disabled')}</div><p class="workshop-help">Removing a gap restores its road and supports. Ramp and landing edits stay; Undo restores the whole edit.</p></section>`
      : '';
    const candidate = hasJumpCandidate() ? jumpCandidate : null;
    const proposal = candidate
      ? `<div class="workshop-jump-proposal" data-editor-jump-proposal><strong>${Math.round(candidate.resolved.gapLength)} m proposed gap</strong><p>${Math.round(candidate.resolved.receiving)} m landing · ${Math.round(candidate.resolved.footprint)} m footprint</p><div class="workshop-button-row">${button('apply-jump', 'Apply jump', 'class="workshop-primary"')}${button('cancel-jump-preview', 'Cancel preview')}</div>${candidate.warnings.map((warning) => `<p class="workshop-help">${escape(warning)}</p>`).join('')}</div>`
      : '';
    const choices = candidate
      ? ''
      : `<h2>${current ? 'New jump / resize' : 'Insert a jump here'}</h2><p class="workshop-help">Select a road point and preview, or find clear space. Apply keeps the proposed road.</p><label class="workshop-label">Jump size<select data-editor-field="jump-size-preset" aria-label="Jump size">${[
          ['small', 'Small · ~180 m across'],
          ['medium', 'Medium · ~300 m across'],
          ['large', 'Large · ~500 m across'],
        ]
          .map(([value, label]) =>
            option(value, label, value === jumpSizePreset),
          )
          .join(
            '',
          )}</select></label>${button('preview-jump', 'Preview new jump here', `class="workshop-wide" ${count >= 4 && selected >= 0 ? '' : 'disabled'}`)}${button('preview-find-jump', 'Find clear space', `class="workshop-wide" ${count >= 4 ? '' : 'disabled'}`)}${current ? button(current.authoring ? 'preview-resize' : 'preview-rebuild', current.authoring ? 'Preview resize' : 'Preview rebuild', 'class="workshop-wide"') : ''}${current && !current.authoring ? '<p class="workshop-help">This older jump has no original road snapshot. Rebuild previews new ramps over its current road; Undo restores it.</p>' : ''}`;
    const builder = `<section class="workshop-section">${proposal}${choices}${jumpProposalError ? `<p class="workshop-jump-error" role="status">${escape(jumpProposalError)}</p>` : ''}${renderLocalTestControls('jump')}</section>`;
    return (
      builder +
      (inspector
        ? focusedJump
          ? inspector
          : details('jump-inspector', `Your jumps · ${gaps.length}`, inspector)
        : '') +
      details('jump-manual', 'Manual launch / landing', creation)
    );
  }
  function renderRoadFinish() {
    const count = doc.points.length;
    return `<section class="workshop-section"><h2>Section road finish</h2><p class="workshop-help">Uses the From / To points above. Changes only this section’s road surface. Scenery and sky keep the environment you chose.</p><label class="workshop-label">Road finish<select data-editor-field="road-span-biome" aria-label="Section road finish">${ROAD_SPAN_BIOMES.map((biome) => option(biome, editorBiome(biome).label, roadSpanBiome === biome)).join('')}</select></label>${button('apply-road-finish', 'Apply road finish', `class="workshop-wide" ${count >= 4 ? '' : 'disabled'}`)}${button('clear-road-finish', 'Use world finish in section', `class="workshop-wide" ${doc.biomeSpans.length ? '' : 'disabled'}`)}${doc.biomeSpans.map((span) => `<p class="workshop-help">${escape(editorBiome(span.biome).label)} · points ${doc.points.findIndex((point) => point.id === span.startPointId) + 1}–${doc.points.findIndex((point) => point.id === span.endPointId) + 1} ${button(`clear-road-span-${span.id}`, 'Clear', 'aria-label="Clear this road finish section"')}</p>`).join('')}<p class="workshop-help">Clear finish overrides before deleting their end points. Jump and twist corridors stay protected.</p></section>`;
  }
  function testIsCurrent() {
    return (
      lastTestAttempt?.shipId === shipId &&
      lastTestAttempt.courseIdentity === documentIdentity(doc)
    );
  }
  function testRequest(kind, current = false) {
    if (kind === 'course') return { kind };
    if (kind === 'retry') return current ? lastTestAttempt.request : null;
    const id = kind === 'jump' ? selectedJumpId : doc.points[selected]?.id;
    return id
      ? {
          kind,
          [kind === 'jump' ? 'jumpId' : 'pointId']: id,
          speed: testEntrySpeed,
          reserve: testReserve,
        }
      : null;
  }
  function testStart(request) {
    try {
      return { plan: resolveEditorTestStart(doc, request, { shipId }) };
    } catch (error) {
      return { error: error.message };
    }
  }
  function renderTestMenu(valid, current, actual) {
    const unavailable = {
      point: 'Select a road point first.',
      jump: 'Choose a jump in the editor.',
      retry: lastTestAttempt
        ? 'Track changed. Choose a new start.'
        : 'Complete or return from a test first.',
    };
    const html = [
      !valid ? '<p>Resolve Track checks to start a drive.</p>' : '',
      ...TEST_MENU_ACTIONS.map(([action, label, kind]) => {
        const request = testRequest(kind, current);
        const { plan, error } = valid && request ? testStart(request) : {};
        const description = plan
          ? `${plan.label} · ${Math.round(plan.speed * 3.6)} km/h start · ${plan.energy}% reserve`
          : valid
            ? (error ?? unavailable[kind])
            : '';
        return `<div>${button(action, label, plan ? '' : 'disabled')}${description ? `<p>${escape(description)}</p>` : ''}</div>`;
      }),
      actual
        ? `<p class="workshop-test-menu-result">${escape(actual)}</p>`
        : '',
    ].join('');
    if (testMenuHTML !== html) {
      testMenu.innerHTML = html;
      testMenuHTML = html;
    }
  }
  function renderLocalTestControls(kind) {
    if (kind === 'jump' && !selectedJumpId) return '';
    const { plan, error } = testStart(testRequest(kind));
    const available = Boolean(plan) && analysisFor().valid;
    const summary = plan ? getEditorTestStartSummary(plan) : error;
    const controls = `<label class="workshop-label">Entry speed<select data-editor-field="${kind === 'jump' ? 'test-entry-speed' : 'point-test-entry-speed'}" aria-label="${kind === 'jump' ? 'Test entry speed' : 'Point test entry speed'}">${[
      ['cruise', 'Full cruise'],
      ['boost', 'Full boost'],
      ['standing', 'Standing start'],
    ]
      .map(([value, label]) => option(value, label, value === testEntrySpeed))
      .join(
        '',
      )}</select></label><label class="workshop-label">Reserve<select data-editor-field="${kind === 'jump' ? 'test-reserve' : 'point-test-reserve'}" aria-label="${kind === 'jump' ? 'Test reserve' : 'Point test reserve'}">${[
      ['full', 'Full'],
      ['half', 'Half'],
      ['empty', 'Empty'],
    ]
      .map(([value, label]) => option(value, label, value === testReserve))
      .join(
        '',
      )}</select></label><p class="workshop-help">${escape(summary)}. R retries this approach.</p>`;
    return `<div class="workshop-local-test">${button(kind === 'jump' ? 'test-jump' : 'test-point', kind === 'jump' ? 'Test this jump' : 'Test from here', `class="workshop-wide" ${available ? '' : 'disabled'}`)}${details(`test-${kind}`, 'Test options', controls)}</div>`;
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
    const frequency =
      generator.jumpFrequency ?? (generator.version === 1 ? 'none' : 'normal');
    const matchingPreset = ROAD_PRESETS.find(
      (preset) =>
        (!preset.circuitOnly || doc.courseType === 'circuit') &&
        Object.entries(preset.options).every(
          ([key, value]) => key === 'length' || generator[key] === value,
        ),
    );
    const starterCards = ROAD_PRESETS.map((preset) =>
      button(
        `road-preset-${preset.id}`,
        `<strong>${escape(preset.label)}</strong><span>${escape(preset.description)}</span>`,
        `class="workshop-road-card" aria-pressed="${matchingPreset?.id === preset.id}" ${preset.circuitOnly && doc.courseType === 'downhill' ? 'disabled title="Woven is a Circuit preset"' : ''}`,
      ),
    ).join('');
    const custom = `${range('bendiness', 'Curviness', generator.bendiness, 0, 1, 0.05, '', true)}${range('crossovers', 'Crossovers', generator.crossovers ?? 0, 0, 1, 0.05, '', true, doc.courseType !== 'circuit')}<p class="workshop-help">${doc.courseType === 'circuit' ? 'Crossovers adds overpasses with automatic clearance.' : 'Crossovers is available for Circuit courses.'}</p>${range('elevation', doc.courseType === 'downhill' ? 'Descent strength' : 'Vertical variation', generator.elevation, 0, 1, 0.05, '', true)}<div class="workshop-generator-jumps"><label class="workshop-label">Jump frequency<select data-editor-field="jump-frequency" aria-label="Jump frequency">${[
      ['none', 'None'],
      ['few', 'Few'],
      ['normal', 'Normal'],
      ['many', 'Many'],
    ]
      .map(([value, label]) => option(value, label, value === frequency))
      .join(
        '',
      )}</select></label><label class="workshop-label">Jump size<select data-editor-field="jump-size" aria-label="Jump size" ${frequency === 'none' ? 'disabled' : ''}>${[
      ['small', 'Small'],
      ['mixed', 'Mixed'],
      ['large', 'Large'],
    ]
      .map(([value, label]) =>
        option(value, label, value === (generator.jumpSize ?? 'mixed')),
      )
      .join(
        '',
      )}</select></label></div><label class="workshop-label">Road seed<input type="number" data-editor-field="seed" aria-label="Road seed" min="0" max="4294967295" step="1" value="${generator.seed}"></label><p class="workshop-help">The same seed and settings repeat the road.</p>${button('quick-start', 'Create simple starter', 'class="workshop-wide"')}`;
    return `<section class="workshop-section"><h2>Choose your line.</h2><p class="workshop-help">Pick a style and length. Create replaces your road; Undo brings it back.</p><div class="workshop-road-cards" role="group" aria-label="Road style">${starterCards}</div><label class="workshop-label">${doc.courseType === 'downhill' ? 'Length including runout' : 'Length'}<select data-editor-field="length" aria-label="Generated track length">${[3000, 5000, 10000, 15000, 20000].map((length) => option(length, `${length / 1000} km`, length === generator.length)).join('')}${![3000, 5000, 10000, 15000, 20000].includes(generator.length) ? option(generator.length, `${generator.length / 1000} km`, true) : ''}</select></label><label class="workshop-checkbox"><input type="checkbox" data-editor-field="seed-pickups" ${seedPickups ? 'checked' : ''}><span>Fill with pickups</span></label>${details('generator', `Customize${matchingPreset ? '' : ' · custom settings'}`, custom)}<div class="workshop-generator-actions">${button('generate', 'Create road', 'class="workshop-primary workshop-wide"')}${button('new-variation', 'Try another variation', `class="workshop-wide" ${doc.points.length < 4 ? 'hidden' : ''}`)}</div><p class="workshop-help">${doc.courseType === 'downhill' ? 'A sustained descent with a supported finish runout.' : 'A closed course with supported roads and clear jump landings.'}</p></section>`;
  }
  function renderStarterChoices(location) {
    return `<div class="workshop-starter-choices">${PLAYABLE_STARTERS.map(
      ({ id, name, summary }) =>
        button(
          `starter-${location}-${id}`,
          `<strong>${escape(name)}</strong><span>${escape(summary)}</span>`,
          'class="workshop-starter-card"',
        ),
    ).join(
      '',
    )}${button(location === 'canvas' ? 'starter-draw' : 'blank', 'Draw from scratch')}</div>`;
  }
  function renderLibrary() {
    return `<section class="workshop-section"><h2>Your tracks</h2><p class="workshop-help">Open a saved course or keep a copy of this draft.</p>${details('new-track', 'New track', renderStarterChoices('file'))}${button('reset-track', 'Reset road', 'class="workshop-wide"')}<label class="workshop-label">Saved track<select data-editor-field="saved" aria-label="Saved track" ${records.length ? '' : 'disabled'}>${records.length ? records.map((record) => `<option value="${escape(record.id)}" ${record.id === savedId ? 'selected' : ''}>${escape(record.name)}</option>`).join('') : '<option>No saved tracks</option>'}</select></label><div class="workshop-button-row">${button('load', 'Load track', records.length ? '' : 'disabled')}${button('remove', 'Delete saved', records.length ? '' : 'disabled')}</div>${button('save-copy', 'Save a copy', 'class="workshop-wide"')}<div class="workshop-section-divider"></div>${button('import', 'Import track file', 'class="workshop-wide"')}${button('export', 'Export track file', 'class="workshop-wide"')}<p class="workshop-help">Track files include your road and settings.</p></section>`;
  }
  function renderWorld() {
    const pending = environmentDraft;
    const family = editorBiome(pending.biome);
    const presets = family.presets ?? WORLD_PRESETS;
    const applied = editorBiome(doc.biome);
    const appliedStyle = (applied.presets ?? WORLD_PRESETS).find(
      (entry) => entry.id === doc.settings.sceneryPreset,
    );
    const legacyScenery =
      (doc.environment.layoutVersion ?? 0) < ENVIRONMENT_LAYOUT_VERSION;
    const changed =
      pending.biome !== doc.biome ||
      pending.seed !== doc.environment.seed ||
      ['sceneryPreset', 'density', 'waterLevel'].some(
        (key) => pending[key] !== doc.settings[key],
      );
    const biomeCards = EDITOR_BIOMES.map((entry) =>
      button(
        `choose-biome-${entry.id}`,
        `<img src="${escape(environmentThumbnail(entry.id, entry.presets[0].id))}" alt="" loading="lazy"><strong>${escape(entry.label)}</strong>`,
        `class="workshop-biome-card" aria-pressed="${entry.id === pending.biome}"`,
      ),
    ).join('');
    const presetCards = presets
      .map((preset) =>
        button(
          `preset-${preset.id}`,
          `<img src="${escape(environmentThumbnail(family.id, preset.id))}" alt="" loading="lazy"><strong>${escape(preset.label)}</strong><span>${escape(preset.description)}</span>`,
          `class="workshop-world-card" aria-pressed="${pending.sceneryPreset === preset.id}"`,
        ),
      )
      .join('');
    return `<section class="workshop-section"><div class="workshop-world-current"><span>Now showing</span><strong>${escape(applied.label)} · ${escape(appliedStyle?.label ?? doc.settings.sceneryPreset)}</strong>${changed ? '<span class="workshop-world-pending" role="status">New choices ready · Apply to preview</span>' : legacyScenery ? '<span class="workshop-world-pending">Apply to update scenery</span>' : ''}</div><label class="workshop-label">Biome<select data-editor-field="biome" aria-label="World family">${EDITOR_BIOMES.map((entry) => option(entry.id, entry.label, entry.id === pending.biome)).join('')}</select></label>${details('biomes', 'Browse biomes', `<div class="workshop-biome-cards" role="group" aria-label="Biome choices">${biomeCards}</div>`)}<div class="workshop-world-presets" role="group" aria-label="Environment style">${presetCards}</div>${range('environment-density', 'Scenery fullness', pending.density, 0.25, 1, 0.01, '', true)}${details('environment', 'Customize seed', `<label class="workshop-label">Environment seed<input type="number" data-editor-field="world-seed" aria-label="Environment seed" min="0" max="4294967295" step="1" value="${pending.seed}"></label><p class="workshop-help">The same seed repeats the same scenery layout.</p>`)}<div class="workshop-generator-actions">${button('regenerate-environment', 'Apply environment', 'class="workshop-primary workshop-wide"')}${button('new-world-seed', 'Try another variation', 'class="workshop-wide"')}</div><p class="workshop-help">Your road, jumps and pickups stay as you made them. Undo restores the previous world.</p></section>`;
  }
  function syncSections() {
    if (!globalTools.children.length)
      globalTools.innerHTML = GLOBAL_GROUPS.map(
        ([id, label]) =>
          `<section class="workshop-global-section" data-editor-section="${id}" ${id === 'library' ? 'id="workshop-file-panel"' : ''} aria-label="${label}" hidden><div data-editor-section-body="${id}"></div></section>`,
      ).join('');
    const renderers = {
      route: renderRoadPanel,
      shape: renderShape,
      jumps: renderJumps,
      generate: renderGenerator,
      world: renderWorld,
      pickups: renderPickups,
      library: renderLibrary,
    };
    for (const [id] of PANEL_SECTIONS) {
      const section = root.querySelector(`[data-editor-section="${id}"]`);
      const html = renderers[id]();
      if (sectionHTML.get(id) !== html) {
        section.querySelector(`[data-editor-section-body="${id}"]`).innerHTML =
          html;
        sectionHTML.set(id, html);
      }
      section.hidden = id !== authorGroup && id !== globalGroup;
    }
    authorStrip.dataset.expanded = String(Boolean(authorGroup));
    root.querySelector('[data-editor-global-panel]').hidden = !globalGroup;
    root.querySelector('[data-editor-layout]').dataset.globalOpen = String(
      Boolean(globalGroup),
    );
    root.querySelector('[data-editor-global-title]').textContent =
      GLOBAL_GROUPS.find(([id]) => id === globalGroup)?.[1] ?? 'Track settings';
    const report = root.querySelector('[data-editor-flight-report]');
    if (report && report.innerHTML !== flightReportMarkup)
      report.innerHTML = flightReportMarkup;
    const nextLayoutKey = `${authorGroup}:${globalGroup}:${mapOpen}`;
    if (nextLayoutKey !== layoutKey) {
      layoutKey = nextLayoutKey;
      window.dispatchEvent(new Event('editor-layout-change'));
    }
  }
  function render({ frame = false } = {}) {
    if (disposed) return;
    const focus = focusKey();
    const scrollTop = tools.scrollTop;
    const globalScrollTop = globalTools.scrollTop;
    const active = document.activeElement;
    const caret = active?.matches('input[type="text"], textarea')
      ? [active.selectionStart, active.selectionEnd]
      : null;
    const analysis = analysisFor();
    latestAnalysis = analysis;
    scheduleFlightPreview();
    syncEnvironmentDraft();
    syncSections();
    for (const name of ['road', 'environment'])
      root
        .querySelector(`[data-editor-action="context-${name}"]`)
        .setAttribute('aria-pressed', String(context === name));
    root.dataset.context = context;
    for (const name of ['generate', 'pickups'])
      root.querySelector(`[data-editor-action="tab-${name}"]`).hidden =
        context !== 'road';
    root.querySelector('[data-editor-tool-palette]').hidden =
      context !== 'road';
    root.querySelector('[data-editor-environment-strip]').hidden =
      context !== 'environment';
    root.querySelector('[data-editor-environment-name]').textContent =
      editorBiome(doc.biome).label;
    tools.hidden = context !== 'road';
    root.querySelector('.workshop-map-help').textContent =
      context === 'road'
        ? 'Click or drag road points · Click outside to close'
        : 'Route overview · Click outside to close';
    svg.setAttribute(
      'aria-label',
      context === 'road'
        ? 'Top-down road editor. Click points to select them; Draw road adds points.'
        : 'Top-down route overview. Road editing is paused in Environment.',
    );
    root.querySelector('[data-editor-selection]').innerHTML = renderSelection();
    const nameControl = root.querySelector('[data-editor-field="name"]');
    if (document.activeElement !== nameControl) nameControl.value = doc.name;
    root.querySelector('[data-editor-field="course-type"]').value =
      doc.courseType;
    root.querySelector('[data-editor-course-label]').textContent =
      `TRACK EDITOR · ${doc.courseType === 'downhill' ? 'DOWNHILL' : 'CIRCUIT'}`;
    const netDrop =
      doc.points.length > 1 ? doc.points[0].y - doc.points.at(-1).y : null;
    root.querySelector('[data-editor-facts]').innerHTML =
      `<span><strong>${(analysis.length / 1000).toFixed(2)}</strong> km</span><span><strong>${doc.width}</strong> m wide</span>${doc.courseType === 'downhill' ? `${netDrop === null ? '' : `<span data-editor-elevation-drop><strong>${Math.round(Math.abs(netDrop)).toLocaleString()}</strong> m ${netDrop >= 0 ? 'drop' : 'rise'}</span>`}<span class="workshop-runout-fact">Includes ${DOWNHILL_RUNOUT} m runout</span>` : ''}<span class="workshop-draft-state">${JSON.stringify(doc) === saved ? 'Saved' : 'Unsaved draft'}</span>`;
    checkpointRecovery();
    syncRecovery();
    const locatedIssue =
      doc.points.length >= 4 &&
      (analysis.errors.length || analysis.advisories?.length) &&
      Number.isInteger(visibleIssue()?.pointIndex)
        ? visibleIssue()
        : null;
    const secondaryIssues = (analysis.issues ?? []).filter(
      (issue, index, all) =>
        issue.kind !== locatedIssue?.kind &&
        Number.isInteger(issue.pointIndex) &&
        all.findIndex((entry) => entry.kind === issue.kind) === index,
    );
    root.querySelector('[data-editor-validation]').dataset.severity =
      locatedIssue?.severity ?? (analysis.valid ? 'none' : 'error');
    root.querySelector('[data-editor-validation]').innerHTML =
      doc.points.length < 4
        ? `<strong>Keep drawing</strong><span>Add ${4 - doc.points.length} more road ${doc.points.length === 3 ? 'point' : 'points'} to form your route.</span>`
        : locatedIssue
          ? `${analysis.valid ? '<strong class="workshop-valid">✓ Ready to test drive</strong>' : ''}${button('show-issue', `Point ${locatedIssue.pointIndex + 1} · ${escape(issueName(locatedIssue))} <span aria-hidden="true">↗</span>`, `class="workshop-issue-link" title="${escape(locatedIssue.message)}"`)}<span class="workshop-issue-message">${escape(locatedIssue.message)}</span>${secondaryIssues
              .slice(0, 2)
              .map((issue) =>
                button(
                  `show-issue-${issue.kind}`,
                  `Also: Point ${issue.pointIndex + 1} · ${escape(issueName(issue))} ↗`,
                  `class="workshop-secondary-issue" data-severity="${issue.severity}" title="${escape(issue.message)}"`,
                ),
              )
              .join(
                '',
              )}${locatedIssue.kind === 'bend' && canSmoothCorner(doc, analysis) ? button('smooth-corner', 'Auto fix corner', 'title="Open this corner. Other track problems may still need attention. Undo restores your layout."') : ''}${canSpreadRoad(doc) ? button('spread-road', 'Spread road out', 'title="Makes the road longer to give corners more room. Undo restores your layout."') : ''}`
          : analysis.errors.length
            ? `<strong>Before you drive</strong><ul>${analysis.errors
                .slice(0, 2)
                .map((error) => `<li>${escape(error)}</li>`)
                .join('')}</ul>`
            : `<strong class="workshop-valid">✓ ${doc.jumps.length ? 'Road checks passed' : 'Ready to drive'}</strong><span>${analysis.warnings.length ? escape(analysis.warnings[0]) : `${doc.courseType === 'downhill' ? 'Start to finish' : 'Closed route'} · Automatic supports · Scenery clearance`}</span>`;
    root.querySelector('[data-editor-action="tab-route"]').innerHTML =
      `<span>${selected >= 0 ? `Point ${String(selected + 1).padStart(2, '0')}` : 'Point'}</span><span class="workshop-group-arrow" aria-hidden="true">⌄</span>`;
    root.querySelector('[data-editor-action="tab-jumps"]').innerHTML =
      `<span>${hasJumpCandidate() ? 'Jump preview' : selectedJumpId && doc.jumps.some((jump) => jump.id === selectedJumpId && [jump.launchPointId, jump.landingPointId].includes(doc.points[selected]?.id)) ? 'Selected jump' : 'Add / edit jump'}</span><span class="workshop-group-arrow" aria-hidden="true">⌄</span>`;
    root.querySelector('[data-editor-action="tab-pickups"]').textContent =
      `Fill pickups${doc.pickups?.devices.length ? ` · ${doc.pickups.devices.length}` : ''}`;
    const finishing = tool === 'draw' && doc.points.length >= 4;
    root.querySelector('[data-editor-action="finish-drawing"]').hidden =
      !finishing;
    const attempt = lastTestAttempt?.lastAttempt;
    const currentTest = testIsCurrent();
    const testLabel = currentTest ? 'Last test' : 'Previous track version';
    const actual = attempt
      ? `${testLabel} · ${attempt.outcome === 'landed' ? 'Landed' : attempt.outcome === 'missed' ? `Missed: ${attempt.reason ?? 'landing'}` : 'Airborne'} · actual launch ${Math.round(attempt.launch.speed * 3.6)} km/h.`
      : lastTestAttempt
        ? `${testLabel} · Returned before a jump launch.`
        : '';
    if (!testMenu.hidden) renderTestMenu(analysis.valid, currentTest, actual);
    for (const node of root.querySelectorAll(
      '[data-editor-field], [data-editor-action]',
    )) {
      if (!node.hasAttribute('data-editor-base-disabled'))
        node.dataset.editorBaseDisabled = String(node.disabled);
      node.disabled =
        busy ||
        node.dataset.editorBaseDisabled === 'true' ||
        (Boolean(recoveryEntry) &&
          !['recover-draft', 'discard-recovery'].includes(
            node.dataset.editorAction,
          ));
      if (!node.dataset.editorAction) continue;
      const action = node.dataset.editorAction;
      if (action === 'tab-route') node.disabled = busy || selected < 0;
      else if (action === 'tab-shape')
        node.disabled = busy || selected < 0 || doc.points.length < 4;
      else if (action === 'tab-jumps')
        node.disabled = busy || doc.points.length < 4;
      else if (action === 'undo') node.disabled = busy || !undo.length;
      else if (action === 'redo') node.disabled = busy || !redo.length;
      else if (action === 'reset-track')
        node.disabled = busy || !doc.points.length;
      else if (action === 'test') node.disabled = busy || !analysis.valid;
      else if (
        ['generate', 'new-seed', 'new-variation', 'quick-start'].includes(
          action,
        )
      )
        node.disabled = busy;
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
      if (action === 'inspect-jump')
        node.disabled = busy || !flightPreview?.cruise;
      if (action.startsWith('tab-')) {
        const expanded =
          action === `tab-${authorGroup}` || action === `tab-${globalGroup}`;
        node.setAttribute('aria-expanded', String(expanded));
        node.setAttribute('aria-pressed', String(expanded));
      }
      if (action === 'view-map') {
        node.setAttribute('aria-pressed', String(mapOpen));
        node.setAttribute('aria-expanded', String(mapOpen));
        node.setAttribute(
          'aria-label',
          mapOpen ? 'Close route map' : 'Open route map',
        );
      }
      if (
        recoveryEntry &&
        !['recover-draft', 'discard-recovery'].includes(action)
      )
        node.disabled = true;
    }
    worldHost.inert = Boolean(recoveryEntry);
    mapPopover.hidden = !mapOpen;
    worldHost.hidden = false;
    const activeTool = PREVIEW_TOOLS.find((item) => item.id === tool);
    root.querySelector('[data-editor-view-hint]').textContent =
      context === 'environment'
        ? 'ENVIRONMENT · Drag to orbit · Choose a style, then Apply to preview'
        : `${activeTool.label.toUpperCase()} · ${activeTool.hint}`;
    syncCanvas({ frame });
    const forecast =
      context === 'road' &&
      authorGroup === 'jumps' &&
      selectedJumpId &&
      flightPreview?.cruise
        ? `Jump estimate · At full cruise: ${flightPreview.cruise.summary} At full boost: ${flightPreview.boost.summary}`
        : '';
    root.querySelector('[data-editor-test-feedback]').textContent = [
      actual,
      forecast,
    ]
      .filter(Boolean)
      .join(' ');
    syncStatus();
    syncCameraUI();
    tools.scrollTop = scrollTop;
    globalTools.scrollTop = globalScrollTop;
    restoreFocus(focus);
    if (
      caret &&
      document.activeElement?.matches('input[type="text"], textarea')
    )
      document.activeElement.setSelectionRange(...caret);
  }
  function addPoint(position) {
    if (recoveryEntry) return;
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
    if (recoveryEntry && !['recover-draft', 'discard-recovery'].includes(name))
      return;
    cancelActiveDrag();
    if (
      ['apply-road-finish', 'clear-road-finish'].includes(name) ||
      name.startsWith('clear-road-span-')
    ) {
      try {
        const range = { startIndex: shapeStart, endIndex: shapeEnd };
        const next =
          name === 'apply-road-finish'
            ? applyBiomeSpan(doc, { ...range, biome: roadSpanBiome })
            : clearBiomeSpan(
                doc,
                name.startsWith('clear-road-span-')
                  ? { spanId: name.slice('clear-road-span-'.length) }
                  : range,
              );
        commit(
          next,
          'Section road finish updated. Road shape, scenery and sky are unchanged.',
        );
      } catch (error) {
        status(error.message, 'error');
      }
      return;
    }
    if (
      [
        'preview-jump',
        'preview-resize',
        'preview-rebuild',
        'preview-find-jump',
      ].includes(name)
    ) {
      await run(async () => {
        const source = doc;
        status('Preparing the jump proposal…');
        const options = {
          pointIndex: Math.max(0, selected),
          size: jumpSizePreset,
          ...(['preview-resize', 'preview-rebuild'].includes(name)
            ? { jumpId: selectedJumpId }
            : {}),
          legacyRebuild: name === 'preview-rebuild',
          receiving: jumpReceiving,
          yieldControl: () =>
            new Promise((done) => requestAnimationFrame(done)),
        };
        let candidate;
        jumpProposalError = '';
        try {
          candidate =
            name === 'preview-find-jump'
              ? await findNextSuitableJump(source, {
                  ...options,
                  fromIndex: Math.max(0, selected),
                  rampAssist: true,
                })
              : await prepareJumpEdit(source, options);
        } catch (error) {
          jumpProposalError = error.message;
          throw error;
        }
        jumpCandidate = {
          ...candidate,
          sourceKey: JSON.stringify(source),
          editing: ['preview-resize', 'preview-rebuild'].includes(name),
        };
        status(
          `Preview only · ${Math.round(candidate.resolved.gapLength)} m gap. Apply keeps it; Cancel leaves your road unchanged.`,
        );
        render();
        viewport.focusTrajectories(candidate.ghost.sections, {
          launch: candidate.ghost.takeoff,
          landing: candidate.ghost.landing,
        });
      });
      if (hasJumpCandidate()) {
        const apply = root.querySelector('[data-editor-action="apply-jump"]');
        apply?.focus({ preventScroll: true });
        apply?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
      }
      return;
    }
    if (name === 'cancel-jump-preview') {
      jumpCandidate = null;
      status('Jump preview canceled. Road unchanged.');
      render();
      root
        .querySelector('[data-editor-action="preview-jump"]')
        ?.focus({ preventScroll: true });
      return;
    }
    if (name === 'apply-jump' && hasJumpCandidate()) {
      const candidate = jumpCandidate;
      selectedJumpId = candidate.jumpId;
      const jump = candidate.document.jumps.find(
        (entry) => entry.id === selectedJumpId,
      );
      selected = candidate.document.points.findIndex(
        (point) => point.id === jump.launchPointId,
      );
      rangeAnchor = rangeEnd = selected;
      showFlightPaths = true;
      commit(
        candidate.document,
        `${candidate.editing ? 'Jump resized' : 'Jump inserted'} · ${Math.round(candidate.resolved.gapLength)} m gap. One Undo restores the previous road.`,
      );
      return;
    }
    if (name === 'recover-draft' && recoveryEntry) {
      const recovered = recoveryEntry.document;
      recoveryEntry = null;
      selected = recovered.points.length >= 4 ? 0 : recovered.points.length - 1;
      rangeAnchor = rangeEnd = selected;
      tool = recovered.points.length >= 4 ? 'move' : 'draw';
      commit(
        recovered,
        'Draft recovered. Save keeps a named copy in My tracks.',
        { frame: true },
      );
      await run(async () => {
        const stored = await library.read(doc.id);
        if (stored && JSON.stringify(stored) === JSON.stringify(doc))
          saved = JSON.stringify(doc);
      });
      root
        .querySelector(
          `[data-editor-action="${tool === 'draw' ? 'draw-mode' : 'select-mode'}"]`,
        )
        ?.focus({ preventScroll: true });
      return;
    }
    if (name === 'discard-recovery') {
      try {
        recovery.clear();
        recoveryEntry = null;
        recoveryError = '';
        checkpointJSON = JSON.stringify(doc);
        recoveryState = '';
        render();
      } catch {
        status(
          'Could not clear the recovery draft. Your current work is unchanged.',
          'error',
        );
      }
      return;
    }
    if (name === 'context-road' || name === 'context-environment') {
      if (name === `context-${context}`) return;
      rememberGroupScroll();
      viewport.cancelInteraction();
      if (globalGroup !== 'library') workspacePanels[context] = globalGroup;
      if (context === 'road' && globalGroup !== 'library')
        roadAuthorGroup = authorGroup;
      context = name === 'context-road' ? 'road' : 'environment';
      globalGroup = workspacePanels[context];
      authorGroup = context === 'road' ? roadAuthorGroup : '';
      tab =
        globalGroup || authorGroup || (context === 'road' ? 'route' : 'world');
      render();
      return;
    }
    if (name === 'open-environment') {
      globalGroup = 'world';
      workspacePanels.environment = 'world';
      render();
      focusGroup('world');
      return;
    }
    if (name.startsWith('choose-biome-')) {
      fieldChange({
        target: { dataset: { editorField: 'biome' }, value: name.slice(13) },
      });
      return;
    }
    if (name.startsWith('tab-')) {
      const next = name.slice(4);
      if (next === 'world') context = 'environment';
      if (['generate', 'pickups'].includes(next)) context = 'road';
      if (!PANEL_SECTIONS.some(([id]) => id === next)) return;
      rememberGroupScroll();
      const isAuthor = AUTHOR_GROUPS.some(([id]) => id === next);
      if (next === 'library' && context === 'road' && globalGroup !== 'library')
        roadAuthorGroup = authorGroup;
      const closing = next === (isAuthor ? authorGroup : globalGroup);
      authorGroup = isAuthor && !closing ? next : '';
      globalGroup = !isAuthor && !closing ? next : '';
      if (next === 'library' && closing) {
        globalGroup = workspacePanels[context];
        if (context === 'road' && !globalGroup) authorGroup = roadAuthorGroup;
      }
      if (next !== 'library') workspacePanels[context] = globalGroup;
      if (isAuthor) roadAuthorGroup = authorGroup;
      tab =
        next === 'library' && closing
          ? globalGroup ||
            authorGroup ||
            (context === 'road' ? 'route' : 'world')
          : next;
      if (next === 'jumps' && !closing) {
        restoreJumpSelection();
        showFlightPaths = true;
      }
      render();
      const scrollArea = isAuthor ? tools : globalTools;
      scrollArea.scrollTop = groupScroll.get(next) ?? 0;
      if (!closing) focusGroup(next);
      return;
    }
    if (name === 'global-close') {
      const previous = globalGroup;
      rememberGroupScroll();
      globalGroup = '';
      if (previous !== 'library') workspacePanels[context] = '';
      else {
        globalGroup = workspacePanels[context];
        if (context === 'road' && !globalGroup) authorGroup = roadAuthorGroup;
      }
      tab =
        globalGroup || authorGroup || (context === 'road' ? 'route' : 'world');
      render();
      root
        .querySelector(
          `[data-editor-action="${previous === 'world' ? 'context-environment' : `tab-${previous}`}"]`,
        )
        ?.focus({ preventScroll: true });
      return;
    }
    if (name.startsWith('preset-')) {
      const preset = (
        editorBiome(environmentDraft.biome).presets ?? WORLD_PRESETS
      ).find((entry) => entry.id === name.slice(7));
      if (preset) {
        Object.assign(environmentDraft, {
          sceneryPreset: preset.id,
          density: preset.density,
          waterLevel: preset.waterLevel,
        });
        render();
      }
      return;
    }
    if (name === 'regenerate-environment' || name === 'new-world-seed') {
      if (name === 'new-world-seed') {
        let seed = Math.floor(Math.random() * 4294967296);
        if (seed === doc.environment.seed) seed = (seed + 1) >>> 0;
        environmentDraft.seed = seed;
      }
      const pending = clone(environmentDraft);
      edit(
        (next) => {
          next.biome = pending.biome;
          next.environment = {
            version: 1,
            seed: pending.seed,
            layoutVersion: ENVIRONMENT_LAYOUT_VERSION,
          };
          next.settings = {
            sceneryPreset: pending.sceneryPreset,
            density: pending.density,
            waterLevel: pending.waterLevel,
          };
          next.props = [];
        },
        `${editorBiome(pending.biome).label} environment regenerated. Your road, jumps and pickups are unchanged.`,
      );
      return;
    }
    if (name === 'tunes') {
      if (mapOpen) closeMap();
      if (authorGroup || (globalGroup && window.innerWidth < 900)) {
        rememberGroupScroll();
        authorGroup = '';
        if (window.innerWidth < 900) globalGroup = '';
        render();
      }
      if (typeof onTunes === 'function')
        onTunes(root.querySelector('[data-editor-action="tunes"]'));
      return;
    }
    if (name === 'spread-road') {
      status('Giving the road more room…');
      let spread = false;
      await run(async () => {
        await new Promise((done) => requestAnimationFrame(done));
        const next = spreadRoad(doc);
        tool = 'move';

        commit(
          next,
          'Road spread out. The layout is longer; Undo restores your original road.',
          { frame: true },
        );
        viewport.reset();
        spread = true;
      });
      if (spread)
        root.querySelector('[data-editor-action="select-mode"]')?.focus();
      return;
    }
    if (name === 'show-issue' || name.startsWith('show-issue-')) {
      const issue =
        name === 'show-issue'
          ? visibleIssue()
          : analysisFor().issues?.find(
              (entry) => entry.kind === name.slice('show-issue-'.length),
            );
      if (!issue || !Number.isInteger(issue.pointIndex)) return;
      inspectedIssueKind = issue.kind;
      selected = issue.pointIndex;
      selectedProp = -1;
      rangeAnchor = selected;
      rangeEnd = selected;
      tool = 'move';

      render();
      viewport.setVisible(!suspended);
      const point = doc.points[selected];
      if (issue.position)
        viewport.focusTrajectories([
          { points: [issue.position, [point.x, point.y, point.z]] },
        ]);
      else viewport.focusSelection();
      status(issue.message || issue.label);
      root
        .querySelector('[data-editor-action="show-issue"]')
        ?.focus({ preventScroll: true });
      return;
    }
    if (name === 'smooth-corner') {
      const issue = visibleIssue();
      const selectedId = doc.points[issue.pointIndex]?.id;
      let repaired = false;
      status('Smoothing the corner and checking the road…');
      await run(async () => {
        await new Promise((done) => requestAnimationFrame(done));
        const next = await smoothCorner(doc, {
          analysis: analysisFor(),
          yieldControl: () =>
            new Promise((done) => requestAnimationFrame(done)),
        });
        selected = Math.max(
          0,
          next.points.findIndex((point) => point.id === selectedId),
        );
        selectedProp = -1;
        rangeAnchor = selected;
        rangeEnd = selected;

        tool = 'move';
        const report = analyzeDocument(next);
        commit(
          next,
          `Corner near point ${selected + 1} smoothed. ${report.valid ? `Ready to test drive.${report.advisories?.length ? ` Warning: ${report.advisories[0].message}` : ''}` : `Next: ${report.primaryIssue?.message ?? report.errors[0]}`} Undo restores your road.`,
        );
        viewport.focusSelection();
        repaired = true;
      });
      if (repaired)
        root.querySelector('[data-editor-action="select-mode"]')?.focus();
      return;
    }
    if (name === 'finish-drawing') {
      tool = 'move';

      status(
        doc.courseType === 'circuit'
          ? 'Circuit connected. Drag any road point to shape it.'
          : 'Road drawn. Drag points to shape the descent.',
      );
      render({ frame: true });
      viewport.reset();
      root.querySelector('[data-editor-action="select-mode"]')?.focus();
      return;
    }
    const chosenTool = PREVIEW_TOOLS.find(
      (item) => item.action === (name === 'starter-draw' ? 'draw-mode' : name),
    );
    if (chosenTool) {
      if (name === 'starter-draw') starterPromptDismissedFor = doc.id;
      viewport.cancelInteraction();
      viewport.exitFly();
      rememberGroupScroll();
      authorGroup = '';
      tool = chosenTool.id;

      rangeArmed = false;
      selectedProp = -1;

      status(`${chosenTool.label}: ${chosenTool.hint}`);
      render();
      if (name === 'starter-draw')
        root.querySelector('[data-editor-action="draw-mode"]')?.focus();
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
    if (name === 'view-map') {
      if (mapOpen) closeMap({ focus: true });
      else {
        viewport.exitFly();
        window.dispatchEvent(new Event('editor-map-open'));
        rememberGroupScroll();
        authorGroup = '';
        mapOpen = true;
        map.fit();
        render();
        root
          .querySelector('[data-editor-action="map-close"]')
          .focus({ preventScroll: true });
      }
      return;
    }
    if (name === 'map-close' || name === 'view-world') {
      closeMap({ focus: true });
      return;
    }
    if (name === 'undo' || name === 'redo') {
      const source = name === 'undo' ? undo : redo,
        destination = name === 'undo' ? redo : undo;
      if (!source.length) return;
      destination.push(doc);
      const previousPoints = new Set(doc.points.map((point) => point.id));
      doc = source.pop();
      inspectedIssueKind = null;
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
      showFlightPaths = true;
      syncCanvas();
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
    if (name.startsWith('road-preset-')) {
      const selectedPreset = roadPresetOptions(name.slice(12), {
        courseType: doc.courseType,
        length: doc.generator.length,
      });
      edit((next) => {
        const {
          generatorVersion,
          courseType: ignoredType,
          ...preferences
        } = selectedPreset;
        Object.assign(next.generator, preferences, {
          version: generatorVersion,
        });
        void ignoredType;
      }, 'Road style selected. Choose Create road to apply it.');
      return;
    }
    const recipe = PLAYABLE_STARTERS.find(
      ({ id }) =>
        name === `starter-canvas-${id}` || name === `starter-file-${id}`,
    );
    if (
      recipe ||
      ['generate', 'quick-start', 'new-seed', 'new-variation'].includes(name)
    ) {
      status('Generating a drivable route…');
      let generated = false;
      await run(async () => {
        await new Promise((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(resolve)),
        );
        const starter = name === 'quick-start';
        let seed = doc.generator.seed;
        if (name === 'new-seed' || name === 'new-variation') {
          seed = Math.floor(Math.random() * 4294967296);
          if (seed === doc.generator.seed) seed = (seed + 1) >>> 0;
        }
        const next = await generateDocumentAsync(
          recipe?.options ?? {
            ...(starter
              ? { seed: 42017, length: 3000, bendiness: 0.45, elevation: 0.35 }
              : { ...doc.generator, seed }),
            biome: doc.biome,
            environment: doc.environment,
            settings: doc.settings,
            generatorVersion: GENERATOR_VERSION,
            jumpFrequency: starter
              ? 'normal'
              : (doc.generator.jumpFrequency ??
                (doc.generator.version === 1 ? 'none' : 'normal')),
            jumpSize: starter ? 'mixed' : (doc.generator.jumpSize ?? 'mixed'),
            courseType: doc.courseType,
            width: starter ? 40 : doc.width,
            ...doc.settings,
          },
          {
            yieldControl: () =>
              new Promise((done) => requestAnimationFrame(done)),
          },
        );
        next.id = recipe ? uid('track') : doc.id;
        next.name = recipe?.name ?? doc.name;
        next.props = [];
        next.rolls = [];
        const pickupOptions = recipe?.pickups ?? {
          preset: doc.pickups?.preset ?? 'balanced',
          density: doc.pickups?.density ?? 0.5,
        };
        next.pickups =
          recipe || starter || seedPickups
            ? generatePickupLayout(next, pickupOptions)
            : { version: 1, ...pickupOptions, devices: [] };
        if (recipe) {
          viewport.cancelInteraction();
          viewport.exitFly();
          mapOpen = false;
          context = 'road';
          authorGroup = '';
          roadAuthorGroup = '';
          tab = 'route';
          environmentKey = '';
        }
        selected = 0;
        selectedProp = -1;
        rangeAnchor = 0;
        rangeEnd = 0;
        tool = 'move';

        jumpStart = Math.floor(next.points.length * 0.2);
        jumpEnd = Math.min(next.points.length - 2, jumpStart + 2);
        commit(
          next,
          recipe
            ? `${recipe.name} is ready to test drive. Undo restores your previous draft.`
            : `${doc.courseType === 'downhill' ? 'Downhill course' : 'Circuit'} generated from seed ${next.generator.seed}: ${next.jumps.length} ${next.jumps.length === 1 ? 'jump' : 'jumps'}, ${next.pickups.devices.length} pickups. Drag road points to make it yours.`,
          {
            frame: true,
          },
        );
        viewport.setVisible(view === 'world' && !suspended);
        viewport.reset();
        generated = true;
      });
      if (generated) {
        globalGroup = '';
        workspacePanels.road = '';
        render();
        root
          .querySelector(
            `[data-editor-action="${recipe ? 'test' : 'select-mode'}"]`,
          )
          ?.focus();
      }
      return;
    }
    if (name === 'blank' || name === 'reset-track') {
      context = 'road';
      globalGroup = '';
      workspacePanels.road = '';
      authorGroup = '';
      roadAuthorGroup = '';
      viewport.cancelInteraction();
      selected = -1;
      selectedProp = -1;
      tab = 'route';

      tool = 'draw';
      rangeAnchor = -1;
      rangeEnd = -1;

      const next = createDocument({
        biome: doc.biome,
        environment: doc.environment,
        settings: doc.settings,
        seed: doc.generator.seed,
        blank: true,
        courseType: doc.courseType,
      });
      starterPromptDismissedFor = name === 'reset-track' ? doc.id : next.id;
      if (name === 'reset-track') {
        next.id = doc.id;
        next.name = doc.name;
        next.width = doc.width;
        next.generator = clone(doc.generator);
        next.settings = clone(doc.settings);
        next.environment = clone(doc.environment);
        next.biome = doc.biome;
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
    if (name === 'fly-camera') {
      if (viewport.isFlying()) viewport.exitFly();
      else if (!viewport.enterFly())
        status('Wait for the world preview to finish loading.');
      return;
    }
    if (name === 'focus-selection') {
      viewport.focusSelection();
      return;
    }
    if (name === 'fit') {
      viewport.reset();
      return;
    }
    if (name === 'zoom-in' || name === 'zoom-out') {
      viewport.zoom(name === 'zoom-in' ? -1 : 1);
      return;
    }
    if (name === 'exit') {
      flushRecovery();
      onExit(clone(doc));
      return;
    }
    if (name === 'test-options') {
      showTestMenu(testMenu.hidden);
      if (!testMenu.hidden) {
        render();
        testMenu.querySelector('button:not(:disabled)')?.focus();
      }
      return;
    }
    if (TEST_ACTIONS.has(name)) {
      const kind = TEST_ACTIONS.get(name);
      const request = testRequest(kind, kind === 'retry' && testIsCurrent());
      if (!request || !analysisFor().valid) return;
      const fromMenu = TEST_MENU_ACTIONS.some(([action]) => action === name);
      testReturnAction = fromMenu ? 'test-options' : name;
      showTestMenu(false, { focus: fromMenu });
      await run(async () => {
        flushRecovery();
        status('Preparing Test Drive…');
        await onTestDrive(clone(doc), request);
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
        const stored = validateDocument(await library.save(next));
        saved = JSON.stringify(stored);
        if (saved !== JSON.stringify(doc)) doc = stored;
        savedId = doc.id;
        await refreshLibrary();
        const pending =
          environmentDraft.biome !== doc.biome ||
          environmentDraft.seed !== doc.environment.seed ||
          ['sceneryPreset', 'density', 'waterLevel'].some(
            (key) => environmentDraft[key] !== doc.settings[key],
          );
        status(
          pending
            ? 'Track saved to My tracks; new environment choices are still pending. Apply environment to preview them.'
            : 'Track saved to My tracks.',
        );
      });
      return;
    }
    if (name === 'load') {
      await run(async () => {
        const next = await library.read(savedId);
        if (!next) throw new Error('This saved track is no longer available.');
        context = 'road';
        globalGroup = '';
        authorGroup = '';
        roadAuthorGroup = '';
        workspacePanels.road = '';
        tool = next.points.length < 4 ? 'draw' : 'move';
        selected = next.points.length ? 0 : -1;
        rangeAnchor = selected;
        rangeEnd = selected;
        commit(next, 'Track loaded.', { frame: true });
        restoreJumpSelection();
        saved = JSON.stringify(doc);
        root
          .querySelector('[data-editor-action="select-mode"]')
          ?.focus({ preventScroll: true });
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
        context = 'road';
        globalGroup = '';
        authorGroup = '';
        roadAuthorGroup = '';
        workspacePanels.road = '';
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
        root
          .querySelector('[data-editor-action="select-mode"]')
          ?.focus({ preventScroll: true });
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
    'toggle',
    (event) => {
      if (event.target.dataset.editorDetails)
        openDetails.set(event.target.dataset.editorDetails, event.target.open);
    },
    { capture: true, signal: life.signal },
  );
  root.addEventListener(
    'click',
    async (event) => {
      const target = event.target.closest('[data-editor-action]');
      if (!target || target.disabled) return;
      const section = target.closest('[data-editor-section]');
      const authorOption =
        section &&
        AUTHOR_GROUPS.some(([id]) => id === section.dataset.editorSection);
      await action(target.dataset.editorAction);
      if (
        authorOption &&
        ![
          'preview-jump',
          'preview-resize',
          'preview-rebuild',
          'cancel-jump-preview',
          'preview-find-jump',
        ].includes(target.dataset.editorAction) &&
        !disposed &&
        !suspended &&
        messageKind !== 'error'
      )
        closeAuthorGroup();
    },
    { signal: life.signal },
  );
  function fieldChange(event) {
    const field = event.target.dataset.editorField;
    if (!field || busy || recoveryEntry) return;
    cancelActiveDrag();
    const value = event.target.value;
    const number = Number(value);
    if (
      [
        'jump-size-preset',
        'test-entry-speed',
        'point-test-entry-speed',
        'test-reserve',
        'point-test-reserve',
        'road-span-biome',
      ].includes(field)
    ) {
      if (field === 'jump-size-preset') {
        jumpSizePreset = value;
        jumpCandidate = null;
        jumpProposalError = '';
        status('Size chosen. Preview the proposed jump before applying it.');
      } else if (
        field === 'test-entry-speed' ||
        field === 'point-test-entry-speed'
      )
        testEntrySpeed = value;
      else if (field === 'test-reserve' || field === 'point-test-reserve')
        testReserve = value;
      else roadSpanBiome = value;
      render();
      return;
    }
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
        jumpCandidate = null;
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
    if (['world-seed', 'environment-density', 'biome'].includes(field)) {
      if (field === 'world-seed')
        environmentDraft.seed = Math.max(
          0,
          Math.min(4294967295, Math.round(number || 0)),
        );
      if (field === 'environment-density') environmentDraft.density = number;
      if (field === 'biome') {
        environmentDraft.biome = value;
        const preset = (editorBiome(value).presets ?? WORLD_PRESETS)[0];
        Object.assign(environmentDraft, {
          sceneryPreset: preset.id,
          density: preset.density,
          waterLevel: preset.waterLevel,
        });
      }
      render();
      return;
    }
    if (field === 'point') {
      selectPoint(number);
      return;
    }

    if (field === 'show-flight-paths') {
      showFlightPaths = event.target.checked;
      render();
      return;
    }
    if (field === 'seed-pickups') {
      seedPickups = event.target.checked;
      return;
    }
    if (
      ['shape-start', 'shape-end', 'shape-preset', 'shape-direction'].includes(
        field,
      )
    ) {
      if (field === 'shape-start') {
        shapeStart = Math.max(0, Math.min(doc.points.length - 2, number));
        shapeEnd = Math.max(shapeStart + 1, shapeEnd);
      }
      if (field === 'shape-end') {
        shapeEnd = Math.max(1, Math.min(doc.points.length - 1, number));
        shapeStart = Math.min(shapeStart, shapeEnd - 1);
      }
      if (field === 'shape-preset') shapePreset = value;
      if (field === 'shape-direction') shapeDirection = value;
      if (field === 'shape-start' || field === 'shape-end') {
        rangeAnchor = shapeStart;
        rangeEnd = shapeEnd;
      }
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
        else if (field === 'width') next.width = number;
        else if (field === 'pickup-preset') next.pickups.preset = value;
        else if (field === 'pickup-density') next.pickups.density = number;
        else if (['seed', 'length', 'bendiness', 'elevation'].includes(field))
          next.generator[field] = number;
        else if (
          ['jump-frequency', 'jump-size', 'crossovers'].includes(field)
        ) {
          next.generator = {
            ...next.generator,
            version: GENERATOR_VERSION,
            jumpFrequency:
              next.generator.jumpFrequency ??
              (next.generator.version === 1 ? 'none' : 'normal'),
            jumpSize: next.generator.jumpSize ?? 'mixed',
            [field === 'crossovers'
              ? 'crossovers'
              : field === 'jump-frequency'
                ? 'jumpFrequency'
                : 'jumpSize']: field === 'crossovers' ? number : value,
          };
        } else if (['density', 'waterLevel'].includes(field))
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
  function dismissTestMenuOutside(event) {
    if (
      !testMenu.hidden &&
      !testMenu.contains(event.target) &&
      !testOptions.contains(event.target)
    )
      showTestMenu(false);
  }
  document.addEventListener(
    'pointerdown',
    (event) => {
      dismissTestMenuOutside(event);
      if (
        mapOpen &&
        !suspended &&
        !disposed &&
        !mapPopover.contains(event.target) &&
        !event.target.closest('[data-editor-action="view-map"]')
      )
        closeMap();
    },
    { capture: true, signal: life.signal },
  );
  document.addEventListener(
    'focusin',
    (event) => {
      dismissTestMenuOutside(event);
      if (
        mapOpen &&
        !suspended &&
        !disposed &&
        !mapPopover.contains(event.target) &&
        !event.target.closest('[data-editor-action="view-map"]')
      )
        closeMap();
    },
    { signal: life.signal },
  );
  window.addEventListener(
    'blur',
    () => {
      closeMap();
      showTestMenu(false);
    },
    { signal: life.signal },
  );
  root.addEventListener('change', fieldChange, { signal: life.signal });
  root.addEventListener(
    'focusin',
    (event) => {
      const section = event.target.closest('[data-editor-section]');
      if (!section || tab === section.dataset.editorSection) return;
      tab = section.dataset.editorSection;
      syncCanvas();
    },
    { signal: life.signal },
  );
  root.addEventListener(
    'input',
    (event) => {
      if (event.target.type !== 'range') return;
      const output =
        event.target.previousElementSibling?.querySelector('output');
      if (output)
        output.textContent = output.hasAttribute('data-editor-percent')
          ? `${Math.round(Number(event.target.value) * 100)}%`
          : event.target.value +
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
        if (recoveryEntry) {
          event.preventDefault();
          event.stopPropagation();
          return;
        }
        if (event.repeat) {
          event.preventDefault();
          event.stopPropagation();
          return;
        }
        if (viewport.isFlying()) {
          event.preventDefault();
          event.stopPropagation();
          viewport.exitFly();
          return;
        }
        event.preventDefault();
        event.stopPropagation();
        if (busy) return;
        if (!testMenu.hidden) {
          showTestMenu(false, { focus: true });
          return;
        }
        if (mapOpen) {
          closeMap({ focus: true });
          return;
        }
        if (jumpCandidate && context === 'road') {
          action('cancel-jump-preview');
          return;
        }
        if (authorGroup) {
          closeAuthorGroup();
          return;
        }
        if (globalGroup) {
          action('global-close');
          return;
        }
        if (context === 'environment') {
          root
            .querySelector('[data-editor-action="context-environment"]')
            ?.focus({ preventScroll: true });
          return;
        }
        if (
          tool === 'draw' ||
          selected >= 0 ||
          selectedProp >= 0 ||
          rangeArmed ||
          selectedRange()
        ) {
          const drawing = tool === 'draw';
          if (drawing) tool = 'move';
          tab = 'route';
          status(
            drawing
              ? 'Drawing stopped. Road points kept; choose Draw road to continue.'
              : 'Selection cleared.',
          );
          selectPoint(-1);
          root
            .querySelector(
              `[data-editor-action="${PREVIEW_TOOLS.find((item) => item.id === tool).action}"]`,
            )
            ?.focus({ preventScroll: true });
          return;
        }
        onExit(clone(doc));
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
        const chosen = PREVIEW_TOOLS.find(
          (item) => item.key === event.key.toUpperCase(),
        );
        if (chosen && context === 'road') {
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
      `[data-editor-action="${recoveryEntry ? 'recover-draft' : tool === 'draw' ? 'draw-mode' : 'select-mode'}"]`,
    )
    .focus({ preventScroll: true });
  refreshLibrary()
    .then(() => {
      if (!disposed) render();
    })
    .catch((error) => status(error.message, 'error'));
  window.addEventListener('pagehide', flushRecovery, { signal: life.signal });
  document.addEventListener(
    'visibilitychange',
    () => {
      if (document.visibilityState === 'hidden') flushRecovery();
    },
    { signal: life.signal },
  );
  return {
    getDocument: () => clone(doc),
    setTestDriveAttempt(report) {
      lastTestAttempt = report;
      if (
        report.courseIdentity === documentIdentity(doc) &&
        doc.jumps.some((jump) => jump.id === report.lastAttempt?.id)
      )
        selectedJumpId = report.lastAttempt.id;
    },
    getState: () => ({
      selectedPoint: selected,
      selectedProp,
      drawMode: tool === 'draw',
      tool,
      panelOpen: Boolean(authorGroup || globalGroup),
      authorGroup,
      globalGroup,
      context,
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
      focusedIssue: visibleIssue(),
      advisories: latestAnalysis?.advisories ?? [],
      dirty: JSON.stringify(doc) !== saved,
      view,
      mapOpen,
      tab,
      busy,
      suspended,
      recoveryAvailable: Boolean(recoveryEntry),
      recoveryState,
      jumpProposal: hasJumpCandidate() ? clone(jumpCandidate.resolved) : null,
      lastTestAttempt: lastTestAttempt ? clone(lastTestAttempt) : null,
      points: doc.points.length,
      preview: viewport.getMetrics(),
      flyActive: viewport.isFlying(),
    }),
    suspend() {
      mapOpen = false;
      showTestMenu(false);
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
      restoreFocus(['data-editor-action', testReturnAction]);
      testReturnAction = 'test';
    },
    dispose() {
      if (disposed) return;
      flushRecovery();
      disposed = true;
      life.abort();
      clearTimeout(flightTimer);
      clearTimeout(recoveryTimer);
      ++flightVersion;
      map.dispose();
      viewport.dispose();
      root.remove();
      host.classList.remove('track-editor-host');
    },
  };
}
