import { createDeviceLayout } from '../../pickups/layout.js';

export function createCrucibleDevices(track) {
  return createDeviceLayout(
    track,
    [
      ['dispatch-vector', 'vector', 0.025, 0, 20, 64],
      ['crown-arc', 'arc', 0.16, -10, 7, 11],
      ['crown-shield', 'aegis', 0.18, 10, 7, 9],
      ['exchanger-vector', 'vector', 0.29, 0, 20, 64],
      ['under-repulsor', 'repulsor', 0.39, 9, 7, 11],
      ['under-arc', 'arc', 0.43, -9, 7, 11],
      ['cooling-vector', 'vector', 0.55, 0, 20, 64],
      ['cooling-shield', 'aegis', 0.65, -10, 7, 9],
      ['cooling-ion', 'ion', 0.69, 10, 7, 11],
      ['return-vector', 'vector', 0.79, 0, 20, 64],
      ['dispatch-repulsor', 'repulsor', 0.89, -9, 7, 11],
      ['dispatch-shield', 'aegis', 0.93, 9, 7, 9],
    ].map(([id, type, f, lateral, width, length]) => ({
      id,
      type,
      distance: f * track.length,
      lateral,
      width,
      length,
      label: id.replaceAll('-', ' '),
    })),
  );
}
