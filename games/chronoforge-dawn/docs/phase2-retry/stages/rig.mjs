// Static mesh → skeleton + skin weights. Backend undecided, and this is THE
// open question: nothing has ever rigged a generated mesh here. Whatever wins,
// canonicalise takes it from there — the contract makes the choice reversible.
import path from 'node:path';
import { runBackend } from './_backend.mjs';

const OPTIONS = [
  { id: 'unirig',     note: 'local, MIT, weights out. Requires NVIDIA + 8 GB VRAM — does not run on this machine.' },
  { id: 'skintokens', note: 'local, MIT, UniRig successor. NVIDIA + 14 GB VRAM + flash-attn. Unproven ports exist for Apple Silicon.' },
  { id: 'mixamo',     note: 'browser form, no API. Usable as a one-off probe; cannot be the destination.' },
];

export default {
  name: 'rig',
  inputs: (e, env) => [path.join(env.out, `${e.name}.glb`)],
  outputs: (e, env) => [path.join(env.out, `${e.name}-rigged.glb`)],
  async run(ctx) { runBackend('rig', ctx, OPTIONS); },
};
