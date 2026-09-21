import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { ASSET_MANIFEST } from '../src/assets.js';
import { ENEMIES } from '../src/content.js';

const root = new URL('../', import.meta.url);
const manifest = JSON.parse(
  fs.readFileSync(new URL('art/enemy-prompts.json', root), 'utf8'),
);
const argument = process.argv[2];
const assets = new Map(
  ASSET_MANIFEST.filter((a) => a.kind === 'enemy').map((a) => [a.id, a]),
);
const ids = manifest.enemies.map((e) => e.id);
if (
  new Set(ids).size !== ids.length ||
  Object.keys(ENEMIES).some((id) => !ids.includes(id))
)
  throw Error('Enemy prompt coverage is incomplete or duplicated.');
for (const record of manifest.enemies) {
  const asset = assets.get(record.referenceAssetId);
  if (
    !ENEMIES[record.id] ||
    !asset ||
    !record.identityNotes ||
    !fs.existsSync(new URL('public/' + asset.url, root))
  )
    throw Error('Invalid enemy reference: ' + record.id);
}

if (argument === '--check' || argument === '--list') {
  console.log(
    JSON.stringify(
      manifest.enemies.map((e) => ({
        id: e.id,
        locomotion: e.locomotion,
        originalPrompt: e.historicalPrompt.status,
        reference: assets.get(e.referenceAssetId).url,
      })),
      null,
      2,
    ),
  );
} else {
  const record = manifest.enemies.find((e) => e.id === argument);
  if (!record)
    throw Error(
      'Usage: node scripts/enemy-art-prompt.mjs --check | --list | <enemy-id>',
    );
  if (record.locomotion !== 'sheet')
    throw Error(
      record.id +
        ' uses ' +
        record.locomotion +
        '; no movement generation is planned.',
    );
  const prompt = [
    'Use case: identity-preserve. Asset type: production overworld locomotion atlas for Chronoforge Echo.',
    'Image 1 is the canonical battle-sheet identity reference. Depict exactly the SAME creature in every new pose; preserve anatomy, proportions, silhouette, palette, equipment, distinctive details, crisp pixel-cluster finish and warm upper-left lighting. Do not redesign it.',
    'Identity: ' + record.identityNotes,
    'Create one coherent WALK sheet: FOUR columns by THREE rows, 12 equal square cells, landscape 4:3 aspect, preferably 2048x1536. Every full-body sprite entirely inside its own cell, generous margin at least 10% of cell size on every side. Fixed anatomical scale and projected ground baseline across frames; no auto-fitting individual poses.',
    'Row 1 faces LEFT side/three-quarter matching the reference. Row 2 faces toward camera/down. Row 3 faces away/up. Each row has four successive locomotion phases: first contact, passing, opposite contact, opposite passing, looping smoothly. Preserve the same equipment on the same anatomical side across all directions.',
    'Movement: ' + record.movement,
    'Use neutral alert patrol expressions. No attacks, hurt, collapse, projectiles, magic discharges, or changing armor. All limbs, tails and equipment fully visible; no touching adjacent cells.',
    'Background: genuine transparent alpha, no painted checkerboard. No floor, cast shadows, scenery, text, labels, grid lines, borders, or backdrop. Output only the atlas.',
  ].join('\n');
  console.log(
    JSON.stringify(
      {
        id: record.id,
        prompt,
        referenced_image_paths: [
          fileURLToPath(
            new URL('public/' + assets.get(record.referenceAssetId).url, root),
          ),
        ],
        originalPromptStatus: record.historicalPrompt.status,
      },
      null,
      2,
    ),
  );
}
