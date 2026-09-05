// ─────────────────────────────────────────────────────────────────────────────
// Propose a source-bone → spec-bone map by reading a rigged file's own joint
// names. Pure Node, no Blender.
//
//   node tools/suggest-map.mjs <rigged.glb> [--out map.json]
//
// Bone naming is genuinely unstandardised — Mixamo, VRoid, UniRig and Blender's
// own rigs all differ — so this matches against the conventions that exist
// rather than pretending there is one. It proposes; it does not decide. An
// ambiguous or missing joint is reported as such and the file is written with
// "reviewed": false, which the pipeline refuses to run on until a human flips it.
//
// Guessing quietly is the failure this avoids: a map that is wrong at one joint
// produces a character that loads fine and moves wrong.
// ─────────────────────────────────────────────────────────────────────────────

import fs from 'node:fs';
import { readGlb, SPEC_NAMES } from '../contract.mjs';
import { JOINTS } from '../../specs/rig.mjs';

/** Tokens that identify each spec joint, most specific first. Matched against
 *  the source name with separators and case stripped. */
const SYNONYMS = {
  hips: ['hips', 'pelvis', 'hip'],
  spine_lower: ['spine1', 'spine_01', 'spine'],
  spine_upper: ['spine2', 'spine_02', 'chest', 'upperchest'],
  neck: ['neck'],
  head: ['head'],
  shoulder: ['shoulder', 'clavicle'],
  upperArm: ['upperarm', 'arm', 'upper_arm'],
  lowerArm: ['forearm', 'lowerarm', 'elbow', 'lower_arm'],
  hand: ['hand', 'wrist'],
  upperLeg: ['upleg', 'upperleg', 'thigh', 'upper_leg'],
  lowerLeg: ['leg', 'lowerleg', 'shin', 'calf', 'knee'],
  foot: ['foot', 'ankle'],
};

/** Namespace, side marker and separators removed. Side is decided by sideOf();
 *  leaving it in the string breaks suffix matching, because "Lowerleg.l"
 *  flattens to "lowerlegl" and no longer ends with any joint token. */
const flat = (s) => s.toLowerCase()
  .replace(/^[^:]*:/, '')
  .replace(/(^|[^a-z])(left|right)/g, '$1')
  .replace(/[._\- ]+[lr]$/, '')
  .replace(/[^a-z0-9]/g, '');

function sideOf(raw) {
  const s = raw.toLowerCase();
  if (/(^|[^a-z])left|_l($|[^a-z])|\.l($|[^a-z])|l_?(arm|leg|hand|foot|shoulder)/.test(s)) return 'L';
  if (/(^|[^a-z])right|_r($|[^a-z])|\.r($|[^a-z])|r_?(arm|leg|hand|foot|shoulder)/.test(s)) return 'R';
  return null;
}

/** Score a source name against one spec joint. Higher is better, 0 = no match. */
function score(raw, spec) {
  const wantSide = spec.endsWith('_L') ? 'L' : spec.endsWith('_R') ? 'R' : null;
  const base = spec.replace(/_[LR]$/, '');
  if (wantSide && sideOf(raw) !== wantSide) return 0;
  if (!wantSide && sideOf(raw) !== null) return 0;

  const f = flat(raw);
  // The spec's own name is always the strongest signal — a rig that already
  // names a joint "lowerLeg" must beat one that merely contains "leg".
  const list = [base.toLowerCase(), ...(SYNONYMS[base] || [])];
  for (let i = 0; i < list.length; i++) {
    const tok = list[i].replace(/[^a-z0-9]/g, '');
    if (f === tok || f.endsWith(tok)) return 100 - i;      // exact / suffix
    if (f.includes(tok)) return 60 - i;                     // contained
  }
  return 0;
}

export function suggest(json) {
  // Only nodes that are actually joints of a skin — otherwise mesh nodes and
  // empties compete for the match.
  const jointIdx = new Set();
  for (const s of json.skins || []) (s.joints || []).forEach(j => jointIdx.add(j));
  const pool = [...jointIdx].map(i => ({ i, name: json.nodes[i].name || `node${i}` }));
  if (!pool.length) throw new Error('no skin joints in file — is it rigged?');

  // Score every (spec, source) pair, then assign the most confident pairs
  // first. Resolving in spec order instead would let a weak early match steal
  // a bone that a later spec joint matches exactly — "arm" is a substring of
  // "forearm", so upperArm would take LeftForeArm before lowerArm could.
  const pairs = [];
  for (const spec of SPEC_NAMES)
    for (const p of pool) {
      const s = score(p.name, spec);
      if (s > 0) pairs.push({ spec, name: p.name, s });
    }
  pairs.sort((a, b) => b.s - a.s);

  const bones = {}, notes = [];
  const takenSrc = new Set();
  for (const { spec, name, s } of pairs) {
    if (bones[spec] || takenSrc.has(name)) continue;
    // A tie at the top for this spec, among bones still free, is a real
    // ambiguity and must be reported rather than broken arbitrarily.
    const rivals = pairs.filter(q => q.spec === spec && q.s === s && !takenSrc.has(q.name));
    if (rivals.length > 1) {
      const note = `${spec}: ambiguous — ${rivals.slice(0, 3).map(r => r.name).join(' | ')}`;
      if (!notes.includes(note)) notes.push(note);
      continue;
    }
    bones[spec] = name;
    takenSrc.add(name);
  }
  for (const spec of SPEC_NAMES)
    if (!bones[spec] && !notes.some(n => n.startsWith(`${spec}:`))) notes.push(`${spec}: no candidate`);
  return { bones, notes, pool: pool.map(p => p.name) };
}

/* ── cli ──────────────────────────────────────────────────────────────────── */
if (import.meta.url === `file://${process.argv[1]}`) {
  const [file, ...rest] = process.argv.slice(2);
  if (!file) { console.error('usage: node tools/suggest-map.mjs <rigged.glb> [--out map.json]'); process.exit(2); }
  const outIdx = rest.indexOf('--out');
  const { json } = readGlb(file);
  const { bones, notes, pool } = suggest(json);

  const complete = Object.keys(bones).length === SPEC_NAMES.length;
  const doc = {
    _what: 'Source bone name per spec joint. Data, not a convention the pipeline guesses.',
    _review: 'Check every line against the rig, then set reviewed: true. canonicalise refuses until then.',
    source: file,
    reviewed: false,
    heroM: 1.72,
    soleTol: 0.01,
    bones,
    joints: JOINTS,
  };

  console.log(`[map] ${pool.length} joints in file, matched ${Object.keys(bones).length}/${SPEC_NAMES.length}`);
  for (const n of notes) console.log(`[map]   ${n}`);
  if (outIdx !== -1 && rest[outIdx + 1]) {
    fs.writeFileSync(rest[outIdx + 1], JSON.stringify(doc, null, 2) + '\n');
    console.log(`[map] wrote ${rest[outIdx + 1]} (reviewed: false)`);
  } else {
    console.log(JSON.stringify(bones, null, 2));
  }
  process.exit(complete ? 0 : 1);
}
