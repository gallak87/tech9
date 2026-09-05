// Shared setup checks for the two stages that shell out to Python.
//
// Neither `mesh` nor `rig` can be written honestly yet. The py3.10 venv does
// not exist, the model weights are not downloaded, and — the part that actually
// decides it — NEITHER PORT'S CLI SURFACE HAS BEEN RUN ON THIS MACHINE. The
// Hunyuan MLX port's own README says testing was limited to the two example
// meshes it ships with. Guessing at flag names and writing a plausible spawn()
// produces a stage that fails fifteen minutes in with a Python traceback the
// human then has to reverse-engineer, which is strictly worse than this file.
//
// So they refuse, and they print the exact command they intend to run. The
// human runs it by hand once, confirms the CLI, and only then is it wired in.
// docs/phase2/README.md §Stage 1 and §Stage 2 hold the model decisions; this
// holds nothing but the checks and the message.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/** `~/foo` → `/Users/…/foo`. Manifest paths are written the way a human types
 *  them; nothing else in the repo expands tildes, so it happens here. */
export function expand(p) {
  if (!p) return p;
  return p.startsWith('~') ? path.join(os.homedir(), p.slice(1)) : p;
}

export function venvPython(manifest) {
  const venv = expand(manifest.venv || '');
  return venv ? path.join(venv, 'bin', 'python') : '';
}

/**
 * Throw with everything the human needs to unblock this stage in one read:
 * what is missing, what the command will be, and where the decision is written
 * down. Never returns — a stage that calls this has not run.
 *
 * @param {object} ctx      the stage context from forge.mjs
 * @param {object} o
 * @param {string} o.what   one line: what this stage does
 * @param {string} o.repo   manifest-relative repo path
 * @param {string[]} o.setup  the commands that create the environment
 * @param {string[]} o.command  the command this stage intends to run
 * @param {string} o.verify what the human must confirm before it is wired in
 */
export function refuse(ctx, o) {
  const py = venvPython(ctx.manifest);
  const repo = expand(o.repo || '');
  const state = [
    ['python 3.10 venv', py, py && fs.existsSync(py)],
    ['model repo', repo, repo && fs.existsSync(repo)],
  ];

  const lines = [];
  lines.push(`stage \`${o.name}\` is not wired in. ${o.what}`);
  lines.push('');
  lines.push('environment:');
  for (const [label, p, present] of state) {
    lines.push(`  ${present ? 'ok     ' : 'MISSING'}  ${label.padEnd(16)} ${p || '(not set in the manifest)'}`);
  }
  lines.push('');
  lines.push('set it up:');
  for (const c of o.setup) lines.push(`  ${c}`);
  lines.push('');
  lines.push('then run this BY HAND, once, and check what it actually writes:');
  for (const c of o.command(py, repo, ctx)) lines.push(`  ${c}`);
  lines.push('');
  lines.push(`why it is not run for you: ${o.verify}`);
  lines.push(`when it works, put the file at ${ctx.rel(ctx.outputs[0])} and the next stage picks it up.`);
  throw new Error(lines.join('\n'));
}
