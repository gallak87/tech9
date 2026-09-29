export const PICKUP_STATE_VERSION = 1;
export const VECTOR_DURATION = 1.25;
export const AEGIS_DURATION = 6;
export const VECTOR_PROPULSION = Object.freeze({
  cruiseSpeed: 142,
  thrust: 50,
});

const EPSILON = 1e-9;
const HALF_WIDTH = 2.25;
const HALF_LENGTH = 3.5;
const effectKeys = ['vector', 'aegis'];
const remainingKey = (kind) => `${kind}Remaining`;
const deviceKey = (kind) => `${kind}Device`;
const finite = (value, fallback = 0) =>
  Number.isFinite(value) ? value : fallback;

function event(type, kind, deviceId, extra = {}) {
  return { type, payload: { kind, deviceId, ...extra } };
}

function clearEffect(state, kind, type, extra = {}) {
  if (state[remainingKey(kind)] <= 0) return null;
  const result = event(type, kind, state[deviceKey(kind)], extra);
  state[remainingKey(kind)] = 0;
  state[deviceKey(kind)] = null;
  return result;
}

// The trigger is the device's centre plane. Crossing uses unwrapped forward
// distance and the hull's interpolated lateral/yaw envelope at that plane, so
// an entire device can be traversed in one tick without being missed. A first
// pass consumes that occurrence even on a lateral miss: reversing to change
// lanes cannot farm a previously passed device.
export function sweptDeviceCrossings(previous, vehicle, devices, trackLength) {
  const start = previous.distance;
  const end = vehicle.distance;
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start)
    return [];
  const crossings = [];
  for (const device of devices) {
    const first = Math.floor((start - device.distance) / trackLength) + 1;
    const last = Math.floor((end - device.distance) / trackLength);
    for (let traversal = first; traversal <= last; traversal++) {
      const distance = device.distance + traversal * trackLength;
      const fraction = (distance - start) / (end - start);
      const lateral =
        finite(previous.lateral) +
        (finite(vehicle.lateral) - finite(previous.lateral)) * fraction;
      const heading =
        finite(previous.heading) +
        (finite(vehicle.heading) - finite(previous.heading)) * fraction;
      const hullExtent =
        Math.abs(Math.cos(heading)) * HALF_WIDTH +
        Math.abs(Math.sin(heading)) * HALF_LENGTH;
      crossings.push({
        device,
        traversal,
        distance,
        fraction,
        lateral,
        heading,
        overlap:
          Math.abs(lateral - device.lateral) <=
          device.width / 2 + hullExtent + EPSILON,
      });
    }
  }
  return crossings.sort(
    (a, b) =>
      a.distance - b.distance ||
      (a.device.id < b.device.id ? -1 : a.device.id > b.device.id ? 1 : 0),
  );
}

