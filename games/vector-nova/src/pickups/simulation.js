import { isCombatDevice } from './combat.js';
import { VEHICLE_HULL, headingExtents } from '../physics/hull.js';
import { AEGIS_DURATION } from './rules.js';
export { AEGIS_DURATION } from './rules.js';
export const PICKUP_STATE_VERSION = 2;
export const VECTOR_ENTRY_SPEED_GAIN = 65;
export const VECTOR_PROPULSION = Object.freeze({
  cruiseSpeed: 600 / 3.6,
  thrust: 1800,
});

const EPSILON = 1e-9;
const { halfWidth: HALF_WIDTH, halfLength: HALF_LENGTH } = VEHICLE_HULL;
const HULL_RADIUS = Math.hypot(HALF_WIDTH, HALF_LENGTH);
const finite = (value, fallback = 0) =>
  Number.isFinite(value) ? value : fallback;
const event = (type, kind, deviceId, extra = {}) => ({
  type,
  payload: { kind, deviceId, ...extra },
});
const extents = headingExtents;
const supported = (vehicle) =>
  vehicle?.grounded !== false && vehicle?.airborne !== true;
const movingForward = (vehicle) =>
  finite(vehicle?.speed) * Math.cos(finite(vehicle?.heading)) > 0.5;

// Aegis arches retain a swept centre-plane trigger. The lateral hull envelope
// is interpolated at that plane so fast crossings cannot miss the charge.
export function sweptDeviceCrossings(
  previous,
  vehicle,
  devices,
  trackLength,
  closed = true,
) {
  const start = previous.distance,
    end = vehicle.distance;
  if (
    !supported(previous) ||
    !supported(vehicle) ||
    !Number.isFinite(start) ||
    !Number.isFinite(end) ||
    end <= start
  )
    return [];
  const crossings = [];
  for (const device of devices) {
    const first = Math.floor((start - device.distance) / trackLength) + 1;
    const last = Math.floor((end - device.distance) / trackLength);
    for (
      let traversal = closed ? first : Math.max(0, first);
      traversal <= (closed ? last : Math.min(0, last));
      traversal++
    ) {
      const distance = device.distance + traversal * trackLength;
      const fraction = (distance - start) / (end - start);
      const lateral =
        finite(previous.lateral) +
        (finite(vehicle.lateral) - finite(previous.lateral)) * fraction;
      const heading =
        finite(previous.heading) +
        (finite(vehicle.heading) - finite(previous.heading)) * fraction;
      crossings.push({
        device,
        traversal,
        distance,
        fraction,
        lateral,
        heading,
        overlap:
          Math.abs(lateral - device.lateral) <=
          device.width / 2 + extents(heading).lateral + EPSILON,
      });
    }
  }
  return crossings.sort(
    (a, b) => a.fraction - b.fraction || a.device.id.localeCompare(b.device.id),
  );
}

function interval(from, to, lower, upper) {
  const change = to - from;
  if (Math.abs(change) <= EPSILON)
    return from >= lower - EPSILON && from <= upper + EPSILON ? [0, 1] : null;
  const a = (lower - from) / change,
    b = (upper - from) / change;
  const start = Math.max(0, Math.min(a, b)),
    end = Math.min(1, Math.max(a, b));
  return start <= end + EPSILON ? [start, end] : null;
}

function overlaps(device, traversal, vehicle, trackLength) {
  const hull = extents(finite(vehicle.heading));
  const center = device.distance + traversal * trackLength;
  return (
    supported(vehicle) &&
    Math.abs(vehicle.distance - center) <=
      device.length / 2 + hull.longitudinal + EPSILON &&
    Math.abs(finite(vehicle.lateral) - device.lateral) <=
      device.width / 2 + hull.lateral + EPSILON
  );
}

