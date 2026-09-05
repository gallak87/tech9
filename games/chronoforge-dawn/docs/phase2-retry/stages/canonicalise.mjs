// Any rigged file → the contract. The stage that makes one shared animation
// library able to drive every character. See ../CONTRACT.md.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { JOINTS } from '../../specs/rig.mjs';

export default {
  name: 'canonicalise',
  // Either extension. Mixamo returns FBX, Meshy returns GLB, and Blender opens
  // both — so the stage should not care which one landed in out/.
  inputs: (e, env) => {
    const rigged = ['fbx', 'glb', 'gltf']
      .map(ext => path.join(env.out, `${e.name}-rigged.${ext}`))
      .find(f => fs.existsSync(f)) ?? path.join(env.out, `${e.name}-rigged.fbx`);
    return [rigged, path.join(env.out, `${e.name}.bones.json`)];
  },
  outputs: (e, env) => [path.join(env.out, `${e.name}-canonical.glb`)],

  async run(ctx) {
    const [rigged, map] = ctx.inputs;
    const doc = JSON.parse(fs.readFileSync(map, 'utf8'));
    if (!doc.reviewed) {
      throw new Error(`${ctx.rel(map)} has reviewed: false. A map wrong at one joint gives a `
        + `character that loads fine and moves wrong — check every line, then set it true. `
        + `Regenerate with: npm run retry:map -- ${ctx.rel(rigged)} --out ${ctx.rel(map)}`);
    }
    // Dump the spec's joint table fresh, every run. Blender cannot import a JS
    // module, so the data has to cross somehow — but it crosses as a build
    // artefact rather than as something frozen into a file a human reviewed
    // once. docs/specs/rig.mjs stays the only source.
    const joints = path.join(ctx.env.out, `${ctx.entry.name}.spec.json`);
    fs.writeFileSync(joints, JSON.stringify({ joints: JOINTS }, null, 2));

    const script = path.join(path.dirname(new URL(import.meta.url).pathname), '..', 'tools', 'canonicalise.py');
    // Textures travel around the rigging round trip, not through it: a rigging
    // service returns geometry, skeleton and weights, and Mixamo rejects an
    // upload carrying full-size maps outright. tools/extract-textures.py writes
    // them out once; this puts them back.
    const args = ['--background', '--python', script, '--',
      '--input', rigged, '--map', map, '--joints', joints, '--output', ctx.outputs[0]];
    if (ctx.config.textures) args.push('--textures', ctx.abs(ctx.config.textures));
    const out = execFileSync('blender', args, { encoding: 'utf8' });
    out.split('\n').filter(l => l.startsWith('[canon]')).forEach(l => ctx.log(l.replace('[canon] ', '')));
  },
};
