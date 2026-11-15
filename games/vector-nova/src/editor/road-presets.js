// Road-only generation preferences. Applying a card never chooses an environment
// or a seed; the caller explicitly generates and commits the new resolved road.
import { GENERATOR_VERSION } from './generation-version.js';
const preset = (value) =>
  Object.freeze({ ...value, options: Object.freeze(value.options) });

export const ROAD_PRESETS = Object.freeze([
  preset({
    id: 'flowing',
    label: 'Flowing',
    description: 'Broad turns, gentle rises and a few approachable jumps.',
    circuitOnly: false,
    options: {
      length: 5000,
      bendiness: 0.25,
      elevation: 0.25,
      crossovers: 0,
      jumpFrequency: 'few',
      jumpSize: 'small',
    },
  }),
  preset({
    id: 'technical',
    label: 'Technical',
    description: 'Tighter linked turns, varied heights and mixed jumps.',
    circuitOnly: false,
    options: {
      length: 5000,
      bendiness: 0.85,
      elevation: 0.4,
      crossovers: 0,
      jumpFrequency: 'normal',
      jumpSize: 'mixed',
    },
  }),
  preset({
    id: 'woven',
    label: 'Woven',
    description: 'A closed circuit with intertwined turns and high overpasses.',
    circuitOnly: true,
    options: {
      length: 10000,
      bendiness: 0.55,
      elevation: 0.45,
      crossovers: 0.75,
      jumpFrequency: 'few',
      jumpSize: 'mixed',
    },
  }),
  preset({
    id: 'big-air',
    label: 'Big Air',
    description:
      'Roomy approaches and large jumps, fitted to the road available.',
    circuitOnly: false,
    options: {
      length: 10000,
      bendiness: 0.35,
      elevation: 0.65,
      crossovers: 0,
      jumpFrequency: 'many',
      jumpSize: 'large',
    },
  }),
]);

export function roadPreset(id = 'flowing') {
  const result = ROAD_PRESETS.find((value) => value.id === id);
  if (!result) throw new Error('Choose a supported road starter.');
  return result;
}

export function roadPresetOptions(id, { courseType = 'circuit', length } = {}) {
  const selected = roadPreset(id);
  if (!['circuit', 'downhill'].includes(courseType))
    throw new Error('Choose Circuit or Downhill course type.');
  if (selected.circuitOnly && courseType !== 'circuit')
    throw new Error(
      'Woven is a Circuit starter. Choose another Downhill starter.',
    );
  if (length !== undefined && !Number.isFinite(length))
    throw new Error('Road starter length must be a finite number.');
  return {
    generatorVersion: GENERATOR_VERSION,
    courseType,
    ...selected.options,
    length: Math.max(3000, Math.min(20000, length ?? selected.options.length)),
  };
}