// Vector is an authored rectangle, not a timer granted at its centre. Sweeping
// both route distance and lateral position also admits a late lane entry while
// the nose is already over the strip. No support means no ground catapult.
export function sweptVectorContacts(
  previous,
  vehicle,
  devices,
  trackLength,
  closed = true,
) {
  if (
    !supported(previous) ||
    !supported(vehicle) ||
    vehicle.distance < previous.distance - EPSILON
  )
    return [];
  const a = extents(finite(previous.heading)),
    b = extents(finite(vehicle.heading));
  const longitudinal = Math.max(a.longitudinal, b.longitudinal),
    lateral = Math.max(a.lateral, b.lateral);
  const contacts = [];
  for (const device of devices) {
    const first =
      Math.ceil(
        (previous.distance -
          device.distance -
          device.length / 2 -
          longitudinal) /
          trackLength,
      ) || 0;
    const last = Math.floor(
      (vehicle.distance - device.distance + device.length / 2 + longitudinal) /
        trackLength,
    );
    for (
      let traversal = closed ? first : Math.max(0, first);
      traversal <= (closed ? last : Math.min(0, last));
      traversal++
    ) {
      const center = device.distance + traversal * trackLength;
      const along = interval(
        previous.distance,
        vehicle.distance,
        center - device.length / 2 - longitudinal,
        center + device.length / 2 + longitudinal,
      );
      const across = interval(
        finite(previous.lateral),
        finite(vehicle.lateral),
        device.lateral - device.width / 2 - lateral,
        device.lateral + device.width / 2 + lateral,
      );
      if (!along || !across) continue;
      const fraction = Math.max(along[0], across[0]),
        exitFraction = Math.min(along[1], across[1]);
      if (fraction <= exitFraction + EPSILON)
        contacts.push({ device, traversal, fraction, exitFraction });
    }
  }
  return contacts.sort(
    (a, b) => a.fraction - b.fraction || a.device.id.localeCompare(b.device.id),
  );
}

