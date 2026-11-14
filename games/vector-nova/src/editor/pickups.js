import { Group } from 'three';
import { createDeviceLayout } from '../pickups/layout.js';
import { collectRoadSurfaces } from '../pickups/device-mount.js';
import { createDeviceHardware } from '../pickups/hardware.js';
import { disposeGroup } from '../pickups/geometry.js';
import { validateDocument, analyzeDocument, editorRandom } from './document.js';
import { createEditorTrack } from './track.js';

export const PICKUP_PRESETS = Object.freeze([
  { id: 'balanced', label: 'Balanced' },
  { id: 'boost-heavy', label: 'Boost heavy' },
]);
export const PICKUP_LABELS = Object.freeze({
  vector: 'Vector boost',
  aegis: 'Aegis shield',
  repulsor: 'Repulsor',
  arc: 'Arc burst',
  ion: 'Ion wake',
});

const PATTERNS = Object.freeze({
  balanced: [
    'vector',
    'aegis',
    'repulsor',
    'arc',
    'ion',
    'aegis',
    'vector',
    'arc',
    'repulsor',
    'vector',
  ],
  'boost-heavy': [
    'vector',
    'aegis',
    'vector',
    'arc',
    'vector',
    'repulsor',
    'vector',
    'ion',
  ],
});
const START_CLEARANCE = 75;
const FINISH_CLEARANCE = 100;
const FOOTPRINT_GAP = 80;

function compileDevice(track, entry) {
  const vector = entry.type === 'vector';
  const width = vector ? track.width * 0.7 : entry.type === 'aegis' ? 7 : 6;
  return {
    id: entry.id,
    type: entry.type,
    distance: entry.at * track.length,
    lateral: entry.lane * Math.max(0, track.width / 2 - width / 2 - 3),
    width,
    length: vector ? 48 : entry.type === 'aegis' ? 8 : 10,
    label: PICKUP_LABELS[entry.type],
    ...(vector ? { signalScale: 0.55 } : {}),
  };
}

function safeFootprint(track, device, { upright = false } = {}) {
  const from = device.distance - device.length / 2;
  const to = device.distance + device.length / 2;
  if (
    from < START_CLEARANCE ||
    to > (track.finishDistance ?? track.length) - FINISH_CLEARANCE
  )
    return false;
  for (const jump of track.jumps ?? [])
    if (to >= jump.takeoff - 25 && from <= jump.recovery + 25) return false;
  let previous;
  const samples = Math.max(4, Math.ceil(device.length / 4));
  for (let i = 0; i <= samples; i++) {
    const distance = from + (device.length * i) / samples;
    if (track.isGap?.(distance)) return false;
    const frame = track.sample(distance);
    if (
      !frame?.position?.toArray().every(Number.isFinite) ||
      !frame.up?.toArray().every(Number.isFinite) ||
      !frame.tangent?.toArray().every(Number.isFinite) ||
      Math.abs(frame.up.length() - 1) > 0.01
    )
      return false;
    const maximumCurvature = device.type === 'vector' ? 1 / 110 : 1 / 65;
    if (
      !Number.isFinite(frame.curvature) ||
      Math.abs(frame.curvature) > maximumCurvature
    )
      return false;
    // Generated devices favor calm, readable road. Persisted devices may follow
    // an edited inverted deck; all mounting remains in the actual road frame.
    if (
      upright &&
      (frame.up.y < Math.SQRT1_2 || Math.abs(frame.tangent.y) > 0.5)
    )
      return false;
    if (previous) {
      const change = previous.angleTo(frame.up);
      if (change / (device.length / samples) > 0.012) return false;
    }
    previous = frame.up;
  }
  return true;
}

function separated(device, previous) {
  return (
    !previous ||
    device.distance - previous.distance >=
      (device.length + previous.length) / 2 + FOOTPRINT_GAP
  );
}

/** Fill a complete route once. Persist resolved normalized positions, never a
 * command that silently regenerates after later road edits or game updates. */
