import fs from 'node:fs';
import crypto from 'node:crypto';
import {ASSET_MANIFEST} from '../src/assets.js';
import {ENEMIES,ITEMS,HEROES,BUILDINGS} from '../src/content.js';
const root=new URL('../',import.meta.url);
const rows=ASSET_MANIFEST.map(entry=>{
 const data=fs.readFileSync(new URL('public/'+entry.url,root));
 return {id:entry.id,kind:entry.kind,biome:entry.biome||null,file:entry.url,width:data.readUInt32BE(16),height:data.readUInt32BE(20),sourceBytes:data.length,frames:entry.metadata?.frames?.length||entry.columns*entry.rows,sha256:crypto.createHash('sha256').update(data).digest('hex')};
});
fs.writeFileSync(new URL('docs/asset-inventory.json',root),JSON.stringify({sourceCount:rows.length,compressedBytes:rows.reduce((n,r)=>n+r.sourceBytes,0),sources:rows},null,2)+'\n');
const table=rows.map(r=>`| ${r.id} | ${r.kind}${r.biome?' / '+r.biome:''} | ${r.width}×${r.height} | ${r.frames} | [PNG](../public/${r.file}) |`).join('\n');
fs.writeFileSync(new URL('docs/ASSET_INVENTORY.md',root),`# Production asset inventory

This inventory describes the required sources imported by the running game. It does not assign an art-quality score. Actual world, battle, walking, interiors, UI and animation reviews are documented in [SHOWCASE_CRITIQUE.md](SHOWCASE_CRITIQUE.md), with raw captures under [evidence](../evidence/).

## Coverage

- **${Object.keys(HEROES).length} heroes:** Kaida, Vex and Rune each have twelve canonical poses, a portrait extracted from their own sheet, and a dedicated twelve-frame directional walk sheet (four phases each for side, front and back; left mirrors side). Runtime anticipation, lunges, shield launch, casting, hurt, defense, healing, defeat and victory use the corresponding grounded poses and the authoritative combat clock.
- **${Object.keys(ENEMIES).length} distinct enemies:** all eighteen continuity identities plus the separate Void Architect. Every identity has its own six-pose source and measured feet/extent metadata. Large bosses have individual silhouettes and source scales. Down poses remain visible before a short fade.
- **Regional environments:** each installed biome has its own eight-prop atlas and six-material ground atlas. The renderer composes outdoor depth, roads, water/cliffs, landmarks, foreground layers and encounter backdrops at a consistent native scale. All eight outdoor worlds are 5760×2520.
- **${Object.keys(BUILDINGS).length} civic structures × four levels:** Town Center, Farm, Mine, Energy Extractor, Barracks, Forge, Research Lab and Walls, the original production/culture sheets plus four dedicated regional town-center families (Haventide, Emberline, Orbital Reach and Last Crown), each with growing per-tier world dimensions and a futuristic final stage. Shared settlement rules drive the visible level.
- **Interiors and residents:** All four town halls have four restoration kits with twelve independently placed pieces each, progressing from scarce supplies and makeshift furnishings to hydroponics, fabrication and civic holograms. Regional cloth, masonry and light distinguish Haventide’s teal coast, Emberline’s rust/copper caravan hall, Orbital Reach’s cobalt/silver refuge and Last Crown’s plum/platinum garden hall. These follow the real Town Center level. Shared interiors retain eight market furnishings plus eight domestic furnishings, six civilians with front/back views and matching portraits, six floor materials and six wall materials. Four liberated town centers and sixteen houses/caves use authored footprints, furniture, events and exits.
- **${Object.keys(ITEMS).length} item identities:** generated transparent resource, consumable and accessory icons plus code-native equipment icons, shared by inventory, shops and queued reward badges. See [icon assets](icon-assets.md) and [src/item-art.js](../src/item-art.js).
- **Interface:** seven parchment expedition tabs, compact neutral field UI and the folding battle interface with lava-orange focus/timing cues. Barlow and EB Garamond fonts are bundled locally. See [accepted UI direction](UI_DIRECTION.md).
- **Combat effects:** original pixel ribbons, shards, arcs, petals, waves, contact accents and fading hit numbers in [src/combat.js](../src/combat.js); each coordinated technique has distinct staging. These effects share the action clock with outcomes.
- **Audio:** original synthesized regional motifs, battle variation and compact interaction/contact/timing/critical cues in [src/audio.js](../src/audio.js). There are no downloaded recordings, sound packs or external runtime assets.

## Immutable source files

${rows.length} required PNG sources, ${(rows.reduce((n,r)=>n+r.sourceBytes,0)/1048576).toFixed(2)} MiB on disk. A complete SHA-256 and byte inventory is in [asset-inventory.json](asset-inventory.json). This compressed-file size is distinct from decoded source and ground-cache memory; live measurements are in [performance.json](../evidence/performance.json).

| ID | Use | Source dimensions | Source frames/cells | File |
| --- | --- | --- | --- | --- |
${table}

## Import and provenance

Active source PNGs are retained unchanged under public/assets. Retired designs, rejected generations and interactive UI prototypes are retained separately in [experiments](../experiments/README.md), outside the production build. Explicit crop rectangles and foot anchors account for generated nonintegral grids. Neutral exterior flood extraction and selected interior seeds remove baked neutral backgrounds while preserving pale hair, eyes and armor. True alpha is preserved. A handful of crop-local exclusions remove neighboring-frame fragments without modifying the original sheet. Required files and frame bounds are validated before readiness; missing required content gives a visible load failure.

[Source provenance](../public/assets/PROVENANCE.md), [hero notes](hero-assets.md), [ordinary enemy notes](enemy-assets.md), [middle enemy notes](mid-enemy-assets.md), [boss notes](boss-assets.md) and the adjacent exact-prompt JSON files record generation and extraction choices. Public source-side prompt/provenance records describe regional additions. No reference-game source or third-party art pack was copied into this project.

The four-phase gait and discrete combat poses are intentionally limited animation, with expressive motion supplied by their authored timeline. Generated sheets and code recipes were reviewed in actual production scenes; source contact sheets alone were never treated as final acceptance. Run **node scripts/asset-inventory.mjs** after changing the manifest to refresh this document and its hashes.
`);
console.log(JSON.stringify({sources:rows.length,bytes:rows.reduce((n,r)=>n+r.sourceBytes,0),items:Object.keys(ITEMS).length,enemies:Object.keys(ENEMIES).length}));
