// Bounds match the authored pale frost panels exactly. A clear rib lane has
// ordinary magnetic response; no global handling or braking retune is applied.
export function surfaceAt(track, distance, lateral = 0) {
  const s = ((distance % track.length) + track.length) % track.length;
  const zone = (track.gripZones ?? []).find(
    (entry) =>
      s >= entry.start &&
      s < entry.end &&
      lateral >= entry.lateralMin &&
      lateral <= entry.lateralMax,
  );
  return zone
    ? { id: zone.id, name: 'FROST', grip: zone.grip ?? 0.3 }
    : { id: 'crystal', name: 'CRYSTAL', grip: 1 };
}
