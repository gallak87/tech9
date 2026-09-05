// Contract-satisfying glb → the game. Validate, then copy. Nothing else.
//
// There is no bone map to install. Under the contract a character's joints ARE
// the spec's names, so the engine looks them up directly. The previous pipeline
// shipped a per-asset bones.json because every asset named its joints
// differently; canonicalising upstream deletes that whole file and the class of
// bug where it was wrong at one joint.
import fs from 'node:fs';
import path from 'node:path';
import { validateFile } from '../contract.mjs';

export default {
  name: 'install',
  inputs: (e, env) => [path.join(env.out, `${e.name}-canonical.glb`)],
  outputs: (e, env) => [path.join(env.assets, `${e.name}.glb`)],

  async run(ctx) {
    const src = ctx.inputs[0];
    const r = validateFile(src);
    ctx.log(JSON.stringify(r.report));
    if (!r.ok) {
      throw new Error(`refuses to install — ${ctx.rel(src)} violates the contract:\n      `
        + r.errors.join('\n      '));
    }
    fs.mkdirSync(path.dirname(ctx.outputs[0]), { recursive: true });
    fs.copyFileSync(src, ctx.outputs[0]);
    ctx.log(`validated, installed as ${path.basename(ctx.outputs[0])}`);
  },
};
