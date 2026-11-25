import { DOWNHILL_RUNOUT } from './document.js';
import { curvePointFraction, routeCurve } from './route.js';
import { pointSelectionModifiers } from './point-gestures.js';

const WIDTH = 720;
const HEIGHT = 220;
const LEFT = 56;
const TOP = 14;
const RIGHT = WIDTH - 22;
const BOTTOM = HEIGHT - 37;
const round = (value) => Number(value.toFixed(2));
const meters = (value) => `${Math.round(value)} m`;
const stationLabel = (value, length) =>
  length >= 1000 ? `${round(value / 1000)} km` : meters(value);

export function sampleElevationProfile(doc, fractions, preparedCurve) {
  if (doc.points.length < 4) return null;
  const curve = preparedCurve ?? routeCurve(doc);
  const length = curve.getLength();
  if (!Number.isFinite(length) || length < 1) return null;

  const points = doc.points.map((point, index) => ({
    fraction: fractions?.[index] ?? curvePointFraction(curve, index),
    elevation: point.y,
  }));
  const jumps = (doc.jumps ?? [])
    .map(({ start, end }, index) => ({ start, end, number: index + 1 }))
    .sort((a, b) => a.start - b.start);
  const sampleDistance = (fraction) => ({
    fraction,
    elevation: curve.getPointAt(fraction).y,
  });
  const runs = [];
  const appendRun = (start, end) => {
    if (start >= end) return;
    const count = Math.max(2, Math.ceil((end - start) * 300));
    const samples = Array.from({ length: count + 1 }, (_, i) =>
      sampleDistance(start + ((end - start) * i) / count),
    );
    const knots = points.filter(
      ({ fraction }) => fraction > start && fraction < end,
    );
    runs.push([...samples, ...knots].sort((a, b) => a.fraction - b.fraction));
  };
  let cursor = 0;
  for (const jump of jumps) {
    appendRun(cursor, jump.start);
    cursor = Math.max(cursor, jump.end);
  }
  appendRun(cursor, 1);

  const elevations = [...runs.flat(), ...points].map(
    (point) => point.elevation,
  );
  const low = Math.min(...elevations);
  const high = Math.max(...elevations);
  const tick = Math.max(10, Math.ceil((high - low) / 40) * 10);
  const min = Math.floor(low / tick) * tick;
  const max = Math.max(min + tick * 2, Math.ceil(high / tick) * tick);
  return {
    length,
    min,
    max,
    tick,
    runs,
    points,
    jumps,
    finish:
      doc.courseType === 'downhill' && length > DOWNHILL_RUNOUT
        ? 1 - DOWNHILL_RUNOUT / length
        : null,
  };
}

export const elevationProfileMarkup = `<section class="workshop-profile menu-card" id="workshop-elevation-profile" data-editor-profile hidden role="dialog" aria-labelledby="workshop-elevation-title">
  <header>
    <h2 id="workshop-elevation-title">Elevation profile</h2>
    <button type="button" data-editor-action="profile-close" aria-label="Close elevation profile">×</button>
  </header>
  <p class="workshop-profile-empty" data-profile-empty>Add at least four road points to see their elevation along the route.</p>
  <div data-profile-plot hidden>
    <svg viewBox="0 0 ${WIDTH} ${HEIGHT}" role="img" aria-label="Road elevation in metres by distance along the route">
      <g data-profile-geometry></g>
      <g data-profile-markers></g>
    </svg>
    <div class="workshop-profile-controls" data-profile-controls>
      <label>Road point <input type="range" min="-1" step="1" data-editor-field="profile-point"></label>
      <output data-profile-readout aria-live="polite"></output>
      <button type="button" data-editor-action="profile-issue" hidden>Select warning point</button>
    </div>
  </div>
</section>`;

