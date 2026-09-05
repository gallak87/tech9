// Stage 3 — rigged glb → the character the game loads.
//
// Under a second, in process, no Python. It does three things:
//
//   1. reads the rigged glb's own joint names, straight out of the GLB's JSON
//      chunk (inline parser, no dependencies — same call as ref-gen.mjs's
//      inline PNG codec)
//   2. writes assets/<name>.bones.json — a SUGGESTED map, marked
//      "reviewed": false, never a silently-applied guess
//   3. copies the glb into assets/ atomically
//
// ORDER AND ATOMICITY ARE LOAD-BEARING. vite.config.js watches this directory
// and the client hot-swaps on any change. Writing the glb in place would let
// the loader fetch a half-written file, and writing the glb before the map
// would open a window where a new mesh is paired with yesterday's names. So:
// map first, then a temp file renamed into place, which the watcher sees as one
// event on a complete file.
//
// The suggester is IMPORTED from src/actors/gltf-actor.js rather than copied.
// The map is the contract between this stage and the loader; two copies of the
// heuristic that writes it is exactly the drift the runnable-spec structure
// exists to prevent.

import fs from 'node:fs';
import path from 'node:path';
import { suggestBoneMap, SPEC_BONES } from '../../../src/actors/gltf-actor.js';

/** The JSON chunk of a GLB. Enough of the container to read node and skin
 *  names; deliberately not a glTF parser. */
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
       A map the human has signed off is never overwritten, not even by
       --force: --force means "redo the work", not "throw away the review".
       Every entry is still re-validated against the new glb, because a
       re-rig can rename or drop a bone and a stale entry is the one failure
       mode that produces a character wrong at exactly one joint. */
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
      _map: 'glb bone name per spec bone. DATA, not a convention the loader guesses. '
        + 'Check every line against the mesh, then set "reviewed": true — until you do, the loader warns on every load.',
      reviewed: keep ? true : false,
      _bindMode: 'absolute (default): an unposed clip returns the limbs to the SPEC bind, hanging along -Y. '
        + '"additive" measures every clip from the glb\'s own A-pose instead. See src/actors/gltf-actor.js.',
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
      /* Written, then refused. The half-map on disk is the thing the human
         edits; failing without writing it would make them start from nothing. */
      throw new Error(`${missing.length} spec bone(s) unmatched: ${missing.join(', ')}\n`
        + `The map is at ${ctx.rel(mapOut)} with everything that DID match. Fill in the rest by hand\n`
        + 'from the joint list above, set "reviewed": true, and re-run with --force.');
    }

    /* ── the glb ──────────────────────────────────────────────────────────
       Temp file then rename: the dev-server watcher must never see a
       partially written glb, and a rename is one event on a complete file. */
    ctx.progress(0.8, `installing ${(bytes.length / 1024 / 1024).toFixed(2)} MB`);
    const tmp = `${glbOut}.tmp`;
    fs.writeFileSync(tmp, bytes);
    fs.renameSync(tmp, glbOut);

    ctx.progress(1, `→ ${ctx.rel(glbOut)}`);
    ctx.log('the dev server hot-swaps this on save. Load the game with ?forge=' + ctx.name);
  },
};
