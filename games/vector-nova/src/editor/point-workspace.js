// The viewport keeps these controls mounted while the selection, docks and road change.
import './point-workspace.css';

const adjuster = (axis, label, unit, min, max) =>
  `<div class="workshop-point-adjust"><label class="workshop-scrub-grip" title="Drag horizontally to change ${label.toLowerCase()} · Alt for fine control">${label} ↔<input type="range" data-scrub="${axis}" aria-label="Scrub selected ${label.toLowerCase()}" min="${min}" max="${max}" step="1"></label><input type="number" data-point-axis="${axis}" aria-label="Selected ${label.toLowerCase()}" min="${min}" max="${max}" step="any"><small>${unit}</small></div>`;

export const pointWorkspaceMarkup = `<fieldset class="workshop-point-workspace" data-point-workspace aria-label="Road point controls" hidden>
  <div class="workshop-point-ruler">
    <button type="button" data-editor-action="context-prev" aria-label="Previous route point">‹</button>
    <label class="workshop-point-address">Point <input type="number" min="1" step="1" data-point-address aria-label="Go to point"><small data-point-total></small></label>
    <div class="workshop-point-track"><svg viewBox="0 0 1000 32" preserveAspectRatio="none" aria-hidden="true"><path class="workshop-point-terrain"/><g data-point-ticks></g></svg><i class="workshop-point-cursor" aria-hidden="true" hidden></i><input type="range" aria-label="Route point navigator" title="Drag or scroll through points · Shift to extend the selection" data-point-ruler></div>
    <button type="button" data-editor-action="context-next" aria-label="Next route point">›</button>
  </div>
  <div class="workshop-point-transforms">
    <button type="button" data-editor-action="select-section" title="Tap the end point, or Shift-click it on the road">Select span</button>
    <output data-point-count></output>
    ${adjuster('y', 'Height', 'm', 0, 3000)}${adjuster('roll', 'Roll', '°', -1440, 1440)}
    <div class="workshop-point-twist" role="group" aria-label="Twist road section">
      <span>Twist</span><button type="button" data-point-turn="-1" aria-label="Twist section left">↶</button>
      <select data-point-angle aria-label="Section twist angle"><option value="90">90°</option><option value="180">180°</option><option value="270">270°</option></select>
      <button type="button" data-point-turn="1" aria-label="Twist section right">↷</button>
      <button type="button" data-point-turn="0" title="Hold the starting angle across this section">Straight</button>
    </div>
  </div>
</fieldset>`;

const wrap = (index, count) => ((index % count) + count) % count;
const shown = (n) => Math.round(n * 10) / 10;

