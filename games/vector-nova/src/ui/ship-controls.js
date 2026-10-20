import { SHIPS } from '../ships/catalog.js';
import { RIVAL_SHIPS } from '../ships/rivals.js';

// Compare the actual tuning across the fleet; no separate cosmetic ratings.
const shipStats = [
  {
    id: 'speed',
    label: 'SPEED',
    value: (h) => h.cruiseSpeed,
    format: (value) => `${Math.round(value * 3.6)} km/h`,
  },
  { id: 'acceleration', label: 'ACCEL', value: (h) => h.thrust },
  { id: 'handling', label: 'HANDLING', value: (h) => h.turn },
  { id: 'braking', label: 'BRAKING', value: (h) => h.braking },
  { id: 'grip', label: 'GRIP', value: (h) => h.grip },
  {
    id: 'boost',
    label: 'BOOST',
    value: (h) => 100 / h.boostDrain,
    format: (value) => `${value.toFixed(1)} s`,
  },
].map((stat) => ({
  ...stat,
  maximum: Math.max(...SHIPS.map((craft) => stat.value(craft.handling))),
}));

export const inspectionPanel = `<section id="inspection-panel" class="panel hidden"><div class="eyebrow">AERODYNAMICS DIVISION / 07</div><h1 class="inspect-title" aria-live="polite">KESTREL<span class="dot">.</span></h1><p class="intro">Twin-core magnetic interceptor.<br>Ceramic armour. Exposed titanium propulsion.<br>Built to stay close to the limit.</p><dl><div><dt>DESIGN</dt><dd>Split prow / swept ceramic chassis</dd></div><div><dt>PROPULSION</dt><dd>Dual induction turbines</dd></div></dl><div class="actions"><button id="inspect-start" class="primary">DRIVE PROTOTYPE <span>↗</span></button><button id="inspect-back">BACK TO PROVING GROUND</button></div></section>`;