export function createPickupSimulation({
  trackLength,
  closed = true,
  devices,
  vehicle = { distance: 0 },
}) {
  if (!Number.isFinite(trackLength) || trackLength <= 0)
    throw new Error('Pickup track length must be positive');
  const ids = new Set();
  const layout = devices.map((device) => {
    if (
      typeof device.id !== 'string' ||
      !device.id ||
      ids.has(device.id) ||
      (!['vector', 'aegis'].includes(device.type) &&
        !isCombatDevice(device.type)) ||
      !Number.isFinite(device.distance) ||
      device.distance < 0 ||
      device.distance >= trackLength ||
      !Number.isFinite(device.lateral) ||
      !Number.isFinite(device.width) ||
      device.width <= 0 ||
      !Number.isFinite(device.length) ||
      device.length <= 0 ||
      device.length >= trackLength
    )
      throw new Error('Invalid pickup device layout');
    ids.add(device.id);
    return { ...device };
  });
  const vectors = layout.filter((device) => device.type === 'vector');
  const aegises = layout.filter((device) => device.type === 'aegis');
  const gates = layout.filter((device) => device.type !== 'vector');
  const layoutKey = JSON.stringify([
    trackLength,
    ...(closed === false ? ['sprint-v1'] : []),
    ...layout.map(({ id, type, distance, lateral, width, length }) => [
      id,
      type,
      distance,
      lateral,
      width,
      length,
    ]),
  ]);
  let state;

  function clearVector(type, reason) {
    if (!state.vectorActive) return null;
    const result = event(
      type,
      'vector',
      state.vectorDevice,
      reason ? { reason } : {},
    );
    state.vectorActive = false;
    state.vectorDevice = null;
    state.vectorTraversal = null;
    return result;
  }
  function clearAegis(type, extra = {}) {
    if (state.aegisRemaining <= 0) return null;
    const result = event(type, 'aegis', state.aegisDevice, extra);
    state.aegisRemaining = 0;
    state.aegisDevice = null;
    return result;
  }
  function passedOccurrence(device, distance, leading = false) {
    const offset =
      device.type === 'vector'
        ? leading
          ? -(device.length / 2 + HULL_RADIUS)
          : device.length / 2 + HULL_RADIUS
        : 0;
    return closed === false
      ? distance >= device.distance + offset
        ? 0
        : -1
      : Math.floor((distance - device.distance - offset) / trackLength);
  }
  function markPassed(distance, leading = false) {
    for (const device of layout)
      state.used[device.id] = Math.max(
        state.used[device.id],
        passedOccurrence(device, distance, leading),
      );
  }
  function reset({ reason = 'restart', state: currentVehicle = vehicle } = {}) {
    const distance = finite(currentVehicle.distance);
    const events = [];
    if (state && ['recover', 'manual-recover'].includes(reason)) {
      const vector = clearVector('pickup-cancel', 'recover'),
        aegis = clearAegis('pickup-cancel', { reason: 'recover' });
      if (vector) events.push(vector);
      if (aegis) events.push(aegis);
      state.lastDistance = distance;
      state.highWaterDistance = Math.max(state.highWaterDistance, distance);
      markPassed(state.highWaterDistance, true);
    } else {
      state = {
        version: PICKUP_STATE_VERSION,
        layoutKey,
        time: 0,
        vectorActive: false,
        vectorDevice: null,
        vectorTraversal: null,
        aegisRemaining: 0,
        aegisDevice: null,
        lastDistance: distance,
        highWaterDistance: distance,
        used: Object.fromEntries(
          layout.map((device) => [
            device.id,
            passedOccurrence(device, distance, true),
          ]),
        ),
      };
    }
    return events;
  }
  reset();

  function activateVector(contact, input, events) {
    const { device, traversal } = contact;
    if (traversal <= state.used[device.id]) return;
    state.used[device.id] = traversal;
    const reason =
      finite(input?.brake) >= 0.1
        ? 'braking'
        : state.vectorActive
          ? 'active'
          : null;
    if (reason) {
      events.push(event('pickup-unavailable', 'vector', device.id, { reason }));
      return;
    }
    state.vectorActive = true;
    state.vectorDevice = device.id;
    state.vectorTraversal = traversal;
    events.push(
      event('pickup-activate', 'vector', device.id, {
        speedGain: VECTOR_ENTRY_SPEED_GAIN,
      }),
    );
  }
  function activeContact(vehicle) {
    const device = vectors.find((device) => device.id === state.vectorDevice);
    return (
      device && overlaps(device, state.vectorTraversal, vehicle, trackLength)
    );
  }

  function beforeStep(input, dt, currentVehicle) {
    const events = [];
    if (!Number.isFinite(dt) || dt <= 0) return { modifiers: {}, events };
    state.time += dt;
    // Aegis expiry remains before collision resolution. Vector never expires:
    // contact or brake ends its force; already gained speed is ordinary inertia.
    if (state.aegisRemaining > 0 && state.aegisRemaining <= dt + EPSILON)
      events.push(clearAegis('pickup-expire'));
    else state.aegisRemaining = Math.max(0, state.aegisRemaining - dt);
    if (
      currentVehicle &&
      Math.abs(currentVehicle.distance - state.lastDistance) > EPSILON
    )
      events.push(...reset({ reason: 'recover', state: currentVehicle }));
    if (
      state.vectorActive &&
      currentVehicle &&
      (!activeContact(currentVehicle) || !movingForward(currentVehicle))
    )
      events.push(clearVector('pickup-exit', 'left-strip'));
    if (state.vectorActive && finite(input?.brake) >= 0.1)
      events.push(clearVector('pickup-cancel', 'brake'));
    if (!state.vectorActive && currentVehicle && movingForward(currentVehicle))
      for (const contact of sweptVectorContacts(
        currentVehicle,
        currentVehicle,
        vectors,
        trackLength,
        closed,
      ))
        activateVector(contact, input, events);
    const modifiers = {};
    if (state.vectorActive) modifiers.propulsion = { ...VECTOR_PROPULSION };
    if (state.aegisRemaining > 0) modifiers.shield = true;
    return { modifiers, events };
  }

  function afterStep(previous, current, input, physicsEvents = []) {
    const events = [];
    if (
      !Number.isFinite(previous.distance) ||
      !Number.isFinite(current.distance)
    )
      throw new Error('Pickup vehicle distance must be finite');
    if (physicsEvents.some(({ type }) => type === 'road-recovery'))
      return reset({ reason: 'recover', state: current });
    if (Math.abs(previous.distance - state.lastDistance) > EPSILON)
      return reset({ reason: 'recover', state: current });
    if (state.aegisRemaining > 0) {
      const impact = physicsEvents.find(
        (entry) => entry.type === 'impact' && entry.payload?.shielded === true,
      );
      if (impact)
        events.push(
          clearAegis('shield-hit', {
            severity: impact.payload.severity,
            side: impact.payload.side,
          }),
        );
    }
    const contacts = [
      ...(movingForward(current)
        ? sweptVectorContacts(previous, current, vectors, trackLength, closed)
        : []),
      ...sweptDeviceCrossings(previous, current, gates, trackLength, closed),
    ].sort(
      (a, b) =>
        a.fraction - b.fraction || a.device.id.localeCompare(b.device.id),
    );
    for (const contact of contacts) {
      const { device, traversal } = contact;
      if (device.type === 'vector') {
        activateVector(contact, input, events);
        continue;
      }
      if (traversal <= state.used[device.id]) continue;
      state.used[device.id] = traversal;
      if (!contact.overlap) continue;
      if (isCombatDevice(device.type)) {
        events.push(
          event('pickup-activate', device.type, device.id, {
            fraction: contact.fraction,
          }),
        );
        continue;
      }
      if (state.aegisRemaining > 0)
        events.push(
          event('pickup-unavailable', 'aegis', device.id, { reason: 'active' }),
        );
      else {
        state.aegisRemaining = AEGIS_DURATION;
        state.aegisDevice = device.id;
        events.push(
          event('pickup-activate', 'aegis', device.id, {
            duration: AEGIS_DURATION,
          }),
        );
      }
    }
    if (
      state.vectorActive &&
      (!activeContact(current) ||
        current.distance < previous.distance - EPSILON ||
        !movingForward(current))
    )
      events.push(clearVector('pickup-exit', 'left-strip'));
    state.lastDistance = current.distance;
    state.highWaterDistance = Math.max(
      state.highWaterDistance,
      current.distance,
    );
    markPassed(state.highWaterDistance);
    return events;
  }

  function snapshot() {
    return { ...state, used: { ...state.used } };
  }
  function restore(data) {
    if (
      !data ||
      data.version !== PICKUP_STATE_VERSION ||
      data.layoutKey !== layoutKey ||
      !Number.isFinite(data.time) ||
      data.time < 0 ||
      !Number.isFinite(data.lastDistance) ||
      !Number.isFinite(data.highWaterDistance) ||
      data.highWaterDistance < data.lastDistance ||
      !data.used ||
      Object.keys(data.used).length !== layout.length ||
      layout.some((device) => !Number.isSafeInteger(data.used[device.id])) ||
      typeof data.vectorActive !== 'boolean' ||
      (data.vectorActive
        ? !Number.isSafeInteger(data.vectorTraversal) ||
          !vectors.some(
            (device) =>
              device.id === data.vectorDevice &&
              data.used[device.id] === data.vectorTraversal,
          )
        : data.vectorDevice !== null || data.vectorTraversal !== null) ||
      !Number.isFinite(data.aegisRemaining) ||
      data.aegisRemaining < 0 ||
      data.aegisRemaining > AEGIS_DURATION ||
      (data.aegisRemaining === 0
        ? data.aegisDevice !== null
        : !aegises.some((device) => device.id === data.aegisDevice))
    )
      throw new Error('Pickup replay state mismatch');
    state = {
      version: PICKUP_STATE_VERSION,
      layoutKey,
      time: data.time,
      vectorActive: data.vectorActive,
      vectorDevice: data.vectorDevice,
      vectorTraversal: data.vectorTraversal,
      aegisRemaining: data.aegisRemaining,
      aegisDevice: data.aegisDevice,
      lastDistance: data.lastDistance,
      highWaterDistance: data.highWaterDistance,
      used: { ...data.used },
    };
  }
  return {
    consumeShield(extra = {}) {
      return clearAegis('shield-hit', { ...extra, combat: true });
    },
    beforeStep,
    afterStep,
    reset,
    snapshot,
    restore,
    isAvailable(id, distance = state.lastDistance) {
      return (
        ids.has(id) &&
        ((state.vectorActive && state.vectorDevice === id) ||
          state.used[id] < Math.floor(distance / trackLength))
      );
    },
  };
}