export function createPickupSimulation({
  trackLength,
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
      !effectKeys.includes(device.type) ||
      !Number.isFinite(device.distance) ||
      device.distance < 0 ||
      device.distance >= trackLength ||
      !Number.isFinite(device.lateral) ||
      !Number.isFinite(device.width) ||
      device.width <= 0
    )
      throw new Error('Invalid pickup device layout');
    ids.add(device.id);
    return { ...device };
  });
  const layoutKey = JSON.stringify([
    trackLength,
    ...layout.map(({ id, type, distance, lateral, width }) => [
      id,
      type,
      distance,
      lateral,
      width,
    ]),
  ]);

  let state;
  function markPassed(distance) {
    for (const device of layout)
      state.used[device.id] = Math.max(
        state.used[device.id],
        Math.floor((distance - device.distance) / trackLength),
      );
  }

  function reset({ reason = 'restart', state: currentVehicle = vehicle } = {}) {
    const distance = finite(currentVehicle.distance);
    const events = [];
    if (state && (reason === 'recover' || reason === 'manual-recover')) {
      for (const kind of effectKeys) {
        const canceled = clearEffect(state, kind, 'pickup-cancel', {
          reason: 'recover',
        });
        if (canceled) events.push(canceled);
      }
      state.lastDistance = distance;
      state.highWaterDistance = Math.max(state.highWaterDistance, distance);
      markPassed(state.highWaterDistance);
    } else {
      state = {
        version: PICKUP_STATE_VERSION,
        layoutKey,
        time: 0,
        vectorRemaining: 0,
        aegisRemaining: 0,
        vectorDevice: null,
        aegisDevice: null,
        lastDistance: distance,
        highWaterDistance: distance,
        used: Object.fromEntries(
          layout.map((device) => [
            device.id,
            Math.floor((distance - device.distance) / trackLength),
          ]),
        ),
      };
    }
    return events;
  }
  reset();

  function beforeStep(input, dt) {
    const events = [];
    if (!Number.isFinite(dt) || dt <= 0) return { modifiers: {}, events };
    state.time += dt;
    // Expiry is resolved before this step's collision. A shield with exactly
    // dt left provides no protection on this step. New pickups become active
    // after collision resolution and first modify the following fixed step.
    for (const kind of effectKeys) {
      const key = remainingKey(kind);
      if (state[key] > 0 && state[key] <= dt + EPSILON) {
        events.push(clearEffect(state, kind, 'pickup-expire'));
      } else state[key] = Math.max(0, state[key] - dt);
    }
    if (finite(input?.brake) >= 0.1) {
      const canceled = clearEffect(state, 'vector', 'pickup-cancel', {
        reason: 'brake',
      });
      if (canceled) events.push(canceled);
    }
    const modifiers = {};
    if (state.vectorRemaining > 0)
      modifiers.propulsion = { ...VECTOR_PROPULSION };
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
    // A teleport without the adapter reset hook is conservatively treated as
    // recovery. It cannot manufacture a long swept pickup or renew eligibility.
    if (Math.abs(previous.distance - state.lastDistance) > EPSILON) {
      events.push(...reset({ reason: 'recover', state: current }));
      return events;
    }
    if (state.aegisRemaining > 0) {
      const impact = physicsEvents.find(
        (entry) => entry.type === 'impact' && entry.payload?.shielded === true,
      );
      if (impact)
        events.push(
          clearEffect(state, 'aegis', 'shield-hit', {
            severity: impact.payload.severity,
            side: impact.payload.side,
          }),
        );
    }
    for (const crossing of sweptDeviceCrossings(
      previous,
      current,
      layout,
      trackLength,
    )) {
      const { device, traversal, overlap } = crossing;
      if (traversal <= state.used[device.id]) continue;
      state.used[device.id] = traversal;
      if (!overlap) continue;
      const kind = device.type;
      const key = remainingKey(kind);
      const reason =
        kind === 'vector' && finite(input?.brake) >= 0.1
          ? 'braking'
          : state[key] > 0
            ? 'active'
            : null;
      if (reason) {
        events.push(event('pickup-unavailable', kind, device.id, { reason }));
        continue;
      }
      const duration = kind === 'vector' ? VECTOR_DURATION : AEGIS_DURATION;
      state[key] = duration;
      state[deviceKey(kind)] = device.id;
      events.push(event('pickup-activate', kind, device.id, { duration }));
    }
    state.lastDistance = current.distance;
    state.highWaterDistance = Math.max(
      state.highWaterDistance,
      current.distance,
    );
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
      effectKeys.some((kind) => {
        const remaining = data[remainingKey(kind)];
        const duration = kind === 'vector' ? VECTOR_DURATION : AEGIS_DURATION;
        const id = data[deviceKey(kind)];
        return (
          !Number.isFinite(remaining) ||
          remaining < 0 ||
          remaining > duration ||
          (remaining === 0
            ? id !== null
            : !layout.some(
                (device) => device.id === id && device.type === kind,
              ))
        );
      })
    )
      throw new Error('Pickup replay state mismatch');
    state = {
      version: PICKUP_STATE_VERSION,
      layoutKey,
      time: data.time,
      vectorRemaining: data.vectorRemaining,
      aegisRemaining: data.aegisRemaining,
      vectorDevice: data.vectorDevice,
      aegisDevice: data.aegisDevice,
      lastDistance: data.lastDistance,
      highWaterDistance: data.highWaterDistance,
      used: { ...data.used },
    };
  }

  return {
    beforeStep,
    afterStep,
    reset,
    snapshot,
    restore,
    isAvailable(id, distance = state.lastDistance) {
      return ids.has(id) && state.used[id] < Math.floor(distance / trackLength);
    },
  };
}
