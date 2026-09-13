import { execFileSync, spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { existsSync, readdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

// Multiple Node installations can make npm scripts select an older runtime.
// Reuse a supported installed runtime; this launcher never installs anything.
const supported = version => {
  const [major, minor] = version.split('.').map(Number);
  return major > 22 || (major === 22 && minor >= 12) || (major === 20 && minor >= 19);
};
const candidates = [process.env.npm_node_execpath, process.execPath];
if (process.env.NVM_BIN) candidates.push(join(process.env.NVM_BIN, 'node'));
const nvmVersions = join(process.env.NVM_DIR || join(homedir(), '.nvm'), 'versions', 'node');
if (existsSync(nvmVersions)) {
  for (const version of readdirSync(nvmVersions).filter(v => /^v\d/.test(v)).sort((a, b) => b.localeCompare(a, undefined, { numeric: true }))) {
    candidates.push(join(nvmVersions, version, 'bin', 'node'));
  }
}
const executable = [...new Set(candidates.filter(Boolean))].find(candidate => {
  try { return supported(execFileSync(candidate, ['-p', 'process.versions.node'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim()); }
  catch { return false; }
});
if (!executable) {
  console.error('Chronoforge Day needs Node 20.19+ or 22.12+. Select a supported Node installation and try again.');
  process.exit(1);
}
const cli = fileURLToPath(new URL('../node_modules/vite/bin/vite.js', import.meta.url));
const child = spawn(executable, [cli, ...process.argv.slice(2)], { stdio: 'inherit' });
child.on('error', error => { console.error(error.message); process.exitCode = 1; });
child.on('exit', (code, signal) => { process.exitCode = code ?? (signal === 'SIGINT' ? 130 : 143); });
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => child.kill(signal));
