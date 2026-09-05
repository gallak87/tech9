// Stage 1 — reference image → textured mesh.
//
// Hunyuan3D-2.1 via the MLX port, INT8, in a Python 3.10 venv. Two passes, both
// required: shape generation, then PBR texture synthesis. Texture is what puts
// the character in the same lighting model as the world, which is why TripoSR
// was ruled out despite being faster.
//
// NOT WIRED IN. See stages/_setup.mjs for why, and forge-manifest.json's
// `mesh` block for the model decisions that are already made and must not be
// re-litigated.

import path from 'node:path';
import { refuse } from './_setup.mjs';

export default {
  name: 'mesh',

  inputs: (entry) => [entry.ref],
  outputs: (entry, env) => [path.join(env.out, `${entry.name}.glb`)],

  async run(ctx) {
    ctx.progress(0, 'checking the environment');
    refuse(ctx, {
      name: 'mesh',
      what: 'Hunyuan3D-2.1-mlx, INT8, shape pass then texture pass (~15 min).',
      repo: ctx.config.repo,
      setup: [
        'brew install python@3.10',
        `python3.10 -m venv ${ctx.manifest.venv}`,
        `source ${ctx.manifest.venv}/bin/activate && pip install -U pip`,
        `git clone https://github.com/dgrauet/Hunyuan3D-2.1-mlx ${ctx.config.repo}`,
        `cd ${ctx.config.repo} && pip install -r requirements.txt`,
      ],
      command: (py, repo, c) => [
        `${py || '<venv>/bin/python'} ${repo || '<repo>'}/generate.py \\`,
        `    --image ${c.rel(c.inputs[0])} \\`,
        `    --precision ${c.config.precision || 'int8'} \\`,
        `    --views ${c.config.views ?? 6} --texture-size ${c.config.textureSize ?? 512} \\`,
        `    --output ${c.rel(c.outputs[0])}`,
      ],
      verify: 'the port README says testing was limited to its two example meshes, so those flag '
        + 'names are a guess. A guessed CLI fails fifteen minutes in, with a Python traceback, on '
        + 'every retry. Confirm the real surface once, then wire it in here.',
    });
  },
};
