// Stage 3 — rigged glb → the character the game loads.
//
// Under a second, in process, no Python:
//
//   1. read the joint names out of the GLB's JSON chunk (inline parser, no
//      dependencies, as ref-gen.mjs inlines its PNG codec)
//   2. write assets/<name>.bones.json — a suggested map marked
//      "reviewed": false, never a silently applied guess
//   3. copy the glb into assets/ atomically
//
// Order and atomicity are load-bearing. vite.config.js watches this directory
// and the client hot-swaps on any change: writing the glb in place lets the
// loader fetch a half-written file, and writing it before the map opens a
// window where a new mesh is paired with yesterday's names. Map first, then a
// temp file renamed into place — one watcher event, on a complete file.
//
// The suggester is imported from src/actors/gltf-actor.js. The map is the
// contract between this stage and the loader; a second copy of the heuristic
// that writes it is where the two drift.

import fs from 'node:fs';
import path from 'node:path';
import { suggestBoneMap, SPEC_BONES } from '../../../src/actors/gltf-actor.js';

/** The JSON chunk of a GLB — enough of the container to read node and skin
 *  names. Not a glTF parser. */
function readGlbJson(bytes) {
  if (bytes.length < 20 || bytes.readUInt32LE(0) !== 0x46546c67) {
    throw new Error('not a GLB — the rig stage wrote something else, or the file is truncated');
  }
  const version = bytes.readUInt32LE(4);
  if (version !== 2) throw new Error(`GLB version ${version}, expected 2`);
  let off = 12;
  while (off + 8 <= bytes.length) {
    const len = bytes.readUInt32LE(off);
    const type = bytes.readUInt32LE(off + 4);
    if (type === 0x4e4f534a) return JSON.parse(bytes.subarray(off + 8, off + 8 + len).toString('utf8'));
    off += 8 + len;
  }
  throw new Error('GLB has no JSON chunk');
}

/** Every joint name in the file's first skin, in skin order. */
function jointNames(json) {
  const skin = json.skins?.[0];
  if (!skin) {
    throw new Error('the glb has no skin.\n'
      + 'That means the rig stage produced a STATIC mesh, not a rigged one. The loader needs a\n'
      + 'SkinnedMesh — see the acceptance test in forge-manifest.json\'s `rig` block.');
  }
  return skin.joints.map((i) => json.nodes?.[i]?.name ?? `<node ${i}>`);
}

export default {
  name: 'install',

  inputs: (entry, env) => [path.join(env.out, `${entry.name}-rigged.glb`)],
  outputs: (entry, env) => [
    path.join(env.assets, `${entry.name}.glb`),
    path.join(env.assets, `${entry.name}.bones.json`),
  ],

  async run(ctx) {
    const src = ctx.inputs[0];
    const [glbOut, mapOut] = ctx.outputs;

    ctx.progress(0.1, `reading ${ctx.rel(src)}`);
    const bytes = fs.readFileSync(src);
    const json = readGlbJson(bytes);
    const names = jointNames(json);
    ctx.log(`${names.length} joints: ${names.join(', ')}`);

    /* ── the map ──────────────────────────────────────────────────────────
       A signed-off map is never overwritten, --force included: --force means
       redo the work, not discard the review. Every entry is still re-validated
       against the new glb — a re-rig can rename or drop a bone, and a stale
       entry produces a character wrong at exactly one joint. */
    ctx.progress(0.4, 'bone map');
    let prev = null;
    try { prev = JSON.parse(fs.readFileSync(mapOut, 'utf8')); } catch { /* first run */ }

    const known = new Set(names);
    const stale = prev ? Object.entries(prev.bones || {}).filter(([, n]) => !known.has(n)) : [];
    const keep = prev?.reviewed === true && stale.length === 0;

    const bones = keep ? { ...prev.bones } : suggestBoneMap(names);
    const missing = SPEC_BONES.filter(s => !bones[s]);

    const map = {
      name: ctx.name,
      _map: 'glb bone name per spec bone. Data, not a convention the loader guesses. Check every '
        + 'line against the mesh, then set "reviewed": true; until then the loader warns on load.',
      reviewed: keep ? true : false,
      _bindMode: 'absolute (default): an unposed clip returns the limbs to the spec bind, hanging along -Y. '
        + '"additive" measures every clip from the glb\'s own A-pose. See src/actors/gltf-actor.js.',
      faceYawDeg: prev?.faceYawDeg ?? ctx.config.faceYawDeg ?? 0,
      source: path.basename(src),
      joints: names,
      bones,
    };
    if (prev?.bindMode) map.bindMode = prev.bindMode;

    fs.mkdirSync(ctx.assets, { recursive: true });
    fs.writeFileSync(mapOut, `${JSON.stringify(map, null, 2)}\n`);

    if (keep) {
      ctx.log('kept the reviewed map — every mapped bone still exists in the new glb');
    } else {
      if (stale.length) {
        ctx.log(`REVIEW CLEARED: ${stale.length} mapped bone(s) no longer exist in the glb — ${stale.map(([s, n]) => `${s}→${n}`).join(', ')}`);
      }
      for (const s of SPEC_BONES) {
        ctx.log(`  ${s.padEnd(13)} ${bones[s] ?? '— UNMATCHED, fill this in by hand'}`);
      }
      ctx.log(`suggested ${SPEC_BONES.length - missing.length}/${SPEC_BONES.length}. Check them, then set "reviewed": true in ${ctx.rel(mapOut)}.`);
    }
    if (missing.length) {
      /* Written, then refused: the half-map on disk is what gets edited. */
      throw new Error(`${missing.length} spec bone(s) unmatched: ${missing.join(', ')}\n`
        + `The map is at ${ctx.rel(mapOut)} with everything that DID match. Fill in the rest by hand\n`
        + 'from the joint list above, set "reviewed": true, and re-run with --force.');
    }

    /* Temp file then rename: the watcher must never see a partial glb. */
    ctx.progress(0.8, `installing ${(bytes.length / 1024 / 1024).toFixed(2)} MB`);
    const tmp = `${glbOut}.tmp`;
    fs.writeFileSync(tmp, bytes);
    fs.renameSync(tmp, glbOut);

    ctx.progress(1, `→ ${ctx.rel(glbOut)}`);
    ctx.log('the dev server hot-swaps this on save. Load the game with ?forge=' + ctx.name);
  },
};