export function generatePickupLayout(
  value,
  {
    preset = value.pickups?.preset ?? 'balanced',
    density = value.pickups?.density ?? 0.5,
  } = {},
) {
  const doc = validateDocument(value);
  if (!Object.hasOwn(PATTERNS, preset))
    throw new Error('Choose a supported pickup preset.');
  if (!Number.isFinite(density) || density < 0 || density > 1)
    throw new Error('Pickup density must be between zero and one.');
  if (density === 0) return { version: 1, preset, density, devices: [] };
  const analysis = analyzeDocument(doc);
  if (!analysis.valid)
    throw new Error('Finish a valid road before filling it with pickups.');
  const track = createEditorTrack(doc);
  const spacing = 500 - density * 340;
  const start = 260;
  const end = (track.finishDistance ?? track.length) - FINISH_CLEARANCE - 32;
  const count = Math.min(127, Math.max(0, Math.floor((end - start) / spacing)));
  const step = count ? (end - start) / count : 0;
  const random = editorRandom(doc.generator.seed ^ 0x51a7c3e9);
  const devices = [];
  const occupied = new Set(
    [...doc.points, ...doc.props, ...(doc.rolls ?? [])].map(
      (entry) => entry.id,
    ),
  );
  let previous = null;
  for (let i = 0; i <= count; i++) {
    const pattern = PATTERNS[preset];
    const type = pattern[i % pattern.length];
    // A centered opening strip teaches automatic collection without a lane change.
    const target =
      i === 0 ? 130 : start + step * (i - 0.5) + (random() - 0.5) * step * 0.12;
    const lane = type === 'vector' ? 0 : (i % 2 ? 1 : -1) * 0.62;
    const reach = i === 0 ? 24 : Math.min(84, step * 0.27);
    let entry;
    for (let shift = 0; shift <= reach && !entry; shift += 12) {
      for (const offset of shift ? [-shift, shift] : [0]) {
        const candidate = {
          id: 'candidate',
          type,
          at: (target + offset) / track.length,
          lane,
        };
        const compiled = compileDevice(track, candidate);
        if (
          safeFootprint(track, compiled, { upright: i === 0 }) &&
          separated(compiled, previous)
        ) {
          entry = candidate;
          previous = compiled;
          break;
        }
      }
    }
    if (!entry) continue;
    const base = `pickup-${String(i + 1).padStart(3, '0')}-${type}`;
    let id = base,
      suffix = 1;
    while (occupied.has(id)) id = `${base}-${++suffix}`;
    occupied.add(id);
    devices.push({ ...entry, id });
  }
  return { version: 1, preset, density, devices };
}

/** Recompile the saved placements against this route. If a later edit makes a
 * footprint unsafe, keep its saved entry but omit hardware until road is fixed. */
export function createEditorDevices(track, value) {
  const doc = validateDocument(value);
  const plan = [];
  for (const entry of [...doc.pickups.devices].sort(
    (a, b) => a.at - b.at || a.id.localeCompare(b.id),
  )) {
    const device = compileDevice(track, entry);
    if (safeFootprint(track, device) && separated(device, plan.at(-1)))
      plan.push(device);
  }
  return createDeviceLayout(track, plan);
}

/** Static preview uses the same projected Low hardware as ordinary gameplay. */
export function createEditorPickupHardware(track, doc, road) {
  const devices = createEditorDevices(track, doc);
  const group = new Group();
  group.name = 'Editor / automatic road pickups';
  const visuals = devices.length
    ? createDeviceHardware({
        track,
        devices,
        surfaces: collectRoadSurfaces(road.group ?? road),
        quality: 'low',
      })
    : [];
  for (const visual of visuals) group.add(visual.group);
  let disposed = false;
  return {
    group,
    devices,
    dispose() {
      if (disposed) return;
      disposed = true;
      for (const visual of visuals) disposeGroup(visual.group);
      group.clear();
    },
  };
}