export function bindPointWorkspace(
  el,
  { navigate, transform, commit, cancel, twist, signal },
) {
  const find = (selector) => el.querySelector(selector);
  const ruler = find('[data-point-ruler]'),
    ticks = find('[data-point-ticks]'),
    terrain = find('.workshop-point-terrain'),
    cursor = find('.workshop-point-cursor'),
    address = find('[data-point-address]');
  const countLabel = find('[data-point-count]'),
    arm = find('[data-editor-action="select-section"]');
  let count = 0,
    index = -1,
    values = {},
    locked = true,
    tickKey = '',
    profileKey = '',
    gesture = null;
  let wheelDelta = 0,
    wheelTime = 0;
  function go(raw, extend = false, stepDirection = 0) {
    if (!count || locked) return;
    const next = wrap(raw, count);
    if (next !== index || extend)
      navigate(next, { extendRange: extend, stepDirection });
  }
  function on(type, fn, options = {}) {
    el.addEventListener(type, fn, { ...options, signal });
  }
  function fromPointer(event) {
    const rect = ruler.getBoundingClientRect();
    return Math.round(
      ((event.clientX - rect.left) / (rect.width || 1)) * (count - 1),
    );
  }
  function stop(accept) {
    if (!gesture) return;
    const { target, id, axis, moved } = gesture;
    gesture = null;
    if (target.hasPointerCapture(id)) target.releasePointerCapture(id);
    if (axis && moved) (accept ? commit : cancel)();
  }
  on('pointerdown', (event) => {
    if (event.button !== 0 || locked || gesture) return;
    const target = event.target,
      axis = target.dataset.scrub;
    if (target !== ruler && !axis) return;
    if (axis && index < 0) return;
    event.preventDefault();
    target.focus({ preventScroll: true });
    target.setPointerCapture(event.pointerId);
    gesture = {
      axis,
      target,
      id: event.pointerId,
      x: event.clientX,
      base: values[axis],
      extend: event.shiftKey,
      moved: false,
    };
    if (!axis) {
      gesture.lastRaw = fromPointer(event);
      go(gesture.lastRaw, event.shiftKey);
    }
  });
  on('pointermove', (event) => {
    if (gesture?.id !== event.pointerId) return;
    const { axis, base, x, extend } = gesture;
    if (!axis) {
      const raw = fromPointer(event);
      if (raw !== gesture.lastRaw)
        go(raw, extend, Math.sign(raw - gesture.lastRaw));
      gesture.lastRaw = raw;
      return;
    }
    const dx = event.clientX - x;
    if (!gesture.moved && Math.abs(dx) < 2) return;
    gesture.moved = true;
    transform(axis, base + dx * (event.altKey ? 0.1 : 1));
  });
  on('pointerup', (e) => {
    if (e.pointerId === gesture?.id) stop(true);
  });
  for (const type of ['pointercancel', 'lostpointercapture'])
    on(type, (e) => {
      if (e.pointerId === gesture?.id) stop(false);
    });
  window.addEventListener('blur', () => stop(false), { signal });
  on('click', (event) => {
    const { pointTurn } = event.target.dataset;
    if (pointTurn !== undefined)
      twist(Number(pointTurn), find('[data-point-angle]').value);
  });
  on(
    'wheel',
    (event) => {
      if (
        locked ||
        !event.target.closest('.workshop-point-ruler') ||
        event.ctrlKey
      )
        return;
      event.preventDefault();
      const delta =
        Math.abs(event.deltaX) > Math.abs(event.deltaY)
          ? event.deltaX
          : event.deltaY;
      if (
        event.timeStamp - wheelTime > 220 ||
        Math.sign(delta) !== Math.sign(wheelDelta)
      )
        wheelDelta = 0;
      wheelTime = event.timeStamp;
      wheelDelta += delta * (event.deltaMode ? 32 : 1);
      if (Math.abs(wheelDelta) >= 20) {
        go(
          index + Math.sign(wheelDelta),
          event.shiftKey,
          Math.sign(wheelDelta),
        );
        wheelDelta = 0;
      }
    },
    { passive: false },
  );
  on('keydown', (event) => {
    if (event.key === 'Escape' && gesture) {
      event.preventDefault();
      event.stopPropagation();
      stop(false);
      return;
    }
    const editingNumber =
      event.target === address || event.target.matches('[data-point-axis]');
    if (
      editingNumber &&
      (event.metaKey || event.ctrlKey) &&
      event.key.toLowerCase() === 's'
    ) {
      event.target.blur(); // Commit a typed value before the shared Save shortcut runs.
    }
    if (editingNumber && event.key === 'Enter') {
      event.preventDefault();
      event.target.blur();
      ruler.focus();
      return;
    }
    if (event.target !== ruler) return;
    const target = {
      ArrowLeft: index - 1,
      ArrowDown: index - 1,
      ArrowRight: index + 1,
      ArrowUp: index + 1,
      PageDown: index - 10,
      PageUp: index + 10,
      Home: 0,
      End: count - 1,
    }[event.key];
    if (target === undefined) return;
    event.preventDefault();
    event.stopPropagation();
    go(
      target,
      event.shiftKey,
      ['Home', 'End'].includes(event.key) ? 0 : Math.sign(target - index),
    );
  });
  // Native range events also support the shared menu controller's D-pad adjustment.
  on('input', (event) => {
    if (event.target === ruler) go(Number(ruler.value) - 1);
  });
  on('change', (event) => {
    if (locked) return;
    const input = event.target;
    if (input === address) {
      if (Number.isInteger(input.valueAsNumber))
        go(Math.max(0, Math.min(count - 1, input.valueAsNumber - 1)));
      input.value = index + 1;
    }
    const axis = input.dataset.pointAxis ?? input.dataset.scrub;
    if (
      axis &&
      Number.isFinite(input.valueAsNumber) &&
      index >= 0 &&
      input.valueAsNumber !== shown(values[axis])
    ) {
      transform(axis, input.valueAsNumber);
      commit();
    }
    if (axis && index >= 0) input.value = shown(values[axis]);
  });
  return ({
    points,
    active,
    selected,
    armed,
    disabled,
    visible,
    canTwist,
    adjusting,
  }) => {
    const oldIndex = index;
    count = points.length;
    index = active;
    locked = disabled || !visible;
    el.hidden = !visible;
    el.disabled = locked;
    if (!visible) return;
    const point = points[index];
    values = { y: point?.y ?? 0, roll: ((point?.roll ?? 0) * 180) / Math.PI };
    for (const input of el.querySelectorAll('[data-point-axis]')) {
      input.disabled = !point;
      if (document.activeElement !== input || gesture || oldIndex !== index)
        input.value = point ? shown(values[input.dataset.pointAxis]) : '';
    }
    for (const grip of el.querySelectorAll('[data-scrub]')) {
      grip.disabled = !point;
      grip.value = Math.round(values[grip.dataset.scrub]);
    }
    if (adjusting && oldIndex === index) return;
    address.max = count;
    if (document.activeElement !== address || oldIndex !== index)
      address.value = index < 0 ? '' : index + 1;
    find('[data-point-total]').textContent = '/ ' + count;
    ruler.min = 0;
    ruler.max = count + 1;
    ruler.value = index + 1;
    ruler.setAttribute(
      'aria-valuetext',
      index < 0 ? 'No point selected' : `Point ${index + 1} of ${count}`,
    );
    const heights = points.map((p) => p.y);
    const heightKey = heights.join(',');
    const notchX = (i) => (count <= 1 ? 500 : 4 + (992 * i) / (count - 1));
    if (profileKey !== heightKey) {
      profileKey = heightKey;
      const low = Math.min(...heights);
      const spread = Math.max(1, Math.max(...heights) - low);
      terrain.setAttribute(
        'd',
        'M' +
          heights
            .map(
              (h, i) =>
                notchX(i).toFixed(1) +
                ',' +
                (17 - (12 * (h - low)) / spread).toFixed(1),
            )
            .join(' L'),
      );
    }
    const signature = count + ':' + index + ':' + selected.join(',');
    if (signature !== tickKey) {
      tickKey = signature;
      cursor.hidden = index < 0;
      cursor.style.left = notchX(Math.max(0, index)) / 10 + '%';
      const marks = new Set(selected);
      ticks.innerHTML = points
        .map((_, i) => {
          const x = notchX(i);
          const active = i === index;
          return `<line x1="${x}" x2="${x}" y1="${active ? 5 : marks.has(i) || i % 5 === 0 ? 18 : 24}" y2="31" vector-effect="non-scaling-stroke" class="${active ? 'current' : marks.has(i) ? 'chosen' : ''}"/>`;
        })
        .join('');
    }
    arm.disabled = !point || count < 2;
    arm.textContent = armed ? 'Pick end point…' : 'Select span';
    arm.setAttribute('aria-pressed', String(armed));
    countLabel.textContent =
      selected.length > 1 ? `${selected.length} selected` : '';
    for (const node of el.querySelectorAll(
      '[data-point-turn],[data-point-angle]',
    ))
      node.disabled = !canTwist;
  };
}
