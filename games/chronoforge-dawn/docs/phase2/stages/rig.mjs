// Stage 2 — mesh → rigged mesh.
//
// UniRig predicts skeleton hierarchy AND per-vertex skinning weights. Its
// components release progressively, so what exists has to be checked.
//
// The acceptance test is DEFORMATION, not load success: rig, pose to `victory`,
// look at the shoulder. Generated topology has no edge loops at joints; weights
// that collapse there put the ceiling in the mesh, not the loader.
//
// Mixamo's free auto-rigger is the manual fallback — a browser step no stage
// drives, whose output feeds `install` unchanged: drop it at
// out/<name>-rigged.glb and run `--stage install`.
//
// NOT WIRED IN. See stages/_setup.mjs.

import path from 'node:path';
import { refuse } from './_setup.mjs';

export default {
  name: 'rig',

  inputs: (entry, env) => [path.join(env.out, `${entry.name}.glb`)],
  outputs: (entry, env) => [path.join(env.out, `${entry.name}-rigged.glb`)],

  async run(ctx) {
    ctx.progress(0, 'checking the environment');
    refuse(ctx, {
      name: 'rig',
      what: 'UniRig humanoid skeleton + skinning weights. Duration unmeasured.',
      repo: ctx.config.repo,
      setup: [
        `git clone https://github.com/VAST-AI-Research/UniRig ${ctx.config.repo}`,
        `source ${ctx.manifest.venv}/bin/activate && cd ${ctx.config.repo} && pip install -r requirements.txt`,
        'read the repo README FIRST — components ship progressively and the skinning half may not be out.',
      ],
      command: (py, repo, c) => [
        `${py || '<venv>/bin/python'} ${repo || '<repo>'}/run.py \\`,
        `    --input ${c.rel(c.inputs[0])} \\`,
        `    --skeleton ${c.config.skeleton || 'humanoid'} \\`,
        `    --output ${c.rel(c.outputs[0])}`,
        '',
        'or, the manual fallback:',
        '    upload the glb to mixamo.com, auto-rig, download as FBX/glTF,',
        `    convert to glb and save it as ${c.rel(c.outputs[0])}`,
      ],
      verify: 'no component of UniRig has been run here and the release state is unknown. Confirm '
        + 'the skinning half exists and emits named humanoid bones first — `install` reads those '
        + 'names and they are the whole contract with the loader.',
    });
  },
};
