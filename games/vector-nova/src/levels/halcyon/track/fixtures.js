import { framePoint } from '../../../track/frames.js';

export function createPracticalFixtures(track) {
  const fixtures = [];
  const tunnel = track.sections.find(({ id }) => id === 'tunnel');
  for (
    let distance = 24, index = 0;
    distance < track.length;
    distance += 72, index += 1
  ) {
    if (distance > tunnel.start - 15 && distance < tunnel.end + 15) continue;
    const side = index % 2 ? -1 : 1;
    const frame = track.sample(distance);
    fixtures.push({
      kind: 'street',
      distance,
      side,
      position: framePoint(frame, side * 12.22, 8.36),
      target: framePoint(frame, side * 6, 0),
      intensity: 135,
      color: 0xffd2a0,
    });
  }
  for (
    let distance = tunnel.start, index = 0;
    distance <= tunnel.end;
    distance += 24, index += 1
  ) {
    const side = index % 2 ? -1 : 1;
    const frame = track.sample(distance);
    fixtures.push({
      kind: 'tunnel',
      distance,
      side,
      position: framePoint(frame, side * 10.4, 13.51),
      target: framePoint(frame, side * 7.2, 0.3),
      intensity: 560,
      color: 0xffd4a6,
    });
  }
  return fixtures.sort((a, b) => a.distance - b.distance);
}
