import { createDeviceLayout } from '../../pickups/layout.js';

// Offsets are metres from the start of each carrier's road. The central
// Vector strips keep their launch run-ups. Combat gates sit in optional lanes
// between the receiving zone and the next approach.
const plan = {
  'nomad-tailforge': [
    ['aegis', 150, -8],
    ['vector', 360, 0],
    ['arc', 510, 12],
  ],
  'nomad-shoulder-ascent': [
    ['repulsor', 600, -8],
    ['vector', 760, 0],
  ],
  'nomad-high-balcony': [['arc', 944, 8]],
  // Portside has a long enough supported deck for the full Ion emission.
  'nomad-portside-dive': [
    ['aegis', 1050, 8],
    ['ion', 1110, -9],
    ['repulsor', 1930, 9],
  ],
  'nomad-freight-cathedral': [['arc', 620, -8]],
  'nomad-overtaking-wall': [['repulsor', 517, 8]],
  'nomad-passing-deck': [['arc', 1672, -9]],
  'nomad-lower-hold': [
    ['repulsor', 600, 8],
    ['vector', 760, 0],
  ],
  'nomad-crane-alley': [['arc', 620, -8]],
  'nomad-saltwind': [
    ['aegis', 520, -8],
    ['vector', 760, 0],
    ['repulsor', 865, 9],
  ],
  'nomad-terminus': [['arc', 885, -8]],
};

const dimensions = {
  aegis: { length: 8, width: 10 },
  vector: { length: 65, width: 14 },
  arc: { length: 10, width: 10 },
  ion: { length: 10, width: 10 },
  repulsor: { length: 10, width: 10 },
};

export function createDevices(track) {
  const devices = [];
  for (const carrier of track.carriers) {
    for (const [type, offset, lateral] of plan[carrier.id] ?? []) {
      const id = `${carrier.id}-${type}`;
      const distance = carrier.start + offset;
      const { length, width } = dimensions[type];
      const start = distance - length / 2;
      const end = distance + length / 2;
      if (
        start < carrier.start + 12 ||
        end > carrier.end - 35 ||
        end >= track.finishDistance ||
        track.jumps.some(
          (jump) =>
            end + 8 >= jump.takeoff &&
            start - 8 <= Math.max(jump.landingEnd, jump.recovery),
        )
      )
        throw new Error(`Device ${id} is outside the safe convoy road`);
      devices.push({
        id,
        type,
        distance,
        lateral,
        length,
        width,
        label: carrier.name,
      });
    }
  }
  return createDeviceLayout(track, devices);
}
