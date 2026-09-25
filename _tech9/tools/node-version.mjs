import path from 'node:path';
import { fileURLToPath } from 'node:url';

export function supportedNode(version) {
  const match = /^(\d+)\.(\d+)\.(\d+)(?:[-+].*)?$/.exec(version);
  if (!match || version.includes('-')) return false;
  const major = Number(match[1]);
  const minor = Number(match[2]);
  return major >= 24 || (major === 22 && minor >= 13);
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  if (!supportedNode(process.versions.node)) {
    console.error(
      `Unsupported Node ${process.versions.node}; use Node 22.13+ (22.x) or 24+.`,
    );
    process.exitCode = 1;
  }
}
