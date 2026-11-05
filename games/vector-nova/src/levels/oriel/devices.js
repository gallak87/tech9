import { createDeviceLayout } from '../../pickups/layout.js';
import { orielRoadBounds } from './hazards.js';

export function createDevices(track) {
  const at = (id, fraction = 0.35) => {
    const section = track.sections.find((s) => s.id === id);
    return section.start + (section.end - section.start) * fraction;
  };
  const plan = [
    ['departure', 'vector', 120, 0, 42, 15],
    ['terrace-launch', 'vector', track.jumps[0].takeoff - 100, 0, 46, 15],
    ['sunline-launch', 'vector', track.jumps[1].takeoff - 110, 0, 48, 15],
    ['waterside', 'vector', at('waterside', 0.3), 0, 42, 15],
    ['gardens', 'aegis', at('wall-gardens', 0.5), -7, 10, 8],
    ['borough', 'aegis', at('ceiling', 0.4), 7, 10, 8],
    ['orchard', 'aegis', at('orchards', 0.65), -7, 10, 8],
    ['promenade', 'arc', at('lakeside', 0.6), 8, 10, 5],
    ['gardens', 'ion', at('wall-gardens', 0.75), 8, 10, 5],
    ['borough', 'repulsor', at('ceiling', 0.7), -8, 10, 5],
    ['orchard', 'arc', at('orchards', 0.8), 8, 10, 5],
  ].map(([id, type, distance, lateral, length, width]) => {
    let min = -20;
    let max = 20;
    for (let offset = -length / 2; offset <= length / 2; offset += 0.5) {
      const bounds = orielRoadBounds(track, distance + offset);
      if (!bounds) continue;
      min = Math.max(min, bounds.min);
      max = Math.min(max, bounds.max);
    }
    return {
      id: `oriel-${id}-${type}`,
      type,
      distance,
      lateral: Math.max(
        min + width / 2 + 0.7,
        Math.min(max - width / 2 - 0.7, lateral),
      ),
      length,
      width,
      label: `${id} ${type}`,
    };
  });
  return createDeviceLayout(track, plan).sort(
    (a, b) => a.distance - b.distance,
  );
}