export function bindElevationProfile(panel, onSelect, signal) {
  const empty = panel.querySelector('[data-profile-empty]');
  const plot = panel.querySelector('[data-profile-plot]');
  const geometry = panel.querySelector('[data-profile-geometry]');
  const markers = panel.querySelector('[data-profile-markers]');
  const controls = panel.querySelector('[data-profile-controls]');
  const pointControl = panel.querySelector(
    '[data-editor-field="profile-point"]',
  );
  const readout = panel.querySelector('[data-profile-readout]');
  const issueButton = panel.querySelector(
    '[data-editor-action="profile-issue"]',
  );
  const cache = new WeakMap();
  let revision;
  let chart;
  let marked = '';
  const x = (fraction) => round(LEFT + fraction * (RIGHT - LEFT));
  const y = (elevation) =>
    round(
      BOTTOM -
        ((elevation - chart.min) / (chart.max - chart.min)) * (BOTTOM - TOP),
    );
  function renderGeometry() {
    if (!chart) return;
    const yAxis = [];
    for (
      let altitude = chart.min;
      altitude <= chart.max;
      altitude += chart.tick
    ) {
      const grid = y(altitude);
      yAxis.push(
        `<path d="M${LEFT},${grid}H${RIGHT}"/><text x="${LEFT - 8}" y="${grid}" text-anchor="end" dominant-baseline="central">${meters(altitude)}</text>`,
      );
    }
    const xAxis = [0, 0.25, 0.5, 0.75, 1].map(
      (fraction) =>
        `<path d="M${x(fraction)},${TOP}V${BOTTOM}"/><text x="${x(fraction)}" y="${BOTTOM + 19}" text-anchor="${fraction === 0 ? 'start' : fraction === 1 ? 'end' : 'middle'}">${stationLabel(fraction * chart.length, chart.length)}</text>`,
    );
    const bands = chart.jumps.map(
      ({ start, end, number }) =>
        `<rect class="workshop-profile-gap" x="${x(start)}" y="${TOP}" width="${x(end) - x(start)}" height="${BOTTOM - TOP}"><title>Jump ${number}</title></rect>`,
    );
    if (chart.finish !== null) {
      const finishX = x(chart.finish);
      bands.push(
        `<rect class="workshop-profile-runout" x="${finishX}" y="${TOP}" width="${RIGHT - finishX}" height="${BOTTOM - TOP}"><title>Finish runout</title></rect><text x="${finishX - 5}" y="${TOP + 14}" text-anchor="end">Finish</text>`,
      );
    }
    const path = chart.runs
      .map((run) =>
        run
          .map(
            ({ fraction, elevation }, index) =>
              `${index ? 'L' : 'M'}${x(fraction)},${y(elevation)}`,
          )
          .join(' '),
      )
      .join(' ');
    geometry.innerHTML = `${yAxis.join('')}${xAxis.join('')}${bands.join('')}<path class="workshop-profile-road" d="${path}"/>`;
    pointControl.max = String(chart.points.length - 1);
  }
  panel.addEventListener(
    'click',
    (event) => {
      const point = event.target.closest('[data-profile-point]');
      if (point)
        onSelect(
          Number(point.dataset.profilePoint),
          pointSelectionModifiers(event),
        );
    },
    { signal },
  );
  function intervalPath(start, end) {
    const paths = [];
    for (const run of chart.runs) {
      const from = Math.max(start, run[0].fraction);
      const to = Math.min(end, run.at(-1).fraction);
      if (to <= from) continue;
      const heightAt = (fraction) => {
        const next = run.findIndex((point) => point.fraction >= fraction);
        const b = run[next] ?? run.at(-1);
        const a = run[Math.max(0, next - 1)];
        const span = b.fraction - a.fraction;
        return span > 0
          ? a.elevation +
              ((b.elevation - a.elevation) * (fraction - a.fraction)) / span
          : b.elevation;
      };
      const points = [
        { fraction: from, elevation: heightAt(from) },
        ...run.filter(({ fraction }) => fraction > from && fraction < to),
        { fraction: to, elevation: heightAt(to) },
      ];
      paths.push(
        points
          .map(
            ({ fraction, elevation }, i) =>
              `${i ? 'L' : 'M'}${x(fraction)},${y(elevation)}`,
          )
          .join(' '),
      );
    }
    return paths.join(' ');
  }
  return function update(
    doc,
    fractions,
    {
      selected,
      selectedPoints = [],
      rollRateSections = [],
      issuePoint,
      editable,
      issueLabel,
      previewCurve,
    },
  ) {
    const key = previewCurve ?? doc;
    if (key !== revision) {
      revision = key;
      if (previewCurve) chart = sampleElevationProfile(doc, null, previewCurve);
      else {
        if (!cache.has(doc))
          cache.set(doc, sampleElevationProfile(doc, fractions));
        chart = cache.get(doc);
      }
      empty.hidden = Boolean(chart);
      plot.hidden = !chart;
      empty.textContent =
        doc.points.length < 4
          ? 'Add at least four road points to see their elevation along the route.'
          : 'Space the road points apart to see their elevation along the route.';
      renderGeometry();
      marked = '';
    }
    if (!chart) return;
    const picked = new Set(selectedPoints);
    if (selected >= 0) picked.add(selected);
    const markerKey = JSON.stringify([
      selected,
      selectedPoints,
      issuePoint,
      editable,
      issueLabel,
      rollRateSections,
    ]);
    if (markerKey === marked) return;
    marked = markerKey;
    controls.hidden = !editable;
    pointControl.value = String(selected);
    pointControl.setAttribute(
      'aria-valuetext',
      selected < 0
        ? 'No point selected'
        : `Point ${selected + 1} of ${chart.points.length}`,
    );
    const active = chart.points[selected];
    readout.textContent = active
      ? `Point ${selected + 1} · ${stationLabel(chart.length * active.fraction, chart.length)} along route · ${meters(active.elevation)} elevation`
      : 'Choose a road point';
    issueButton.hidden = !chart.points[issuePoint];
    if (!issueButton.hidden) issueButton.title = issueLabel;
    const selectedSpans = [];
    for (let i = 1; i < chart.points.length; i++)
      if (picked.has(i - 1) && picked.has(i))
        selectedSpans.push(
          intervalPath(chart.points[i - 1].fraction, chart.points[i].fraction),
        );
    const twistPaths = rollRateSections.map(({ start, end }) =>
      intervalPath(start, end),
    );
    markers.innerHTML = [
      `<path class="workshop-profile-selection" d="${selectedSpans.join(' ')}"/>`,
      `<path class="workshop-profile-fast-twist" d="${twistPaths.join(' ')}"/>`,
      ...chart.points.map(({ fraction, elevation }, index) => {
        const px = x(fraction);
        const py = y(elevation);
        const isIssue = index === issuePoint;
        const isSelected = picked.has(index);
        const primary = index === selected;
        return `<g class="workshop-profile-point${isIssue ? ' warning' : ''}${isSelected ? ' selected' : ''}" ${editable ? `data-profile-point="${index}"` : ''}>
        ${primary ? `<line x1="${px}" y1="${TOP}" x2="${px}" y2="${BOTTOM}"/>` : ''}
        ${isIssue ? `<circle class="workshop-profile-warning" cx="${px}" cy="${py}" r="7"/>` : ''}
        <circle cx="${px}" cy="${py}" r="${isSelected ? 4 : 2.5}"/>
        <circle class="workshop-profile-hit" cx="${px}" cy="${py}" r="7"/>
        <title>Point ${index + 1} · ${meters(elevation)}${isIssue ? ' · Warning' : ''}</title>
      </g>`;
      }),
    ].join('');
  };
}
