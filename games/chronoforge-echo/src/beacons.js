// Only these story objects are beacons. The other regional consoles retain
// their own identities (observatory, archive, forge, elevator and orchard).
export const BEACONS = {
  hav_beacon: {
    name: 'The listening beacon',
    restoredFlag: 'beacon_restored',
    gate: 'hav_guard',
    instruction: 'Defeat the gate sentry at Haventide to light the beacon.',
    restoredHint: 'Beacon lit · The east road to Emberline is open.',
  },
  frost_beacon: {
    name: 'The midnight beacon',
    restoredFlag: 'frost_seal',
    gate: 'frost_colossus',
    instruction: 'Defeat the Frost Colossus to light the rescue beacon.',
    restoredHint: 'Beacon lit · The rescue signal is restored.',
  },
};

export function beaconStatus(state, id) {
  const definition = BEACONS[id];
  if (!definition) return null;
  const lit = !!state.flags?.[definition.restoredFlag];
  const ready = !!state.cleared?.[definition.gate];
  // opening_seen was written by inspecting Haventide's beacon in older saves.
  const inspected =
    lit ||
    !!state.flags?.[id + '_inspected'] ||
    (id === 'hav_beacon' && !!state.flags?.opening_seen);
  return {
    ...definition,
    lit,
    ready,
    inspected,
    hint: !inspected
      ? ''
      : lit
        ? definition.restoredHint
        : ready
          ? 'Path clear · Interact to light the beacon.'
          : definition.instruction,
  };
}

export function inspectBeacon(state, id) {
  if (BEACONS[id]) state.flags[id + '_inspected'] = true;
}
