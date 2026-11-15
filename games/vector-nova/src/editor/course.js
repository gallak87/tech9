import { validateMetadata, validateDefinition } from '../levels/contract.js';
import { validateDocument, analyzeDocument } from './document.js';
import { editorBiome } from './biomes.js';
import { createEditorLevel } from './nightweir.js';

// Only bundled factories interpret user data. Documents never become module paths.
export function loadEditorCourse(input) {
  const document = validateDocument(input);
  const analysis = analyzeDocument(document);
  if (!analysis.valid) throw new Error(analysis.errors.join(' '));
  const downhill = document.courseType === 'downhill';
  const biome = editorBiome(document.biome);
  const metadata = validateMetadata({
    id: `custom-${document.id}`,
    name: document.name,
    order: 10000,
    shape: false,
    review: false,
    customCourse: true,
    ui: {
      edition: 'TRACK WORKSHOP',
      subtitle: downhill
        ? `${biome.label} custom descent`
        : `${biome.label} custom circuit`,
      intro: downhill
        ? `Drive your own ${biome.label} descent.`
        : `Test your own ${biome.label} circuit.`,
      tag: downhill ? 'CUSTOM DOWNHILL' : 'CUSTOM CIRCUIT',
      tagDetail: 'Practice only · no career rewards',
      ...(downhill ? { courseLabel: 'Custom descent' } : {}),
    },
  });
  return {
    metadata,
    definition: validateDefinition(createEditorLevel(document), metadata.id),
    shape: false,
  };
}
