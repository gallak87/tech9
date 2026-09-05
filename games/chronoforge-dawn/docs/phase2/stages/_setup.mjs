// Shared setup checks for the two stages that shell out to Python.
//
// Neither is wired in. The py3.10 venv does not exist, the weights are not
// downloaded, and neither port's CLI surface has been run on this machine —
// the Hunyuan MLX port's README limits its own testing to the two example
// meshes it ships with. A guessed flag name fails fifteen minutes into a mesh
// pass, with a Python traceback, on every retry.
//
// So they refuse and print the command they intend to run. Model decisions are
// in docs/phase2/README.md §Stage 1 and §Stage 2; this holds the checks and the
// message.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/** `~/foo` → `/Users/…/foo`. Manifest paths are typed the way a human types
 *  them; nothing else in the repo expands tildes. */
export function expand(p) {
  if (!p) return p;
  return p.startsWith('~') ? path.join(os.homedir(), p.slice(1)) : p;
}

export function venvPython(manifest) {
  const venv = expand(manifest.venv || '');
  return venv ? path.join(venv, 'bin', 'python') : '';
}

/**
 * Throw with what is missing, what the command will be, and where the decision
 * is recorded. Never returns.
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
  lines.push('run this by hand, once, and check what it writes:');
  for (const c of o.command(py, repo, ctx)) lines.push(`  ${c}`);
  lines.push('');
  lines.push(`not wired in because ${o.verify}`);
  lines.push(`output goes at ${ctx.rel(ctx.outputs[0])}; the next stage reads it from there.`);
  throw new Error(lines.join('\n'));
}
