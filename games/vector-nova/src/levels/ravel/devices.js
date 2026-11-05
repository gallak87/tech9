import { createDeviceLayout } from '../../pickups/layout.js';

export function createDevices(track) {
  const plan = [];
  function add(id, type, distance, lateral, width, length, label) {
    const start = distance - length / 2 - 8,
      end = distance + length / 2 + 8;
    if (start < 0 || end > track.length) return;
    if (track.jumps.some((j) => end >= j.takeoff && start <= j.recovery))
      return;
    if (
      (track.waveZones ?? []).some(
        (z) =>
          z.start < end &&
          z.end > start &&
          (!z.branchIds ||
            z.branchIds.includes(track.branchAt(distance, lateral).id)),
      )
    )
      return;
    for (const s of [start, distance, end])
      for (const x of [lateral - width / 2, lateral, lateral + width / 2])
        if ((track.surfaceCoverage?.(s, x) ?? 1) <= 0) return;
    const device = { id, type, distance, lateral, width, length, label };
    if (type === 'vector' && length >= 200) device.lowChevronSpacing = 32;
    plan.push(device);
  }
  add('ravel-opening-vector', 'vector', 350, 0, 14, 70, 'Sail departure');
  const braid = track.braid;
  if (braid) {
    const span = braid.end - braid.start;
    // The longer ribbon earns sustained thrust without spending manual reserve.
    add(
      'ravel-outer-long-vector',
      'vector',
      braid.start + span * 0.52,
      100,
      24,
      600,
      'Outer ribbon sustained Vector',
    );
    add(
      'ravel-inner-vector',
      'vector',
      braid.start + span * 0.46,
      -100,
      18,
      60,
      'Inner ribbon short Vector',
    );
    add(
      'ravel-outer-aegis',
      'aegis',
      braid.start + span * 0.67,
      100,
      14,
      8,
      'Outer ribbon protection',
    );
  }
  for (const [i, section] of track.sections.entries()) {
    add(
      `ravel-section-${i}-aegis`,
      'aegis',
      // Tiny sections and the fan counterplay used to create duplicate pairs.
      section.start +
        (['first-screw', 'braid'].includes(section.id) ? 300 : 95),
      0,
      10,
      8,
      section.name,
    );
    add(
      `ravel-section-${i}-vector`,
      'vector',
      section.end - 180,
      0,
      14,
      55,
      section.name,
    );
  }
  // Optional combat choices stay off the central guides, on static support.
  // Inner Ion sits on the quiet ribbon, clear of the middle sail's waves;
  // the longer outer sail keeps its uninterrupted sustained Vector reward.
  for (const [id, type, distance, lateral, label] of [
    ['ravel-saddle-aegis', 'aegis', 3500, 28, 'Tension saddle counterplay'],
    ['ravel-saddle-arc', 'arc', 3590, -28, 'Tension saddle Arc lane'],
    ['ravel-fan-aegis', 'aegis', 7460, -28, 'Braided fan counterplay'],
    ['ravel-fan-repulsor', 'repulsor', 7600, 28, 'Braided fan Repulsor lane'],
    ['ravel-inner-combat-aegis', 'aegis', 8720, -75, 'Inner sail counterplay'],
    ['ravel-inner-ion', 'ion', 8850, -125, 'Inner sail Ion lane'],
  ])
    add(id, type, distance, lateral, 8, type === 'aegis' ? 8 : 10, label);
  return createDeviceLayout(
    track,
    plan.sort((a, b) => a.distance - b.distance),
  );
}
