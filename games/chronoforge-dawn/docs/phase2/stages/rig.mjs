// Stage 2 — mesh → rigged mesh.
//
// UniRig predicts skeleton hierarchy AND per-vertex skinning weights. Its
// components are released progressively, so what is actually available has to
// be checked rather than assumed.
//
// The acceptance test is DEFORMATION, not load success: rig, pose to `victory`,
// look at the shoulder. Generated topology has no edge loops at joints, and if
// the weights collapse there the mesh is the ceiling — not the loader, and not
// anything a later stage can fix.
//
// Mixamo's free auto-rigger is the manual fallback. It is a browser step, so no
// stage will ever drive it, but its output feeds `install` unchanged: drop it at
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
      verify: 'no component of UniRig has been run on this machine and the release state is unknown. '
        + 'Confirm the skinning half exists and produces named humanoid bones before this is wired in — '
        + '`install` reads those names and they are the whole contract with the loader.',
    });
  },
};
