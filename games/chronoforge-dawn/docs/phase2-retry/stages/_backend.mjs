// Shared refusal for the two stages whose tool is not yet chosen.
//
// These are adapters, not stubs: the backend is manifest config, so choosing a
// tool is a config change rather than a code change. What is missing is a
// decision backed by evidence, and inventing one here would be the worst
// possible place to make it.
export function noBackend(stage, ctx, options) {
  const lines = [
    `no backend configured for "${stage}".`,
    ``,
    `    Set ${stage}.backend in ${ctx.rel(ctx.env.manifest.__path ?? 'manifest.json')} to one of:`,
    ...options.map(o => `      ${o.id.padEnd(12)} ${o.note}`),
    ``,
    `    Each backend is a command template. It receives:`,
    `      {input}   ${ctx.rel(ctx.inputs[0] ?? '<the stage input>')}`,
    `      {output}  ${ctx.rel(ctx.outputs[0])}`,
    ``,
    `    The open question is which of these can run unattended on this machine.`,
    `    See docs/phase2-retry/README.md — it is a tooling decision, not a design one.`,
  ];
  throw new Error(lines.join('\n'));
}

/** Run a configured backend's command template. */
export function runBackend(stage, ctx, options) {
  const id = ctx.config.backend;
  if (!id) noBackend(stage, ctx, options);
  const chosen = options.find(o => o.id === id);
  if (!chosen) throw new Error(`unknown ${stage} backend "${id}" — expected ${options.map(o => o.id).join(' | ')}`);
  if (!ctx.config.command) {
    throw new Error(`${stage}.backend is "${id}" but ${stage}.command is unset. `
      + `Give the exact command, with {input} and {output} placeholders.`);
  }
  const cmd = ctx.config.command
    .replaceAll('{input}', ctx.inputs[0] ?? '')
    .replaceAll('{output}', ctx.outputs[0]);
  ctx.log(`backend ${id}: ${cmd}`);
  execFileSync('bash', ['-lc', cmd], { encoding: 'utf8', stdio: 'inherit' });
}
import { execFileSync } from 'node:child_process';
