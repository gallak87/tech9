// Reference image → static mesh. Backend undecided.
import path from 'node:path';
import { runBackend } from './_backend.mjs';

const OPTIONS = [
  { id: 'hunyuan3d-mlx', note: 'local, Apple Silicon. ~20 min/run. 1 success and 1 unattributed failure on record.' },
  { id: 'meshy-api',     note: 'hosted. Fast and good, free tier proven by hand. Needs their API; licence unverified.' },
];

export default {
  name: 'mesh',
  inputs: (e) => [e.ref],
  outputs: (e, env) => [path.join(env.out, `${e.name}.glb`)],
  async run(ctx) { runBackend('mesh', ctx, OPTIONS); },
};
