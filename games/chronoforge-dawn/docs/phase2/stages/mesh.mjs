// Stage 1 — reference image → textured mesh.
//
// Hunyuan3D-2.1 via the MLX port, INT8, in the conda env captured by env-lock.yml.
// Two passes, both
// required: shape generation, then PBR texture synthesis. Texture is what puts
// the character in the world's lighting model — the reason TripoSR was ruled
// out despite being faster.
//
// NOT WIRED IN. See stages/_setup.mjs. Model decisions are settled in
// forge-manifest.json's `mesh` block.

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
      setup: ['bash docs/phase2/setup-3dgen.sh'],
      command: (py, repo, c) => [
        `${py || '<env>/bin/python'} docs/phase2/generate.py \\`,
        `    --image ${c.rel(c.inputs[0])} \\`,
        `    --output ${c.rel(c.outputs[0])} \\`,
        `    --precision ${c.config.precision || 'int8'} \\`,
        `    --steps ${c.config.steps ?? 50} \\`,
        `    --views ${c.config.views ?? 6} --texture-size ${c.config.textureSize ?? 512}`,
      ],
      verify: 'the shape pass has not yet produced a mesh. Settle it by hand through the '
        + 'npm forge:smoke / forge:shape scripts, then wire this in.',
    });
  },
};