// Shared fleet/inspector controls; no level or race runtime dependencies.
export function createShipControls(root, actions, selectedShip = SHIPS[0]) {
  const $ = (id) => root.querySelector('#' + id);
  const shipPickers = [];
  for (const [panelId, prefix] of [
    ['title-panel', 'paddock'],
    ['inspection-panel', 'inspection'],
  ]) {
    if (!$(panelId)) continue;
    const section = document.createElement('section');
    section.className = 'ship-selection';
    section.innerHTML = `<div class="ship-picker-label" id="${prefix}-ship-label">CHOOSE SHIP <span>04 CHASSIS</span></div><div class="ship-picker" role="radiogroup" aria-labelledby="${prefix}-ship-label"></div><div class="ship-stats" role="group" aria-label="Selected ship performance; bars compare the current fleet"></div>`;
    const stats = section.querySelector('.ship-stats');
    for (const stat of shipStats) {
      const row = document.createElement('div');
      row.className = 'ship-stat';
      row.dataset.stat = stat.id;
      row.innerHTML = `<div class="ship-stat-label"><span id="${prefix}-${stat.id}-label">${stat.label}</span><b></b></div><div class="ship-stat-track" role="meter" aria-labelledby="${prefix}-${stat.id}-label" aria-valuemin="0" aria-valuemax="100"><i></i></div>`;
      stats.append(row);
    }
    const choices = section.querySelector('.ship-picker');
    for (const craft of SHIPS) {
      const button = document.createElement('button');
      button.type = 'button';
      button.dataset.ship = craft.id;
      button.setAttribute('role', 'radio');
      button.innerHTML = `<b>${craft.name}</b><span>${craft.role}</span><i aria-hidden="true">✓</i>`;
      button.onclick = () => actions.selectShip(craft.id);
      button.onkeydown = (event) => {
        const direction = ['ArrowRight', 'ArrowDown'].includes(event.key)
          ? 1
          : ['ArrowLeft', 'ArrowUp'].includes(event.key)
            ? -1
            : 0;
        if (!direction) return;
        event.preventDefault();
        event.stopPropagation();
        const next =
          (SHIPS.indexOf(craft) + direction + SHIPS.length) % SHIPS.length;
        const target = choices.children[next];
        target.focus();
        target.click();
      };
      choices.append(button);
    }
    const destination = $(panelId);
    destination.insertBefore(
      section,
      destination.querySelector(
        panelId === 'title-panel' ? '.inspection-actions' : 'dl',
      ),
    );
    shipPickers.push(section);
  }
  let inspectionTab = 'fleet',
    inspectionSession = false,
    inspectionMenu = false,
    fleetLoading = false;
  let selectedRival = RIVAL_SHIPS[0];
  const inspection = $('inspection-panel');
  const inspectionTools = document.createElement('div');
  inspectionTools.id = 'inspection-tools';
  inspectionTools.setAttribute('role', 'group');
  inspectionTools.setAttribute('aria-label', 'Ship preview controls');
  for (const [key, label, pressed] of [
    ['autoRotate', 'Auto-rotate', true],
    ['boost', 'Boost', false],
    ['driving', 'Driving', true],
  ]) {
    const button = document.createElement('button');
    button.type = 'button';
    button.dataset.preview = key;
    button.setAttribute('aria-pressed', String(pressed));
    button.textContent = label;
    button.onclick = () => actions.toggleInspectionPreview(key);
    inspectionTools.append(button);
  }
  const previewHint = document.createElement('p');
  previewHint.textContent = 'Drag to rotate · Preview: driving at 400 km/h';
  inspectionTools.append(previewHint);
  inspection.insertBefore(inspectionTools, inspection.querySelector('dl'));
  function setInspectionPreview(preview) {
    for (const button of inspectionTools.querySelectorAll('[data-preview]')) {
      const key = button.dataset.preview;
      button.setAttribute('aria-pressed', String(preview[key]));
      button.disabled = inspectionTab === 'rivals' && key !== 'autoRotate';
    }
    previewHint.textContent = `Drag to rotate · Preview: ${preview.driving ? 'driving at 400 km/h' : 'stationary'}`;
  }

  const tabs = document.createElement('div');
  tabs.className = 'inspection-tabs';
  tabs.setAttribute('role', 'tablist');
  tabs.setAttribute('aria-label', 'Ship collection');
  const collections = [
    ['fleet', 'Your ships'],
    ...(new URLSearchParams(location.search).get('dev') === '1'
      ? [['rivals', 'AI racers']]
      : []),
  ];
  for (const [index, [id, label]] of collections.entries()) {
    const button = document.createElement('button');
    button.id = `inspection-${id}-tab`;
    button.textContent = label;
    button.setAttribute('role', 'tab');
    button.setAttribute('aria-controls', `inspection-${id}-picker`);
    button.onclick = () => actions.selectInspectionTab(id);
    button.onkeydown = (event) => {
      if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key))
        return;
      event.preventDefault();
      event.stopPropagation();
      const nextIndex =
        event.key === 'Home'
          ? 0
          : event.key === 'End'
            ? collections.length - 1
            : (index +
                (event.key === 'ArrowRight' ? 1 : -1) +
                collections.length) %
              collections.length;
      const [next] = collections[nextIndex];
      const target = $(`inspection-${next}-tab`);
      target.focus();
      target.click();
    };
    tabs.append(button);
  }
  inspection.prepend(tabs);
  const fleetPicker = inspection.querySelector('.ship-selection');
  fleetPicker.id = 'inspection-fleet-picker';
  fleetPicker.setAttribute('role', 'tabpanel');
  fleetPicker.setAttribute('aria-labelledby', 'inspection-fleet-tab');
  const rivalPicker = document.createElement('section');
  rivalPicker.className = 'ship-selection rival-selection hidden';
  rivalPicker.id = 'inspection-rivals-picker';
  rivalPicker.setAttribute('role', 'tabpanel');
  rivalPicker.setAttribute('aria-labelledby', 'inspection-rivals-tab');
  rivalPicker.innerHTML = `<div class="ship-picker-label" id="rival-ship-label">AI RACERS <span>${String(RIVAL_SHIPS.length).padStart(2, '0')} CHASSIS</span></div><div class="ship-picker" role="radiogroup" aria-labelledby="rival-ship-label"></div><p class="ship-summary">AI RACING FLEET · INSPECTION ONLY</p>`;
  const rivalChoices = rivalPicker.querySelector('.ship-picker');
  RIVAL_SHIPS.forEach((craft, index) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.dataset.rival = craft.id;
    button.setAttribute('role', 'radio');
    button.innerHTML = `<b>${craft.name}</b><span>${craft.role}</span><i aria-hidden="true">✓</i>`;
    button.onclick = () => actions.inspectRival(craft.id);
    button.onkeydown = (event) => {
      const direction = {
        ArrowRight: 1,
        ArrowLeft: -1,
        ArrowDown: 3,
        ArrowUp: -3,
      }[event.key];
      if (!direction && !['Home', 'End'].includes(event.key)) return;
      event.preventDefault();
      event.stopPropagation();
      const target =
        rivalChoices.children[
          event.key === 'Home'
            ? 0
            : event.key === 'End'
              ? RIVAL_SHIPS.length - 1
              : (index + direction + RIVAL_SHIPS.length) % RIVAL_SHIPS.length
        ];
      target.focus();
      target.click();
    };
    rivalChoices.append(button);
  });
  inspection.insertBefore(rivalPicker, inspection.querySelector('dl'));
  const loadingMessage = document.createElement('p');
  loadingMessage.className = 'ship-load-status';
  loadingMessage.setAttribute('role', 'status');
  root.append(loadingMessage);
  function setShip(craft) {
    selectedShip = craft;
    for (const section of shipPickers) {
      for (const button of section.querySelectorAll('[data-ship]')) {
        const chosen = button.dataset.ship === craft.id;
        button.setAttribute('aria-checked', String(chosen));
        button.tabIndex = chosen ? 0 : -1;
      }
      for (const stat of shipStats) {
        const value = stat.value(craft.handling);
        const fraction = value / stat.maximum;
        const rating = (fraction * 10).toFixed(1);
        const text = stat.format ? stat.format(value) : `${rating}/10`;
        const row = section.querySelector(`[data-stat="${stat.id}"]`);
        const meter = row.querySelector('[role="meter"]');
        row.querySelector('b').textContent = text;
        row.style.setProperty('--stat-fill', `${fraction * 100}%`);
        row.title = `${stat.label}: ${text}. ${rating}/10 relative to the current fleet.`;
        meter.setAttribute('aria-valuenow', String(Math.round(fraction * 100)));
        meter.setAttribute(
          'aria-valuetext',
          `${text}; relative to the current fleet`,
        );
      }
    }
    if (inspectionTab === 'fleet') setInspectionDetails(craft);
  }
  function setInspectionDetails(craft, rival = false) {
    inspection.querySelector('.eyebrow').textContent = rival
      ? 'AI RACERS / SHIP INSPECTION'
      : 'FLEET / SHIP INSPECTION';
    inspection.querySelector('h1').textContent = craft.name.toUpperCase() + '.';
    inspection.querySelector('.intro').textContent = craft.description;
    const details = inspection.querySelectorAll('dd');
    details[0].textContent = craft.design;
    details[1].textContent = rival
      ? craft.propulsion
      : craft.exhausts.length === 1
        ? 'Single oversized ion core'
        : 'Twin ion cores';
    $('inspect-start').firstChild.textContent = inspectionSession
      ? 'RETURN TO SESSION '
      : `DRIVE ${craft.name.toUpperCase()} `;
    $('inspect-back').textContent = inspectionMenu
      ? '← Back to race setup'
      : inspectionSession
        ? 'RETURN TO SESSION'
        : 'CIRCUITS';
  }
  function setInspectedRival(craft) {
    selectedRival = craft;
    for (const button of rivalChoices.children) {
      const chosen = button.dataset.rival === craft.id;
      button.setAttribute(
        'aria-checked',
        String(inspectionTab === 'rivals' && chosen),
      );
      button.tabIndex = chosen ? 0 : -1;
    }
    if (inspectionTab === 'rivals') setInspectionDetails(craft, true);
  }
  function setInspectionTab(tab) {
    inspectionTab = tab;
    for (const button of tabs.children) {
      const chosen = button.id === `inspection-${tab}-tab`;
      button.setAttribute('aria-selected', String(chosen));
      button.tabIndex = chosen ? 0 : -1;
    }
    fleetPicker.classList.toggle('hidden', tab !== 'fleet');
    rivalPicker.classList.toggle('hidden', tab !== 'rivals');
    $('inspect-start').classList.toggle(
      'hidden',
      inspectionMenu || tab === 'rivals',
    );
    root.classList.toggle('inspecting-rivals', tab === 'rivals');
    for (const button of inspectionTools.querySelectorAll('[data-preview]'))
      button.disabled =
        tab === 'rivals' && button.dataset.preview !== 'autoRotate';
    setInspectedRival(selectedRival);
    if (tab === 'fleet') setInspectionDetails(selectedShip);
  }
  setShip(selectedShip);
  setInspectionTab('fleet');
  let pickerFocus = null;
  return {
    setInspectionSession(active) {
      inspectionSession = !!active;
      for (const section of shipPickers)
        for (const button of section.querySelectorAll('[data-ship]'))
          button.disabled = fleetLoading || inspectionSession;
      setInspectionDetails(
        inspectionTab === 'rivals' ? selectedRival : selectedShip,
        inspectionTab === 'rivals',
      );
    },
    setInspectionMenu(active) {
      inspectionMenu = active;
      $('inspect-start').classList.toggle(
        'hidden',
        active || inspectionTab === 'rivals',
      );
      setInspectionDetails(
        inspectionTab === 'rivals' ? selectedRival : selectedShip,
        inspectionTab === 'rivals',
      );
    },
    setShip,
    setInspectionTab,
    setInspectedRival,
    setRivalLoading(loading) {
      rivalPicker.setAttribute('aria-busy', String(loading));
      if (loading) loadingMessage.textContent = 'Preparing AI racer…';
      else if (loadingMessage.textContent === 'Preparing AI racer…')
        loadingMessage.textContent = '';
    },
    setShipLoading(loading) {
      fleetLoading = loading;
      if (loading)
        pickerFocus = document.activeElement?.closest('.ship-picker');
      for (const section of shipPickers) {
        section.setAttribute('aria-busy', String(loading));
        for (const button of section.querySelectorAll('button'))
          button.disabled = loading || inspectionSession;
      }
      if ($('start')) $('start').disabled = loading;
      if ($('practice')) $('practice').disabled = loading;
      $('inspect-start').disabled = loading;
      for (const button of tabs.children) button.disabled = loading;
      if (loading) loadingMessage.textContent = 'Preparing ship…';
      else if (loadingMessage.textContent === 'Preparing ship…')
        loadingMessage.textContent = '';
      if (
        !loading &&
        pickerFocus &&
        document.activeElement === document.body &&
        !pickerFocus.closest('.panel').classList.contains('hidden')
      ) {
        pickerFocus
          .querySelector('[aria-checked="true"]')
          ?.focus({ preventScroll: true });
      }
      if (!loading) pickerFocus = null;
    },
    shipError(message) {
      loadingMessage.textContent = message;
    },
    setInspectionPreview,
    inspectionViewport() {
      if (innerWidth > 760 || innerWidth > innerHeight) return null;
      const panel = $('inspection-panel');
      const heading = panel
        .querySelector('.ship-selection:not(.hidden)')
        .getBoundingClientRect();
      const details = inspectionTools;
      const specs = (
        details.offsetHeight ? details : panel.querySelector('.actions')
      ).getBoundingClientRect();
      return {
        left: innerWidth * 0.06,
        top: heading.bottom + 14,
        width: innerWidth * 0.88,
        height: Math.max(24, specs.top - heading.bottom - 28),
      };
    },
    inspectionFocus: () =>
      inspectionMenu
        ? 'inspect-back'
        : inspectionTab === 'rivals'
          ? 'inspection-rivals-tab'
          : 'inspect-start',
  };
}
