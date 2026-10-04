// Both material boundaries and simulation use this clock. Reduced motion may
// remove airborne grains, but never freezes these active migrating deposits.
export function sampleSaffronDeposits(track, time = 0) {
  const { jumps, landmarks, sections } = track;
  return [
    {
      id: 'rib-drift',
      base: jumps[0].takeoff + 22,
      length: 180,
      lateral: 7.6,
      halfWidth: 7.7,
      depth: 0.72,
      phase: 0,
    },
    {
      id: 'skull-threshold',
      base: landmarks.skullStart - 185,
      length: 100,
      lateral: -7.4,
      halfWidth: 7,
      depth: 0.48,
      phase: 1.7,
    },
    {
      id: 'amber-drift',
      base: jumps[2].recovery + 68,
      length: 145,
      lateral: 6.6,
      halfWidth: 8,
      depth: 0.62,
      phase: 3.1,
    },
    {
      id: 'silt-return',
      base: sections.at(-1).start + 32,
      length: 100,
      lateral: -8,
      halfWidth: 6.8,
      depth: 0.42,
      phase: 4.2,
    },
  ].map(({ base, length, phase, ...zone }) => {
    const wave = time / 43 + phase;
    const start = base + Math.sin(wave) * 12;
    return {
      ...zone,
      start,
      end: start + length,
      lateral: zone.lateral + Math.sin(wave * 0.73) * 1.8,
    };
  });
}

export function saffronSandSection(zone, fraction) {
  const u = Math.max(0, Math.min(1, fraction));
  return {
    distance: zone.start + (zone.end - zone.start) * u,
    lateral: zone.lateral + Math.sin(u * Math.PI * 2) * 1.3,
    halfWidth: zone.halfWidth * Math.sin(Math.PI * u) ** 0.4,
    depth: zone.depth * Math.sin(Math.PI * u) ** 1.4,
  };
}

export function saffronSandExposure(track, distance, lateral, time = 0) {
  const s = ((distance % track.length) + track.length) % track.length;
  let exposure = 0;
  for (const zone of sampleSaffronDeposits(track, time)) {
    if (s <= zone.start || s >= zone.end) continue;
    const section = saffronSandSection(
      zone,
      (s - zone.start) / (zone.end - zone.start),
    );
    const x = Math.abs(lateral - section.lateral);
    if (x < section.halfWidth)
      exposure = Math.max(exposure, Math.min(1, (section.halfWidth - x) / 0.7));
  }
  return exposure;
}
